// Modulo 2: fluxo de caixa. Le o cache do Blobs (mubi-cache-background).
// GET ?parte=bancos  -> contas bancarias
//     ?parte=mensal  -> fluxo REALIZADO mes a mes (mubi-realizado)
//     (padrao)       -> saidas (pagar + provisoes)

import { getStore, connectLambda } from "@netlify/blobs";
import { json, erroInterno } from "./lib/mubi.js";

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}
  const parte = event.queryStringParameters?.parte || "pagar";
  try {
    const store = getStore("painel");

    // Realizado mes a mes: forma diferente (por ano), entao responde separado.
    if (parte === "mensal") {
      const [mensal, status] = await Promise.all([
        store.get("cache_fluxo_mensal", { type: "json" }),
        store.get("cache_status", { type: "json" }),
      ]);
      if (!mensal) {
        // Ainda nao rodou o cron do realizado: nao e erro, so nao tem historico.
        return json({ anos: {}, disponiveis: [], atualizadoEm: null, preparando: true });
      }
      return json({
        anos: mensal.anos || {},
        disponiveis: mensal.disponiveis || [],
        atualizadoEm: mensal.em || status?.em || null,
      });
    }

    const chave = parte === "bancos" ? "cache_bancos" : "cache_pagar";
    const [dados, status] = await Promise.all([
      store.get(chave, { type: "json" }),
      store.get("cache_status", { type: "json" }),
    ]);
    if (!dados) {
      return json(
        { preparando: true, erro: "Cache do Mubisys ainda nao aquecido. Aguarde uns 2 minutos." },
        503
      );
    }
    return json({ itens: dados, atualizadoEm: status?.em || null });
  } catch (e) {
    return erroInterno(e);
  }
};
