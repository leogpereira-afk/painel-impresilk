import test from 'node:test';
import assert from 'node:assert/strict';
import { consultInstallationOrder, installationOrderKey, latestInstallationRequest, linkInstallationOrder, searchInstallationOrders } from '../../services/acm-installation-orders.js';

const sample = { source: 'painel-os', id: 'erp-example-1', number: '900001', client: 'Cliente de demonstração', company: 'Empresa de demonstração' };
test('vínculo guarda identidade tipada e empresa; número igual não identifica outra O.S.', () => {
  const link = linkInstallationOrder({ ...sample, ignored: 'não persistir' }, '2026-10-17T12:00:00Z');
  assert.deepEqual(link, { ...sample, linkedAt: '2026-10-17T12:00:00Z' });
  assert.notEqual(installationOrderKey(sample), installationOrderKey({ ...sample, id: 'outro-id' }));
  assert.notEqual(installationOrderKey(sample), installationOrderKey({ ...sample, company: 'Outra empresa de demonstração' }));
  for (const invalid of [{ ...sample, id: '' }, { ...sample, company: '' }, { ...sample, source: 'numero-os' }, { ...sample, id: {} }]) assert.throws(() => linkInstallationOrder(invalid));
});
test('busca usa somente a ação autorizada, com AbortSignal, e recusa resultados sem empresa', async () => {
  const signal = new AbortController().signal, calls = [];
  const request = async (...args) => { calls.push(args); return { source: 'painel-os', orders: [sample], page: 2, pages: 3, total: 44 }; };
  assert.equal((await searchInstallationOrders('Cliente de demonstração', 2, signal, request)).orders[0], sample);
  assert.deepEqual(calls, [['consultarOrdensInstalacao', { busca: 'Cliente de demonstração', pagina: 2 }, signal]]);
  await assert.rejects(searchInstallationOrders('900001', 1, signal, async () => ({ source: 'painel-os', orders: [{ ...sample, company: '' }] })), /identidade verificável/);
});
test('consulta de origem usa ID da O.S., nunca o número, e recusa outra identidade', async () => {
  const calls = [], request = async (...args) => { calls.push(args); return { pedido: { id: sample.id, numero: sample.number } }; };
  assert.equal((await consultInstallationOrder(sample, undefined, request)).companyVerified, false);
  assert.deepEqual(calls, [['consultarPedido', { ordemId: sample.id }, undefined]]);
  await assert.rejects(consultInstallationOrder(sample, undefined, async () => ({ pedido: { id: 'outro-id', numero: sample.number } })), /não corresponde/);
  await assert.rejects(consultInstallationOrder(sample, undefined, async () => ({ pedido: { id: sample.id, empresaNome: 'Outra empresa' } })), /empresa.*diverge/);
  assert.equal((await consultInstallationOrder(sample, undefined, async () => ({ pedido: { id: sample.id, empresaNome: sample.company } }))).companyVerified, true);
});
test('resposta antiga não substitui busca nova mesmo quando transporte ignora abort', async () => {
  const latest = latestInstallationRequest(); let finishOld, oldSignal;
  const old = latest.run(signal => { oldSignal = signal; return new Promise(resolve => { finishOld = resolve; }); });
  const current = await latest.run(async () => 'nova consulta');
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(current, { current: true, value: 'nova consulta' });
  finishOld('consulta antiga');
  assert.deepEqual(await old, { current: false });
});
test('limpar, trocar texto ou desmontar invalida inclusive erros atrasados', async () => {
  const latest = latestInstallationRequest(); let fail;
  const pending = latest.run(() => new Promise((_, reject) => { fail = reject; }));
  latest.cancel(); fail(new Error('erro da busca removida'));
  assert.deepEqual(await pending, { current: false });
  const result = await latest.run(async () => { throw new Error('erro atual'); });
  assert.equal(result.current, true); assert.equal(result.error.message, 'erro atual');
});
