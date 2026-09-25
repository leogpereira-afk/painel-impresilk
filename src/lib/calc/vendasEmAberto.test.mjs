import { test } from "node:test";
import assert from "node:assert/strict";
import { vendasEmAberto, totaisDe, empresasDe, ordenarVendas, dadosDaPorta, chaveEmpresa, paginarEmpresas } from "./vendasEmAberto.js";

const HOJE = "2026-09-23";
const CORTE = "2025-01-01";
const os = (numero, valor, extra = {}) => ({ id: `id${numero}`, numero, tipo: "Normal", valor, cliente: `Cliente ${numero}`, cnpj: "", vendedor: "Ana", data: "2026-08-01", ...extra });
const resposta = (extra = {}) => ({ temPagos: true, desdeDados: "2025-01-01", abertos: [], pagosPorOS: {}, permutaDaOS: {}, ...extra });
const linhaDe = (r, numero) => r.linhas.find((l) => l.numero === numero);

/* O CASO RUIM PRIMEIRO: o atraso é da PARCELA, não da O.S. A régua de Campanhas
   marca a O.S. inteira como vencida quando uma parcela venceu; aqui isso
   inflaria o "saldo em atraso" (medido em 23/09: R$ 136.862 contra R$ 125.682). */
test("venda com uma parcela vencida e outra a vencer: só a vencida é atraso", () => {
  const r = vendasEmAberto([os("100", 8000)], resposta({
    abertos: [
      { id: "t1", os: "100", valor: 5333.33, pago: 0, vencimento: "2026-08-10" },
      { id: "t2", os: "100", valor: 2666.67, pago: 0, vencimento: "2026-10-10" },
    ],
  }), { hoje: HOJE, corte: CORTE });
  const l = linhaDe(r, "100");
  assert.equal(l.atraso, 5333.33);
  assert.equal(l.aVencer, 2666.67);
  assert.equal(l.saldo, 8000);
  assert.equal(l.estado, "atraso");
  assert.equal(l.diasAtraso, 44);
});

test("vence HOJE ainda não é atraso", () => {
  const r = vendasEmAberto([os("101", 1000)], resposta({
    abertos: [{ id: "t", os: "101", valor: 1000, pago: 0, vencimento: HOJE }],
  }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "101").atraso, 0);
  assert.equal(linhaDe(r, "101").aVencer, 1000);
  assert.equal(linhaDe(r, "101").estado, "aVencer");
});

test("quitada NÃO entra; vai para o balde de quitadas", () => {
  const r = vendasEmAberto([os("102", 1000)], resposta({ pagosPorOS: { "102": [1000, 0, 0] } }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "102"), undefined);
  assert.equal(r.fora.quitadas.n, 1);
});

/* "Todos que estiverem rodando na empresa": venda sem título nenhum no ERP
   (nota não emitida, ainda em produção) ENTRA, com o valor inteiro como saldo. */
test("venda sem título nenhum entra inteira como saldo sem título", () => {
  const r = vendasEmAberto([os("103", 4200)], resposta(), { hoje: HOJE, corte: CORTE });
  const l = linhaDe(r, "103");
  assert.equal(l.saldo, 4200);
  assert.equal(l.semTitulo, 4200);
  assert.equal(l.atraso, 0);
  assert.equal(l.estado, "semTitulo");
});

test("paga em parte com resto grande entra; o resto é saldo sem título", () => {
  const r = vendasEmAberto([os("104", 13500)], resposta({ pagosPorOS: { "104": [12000, 0, 0] } }), { hoje: HOJE, corte: CORTE });
  const l = linhaDe(r, "104");
  assert.equal(l.recebido, 12000);
  assert.equal(l.saldo, 1500);
  assert.equal(l.semTitulo, 1500);
  assert.equal(l.estado, "parcialSemTitulo");
});

test("diferença pequena sem motivo de baixa vai para conferência, sem presumir desconto ou quitação", () => {
  const r = vendasEmAberto([os("105", 1000)], resposta({ pagosPorOS: { "105": [985, 0, 0] } }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "105"), undefined);
  assert.equal(r.fora.conferencia.n, 1);
  assert.equal(r.fora.conferencia.valor, 15);
  assert.equal(r.fora.quitadas.n, 0);
  assert.equal(r.conferir[0].numero, "105");
});

test("quitada em permuta não entra, mesmo com título aberto no ERP", () => {
  const r = vendasEmAberto([os("106", 5000)], resposta({
    abertos: [{ id: "t", os: "106", valor: 5000, pago: 0, vencimento: "2026-08-01" }],
    permutaDaOS: { id106: "Permuta Parceiro" },
  }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "106"), undefined);
  assert.equal(r.fora.permuta.n, 1);
});

test("O.S. anterior ao mapa de pagamentos não é afirmada (nem quitada, nem devendo)", () => {
  const r = vendasEmAberto([os("107", 900, { data: "2024-12-10" })], resposta(), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "107"), undefined);
  assert.equal(r.fora.semDado.n, 1);
});

test("O.S. que a porta não consultou fica fora de toda soma", () => {
  const r = vendasEmAberto([os("108", 700)], resposta({ consultadas: ["999"] }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "108"), undefined);
  assert.equal(r.fora.naoConsultadas.n, 1);
});

test("parcela vencida antes do corte não entra no atraso (a tela a trata como dívida antiga)", () => {
  const r = vendasEmAberto([os("109", 3000)], resposta({
    abertos: [{ id: "t", os: "109", valor: 3000, pago: 0, vencimento: "2024-11-10" }],
  }), { hoje: HOJE, corte: CORTE });
  const l = linhaDe(r, "109");
  assert.equal(l.atraso, 0);
  assert.equal(l.antigo, 3000);
  assert.equal(l.saldo, 3000);
});

/* NÚMERO REPETIDO: duas O.S. com o mesmo número dividiriam as mesmas parcelas
   e a lista contaria o mesmo dinheiro duas vezes. */
test("número repetido no ERP vira uma venda só, sem contar a parcela duas vezes", () => {
  const r = vendasEmAberto([os("110", 1000, { id: "a" }), os("110", -147.6, { id: "b" })], resposta({
    abertos: [{ id: "t", os: "110", valor: 852.4, pago: 0, vencimento: "2026-08-01" }],
  }), { hoje: HOJE, corte: CORTE });
  assert.equal(r.linhas.filter((l) => l.numero === "110").length, 1);
  const l = linhaDe(r, "110");
  assert.equal(l.numeroRepetido, true);
  assert.equal(l.atraso, 852.4);
  assert.equal(totaisDe(r.linhas).atraso, 852.4);
});

test("o saldo fecha: atraso + a vencer + antigo + sem título", () => {
  const r = vendasEmAberto([os("111", 10000)], resposta({
    abertos: [
      { id: "a", os: "111", valor: 2000, pago: 0, vencimento: "2026-09-01" },
      { id: "b", os: "111", valor: 3000, pago: 0, vencimento: "2026-10-01" },
    ],
    pagosPorOS: { "111": [1000, 0, 0] },
  }), { hoje: HOJE, corte: CORTE });
  const l = linhaDe(r, "111");
  assert.equal(l.saldo, 9000, "10.000 menos 1.000 recebidos");
  assert.equal(l.atraso + l.aVencer + l.antigo + l.semTitulo, l.saldo);
  assert.equal(l.semTitulo, 4000);
});

test("o total em atraso é a soma das parcelas vencidas desde o corte", () => {
  const abertos = [
    { id: "a", os: "200", valor: 100, pago: 0, vencimento: "2026-09-01" },
    { id: "b", os: "201", valor: 250.55, pago: 0, vencimento: "2026-07-01" },
    { id: "c", os: "201", valor: 999, pago: 0, vencimento: "2026-12-01" },
    { id: "d", os: "202", valor: 50, pago: 0, vencimento: "2024-10-01" },
  ];
  const r = vendasEmAberto([os("200", 100), os("201", 1249.55), os("202", 50)], resposta({ abertos }), { hoje: HOJE, corte: CORTE });
  assert.equal(totaisDe(r.linhas).atraso, 350.55);
});

test("empresas: o mesmo CNPJ com dois nomes é uma empresa só; a maior dívida primeiro", () => {
  const r = vendasEmAberto([
    os("300", 1000, { cnpj: "11.222.333/0001-44", cliente: "SPE LTDA" }),
    os("301", 3000, { cnpj: "11222333000144", cliente: "CONSTRUTORA" }),
    os("302", 5000, { cliente: "Outra" }),
  ], resposta(), { hoje: HOJE, corte: CORTE });
  const e = empresasDe(r.linhas);
  assert.equal(e.length, 2);
  assert.equal(e[0].saldo, 5000);
  assert.equal(e[1].n, 2);
  assert.equal(chaveEmpresa({ cnpj: "11.222.333/0001-44" }), chaveEmpresa({ cnpj: "11222333000144" }));
});

test("sem resposta da porta: null, nunca uma lista vazia que pareça 'nada em aberto'", () => {
  assert.equal(vendasEmAberto([os("1", 10)], null, { hoje: HOJE, corte: CORTE }), null);
});

test("pagos somados: o id sintético não vira estorno de título aberto", () => {
  const d = dadosDaPorta(resposta({ pagosPorOS: { "9": [50, 1, 0] }, abertos: [{ id: "x", os: "9", valor: 50, vencimento: "2026-10-01" }] }));
  assert.equal(d.pagos[0].id, "soma:9");
  assert.equal(d.pagos[0].compartilhado, true);
  const r = vendasEmAberto([os("9", 100)], resposta({ pagosPorOS: { "9": [50, 1, 0] }, abertos: [{ id: "x", os: "9", valor: 50, pago: 0, vencimento: "2026-10-01" }] }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "9").recebido, 50);
  assert.equal(linhaDe(r, "9").saldo, 50);
  assert.equal(linhaDe(r, "9").compartilhado, true);
});

test("título aberto maior que a venda: o saldo segue o título e a linha marca o excesso", () => {
  const r = vendasEmAberto([os("400", 2898)], resposta({
    abertos: [{ id: "t", os: "400", valor: 18800, pago: 0, vencimento: "2026-09-01" }],
  }), { hoje: HOJE, corte: CORTE });
  assert.equal(linhaDe(r, "400").saldo, 18800);
  assert.equal(linhaDe(r, "400").excesso, 15902);
});

test("ordenar: mais atrasada primeiro", () => {
  const l = [{ numero: "1", diasAtraso: 3, atraso: 1, saldo: 9, data: "2026-01-01" }, { numero: "2", diasAtraso: 40, atraso: 1, saldo: 1, data: "2026-02-01" }];
  assert.equal(ordenarVendas(l, "atraso")[0].numero, "2");
  assert.equal(ordenarVendas(l, "saldo")[0].numero, "1");
  assert.equal(ordenarVendas(l, "antigas")[0].numero, "1");
});

test("pedido de retrabalho fica fora, mas a venda original com ocorrência continua", () => {
  const r = vendasEmAberto([
    os('501', 1000, { retrabalho: true }),
    os('502', 250, { tipo: 'Retrabalho' }),
    os('503', 10, { tipo: ' RETRABALHO ' }),
  ], resposta({ abertos: [{ id: 't', os: '502', valor: 250, vencimento: '2026-08-01' }] }), { hoje: HOJE });
  assert.deepEqual(r.linhas.map(l => l.numero), ['501']);
  assert.equal(totaisDe(r.linhas).saldo, 1000);
  assert.deepEqual(r.fora.retrabalho, { n: 2, valor: 260 });
});

test("cache antigo sem tipo fica pendente de classificação, sem virar dívida", () => {
  const r = vendasEmAberto([os('504', 50, { tipo: undefined })], resposta(), { hoje: HOJE });
  assert.equal(r.linhas.length, 0);
  assert.deepEqual(r.fora.semTipo, { n: 1, valor: 50 });
});

test("desconto da O.S. não é cobrado nem descontado duas vezes", () => {
  const r = vendasEmAberto([os('505', 800, { valorBruto: 1000, desconto: 200 })], resposta({ pagosPorOS: { '505': [100, 0, 0] } }), { hoje: HOJE });
  assert.equal(r.linhas[0].saldo, 700);
  assert.equal(r.linhas[0].descontoVenda, 200);
});

test("a mesma O.S. repetida no cache não duplica o saldo", () => {
  const a = os('506', 900);
  const r = vendasEmAberto([a, { ...a }], resposta(), { hoje: HOJE });
  assert.equal(r.linhas.length, 1);
  assert.equal(totaisDe(r.linhas).saldo, 900);
});

test("todas as 372 empresas são alcançáveis, sem repetir ou perder empresas", () => {
  const es = Array.from({ length: 372 }, (_, i) => ({ chave: `empresa-${i}` }));
  const juntas = Array.from({ length: 19 }, (_, i) => paginarEmpresas(es, i + 1).itens).flat();
  assert.deepEqual(juntas, es);
  assert.equal(paginarEmpresas(es, 99).pagina, 19);
  assert.equal(paginarEmpresas(es, 19).ate, 372);
  assert.equal(paginarEmpresas(es.slice(0, 3), 19).pagina, 1);
  assert.deepEqual(paginarEmpresas([], 2).itens, []);
});

test('sinal pago no pedido abate a venda ainda não faturada', () => {
  const r = vendasEmAberto([os('23322', 100000, { sinalPago: 65000 })], resposta(), { hoje: HOJE });
  const l = linhaDe(r, '23322');
  assert.equal(l.recebido, 65000);
  assert.equal(l.saldo, 35000);
  assert.equal(l.sinalPago, 65000);
});
test('sinal e títulos são fontes sobrepostas, não pagamentos para somar', () => {
  for (const pago of [30000, 65000, 80000]) {
    const r = vendasEmAberto([os('1', 100000, { sinalPago: 65000 })], resposta({ pagosPorOS: { '1': [pago, 0, 0] } }), { hoje: HOJE });
    const l = linhaDe(r, '1');
    assert.equal(l.recebido, Math.max(65000, pago));
    assert.equal(l.saldo, 100000 - Math.max(65000, pago));
  }
});
test('sinal não abate de novo as parcelas que já representam o saldo', () => {
  const r = vendasEmAberto([os('1', 100000, { sinalPago: 65000 })], resposta({ abertos: [{ id: 't', os: '1', valor: 35000, pago: 65000, vencimento: HOJE }] }), { hoje: HOJE });
  assert.equal(linhaDe(r, '1').saldo, 35000);
  assert.equal(linhaDe(r, '1').semTitulo, 0);
});
test('sinal integral quita; sinal negativo não aumenta dívida; retrabalho continua excluído', () => {
  const r = vendasEmAberto([os('1', 100, { sinalPago: 100 }), os('2', 100, { sinalPago: -10 }), os('3', 100, { sinalPago: 30, tipo: 'Retrabalho' })], resposta(), { hoje: HOJE });
  assert.equal(r.fora.quitadas.n, 1);
  assert.equal(r.fora.retrabalho.n, 1);
  assert.equal(linhaDe(r, '2').saldo, 100);
});
test('números repetidos somam sinais por id sem duplicar a mesma ordem', () => {
  const a = os('1', 100, { id: 'a', sinalPago: 20 });
  const b = os('1', 200, { id: 'b', sinalPago: 30 });
  const r = vendasEmAberto([a, a, b], resposta(), { hoje: HOJE });
  assert.equal(linhaDe(r, '1').saldo, 250);
});
