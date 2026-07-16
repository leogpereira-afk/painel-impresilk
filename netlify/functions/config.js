// Persistencia das configuracoes e marcacoes manuais no Netlify Blobs. Este e o
// backend que substitui o Supabase do prompt original pelo padrao Impresilk
// (Functions + Blobs, sem banco). Segue o blueprint: v1/Lambda com
// connectLambda, SEM BLOBS_TOKEN manual (o runtime injeta o contexto).
//
// Auth leve: header x-token deve bater com a env TOKEN.
// Acoes (POST JSON): ping | diag | get {chave} | set {chave, valor}.
// chave em: "config" | "ov_rec" | "ov_orc".

const { getStore, connectLambda } = require("@netlify/blobs");

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

exports.handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}

  if (event.httpMethod !== "POST") return resposta({ erro: "use POST" }, 405);

  // Auth por chave, nao global. As marcacoes do painel (config, ov_rec, ov_orc)
  // sao lidas e gravadas pelo front, que nao tem -- nem pode ter -- o TOKEN do
  // servidor. Elas NAO incluem os dados financeiros (cache_* nao e gravavel por
  // aqui, ver CHAVES_ESCRITA) e o painel ja e publico de leitura, entao liberar
  // essas 3 chaves nao piora a postura. Ja o diagnostico do cache_* continua
  // exigindo o TOKEN (e informacao sensivel e nao pode vazar).
  const SEGREDO = process.env.TOKEN;
  const token = event.headers["x-token"] || event.headers["X-Token"];
  const autenticado = !!SEGREDO && token === SEGREDO;
  const chaveSensivel = (chave) => !CHAVES_ESCRITA.has(chave); // tudo que nao e marcacao do painel

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
        const valor = await store.get(corpo.chave, { type: "json" });
        return resposta({ ok: true, chave: corpo.chave, valor: valor ?? null });
      }

      case "set": {
        if (!CHAVES_ESCRITA.has(corpo.chave)) return resposta({ erro: "chave nao gravavel" }, 403);
        await store.setJSON(corpo.chave, corpo.valor ?? null);
        return resposta({ ok: true });
      }

      // Merge por id: o front manda so o patch { [id]: {campos} } e o servidor
      // funde no objeto existente. Assim device A nao apaga a marcacao que
      // device B fez no mesmo mapa (last-write-wins por CAMPO, nao por objeto).
      case "merge": {
        if (!CHAVES_ESCRITA.has(corpo.chave)) return resposta({ erro: "chave nao gravavel" }, 403);
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
