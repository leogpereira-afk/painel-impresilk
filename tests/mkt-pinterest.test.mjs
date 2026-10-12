// O conector do Pinterest (supabase/functions/_shared/mkt-fontes/pinterest.mjs)
// rodando de verdade contra um Pinterest de mentira: um ctx.fetchJson que
// responde pela rota, como a API v5 responderia, e um ctx.fetch de mentira para
// a renovação do token (que passa pelo renovar de verdade do mkt-oauth.mjs).
// Nenhuma chamada de rede, nenhuma credencial real. As respostas vêm de
// tests/fixtures/mkt-pinterest: as "doc-*" são os exemplos da documentação
// copiados da pesquisa; as outras são fictícias, de uma conta inventada.
//
// A API de mentira é exigente como a de verdade quer ser: recusa (400)
// métrica fora da lista confirmada da conta, mistura de métrica de vídeo com
// métrica de Pin comum, e o engagement_window_days descontinuado.
//
// Começa pelos casos ruins.
//   node --test tests/mkt-pinterest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../supabase/functions/_shared/mkt-fontes/pinterest.mjs';
import { prepararSemanas, prepararPublicacoes, normalizarResultado } from '../supabase/functions/_shared/mkt-fontes/coletora.mjs';
import { normalizarLink, somarDias } from '../supabase/functions/_shared/marketing.mjs';

// Fuso bem longe de São Paulo e de UTC: data lida na hora local do servidor
// (o created_at do Pin vem sem fuso) apareceria como dia errado.
process.env.TZ = 'Asia/Tokyo';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/mkt-pinterest/${n}.json`, import.meta.url), 'utf8'));
const DIA = 86_400_000;
const TRAVESSAO = /[\u2013\u2014]/;

// Valores fictícios, só para provar que nunca aparecem fora do cofre.
const TOKEN = 'tk-ficticio-AAAA-pina', REFRESH = 'rf-ficticio-CCCC-pinr';
const ENV = { PINTEREST_CLIENT_ID: 'id-ficticio-pinterest', PINTEREST_CLIENT_SECRET: 'segredo-ficticio-pinterest' };
const HOJE = '2026-10-14'; // quarta: a semana atual começa em 2026-10-12
const SEGUNDAS = ['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31', '2026-08-24', '2026-08-17'];
const ESCOPOS = ['user_accounts:read', 'pins:read', 'boards:read', 'ads:read'];
const CANAIS = [
  { codigo: 'pinterest', url_perfil: 'https://br.pinterest.com/empresa_exemplo/' },
  { codigo: 'site', url_perfil: 'https://www.impresilk.com.br' },
];
const A = '1000000000000000001', B = '1000000000000000002', C = '1000000000000000003', D = '1000000000000000004', E = '1000000000000000005', G = '1000000000000000077';
const VIDEOS = new Set([B]);
const conexao = (extra = {}) => ({
  access_token: TOKEN, refresh_token: REFRESH,
  expira_em: new Date(Date.now() + 20 * DIA).toISOString(), refresh_expira_em: new Date(Date.now() + 50 * DIA).toISOString(),
  escopos: ESCOPOS, conta: 'Empresa Exemplo', conectado_por: 'leo', conectado_em: '2026-10-01T12:00:00Z', ...extra,
});

// O erro como a coletora lança (ErroFonte): código curto, status e o corpo
// de erro do provedor (que o conector nunca repassa).
class Falha { constructor(status, corpo = null) { this.status = status; this.corpo = corpo; } }
const falha = (s, c = null) => new Falha(s, c);
function erroDaColetora(f) {
  const codigo = f.status === 401 || f.status === 403 ? 'nao_autorizado' : f.status === 429 ? 'limite' : f.status >= 500 ? 'servidor' : 'http';
  return Object.assign(new Error(`pinterest: ${codigo} (HTTP ${f.status})`), { name: 'ErroFonte', codigo, status: f.status, corpo: f.corpo });
}

// ------------------------------------------------ a API de mentira --

const dias = (de, ate) => { const f = []; for (let d = de; d <= ate; d = somarDias(d, 1)) f.push(d); return f; };
const statusPadrao = (hoje) => (dia) => (dia >= somarDias(hoje, -2) ? 'ESTIMATE' : 'READY');
const CONTA = {
  ALL: { IMPRESSION: 100, ENGAGEMENT: 10, PIN_CLICK: 4, OUTBOUND_CLICK: 3, SAVE: 2 },
  ORGANIC: { IMPRESSION: 80, ENGAGEMENT: 8, PIN_CLICK: 3, OUTBOUND_CLICK: 2, SAVE: 2 },
  PAID: { IMPRESSION: 20, ENGAGEMENT: 2, PIN_CLICK: 1, OUTBOUND_CLICK: 1, SAVE: 0 },
};
const valorConta = (base, m) => (m.endsWith('_RATE') ? base[m.replace('_RATE', '')] / base.IMPRESSION : base[m]);
const SPLITS = { APP_TYPE: ['MOBILE', 'WEB', 'TABLET'], SOURCE: ['YOUR_PINS', 'OTHER_PINS'], PIN_FORMAT: ['ORGANIC_IMAGE', 'ORGANIC_VIDEO'], OWNED_CONTENT: ['OWNED', 'NOT_OWNED'] };

function serieConta(url, { hoje, status, recusar = [] }) {
  const q = new URL(url).searchParams;
  const metricas = (q.get('metric_types') || '').split(',').filter(Boolean);
  if (!metricas.length || metricas.some((m) => !P.METRICAS_CONTA.includes(m) || recusar.includes(m))) return falha(400, fx('erro-400-metrica'));
  const base = CONTA[q.get('content_type') || 'ALL'];
  const soma = (m) => (m.endsWith('_RATE') ? valorConta(base, m) : base[m] * dias(q.get('start_date'), q.get('end_date')).length);
  const summary_metrics = Object.fromEntries(metricas.map((m) => [m, soma(m)]));
  if (q.get('split_field')) return Object.fromEntries(SPLITS[q.get('split_field')].map((g) => [g, { summary_metrics }]));
  const st = status || statusPadrao(hoje);
  const daily_metrics = dias(q.get('start_date'), q.get('end_date')).map((d) => ({ date: d, data_status: st(d), metrics: Object.fromEntries(metricas.map((m) => [m, valorConta(base, m)])) }));
  // A chave do grupo sem split não é confirmada: aqui, "all" minúsculo.
  return { all: { daily_metrics, summary_metrics } };
}

const PIN_VALOR = { IMPRESSION: 10, OUTBOUND_CLICK: 1, PIN_CLICK: 2, SAVE: 1, SAVE_RATE: 0.1, USER_FOLLOW: 1, PROFILE_VISIT: 1, TOTAL_COMMENTS: 0, TOTAL_REACTIONS: 1 };
function seriePin(url, { hoje }) {
  const u = new URL(url), id = u.pathname.split('/')[3];
  const metricas = (u.searchParams.get('metric_types') || '').split(',').filter(Boolean);
  const video = VIDEOS.has(id);
  // As duas listas da especificação: vídeo sem USER_FOLLOW e PROFILE_VISIT;
  // Pin comum sem as de vídeo.
  if (!metricas.length) return falha(400, fx('erro-400-metrica'));
  if (video && metricas.some((m) => !P.METRICAS_PIN_VIDEO.includes(m))) return falha(400, fx('erro-400-metrica'));
  if (!video && metricas.some((m) => !P.METRICAS_PIN.includes(m))) return falha(400, fx('erro-400-metrica'));
  const v = (m) => PIN_VALOR[m] ?? 5;
  const st = statusPadrao(hoje);
  const ds = dias(u.searchParams.get('start_date'), u.searchParams.get('end_date'));
  return {
    ALL: {
      daily_metrics: ds.map((d) => ({ date: d, data_status: st(d), metrics: Object.fromEntries(metricas.map((m) => [m, v(m)])) })),
      summary_metrics: Object.fromEntries(metricas.map((m) => [m, m.endsWith('_RATE') ? v(m) : v(m) * ds.length])),
      lifetime_metrics: { TOTAL_COMMENTS: 4, TOTAL_REACTIONS: 9 },
    },
  };
}

function anunciosPorDia(url) {
  const q = new URL(url).searchParams;
  if (q.has('engagement_window_days')) return falha(400, fx('erro-400-metrica'));
  const de = q.get('start_date'), ate = q.get('end_date');
  return fx('anuncios-por-dia').filter((l) => l.DATE >= de && l.DATE <= ate);
}

/** A API de mentira: responde pela rota, como o Pinterest responderia. */
function respostaPadrao(url, op, info) {
  const u = new URL(url), p = u.pathname, q = u.searchParams;
  if (p === '/v5/user_account') return fx('user-account');
  if (p === '/v5/user_account/analytics') return serieConta(url, info);
  if (p === '/v5/user_account/analytics/top_pins') return fx('top-pins');
  if (p === '/v5/user_account/analytics/top_video_pins') return fx('top-video-pins');
  if (p === '/v5/pins') return q.get('domain') ? fx('pins-site') : q.get('bookmark') === 'bm-pagina-2' ? fx('pins-p2') : fx('pins-p1');
  if (/^\/v5\/pins\/\d+\/analytics$/.test(p)) return seriePin(url, info);
  if (p === '/v5/boards') return fx('boards');
  if (p === '/v5/ad_accounts') return fx('ad-accounts');
  if (p === '/v5/ad_accounts/549755885175/analytics') return anunciosPorDia(url);
  if (p === '/v5/ad_accounts/549755885175/campaigns') return fx('campanhas');
  if (p === '/v5/ad_accounts/549755885175/campaigns/analytics') return q.has('engagement_window_days') ? falha(400) : fx('campanhas-analise');
  if (p === '/v5/ad_accounts/549755885175/audience_insights') return q.get('audience_insight_type') === 'YOUR_TOTAL_AUDIENCE' ? fx('publico-total') : fx('publico-engajado');
  throw new Error('rota inesperada ' + p);
}

function montar({ responder = respostaPadrao, cx = conexao(), env = ENV, hoje = HOJE, canais = CANAIS, prazo, chamadasHoje, token, status, recusar } = {}) {
  const chamadas = [], logs = [], renovacoes = [];
  const info = { hoje, status, recusar };
  const ctx = {
    env: (n) => env[n] ?? null, conexao: cx, hoje, canais, log: (t) => logs.push(String(t)),
    prazo: prazo ? () => prazo(chamadas) : () => 100_000,
    async fetchJson(url, op = {}) {
      chamadas.push({ url, ...op });
      const r = await responder(url, op, info, chamadas);
      if (r instanceof Falha) throw erroDaColetora(r);
      return structuredClone(r);
    },
    // O fetch cru da coletora: aqui só a renovação do token passa por ele.
    async fetch(url, init = {}) {
      renovacoes.push({ url, ...init });
      if (!token) throw new Error('a renovação não devia acontecer');
      const { status: s = 200, corpo = {} } = typeof token === 'function' ? token() : token;
      return { ok: s >= 200 && s < 300, status: s, json: async () => structuredClone(corpo) };
    },
  };
  if (chamadasHoje !== undefined) ctx.chamadasHoje = chamadasHoje;
  return { ctx, chamadas, logs, renovacoes, rodar: () => P.coletar(ctx) };
}
const comFalha = (teste, resposta) => (url, op, info, ch) => (teste(url, ch) ? resposta : respostaPadrao(url, op, info));
const rota = (url) => new URL(url).pathname;
const contar = (chamadas, trecho) => chamadas.filter((c) => c.url.includes(trecho)).length;
const parametros = (url) => Object.fromEntries(new URL(url).searchParams);
// O que sai para a tela, o cache e o diário (a conexão vai só para o cofre).
const visivel = (r, logs) => JSON.stringify({ ...r, conexao: undefined }) + logs.join('\n');

// ------------------------------------------------- os casos ruins primeiro --

test('O CASO RUIM: sem os secrets do app é falta_configurar, sem nenhuma chamada', async () => {
  const t = montar({ env: { PINTEREST_CLIENT_ID: 'id-ficticio-pinterest' } }), r = await t.rodar();
  assert.equal(r.estado, 'falta_configurar');
  assert.equal(t.chamadas.length + t.renovacoes.length, 0);
  assert.match(r.avisos.join(' '), /PINTEREST_CLIENT_SECRET/);
  assert.deepEqual([r.semanas, r.publicacoes, r.partes, r.dados], [[], [], {}, {}]);
});

test('sem conexão no cofre é falta_conectar, sem chamada', async () => {
  for (const cx of [null, { conectado_por: 'leo' }, { access_token: '' }, 'texto']) {
    const t = montar({ cx }), r = await t.rodar();
    assert.equal(r.estado, 'falta_conectar');
    assert.equal(t.chamadas.length + t.renovacoes.length, 0);
  }
});

test('conexão sem user_accounts:read: reconectar antes de chamar', async () => {
  const t = montar({ cx: conexao({ escopos: ['pins:read', 'boards:read'] }) }), r = await t.rodar();
  assert.equal(r.estado, 'reconectar');
  assert.equal(t.chamadas.length, 0);
  assert.match(r.avisos.join(' '), /Reconectar/);
});

test('app sem Trial aprovado (401 código 3, "consumer type is not supported"): aguardando_aprovacao com UMA chamada', async () => {
  const t = montar({ responder: () => falha(401, fx('erro-401-consumer')) }), r = await t.rodar();
  assert.equal(r.estado, 'aguardando_aprovacao');
  assert.equal(t.chamadas.length, 1);
  assert.match(r.avisos.join(' '), /help\.pinterest\.com\/contact\?pinterest_api_and_developer_tools=api_access&origin=pbc/);
  // Não é token morto: não manda reconectar, e o texto do Pinterest não sai.
  assert.ok(!/Reconectar/.test(r.avisos.join(' ')));
  assert.ok(!/consumer type|Authentication failed/i.test(visivel(r, t.logs)));
  assert.deepEqual([r.semanas, r.publicacoes, r.partes], [[], [], {}]);
});

test('a mesma recusa de aprovação em 403, ou só pelo texto, também é aguardando_aprovacao', async () => {
  for (const [s, corpo] of [[403, { code: 3, message: 'Consumer type is not supported.' }], [401, { message: 'Trial access pending for this app' }]]) {
    const t = montar({ responder: () => falha(s, corpo) }), r = await t.rodar();
    assert.equal(r.estado, 'aguardando_aprovacao', JSON.stringify(corpo));
    assert.equal(t.chamadas.length, 1);
  }
});

test('401 na primeira chamada (token morto, código 2) vira reconectar, com UMA chamada só', async () => {
  const t = montar({ responder: () => falha(401, fx('erro-401-token')) }), r = await t.rodar();
  assert.equal(r.estado, 'reconectar');
  assert.equal(t.chamadas.length, 1);
  assert.match(r.avisos.join(' '), /Clique em Reconectar/);
  const fora = visivel(r, t.logs);
  assert.ok(!fora.includes(TOKEN) && !fora.includes(REFRESH));
  assert.ok(!/Authentication failed/i.test(fora));
});

test('401 no meio da coleta para tudo na hora: nenhuma chamada depois dela, e o que veio antes fica', async () => {
  const t = montar({ responder: comFalha((url) => rota(url) === '/v5/pins', falha(401, fx('erro-401-token'))) }), r = await t.rodar();
  assert.equal(r.estado, 'reconectar');
  assert.equal(t.chamadas.length, 3);
  assert.equal(rota(t.chamadas.at(-1).url), '/v5/pins');
  assert.equal(r.partes.perfil.estado, 'ok');
  assert.equal(r.dados.perfil.seguidores, 1234);
  assert.equal(r.partes.pins.estado, 'erro');
  assert.deepEqual(r.publicacoes, []);
});

test('429 (limite do dia) para a coleta: o que veio fica, o resto é pulado, estado parcial', async () => {
  const t = montar({ responder: comFalha((url) => rota(url) === '/v5/user_account/analytics', falha(429, fx('erro-429'))) }), r = await t.rodar();
  assert.equal(r.estado, 'parcial');
  assert.equal(t.chamadas.length, 2);
  assert.match(r.avisos.join(' '), /1000 por dia/);
  assert.equal(r.partes.perfil.estado, 'ok');
  for (const p of ['conta', 'top', 'pins', 'pastas', 'anuncios']) assert.equal(r.partes[p].estado, 'erro', p);
  assert.ok(!/Rate limit/i.test(visivel(r, t.logs)));
});

test('403 PINNER_DATA_ACCESS_DENIED na análise por Pin: não repete Pin a Pin, o resto segue', async () => {
  const t = montar({ responder: comFalha((url) => /\/pins\/\d+\/analytics$/.test(rota(url)), falha(403, fx('erro-403-pinner'))) }), r = await t.rodar();
  assert.equal(t.chamadas.filter((c) => /^\/v5\/pins\/\d+\/analytics$/.test(rota(c.url))).length, 1);
  assert.equal(t.chamadas.length, 22, 'as 21 de sempre e uma só da análise por Pin');
  assert.equal(r.partes.analise_pins.estado, 'erro');
  assert.equal(r.estado, 'parcial');
  for (const p of ['perfil', 'conta', 'top', 'pins', 'pastas', 'anuncios']) assert.equal(r.partes[p].estado, 'ok', p);
  assert.match(r.avisos.join(' '), /não liberou a análise por Pin/);
  assert.ok(!/PINNER_DATA_ACCESS_DENIED/.test(visivel(r, t.logs)));
  assert.equal(r.semanas.length, 8, 'os números da semana não dependem da análise por Pin');
});

test('métrica recusada pela API: pede uma por uma, a culpada vira null e aviso, a coleta segue', async () => {
  const t = montar({ recusar: ['ENGAGEMENT_RATE'] }), r = await t.rodar();
  const total = t.chamadas.filter((c) => rota(c.url) === '/v5/user_account/analytics' && !c.url.includes('content_type=ORGANIC') && !c.url.includes('content_type=PAID') && !c.url.includes('split_field'));
  assert.equal(total.length, 1 + 9, 'a lista inteira e depois uma por uma');
  assert.deepEqual(r.dados.conta.metricas_recusadas, ['ENGAGEMENT_RATE']);
  // O nome da métrica para gente; o da API (ENGAGEMENT_RATE) só no diário.
  assert.ok(r.avisos.includes('O Pinterest recusou a taxa de engajamento da conta; esse número ficou vazio.'), r.avisos.join(' | '));
  assert.equal(/ENGAGEMENT_RATE/.test(r.avisos.join(' ')), false);
  assert.ok(t.logs.some((l) => /ENGAGEMENT_RATE/.test(l)));
  assert.equal(r.dados.conta.total.resumo.taxa_engajamento, null);
  assert.equal(r.dados.conta.total.resumo.impressoes, 5800);
  // Depois de achada, a culpada não é pedida de novo.
  for (const c of t.chamadas.filter((c) => /content_type=(ORGANIC|PAID)|split_field/.test(c.url))) assert.ok(!c.url.includes('ENGAGEMENT_RATE'), c.url);
  assert.equal(r.partes.conta.estado, 'ok');
  assert.equal(r.semanas.length, 8);
  assert.equal(r.semanas[0].numeros.impressoes, 700);
});

test('pedido recusado até com IMPRESSION sozinha: nenhuma métrica leva a culpa, a parte da conta cai e o resto segue', async () => {
  const t = montar({ responder: comFalha((url) => rota(url) === '/v5/user_account/analytics', falha(400, fx('erro-400-metrica'))) }), r = await t.rodar();
  assert.equal(contar(t.chamadas, '/v5/user_account/analytics?'), 2);
  assert.ok(!/da conta; (esse número ficou|esses números ficaram) vazio/.test(r.avisos.join(' ')));
  assert.equal(r.partes.conta.estado, 'erro');
  assert.equal(r.dados.conta, undefined, 'parte que falhou não aparece: a coletora mantém a anterior');
  assert.equal(r.partes.pins.estado, 'ok');
  assert.equal(r.estado, 'parcial');
  // Sem a análise da conta, a semana só leva o que não depende dela.
  assert.ok(r.semanas.every((s) => s.numeros.impressoes === undefined && s.numeros.engajamento === undefined));
});

test('prazo curto: nenhuma chamada nova começa, estado parcial com o que já veio', async () => {
  const t = montar({ prazo: (ch) => (ch.length >= 4 ? 10_000 : 100_000) }), r = await t.rodar();
  assert.equal(t.chamadas.length, 4);
  assert.equal(r.estado, 'parcial');
  assert.match(r.avisos.join(' '), /tempo da coleta acabou/);
  assert.equal(r.partes.perfil.estado, 'ok');
  assert.equal(r.partes.pins.estado, 'parcial', 'a lista veio, os Pins do site não');
  assert.equal(r.dados.pins.do_site, undefined);
  assert.equal(r.partes.top.estado, 'erro');
});

test('token vencido sem refresh: reconectar sem chamar ninguém', async () => {
  const t = montar({ cx: conexao({ expira_em: new Date(Date.now() - DIA).toISOString(), refresh_token: undefined }) }), r = await t.rodar();
  assert.equal(r.estado, 'reconectar');
  assert.equal(t.chamadas.length + t.renovacoes.length, 0);
});

test('token vencido e renovação recusada (401): reconectar, sem chamada à API', async () => {
  const t = montar({ cx: conexao({ expira_em: new Date(Date.now() - DIA).toISOString() }), token: { status: 401, corpo: fx('erro-token-401') } }), r = await t.rodar();
  assert.equal(r.estado, 'reconectar');
  assert.equal(t.renovacoes.length, 1);
  assert.equal(t.chamadas.length, 0);
  assert.equal(r.conexao, undefined);
  assert.ok(!/inválido|Authentication/i.test(visivel(r, t.logs)));
});

test('renovação recusada com o token valendo mais uns minutos: coleta com ele e avisa', async () => {
  const t = montar({ cx: conexao({ expira_em: new Date(Date.now() + 5 * 60_000).toISOString() }), token: { status: 401, corpo: fx('erro-token-401') } }), r = await t.rodar();
  assert.equal(t.renovacoes.length, 1);
  assert.equal(r.estado, 'ok');
  assert.ok(t.chamadas.every((c) => c.headers.Authorization === `Bearer ${TOKEN}`));
  assert.match(r.avisos.join(' '), /recusou a conexão guardada/);
});

test('a coletora já renova com folga: token de 20 dias não é renovado de novo', async () => {
  const t = montar(), r = await t.rodar();
  assert.equal(t.renovacoes.length, 0);
  assert.equal(r.conexao, undefined);
  assert.equal(r.estado, 'ok');
});

test('vence durante a coleta: renova pelo mkt-oauth (Basic, refresh token), usa o token novo e devolve a conexão com o refresh NOVO', async () => {
  const t = montar({ cx: conexao({ expira_em: new Date(Date.now() + 5 * 60_000).toISOString() }), token: { corpo: fx('token-renovado') } }), r = await t.rodar();
  assert.equal(t.renovacoes.length, 1);
  const pedido = t.renovacoes[0];
  assert.equal(pedido.url, 'https://api.pinterest.com/v5/oauth/token');
  assert.equal(pedido.method, 'POST');
  assert.equal(pedido.headers.Authorization, `Basic ${Buffer.from(`${ENV.PINTEREST_CLIENT_ID}:${ENV.PINTEREST_CLIENT_SECRET}`).toString('base64')}`);
  const corpo = new URLSearchParams(pedido.body);
  assert.equal(corpo.get('grant_type'), 'refresh_token');
  assert.equal(corpo.get('refresh_token'), REFRESH);
  assert.ok(pedido.signal, 'a renovação tem teto de tempo');
  // As chamadas à API já usam o token novo.
  assert.ok(t.chamadas.length > 0 && t.chamadas.every((c) => c.headers.Authorization === 'Bearer tk-ficticio-NOVO-pina'));
  // A conexão volta inteira para a coletora regravar: refresh NOVO, prazos
  // da resposta, e o que não muda (conta, quem conectou) preservado.
  assert.equal(r.conexao.access_token, 'tk-ficticio-NOVO-pina');
  assert.equal(r.conexao.refresh_token, 'rf-ficticio-NOVO-pinr');
  assert.equal(r.conexao.refresh_expira_em, new Date(1798761600 * 1000).toISOString());
  assert.ok(Math.abs(Date.parse(r.conexao.expira_em) - (Date.now() + 2592000e3)) < 60_000);
  assert.deepEqual(r.conexao.escopos, ['boards:read', 'pins:read', 'user_accounts:read', 'ads:read']);
  assert.equal(r.conexao.conectado_por, 'leo');
  assert.equal(r.conexao.conta, 'Empresa Exemplo');
  // Nenhum token fora da conexão.
  const fora = visivel(r, t.logs);
  for (const s of [TOKEN, REFRESH, 'tk-ficticio-NOVO-pina', 'rf-ficticio-NOVO-pinr', ENV.PINTEREST_CLIENT_SECRET]) assert.ok(!fora.includes(s), s);
  assert.equal(r.estado, 'ok');
});

test('cota do dia já gasta por outras coletas (ctx.chamadasHoje): não chama e diz por quê', async () => {
  const t = montar({ chamadasHoje: 950 }), r = await t.rodar();
  assert.equal(t.chamadas.length, 0);
  assert.equal(r.estado, 'parcial');
  assert.match(r.avisos.join(' '), /cota do dia do Pinterest já foi usada/);
});

test('orçamento menor (o dia já gastou 890): para na décima chamada e avisa', async () => {
  const t = montar({ chamadasHoje: 890 }), r = await t.rodar();
  assert.equal(P.orcamentoDaRodada(890), 10);
  assert.equal(t.chamadas.length, 10);
  assert.equal(r.estado, 'parcial');
  assert.match(r.avisos.join(' '), /usou as 10 chamadas/);
  assert.deepEqual(r.dados.cota, { orcamento: 10, usadas: 10, teto_dia: 1000 });
});

test('paginação com teto: lista sem fim para em 8 páginas, sai incompleta e avisa', async () => {
  let n = 0;
  const pagina = () => ({ items: [{ ...fx('pins-p1').items[0], id: String(2000000000000000000n + BigInt(++n)) }], bookmark: `bm-${n}` });
  const t = montar({ responder: (url, op, info) => (rota(url) === '/v5/pins' && !new URL(url).searchParams.get('domain') ? pagina() : respostaPadrao(url, op, info)) });
  const r = await t.rodar();
  assert.equal(t.chamadas.filter((c) => rota(c.url) === '/v5/pins' && !c.url.includes('domain=')).length, P.MAX_PAGINAS_PINS);
  assert.equal(r.dados.pins.completo, false);
  assert.equal(r.dados.pins.total, 8);
  assert.match(r.avisos.join(' '), /mais Pins do que o Painel lê/);
});

test('bookmark repetido (laço da API): para na segunda página e a lista sai incompleta', async () => {
  const t = montar({ responder: (url, op, info) => (rota(url) === '/v5/boards' ? { items: fx('boards').items, bookmark: 'mesmo' } : respostaPadrao(url, op, info)) });
  const r = await t.rodar();
  assert.equal(contar(t.chamadas, '/v5/boards'), 2);
  assert.equal(r.dados.pastas.completo, false);
  assert.equal(r.dados.pastas.total, 2, 'sem repetir a pasta');
});

test('sem o escopo ads:read: nenhuma chamada de anúncio, a parte cai com o motivo e o resto segue', async () => {
  const t = montar({ cx: conexao({ escopos: ['user_accounts:read', 'pins:read', 'boards:read'] }) }), r = await t.rodar();
  assert.equal(contar(t.chamadas, '/ad_accounts'), 0);
  assert.equal(r.partes.anuncios.estado, 'erro');
  assert.match(r.partes.anuncios.motivo, /permissão/);
  assert.equal(r.partes.anuncios.codigo, 'sem_escopo', 'o código vai ao lado da frase');
  assert.match(r.avisos.join(' '), /ads:read/);
  assert.equal(r.estado, 'parcial');
  assert.ok(r.semanas.every((s) => s.numeros.leads === undefined), 'sem anúncio, leads não vai');
});

test('sem conta de anúncios: parte ok e vazia, com a observação, e leads nunca vai', async () => {
  const t = montar({ responder: comFalha((url) => rota(url) === '/v5/ad_accounts', fx('ad-accounts-vazio')) }), r = await t.rodar();
  assert.equal(r.partes.anuncios.estado, 'ok');
  assert.deepEqual(r.dados.anuncios.contas, []);
  assert.match(r.dados.anuncios.observacao, /ads\.pinterest\.com/);
  assert.equal(t.chamadas.length, 21);
  assert.ok(r.semanas.every((s) => s.numeros.leads === undefined));
  assert.equal(r.estado, 'ok');
});

test('colunas de anúncio recusadas: refaz com o essencial nos dias UTC, avisa, e leads não vai', async () => {
  let n = 0;
  const t = montar({ responder: comFalha((url) => rota(url).endsWith('/549755885175/analytics') && n++ === 0, falha(400, fx('erro-400-metrica'))) }), r = await t.rodar();
  assert.equal(contar(t.chamadas, '/549755885175/analytics?'), 2);
  const segunda = parametros(t.chamadas.filter((c) => c.url.includes('/549755885175/analytics?'))[1].url);
  assert.equal(segunda.columns, 'SPEND_IN_MICRO_DOLLAR,PAID_IMPRESSION,TOTAL_CLICKTHROUGH');
  assert.equal(segunda.reporting_timezone, undefined);
  const conta = r.dados.anuncios.contas[0];
  assert.equal(conta.fuso_dos_dias, 'UTC');
  assert.equal(conta.colunas_recusadas, true);
  assert.equal(conta.resumo.leads, null, 'coluna não pedida é null, não zero');
  assert.equal(conta.resumo.gasto, 27.5);
  assert.ok(r.semanas.every((s) => s.numeros.leads === undefined));
});

test('sem canal do Pinterest ativo: coleta para a tela, mas nada vai para as semanas e publicações', async () => {
  const t = montar({ canais: [{ codigo: 'site', url_perfil: 'https://www.impresilk.com.br' }] }), r = await t.rodar();
  assert.equal(r.estado, 'ok');
  assert.deepEqual([r.semanas, r.publicacoes], [[], []]);
  assert.match(r.avisos.join(' '), /Nenhum canal ativo do Pinterest/);
  assert.equal(r.dados.pins.total, 4);
});

test('canal achado pelo link do perfil, com outro código: semanas e publicações usam o código dele', async () => {
  const t = montar({ canais: [{ codigo: 'pin-casa', url_perfil: 'https://www.pinterest.com/empresa_exemplo/' }] }), r = await t.rodar();
  assert.ok(r.semanas.length && r.semanas.every((s) => s.canal === 'pin-casa'));
  assert.ok(r.publicacoes.length && r.publicacoes.every((p) => p.canal === 'pin-casa'));
  // Sem canal "site", o domínio do filtro é o padrão da casa.
  assert.equal(parametros(t.chamadas.find((c) => c.url.includes('domain=')).url).domain, 'impresilk.com.br');
});

test('dia ainda PROCESSING (ou ausente) deixa aquela semana fora do banco; as outras vão', async () => {
  const t = montar({ status: (d) => (d === '2026-10-08' ? 'PROCESSING' : d >= '2026-10-12' ? 'ESTIMATE' : 'READY') }), r = await t.rodar();
  assert.deepEqual(r.semanas.map((s) => s.semana), SEGUNDAS);
  assert.deepEqual(r.semanas[0].numeros, { leads: 3 }, 'a semana não pronta não leva impressões, engajamento nem cliques');
  assert.deepEqual(r.semanas[1].numeros, { impressoes: 700, engajamento: 70, cliques: 21, leads: 3 });
  const s = r.dados.conta.total.semanas[0];
  assert.equal(s.pronta, false);
  assert.equal(s.impressoes, 700, 'na tela a soma aparece, marcada como não pronta');
});

test('recusa de aprovação com o corpo em texto (não JSON) também é aguardando_aprovacao, e o texto não sai', async () => {
  const t = montar({ responder: () => falha(401, 'Authentication failed: consumer type is not supported.') }), r = await t.rodar();
  assert.equal(r.estado, 'aguardando_aprovacao');
  assert.equal(t.chamadas.length, 1);
  assert.ok(!/consumer type/i.test(visivel(r, t.logs)));
});

test('público que o Pinterest não monta (404, pouco volume): fica null com a observação, sem deixar a fonte parcial todo dia', async () => {
  const t = montar({ responder: comFalha((url) => rota(url).endsWith('/audience_insights'), falha(404, { code: 404, message: 'exemplo fictício' })) }), r = await t.rodar();
  assert.equal(r.partes.anuncios.estado, 'ok');
  assert.equal(r.estado, 'ok');
  assert.deepEqual(r.dados.anuncios.contas[0].publico, { total: null, engajado: null });
  assert.match(r.dados.anuncios.observacao, /público/);
});

test('falha de servidor no público é falta de verdade: anúncios parcial, com o resto dos anúncios guardado', async () => {
  const t = montar({ responder: comFalha((url) => rota(url).endsWith('/audience_insights'), falha(503)) }), r = await t.rodar();
  assert.equal(r.partes.anuncios.estado, 'parcial');
  assert.equal(r.dados.anuncios.contas[0].resumo.gasto, 27.5);
  assert.equal(r.estado, 'parcial');
});

test('mais campanhas do que o teto de páginas: avisa, mas não é falha', async () => {
  let n = 0;
  const pagina = () => ({ items: [{ ...fx('campanhas').items[0], id: String(700000000000 + ++n) }], bookmark: `c-${n}` });
  const t = montar({ responder: (url, op, info) => (rota(url).endsWith('/campaigns') ? pagina() : respostaPadrao(url, op, info)) }), r = await t.rodar();
  assert.equal(contar(t.chamadas, '/campaigns?'), P.MAX_PAGINAS_CAMPANHAS);
  assert.equal(r.partes.anuncios.estado, 'ok');
  assert.match(r.avisos.join(' '), /mais campanhas do que o Painel lê/);
});

test('análise orgânica recusada: a conta fica parcial, o aviso diz o que faltou em português direito', async () => {
  const t = montar({ responder: comFalha((url) => url.includes('content_type=ORGANIC'), falha(400, fx('erro-400-metrica'))) }), r = await t.rodar();
  assert.equal(r.partes.conta.estado, 'parcial');
  assert.equal(r.dados.conta.organico, undefined, 'a etapa que falhou fica ausente');
  assert.ok(r.dados.conta.pago);
  assert.ok(r.avisos.includes('O Pinterest recusou o pedido, e a análise orgânica da conta não veio.'), r.avisos.join(' | '));
});

test('Pin sem data de criação vai para o fim da lista e não vira publicação', async () => {
  const p1 = fx('pins-p1');
  p1.items.push({ ...p1.items[0], id: '1000000000000000042', created_at: null });
  const t = montar({ responder: (url, op, info) => (rota(url) === '/v5/pins' && !url.includes('domain=') && !url.includes('bookmark=') ? p1 : respostaPadrao(url, op, info)) }), r = await t.rodar();
  assert.equal(r.dados.pins.itens.at(-1).id, '1000000000000000042');
  assert.ok(!r.publicacoes.some((p) => p.url.includes('1000000000000000042')));
});

test('conta que não é empresarial: avisa, e visualizações mensais escondidas (-1) ficam null', async () => {
  const t = montar({ responder: comFalha((url) => rota(url) === '/v5/user_account', fx('user-account-pinner')) }), r = await t.rodar();
  assert.match(r.avisos.join(' '), /não é uma conta empresarial/);
  assert.equal(r.dados.perfil.visualizacoes_mensais, null);
});

// ------------------------------------------------- a coleta completa --

test('coleta completa: estado ok, todas as partes ok, 26 chamadas, todas GET ao api.pinterest.com com o Bearer', async () => {
  const t = montar(), r = await t.rodar();
  assert.equal(r.estado, 'ok');
  assert.deepEqual(Object.keys(r.partes).sort(), ['analise_pins', 'anuncios', 'conta', 'pastas', 'perfil', 'pins', 'top']);
  for (const [nome, p] of Object.entries(r.partes)) assert.equal(p.estado, 'ok', nome);
  assert.equal(t.chamadas.length, 26);
  for (const c of t.chamadas) {
    assert.equal(c.method, 'GET', c.url);
    assert.ok(c.url.startsWith('https://api.pinterest.com/v5/'), c.url);
    assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!c.url.includes(TOKEN), 'token nunca na URL');
    assert.ok(!c.url.includes('engagement_window_days'), 'janela descontinuada nunca é pedida');
    assert.match(c.rotulo, /^pinterest:/);
  }
  assert.equal(r.conta, 'Empresa Exemplo Comunicação Visual');
  assert.deepEqual(r.avisos, []);
  // O resultado passa pela conferência da coletora sem perder nada.
  const n = normalizarResultado(r);
  assert.equal(n.estado, 'ok');
  assert.deepEqual(Object.keys(n.partes).sort(), Object.keys(r.partes).sort());
});

test('os parâmetros: janela de 8 semanas, métricas confirmadas, domínio do site, atribuição só clique e visualização', async () => {
  const t = montar(); await t.rodar();
  const conta = t.chamadas.filter((c) => rota(c.url) === '/v5/user_account/analytics').map((c) => parametros(c.url));
  assert.equal(conta.length, 1 + 2 + 4);
  for (const q of conta) {
    assert.equal(q.start_date, '2026-08-17');
    assert.equal(q.end_date, '2026-10-13');
    assert.ok(q.metric_types.split(',').every((m) => P.METRICAS_CONTA.includes(m)));
  }
  assert.deepEqual(conta.map((q) => q.content_type ?? q.split_field), ['ALL', 'ORGANIC', 'PAID', 'APP_TYPE', 'SOURCE', 'PIN_FORMAT', 'OWNED_CONTENT']);
  const pins = t.chamadas.filter((c) => rota(c.url) === '/v5/pins').map((c) => parametros(c.url));
  assert.deepEqual(pins[0], { page_size: '250', pin_metrics: 'true', pin_filter: 'exclude_repins' });
  assert.equal(pins[1].bookmark, 'bm-pagina-2');
  assert.equal(pins[2].domain, 'impresilk.com.br', 'domínio exato, sem www');
  const top = t.chamadas.filter((c) => rota(c.url).includes('/top_')).map((c) => parametros(c.url));
  assert.deepEqual(top.map((q) => [q.start_date, q.end_date, q.sort_by, q.num_of_pins]), [
    ['2026-10-05', '2026-10-11', 'ENGAGEMENT', '50'], ['2026-08-17', '2026-10-13', 'ENGAGEMENT', '50'], ['2026-08-17', '2026-10-13', 'VIDEO_MRC_VIEW', '50'],
  ]);
  const ads = parametros(t.chamadas.find((c) => rota(c.url).endsWith('/549755885175/analytics')).url);
  assert.equal(ads.click_window_days, '30');
  assert.equal(ads.view_window_days, '1');
  assert.equal(ads.reporting_timezone, 'AD_ACCOUNT_TIME_ZONE');
  assert.equal(ads.granularity, 'DAY');
  // A análise por Pin: a lista de vídeo para o vídeo, a comum para o resto.
  const porPin = t.chamadas.filter((c) => /\/pins\/\d+\/analytics$/.test(rota(c.url)));
  assert.deepEqual(porPin.map((c) => rota(c.url).split('/')[3]), [A, C, B, D, G]);
  for (const c of porPin) {
    const q = parametros(c.url);
    assert.equal(q.metric_types, (rota(c.url).includes(B) ? P.METRICAS_PIN_VIDEO : P.METRICAS_PIN).join(','));
    assert.equal(q.start_date, somarDias(HOJE, -P.DIAS_ANALISE_PINS));
    assert.equal(q.end_date, '2026-10-13');
  }
});

test('semanas: as 8 FECHADAS, segunda-feira, só o que foi medido, nunca alcance nem conversas', async () => {
  const t = montar(), r = await t.rodar();
  assert.deepEqual(r.semanas.map((s) => s.semana), SEGUNDAS);
  for (const s of r.semanas) {
    assert.equal(s.canal, 'pinterest');
    assert.equal(new Date(`${s.semana}T12:00:00Z`).getUTCDay(), 1);
    assert.equal(s.numeros.impressoes, 700);
    assert.equal(s.numeros.engajamento, 70);
    assert.equal(s.numeros.cliques, 21, 'cliques são os de saída (OUTBOUND_CLICK)');
    assert.equal('alcance' in s.numeros || 'conversas' in s.numeros, false);
    assert.equal('seguidores' in s.numeros, false, 'quarta-feira: o total de agora não é o do domingo');
  }
  // Leads: só nas semanas em que a campanha de leads rodou (a conta entregou
  // anúncio). Nas outras seis a conta não entregou nada: o zero seria "não
  // havia anúncio no ar" e passaria por cima do lançado à mão.
  assert.deepEqual(r.semanas.map((s) => s.numeros.leads), [3, 3, undefined, undefined, undefined, undefined, undefined, undefined]);
  // A coletora aceita as linhas como estão.
  const prep = prepararSemanas(r.semanas);
  assert.equal(prep.descartadas, 0);
  assert.equal(prep.linhas.length, 8);
});

test('o caso ruim: seguidores vai só na semana que acabou de fechar e só na segunda; a coleta de terça não troca o retrato', async () => {
  for (const [hoje, vai] of [['2026-10-13', false], ['2026-10-12', true], ['2026-10-14', false], ['2026-10-18', false]]) {
    const t = montar({ hoje }), r = await t.rodar();
    const ultima = r.semanas.find((s) => s.semana === '2026-10-05');
    assert.equal(ultima?.numeros.seguidores, vai ? 1234 : undefined, hoje);
    assert.ok(r.semanas.filter((s) => s.semana !== '2026-10-05').every((s) => s.numeros.seguidores === undefined), hoje);
  }
});

test('o caso ruim: campanha de leads que ACABOU não manda leads (nem zero) nas semanas seguintes, e o lançado à mão fica', async () => {
  // A campanha de leads rodou de 03/08 a 31/08/2026, com um lead por dia; a
  // coleta é em 14/10. Antes, as semanas de 07/09 a 05/10 recebiam leads 0, e
  // cada lead digitado à mão nelas era desfeito na coleta do dia seguinte.
  const campanha = (fim) => ({ items: [{ id: '626736533506', ad_account_id: '549755885175', name: 'Leads de agosto', status: fim ? 'COMPLETED' : 'PAUSED', objective_type: 'LEADS',
    start_time: Math.floor(Date.parse('2026-08-03T03:00:00Z') / 1000), end_time: fim ? Math.floor(Date.parse('2026-09-01T02:59:59Z') / 1000) : null }], bookmark: null });
  const linhas = dias('2026-08-03', '2026-08-31').map((d) => ({ AD_ACCOUNT_ID: '549755885175', DATE: d, SPEND_IN_MICRO_DOLLAR: 1000000, PAID_IMPRESSION: 100, TOTAL_CLICKTHROUGH: 2, LEADS: 1 }));
  for (const fim of [true, false]) {
    // fim false: a campanha foi PAUSADA sem end_time (o Pinterest a deixa "sem
    // fim"); quem segura o zero falso é a semana sem entrega.
    const responder = (url, op, info) => {
      const u = new URL(url);
      if (u.pathname === '/v5/ad_accounts/549755885175/analytics') {
        const de = u.searchParams.get('start_date'), ate = u.searchParams.get('end_date');
        return linhas.filter((l) => l.DATE >= de && l.DATE <= ate);
      }
      if (u.pathname === '/v5/ad_accounts/549755885175/campaigns') return campanha(fim);
      return respostaPadrao(url, op, info);
    };
    const r = await montar({ responder }).rodar();
    const leads = Object.fromEntries(r.semanas.map((s) => [s.semana, s.numeros.leads]));
    assert.deepEqual(leads, { '2026-10-05': undefined, '2026-09-28': undefined, '2026-09-21': undefined, '2026-09-14': undefined, '2026-09-07': undefined, '2026-08-31': 1, '2026-08-24': 7, '2026-08-17': 7 }, `fim ${fim}`);
    // A coletora (prepararSemanas) também não recebe a chave: nada a gravar.
    const prep = prepararSemanas(r.semanas);
    assert.ok(prep.linhas.filter((l) => l.semana >= '2026-09-07').every((l) => !('leads' in l.numeros)), `fim ${fim}`);
  }
});

test('o caso ruim: campanha de leads PAUSADA sem fim não manda leads 0 nas semanas em que OUTRA campanha entrega', async () => {
  // Leads de agosto rodou de 03/08 e foi pausada em 31/08 (sem end_time). Em
  // setembro e outubro só a campanha de reconhecimento entrega anúncio. Antes,
  // toda semana dela recebia leads 0 por cima do lead lançado à mão.
  const s = (iso) => Math.floor(Date.parse(iso) / 1000);
  const lead = { id: '626736533506', ad_account_id: '549755885175', name: 'Leads de agosto', status: 'PAUSED', objective_type: 'LEADS', start_time: s('2026-08-03T03:00:00Z'), end_time: null };
  const outra = { id: '626736533507', ad_account_id: '549755885175', name: 'Reconhecimento', status: 'ACTIVE', objective_type: 'AWARENESS', start_time: s('2026-08-01T03:00:00Z'), end_time: null };
  const linhas = dias('2026-08-03', '2026-10-13').map((d) => ({ AD_ACCOUNT_ID: '549755885175', DATE: d, SPEND_IN_MICRO_DOLLAR: 1000000, PAID_IMPRESSION: 100, TOTAL_CLICKTHROUGH: 2, LEADS: d <= '2026-08-31' ? (d.endsWith('5') ? 0 : 1) : 0 }));
  const rodar = async (camp) => {
    const responder = (url, op, info) => {
      const u = new URL(url);
      if (u.pathname === '/v5/ad_accounts/549755885175/analytics') {
        const de = u.searchParams.get('start_date'), ate = u.searchParams.get('end_date');
        return linhas.filter((l) => l.DATE >= de && l.DATE <= ate);
      }
      if (u.pathname === '/v5/ad_accounts/549755885175/campaigns') return { items: [camp, outra], bookmark: null };
      return respostaPadrao(url, op, info);
    };
    const r = await montar({ responder }).rodar();
    return Object.fromEntries(r.semanas.map((x) => [x.semana, x.numeros.leads]));
  };
  // Com a data da pausa (updated_time): o período vai até ela.
  const comPausa = await rodar({ ...lead, updated_time: s('2026-08-31T20:00:00Z') });
  for (const sem of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']) assert.equal(comPausa[sem], undefined, sem);
  assert.equal(comPausa['2026-08-31'], 1);
  // Sem a data da pausa: ela não abre período; semana com lead vai do mesmo jeito.
  const semData = await rodar(lead);
  for (const sem of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']) assert.equal(semData[sem], undefined, sem);
  assert.equal(semData['2026-08-24'], 6);
  // Ativa, sem fim: aí o zero da semana com entrega é de verdade.
  const ativa = await rodar({ ...lead, status: 'ACTIVE' });
  assert.equal(ativa['2026-09-14'], 0);
});

test('periodoDeLeads: end_time manda; ativa sem fim; pausada até a última alteração; outro objetivo fica de fora', () => {
  const s = (iso) => Math.floor(Date.parse(iso) / 1000);
  const base = { objective_type: 'LEADS', start_time: s('2026-08-03T03:00:00Z') };
  assert.deepEqual(P.periodoDeLeads({ ...base, status: 'PAUSED', end_time: s('2026-09-01T02:59:59Z') }), { de: '2026-08-03', ate: '2026-08-31' });
  assert.deepEqual(P.periodoDeLeads({ ...base, status: 'ACTIVE', end_time: null }), { de: '2026-08-03', ate: null });
  assert.deepEqual(P.periodoDeLeads({ ...base, status: 'ARCHIVED', end_time: null, updated_time: s('2026-09-10T15:00:00Z') }), { de: '2026-08-03', ate: '2026-09-10' });
  assert.equal(P.periodoDeLeads({ ...base, status: 'PAUSED', end_time: null }), null);
  assert.equal(P.periodoDeLeads({ ...base, objective_type: 'AWARENESS', status: 'ACTIVE' }), null);
  assert.equal(P.periodoDeLeads(null), null);
});

test('o caso ruim: campanha de leads criada na semana 7 não manda leads (nem zero) nas semanas 1 a 6, e o lançado à mão fica', async () => {
  // A campanha de leads começa em 01/10 (meia-noite de São Paulo); o único
  // lead é desse dia. A outra campanha é de reconhecimento.
  const inicioLead = Math.floor(Date.parse('2026-10-01T03:00:00Z') / 1000);
  const responder = (url, op, info) => {
    const u = new URL(url);
    if (u.pathname === '/v5/ad_accounts/549755885175/analytics') {
      const de = u.searchParams.get('start_date'), ate = u.searchParams.get('end_date');
      return [{ AD_ACCOUNT_ID: '549755885175', DATE: '2026-10-01', SPEND_IN_MICRO_DOLLAR: 1000000, PAID_IMPRESSION: 100, LEADS: 3 }].filter((l) => l.DATE >= de && l.DATE <= ate);
    }
    if (u.pathname === '/v5/ad_accounts/549755885175/campaigns') {
      const c = fx('campanhas');
      c.items[0].start_time = inicioLead;
      return c;
    }
    return respostaPadrao(url, op, info);
  };
  const r = await montar({ responder }).rodar();
  const leads = Object.fromEntries(r.semanas.map((s) => [s.semana, s.numeros.leads]));
  // 28/09 tem o dia 01/10; em 05/10 a campanha estava no período mas não
  // entregou nada: sem anúncio no ar, a chave nem vai.
  assert.deepEqual(leads, { '2026-10-05': undefined, '2026-09-28': 3, '2026-09-21': undefined, '2026-09-14': undefined, '2026-09-07': undefined, '2026-08-31': undefined, '2026-08-24': undefined, '2026-08-17': undefined });
  // Entregou em 05/10 (gasto e impressão) e não veio lead: aí o zero é de verdade.
  const comEntrega = (url, op, info) => {
    const u = new URL(url);
    if (u.pathname === '/v5/ad_accounts/549755885175/analytics') {
      const de = u.searchParams.get('start_date'), ate = u.searchParams.get('end_date');
      return [{ AD_ACCOUNT_ID: '549755885175', DATE: '2026-10-01', SPEND_IN_MICRO_DOLLAR: 1000000, PAID_IMPRESSION: 100, LEADS: 3 },
        { AD_ACCOUNT_ID: '549755885175', DATE: '2026-10-06', SPEND_IN_MICRO_DOLLAR: 2000000, PAID_IMPRESSION: 150 }].filter((l) => l.DATE >= de && l.DATE <= ate);
    }
    return responder(url, op, info);
  };
  assert.equal((await montar({ responder: comEntrega }).rodar()).semanas.find((s) => s.semana === '2026-10-05').numeros.leads, 0);
  // Sem campanha de leads com início e sem lead nenhum: nenhuma semana leva leads.
  const semInicio = (url, op, info) => {
    const u = new URL(url);
    if (u.pathname === '/v5/ad_accounts/549755885175/analytics') return [];
    if (u.pathname === '/v5/ad_accounts/549755885175/campaigns') { const c = fx('campanhas'); c.items[0].start_time = null; return c; }
    return respostaPadrao(url, op, info);
  };
  assert.ok((await montar({ responder: semInicio }).rodar()).semanas.every((s) => !('leads' in s.numeros)));
  // A regra pura: zero só na semana que cruza o período da campanha e teve entrega.
  const porSemana = new Map(SEGUNDAS.map((s) => [s, 0]));
  const m = P.montarSemanas({ hoje: HOJE, leadsPorSemana: porSemana, periodosLeads: [{ de: '2026-10-01', ate: null }], entregaPorSemana: new Set(SEGUNDAS) });
  assert.deepEqual(m.linhas.map((l) => l.semana), ['2026-10-05', '2026-09-28']);
  assert.deepEqual(P.montarSemanas({ hoje: HOJE, leadsPorSemana: porSemana, entregaPorSemana: new Set(SEGUNDAS) }).linhas, [], 'sem campanha de leads, leads não vai');
  assert.deepEqual(P.montarSemanas({ hoje: HOJE, leadsPorSemana: porSemana, periodosLeads: [{ de: '2026-10-01', ate: null }] }).linhas, [], 'sem entrega, leads não vai');
});

test('o caso ruim: o mesmo Pin em br.pinterest.com, sem www, m. ou com rastreio sai num endereço só (o canônico www.pinterest.com/pin/<id>/)', () => {
  const certo = `https://www.pinterest.com/pin/${A}/`;
  for (const v of [`https://br.pinterest.com/pin/${A}/`, `https://br.pinterest.com/pin/${A}`, `http://pinterest.com/pin/${A}/?utm_source=x`, `https://pinterest.com.br/pin/${A}/`,
    `https://m.pinterest.com/pin/${A}/#comentarios`, `https://www.pinterest.com/pin/${A}`, A]) assert.equal(P.linkCanonicoDoPin(v), certo, v);
  for (const v of ['https://evilpinterest.com/pin/1/', 'https://br.pinterest.com/empresa_exemplo/', 'javascript:alert(1)', 'https://www.pinterest.com/pin/../x', '', null]) assert.equal(P.linkCanonicoDoPin(v), null, String(v));
  // A publicação sai canônica mesmo se o Pin chegar com o endereço do Brasil.
  const pub = P.publicacaoDoPin({ id: A, url: `https://br.pinterest.com/pin/${A}/`, data: '2026-10-08', titulo: 'Fachada', desde_sempre: null });
  assert.equal(pub.url, certo);
  // Depois da régua da coletora (normalizarLink), é o mesmo texto do www.
  assert.equal(normalizarLink(pub.url), normalizarLink(`https://www.pinterest.com/pin/${A}/`));
});

test('publicações: link do Pin, dia de São Paulo, título, números desde sempre; Pin antigo sem números; Pin salvo de outro fica de fora', async () => {
  const t = montar(), r = await t.rodar();
  assert.deepEqual(r.publicacoes, [
    { canal: 'pinterest', url: `https://www.pinterest.com/pin/${A}/`, data: '2026-10-08', titulo: 'Fachada em ACM para loja', impressoes: 500, cliques: 25 },
    { canal: 'pinterest', url: `https://www.pinterest.com/pin/${C}/`, data: '2026-10-01', titulo: 'Adesivo de vitrine', impressoes: 500, cliques: 25 },
    { canal: 'pinterest', url: `https://www.pinterest.com/pin/${B}/`, data: '2026-09-20', titulo: 'Vídeo da instalação de letreiro', impressoes: 500, cliques: 25 },
    { canal: 'pinterest', url: `https://www.pinterest.com/pin/${D}/`, data: '2022-05-01', titulo: 'Placa antiga' },
  ]);
  assert.ok(!r.publicacoes.some((p) => p.url.includes(E)));
  assert.ok(r.publicacoes.every((p) => !('engajamento' in p) && !('alcance' in p)));
  const prep = prepararPublicacoes(r.publicacoes, normalizarLink);
  assert.equal(prep.descartadas, 0);
  assert.equal(prep.linhas[0].url, `https://www.pinterest.com/pin/${A}`);
});

test('dados: perfil, conta por dia e por semana, orgânico e pago separados, quebras', async () => {
  const t = montar(), r = await t.rodar(), d = r.dados;
  assert.deepEqual(d.janela, { hoje: HOJE, inicio: '2026-08-17', fim: '2026-10-13', semanas: SEGUNDAS, fuso_dos_dias: 'UTC' });
  assert.deepEqual(d.perfil, {
    id: '900000000000000001', usuario: 'empresa_exemplo', nome: 'Empresa Exemplo Comunicação Visual', tipo_conta: 'BUSINESS',
    sobre: 'Fachadas, letreiros e adesivos. Texto fictício para teste.', foto: 'https://i.pinimg.com/exemplo/perfil.jpg', site: 'https://www.impresilk.com.br',
    url: 'https://www.pinterest.com/empresa_exemplo/', seguidores: 1234, seguindo: 56, pins: 420, pastas: 12, visualizacoes_mensais: 98765,
  });
  const total = d.conta.total;
  assert.equal(total.por_dia.length, 58);
  assert.deepEqual(total.por_dia.at(-1), { dia: '2026-10-13', status: 'ESTIMATE', impressoes: 100, engajamento: 10, cliques_pin: 4, cliques_saida: 3, salvamentos: 2 });
  assert.deepEqual(total.semanas[0], { semana: '2026-10-05', pronta: true, dias_com_dado: 7, impressoes: 700, engajamento: 70, cliques_pin: 28, cliques_saida: 21, salvamentos: 14, taxa_engajamento: 0.1 });
  assert.equal(total.resumo.taxa_cliques_saida, 0.03);
  assert.equal(d.conta.organico.semanas[0].impressoes, 560);
  assert.equal(d.conta.pago.semanas[0].impressoes, 140);
  assert.deepEqual(d.conta.quebras.aparelho.map((g) => g.grupo), ['MOBILE', 'WEB', 'TABLET']);
  assert.deepEqual(Object.keys(d.conta.quebras), ['aparelho', 'origem', 'formato', 'conteudo_proprio']);
  assert.deepEqual(d.conta.metricas_recusadas, []);
  assert.deepEqual(d.cota, { orcamento: 120, usadas: 26, teto_dia: 1000 });
});

test('dados: tops, Pins (com os que levam ao site) e pastas', async () => {
  const t = montar(), r = await t.rodar(), d = r.dados;
  assert.equal(d.top.semana.inicio, '2026-10-05');
  assert.equal(d.top.semana.fim, '2026-10-11');
  assert.deepEqual(d.top.semana.pins.map((p) => [p.id, p.engajamento, p.pronto]), [[A, 30, true], [D, 20, true], [G, 9, false]]);
  assert.equal(d.top.semana.pins[0].url, `https://www.pinterest.com/pin/${A}/`);
  assert.equal(d.top.semana.dados_ate, new Date(1760227200000).toISOString());
  assert.equal(d.top.video.pins[0].extras.video_visualizacoes, 60);
  assert.equal(d.top.video.dados_ate, '2026-10-12T00:00:00.000Z');

  assert.equal(d.pins.total, 4);
  assert.equal(d.pins.completo, true);
  assert.deepEqual(d.pins.itens.map((p) => p.id), [A, C, B, D], 'do mais novo para o mais velho');
  const [pa, pc, pb, pd] = d.pins.itens;
  assert.equal(pa.leva_ao_site, true);
  assert.equal(pc.data, '2026-10-01', '01:30 UTC do dia 2 é dia 1 em São Paulo');
  assert.equal(pc.criado_em, '2026-10-02T01:30:00.000Z', 'sem fuso na API é UTC');
  assert.equal(pb.leva_ao_site, false);
  assert.equal(pb.video, true);
  assert.equal(pb.ia, false);
  assert.equal(pa.ia, null);
  assert.equal(pd.desde_sempre, null);
  assert.deepEqual(pd.ultimos_90_dias, { impressoes: 480, cliques_pin: 38, cliques_saida: 24 });
  assert.equal(pa.imagem, `https://i.pinimg.com/400x300/${A}.jpg`);
  assert.equal(d.pins.do_site.dominio, 'impresilk.com.br');
  assert.equal(d.pins.do_site.total, 3);
  assert.deepEqual(d.pins.do_site.de_fora.map((p) => p.id), ['1000000000000000099']);
  assert.deepEqual(d.pins.do_site.desde_sempre, { impressoes: 1500, cliques_pin: 120, cliques_saida: 75 });

  assert.equal(d.pastas.total, 2);
  assert.deepEqual(d.pastas.itens[0], {
    id: '800000000000000001', nome: 'Fachadas', descricao: 'Fachadas que fizemos', privacidade: 'PUBLIC', pins: 120, seguidores: 40, colaboradores: 0,
    criada_em: '2021-03-01T10:00:00.000Z', pins_alterados_em: '2026-10-08T14:00:00.000Z',
  });
});

test('dados: anúncios com o dia sem linha valendo zero, campanha sem entrega zerada, taxas da soma e o público', async () => {
  const t = montar(), r = await t.rodar(), c = r.dados.anuncios.contas[0];
  assert.deepEqual([c.id, c.nome, c.moeda, c.fuso, c.fuso_dos_dias], ['549755885175', 'Empresa Exemplo Anúncios', 'BRL', 'America/Sao_Paulo', 'conta']);
  assert.equal(c.por_dia.length, 58);
  const vazio = c.por_dia.find((x) => x.dia === '2026-10-06');
  assert.equal(vazio.gasto, 0, 'dia sem linha é zero (o Pinterest só manda linha com dado)');
  assert.equal(vazio.ctr, null, 'taxa sem impressão não existe');
  assert.equal(c.por_dia.find((x) => x.dia === '2026-09-29').gasto, 12.5);
  const s = c.semanas.find((x) => x.semana === '2026-10-05');
  assert.equal(s.gasto, 15);
  assert.equal(s.leads, 3);
  assert.equal(s.cliques, 14);
  assert.equal(s.ctr, 0.0117);
  assert.equal(s.cpc, 1.07);
  assert.equal(s.alcance_pago, null, 'pessoas únicas por dia não somam na semana');
  assert.equal(c.resumo.gasto, 27.5);
  assert.equal(c.resumo.custo_por_lead, 4.58);
  const [leads, reconhecimento] = c.campanhas;
  assert.deepEqual([leads.nome, leads.objetivo, leads.gasto, leads.leads, leads.limite_diario], ['Leads de fachada', 'LEADS', 27.5, 6, 20]);
  assert.equal(reconhecimento.gasto, 0);
  assert.equal(reconhecimento.limite_total, 500);
  assert.equal(c.publico.total.tamanho, 45000);
  assert.deepEqual(c.publico.total.regioes, [{ chave: '31000', nome: 'Belo Horizonte', proporcao: 0.22 }]);
  assert.equal(c.publico.total.interesses[0].subcategorias[0].nome, 'Signage');
  assert.equal(c.publico.engajado.tamanho_e_teto, true);
});

test('dados: análise por Pin com a lista do tipo, semanas, desde sempre e os seguidores trazidos pelos Pins medidos', async () => {
  const t = montar(), r = await t.rodar(), a = r.dados.analise_pins;
  assert.deepEqual([a.inicio, a.fim, a.pedidos, a.medidos], [somarDias(HOJE, -88), '2026-10-13', 5, 5]);
  assert.deepEqual(a.itens.map((x) => [x.id, x.origem, x.video]), [[A, 'recente', false], [C, 'recente', false], [B, 'recente', true], [D, 'top', false], [G, 'top', false]]);
  const pa = a.itens[0];
  assert.equal(pa.url, `https://www.pinterest.com/pin/${A}/`);
  assert.equal(pa.soma.impressoes, 880);
  assert.equal(pa.soma.seguidores_ganhos, 88);
  assert.equal(pa.engajamento_aprox, 88 + 176 + 88);
  assert.deepEqual(pa.desde_sempre, { comentarios: 4, reacoes: 9 });
  assert.deepEqual(pa.semanas[0], { semana: '2026-10-05', pronta: true, impressoes: 70, cliques_saida: 7, cliques_pin: 14, salvamentos: 7, seguidores_ganhos: 7, visitas_perfil: 7, video_visualizacoes: null });
  const pb = a.itens[2];
  assert.equal(pb.soma.seguidores_ganhos, null, 'vídeo não tem USER_FOLLOW');
  assert.equal(pb.semanas[0].video_visualizacoes, 35);
  // Piso, não o total da conta: só os Pins medidos que têm USER_FOLLOW (4 dos 5).
  assert.deepEqual(a.seguidores_por_semana[0], { semana: '2026-10-05', ganhos: 28, pins_medidos: 4 });
});

test('nada de token, segredo ou texto do Pinterest fora do cofre (dados, avisos, partes, diário)', async () => {
  const t = montar({ cx: conexao({ expira_em: new Date(Date.now() + 60_000).toISOString() }), token: { corpo: fx('token-renovado') } }), r = await t.rodar();
  const fora = visivel(r, t.logs);
  for (const s of [TOKEN, REFRESH, 'tk-ficticio-NOVO-pina', 'rf-ficticio-NOVO-pinr', ENV.PINTEREST_CLIENT_ID, ENV.PINTEREST_CLIENT_SECRET]) assert.ok(!fora.includes(s), s);
  assert.ok(!TRAVESSAO.test(fora), 'sem travessão nos textos para gente');
  assert.ok(t.logs.every((l) => l.startsWith('pinterest: ')));
});

// ------------------------------------------- os leitores (funções puras) --

test('O CASO RUIM dos leitores: resposta vazia ou torta vira null ou lista vazia, nunca zero', () => {
  for (const v of [null, undefined, 'x', 42, [], {}]) {
    assert.equal(P.lerAnalise(v), null);
    assert.deepEqual(P.lerQuebra(v), []);
    assert.equal(P.lerPin(v), null);
    assert.equal(P.lerPasta(v), null);
  }
  assert.equal(P.lerPerfil(null), null);
  assert.equal(P.lerTop(null), null);
  assert.equal(P.lerPublico([]), null);
  assert.deepEqual(P.lerTop({ pins: [{ pin_id: 'id com espaço' }, null, { pin_id: A }, { pin_id: A }] }).pins.map((p) => p.id), [A]);
  const m = P.traduzirMetricas({ IMPRESSION: -5, SAVE: 'abc', OUTBOUND_CLICK: '7', property1: 3 });
  assert.equal(m.impressoes, null, 'contagem negativa não é número');
  assert.equal(m.salvamentos, null);
  assert.equal(m.cliques_saida, 7);
  assert.equal(m.extras, null, 'nome que não é da API (property1) fica de fora');
  assert.equal(P.lerPerfil({ follower_count: 'muitos', monthly_views: -1 }).seguidores, null);
  // Pin sem id não vira publicação; Pin sem data também não.
  assert.equal(P.publicacaoDoPin(P.lerPin({ id: A })), null);
});

test('doc: a análise da conta do exemplo oficial (grupo "property1"), com as métricas além das 9 em extras', () => {
  const l = P.lerAnalise(fx('doc-analytics-conta'));
  assert.equal(l.resumo.impressoes, 240);
  assert.equal(l.resumo.cliques_saida, 20);
  assert.equal(l.resumo.taxa_cliques_saida, 0.08);
  assert.equal(l.resumo.salvamentos, 20);
  assert.deepEqual(l.resumo.extras, {
    ampliacoes: 1, taxa_ampliacoes: 0, visitas_perfil: 0, video_95: 8, video_10s: 2, video_tempo_medio: 2507.75,
    video_visualizacoes: 20, video_inicios: 29, video_tempo_v50: 10031,
  });
  const dia = l.porDia.get('2019-12-01');
  assert.equal(dia.status, 'READY');
  assert.equal(dia.impressoes, null, 'o exemplo só tem "property1" nas métricas do dia');
});

test('doc: o perfil do exemplo do schema Account (só números, sem nome)', () => {
  const p = P.lerPerfil(fx('doc-user-account'));
  assert.deepEqual([p.id, p.seguidores, p.seguindo, p.pins, p.pastas, p.visualizacoes_mensais, p.usuario, p.url], ['2783136121146311751', 10, 347, 339, 14, 163, null, null]);
});

test('doc: análise por Pin com desde sempre (lifetime_metrics) e dia antes de o Pin existir', () => {
  const l = P.lerAnalise(fx('pin-analytics-exemplo'));
  assert.deepEqual(l.vida, { comentarios: 4, reacoes: 9 });
  const a = P.montarAnalisePin({ id: A, video: false, origem: 'top' }, l, ['2026-10-05', '2026-09-28']);
  assert.deepEqual(a.semanas[0], { semana: '2026-10-05', pronta: false, impressoes: 15, cliques_saida: 1, cliques_pin: 3, salvamentos: 1, seguidores_ganhos: 1, visitas_perfil: 1, video_visualizacoes: null });
  assert.equal(a.semanas[1].impressoes, null, 'dia sem número (antes do Pin) não vira zero');
  assert.equal(a.engajamento_aprox, 5);
});

test('resumoDaSemana: dia faltando deixa o número null e a semana não pronta', () => {
  const porDia = new Map();
  for (let i = 0; i < 7; i++) if (i !== 3) porDia.set(somarDias('2026-10-05', i), { status: 'READY', impressoes: 10, engajamento: 1, cliques_pin: 1, cliques_saida: 1, salvamentos: 0 });
  const s = P.resumoDaSemana(porDia, '2026-10-05');
  assert.deepEqual([s.pronta, s.dias_com_dado, s.impressoes, s.salvamentos], [false, 6, null, null]);
  porDia.set('2026-10-08', { status: undefined, impressoes: 10, engajamento: 1, cliques_pin: 1, cliques_saida: 1, salvamentos: 0 });
  const t = P.resumoDaSemana(porDia, '2026-10-05');
  assert.deepEqual([t.pronta, t.impressoes, t.salvamentos], [true, 70, 0], 'status ausente não reprova o dia; zero de verdade continua zero');
});

test('montarSemanas: sem semana pronta e sem seguidores, nada vai (nem zero, nem null mandado)', () => {
  const r = P.montarSemanas({ hoje: HOJE, porDia: new Map(), seguidores: 50, leadsPorSemana: null });
  assert.deepEqual(r.linhas, []);
  const fora = P.montarSemanas({ hoje: '2026-10-12', porDia: null, seguidores: 2e9 });
  assert.deepEqual(fora.linhas, []);
  assert.deepEqual(fora.fora_da_faixa, ['seguidores 2026-10-05']);
});

test('anúncios: sem linha nenhuma, as colunas pedidas valem zero e as não pedidas null', () => {
  const porDia = P.lerAnunciosPorDia([], ['SPEND_IN_MICRO_DOLLAR', 'LEADS'], '2026-10-05', '2026-10-11');
  assert.equal(porDia.size, 7);
  const d = porDia.get('2026-10-05');
  assert.deepEqual([d.gasto, d.leads, d.cliques, d.impressoes_pagas], [0, 0, null, null]);
  const soma = P.somarAnuncios([...porDia.values()]);
  assert.deepEqual([soma.gasto, soma.leads, soma.cliques, soma.custo_por_lead], [0, 0, null, null]);
  const camp = P.lerAnaliseCampanhas(null, ['1'], ['LEADS']);
  assert.equal(camp.get('1').leads, 0);
});

test('classificarErro: cada recusa no seu motivo, sem ler o texto para a tela', () => {
  const c = (status, corpo = null, codigo = null) => P.classificarErro({ status, corpo, codigo });
  assert.equal(c(401, fx('erro-401-consumer')), 'aprovacao');
  assert.equal(c(401, { code: 3 }), 'aprovacao');
  assert.equal(c(403, { message: 'consumer type is not supported' }), 'aprovacao');
  assert.equal(c(401, fx('erro-401-token')), 'reconectar');
  assert.equal(c(401), 'reconectar');
  assert.equal(c(403, fx('erro-403-pinner')), 'sem_permissao');
  assert.equal(c(403, { code: 3 }), 'sem_permissao', 'código 3 sem o texto só vale no 401');
  assert.equal(c(429), 'cota');
  assert.equal(c(null, null, 'limite'), 'cota');
  assert.equal(c(400), 'formato');
  assert.equal(c(404), 'nao_encontrado');
  assert.equal(c(503), 'falhou');
  assert.equal(c(null, null, 'tempo'), 'prazo');
  assert.equal(c(null, null, 'rede'), 'falhou');
  assert.deepEqual(P.lerFalha(new Error('pinterest:x: http (HTTP 404)')), { status: 404, codigo: null, corpo: null });
});

test('miudezas: instante sem fuso é UTC, link do Pin, URL com vírgulas, escopos, canal, domínio e orçamento', () => {
  assert.equal(P.instante('2020-01-01T20:10:40'), Date.UTC(2020, 0, 1, 20, 10, 40));
  assert.equal(P.instante('2020-01-01T20:10:40-03:00'), Date.UTC(2020, 0, 1, 23, 10, 40));
  assert.equal(P.instante(1730227664), 1730227664000);
  assert.equal(P.instante('lixo'), null);
  assert.equal(P.linkDoPin('123'), 'https://www.pinterest.com/pin/123/');
  assert.equal(P.montarUrl('/x', { metric_types: ['IMPRESSION', 'SAVE'], vazio: null, b: 'a b' }), 'https://api.pinterest.com/v5/x?metric_types=IMPRESSION,SAVE&b=a%20b');
  assert.equal(P.lerEscopos([]), null);
  assert.deepEqual([...P.lerEscopos('boards:read,pins:read user_accounts:read')], ['boards:read', 'pins:read', 'user_accounts:read']);
  assert.equal(P.acharCanal([{ codigo: 'x', url_perfil: 'https://br.pinterest.com/a/' }]).codigo, 'x');
  assert.equal(P.acharCanal([{ codigo: 'x', url_perfil: 'https://pinterest-falso.com/a/' }]), null);
  assert.equal(P.dominioDoSite([{ codigo: 'site', url_perfil: 'https://www.exemplo.com.br/loja' }]), 'exemplo.com.br');
  assert.equal(P.dominioDoSite([]), 'impresilk.com.br');
  assert.deepEqual([P.orcamentoDaRodada(undefined), P.orcamentoDaRodada(0), P.orcamentoDaRodada(850), P.orcamentoDaRodada(5000)], [120, 120, 50, 0]);
  assert.deepEqual(P.semanasFechadas('2026-10-12'), SEGUNDAS, 'na segunda, a semana que começa hoje não entra');
  assert.deepEqual(P.semanasFechadas('2026-10-11'), SEGUNDAS.map((s) => somarDias(s, -7)), 'no domingo, a semana dele ainda não fechou');
});

test('escolherPinsParaAnalise: recentes (90 dias) primeiro, depois os dos tops, sem repetir, com teto', () => {
  const pins = [
    { id: '1', data: '2026-10-01', criado_em: '2026-10-01T10:00:00.000Z', video: false },
    { id: '2', data: '2026-07-01', criado_em: '2026-07-01T10:00:00.000Z', video: false },
    { id: '3', data: '2026-10-10', criado_em: '2026-10-10T10:00:00.000Z', video: true },
  ];
  const r = P.escolherPinsParaAnalise({ pins, tops: ['1', '2', '9', '9'], videos: new Set(['9']), hoje: HOJE });
  assert.deepEqual(r, [{ id: '3', video: true, origem: 'recente' }, { id: '1', video: false, origem: 'recente' }, { id: '2', video: false, origem: 'top' }, { id: '9', video: true, origem: 'top' }]);
  assert.equal(P.escolherPinsParaAnalise({ pins, tops: ['9'], hoje: HOJE, max: 1 }).length, 1);
});

test('o arquivo: FORMATO no topo, sem travessão, sem import de npm, só GET para a API, engagement_window_days só em comentário', () => {
  const texto = readFileSync(new URL('../supabase/functions/_shared/mkt-fontes/pinterest.mjs', import.meta.url), 'utf8');
  assert.ok(texto.indexOf('FORMATO') > 0 && texto.indexOf('FORMATO') < texto.indexOf('export const FONTE'));
  assert.ok(!TRAVESSAO.test(texto));
  const imports = [...texto.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['../marketing.mjs', '../mkt-oauth.mjs']);
  assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(texto));
  for (const linha of texto.split('\n').filter((l) => l.includes('engagement_window_days'))) assert.match(linha.trim(), /^(\*|\/\/)/, linha);
  assert.equal(P.FONTE, 'pinterest');
  assert.deepEqual(P.SECRETS, ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET']);
});

test('o caso ruim (revisão de 12/10): número fora da faixa e métrica recusada viram frase para gente, nunca o nome da API', () => {
  assert.equal(P.avisoDeForaDaFaixa(['impressoes 2026-09-28', 'leads 2026-10-05']), 'Alguns números vieram fora da faixa e ficaram de fora: as impressões da semana de 28/09 e os leads da semana de 05/10.');
  assert.equal(P.avisoDeMetricasRecusadas(['OUTBOUND_CLICK', 'SAVE_RATE']), 'O Pinterest recusou os cliques para o site e a taxa de salvamentos da conta; esses números ficaram vazios.');
  assert.equal(P.avisoDeMetricasRecusadas(['METRICA_NOVA']), 'O Pinterest recusou uma das métricas da conta; esse número ficou vazio.');
  // Toda métrica que a coleta pede tem nome para gente.
  for (const m of P.METRICAS_CONTA) assert.ok(P.NOME_METRICA[m], m);
});
