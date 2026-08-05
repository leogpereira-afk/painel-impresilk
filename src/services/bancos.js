// Contas bancarias da aba Bancos e Pix. Moram no servidor (painel-config,
// chave "bancos", mapa {id: conta}) para poderem ser editadas de qualquer
// aparelho -- antes eram fixas no codigo.
//
// A lista de src/data/bancos.js virou SEMENTE: na primeira abertura, se o
// servidor estiver vazio, ela e plantada la com ids deterministicos (seed-1,
// seed-2...). Dois aparelhos abrindo ao mesmo tempo escrevem os MESMOS ids com
// o MESMO conteudo -- nao duplica.

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

export const lerBancos = () => chamar("get", { chave: "bancos" }).then((r) => r.valor || {});

export const salvarBanco = (id, conta) =>
  chamar("merge", { chave: "bancos", patch: { [id]: conta } });

// Varias contas num pedido so -- usado para plantar a semente.
export const salvarVarios = (patch) => chamar("merge", { chave: "bancos", patch });

export const removerBanco = (id) => chamar("removerId", { chave: "bancos", id });
