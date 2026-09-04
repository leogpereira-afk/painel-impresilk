import { test } from "node:test";
import assert from "node:assert/strict";
import { financeiroDasLinhas, faxinarPagos, osDoQuadro } from "./financeiroOS.js";

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

/* PERMUTA — o caso real de 04/09/2026: 16 O.S. de 4 campanhas (R$ 162.364)
   foram quitadas em troca e nunca terao titulo. A maior: "Politica 2026 -
   Deputados", 11 O.S. / R$ 136.556 na permuta "Politica Marcelo Freitas". Sem
   esta ligacao a tela mandava cobrar quem ja tinha acertado. */
test("O.S. em permuta fica quitada, fora do dinheiro e fora da cobranca", () => {
  const linhas = [
    { id: "os-1", numero: "500", valor: 100000, data: "2026-08-01" },
    { id: "os-2", numero: "501", valor: 2000, data: "2026-08-02" },
  ];
  const r = financeiroDasLinhas(linhas, {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t-z", os: "501", valor: 2000, pago: 0, vencimento: "2026-10-01" }],
    pagos: [],
    permutaDaOS: { "os-1": "Politica Marcelo Freitas" },
  }, HOJE);
  assert.equal(r.porNumero["500"].tipo, "permuta");
  assert.equal(r.porNumero["500"].permuta, "Politica Marcelo Freitas");
  assert.equal(r.totais.permutadas, 1);
  assert.equal(r.totais.permutadoValor, 100000);
  // Nao vira "sem titulo" (era o defeito), nem entra no recebido em dinheiro.
  assert.equal(r.totais.semTitulo, 0);
  assert.equal(r.totais.recebido, 0);
  // A outra O.S. continua sendo cobranca normal.
  assert.equal(r.totais.aberto, 2000);
});

test("permuta com pagamento no ERP: nao some, mas fica FORA do recebido", () => {
  const r = financeiroDasLinhas([{ id: "os-7", numero: "800", valor: 9000, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [],
    pagos: [{ id: "t-p", os: "800", pago: 9000, em: "2026-08-10" }],
    permutaDaOS: { "os-7": "Empominas" },
  }, HOJE);
  assert.equal(r.porNumero["800"].tipo, "permuta");
  assert.equal(r.totais.recebido, 0);              // nao infla o caixa
  assert.equal(r.totais.permutaPagoNoErp, 9000);   // e nao some: a tela mostra
  assert.equal(r.totais.permutadoValor, 9000);
});

test("permuta manda mesmo quando o ERP tem titulo aberto da mesma O.S.", () => {
  const r = financeiroDasLinhas([{ id: "os-9", numero: "600", valor: 5000, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "t-w", os: "600", valor: 5000, pago: 0, vencimento: "2026-01-01" }],
    pagos: [],
    permutaDaOS: { "os-9": "Vila 61" },
  }, HOJE);
  assert.equal(r.porNumero["600"].tipo, "permuta");
  // Nao pode sobrar em aberto: mandaria cobrar quem ja acertou em troca.
  assert.equal(r.totais.aberto, 0);
  assert.equal(r.totais.abertas, 0);
  assert.equal(r.totais.vencidas, 0);
});

test("sem permutaDaOS nada muda (a permuta nao passa esse campo)", () => {
  const r = financeiroDasLinhas([{ id: "os-3", numero: "700", valor: 800, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01", abertos: [], pagos: [],
  }, HOJE);
  assert.equal(r.porNumero["700"].tipo, "semTitulo");
  assert.equal(r.totais.permutadas, 0);
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

/* ACHADOS DA AUDITORIA DE 04/09 — O.S. pedida mas NAO respondida pelo servidor
   (teto de 600, ou numero recusado pelo filtro) recebia selo "sem titulo no
   ERP" e entrava no total de nao-faturado: afirmacao de ausencia sobre
   pergunta que nao foi feita. */
test("O.S. fora do teto nao recebe selo nem entra em 'sem titulo'", () => {
  const linhas = [
    { id: "a", numero: "100", valor: 1000, data: "2026-08-01" },
    { id: "b", numero: "9910", valor: 7000, data: "2026-08-02" }, // cortada
  ];
  const r = financeiroDasLinhas(linhas, {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [], pagos: [],
    consultadas: ["100"], cortados: 1,
  }, HOJE);
  assert.equal(r.porNumero["100"].tipo, "semTitulo");
  assert.equal(r.porNumero["9910"].tipo, "naoConsultada");
  assert.equal(r.totais.naoConsultadas, 1);
  assert.equal(r.totais.naoConsultadoValor, 7000);
  // O valor da cortada NAO pode entrar no total de nao-faturado.
  assert.equal(r.totais.semTitulo, 1);
  assert.equal(r.totais.semTituloValor, 1000);
});

test("O.S. cortada tambem nao vira 'pago' nem 'em aberto'", () => {
  const r = financeiroDasLinhas([{ id: "c", numero: "555", valor: 300, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [], pagos: [], consultadas: [],
  }, HOJE);
  assert.equal(r.porNumero["555"].tipo, "naoConsultada");
  assert.equal(r.totais.recebido, 0);
  assert.equal(r.totais.aberto, 0);
  assert.equal(r.totais.semTitulo, 0);
});

test("resposta sem a lista consultadas mantem o comportamento antigo", () => {
  const r = financeiroDasLinhas([{ id: "d", numero: "777", valor: 500, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01", abertos: [], pagos: [],
  }, HOJE);
  assert.equal(r.porNumero["777"].tipo, "semTitulo");
  assert.equal(r.totais.naoConsultadas, 0);
});

test("permuta continua valendo mesmo se a O.S. ficou fora do teto", () => {
  const r = financeiroDasLinhas([{ id: "e", numero: "888", valor: 900, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [], pagos: [], consultadas: [],
    permutaDaOS: { e: "Vila 61" },
  }, HOJE);
  assert.equal(r.porNumero["888"].tipo, "permuta");
  assert.equal(r.totais.permutadas, 1);
});

/* REGRA DO LEONARDO (04/09): "jogar no aberto o que nao teve identificacao,
   porque esta aberto". Venda entregue sem nota emitida e divida do cliente --
   so nao e cobravel ainda. Conferido contra a tela real da campanha "Politica
   2026 - Deputados": 45.965,57 (com titulo) + 172.230,05 (sem nota) e os
   quatro baldes fecham os R$ 436.307,41 da campanha. */
test("sem nota entra no 'a receber', permuta e nao-conferida NAO entram", () => {
  const linhas = [
    { id: "p1", numero: "10", valor: 45965.57, data: "2026-08-01" }, // titulo aberto
    { id: "p2", numero: "20", valor: 172230.05, data: "2026-08-02" }, // sem nota
    { id: "p3", numero: "30", valor: 136556.24, data: "2026-08-03" }, // permuta
    { id: "p4", numero: "40", valor: 999, data: "2026-08-04" },       // fora do teto
    { id: "p5", numero: "50", valor: 888, data: "2024-01-05" },       // antes do mapa
  ];
  const r = financeiroDasLinhas(linhas, {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "tt", os: "10", valor: 45965.57, pago: 0, vencimento: "2026-08-30" }],
    pagos: [],
    permutaDaOS: { p3: "Politica Marcelo Freitas" },
    consultadas: ["10", "20", "30", "50"],
  }, HOJE);
  assert.equal(r.totais.aberto, 45965.57);
  assert.equal(r.totais.semTituloValor, 172230.05);
  assert.equal(r.totais.aReceber, 218195.62);   // o que o cliente deve
  assert.equal(r.totais.aReceberOS, 2);
  // O que a tela NAO pode afirmar fica de fora do que se cobra.
  assert.equal(r.totais.permutadoValor, 136556.24);
  assert.equal(r.totais.naoConsultadas, 1);
  assert.equal(r.totais.semDado, 1);
});

test("resto de O.S. paga em parte tambem entra no 'a receber'", () => {
  const r = financeiroDasLinhas([{ id: "q1", numero: "60", valor: 10000, data: "2026-08-01" }], {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [], pagos: [{ id: "tq", os: "60", pago: 4000, em: "2026-08-10" }],
  }, HOJE);
  assert.equal(r.totais.recebido, 4000);
  assert.equal(r.totais.aReceber, 6000);
});

/* O DETALHE DOS QUADROS — a lista que abre ao clicar. O teste que importa e o
   de FECHAMENTO: a soma da lista tem de bater, ao centavo, com o total do
   cartao. Lista que nao fecha com o numero acima dela e pior que lista nenhuma. */
test("cada quadro devolve as O.S. certas e a soma FECHA com o total", () => {
  const linhas = [
    { id: "x1", numero: "10", valor: 45965.57, data: "2026-08-01" }, // titulo aberto
    { id: "x2", numero: "20", valor: 172230.05, data: "2026-08-02" }, // sem nota
    { id: "x3", numero: "30", valor: 136556.24, data: "2026-08-03" }, // permuta
    { id: "x4", numero: "40", valor: 81555.55, data: "2026-08-04" },  // quitada
    { id: "x5", numero: "50", valor: 10000, data: "2026-08-05" },     // parcial 4.000
    { id: "x6", numero: "60", valor: 999, data: "2026-08-06" },       // fora do teto
  ];
  const dados = {
    temPagos: true, desdeDados: "2025-01-01",
    abertos: [{ id: "ta", os: "10", valor: 45965.57, pago: 0, vencimento: "2026-12-01" }],
    pagos: [
      { id: "tp", os: "40", pago: 81555.55, em: "2026-08-20" },
      { id: "tq", os: "50", pago: 4000, em: "2026-08-21" },
    ],
    permutaDaOS: { x3: "Politica Marcelo Freitas" },
    consultadas: ["10", "20", "30", "40", "50"],
  };
  const r = financeiroDasLinhas(linhas, dados, HOJE);
  const soma = (xs) => Math.round(xs.reduce((s, x) => s + x.parte, 0) * 100) / 100;

  const rec = osDoQuadro(linhas, r.porNumero, "recebido");
  assert.deepEqual(rec.map((x) => x.numero), ["40", "50"]);
  assert.equal(soma(rec), r.totais.recebido);

  const ab = osDoQuadro(linhas, r.porNumero, "aberto");
  assert.deepEqual(ab.map((x) => x.numero), ["20", "10", "50"]); // maior primeiro
  assert.equal(soma(ab), r.totais.aReceber);

  const pm = osDoQuadro(linhas, r.porNumero, "permuta");
  assert.deepEqual(pm.map((x) => x.numero), ["30"]);
  assert.equal(soma(pm), r.totais.permutadoValor);

  // A O.S. fora do teto nao aparece em quadro nenhum: nao foi conferida.
  for (const q of ["recebido", "aberto", "permuta"]) {
    assert.ok(!osDoQuadro(linhas, r.porNumero, q).some((x) => x.numero === "60"));
  }
});

test("quadro vazio devolve lista vazia, sem quebrar", () => {
  const r = financeiroDasLinhas([], { temPagos: true, desdeDados: "2025-01-01", abertos: [], pagos: [] }, HOJE);
  assert.deepEqual(osDoQuadro([], r.porNumero, "aberto"), []);
  assert.deepEqual(osDoQuadro(null, null, "recebido"), []);
});
