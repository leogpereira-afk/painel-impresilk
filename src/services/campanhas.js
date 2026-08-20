/* Campanhas: a MESMA porta da permuta, com outra coleção.
 *
 * Escolher clientes e aceitar O.S. uma a uma é o mesmo trabalho nas duas telas,
 * e no banco é a mesma função (`troca_mexer`): transação com a linha travada e
 * histórico carimbado pelo servidor. O que muda é a pergunta que cada tela faz
 * com o resultado -- e pergunta é conta, não gravação.
 *
 * A conta está em src/lib/calc/campanhas.js, sem rede, para poder ser testada.
 */

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

export const lerCampanhas = () =>
  chamar("get", { chave: "campanhas" }).then((r) => r.valor || {});

/* `campos` — nome, ano, meta, clientes, encerrada
   `osPatch` — { [osId]: ficha } aceita, { [osId]: null } tira
   `criar`  — só a criação explícita cria. */
export const mexerNaCampanha = (id, { campos = {}, osPatch, lancPatch, criar } = {}) =>
  chamar("merge", {
    chave: "campanhas",
    patch: {
      [id]: {
        ...campos,
        ...(osPatch ? { osPatch } : {}),
        ...(lancPatch ? { lancPatch } : {}),
        ...(criar ? { criar: true } : {}),
      },
    },
  }).then((r) => r.valor || {});

export const removerCampanha = (id) =>
  chamar("removerId", { chave: "campanhas", id }).then(() => true);

export const anexarNaCampanha = (id, { lancId, nome, mime, base64 }) =>
  chamar("permutaAnexo", { chave: "campanhas", id, lancId, nome, mime, base64 }).then((r) => r.valor || {});

export const lerAnexoCampanha = (id, arquivo) =>
  chamar("lerArquivo", { chave: "campanhas", id, arquivo });

/* A busca de O.S. é a MESMA da permuta -- mesma tabela, mesma Edge Function.
   Reexportada para a tela não ter de saber de qual módulo ela vem. */
export { buscarClientes, buscarOrdensDe, buscarOrdensPorId, lerCobertura } from "./permutas.js";
