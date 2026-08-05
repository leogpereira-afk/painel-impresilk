// Manutencao: o que a empresa gasta para as coisas continuarem funcionando --
// os carros, as maquinas da producao e o predio (cameras, ar condicionado,
// eletrica, hidraulica, portoes).
//
// O valor deste modulo NAO e listar servicos feitos: e responder tres coisas
// que hoje ninguem sabe responder sem procurar nota fiscal na gaveta.
//
//   1. Quanto isso esta me custando? (mes, ano, e POR ITEM)
//   2. Qual item esta comendo dinheiro? (o carro velho que vai ao mecanico
//      todo mes custa mais que a parcela de um novo -- so da para ver somando)
//   3. O que esta atrasado? (a limpeza do ar condicionado que ninguem lembra
//      ate a sala esquentar)
//
// Por isso tudo aqui gira em torno de SOMA POR ITEM e PROXIMA DATA.

import { diasEntre } from "../format.js";

// As tres familias de coisa que recebem manutencao. Veiculo e maquina ja moram
// em "Documentos e ativos" (nao duplicamos cadastro); predial nasce aqui.
export const FAMILIAS = {
  veiculo: { rotulo: "Veiculos", singular: "Veiculo" },
  maquina: { rotulo: "Maquinas", singular: "Maquina" },
  predial: { rotulo: "Predio", singular: "Item do predio" },
};

// Sugestoes de categoria para o predio -- e o campo aceita texto livre, porque
// nenhuma lista cobre o que aparece numa oficina de comunicacao visual.
export const CATEGORIAS_PREDIAL = [
  "Cameras / CFTV",
  "Ar condicionado",
  "Eletrica",
  "Hidraulica",
  "Portao / automatizador",
  "Alarme",
  "Rede e internet",
  "Combate a incendio",
  "Estrutura e telhado",
  "Pintura",
  "Compressor",
  "Exaustao",
  "Iluminacao",
  "Movel / bancada",
];

export const TIPOS_SERVICO = {
  preventiva: { rotulo: "Preventiva", ajuda: "antes de quebrar" },
  corretiva: { rotulo: "Corretiva", ajuda: "quebrou e consertou" },
  troca: { rotulo: "Troca de peca", ajuda: "substituiu componente" },
  instalacao: { rotulo: "Instalacao", ajuda: "coisa nova" },
  vistoria: { rotulo: "Vistoria", ajuda: "so olhou e laudou" },
};

const soNumero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Situacao da PROXIMA manutencao de um item. Sem data prevista nao inventamos
// urgencia: "sem previsao" e um estado honesto, nao um alerta.
export function situacaoProxima(proximaISO, hojeISO) {
  if (!proximaISO) return { nivel: "sem", rotulo: "sem previsao", dias: null };
  const dias = diasEntre(hojeISO, proximaISO);
  if (dias < 0) return { nivel: "vencida", rotulo: `atrasada ${-dias} ${-dias === 1 ? "dia" : "dias"}`, dias };
  if (dias === 0) return { nivel: "vencida", rotulo: "e hoje", dias };
  if (dias <= 30) return { nivel: "perto", rotulo: `em ${dias} ${dias === 1 ? "dia" : "dias"}`, dias };
  return { nivel: "ok", rotulo: `em ${dias} dias`, dias };
}

// Junta itens (ativos) com os lancamentos de manutencao.
//
// `itens`   -- do painel-ativos, filtrados pelas familias daqui
// `mapa`    -- {id: lancamento} do painel-config (chave "manutencoes")
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

  const lista = (itens || []).map((it) => {
    const hist = porItem.get(it.id) || [];
    const total = hist.reduce((s, l) => s + l.valor, 0);
    const noAno = hist.filter((l) => String(l.data || "").startsWith(ano)).reduce((s, l) => s + l.valor, 0);
    const ultima = hist[0] || null;
    // A proxima e a MAIOR data prevista entre os lancamentos: marcar a proxima
    // num lancamento antigo nao pode ressuscitar um alerta ja resolvido por um
    // lancamento mais novo.
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
      ultima,
      proxima,
      sit: situacaoProxima(proxima, hojeISO),
    };
  });

  // Lancamento cujo item foi apagado nao pode sumir do total: o dinheiro saiu
  // do caixa de qualquer jeito. Ele aparece agrupado em "item removido".
  const idsConhecidos = new Set((itens || []).map((i) => i.id));
  const orfaos = lancamentos.filter((l) => !idsConhecidos.has(l.ativoId));

  const soma = (ls) => ls.reduce((s, l) => s + l.valor, 0);
  const doMes = lancamentos.filter((l) => String(l.data || "").startsWith(mes));
  const doAno = lancamentos.filter((l) => String(l.data || "").startsWith(ano));

  // Ranking: quem mais consumiu no ano. E a conta que justifica trocar um
  // veiculo ou renegociar um contrato de assistencia.
  const ranking = lista
    .filter((i) => i.noAno > 0)
    .sort((a, b) => b.noAno - a.noAno)
    .slice(0, 5);

  return {
    lista,
    orfaos,
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
    // Agenda do que vem: vencidas primeiro, depois as mais proximas.
    agenda: lista
      .filter((i) => i.sit.dias !== null)
      .sort((a, b) => a.sit.dias - b.sit.dias)
      .slice(0, 8),
  };
}
