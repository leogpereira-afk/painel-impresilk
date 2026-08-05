// Compromissos da equipe. Moram no servidor (painel-config, chave
// "compromissos") e sao SEPARADOS POR DONO la, nao aqui: cada vendedora le e
// grava so os dela, a direcao ve todos. O "dono" e carimbado pelo servidor --
// mandar dono no corpo nao muda nada.

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

export const lerCompromissos = () =>
  chamar("get", { chave: "compromissos" }).then((r) => r.valor || {});

// Devolve o MAPA que o servidor gravou, no escopo de quem pediu -- e nao o que
// a tela imaginou. E o servidor que carimba dono/donoNome e que decide o que
// esta pessoa enxerga; montar o item no cliente fazia o compromisso recem-criado
// aparecer sem dono (e o "passar para..." oferecia a propria pessoa).
export const salvarCompromisso = (id, dados) =>
  chamar("merge", { chave: "compromissos", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerCompromisso = (id) =>
  chamar("removerId", { chave: "compromissos", id });

// Encaminhar: manda o compromisso para outra pessoa. O servidor confere se ela
// existe e carimba quem passou; depois disso o item sai da lista de quem
// encaminhou (por isso a tela recarrega com a resposta).
export const encaminharCompromisso = (id, paraUsuario) =>
  chamar("merge", { chave: "compromissos", patch: { [id]: { dono: paraUsuario } } }).then(
    (r) => r.valor || {}
  );

// Quem trabalha aqui (usuario + nome), para montar o "encaminhar para".
export async function lerPessoas() {
  const resp = await comCracha(`${API}/painel-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "listarPessoas" }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || "Nao consegui carregar a equipe.");
  return body?.pessoas || [];
}
