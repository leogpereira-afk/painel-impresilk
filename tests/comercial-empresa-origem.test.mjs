import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { normOS, normOrcamento } from '../scripts/lib/mubi-cache.mjs';
import { ordemComercialParaTabela } from '../scripts/lib/carga-comercial.mjs';

const require = createRequire(import.meta.url), { transformSync } = createRequire(require.resolve('vite'))('esbuild');
const source = readFileSync(new URL('../supabase/functions/painel-cache/index.ts', import.meta.url), 'utf8')
  .replace(/^import.*createClient.*\n/m, 'const createClient = globalThis.createClient;\n');
const code = transformSync(source, { loader: 'ts', format: 'iife' }).code;
const bruto = (extra = {}) => ({ id: 'os-exemplo', cliente_id: 'cliente-exemplo', cliente: 'Comprador Exemplo', vendedor: 'Vendedora Exemplo', tipo: 'Normal', status: 'ABERTO', data_cadastro: '2026-10-01', data_aprovacao:'2026-10-02', valor_total: 100, valor_desconto: 10, ...extra });

function ambiente(anteriores = []) {
  let handler, falhaLeitura = false;
  const banco = new Map(anteriores.map(o => [o.id, structuredClone(o)])), gravacoes = [], consultas = [];
  const sb = { from(tabela) {
    assert.equal(tabela, 'painel_ordens');
    return {
      select(campos) { assert.equal(campos, 'id,comercial'); return { async in(campo, ids) {
        assert.equal(campo, 'id'); consultas.push([...ids]);
        return falhaLeitura ? { error: {} } : { data: ids.filter(id => banco.has(id)).map(id => structuredClone(banco.get(id))) };
      } }; },
      async upsert(linhas, opcoes) {
        assert.equal(opcoes.onConflict, 'id');
        for (const linha of linhas) { const copia = structuredClone(linha); gravacoes.push(copia); banco.set(linha.id, { ...banco.get(linha.id), ...copia }); }
        return { error: null };
      },
    };
  } };
  vm.runInNewContext(code, { Deno: { env: { get: () => 'test' }, serve: fn => handler = fn }, createClient: () => sb, Response, console });
  return { banco, gravacoes, consultas, falhar: () => falhaLeitura = true, async enviar(linhas, token = 'test') {
    const r = await handler(new Request('https://local', { method: 'POST', headers: { 'x-token': token }, body: JSON.stringify({ action: 'ordens', linhas }) }));
    return { status: r.status, ...await r.json() };
  } };
}

test('O.S. e orçamento preservam apenas a empresa explicitamente informada pela origem', () => {
  for (const normalizar of [o => normOS(o, 0, new Map()), o => normOrcamento(o, 0)]) {
    const a = normalizar(bruto({ empresa: '  Empresa Alfa  ' }));
    assert.equal(a.empresaNome, 'Empresa Alfa'); assert.equal(a.empresaId, null);
    const b = normalizar(bruto({ empresa: 'Empresa Beta' }));
    assert.equal(b.empresaNome, 'Empresa Beta');
    // Cliente, vendedor, nome da conta e um campo de ID não medido não provam empresa.
    const legado = normalizar(bruto({ cliente: 'Empresa Alfa', empresa_id: '123' }));
    assert.equal(Object.hasOwn(legado, 'empresaNome'), false);
    assert.equal(Object.hasOwn(legado, 'empresaId'), false);
    for (const empresa of ['', null, { nome: 'Empresa Alfa' }, 123]) assert.equal(normalizar(bruto({ empresa })).empresaNome, null);
  }
});

test('carga comercial e função de cache conservam empresas distintas e valores da mesma O.S.', async () => {
  const t = ambiente();
  const linhas = ['Empresa Alfa', 'Empresa Beta'].map((empresa, i) => ordemComercialParaTabela(normOS(bruto({ id: 'os-' + i, empresa }), i, new Map())));
  const r = await t.enviar(linhas);
  assert.equal(r.status, 200); assert.equal(r.gravadas, 2);
  assert.deepEqual([...t.banco.values()].map(o => o.comercial.empresaNome), ['Empresa Alfa', 'Empresa Beta']);
  assert.ok([...t.banco.values()].every(o => o.valor === 90 && o.bruto === 100 && o.desconto === 10 && o.comercial.empresaId === null));
  assert.equal(t.consultas.length, 0);
  assert.equal((await t.enviar(linhas, 'incorreto')).status, 401);
});

test('lote legado sem identificação não apaga empresa já confirmada nem inventa a de registro novo', async () => {
  const t = ambiente([{ id: 'existente', comercial: { tipo: 'Normal', empresaNome: 'Empresa Alfa', empresaId: null } }]);
  const linhas = ['existente', 'novo'].map(id => ordemComercialParaTabela(normOS(bruto({ id }), 0, new Map())));
  assert.equal((await t.enviar(linhas)).status, 200);
  assert.equal(t.banco.get('existente').comercial.empresaNome, 'Empresa Alfa');
  assert.equal(Object.hasOwn(t.banco.get('novo').comercial, 'empresaNome'), false);
  assert.deepEqual(t.consultas, [['existente', 'novo']]);
});

test('origem explicitamente vazia invalida identidade anterior; falha ao preservá-la bloqueia escrita', async () => {
  const inicial = [{ id: 'existente', comercial: { tipo: 'Normal', empresaNome: 'Empresa Alfa' } }];
  const t = ambiente(inicial), linha = ordemComercialParaTabela(normOS(bruto({ id: 'existente', empresa: '' }), 0, new Map()));
  assert.equal((await t.enviar([linha])).status, 200); assert.equal(t.banco.get('existente').comercial.empresaNome, null);
  const f = ambiente(inicial); f.falhar();
  const legado = ordemComercialParaTabela(normOS(bruto({ id: 'existente' }), 0, new Map()));
  assert.equal((await f.enviar([legado])).status, 500); assert.equal(f.gravacoes.length, 0);
  assert.equal(f.banco.get('existente').comercial.empresaNome, 'Empresa Alfa');
});

test('carga incremental também transporta empresa no JSON comercial sem alterar itens', async () => {
  const arquivo = readFileSync(new URL('../scripts/carregar-cache.mjs', import.meta.url), 'utf8');
  const inicio = arquivo.indexOf('async function gravarOrdensTabela('), fim = arquivo.indexOf('// Janela de 7 dias', inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  const enviados = [], contexto = {
    console, chaveCliente: nome => nome.toUpperCase(), valorDaOS: o => o.valor,
    chamar: async b => { enviados.push(structuredClone(b)); return { gravadas: b.linhas.length }; },
  };
  vm.createContext(contexto); vm.runInContext(arquivo.slice(inicio, fim), contexto);
  const ordem = normOS(bruto({ empresa: 'Empresa Alfa', itens: [{ item: 'Produto Exemplo', quantidade: 2, valor_final: 100 }] }), 0, new Map());
  await contexto.gravarOrdensTabela([ordem]);
  assert.equal(enviados[0].linhas[0].comercial.empresaNome, 'Empresa Alfa');
  assert.equal(enviados[0].linhas[0].comercial.empresaId, null);
  assert.deepEqual(enviados[0].linhas[0].itens, ordem.itens);
});
test('aprovação sobrevive à projeção do cache e a escritor antigo sem o campo',async()=>{
 const t=ambiente([{id:'x',comercial:{tipo:'Normal',empresaNome:'Empresa Alfa',dataAprovacao:'2026-10-02'}}]);
 const linha={id:'x',valor:90,bruto:100,desconto:10,comercial:{tipo:'Normal',empresaNome:'Empresa Alfa'}};
 assert.equal((await t.enviar([linha])).status,200);assert.equal(t.banco.get('x').comercial.dataAprovacao,'2026-10-02');
 assert.equal((await t.enviar([{...linha,comercial:{...linha.comercial,dataAprovacao:'2026-10-03'}}])).status,200);
 assert.equal(t.banco.get('x').comercial.dataAprovacao,'2026-10-03');
 assert.equal((await t.enviar([{...linha,comercial:{...linha.comercial,dataAprovacao:null}}])).status,200);
 assert.equal(t.banco.get('x').comercial.dataAprovacao,null);
});
