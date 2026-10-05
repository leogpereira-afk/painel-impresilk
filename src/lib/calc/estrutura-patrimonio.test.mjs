import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS_ESTRUTURA, prepararEstrutura, filtrarEstrutura } from './estrutura-patrimonio.js';
import { CATEGORIAS_PREDIAL, CATEGORIAS_POR_FAMILIA, resumoEspec } from './manutencoes.js';

const categoriaNormalizada = valor => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

test('Estrutura sugere as categorias físicas e Manutenção preserva todas as categorias legadas', () => {
  const novas = ['Ar-condicionado', 'Ventilador', 'Bebedouro', 'Itens de cozinha', 'Caixa-d’água', 'Portão', 'Motor', 'Outros itens físicos'];
  const legadas = ['Câmeras / CFTV', 'Ar condicionado', 'Elétrica', 'Hidráulica', 'Portão / automatizador', 'Alarme', 'Rede e internet', 'Combate a incêndio', 'Estrutura e telhado', 'Pintura', 'Compressor', 'Exaustão', 'Iluminação', 'Móvel / bancada'];
  for (const categoria of novas) assert(CATEGORIAS_ESTRUTURA.includes(categoria));
  for (const categoria of legadas) assert(CATEGORIAS_PREDIAL.includes(categoria));
  for (const lista of [CATEGORIAS_ESTRUTURA, CATEGORIAS_PREDIAL]) {
    assert.equal(new Set(lista.map(categoriaNormalizada)).size, lista.length);
    for (const categoria of [...novas, ...legadas]) assert(lista.some(valor => categoriaNormalizada(valor) === categoriaNormalizada(categoria)));
  }
  assert.equal(CATEGORIAS_POR_FAMILIA.predial, CATEGORIAS_PREDIAL);
});

test('lista apenas prediais com ID, elimina repetições de ID e conserva homônimos distintos', () => {
  const itens = prepararEstrutura([
    { id: 'a', tipo: 'predial', nome: 'Ventilador 10' },
    { id: 'b', tipo: 'predial', nome: 'Ventilador 2' },
    { id: 'c', tipo: 'predial', nome: 'Ventilador 2' },
    { id: 'a', tipo: 'predial', nome: 'Cópia que não deve duplicar' },
    { id: 'v', tipo: 'veiculo' }, { id: 'm', tipo: 'maquina' },
    { id: 'd', tipo: 'documento' }, { tipo: 'predial' }, null,
  ]);
  assert.deepEqual(itens.map(item => item.id), ['b', 'c', 'a']);
});

test('vínculo usa apenas IDs confirmados, preserva bem baixado e resolve setor sem substituir local', () => {
  const ativo = { id: 'ar', tipo: 'predial', categoria: 'Ar condicionado', nome: 'Ar da diretoria', responsavel: 'João', especificacao: { local: 'Mezanino', marcaModelo: 'Marca X1', quantidade: '2', instalacao: '2025-02-10' } };
  const bem = { id: 'b1', origemAtivoId: 'ar', codigo: 'DIR-003', setorSigla: 'DIR', situacao: 'baixado', valor: 5000 };
  const antes = structuredClone({ ativo, bem });
  const [item] = prepararEstrutura([ativo], [bem], [{ sigla: 'DIR', nome: 'Direção' }]);
  assert.equal(item.bem, bem);assert.equal(item.vinculo, 'vinculado');
  assert.equal(item.codigo, 'DIR-003');assert.equal(item.setorSigla, 'DIR');assert.equal(item.setor, 'Direção');
  assert.equal(item.local, 'Mezanino');assert.equal(item.modelo, 'Marca X1');
  assert.equal(item.categoria, 'Ar condicionado');assert.equal(item.responsavel, 'João');
  assert.equal(item.quantidade, '2');assert.equal(item.instalacao, '2025-02-10');
  assert.equal(item.bem.situacao, 'baixado');
  assert.deepEqual({ ativo, bem }, antes);
  assert.deepEqual(resumoEspec(ativo), ['Mezanino', 'Marca X1', '2', '2025-02-10']);
});

test('bemId explícito funciona; nome, código e prefixo de ID nunca inventam vínculo', () => {
  const ativo = { id: 'motor', tipo: 'predial', nome: 'Motor' };
  const homonimo = { id: 'pat-motor', nomeGenerico: 'Motor', codigo: 'Motor' };
  assert.equal(prepararEstrutura([ativo], [homonimo])[0].vinculo, 'sem-vinculo');
  const [item] = prepararEstrutura([{ ...ativo, bemId: homonimo.id }], [homonimo]);
  assert.equal(item.bem, homonimo);assert.equal(item.vinculo, 'vinculado');
});

test('conflito de IDs não escolhe ficha arbitrária nem exibe código/setor de outro bem', () => {
  const ativo = { id: 'ar', tipo: 'predial', bemId: 'b2', especificacao: { local: 'Portaria' } };
  for (const bens of [
    [{ id: 'b1', origemAtivoId: 'ar', codigo: 'A' }, { id: 'b2', origemAtivoId: 'ar', codigo: 'B' }],
    [{ id: 'b2', origemAtivoId: 'outro', codigo: 'B' }],
    [{ id: 'b1', origemAtivoId: 'ar', codigo: 'A' }, { id: 'b2', codigo: 'B' }],
  ]) {
    const [item] = prepararEstrutura([ativo], bens);
    assert.equal(item.bem, null);assert.equal(item.vinculo, 'conflito');
    assert.equal(item.codigo, '');assert.equal(item.setor, '');assert.equal(item.local, 'Portaria');
  }
});

test('categoria livre ou legada permanece intacta e vazio recebe fallback só na projeção', () => {
  const ativos = [
    { id: 'a', tipo: 'predial', categoria: 'Portão / automatizador' },
    { id: 'b', tipo: 'predial', categoria: 'Persiana motorizada' },
    { id: 'c', tipo: 'predial', categoria: '' },
  ];
  const antes = structuredClone(ativos), itens = prepararEstrutura(ativos);
  assert.equal(itens.find(item => item.id === 'a').categoria, 'Portão / automatizador');
  assert.equal(itens.find(item => item.id === 'b').categoria, 'Persiana motorizada');
  assert.equal(itens.find(item => item.id === 'c').categoria, 'Outros itens físicos');
  assert.deepEqual(ativos, antes);
});

test('busca ignora acentos e considera todos os termos de nome, categoria, modelo, local, setor, código e autoria', () => {
  const itens = prepararEstrutura([
    { id: 'ar', tipo: 'predial', nome: 'Ar da recepção', categoria: 'Ar condicionado', responsavel: 'João', atualizadoPorNome: 'Lúcia', especificacao: { marcaModelo: 'Marca X1', local: 'Salão térreo' } },
    { id: 'motor', tipo: 'predial', nome: 'Motor', categoria: 'Motor' },
  ], [{ id: 'b1', origemAtivoId: 'ar', codigo: 'DIR-003', setorSigla: 'DIR' }], [{ sigla: 'DIR', nome: 'Direção' }]);
  assert.deepEqual(filtrarEstrutura(itens, { busca: 'recepcao joao lucia salao terreo direcao dir-003 x1' }).map(item => item.id), ['ar']);
  assert.equal(filtrarEstrutura(itens, { busca: 'recepcao ausente' }).length, 0);
  assert.equal(filtrarEstrutura(itens).length, 2);
  assert.equal(filtrarEstrutura(itens, { categoria: 'todos' }).length, 2);
});

test('filtro de categoria aceita texto livre e encontra grafia antiga sem reclassificá-la', () => {
  const itens = prepararEstrutura([
    { id: 'a', tipo: 'predial', categoria: 'Ar condicionado' },
    { id: 'b', tipo: 'predial', categoria: 'Ar-condicionado' },
    { id: 'c', tipo: 'predial', categoria: 'Persiana elétrica' },
    { id: 'd', tipo: 'predial' },
  ]);
  assert.deepEqual(filtrarEstrutura(itens, { categoria: ' AR-CONDICIONADO ' }).map(item => item.id), ['a', 'b']);
  assert.equal(filtrarEstrutura(itens, { categoria: 'persiana eletrica' })[0].id, 'c');
  assert.equal(filtrarEstrutura(itens, { categoria: 'Outros itens físicos' })[0].id, 'd');
  assert.equal(itens[0].categoria, 'Ar condicionado');
});

test('busca encontra identificação própria do ativo mesmo quando ela não aparece no nome', () => {
  const itens = prepararEstrutura([
    { id: 'ar', tipo: 'predial', nome: 'Ar da recepção', identificacao: 'AR-002' },
    { id: 'beb', tipo: 'predial', nome: 'Bebedouro da copa', identificacao: 'BEB-TESTE-01' },
  ]);
  assert.deepEqual(filtrarEstrutura(itens, { busca: 'ar-002', categoria: 'todos' }).map(item => item.id), ['ar']);
  assert.deepEqual(filtrarEstrutura(itens, { busca: 'BEB-TESTE-01' }).map(item => item.id), ['beb']);
  assert.equal(filtrarEstrutura(itens, { busca: 'AR-002 copa' }).length, 0);
});

test('filtro sem vínculo confirmado inclui conflitos; filtro vinculado inclui só vínculo confirmado', () => {
  const itens = prepararEstrutura([
    { id: 'a', tipo: 'predial' }, { id: 'b', tipo: 'predial' },
    { id: 'c', tipo: 'predial', bemId: 'alheio' },
  ], [{ id: 'ba', origemAtivoId: 'a' }, { id: 'alheio', origemAtivoId: 'outro' }]);
  assert.deepEqual(filtrarEstrutura(itens, { vinculo: 'vinculado' }).map(item => item.id), ['a']);
  assert.deepEqual(filtrarEstrutura(itens, { vinculo: 'sem-vinculo' }).map(item => item.id), ['b', 'c']);
});

test('quantidade ausente permanece ausente e não vira 1, zero ou valor financeiro', () => {
  const itens = prepararEstrutura([
    { id: 'a', tipo: 'predial' },
    { id: 'b', tipo: 'predial', especificacao: { quantidade: 4 } },
    { id: 'c', tipo: 'predial', especificacao: { quantidade: 'não conferida' } },
  ]);
  assert.equal(itens[0].quantidade, '');assert.equal(itens[1].quantidade, '4');assert.equal(itens[2].quantidade, 'não conferida');
  for (const item of itens) assert.equal(Object.hasOwn(item, 'valor'), false);
});

test('autoria preserva nomes e carimbos originais e não atribui ao responsável ou ao bem', () => {
  const ativos = [
    { id: 'a', tipo: 'predial', atualizadoPorNome: 'Ana', atualizadoPor: 'u1', atualizadoEm: '2026-10-05T12:00:00Z', criadoPor: 'Bruna' },
    { id: 'b', tipo: 'predial', atualizadoPor: 'Carlos' },
    { id: 'c', tipo: 'predial', criadoPorNome: 'Dora', criadoPor: 'u4' },
    { id: 'd', tipo: 'predial', criadoPor: 'Eva' },
    { id: 'e', tipo: 'predial', responsavel: 'Responsável não é autor' },
  ];
  const itens = prepararEstrutura(ativos, [{ id: 'be', origemAtivoId: 'e', atualizadoPor: 'Outro autor' }]);
  assert.deepEqual(itens.map(item => item.autoria), ['Ana', 'Carlos', 'Dora', 'Eva', '']);
  assert.equal(itens[0].atualizadoEm, ativos[0].atualizadoEm);assert.equal(itens[0].criadoPor, 'Bruna');
});
