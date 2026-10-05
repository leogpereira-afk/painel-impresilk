import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import { CATEGORIAS_ESTRUTURA, prepararEstrutura, filtrarEstrutura } from '../src/lib/calc/estrutura-patrimonio.js';

// Renderiza os elementos e executa os callbacks reais do componente. Apenas
// os hooks e a rede são simulados; cada render preserva closures como o React.
const fonte = readFileSync(new URL('../src/components/patrimonio/Estrutura.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '').replace('export default function EstruturaPatrimonio', 'function EstruturaPatrimonio');
const codigo = transformSync(fonte + '\nglobalThis.Componente = EstruturaPatrimonio;', { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', target: 'es2022' }).code;
const clone = valor => structuredClone(valor);
const item = (id, nome = 'Ar ' + id) => ({ id, tipo: 'predial', nome, categoria: 'Ar-condicionado', identificacao: '', responsavel: '', observacao: '', especificacao: { local: 'Recepção', marcaModelo: '', quantidade: '1', instalacao: '' }, atualizadoEm: '2026-10-05T10:00:00.000Z' });
const evento = { preventDefault() {} };
const pendente = () => { let resolver; const promise = new Promise(resolve => { resolver = resolve; }); return { promise, resolver }; };
function ambiente({ listar = async () => [item('A'), item('B')], salvar = async dado => ({ ...dado, tipo: 'predial', id: dado.id || dado.cadastroId, atualizadoEm: '2026-10-05T11:00:00.000Z' }) } = {}) {
  const estados = [], efeitos = []; let indice = 0, montado = false, arvore;
  const ctx = vm.createContext({
    h: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(inicial) { const n = indice++; if (!(n in estados)) estados[n] = typeof inicial === 'function' ? inicial() : inicial; return [estados[n], valor => { estados[n] = typeof valor === 'function' ? valor(estados[n]) : valor; }]; },
    useRef(inicial) { const n = indice++; return estados[n] ||= { current: inicial }; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => { if (!montado) efeitos.push(fn); },
    ...Object.fromEntries(['Link', 'Building2', 'Plus', 'Pencil', 'Printer', 'Search', 'X', 'RefreshCw', 'ChevronLeft', 'ChevronRight', 'MapPin', 'UserRound', 'Wrench', 'Link2', 'Check', 'JanelaFormulario'].map(n => [n, n])),
    CATEGORIAS_ESTRUTURA, prepararEstrutura, filtrarEstrutura,
    listarEquipamentosPatrimonio: () => listar(), salvarEstrutura: (dado, versao) => salvar(clone(dado), versao),
    podeAbrir: () => true, textoAtualizacao: x => x.atualizadoEm || '', dataLonga: x => x,
    crypto: { randomUUID: () => '671f0a1d-0fbe-4b90-9ad8-3cbd81e8a7e0' }, window: { confirm: () => true }, console,
  });
  vm.runInContext(codigo, ctx);
  function render() { indice = 0; arvore = ctx.Componente({}); if (!montado) { montado = true; for (const efeito of efeitos) efeito(); } return arvore; }
  function todos(node) {
    if (Array.isArray(node)) return node.flatMap(todos);
    return node && typeof node === 'object' ? [node, ...todos(node.props.children)] : [];
  }
  const texto = node => Array.isArray(node) ? node.map(texto).join('') : node && typeof node === 'object' ? texto(node.props.children) : typeof node === 'string' ? node : '';
  const achar = predicado => { const encontrado = todos(arvore).find(predicado); assert.ok(encontrado, 'Elemento esperado não foi renderizado'); return encontrado; };
  return {
    render, todos, texto: () => texto(arvore),
    async iniciar() { render(); await new Promise(setImmediate); render(); },
    input: id => achar(n => n.props.id === 'estrutura-' + id),
    preencher(id, valor) { achar(n => n.props.id === 'estrutura-' + id).props.onChange({ target: { value: valor } }); render(); },
    clicar(rotulo) { const p = achar(n => n.type === 'button' && (n.props['aria-label'] === rotulo || texto(n) === rotulo)).props; const resultado = p.onClick(); render(); return resultado; },
    fechar() { achar(n => n.type === 'JanelaFormulario').props.aoFechar(); render(); },
    salvar() { const resultado = achar(n => n.type === 'form').props.onSubmit(evento); render(); return resultado.finally(render); },
    temFormulario: () => todos(arvore).some(n => n.type === 'form'),
  };
}

test('resposta perdida seguida de alteração mantém rascunho e próximo envio edita o ID confirmado', async () => {
  let banco; const envios = [];
  const a = ambiente({ salvar: async (dado, versao) => {
    envios.push({ dado: clone(dado), versao });
    if (!banco) { banco = { ...item(dado.cadastroId), ...dado, id: dado.cadastroId }; throw new Error('Resposta perdida'); }
    if (dado.cadastroId) return clone(banco);
    assert.equal(versao, banco.atualizadoEm);
    banco = { ...banco, ...dado, atualizadoEm: '2026-10-05T12:00:00.000Z' }; return clone(banco);
  } });
  await a.iniciar(); a.clicar('Novo item de estrutura');
  a.preencher('nome', 'Nome original'); a.preencher('categoria', 'Ar-condicionado'); a.preencher('local', 'Sala');
  await a.salvar(); assert.match(a.texto(), /Resposta perdida/);
  a.preencher('nome', 'Nome corrigido'); a.preencher('local', 'Sala nova');
  await a.salvar();
  assert.equal(a.temFormulario(), true); assert.equal(a.input('nome').props.value, 'Nome corrigido'); assert.equal(a.input('local').props.value, 'Sala nova');
  assert.match(a.texto(), /preenchimento mais recente foi mantido/); assert.doesNotMatch(a.texto(), /Item salvo\./);
  assert.equal(banco.nome, 'Nome original');
  await a.salvar();
  assert.equal(envios[2].dado.cadastroId, undefined); assert.equal(envios[2].dado.id, envios[0].dado.cadastroId);
  assert.equal(banco.nome, 'Nome corrigido'); assert.equal(banco.especificacao.local, 'Sala nova');
  assert.equal(a.temFormulario(), false); assert.match(a.texto(), /Item salvo\./);
});

test('normalização de espaços e quantidade não é confundida com reenvio discrepante', async () => {
  const a = ambiente({ salvar: async dado => ({ ...dado, id: dado.cadastroId, nome: dado.nome.trim(), categoria: dado.categoria.trim(), especificacao: { ...dado.especificacao, local: dado.especificacao.local.trim(), quantidade: '1' } }) });
  await a.iniciar(); a.clicar('Novo item de estrutura');
  a.preencher('nome', ' Ar novo '); a.preencher('categoria', ' Ar-condicionado '); a.preencher('local', ' Sala '); a.preencher('quantidade', '01');
  await a.salvar(); assert.equal(a.temFormulario(), false); assert.match(a.texto(), /Item salvo\./);
});

test('recarga de conflito não substitui outro formulário aberto enquanto a rede responde', async () => {
  const espera = pendente(); let chamadas = 0;
  const a = ambiente({ listar: () => ++chamadas === 1 ? Promise.resolve([item('A'), item('B')]) : espera.promise, salvar: async () => { throw Object.assign(new Error('Mudou no servidor'), { status: 409 }); } });
  await a.iniciar(); a.clicar('Editar Ar A'); await a.salvar();
  const recarga = a.clicar('Carregar ficha atual'); a.fechar(); a.clicar('Editar Ar B'); a.preencher('nome', 'Rascunho de B');
  espera.resolver([item('A', 'A atualizado'), item('B')]); await recarga; a.render();
  assert.equal(a.input('nome').props.value, 'Rascunho de B'); assert.doesNotMatch(a.texto(), /Ficha atual carregada/);
});

test('fechar formulário invalida recarga e não o reabre com resposta tardia', async () => {
  const espera = pendente(); let chamadas = 0;
  const a = ambiente({ listar: () => ++chamadas === 1 ? Promise.resolve([item('A')]) : espera.promise, salvar: async () => { throw Object.assign(new Error('Mudou'), { status: 409 }); } });
  await a.iniciar(); a.clicar('Editar Ar A'); await a.salvar();
  const recarga = a.clicar('Carregar ficha atual'); a.fechar(); espera.resolver([item('A', 'A atual')]); await recarga; a.render();
  assert.equal(a.temFormulario(), false);
});

test('digitação após iniciar recarga conserva o preenchimento feito durante a espera', async () => {
  const espera = pendente(); let chamadas = 0;
  const a = ambiente({ listar: () => ++chamadas === 1 ? Promise.resolve([item('A')]) : espera.promise, salvar: async () => { throw Object.assign(new Error('Mudou'), { status: 409 }); } });
  await a.iniciar(); a.clicar('Editar Ar A'); await a.salvar();
  const recarga = a.clicar('Carregar ficha atual'); a.preencher('nome', 'Novo rascunho'); a.preencher('local', 'Outro local');
  espera.resolver([item('A', 'Nome no banco')]); await recarga; a.render();
  assert.equal(a.input('nome').props.value, 'Novo rascunho'); assert.equal(a.input('local').props.value, 'Outro local');
});

test('recarga válida atualiza a versão e libera salvar após conflito', async () => {
  let chamadas = 0; const envios = [], atual = { ...item('A', 'Atual no banco'), atualizadoEm: '2026-10-05T13:00:00.000Z' };
  const a = ambiente({ listar: async () => ++chamadas === 1 ? [item('A')] : [atual], salvar: async (dado, versao) => { envios.push(versao); if (envios.length === 1) throw Object.assign(new Error('Mudou'), { status: 409 }); return { ...atual, ...dado }; } });
  await a.iniciar(); a.clicar('Editar Ar A'); await a.salvar(); await a.clicar('Carregar ficha atual'); a.render();
  assert.equal(a.input('nome').props.value, atual.nome); a.preencher('nome', 'Após conferir'); await a.salvar();
  assert.equal(envios[1], atual.atualizadoEm); assert.equal(a.temFormulario(), false);
});

test('listagem iniciada antes do salvamento não regride o item confirmado', async () => {
  const espera = pendente(); let chamadas = 0;
  const a = ambiente({ listar: () => ++chamadas === 1 ? Promise.resolve([item('A')]) : espera.promise });
  await a.iniciar(); const recarga = a.clicar('Atualizar estrutura'); a.clicar('Editar Ar A'); a.preencher('nome', 'Nome confirmado'); await a.salvar();
  espera.resolver([item('A', 'Nome antigo')]); await recarga; a.render();
  assert.match(a.texto(), /Nome confirmado/); assert.doesNotMatch(a.texto(), /Nome antigo/);
});
