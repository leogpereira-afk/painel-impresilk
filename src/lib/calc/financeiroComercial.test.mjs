import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoFinanceiroComercial } from './financeiroComercial.js';

const ordem = { id: 'a', numero: '9100', data: '2026-10-01', valor: 1800, sinalPago: 650 };
const fonte = { temPagos: true, desdeDados: '2025-01-01', consultadas: ['9100'], abertos: [{ id: 't1', os: '9100', valor: 1150, pago: 650 }], pagos: [] };

test('sinal já contido no título não é somado duas vezes', () => {
  assert.deepEqual(resumoFinanceiroComercial([ordem], fonte, '2026-10-07'), { 9100: { recebido: 650, saldo: 1150 } });
});

test('título quitado mostra recebido integral e saldo zero', () => {
  const paga = { ...fonte, abertos: [], pagos: [{ id: 't1', os: '9100', pago: 1800 }] };
  assert.deepEqual(resumoFinanceiroComercial([ordem], paga, '2026-10-07'), { 9100: { recebido: 1800, saldo: 0 } });
});

test('não afirma total com fonte incompleta, número não consultado ou título repartido', () => {
  for (const f of [
    { ...fonte, temPagos: false },
    { ...fonte, consultadas: [] },
    { ...fonte, desdeDados: '2026-11-01' },
    { ...fonte, abertos: [{ ...fonte.abertos[0], compartilhado: true }] },
    { ...fonte, abertos: [{ ...fonte.abertos[0], incerto: true }] },
    { ...fonte, abertos: [], pagos: [] },
  ]) assert.deepEqual(resumoFinanceiroComercial([ordem], f, '2026-10-07'), {});
});
