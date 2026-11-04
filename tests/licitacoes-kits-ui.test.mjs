import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as calculos from '../src/lib/calc/documentos-licitacoes.js';
import * as documentos from '../src/lib/calc/documentos.js';
import * as zip from '../src/lib/zip.mjs';
const aguardar = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const adiado = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const req = { id: 'requisito-1', categoria: 'CND Federal', descricao: 'Item 1 do edital', documentoId: 'doc1', versaoId: 'versao1', dispensado: false, justificativa: '', snapshot: { nome: 'Certidão antiga', validade: '2026-12-31' } };
const kit = { id: 'kit1', nome: 'Kit exemplo fictício', licitacaoId: 'edital1', titularId: 'empresa1', requisitos: [req], atualizadoEm: 'v1', pendencias: [] };
const propsBase = { documentos: [{ id: 'doc1', nome: 'Certidão atual', usoLicitacoes: true, titularId: 'empresa1', versoes: [{ id: 'versao1', validade: '2026-12-31' }] }], titulares: [{ id: 'empresa1', nome: 'Empresa fictícia' }], licitacoes: [{ id: 'edital1', nome: 'Edital fictício' }, { id: 'edital2', nome: 'Outro edital fictício' }] };
function ambiente(nome = 'default', apiExtra = {}) {
  const hooks = [], efeitos = [], pedidos = []; let cursor = 0;
  const iguais = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const useState = ini => { const i = cursor++; if (!hooks[i]) hooks[i] = { valor: typeof ini === 'function' ? ini() : ini }; return [hooks[i].valor, v => { hooks[i].valor = typeof v === 'function' ? v(hooks[i].valor) : v; }]; };
  const useRef = ini => { const i = cursor++; return hooks[i] ?? (hooks[i] = { current: ini }); };
  const useCallback = (fn, deps) => { const i = cursor++; if (!iguais(hooks[i]?.deps, deps)) hooks[i] = { deps, valor: fn }; return hooks[i].valor; };
  const useEffect = (fn, deps) => { const i = cursor++, antes = hooks[i]; if (!iguais(antes?.deps, deps)) { hooks[i] = { deps, limpar: antes?.limpar }; efeitos.push(() => { hooks[i].limpar?.(); hooks[i].limpar = fn(); }); } };
  const jsx = (type, props, key) => ({ type: typeof type === 'function' ? type.name : type, props, key });
  const kitsApi = { listarKits: () => { const p = adiado(); pedidos.push(p); return p.promise; }, ...apiExtra };
  const codigo = readFileSync(new URL('../src/components/KitsEditalLicitacoes.jsx', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const contexto = { module: { exports: {} }, require: () => ({ jsx, jsxs: jsx }), useState, useRef, useCallback, useEffect, kitsApi, ...calculos, ...documentos, dataLonga: v => v, AbortController, crypto: webcrypto, structuredClone };
  for (const n of ['Download', 'FolderOpen', 'Plus', 'RefreshCw', 'Trash2', 'JanelaFormulario']) contexto[n] = Object.defineProperty(() => null, 'name', { value: n });
  vm.runInNewContext(transformSync(codigo, { loader: 'jsx', format: 'cjs', jsx: 'automatic', target: 'es2022' }).code, contexto);
  return { pedidos, exports: contexto.module.exports, render(props) { cursor = 0; const arvore = contexto.module.exports[nome](props); for (const efeito of efeitos.splice(0)) efeito(); return arvore; }, desmontar() { hooks.forEach(h => h.limpar?.()); } };
}
function buscar(arvore, condicao) { if (!arvore || typeof arvore !== 'object') return; if (arvore.props && condicao(arvore)) return arvore; for (const v of Object.values(arvore)) { const r = buscar(v, condicao); if (r) return r; } }
const texto = valor => JSON.stringify(valor);
function servico() {
  const codigo = readFileSync(new URL('../src/services/licitacoes-kits.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const contexto = { module: { exports: {} }, ...zip, TextEncoder, Uint8Array, lerDocumento() { throw new Error('Sem mock'); } };
  vm.runInNewContext(transformSync(codigo, { format: 'cjs', target: 'es2022' }).code, contexto);
  return contexto.module.exports;
}

test('kit é filtrado por edital e pode ser reaberto com sua versão preservada', async () => {
  const a = ambiente(), props = { ...propsBase, vigente: () => true, licitacaoSelecionada: propsBase.licitacoes[0] };
  a.render(props); a.pedidos[0].resolve([kit, { ...kit, id: 'kit2', licitacaoId: 'edital2', nome: 'Outro kit' }]); await aguardar();
  let arvore = a.render(props);
  assert.doesNotMatch(texto(arvore), /Outro kit/);
  buscar(arvore, n => n.type === 'button' && n.props.children === 'Abrir kit').props.onClick();
  arvore = a.render(props);
  const form = buscar(arvore, n => n.type === 'FormKit');
  assert.equal(form.props.inicial.requisitos[0].versaoId, 'versao1');
  assert.equal(form.props.inicial.requisitos[0].snapshot.nome, 'Certidão antiga');
});

test('salvamento kit usa CAS e remove snapshots; conflito preserva formulário e permite releitura explícita', async () => {
  const gravacoes = []; let falhar = true;
  const a = ambiente('default', { salvarKit: async (...args) => { gravacoes.push(args); if (falhar) throw Object.assign(new Error('Conflito de versão'), { status: 409 }); return { ...kit, atualizadoEm: 'v3' }; } }), props = { ...propsBase, vigente: () => true };
  a.render(props); a.pedidos[0].resolve([kit]); await aguardar();
  buscar(a.render(props), n => n.type === 'button' && n.props.children === 'Abrir kit').props.onClick();
  await buscar(a.render(props), n => n.type === 'FormKit').props.aoSalvar({ ...kit, nome: 'Rascunho' });
  assert.equal(gravacoes[0][1], 'v1'); assert.equal(gravacoes[0][0].requisitos[0].snapshot, undefined);
  let arvore = a.render(props); assert.ok(buscar(arvore, n => n.type === 'FormKit'));
  const releitura = buscar(arvore, n => n.type === 'button' && texto(n.props.children).includes('Recarregar versão')).props.onClick();
  a.pedidos[1].resolve([{ ...kit, atualizadoEm: 'v2' }]); await releitura;
  falhar = false;
  await buscar(a.render(props), n => n.type === 'FormKit').props.aoSalvar({ ...kit, nome: 'Rascunho' });
  assert.equal(gravacoes[1][1], 'v2'); assert.equal(gravacoes[1][0].nome, 'Rascunho');
});

test('FormKit mescla novos requisitos remotos e exige escolha para mesmo campo alterado', () => {
  const a = ambiente('FormKit'), enviados = [];
  let props = { inicial: kit, documentos: propsBase.documentos, titulares: propsBase.titulares, editais: propsBase.licitacoes, aoSalvar: v => enviados.push(v) };
  let arvore = a.render(props);
  buscar(arvore, n => n.type === 'input' && n.props.value === kit.nome).props.onChange({ target: { value: 'Rascunho preservado' } });
  buscar(arvore, n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  a.render(props);
  const novo = { id: 'remoto2', categoria: 'Balanço patrimonial', descricao: 'Incluído por outra pessoa', dispensado: false, documentoId: '' };
  props = { ...props, inicial: { ...kit, nome: 'Atualização concorrente', atualizadoEm: 'v2', requisitos: [req, novo] } };
  a.render(props); arvore = a.render(props);
  assert.match(texto(arvore), /Incluído por outra pessoa/);
  buscar(arvore, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(enviados.length, 0);
  buscar(arvore, n => n.type === 'button' && n.props.children === 'Manter meu preenchimento').props.onClick();
  arvore = a.render(props);
  buscar(arvore, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.match(texto(a.render(props)), /Explique por que/);
  buscar(a.render(props), n => n.type === 'textarea' && n.props.value === '').props.onChange({ target: { value: 'Dispensado expressamente no item 4 do edital fictício.' } });
  buscar(a.render(props), n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(enviados[0].nome, 'Rascunho preservado');
  assert.equal(enviados[0].requisitos.find(r => r.id === 'requisito-1').documentoId, '');
  assert.equal(enviados[0].requisitos.find(r => r.id === 'remoto2').descricao, 'Incluído por outra pessoa');
});

test('lista tardia de kit é descartada quando a sessão deixa de ser válida', async () => {
  let vigente = true; const a = ambiente(), props = { ...propsBase, vigente: () => vigente };
  a.render(props); vigente = false; a.pedidos[0].resolve([kit]); await aguardar();
  assert.doesNotMatch(texto(a.render(props)), /Kit exemplo fictício/);
});

test('índice HTML escapa conteúdo e registra pendências, versão e datas', () => {
  const html = servico().indiceKit({ ...kit, nome: '<script>alert(1)</script>' }, [{ documentoId: 'doc1', versaoId: 'versao1', nome: 'arquivo.pdf' }], ['Arquivo faltante <img src=x>']);
  assert.doesNotMatch(html, /<script>|<img/); assert.match(html, /&lt;script&gt;/); assert.match(html, /versao1/); assert.match(html, /2026-12-31/); assert.match(html, /Não comprova habilitação/);
});

test('ZIP usa bytes autorizados da versão antiga, inclui índice e aborta por falha sem arquivo parcial', async () => {
  const api = servico(), referencias = [], manifesto = { kit, arquivos: [{ documentoId: 'doc1', versaoId: 'versao1', arquivoId: 'arquivo1', nome: 'antigo.pdf' }], pendencias: ['Atestado faltante'] };
  const bytes = await api.montarPacoteKit(manifesto, { ler: async (...args) => { referencias.push(args); return { bytes: new TextEncoder().encode('%PDF antigo'), nome: 'antigo.pdf' }; } });
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50); assert.equal(referencias[0][1], 'versao1'); assert.equal(referencias[0][2], 'arquivo1');
  assert.match(new TextDecoder().decode(bytes), /00-indice.html/); assert.match(new TextDecoder().decode(bytes), /Atestado faltante/);
  await assert.rejects(api.montarPacoteKit(manifesto, { ler: async () => { throw new Error('Sem permissão'); } }), /pacote não foi baixado.*Sem permissão/);
});

test('ZIP interrompe sessão revogada e limites de quantidade ou volume antes de entregar pacote', async () => {
  const api = servico(), manifesto = { kit, arquivos: [{ documentoId: 'doc1', nome: 'arquivo.pdf' }] }; let vigente = true, leituras = 0;
  await assert.rejects(api.montarPacoteKit(manifesto, { vigente: () => vigente, ler: async () => { vigente = false; return { bytes: new Uint8Array(1) }; } }), /sessão mudou/);
  await assert.rejects(api.montarPacoteKit({ ...manifesto, arquivos: Array.from({ length: 80 }, () => manifesto.arquivos[0]) }, { ler: async () => { leituras++; } }), /até 79 documentos/); assert.equal(leituras, 0);
  await assert.rejects(api.montarPacoteKit(manifesto, { ler: async () => ({ bytes: new Uint8Array(40 * 1024 * 1024 + 1) }) }), /excede 40 MiB/);
});
