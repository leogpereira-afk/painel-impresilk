import { test } from "node:test";
import assert from "node:assert/strict";
import { financeiroDasLinhas } from "./financeiroOS.js";

const HOJE = "2026-09-04";
const linha = (numero, valor, data = "2026-08-20") => ({ numero, valor, data });

/* O CASO RUIM PRIMEIRO: estorno. O título t1 foi quitado (está no mapa de
   pagos) e voltou a aberto no ERP. O mesmo id nos dois lados NÃO pode somar
   como recebido E como devido — vale o lado aberto, que é o mais fresco. */
test("titulo estornado nao conta duas vezes", () => {
  const r = financeiroDasLinhas([linha("100", 1000)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t1", os: "100", valor: 1000, pago: 0, vencimento: "2026-09-10" }],
    pagos: [{ id: "t1", os: "100", pago: 1000, em: "2026-08-01" }],
  }, HOJE);
  assert.equal(r.porNumero["100"].tipo, "aberto");
  assert.equal(r.porNumero["100"].pago, 0);
  assert.equal(r.totais.recebido, 0);
  assert.equal(r.totais.aberto, 1000);
});

test("titulo aberto com pagamento parcial: aberto, e o parcial ja conta como recebido", () => {
  const r = financeiroDasLinhas([linha("101", 3000)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t2", os: "101", valor: 2000, pago: 1000, vencimento: "2026-09-20" }],
    pagos: [],
  }, HOJE);
  assert.equal(r.porNumero["101"].tipo, "aberto");
  assert.equal(r.porNumero["101"].aberto, 2000);
  assert.equal(r.porNumero["101"].pago, 1000);
  assert.equal(r.porNumero["101"].vencido, false);
});

test("quitada com diferenca de centavos ainda e paga", () => {
  const r = financeiroDasLinhas([linha("102", 1000)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [],
    pagos: [{ id: "t3", os: "102", pago: 999.98, em: "2026-08-01" }],
  }, HOJE);
  assert.equal(r.porNumero["102"].tipo, "pago");
  assert.equal(r.totais.pagas, 1);
});

test("dois titulos: um pago e um vencido somam certo e marcam vencida", () => {
  const r = financeiroDasLinhas([linha("103", 5000)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t5", os: "103", valor: 2500, pago: 0, vencimento: "2026-08-30" }],
    pagos: [{ id: "t4", os: "103", pago: 2500, em: "2026-07-15" }],
  }, HOJE);
  const f = r.porNumero["103"];
  assert.equal(f.tipo, "aberto");
  assert.equal(f.vencido, true);
  assert.equal(f.pago, 2500);
  assert.equal(r.totais.vencidas, 1);
  assert.equal(r.totais.vencidoValor, 2500);
});

test("vencimento HOJE ainda nao e atraso", () => {
  const r = financeiroDasLinhas([linha("104", 100)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t6", os: "104", valor: 100, pago: 0, vencimento: HOJE }],
    pagos: [],
  }, HOJE);
  assert.equal(r.porNumero["104"].vencido, false);
});

test("sem titulo nenhum: 'sem titulo' quando o mapa cobre a epoca, 'sem dado' quando nao", () => {
  const dados = { temPagos: true, desdeDados: "2025-01-01", abertos: [], pagos: [] };
  const r = financeiroDasLinhas([linha("105", 800, "2026-08-20"), linha("106", 900, "2024-05-10")], dados, HOJE);
  assert.equal(r.porNumero["105"].tipo, "semTitulo");
  assert.equal(r.porNumero["106"].tipo, "semDado"); // 2024 e anterior ao mapa: nao afirmar
  assert.equal(r.totais.semTitulo, 1);
  assert.equal(r.totais.semTituloValor, 800);
  assert.equal(r.totais.semDado, 1);
});

test("mapa de pagos ainda nao montado: aberto continua aberto, o resto e 'sem dado'", () => {
  const r = financeiroDasLinhas([linha("107", 700), linha("108", 600)], {
    temPagos: false, desdeDados: null,
    abertos: [{ id: "t7", os: "107", valor: 700, pago: 0, vencimento: "2026-10-01" }],
    pagos: [],
  }, HOJE);
  assert.equal(r.porNumero["107"].tipo, "aberto");
  assert.equal(r.porNumero["108"].tipo, "semDado"); // nunca "pago" nem "sem titulo" sem o mapa
});

test("pagamento parcial sem titulo do resto: 'pagoParcial' e o resto vira 'sem titulo' no total", () => {
  const r = financeiroDasLinhas([linha("109", 10000)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [],
    pagos: [{ id: "t8", os: "109", pago: 4000, em: "2026-08-10" }],
  }, HOJE);
  assert.equal(r.porNumero["109"].tipo, "pagoParcial");
  assert.equal(r.totais.recebido, 4000);
  assert.equal(r.totais.semTituloValor, 6000);
});

test("titulo de O.S. que nao esta na campanha nao entra nos totais", () => {
  const r = financeiroDasLinhas([linha("110", 500)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t9", os: "999", valor: 123, pago: 0, vencimento: "2026-01-01" }],
    pagos: [{ id: "t10", os: "110", pago: 500, em: "2026-08-01" }],
  }, HOJE);
  assert.equal(r.totais.aberto, 0);
  assert.equal(r.totais.recebido, 500);
});
