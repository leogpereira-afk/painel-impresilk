// ============================================================================
// SONDA DOS RECURSOS DO ERP QUE AINDA NAO USAMOS
//
// A documentacao do Mubisys (api.mubisys.com/api/documentation) lista 71
// operacoes e descreve ZERO campos de resposta -- so codigos de status. E o
// recurso existir nao prova que alguem alimenta ele: a tela de Orcamentos ja
// aprendeu isso caro (a colecao ov_orc tinha UM registro em oito meses).
//
// Entao antes de escolher o que conectar, medir: cada recurso responde? com
// quantos registros? com quais campos?
//
//   MUBI_BASE_URL=... MUBI_PUBLIC_KEY=... MUBI_TOKEN=... node scripts/sondar-mubi.mjs
//
// O token NUNCA e impresso. Nao grava nada, nao altera nada: so GET.
//
// CONTROLE: `ordem-servico` ja funciona hoje e e sondado junto. Se ELE vier
// vazio, o problema e a credencial -- nao a ausencia de dado. Zero so vira
// resultado depois que o controle passa.
// ============================================================================
import { mubiGet, mubiConfigurado, itens } from "../netlify/functions/lib/mubi.js";

const DIAS = Number(process.env.SONDA_DIAS || 90);
const hoje = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const inicial = iso(new Date(hoje.getTime() - DIAS * 864e5));
// `datafinal` corta na meia-noite do dia informado: pedir um dia alem, senao o
// proprio dia de hoje some da janela.
const final = iso(new Date(hoje.getTime() + 864e5));
const PERIODO = { datainicial: inicial, datafinal: final };
const PG = { page: 1, per_page: 5 };

// Os recursos que hoje NAO consumimos, com os parametros que a doc marca como
// obrigatorios. Valores em MAIUSCULAS -- minusculo devolve 422.
const ALVOS = [
  ["ordem-servico", { ...PERIODO, ...PG }, "CONTROLE (ja usamos)"],
  ["cliente", { ...PG }, "10.700 registros na ultima sondagem"],
  ["fornecedor", { ...PG }, "1.299 registros"],
  ["classificacao-cliente", { ...PG }, "tabela de apoio"],
  ["origem-cliente", { ...PG }, "atribuicao de marketing"],
  ["usuario", { ...PG }, "elenco do ERP"],
  ["usuario/vendedor", { ...PG }, "vendedores ativos E inativos"],
  ["grupo-tarefa", { ...PG }, "tabela de apoio"],
  ["materia-prima", { ...PG }, "insumo"],
  ["funil-vendas-grupo", { ...PG }, "a ETAPA que os Orcamentos dizem nao existir"],
  ["nota-fiscal-recebida", { status: "TODOS", filtrodata: "EMISSAO", ...PERIODO, ...PG },
    "fecharia a ponte Compras <-> pagamento"],
  ["nota-fiscal-produto", { status: "TODOS", filtrodata: "EMISSAO", ...PERIODO, ...PG }, "NFe emitida"],
  ["nota-fiscal-servico", { status: "TODOS", filtrodata: "EMISSAO", ...PERIODO, ...PG }, "NFSe emitida"],
];

// Descreve a FORMA de um registro sem despejar dado pessoal: nome do campo e o
// que ele e. Listas e objetos abrem um nivel, que e onde mora contatos[] e
// enderecos[].
function forma(v, prof = 0) {
  if (v === null || v === undefined) return "vazio";
  if (Array.isArray(v)) {
    if (!v.length) return "lista[0]";
    return prof >= 1 ? `lista[${v.length}]`
      : `lista[${v.length}]{ ${Object.keys(v[0] ?? {}).join(", ") || typeof v[0]} }`;
  }
  if (typeof v === "object") {
    return prof >= 1 ? "objeto" : `{ ${Object.keys(v).join(", ")} }`;
  }
  /* NENHUM VALOR SAI DAQUI. A versao anterior imprimia o valor inteiro quando
     ele tinha ate 28 caracteres -- o que basta para `razao_social` e
     `nome_fantasia` da maioria dos clientes. Isto roda no GitHub Actions de um
     repositorio PUBLICO: o log e publico junto. Sonda mede FORMA; quem precisa
     do conteudo abre o ERP. */
  if (typeof v === "number")  return `numero(${String(v).length} dig)`;
  if (typeof v === "boolean") return "booleano";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "data";
  return `texto(${s.length})`;
}

function total(bruto) {
  const m = bruto?.pagination || bruto?.meta;
  return m?.total ?? null;
}

async function sondar(caminho, query, nota) {
  try {
    const bruto = await mubiGet(caminho, query);
    const linhas = itens(bruto);
    const t = total(bruto);
    console.log(`\n### ${caminho}  — ${nota}`);
    console.log(`   RESPONDEU · ${linhas.length} nesta pagina · total: ${t ?? "(sem paginacao)"}`);
    if (!linhas.length) {
      // Zero aqui e um achado, nao um erro -- desde que o controle tenha passado.
      console.log("   >>> VAZIO: o recurso existe mas nao tem dado no periodo/conta.");
      return { caminho, ok: true, qtd: 0, total: t };
    }
    const r = linhas[0];
    console.log(`   ${Object.keys(r).length} campos:`);
    for (const [k, v] of Object.entries(r)) console.log(`     ${k.padEnd(26)} ${forma(v)}`);
    return { caminho, ok: true, qtd: linhas.length, total: t, campos: Object.keys(r) };
  } catch (e) {
    const msg = String(e?.message || e).replace(/[A-Za-z0-9_-]{20,}/g, "***");
    console.log(`\n### ${caminho}  — ${nota}`);
    console.log(`   FALHOU · ${msg}`);
    return { caminho, ok: false, erro: msg };
  }
}

if (!mubiConfigurado()) {
  console.error("Faltam MUBI_BASE_URL, MUBI_PUBLIC_KEY ou MUBI_TOKEN no ambiente.");
  process.exit(1);
}

console.log(`Sondando ${ALVOS.length} recursos · janela ${inicial} a ${final}`);
const res = [];
for (const [c, q, n] of ALVOS) res.push(await sondar(c, q, n));

// Encadeados: so da para pedir depois de saber um id real.
const grupo = res.find((r) => r.caminho === "funil-vendas-grupo");
if (grupo?.qtd) {
  const g = itens(await mubiGet("funil-vendas-grupo", PG))[0];
  const gid = g?.id;
  if (gid != null) {
    res.push(await sondar(`funil-vendas-fase/grupo/${gid}`, {}, `fases do grupo ${gid}`));
    res.push(await sondar("funil-vendas-card",
      { grupo_id: gid, fase_id: 0, status: "ATIVO", ...PG },
      "cards — fase_id=0 so para ver se o filtro e mesmo obrigatorio"));
  }
}

/* ── QUANTAS O.S EM PRODUCAO EXISTEM, DE VERDADE? ────────────────────────
   A importacao do PCP busca `status=PRODUCAO` com `filtrodata=CADASTRO` numa
   janela de 180 dias. Uma O.S que o ERP mantem em producao e que foi
   cadastrada antes disso NUNCA e buscada -- some da conta sem erro nenhum.
   O dono viu 148 no Mubi contra 138 no PCP e confirmou: ha pedido em aberto
   com mais de 180 dias.

   Aqui a janela e medida, nao adivinhada: a mesma consulta em quatro larguras.
   Se o total crescer conforme a janela abre, a diferenca E a janela -- e o
   numero de quanto ela esconde sai junto. */
console.log("\n============ O.S EM PRODUCAO POR LARGURA DE JANELA ============");
const larguras = [
  ["180 dias (o que o PCP usa hoje)", 180],
  ["1 ano", 365],
  ["2 anos", 730],
  ["5 anos", 1825],
];
let anterior = null;
for (const [rotulo, dias] of larguras) {
  const de = iso(new Date(hoje.getTime() - dias * 864e5));
  try {
    const bruto = await mubiGet("ordem-servico",
      { status: "PRODUCAO", filtrodata: "CADASTRO", datainicial: de, datafinal: final, page: 1, per_page: 1 });
    const t = total(bruto);
    const a_mais = anterior != null && t != null ? ` (+${t - anterior} em relacao a anterior)` : "";
    console.log(`  ${rotulo.padEnd(34)} desde ${de}: ${t ?? "(sem paginacao)"}${a_mais}`);
    if (t != null) anterior = t;
  } catch (e) {
    console.log(`  ${rotulo.padEnd(34)} FALHOU: ${String(e?.message || e).replace(/[A-Za-z0-9_-]{20,}/g, "***")}`);
  }
}
// E sem filtro de data nenhum: o ERP aceita? Se aceitar, a janela e desnecessaria.
try {
  const bruto = await mubiGet("ordem-servico", { status: "PRODUCAO", page: 1, per_page: 1 });
  console.log(`  ${"sem filtro de data".padEnd(34)} ${total(bruto) ?? "(sem paginacao)"} -- o ERP ACEITA sem janela`);
} catch (e) {
  console.log(`  ${"sem filtro de data".padEnd(34)} recusado: ${String(e?.message || e).replace(/[A-Za-z0-9_-]{20,}/g, "***")}`);
}

console.log("\n================ RESUMO ================");
for (const r of res) {
  const est = !r.ok ? "FALHOU" : r.qtd === 0 ? "vazio" : `${r.total ?? r.qtd} registros`;
  console.log(`  ${r.caminho.padEnd(34)} ${est}`);
}
const controle = res.find((r) => r.caminho === "ordem-servico");
if (!controle?.qtd) {
  console.log("\n!! O CONTROLE veio vazio/falhou. Nenhum 'vazio' acima vale como");
  console.log("   resultado: primeiro conferir credencial e janela de datas.");
}
