import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararControle, documentoPublico, snapshotDocumento, autorizadoDocumento } from '../supabase/functions/_shared/documentos.mjs';
import { atenderDocumentos } from '../supabase/functions/_shared/documentos-handler.mjs';
import { atenderCadastrosLicitacoes } from '../supabase/functions/_shared/licitacoes-cadastros-handler.mjs';
import { bancoDocumentosDemo, prepararDocumentosDemo } from '../src/review/documentos.mjs';
import { controleEditavel } from '../src/lib/calc/documentos.js';
import { hojeBrasilia, documentoEmpresa, resumirDocumentosLicitacoes, situacaoArquivoLicitacoes } from '../src/lib/calc/documentos-licitacoes.js';

const titulares = new Map([['empresa', { tipo: 'empresa', nome: 'Empresa fictícia' }], ['pessoa', { tipo: 'pessoa', nome: 'Pessoa fictícia' }]]);
const sessao = { perms: ['documentos', 'licitacoes'] };
const base = { id: 'documento-ficticio', tipo: 'documento', nome: 'Certidão fictícia', categoria: 'Certidão', titularId: 'empresa', titularTipo: 'empresa', emissao: '2026-10-01', validade: '2026-12-31', estado: 'ativo', temArquivo: true };
const preparar = (item, anterior = base, acesso = sessao) => prepararControle(item, anterior, titulares, new Map(), acesso);
const hoje = '2026-11-03';

test('uso em Licitações exige booleano, documento de empresa e ambas as permissões', () => {
  for (const valor of ['true', 1, null, undefined]) assert.throws(() => preparar({ usoLicitacoes: valor }), /verdadeiro ou falso/);
  for (const acesso of [{ perms: ['documentos'] }, { perms: ['licitacoes'] }, { perms: [] }]) assert.throws(() => preparar({ usoLicitacoes: true }, base, acesso), e => e.status === 403);
  assert.equal(preparar({ usoLicitacoes: true }).usoLicitacoes, true);
  assert.equal(preparar({ usoLicitacoes: true }, base, { master: true }).usoLicitacoes, true);
  for (const tipo of ['seguro', 'garantia']) assert.throws(() => preparar({ usoLicitacoes: true }, { ...base, tipo }), /Somente documentos/);
  assert.throws(() => preparar({ usoLicitacoes: true, titularId: 'pessoa' }, base, { perms: ['*'] }), /titular empresa/);
  assert.throws(() => preparar({ usoLicitacoes: false }, { ...base, tipo: 'predial', categoria: 'AVCB' }), /Somente documentos/);
});

test('edição comum e renovação preservam o vínculo sem exigir nova concessão; remover exige acesso', () => {
  const anterior = { ...base, usoLicitacoes: true };
  assert.equal(preparar({ validade: '2027-12-31' }, anterior, { perms: ['documentos'] }).usoLicitacoes, true);
  assert.equal(preparar({ usoLicitacoes: true }, anterior, { perms: ['documentos'] }).usoLicitacoes, true);
  assert.equal(preparar({ usoLicitacoes: false }, anterior).usoLicitacoes, false);
  assert.throws(() => preparar({ usoLicitacoes: false }, anterior, { perms: ['documentos'] }), e => e.status === 403);
  assert.throws(() => preparar({ titularId: 'pessoa' }, anterior, { perms: ['*'] }), /titular empresa/);
  assert.equal(Object.hasOwn(preparar({ nome: 'Editado' }), 'usoLicitacoes'), false);
  assert.equal(snapshotDocumento(anterior).usoLicitacoes, true);
  assert.equal(documentoPublico(anterior.id, anterior, titulares).usoLicitacoes, true);
  assert.equal(controleEditavel(anterior).usoLicitacoes, true);
});

test('o vínculo não amplia as permissões para documentos pessoais ou de bens restritos', () => {
  assert.equal(autorizadoDocumento({ ...base, usoLicitacoes: true, titularId: 'pessoa' }, titulares, sessao), false);
  assert.equal(autorizadoDocumento({ ...base, usoLicitacoes: true, ativoIds: ['bem-restrito'] }, titulares, sessao), false);
  assert.equal(autorizadoDocumento({ ...base, usoLicitacoes: true }, titulares, { perms: ['licitacoes'] }), false);
  assert.equal(documentoEmpresa({ ...base, titularTipo: 'pessoa' }), false);
  assert.equal(documentoEmpresa({ ...base, tipo: 'garantia' }), false);
  assert.equal(documentoEmpresa({ ...base, origem: 'incendio' }), false);
});

test('validade civil tem limites exatos, prazo próprio e Brasília independente do fuso do navegador', () => {
  assert.equal(hojeBrasilia(new Date('2026-11-04T02:59:59Z')), '2026-11-03');
  assert.equal(hojeBrasilia(new Date('2026-11-04T03:00:00Z')), '2026-11-04');
  assert.equal(situacaoArquivoLicitacoes({ ...base, validade: '2026-11-02' }, hoje).grupo, 'vencido');
  assert.equal(situacaoArquivoLicitacoes({ ...base, validade: hoje, alertaDias: 0 }, hoje).rotulo, 'Vence hoje');
  assert.equal(situacaoArquivoLicitacoes({ ...base, validade: '2026-11-04', alertaDias: 0 }, hoje).grupo, 'ok');
  assert.equal(situacaoArquivoLicitacoes({ ...base, validade: '2026-11-04' }, hoje).grupo, 'urgente');
  assert.equal(situacaoArquivoLicitacoes(base, hoje).grupo, 'ok');
});

test('arquivo ausente, datas inválidas, emissão futura e prazo vazio nunca ficam em dia', () => {
  for (const patch of [{ temArquivo: false }, { emissao: '' }, { emissao: '2026-02-30' }, { validade: '' }, { validade: '2026-02-30' }, { emissao: '2027-01-01' }, { emissao: '2026-10-03', validade: '2026-10-02' }, { semVencimento: true }]) {
    assert.equal(situacaoArquivoLicitacoes({ ...base, ...patch }, hoje).grupo, 'conferir', JSON.stringify(patch));
  }
  assert.equal(situacaoArquivoLicitacoes({ ...base, validade: '', semVencimento: true }, hoje).grupo, 'ok');
  assert.equal(situacaoArquivoLicitacoes({ ...base, validade: '', semVencimento: true, temArquivo: false }, hoje).grupo, 'conferir');
  assert.equal(situacaoArquivoLicitacoes(base, '2026-02-30').grupo, 'conferir');
});

test('cancelados e encerrados ficam identificados, fora dos contadores de documentos ativos', () => {
  const vm = resumirDocumentosLicitacoes([
    { ...base, usoLicitacoes: true }, { ...base, id: 'cancelado', usoLicitacoes: true, estado: 'cancelado', validade: '2025-01-01' },
    { ...base, id: 'encerrado', usoLicitacoes: true, estado: 'encerrado', temArquivo: false },
    { ...base, id: 'nao-vinculado' }, { ...base, id: 'pessoal', usoLicitacoes: true, titularTipo: 'pessoa' },
  ], hoje);
  assert.equal(vm.lista.length, 3);
  assert.deepEqual(vm.contagens, { vencido: 0, urgente: 0, conferir: 0, ok: 1, encerrado: 2 });
  assert.equal(vm.lista.find(i => i.id === 'cancelado').sit.rotulo, 'Cancelado');
});

test('vincular por ID usa o mesmo registro e renovação conserva arquivo antigo no banco demo', async () => {
  prepararDocumentosDemo([{ id: 'car-demo', tipo: 'veiculo', nome: 'Veículo fictício' }]);
  const sb = bancoDocumentosDemo();
  const chamar = corpo => atenderDocumentos({ sb, sessao, corpo, resposta: dados => dados, quem: 'Teste fictício', pessoasRH: async () => [], bytesParaB64: bytes => Buffer.from(bytes).toString('base64') });
  const antes = await chamar({ action: 'listarDocumentos' });
  const alvo = antes.itens.find(i => i.id === 'crlv-demo');
  const vinculado = await chamar({ action: 'salvarControle', item: { id: alvo.id, usoLicitacoes: true }, versao: alvo.atualizadoEm });
  assert.equal(vinculado.item.id, alvo.id);
  assert.equal(vinculado.item.usoLicitacoes, true);
  assert.equal(vinculado.item.versoes.length, 0);
  assert.equal((await chamar({ action: 'listarDocumentos' })).itens.length, antes.itens.length);
  const doc = antes.itens.find(i => i.id === 'cnd-licitacoes-demo');
  const arquivoAntes = await chamar({ action: 'lerVersaoDocumento', id: doc.id });
  const renovado = await chamar({ action: 'renovarControle', item: { id: doc.id, emissao: '2027-01-01', validade: '2027-12-31' }, versao: doc.atualizadoEm, arquivo: { nome: 'renovacao-ficticia.pdf', mime: 'application/pdf', base64: btoa('%PDF-1.4 arquivo ficticio renovado') } });
  assert.equal(renovado.item.usoLicitacoes, true);
  assert.equal(renovado.item.versoes.length, 2);
  const arquivoHistorico = await chamar({ action: 'lerVersaoDocumento', id: doc.id, versaoId: renovado.item.versoes[0].id });
  assert.equal(arquivoHistorico.base64, arquivoAntes.base64);
  await assert.rejects(chamar({ action: 'salvarControle', item: { id: doc.id, usoLicitacoes: false }, versao: doc.atualizadoEm }), e => e.status === 409);
});

test('Cadastros cria por RPC e usa o mesmo acervo demo com comparação de versão', async () => {
  const sb = bancoDocumentosDemo();
  const chamar = corpo => atenderCadastrosLicitacoes({ sb, sessao, corpo, resposta: dados => dados, quem: 'Teste fictício', revalidarSessao: async () => {} });
  const lista = await chamar({ action: 'listarCadastrosLicitacoes' });
  const empresa = lista.titulares[0];
  const novo = await chamar({ action: 'salvarCadastroLicitacoes', item: { cadastroId: '12345678-1234-4234-8234-123456789012', titularId: empresa.id, nome: 'Portal fictício RPC', url: 'https://example.com/portal-rpc-ficticio', categoria: 'plataforma', documentoIds: ['cnd-licitacoes-demo'] } });
  assert.equal(novo.item.nome, 'Portal fictício RPC');
  assert.deepEqual(novo.item.documentoIds, ['cnd-licitacoes-demo']);
  assert.equal((await chamar({ action: 'listarCadastrosLicitacoes' })).itens.find(i => i.id === novo.item.id).nome, 'Portal fictício RPC');
  const editado = await chamar({ action: 'salvarCadastroLicitacoes', item: { id: novo.item.id, situacao: 'preparacao' }, versao: novo.item.atualizadoEm });
  assert.equal(editado.item.situacao, 'preparacao');
  await assert.rejects(chamar({ action: 'salvarCadastroLicitacoes', item: { id: novo.item.id, situacao: 'ativo' }, versao: novo.item.atualizadoEm }), e => e.status === 409);
  const conflito = await sb.rpc('painel_registro_gravar', { p_colecao: 'licitacoes_cadastros', p_id: novo.item.id, p_anterior: null, p_registro: { nome: 'Não deve sobrescrever' } });
  assert.equal(conflito.error.code, '40001');
  assert.equal((await chamar({ action: 'listarCadastrosLicitacoes' })).itens.find(i => i.id === novo.item.id).situacao, 'preparacao');
});
