// Camada unica de acesso ao ERP Mubi(sys). O React NUNCA fala com o Mubi
// direto: chama as Netlify Functions (que guardam as credenciais). Cada
// invocacao de Function busca UMA pagina do Mubisys (limite de 10s); quem
// junta as paginas, em paralelo, e esta camada.

import * as demo from "./demo/dados.js";

// MODO_DEMO desligado em 2026-07-14: o painel agora le os dados reais do
// Mubisys via Netlify Functions. Religar (true) so para demonstracoes.
export const MODO_DEMO = false;

const BASE = "/.netlify/functions";
const MAX_PAGINAS = 20;

async function chamarFunction(nome, params = {}, tentativa = 1) {
  const url = new URL(BASE + "/" + nome, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString().replace(window.location.origin, ""));
  if (!resp.ok) {
    // 502/504 esporadico (Mubisys lento): tenta mais uma vez antes de desistir.
    if (tentativa < 2 && resp.status >= 500) {
      return chamarFunction(nome, params, tentativa + 1);
    }
    throw new Error(`Function ${nome} respondeu ${resp.status}`);
  }
  return resp.json();
}

// Busca a pagina 1, descobre o total e traz o resto em paralelo.
async function paginado(nome, params = {}) {
  const p1 = await chamarFunction(nome, { ...params, page: 1 });
  const out = [...(p1.itens || [])];
  const total = Math.min(Number(p1.totalPaginas) || 1, MAX_PAGINAS);
  if (total > 1) {
    const resto = await Promise.all(
      Array.from({ length: total - 1 }, (_, i) =>
        chamarFunction(nome, { ...params, page: i + 2 })
      )
    );
    for (const r of resto) out.push(...(r.itens || []));
  }
  return out;
}

// Simula latencia leve no demo para exercitar os estados de carregamento.
const demora = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export async function getRecebiveis() {
  if (MODO_DEMO) {
    await demora();
    return demo.getRecebiveis();
  }
  const [vencidos, pendentes] = await Promise.all([
    paginado("contas-atrasadas", { status: "VENCIDO" }),
    paginado("contas-atrasadas", { status: "PENDENTE" }),
  ]);
  const vistos = new Set();
  const abertos = [];
  for (const r of [...vencidos, ...pendentes]) {
    if (vistos.has(r.id)) continue;
    vistos.add(r.id);
    abertos.push(r);
  }
  return abertos;
}

export async function getPagar() {
  if (MODO_DEMO) {
    await demora();
    return demo.getPagar();
  }
  const fontes = ["pendente", "vencido", "fixa", "cartao", "folha"];
  const listas = await Promise.all(fontes.map((fonte) => paginado("fluxo-caixa", { fonte })));
  const vistos = new Set();
  const saidas = [];
  for (const lista of listas) {
    for (const s of lista) {
      const chave = `${s.tipo}:${s.id}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saidas.push(s);
    }
  }
  return saidas;
}

export async function getContasBancarias() {
  if (MODO_DEMO) {
    await demora();
    return demo.getContasBancarias();
  }
  const r = await chamarFunction("fluxo-caixa", { parte: "bancos" });
  return r.itens || [];
}

export async function getOrcamentos(desde) {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrcamentos();
  }
  return paginado("orcamentos", desde ? { desde } : {});
}

export async function getOrdensServico(desde) {
  if (MODO_DEMO) {
    await demora();
    return demo.getOrdensServico();
  }
  const [catalogo, ordens] = await Promise.all([
    paginado("produtos", { parte: "catalogo" }),
    paginado("produtos", desde ? { desde } : {}),
  ]);
  // Join da categoria pelo nome do produto (o cadastro /produto e a fonte).
  const categoriaPorNome = new Map(
    catalogo.map((p) => [String(p.nome || "").toLowerCase(), p.categoria || "Geral"])
  );
  for (const os of ordens) {
    for (const it of os.itens || []) {
      it.categoria = categoriaPorNome.get(String(it.produto || "").toLowerCase()) || it.categoria || "Geral";
    }
  }
  return ordens;
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
