// Trabalho pesado: busca TUDO do Mubisys (sequencial, com folga no limite de
// 15 minutos das background functions) e grava no Netlify Blobs. O painel le
// esse cache instantaneamente. Disparado pelo cron (mubi-cache-cron) a cada
// 20 minutos e manualmente via POST com x-token.
//
// Functions 2.0 (ESM): o runtime injeta o contexto do Blobs sozinho.

import { getStore } from "@netlify/blobs";
import { mubiGetTudo, mubiConfigurado, hojeMais, num } from "./lib/mubi.js";

// ---- normalizacoes (campos reais do Mubisys, confirmados em 2026-07-14) ----

function normRecebivel(r, i) {
  return {
    id: String(r.id ?? `rec-${i}`),
    cliente: String(r.origem || "Cliente"),
    cnpj: String(r.origem_cnpj || ""),
    nf: String(r.numero_nota_fiscal || ""),
    os: String(r.despesa || ""),
    valor: num(r.valor_titulo),
    emissao: String(r.data_despesa || r.data_cadastro || ""),
    vencimento: String(r.data_vencimento || ""),
    situacao: "aberto",
  };
}

function normPagar(s, i) {
  return {
    id: String(s.id ?? `pag-${i}`),
    descricao: String(s.despesa || s.descricao || s.origem || "Saida"),
    categoria: String(s.centro_custo || s.tipo || "Fornecedor"),
    valor: num(s.valor_titulo),
    vencimento: String(s.data_vencimento || ""),
    tipo: "pagar",
  };
}

const normProvisao = (categoria) => (s, i) => ({
  id: String(s.id ?? `prov-${i}`),
  descricao: String(s.cap_despesa || s.cap_descricao || categoria),
  categoria,
  valor: num(s.cap_valor),
  vencimento: String(s.cap_vencimento || ""),
  tipo: "provisao",
});

function normOrcamento(o, i) {
  const s = String(o.status || "").toLowerCase();
  const situacao =
    s.includes("cancel") || s.includes("reprov") || s.includes("recus") || s.includes("perd")
      ? "perdido"
      : s.includes("aberto")
        ? "aberto"
        : "ganho";
  const vt = num(o.valor_total);
  const valor =
    vt > 0
      ? vt
      : (Array.isArray(o.itens) ? o.itens : []).reduce(
          (acc, it) => acc + (num(it.valor_final) || num(it.sub_total)),
          0
        );
  const vendedor = String(o.vendedor || "").trim() || "Sem vendedor";
  return {
    id: String(o.id ?? `orc-${i}`),
    numero: String(o.sequencial_orcamento || o.id || ""),
    cliente: String(o.cliente || "Cliente"),
    vendedorId: vendedor,
    vendedorNome: vendedor,
    valor,
    situacao,
    dataEnvio: String(o.data_cadastro || ""),
    dataFechamento: o.data_aprovacao || o.data_cancelamento || null,
    trabalho: String(o.nome_trabalho || ""),
  };
}

function normOS(os, i, categoriaPorNome) {
  return {
    id: String(os.id ?? `os-${i}`),
    numero: String(os.sequencial_ordem || os.sequencial_orcamento || os.id || ""),
    cliente: String(os.cliente || "Cliente"),
    data: String(os.data_cadastro || ""),
    itens: (Array.isArray(os.itens) ? os.itens : []).map((it, k) => {
      const nome = String(it.item || `Item ${k + 1}`).trim();
      return {
        produtoId: nome,
        produto: nome,
        categoria: categoriaPorNome.get(nome.toLowerCase()) || "Geral",
        quantidade: num(it.quantidade) || 1,
        valorUnit: num(it.valor_unitario),
        valorTotal: num(it.valor_final) || num(it.sub_total),
      };
    }),
  };
}

function dedup(lista, chave = (x) => x.id) {
  const vistos = new Set();
  const out = [];
  for (const x of lista) {
    const k = chave(x);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------- o trabalho

export default async (req) => {
  // Guarda leve: so o cron (com x-token) ou quem tem o segredo dispara.
  const token = req.headers.get("x-token");
  if (process.env.TOKEN && token !== process.env.TOKEN) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), { status: 401 });
  }
  if (!mubiConfigurado()) {
    return new Response(JSON.stringify({ erro: "Mubi nao configurado" }), { status: 501 });
  }

  const inicio = Date.now();
  console.log("mubi-cache: inicio");
  const store = getStore("painel");
  const desde = `${new Date().getFullYear()}-01-01`;
  const contagens = {};

  try {
    // Sequencial de proposito: o Mubisys sofre com chamadas paralelas.
    const jRec = { filtrodata: "VENCIMENTO", datainicial: hojeMais(-365), datafinal: hojeMais(90) };
    const vencidos = await mubiGetTudo("contas-receber", { ...jRec, status: "VENCIDO" });
    const pendentes = await mubiGetTudo("contas-receber", { ...jRec, status: "PENDENTE" });
    const recebiveis = dedup([...vencidos, ...pendentes].map(normRecebivel)).filter((r) => r.valor > 0);
    await store.setJSON("cache_recebiveis", recebiveis);
    console.log("cache: recebiveis", recebiveis.length);
    contagens.recebiveis = recebiveis.length;

    const jPag = { filtrodata: "VENCIMENTO", datainicial: hojeMais(-30), datafinal: hojeMais(60) };
    const pagPend = await mubiGetTudo("contas-pagar", { ...jPag, status: "PENDENTE" });
    const pagVenc = await mubiGetTudo("contas-pagar", { ...jPag, status: "VENCIDO" });
    const fixa = await mubiGetTudo("contas-pagar-provisao/despesa-fixa", jPag);
    const cartao = await mubiGetTudo("contas-pagar-provisao/cartao-credito", jPag);
    const folha = await mubiGetTudo("contas-pagar-provisao/folha-pagamento", jPag);
    const pagar = dedup(
      [
        ...pagPend.map(normPagar),
        ...pagVenc.map(normPagar),
        ...fixa.map(normProvisao("Despesa fixa")),
        ...cartao.map(normProvisao("Cartao")),
        ...folha.map(normProvisao("Folha")),
      ],
      (x) => `${x.tipo}:${x.id}`
    ).filter((s) => s.valor > 0);
    await store.setJSON("cache_pagar", pagar);
    console.log("cache: pagar", pagar.length);
    contagens.pagar = pagar.length;

    const bancosBrutos = await mubiGetTudo("conta-bancaria");
    const bancos = bancosBrutos
      .filter((b) => String(b.status || "").toLowerCase() === "ativo")
      .filter((b) => !/permuta/i.test(String(b.titulo || "")))
      .map((b, i) => ({
        id: String(b.id ?? `cb-${i}`),
        banco: String(b.titulo || "Conta"),
        conta: String(b.empresa || ""),
        saldo: num(b.valor_saldo),
      }));
    await store.setJSON("cache_bancos", bancos);
    console.log("cache: bancos", bancos.length);
    contagens.bancos = bancos.length;

    const orcBrutos = await mubiGetTudo("orcamento", {
      status: "TODOS",
      filtrodata: "CADASTRO",
      datainicial: desde,
      datafinal: hojeMais(0),
    });
    const orcamentos = orcBrutos.map(normOrcamento);
    await store.setJSON("cache_orcamentos", orcamentos);
    console.log("cache: orcamentos", orcamentos.length);
    contagens.orcamentos = orcamentos.length;

    const catalogo = await mubiGetTudo("produto");
    const categoriaPorNome = new Map(
      catalogo.map((p) => [String(p.nome || "").trim().toLowerCase(), String(p.categoria || "Geral")])
    );
    const osBrutas = await mubiGetTudo("ordem-servico", {
      status: "TODOS",
      filtrodata: "CADASTRO",
      datainicial: desde,
      datafinal: hojeMais(0),
    });
    const ordens = osBrutas
      .filter((os) => !/cancel/i.test(String(os.status || "")))
      .map((os, i) => normOS(os, i, categoriaPorNome));
    await store.setJSON("cache_ordens", ordens);
    console.log("cache: ordens", ordens.length);
    contagens.ordens = ordens.length;

    await store.setJSON("cache_status", {
      em: new Date().toISOString(),
      ok: true,
      duracaoMs: Date.now() - inicio,
      contagens,
    });

    return new Response(JSON.stringify({ ok: true, contagens }), { status: 200 });
  } catch (e) {
    await store.setJSON("cache_status", {
      em: new Date().toISOString(),
      ok: false,
      erro: e.message,
      duracaoMs: Date.now() - inicio,
      contagens,
    });
    return new Response(JSON.stringify({ erro: e.message }), { status: 502 });
  }
};
