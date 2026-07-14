// Fluxo de caixa: soma saidas (contas a pagar + provisoes) e entradas previstas
// (recebiveis em aberto) por dia. Saldo inicial vem das contas bancarias ou do
// valor manual de Configuracoes. Regra D-1: o dinheiro precisa estar em caixa um
// dia antes do vencimento.

import { diaLocalISO, dataCurta, ymdLocal } from "../format.js";

export function calcFluxoCaixa(
  { pagar, recebiveis, bancos },
  config,
  { horizonte = 30, estresse = false } = {}
) {
  const p = config.parametros;
  const colchao = p.colchaoMinimo || 0;
  const saldoInicial =
    p.saldoInicialModo === "manual"
      ? p.saldoInicialManual || 0
      : bancos.reduce((s, b) => s + (b.saldo || 0), 0);

  // Clientes com titulo vencido = pagadores de risco. Suas entradas futuras sao
  // "incertas" e o teste de estresse zera essas entradas.
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const hojeISO = ymdLocal(hoje);
  const clientesComAtraso = new Set(
    recebiveis
      .filter((r) => diaLocalISO(r.vencimento) < hojeISO)
      .map((r) => r.cliente)
  );

  const futuros = recebiveis.filter((r) => diaLocalISO(r.vencimento) >= hojeISO);
  const incertos = futuros
    .filter((r) => clientesComAtraso.has(r.cliente))
    .map((r) => ({ id: r.id, cliente: r.cliente, valor: r.valor, vencimento: r.vencimento }));
  const idsIncertos = new Set(incertos.map((r) => r.id));

  // Indexa entradas e saidas por dia local.
  const entradasPorDia = {};
  for (const r of futuros) {
    if (estresse && idsIncertos.has(r.id)) continue;
    const d = diaLocalISO(r.vencimento);
    entradasPorDia[d] = (entradasPorDia[d] || 0) + r.valor;
  }
  const saidasPorDia = {};
  for (const s of pagar) {
    const venc = diaLocalISO(s.vencimento);
    // Regra D-1: o dinheiro precisa estar em caixa na vespera do vencimento.
    // Contas ja vencidas (ou cuja vespera ja passou) entram HOJE, nao somem da
    // projecao (senao o caixa aparece maior do que e, escondendo risco).
    const vespera = ymdLocal(new Date(new Date(venc + "T12:00:00").getTime() - 86400000));
    const alvo = vespera < hojeISO ? hojeISO : vespera;
    saidasPorDia[alvo] = (saidasPorDia[alvo] || 0) + s.valor;
  }

  const projecao = [];
  let saldo = saldoInicial;
  for (let i = 0; i < horizonte; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const iso = ymdLocal(d);
    const entrada = entradasPorDia[iso] || 0;
    const saida = saidasPorDia[iso] || 0;
    saldo = saldo + entrada - saida;
    projecao.push({
      data: iso,
      rotulo: dataCurta(iso),
      entrada,
      saida,
      saldo,
      abaixo: saldo < colchao,
    });
  }

  const menor = projecao.reduce((a, b) => (b.saldo < a.saldo ? b : a), projecao[0]);
  const menor15 = projecao
    .slice(0, 15)
    .reduce((a, b) => (b.saldo < a.saldo ? b : a), projecao[0]);
  const diasAbaixo = projecao.filter((d) => d.abaixo).length;
  const totalEntradas = projecao.reduce((s, d) => s + d.entrada, 0);
  const totalSaidas = projecao.reduce((s, d) => s + d.saida, 0);

  return {
    saldoInicial,
    bancos,
    projecao,
    incertos,
    kpis: {
      saldoHoje: saldoInicial,
      menorSaldo: menor?.saldo || 0,
      menorSaldoData: menor?.data || hojeISO,
      menorSaldo15: menor15?.saldo || 0,
      diasAbaixo,
      colchao,
      horizonte,
      totalEntradas,
      totalSaidas,
      incertosValor: incertos.reduce((s, r) => s + r.valor, 0),
    },
  };
}
