// Modulo 3: produtos. Le o cache de ordens de servico do Blobs (a categoria de
// cada item ja vem aplicada pela mubi-cache-background via join com /produto).

import { getStore, connectLambda } from "@netlify/blobs";
import { json, erroInterno } from "./lib/mubi.js";

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}
  try {
    const store = getStore("painel");
    const [dados, status] = await Promise.all([
      store.get("cache_ordens", { type: "json" }),
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
