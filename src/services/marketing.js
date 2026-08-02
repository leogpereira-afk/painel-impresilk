// Atalhos do Drive da aba Marketing. Moram no servidor (painel-config, chave
// "marketing", mapa {id: {nome, url}}) para valerem em qualquer aparelho.
//
// Adicionar usa "merge" (uma linha por atalho: dois aparelhos nao se
// atropelam); remover usa "set" com o mapa filtrado -- e raro e um só edita.

import { comCracha } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-config`;

async function chamar(action, corpo) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || `config respondeu ${resp.status}`);
  return body;
}

export const lerAtalhos = () =>
  chamar("get", { chave: "marketing" }).then((r) => r.valor || {});

export const salvarAtalho = (id, { nome, url }) =>
  chamar("merge", { chave: "marketing", patch: { [id]: { nome, url } } });

export async function removerAtalho(id) {
  const mapa = await lerAtalhos();
  delete mapa[id];
  return chamar("set", { chave: "marketing", valor: mapa });
}
