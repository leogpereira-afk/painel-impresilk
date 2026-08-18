// As permutas moram no painel-config (chave "permutas"), um registro por linha
// -- o mesmo mecanismo dos bancos, do glossário e das manutenções. Isso importa
// aqui mais que nos outros: aceitar uma O.S. e lançar o crédito são duas
// escritas que acontecem seguidas, e `merge` por id não deixa a segunda apagar
// a primeira.
//
// A conta em si (saldo, valor da O.S., divergência com o ERP) não está aqui:
// está em src/lib/calc/permutas.js, sem rede nenhuma, para poder ser testada.

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

export const lerPermutas = () =>
  chamar("get", { chave: "permutas" }).then((r) => r.valor || {});

/* Grava os CAMPOS de uma permuta (nome, crédito, clientes, encerrada). Devolve
   o pacote inteiro que o servidor passou a ter -- quem chama deve usar ESSE
   retorno como novo estado, e não o objeto que montou: se outra aba mexeu na
   permuta ao lado, o retorno já traz as duas.

   NÃO mande `os` por aqui. O campo `os` é um mapa e este merge é raso: o mapa
   que vier substitui o que está no banco inteiro. Use `mexerNasOS`. */
export const salvarPermuta = (id, dados) => {
  const { os: _naoPorAqui, osPatch: _nemAssim, ...campos } = dados || {};
  return chamar("merge", { chave: "permutas", patch: { [id]: campos } }).then((r) => r.valor || {});
};

/* Aceita e tira O.S., uma a uma, sem reenviar o mapa.
   `patch` é { [osId]: ficha } para aceitar e { [osId]: null } para tirar.
   O servidor funde chave a chave (`osPatch` em painel-config), então duas abas
   aceitando O.S. diferentes ao mesmo tempo não se apagam. */
export const mexerNasOS = (id, patch) =>
  chamar("merge", { chave: "permutas", patch: { [id]: { osPatch: patch } } }).then((r) => r.valor || {});

export const removerPermuta = (id) =>
  chamar("removerId", { chave: "permutas", id }).then(() => true);
