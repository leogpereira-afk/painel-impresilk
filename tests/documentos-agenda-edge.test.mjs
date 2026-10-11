import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import { documentoAgendaPermitido, incendioAgendaPermitido, bemLegadoAgendaPermitido, vencimentosDocumentos, TIPOS_DOCUMENTOS_AGENDA } from '../supabase/functions/_shared/documentos-agenda.mjs';
import { vencimentosIncendio, CATEGORIAS_INCENDIO } from '../supabase/functions/_shared/patrimonio-incendio.mjs';

const empresa = { colecao: 'documentos_titulares', id: 'empresa-exemplo', registro: { tipo: 'empresa', nome: 'Empresa fictícia' } };
const pessoa = { colecao: 'documentos_titulares', id: 'pessoa-exemplo', registro: { tipo: 'pessoa', nome: 'PESSOA-PRIVADA' } };
const documento = { colecao: 'ativo', id: 'doc-exemplo', registro: { tipo: 'documento', titularId: empresa.id, nome: 'Certificado fictício', validade: '2026-10-20', estado: 'ativo' } };
const campo = (linha, path) => path.split(/->>?/).reduce((valor, chave) => valor?.[chave], linha);
const projetar = (linha, campos) => Object.fromEntries(campos.split(',').map(parte => {
  const separador = parte.indexOf(':');
  const chave = separador === -1 ? parte : parte.slice(0, separador);
  const path = separador === -1 ? parte : parte.slice(separador + 1);
  return [chave, campo(linha, path)];
}));

function ambiente(perms = ['documentos'], linhas = [empresa, pessoa, documento], opcoes = {}) {
  let handler;
  const consultas = [];
  const sb = { from(tabela) {
    assert.equal(tabela, 'painel_registros');
    const consulta = { tabela, campos: '', filtros: [], ini: 0, fim: Infinity, ids: [] };
    const q = {
      select(campos) { consulta.campos = campos; consultas.push(consulta); return q; },
      eq(k, v) { consulta.filtros.push([k, valor => valor === v]); return q; },
      in(k, valores) { consulta.filtros.push([k, valor => valores.includes(valor)]); return q; },
      order() { return q; },
      range(ini, fim) { consulta.ini = ini; consulta.fim = fim; return q; },
      then(resolve, reject) {
        assert.ok(consulta.campos && !consulta.campos.split(',').includes('registro'), 'a agenda nunca consulta o registro inteiro');
        const falha = opcoes.falha?.(consulta, consultas.length);
        let lote = linhas.filter(l => consulta.filtros.every(([k, aceitar]) => aceitar(campo(l, k))))
          .sort((a, b) => a.id.localeCompare(b.id)).slice(consulta.ini, consulta.fim + 1);
        if (opcoes.paginaInfinita && consulta.campos === 'id,tipo:registro->>tipo') {
          lote = Array.from({ length: 500 }, (_, i) => ({ ...empresa, id: `empresa-${consulta.ini + i}` }));
        }
        consulta.ids = lote.map(l => l.id);
        let data = lote.map(l => projetar(l, consulta.campos));
        if (opcoes.alterarSaida) data = opcoes.alterarSaida(consulta, data);
        return Promise.resolve({ data: falha ? null : data, error: falha ? { message: 'Falha sintética confidencial' } : null }).then(resolve, reject);
      },
    };
    return q;
  } };
  const source = readFileSync(new URL('../supabase/functions/painel-agenda/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(transformSync(source, { loader: 'ts', target: 'es2022', format: 'esm' }).code, {
    Deno: { env: { get: k => k === 'PAINEL_JWT_SECRET' && opcoes.semSegredo ? '' : 'sintético' }, serve: f => handler = f },
    createClient: () => sb, verificarJwt: async () => opcoes.semSessao ? null : { sub: 'teste', perms, master: opcoes.master === true },
    crachaRevogado: async () => opcoes.revogado === true, hojeSP: () => '2026-10-11',
    documentoAgendaPermitido, incendioAgendaPermitido, bemLegadoAgendaPermitido, vencimentosDocumentos, TIPOS_DOCUMENTOS_AGENDA, vencimentosIncendio, CATEGORIAS_INCENDIO,
    Request, Response, console: { error() {} },
  });
  return { consultas, async chamar(corpo = { action: 'documentos', mes: '2026-10' }, method = 'POST') {
    const response = await handler(new Request('http://test.invalid', { method, headers: { authorization: 'Bearer fictício' }, ...(method === 'POST' ? { body: JSON.stringify(corpo) } : {}) }));
    return { status: response.status, body: await response.json() };
  } };
}

test('handler de documentos consulta títulos somente após autorizar titulares e origem', async () => {
  const pessoal = { ...documento, id: 'pessoal', registro: { ...documento.registro, titularId: pessoa.id, nome: 'TÍTULO-PESSOAL-PRIVADO' } };
  const legado = { ...documento, id: 'legado', registro: { ...documento.registro, titularId: undefined, nome: 'TÍTULO-LEGADO-PRIVADO' } };
  const cam = { colecao: 'ativo', id: 'cam', registro: { tipo: 'seguranca', nome: 'CÂMERA-PRIVADA' } };
  const restrito = { ...documento, id: 'seguranca', registro: { ...documento.registro, ativoIds: ['cam'], nome: 'TÍTULO-SEGURANÇA-PRIVADO' } };
  const a = ambiente(['documentos'], [empresa, pessoa, documento, pessoal, legado, cam, restrito]);
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.eventos.map(e => e.documentoId), [documento.id]);
  assert.doesNotMatch(JSON.stringify(r.body), /PRIVAD[OA]|"titulares"|"ativoIds"/);
  assert.deepEqual(a.consultas.filter(q => q.campos.includes('nome:')).flatMap(q => q.ids), [documento.id]);
  const completo = await ambiente(['documentos', 'documentos-pessoais', 'seguranca'], [empresa, pessoa, documento, pessoal, legado, cam, restrito]).chamar();
  assert.equal(completo.body.eventos.length, 4);
});

test('porta recusa calendário sem Documentos, sessão inválida/revogada e segredo ausente antes de ler', async () => {
  for (const [perms, opcoes, status] of [
    [[], {}, 403], [['calendario-empresa'], {}, 403], [['documentos-pessoais'], {}, 403],
    [['documentos'], { revogado: true }, 401], [['documentos'], { semSessao: true }, 401], [['documentos'], { semSegredo: true }, 503],
  ]) {
    const a = ambiente(perms, undefined, opcoes);
    assert.equal((await a.chamar()).status, status);
    assert.equal(a.consultas.length, 0);
  }
  assert.equal((await ambiente(['*']).chamar()).status, 200);
  assert.equal((await ambiente([], undefined, { master: true }).chamar()).status, 200);
});

test('paginação de titulares e controles supera 500, com títulos em lotes completos de até 200', async () => {
  const linhas = Array.from({ length: 501 }, (_, i) => ({ ...documento, id: `doc-${String(i).padStart(3, '0')}` }));
  const titulares = Array.from({ length: 501 }, (_, i) => ({ ...empresa, id: i === 0 ? empresa.id : `empresa-${i}` }));
  const a = ambiente(['documentos'], [...titulares, ...linhas]);
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.equal(r.body.eventos.length, 501);
  assert.equal(a.consultas.filter(q => q.campos === 'id,tipo:registro->>tipo').length, 2);
  assert.equal(a.consultas.filter(q => q.campos.includes('titularId:') && !q.campos.includes('nome:')).length, 2);
  assert.deepEqual(a.consultas.filter(q => q.campos.includes('nome:')).map(q => q.ids.length), [200, 200, 101]);
});

test('consulta fechada e resposta sem anexos, financeiro, NF, contatos ou nomes de titulares', async () => {
  const privado = { ...documento, registro: { ...documento.registro, arquivo: 'ANEXO-PRIVADO', valor: 98765, nf: 'NF-PRIVADA', versoes: ['VERSAO-PRIVADA'], contato: { nome: 'CONTATO-PRIVADO' } } };
  const a = ambiente(['documentos'], [empresa, pessoa, privado]);
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.doesNotMatch(JSON.stringify(r.body), /PRIVAD[OA]|98765/);
  assert.ok(a.consultas.every(q => !/arquivo|valor|nf|contato|pessoaId/.test(q.campos)));
  assert.ok(a.consultas.every(q => !q.campos.split(',').includes('registro')));
  assert.equal(a.consultas[0].campos, 'id,tipo:registro->>tipo');
});

test('erro em qualquer etapa e teto de paginação falham sem retornar calendário parcial', async () => {
  for (const falha of [q => q.campos === 'id,tipo:registro->>tipo', q => q.campos.includes('titularId:') && !q.campos.includes('nome:'), q => q.campos.includes('nome:')]) {
    const r = await ambiente(['documentos'], undefined, { falha }).chamar();
    assert.equal(r.status, 500);
    assert.equal(r.body.eventos, undefined);
    assert.doesNotMatch(JSON.stringify(r.body), /confidencial|painel_registros/);
  }
  const r = await ambiente(['documentos'], undefined, { paginaInfinita: true }).chamar();
  assert.equal(r.status, 500);
  assert.equal(r.body.eventos, undefined);
});

test('página de títulos incompleta e índice nulo não viram calendário parcial ou vazio', async () => {
  for (const alterarSaida of [
    (q, data) => q.campos.includes('nome:') ? [] : data,
    (q, data) => q.campos === 'id,tipo:registro->>tipo' ? null : data,
  ]) {
    const r = await ambiente(['documentos'], undefined, { alterarSaida }).chamar();
    assert.equal(r.status, 500);
    assert.equal(r.body.eventos, undefined);
  }
});

test('rechecagem fecha resposta se titular ou origem mudar durante a consulta do prazo', async () => {
  for (const patch of [{ titularId: pessoa.id }, { pessoalHistorico: true }, { versoes: [{ snapshot: { titularId: pessoa.id } }] }, { ativoIds: ['não-confirmado'] }, { origemTipo: 'seguranca' }]) {
    const a = ambiente(['documentos'], undefined, { alterarSaida: (q, data) => q.campos.includes('nome:') ? data.map(item => ({ ...item, ...patch })) : data });
    const r = await a.chamar();
    assert.equal(r.status, 200);
    assert.equal(r.body.eventos.length, 0);
  }
});

test('histórico pessoal permanece protegido mesmo com titular empresa atual, antes de consultar título', async () => {
  const historico = { ...documento, registro: { ...documento.registro, pessoalHistorico: true, nome: 'HISTÓRICO-PESSOAL-PRIVADO' } };
  const a = ambiente(['documentos'], [empresa, pessoa, historico]);
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.equal(r.body.eventos.length, 0);
  assert.equal(a.consultas.some(q => q.campos.includes('nome:')), false);
  assert.equal((await ambiente(['documentos', 'documentos-pessoais'], [empresa, pessoa, historico]).chamar()).body.eventos.length, 1);
});

test('snapshots PF sem flag bloqueiam título; versões são descartadas e nunca entram no evento', async () => {
  const snapshot = { ...documento, registro: { ...documento.registro, nome: 'TÍTULO-PF-PRIVADO', versoes: [{ snapshot: { titularId: pessoa.id, nome: 'SNAPSHOT-PRIVADO', valor: 98765, contato: { nome: 'CONTATO-PRIVADO' } }, arquivo: { caminho: 'ANEXO-PRIVADO' } }] } };
  const a = ambiente(['documentos'], [empresa, pessoa, snapshot]);
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.equal(r.body.eventos.length, 0);
  assert.equal(a.consultas.some(q => q.campos.includes('nome:')), false);
  const autorizado = await ambiente(['documentos', 'documentos-pessoais'], [empresa, pessoa, snapshot]).chamar();
  assert.equal(autorizado.body.eventos.length, 1);
  assert.doesNotMatch(JSON.stringify(autorizado.body), /snapshot|versoes|titularHistoricoIds|98765|CONTATO-PRIVADO|ANEXO-PRIVADO|SNAPSHOT-PRIVADO/);
});

test('prazos antigos de veículo e máquina são projeções documentais com dados mínimos, sem migrar', async () => {
  const veiculo = { colecao: 'ativo', id: 'veiculo-antigo', registro: { tipo: 'veiculo', nome: 'Veículo fictício', validade: '2026-10-21', arquivoNome: 'ARQUIVO-PRIVADO', valor: 97531, nf: 'NF-PRIVADA' } };
  const maquina = { ...veiculo, id: 'maquina-antiga', registro: { ...veiculo.registro, tipo: 'maquina', nome: 'Máquina fictícia' } };
  const baixado = { ...veiculo, id: 'baixado', registro: { ...veiculo.registro, especificacao: { situacao: 'baixado' } } };
  const semData = { ...veiculo, id: 'sem-data', registro: { ...veiculo.registro, validade: '' } };
  const a = ambiente(['documentos'], [empresa, pessoa, veiculo, maquina, baixado, semData]);
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.eventos.map(e => e.ativoId).sort(), ['maquina-antiga', 'veiculo-antigo']);
  assert.ok(r.body.eventos.every(e => e.origem === 'legadoBem' && e.tipo === 'Documentos'));
  assert.doesNotMatch(JSON.stringify(r.body), /ARQUIVO-PRIVADO|NF-PRIVADA|97531|baixado|sem-data/);
  assert.ok(a.consultas.every(q => !/arquivo|valor|nf/.test(q.campos)));
});

test('AVCB canônico aparece só com permissão da origem e mesmo evento da porta Patrimônio', async () => {
  const avcb = { colecao: 'ativo', id: 'avcb-exemplo', registro: { tipo: 'predial', categoria: 'AVCB', nome: 'Estabelecimento fictício', validade: '2026-10-21' } };
  const linhas = [empresa, documento, avcb];
  const semOrigem = ambiente(['documentos'], linhas);
  assert.equal((await semOrigem.chamar()).body.eventos.length, 1);
  assert.equal(semOrigem.consultas.filter(q => q.campos.includes('nome:')).flatMap(q => q.ids).includes(avcb.id), false);
  for (const permissao of ['patrimonio', 'inventario-valores']) {
    const a = ambiente(['documentos', permissao], linhas);
    const documentos = await a.chamar();
    const patrimonio = await a.chamar({ action: 'patrimonio', mes: '2026-10' });
    assert.equal(documentos.status, 200);
    assert.equal(documentos.body.eventos.length, 2);
    assert.deepEqual(documentos.body.eventos.find(e => e.ativoId === avcb.id), patrimonio.body.eventos[0]);
  }
});

test('AVCB PF e histórico PF não revelam título nem pela porta Documentos nem pela porta Patrimônio', async () => {
  for (const patch of [{ titularId: pessoa.id }, { titularId: empresa.id, pessoalHistorico: true }, { titularId: empresa.id, versoes: [{ snapshot: { titularId: pessoa.id } }] }]) {
    const avcb = { colecao: 'ativo', id: 'avcb-pessoal', registro: { tipo: 'predial', categoria: 'AVCB', nome: 'AVCB-PESSOAL-PRIVADO', validade: '2026-10-21', ...patch } };
    for (const action of ['documentos', 'patrimonio']) {
      const a = ambiente(['documentos', 'patrimonio'], [empresa, pessoa, avcb]);
      const r = await a.chamar({ action, mes: '2026-10' });
      assert.equal(r.status, 200);
      assert.equal(r.body.eventos.length, 0);
      assert.equal(a.consultas.some(q => q.campos.includes('nome:')), false);
      const completo = await ambiente(['documentos', 'documentos-pessoais', 'patrimonio'], [empresa, pessoa, avcb]).chamar({ action, mes: '2026-10' });
      assert.equal(completo.body.eventos.length, 1);
    }
  }
});

test('endpoint continua somente leitura, valida método, mês e ação', async () => {
  const a = ambiente();
  assert.equal((await a.chamar({ action: 'documentos', mes: '2026-13' })).status, 400);
  assert.equal((await a.chamar({ action: 'salvarDocumento', mes: '2026-10' })).status, 400);
  assert.equal((await a.chamar({}, 'GET')).status, 405);
  assert.equal(a.consultas.length, 0);
});
