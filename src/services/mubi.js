// Camada unica de acesso ao ERP Mubi. O React NUNCA fala com o Mubi direto:
// em producao chama as Netlify Functions (que guardam a chave); em demo devolve
// dados de exemplo. Todos os endpoints do Mubi sao GET (somente leitura).

import * as demo from "./demo/dados.js";

// Enquanto as Functions nao tiverem a chave e o base URL reais, MODO_DEMO faz o
// app rodar completo com dados coerentes. Trocar para false quando o Mubi entrar.
export const MODO_DEMO = true;

const BASE = "/.netlify/functions";

async function chamarFunction(nome, params = {}) {
  const url = new URL(BASE + "/" + nome, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString().replace(window.location.origin, ""));
  if (!resp.ok) throw new Error(`Function ${nome} respondeu ${resp.status}`);
  return resp.json();
}

// Simula latencia leve no demo para exercitar os estados de carregamento.
const demora = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export async function getRecebiveis() {
  if (MODO_DEMO) {
    await demora();
    return demo.getRecebiveis();
  }
  return chamarFunction("contas-atrasadas");
}

export async function getPagar() {
  if (MODO_DEMO) {
    await demora();
    return demo.getPagar();
  }
  return chamarFunction("fluxo-caixa", { parte: "pagar" });
}

export async function getContasBancarias() {
  if (MODO_DEMO) {
    await demora();
    return demo.getContasBancarias();
  }
  return chamarFunction("fluxo-caixa", { parte: "bancos" });
}

export async function getOrcamentos() {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrcamentos();
  }
  return chamarFunction("orcamentos");
}

export async function getOrdensServico() {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrdensServico();
  }
  return chamarFunction("produtos", { parte: "ordens" });
}

export function getProdutosCatalogo() {
  return demo.PRODUTOS;
}

// Sementes das marcacoes manuais (motivos, cobrado) para o app ja nascer vivo.
export function getSeedOverridesRecebiveis() {
  return MODO_DEMO ? demo.getSeedOverridesRecebiveis() : {};
}
export function getSeedOverridesOrcamentos() {
  return MODO_DEMO ? demo.getSeedOverridesOrcamentos() : {};
}
