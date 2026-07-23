// Modulo 1: contas a receber em aberto. Le o cache do Blobs preenchido pela
// mubi-cache-background (a cada 20 min). Resposta instantanea; a normalizacao
// dos campos vive na background function.

import { getStore, connectLambda } from "@netlify/blobs";
import { json, erroInterno, talvezAquecer } from "./lib/mubi.js";
import { exigirSessao } from "./lib/guarda.js";

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}

  // Porteiro: sem cracha valido (e sem permissao para "contas-atrasadas"), nao responde.
  const guarda = await exigirSessao(event, "contas-atrasadas");
  if (guarda.resposta) return guarda.resposta;
  try {
    const store = getStore("painel");
    const [dados, status, dsoHist] = await Promise.all([
      store.get("cache_recebiveis", { type: "json" }),
      store.get("cache_status", { type: "json" }),
      store.get("cache_dso_hist", { type: "json" }),
    ]);

    // Auto-cura: cache velho dispara a reconstrucao (nao espera).
    talvezAquecer(store, status);
    if (!dados) {
      return json(
        { preparando: true, erro: "Cache do Mubisys ainda nao aquecido. Aguarde uns 2 minutos." },
        503
      );
    }
    return json({ itens: dados, atualizadoEm: status?.em || null, dsoHist: dsoHist || [] });
  } catch (e) {
    return erroInterno(e);
  }
};
