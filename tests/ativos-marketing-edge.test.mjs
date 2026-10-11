// O papel dentro do Marketing também vale na painel-ativos (logomarca, papel
// timbrado e os outros materiais). Handler real; sessão, banco e o papel são
// dados fictícios. O cálculo do papel em si é testado em marketing-edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import { papelGrava } from '../supabase/functions/_shared/marketing-papel.mjs';

const fonte = readFileSync(new URL('../supabase/functions/painel-ativos/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
const codigo = transformSync(fonte, { loader: 'ts', format: 'esm', target: 'es2022' }).code;

function ambiente({ papel = 'marketing', sessao = { sub: 'pessoa', perms: ['marketing', 'documentos'] }, linhas = [] } = {}) {
  let handler;
  const gravacoes = [], perguntasDePapel = [];
  const sb = {
    from() {
      const filtros = [];
      const resultado = () => ({ error: null, data: linhas.filter((l) => filtros.every(([c, v]) => l[c] === v)) });
      const q = {
        select() { return q; },
        eq(c, v) { filtros.push([c, v]); return q; },
        order() { return q; }, range() { return q; },
        async maybeSingle() { const r = resultado(); return { ...r, data: r.data[0] ?? null }; },
        async upsert(linha) { gravacoes.push({ upsert: linha }); return { error: null }; },
        delete() { gravacoes.push({ delete: true }); return q; },
        then(a, b) { return Promise.resolve(resultado()).then(a, b); },
      };
      return q;
    },
    async rpc(nome, args) { gravacoes.push({ rpc: nome, args }); return { error: null, data: null }; },
    storage: { from() { return { async upload(id) { gravacoes.push({ upload: id }); return { error: null }; } }; } },
  };
  vm.runInNewContext(codigo, {
    Deno: { env: { get: () => 'teste' }, serve: (fn) => { handler = fn; } },
    createClient: () => sb, verificarJwt: async () => sessao, crachaRevogado: async () => false,
    papelNoMarketing: async (_sb, s) => { perguntasDePapel.push(s); return papel; }, papelGrava,
    Response, Request, console: { error() {} }, crypto, atob, btoa, Uint8Array,
  });
  return {
    gravacoes, perguntasDePapel,
    async chamar(corpo) {
      const resp = await handler(new Request('https://teste.invalid', { method: 'POST', headers: { authorization: 'Bearer teste', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }));
      return { status: resp.status, body: await resp.json() };
    },
  };
}
const registro = (id, tipo, colecao = 'ativo') => ({ id, colecao, registro: { id, tipo, nome: `Item ${id}` } });

test('o caso ruim: visualização no Marketing não envia, organiza, apaga, anexa nem restaura material', async () => {
  const linhas = [registro('logo', 'marketing'), registro('velho', 'marketing', 'ativo_lixeira')];
  const a = ambiente({ papel: 'visualizacao', linhas });
  for (const corpo of [
    { action: 'salvar', item: { tipo: 'marketing', nome: 'Logo nova' } },
    { action: 'salvar', item: { id: 'logo', tipo: 'marketing', nome: 'Logo', miniatura: 'data:x' } },
    { action: 'remover', id: 'logo' },
    { action: 'guardarArquivo', id: 'logo', base64: 'AAAA', mime: 'image/png' },
    { action: 'restaurar', id: 'velho' },
  ]) {
    const r = await a.chamar(corpo);
    assert.equal(r.status, 403, corpo.action);
    assert.match(r.body.erro, /visualização/);
  }
  assert.deepEqual(a.gravacoes, []);
  // Ver continua: a lista dos materiais vem.
  const l = await a.chamar({ action: 'listar' });
  assert.equal(l.status, 200);
  assert.deepEqual(l.body.itens.map((i) => i.id), ['logo']);
});

test('papel marketing grava material; outros tipos nem perguntam o papel do Marketing', async () => {
  const a = ambiente({ papel: 'marketing', linhas: [registro('logo', 'marketing'), registro('doc', 'documento')] });
  assert.equal((await a.chamar({ action: 'remover', id: 'logo' })).status, 200);
  assert.ok(a.gravacoes.some((g) => g.rpc === 'painel_ativo_retirar'));
  const antes = a.perguntasDePapel.length;
  assert.equal((await a.chamar({ action: 'remover', id: 'doc' })).status, 200);
  assert.equal(a.perguntasDePapel.length, antes);
  // Sem o módulo, o 403 de sempre (o papel nem chega a ser lido).
  const sem = ambiente({ papel: 'gestao', sessao: { sub: 'x', perms: ['documentos'] }, linhas: [registro('logo', 'marketing')] });
  const r = await sem.chamar({ action: 'remover', id: 'logo' });
  assert.equal(r.status, 403);
  assert.equal(sem.perguntasDePapel.length, 0);
});
