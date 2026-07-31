// Camada unica de acesso ao ERP Mubi(sys). O React NUNCA fala com o Mubi
// direto: chama as Netlify Functions (que guardam as credenciais). Cada
// invocacao de Function busca UMA pagina do Mubisys (limite de 10s); quem
// junta as paginas, em paralelo, e esta camada.

import * as demo from "./demo/dados.js";
import { comCracha } from "../lib/sessao.js";

// MODO_DEMO desligado em 2026-07-14: o painel agora le os dados reais do
// Mubisys via Netlify Functions. Religar (true) so para demonstracoes.
export const MODO_DEMO = false;

import { API } from "../lib/api.js";

// Os quatro modulos de leitura viraram UMA function (?modulo=).
const BASE = `${API}/painel-dados`;

// Frescor do cache e historico real de DSO, capturados das respostas.
let _atualizadoEm = null;
let _dsoHist = [];

async function chamarFunction(nome, params = {}, tentativa = 1) {
  const url = new URL(BASE);
  url.searchParams.set("modulo", nome);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await comCracha(url.toString());
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    if (body?.preparando) {
      throw new Error(
        "Os dados do Mubisys estao sendo preparados (primeira carga leva uns 2 minutos). Clique em Tentar de novo daqui a pouco."
      );
    }
    if (tentativa < 2 && resp.status >= 500) {
      return chamarFunction(nome, params, tentativa + 1);
    }
    throw new Error(body?.erro || `Function ${nome} respondeu ${resp.status}`);
  }
  if (body && typeof body === "object") {
    if (body.atualizadoEm) _atualizadoEm = body.atualizadoEm;
    if (Array.isArray(body.dsoHist)) _dsoHist = body.dsoHist;
  }
  return body;
}

// Horario do ultimo cache bem-sucedido (ISO) e historico real de DSO.
export function getUltimaAtualizacao() {
  return MODO_DEMO ? null : _atualizadoEm;
}
export function getDsoHistorico() {
  return MODO_DEMO ? [] : _dsoHist;
}

// Simula latencia leve no demo para exercitar os estados de carregamento.
const demora = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export async function getRecebiveis() {
  if (MODO_DEMO) {
    await demora();
    return demo.getRecebiveis();
  }
  return (await chamarFunction("contas-atrasadas")).itens || [];
}

export async function getPagar() {
  if (MODO_DEMO) {
    await demora();
    return demo.getPagar();
  }
  return (await chamarFunction("fluxo-caixa")).itens || [];
}

export async function getContasBancarias() {
  if (MODO_DEMO) {
    await demora();
    return demo.getContasBancarias();
  }
  return (await chamarFunction("fluxo-caixa", { parte: "bancos" })).itens || [];
}

// Fluxo REALIZADO mes a mes (por ano). { anos: {"2026": {entradas, saidas}}, disponiveis: [...] }
export async function getFluxoMensal() {
  if (MODO_DEMO) {
    await demora();
    return demo.getFluxoMensal ? demo.getFluxoMensal() : { anos: {}, disponiveis: [] };
  }
  const r = await chamarFunction("fluxo-caixa", { parte: "mensal" });
  return { anos: r.anos || {}, disponiveis: r.disponiveis || [] };
}

export async function getOrcamentos() {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrcamentos();
  }
  return (await chamarFunction("orcamentos")).itens || [];
}

export async function getOrdensServico() {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrdensServico();
  }
  return (await chamarFunction("produtos")).itens || [];
}

// Em demo o catalogo e fixo; com o Mubi real ele e derivado dos itens das OS
// (a categoria ja vem aplicada pelo join acima).
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
