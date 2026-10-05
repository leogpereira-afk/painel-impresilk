import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vinculoDoEquipamento, projetarEquipamentos, filtrarEquipamentos } from './equipamentos-patrimonio.js';

test('vínculo usa origemAtivoId ou bemId existente; nome e padrão de ID não associam registros', () => {
  const ativo = { id: 'v1', tipo: 'veiculo', nome: 'Carro' };
  const certo = { id: 'bem-real', origemAtivoId: 'v1', nomeGenerico: 'Outro nome' };
  assert.equal(vinculoDoEquipamento(ativo, [certo]).bem, certo);
  assert.equal(vinculoDoEquipamento(ativo, [{ id: 'pat-v1', nomeGenerico: 'Carro' }]).bem, null);
  assert.equal(vinculoDoEquipamento({ ...ativo, bemId: 'inexistente' }, [certo]).bem, certo);
  const legado = { id: 'bem-legado', nomeGenerico: 'Carro' };
  assert.equal(vinculoDoEquipamento({ ...ativo, bemId: legado.id }, [legado]).bem, legado);
});

test('vínculo conflitante ou mais de um bem com mesma origem não abre ficha arbitrária', () => {
  const ativo = { id: 'v1', bemId: 'b2' };
  for (const bens of [
    [{ id: 'b1', origemAtivoId: 'v1' }, { id: 'b2', origemAtivoId: 'v1' }],
    [{ id: 'b2', origemAtivoId: 'outro-ativo' }],
    [{ id: 'b1', origemAtivoId: 'v1' }, { id: 'b2' }],
  ]) assert.deepEqual(vinculoDoEquipamento(ativo, bens), { bem: null, vinculo: 'conflito' });
});

test('projeção mantém um item por ativo, usa setor do vínculo e preserva as fontes', () => {
  const ativos = [{ id: 'm1', tipo: 'maquina', nome: 'Máquina 2', responsavel: 'João', especificacao: { fabricante: 'Marca', modelo: 'X1', numeroSerie: 'SN001', setor: 'Setor antigo' } }, { id: 'v1', tipo: 'veiculo', nome: 'Carro', especificacao: { placa: 'ABC1D23', marcaModelo: 'Van', ano: '2025' } }, { id: 'doc1', tipo: 'documento' }];
  const bens = [{ id: 'b1', origemAtivoId: 'm1', codigo: 'IMP-001', setorSigla: 'IMP', situacao: 'baixado' }];
  const antes = structuredClone({ ativos, bens });
  const itens = projetarEquipamentos([...ativos, ativos[0]], bens, [{ id: 'set1', sigla: 'IMP', nome: 'Impressão' }]);
  assert.equal(itens.length, 2);
  const maquina = itens.find(item => item.id === 'm1');
  assert.equal(maquina.modelo, 'Marca · X1');assert.equal(maquina.identificacao, 'SN001');
  assert.equal(maquina.setor, 'Impressão');assert.equal(maquina.codigo, 'IMP-001');
  assert.equal(maquina.bem.situacao, 'baixado');
  assert.equal(itens.find(item => item.id === 'v1').identificacao, 'ABC1D23');
  assert.deepEqual({ ativos, bens }, antes);
});

test('equipamento sem ficha continua visível e pesquisa considera placa, série, setor, etiqueta e responsável', () => {
  const itens = projetarEquipamentos([
    { id: 'm1', tipo: 'maquina', nome: 'Router', responsavel: 'João', especificacao: { modelo: 'MX', numeroSerie: 'SN001', setor: 'Corte' } },
    { id: 'v1', tipo: 'veiculo', nome: 'Entrega', especificacao: { placa: 'ABC1D23', marcaModelo: 'Van' } },
  ], [{ id: 'b1', origemAtivoId: 'v1', codigo: 'PCP-005' }]);
  assert.equal(filtrarEquipamentos(itens, { tipo: 'maquina', busca: 'joao corte sn001 mx', vinculo: 'sem-vinculo' }).length, 1);
  assert.equal(filtrarEquipamentos(itens, { tipo: 'veiculo', busca: 'abc1d23 pcp-005', vinculo: 'vinculado' }).length, 1);
  assert.equal(filtrarEquipamentos(itens, { tipo: 'maquina', vinculo: 'vinculado' }).length, 0);
  assert.equal(filtrarEquipamentos(itens, { tipo: 'maquina', busca: 'Entrega' }).length, 0);
});
