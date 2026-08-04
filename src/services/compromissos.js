// Compromissos da equipe. Moram no servidor (painel-config, chave
// "compromissos") e sao SEPARADOS POR DONO la, nao aqui: cada vendedora le e
// grava so os dela, a direcao ve todos. O "dono" e carimbado pelo servidor --
// mandar dono no corpo nao muda nada.

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
  if (!resp.ok) throw new Error(body?.erro || `Nao consegui falar com o servidor (${resp.status}).`);
  return body;
}

export const lerCompromissos = () =>
  chamar("get", { chave: "compromissos" }).then((r) => r.valor || {});

export const salvarCompromisso = (id, dados) =>
  chamar("merge", { chave: "compromissos", patch: { [id]: dados } });

export const removerCompromisso = (id) =>
  chamar("removerId", { chave: "compromissos", id });
