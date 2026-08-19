/* A REGRA DO PAGAMENTO PARCIAL, com os números reais do ERP.
 *   node --test netlify/functions/recebivel.test.mjs
 *
 * Existe porque o painel cobrava R$ 28.000 de um cliente que devia R$ 7.000.
 * Se alguém voltar a usar `valor_titulo` cru, isto reprova antes da tela.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { normRecebivel } from "./mubi-cache-background.mjs";

test("o valor é o que RESTA, não o do título", () => {
  // ZEROTRINTAEOITOBURGUER, real: 28.000 com 21.000 pagos.
  const r = normRecebivel({ id: 1, valor_titulo: 28000, pagamentos: [{ valor: 21000 }] }, 0);
  assert.equal(r.valor, 7000);
  assert.equal(r.valorTitulo, 28000);
  assert.equal(r.pago, 21000);
});

test("soma TODAS as parcelas pagas, não só a última", () => {
  // FCO UNIDADE 1: 16.000 com três parcelas de 1.777,78.
  const r = normRecebivel(
    { id: 2, valor_titulo: 16000, pagamentos: [{ valor: 1777.78 }, { valor: 1777.78 }, { valor: 1777.77 }] }, 0);
  assert.equal(r.pago, 5333.33);
  assert.equal(r.valor, 10666.67);
});

test("a LISTA manda sobre o campo do topo", () => {
  // VITTASAUDE real: valor_pagamento diz 1.500 e a lista soma 4.500.
  const r = normRecebivel(
    { id: 3, valor_titulo: 6000, valor_pagamento: 1500,
      pagamentos: [{ valor: 1500 }, { valor: 1500 }, { valor: 1500 }] }, 0);
  assert.equal(r.pago, 4500, "somar o topo cobraria R$ 3.000 a mais");
  assert.equal(r.valor, 1500);
});

test("sem a lista, o campo do topo entra como rede", () => {
  const r = normRecebivel({ id: 4, valor_titulo: 1000, valor_pagamento: 400, pagamentos: [] }, 0);
  assert.equal(r.pago, 400);
  assert.equal(r.valor, 600);
});

test("título sem pagamento nenhum vale o título inteiro", () => {
  const r = normRecebivel({ id: 5, valor_titulo: 900 }, 0);
  assert.equal(r.pago, 0);
  assert.equal(r.valor, 900);
});

test("pagamento MAIOR que o título dá zero, nunca negativo", () => {
  // Acontece quando o cliente paga com juros e multa por fora. Negativo viraria
  // um crédito que a tela somaria ao contrário, diminuindo a dívida dos outros.
  const r = normRecebivel({ id: 6, valor_titulo: 100, pagamentos: [{ valor: 130 }] }, 0);
  assert.equal(r.valor, 0);
  assert.equal(r.pago, 130);
});

test("pagamento com valor sujo não vira NaN", () => {
  const r = normRecebivel({ id: 7, valor_titulo: 500, pagamentos: [{ valor: null }, { valor: "abc" }] }, 0);
  assert.equal(r.valor, 500);
  assert.equal(r.pago, 0);
});
