// ============================================================================
// Trava do FLUXO REALIZADO mes a mes.
//
// POR QUE ISTO EXISTE: a regra que importa aqui nao esta a vista. Um titulo
// pode ser pago em PARCELAS, em meses diferentes, e o valor real de cada
// pagamento mora em `pagamentos[]` -- o `valor_pagamento` do topo perde as
// parcelas e as vezes vem ZERADO. Quem reescrever isto olhando so o campo do
// topo faz o grafico do Fluxo mentir sem nenhum erro aparecer.
//
// A rotina original ficou parada meses depois da migracao Netlify->Supabase e
// ninguem percebeu, porque grafico congelado nao da erro: so para de andar.
//
//   node scripts/conferir-realizado.mjs
// ============================================================================
process.env.MUBI_BASE_URL ||= "https://exemplo.invalido/api";
process.env.MUBI_PUBLIC_KEY ||= "pk-de-teste";
process.env.MUBI_TOKEN ||= "tk-de-teste";

const ANO = 2026;

// Titulos de mentira que reproduzem os casos reais do ERP.
const RECEBER = [
  // 1) Pago em DUAS parcelas, em meses diferentes. O topo vem ZERADO -- se
  //    alguem somar `valor_pagamento`, este titulo some inteiro do grafico.
  { valor_pagamento: 0, pagamentos: [
      { data_pagamento: "2026-01-10", valor: 1000 },
      { data_pagamento: "2026-02-10", valor: 500 },
  ] },
  // 2) Pagamento unico no array.
  { pagamentos: [{ data_pagamento: "2026-01-20", valor: 300 }] },
  // 3) SEM o array: cai no campo do topo (formato antigo do ERP).
  { data_pagamento: "2026-02-05", valor_pagamento: 250 },
  // 4) Pago em ano ANTERIOR: nao pode entrar em 2026.
  { pagamentos: [{ data_pagamento: "2025-12-30", valor: 9999 }] },
  // 5) Alguns registros usam data_credito em vez de data_pagamento.
  { pagamentos: [{ data_credito: "2026-03-01", valor: 700 }] },
];
// As saidas levam centro de custo: e por ele que a tela de Manutencoes acha o
// gasto de manutencao no ERP (nao ha placa nem numero de pedido no titulo).
const PAGAR = [
  { centro_custo: "Manutencao de Veiculos", pagamentos: [{ data_pagamento: "2026-01-15", valor: 400 }] },
  { centro_custo: "2.02 Administrativo", pagamentos: [{ data_pagamento: "2026-02-15", valor: 100 }] },
  // Titulo SEM centro de custo: nao pode derrubar a etapa nem virar categoria "".
  { pagamentos: [{ data_pagamento: "2026-02-20", valor: 50 }] },
];

globalThis.fetch = async (url) => {
  const u = new URL(url);
  const alvo = u.pathname.includes("contas-receber") ? RECEBER : PAGAR;
  return { status: 201, ok: true, json: async () => ({ data: alvo }) };
};

const { etapaRealizado } = await import("../netlify/functions/mubi-cache-background.mjs");

const r = await etapaRealizado(ANO, null);
const ent = r.valor?.anos?.[ANO]?.entradas ?? {};
const sai = r.valor?.anos?.[ANO]?.saidas ?? {};
const cats = r.valor?.anos?.[ANO]?.saidasPorCategoria ?? {};

const CASOS = [
  ["parcela de janeiro entra em janeiro", ent["2026-01"], 1300],   // 1000 + 300
  ["a SEGUNDA parcela cai em fevereiro", ent["2026-02"], 750],     // 500 + 250
  ["data_credito tambem conta", ent["2026-03"], 700],
  ["pagamento de 2025 NAO entra em 2026", ent["2025-12"], undefined],
  ["saidas de janeiro", sai["2026-01"], 400],
  ["saidas de fevereiro", sai["2026-02"], 150],
  // Manutencoes le daqui. Sem estes casos, quebrar a agregacao por centro de
  // custo passava verde na CI e a tela mostrava R$ 0 sem ninguem notar.
  ["centro de custo de manutencao separado", cats["Manutencao de Veiculos"]?.["2026-01"], 400],
  ["centro de custo que nao e manutencao continua la", cats["2.02 Administrativo"]?.["2026-02"], 100],
  ["titulo sem centro de custo nao vira categoria vazia", cats[""], undefined],
];

let falhas = 0;
for (const [nome, obtido, esperado] of CASOS) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "  ok    " : "  FALHOU"}  ${nome.padEnd(38)} obtido=${obtido} esperado=${esperado}`);
}

// A forma que a tela consome (src/services/mubi.js -> { anos, disponiveis }).
const formaOk = Array.isArray(r.valor?.disponiveis) && r.valor.disponiveis.includes(ANO) && !!r.valor.em;
if (!formaOk) falhas++;
console.log(`${formaOk ? "  ok    " : "  FALHOU"}  devolve { em, anos, disponiveis } como a tela espera`);

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log(`\n${CASOS.length + 1} casos ok -- o realizado soma por PARCELA, nao pelo campo do topo.`);
