import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as calculos from '../src/lib/calc/documentos-licitacoes.js';
import * as documentos from '../src/lib/calc/documentos.js';

const aguardar = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const adiado = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const acesso = { usuario: 'empresa-ficticia', permissoes: ['documentos', 'licitacoes'] };
const documento = { id: 'doc-ficticio', nome: 'Certidão da empresa fictícia', tipo: 'documento', titularTipo: 'empresa', titularId: 'empresa', titularNome: 'Empresa fictícia', usoLicitacoes: true, emissao: '2026-10-01', validade: '2026-11-03', temArquivo: true, atualizadoEm: 'v1' };
const resposta = { itens: [documento], titulares: [{ id: 'empresa', tipo: 'empresa', nome: 'Empresa fictícia' }] };

function ambiente(nome = 'AcervoDocumentos', apiExtra = {}) {
  const hooks = [], efeitos = [], pedidos = [], eventos = {}, intervalos = [];
  let cursor = 0, data = '2026-11-03';
  const iguais = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const useState = inicial => {
    const i = cursor++;
    if (!hooks[i]) hooks[i] = { valor: typeof inicial === 'function' ? inicial() : inicial };
    return [hooks[i].valor, valor => { hooks[i].valor = typeof valor === 'function' ? valor(hooks[i].valor) : valor; }];
  };
  const useRef = inicial => { const i = cursor++; return hooks[i] ?? (hooks[i] = { current: inicial }); };
  const useMemo = (fn, deps) => { const i = cursor++; if (!iguais(hooks[i]?.deps, deps)) hooks[i] = { deps, valor: fn() }; return hooks[i].valor; };
  const useCallback = (fn, deps) => useMemo(() => fn, deps);
  const useEffect = (fn, deps) => { const i = cursor++, antes = hooks[i]; if (!iguais(antes?.deps, deps)) { hooks[i] = { deps, limpar: antes?.limpar }; efeitos.push(() => { hooks[i].limpar?.(); hooks[i].limpar = fn(); }); } };
  const jsx = (type, props, key) => ({ type: typeof type === 'function' ? type.name : type, props, key });
  const component = n => Object.defineProperty(() => null, 'name', { value: n });
  const api = { listarDocumentos: opcoes => { const pedido = adiado(); pedidos.push({ ...pedido, opcoes }); return pedido.promise; }, ...apiExtra };
  const codigo = readFileSync(new URL('../src/components/DocumentosLicitacoes.jsx', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '') + '\nexport { AcervoDocumentos, FormDocumento, FormVinculo };';
  const contexto = { module: { exports: {} }, require: () => ({ jsx, jsxs: jsx }), useState, useRef, useMemo, useCallback, useEffect, api, ...calculos, ...documentos,
    hojeBrasilia: () => data, dataLonga: v => v, AbortController, crypto: webcrypto,
    podeAbrir: (modulo, sessao) => !!sessao && (sessao.master || sessao.permissoes?.includes('*') || sessao.permissoes?.includes(modulo)),
    window: { setInterval: fn => { intervalos.push(fn); return 1; }, clearInterval() {}, addEventListener: (n, fn) => { eventos[n] = fn; }, removeEventListener: n => { delete eventos[n]; } },
    document: { visibilityState: 'visible', addEventListener: (n, fn) => { eventos[n] = fn; }, removeEventListener: n => { delete eventos[n]; } },
  };
  for (const n of ['Download', 'FileText', 'FolderOpen', 'Link2', 'Plus', 'RefreshCw', 'Search', 'Users', 'JanelaFormulario', 'FormTitular']) contexto[n] = component(n);
  vm.runInNewContext(transformSync(codigo, { loader: 'jsx', format: 'cjs', jsx: 'automatic', target: 'es2022' }).code, contexto);
  return { pedidos, eventos, intervalos, setDia: valor => { data = valor; }, render(props = { sessaoVigente: () => true }, aplicarEfeitos = true) { cursor = 0; const arvore = contexto.module.exports[nome](props); if (aplicarEfeitos) for (const efeito of efeitos.splice(0)) efeito(); return arvore; }, desmontar() { hooks.forEach(h => h.limpar?.()); } };
}
function buscar(arvore, predicado) {
  if (!arvore || typeof arvore !== 'object') return;
  if (arvore.props && predicado(arvore)) return arvore;
  for (const valor of Object.values(arvore)) { const r = buscar(valor, predicado); if (r) return r; }
}
const texto = arvore => JSON.stringify(arvore);

test('sem as duas permissões a tela bloqueia antes de montar o acervo; troca de acesso invalida a sessão anterior', () => {
  const a = ambiente('default');
  assert.match(texto(a.render({ sessao: { ...acesso, permissoes: ['licitacoes'] } })), /necessário acesso a Licitações e Documentos/);
  assert.equal(a.pedidos.length, 0);
  const permitido = a.render({ sessao: acesso });
  assert.equal(permitido.type, 'AcervoDocumentos');
  assert.equal(permitido.props.sessaoVigente(), true);
  a.render({ sessao: { ...acesso, usuario: 'outra-empresa' } }, false);
  assert.equal(permitido.props.sessaoVigente(), false);
});

test('lista tardia de sessão desmontada é descartada e a requisição recebe cancelamento', async () => {
  const a = ambiente(), props = { sessaoVigente: () => true };
  a.render(props);
  a.desmontar();
  assert.equal(a.pedidos[0].opcoes.signal.aborted, true);
  a.pedidos[0].resolve(resposta);
  await aguardar();
  assert.doesNotMatch(texto(a.render(props, false)), /Certidão da empresa fictícia/);
});

test('lista oculta pessoas e não vinculados, e recalcula vencimento ao recuperar foco e passar o dia em Brasília', async () => {
  const a = ambiente(), props = { sessaoVigente: () => true };
  a.render(props);
  a.pedidos[0].resolve({ ...resposta, itens: [documento, { ...documento, id: 'pessoa', titularTipo: 'pessoa', nome: 'PESSOAL-FICTICIO' }, { ...documento, id: 'nao-vinculado', usoLicitacoes: false, nome: 'NAO-VINCULADO-FICTICIO' }] });
  await aguardar();
  let arvore = a.render(props);
  assert.match(texto(arvore), /Vence hoje/);
  assert.doesNotMatch(texto(arvore), /PESSOAL-FICTICIO|NAO-VINCULADO-FICTICIO/);
  a.setDia('2026-11-04'); a.eventos.focus();
  arvore = a.render(props);
  assert.match(texto(arvore), /Vencido há 1 dias/);
  a.setDia('2026-11-05'); a.intervalos[0]();
  assert.match(texto(a.render(props)), /Vencido há 2 dias/);
});

test('vínculo existente envia somente ID, flag e versão; não gera arquivo ou novo cadastro', async () => {
  const gravacoes = [];
  const a = ambiente('AcervoDocumentos', { salvarControle: async (...args) => { gravacoes.push(args); return { ...documento, usoLicitacoes: true }; } }), props = { sessaoVigente: () => true };
  a.render(props); a.pedidos[0].resolve({ ...resposta, itens: [{ ...documento, usoLicitacoes: false }] }); await aguardar();
  let arvore = a.render(props);
  buscar(arvore, no => no.type === 'button' && texto(no.props.children).includes('Vincular documento existente')).props.onClick();
  arvore = a.render(props);
  await buscar(arvore, no => no.type === 'FormVinculo').props.aoSalvar(documento.id);
  assert.deepEqual(JSON.parse(JSON.stringify(gravacoes[0][0])), { id: documento.id, usoLicitacoes: true });
  assert.equal(gravacoes[0][1], 'v1');
  assert.equal(gravacoes[0][2], undefined);
  assert.match(texto(a.render(props)), /Documento vinculado/);
});

test('troca de sessão durante conversão do arquivo impede enviar o salvamento com nova credencial', async () => {
  const preparo = adiado(), gravacoes = []; let ativa = true;
  const a = ambiente('AcervoDocumentos', { prepararArquivo: () => preparo.promise, salvarControle: async (...args) => gravacoes.push(args) }), props = { sessaoVigente: () => ativa };
  a.render(props); a.pedidos[0].resolve(resposta); await aguardar();
  let arvore = a.render(props);
  buscar(arvore, no => no.type === 'button' && texto(no.props.children).includes('Novo documento')).props.onClick();
  arvore = a.render(props);
  const salvamento = buscar(arvore, no => no.type === 'FormDocumento').props.aoSalvar({ nome: 'Documento novo fictício' }, { name: 'exemplo.pdf' });
  ativa = false; preparo.resolve({ nome: 'exemplo.pdf', base64: 'JVBERg==', mime: 'application/pdf' });
  await salvamento;
  assert.equal(gravacoes.length, 0);
  assert.doesNotMatch(texto(a.render(props, false)), /Documento salvo no acervo/);
});

test('download que responde após troca de sessão não abre arquivo; sessão vigente usa o arquivo', async () => {
  const respostas = [], abertos = [];
  const codigo = readFileSync(new URL('../src/services/documentos.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const contexto = { module: { exports: {} }, API: 'https://example.com', comCracha: async () => { const p = adiado(); respostas.push(p); return p.promise; }, mensagemDoStatus: () => 'erro', abrirBase64: (...args) => abertos.push(args) };
  vm.runInNewContext(transformSync(codigo, { format: 'cjs', target: 'es2022' }).code, contexto);
  let vigente = true;
  const primeiro = contexto.module.exports.baixarDocumento(documento, undefined, undefined, { podeAbrirArquivo: () => vigente });
  vigente = false; respostas[0].resolve({ ok: true, json: async () => ({ ok: true, base64: 'JVBERg==', nome: 'ficticio.pdf', mime: 'application/pdf' }) });
  await primeiro; assert.equal(abertos.length, 0);
  vigente = true;
  const segundo = contexto.module.exports.baixarDocumento(documento, undefined, undefined, { podeAbrirArquivo: () => vigente });
  respostas[1].resolve({ ok: true, json: async () => ({ ok: true, base64: 'JVBERg==', nome: 'ficticio.pdf', mime: 'application/pdf' }) });
  await segundo; assert.equal(abertos.length, 1);
});

test('falha de atualização identifica a lista anterior e resposta antiga não sobrepõe vínculo salvo', async () => {
  const a = ambiente('AcervoDocumentos', { salvarControle: async () => ({ ...documento, usoLicitacoes: true }) }), props = { sessaoVigente: () => true };
  a.render(props); a.pedidos[0].resolve({ ...resposta, itens: [{ ...documento, usoLicitacoes: false }] }); await aguardar();
  let arvore = a.render(props);
  buscar(arvore, no => no.props['aria-label'] === 'Atualizar documentos da empresa').props.onClick();
  a.pedidos[1].reject(new Error('Falha de rede fictícia')); await aguardar();
  arvore = a.render(props);
  assert.match(texto(arvore), /Os itens abaixo são da última consulta/);
  buscar(arvore, no => no.props['aria-label'] === 'Atualizar documentos da empresa').props.onClick();
  buscar(arvore, no => no.type === 'button' && texto(no.props.children).includes('Vincular documento existente')).props.onClick();
  arvore = a.render(props);
  await buscar(arvore, no => no.type === 'FormVinculo').props.aoSalvar(documento.id);
  a.pedidos[2].resolve({ ...resposta, itens: [{ ...documento, usoLicitacoes: false }] }); await aguardar();
  assert.match(texto(a.render(props)), /Certidão da empresa fictícia/);
});
