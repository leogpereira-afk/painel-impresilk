/* OS TOTAIS DO TOPO DA TELA DE PERMUTAS.
 *
 *   node --test src/lib/calc/totaisPermutas.test.mjs
 *
 * O caso que define tudo aqui é o da base real de 19/08/2026: cinco permutas,
 * uma com saldo positivo e quatro negativas — e DUAS delas com crédito ZERO e
 * dezenas de milhares consumidos, porque o crédito nunca foi lançado.
 *
 * Somar os saldos daria −R$ 81 mil. Esse número não é crédito disponível nem
 * dívida: é a mistura de dois fatos opostos, e não responde nenhuma das três
 * perguntas que a direção faz ("quanto foi permutado", "quanto tenho para
 * gastar", "quanto passou do crédito").
 */
import test from "node:test";
import assert from "node:assert/strict";
import { totaisDasPermutas } from "./permutas.js";

/* A base real, com os números que aparecem na tela. */
const REAL = [
  { nome: "Maple Bear",     credito: 166695.03, consumido: 164456.91, saldo:   2238.12 },
  { nome: "Empominas",      credito: 100000.00, consumido: 102165.25, saldo:  -2165.25 },
  { nome: "Trajeto moveis", credito:   3335.00, consumido:   5789.21, saldo:  -2454.21 },
  { nome: "Inter TV",       credito:      0,    consumido:  22361.99, saldo: -22361.99 },
  { nome: "Vila 61",        credito:      0,    consumido:  56452.28, saldo: -56452.28 },
];

test("o total permutado é o que os parceiros deram", () => {
  assert.equal(totaisDasPermutas(REAL).permutado, 270030.03);
});

test("crédito a usar soma só os saldos POSITIVOS", () => {
  // Só a Maple Bear tem crédito sobrando. É esse o número que responde
  // "quanto tenho para gastar" — e ele não pode ser abatido pelas negativas.
  assert.equal(totaisDasPermutas(REAL).aUsar, 2238.12);
});

test("o que passou do crédito sai separado, e em positivo", () => {
  assert.equal(totaisDasPermutas(REAL).alemDoCredito, 83433.73);
});

test("NÃO devolve a soma dos saldos — seria −81 mil e não diria nada", () => {
  const t = totaisDasPermutas(REAL);
  const somaIngenua = REAL.reduce((n, p) => n + p.saldo, 0);
  assert.ok(Math.abs(somaIngenua + 81195.61) < 0.01, "confirma que a soma ingênua dá −81.195,61");
  // O que a tela mostra são os dois lados, e a diferença entre eles é a soma.
  assert.equal(Math.round((t.aUsar - t.alemDoCredito) * 100) / 100, -81195.61);
});

test("conta quantas permutas estão SEM CRÉDITO lançado", () => {
  /* É o aviso que impede o "além do crédito" de parecer prejuízo: Inter TV e
     Vila 61 não gastaram demais — ninguém lançou o crédito delas. */
  assert.equal(totaisDasPermutas(REAL).semCredito, 2);
});

test("permuta encerrada não entra nos totais, e é contada à parte", () => {
  const t = totaisDasPermutas([...REAL, { nome: "Antiga", credito: 500, consumido: 500, saldo: 0, encerrada: true }]);
  assert.equal(t.quantas, 5);
  assert.equal(t.encerradas, 1);
  assert.equal(t.permutado, 270030.03, "a encerrada não somou no permutado");
});

test("crédito zero SEM consumo não conta como pendência", () => {
  // Permuta recém-criada, ainda vazia: não é problema, é começo.
  const t = totaisDasPermutas([{ nome: "Nova", credito: 0, consumido: 0, saldo: 0 }]);
  assert.equal(t.semCredito, 0);
});

test("lista vazia devolve zeros, não estoura", () => {
  const t = totaisDasPermutas([]);
  assert.deepEqual(
    { q: t.quantas, p: t.permutado, a: t.aUsar, x: t.alemDoCredito },
    { q: 0, p: 0, a: 0, x: 0 },
  );
  assert.deepEqual(totaisDasPermutas(null).quantas, 0);
});

test("centavos fecham — nada de 0.1+0.2", () => {
  const t = totaisDasPermutas([
    { credito: 0.1, consumido: 0, saldo: 0.1 },
    { credito: 0.2, consumido: 0, saldo: 0.2 },
  ]);
  assert.equal(t.permutado, 0.3);
  assert.equal(t.aUsar, 0.3);
});
