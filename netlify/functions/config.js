// Persistencia das configuracoes e marcacoes manuais no Netlify Blobs. Este e o
// backend que substitui o Supabase do prompt original pelo padrao Impresilk
// (Functions + Blobs, sem banco). Segue o blueprint: v1/Lambda com
// connectLambda, SEM BLOBS_TOKEN manual (o runtime injeta o contexto).
//
// Auth leve: header x-token deve bater com a env TOKEN.
// Acoes (POST JSON): ping | diag | get {chave} | set {chave, valor}.
// chave em: "config" | "ov_rec" | "ov_orc".

const { getStore, connectLambda } = require("@netlify/blobs");

const CHAVES = new Set([
  "config",
  "ov_rec",
  "ov_orc",
  // chaves do cache do Mubisys (bootstrap manual e diagnostico)
  "cache_recebiveis",
  "cache_pagar",
  "cache_bancos",
  "cache_orcamentos",
  "cache_ordens",
  "cache_status",
]);

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

  const token = event.headers["x-token"] || event.headers["X-Token"];
  if (process.env.TOKEN && token !== process.env.TOKEN) {
    return resposta({ erro: "nao autorizado" }, 401);
  }

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
        // Testa a autenticacao automatica do Blobs sem expor segredos.
        try {
          const { blobs } = await store.list();
          return resposta({ auto: `ok(${blobs?.length ?? 0})` });
        } catch (e) {
          return resposta({ auto: "ERR", detalhe: e.message });
        }
      }

      case "get": {
        if (!CHAVES.has(corpo.chave)) return resposta({ erro: "chave invalida" }, 400);
        const valor = await store.get(corpo.chave, { type: "json" });
        return resposta({ ok: true, chave: corpo.chave, valor: valor ?? null });
      }

      case "set": {
        if (!CHAVES.has(corpo.chave)) return resposta({ erro: "chave invalida" }, 400);
        await store.setJSON(corpo.chave, corpo.valor ?? null);
        return resposta({ ok: true });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    return resposta({ erro: e.message }, 500);
  }
};
