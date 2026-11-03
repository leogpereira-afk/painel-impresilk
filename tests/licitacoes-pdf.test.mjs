import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarResumoLicitacoesPDF, baixarResumoLicitacoesPDF } from '../src/lib/licitacoes-pdf.mjs';

const options = { exportadoEm: '2026-11-03T18:45:00Z' };
const report = (overrides = {}) => ({
  estado: 'disponivel', id: 'relatorio-ficticio:2026-10-01', geradoEm: '2026-10-07T13:30:00Z', consultadoEm: '2026-11-02T12:00:00Z',
  periodo: { inicio: '2026-10-01', fim: '2026-10-07' },
  cobertura: { totalMunicipios: 89, concluidos: 4, parciais: 5, naoConsultados: 80, coberturaPercentual: 4.49 },
  coberturaInstituicoes: { totalRegistros: 8, concluidos: 2, parciais: 3, naoConsultados: 3 },
  oportunidades: [], candidatosRetidos: [], avisos: [], pendencias: [], limites: [], ...overrides,
});
const opportunity = (index = 1, overrides = {}) => ({
  id: `oportunidade-ficticia-${index}`, processo: `Processo fictício ${index}`, orgao: 'Instituto Demonstrativo',
  produto: 'Sinalização', item: `Placa demonstrativa ${index}`, lote: `Lote-${index}`, classificacao: 'REVISÃO HUMANA',
  prazo: '2026-10-28T14:00:00-03:00', municipiosAbrangidos: ['Município Exemplo'],
  justificativa: 'Conferir condições técnicas fictícias.', exigencias: ['Amostra de demonstração'], proximaAcao: 'Revisar o edital fictício.',
  oficialUrl: `https://portal.example/edital?id=ficticio-${index}`, ...overrides,
});
const retained = (index = 1, overrides = {}) => ({
  id: `retido-ficticio-${index}`, processo: `Retenção fictícia ${index}`, orgao: 'Fundação Demonstrativa',
  item: `Adesivo fictício ${index}`, lote: `Lote-R${index}`, produto: 'Adesivos', prazo: 'Entrega em 20 dias após autorização.',
  motivos: ['Prazo de proposta sem confirmação.', 'Local de execução pendente.'], exigencias: ['Conferir instalação demonstrativa'],
  proximaAcao: 'Buscar documento oficial demonstrativo.', justificativaRegistrada: 'Aderência ainda pendente de conferência.',
  localExecucaoRegistrado: { municipios: ['Município Fictício'], evidencia: 'Local citado no anexo demonstrativo; conferir escopo.', apenasSede: true },
  oficialUrl: `https://portal.example/retido?id=ficticio-${index}`, ...overrides,
});
const pdf = (data, extra = {}) => Buffer.from(gerarResumoLicitacoesPDF(data,{...options,...extra})).toString('latin1');
const text = file => [...file.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => match[1].replace(/\\([\\()])/g,'$1')).join('\n');
const streams = file => [...file.matchAll(/\nstream\n([\s\S]*?)\nendstream/g)].map(match => match[1]);

test('gera PDF A4 com offsets e tamanhos de streams coerentes', () => {
  const file = pdf(report({ oportunidades: [opportunity()] }));
  assert.ok(file.startsWith('%PDF-1.4\n')); assert.ok(file.endsWith('%%EOF'));
  assert.ok(file.includes('/MediaBox [0 0 595 842]'));
  const xref = Number(file.match(/startxref\n(\d+)/)[1]); assert.equal(file.slice(xref,xref+4),'xref');
  const rows = file.slice(xref).split('\n').slice(3).filter(line => /^\d{10} 00000 n/.test(line));
  rows.forEach((row,index) => assert.ok(file.slice(Number(row.slice(0,10))).startsWith(`${index+1} 0 obj\n`)));
  for (const match of file.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(Number(match[1]),match[2].length);
});

test('preserva pesquisa original, período e ID distinguindo data de exportação e leitura', () => {
  const result = text(pdf(report()));
  for (const value of ['Relatório de licitações','Resumo PDF | ID: relatorio-ficticio:2026-10-01','Pesquisa original: 07/10/2026, 10:30','Período: 01/10/2026 a 07/10/2026','PDF exportado em: 03/11/2026, 15:45']) assert.ok(result.includes(value),value);
  assert.ok(!result.includes('02/11/2026'), 'A leitura posterior não muda a data da pesquisa/exportação');
});

test('exporta todos os registros e retidos, independentemente de filtros e paginação', () => {
  const data = report({ oportunidades: Array.from({length:17},(_,i)=>opportunity(i+1)), candidatosRetidos: Array.from({length:19},(_,i)=>retained(i+1)), filtros: { busca: 'sem resultados' }, pagina: 2 });
  const before = structuredClone(data), file = pdf(data), result = text(file);
  for (const item of [...data.oportunidades,...data.candidatosRetidos]) assert.ok(result.includes(`ID: ${item.id}\n`),item.id);
  assert.ok(result.includes('17 oportunidades registradas | 19 candidatos retidos'));
  assert.ok(streams(file).length > 2); assert.deepEqual(data,before);
  assert.equal(pdf(data),file,'Timestamp explícito produz bytes determinísticos');
});

test('retidos preservam prazo literal, motivos, requisitos e ação sem promovê-los a oportunidades', () => {
  const result = text(pdf(report({ candidatosRetidos: [retained()] })));
  for (const value of ['Oportunidades registradas (0)','Candidatos retidos (1)','PENDENTE DE CONFERÊNCIA','Não são oportunidades verificadas','Prazo registrado: Entrega em 20 dias após autorização.','Pendência: Prazo de proposta sem confirmação.','Pendência: Local de execução pendente.','Exigência: Conferir instalação demonstrativa','Buscar documento oficial demonstrativo.','Município Fictício','Aderência ainda pendente de conferência.']) assert.ok(result.includes(value),value);
  assert.ok(!result.includes('Até ')); assert.ok(!result.includes('Prazo encerrado'));
});

test('denominador municipal permanece 89 e cobertura institucional fica separada', () => {
  const result = text(pdf(report({ cobertura: {totalMunicipios:83,concluidos:83,parciais:6,naoConsultados:0,coberturaPercentual:100} })));
  assert.ok(result.includes('Municípios: 83 de 89 concluídos (93,26%).'));
  assert.ok(result.includes('Órgãos e instituições: 2 de 8 registros concluídos.'));
  assert.ok(result.includes('totais municipais inconsistentes'));
});

test('links oficiais seguros e acervo apontam ao registro; conteúdo interno não é copiado', () => {
  const file = pdf(report({ oportunidades: [opportunity(1,{oficialUrl:'javascript:alert(1)',custoInterno:'DADO INTERNO FICTÍCIO'}),opportunity(2)], acervoUrl:'https://destino-injetado.example/' }));
  assert.ok(!file.includes('javascript:')); assert.ok(!file.includes('DADO INTERNO FICTÍCIO')); assert.ok(!file.includes('destino-injetado'));
  assert.ok(file.includes('/Subtype /Link')); assert.ok(file.includes('/URI (https://portal.example/edital?id=ficticio-2)'));
  assert.ok(file.includes('/URI (https://leogpereira-afk.github.io/painel-impresilk/licitacoes?relatorio=relatorio-ficticio%3A2026-10-01)'));
});

test('conteúdo longo é paginado sem perder o final e sem ultrapassar o corpo da página', () => {
  const ending = 'FIM DO REQUISITO FICTÍCIO';
  const file = pdf(report({ candidatosRetidos: [retained(1,{exigencias:[`${'Exigência demonstrativa com á, ã e ç. '.repeat(700)}${ending}`]})] }));
  assert.ok(streams(file).length > 3); assert.ok(text(file).includes(ending));
  for (const page of streams(file)) {
    assert.ok(page.includes('Relatório de licitações')); assert.ok(page.includes('Resumo PDF | ID:'));
    for (const match of page.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)) {
      assert.ok(Number(match[1]) >= 44 && Number(match[1]) <= 551);
      assert.ok(Number(match[2]) >= 29 && Number(match[2]) <= 805);
    }
  }
});

test('registros curtos e link do acervo permanecem juntos na paginação', () => {
  const data = report({oportunidades:Array.from({length:5},(_,i)=>opportunity(i+1)),candidatosRetidos:Array.from({length:7},(_,i)=>retained(i+1))});
  const pages = streams(pdf(data)).map(text);
  for (const item of [...data.oportunidades,...data.candidatosRetidos]) {
    const page = pages.find(page=>page.includes(`ID: ${item.id}\n`));
    assert.ok(page.includes(`Fonte oficial: ${item.oficialUrl}`),`Fonte acompanha ${item.id}`);
  }
  const archivePage=pages.find(page=>page.includes('Relatório completo no Painel (requer acesso):'));
  assert.ok(archivePage.includes('https://leogpereira-afk.github.io/painel-impresilk/licitacoes?relatorio='));
});

test('acentos, aspas e caracteres de sintaxe PDF são preservados como texto', () => {
  const result = text(pdf(report({oportunidades:[opportunity(1,{orgao:'Instituto D’Água (demonstração) \\ Norte'})]})));
  assert.ok(result.includes('Órgão: Instituto D\x92Água (demonstração) \\ Norte'));
});

test('resumo reduz notas gerais com indicação explícita e não reproduz matrizes/recibos', () => {
  const result = text(pdf(report({ avisos: Array.from({length:6},(_,i)=>`Ressalva fictícia ${i}`), limites:Array.from({length:5},(_,i)=>`Limite fictício ${i}`), pendencias:Array.from({length:121},()=> 'DETALHE DE MATRIZ FICTÍCIO'), recibos:[{id:'RECIBO FICTÍCIO NÃO ANEXADO'}] })));
  assert.ok(result.includes('3 ressalva(s) adicional(is)')); assert.ok(result.includes('1 limite(s) adicional(is)'));
  assert.ok(result.includes('Pendências gerais registradas: 121.'));
  assert.ok(!result.includes('DETALHE DE MATRIZ FICTÍCIO')); assert.ok(!result.includes('RECIBO FICTÍCIO NÃO ANEXADO'));
});

test('relatório ausente, ID inválido e cancelamento não geram arquivo', async () => {
  assert.throws(()=>gerarResumoLicitacoesPDF(null,options),/relatório disponível/);
  assert.throws(()=>gerarResumoLicitacoesPDF(report({id:'../invalido'}),options),/relatório disponível/);
  assert.throws(()=>gerarResumoLicitacoesPDF(report(),{exportadoEm:'inválida'}),/Data de exportação inválida/);
  const controller = new AbortController(); controller.abort();
  assert.throws(()=>gerarResumoLicitacoesPDF(report(),{...options,signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(baixarResumoLicitacoesPDF(report(),{...options,signal:controller.signal}),{name:'AbortError'});
  const pending = new AbortController(), download = baixarResumoLicitacoesPDF(report(),{...options,signal:pending.signal});
  pending.abort(); await assert.rejects(download,{name:'AbortError'});
});

test('download usa Blob PDF, nome seguro e limpa o elemento e URL temporários', async () => {
  const previousDocument = globalThis.document, previousTimeout = globalThis.setTimeout;
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  let blob, clicked = 0, removed = 0, appended = 0, revoked, scheduled;
  const anchor = {click(){clicked++;},remove(){removed++;}};
  try {
    globalThis.document = {createElement:()=>anchor,body:{append(){appended++;}}};
    globalThis.setTimeout = (fn,delay) => {if(delay===0)return previousTimeout(fn,0);scheduled=fn;};
    URL.createObjectURL = value => {blob=value;return 'blob:exemplo';}; URL.revokeObjectURL = value => {revoked=value;};
    await baixarResumoLicitacoesPDF(report(),options);
    assert.equal(blob.type,'application/pdf'); assert.equal(clicked,1); assert.equal(appended,1); assert.equal(removed,1);
    assert.equal(anchor.href,'blob:exemplo'); assert.equal(anchor.download,'Impresilk-licitacoes-relatorio-ficticio-2026-10-01.pdf');
    assert.ok(Buffer.from(await blob.arrayBuffer()).toString('latin1').startsWith('%PDF-1.4'));
    scheduled(); assert.equal(revoked,'blob:exemplo');
  } finally {
    globalThis.document=previousDocument;globalThis.setTimeout=previousTimeout;URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;
  }
});

test('evento de cancelamento enfileirado durante geração roda antes do download', async () => {
  const controller = new AbortController();
  const download = baixarResumoLicitacoesPDF(report({oportunidades:Array.from({length:20},(_,i)=>opportunity(i+1))}), {...options,signal:controller.signal});
  const timer = setTimeout(()=>controller.abort(),0);
  try { await assert.rejects(download,{name:'AbortError'}); }
  finally { clearTimeout(timer); }
});
