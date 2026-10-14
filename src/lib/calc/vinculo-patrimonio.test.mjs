import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  familiaVinculo, fichaAceitaBem, fichaBaixada, moduloDoVinculo, ROTULO_FAMILIA_VINCULO, ROTULO_MODULO_VINCULO,
  FAMILIAS_VINCULO, podeVincularFamilia, vinculosDosBens, fichasLivresParaBem, rotuloFicha, rotuloLigadoA,
  rotuloVinculoServidor, setorDivergente,
} from './vinculo-patrimonio.js';

// Fichas e bens fictícios: nenhum dado da empresa.
const ficha = (id, tipo, categoria = '', extra = {}) => ({ id, tipo, categoria, nome: 'Ficha ' + id, especificacao: {}, atualizadoEm: '2026-10-10T10:00:00.000Z', ...extra });
const bem = (id, extra = {}) => ({ id, codigo: 'PRO-' + id, nomeGenerico: 'Bem ' + id, situacao: 'uso', setorSigla: 'PRO', ...extra });

test('família e módulo de cada tipo de ficha, com o AVCB fora', () => {
  for (const [tipo, categoria, familia, modulo] of [
    ['veiculo', '', 'carro', 'manutencoes'], ['maquina', 'Impressão', 'maquina', 'manutencoes'],
    ['predial', 'Ar-condicionado', 'estrutura', 'patrimonio'], ['predial', 'Transformador', 'estrutura', 'patrimonio'],
    ['informatica', 'Computador', 'estrutura', 'patrimonio'], ['informatica', 'Rede e internet', 'estrutura', 'patrimonio'],
    ['informatica', 'Telefone', 'telefonia', 'patrimonio'], ['informatica', 'Central telefônica', 'telefonia', 'patrimonio'],
    ['informatica', 'Celular', 'telefonia', 'patrimonio'], ['seguranca', 'Câmera', 'seguranca', 'seguranca'],
    ['predial', 'Extintor', 'incendio', 'patrimonio'], ['predial', 'AVCB', 'incendio', 'patrimonio'],
    ['predial', 'Iluminação de emergência', 'incendio', 'patrimonio'], ['predial', 'Sinalização de segurança', 'incendio', 'patrimonio'],
  ]) {
    const f = ficha('x', tipo, categoria);
    assert.equal(familiaVinculo(f), familia, `${tipo}/${categoria}`);
    assert.equal(moduloDoVinculo(f), modulo, `${tipo}/${categoria}`);
    assert.equal(fichaAceitaBem(f), categoria !== 'AVCB', `${tipo}/${categoria}`);
  }
  for (const tipo of ['documento', 'licitacao', 'marketing', '', undefined]) {
    assert.equal(familiaVinculo({ tipo }), null);
    assert.equal(fichaAceitaBem({ tipo }), false);
    assert.equal(moduloDoVinculo({ tipo }), null);
  }
  assert.equal(fichaAceitaBem(null), false);
  assert.equal(fichaBaixada(ficha('x', 'seguranca', 'Câmera', { especificacao: { situacao: 'baixado' } })), true);
  assert.equal(fichaBaixada(ficha('x', 'veiculo')), false);
  assert.deepEqual(FAMILIAS_VINCULO.map(f => f.rotulo), Object.values(ROTULO_FAMILIA_VINCULO));
  assert.equal(ROTULO_MODULO_VINCULO.manutencoes, 'Patrimônio · Manutenções');
});

test('as quatro marcações do almoxarifado ligam as seis famílias; só o inventário não liga nenhuma', () => {
  const sessao = perms => modulo => perms.includes('*') || perms.includes(modulo);
  const raphael = sessao(['patrimonio', 'inventario-valores', 'manutencoes', 'seguranca']);
  assert.deepEqual(FAMILIAS_VINCULO.filter(f => podeVincularFamilia(f.id, raphael)).map(f => f.id), FAMILIAS_VINCULO.map(f => f.id));
  assert.deepEqual(FAMILIAS_VINCULO.filter(f => podeVincularFamilia(f.id, sessao(['inventario-valores']))), []);
  assert.deepEqual(FAMILIAS_VINCULO.filter(f => podeVincularFamilia(f.id, sessao(['inventario-valores', 'patrimonio']))).map(f => f.id), ['estrutura', 'telefonia', 'incendio']);
  assert.deepEqual(FAMILIAS_VINCULO.filter(f => podeVincularFamilia(f.id, sessao(['patrimonio', 'manutencoes', 'seguranca']))), []);
  assert.equal(FAMILIAS_VINCULO.every(f => podeVincularFamilia(f.id, sessao(['*']))), true);
  assert.equal(podeVincularFamilia('desconhecida', raphael), false);
});

test('cada linha da tabela de estados do vínculo visto pelo bem', () => {
  const fichas = [
    ficha('so-ficha', 'informatica', 'Computador', { bemId: 'b1' }),
    ficha('dois-lados', 'maquina', '', { bemId: 'b2' }),
    ficha('legado', 'veiculo', '', { bemId: '' }),
    ficha('duas-a', 'predial', 'Extintor', { bemId: 'b5' }), ficha('duas-b', 'predial', 'Ar-condicionado', { bemId: 'b5' }),
    ficha('outra', 'informatica', 'Telefone', { bemId: 'b6' }),
    ficha('aponta-outro', 'maquina', '', { bemId: 'b-outro' }),
    ficha('livre', 'veiculo'),
  ];
  const ocultos = [{ ativoId: 'cam-1', bemId: '' }, { ativoId: 'cam-2', bemId: 'b10' }, { ativoId: 'cam-3', bemId: 'b-x' }];
  const bens = [
    bem('b0'), bem('b1'), bem('b2', { origemAtivoId: 'dois-lados' }), bem('b3', { origemAtivoId: 'legado' }),
    bem('b4', { origemAtivoId: 'cam-1' }), bem('b5'), bem('b6', { origemAtivoId: 'livre' }), bem('b7', { origemAtivoId: 'aponta-outro' }),
    bem('b8', { origemAtivoId: 'sumida' }), bem('b10'), bem('b11', { origemAtivoId: 'cam-3' }),
  ];
  const v = vinculosDosBens(bens, fichas, ocultos);
  const resumo = id => [v[id].estado, v[id].motivo, v[id].ficha?.id || '', v[id].oculta, v[id].ligacoes.map(l => `${l.ativoId}:${l.lado}${l.oculta ? ':oculta' : ''}`).join(',')];
  assert.deepEqual(resumo('b0'), ['sem-ficha', '', '', false, '']);
  assert.deepEqual(resumo('b1'), ['ligado', '', 'so-ficha', false, 'so-ficha:ficha']);
  assert.deepEqual(resumo('b2'), ['ligado', '', 'dois-lados', false, 'dois-lados:ambos']);
  assert.deepEqual(resumo('b3'), ['ligado', '', 'legado', false, 'legado:bem']);
  assert.deepEqual(resumo('b4'), ['ligado', '', '', true, 'cam-1:bem:oculta']);
  assert.deepEqual(resumo('b10'), ['ligado', '', '', true, 'cam-2:ficha:oculta']);
  assert.deepEqual(resumo('b5'), ['a-conferir', 'conflito', '', false, 'duas-a:ficha,duas-b:ficha']);
  assert.deepEqual(resumo('b6'), ['a-conferir', 'conflito', '', false, 'outra:ficha,livre:bem']);
  assert.deepEqual(resumo('b7'), ['a-conferir', 'conflito', '', false, 'aponta-outro:bem']);
  assert.deepEqual(resumo('b11'), ['a-conferir', 'conflito', '', false, 'cam-3:bem:oculta']);
  assert.deepEqual(resumo('b8'), ['a-conferir', 'ficha-retirada', '', false, 'sumida:bem']);
  assert.equal(rotuloLigadoA(v.b4), 'uma ficha de Segurança');
  assert.equal(rotuloLigadoA(v.b1), 'Estrutura · Ficha so-ficha');
  assert.equal(rotuloLigadoA(v.b8.ligacoes[0]), 'Ficha retirada');
  assert.equal(rotuloVinculoServidor(v.b8.ligacoes[0]), 'uma ficha retirada');
  assert.equal(rotuloVinculoServidor(v.b2.ligacoes[0]), 'Máquina · Ficha dois-lados');
  assert.equal(rotuloVinculoServidor(v.b4.ligacoes[0]), 'uma ficha de Segurança');
});

test('ficha repetida na lista não cria conflito falso', () => {
  const f = ficha('a', 'maquina', '', { bemId: 'b1' });
  assert.equal(vinculosDosBens([bem('b1')], [f, { ...f }]).b1.estado, 'ligado');
});

test('fichas livres: fora baixada, AVCB, outra família e ficha ligada por qualquer dos lados', () => {
  const fichas = [
    ficha('z', 'predial', 'Extintor', { nome: 'Extintor 10' }), ficha('y', 'predial', 'Extintor', { nome: 'Extintor 2' }),
    ficha('baixada', 'predial', 'Extintor', { especificacao: { situacao: 'baixado' } }),
    ficha('avcb', 'predial', 'AVCB'), ficha('ligada-ficha', 'predial', 'Extintor', { bemId: 'b9' }),
    ficha('ligada-bem', 'predial', 'Extintor'), ficha('ar', 'predial', 'Ar-condicionado'),
  ];
  const livres = fichasLivresParaBem(fichas, [bem('b1', { origemAtivoId: 'ligada-bem' })], 'incendio');
  assert.deepEqual(livres.map(f => f.id), ['y', 'z']);
  assert.deepEqual(fichasLivresParaBem(fichas, [], 'estrutura').map(f => f.id), ['ar']);
});

test('rótulo curto com o complemento de cada família e corte em 60 caracteres', () => {
  assert.equal(rotuloFicha(ficha('c', 'veiculo', '', { nome: 'Utilitário', especificacao: { placa: 'EXE1A23' } })), 'Utilitário · EXE1A23');
  assert.equal(rotuloFicha(ficha('m', 'maquina', '', { nome: 'Laser', especificacao: { numeroSerie: 'S-1' } })), 'Laser · S-1');
  assert.equal(rotuloFicha(ficha('t', 'informatica', 'Celular', { nome: 'Celular', especificacao: { imei: '0001' } })), 'Celular · 0001');
  assert.equal(rotuloFicha(ficha('t', 'informatica', 'Telefone', { nome: 'Ramal', identificacao: 'R-1', especificacao: { numeroSerie: 'S' } })), 'Ramal · R-1');
  assert.equal(rotuloFicha(ficha('e', 'predial', 'Extintor', { nome: 'Extintor', especificacao: { numero: '07', local: 'Entrada' } })), 'Extintor · nº 07');
  assert.equal(rotuloFicha(ficha('s', 'seguranca', 'Câmera', { nome: 'Câmera', especificacao: { local: 'Recepção' } })), 'Câmera · Recepção');
  assert.equal(rotuloFicha(ficha('p', 'informatica', 'Computador', { nome: 'PC', especificacao: { local: 'Sala' } })), 'PC · Sala');
  assert.equal(rotuloFicha(ficha('n', 'veiculo', '', { nome: '  ' })), 'Sem nome');
  const longo = rotuloFicha(ficha('l', 'maquina', '', { nome: 'Nome muito comprido '.repeat(5), especificacao: { numeroSerie: 'X' } }));
  assert.equal(longo.length, 60);
  assert.equal(longo.endsWith('…'), true);
});

test('setor diferente só com setor nos dois lados e siglas distintas', () => {
  const setores = [{ id: 's1', sigla: 'PRO', nome: 'Produção' }, { id: 's2', sigla: 'ADM', nome: 'Administração' }];
  const f = setorId => ficha('f', 'informatica', 'Computador', { especificacao: { setorId } });
  assert.deepEqual(setorDivergente(bem('b'), f('s2'), setores), { bem: 'Produção', ficha: 'Administração' });
  assert.equal(setorDivergente(bem('b'), f('s1'), setores), null);
  assert.equal(setorDivergente(bem('b'), f(''), setores), null);
  assert.equal(setorDivergente(bem('b', { setorSigla: '' }), f('s2'), setores), null);
  assert.equal(setorDivergente(bem('b'), f('removido'), setores), null);
});
