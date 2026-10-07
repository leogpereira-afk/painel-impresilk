import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executarCargaComercial, validarCargaComercial, mesclarOrcamentosComerciais } from '../scripts/lib/carga-comercial.mjs';

const agora = () => '2026-10-07T18:00:00.000Z';
const venda = (id = 'v1', extra = {}) => ({ id, cliente_id: 'c1', cliente: 'Loja', vendedor: 'Ana', tipo: 'Normal', data_cadastro: '2020-06-01', valor_total: '100.00', valor_desconto: '10.00', status: 'ABERTO', itens: [{ item: 'Lona', quantidade: 1, valor_final: 100 }], ...extra });
function ambiente(respostas = {}) {
  const gravacoes = [], leituras = [], tabelas = new Map();
  const valores = { orcamentos: [{ id: 'anterior', dataCadastro: '2019-01-01', situacao: 'aberto', valor: 50 }] };
  const deps = { agora, async getTudo(caminho, query, pagina) {
    leituras.push({ caminho, query, pagina });
    const val = respostas[caminho] ?? [venda()];
    if (val instanceof Error) throw val;
    return typeof val === 'function' ? val(query) : val;
  }, async cache(body) {
    gravacoes.push(structuredClone(body));
    if (body.action === 'ler') return { valor: valores[body.chave] ?? null };
    if (body.action === 'ordens') { for (const o of body.linhas) tabelas.set(o.id, o); return { gravadas: body.linhas.length }; }
    if (body.action === 'ordensComercialCanceladas') return { marcadas: body.ids.length };
    valores[body.chave] = structuredClone(body.valor); return { ok: true };
  } };
  return { deps, valores, gravacoes, leituras, tabelas };
}

test('janela exige datas reais e não consulta futuro nem recurso desconhecido', () => {
  for (const dados of [{ desde: '2020-02-30', ate: '2020-03-01' }, { desde: '2020-01-01', ate: '2026-10-08' }, { desde: '2021-01-01', ate: '2020-01-01' }, { desde: '2020-01-01', ate: '2020-12-31', recurso: 'pagar' }]) assert.throws(() => validarCargaComercial(dados, '2026-10-07'));
});
test('O.S. usa consulta paginada inclusiva e escreve apenas tabela sem itens, cache recente ou financeiro', async () => {
  const t = ambiente({ 'ordem-servico': [venda('v1', { valor_sinal: '25.00' })] });
  await executarCargaComercial({ desde: '2020-01-01', ate: '2020-12-31', recurso: 'ordens' }, t.deps);
  assert.deepEqual(t.leituras, [{ caminho: 'ordem-servico', query: { status: 'TODOS', filtrodata: 'CADASTRO', datainicial: '2020-01-01', datafinal: '2021-01-01' }, pagina: 100 }]);
  const o = t.tabelas.get('v1'); assert.equal(o.valor, 90); assert.equal(o.bruto, 100); assert.equal(o.desconto, 10); assert.equal(o.itens, undefined);
  assert.deepEqual(o.comercial, { tipo: 'Normal', clienteId: 'c1', valorConfirmado: true, cancelada: false, sinalPago: 25 });
  assert.equal(t.gravacoes.some((x) => ['ordens', 'status', 'historico_status', 'recebiveis', 'pagar'].includes(x.chave)), false);
  const st = t.valores.comercial_carga_status; assert.equal(st.tentativa.estado, 'concluida'); assert.equal(st.janelas.ordens.length, 1); assert.equal(st.janelas.ordens[0].ate, '2020-12-31'); assert.equal(st.janelas.orcamentos.length, 0); assert.equal(st.completo, undefined);
});
test('orçamentos mesclam por ID, guardam status oficial e preservam outros períodos', async () => {
  const t = ambiente({ orcamento: [venda('nova', { status: 'NOVO_STATUS' })] });
  await executarCargaComercial({ desde: '2020-01-01', ate: '2020-12-31', recurso: 'orcamentos' }, t.deps);
  assert.equal(t.valores.orcamentos.length, 2); assert.equal(t.valores.orcamentos[0].id, 'anterior'); assert.equal(t.valores.orcamentos[1].statusErp, 'NOVO_STATUS'); assert.equal(t.valores.orcamentos[1].situacao, 'conferir');
  assert.equal(t.valores.comercial_carga_status.janelas.ordens.length, 0);
  assert.throws(() => mesclarOrcamentosComerciais(null, []), /base inteira/);
});
test('fatia de orçamento não inicializa base parcial quando o cache está ausente', async () => {
  const t = ambiente(); t.valores.orcamentos = null;
  await assert.rejects(executarCargaComercial({ desde: '2020-01-01', ate: '2020-12-31', recurso: 'orcamentos' }, t.deps), /base inteira/);
  assert.equal(t.valores.comercial_carga_status.janelas.orcamentos.length, 0);
});
test('fonte vazia, erro ou resposta inválida não confirma cobertura nem altera valores anteriores', async () => {
  for (const resposta of [[], new Error('HTTP 500'), [venda('', {})], [venda('v', { data_cadastro: '' })], [venda('v', { valor_total: null })]]) {
    const t = ambiente({ 'ordem-servico': resposta });
    await assert.rejects(executarCargaComercial({ desde: '2020-01-01', ate: '2020-12-31', recurso: 'ordens' }, t.deps));
    assert.equal(t.tabelas.size, 0); assert.equal(t.valores.comercial_carga_status.tentativa.estado, 'falhou'); assert.equal(t.valores.comercial_carga_status.janelas.ordens.length, 0);
  }
});
test('canceladas só recebem marcação de metadados; nunca exclusão ou reinserção', async () => {
  const t = ambiente({ 'ordem-servico': [venda(), venda('canc', { status: 'CANCELADO' })] });
  await executarCargaComercial({ desde: '2020-01-01', ate: '2020-12-31', recurso: 'ordens' }, t.deps);
  assert.equal(t.tabelas.has('canc'), false); assert.deepEqual(t.gravacoes.find((x) => x.action === 'ordensComercialCanceladas').ids, ['canc']);
  assert.equal(t.gravacoes.some((x) => x.action === 'ordensApagar'), false); assert.equal(t.valores.comercial_carga_status.janelas.ordens[0].canceladas, 1);
});
test('limita datas à janela mesmo se a API incluir meia-noite do dia seguinte', async () => {
  const t = ambiente({ 'ordem-servico': [venda(), venda('fora', { data_cadastro: '2021-01-01' })] });
  await executarCargaComercial({ desde: '2020-01-01', ate: '2020-12-31', recurso: 'ordens' }, t.deps);
  assert.equal(t.tabelas.has('fora'), false); assert.equal(t.valores.comercial_carga_status.janelas.ordens[0].registros, 1);
});
test('falha no segundo ano mantém somente a janela realmente gravada e não inventa continuidade', async () => {
  const t = ambiente({ 'ordem-servico': (q) => { if (q.datainicial.startsWith('2020')) throw new Error('ERP indisponível'); return [venda('2021', { data_cadastro: '2021-03-01' })]; } });
  await assert.rejects(executarCargaComercial({ desde: '2020-01-01', ate: '2021-12-31', recurso: 'ordens' }, t.deps));
  const st = t.valores.comercial_carga_status; assert.equal(st.janelas.ordens.length, 1); assert.equal(st.janelas.ordens[0].desde, '2021-01-01'); assert.equal(st.tentativa.estado, 'falhou');
});
test('reexecução é idempotente e gravação parcial não recebe comprovante de cobertura', async () => {
  const t = ambiente(); const op = { desde: '2020-01-01', ate: '2020-12-31', recurso: 'ordens' };
  await executarCargaComercial(op, t.deps); await executarCargaComercial(op, t.deps); assert.equal(t.valores.comercial_carga_status.janelas.ordens.length, 1); assert.equal(t.tabelas.size, 1);
  const u = ambiente(), original = u.deps.cache; u.deps.cache = (body) => body.action === 'ordens' ? Promise.resolve({ gravadas: 0 }) : original(body);
  await assert.rejects(executarCargaComercial(op, u.deps), /gravação incompleta/); assert.equal(u.valores.comercial_carga_status.janelas.ordens.length, 0);
});
