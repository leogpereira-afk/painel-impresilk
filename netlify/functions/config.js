// Persistencia das configuracoes e marcacoes manuais no Netlify Blobs. Este e o
// backend que substitui o Supabase do prompt original pelo padrao Impresilk
// (Functions + Blobs, sem banco). Segue o blueprint: v1/Lambda com
// connectLambda, SEM BLOBS_TOKEN manual (o runtime injeta o contexto).
//
// Auth leve: header x-token deve bater com a env TOKEN.
// Acoes (POST JSON): ping | diag | get {chave} | set {chave, valor}.
// chave em: "config" | "ov_rec" | "ov_orc".

import { getStore, connectLambda } from "@netlify/blobs";
import { exigirSessao } from "./lib/guarda.js";

// LEITURA: config, overrides e o cache do Mubisys (diagnostico).
const CHAVES_LEITURA = new Set([
  "config",
  "ov_rec",
  "ov_orc",
  "cache_recebiveis",
  "cache_pagar",
  "cache_bancos",
  "cache_orcamentos",
  "cache_ordens",
  "cache_dso_hist",
  "cache_fluxo_mensal",
  "cache_status",
]);
// ESCRITA: SO config e overrides. As chaves cache_* sao gravadas apenas pela
// background function (mubi-cache-background); bloquear a escrita aqui evita
// envenenamento do cache financeiro por quem tenha o token.
const CHAVES_ESCRITA = new Set(["config", "ov_rec", "ov_orc"]);

function resposta(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}

  if (event.httpMethod !== "POST") return resposta({ erro: "use POST" }, 405);

  // DUAS portas, porque sao dois publicos:
  //  - x-token (TOKEN do servidor): so para diagnostico do cache_*, usado por
  //    ferramenta/manutencao. Continua igual.
  //  - cracha JWT do painel: para as marcacoes (config, ov_rec, ov_orc).
  //
  // Ate 2026-07-22 essas 3 chaves eram ABERTAS -- qualquer pessoa na internet
  // gravava nelas (confirmado em producao: um POST anonimo alterou a config).
  // O comentario antigo justificava isso com "o painel ja e publico de leitura";
  // agora ele tem login, entao a justificativa caiu junto.
  const SEGREDO = process.env.TOKEN;
  const token = event.headers["x-token"] || event.headers["X-Token"];
  const autenticado = !!SEGREDO && token === SEGREDO;
  const chaveSensivel = (chave) => !CHAVES_ESCRITA.has(chave); // tudo que nao e marcacao do painel

  const guarda = await exigirSessao(event);
  const sessao = guarda.sessao || null;
  const podeConfigurar =
    !!sessao &&
    (sessao.master === true ||
      (Array.isArray(sessao.perms) &&
        (sessao.perms.includes("*") || sessao.perms.includes("configuracoes"))));

  let corpo = {};
  try {
    corpo = JSON.parse(event.body || "{}");
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  const store = getStore("painel");

  try {
    switch (corpo.action) {
      case "ping":
        return resposta({ ok: true });

      case "diag": {
        if (!autenticado) return resposta({ erro: "nao autorizado" }, 401);
        // Testa a autenticacao automatica do Blobs sem expor segredos.
        try {
          const { blobs } = await store.list();
          return resposta({ auto: `ok(${blobs?.length ?? 0})` });
        } catch (e) {
          console.error("config diag:", e?.message || e);
          return resposta({ auto: "ERR" });
        }
      }

      case "get": {
        if (!CHAVES_LEITURA.has(corpo.chave)) return resposta({ erro: "chave invalida" }, 400);
        // Ler cache_* (diagnostico) exige token; marcacoes do painel sao livres.
        if (chaveSensivel(corpo.chave) && !autenticado) {
          return resposta({ erro: "nao autorizado" }, 401);
        }
        // Marcacoes do painel: exigem cracha (antes eram abertas).
        if (!chaveSensivel(corpo.chave) && !sessao) return guarda.resposta;
        const valor = await store.get(corpo.chave, { type: "json" });
        return resposta({ ok: true, chave: corpo.chave, valor: valor ?? null });
      }

      case "set": {
        if (!CHAVES_ESCRITA.has(corpo.chave)) return resposta({ erro: "chave nao gravavel" }, 403);
        if (!sessao) return guarda.resposta;
        // Mudar as REGRAS do painel vale para todo mundo: so quem tem
        // Configuracoes. Marcar um titulo (ov_*) qualquer pessoa logada pode.
        if (corpo.chave === "config" && !podeConfigurar) {
          return resposta({ erro: "Voce nao tem acesso as Configuracoes." }, 403);
        }
        await store.setJSON(corpo.chave, corpo.valor ?? null);
        return resposta({ ok: true });
      }

      // Merge por id: o front manda so o patch { [id]: {campos} } e o servidor
      // funde no objeto existente. Assim device A nao apaga a marcacao que
      // device B fez no mesmo mapa (last-write-wins por CAMPO, nao por objeto).
      case "merge": {
        if (!CHAVES_ESCRITA.has(corpo.chave)) return resposta({ erro: "chave nao gravavel" }, 403);
        if (!sessao) return guarda.resposta;
        if (corpo.chave === "config" && !podeConfigurar) {
          return resposta({ erro: "Voce nao tem acesso as Configuracoes." }, 403);
        }
        const patch = corpo.patch && typeof corpo.patch === "object" ? corpo.patch : {};
        const atual = (await store.get(corpo.chave, { type: "json" })) || {};
        if (corpo.chave === "config") {
          // config e um objeto unico de regras: merge raso + parametros.
          const merged = {
            ...atual,
            ...patch,
            parametros: { ...(atual.parametros || {}), ...(patch.parametros || {}) },
          };
          await store.setJSON(corpo.chave, merged);
          return resposta({ ok: true, valor: merged });
        }
        // ov_rec / ov_orc: mapa de id -> campos. Funde campo a campo por id.
        const merged = { ...atual };
        for (const [id, campos] of Object.entries(patch)) {
          merged[id] = { ...(atual[id] || {}), ...(campos || {}) };
        }
        await store.setJSON(corpo.chave, merged);
        return resposta({ ok: true, valor: merged });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("config:", e?.message || e);
    return resposta({ erro: "erro interno" }, 500);
  }
};
