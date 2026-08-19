// As permutas moram no painel-config (chave "permutas"), mas NÃO pelo merge
// genérico dele: passam pela função `permuta_mexer` do banco. Duas razões, e
// as duas são de confiança no número:
//
//   1. O merge lê, calcula e grava em três passos, e perde escrita simultânea
//      -- provado contra a produção: dois aceites disparados juntos terminaram
//      com um só no registro, sem erro nenhum.
//   2. O HISTÓRICO é carimbado pelo servidor, comparando o registro antigo com
//      o pedido. Histórico que o cliente escreve não serve para conferir com o
//      parceiro.
//
// Por isso tudo o que muda uma permuta sai daqui num pedido só: campos, O.S. e
// lançamentos juntos, aplicados numa transação.
//
// A conta (saldo, valor da O.S., divergência com o ERP) não está aqui: está em
// src/lib/calc/permutas.js, sem rede nenhuma, para poder ser testada.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-config`;
const DADOS = `${API}/painel-dados`;

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

export const lerPermutas = () =>
  chamar("get", { chave: "permutas" }).then((r) => r.valor || {});

/* Mexe numa permuta. Devolve o pacote INTEIRO que o servidor passou a ter --
   quem chama deve usar ESSE retorno como novo estado, e não o objeto que
   montou: se outra aba mexeu na permuta ao lado, o retorno já traz as duas.

   `campos`  — nome, credito, clientes, encerrada
   `osPatch` — { [osId]: ficha } aceita, { [osId]: null } tira
   `lancPatch` — { [lancId]: lançamento } grava, { [lancId]: null } tira
   `criar`   — só a criação explícita cria; um aceite numa permuta apagada
               recebe 409 em vez de ressuscitá-la com crédito zero. */
export const mexerNaPermuta = (id, { campos = {}, osPatch, lancPatch, criar } = {}) =>
  chamar("merge", {
    chave: "permutas",
    patch: {
      [id]: {
        ...campos,
        ...(osPatch ? { osPatch } : {}),
        ...(lancPatch ? { lancPatch } : {}),
        ...(criar ? { criar: true } : {}),
      },
    },
  }).then((r) => r.valor || {});

export const removerPermuta = (id) =>
  chamar("removerId", { chave: "permutas", id }).then(() => true);

/* A nota de UMA entrada de crédito -- o que sustenta aquele valor.
   `lancId` diz a qual lançamento ela pertence: nota solta não responde "esses
   R$ 7.000 são de quê?", que é o que o parceiro pergunta ao conferir.
   Os bytes vão para o bucket; no registro entra só a referência. */
export const anexarNaPermuta = (id, { lancId, nome, mime, base64 }) =>
  chamar("permutaAnexo", { id, lancId, nome, mime, base64 }).then((r) => r.valor || {});

export const lerAnexo = (id, arquivo) =>
  chamar("lerArquivo", { chave: "permutas", id, arquivo });

/* ------------------------------------------------------------ busca de O.S.
 *
 * Vem da TABELA `painel_ordens`, não do cache que o painel carrega no login.
 * O cache vai de 2025 em diante porque viaja inteiro para o navegador; o
 * histórico desde 2020 são ~19.500 O.S. e ~10 MB, e desce filtrado: só os
 * clientes que casam com o que foi digitado, ou as O.S. de quem foi escolhido.
 */
async function buscar(params) {
  const url = new URL(DADOS);
  url.searchParams.set("modulo", "ordensBusca");
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const resp = await comCracha(url.toString());
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

/* Até onde o painel TEM O.S. guardada. A tela precisa disto para não deixar
   "esse cliente não comprou nesse período" e "o painel ainda não foi buscar
   esse período no ERP" aparecerem iguais — as duas dão lista vazia, e só uma
   delas quer dizer que não há O.S. */
export const lerCobertura = () => buscar({ cobertura: "1" }).then((r) => r.cobertura || null);

/** Clientes cujo nome casa com o termo, com quanto cada um já comprou. */
export const buscarClientes = (termo, desde) =>
  buscar({ termo, desde }).then((r) => r.clientes || []);

/* As O.S. de uma lista de ids. É como a tela de abertura confere TODOS os
   saldos contra o ERP -- sem isto ela mostraria a soma congelada de cada
   permuta e teria de dizer que não conferiu, justo na tela em que a direção
   bate o olho para saber onde ainda há crédito. */
export const buscarOrdensPorId = (ids) =>
  !ids?.length ? Promise.resolve([]) : buscar({ ids: ids.join("|") }).then((r) => r.itens || []);

/** As O.S. dos clientes escolhidos (chaves normalizadas), da data em diante. */
export const buscarOrdensDe = (chaves, desde) =>
  buscar({ clientes: (chaves || []).join("|"), desde }).then((r) => r.itens || []);
