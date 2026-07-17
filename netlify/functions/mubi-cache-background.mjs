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
  // origem = nome do credor (PREFEITURA, SIMPLES NACIONAL, um colaborador...);
  // despesa = o que e (IPTU, DARF). A tela precisa dos dois: o nome era jogado
  // fora e a busca por "fornecedor" nunca casava.
  const fornecedor = String(s.origem || "").trim();
  const despesa = String(s.despesa || s.descricao || "").trim();
  return {
    id: String(s.id ?? `pag-${i}`),
    fornecedor: fornecedor || "Sem credor",
    descricao: despesa || fornecedor || "Saida",
    categoria: String(s.centro_custo || s.tipo || "Fornecedor"),
    valor: num(s.valor_titulo),
    vencimento: String(s.data_vencimento || ""),
    tipo: "pagar",
  };
}

const normProvisao = (categoria) => (s, i) => ({
  id: String(s.id ?? `prov-${i}`),
  fornecedor: String(s.cap_origem || s.origem || "").trim() || categoria,
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

// Rotulos de familia para os dois furos de cadastro. Sao coisas diferentes e
// tem conserto diferente no ERP, entao nao podem cair no mesmo balde:
export const SEM_CATEGORIA = "Sem categoria";   // produto existe no catalogo, categoria em branco
export const FORA_CATALOGO = "Fora do catalogo"; // nome usado na OS que nao existe mais no catalogo

function itemProduto(it, categoriaPorNome, valorTotal) {
  const nome = String(it.item || "").trim();
  const k = chaveProduto(nome);
  const categoria = categoriaPorNome.has(k)
    ? categoriaPorNome.get(k) || SEM_CATEGORIA
    : FORA_CATALOGO;
  return {
    produtoId: nome,
    produto: nome,
    categoria,
    modelo: String(it.modelo || ""),
    quantidade: num(it.quantidade) || 1,
    valorUnit: num(it.valor_unitario),
    valorTotal,
  };
}

export function normOS(os, i, categoriaPorNome) {
  const itens = [];
  for (const it of Array.isArray(os.itens) ? os.itens : []) {
    const bruto = num(it.valor_final) || num(it.sub_total);

    // Item normal: tem produto direto.
    if (String(it.item || "").trim()) {
      itens.push(itemProduto(it, categoriaPorNome, bruto));
      continue;
    }

    // UNIAO de itens: o Mubisys nao repete `item` no pai, poe os produtos reais
    // em `itens_agrupados`. Ignorar isso jogava 23% do faturamento num falso
    // produto "Outros". Os agrupados ja vem com quantidade e valor totais.
    const agrupados = (Array.isArray(it.itens_agrupados) ? it.itens_agrupados : []).filter((g) =>
      String(g.item || "").trim()
    );
    if (!agrupados.length) continue; // uniao vazia: nao ha produto a atribuir

    // A uniao pode ser vendida com desconto sobre a soma das partes. Rateia
    // proporcionalmente para que a soma dos itens seja exatamente o valor
    // cobrado -- sem rateio, o faturamento infla.
    const soma = agrupados.reduce((s, g) => s + (num(g.valor_final) || num(g.sub_total)), 0);
    const fator = soma > 0 && bruto > 0 ? bruto / soma : 1;
    for (const g of agrupados) {
      const v = (num(g.valor_final) || num(g.sub_total)) * fator;
      itens.push({ ...itemProduto(g, categoriaPorNome, v), emUniao: true });
    }
  }

  return {
    id: String(os.id ?? `os-${i}`),
    numero: String(os.sequencial_ordem || os.sequencial_orcamento || os.id || ""),
    cliente: String(os.cliente || "Cliente"),
    data: String(os.data_cadastro || ""),
    cancelada: /cancel/i.test(String(os.status || "")),
    itens,
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
  const jPag = { filtrodata: "VENCIMENTO", datainicial: hojeMais(-30), datafinal: hojeMais(60) };

  // Recursos independentes: em paralelo. Em serie, so esta etapa ja comia
  // metade do orcamento de tempo da Function.
  const [vencidos, pendentes, pagPend, pagVenc, fixa, cartao, folha, bancosBrutos] =
    await Promise.all([
      mubiGetTudo("contas-receber", { ...jRec, status: "VENCIDO" }),
      mubiGetTudo("contas-receber", { ...jRec, status: "PENDENTE" }),
      mubiGetTudo("contas-pagar", { ...jPag, status: "PENDENTE" }),
      mubiGetTudo("contas-pagar", { ...jPag, status: "VENCIDO" }),
      mubiGetTudo("contas-pagar-provisao/despesa-fixa", jPag),
      mubiGetTudo("contas-pagar-provisao/cartao-credito", jPag),
      mubiGetTudo("contas-pagar-provisao/folha-pagamento", jPag),
      mubiGetTudo("conta-bancaria"),
    ]);

  const recebiveis = dedup([...vencidos, ...pendentes].map(normRecebivel)).filter((r) => r.valor > 0);

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

// Chave de join produto->catalogo. O nome vem digitado nos dois lados, entao
// normaliza acento, espaco duplo e caixa, senao "Iluminacao" e "Iluminação"
// viram dois produtos diferentes.
export const chaveProduto = (nome) =>
  String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

async function catalogoCategorias() {
  const catalogo = await mubiGetTudo("produto");
  // Guarda a categoria CRUA (pode ser ""). Quem decide o rotulo e o normOS:
  // categoria vazia no ERP e produto fora do catalogo sao problemas diferentes.
  return new Map(catalogo.map((p) => [chaveProduto(p.nome), String(p.categoria || "").trim()]));
}

async function etapaCompleta() {
  const desde = `${new Date().getFullYear()}-01-01`;
  const janela = { status: "TODOS", filtrodata: "CADASTRO", datainicial: desde, datafinal: hojeMais(0) };

  const [orcBrutos, categoriaPorNome, osBrutas] = await Promise.all([
    mubiGetTudo("orcamento", janela),
    catalogoCategorias(),
    mubiGetTudo("ordem-servico", janela),
  ]);

  const orcamentos = orcBrutos.map(normOrcamento);
  const ordens = osBrutas.map((os, i) => normOS(os, i, categoriaPorNome)).filter((o) => !o.cancelada);

  return { orcamentos, ordens };
}

// Versao do normalizador. O ciclo incremental so reescreve os ultimos 7 dias,
// entao um conserto na normalizacao (ex: destrinchar unioes de itens) ficaria
// preso no historico ate a proxima varredura completa. Subir este numero junto
// com a mudanca faz o proximo ciclo se reconstruir sozinho.
const VERSAO_NORM = 2;

async function etapaIncremental(store, remigrarOS = false) {
  const janela = { status: "TODOS", datainicial: hojeMais(-7), datafinal: hojeMais(0) };

  const orcAtual = (await store.get("cache_orcamentos", { type: "json" })) || [];
  const mapaOrc = new Map(orcAtual.map((o) => [o.id, o]));
  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("orcamento", { ...janela, filtrodata: filtro }, 100);
    brutos.map(normOrcamento).forEach((o) => mapaOrc.set(o.id, o));
  }

  const categoriaPorNome = await catalogoCategorias();

  // O normalizador de OS mudou: o merge de 7 dias so consertaria a ponta, o
  // historico ficaria com a normalizacao velha. Rebusca o ano inteiro de OS --
  // e a UNICA fonte afetada, entao nao paga o preco da varredura completa (que
  // no horario comercial nem cabe nos 15 min da Function).
  //
  // Resiliente: se a rebusca do ano estourar (API lenta no comercial), NAO
  // deixa o ciclo inteiro falhar -- cai pro merge leve de 7 dias. O cache
  // continua fresco (ainda com a normalizacao velha nas OS antigas) e a versao
  // nao e carimbada, entao a proxima rodada tenta remigrar de novo.
  if (remigrarOS) {
    try {
      const osBrutas = await mubiGetTudo("ordem-servico", {
        status: "TODOS",
        filtrodata: "CADASTRO",
        datainicial: `${new Date().getFullYear()}-01-01`,
        datafinal: hojeMais(0),
      });
      const ordens = osBrutas
        .map((os, i) => normOS(os, i, categoriaPorNome))
        .filter((o) => !o.cancelada);
      return { orcamentos: [...mapaOrc.values()], ordens, remigrouOS: true };
    } catch (e) {
      console.warn("mubi-cache: remigracao de OS falhou, seguindo com merge leve:", e?.message || e);
    }
  }

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

  // Cache normalizado por uma versao antiga: manda o incremental remigrar as
  // OS do ano. NAO forca "completo" -- no horario comercial ele nao cabe nos
  // 15 min da Function, falharia a cada ciclo e congelaria o cache inteiro.
  const statusAnterior = await store.get("cache_status", { type: "json" });
  const remigrarOS = (statusAnterior?.versao ?? 0) !== VERSAO_NORM;
  if (remigrarOS) {
    console.log(
      `mubi-cache: cache na versao ${statusAnterior?.versao ?? 0}, normalizador na ${VERSAO_NORM} -> remigrando OS do ano`
    );
  }

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
    const pesados =
      modo === "completo" ? await etapaCompleta() : await etapaIncremental(store, remigrarOS);
    const dados = { ...rapidos, ...pesados };
    // So migrou de verdade se a varredura completa rodou ou a remigracao de OS
    // terminou sem cair no fallback leve.
    const migrouOS = modo === "completo" || pesados.remigrouOS === true;

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
      // So carimba quando o historico de OS foi de fato renormalizado. Um
      // incremental comum (ou uma remigracao que caiu no fallback) so toca 7 dias.
      versao: migrouOS ? VERSAO_NORM : (statusAnterior?.versao ?? 0),
      dso,
      duracaoMs: Date.now() - inicio,
      contagens,
    });

    // Auto-provisiona o fluxo realizado mes a mes na primeira vez (ou se sumir).
    // Roda numa background propria (nao pesa este ciclo); fire-and-forget.
    try {
      const temMensal = await store.get("cache_fluxo_mensal", { type: "json" });
      if (!temMensal) {
        const base = process.env.URL || "https://painel-impresilk.netlify.app";
        fetch(`${base}/.netlify/functions/mubi-realizado-background`, {
          method: "POST",
          headers: { "x-token": SEGREDO },
        }).catch(() => {});
        console.log("mubi-cache: disparou mubi-realizado (primeira carga do mensal)");
      }
    } catch {}

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
