// Bloco "Ligado a" na ficha de leitura do bem (VinculoDoBem.jsx), renderizado
// num vm no padrão de tests/patrimonio-estrutura-ui.test.mjs: hooks e rede são
// simulados, os cálculos e textos são os reais. Dados todos fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import * as calc from '../src/lib/calc/vinculo-patrimonio.js';
import { caminhoFichaVinculada, caminhoCadastroPatrimonio } from '../src/lib/calc/navegacao-patrimonio.js';

const fonte = readFileSync(new URL('../src/components/patrimonio/VinculoDoBem.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '').replace('export default function VinculoDoBem', 'function VinculoDoBem');
const codigo = transformSync(fonte + '\nglobalThis.Componente = VinculoDoBem;', { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', target: 'es2022' }).code;
const json = valor => JSON.parse(JSON.stringify(valor));
const RAPHAEL = ['patrimonio', 'inventario-valores', 'manutencoes', 'seguranca'];

const ficha = (id, tipo, categoria = '', extra = {}) => ({ id, tipo, categoria, nome: 'Ficha ' + id, especificacao: {}, atualizadoEm: 'v-' + id, ...extra });
const bem = (id, extra = {}) => ({ id, codigo: 'PRO-' + id, nomeGenerico: 'Bem ' + id, situacao: 'uso', setorSigla: 'PRO', atualizadoEm: 'vb-' + id, ...extra });

function ambiente({ bemAtual, fichas = [], bens = [bemAtual], ocultos = [], perms = RAPHAEL, abas = ['estrutura', 'telefonia', 'seguranca', 'incendio', 'carros', 'maquinas', 'inventario'], setores = [], carregando = false, erro = '', confirmar = true, organizar, salvandoArea=false, vincular, desfazer, historico = async () => [] } = {}) {
  const estados = [], chamadas = { vincular: [], desfazer: [], historico: [], confirm: [], tentar: 0, atualizar: 0, mudou: [], abrir: 0 };
  let indice = 0, arvore;
  const ctx = vm.createContext({
    h: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(inicial) { const n = indice++; if (!(n in estados)) estados[n] = typeof inicial === 'function' ? inicial() : inicial; return [estados[n], valor => { estados[n] = typeof valor === 'function' ? valor(estados[n]) : valor; }]; },
    useRef(inicial) { const n = indice++; return estados[n] ||= { current: inicial }; },
    ...Object.fromEntries(['Link', 'Link2', 'Unlink', 'AlertTriangle', 'ArrowUpRight', 'RefreshCw'].map(n => [n, n])),
    ...calc, caminhoFichaVinculada, caminhoCadastroPatrimonio, URLSearchParams, CadastroEquipamento:"CadastroEquipamento", crypto:{randomUUID:()=>"ficha-nova"},
    podeAbrir: modulo => perms.includes('*') || perms.includes(modulo),
    vincularFicha: async dados => { chamadas.vincular.push(json(dados)); return vincular ? vincular(dados) : { ok: true, ficha: { ...fichas.find(f => f.id === dados.ativoId), bemId: dados.bemId } }; },
    desvincularFicha: async dados => { chamadas.desfazer.push(json(dados)); return desfazer ? desfazer(dados) : { ok: true, ficha: null, bem: null }; },
    lerHistoricoVinculo: async id => { chamadas.historico.push(id); return historico(id); },
    window: { confirm: texto => { chamadas.confirm.push(texto); return confirmar; } }, console,
  });
  vm.runInContext(codigo, ctx);
  const vinculos = calc.vinculosDosBens(bens, fichas, ocultos);
  const props = () => ({ bem: bemAtual, vinculo: carregando ? undefined : vinculos[bemAtual.id], fichas, bens, setores, abasPermitidas: abas, carregando, erro,
    aoOrganizarBem: organizar, salvandoArea, aoTentar: () => { chamadas.tentar++; }, aoAtualizar: () => { chamadas.atualizar++; }, aoMudou: r => chamadas.mudou.push(json(r)), aoAbrirFicha: () => { chamadas.abrir++; } });
  const render = () => { indice = 0; arvore = ctx.Componente(props()); return arvore; };
  const todos = no => Array.isArray(no) ? no.flatMap(todos) : no && typeof no === 'object' ? [no, ...todos(no.props.children)] : [];
  const texto = no => Array.isArray(no) ? no.map(texto).join('') : no && typeof no === 'object' ? texto(no.props.children) : typeof no === 'string' || typeof no === 'number' ? String(no) : '';
  const botoes = rotulo => todos(arvore).filter(n => n.type === 'button' && texto(n).trim() === rotulo);
  const select = rotulo => {
    const label = todos(arvore).find(n => n.type === 'label' && texto(n.props.children[0]) === rotulo);
    assert.ok(label, 'Campo esperado: ' + rotulo);
    return todos(label).find(n => n.type === 'select');
  };
  const opcoes = rotulo => todos(select(rotulo)).filter(n => n.type === 'option').map(o => [o.props.value, texto(o)]);
  render();
  return {
    chamadas, render, texto: () => texto(render()), todos: () => todos(render()), botoes: rotulo => { render(); return botoes(rotulo); },
    select: rotulo => { render(); return select(rotulo); }, opcoes: rotulo => { render(); return opcoes(rotulo); },
    escolher(rotulo, valor) { render(); select(rotulo).props.onChange({ target: { value: valor } }); render(); },
    async clicar(rotulo, n = 0) { render(); const b = botoes(rotulo)[n]; assert.ok(b, 'Botão esperado: ' + rotulo); const r = b.props.onClick(); await r; await new Promise(setImmediate); render(); },
  };
}

test('enquanto as fichas carregam e quando a consulta falha', async () => {
  const a = ambiente({ bemAtual: bem('b1'), carregando: true });
  assert.match(a.texto(), /Conferindo as fichas ligadas…/);
  const b = ambiente({ bemAtual: bem('b1'), erro: 'Falha sintética' });
  assert.match(b.texto(), /Não foi possível conferir as fichas ligadas\./);
  await b.clicar('Tentar novamente'); assert.equal(b.chamadas.tentar, 1);
});

test('ligado: rótulo, Abrir ficha na aba certa, Desfazer só com a permissão da família', async () => {
  const pc = ficha('pc', 'informatica', 'Computador', { nome: 'Computador', bemId: 'b1', especificacao: { local: 'Sala' } });
  const a = ambiente({ bemAtual: bem('b1'), fichas: [pc] });
  assert.match(a.texto(), /^Ligado aEstrutura · Computador · Sala/);
  const link = a.todos().find(n => n.type === 'Link');
  assert.equal(link.props.to, caminhoFichaVinculada(pc));
  link.props.onClick(); assert.equal(a.chamadas.abrir, 1);
  assert.equal(a.botoes('Desfazer vínculo').length, 1);
  const semModulo = ambiente({ bemAtual: bem('b1'), fichas: [pc], perms: ['inventario-valores', 'manutencoes'] });
  assert.equal(semModulo.botoes('Desfazer vínculo').length, 0);
  assert.match(semModulo.texto(), /Para desfazer, é preciso a permissão Patrimônio\./);
  const semAba = ambiente({ bemAtual: bem('b1'), fichas: [pc], abas: ['inventario'] });
  assert.equal(semAba.todos().some(n => n.type === 'Link'), false);
});

test('setores diferentes viram só aviso', () => {
  const setores = [{ id: 's1', sigla: 'PRO', nome: 'Produção' }, { id: 's2', sigla: 'ADM', nome: 'Administração' }];
  const pc = ficha('pc', 'informatica', 'Computador', { bemId: 'b1', especificacao: { setorId: 's2' } });
  assert.match(ambiente({ bemAtual: bem('b1'), fichas: [pc], setores }).texto(),
    /Setores diferentes: o bem está em Produção e a ficha em Administração\. Nada é copiado; corrija onde estiver errado\./);
});

test('ficha oculta de Segurança: sem detalhe e sem Desfazer', () => {
  const a = ambiente({ bemAtual: bem('b1'), ocultos: [{ ativoId: 'cam', bemId: 'b1' }], perms: ['patrimonio', 'inventario-valores', 'manutencoes'] });
  assert.match(a.texto(), /Ligado a uma ficha de Segurança\. Só quem tem a permissão Segurança vê os detalhes e pode desfazer\./);
  assert.equal(a.botoes('Desfazer vínculo').length, 0);
});

test('vínculo a conferir: texto do motivo e um Desfazer por ligação', async () => {
  const fichas = [ficha('a', 'predial', 'Extintor', { bemId: 'b1' }), ficha('b', 'maquina', '', { bemId: 'b1' })];
  const a = ambiente({ bemAtual: bem('b1'), fichas });
  assert.match(a.texto(), /^Vínculo a conferir/);
  assert.match(a.texto(), /Este bem aparece ligado a mais de uma ficha, ou a ficha aponta para outro bem\. Desfaça o vínculo que estiver errado\./);
  assert.equal(a.botoes('Desfazer vínculo').length, 2);
  await a.clicar('Desfazer vínculo', 1);
  assert.deepEqual(a.chamadas.desfazer, [{ bemId: 'b1', ativoId: 'b', versaoFicha: 'v-b', versaoBem: 'vb-b1', origem: 'bem' }]);
  const r = ambiente({ bemAtual: bem('b1', { origemAtivoId: 'sumida' }) });
  assert.match(r.texto(), /A ficha ligada a este bem foi retirada ou não existe mais\. Desfaça o vínculo para liberar o bem\./);
  assert.match(r.texto(), /Ficha retirada/);
  await r.clicar('Desfazer vínculo');
  assert.match(r.chamadas.confirm[0], /e uma ficha retirada\?/);
  assert.deepEqual(r.chamadas.desfazer, [{ bemId: 'b1', ativoId: 'sumida', versaoFicha: '', versaoBem: 'vb-b1', origem: 'bem' }]);
});

test('sem ficha: tipos permitidos, fichas livres e não baixadas, corpo exato do Confirmar', async () => {
  const fichas = [
    ficha('livre', 'maquina', '', { nome: 'Laser', especificacao: { numeroSerie: 'S-1' } }),
    ficha('baixada', 'maquina', '', { especificacao: { situacao: 'baixado' } }),
    ficha('ligada', 'maquina', '', { bemId: 'b9' }), ficha('origem', 'maquina'),
    ficha('carro', 'veiculo'),
  ];
  const bens = [bem('b1'), bem('b9'), bem('b8', { origemAtivoId: 'origem' })];
  const semSeguranca = ['patrimonio', 'inventario-valores', 'manutencoes'];
  const a = ambiente({ bemAtual: bens[0], bens, fichas, perms: semSeguranca });
  assert.match(a.texto(), /A ficha técnica é opcional\./);
  assert.match(a.texto(), /Fichas já vinculadas ou baixadas não podem receber outro bem\./);
  assert.deepEqual(a.opcoes('Tipo de ficha').map(o => o[1]), ['Todos os tipos', 'Carro', 'Máquina', 'Estrutura', 'Celulares e Ramais', 'Prevenção contra incêndio']);
  assert.equal(a.select('Ficha').props.disabled, false);
  assert.equal(a.botoes('Confirmar vínculo')[0].props.disabled, true);
  a.escolher('Tipo de ficha', 'maquina');
  assert.equal(a.opcoes('Ficha').length,5);
  assert.ok(a.todos().filter(n=>n.type==='option'&&['baixada','ligada','origem'].includes(n.props.value)).every(n=>n.props.disabled));
  a.escolher('Ficha', 'livre');
  await a.clicar('Confirmar vínculo');
  assert.deepEqual(a.chamadas.vincular, [{ bemId: 'b1', ativoId: 'livre', versaoFicha: 'v-livre', versaoBem: 'vb-b1', origem: 'bem' }]);
  assert.match(a.texto(), /Bem ligado a Máquina · Laser · S-1\./);
  assert.equal(a.chamadas.mudou[0].ficha.bemId, 'b1');
  const vazio = ambiente({ bemAtual: bens[0], bens, fichas, perms: semSeguranca });
  vazio.escolher('Tipo de ficha', 'incendio');
  assert.match(vazio.texto(), /Nenhuma ficha livre deste tipo\./);
});

test('sem família permitida e bem baixado', () => {
  assert.match(ambiente({ bemAtual: bem('b1'), perms: ['inventario-valores'] }).texto(),
    /Ligar a uma ficha exige, além de Inventário e valores, a permissão da aba da ficha: Patrimônio, Patrimônio · Manutenções ou Segurança\./);
  const baixado = ambiente({ bemAtual: bem('b1', { situacao: 'baixado' }) });
  assert.match(baixado.texto(), /Bem baixado: não pode ser ligado a uma ficha\./);
  assert.equal(baixado.botoes('Confirmar vínculo').length, 0);
});

test('Desfazer só chama o serviço depois do confirm verdadeiro', async () => {
  const fichas = [ficha('m', 'maquina', '', { nome: 'Laser', bemId: 'b1' })];
  const nao = ambiente({ bemAtual: bem('b1', { origemAtivoId: 'm' }), fichas, confirmar: false });
  await nao.clicar('Desfazer vínculo');
  assert.equal(nao.chamadas.desfazer.length, 0);
  assert.equal(nao.chamadas.confirm[0], 'Desfazer o vínculo entre o bem PRO-b1 e Máquina · Laser?\n\nO bem e a ficha continuam cadastrados, e o histórico de manutenção continua na ficha.');
  const sim = ambiente({ bemAtual: bem('b1', { origemAtivoId: 'm' }), fichas, desfazer: async () => ({ ok: true, ficha: { ...fichas[0], bemId: '' }, bem: { id: 'b1', codigo: 'PRO-b1' } }) });
  await sim.clicar('Desfazer vínculo');
  assert.deepEqual(sim.chamadas.desfazer, [{ bemId: 'b1', ativoId: 'm', versaoFicha: 'v-m', versaoBem: 'vb-b1', origem: 'bem' }]);
  assert.match(sim.texto(), /Vínculo desfeito\. O bem e a ficha continuam cadastrados\./);
  assert.deepEqual(sim.chamadas.mudou, [{ ficha: { ...json(fichas[0]), bemId: '' }, bem: { id: 'b1', codigo: 'PRO-b1' } }]);
});

test('409 mostra a mensagem do servidor e o Atualizar', async () => {
  const fichas = [ficha('m', 'maquina', '', { bemId: 'b1' })];
  const a = ambiente({ bemAtual: bem('b1'), fichas, desfazer: async () => { throw Object.assign(new Error('Este bem mudou. Atualize antes de continuar.'), { status: 409 }); } });
  await a.clicar('Desfazer vínculo');
  assert.match(a.texto(), /Este bem mudou\. Atualize antes de continuar\./);
  await a.clicar('Atualizar');
  assert.equal(a.chamadas.atualizar, 1);
  assert.doesNotMatch(a.texto(), /Este bem mudou/);
  const outro = ambiente({ bemAtual: bem('b1'), fichas, desfazer: async () => { throw Object.assign(new Error('Sem permissão.'), { status: 403 }); } });
  await outro.clicar('Desfazer vínculo');
  assert.equal(outro.botoes('Atualizar').length, 0);
});

test('histórico do vínculo abre sob demanda, com quem e quando', async () => {
  const eventos = [
    { id: 'e2', acao: 'desvinculado', familia: 'maquina', nome: 'Laser', porNome: 'Pessoa B', em: '2026-10-14T13:05:00.000Z' },
    { id: 'e1', acao: 'vinculado', familia: 'seguranca', nome: 'Ficha de Segurança', porNome: 'Pessoa A', em: '2026-10-13T12:00:00.000Z' },
  ];
  const a = ambiente({ bemAtual: bem('b1'), historico: async () => eventos });
  assert.equal(a.chamadas.historico.length, 0);
  await a.clicar('Histórico do vínculo ▾');
  assert.deepEqual(a.chamadas.historico, ['b1']);
  assert.match(a.texto(), /14\/10\/2026, 10:05 · Pessoa B desfez o vínculo com Máquina · Laser/);
  assert.match(a.texto(), /13\/10\/2026, 09:00 · Pessoa A ligou a Segurança · Ficha de Segurança/);
  const vazio = ambiente({ bemAtual: bem('b1') });
  await vazio.clicar('Histórico do vínculo ▾');
  assert.match(vazio.texto(), /Nenhuma ligação registrada ainda\./);
});

// HistoricoBem: o histórico de manutenção segue a ficha ligada (bemId ou origem).
const fonteHistorico = readFileSync(new URL('../src/components/patrimonio/HistoricoBem.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '').replace('export default function HistoricoBem', 'function HistoricoBem');
const codigoHistorico = transformSync(fonteHistorico + '\nglobalThis.Componente = HistoricoBem;', { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', target: 'es2022' }).code;
function historicoBem(props, manutencoes) {
  const estados = [], pendentes = []; let indice = 0, arvore;
  const ctx = vm.createContext({
    h: (type, p, ...children) => ({ type, props: { ...p, children } }), Fragment: 'Fragment',
    useState(inicial) { const n = indice++; if (!(n in estados)) estados[n] = inicial; return [estados[n], valor => { estados[n] = typeof valor === 'function' ? valor(estados[n]) : valor; }]; },
    useEffect(fn, deps) { const n = indice++; const antes = estados[n]; if (!antes || deps.some((d, i) => d !== antes[i])) { estados[n] = deps; pendentes.push(fn); } },
    Link: 'Link', podeAbrir: () => true, lerManutencoes: async () => manutencoes, caminhoManutencao: ({ item }) => '/manutencoes?item=' + item,
    moedaCheia: v => 'R$ ' + v, dataLonga: v => v, console,
  });
  vm.runInContext(codigoHistorico, ctx);
  const texto = no => Array.isArray(no) ? no.map(texto).join('') : no && typeof no === 'object' ? texto(no.props.children) : typeof no === 'string' || typeof no === 'number' ? String(no) : '';
  const todos = no => Array.isArray(no) ? no.flatMap(todos) : no && typeof no === 'object' ? [no, ...todos(no.props.children)] : [];
  const render = () => { indice = 0; arvore = ctx.Componente(props); while (pendentes.length) pendentes.shift()(); return arvore; };
  return { render, texto: () => texto(arvore), todos: () => todos(arvore), async abrir() { render(); todos(arvore).find(n => n.type === 'button').props.onClick(); render(); await new Promise(setImmediate); render(); } };
}

test('histórico de manutenção do bem ligado só pela ficha mostra os serviços dela', async () => {
  const manutencoes = { s1: { ativoId: 'pc-1', data: '2026-10-01', descricao: 'Troca de fonte · exemplo', valor: 120 }, s2: { ativoId: 'outro', data: '2026-10-02', descricao: 'Outro serviço', valor: 9 } };
  const h = historicoBem({ bem: { id: 'b1', origemAtivoId: '' }, fichaId: 'pc-1' }, manutencoes);
  await h.abrir();
  assert.match(h.texto(), /Troca de fonte · exemplo/);
  assert.doesNotMatch(h.texto(), /Outro serviço/);
  assert.equal(h.todos().find(n => n.type === 'Link').props.to, '/manutencoes?item=pc-1');
  const sem = historicoBem({ bem: { id: 'b2' }, fichaId: '' }, manutencoes);
  await sem.abrir();
  assert.match(sem.texto(), /Este bem ainda não está ligado a uma ficha de equipamento\. Ligue no bloco Ligado a; os serviços ficam registrados na ficha\./);
});

// ── Revisão adversarial do vínculo ──
test('depois do 409 e do Atualizar, a ficha que saiu da lista não deixa o Confirmar habilitado', async () => {
  const fichas = [ficha('livre', 'maquina', '', { nome: 'Laser' })];
  const a = ambiente({ bemAtual: bem('b1'), bens: [bem('b1'), bem('b9')], fichas, vincular: async () => { throw Object.assign(new Error('Esta ficha mudou. Atualize antes de continuar.'), { status: 409 }); } });
  a.escolher('Tipo de ficha', 'maquina'); a.escolher('Ficha', 'livre');
  assert.equal(a.botoes('Confirmar vínculo')[0].props.disabled, false);
  await a.clicar('Confirmar vínculo');
  assert.match(a.texto(), /Esta ficha mudou\. Atualize antes de continuar\./);
  fichas[0].bemId = 'b9';
  await a.clicar('Atualizar');
  assert.ok(a.todos().find(n=>n.type==='option'&&n.props.value==='livre').props.disabled);
  assert.equal(a.botoes('Confirmar vínculo')[0].props.disabled, true);
});

test('histórico de manutenção: ficha que não aparece aqui não vira "ainda não está ligado"', async () => {
  const h = historicoBem({ bem: { id: 'b3' }, fichaId: null }, {});
  await h.abrir();
  assert.match(h.texto(), /Os serviços ficam na ficha ligada a este bem, que não aparece aqui\. Confira o bloco Ligado a\./);
  assert.doesNotMatch(h.texto(), /ainda não está ligado/);
  assert.equal(h.todos().some(n => n.type === 'Link'), false);
});

test('busca em todos os tipos e abertura técnica reaproveitam bem sem gravação antecipada',async()=>{
 const b=bem('b1',{areaPatrimonio:'maquinas',descricaoTecnica:'Laser fictício'});
 const a=ambiente({bemAtual:b,fichas:[ficha('f','veiculo','',{especificacao:{placa:'ABC-0001'}})]});
 assert.ok(a.opcoes('Ficha').some(([id])=>id==='f'));
 const input=a.todos().find(n=>n.type==='input');input.props.onChange({target:{value:'ABC-0001'}});
 assert.ok(a.opcoes('Ficha').some(([id])=>id==='f'));
 await a.clicar('Completar dados técnicos');
 const form=a.todos().find(n=>n.type==='CadastroEquipamento');
 assert.equal(form.props.inicial.bemEscolha,'b1');assert.equal(form.props.inicial.tipoFixo,true);
 assert.equal(form.props.inicial.nome,'Laser fictício');assert.equal(a.chamadas.vincular.length,0);
});


test('Ferramentas & Outros organiza o mesmo bem sem criar vínculo técnico', async()=>{
 const chamadas=[]; const b=bem('b1');
 const a=ambiente({bemAtual:b,abas:['inventario','outros'],organizar:(...args)=>chamadas.push(args)});
 assert.ok(a.opcoes('Tipo de ficha').some(([v])=>v==='area-outros'));
 a.escolher('Tipo de ficha','area-outros');
 assert.equal(a.botoes('Confirmar vínculo').length,0);
 assert.equal(chamadas.length,0);
 await a.clicar('Confirmar organização');
 assert.equal(chamadas[0][0].id,'b1');assert.equal(chamadas[0][1],'outros');
 assert.equal(a.chamadas.vincular.length,0);
 assert.ok(a.todos().some(n=>n.type==='Link'&&n.props.to==='/patrimonio?aba=outros'));
 const restrito=ambiente({bemAtual:b,abas:['inventario'],organizar:()=>{}});
 assert.ok(!restrito.opcoes('Tipo de ficha').some(([v])=>v==='area-outros'));
 const salvo=ambiente({bemAtual:bem('b1',{areaPatrimonio:'outros'}),abas:['outros'],organizar:()=>{}});
 salvo.escolher('Tipo de ficha','area-outros');
 assert.equal(salvo.botoes('Já organizado nesta área')[0].props.disabled,true);
});
