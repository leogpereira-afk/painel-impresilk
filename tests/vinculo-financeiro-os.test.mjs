import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numerosDeOSComercial } from '../supabase/functions/_shared/vinculo-financeiro-os.mjs';

test('empréstimo que cita O.S. não quita venda do cliente', () => {
  for (const texto of ['EMPRESTIMO REF OS 12345', 'Empréstimos O.S. 12345', 'APORTE REF OS 12345', 'Transferência entre contas ref OS 12345']) {
    assert.deepEqual(numerosDeOSComercial(texto), []);
  }
});
test('número de nota sem O.S. não vira vínculo por coincidência', () => {
  for (const texto of ['Nota fiscal nº 12345 (sem O.S.)', 'NOTA FISCAL 12345', 'PIX SEM O.S', 'BOLETO FORNECEDOR 12345']) {
    assert.deepEqual(numerosDeOSComercial(texto), []);
  }
});
test('recebimento comercial simples, compartilhado ou antecipado mantém o vínculo', () => {
  assert.deepEqual(numerosDeOSComercial('12345'), ['12345']);
  assert.deepEqual(numerosDeOSComercial('12345-12346 / 12347, 12345'), ['12345', '12346', '12347']);
  assert.deepEqual(numerosDeOSComercial('referente a OS 12345 E 12346 -'), ['12345', '12346']);
  assert.deepEqual(numerosDeOSComercial('antecipacao - os 12345 - 12346 -'), ['12345', '12346']);
  assert.deepEqual(numerosDeOSComercial('OS 12345 nota fiscal 54321 em 25/09/2026'), ['12345']);
  assert.deepEqual(numerosDeOSComercial('OS 12345 e OS 12346'), ['12345', '12346']);
  assert.deepEqual(numerosDeOSComercial('Transferência bancária referente à OS 12345'), ['12345']);
});
