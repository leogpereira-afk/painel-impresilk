import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url), { transformSync } = createRequire(require.resolve('vite'))('esbuild');
const source = readFileSync(new URL('../supabase/functions/painel-cache/index.ts', import.meta.url), 'utf8').replace(/^import.*createClient.*\n/m, 'const createClient = globalThis.createClient;\n');
const code = transformSync(source, { loader: 'ts', format: 'iife' }).code;
function setup() {
  let handler, fail = false, removeBeforeUpdate = false;
  const ordens = [{ id: '1', valor: 90, bruto: 100, desconto: 10, itens: [{ produto: 'Lona', categoria: 'Comunicação visual' }], comercial: { tipo: 'Normal', clienteId: 'c1', valorConfirmado: true } }], writes = [];
  const sb = { from(table) { assert.equal(table, 'painel_ordens'); return {
    select(fields) { assert.equal(fields, 'id,comercial'); return { async in(k, ids) { assert.equal(k, 'id'); return fail ? { error: { message: 'Falha de leitura' } } : { data: ordens.filter((o) => ids.includes(o.id)).map((o) => ({ id: o.id, comercial: o.comercial })) }; } }; },
    update(changes) { return { eq(k, id) { assert.equal(k, 'id'); return { async select(fields) {
      assert.equal(fields, 'id'); if (removeBeforeUpdate) ordens.splice(0, ordens.length);
      writes.push({ id, ...structuredClone(changes) }); const row = ordens.find((o) => o.id === id);
      if (row) Object.assign(row, structuredClone(changes)); return { data: row ? [{ id }] : [] };
    } }; } }; },
  }; } };
  vm.runInNewContext(code, { Deno: { env: { get: () => 'test' }, serve: (fn) => handler = fn }, createClient: () => sb, Response, console });
  return { ordens, writes, fail: () => fail = true, removeBeforeUpdate: () => removeBeforeUpdate = true, async call(body, token = 'test') {
    const r = await handler(new Request('https://local', { method: 'POST', headers: { 'x-token': token }, body: JSON.stringify({ action: 'ordensComercialCanceladas', ...body }) })); return { status: r.status, ...await r.json() };
  } };
}
test('marcação exige token de cache e não cria cancelada inexistente nem altera outros campos', async () => {
  const t = setup(), original = structuredClone(t.ordens[0]);
  assert.equal((await t.call({ ids: ['1'] }, 'invalido')).status, 401); assert.equal(t.writes.length, 0);
  const r = await t.call({ ids: ['1', 'ausente', '1'] }); assert.equal(r.marcadas, 1); assert.equal(t.ordens.length, 1);
  assert.deepEqual(t.ordens[0], { ...original, comercial: { ...original.comercial, cancelada: true }, atualizado_em: t.ordens[0].atualizado_em });
  assert.ok(Date.parse(t.ordens[0].atualizado_em));
  assert.deepEqual(Object.keys(t.writes[0]).sort(), ['atualizado_em', 'comercial', 'id']);
});
test('remoção concorrente nunca recria a O.S. cancelada', async () => {
  const t = setup(); t.removeBeforeUpdate(); const r = await t.call({ ids: ['1'] });
  assert.equal(r.status, 200); assert.equal(r.marcadas, 0); assert.equal(t.ordens.length, 0);
});
test('falha de leitura não vira sucesso nem gera escrita e lote excessivo é recusado', async () => {
  const t = setup(); t.fail(); assert.equal((await t.call({ ids: ['1'] })).status, 500); assert.equal(t.writes.length, 0);
  assert.equal((await t.call({ ids: Array.from({ length: 501 }, (_, i) => String(i)) })).status, 413);
});
