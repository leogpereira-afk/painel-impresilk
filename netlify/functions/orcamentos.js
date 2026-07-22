// Modulo 4: orcamentos. Le o cache do Blobs (mubi-cache-background), que cobre
// do dia 1 de janeiro do ano corrente ate hoje. O filtro por valor minimo e
// data de corte continua no front (Configuracoes).

import { getStore, connectLambda } from "@netlify/blobs";
import { json, erroInterno } from "./lib/mubi.js";
import { exigirSessao } from "./lib/guarda.js";

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}

  // Porteiro: sem cracha valido (e sem permissao para "orcamentos"), nao responde.
  const guarda = await exigirSessao(event, "orcamentos");
  if (guarda.resposta) return guarda.resposta;
  try {
    const store = getStore("painel");
    const [dados, status] = await Promise.all([
      store.get("cache_orcamentos", { type: "json" }),
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
