import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparInteresses, estadoInicialInteresses, interesseSelecionado, lerInteresses, marcarDocumento,
  removerInteresse, removerRequisito, requisitosConferidos, salvarRequisitos, selecionarInteresse,
} from '../src/lib/licitacoes-interesses.mjs';

const codigo = '12345678000199-1-000077/2026';
const fonteUrl = 'https://example.com/edital.pdf';
const relatorio = {id: 'demonstracao', geradoEm: '2026-11-10T10:00:00Z'};
const documento = {nome: 'Modelo de proposta', categoria: 'proposta',
  orientacao: 'Identificar o objeto e informar preço unitário.', referencia: 'Item 5.1', fonteUrl};
const primeiro = {id: 'demo-a', orgao: 'Órgão Exemplo', processo: `PE 77/2026 · PNCP ${codigo}`,
  item: '1', produto: 'Banner', documentosEdital: [documento, {...documento, escopo: 'item'}],
  arquivosEdital: [{nome:'Edital', tipo:'Edital', url: fonteUrl}]};
const segundo = {...primeiro, id:'demo-b', item:'2', produto:'Placa'};
const estadoComDois = () => [primeiro, segundo].reduce((estado, item) => selecionarInteresse(estado, item, relatorio), estadoInicialInteresses());

test('a identidade PNCP preserva seleção entre relatórios e não mistura itens', () => {
  const estado = estadoComDois();
  const revisao = {...primeiro, id:'demo-a-revisado', processo: 'Pregão eletrônico 77/2026', oficialUrl:'https://pncp.gov.br/app/editais/12345678000199/2026/77'};
  const relatorioNovo = {id:'demonstracao-novo'};
  assert.ok(interesseSelecionado(estado, revisao, relatorioNovo));
  assert.equal(selecionarInteresse(estado, revisao, relatorioNovo), estado);
  assert.equal(agruparInteresses(estado)[0].itens.length, 2);
});

test('documentação comum é única e progresso específico não vaza entre itens', () => {
  const estado = estadoComDois();
  const [grupo] = agruparInteresses(estado);
  const [compartilhado, a, b] = grupo.documentos;
  assert.deepEqual([compartilhado.escopo, a.escopo, b.escopo], ['processo','item','item']);
  const alterado = marcarDocumento(marcarDocumento(estado, grupo.id, a.id, true), grupo.id, compartilhado.id, true);
  assert.deepEqual(agruparInteresses(alterado)[0].prontos, [compartilhado.id, a.id]);
  const salvo = lerInteresses({getItem: () => JSON.stringify(alterado)}, 'interesses');
  assert.deepEqual(agruparInteresses(salvo), agruparInteresses(alterado));
  assert.equal(salvo.selecoes[0].item.arquivosEdital[0].url, fonteUrl);
  const restante = removerInteresse(salvo, grupo.itens[0].chave);
  assert.deepEqual(agruparInteresses(restante)[0].prontos, [compartilhado.id]);
  assert.deepEqual(removerInteresse(restante, grupo.itens[1].chave).prontos, []);
});

test('revisões atualizam datas registradas e situação, sem depender da versão inicial', () => {
  const estado = estadoComDois();
  const atual = {...primeiro, situacaoEdital:{codigo:4,nome:'Suspensa',fonteUrl}};
  const [grupo] = agruparInteresses(estado, {...relatorio, oportunidades:[atual]});
  assert.equal(grupo.itens[0].item.situacaoEdital.nome, 'Suspensa');
  assert.equal(agruparInteresses(estado)[0].itens[0].item.situacaoEdital, undefined);
});

test('inclusão de requisitos é atômica, exige fontes e verifica o processo do arquivo', () => {
  const estado = estadoComDois();
  const [grupo] = agruparInteresses(estado);
  const itemId = grupo.itens[0].chave;
  const inscricao = {...documento,nome:'Inscrição no portal',categoria:'credenciamento',escopo:'processo'};
  const comprovante = {...documento,nome:'Amostra',escopo:'item'};
  assert.throws(() => salvarRequisitos(estado, grupo.id, itemId, [inscricao, {...comprovante,fonteUrl:'javascript:alert(1)'}], codigo), /cada requisito/i);
  assert.equal(estado.requisitos.length, 0);
  assert.throws(() => salvarRequisitos(estado, grupo.id, '', [comprovante], codigo), /escolha o item/i);
  assert.throws(() => salvarRequisitos(estado, grupo.id, itemId, [inscricao], '12345678000199-1-000078/2026'), /outro processo/i);
  const salvo = salvarRequisitos(estado, grupo.id, itemId, [inscricao, comprovante], codigo);
  assert.equal(salvarRequisitos(salvo, grupo.id, itemId, [inscricao, comprovante], codigo), salvo);
  assert.deepEqual(requisitosConferidos(salvo, primeiro, relatorio).map(doc=>doc.nome), ['Inscrição no portal', 'Amostra']);
  assert.deepEqual(requisitosConferidos(salvo, segundo, relatorio).map(doc=>doc.nome), ['Inscrição no portal']);
  const manual = agruparInteresses(salvo)[0].documentos.find(doc=>doc.nome==='Amostra' && doc.manual);
  const pronto = marcarDocumento(salvo, grupo.id, manual.id, true);
  assert.deepEqual(removerRequisito(pronto, manual.id).prontos, []);
});
