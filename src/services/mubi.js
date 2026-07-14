// Camada unica de acesso ao ERP Mubi. O React NUNCA fala com o Mubi direto:
// em producao chama as Netlify Functions (que guardam a chave); em demo devolve
// dados de exemplo. Todos os endpoints do Mubi sao GET (somente leitura).

import * as demo from "./demo/dados.js";

// MODO_DEMO desligado em 2026-07-14: o painel agora le os dados reais do
// Mubisys via Netlify Functions. Religar (true) so para demonstracoes.
export const MODO_DEMO = false;

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

export async function getOrcamentos(desde) {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrcamentos();
  }
  return chamarFunction("orcamentos", desde ? { desde } : {});
}

export async function getOrdensServico(desde) {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrdensServico();
  }
  return chamarFunction("produtos", desde ? { desde } : {});
}

// Em demo o catalogo e fixo; com o Mubi real ele e derivado dos itens das OS.
export function getProdutosCatalogo(ordens) {
  if (MODO_DEMO) return demo.PRODUTOS;
  const mapa = new Map();
  for (const os of ordens || []) {
    for (const it of os.itens || []) {
      if (!mapa.has(it.produtoId)) {
        mapa.set(it.produtoId, {
          id: it.produtoId,
          nome: it.produto || it.produtoId,
          categoria: it.categoria || "Geral",
        });
      }
    }
  }
  return [...mapa.values()];
}

// Sementes das marcacoes manuais (motivos, cobrado) para o app ja nascer vivo.
export function getSeedOverridesRecebiveis() {
  return MODO_DEMO ? demo.getSeedOverridesRecebiveis() : {};
}
export function getSeedOverridesOrcamentos() {
  return MODO_DEMO ? demo.getSeedOverridesOrcamentos() : {};
}
