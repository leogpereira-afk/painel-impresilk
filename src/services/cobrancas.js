// O DIÁRIO DE COBRANÇA, por cliente.
//
// Mora no painel-config (chave "cobrancas"), mas NÃO pelo merge genérico:
// passa pela função `cobranca_mexer` do banco, pelas mesmas duas razões da
// permuta.
//
//   1. O merge lê, calcula e grava em três passos e perde escrita simultânea.
//      Aqui o que se perderia é o registro de uma ligação que JÁ ACONTECEU --
//      e ninguém liga de novo para conferir se anotou.
//   2. Quem falou e quando são carimbados pelo SERVIDOR. Diário de cobrança
//      que a própria pessoa data não serve para a conversa com o cliente nem
//      para a direção saber quem prometeu o quê.

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

export const lerCobrancas = () =>
  chamar("get", { chave: "cobrancas" }).then((r) => r.valor || {});

/* Grava ou apaga UM chamado. Devolve o pacote inteiro que o servidor passou a
   ter -- quem chama usa ESSE retorno como novo estado.

   `chamado = null` apaga. Cliente que fica sem nenhum chamado some do banco:
   registro vazio só serviria para inflar contagem. */
export const salvarChamado = (clienteChave, { cliente, chamadoId, chamado }) =>
  chamar("merge", {
    chave: "cobrancas",
    patch: { [clienteChave]: { cliente, chamadoId, chamado: chamado ?? null } },
  }).then((r) => r.valor || {});
