// Bens do patrimonio e os setores onde eles ficam. Duas chaves no
// painel-config, um registro por linha -- gravar um bem nao toca nos outros.
//
// O CODIGO DA ETIQUETA e gerado pelo SERVIDOR (painel-config, ramo
// "patrimonio" do merge): ele vira adesivo colado no bem, e dois cadastros
// simultaneos gerando a mesma sequencia fariam duas etiquetas iguais. Aqui
// mandamos apenas a sigla do setor; o codigo volta pronto na resposta.

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

export const lerBens = () => chamar("get", { chave: "patrimonio" }).then((r) => r.valor || {});
export const lerSetores = () => chamar("get", { chave: "setores" }).then((r) => r.valor || {});

export const salvarBem = (id, dados) =>
  chamar("merge", { chave: "patrimonio", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerBem = (id) =>
  chamar("removerId", { chave: "patrimonio", id }).then(() => true);

export const salvarSetor = (id, dados) =>
  chamar("merge", { chave: "setores", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerSetor = (id) =>
  chamar("removerId", { chave: "setores", id }).then(() => true);

// Semear os 21 setores da casa numa tacada -- um pedido so, sem laco (laco de
// merge se atropela e ainda leva 21 idas ao servidor).
export const semearSetores = (lista) =>
  chamar("merge", {
    chave: "setores",
    patch: Object.fromEntries(lista.map((s) => [`set-${s.sigla.toLowerCase()}`, s])),
  }).then((r) => r.valor || {});
