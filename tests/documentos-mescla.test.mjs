import test from 'node:test';
import assert from 'node:assert/strict';
import { mesclarDocumentoEmConflito, mesclarKitEmConflito, aplicarEscolhaConflito } from '../src/lib/calc/documentos-licitacoes.js';

test('três vias preserva campo remoto intocado e campo local não alterado remotamente', () => {
  const base = { id: 'doc1', nome: 'Antes', validade: '2026-11-03', responsavel: 'Responsável inicial' };
  const local = { ...base, nome: 'Meu nome' }, remoto = { ...base, validade: '2027-01-01', responsavel: 'Responsável remoto' };
  const m = mesclarDocumentoEmConflito(base, local, remoto);
  assert.deepEqual(m.item, { ...remoto, nome: local.nome }); assert.equal(m.conflitos.length, 0);
});
test('mesmo campo alterado de forma diferente requer escolha e servidor pode ser escolhido', () => {
  const base = { id: 'doc1', nome: 'Antes' }, local = { ...base, nome: 'Local' }, remoto = { ...base, nome: 'Remoto' };
  const m = mesclarDocumentoEmConflito(base, local, remoto);
  assert.equal(m.conflitos.length, 1); assert.equal(aplicarEscolhaConflito(m.item, m.conflitos[0], 'remoto').nome, 'Remoto');
});
test('requisitos remotos são preservados por ID e campos independentes do mesmo requisito se combinam', () => {
  const req = { id: 'r1', categoria: 'Original', descricao: 'Descrição antiga', documentoId: 'doc1', versaoId: 'v1' };
  const base = { id: 'k1', nome: 'Kit', requisitos: [req] };
  const remotoNovo = { id: 'r2', categoria: 'Atestado', descricao: 'Incluído remotamente' };
  const local = { ...base, requisitos: [{ ...req, descricao: 'Minha descrição' }] };
  const remoto = { ...base, requisitos: [{ ...req, categoria: 'Categoria remota' }, remotoNovo] };
  const m = mesclarKitEmConflito(base, local, remoto);
  assert.equal(m.conflitos.length, 0); assert.equal(m.item.requisitos.length, 2);
  assert.equal(m.item.requisitos[0].categoria, 'Categoria remota'); assert.equal(m.item.requisitos[0].descricao, 'Minha descrição');
  assert.deepEqual(m.item.requisitos[1], remotoNovo);
});
test('retirada local de requisito alterado remotamente exige escolha explícita', () => {
  const req = { id: 'r1', categoria: 'CND', descricao: 'Antes' }, base = { id: 'k1', nome: 'Kit', requisitos: [req] };
  const m = mesclarKitEmConflito(base, { ...base, requisitos: [] }, { ...base, requisitos: [{ ...req, descricao: 'Mudou remotamente' }] });
  assert.equal(m.conflitos.length, 1);
  assert.equal(aplicarEscolhaConflito(m.item, m.conflitos[0], 'remoto').requisitos[0].descricao, 'Mudou remotamente');
});
test('retirada remota de requisito modificado localmente exige escolha; vínculo e dispensa são atômicos', () => {
  const req = { id: 'r1', categoria: 'CND', descricao: 'Antes', documentoId: 'd1', versaoId: 'v1' }, base = { id: 'k1', nome: 'Kit', requisitos: [req] };
  const m = mesclarKitEmConflito(base, { ...base, requisitos: [{ ...req, descricao: 'Minha descrição' }] }, { ...base, requisitos: [] });
  assert.equal(m.conflitos.length, 1); assert.equal(aplicarEscolhaConflito(m.item, m.conflitos[0], 'remoto').requisitos.length, 0);
  const v = mesclarKitEmConflito(base, { ...base, requisitos: [{ ...req, documentoId: '', versaoId: '', dispensado: true, justificativa: 'Item dispensado' }] }, { ...base, requisitos: [{ ...req, versaoId: 'v2' }] });
  assert.equal(v.conflitos.length, 1); assert.equal(v.conflitos[0].caminho.at(-1), 'documentacao');
  const escolhido = aplicarEscolhaConflito(v.item, v.conflitos[0], 'remoto').requisitos[0];
  assert.equal(escolhido.versaoId, 'v2'); assert.equal(escolhido.dispensado, false); assert.equal(escolhido.justificativa, '');
});

test('validade e sem vencimento são uma escolha atômica nas duas direções', () => {
  const base = { id: 'doc1', validade: '2027-01-01', semVencimento: false };
  const local = { ...base, validade: '', semVencimento: true }, remoto = { ...base, validade: '2028-01-01', semVencimento: false };
  const m = mesclarDocumentoEmConflito(base, local, remoto);
  assert.equal(m.conflitos.length, 1); assert.deepEqual(m.conflitos[0].caminho, ['prazoDocumento']);
  const escolhidoRemoto = aplicarEscolhaConflito(m.item, m.conflitos[0], 'remoto');
  assert.equal(escolhidoRemoto.validade, '2028-01-01'); assert.equal(escolhidoRemoto.semVencimento, false);
  const escolhidoLocal = aplicarEscolhaConflito(m.item, m.conflitos[0], 'local');
  assert.equal(escolhidoLocal.validade, ''); assert.equal(escolhidoLocal.semVencimento, true);
  const inverso = mesclarDocumentoEmConflito(base, remoto, local);
  const semPrazoRemoto = aplicarEscolhaConflito(inverso.item, inverso.conflitos[0], 'remoto');
  assert.equal(semPrazoRemoto.validade, ''); assert.equal(semPrazoRemoto.semVencimento, true);
});

test('responsável mantém ID e nome juntos ao resolver edições concorrentes', () => {
  const base = { id: 'doc1', responsavelId: 'pessoa1', responsavel: 'Pessoa inicial' };
  const local = { ...base, responsavelId: 'pessoa2', responsavel: 'Pessoa local' };
  const remoto = { ...base, responsavelId: 'pessoa3', responsavel: 'Pessoa remota' };
  const m = mesclarDocumentoEmConflito(base, local, remoto);
  assert.equal(m.conflitos.length, 1); assert.deepEqual(m.conflitos[0].caminho, ['responsavelDocumento']);
  const escolhido = aplicarEscolhaConflito(m.item, m.conflitos[0], 'remoto');
  assert.equal(escolhido.responsavelId, 'pessoa3'); assert.equal(escolhido.responsavel, 'Pessoa remota');
});
