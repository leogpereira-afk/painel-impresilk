import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentoAgendaPermitido, incendioAgendaPermitido, vencimentosDocumentos, combinarEventosCalendario, destinoEventoCalendario } from '../supabase/functions/_shared/documentos-agenda.mjs';
import { vencimentosIncendio } from '../supabase/functions/_shared/patrimonio-incendio.mjs';

const titulares = [{ id: 'empresa-exemplo', tipo: 'empresa' }, { id: 'pessoa-exemplo', tipo: 'pessoa' }];
const sessao = (...perms) => ({ perms });
const item = { id: 'documento-exemplo', tipo: 'documento', titularId: 'empresa-exemplo', nome: 'Certificado fictício', validade: '2026-10-20', estado: 'ativo' };
const eventos = (itens = [item], s = sessao('documentos'), mes = '2026-10', bens = []) => vencimentosDocumentos(itens, titulares, s, mes, bens);

test('documentos empresariais e pessoais exigem suas permissões inclusive título', () => {
  const pessoal = { ...item, id: 'pessoal', titularId: 'pessoa-exemplo', nome: 'TÍTULO-PRIVADO' };
  assert.equal(eventos([item, pessoal], sessao('calendario-empresa')).length, 0);
  assert.deepEqual(eventos([item, pessoal]).map(e => e.documentoId), [item.id]);
  assert.doesNotMatch(JSON.stringify(eventos([item, pessoal])), /TÍTULO-PRIVADO|pessoal/);
  assert.equal(eventos([item, pessoal], sessao('documentos', 'documentos-pessoais')).length, 2);
  assert.equal(eventos([pessoal], sessao('documentos-pessoais')).length, 0);
  assert.equal(eventos([pessoal], { master: true }).length, 1);
  assert.equal(eventos([pessoal], sessao('*')).length, 1);
});

test('titular ausente, inválido e desconhecido conserva proteção pessoal', () => {
  for (const titularId of [undefined, '', 'não-existe']) {
    const legado = { ...item, titularId };
    assert.equal(eventos([legado]).length, 0);
    assert.equal(eventos([legado], sessao('documentos', 'documentos-pessoais')).length, 1);
  }
  assert.equal(vencimentosDocumentos([item], [{ id: item.titularId, tipo: 'desconhecido' }], sessao('documentos'), '2026-10').length, 0);
});

test('classificação empresarial atual não libera controle com histórico pessoal', () => {
  for (const pessoalHistorico of [true, 'true']) {
    const historico = { ...item, pessoalHistorico };
    assert.equal(eventos([historico]).length, 0);
    assert.equal(eventos([historico], sessao('documentos', 'documentos-pessoais')).length, 1);
  }
  const semFlag = { ...item, versoes: [{ snapshot: { titularId: 'pessoa-exemplo', valor: 98765 }, arquivo: { caminho: 'ANEXO-PRIVADO' } }] };
  assert.equal(eventos([semFlag]).length, 0);
  const liberado = eventos([semFlag], sessao('documentos', 'documentos-pessoais'));
  assert.equal(liberado.length, 1);
  assert.doesNotMatch(JSON.stringify(liberado), /snapshot|versoes|titularHistoricoIds|98765|ANEXO-PRIVADO/);
});

test('controles sem prazo, encerrados, cancelados ou com datas inválidas não geram eventos', () => {
  for (const semVencimento of [true, 'true']) assert.equal(eventos([{ ...item, semVencimento }]).length, 0);
  for (const estado of ['cancelado', 'encerrado', 'suspenso', 'inativo', 'renovado', 'desconhecido']) assert.equal(eventos([{ ...item, estado }]).length, 0);
  for (const validade of ['', '2026-02-29', '2026-10-32', '0000-10-20', '2026-11-20']) assert.equal(eventos([{ ...item, validade }]).length, 0);
  assert.equal(eventos([item], sessao('documentos'), '2026-13').length, 0);
  for (const estado of [undefined, '', 'ativo', 'renovacao', 'em_vigor']) assert.equal(eventos([{ ...item, estado, semVencimento: false }]).length, 1);
});

test('renovação muda a data da projeção mantendo o mesmo ID e nenhuma cópia de evento', () => {
  const antigo = eventos()[0];
  const renovado = { ...item, validade: '2026-11-05' };
  assert.equal(eventos([renovado]).length, 0);
  const novo = eventos([renovado], sessao('documentos'), '2026-11')[0];
  assert.equal(novo.id, antigo.id);
  assert.equal(novo.id, `doc:${item.id}:vencimento`);
  assert.equal(novo.data, '2026-11-05');
  assert.equal(item.validade, '2026-10-20');
});

test('cada tipo de controle apresenta rota de origem e só campos mínimos', () => {
  for (const tipo of ['documento', 'seguro', 'garantia']) {
    const resultado = eventos([{ ...item, tipo, arquivo: 'ARQUIVO-PRIVADO', versoes: ['VERSAO-PRIVADA'], valor: 98765, nf: 'NOTA-PRIVADA', contato: { nome: 'CONTATO-PRIVADO' } }])[0];
    assert.equal(resultado.origem, 'documentos');
    assert.equal(resultado.documentoId, item.id);
    assert.equal(resultado.tipoDocumento, tipo);
    assert.deepEqual(Object.keys(resultado).sort(), ['cor', 'data', 'documentoId', 'id', 'origem', 'tipo', 'tipoDocumento', 'titulo'].sort());
    assert.doesNotMatch(JSON.stringify(resultado), /ARQUIVO-PRIVADO|VERSAO-PRIVADA|98765|NOTA-PRIVADA|CONTATO-PRIVADO/);
  }
});

test('origem Segurança e referências ausentes exigem Segurança sem expor seus títulos', () => {
  const bens = [{ id: 'cam', tipo: 'seguranca' }, { id: 'car', tipo: 'veiculo' }];
  for (const patch of [{ ativoIds: ['cam'] }, { ativoIds: ['retirado'] }, { origem: 'seguranca' }, { origemTipo: 'seguranca' }]) {
    assert.equal(eventos([{ ...item, ...patch }], sessao('documentos'), '2026-10', bens).length, 0);
    assert.equal(eventos([{ ...item, ...patch }], sessao('documentos', 'seguranca'), '2026-10', bens).length, 1);
  }
  assert.equal(documentoAgendaPermitido({ ...item, ativoIds: ['car'] }, titulares, sessao('documentos'), bens), true);
});

test('AVCB preserva identidade do Patrimônio, permissão da origem e não duplica no calendário', () => {
  const avcb = { id: 'avcb-exemplo', tipo: 'predial', categoria: 'AVCB', nome: 'Estabelecimento fictício', validade: item.validade };
  assert.equal(eventos([avcb]).length, 0);
  const patrimonio = vencimentosIncendio([avcb], '2026-10');
  const documentos = eventos([avcb], sessao('documentos', 'patrimonio'));
  assert.deepEqual(documentos, patrimonio);
  assert.equal(eventos([avcb], sessao('documentos', 'inventario-valores')).length, 1);
  assert.equal(eventos([{ ...avcb, situacao: 'baixado' }], sessao('documentos', 'patrimonio')).length, 0);
  assert.deepEqual(combinarEventosCalendario([patrimonio, documentos], '2026-10'), patrimonio);
});

test('AVCB classificado como pessoal ou com histórico PF não passa por nenhuma fonte sem acesso pessoal', () => {
  const base = { id: 'avcb-exemplo', tipo: 'predial', categoria: 'AVCB', nome: 'AVCB pessoal fictício', validade: item.validade };
  for (const patch of [{ titularId: 'pessoa-exemplo' }, { titularId: 'empresa-exemplo', pessoalHistorico: true }, { titularId: 'empresa-exemplo', versoes: [{ snapshot: { titularId: 'pessoa-exemplo' } }] }]) {
    const avcb = { ...base, ...patch };
    assert.equal(eventos([avcb], sessao('documentos', 'patrimonio')).length, 0);
    assert.equal(incendioAgendaPermitido(avcb, titulares, sessao('patrimonio')), false);
    assert.equal(incendioAgendaPermitido(avcb, titulares, sessao('patrimonio', 'documentos-pessoais')), false);
    assert.equal(eventos([avcb], sessao('documentos', 'documentos-pessoais', 'patrimonio')).length, 1);
  }
  assert.equal(eventos([base], sessao('documentos', 'patrimonio')).length, 1, 'AVCB predial sem titular conserva origem permitida');
});

test('veículo e máquina legados conservam prazo e ID, excluem baixados e não expõem arquivos ou ficha', () => {
  const legado = { id: 'ficha / fictícia', tipo: 'veiculo', nome: 'Bem fictício', validade: item.validade, valor: 123456, nf: 'NF-PRIVADA', arquivoNome: 'ANEXO-PRIVADO', medidorAtual: 5000 };
  for (const tipo of ['veiculo', 'maquina']) {
    const r = eventos([{ ...legado, tipo }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].id, `bem:${legado.id}:documento-legado`);
    assert.equal(r[0].ativoId, legado.id);
    assert.equal(r[0].tipoBem, tipo);
    assert.equal(r[0].origem, 'legadoBem');
    assert.equal(r[0].tipo, 'Documentos');
    assert.doesNotMatch(JSON.stringify(r), /123456|NF-PRIVADA|ANEXO-PRIVADO|5000/);
    assert.match(destinoEventoCalendario(r[0], '2026-10'), tipo === 'veiculo' ? /^\/documentos\?aba=veiculo&item=/ : /^\/documentos\?aba=maquina&bem=/);
    assert.match(destinoEventoCalendario(r[0], '2026-10'), /ficha%20%2F%20fict%C3%ADcia/);
    assert.equal(eventos([{ ...legado, tipo, situacao: 'baixado' }]).length, 0);
    assert.equal(eventos([{ ...legado, tipo, validade: '' }]).length, 0);
    assert.equal(eventos([{ ...legado, tipo, titularId: 'pessoa-exemplo' }]).length, 0);
    const atualizado = eventos([{ ...legado, tipo, validade: '2026-11-20' }], sessao('documentos'), '2026-11');
    assert.equal(atualizado[0].id, r[0].id);
  }
});

test('destinos dos controles, AVCB e fontes anteriores preservam seus identificadores', () => {
  assert.equal(destinoEventoCalendario(eventos()[0], '2026-10'), '/documentos?item=documento-exemplo&aba=documento');
  assert.equal(destinoEventoCalendario({ origem: 'patrimonio', ativoId: 'avcb-ficticio' }, '2026-10'), '/patrimonio?aba=incendio&item=avcb-ficticio');
  assert.equal(destinoEventoCalendario({ processoId: 'processo', tipoProcesso: 'consultoria' }, '2026-10'), '/consultorias?processo=processo&mes=2026-10');
  assert.equal(destinoEventoCalendario({ reuniaoId: 'encontro' }, '2026-10'), '/reunioes?encontro=encontro&mes=2026-10');
});

test('combinação mantém IDs originais, ordena fontes e evita duplicatas em grade e lista', () => {
  const a = { id: 'rh-original', data: '2026-10-20', titulo: 'A', hora: '10:00' };
  const b = { id: 'reuniao-original', data: '2026-10-20', titulo: 'B', hora: '09:00' };
  assert.deepEqual(combinarEventosCalendario([[a], [b], [a], [{ id: 'outro-mes', data: '2026-11-01' }], [null, { id: 'ruim' }]], '2026-10'), [b, a]);
});
