import { test } from "node:test";
import assert from "node:assert/strict";
import { financeiroDasLinhas, faxinarPagos } from "./financeiroOS.js";

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

/* O CASO REAL de 04/09/2026: o titulo 41.400 do "ELEICAO 2026 PEDRO HENRIQUE"
   cobra QUATRO O.S. (23208-23206-23051-23021). O servidor reparte proporcional
   ao valor de cada uma -- a soma bate exatamente -- e cada linha recebe o seu.
   Antes deste conserto o titulo inteiro era invisivel e a campanha aparecia
   como "sem titulo no ERP" com R$ 41.400 em aberto. */
test("titulo compartilhado: cada O.S. recebe a sua parte e fica marcada", () => {
  const linhas = [linha("23208", 30800), linha("23206", 300), linha("23051", 300), linha("23021", 10000)];
  const abertos = [
    { id: "t-41400", os: "23208", valor: 30800, pago: 0, vencimento: "2026-10-05", compartilhado: true, incerto: false },
    { id: "t-41400", os: "23206", valor: 300, pago: 0, vencimento: "2026-10-05", compartilhado: true, incerto: false },
    { id: "t-41400", os: "23051", valor: 300, pago: 0, vencimento: "2026-10-05", compartilhado: true, incerto: false },
    { id: "t-41400", os: "23021", valor: 10000, pago: 0, vencimento: "2026-10-05", compartilhado: true, incerto: false },
  ];
  const r = financeiroDasLinhas(linhas, { temPagos: true, desdeDados: "2025-01-01", abertos, pagos: [] }, HOJE);
  assert.equal(r.totais.aberto, 41400);
  assert.equal(r.totais.abertas, 4);
  assert.equal(r.totais.compartilhadas, 4);
  assert.equal(r.totais.incertas, 0);
  assert.equal(r.porNumero["23208"].aberto, 30800);
  assert.equal(r.porNumero["23208"].compartilhado, true);
  // Nenhuma delas pode aparecer como "sem titulo" -- era o defeito.
  assert.ok(linhas.every((l) => r.porNumero[l.numero].tipo === "aberto"));
});

test("rateio incerto (valor de alguma O.S. desconhecido) viaja ate a tela", () => {
  const r = financeiroDasLinhas([linha("300", 1000)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [],
    pagos: [{ id: "t-x", os: "300", pago: 500, em: "2026-08-01", compartilhado: true, incerto: true }],
  }, HOJE);
  assert.equal(r.porNumero["300"].incerto, true);
  assert.equal(r.totais.incertas, 1);
});

test("titulo compartilhado estornado: o lado aberto vence nas DUAS partes", () => {
  const r = financeiroDasLinhas([linha("400", 600), linha("401", 400)], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [
      { id: "t-e", os: "400", valor: 600, pago: 0, vencimento: "2026-10-01", compartilhado: true },
      { id: "t-e", os: "401", valor: 400, pago: 0, vencimento: "2026-10-01", compartilhado: true },
    ],
    pagos: [
      { id: "t-e", os: "400", pago: 600, em: "2026-08-01", compartilhado: true },
      { id: "t-e", os: "401", pago: 400, em: "2026-08-01", compartilhado: true },
    ],
  }, HOJE);
  assert.equal(r.totais.recebido, 0);
  assert.equal(r.totais.aberto, 1000);
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

/* A FAXINA — apaga registro de dinheiro recebido, então cada regra tem prova. */

const mapa = (n, dentro = true) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [`t${i}`, { os: String(1000 + i), pago: 100, em: dentro ? "2026-08-01" : "2026-01-01" }]),
);

test("faxina tira o estornado que nao voltou na janela", () => {
  const titulos = mapa(10);
  const vieram = new Set(Object.keys(titulos).filter((k) => k !== "t3"));
  const r = faxinarPagos(titulos, vieram, "2026-06-06");
  assert.equal(r.abortada, false);
  assert.equal(r.removidos, 1);
  assert.equal("t3" in r.titulos, false);
  assert.equal(Object.keys(r.titulos).length, 9);
});

/* O CASO QUE A FAXINA EXISTE PARA NAO CAUSAR: o ERP devolve a janela pela
   metade. "Nao voltou" deixa de significar estorno; apagar aqui transformaria
   dinheiro recebido em cobranca ao cliente. */
test("resposta incompleta ABORTA a faxina e nao apaga nada", () => {
  const titulos = mapa(10);
  const vieram = new Set(["t0", "t1"]); // 8 de 10 sumiram: leitura incompleta
  const r = faxinarPagos(titulos, vieram, "2026-06-06");
  assert.equal(r.abortada, true);
  assert.equal(r.removidos, 0);
  assert.equal(Object.keys(r.titulos).length, 10);
});

test("titulo pago ANTES da janela nao e julgado por ela", () => {
  const titulos = { ...mapa(3), velho: { os: "9", pago: 500, em: "2025-02-02" } };
  const r = faxinarPagos(titulos, new Set(["t0", "t1", "t2"]), "2026-06-06");
  assert.equal(r.abortada, false);
  assert.equal(r.removidos, 0);
  assert.equal("velho" in r.titulos, true);
});

test("titulo sem data de pagamento nunca e apagado", () => {
  const titulos = { semData: { os: "9", pago: 500, em: "" } };
  const r = faxinarPagos(titulos, new Set(), "2026-06-06");
  assert.equal(r.removidos, 0);
  assert.equal("semData" in r.titulos, true);
});

test("mapa vazio ou janela sem titulos nao aborta nem apaga", () => {
  const r = faxinarPagos({}, new Set(), "2026-06-06");
  assert.equal(r.abortada, false);
  assert.equal(r.removidos, 0);
});

test("no limite (30%) ainda apaga; acima dele aborta", () => {
  const titulos = mapa(10);
  const tres = new Set(Object.keys(titulos).slice(3)); // 3 de 10 sumiram = 30%
  assert.equal(faxinarPagos(titulos, tres, "2026-06-06").abortada, false);
  const quatro = new Set(Object.keys(titulos).slice(4)); // 4 de 10 = 40%
  assert.equal(faxinarPagos(titulos, quatro, "2026-06-06").abortada, true);
});
