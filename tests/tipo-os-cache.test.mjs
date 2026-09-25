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
