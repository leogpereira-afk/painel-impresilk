import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOperacaoCaixa, quantidadeEmUso, saldoDisponivelCaixa } from '../../../supabase/functions/_shared/patrimonio-caixas.mjs';
import { prepararControle } from '../../../supabase/functions/_shared/patrimonio-controles.mjs';

const sessao = { sub: 'ana', nome: 'Ana Exemplo' };
const agora = '2026-10-05T13:00:00.000Z';
const operacaoItem = (item = {}) => ({ tipo: 'itemSalvar', item: { nome: 'Alicate', quantidade: 5, estado: 'bom', observacao: '', ...item } });
const aplicar = (anterior, operacao, usuario = sessao, instante = agora) => aplicarOperacaoCaixa(anterior, operacao, usuario, instante);
const caixa = () => aplicar(null, operacaoItem());
const mover = (anterior, tipo = 'entrega', campos = {}) => aplicar(anterior, { tipo, itemId: anterior.acervo[0].id, quantidade: 2, pessoa: 'José da Silva', data: '2026-10-05', estado: 'bom', observacao: '', ...campos });
const avaliar = (anterior, campos = {}) => aplicar(anterior, { tipo: 'avaliar', data: '2026-10-05', proximaData: '2026-11-05', itens: anterior.acervo.filter(item => !item.arquivado).map(item => ({ itemId: item.id, quantidadeConferida: 1, estado: 'bom', observacao: '' })), observacao: '', ...campos });
const recusa = (acao, mensagem) => assert.throws(acao, erro => erro.status === 422 && (!mensagem || mensagem.test(erro.message)));
function congelar(valor) {
  if (valor && typeof valor === 'object') { Object.freeze(valor); Object.values(valor).forEach(congelar); }
  return valor;
}

test('caixa inicia vazia; item usa ID e autoria do servidor sem alterar o registro anterior', () => {
  assert.deepEqual(aplicar(null), { acervo: [], movimentacoes: [], avaliacoes: [] });
  const inicial = congelar(caixa());
  const id = inicial.acervo[0].id;
  assert.match(id, /^[0-9a-f-]{36}$/i);
  const alterada = aplicar(inicial, operacaoItem({ id, nome: 'Alicate universal', atualizadoPorNome: 'Falso', atualizadoEm: '2000', arquivado: true }), { sub: 'leo', nome: 'Leonardo' });
  assert.equal(alterada.acervo[0].nome, 'Alicate universal');
  assert.equal(alterada.acervo[0].atualizadoPorNome, 'Leonardo');
  assert.equal(alterada.acervo[0].atualizadoEm, agora);
  assert.equal(alterada.acervo[0].arquivado, undefined);
  assert.equal(inicial.acervo[0].nome, 'Alicate');
  recusa(() => aplicar(inicial, operacaoItem({ id: 'id-inventado' })), /não existe/);
});

test('entregas respeitam saldo e devoluções respeitam a mesma pessoa, sem acentos ou variação de espaços', () => {
  const inicial = caixa();
  const entregue = mover(inicial, 'entrega', { quantidade: 4, pessoa: '  José  da Silva  ', id: 'forjado', itemNome: 'Falso', criadoPor: 'outro', criadoPorNome: 'Falso', criadoEm: '2000' });
  const evento = entregue.movimentacoes[0];
  assert.notEqual(evento.id, 'forjado');
  assert.equal(evento.itemNome, 'Alicate');
  assert.equal(evento.pessoa, 'José  da Silva');
  assert.equal(evento.criadoPor, 'ana');
  assert.equal(evento.criadoPorNome, 'Ana Exemplo');
  assert.equal(evento.criadoEm, agora);
  assert.equal(inicial.movimentacoes.length, 0);
  recusa(() => mover(entregue), /saldo disponível/);
  recusa(() => mover(entregue, 'devolucao', { pessoa: 'Maria' }), /essa pessoa/);
  const parcial = mover(entregue, 'devolucao', { pessoa: 'JOSE DA SILVA', quantidade: 3 });
  recusa(() => mover(parcial, 'devolucao', { pessoa: 'jose da silva', quantidade: 2 }), /essa pessoa/);
  const devolvida = mover(parcial, 'devolucao', { pessoa: 'jose da silva', quantidade: 1 });
  assert.equal(mover(devolvida, 'entrega', { quantidade: 5 }).movimentacoes.length, 4);
});

test('saldos são independentes por pessoa e por item', () => {
  let registro = aplicar(caixa(), operacaoItem({ nome: 'Chave', quantidade: 3 }));
  const segundoId = registro.acervo[1].id;
  registro = mover(registro, 'entrega', { quantidade: 2, pessoa: 'Ana' });
  registro = mover(registro, 'entrega', { quantidade: 3, pessoa: 'Bruno' });
  registro = mover(registro, 'entrega', { itemId: segundoId, quantidade: 3, pessoa: 'Ana' });
  assert.equal(quantidadeEmUso(registro.movimentacoes, registro.acervo[0].id, 'ÁNA'), 2);
  assert.equal(quantidadeEmUso(registro.movimentacoes, segundoId), 3);
  assert.equal(saldoDisponivelCaixa(registro, registro.acervo[0].id), 0);
  assert.equal(saldoDisponivelCaixa(registro, 'ausente'), 0);
  assert.equal(saldoDisponivelCaixa(null, 'ausente'), 0);
  recusa(() => mover(registro, 'devolucao', { pessoa: 'Ana', quantidade: 3 }), /essa pessoa/);
  assert.equal(mover(registro, 'devolucao', { itemId: segundoId, pessoa: 'Ana', quantidade: 3 }).movimentacoes.length, 4);
});

test('não reduz total abaixo do que está em uso; arquivamento preserva todo o histórico', () => {
  let registro = mover(caixa(), 'entrega', { quantidade: 4 });
  const id = registro.acervo[0].id;
  recusa(() => aplicar(registro, operacaoItem({ id, quantidade: 3 })), /em uso/);
  recusa(() => aplicar(registro, { tipo: 'itemArquivar', itemId: id }), /Devolva/);
  registro = aplicar(registro, operacaoItem({ id, quantidade: 4 }));
  registro = mover(registro, 'devolucao', { quantidade: 4 });
  registro = avaliar(registro);
  const arquivada = aplicar(congelar(registro), { tipo: 'itemArquivar', itemId: id });
  assert.equal(arquivada.acervo[0].arquivado, true);
  assert.deepEqual(arquivada.movimentacoes, registro.movimentacoes);
  assert.deepEqual(arquivada.avaliacoes, registro.avaliacoes);
  recusa(() => mover(arquivada), /arquivado/);
  recusa(() => aplicar(arquivada, operacaoItem({ id })), /arquivado/);
});

test('avaliação registra quantidade esperada disponível, nome e avaliador sem permitir adulteração', () => {
  let registro = mover(caixa(), 'entrega', { quantidade: 2 });
  const id = registro.acervo[0].id;
  registro = avaliar(registro, { id: 'falso', criadoEm: '2000', criadoPor: 'outro', criadoPorNome: 'Falso', itens: [{ itemId: id, itemNome: 'Forjado', quantidadeEsperada: 999, quantidadeConferida: 2, estado: 'desgaste', observacao: 'Uma peça faltante' }] });
  const avaliacao = registro.avaliacoes[0];
  assert.notEqual(avaliacao.id, 'falso');
  assert.deepEqual(avaliacao.itens[0], { itemId: id, itemNome: 'Alicate', quantidadeEsperada: 3, quantidadeConferida: 2, estado: 'desgaste', observacao: 'Uma peça faltante' });
  assert.equal(avaliacao.criadoPor, 'ana');
  assert.equal(avaliacao.criadoPorNome, 'Ana Exemplo');
  assert.equal(avaliacao.criadoEm, agora);
  assert.equal(avaliacao.data, '2026-10-05');
  assert.equal(avaliacao.proximaData, '2026-11-05');
  const renomeada = aplicar(registro, operacaoItem({ id, nome: 'Nome corrigido' }));
  assert.equal(renomeada.avaliacoes[0].itens[0].itemNome, 'Alicate');
  assert.equal(renomeada.movimentacoes[0].itemNome, 'Alicate');
});

test('avaliação exige todos os itens ativos, uma única vez, e ignora os arquivados', () => {
  let registro = aplicar(caixa(), operacaoItem({ nome: 'Chave' }));
  const [um, dois] = registro.acervo;
  const entrada = { itemId: um.id, quantidadeConferida: 5, estado: 'bom' };
  recusa(() => avaliar(registro, { itens: [entrada] }), /todos/);
  recusa(() => avaliar(registro, { itens: [entrada, entrada] }), /uma vez/);
  recusa(() => avaliar(registro, { itens: [entrada, { ...entrada, itemId: 'não existe' }] }), /não existe/);
  registro = aplicar(registro, { tipo: 'itemArquivar', itemId: dois.id });
  assert.equal(avaliar(registro).avaliacoes[0].itens.length, 1);
  recusa(() => avaliar(aplicar(null)), /pelo menos um/);
});

test('avaliações anteriores e autoria permanecem quando outro usuário registra uma nova avaliação', () => {
  const primeira = avaliar(caixa());
  const segunda = aplicar(congelar(primeira), { tipo: 'avaliar', data: '2026-10-05', proximaData: '2026-11-05', itens: [{ itemId: primeira.acervo[0].id, quantidadeConferida: 4, estado: 'nao_verificado' }] }, { sub: 'leo', nome: 'Leonardo' });
  assert.equal(segunda.avaliacoes.length, 2);
  assert.deepEqual(segunda.avaliacoes[0], primeira.avaliacoes[0]);
  assert.equal(segunda.avaliacoes[1].criadoPor, 'leo');
  assert.equal(segunda.avaliacoes[1].criadoPorNome, 'Leonardo');
  assert.notEqual(segunda.avaliacoes[1].id, segunda.avaliacoes[0].id);
});

test('valida datas reais, futuro pelo dia de São Paulo e próxima avaliação', () => {
  const inicial = caixa();
  for (const data of ['2026-02-29', '2026-02-30', '2026-13-01', '05/10/2026', '', '2026-10-06', null]) {
    recusa(() => mover(inicial, 'entrega', { data }), /data/);
    recusa(() => avaliar(inicial, { data }), /data/);
  }
  recusa(() => avaliar(inicial, { proximaData: '2026-10-04' }), /anterior/);
  recusa(() => avaliar(inicial, { proximaData: '2027-02-29' }), /data/);
  assert.equal(avaliar(inicial, { proximaData: '2026-10-05' }).avaliacoes.length, 1);
  assert.equal(mover(inicial, 'entrega', { data: '2024-02-29' }).movimentacoes.length, 1);
  const operacao = { tipo: 'entrega', itemId: inicial.acervo[0].id, quantidade: 1, pessoa: 'Ana', data: '2026-10-05', estado: 'bom' };
  recusa(() => aplicar(inicial, operacao, sessao, '2026-10-05T01:30:00.000Z'), /futuro/);
  assert.equal(aplicar(inicial, { ...operacao, data: '2026-10-04' }, sessao, '2026-10-05T01:30:00.000Z').movimentacoes.length, 1);
});

test('movimentos respeitam a cronologia do item e todas as avaliações sem impedir mesma data', () => {
  let registro = aplicar(caixa(), operacaoItem({ nome: 'Chave' }));
  const segundoId = registro.acervo[1].id;
  registro = mover(registro, 'entrega', { data: '2026-10-03', quantidade: 2 });
  for (const tipo of ['entrega', 'devolucao']) recusa(() => mover(congelar(registro), tipo, { data: '2026-10-02', quantidade: 1 }), /anterior.*movimenta/);
  registro = mover(registro, 'devolucao', { data: '2026-10-03', quantidade: 1 });
  registro = mover(registro, 'entrega', { itemId: segundoId, data: '2026-10-01', quantidade: 1 });
  assert.equal(registro.movimentacoes.length, 3);
  registro = avaliar(registro, { data: '2026-10-04' });
  recusa(() => mover(congelar(registro), 'devolucao', { data: '2026-10-03', quantidade: 1 }), /anterior.*avalia/);
  recusa(() => mover(registro, 'entrega', { itemId: segundoId, data: '2026-10-03', quantidade: 1 }), /anterior.*avalia/);
  const devolvida = mover(registro, 'devolucao', { data: '2026-10-04', quantidade: 1 });
  assert.equal(devolvida.movimentacoes.length, 4);
  assert.equal(registro.movimentacoes.length, 3);
});

test('avaliação não antecede a maior data das movimentações ou avaliações e preserva snapshots', () => {
  let registro = mover(caixa(), 'entrega', { data: '2026-10-03', quantidade: 2 });
  registro = mover(registro, 'devolucao', { data: '2026-10-04', quantidade: 1 });
  registro = { ...registro, movimentacoes: [...registro.movimentacoes].reverse() };
  recusa(() => avaliar(congelar(registro), { data: '2026-10-03' }), /anterior.*movimenta/);
  registro = avaliar(registro, { data: '2026-10-04' });
  assert.equal(registro.avaliacoes[0].itens[0].quantidadeEsperada, 4);
  registro = avaliar(registro, { data: '2026-10-05' });
  registro = { ...registro, avaliacoes: [...registro.avaliacoes].reverse() };
  recusa(() => avaliar(congelar(registro), { data: '2026-10-04' }), /anterior.*avalia/);
  const mesmaData = avaliar(registro, { data: '2026-10-05' });
  assert.equal(mesmaData.avaliacoes.length, 3);
  assert.deepEqual(mesmaData.avaliacoes.slice(0, 2), registro.avaliacoes);
  assert.equal(mesmaData.avaliacoes[2].itens[0].quantidadeEsperada, 4);
});

test('quantidades, estados, textos e operações inválidos são recusados', () => {
  const inicial = caixa();
  for (const quantidade of [-1, 1.5, NaN, Infinity, 1_000_001, null, '', '1', true, []]) {
    recusa(() => aplicar(inicial, operacaoItem({ quantidade })), /inteira/);
    recusa(() => mover(inicial, 'entrega', { quantidade }), /inteira/);
    recusa(() => avaliar(inicial, { itens: [{ itemId: inicial.acervo[0].id, quantidadeConferida: quantidade, estado: 'bom' }] }), /inteira/);
  }
  assert.equal(aplicar(null, operacaoItem({ quantidade: 0 })).acervo[0].quantidade, 0);
  recusa(() => mover(inicial, 'entrega', { quantidade: 0 }), /inteira/);
  recusa(() => mover(inicial, 'devolucao', { quantidade: 0 }), /inteira/);
  recusa(() => aplicar(inicial, operacaoItem({ nome: ' ' })), /nome/);
  recusa(() => aplicar(inicial, operacaoItem({ nome: 'a'.repeat(161) })), /caracteres/);
  recusa(() => mover(inicial, 'entrega', { pessoa: '' }), /pessoa/);
  recusa(() => mover(inicial, 'entrega', { observacao: 'x'.repeat(1001) }), /caracteres/);
  for (const estado of ['', 'ótimo', null, {}]) {
    recusa(() => aplicar(inicial, operacaoItem({ estado })), /estado/);
    recusa(() => mover(inicial, 'entrega', { estado }), /estado/);
  }
  for (const operacao of [[], true, 'entrega', {}, { tipo: 'apagarHistorico' }, { tipo: 'itemSalvar', item: [] }]) recusa(() => aplicar(inicial, operacao));
});

test('limites recusam acréscimos sem truncar ou modificar os registros anteriores', () => {
  const inicial = caixa();
  const cheio = { ...inicial, acervo: Array.from({ length: 500 }, (_, i) => ({ ...inicial.acervo[0], id: String(i) })) };
  recusa(() => aplicar(congelar(cheio), operacaoItem()), /limite/);
  assert.equal(aplicar(cheio, operacaoItem({ id: '0', nome: 'Corrigido' })).acervo.length, 500);
  const movimentos = { ...inicial, movimentacoes: Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), itemId: 'outro', tipo: 'entrega', quantidade: 1, pessoa: 'Ana' })) };
  recusa(() => mover(congelar(movimentos)), /limite/);
  assert.equal(movimentos.movimentacoes.length, 10_000);
  const avaliacoes = { ...inicial, avaliacoes: Array.from({ length: 1_200 }, (_, i) => ({ id: String(i) })) };
  recusa(() => avaliar(congelar(avaliacoes)), /limite/);
  assert.equal(avaliacoes.avaliacoes.length, 1_200);
});

test('prepararControle preserva acervo e histórico ao editar dono/número e ignora arrays forjados', () => {
  const campos = { tipo: 'ferramentas', numero: '1', pessoa: 'Ana', versaoAnterior: null };
  const criada = prepararControle({ ...campos, acervo: [{ id: 'forjado' }], movimentacoes: [{}], avaliacoes: [{}] }, null, sessao, agora);
  assert.deepEqual(criada.acervo, []);
  assert.deepEqual(criada.movimentacoes, []);
  assert.deepEqual(criada.avaliacoes, []);
  const comItem = prepararControle({ ...campos, versaoAnterior: criada.atualizadoEm, operacaoCaixa: operacaoItem() }, criada, sessao, agora);
  const completa = { ...comItem, ...avaliar(mover(comItem)) };
  const editada = prepararControle({ ...campos, numero: '2', pessoa: 'Bruno', versaoAnterior: completa.atualizadoEm, acervo: [], movimentacoes: [], avaliacoes: [] }, completa, sessao, agora);
  assert.equal(editada.numero, '2');
  assert.equal(editada.pessoa, 'Bruno');
  for (const campo of ['acervo', 'movimentacoes', 'avaliacoes']) assert.deepEqual(editada[campo], completa[campo]);
  assert.equal(editada.operacaoCaixa, undefined);
  recusa(() => prepararControle({ ...campos, tipo: 'armarios', operacaoCaixa: operacaoItem() }, null, sessao, agora), /exclusiva/);
});

test('versão muda mesmo no mesmo milissegundo; operação com versão antiga é recusada', () => {
  const campos = { tipo: 'ferramentas', numero: '1', versaoAnterior: null, operacaoCaixa: operacaoItem() };
  const criada = prepararControle(campos, null, sessao, agora);
  const primeira = prepararControle({ ...campos, operacaoCaixa: operacaoItem({ nome: 'Chave' }), versaoAnterior: criada.atualizadoEm }, criada, sessao, agora);
  assert.ok(primeira.atualizadoEm > criada.atualizadoEm);
  assert.throws(() => prepararControle({ ...campos, versaoAnterior: criada.atualizadoEm }, primeira, sessao, agora), erro => erro.status === 409);
  assert.equal(primeira.acervo.length, 2);
});
