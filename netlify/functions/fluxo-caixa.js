// Modulo 2: fluxo de caixa. Le o cache do Blobs (mubi-cache-background).
// GET ?parte=bancos -> contas bancarias | (padrao) -> saidas (pagar + provisoes)

import { getStore, connectLambda } from "@netlify/blobs";
import { json, erroInterno } from "./lib/mubi.js";

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}
  const parte = event.queryStringParameters?.parte || "pagar";
  try {
    const store = getStore("painel");
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
