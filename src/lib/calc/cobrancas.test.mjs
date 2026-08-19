/* Os casos que fazem a carteira de cobrança mentir.
 *   node --test src/lib/calc/cobrancas.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  chaveCliente, chamadosDoCliente, carteiraDeCobranca, resumoDaCarteira,
  ordenarCarteira, filtrarCarteira,
} from "./cobrancas.js";

const HOJE = "2026-08-19";
const t = (cliente, valor, dias = 10) => ({ cliente, valor, dias });

test("junta os títulos por cliente, somando valor e pegando o maior atraso", () => {
  const c = carteiraDeCobranca([t("Alfa", 100, 5), t("Alfa", 250, 40), t("Beta", 80, 3)], {}, HOJE);
  const alfa = c.find((x) => x.cliente === "Alfa");
  assert.equal(alfa.qtd, 2);
  assert.equal(alfa.valor, 350);
  assert.equal(alfa.maiorAtraso, 40);
});

test("acento e caixa não fazem dois clientes de um", () => {
  assert.equal(chaveCliente("Construções Alfa"), chaveCliente("CONSTRUCOES ALFA"));
  const c = carteiraDeCobranca([t("Construções Alfa", 100), t("CONSTRUCOES ALFA", 50)], {}, HOJE);
  assert.equal(c.length, 1);
  assert.equal(c[0].valor, 150);
});

test("PROMESSA VENCIDA vem primeiro, antes de quem nunca foi chamado e do valor", () => {
  const cob = {
    ALFA: { chamados: { a: { data: "2026-08-01", situacao: "prometeu", promessa: "2026-08-10" } } },
    GAMA: { chamados: { g: { data: "2026-08-18", situacao: "negociar" } } },
  };
  // Beta é o maior valor e nunca foi chamado; Alfa quebrou a promessa.
  const c = carteiraDeCobranca([t("Alfa", 100), t("Beta", 9000), t("Gama", 5000)], cob, HOJE);
  assert.deepEqual(c.map((x) => x.cliente), ["Alfa", "Beta", "Gama"]);
  assert.equal(c[0].promessaVencida, true);
  assert.equal(c[1].semChamado, true);
});

test("promessa que ainda não venceu NÃO é quebrada — é para esperar, não ligar", () => {
  const cob = { ALFA: { chamados: { a: { data: "2026-08-18", situacao: "prometeu", promessa: "2026-08-25" } } } };
  const [alfa] = carteiraDeCobranca([t("Alfa", 100)], cob, HOJE);
  assert.equal(alfa.promessaVencida, false);
  assert.equal(alfa.semChamado, false);
});

test("prometeu SEM data não vira promessa vencida", () => {
  // Senão todo "prometeu" sem data cairia no topo para sempre.
  const cob = { ALFA: { chamados: { a: { data: "2026-01-01", situacao: "prometeu" } } } };
  assert.equal(carteiraDeCobranca([t("Alfa", 100)], cob, HOJE)[0].promessaVencida, false);
});

test("o último chamado é o mais recente, não o último gravado", () => {
  const cob = { ALFA: { chamados: {
    z: { data: "2026-08-01", resumo: "velho" },
    a: { data: "2026-08-15", resumo: "novo" },
  } } };
  const [alfa] = carteiraDeCobranca([t("Alfa", 100)], cob, HOJE);
  assert.equal(alfa.ultimo.resumo, "novo");
  assert.equal(alfa.chamados.length, 2);
  assert.equal(alfa.diasSemContato, 4);
});

test("cliente com chamado mas SEM dívida não aparece na carteira", () => {
  // A carteira é dos títulos vencidos. Quem pagou sai, mesmo com histórico.
  const cob = { ALFA: { chamados: { a: { data: "2026-08-01" } } } };
  assert.deepEqual(carteiraDeCobranca([t("Beta", 50)], cob, HOJE).map((c) => c.cliente), ["Beta"]);
});

test("título sem nome de cliente é descartado, não vira cartão fantasma", () => {
  const c = carteiraDeCobranca([t("", 100), t("  ", 50), t("Alfa", 10)], {}, HOJE);
  assert.deepEqual(c.map((x) => x.cliente), ["Alfa"]);
});

test("o resumo separa o que muda a ação de hoje", () => {
  const cob = {
    ALFA: { chamados: { a: { data: "2026-08-01", situacao: "prometeu", promessa: "2026-08-10" } } },
    GAMA: { chamados: { g: { data: "2026-08-18", situacao: "prometeu", promessa: "2026-08-30" } } },
  };
  const r = resumoDaCarteira(carteiraDeCobranca(
    [t("Alfa", 100), t("Beta", 200), t("Gama", 400)], cob, HOJE));
  assert.equal(r.clientes, 3);
  assert.equal(r.total, 700);
  assert.equal(r.quebradas, 1);       assert.equal(r.valorQuebrado, 100);
  assert.equal(r.semChamado, 1);      assert.equal(r.valorSemChamado, 200);
  assert.equal(r.aguardando, 1);      assert.equal(r.valorAguardando, 400);
});

test("carteira vazia não quebra o resumo", () => {
  const r = resumoDaCarteira(carteiraDeCobranca([], {}, HOJE));
  assert.deepEqual([r.clientes, r.total, r.quebradas], [0, 0, 0]);
});

test("chamado sem campo nenhum não vira NaN nem undefined na tela", () => {
  const cs = chamadosDoCliente({ chamados: { a: {} } });
  assert.equal(cs.length, 1);
  assert.deepEqual([cs[0].data, cs[0].canal, cs[0].resumo], ["", "", ""]);
});

// ------------------------------------------------------ ordenar e filtrar

const tv = (cliente, valor, dias, venc) => ({ cliente, valor, dias, vencimento: venc });

test("cada ordem responde a uma pergunta diferente", () => {
  const cob = { BETA: { chamados: { b: { data: "2026-08-18" } } } };
  const c = carteiraDeCobranca(
    [tv("Alfa", 100, 200, "2026-01-10"), tv("Alfa", 100, 5, "2026-08-10"),
     tv("Beta", 900, 10, "2026-08-05"), tv("Gama", 500, 3, "2026-08-15")],
    cob, HOJE);
  assert.deepEqual(ordenarCarteira(c, "valor").map((x) => x.cliente), ["Beta", "Gama", "Alfa"]);
  assert.deepEqual(ordenarCarteira(c, "titulos").map((x) => x.cliente)[0], "Alfa");
  assert.deepEqual(ordenarCarteira(c, "atraso").map((x) => x.cliente)[0], "Alfa");
});

test("quem nunca foi contatado é o MAIS esquecido, e nunca o mais recente", () => {
  // Tratar "sem contato" como zero dias inverteria os dois.
  const cob = { BETA: { chamados: { b: { data: "2026-08-18" } } } };
  const c = carteiraDeCobranca([tv("Alfa", 100, 5, "2026-08-01"), tv("Beta", 900, 5, "2026-08-01")], cob, HOJE);
  assert.equal(ordenarCarteira(c, "recente")[0].cliente, "Beta", "Beta falou ontem");
  assert.equal(ordenarCarteira(c, "esquecido")[0].cliente, "Alfa", "Alfa nunca foi chamado");
});

test("buscar por nome ignora acento e caixa", () => {
  const c = carteiraDeCobranca([tv("Construções Alfa", 100, 5, "2026-08-01"), tv("Beta", 50, 5, "2026-08-01")], {}, HOJE);
  assert.deepEqual(filtrarCarteira(c, { termo: "construcoes" }).map((x) => x.cliente), ["Construções Alfa"]);
  assert.deepEqual(filtrarCarteira(c, { termo: "a" }).length, 2, "termo curto não filtra");
});

test("o filtro de data RECONTA o cartão, não só esconde cliente", () => {
  // Se apenas escondesse, o valor mostrado seria o da dívida inteira e a soma
  // da tela não fecharia com a lista.
  const c = carteiraDeCobranca(
    [tv("Alfa", 100, 200, "2025-01-10"), tv("Alfa", 400, 5, "2026-08-10")], {}, HOJE);
  assert.equal(c[0].valor, 500);
  const so2026 = filtrarCarteira(c, { de: "2026-01-01" });
  assert.equal(so2026[0].valor, 400);
  assert.equal(so2026[0].qtd, 1);
  assert.equal(so2026[0].maiorAtraso, 5, "o maior atraso também é recontado");
});

test("cliente sem nenhum título no período SAI da lista", () => {
  const c = carteiraDeCobranca(
    [tv("Alfa", 100, 5, "2026-08-10"), tv("Beta", 900, 900, "2021-01-01")], {}, HOJE);
  assert.deepEqual(filtrarCarteira(c, { de: "2026-01-01" }).map((x) => x.cliente), ["Alfa"]);
});

test("título sem vencimento não sobrevive a um filtro de data", () => {
  // Sem data não dá para afirmar que está no período: incluir seria inventar.
  const c = carteiraDeCobranca([{ cliente: "Alfa", valor: 100, dias: 5 }], {}, HOJE);
  assert.equal(c.length, 1);
  assert.equal(filtrarCarteira(c, { de: "2020-01-01" }).length, 0);
  assert.equal(filtrarCarteira(c, {}).length, 1, "sem filtro ele continua lá");
});
