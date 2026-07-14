// Trabalho pesado: busca dados do Mubisys e grava no Netlify Blobs; o painel le
// esse cache instantaneamente. Dois modos (o Mubisys leva MINUTOS por pagina em
// horario comercial, entao a recarga completa so roda de madrugada):
//
//   ?modo=incremental (padrao; cron a cada 20 min)
//     - recebiveis, contas a pagar e bancos: recarga completa (endpoints rapidos)
//     - orcamentos e OS: janela dos ultimos 7 dias (CADASTRO + APROVACAO +
//       CANCELAMENTO), mesclada por id no cache existente. Edicao de valor num
//       registro ANTIGO so consolida na recarga completa da madrugada (a API
//       nao filtra por data de alteracao).
//   ?modo=completo (cron noturno; ou manual)
//     - tudo desde 1 de janeiro
//
// ESCRITA ATOMICA: nada e gravado no Blobs durante a busca. Tudo e montado em
// memoria e gravado de uma vez SO NO FIM. Se a busca falhar ou a Function for
// morta por tempo, o cache anterior (completo e consistente) fica intacto.
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

export function normOrcamento(o, i) {
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

export function normOS(os, i, categoriaPorNome) {
  return {
    id: String(os.id ?? `os-${i}`),
    numero: String(os.sequencial_ordem || os.sequencial_orcamento || os.id || ""),
    cliente: String(os.cliente || "Cliente"),
    data: String(os.data_cadastro || ""),
    cancelada: /cancel/i.test(String(os.status || "")),
    itens: (Array.isArray(os.itens) ? os.itens : []).map((it) => {
      // Itens sem produto (frete, custos avulsos, servicos gerais) viram
      // "Outros", em vez de virar um falso produto "Item N".
      const nome = String(it.item || "").trim() || "Outros";
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

// Dia local do Brasil (UTC-3) em AAAA-MM-DD, e DSO ponderado por valor.
function diaBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function diasDesde(iso) {
  if (!iso) return 0;
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  const hoje = new Date(diaBR() + "T00:00:00Z");
  return Math.round((hoje - d) / 86400000);
}
function calcDso(recebiveis) {
  const tot = recebiveis.reduce((s, r) => s + (r.valor || 0), 0) || 1;
  const acc = recebiveis.reduce((s, r) => s + (r.valor || 0) * diasDesde(r.emissao), 0);
  return Math.round(acc / tot);
}

// ---------------------------------------------------------------- etapas
// (nenhuma etapa grava no Blobs; todas RETORNAM os dados montados)

async function etapaRapidos() {
  const jRec = { filtrodata: "VENCIMENTO", datainicial: hojeMais(-365), datafinal: hojeMais(90) };
  const vencidos = await mubiGetTudo("contas-receber", { ...jRec, status: "VENCIDO" });
  const pendentes = await mubiGetTudo("contas-receber", { ...jRec, status: "PENDENTE" });
  const recebiveis = dedup([...vencidos, ...pendentes].map(normRecebivel)).filter((r) => r.valor > 0);

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

  return { recebiveis, pagar, bancos };
}

async function catalogoCategorias() {
  const catalogo = await mubiGetTudo("produto");
  return new Map(
    catalogo.map((p) => [String(p.nome || "").trim().toLowerCase(), String(p.categoria || "Geral")])
  );
}

async function etapaCompleta() {
  const desde = `${new Date().getFullYear()}-01-01`;
  const orcBrutos = await mubiGetTudo("orcamento", {
    status: "TODOS",
    filtrodata: "CADASTRO",
    datainicial: desde,
    datafinal: hojeMais(0),
  });
  const orcamentos = orcBrutos.map(normOrcamento);

  const categoriaPorNome = await catalogoCategorias();
  const osBrutas = await mubiGetTudo("ordem-servico", {
    status: "TODOS",
    filtrodata: "CADASTRO",
    datainicial: desde,
    datafinal: hojeMais(0),
  });
  const ordens = osBrutas.map((os, i) => normOS(os, i, categoriaPorNome)).filter((o) => !o.cancelada);

  return { orcamentos, ordens };
}

async function etapaIncremental(store) {
  const janela = { status: "TODOS", datainicial: hojeMais(-7), datafinal: hojeMais(0) };

  const orcAtual = (await store.get("cache_orcamentos", { type: "json" })) || [];
  const mapaOrc = new Map(orcAtual.map((o) => [o.id, o]));
  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("orcamento", { ...janela, filtrodata: filtro }, 100);
    brutos.map(normOrcamento).forEach((o) => mapaOrc.set(o.id, o));
  }

  const categoriaPorNome = await catalogoCategorias();
  const osAtual = (await store.get("cache_ordens", { type: "json" })) || [];
  const mapaOS = new Map(osAtual.map((o) => [o.id, o]));
  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("ordem-servico", { ...janela, filtrodata: filtro }, 100);
    for (const [i, bruto] of brutos.entries()) {
      const o = normOS(bruto, i, categoriaPorNome);
      if (o.cancelada) mapaOS.delete(o.id);
      else mapaOS.set(o.id, o);
    }
  }

  return { orcamentos: [...mapaOrc.values()], ordens: [...mapaOS.values()] };
}

// ---------------------------------------------------------------- o trabalho

export default async (req) => {
  // Auth fail-CLOSED: sem TOKEN no ambiente, recusa tudo (nunca liberar sem segredo).
  const SEGREDO = process.env.TOKEN;
  if (!SEGREDO) {
    console.error("mubi-cache: TOKEN nao configurado no ambiente");
    return new Response(JSON.stringify({ erro: "servidor sem TOKEN" }), { status: 500 });
  }
  if (req.headers.get("x-token") !== SEGREDO) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), { status: 401 });
  }
  if (!mubiConfigurado()) {
    return new Response(JSON.stringify({ erro: "Mubi nao configurado" }), { status: 501 });
  }

  const modo = new URL(req.url).searchParams.get("modo") === "completo" ? "completo" : "incremental";
  const store = getStore("painel");

  // Trava anti-corrida: nao roda dois ciclos ao mesmo tempo (cron x noturno).
  const LOCK_MS = 14 * 60 * 1000;
  const lock = await store.get("cache_lock", { type: "json" });
  if (lock && lock.em && Date.now() - new Date(lock.em).getTime() < LOCK_MS) {
    console.log("mubi-cache: ja ha um ciclo rodando; pulando");
    return new Response(JSON.stringify({ ok: false, motivo: "ja rodando" }), { status: 200 });
  }
  await store.setJSON("cache_lock", { em: new Date().toISOString(), modo });

  const inicio = Date.now();
  console.log(`mubi-cache: inicio (${modo})`);

  try {
    // 1) Busca tudo em memoria (nada gravado ainda).
    const rapidos = await etapaRapidos();
    const pesados = modo === "completo" ? await etapaCompleta() : await etapaIncremental(store);
    const dados = { ...rapidos, ...pesados };

    // 2) DSO do dia + acumula historico real (um ponto por dia, ultimos 180).
    const dso = calcDso(dados.recebiveis);
    const histAntigo = (await store.get("cache_dso_hist", { type: "json" })) || [];
    const dia = diaBR();
    const dsoHist = [...histAntigo.filter((p) => p && p.dia !== dia), { dia, dso }].slice(-180);

    const contagens = {
      recebiveis: dados.recebiveis.length,
      pagar: dados.pagar.length,
      bancos: dados.bancos.length,
      orcamentos: dados.orcamentos.length,
      ordens: dados.ordens.length,
    };

    // 3) Grava tudo de uma vez SO AGORA (janela minima de inconsistencia).
    await store.setJSON("cache_recebiveis", dados.recebiveis);
    await store.setJSON("cache_pagar", dados.pagar);
    await store.setJSON("cache_bancos", dados.bancos);
    await store.setJSON("cache_orcamentos", dados.orcamentos);
    await store.setJSON("cache_ordens", dados.ordens);
    await store.setJSON("cache_dso_hist", dsoHist);
    await store.setJSON("cache_status", {
      em: new Date().toISOString(), // horario do ULTIMO sucesso (frescor real)
      ok: true,
      modo,
      dso,
      duracaoMs: Date.now() - inicio,
      contagens,
    });

    console.log("mubi-cache: fim ok", JSON.stringify(contagens));
    return new Response(JSON.stringify({ ok: true, modo, contagens }), { status: 200 });
  } catch (e) {
    // Nada foi gravado nas chaves de dados: o cache anterior segue intacto.
    // Preserva o "em" do ultimo sucesso e so marca a falha da tentativa.
    console.error("mubi-cache: ERRO", e?.message || e);
    const prev = (await store.get("cache_status", { type: "json" })) || {};
    await store.setJSON("cache_status", {
      ...prev,
      ok: false,
      modo,
      ultimaFalhaEm: new Date().toISOString(),
      erro: String(e?.message || e),
      duracaoMs: Date.now() - inicio,
    });
    return new Response(JSON.stringify({ erro: "falha ao atualizar o cache" }), { status: 502 });
  } finally {
    await store.delete("cache_lock").catch(() => {});
  }
};
