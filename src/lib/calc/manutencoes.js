// Manutenção: o que a empresa gasta para as coisas continuarem funcionando --
// os carros, as máquinas da produção e o prédio (câmeras, ar condicionado,
// elétrica, hidráulica, portões).
//
// O valor deste módulo NÃO é listar serviços feitos: é responder três coisas
// que hoje ninguém sabe responder sem procurar nota fiscal na gaveta.
//
//   1. Quanto isso está me custando? (mês, ano, e POR ITEM)
//   2. Qual item está comendo dinheiro? (o carro velho que vai ao mecânico
//      todo mês custa mais que a parcela de um novo -- só dá para ver somando)
//   3. O que está atrasado? (a limpeza do ar condicionado que ninguém lembra
//      até a sala esquentar)
//
// Por isso tudo aqui gira em torno de SOMA POR ITEM e PRÓXIMA DATA.

import { diasEntre } from "../format.js";

// As três famílias de coisa que recebem manutenção. Todas moram na MESMA
// coleção de ativos que a tela "Documentos e ativos" usa -- cadastrar por aqui
// cria o registro lá também, e não uma segunda verdade sobre o mesmo carro.
export const FAMILIAS = {
  veiculo: { rotulo: "Veículos", singular: "Veículo" },
  maquina: { rotulo: "Máquinas", singular: "Máquina" },
  predial: { rotulo: "Prédio", singular: "Item do prédio" },
};

// Sugestões de categoria por família -- e o campo aceita texto livre, porque
// nenhuma lista cobre o que aparece numa oficina de comunicação visual.
export const CATEGORIAS_PREDIAL = [
  "Câmeras / CFTV",
  "Ar condicionado",
  "Elétrica",
  "Hidráulica",
  "Portão / automatizador",
  "Alarme",
  "Rede e internet",
  "Combate a incêndio",
  "Estrutura e telhado",
  "Pintura",
  "Compressor",
  "Exaustão",
  "Iluminação",
  "Móvel / bancada",
];

// Estas categorias descrevem O QUE O ITEM É, não o serviço que ele recebeu --
// o serviço tem campo próprio no lançamento (TIPOS_SERVICO + "O que foi feito").
// IPVA, licenciamento e seguro ficaram DE FORA de propósito: são documentos com
// vencimento, moram na tela "Documentos e ativos", e o próprio formulário daqui
// diz isso -- oferecê-los na lista era contradizer o aviso logo abaixo.
export const CATEGORIAS_VEICULO = [
  "Carro de passeio",
  "Utilitário / picape",
  "Van",
  "Caminhão",
  "Moto",
  "Reboque / carreta",
];

export const CATEGORIAS_MAQUINA = [
  "Impressora digital",
  "Impressora UV",
  "DTF UV",
  "Plotter de recorte",
  "Router CNC",
  "Laser CO2",
  "Laser fibra",
  "Seccionadora",
  "Dobradeira",
  "Solda",
  "Compressor",
  "Cabine de pintura",
];

export const CATEGORIAS_POR_FAMILIA = {
  veiculo: CATEGORIAS_VEICULO,
  maquina: CATEGORIAS_MAQUINA,
  predial: CATEGORIAS_PREDIAL,
};

// Os setores da casa, para dizer ONDE a máquina fica. Lista fechada de
// sugestão (o campo aceita texto livre): serve para o gasto por setor bater
// com o resto da empresa em vez de virar "producao", "Produção" e "PROD".
export const SETORES = [
  "Impressão digital e recorte",
  "DTF UV e brindes",
  "Corte de chapas e usinagem",
  "Metalurgia",
  "Pintura",
  "Montagem de letras",
  "Portas de ACM",
  "Acabamento",
  "Instalação de placas",
  "PCP e Expedição",
  "Compras e almoxarifado",
  "Arte-final e pré-impressão",
  "Administrativo",
  "Manutenção",
];

// ---------------------------------------------------------------- especificação
//
// A ficha técnica de cada família. Um carro não tem número de série e uma
// câmera não tem placa: um formulário só, com todos os campos, obriga a pessoa
// a pular linha em branco e ninguém preenche.
//
// Tudo vive num ÚNICO campo do ativo (`especificacao`, um objeto), e não em
// colunas soltas: o mesmo registro serve documento, licitação e marketing, e
// espalhar `placa` no shape de todos deixaria sete campos vazios em cada um.
//
// Espelhado em supabase/functions/painel-ativos/index.ts (ESPEC_PERMITIDA) --
// o servidor descarta chave que não esteja lá. Mexeu aqui, mexe lá.
export const ESPEC_CAMPOS = {
  veiculo: [
    { id: "placa", rotulo: "Placa", ph: "ABC1D23", curto: true, maiusculo: true },
    { id: "marcaModelo", rotulo: "Marca e modelo", ph: "Fiat Strada Endurance" },
    { id: "ano", rotulo: "Ano", ph: "2021", curto: true },
    { id: "cor", rotulo: "Cor", ph: "branca", curto: true },
    { id: "combustivel", rotulo: "Combustível", opcoes: ["Flex", "Gasolina", "Etanol", "Diesel", "Elétrico", "GNV"] },
    { id: "renavam", rotulo: "Renavam", ph: "só números" },
    { id: "chassi", rotulo: "Chassi", ph: "17 caracteres", maiusculo: true },
  ],
  maquina: [
    { id: "fabricante", rotulo: "Fabricante", ph: "Ampla, MyPrint, Bodor..." },
    { id: "modelo", rotulo: "Modelo", ph: "laser fibra 1530" },
    { id: "numeroSerie", rotulo: "Número de série", ph: "da plaqueta da máquina" },
    { id: "ano", rotulo: "Ano", ph: "2022", curto: true },
    { id: "setor", rotulo: "Setor onde fica", opcoes: SETORES },
    { id: "potencia", rotulo: "Potência / tensão", ph: "220 V · 3 kW" },
  ],
  predial: [
    { id: "local", rotulo: "Local", ph: "galpão 1, mezanino, portaria" },
    { id: "marcaModelo", rotulo: "Marca e modelo", ph: "Intelbras VHD 1220" },
    { id: "quantidade", rotulo: "Quantidade", ph: "4", curto: true },
    { id: "instalacao", rotulo: "Instalado em", data: true },
  ],
};

// Só o que o usuário preencheu, na ordem da ficha -- para a linha do item
// mostrar "ABC1D23 · Fiat Strada · 2021" sem separador solto no fim.
export function resumoEspec(item) {
  const campos = ESPEC_CAMPOS[item?.tipo] || [];
  const e = item?.especificacao || {};
  return campos
    .map((c) => String(e[c.id] ?? "").trim())
    .filter(Boolean);
}

// Km para carro, horas para máquina. O prédio não tem medidor nenhum: uma
// câmera não roda hora nem quilômetro, e perguntar "horas na data" para ela era
// pedir um número que não existe.
export const UNIDADE_PADRAO = { veiculo: "km", maquina: "horas", predial: "" };
export function unidadeDe(item) {
  if (!item) return "";
  return item.unidadeMedidor || UNIDADE_PADRAO[item.tipo] || "";
}

export const TIPOS_SERVICO = {
  preventiva: { rotulo: "Preventiva", ajuda: "antes de quebrar" },
  corretiva: { rotulo: "Corretiva", ajuda: "quebrou e consertou" },
  troca: { rotulo: "Troca de peça", ajuda: "substituiu componente" },
  instalacao: { rotulo: "Instalação", ajuda: "coisa nova" },
  vistoria: { rotulo: "Vistoria", ajuda: "só olhou e laudou" },
};

const soNumero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Situação da PRÓXIMA manutenção de um item. Sem data prevista não inventamos
// urgência: "sem previsão" é um estado honesto, não um alerta.
export function situacaoProxima(proximaISO, hojeISO) {
  if (!proximaISO) return { nivel: "sem", rotulo: "sem previsão", dias: null };
  const dias = diasEntre(hojeISO, proximaISO);
  if (dias < 0) return { nivel: "vencida", rotulo: `atrasada ${-dias} ${-dias === 1 ? "dia" : "dias"}`, dias };
  if (dias === 0) return { nivel: "vencida", rotulo: "é hoje", dias };
  if (dias <= 30) return { nivel: "perto", rotulo: `em ${dias} ${dias === 1 ? "dia" : "dias"}`, dias };
  return { nivel: "ok", rotulo: `em ${dias} dias`, dias };
}

// Junta itens (ativos) com os lançamentos de manutenção.
//
// `itens`   -- do painel-ativos, filtrados pelas famílias daqui
// `mapa`    -- {id: lançamento} do painel-config (chave "manutencoes")
// `hojeISO` -- dia local
export function calcManutencoes(itens, mapa, hojeISO) {
  const lancamentos = Object.entries(mapa || {})
    .map(([id, m]) => ({ ...m, id, valor: soNumero(m?.valor) }))
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));

  const ano = String(hojeISO).slice(0, 4);
  const mes = String(hojeISO).slice(0, 7);

  const porItem = new Map();
  for (const l of lancamentos) {
    const chave = l.ativoId || "(sem item)";
    if (!porItem.has(chave)) porItem.set(chave, []);
    porItem.get(chave).push(l);
  }

  // Início da janela de 12 meses (data local, nunca UTC).
  const jan = new Date();
  jan.setMonth(jan.getMonth() - 12);
  const inicioJanela = `${jan.getFullYear()}-${String(jan.getMonth() + 1).padStart(2, "0")}-${String(jan.getDate()).padStart(2, "0")}`;

  const lista = (itens || []).map((it) => {
    const hist = porItem.get(it.id) || [];
    const total = hist.reduce((s, l) => s + l.valor, 0);
    const noAno = hist.filter((l) => String(l.data || "").startsWith(ano)).reduce((s, l) => s + l.valor, 0);
    /* ÚLTIMOS 12 MESES, e não "no ano". Em 2 de janeiro o gasto do ano zera e a
       tela esquece tudo -- justamente na semana de decidir orçamento e troca de
       veículo. A janela móvel responde a pergunta que se faz o ano inteiro:
       quanto este carro me custou nos últimos doze meses? */
    const doze = hist
      .filter((l) => String(l.data || "") >= inicioJanela)
      .reduce((s, l) => s + l.valor, 0);
    const ultima = hist[0] || null;
    // A próxima é a MAIOR data prevista entre os lançamentos: marcar a próxima
    // num lançamento antigo não pode ressuscitar um alerta já resolvido por um
    // lançamento mais novo.
    const proxima = hist
      .map((l) => l.proxima)
      .filter(Boolean)
      .sort()
      .pop() || "";
    return {
      ...it,
      familia: it.tipo,
      historico: hist,
      quantos: hist.length,
      total,
      noAno,
      doze,
      ultima,
      proxima,
      sit: situacaoProxima(proxima, hojeISO),
    };
  });

  // Lançamento cujo item foi apagado não pode sumir do total: o dinheiro saiu
  // do caixa de qualquer jeito. Ele aparece agrupado em "item removido".
  const idsConhecidos = new Set((itens || []).map((i) => i.id));
  const orfaos = lancamentos.filter((l) => !idsConhecidos.has(l.ativoId));

  const soma = (ls) => ls.reduce((s, l) => s + l.valor, 0);
  const doMes = lancamentos.filter((l) => String(l.data || "").startsWith(mes));
  const doAno = lancamentos.filter((l) => String(l.data || "").startsWith(ano));

  // Ranking: quem mais consumiu no ano. É a conta que justifica trocar um
  // veículo ou renegociar um contrato de assistência.
  const ranking = lista
    .filter((i) => i.noAno > 0)
    .sort((a, b) => b.noAno - a.noAno)
    .slice(0, 5);

  return {
    lista,
    orfaos,
    lancamentos,
    kpis: {
      gastoMes: soma(doMes),
      gastoAno: soma(doAno),
      lancamentosAno: doAno.length,
      itens: lista.length,
      atrasadas: lista.filter((i) => i.sit.nivel === "vencida").length,
      proximas: lista.filter((i) => i.sit.nivel === "perto").length,
      semPrevisao: lista.filter((i) => i.sit.nivel === "sem").length,
    },
    ranking,
    // Agenda do que vem: vencidas primeiro, depois as mais próximas.
    agenda: lista
      .filter((i) => i.sit.dias !== null)
      .sort((a, b) => a.sit.dias - b.sit.dias)
      .slice(0, 8),
  };
}

// ---------------------------------------------------------------- histórico
//
// A pergunta que esta parte responde é outra: não "quanto custa este carro",
// e sim "quanto a empresa gastou em manutenção em cada mês de cada ano".
//
// DUAS REGRAS DECLARADAS, porque somar dinheiro em silêncio é como se erra:
//
//   1. Lançamento de item já retirado ENTRA na soma do período. O dinheiro saiu
//      do caixa; escondê-lo faria o total do ano do histórico não bater com o
//      cartão "Gasto no ano" da mesma tela.
//   2. Lançamento SEM data não pode entrar em mês nenhum -- mas também não
//      desaparece: volta em `semData`, para a tela poder cobrar o conserto em
//      vez de o valor sumir sem nunca ter sido contado.

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function rotuloMes(mesISO) {
  const n = Number(String(mesISO).slice(5, 7));
  return MESES[n - 1] || mesISO;
}

export function agruparGastos(lancamentos, itens) {
  const familiaDe = new Map((itens || []).map((i) => [i.id, i.tipo]));
  const nomeDe = new Map((itens || []).map((i) => [i.id, i.nome]));

  const semData = [];
  const anos = new Map();

  for (const l of lancamentos || []) {
    const valor = soNumero(l.valor);
    const data = String(l.data || "");
    if (!/^\d{4}-\d{2}/.test(data)) {
      semData.push(l);
      continue;
    }
    const ano = data.slice(0, 4);
    const mes = data.slice(0, 7);
    // Item retirado: cai em "removidos", que é uma família à parte -- somar
    // junto com "Prédio" inventaria um gasto predial que ninguém lançou.
    const fam = familiaDe.get(l.ativoId) || "removido";
    const nome = nomeDe.get(l.ativoId) || l.ativoNome || "(item retirado)";

    if (!anos.has(ano)) {
      anos.set(ano, {
        ano, total: 0, quantos: 0,
        meses: new Map(),
        porFamilia: { veiculo: 0, maquina: 0, predial: 0, removido: 0 },
        porItem: new Map(),
      });
    }
    const a = anos.get(ano);
    a.total += valor;
    a.quantos += 1;
    a.porFamilia[fam] = (a.porFamilia[fam] || 0) + valor;

    if (!a.meses.has(mes)) {
      a.meses.set(mes, {
        mes, rotulo: rotuloMes(mes), total: 0, quantos: 0, lancamentos: [],
        porFamilia: { veiculo: 0, maquina: 0, predial: 0, removido: 0 },
      });
    }
    const m = a.meses.get(mes);
    m.total += valor;
    m.quantos += 1;
    m.porFamilia[fam] = (m.porFamilia[fam] || 0) + valor;
    m.lancamentos.push(l);

    const chaveItem = l.ativoId || "(sem item)";
    if (!a.porItem.has(chaveItem)) a.porItem.set(chaveItem, { id: chaveItem, nome, familia: fam, total: 0, quantos: 0 });
    const pi = a.porItem.get(chaveItem);
    pi.total += valor;
    pi.quantos += 1;
  }

  const lista = [...anos.values()]
    .map((a) => ({
      ...a,
      // Ordem do ano corrente para trás dentro do ano: dezembro em cima é o que
      // se procura em janeiro seguinte, e a tabela é lida de cima.
      meses: [...a.meses.values()].sort((x, y) => y.mes.localeCompare(x.mes))
        .map((m) => ({ ...m, lancamentos: m.lancamentos.slice().sort((x, y) => String(y.data).localeCompare(String(x.data))) })),
      porItem: [...a.porItem.values()].sort((x, y) => y.total - x.total),
      // Média mensal só sobre os meses que TIVERAM gasto: dividir por 12 num
      // ano que começou em agosto mente para baixo.
      mediaMes: a.meses.size ? a.total / a.meses.size : 0,
    }))
    .sort((x, y) => y.ano.localeCompare(x.ano));

  return {
    anos: lista,
    semData: { quantos: semData.length, total: semData.reduce((s, l) => s + soNumero(l.valor), 0), lancamentos: semData },
    total: lista.reduce((s, a) => s + a.total, 0),
  };
}
