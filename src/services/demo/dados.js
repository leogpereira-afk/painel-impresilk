// Dados de exemplo coerentes para uma empresa de comunicacao visual.
// Usados quando MODO_DEMO esta ligado (sem chave do Mubi).
//
// DETERMINISMO: cada gerador usa o SEU proprio RNG semeado e tudo e calculado
// UMA vez no carregamento do modulo. Assim, a ordem/quantidade de chamadas dos
// getters (que sao async) nao altera os numeros, e cada recarga da pagina mostra
// exatamente os mesmos valores. Datas ancoradas no dia de hoje para os atrasos
// ficarem realistas.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function maisDias(dias) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return ymd(d);
}
const HOJE = new Date();
const ANO = HOJE.getFullYear();

// ---------------------------------------------------------------- clientes
const CLIENTES = [
  "Padaria Trigo de Ouro Ltda",
  "AutoCenter Veloz ME",
  "Restaurante Sabor da Terra",
  "Clinica Vida Plena",
  "Construtora Alvorada",
  "Mercado Bom Preco",
  "Academia Corpo em Forma",
  "Otica Visao Clara",
  "Farmacia Saude Total",
  "Escola Pequeno Principe",
  "Pet Shop Amigo Fiel",
  "Imobiliaria Chave Certa",
  "Hamburgueria do Chef",
  "Salao Beleza Pura",
].map((nome, i) => ({
  id: `cli-${i + 1}`,
  nome,
  cnpj: `${10 + i}.${String(100 + i)}.${String(200 + i)}/0001-${String(30 + i)}`,
}));

// ---------------------------------------------------------------- produtos
export const PRODUTOS = [
  { id: "adesivo-perf", nome: "Adesivo perfurado", categoria: "Adesivo" },
  { id: "adesivo-recorte", nome: "Adesivo recorte", categoria: "Adesivo" },
  { id: "dtf-uv", nome: "DTF UV", categoria: "Impressao" },
  { id: "lona-banner", nome: "Lona banner", categoria: "Impressao" },
  { id: "placa-acm", nome: "Placa ACM", categoria: "Rigido" },
  { id: "brinde-premium", nome: "Brinde premium", categoria: "Brinde" },
];

// ---------------------------------------------------- contas a receber (recebiveis)
// [clienteIdx, diasAtraso, valor, motivo, cobrado]
const VENCIDOS = [
  [0, 3, 1850, "esquecimento", false],
  [0, 34, 4200, "esquecimento", true],
  [1, 8, 2600, "sem-contato", false],
  [2, 12, 3400, "arte", false],
  [3, 5, 1200, "boleto", false],
  [4, 62, 18800, "verba", true],
  [4, 41, 9600, "disputa", false],
  [5, 19, 5400, "nf", false],
  [6, 27, 2100, "sem-contato", false],
  [7, 2, 980, "esquecimento", false],
  [8, 48, 7300, "verba", true],
  [8, 15, 3100, "refacao", false],
  [9, 71, 12400, "sem-contato", true],
  [9, 9, 2450, "instalacao", false],
  [10, 22, 1650, "boleto", false],
  [11, 55, 8900, "disputa", true],
  [12, 6, 1400, "erro-pedido", false],
  [13, 38, 4750, "nf", false],
];
// [clienteIdx, diasAte, valor]
const A_VENCER = [
  [2, 2, 5200],
  [5, 4, 3800],
  [1, 6, 2400],
  [7, 8, 6100],
  [3, 11, 1900],
  [12, 13, 4300],
  [6, 18, 2700],
  [10, 24, 5600],
];

function construirRecebiveis() {
  let nf = 4820;
  let os = 15230;
  const vencidos = VENCIDOS.map(([ci, dias, valor], i) => {
    const c = CLIENTES[ci];
    return {
      id: `rec-v-${i + 1}`,
      cliente: c.nome,
      cnpj: c.cnpj,
      nf: String(nf++),
      os: String(os++),
      valor,
      emissao: maisDias(-(dias + 30)),
      vencimento: maisDias(-dias),
      situacao: "aberto",
    };
  });
  const aVencer = A_VENCER.map(([ci, dias, valor], i) => {
    const c = CLIENTES[ci];
    return {
      id: `rec-f-${i + 1}`,
      cliente: c.nome,
      cnpj: c.cnpj,
      nf: String(nf++),
      os: String(os++),
      valor,
      emissao: maisDias(-(20 - dias)),
      vencimento: maisDias(dias),
      situacao: "aberto",
    };
  });
  return [...vencidos, ...aVencer];
}

// ---------------------------------------------------- contas a pagar + provisoes
function construirPagar() {
  const saidas = [];
  let id = 1;
  const add = (descricao, categoria, valor, dias, tipo) =>
    saidas.push({ id: `pag-${id++}`, descricao, categoria, valor, vencimento: maisDias(dias), tipo });

  add("Fornecedor de lona e vinil", "Insumos", 9800, 2, "pagar");
  add("Tintas e cartuchos", "Insumos", 4200, 5, "pagar");
  add("Chapas de ACM", "Insumos", 7600, 9, "pagar");
  add("Manutencao do plotter", "Manutencao", 1800, 12, "pagar");
  add("Fretes e entregas", "Logistica", 2300, 3, "pagar");
  add("Fornecedor de brindes", "Insumos", 5400, 16, "pagar");
  add("Material de instalacao", "Insumos", 3100, 21, "pagar");
  add("Aluguel do galpao", "Despesa fixa", 8500, 5, "provisao");
  add("Energia eletrica", "Despesa fixa", 3900, 8, "provisao");
  add("Internet e telefonia", "Despesa fixa", 620, 10, "provisao");
  add("Contabilidade", "Despesa fixa", 1400, 15, "provisao");
  add("Software e assinaturas", "Despesa fixa", 890, 20, "provisao");
  add("Cartao de credito corporativo", "Cartao", 6700, 7, "provisao");
  add("Folha de pagamento", "Folha", 42000, 5, "provisao");
  add("Vale transporte e beneficios", "Folha", 5200, 5, "provisao");
  add("FGTS e encargos", "Folha", 7800, 20, "provisao");
  return saidas;
}

const BANCOS = [
  { id: "cb-1", banco: "Banco do Brasil", conta: "12.345-6", saldo: 38400 },
  { id: "cb-2", banco: "Sicoob", conta: "98.765-4", saldo: 19850 },
  { id: "cb-3", banco: "Caixa (aplicacao)", conta: "55.221-0", saldo: 12000 },
];

// ---------------------------------------------------------------- orcamentos
const VENDEDORES_DEMO = ["v-ana", "v-carlos", "v-fernanda", "v-diego"];
const MOTIVOS_PERDA_DEMO = ["preco", "prazo", "concorrencia", "sem-retorno", "cancelado", "escopo"];

function construirOrcamentos() {
  const rnd = mulberry32(918273); // RNG proprio: nao compartilha estado
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const lista = [];
  let numero = 3100;
  const mesAtual = HOJE.getMonth();
  for (let m = 0; m <= mesAtual; m++) {
    const qtdMes = 6 + Math.floor(rnd() * 4);
    for (let k = 0; k < qtdMes; k++) {
      const c = pick(CLIENTES);
      const vendedorId = pick(VENDEDORES_DEMO);
      const valor = 2000 + Math.floor(rnd() * 22000);
      const diaEnvio = 1 + Math.floor(rnd() * 26);
      const dataEnvio = `${ANO}-${String(m + 1).padStart(2, "0")}-${String(diaEnvio).padStart(2, "0")}`;
      const r = rnd();
      let situacao, dataFechamento, motivoPerdaId;
      const ehMesCorrente = m === mesAtual;
      if (!ehMesCorrente) {
        if (r < 0.46) situacao = "ganho";
        else if (r < 0.78) {
          situacao = "perdido";
          motivoPerdaId = pick(MOTIVOS_PERDA_DEMO);
        } else situacao = "aberto";
      } else {
        situacao = r < 0.25 ? "ganho" : r < 0.4 ? "perdido" : "aberto";
        if (situacao === "perdido") motivoPerdaId = pick(MOTIVOS_PERDA_DEMO);
      }
      if (situacao !== "aberto") {
        const diaF = Math.min(28, diaEnvio + 3 + Math.floor(rnd() * 12));
        dataFechamento = `${ANO}-${String(m + 1).padStart(2, "0")}-${String(diaF).padStart(2, "0")}`;
      }
      lista.push({
        id: `orc-${numero}`,
        numero: String(numero++),
        cliente: c.nome,
        vendedorId,
        valor,
        situacao,
        dataEnvio,
        dataFechamento: dataFechamento || null,
        _motivoPerdaSemente: motivoPerdaId || null,
      });
    }
  }
  return lista;
}

// ---------------------------------------------------- ordens de servico (itens)
const BASE_MENSAL = {
  "adesivo-perf": 14000,
  "adesivo-recorte": 9000,
  "dtf-uv": 6000,
  "lona-banner": 16000,
  "placa-acm": 12000,
  "brinde-premium": 5000,
};
const TENDENCIA = {
  "adesivo-perf": 1.01,
  "adesivo-recorte": 1.0,
  "dtf-uv": 1.14,
  "lona-banner": 0.9,
  "placa-acm": 1.02,
  "brinde-premium": 1.03,
};
const PRECO_UNIT = {
  "adesivo-perf": 120,
  "adesivo-recorte": 90,
  "dtf-uv": 60,
  "lona-banner": 180,
  "placa-acm": 320,
  "brinde-premium": 25,
};

function construirOrdens() {
  const rnd = mulberry32(556677); // RNG proprio
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ordens = [];
  let numero = 15230;
  const mesAtual = HOJE.getMonth();
  for (let m = 0; m <= mesAtual; m++) {
    for (const p of PRODUTOS) {
      const fatMes = Math.round(BASE_MENSAL[p.id] * Math.pow(TENDENCIA[p.id], m) * (0.92 + rnd() * 0.16));
      const nOS = 2 + Math.floor(rnd() * 3);
      let resto = fatMes;
      for (let k = 0; k < nOS; k++) {
        const ultimo = k === nOS - 1;
        const fatItem = ultimo ? resto : Math.round(fatMes / nOS);
        resto -= fatItem;
        if (fatItem <= 0) continue;
        const qtd = Math.max(1, Math.round(fatItem / PRECO_UNIT[p.id]));
        const dia = 2 + Math.floor(rnd() * 25);
        const data = `${ANO}-${String(m + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const c = pick(CLIENTES);
        ordens.push({
          id: `os-${numero}`,
          numero: String(numero++),
          cliente: c.nome,
          data,
          itens: [
            {
              produtoId: p.id,
              produto: p.nome,
              categoria: p.categoria,
              quantidade: qtd,
              valorUnit: PRECO_UNIT[p.id],
              valorTotal: fatItem,
            },
          ],
        });
      }
    }
  }
  return ordens;
}

// ---------------------------------------------------------------- calcula UMA vez
const RECEBIVEIS = construirRecebiveis();
const PAGAR = construirPagar();
const ORCAMENTOS = construirOrcamentos();
const ORDENS = construirOrdens();

// ---------------------------------------------------------------- getters
export function getRecebiveis() {
  return RECEBIVEIS;
}
export function getPagar() {
  return PAGAR;
}
export function getContasBancarias() {
  return BANCOS;
}
export function getOrcamentos() {
  // Remove o campo interno de semente antes de entregar (o Mubi nao tem motivo).
  return ORCAMENTOS.map(({ _motivoPerdaSemente, ...o }) => o);
}
export function getOrdensServico() {
  return ORDENS;
}

// Sementes das marcacoes manuais (o Mubi nao guarda motivo/cobrado).
export function getSeedOverridesRecebiveis() {
  const seed = {};
  VENCIDOS.forEach(([, , , motivo, cobrado], i) => {
    seed[`rec-v-${i + 1}`] = { motivoId: motivo, cobrado, observacao: "" };
  });
  return seed;
}
export function getSeedOverridesOrcamentos() {
  const seed = {};
  for (const o of ORCAMENTOS) {
    if (o.situacao === "perdido") seed[o.id] = { motivoPerdaId: o._motivoPerdaSemente };
  }
  return seed;
}
