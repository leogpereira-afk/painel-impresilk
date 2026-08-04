// Termos do glossario. Mesmo desenho dos bancos: moram no servidor
// (painel-config, chave "glossario", mapa {id: termo}) e a lista de
// src/data/glossario.js e so a semente da primeira abertura.

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

export const lerTermos = () => chamar("get", { chave: "glossario" }).then((r) => r.valor || {});
export const salvarTermo = (id, termo) => chamar("merge", { chave: "glossario", patch: { [id]: termo } });
export const salvarVarios = (patch) => chamar("merge", { chave: "glossario", patch });
export const removerTermo = (id) => chamar("removerId", { chave: "glossario", id });
