// Página do Patrimônio (src/pages/Patrimonio.jsx) e a navegação das abas num
// vm, no padrão de tests/vinculo-tela-bloco.test.mjs: hooks simulados, abas e
// janelas como marcas de texto, cálculos e textos reais. Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import { calcPatrimonio, SETORES_PADRAO, SITUACOES, idadeEmAnos } from '../src/lib/calc/patrimonio.js';
import { FILTROS_INICIAIS, filtrarInventario, pendenciasBem, bensParaImpressao, ordenarPendencias } from '../src/lib/calc/inventario.js';
import { vinculosDosBens, rotuloLigadoA, rotuloVinculoServidor } from '../src/lib/calc/vinculo-patrimonio.js';
import { abasPatrimonio, abaPatrimonioAtual, secaoEstruturaInicial } from '../src/lib/calc/navegacao-patrimonio.js';
import { moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo } from '../src/lib/format.js';
import { CONTROLES } from '../src/lib/calc/controles-patrimonio.js';

const jsx = (texto, fim) => transformSync(`${texto.replace(/^import .*;\s*$/gm, '').replace(/^export default function /gm, 'function ')}\n${fim}`, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', target: 'es2022' }).code;
const ler = caminho => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const codigoPagina = jsx(ler('../src/pages/Patrimonio.jsx'), 'globalThis.Pagina = PatrimonioConteudo;');
const todos = no => Array.isArray(no) ? no.flatMap(todos) : no && typeof no === 'object' ? [no, ...todos(no.props.children)] : [];
const texto = no => Array.isArray(no) ? no.map(texto).join('') : no && typeof no === 'object' ? texto(no.props.children) : typeof no === 'string' || typeof no === 'number' ? String(no) : '';
// Objetos criados dentro do vm têm outro protótipo: compara pelo conteúdo.
const json = valor => valor === undefined ? valor : JSON.parse(JSON.stringify(valor));
const marcas = nomes => Object.fromEntries(nomes.map(n => [n, n]));
const ICONES = ['Plus', 'Search', 'Printer', 'Building2', 'Boxes', 'Wallet', 'AlertTriangle', 'Camera', 'LayoutGrid', 'List', 'ArrowUpRight', 'Pencil', 'Trash2', 'RefreshCw', 'Tag', 'ChevronLeft', 'ChevronRight', 'X', 'Phone', 'Archive', 'Wrench', 'BedDouble', 'Car', 'Cog', 'Shield', 'FireExtinguisher', 'Link2'];
const COMPONENTES = ['AreaDoBem', 'BensDaArea', 'Telefonia', 'SegurancaPatrimonio', 'Incendio', 'PessoasRHProvider', 'HistoricoBem', 'VinculoDoBem', 'CarregandoModulo', 'ErroModulo', 'AvisoAtualizacao', 'JanelaFormulario', 'FotosPatrimonio', 'FormBem', 'FormSetor', 'ControlesPatrimonio', 'AtualizacaoPatrimonio', 'VinculosSetor', 'EquipamentosPatrimonio', 'EstruturaPatrimonio'];

const bem = (codigo, nomeGenerico, extra = {}) => ({ codigo, nomeGenerico, setorSigla: 'PRO', situacao: 'uso', valor: 100, responsavel: 'Pessoa fictícia', atualizadoEm: 'v-' + codigo, ...extra });
const BENS = {
  'bem-1': bem('PRO-001', 'Laser'),
  'bem-2': bem('PRO-002', 'Mesa'),
  'bem-3': bem('PRO-003', 'Câmera'),
  'bem-4': bem('PRO-004', 'Compressor', { origemAtivoId: 'retirada' }),
  'bem-5': bem('PRO-005', 'Prensa'),
};
const FICHAS = {
  itens: [
    { id: 'maq-1', tipo: 'maquina', nome: 'Laser fictício', bemId: 'bem-1', especificacao: {}, atualizadoEm: 'v1' },
    { id: 'maq-5', tipo: 'maquina', nome: 'Prensa fictícia', bemId: 'bem-5', especificacao: {}, atualizadoEm: 'v1' },
    { id: 'pc-5', tipo: 'informatica', categoria: 'Computador', nome: 'PC fictício', bemId: 'bem-5', especificacao: {}, atualizadoEm: 'v1' },
  ],
  vinculosOcultos: [{ ativoId: 'cam-1', bemId: 'bem-3' }],
};

function pagina({ aba = 'estrutura', confirmar = true, remover, salvar, permissao = () => true } = {}) {
  const estados = [], efeitos = [], raf = [], chamadas = { abas: [], confirm: [], remover: [] };
  let indice = 0, montado = false, abaAtual = aba;
  const navegar = (chave, opcoes) => { chamadas.abas.push({ chave, opcoes }); return [abaAtual, v => { abaAtual = v; }]; };
  const ctx = vm.createContext({
    h: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(inicial) { const n = indice++; if (!(n in estados)) estados[n] = typeof inicial === 'function' ? inicial() : inicial; return [estados[n], valor => { estados[n] = typeof valor === 'function' ? valor(estados[n]) : valor; }]; },
    useRef(inicial) { const n = indice++; return estados[n] ||= { current: inicial }; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => { if (!montado) efeitos.push(fn); },
    ...marcas(ICONES), ...marcas(COMPONENTES),
    usePessoasRH: () => ({ pessoas: [] }), comNomeRH: r => r, podeAbrir: permissao,
    abasPatrimonio, abaPatrimonioAtual, secaoEstruturaInicial, vinculosDosBens, rotuloLigadoA, rotuloVinculoServidor,
    calcPatrimonio, SETORES_PADRAO, SITUACOES, idadeEmAnos, FILTROS_INICIAIS, filtrarInventario, pendenciasBem, bensParaImpressao, ordenarPendencias,
    moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo, CONTROLES,
    useAbaNavegavel: () => navegar('aba', undefined), useParamNavegavel: (chave, _padrao, _permitidas, opcoes) => navegar(chave, opcoes),
    lerFichasDoPatrimonio: async () => structuredClone(FICHAS), lerBens: async () => structuredClone(BENS), lerSetores: async () => ({ s1: { sigla: 'PRO', nome: 'Produção' } }),
    salvarBem: salvar || (async () => ({})), salvarSetor: async () => ({}), removerSetor: async () => ({}), semearSetores: async () => ({}),
    removerBem: async id => { chamadas.remover.push(id); if (remover) return remover(id); return {}; },
    resumoFotos: async () => ({}), listarFotos: async () => [],
    requestAnimationFrame: cb => { raf.push(cb); return raf.length; },
    window: { confirm: t => { chamadas.confirm.push(t); return confirmar; } },
    crypto: { randomUUID: () => 'id-novo' }, structuredClone, console,
  });
  vm.runInContext(codigoPagina, ctx);
  const render = () => { indice = 0; const arvore = ctx.Pagina(); if (!montado) { montado = true; for (const efeito of efeitos) efeito(); } return arvore; };
  const api = {
    chamadas, raf,
    async iniciar() { render(); await new Promise(setImmediate); render(); return api; },
    todos: () => todos(render()),
    tipo: nome => todos(render()).find(n => n.type === nome),
    abrirBem(id, componente = 'EstruturaPatrimonio') { api.tipo(componente).props.aoVerBem({ id }); return api.tipo('VinculoDoBem'); },
    async clicar(rotulo) { const b = todos(render()).find(n => n.type === 'button' && texto(n).trim() === rotulo); assert.ok(b, 'Botão esperado: ' + rotulo); await b.props.onClick(); await new Promise(setImmediate); render(); },
    alerta: () => todos(render()).find(n => n.type === 'p' && n.props.role === 'alert'),
  };
  return api;
}

const ABAS = [['estrutura', 'EstruturaPatrimonio'], ['telefonia', 'Telefonia'], ['seguranca', 'SegurancaPatrimonio'], ['incendio', 'Incendio'], ['carros', 'EquipamentosPatrimonio'], ['maquinas', 'EquipamentosPatrimonio']];

test('vínculo feito pelo bloco Ligado a remonta a aba de fichas aberta atrás; o salvar da própria aba não', async () => {
  for (const [aba, componente] of ABAS) {
    const p = await pagina({ aba }).iniciar();
    const chave = p.tipo(componente).props.key;
    p.tipo(componente).props.aoMudarVinculo();
    await new Promise(setImmediate);
    assert.equal(p.tipo(componente).props.key, chave, `${aba}: o aviso da própria aba só relê bens e fichas`);
    const bloco = p.abrirBem('bem-1', componente);
    assert.ok(bloco, `${aba}: ficha do bem aberta`);
    bloco.props.aoMudou({ ficha: { ...FICHAS.itens[0], bemId: '', atualizadoEm: 'v2' }, bem: null });
    assert.notEqual(p.tipo(componente).props.key, chave, `${aba}: a aba relê a própria lista depois do vínculo feito pelo bem`);
  }
});

test('Excluir cadastro de bem ligado mostra a recusa, sem confirm, e leva a mensagem para a vista', async () => {
  const p = await pagina().iniciar();
  p.abrirBem('bem-1');
  await p.clicar('Excluir cadastro');
  assert.equal(p.chamadas.confirm.length, 0);
  assert.equal(p.chamadas.remover.length, 0);
  const alerta = p.alerta();
  assert.equal(texto(alerta), 'Este bem está ligado a Máquina · Laser fictício. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.');
  assert.ok(alerta.props.ref, 'a mensagem da janela tem referência para rolar até ela');
  const rolagens = [];
  alerta.props.ref.current = { scrollIntoView: opcoes => rolagens.push(opcoes) };
  for (const cb of p.raf.splice(0)) cb();
  assert.deepEqual(json(rolagens), [{ block: 'center' }]);
});

test('Excluir cadastro: a recusa do servidor também vai para a vista', async () => {
  const p = await pagina({ remover: async () => { throw new Error('Este bem tem fotos. Remova as fotos antes de excluir.'); } }).iniciar();
  p.abrirBem('bem-2');
  await p.clicar('Excluir cadastro');
  assert.equal(p.chamadas.confirm.length, 1);
  const alerta = p.alerta();
  assert.equal(texto(alerta), 'Este bem tem fotos. Remova as fotos antes de excluir.');
  const rolagens = [];
  alerta.props.ref.current = { scrollIntoView: opcoes => rolagens.push(opcoes) };
  for (const cb of p.raf.splice(0)) cb();
  assert.deepEqual(json(rolagens), [{ block: 'center' }]);
});

test('histórico de manutenção do bem: ficha oculta ou em conflito não vira "sem ficha"; ficha retirada usa a origem gravada', async () => {
  const p = await pagina().iniciar();
  const esperado = { 'bem-1': 'maq-1', 'bem-2': '', 'bem-3': null, 'bem-4': 'retirada', 'bem-5': null };
  for (const [id, fichaId] of Object.entries(esperado)) {
    p.abrirBem(id);
    assert.equal(p.tipo('HistoricoBem').props.fichaId, fichaId, id);
  }
});

test('trocar de aba ou de subaba tira o ?item= do Abrir ficha', async () => {
  const p = await pagina().iniciar();
  assert.deepEqual(json(p.chamadas.abas.find(c => c.chave === 'aba').opcoes), { limpar: ['item'] });
  const local = { pathname: '/patrimonio', search: '?aba=estrutura&estrutura=computadores&telefonia=ramais&item=pc-1' };
  for (const [arquivo, nome, filhos, props] of [
    ['../src/components/patrimonio/Estrutura.jsx', 'EstruturaPatrimonio', ['Computadores', 'InternetInfra', 'EletricaInfra', 'EstruturaLegada'], { secaoInicial: 'computadores' }],
    ['../src/components/patrimonio/Telefonia.jsx', 'Telefonia', ['Ramais', 'Celulares', 'RelacaoNumeros', 'PlanoCorporativo'], {}],
  ]) {
    const ctx = vm.createContext({ h: (type, p2, ...children) => ({ type, props: { ...p2, children } }), Fragment: 'Fragment', Link: 'Link', useLocation: () => local, URLSearchParams, ...marcas(filhos) });
    vm.runInContext(jsx(ler(arquivo), `globalThis.Componente = ${nome};`), ctx);
    const links = todos(ctx.Componente({ bens: [], setores: [], ...props })).filter(n => n.type === 'Link');
    assert.ok(links.length >= 4, nome);
    for (const link of links) {
      const q = new URLSearchParams(link.props.to.split('?')[1]);
      assert.equal(q.has('item'), false, `${nome}: ${link.props.to}`);
      assert.equal(q.get('aba'), 'estrutura', `${nome}: a aba fica`);
    }
  }
  assert.match(ler('../src/components/patrimonio/Seguranca.jsx'), /useParamNavegavel\('seguranca',.*\{limpar:\['item'\]\}\)/);
});


test('área salva no mesmo bem, atualiza a lista e não chama o vínculo técnico', async () => {
 const chamadas=[];
 const p=await pagina({aba:'maquinas',salvar:async(id,dados)=>{chamadas.push({id,dados:json(dados)});return {...BENS,[id]:{...BENS[id],...dados}};}}).iniciar();
 p.abrirBem('bem-2','EquipamentosPatrimonio');
 const bloco=p.tipo('AreaDoBem');
 await bloco.props.aoSalvar(bloco.props.bem,'maquinas');
 assert.deepEqual(chamadas,[{id:'bem-2',dados:{areaPatrimonio:'maquinas'}}]);
 assert.equal(p.tipo('EquipamentosPatrimonio').props.bens.find(b=>b.id==='bem-2').areaPatrimonio,'maquinas');
 assert.equal(p.tipo('AreaDoBem').props.bem.setorSigla,'PRO');
});
test('área não confirmada pelo servidor mostra erro, sem alterar a lista local',async()=>{
 const p=await pagina({aba:'maquinas'}).iniciar();
 p.abrirBem('bem-2','EquipamentosPatrimonio');
 const bloco=p.tipo('AreaDoBem');await bloco.props.aoSalvar(bloco.props.bem,'maquinas');
 assert.match(texto(p.alerta()),/servidor não confirmou/);
 assert.equal(p.tipo('AreaDoBem').props.bem.areaPatrimonio,undefined);
});
test('lista simples dos bens não aparece sem permissão de inventário',async()=>{
 const p=await pagina({aba:'maquinas',permissao:modulo=>modulo!=='inventario-valores'}).iniciar();
 assert.equal(p.tipo('BensDaArea'),undefined);
});

test('Ferramentas & Outros disponível e novo bem já classificado',async()=>{
 const p=await pagina({aba:'outros'}).iniciar();
 assert.equal(p.tipo('BensDaArea').props.area,'outros');
 await p.clicar('Novo bem');assert.equal(p.tipo('FormBem').props.inicial.areaPatrimonio,'outros');
});

// A ficha técnica criada no diálogo precisa renovar também a tabela da aba.
test('atualizar vínculo após cadastro técnico renova a lista da área',async()=>{
 const p=await pagina({aba:'maquinas'}).iniciar();
 p.abrirBem('bem-2','EquipamentosPatrimonio');
 const antes=p.tipo('EquipamentosPatrimonio').props.key;
 await p.tipo('VinculoDoBem').props.aoAtualizar();
 assert.notEqual(p.tipo('EquipamentosPatrimonio').props.key,antes);
});
