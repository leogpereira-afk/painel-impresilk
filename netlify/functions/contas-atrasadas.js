// Modulo 1: contas a receber em aberto. Le o cache do Blobs preenchido pela
// mubi-cache-background (a cada 20 min). Resposta instantanea; a normalizacao
// dos campos vive na background function.

import { getStore, connectLambda } from "@netlify/blobs";
import { json } from "./lib/mubi.js";

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}
  try {
    const store = getStore("painel");
    const [dados, status] = await Promise.all([
      store.get("cache_recebiveis", { type: "json" }),
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
    return json({ erro: e.message }, 502);
  }
};
