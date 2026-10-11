import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

function servico(resposta) {
  const chamadas = [], modulo = { exports: {} };
  const source = readFileSync(new URL('../src/services/agenda.js', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(transformSync(source, { format: 'cjs', target: 'es2022' }).code, {
    module: modulo, API: 'https://test.invalid', mensagemDoStatus: status => `Falha ${status}`,
    comCracha: async (url, config) => { chamadas.push({ url, config }); return resposta; },
  });
  return { chamadas, ler: modulo.exports.lerAgendaDocumentos };
}

test('serviço faz somente leitura na nova ação e conserva IDs originais da resposta', async () => {
  const eventos = [{ id: 'doc:exemplo:vencimento', data: '2026-10-20' }];
  const s = servico({ ok: true, json: async () => ({ eventos }) });
  assert.deepEqual(await s.ler('2026-10'), eventos);
  assert.equal(s.chamadas.length, 1);
  assert.equal(s.chamadas[0].url, 'https://test.invalid/painel-agenda');
  assert.deepEqual(JSON.parse(s.chamadas[0].config.body), { action: 'documentos', mes: '2026-10' });
});

test('resposta ausente ou inválida não se apresenta como mês sem vencimentos', async () => {
  for (const body of [null, {}, { eventos: {} }]) {
    await assert.rejects(servico({ ok: true, json: async () => body }).ler('2026-10'), /Resposta inválida/);
  }
  await assert.rejects(servico({ ok: true, json: async () => { throw new Error('JSON inválido'); } }).ler('2026-10'), /Resposta inválida/);
});

test('falha de permissão ou de consulta se propaga para o aviso da tela', async () => {
  for (const status of [403, 500]) {
    await assert.rejects(servico({ ok: false, status, json: async () => ({ erro: 'Não foi possível consultar.' }) }).ler('2026-10'), /Não foi possível consultar/);
  }
});
