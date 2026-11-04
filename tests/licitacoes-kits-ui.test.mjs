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
  for (const n of ['Download', 'FolderOpen', 'Plus', 'RefreshCw', 'Trash2', 'RotateCcw', 'JanelaFormulario']) contexto[n] = Object.defineProperty(() => null, 'name', { value: n });
  vm.runInNewContext(transformSync(codigo, { loader: 'jsx', format: 'cjs', jsx: 'automatic', target: 'es2022' }).code, contexto);
  return { pedidos, exports: contexto.module.exports, render(props) { cursor = 0; const arvore = contexto.module.exports[nome](props); for (const efeito of efeitos.splice(0)) efeito(); return arvore; }, desmontar() { hooks.forEach(h => h.limpar?.()); } };
}
function buscar(arvore, condicao) { if (!arvore || typeof arvore !== 'object') return; if (arvore.props && condicao(arvore)) return arvore; for (const v of Object.values(arvore)) { const r = buscar(v, condicao); if (r) return r; } }
const texto = valor => JSON.stringify(valor);
function servico(extras = {}) {
  const codigo = readFileSync(new URL('../src/services/licitacoes-kits.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const contexto = { module: { exports: {} }, ...zip, TextEncoder, Uint8Array, lerDocumento() { throw new Error('Sem mock'); }, ...extras };
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

test('recolher e reabrir requisito mantém rascunho, versão e snapshot no salvamento', () => {
  const a = ambiente('FormKit'), enviados = [];
  const requisito = { ...req, snapshot: { ...req.snapshot, emissao: '2020-01-01', validade: '', semVencimento: true } };
  const inicial = { ...kit, requisitos: [requisito] };
  const props = { inicial, documentos: [{ ...propsBase.documentos[0], temArquivo: true }], titulares: propsBase.titulares, editais: propsBase.licitacoes, aoSalvar: v => enviados.push(v) };
  const detalhe = arvore => buscar(arvore, n => n.type === 'details' && n.props['data-requisito-id'] === req.id);
  let arvore = a.render(props);
  assert.equal(detalhe(arvore).props.open, false, 'requisito completo começa compacto');
  detalhe(arvore).props.onToggle({ currentTarget: { open: true } });
  arvore = a.render(props);
  buscar(detalhe(arvore), n => n.type === 'textarea' && n.props.value === req.descricao).props.onChange({ target: { value: 'Descrição revisada e preservada ao recolher' } });
  detalhe(a.render(props)).props.onToggle({ currentTarget: { open: false } });
  arvore = a.render(props);
  assert.equal(detalhe(arvore).props.open, false);
  assert.ok(buscar(detalhe(arvore), n => n.type === 'textarea' && n.props.value === 'Descrição revisada e preservada ao recolher'), 'campo permanece montado');
  detalhe(arvore).props.onToggle({ currentTarget: { open: true } });
  arvore = a.render(props);
  buscar(arvore, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(enviados.length, 1);
  const salvo = JSON.parse(JSON.stringify(enviados[0]));
  assert.deepEqual(salvo.requisitos, [{ ...requisito, descricao: 'Descrição revisada e preservada ao recolher' }]);
  assert.deepEqual(inicial.requisitos, [requisito], 'registro aberto não é alterado em memória');
  const payload = a.exports.payloadKit(enviados[0]);
  assert.equal(payload.requisitos[0].versaoId, req.versaoId);
  assert.equal(payload.requisitos[0].documentoId, req.documentoId);
  assert.equal(payload.requisitos[0].snapshot, undefined, 'snapshot continua resolvido pelo servidor');
});

test('validação nativa reabre requisito recolhido e mantém o campo inválido disponível', () => {
  const a = ambiente('FormKit'), enviados = [];
  const props = { inicial: kit, documentos: propsBase.documentos, titulares: propsBase.titulares, editais: propsBase.licitacoes, aoSalvar: v => enviados.push(v) };
  const detalhe = arvore => buscar(arvore, n => n.type === 'details' && n.props['data-requisito-id'] === req.id);
  let arvore = a.render(props);
  buscar(detalhe(arvore), n => n.type === 'textarea' && n.props.value === req.descricao).props.onChange({ target: { value: '' } });
  detalhe(a.render(props)).props.onToggle({ currentTarget: { open: false } });
  arvore = a.render(props);
  assert.equal(detalhe(arvore).props.open, false);
  const elemento = { open: false, dataset: { requisitoId: req.id } };
  buscar(arvore, n => n.type === 'form').props.onInvalidCapture({ target: { closest: seletor => {
    assert.equal(seletor, 'details[data-requisito-id]'); return elemento;
  } } });
  assert.equal(elemento.open, true, 'DOM abre antes do navegador focar o campo');
  arvore = a.render(props);
  assert.equal(detalhe(arvore).props.open, true, 'estado mantém requisito aberto');
  assert.ok(buscar(detalhe(arvore), n => n.type === 'textarea' && n.props.required && n.props.value === ''));
  buscar(arvore, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(enviados.length, 0);
  assert.match(texto(a.render(props)), /Informe a categoria e a descrição/);
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


const botao = (arvore, label) => buscar(arvore, n => n.type === 'button' && texto(n.props.children).includes(label));
const artigos = arvore => { const itens = []; const visitar = n => { if (!n || typeof n !== 'object') return; if (n.type === 'article') itens.push(n); for (const v of Object.values(n)) visitar(v); }; visitar(arvore); return itens; };

test('Ativos e Lixeira mantêm recorte por edital e legado sem estado permanece ativo', async () => {
  const a = ambiente(), props = { ...propsBase, vigente: () => true, licitacaoSelecionada: propsBase.licitacoes[0] };
  const retirado = { ...kit, id: 'kit-retirado', nome: 'Kit retirado', estado: 'lixeira', lixeiraEm: '2026-11-04T12:00:00Z', lixeiraPor: 'Pessoa fictícia', historico: [{ id: 'h1', acao: 'mover_lixeira', em: '2026-11-04T12:00:00Z', por: 'Pessoa fictícia' }] };
  a.render(props); a.pedidos[0].resolve([kit, retirado, { ...retirado, id: 'outro', licitacaoId: 'edital2', nome: 'Fora do recorte' }]); await aguardar();
  let arvore = a.render(props);
  assert.equal(artigos(arvore).length, 1); assert.match(texto(artigos(arvore)), /Kit exemplo fictício/);
  assert.doesNotMatch(texto(arvore), /Fora do recorte/);
  botao(arvore, 'Lixeira').props.onClick(); arvore = a.render(props);
  assert.equal(artigos(arvore).length, 1); assert.match(texto(artigos(arvore)), /Kit retirado/);
  assert.ok(botao(arvore, 'Restaurar')); assert.ok(botao(arvore, 'Baixar ZIP'));
  assert.equal(botao(arvore, 'Abrir kit'), undefined); assert.equal(botao(arvore, 'Novo kit'), undefined);
  assert.match(texto(arvore), /Movido para a lixeira/); assert.match(texto(arvore), /2026-12-31/);
});

test('mover exige confirmação, envia versão, bloqueia clique repetido e restaura o mesmo kit', async () => {
  const chamadas = [], pendente = adiado();
  const retirado = { ...kit, estado: 'lixeira', atualizadoEm: 'v2', lixeiraEm: '2026-11-04T12:00:00Z' };
  const a = ambiente('default', {
    arquivarKit: (k, opcoes) => { chamadas.push(['arquivar', k, opcoes]); return pendente.promise; },
    restaurarKit: async (k, opcoes) => { chamadas.push(['restaurar', k, opcoes]); return { ...k, estado: 'ativo', atualizadoEm: 'v3' }; },
  }), props = { ...propsBase, vigente: () => true };
  a.render(props); a.pedidos[0].resolve([kit]); await aguardar();
  botao(a.render(props), 'Mover para lixeira').props.onClick();
  assert.equal(chamadas.length, 0, 'primeiro clique só confirma intenção');
  botao(a.render(props), 'Cancelar').props.onClick(); assert.equal(chamadas.length, 0);
  botao(a.render(props), 'Mover para lixeira').props.onClick();
  const confirmar = botao(a.render(props), 'Confirmar envio à lixeira').props.onClick;
  const movimento = confirmar(); await confirmar();
  assert.equal(chamadas.length, 1); assert.equal(chamadas[0][1].atualizadoEm, 'v1');
  assert.ok(chamadas[0][2].signal); assert.equal(botao(a.render(props), 'Confirmar envio à lixeira').props.disabled, true);
  pendente.resolve(retirado); await movimento;
  let arvore = a.render(props); assert.ok(botao(arvore, 'Restaurar')); assert.match(texto(arvore), /nenhum documento foi apagado/);
  assert.equal(artigos(arvore)[0].key, kit.id);
  await botao(arvore, 'Restaurar').props.onClick(); arvore = a.render(props);
  assert.equal(chamadas.length, 2); assert.equal(chamadas[1][1].atualizadoEm, 'v2');
  assert.equal(artigos(arvore)[0].key, kit.id); assert.ok(botao(arvore, 'Abrir kit'));
  assert.match(texto(arvore), /Documentos, versões e histórico preservados/);
  assert.equal(kit.estado, undefined); assert.equal(kit.requisitos[0].versaoId, 'versao1');
});

test('conflito ao retirar atualiza leitura sem reaplicar a exclusão automaticamente', async () => {
  let gravacoes = 0;
  const a = ambiente('default', { arquivarKit: async () => { gravacoes++; throw Object.assign(new Error('Conflito'), { status: 409 }); } }), props = { ...propsBase, vigente: () => true };
  a.render(props); a.pedidos[0].resolve([kit]); await aguardar();
  botao(a.render(props), 'Mover para lixeira').props.onClick();
  const movimento = botao(a.render(props), 'Confirmar envio à lixeira').props.onClick(); await aguardar();
  assert.equal(a.pedidos.length, 2); a.pedidos[1].resolve([{ ...kit, nome: 'Nome atualizado', atualizadoEm: 'v2' }]); await movimento;
  const arvore = a.render(props); assert.equal(gravacoes, 1); assert.match(texto(arvore), /Nome atualizado/); assert.match(texto(arvore), /A lista foi atualizada/);
  assert.equal(botao(arvore, 'Confirmar envio à lixeira'), undefined);
});

test('falha de transporte mantém kit ativo; resposta tardia de movimento não volta a sessão encerrada', async () => {
  let vigente = true; const pendente = adiado();
  const a = ambiente('default', { arquivarKit: () => pendente.promise }), props = { ...propsBase, vigente: () => vigente };
  a.render(props); a.pedidos[0].resolve([kit]); await aguardar();
  botao(a.render(props), 'Mover para lixeira').props.onClick();
  const movimento = botao(a.render(props), 'Confirmar envio à lixeira').props.onClick();
  pendente.reject(new Error('Não foi possível confirmar o salvamento.')); await movimento;
  assert.ok(botao(a.render(props), 'Abrir kit')); assert.match(texto(a.render(props)), /Não foi possível confirmar/);
  const tardio = adiado(), b = ambiente('default', { arquivarKit: () => tardio.promise });
  b.render(props); b.pedidos[0].resolve([kit]); await aguardar(); botao(b.render(props), 'Mover para lixeira').props.onClick();
  const resposta = botao(b.render(props), 'Confirmar envio à lixeira').props.onClick(); vigente = false; b.desmontar(); tardio.resolve({ ...kit, estado: 'lixeira', nome: 'Resposta tardia' }); await resposta;
  assert.doesNotMatch(texto(b.render(props)), /Resposta tardia/);
});

test('kit arquivado remotamente preserva formulário aberto e impede nova gravação', () => {
  const a = ambiente('FormKit'), enviados = [], props = { inicial: { ...kit, estado: 'lixeira' }, documentos: propsBase.documentos, titulares: propsBase.titulares, editais: propsBase.licitacoes, aoSalvar: v => enviados.push(v) };
  let arvore = a.render(props); botao(arvore, 'Salvar kit');
  assert.equal(botao(arvore, 'Salvar kit').props.disabled, true);
  buscar(arvore, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); arvore = a.render(props);
  assert.equal(enviados.length, 0); assert.match(texto(arvore), /rascunho permanece/);
  assert.ok(buscar(arvore, n => n.type === 'textarea' && n.props.value === req.descricao));
});

test('serviço de lixeira envia apenas ID e versão pela sessão, propagando conflito e cancelamento', async () => {
  const chamadas = [], resposta = { ...kit, estado: 'lixeira' };
  const api = servico({ API: 'https://exemplo.invalid', mensagemDoStatus: s => `Falha ${s}`, comCracha: async (url, opcoes) => { chamadas.push({ url, opcoes }); return { ok: true, json: async () => ({ ok: true, item: resposta }) }; } });
  assert.equal((await api.arquivarKit(kit)).estado, 'lixeira'); await api.restaurarKit({ ...kit, atualizadoEm: 'v2' });
  assert.deepEqual(JSON.parse(chamadas[0].opcoes.body), { action: 'arquivarKitLicitacoes', id: kit.id, versao: 'v1' });
  assert.deepEqual(JSON.parse(chamadas[1].opcoes.body), { action: 'restaurarKitLicitacoes', id: kit.id, versao: 'v2' });
  await assert.rejects(api.arquivarKit(kit, { vigente: () => false }), /sessão mudou/); assert.equal(chamadas.length, 2);
  const conflito = servico({ API: 'https://exemplo.invalid', mensagemDoStatus: s => `Falha ${s}`, comCracha: async () => ({ ok: false, status: 409, json: async () => ({ ok: false, erro: 'Registro mudou' }) }) });
  await assert.rejects(conflito.restaurarKit(kit), e => e.status === 409 && /Registro mudou/.test(e.message));
});

test('restaurar pelo formulário aberto conserva o rascunho e usa a versão relida', async () => {
  const gravacoes = [], restauracoes = [], arquivado = { ...kit, estado: 'lixeira', atualizadoEm: 'v2' }, restaurado = { ...kit, estado: 'ativo', atualizadoEm: 'v3' };
  const a = ambiente('default', {
    salvarKit: async (item, versao) => { gravacoes.push({ item, versao }); if (versao === 'v1') throw Object.assign(new Error('Kit mudou'), { status: 409 }); return { ...restaurado, ...item, atualizadoEm: 'v4' }; },
    restaurarKit: async (item, opcoes) => { restauracoes.push({ item, opcoes }); return restaurado; },
  }), props = { ...propsBase, vigente: () => true };
  a.render(props); a.pedidos[0].resolve([kit]); await aguardar();
  botao(a.render(props), 'Abrir kit').props.onClick();
  const form = ambiente('FormKit'), formularioProps = () => buscar(a.render(props), n => n.type === 'FormKit').props;
  let campos = form.render(formularioProps());
  buscar(campos, n => n.type === 'input' && n.props.value === kit.nome).props.onChange({ target: { value: 'Rascunho que deve sobreviver' } });
  const rascunho = { ...kit, nome: 'Rascunho que deve sobreviver' };
  await formularioProps().aoSalvar(rascunho);
  const releitura = botao(a.render(props), 'Recarregar versão').props.onClick(); a.pedidos[1].resolve([arquivado]); await releitura;
  form.render(formularioProps()); campos = form.render(formularioProps());
  assert.equal(botao(campos, 'Salvar kit').props.disabled, true);
  assert.ok(buscar(campos, n => n.type === 'input' && n.props.value === rascunho.nome));
  await botao(campos, 'Restaurar kit e manter preenchimento').props.onClick();
  assert.equal(restauracoes[0].item.atualizadoEm, 'v2');
  assert.ok(buscar(a.render(props), n => n.type === 'FormKit'), 'modal permanece montado após restaurar');
  assert.equal(formularioProps().inicial.atualizadoEm, 'v3');
  form.render(formularioProps()); campos = form.render(formularioProps());
  assert.equal(botao(campos, 'Salvar kit').props.disabled, false);
  assert.ok(buscar(campos, n => n.type === 'input' && n.props.value === rascunho.nome));
  buscar(campos, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await aguardar();
  assert.equal(gravacoes.length, 2); assert.equal(gravacoes[1].versao, 'v3'); assert.equal(gravacoes[1].item.nome, rascunho.nome);
  assert.equal(gravacoes[1].item.requisitos[0].versaoId, 'versao1');
});

for (const escolha of ['local', 'remoto']) test(`restauração exige resolver nome divergente antes de preservar a escolha ${escolha}`, async () => {
  const gravacoes = [], restauracoes = [], nomeLocal = 'Nome preenchido na aba A';
  const arquivado = { ...kit, nome: 'Nome atualizado na aba B', estado: 'lixeira', atualizadoEm: 'v3' };
  const restaurado = { ...arquivado, estado: 'ativo', atualizadoEm: 'v4' };
  const a = ambiente('default', {
    salvarKit: async (item, versao) => { gravacoes.push({ item, versao }); if (versao === 'v1') throw Object.assign(new Error('Kit mudou'), { status: 409 }); return { ...restaurado, ...item, atualizadoEm: 'v5' }; },
    restaurarKit: async item => { restauracoes.push(item); return restaurado; },
  }), props = { ...propsBase, vigente: () => true };
  a.render(props); a.pedidos[0].resolve([kit]); await aguardar();
  botao(a.render(props), 'Abrir kit').props.onClick();
  const form = ambiente('FormKit'), formularioProps = () => buscar(a.render(props), n => n.type === 'FormKit').props;
  let campos = form.render(formularioProps());
  buscar(campos, n => n.type === 'input' && n.props.value === kit.nome).props.onChange({ target: { value: nomeLocal } });
  await formularioProps().aoSalvar({ ...kit, nome: nomeLocal });
  const releitura = botao(a.render(props), 'Recarregar versão').props.onClick(); a.pedidos[1].resolve([arquivado]); await releitura;
  form.render(formularioProps()); campos = form.render(formularioProps());
  assert.ok(botao(campos, 'Manter meu preenchimento'), 'diferença exige escolha explícita');
  const restaurar = botao(campos, 'Restaurar kit e manter preenchimento');
  assert.equal(restaurar.props.disabled, true, 'restaurar não pode apagar conflitos ainda pendentes');
  await restaurar.props.onClick();
  assert.equal(restauracoes.length, 0, 'ação também é protegida contra chamada direta');
  campos = form.render(formularioProps());
  assert.match(texto(campos), /Resolva os campos em conflito antes de restaurar/);
  assert.equal(botao(campos, 'Salvar kit').props.disabled, true);
  botao(campos, escolha === 'local' ? 'Manter meu preenchimento' : 'Usar versão do servidor').props.onClick();
  campos = form.render(formularioProps());
  assert.equal(botao(campos, 'Restaurar kit e manter preenchimento').props.disabled, false);
  await botao(campos, 'Restaurar kit e manter preenchimento').props.onClick();
  assert.equal(restauracoes.length, 1); assert.equal(restauracoes[0].atualizadoEm, 'v3');
  form.render(formularioProps()); campos = form.render(formularioProps());
  assert.equal(botao(campos, 'Salvar kit').props.disabled, false);
  assert.equal(botao(campos, 'Manter meu preenchimento'), undefined);
  buscar(campos, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await aguardar();
  assert.equal(gravacoes.length, 2); assert.equal(gravacoes[1].versao, 'v4');
  assert.equal(gravacoes[1].item.nome, escolha === 'local' ? nomeLocal : arquivado.nome);
  assert.equal(gravacoes[1].item.requisitos[0].versaoId, 'versao1');
});
