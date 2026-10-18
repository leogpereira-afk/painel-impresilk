import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { installationOrdersPage } from '../supabase/functions/_shared/acm-installation-orders.mjs';
import { respostaComercial } from '../src/review/comercial.mjs';
const require = createRequire(import.meta.url), { buildSync } = createRequire(require.resolve('vite'))('esbuild');
const source = readFileSync(new URL('../supabase/functions/painel-comercial/index.ts', import.meta.url), 'utf8').replace(/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m, 'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code = buildSync({ stdin: { contents: source, loader: 'ts', resolveDir: fileURLToPath(new URL('../supabase/functions/painel-comercial/', import.meta.url)) }, bundle: true, write: false, format: 'iife', platform: 'node' }).outputFiles[0].text;
const fixture = (id, seller = 'Ana Exemplo', company = 'Empresa de demonstração') => ({ id, numero: '900001', cliente: 'Loja de demonstração', data: '2026-10-01', vendedor: seller, comercial: { empresaNome: company, tipo: 'Normal', clienteId: 'cliente-exemplo', segredo: 'não retornar' } });
function setup() {
  let handler, session = { sub: 'ana-exemplo', perms: ['orcamentos'] }, revoked = false, unavailable = false;
  const catalog = { completo: true, vendedores: [{ id: '101', nome: 'Ana Exemplo' }, { id: '102', nome: 'Beatriz Exemplo' }] };
  const rows = [fixture('erp-a'), fixture('erp-b', 'Beatriz Exemplo')], calls = [], writes = [];
  const db = { painel_cache: [{ chave: 'comercial_catalogo', valor: catalog }], painel_registros: [{ colecao: 'comercial_config', id: 'regras', registro: { vinculos: { 'ana-exemplo': '101', 'beatriz-exemplo': '102' } } }], painel_ordens: rows };
  const sb = {
    from(table) {
      let selected = db[table] || [];
      const operations = []; calls.push({ table, operations });
      const q = {
        select(fields) { operations.push(['select', fields]); return q; },
        eq(key, value) { operations.push(['eq', key, value]); selected = selected.filter(row => String(row[key]) === String(value)); return q; },
        ilike(key, pattern) { operations.push(['ilike', key, pattern]); const literal = pattern.slice(1, -1).toLowerCase(); selected = selected.filter(row => String(row[key]).toLowerCase().includes(literal)); return q; },
        order(key, options) { operations.push(['order', key, options]); return q; },
        range(start, end) { operations.push(['range', start, end]); return Promise.resolve(unavailable ? { error: {} } : { data: structuredClone(selected.slice(start, end + 1)) }); },
        maybeSingle() { return Promise.resolve(unavailable ? { error: {} } : { data: structuredClone(selected[0] || null) }); },
        insert(value) { writes.push(value); throw new Error('Consulta tentou escrever'); },
        update(value) { writes.push(value); throw new Error('Consulta tentou escrever'); },
      }; return q;
    },
    rpc(...args) { writes.push(args); throw new Error('Consulta tentou RPC'); },
  };
  vm.runInNewContext(code, { createClient: () => sb, verificarJwt: async () => session, crachaRevogado: async () => revoked, Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } }, Response, Request, crypto, TextEncoder, console });
  return { rows, calls, writes, catalog, session(value) { session = value; }, revoke() { revoked = true; }, fail() { unavailable = true; }, async call(body = {}, auth = true) { const result = await handler(new Request('http://local.test', { method: 'POST', headers: auth ? { authorization: 'Bearer test' } : {}, body: JSON.stringify({ action: 'consultarOrdensInstalacao', busca: 'Loja de demonstração', ...body }) })); return { status: result.status, ...await result.json() }; } };
}

test('ação real exige sessão, módulo orcamentos, vínculo oficial e crachá ativo', async () => {
  const env = setup();
  assert.equal((await env.call({}, false)).status, 401);
  env.session({ sub: 'acm-exemplo', perms: ['ferramenta-ia'] }); assert.equal((await env.call()).status, 403);
  assert.equal(env.calls.length, 0);
  env.session({ sub: 'sem-vinculo', perms: ['orcamentos'] }); assert.equal((await env.call()).status, 403);
  env.revoke(); assert.equal((await env.call()).status, 401); assert.equal(env.writes.length, 0);
});
test('carteira é aplicada antes da página e ID do vendedor prevalece sobre nome legado', async () => {
  const env = setup();
  env.rows.splice(0, 2, ...Array.from({ length: 30 }, (_, i) => fixture(`alheia-${i}`, 'Beatriz Exemplo')), fixture('propria-apos-30'));
  env.rows.push({ ...fixture('id-alheio-com-nome-proprio'), comercial: { empresaNome: 'Empresa de demonstração', vendedorErpId: '102' } });
  const result = await env.call();
  assert.equal(result.status, 200); assert.equal(result.total, 1); assert.equal(result.orders[0].id, 'propria-apos-30');
  assert.equal(JSON.stringify(result).includes('alheia'), false); assert.equal(JSON.stringify(result).includes('segredo'), false);
  assert.equal((await env.call({ filtro: { vendedor: '102' } })).status, 403); assert.equal(env.writes.length, 0);
});
test('falta de ID, número, cliente ou empresa exclui vínculo; mesmo número preserva identidades separadas', async () => {
  const env = setup(); env.session({ sub: 'gestor', master: true });
  env.rows.push(fixture('sem-empresa', 'Ana Exemplo', null), { ...fixture(''), numero: '900001' }, { ...fixture('sem-numero'), numero: '' }, { ...fixture('sem-cliente'), cliente: '' }, fixture('erp-c', 'Ana Exemplo', 'Outra empresa de demonstração'));
  const result = await env.call({ busca: '#900001' });
  assert.equal(result.status, 200); assert.deepEqual(result.orders.map(row => row.id), ['erp-a', 'erp-b', 'erp-c']);
  assert.deepEqual(Object.keys(result.orders[0]).sort(), ['client', 'company', 'id', 'number', 'source']);
  assert.notEqual(result.orders[0].company, result.orders[2].company);
});
test('consulta é limitada por termo no SQL, usa máximo 501 candidatos e não busca histórico/cache completo', async () => {
  const env = setup(); await env.call();
  const orderQueries = env.calls.filter(call => call.table === 'painel_ordens'); assert.equal(orderQueries.length, 1);
  assert.ok(orderQueries[0].operations.some(operation => operation[0] === 'ilike' && operation[2] === '%Loja de demonstração%'));
  assert.deepEqual(orderQueries[0].operations.at(-1), ['range', 0, 500]);
  assert.ok(env.calls.filter(call => call.table === 'painel_cache').every(call => call.operations.some(operation => operation[0] === 'eq' && operation[2] === 'comercial_catalogo')));
  const query = await env.call({ busca: '900001' }); assert.equal(query.status, 200);
  assert.ok(env.calls.filter(call => call.table === 'painel_ordens').at(-1).operations.some(operation => operation[0] === 'eq' && operation[1] === 'numero' && operation[2] === '900001'));
});
test('busca ampla não retorna página parcial; curingas e paginação inválida não chegam à tabela', async () => {
  const env = setup();
  for (const body of [{ busca: '%' }, { busca: 'Loja%' }, { busca: 'Loja*' }, { busca: 'Loja_' }, { busca: '\\Loja' }, { busca: {} }, { busca: 'ab' }, { pagina: -1 }, { pagina: 1.5 }, { pagina: 26 }]) assert.equal((await env.call(body)).status, 400);
  assert.equal(env.calls.length, 0);
  env.rows.splice(0, 2, ...Array.from({ length: 501 }, (_, i) => fixture(`ampla-${i}`)));
  const result = await env.call(); assert.equal(result.status, 422); assert.equal(result.orders, undefined);
});
test('páginas incluem apenas identidades autorizadas; fonte indisponível não vira resultado vazio', async () => {
  const env = setup(); env.rows.splice(0, 2, ...Array.from({ length: 43 }, (_, i) => fixture(`propria-${i}`)), ...Array.from({ length: 12 }, (_, i) => fixture(`sem-empresa-${i}`, 'Ana Exemplo', '')));
  const first = await env.call(), last = await env.call({ pagina: 3 });
  assert.equal(first.total, 43); assert.equal(first.orders.length, 20); assert.equal(last.orders.length, 3); assert.equal((await env.call({ pagina: 4 })).status, 400);
  env.fail(); const fail = await env.call(); assert.equal(fail.status, 503); assert.equal(fail.orders, undefined);
});
test('prévia usa fixtures existentes, respeita carteira e permite consultar o ID selecionado', async () => {
  const session = { sub: 'ana-exemplo', perms: ['orcamentos'] };
  const denied = respostaComercial({ action: 'consultarOrdensInstalacao', busca: 'Horizonte' }, { sub: 'sem-permissao', perms: ['ferramenta-ia'] }); assert.equal(denied.status, 403);
  const response = respostaComercial({ action: 'consultarOrdensInstalacao', busca: 'Horizonte' }, session), result = await response.json();
  assert.equal(response.status, 200); assert.ok(result.orders.length); assert.ok(result.orders.every(row => row.source === 'painel-os' && row.client.includes('exemplo')));
  const order = result.orders.find(row => row.company === 'Impresilk');
  const detailResponse = respostaComercial({ action: 'consultarPedido', ordemId: order.id }, session), detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200); assert.equal(detail.pedido.id, order.id);
  const other = respostaComercial({ action: 'consultarOrdensInstalacao', busca: 'Aurora' }, session); assert.equal((await other.json()).total, 0);
});
test('normalização do servidor preserva empresa em ID repetido e ignora empresa inferida', () => {
  const result = installationOrdersPage([fixture('id'), fixture('id', 'Ana Exemplo', 'Outra empresa'), fixture('sem-empresa', 'Ana Exemplo', null)], { ids: null }, { busca: '900001' });
  assert.equal(result.total, 2); assert.deepEqual(result.orders.map(order => order.company), ['Empresa de demonstração', 'Outra empresa']);
});
test('identidade conflitante não escolhe silenciosamente um alias de empresa nem a última duplicata', () => {
  const base = fixture('id-ambiguo');
  const conflicting = [
    { ...fixture('empresas'), comercial: { empresaNome: 'Empresa A', empresa_nome: 'Empresa B' } },
    { ...fixture('ids-empresa'), comercial: { empresaNome: 'Empresa A', empresaId: '1', empresa: { nome: 'Empresa A', id: '2' } } },
    { ...fixture('id-cabecalho'), comercial: { empresaNome: 'Empresa A', id: 'id-divergente' } },
    base, { ...base, cliente: 'Loja de demonstração diferente' }, base,
  ];
  assert.equal(installationOrdersPage(conflicting, { ids: null }, { busca: '900001' }).total, 0);
});
