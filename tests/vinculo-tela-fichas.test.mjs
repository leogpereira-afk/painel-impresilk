import {equipamentosComBens} from '../src/lib/calc/area-bem.js';
// Campo "Bem do inventário" nas fichas de cima (BemDaFicha.jsx, FormFisico,
// Computadores e Estrutura › Itens), renderizado num vm como em
// tests/patrimonio-estrutura-ui.test.mjs. Hooks e rede simulados; cálculos reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import * as vinculo from '../src/lib/calc/vinculo-patrimonio.js';
import * as equipamentos from '../src/lib/calc/equipamentos-patrimonio.js';
import * as informatica from '../src/lib/calc/informatica-patrimonio.js';
import * as estrutura from '../src/lib/calc/estrutura-patrimonio.js';
import { caminhoManutencao } from '../src/lib/calc/navegacao-patrimonio.js';

const json = valor => JSON.parse(JSON.stringify(valor));
const evento = { preventDefault() {} };
// Tira os imports e expõe as exportações do arquivo no contexto do vm.
function compilar(caminho) {
  const texto = readFileSync(new URL(caminho, import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  const nomes = [...texto.matchAll(/^export (?:default )?(?:function|const) (\w+)/gm)].map(m => m[1]);
  const fonte = texto.replace(/^export default function /gm, 'function ').replace(/^export (function|const) /gm, '$1 ');
  return transformSync(`${fonte}\nObject.assign(globalThis,{${nomes.join(',')}});`, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', target: 'es2022' }).code;
}
const ficha = (id, tipo, categoria = '', extra = {}) => ({ id, tipo, categoria, nome: 'Ficha ' + id, especificacao: {}, atualizadoEm: 'v-' + id, ...extra });
const bem = (id, extra = {}) => ({ id, codigo: 'PRO-' + id, nomeGenerico: 'Bem ' + id, situacao: 'uso', setorSigla: 'PRO', atualizadoEm: 'vb-' + id, ...extra });

function ambiente(arquivos, injetar = {}) {
  const estados = [], efeitos = []; let indice = 0, montado = false, arvore, raiz, props = {};
  const ctx = vm.createContext({
    h: (type, p, ...children) => ({ type, props: { ...p, children } }), Fragment: 'Fragment',
    useState(inicial) { const n = indice++; if (!(n in estados)) estados[n] = typeof inicial === 'function' ? inicial() : inicial; return [estados[n], valor => { estados[n] = typeof valor === 'function' ? valor(estados[n]) : valor; }]; },
    useRef(inicial) { const n = indice++; return estados[n] ||= { current: inicial }; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => { if (!montado) efeitos.push(fn); },
    equipamentosComBens, ...vinculo, ...equipamentos, ...informatica, ...estrutura, caminhoManutencao,
    podeAbrir: () => true, usePessoasRH: () => ({ pessoas: [] }), comNomeRH: r => r,
    useFocoFicha: () => ({ id: '', pedido: '', limpar() {} }),
    crypto: { randomUUID: () => '671f0a1d-0fbe-4b90-9ad8-3cbd81e8a7e0' }, URLSearchParams, structuredClone, console,
    ...Object.fromEntries(['Link', 'Unlink', 'ArrowUpRight', 'Plus', 'RefreshCw', 'Pencil', 'Building2', 'Printer', 'Search', 'X', 'ChevronLeft', 'ChevronRight', 'MapPin', 'UserRound', 'Wrench', 'Link2', 'Check',
      'JanelaFormulario', 'PessoaRH', 'ContatoResponsavel', 'ContatoLinks', 'FocoFicha'].map(n => [n, n])),
    ...injetar,
  });
  for (const arquivo of arquivos) vm.runInContext(compilar(arquivo), ctx);
  // Expande componentes de função (como o React faria) para ver o campo por dentro.
  const expandir = no => Array.isArray(no) ? no.map(expandir) : no && typeof no === 'object' ? (typeof no.type === 'function' ? expandir(no.type(no.props)) : { type: no.type, props: { ...no.props, children: expandir(no.props.children) } }) : no;
  const todos = no => Array.isArray(no) ? no.flatMap(todos) : no && typeof no === 'object' ? [no, ...todos(no.props.children)] : [];
  const texto = no => Array.isArray(no) ? no.map(texto).join('') : no && typeof no === 'object' ? texto(no.props.children) : typeof no === 'string' || typeof no === 'number' ? String(no) : '';
  const api = {
    ctx,
    montar(nome, p = {}, { expandirFilhos = false } = {}) { raiz = { nome, expandirFilhos }; props = p; return api.render(); },
    render() { indice = 0; const no = ctx[raiz.nome](props); arvore = raiz.expandirFilhos ? expandir(no) : no; if (!montado) { montado = true; for (const efeito of efeitos) efeito(); } return arvore; },
    async iniciar(nome, p, opcoes) { api.montar(nome, p, opcoes); await new Promise(setImmediate); api.render(); },
    todos: () => todos(arvore), texto: () => texto(arvore),
    achar(predicado) { const n = todos(arvore).find(predicado); assert.ok(n, 'Elemento esperado não foi renderizado'); return n; },
    botoes: rotulo => todos(arvore).filter(n => n.type === 'button' && (texto(n).trim() === rotulo || n.props['aria-label'] === rotulo)),
    async clicar(rotulo, n = 0) { const b = api.botoes(rotulo)[n]; assert.ok(b, 'Botão esperado: ' + rotulo); await b.props.onClick(); await new Promise(setImmediate); return api.render(); },
    opcoesDoBem() { const label = todos(arvore).find(n => n.type === 'label' && texto(n.props.children[0]) === 'Bem do inventário'); assert.ok(label, 'Campo Bem do inventário'); return todos(label).filter(n => n.type === 'option').map(o => o.props.value); },
  };
  return api;
}

const BENS = [
  bem('livre'), bem('baixado', { situacao: 'baixado' }),
  bem('do-carro', { origemAtivoId: 'carro-1' }), bem('da-camera'), bem('ligado-aqui'),
];
const FICHAS = [ficha('carro-1', 'veiculo', '', { bemId: 'do-carro' }), ficha('cam-1', 'seguranca', 'Câmera', { bemId: 'da-camera' }), ficha('pc-1', 'informatica', 'Computador')];

test('FormFisico só oferece bens livres e não baixados, sobre a lista inteira de fichas', () => {
  const a = ambiente(['../src/components/patrimonio/BemDaFicha.jsx', '../src/components/patrimonio/InformaticaFisica.jsx'],
    { window: { confirm: () => true }, desvincularFicha: async () => ({}) });
  a.montar('FormFisico', { item: { categoria: 'Computador', especificacao: {}, bemId: '' }, setItem() {}, bens: BENS, setores: [], categorias: ['Computador'], fichas: FICHAS, fichaSalva: FICHAS[2] }, { expandirFilhos: true });
  assert.deepEqual(a.opcoesDoBem(), ['', 'ligado-aqui', 'livre']);
  assert.doesNotMatch(a.texto(), /Vínculo anterior a conferir/);
  assert.match(a.texto(), /Aparecem só bens livres e que não estão baixados\. Para trocar o bem depois, desfaça o vínculo e ligue de novo\./);
});

function bemDaFicha(props, injetar = {}) {
  const chamadas = { desfazer: [], confirm: [], desfeito: [], ver: [] };
  const a = ambiente(['../src/components/patrimonio/BemDaFicha.jsx'], {
    window: { confirm: texto => { chamadas.confirm.push(texto); return injetar.confirmar ?? true; } },
    desvincularFicha: async dados => { chamadas.desfazer.push(json(dados)); if (injetar.falhar) throw Object.assign(new Error(injetar.falhar), { status: 409 }); return { ok: true, ficha: { ...props.ficha, bemId: '' }, bem: null }; },
  });
  a.montar('BemDaFicha', { bens: BENS, fichas: FICHAS, aoMudar() {}, aoDesfeito: r => chamadas.desfeito.push(json(r)), aoVerBem: b => chamadas.ver.push(b.id), ...props });
  return { a, chamadas };
}

test('ficha ligada mostra o bem com Desfazer e Ver bem; Desfazer manda o corpo exato', async () => {
  const pc = ficha('pc-1', 'informatica', 'Computador', { nome: 'Computador', bemId: 'ligado-aqui' });
  const { a, chamadas } = bemDaFicha({ ficha: pc });
  assert.match(a.texto(), /Ligado ao bem PRO-ligado-aqui · Bem ligado-aqui/);
  assert.equal(a.todos().some(n => n.type === 'select'), false);
  await a.clicar('Ver bem'); assert.deepEqual(chamadas.ver, ['ligado-aqui']);
  await a.clicar('Desfazer vínculo');
  assert.equal(chamadas.confirm[0], 'Desfazer o vínculo entre Estrutura · Computador e o bem PRO-ligado-aqui?\n\nO bem e a ficha continuam cadastrados, e o histórico de manutenção continua na ficha.');
  assert.deepEqual(chamadas.desfazer, [{ bemId: 'ligado-aqui', ativoId: 'pc-1', versaoFicha: 'v-pc-1', versaoBem: 'vb-ligado-aqui', origem: 'ficha' }]);
  assert.equal(chamadas.desfeito[0].ficha.bemId, '');
  assert.match(a.texto(), /Vínculo desfeito\. O bem e a ficha continuam cadastrados\./);
  const nao = bemDaFicha({ ficha: pc }, { confirmar: false });
  await nao.a.clicar('Desfazer vínculo'); assert.equal(nao.chamadas.desfazer.length, 0);
  const erro = bemDaFicha({ ficha: pc }, { falhar: 'Esta ficha mudou. Atualize antes de continuar.' });
  await erro.a.clicar('Desfazer vínculo'); assert.match(erro.a.texto(), /Esta ficha mudou\. Atualize antes de continuar\./);
});

test('bem que sumiu e conflito também têm Desfazer, um por bem envolvido', async () => {
  const sumido = bemDaFicha({ ficha: ficha('pc-1', 'informatica', 'Computador', { bemId: 'excluido' }) });
  assert.match(sumido.a.texto(), /Ligado a um bem que não está mais no inventário\. Desfaça o vínculo para liberar a ficha\./);
  await sumido.a.clicar('Desfazer vínculo');
  assert.match(sumido.chamadas.confirm[0], /e o bem que não está mais no inventário\?/);
  assert.deepEqual(sumido.chamadas.desfazer, [{ bemId: 'excluido', ativoId: 'pc-1', versaoFicha: 'v-pc-1', versaoBem: '', origem: 'ficha' }]);
  const conflito = bemDaFicha({ ficha: ficha('carro-1', 'veiculo', '', { bemId: 'livre' }) });
  assert.match(conflito.a.texto(), /Vínculo com o inventário a conferir\. Desfaça o vínculo errado aqui ou na ficha do bem\./);
  assert.equal(conflito.a.botoes('Desfazer vínculo com PRO-livre · Bem livre').length, 1);
  assert.equal(conflito.a.botoes('Desfazer vínculo com PRO-do-carro · Bem do-carro').length, 1);
  const semModulo = ambiente(['../src/components/patrimonio/BemDaFicha.jsx'], { podeAbrir: m => ['inventario-valores', 'patrimonio'].includes(m), window: { confirm: () => true }, desvincularFicha: async () => ({}) });
  semModulo.montar('BemDaFicha', { ficha: FICHAS[0], bens: BENS, fichas: FICHAS });
  assert.equal(semModulo.botoes('Desfazer vínculo').length, 0);
  assert.match(semModulo.texto(), /Para desfazer, é preciso a permissão Patrimônio · Manutenções\./);
});

test('só a ficha livre manda bemId ao salvar', () => {
  const a = ambiente(['../src/components/patrimonio/BemDaFicha.jsx']);
  assert.equal(a.ctx.mandaBemId(null, BENS), true);
  assert.equal(a.ctx.mandaBemId(FICHAS[2], BENS), true);
  assert.equal(a.ctx.mandaBemId(FICHAS[0], BENS), false);
  assert.equal(a.ctx.mandaBemId(ficha('x', 'maquina', '', { bemId: 'excluido' }), BENS), false);
});

function computadores({ lista, salvar }) {
  const chamadas = { salvar: [], mudou: 0 };
  const a = ambiente(['../src/components/patrimonio/BemDaFicha.jsx', '../src/components/patrimonio/InformaticaFisica.jsx', '../src/components/patrimonio/Computadores.jsx'], {
    listarEquipamentosPatrimonio: async () => json(lista), lerInfra: async () => ({ itens: {} }), lerManutencoes: async () => ({}), lerLimiteManutencao: async () => ({ limiteManutencaoPercentual: null }),
    salvarFisico: async (item, versao) => { chamadas.salvar.push({ item: json(item), versao }); return salvar ? salvar(item) : { ...lista.find(f => f.id === item.id), ...item }; },
    brl: v => String(v), dataLonga: v => v, desvincularFicha: async () => ({}), window: { confirm: () => true },
  });
  return { a, chamadas, iniciar: () => a.iniciar('Computadores', { bens: BENS, setores: [], aoMudarVinculo: () => { chamadas.mudou++; } }) };
}

test('Computadores: ficha ligada não manda bemId; ficha livre manda o bem escolhido', async () => {
  const ligada = ficha('pc-1', 'informatica', 'Computador', { nome: 'PC ligado', bemId: 'ligado-aqui' });
  const livre = ficha('pc-2', 'informatica', 'Computador', { nome: 'PC livre' });
  const c = computadores({ lista: [ligada, livre, ...FICHAS.slice(0, 2)] });
  await c.iniciar();
  await c.a.clicar('Editar PC ligado');
  let form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  assert.equal(form.props.fichaSalva.id, 'pc-1');
  assert.deepEqual(form.props.fichas.map(f => f.id), ['pc-1', 'pc-2', 'carro-1', 'cam-1']);
  await form.props.aoSalvar(evento); c.a.render();
  assert.equal('bemId' in c.chamadas.salvar[0].item, false);
  assert.equal(c.chamadas.mudou, 0);
  await c.a.clicar('Editar PC livre');
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  form.props.setItem(v => ({ ...v, bemId: 'livre' })); c.a.render();
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  await form.props.aoSalvar(evento); c.a.render();
  assert.equal(c.chamadas.salvar[1].item.bemId, 'livre');
  assert.equal(c.chamadas.mudou, 1);
});

test('Computadores: depois do Desfazer, a ficha da lista e o formulário aberto ganham a versão nova', async () => {
  const ligada = ficha('pc-1', 'informatica', 'Computador', { nome: 'PC ligado', bemId: 'ligado-aqui' });
  const c = computadores({ lista: [ligada] });
  await c.iniciar();
  await c.a.clicar('Editar PC ligado');
  let form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  form.props.aoDesfeito({ ok: true, ficha: { ...ligada, bemId: '', atualizadoEm: 'v-novo' } }); c.a.render();
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  assert.equal(form.props.item.atualizadoEm, 'v-novo'); assert.equal(form.props.item.bemId, '');
  assert.equal(form.props.fichaSalva.bemId, ''); assert.equal(c.chamadas.mudou, 1);
});

function itens({ vincular } = {}) {
  const chamadas = { salvar: [], vincular: [], mudou: 0 };
  const a = ambiente(['../src/components/patrimonio/EstruturaLegada.jsx'], {
    BemDaFicha: 'BemDaFicha', mandaBemId: (f, b) => vinculo.vinculoDaFicha(f, b).estado === 'livre', trocarNaLista: (l, f) => f ? [...(l || []).filter(i => i.id !== f.id), f] : l,
    listarEquipamentosPatrimonio: async () => [], lerManutencoes: async () => ({}), salvarEstrutura: async (dado, versao) => { chamadas.salvar.push({ dado: json(dado), versao }); return { ...dado, tipo: 'predial', id: dado.id || dado.cadastroId, bemId: '', atualizadoEm: '2026-10-14T10:00:00.000Z' }; },
    vincularFicha: async dados => { chamadas.vincular.push(json(dados)); if (vincular) return vincular(dados); return { ok: true, ficha: { id: dados.ativoId, tipo: 'predial', nome: 'Ar', categoria: 'Ar-condicionado', bemId: dados.bemId, especificacao: { local: 'Sala' }, atualizadoEm: 'v2' } }; },
    textoAtualizacao: x => x.atualizadoEm || '', dataLonga: x => x, window: { confirm: () => true },
  });
  const iniciar = () => a.iniciar('EstruturaLegada', { bens: BENS, setores: [], aoMudarVinculo: () => { chamadas.mudou++; } });
  const preencher = (id, valor) => { a.achar(n => n.props.id === 'estrutura-' + id).props.onChange({ target: { value: valor } }); a.render(); };
  const novoComBem = async () => {
    await iniciar(); await a.clicar('Novo item de estrutura');
    preencher('nome', 'Ar'); preencher('categoria', 'Ar-condicionado'); preencher('local', 'Sala');
    const campo = a.achar(n => n.type === 'BemDaFicha');
    assert.equal(campo.props.ficha, null); assert.deepEqual(campo.props.fichas, []);
    campo.props.aoMudar('livre'); a.render();
    await a.achar(n => n.type === 'form').props.onSubmit(evento); await new Promise(setImmediate); a.render();
  };
  return { a, chamadas, novoComBem };
}

test('Itens da Estrutura: salvarEstrutura sem bemId e vincularFicha logo depois, com a ficha salva', async () => {
  const t = itens();
  await t.novoComBem();
  assert.equal(t.chamadas.salvar.length, 1);
  assert.equal('bemId' in t.chamadas.salvar[0].dado, false);
  assert.deepEqual(t.chamadas.vincular, [{ bemId: 'livre', ativoId: '671f0a1d-0fbe-4b90-9ad8-3cbd81e8a7e0', versaoFicha: '2026-10-14T10:00:00.000Z', versaoBem: 'vb-livre', origem: 'ficha' }]);
  assert.match(t.a.texto(), /Item salvo e ligado ao bem do inventário\./);
  assert.equal(t.chamadas.mudou, 1);
});

test('Itens da Estrutura: falha na ligação mantém a ficha salva e diz o motivo', async () => {
  const t = itens({ vincular: async () => { throw Object.assign(new Error('Este bem já está ligado a Máquina · Laser. Desfaça esse vínculo antes de ligar de novo.'), { status: 409 }); } });
  await t.novoComBem();
  assert.match(t.a.texto(), /Ficha salva, mas o vínculo com o bem não foi feito: Este bem já está ligado a Máquina · Laser\. Desfaça esse vínculo antes de ligar de novo\./);
  assert.equal(t.a.todos().some(n => n.type === 'form'), false);
  assert.equal(t.chamadas.mudou, 0);
});

// ── Revisão adversarial do vínculo ──
const textoDe = no => Array.isArray(no) ? no.map(textoDe).join('') : no && typeof no === 'object' ? textoDe(no.props.children) : typeof no === 'string' || typeof no === 'number' ? String(no) : '';

test('ficha baixada e livre não oferece bens nem manda bemId; baixada e ligada segue com o Desfazer', () => {
  const baixada = ficha('pc-b', 'informatica', 'Computador', { nome: 'PC baixado', especificacao: { situacao: 'baixado' } });
  const { a } = bemDaFicha({ ficha: baixada });
  assert.equal(a.todos().some(n => n.type === 'select'), false);
  assert.match(a.texto(), /Ficha baixada: não pode ser ligada a um bem\./);
  assert.equal(a.ctx.mandaBemId(baixada, BENS), false);
  const ligada = bemDaFicha({ ficha: ficha('pc-1', 'informatica', 'Computador', { bemId: 'ligado-aqui', especificacao: { situacao: 'baixado' } }) });
  assert.match(ligada.a.texto(), /Ligado ao bem PRO-ligado-aqui · Bem ligado-aqui/);
  assert.equal(ligada.a.botoes('Desfazer vínculo').length, 1);
});

test('Computadores: ficha baixada salva sem bemId; recusa do vínculo mostra o motivo e não trava; versão velha trava', async () => {
  const baixada = ficha('pc-b', 'informatica', 'Computador', { nome: 'PC baixado', especificacao: { situacao: 'baixado' } });
  const livre = ficha('pc-2', 'informatica', 'Computador', { nome: 'PC livre' });
  let falha = null;
  const c = computadores({ lista: [baixada, livre], salvar: item => { if (falha) throw falha; return { ...[baixada, livre].find(f => f.id === item.id), ...item }; } });
  await c.iniciar();
  await c.a.clicar('Editar PC baixado');
  let form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  form.props.setItem(v => ({ ...v, nome: 'PC baixado renomeado', bemId: 'livre' })); c.a.render();
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  await form.props.aoSalvar(evento); c.a.render();
  assert.equal(c.chamadas.salvar[0].item.nome, 'PC baixado renomeado');
  assert.equal('bemId' in c.chamadas.salvar[0].item, false);
  assert.equal(c.a.todos().some(n => n.type === c.a.ctx.FormFisico), false, 'salvou e fechou');
  falha = Object.assign(new Error('Esta ficha está baixada e não pode ser ligada.'), { status: 409, recusaVinculo: true });
  await c.a.clicar('Editar PC livre');
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  form.props.setItem(v => ({ ...v, bemId: 'livre' })); c.a.render();
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  await form.props.aoSalvar(evento); c.a.render();
  form = c.a.achar(n => n.type === c.a.ctx.FormFisico);
  assert.equal(form.props.erro, 'Esta ficha está baixada e não pode ser ligada.');
  assert.equal(form.props.conflito, false);
  assert.doesNotMatch(textoDe(c.a.ctx.FormFisico(form.props)), /Outra alteração foi salva/);
  falha = Object.assign(new Error('Este item mudou. Recarregue antes de salvar.'), { status: 409 });
  await form.props.aoSalvar(evento); c.a.render();
  assert.equal(c.a.achar(n => n.type === c.a.ctx.FormFisico).props.conflito, true);
});

test('as fichas que mandam bemId só travam o formulário em conflito de versão', () => {
  for (const arquivo of ['Computadores', 'Celulares', 'EletricaInfra', 'Ramais', 'Seguranca', 'Incendio']) {
    const fonte = readFileSync(new URL(`../src/components/patrimonio/${arquivo}.jsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(fonte, /status\s*===\s*409\)\s*setConflito\(true\)/, arquivo);
    assert.match(fonte, /conflitoDeVersao\(e\)\)\s*setConflito\(true\)/, arquivo);
  }
  const a = ambiente(['../src/components/patrimonio/BemDaFicha.jsx']);
  assert.equal(a.ctx.conflitoDeVersao(Object.assign(new Error('x'), { status: 409 })), true);
  assert.equal(a.ctx.conflitoDeVersao(Object.assign(new Error('x'), { status: 409, recusaVinculo: true })), false);
  assert.equal(a.ctx.conflitoDeVersao(Object.assign(new Error('x'), { status: 422 })), false);
});

test('serviços das fichas repassam a marca recusaVinculo do servidor', async () => {
  for (const [arquivo, nome] of [['../src/services/patrimonio-evolucao.js', 'salvarFisico'], ['../src/services/ativos.js', 'salvarTelefonia']]) {
    const respostas = [{ erro: 'Esta ficha está baixada e não pode ser ligada.', recusaVinculo: true }, { erro: 'Este item mudou. Recarregue antes de salvar.' }];
    const ctx = vm.createContext({ API: 'http://teste.invalid', mensagemDoStatus: s => 'Erro ' + s, comCracha: async () => new Response(JSON.stringify(respostas.shift()), { status: 409 }), Response, console });
    vm.runInContext(compilar(arquivo), ctx);
    const recusa = await ctx[nome]({ id: 'f-1' }, 'v1').catch(e => e);
    assert.deepEqual([recusa.message, recusa.status, recusa.recusaVinculo], ['Esta ficha está baixada e não pode ser ligada.', 409, true], nome);
    const versao = await ctx[nome]({ id: 'f-1' }, 'v1').catch(e => e);
    assert.deepEqual([versao.status, versao.recusaVinculo], [409, false], nome);
  }
});

test('Carros e Máquinas: salvar o cadastro avisa o Patrimônio, que relê bens e fichas', async () => {
  let mudou = 0;
  const a = ambiente(['../src/components/patrimonio/Equipamentos.jsx'], {
    useSearchParams: () => [new URLSearchParams(''), () => {}], listarEquipamentosPatrimonio: async () => [ficha('car-1', 'veiculo', '', { nome: 'Carro exemplo' })], listarAtivos: async () => [],
    textoAtualizacao: () => '', CadastroEquipamento: 'CadastroEquipamento', Car: 'Car', Cog: 'Cog',
  });
  await a.iniciar('EquipamentosPatrimonio', { tipo: 'veiculo', bens: BENS, setores: [], aoVerBem() {}, aoMudarVinculo: () => { mudou++; } });
  await a.clicar('Cadastrar carro');
  const cadastro = a.achar(n => n.type === 'CadastroEquipamento');
  await cadastro.props.aoConcluir({ id: 'car-2', tipo: 'veiculo', bemId: 'livre' }); a.render();
  assert.equal(mudou, 1);
  assert.equal(a.todos().some(n => n.type === 'CadastroEquipamento'), false);
});

test('Itens da Estrutura: o AVCB não mostra o campo do bem e nunca tenta o vínculo', async () => {
  const t = itens();
  await t.a.iniciar('EstruturaLegada', { bens: BENS, setores: [], aoMudarVinculo() {} });
  await t.a.clicar('Novo item de estrutura');
  const preencher = (id, valor) => { t.a.achar(n => n.props.id === 'estrutura-' + id).props.onChange({ target: { value: valor } }); t.a.render(); };
  preencher('nome', 'Documento'); preencher('categoria', 'Ar-condicionado'); preencher('local', 'Sala');
  t.a.achar(n => n.type === 'BemDaFicha').props.aoMudar('livre'); t.a.render();
  preencher('categoria', 'AVCB');
  assert.equal(t.a.todos().some(n => n.type === 'BemDaFicha'), false);
  await t.a.achar(n => n.type === 'form').props.onSubmit(evento); await new Promise(setImmediate); t.a.render();
  assert.equal(t.chamadas.salvar.length, 1);
  assert.equal(t.chamadas.vincular.length, 0);
  assert.doesNotMatch(t.a.texto(), /vínculo com o bem não foi feito/);
});
