// Lancamentos de manutencao. Moram no painel-config (chave "manutencoes"),
// um registro por linha -- mesmo mecanismo dos bancos e do glossario, entao
// dois lancamentos simultaneos nao se apagam.
//
// Os ITENS (o carro, a maquina, a camera) nao moram aqui: sao ativos do
// painel-ativos. Veiculo e maquina ja estavam cadastrados em "Documentos e
// ativos" e seria erro pedir para cadastrar de novo; o predial nasce na tela
// de Manutencoes, com tipo "predial".

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

export const lerManutencoes = () =>
  chamar("get", { chave: "manutencoes" }).then((r) => r.valor || {});

export const salvarManutencao = (id, dados) =>
  chamar("merge", { chave: "manutencoes", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerManutencao = (id) =>
  chamar("removerId", { chave: "manutencoes", id }).then(() => true);
