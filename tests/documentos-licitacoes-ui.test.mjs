import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as calculos from '../src/lib/calc/documentos-licitacoes.js';
import * as documentos from '../src/lib/calc/documentos.js';
import { respostaDocumentos, bancoDocumentosDemo } from '../src/review/documentos.mjs';

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
  for (const n of ['Download', 'Eye', 'Link', 'KitsEditalLicitacoes', 'FileText', 'FolderOpen', 'Link2', 'Plus', 'RefreshCw', 'Search', 'Users', 'JanelaFormulario', 'FormTitular', 'PessoaRH', 'PessoasRHProvider']) contexto[n] = component(n);
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
  assert.doesNotMatch(texto(arvore), /PESSOAL-FICTICIO/);
  assert.doesNotMatch(texto(buscar(arvore, no => no.props.className === 'lic-docs-list')), /NAO-VINCULADO-FICTICIO/);
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
  const contexto = { module: { exports: {} }, API: 'https://example.com', comCracha: async () => { const p = adiado(); respostas.push(p); return p.promise; }, mensagemDoStatus: () => 'erro', abrirBase64: (...args) => abertos.push(args), atob, Uint8Array, Blob, URL: { createObjectURL: () => 'blob:ficticio', revokeObjectURL() {} }, setTimeout: fn => fn(), document: { body: { append() {} }, createElement: () => ({ click() { abertos.push(this.download); }, remove() {} }) } };
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


test('busca sem acentos encontra certidão e mantém Visualizar, Baixar e Renovar separados', async () => {
  const a = ambiente(), props = { sessaoVigente: () => true };
  a.render(props); a.pedidos[0].resolve(resposta); await aguardar();
  let arvore = a.render(props);
  buscar(arvore, no => no.type === 'input' && no.props.type === 'search').props.onChange({ target: { value: 'certidao' } });
  arvore = a.render(props);
  assert.ok(buscar(arvore, no => no.props['aria-label'] === `Visualizar ${documento.nome}`));
  assert.ok(buscar(arvore, no => no.props['aria-label'] === `Baixar ${documento.nome}`));
  assert.ok(buscar(arvore, no => no.props['aria-label'] === `Renovar ${documento.nome}`));
  assert.match(texto(buscar(arvore, no => no.props.className === 'lic-docs-list')), /Certidão da empresa fictícia/);
});

test('conflito documental relê CAS sem fechar formulário e reenvia a nova versão', async () => {
  const gravacoes = []; let conflito = true;
  const a = ambiente('AcervoDocumentos', { prepararArquivo: async arquivo => ({ nome: arquivo.name }), salvarControle: async (...args) => { gravacoes.push(args); if (conflito) throw Object.assign(new Error('Alterado por outra pessoa.'), { status: 409 }); return { ...documento, atualizadoEm: 'v3' }; } });
  const props = { sessaoVigente: () => true };
  a.render(props); a.pedidos[0].resolve(resposta); await aguardar();
  buscar(a.render(props), no => no.props['aria-label'] === `Editar ${documento.nome}`).props.onClick();
  const arquivo = { name: 'preservado.pdf' }, rascunho = { ...documento, nome: 'Minha alteração' };
  await buscar(a.render(props), no => no.type === 'FormDocumento').props.aoSalvar(rascunho, arquivo);
  let arvore = a.render(props);
  assert.match(texto(arvore), /preenchimento e o arquivo foram preservados/);
  const releitura = buscar(arvore, no => no.type === 'button' && texto(no.props.children).includes('Recarregar versão')).props.onClick();
  a.pedidos[1].resolve({ ...resposta, itens: [{ ...documento, atualizadoEm: 'v2' }] }); await releitura;
  arvore = a.render(props);
  assert.ok(buscar(arvore, no => no.type === 'FormDocumento'));
  assert.equal(buscar(arvore, no => no.type === 'FormDocumento').props.inicial.atualizadoEm, 'v2');
  conflito = false;
  await buscar(arvore, no => no.type === 'FormDocumento').props.aoSalvar(rascunho, arquivo);
  assert.equal(gravacoes[1][1], 'v2'); assert.equal(gravacoes[1][2].nome, 'preservado.pdf');
});

test('FormDocumento mescla campos remotos e bloqueia conflito real até escolha explícita sem perder arquivo', () => {
  const salvos = [], a = ambiente('FormDocumento');
  let props = { inicial: { ...documento, categoria: 'CND Federal', orgaoEmissor: 'Órgão antigo' }, titulares: resposta.titulares, aoSalvar: (...args) => salvos.push(args) };
  let arvore = a.render(props);
  buscar(arvore, no => no.type === 'input' && no.props.value === documento.nome).props.onChange({ target: { value: 'Nome preservado' } });
  const arquivo = { name: 'arquivo.pdf', size: 42 };
  buscar(arvore, no => no.type === 'input' && no.props.type === 'file').props.onChange({ target: { files: [arquivo] } });
  a.render(props);
  props = { ...props, inicial: { ...props.inicial, atualizadoEm: 'v2', nome: 'Nome de outra pessoa', orgaoEmissor: 'Órgão atualizado remotamente' } };
  a.render(props); arvore = a.render(props);
  buscar(arvore, no => no.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(salvos.length, 0); assert.match(texto(arvore), /Nome de outra pessoa/);
  assert.ok(buscar(arvore, no => no.type === 'input' && no.props.value === 'Órgão atualizado remotamente'));
  buscar(arvore, no => no.type === 'button' && no.props.children === 'Manter meu preenchimento').props.onClick();
  arvore = a.render(props);
  buscar(arvore, no => no.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(salvos[0][0].nome, 'Nome preservado'); assert.equal(salvos[0][0].orgaoEmissor, 'Órgão atualizado remotamente'); assert.equal(salvos[0][1], arquivo);
});

test('lock documental bloqueia submissão duplicada e fechamento durante salvamento', async () => {
  const pendente = adiado(), gravacoes = [];
  const a = ambiente('AcervoDocumentos', { salvarControle: async (...args) => { gravacoes.push(args); return pendente.promise; } }), props = { sessaoVigente: () => true };
  a.render(props); a.pedidos[0].resolve(resposta); await aguardar();
  buscar(a.render(props), no => no.props['aria-label'] === `Editar ${documento.nome}`).props.onClick();
  const formulario = buscar(a.render(props), no => no.type === 'FormDocumento');
  const salvar = formulario.props.aoSalvar(documento);
  formulario.props.aoFechar();
  const segundo = formulario.props.aoSalvar(documento);
  const quantidade = gravacoes.length, aberto = !!buscar(a.render(props), no => no.type === 'FormDocumento');
  pendente.resolve(documento); await Promise.all([salvar, segundo]);
  assert.equal(quantidade, 1); assert.equal(aberto, true);
});

test('conflito entre sem vencimento local e data remota mantém ambos os campos da escolha do servidor no envio', () => {
  const enviados = [], a = ambiente('FormDocumento');
  let props = { inicial: { ...documento, categoria: 'CND Federal', validade: '2027-01-01', semVencimento: false }, titulares: resposta.titulares, aoSalvar: (...args) => enviados.push(args) };
  let arvore = a.render(props);
  const arquivo = { name: 'local-preservado.pdf', size: 24 };
  buscar(arvore, no => no.type === 'input' && no.props.type === 'file').props.onChange({ target: { files: [arquivo] } });
  buscar(arvore, no => no.type === 'input' && no.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  a.render(props);
  props = { ...props, inicial: { ...props.inicial, atualizadoEm: 'v2', validade: '2028-01-01', semVencimento: false } };
  a.render(props); arvore = a.render(props);
  buscar(arvore, no => no.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(enviados.length, 0);
  buscar(arvore, no => no.type === 'button' && no.props.children === 'Usar versão do servidor').props.onClick();
  arvore = a.render(props);
  assert.equal(buscar(arvore, no => no.type === 'input' && no.props.type === 'checkbox').props.checked, false);
  assert.ok(buscar(arvore, no => no.type === 'input' && no.props.type === 'date' && no.props.value === '2028-01-01' && no.props.disabled === false));
  buscar(arvore, no => no.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(enviados[0][0].validade, '2028-01-01'); assert.equal(enviados[0][0].semVencimento, false); assert.equal(enviados[0][1], arquivo);
});


test('FormDocumento seleciona responsável por ID e serviço salva pelo handler real preservando nome legado', async () => {
  const codigo = readFileSync(new URL('../src/services/documentos.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const contexto = { module: { exports: {} }, API: 'https://example.com', comCracha: async (_url, opcoes) => respostaDocumentos(JSON.parse(opcoes.body), { perms: ['documentos', 'licitacoes'] }, []), mensagemDoStatus: status => `Erro ${status}` };
  vm.runInNewContext(transformSync(codigo, { format: 'cjs', target: 'es2022' }).code, contexto);
  const servico = contexto.module.exports, lista = await servico.listarDocumentos(), pessoa = lista.pessoas.find(p => p.disponivel), empresa = lista.titulares.find(t => t.tipo === 'empresa');
  const a = ambiente('FormDocumento'); let salvamento;
  const props = { inicial: { cadastroId: webcrypto.randomUUID(), tipo: 'documento', nome: 'Certidão com responsável fictício', categoria: 'CND Federal', titularId: empresa.id, validade: '2027-01-01', emissao: '2026-10-01' }, titulares: lista.titulares, aoSalvar: item => { salvamento = servico.salvarControle(item, null); } };
  let arvore = a.render(props);
  const seletor = buscar(arvore, no => no.type === 'PessoaRH');
  assert.ok(seletor, 'O responsável deve usar o seletor existente de pessoas do RH.');
  seletor.props.aoMudar(pessoa.id, pessoa.nome);
  buscar(a.render(props), no => no.type === 'form').props.onSubmit({ preventDefault() {} });
  const salvo = await salvamento;
  assert.equal(salvo.responsavelId, pessoa.id); assert.equal(salvo.responsavel, pessoa.nome);
  const legado = ambiente('FormDocumento'), registros = [];
  const registroLegado = { ...salvo, id: webcrypto.randomUUID(), responsavelId: '', responsavel: 'Nome legado preservado' };
  await bancoDocumentosDemo().from('painel_registros').insert({ colecao: 'ativo', id: registroLegado.id, registro: registroLegado }).select('registro').single();
  const propsLegado = { inicial: registroLegado, titulares: lista.titulares, aoSalvar: item => registros.push(item) };
  arvore = legado.render(propsLegado);
  assert.equal(buscar(arvore, no => no.type === 'PessoaRH').props.nome, 'Nome legado preservado');
  buscar(arvore, no => no.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(registros[0].responsavel, 'Nome legado preservado'); assert.equal(registros[0].responsavelId, '');
  const legadoSalvo = await servico.salvarControle(registros[0], registroLegado.atualizadoEm);
  assert.equal(legadoSalvo.responsavel, 'Nome legado preservado'); assert.equal(legadoSalvo.responsavelId, '');
});
