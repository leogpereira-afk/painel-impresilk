import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normOS } from '../netlify/functions/mubi-cache-background.mjs';

test('preserva o tipo comercial do ERP junto do valor líquido', () => {
  const o = normOS({ id: 1, tipo: 'Retrabalho', valor_total: 120, valor_desconto: 20 }, 0, new Map());
  assert.equal(o.tipo, 'Retrabalho');
  assert.equal(o.valor, 100);
  assert.equal(o.desconto, 20);
});

test('tipo ausente nunca é inventado como Normal', () => {
  assert.equal(normOS({ id: 2 }, 0, new Map()).tipo, '');
});

test('preserva sinal do ERP sem reduzir o valor comercial nem inventar dado ausente', () => {
  const o = normOS({ id: 1, valor_total: 110294.8, valor_desconto: 10294.8, valor_sinal: 65000 }, 0, new Map());
  assert.equal(o.valor, 100000);
  assert.equal(o.sinalPago, 65000);
  assert.equal(normOS({ id: 2 }, 0, new Map()).sinalPago, null);
  assert.equal(normOS({ id: 3, valor_sinal: 0 }, 0, new Map()).sinalPago, 0);
});
