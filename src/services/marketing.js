// Atalhos do Drive da aba Marketing. Moram no servidor (painel-config, chave
// "marketing", mapa {id: {nome, url}}) para valerem em qualquer aparelho.
//
// Adicionar usa "merge" e remover usa "removerId" -- os dois mexem em UMA
// linha por vez. Remover via get+set do mapa inteiro reabria a corrida:
// duas lixeiras clicadas rapido ressuscitavam o atalho da primeira.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-config`;

async function chamar(action, corpo) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

export const lerAtalhos = () =>
  chamar("get", { chave: "marketing" }).then((r) => r.valor || {});

export const salvarAtalho = (id, { nome, url }) =>
  chamar("merge", { chave: "marketing", patch: { [id]: { nome, url } } });

export const removerAtalho = (id) =>
  chamar("removerId", { chave: "marketing", id });
