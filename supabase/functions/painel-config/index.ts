// ============================================================================
// painel-config — configuracoes e marcacoes manuais (substitui config.js)
//
// O CONTRATO E O MESMO: get/set/merge com as mesmas chaves. Por dentro, a
// mudanca que importa: ov_rec/ov_orc eram UM JSON com todas as marcacoes, e
// marcar um titulo reescrevia o mapa inteiro -- com leitura eventual, duas
// marcacoes seguidas se atropelavam e uma apagava a outra (defeito real, que
// custou dado no modulo de ativos). Agora cada marcacao e UMA LINHA em
// painel_registros: gravar uma nao toca nas outras, e o merge por campo
// acontece linha a linha. A classe do problema deixa de existir.
//
// O get de ov_rec/ov_orc continua devolvendo o MAPA {id: campos} inteiro,
// remontado das linhas -- o cliente nao sabe que o formato interno mudou.
//
// Permissoes preservadas do original:
//   - marcar titulo (ov_*): qualquer pessoa logada;
//   - mudar as REGRAS (config): so quem tem o modulo "configuracoes" (vale
//     para todo mundo, entao nao e para qualquer um);
//   - ler cache_* (diagnostico): so o x-token do servidor.
// Ate 2026-07-22 essas chaves eram ABERTAS (um POST anonimo alterou a config
// em producao). O porteiro continua obrigatorio.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// "marketing" guarda os atalhos do Drive; "bancos", as contas bancarias da aba
// Bancos e Pix. Entram como overlay porque o mecanismo e o mesmo: mapa por id,
// merge sem corrida.
const OVERLAYS = new Set(["ov_rec", "ov_orc", "marketing", "bancos", "glossario", "compromissos"]);
// Chaves em que cada pessoa so enxerga e mexe no que E DELA. A vendedora nao
// pode ver a agenda da colega, e a direcao ve tudo. Isso e checado no
// SERVIDOR: filtrar so na tela seria conforto, nao separacao.
const POR_DONO = new Set(["compromissos"]);
// Diagnostico de cache pelo x-token (nomes sem o prefixo cache_ da era Blobs).
const CACHES = new Set(["recebiveis", "pagar", "bancos", "orcamentos", "ordens", "dso_hist", "fluxo_mensal", "status"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sessaoDe(req: Request) {
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? await verificarJwt(m[1], JWT_SECRET) : null;
}

async function lerConfig(): Promise<any> {
  const { data } = await sb.from("painel_config_global").select("config").eq("id", true).maybeSingle();
  return data?.config ?? null;
}

// Existe conta com esse usuario? Devolve o nome para carimbar no item.
// A direcao pode nao ter linha em painel_contas (enquanto usa a senha inicial
// do ambiente), mas recebe compromisso como qualquer pessoa.
const MASTER_USUARIO = (Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo").trim().toLowerCase();
async function pessoaValida(usuario: string): Promise<{ usuario: string; nome: string } | null> {
  const u = String(usuario || "").trim().toLowerCase();
  if (!u) return null;
  const { data } = await sb.from("painel_contas").select("usuario, nome").eq("usuario", u).maybeSingle();
  if (data) return { usuario: data.usuario, nome: data.nome || data.usuario };
  if (u === MASTER_USUARIO) return { usuario: u, nome: "Direcao" };
  return null;
}

// Mapa {id: campos} remontado das linhas — o formato que o cliente espera.
async function lerOverlay(colecao: string, soDoDono?: string | null): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb
      .from("painel_registros").select("id, registro")
      .eq("colecao", colecao).order("id").range(de, de + PASSO - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      // Registro sem dono (vindo de backup antigo) so aparece para a direcao.
      if (soDoDono != null && (r.registro as any)?.dono !== soDoDono) continue;
      out[r.id] = r.registro;
    }
    if ((data ?? []).length < PASSO) break;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const autenticado = !!TOKEN && req.headers.get("x-token") === TOKEN;
  const sessao = await sessaoDe(req);
  const temModulo = (m: string) =>
    !!sessao &&
    (sessao.master === true ||
      (Array.isArray(sessao.perms) && (sessao.perms.includes("*") || sessao.perms.includes(m))));
  const podeConfigurar = temModulo("configuracoes");

  // As chaves novas sao CONTEUDO de um modulo (contas bancarias, materiais de
  // marca, glossario), nao marcacao de titulo. Sem esta amarra, uma conta com
  // acesso so a Orcamentos lia os CNPJs e as chaves Pix da empresa e apagava
  // termo do glossario -- a permissao existia so na tela.
  //
  // ov_rec/ov_orc ficam de fora de proposito: sao as marcacoes que os modulos
  // de contas e orcamentos ja usam, com o desenho antigo.
  const MODULO_DA_CHAVE: Record<string, string> = {
    bancos: "bancos",
    marketing: "marketing",
    glossario: "glossario",
  };
  const barraChave = (chave: string) => {
    // Sem sessao, quem responde e o 401 de cada ramo: o cliente usa esse 401
    // (com semSessao) para deslogar sozinho. Trocar por 403 aqui esconderia a
    // sessao vencida atras de "voce nao tem acesso".
    if (!sessao) return null;
    const m = MODULO_DA_CHAVE[chave];
    if (!m || temModulo(m)) return null;
    return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
  };

  // Quem NAO e direcao so enxerga e mexe no que e dela nas chaves POR_DONO.
  const ehDirecao = sessao?.master === true ||
    (Array.isArray(sessao?.perms) && sessao.perms.includes("*"));
  const donoDaVez = (chave: string) =>
    POR_DONO.has(chave) && !ehDirecao ? String(sessao?.sub ?? "") : null;
  // Mexer em linha de outra pessoa: barra. Linha que ainda nao existe passa
  // (esta nascendo), e o dono correto e carimbado na gravacao.
  const barraDono = async (chave: string, id: string) => {
    const escopo = donoDaVez(chave);
    if (!escopo) return null;
    const { data } = await sb.from("painel_registros").select("registro")
      .eq("colecao", chave).eq("id", id).maybeSingle();
    const dono = (data?.registro as any)?.dono;
    if (data && dono !== escopo) {
      return resposta({ erro: "Este compromisso nao e seu." }, 403);
    }
    return null;
  };

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  try {
    switch (corpo.action) {
      case "ping":
        return resposta({ ok: true });

      case "get": {
        const chave = String(corpo.chave ?? "");
        // Compatibilidade: o cliente antigo pede "cache_status" etc.
        const semPrefixo = chave.startsWith("cache_") ? chave.slice(6) : null;

        if (semPrefixo !== null) {
          if (!CACHES.has(semPrefixo)) return resposta({ erro: "chave invalida" }, 400);
          if (!autenticado) return resposta({ erro: "nao autorizado" }, 401);
          const { data } = await sb.from("painel_cache").select("valor").eq("chave", semPrefixo).maybeSingle();
          return resposta({ ok: true, chave, valor: data?.valor ?? null });
        }

        if (chave === "config") {
          if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
          return resposta({ ok: true, chave, valor: await lerConfig() });
        }
        if (OVERLAYS.has(chave)) {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
          return resposta({ ok: true, chave, valor: await lerOverlay(chave, donoDaVez(chave)) });
        }
        return resposta({ erro: "chave invalida" }, 400);
      }

      case "set": {
        const chave = String(corpo.chave ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);

        if (chave === "config") {
          if (!podeConfigurar) return resposta({ erro: "Voce nao tem acesso as Configuracoes." }, 403);
          const { error } = await sb.from("painel_config_global").upsert(
            { id: true, config: corpo.valor ?? null, atualizado_em: new Date().toISOString() },
            { onConflict: "id" });
          if (error) throw new Error(error.message);
          return resposta({ ok: true });
        }

        if (OVERLAYS.has(chave)) {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          // set substitui o overlay INTEIRO (o app usa para restaurar backup e
          // para limpar). Apagar as linhas e regravar e a traducao fiel disso.
          // Em chave por dono isso apagaria a agenda das colegas: so a direcao.
          if (POR_DONO.has(chave) && !ehDirecao) {
            return resposta({ erro: "Voce nao pode substituir a lista inteira." }, 403);
          }
          const mapa = corpo.valor && typeof corpo.valor === "object" ? corpo.valor : {};
          await sb.from("painel_registros").delete().eq("colecao", chave);
          const linhas = Object.entries(mapa).map(([id, registro]) => ({
            colecao: chave, id, registro, atualizado_em: new Date().toISOString(),
          }));
          if (linhas.length) {
            const { error } = await sb.from("painel_registros").insert(linhas);
            if (error) throw new Error(error.message);
          }
          return resposta({ ok: true });
        }
        return resposta({ erro: "chave nao gravavel" }, 403);
      }

      // Merge por id. No Blobs isto era le-o-mapa-inteiro + regrava-o-inteiro
      // (a corrida). Aqui cada id e um upsert de UMA linha, fundindo campo a
      // campo com o que a linha ja tem -- dois aparelhos marcando titulos
      // diferentes nunca mais se atropelam.
      case "merge": {
        const chave = String(corpo.chave ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        const patch = corpo.patch && typeof corpo.patch === "object" ? corpo.patch : {};

        if (chave === "config") {
          if (!podeConfigurar) return resposta({ erro: "Voce nao tem acesso as Configuracoes." }, 403);
          const atual = (await lerConfig()) ?? {};
          const merged = {
            ...atual,
            ...patch,
            parametros: { ...(atual.parametros ?? {}), ...(patch.parametros ?? {}) },
          };
          const { error } = await sb.from("painel_config_global").upsert(
            { id: true, config: merged, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
          if (error) throw new Error(error.message);
          return resposta({ ok: true, valor: merged });
        }

        if (OVERLAYS.has(chave)) {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          for (const [id, campos] of Object.entries(patch)) {
            const barradoDono = await barraDono(chave, id);
            if (barradoDono) return barradoDono;
            const { data } = await sb.from("painel_registros").select("registro")
              .eq("colecao", chave).eq("id", id).maybeSingle();
            const fundido: any = { ...(data?.registro ?? {}), ...((campos as object) ?? {}) };
            if (POR_DONO.has(chave)) {
              const donoAtual = (data?.registro as any)?.dono ?? null;
              const eu = String(sessao?.sub ?? "");
              const pedido = (campos as any)?.dono ? String((campos as any).dono) : null;

              // ENCAMINHAR. Quem chegou ate aqui ja passou pelo barraDono, entao
              // ou e a direcao, ou o item e dela -- so falta conferir que a
              // pessoa de destino existe de verdade (nome digitado errado
              // sumiria com o compromisso: ninguem mais o veria).
              if (pedido && pedido !== donoAtual) {
                const destino = await pessoaValida(pedido);
                if (!destino) return resposta({ erro: "Essa pessoa nao tem acesso ao painel." }, 400);
                fundido.dono = destino.usuario;
                fundido.donoNome = destino.nome;
                fundido.encaminhadoPor = sessao?.nome || eu;
                fundido.encaminhadoEm = new Date().toISOString();
              } else {
                // Sem encaminhamento, o dono e carimbado pelo servidor e nao
                // muda: mandar dono no corpo nao rouba item de ninguem.
                fundido.dono = donoAtual ?? eu;
                fundido.donoNome =
                  (data?.registro as any)?.donoNome || sessao?.nome || fundido.dono;
              }
            }
            const { error } = await sb.from("painel_registros").upsert(
              { colecao: chave, id, registro: fundido, atualizado_em: new Date().toISOString() },
              { onConflict: "colecao,id" });
            if (error) throw new Error(error.message);
          }
          // Devolve o mapa inteiro, como o original fazia (o cliente atualiza o
          // estado local com ele). Depois de encaminhar, o item some da lista de
          // quem passou -- e por isso que o cliente adota esta resposta.
          return resposta({ ok: true, valor: await lerOverlay(chave, donoDaVez(chave)) });
        }
        return resposta({ erro: "chave nao gravavel" }, 403);
      }

      // Remocao por id: apaga UMA linha do overlay. Existe porque remover via
      // get+set do mapa inteiro reabre a corrida que o merge-por-linha fechou
      // (dois removedores simultaneos ressuscitavam o que o outro apagou).
      case "removerId": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (!OVERLAYS.has(chave)) return resposta({ erro: "chave nao gravavel" }, 403);
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        if (!id) return resposta({ erro: "informe o id" }, 400);
        const barradoDono = await barraDono(chave, id);
        if (barradoDono) return barradoDono;
        const { error } = await sb.from("painel_registros").delete()
          .eq("colecao", chave).eq("id", id);
        if (error) throw new Error(error.message);
        return resposta({ ok: true });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-config] erro:", e);
    return resposta({ erro: "erro interno" }, 500);
  }
});
