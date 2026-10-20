// O conector "google" (GA4 + Search Console + Perfil da Empresa) rodando de
// verdade contra um Google de mentira: as respostas saem das fixtures em
// tests/fixtures/mkt-google (exemplos da documentação e da pesquisa) e de um
// roteador que responde como cada API responde. Nenhuma credencial real,
// nenhuma chamada de rede. Começa pelos casos ruins.
//   node --test tests/mkt-google.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const SHARED = new URL('../supabase/functions/_shared/', import.meta.url);

// O _shared/mkt-oauth.mjs é outra peça do contrato (seção 2). Enquanto ele não
// existir, entra um renovar mínimo no formato do contrato (POST no token
// endpoint com o fetch recebido); quando existir, o teste usa o de verdade.
const OAUTH_REAL = existsSync(new URL('mkt-oauth.mjs', SHARED));
const OAUTH_FALSO = `
export async function renovar(fonte, conexao, env, fetch) {
  const ler = (n) => (typeof env === 'function' ? env(n) : env?.[n]);
  const corpo = new URLSearchParams({ client_id: ler('GOOGLE_OAUTH_CLIENT_ID'), client_secret: ler('GOOGLE_OAUTH_CLIENT_SECRET'), refresh_token: conexao.refresh_token, grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo.toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('renovacao recusada'), { status: r.status, codigo: j.error === 'invalid_grant' ? 'reconectar' : 'troca_falhou' });
  return { ...conexao, access_token: j.access_token, expira_em: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(), escopos: j.scope ? j.scope.split(' ') : conexao.escopos };
}`;
const pacote = await esbuild.build({
  entryPoints: [fileURLToPath(new URL('mkt-fontes/google.mjs', SHARED))], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
  plugins: [{ name: 'oauth', setup(b) {
    if (OAUTH_REAL) return;
    b.onResolve({ filter: /mkt-oauth\.mjs$/ }, () => ({ path: 'oauth-falso', namespace: 'falso' }));
    b.onLoad({ filter: /.*/, namespace: 'falso' }, () => ({ contents: OAUTH_FALSO, loader: 'js' }));
  } }],
});
const G = await import('data:text/javascript;base64,' + Buffer.from(pacote.outputFiles[0].text).toString('base64'));

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/mkt-google/${n}.json`, import.meta.url), 'utf8'));
const simples = (x) => JSON.parse(JSON.stringify(x));
const TRAVESSAO = /[\u2013\u2014]/;

// ------------------------------------------------------------ datas --
const HOJE = '2026-10-14';                    // quarta-feira
const somar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dias = (de, ate) => { const f = []; for (let d = de; d <= ate; d = somar(d, 1)) f.push(d); return f; };
const segunda = (iso) => somar(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
// Semana ISO calculada aqui de outro jeito (pela quinta-feira), para o teste
// não conferir o conector com ele mesmo.
const isoAnoSemana = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear(), q1 = new Date(Date.UTC(ano, 0, 1, 12)); q1.setUTCDate(1 + ((4 - q1.getUTCDay() + 7) % 7));
  return `${ano}${String(1 + Math.round((d - q1) / 6048e5)).padStart(2, '0')}`;
};
const SEGUNDAS = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];

// ------------------------------------------------- segredos de teste --
const SEGREDO = 'segredo-de-teste-nao-real-123';
const CLIENTE = 'cliente-de-teste.apps.googleusercontent.com';
const REFRESH = '1//refresh-de-teste-nao-real';
const ACESSO_NOVO = fx('token-renovado').access_token;
// Montados em tempo de execução: com o prefixo do Google escrito no arquivo, a
// varredura de segredos do GitHub poderia barrar o push (o repositório é público).
const PREFIXO_GOOGLE = ['ya', '29.'].join('');
const TOKEN_VAZADO = `${PREFIXO_GOOGLE}vazado-de-teste`;
const AUTH = 'https://www.googleapis.com/auth/';
const ESCOPOS_TODOS = [`${AUTH}analytics.readonly`, `${AUTH}webmasters.readonly`, `${AUTH}business.manage`];
const CONEXAO = { refresh_token: REFRESH, escopos: ESCOPOS_TODOS, conta: 'conta-de-teste@example.com', conectado_por: 'leo', conectado_em: '2026-10-11T12:00:00Z' };
const ENV = { GOOGLE_OAUTH_CLIENT_ID: CLIENTE, GOOGLE_OAUTH_CLIENT_SECRET: SEGREDO };
const CANAIS = [{ codigo: 'site', url_perfil: 'https://impresilk.com.br' }, { codigo: 'google', url_perfil: null }, { codigo: 'instagram', url_perfil: null }];

// --------------------------------------------------- o Google falso --
// GA4: a semana de 14/09 não tem registro nenhum (etiqueta fora do ar) e o
// dia 02/09 também não. O GA4 não manda linha zerada: simplesmente não manda.
const SEMANA_MORTA = '2026-09-14';
const DIAS_MORTOS = new Set([...dias('2026-09-14', '2026-09-20'), '2026-09-02']);
const VALORES = {
  sessionDefaultChannelGroup: ['Organic Search', 'Direct', 'AI Assistant'], sessionSourceMedium: ['google / organic', '(direct) / (none)'],
  sessionCampaignName: ['(organic)', '(direct)'], pagePathPlusQueryString: ['/', '/?page_id=144'], pageTitle: ['Impresilk', 'Valores'], hostName: ['impresilk.com.br'],
  landingPagePlusQueryString: ['/', '/?page_id=144'], city: ['Belo Horizonte', 'Contagem'], region: ['Minas Gerais'], country: ['Brazil'],
  deviceCategory: ['mobile', 'desktop'], newVsReturning: ['new', 'returning'], eventName: ['generate_lead'],
  linkDomain: ['wa.me', 'instagram.com'], linkUrl: ['https://wa.me/5531900000000', 'https://instagram.com/impresilk'], sessionGoogleAdsCampaignName: ['Fachadas'],
};
const TIPOS = { engagementRate: 'TYPE_FLOAT', bounceRate: 'TYPE_FLOAT', returnOnAdSpend: 'TYPE_FLOAT', averageSessionDuration: 'TYPE_SECONDS', userEngagementDuration: 'TYPE_SECONDS', advertiserAdCost: 'TYPE_CURRENCY', advertiserAdCostPerClick: 'TYPE_CURRENCY' };
const valorFalso = (m, chave) => {
  if (TIPOS[m] === 'TYPE_FLOAT') return '0.6123';
  if (TIPOS[m]) return '75.5';
  let h = m.length * 7; for (const c of chave) h += c.charCodeAt(0);
  return String(20 + (h % 500));
};
function relatorioFalso(req, reg) {
  reg.pedidosGa4.push(req);
  const dims = req.dimensions.map((d) => d.name), mets = req.metrics.map((m) => m.name);
  const {startDate, endDate} = req.dateRanges[0];
  const tempo = dims.find((d) => d === 'date' || d === 'isoYearIsoWeek'), cat = dims.filter((d) => d !== tempo);
  let instantes = [[null, 'periodo']];
  if (tempo === 'date') instantes = dias(startDate, endDate).filter((d) => !DIAS_MORTOS.has(d)).map((d) => [d.replaceAll('-', ''), d]);
  if (tempo === 'isoYearIsoWeek') { instantes = []; for (let s = segunda(startDate); s <= endDate; s = somar(s, 7)) if (s !== SEMANA_MORTA) instantes.push([isoAnoSemana(s), s]); }
  const de = (c) => VALORES[c] ?? ['x'];
  const n = cat.length ? Math.max(...cat.map((c) => de(c).length)) : 1;
  const tuplas = Array.from({ length: n }, (_, i) => cat.map((c) => de(c)[i % de(c).length]));
  const rows = [];
  for (const [api, chave] of instantes) for (const t of tuplas) {
    const k = [chave, ...t].join('|');
    rows.push({ dimensionValues: dims.map((d) => ({ value: d === tempo ? api : t[cat.indexOf(d)] })), metricValues: mets.map((m) => ({ value: valorFalso(m, k) })) });
  }
  const limite = Number(req.limit ?? 10000), offset = Number(req.offset ?? 0);
  return {
    dimensionHeaders: dims.map((name) => ({ name })), metricHeaders: mets.map((name) => ({ name, type: TIPOS[name] ?? 'TYPE_INTEGER' })),
    rows: rows.slice(offset, offset + limite), rowCount: rows.length, metadata: { currencyCode: 'BRL', timeZone: 'America/Sao_Paulo' },
    propertyQuota: { tokensPerDay: { consumed: 10, remaining: 190000 }, tokensPerHour: { consumed: 10, remaining: 39000 }, tokensPerProjectPerHour: { consumed: 10, remaining: 13000 } },
    kind: 'analyticsData#runReport',
  };
}
// Search Console: o dado chega com atraso (nada depois do primeiro dia
// incompleto + 1) e o dia 10/09 não teve impressão nenhuma.
const valorSc = (t, k) => { let h = t === 'c' ? 3 : 11; for (const c of k) h += c.charCodeAt(0); return t === 'c' ? 100 + (h % 60) : 4000 + (h % 900); };
function scFalso(c, o) {
  const dims = c.dimensions ?? [], tipo = c.type ?? 'web';
  if (tipo !== 'web') return tipo === 'image' ? { rows: [{ clicks: 2, impressions: 150, ctr: 0.0133, position: 12.5 }], responseAggregationType: 'byProperty' } : { responseAggregationType: 'byProperty' };
  if (c.dimensionFilterGroups) { const marca = c.dimensionFilterGroups[0].filters[0].operator === 'includingRegex'; return { rows: [{ clicks: marca ? 30 : 50, impressions: marca ? 400 : 3000, ctr: 0.05, position: marca ? 1.3 : 15 }] }; }
  if (!dims.length) return { rows: [{ clicks: valorSc('c', c.startDate), impressions: valorSc('i', c.startDate), ctr: 0.025, position: 14.2 }], responseAggregationType: 'byProperty' };
  if (dims[0] === 'date') {
    const rows = dias(c.startDate, c.endDate).filter((d) => (!o.fid || d < somar(o.fid, 1)) && d !== '2026-09-10').map((d) => ({ keys: [d], clicks: valorSc('c', d) % 20, impressions: valorSc('i', d) % 700, ctr: 0.02, position: 15.5 }));
    return { rows, responseAggregationType: 'byProperty', ...(c.dataState === 'all' && o.fid ? { metadata: { first_incomplete_date: o.fid } } : {}) };
  }
  if (dims[0] === 'hour') return fx('sc-por-hora');
  if (c.startRow) return { rows: [] };
  if (dims[0] === 'query') return fx('sc-consultas');
  if (dims[0] === 'page') return fx('sc-paginas');
  if (dims[0] === 'country') return { rows: [{ keys: ['bra'], clicks: 33, impressions: 1500, ctr: 0.022, position: 12 }] };
  if (dims[0] === 'device') return { rows: [{ keys: ['MOBILE'], clicks: 20, impressions: 900, ctr: 0.022, position: 11 }, { keys: ['DESKTOP'], clicks: 13, impressions: 600, ctr: 0.021, position: 14 }] };
  return { rows: [] };
}
// Perfil: o dia 01/09 veio sem value em tudo (zero, o Google omite) e o dia
// 03/09 nem veio nos cliques no site (null). Reserva nunca tem value.
const gd = (d) => { const [year, month, day] = d.split('-').map(Number); return { year, month, day }; };
const valorPerfil = (m, d) => { let h = m.length; for (const c of d) h += c.charCodeAt(0); return 1 + (h % 30); };
const perfilNoDia = (m, d) => (m === 'WEBSITE_CLICKS' && d === '2026-09-03' ? null : d === '2026-09-01' || m === 'BUSINESS_BOOKINGS' ? 0 : valorPerfil(m, d));
function metricasFalsas(url, o) {
  const q = new URL(url).searchParams, metricas = q.getAll('dailyMetrics');
  if (metricas.some((m) => (o.recusarMetricas ?? []).includes(m))) return { status: 400, corpo: fx('gbp-erro-metrica-recusada') };
  const data = (p) => `${q.get(`dailyRange.${p}_date.year`)}-${q.get(`dailyRange.${p}_date.month`).padStart(2, '0')}-${q.get(`dailyRange.${p}_date.day`).padStart(2, '0')}`;
  const dd = dias(data('start'), data('end'));
  return ok({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: metricas.map((m) => ({ dailyMetric: m, timeSeries: { datedValues: dd
    .filter((d) => perfilNoDia(m, d) !== null)
    .map((d) => (perfilNoDia(m, d) === 0 ? { date: gd(d) } : { date: gd(d), value: String(perfilNoDia(m, d)) })) } })) }] });
}
function avaliacoesFalsas(url) {
  const q = new URL(url).searchParams, ordem = q.get('orderBy'), token = q.get('pageToken');
  if (!ordem) return ok(fx(token === 'r2' ? 'gbp-avaliacoes-p2' : 'gbp-avaliacoes-p1'));
  if (ordem === 'rating' && !token) return ok(fx('gbp-avaliacoes-nota'));
  return ok({ reviews: [], totalReviewCount: 4 });
}
const ok = (corpo) => ({ status: 200, corpo });
const erro = (status, corpo) => ({ status, corpo });
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function googleFalso(url, init, o, reg) {
  const corpo = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
  if (url === TOKEN_URL) return ok(fx('token-renovado'));
  if (/analyticsadmin\.googleapis\.com\/v1beta\/accountSummaries/.test(url)) return ok(fx('ga4-contas'));
  if (/properties\/111\/dataStreams/.test(url)) return ok(fx('ga4-fluxos-111'));
  if (/properties\/222\/dataStreams/.test(url)) return ok(fx('ga4-fluxos-222'));
  if (/properties\/222\/keyEvents/.test(url)) return ok(fx('ga4-eventos-chave'));
  if (/properties\/222\/googleAdsLinks/.test(url)) return ok({});
  if (/analyticsadmin\.googleapis\.com\/v1beta\/properties\/222$/.test(url)) return ok(fx('ga4-propriedade'));
  if (/:batchRunReports$/.test(url)) return ok({ reports: corpo.requests.map((r) => relatorioFalso(r, reg)), kind: 'analyticsData#batchRunReports' });
  if (/:runReport$/.test(url)) return ok(relatorioFalso(corpo, reg));
  if (url === 'https://www.googleapis.com/webmasters/v3/sites') return ok(fx('sc-sites'));
  if (/searchAnalytics\/query$/.test(url)) return ok(scFalso(corpo, o));
  if (/\/sitemaps$/.test(url)) return ok(fx('sc-sitemaps'));
  if (/urlInspection\/index:inspect$/.test(url)) return ok(fx('sc-inspecao'));
  if (/mybusinessaccountmanagement\.googleapis\.com\/v1\/accounts/.test(url)) return ok(fx(url.includes('pageToken=p2') ? 'gbp-contas-p2' : 'gbp-contas-p1'));
  if (/accounts\/100\/locations\?/.test(url)) return ok({});
  if (/accounts\/111\/locations\?/.test(url)) return ok(fx('gbp-locais'));
  if (/VoiceOfMerchantState$/.test(url)) return ok(fx('gbp-situacao'));
  if (/locations\/222\/attributes$/.test(url)) return ok(fx('gbp-atributos'));
  if (/fetchMultiDailyMetricsTimeSeries/.test(url)) return metricasFalsas(url, o);
  if (/searchkeywords\/impressions\/monthly/.test(url)) return ok(fx('gbp-termos'));
  if (/\/reviews\?/.test(url)) return avaliacoesFalsas(url);
  if (/\/localPosts\?/.test(url)) return ok(fx('gbp-posts'));
  if (/\/media\/customers\?/.test(url)) return ok(fx('gbp-midias-clientes'));
  if (/\/media\?/.test(url)) return ok(fx('gbp-midias'));
  if (/\/followers\/metadata$/.test(url)) return ok(fx('gbp-seguidores'));
  reg.naoAchadas.push(url);
  return erro(404, { error: { code: 404, message: 'rota falsa', status: 'NOT_FOUND' } });
}

/** ctx no formato do contrato. Por padrão o fetchJson LANÇA o erro (com
 *  .status e .dados); com envelope: true ele devolve {ok, status, dados}. */
function montar({ hoje = HOJE, conexao = CONEXAO, env = ENV, canais = CANAIS, prazo, rotas = [], envelope = false, opcoes = {}, anterior, medicoes } = {}) {
  const reg = { chamadas: [], pedidosGa4: [], naoAchadas: [], logs: [] };
  const o = { fid: '2026-10-12', ...opcoes };
  const responder = async (url, init) => {
    for (const [padrao, fn] of rotas) if (padrao.test(url)) { const r = await fn(url, init, reg); if (r) return r; }
    return googleFalso(url, init, o, reg);
  };
  const ctx = {
    env: (n) => env[n] ?? null, conexao, hoje, canais, anterior, ga4Medicoes: medicoes,
    prazo: prazo ? () => prazo(reg) : () => 100_000,
    log: (t) => reg.logs.push(t),
    async fetchJson(url, opts = {}) {
      reg.chamadas.push({ url, method: opts.method ?? 'GET', body: opts.body, headers: opts.headers, rotulo: opts.rotulo });
      const r = await responder(url, opts);
      if (envelope) return { ok: r.status < 400, status: r.status, dados: r.corpo };
      if (r.status >= 400) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status, dados: r.corpo });
      return r.corpo;
    },
    async fetch(url, init = {}) {
      reg.chamadas.push({ url, method: init.method, token: true, body: String(init.body ?? '') });
      const r = await responder(url, init);
      return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
    },
  };
  return { ctx, reg };
}
const apis = (reg) => reg.chamadas.filter((c) => !c.token);
const de = (reg, re) => reg.chamadas.filter((c) => re.test(c.url));
/** Nada de segredo em lugar nenhum da saída (a conexão renovada é a única que
 *  leva token, de propósito: a coletora regrava no cofre). */
function semSegredo(r) {
  const {conexao, ...resto} = simples(r);
  const texto = JSON.stringify(resto);
  for (const s of [SEGREDO, REFRESH, ACESSO_NOVO, CLIENTE]) assert.ok(!texto.includes(s), `segredo na saída: ${s.slice(0, 6)}...`);
  for (const a of r.avisos) assert.ok(!TRAVESSAO.test(a), `travessão em aviso: ${a}`);
  for (const p of Object.values(r.partes)) assert.ok(!TRAVESSAO.test(p.motivo ?? ''), `travessão em motivo: ${p.motivo}`);
  return conexao;
}

// ============================================================ casos ruins ==

test('Search Console retoma a página pendente após o prazo e reaproveita inspeções do mesmo dia', async () => {
  const limitado = (reg) => de(reg, /urlInspection\/index:inspect$/).length < 1 ? 100_000 : 5_000;
  const primeira = montar({ prazo: limitado });
  const a = await G.coletar(primeira.ctx);
  assert.equal(a.dados.search_console.inspecoes.length, 1);
  const segundaColeta = montar({ anterior: a.dados, prazo: limitado });
  const b = await G.coletar(segundaColeta.ctx);
  const pedidos = de(segundaColeta.reg, /urlInspection\/index:inspect$/);
  assert.equal(pedidos[0].body.inspectionUrl, 'https://impresilk.com.br/?page_id=144');
  assert.equal(b.dados.search_console.inspecoes.length, 2);
  assert.ok(!b.avisos.some((v) => /tempo para inspecionar/.test(v)));
  const terceira = montar({ anterior: b.dados });
  const c = await G.coletar(terceira.ctx);
  assert.equal(de(terceira.reg, /urlInspection\/index:inspect$/).length, 0);
  assert.equal(c.dados.search_console.inspecoes.length, 2);
  const outroDia = montar({ anterior: c.dados, hoje: somar(HOJE, 1) });
  await G.coletar(outroDia.ctx);
  assert.equal(de(outroDia.reg, /urlInspection\/index:inspect$/).length, 2);
});

test('Search Console não reutiliza inspeções de outra propriedade', async () => {
  const { ctx } = montar();
  const a = await G.coletar(ctx);
  a.dados.search_console.propriedade.site = 'sc-domain:outra-empresa.example';
  const seguinte = montar({ anterior: a.dados });
  await G.coletar(seguinte.ctx);
  assert.equal(de(seguinte.reg, /urlInspection\/index:inspect$/).length, 2);
});

test('o caso ruim: sem o client OAuth no Supabase, falta_configurar nas três partes e nenhuma chamada', async () => {
  const {ctx, reg} = montar({ env: { GOOGLE_OAUTH_CLIENT_ID: CLIENTE } });
  const r = await G.coletar(ctx);
  assert.equal(r.estado, 'falta_configurar');
  for (const p of G.PARTES) assert.equal(r.partes[p].estado, 'falta_configurar');
  assert.match(r.partes.ga4.motivo, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.equal(reg.chamadas.length, 0);
  assert.deepEqual(r.semanas, []); assert.deepEqual(r.publicacoes, []);
  assert.deepEqual(G.SECRETS, ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']);
  assert.equal(G.FONTE, 'google');
  semSegredo(r);
});

test('sem conexão no cofre (ou sem refresh token): falta_conectar e nenhuma chamada', async () => {
  for (const conexao of [null, { escopos: ESCOPOS_TODOS, access_token: 'acesso-vencido-de-teste', expira_em: '2020-01-01T00:00:00Z' }]) {
    const {ctx, reg} = montar({ conexao });
    const r = await G.coletar(ctx);
    assert.equal(r.estado, 'falta_conectar');
    assert.equal(reg.chamadas.length, 0);
  }
});

test('refresh token morto (invalid_grant): reconectar nas três partes, UMA chamada (a do token) e nenhum segredo na saída', async () => {
  const {ctx, reg} = montar({ rotas: [[/oauth2\.googleapis\.com\/token/, () => erro(400, fx('token-invalid-grant'))]] });
  const r = await G.coletar(ctx);
  assert.equal(r.estado, 'reconectar');
  for (const p of G.PARTES) assert.equal(r.partes[p].estado, 'reconectar');
  assert.equal(reg.chamadas.length, 1);
  assert.equal(reg.chamadas[0].url, TOKEN_URL);
  assert.match(reg.chamadas[0].body, /grant_type=refresh_token/);
  assert.equal(r.conexao, undefined);
  semSegredo(r);
});

test('a renovação falha de vários jeitos: cada um vira o estado certo', () => {
  assert.equal(G.falhaDaRenovacao(Object.assign(new Error('x'), { codigo: 'invalid_grant' })).estado, 'reconectar');
  assert.equal(G.falhaDaRenovacao({ status: 400, dados: { error: 'invalid_grant' } }).estado, 'reconectar');
  // Os códigos do ErroOAuth do mkt-oauth.mjs, com o mesmo estado que a coletora dá.
  assert.equal(G.falhaDaRenovacao({ codigo: 'reconectar', status: 400 }).estado, 'reconectar');
  assert.equal(G.falhaDaRenovacao({ codigo: 'credencial_recusada', status: 401 }).estado, 'erro', 'credencial recusada não é reconectar');
  assert.equal(G.falhaDaRenovacao({ codigo: 'troca_falhou', status: 400 }).estado, 'erro');
  assert.equal(G.falhaDaRenovacao(new Error('invalid_client')).estado, 'erro');
  assert.equal(G.falhaDaRenovacao({ codigo: 'falta_configurar' }).estado, 'falta_configurar');
  assert.equal(G.falhaDaRenovacao({ codigo: 'sem_refresh' }).estado, 'falta_conectar');
  assert.equal(G.falhaDaRenovacao(new TypeError('fetch failed')).estado, 'erro');
  assert.equal(G.falhaDaRenovacao({ status: 503 }).estado, 'erro');
});

test('caixinha desmarcada no consentimento: só o Perfil fica falta_conectar, e o Perfil nem é chamado', async () => {
  const {ctx, reg} = montar({
    conexao: { ...CONEXAO, escopos: [`${AUTH}analytics.readonly`, 'webmasters.readonly'] },
    rotas: [[/oauth2\.googleapis\.com\/token/, () => ok({ ...fx('token-renovado'), scope: `${AUTH}analytics.readonly ${AUTH}webmasters.readonly` })]],
  });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.perfil.estado, 'falta_conectar');
  assert.match(r.partes.perfil.motivo, /Perfil da Empresa/);
  assert.equal(r.partes.ga4.estado, 'ok'); assert.equal(r.partes.search_console.estado, 'ok');
  assert.equal(r.estado, 'parcial');
  assert.equal(de(reg, /mybusiness|businessprofileperformance/).length, 0);
  assert.equal(r.dados.perfil, null);
  assert.ok(!r.semanas.some((s) => s.canal === 'google'));
});

test('401 no GA4: reconectar, a chamada não se repete e nada mais é chamado depois', async () => {
  const {ctx, reg} = montar({
    conexao: { ...CONEXAO, escopos: ['analytics.readonly'] },
    rotas: [
      // O escopo que volta na renovação é o que vale (o Léo pode ter tirado uma permissão).
      [/oauth2\.googleapis\.com\/token/, () => ok({ ...fx('token-renovado'), scope: `${AUTH}analytics.readonly` })],
      [/accountSummaries/, () => erro(401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } })],
    ],
  });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'reconectar');
  assert.equal(r.partes.perfil.estado, 'falta_conectar');
  assert.equal(r.estado, 'reconectar');
  assert.equal(apis(reg).length, 1);
});

test('401 numa parte com as três ligadas: as outras param de chamar e ficam reconectar', async () => {
  const {ctx, reg} = montar({ rotas: [[/webmasters\/v3\/sites$/, () => erro(401, { error: { code: 401, status: 'UNAUTHENTICATED' } })]] });
  const r = await G.coletar(ctx);
  assert.equal(r.estado, 'reconectar');
  for (const p of G.PARTES) assert.equal(r.partes[p].estado, 'reconectar', p);
  assert.equal(de(reg, /webmasters\/v3\/sites$/).length, 1);
  // GA4 e Perfil começaram juntos; depois do 401 ninguém pede mais nada.
  assert.ok(apis(reg).length <= 4, `chamadas depois do 401: ${apis(reg).length}`);
});

test('Perfil sem aprovação do Google (cota 0, 429): só o Perfil fica aguardando_aprovacao; GA4 e Search Console seguem', async () => {
  const {ctx, reg} = montar({ rotas: [[/mybusinessaccountmanagement/, () => erro(429, fx('gbp-erro-cota-zero'))]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.perfil.estado, 'aguardando_aprovacao');
  assert.match(r.partes.perfil.motivo, /aprovou/);
  assert.equal(r.partes.ga4.estado, 'ok'); assert.equal(r.partes.search_console.estado, 'ok');
  assert.equal(r.estado, 'parcial');
  assert.equal(de(reg, /mybusinessaccountmanagement/).length, 1, 'cota 0 não insiste');
  assert.equal(de(reg, /mybusiness\.googleapis|businessprofileperformance/).length, 0);
  // 429 sem o detalhe da cota, mas na PRIMEIRA chamada: também é a fila do Google.
  const b = montar({ rotas: [[/mybusinessaccountmanagement/, () => erro(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })]] });
  assert.equal((await G.coletar(b.ctx)).partes.perfil.estado, 'aguardando_aprovacao');
});

test('o caso ruim: API v1 do Perfil desligada é falta_configurar, com o nome da API a ativar (a v1 se ativa antes da aprovação); no GA4 também', async () => {
  // O Google já aprovou, mas a Account Management API não foi ativada: o
  // conserto é ativar, e não esperar o Google.
  const p = montar({ rotas: [[/mybusinessaccountmanagement/, () => erro(403, fx('gbp-erro-api-v1-desligada'))]] });
  const rp = await G.coletar(p.ctx);
  assert.equal(rp.partes.perfil.estado, 'falta_configurar');
  assert.match(rp.partes.perfil.motivo, /My Business Account Management API/);
  assert.match(rp.partes.perfil.motivo, /mybusinessaccountmanagement\.googleapis\.com/);
  assert.equal(rp.partes.ga4.estado, 'ok');
  // A Business Information desligada, na lista de perfis: o mesmo.
  const info = { error: { code: 403, status: 'PERMISSION_DENIED', message: 'API has not been used in project 1 before or it is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { service: 'mybusinessbusinessinformation.googleapis.com' } }] } };
  const b = montar({ rotas: [[/accounts\/111\/locations\?/, () => erro(403, info)]] });
  const rb = await G.coletar(b.ctx);
  assert.equal(rb.partes.perfil.estado, 'falta_configurar');
  assert.match(rb.partes.perfil.motivo, /Business Information API/);
  // Sem o serviço no erro: vale o host que foi chamado.
  const semServico = { error: { code: 403, status: 'PERMISSION_DENIED', message: 'API is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }] } };
  assert.equal(G.classificarErro('perfil', { status: 403, dados: semServico }, { servico: 'mybusinessaccountmanagement.googleapis.com' }).estado, 'falta_configurar');
  assert.equal(G.classificarErro('perfil', { status: 403, dados: semServico }, { servico: 'mybusiness.googleapis.com' }).estado, 'aguardando_aprovacao');
  // Só a v4 (invisível até aprovar) é espera; e a cota 0 continua sendo espera.
  assert.equal(G.classificarErro('perfil', { status: 403, dados: fx('gbp-erro-api-desligada') }).estado, 'aguardando_aprovacao');
  assert.equal(G.classificarErro('perfil', { status: 429, dados: fx('gbp-erro-cota-zero') }).estado, 'aguardando_aprovacao');
  for (const t of [rp.partes.perfil.motivo, rb.partes.perfil.motivo]) assert.equal(TRAVESSAO.test(t), false);
  const g = montar({ rotas: [[/analyticsadmin/, () => erro(403, fx('ga4-erro-api-desligada'))]] });
  const r = await G.coletar(g.ctx);
  assert.equal(r.partes.ga4.estado, 'falta_configurar');
  assert.match(r.partes.ga4.motivo, /não está ativada/);
  assert.equal(r.partes.perfil.estado, 'ok');
});

test('a Google My Business API (v4) ainda desligada: métricas do Perfil chegam, avaliações e posts viram UM aviso', async () => {
  const {ctx, reg} = montar({ rotas: [[/mybusiness\.googleapis\.com\/v4/, () => erro(403, fx('gbp-erro-api-desligada'))]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.perfil.estado, 'parcial');
  assert.ok(r.dados.perfil.dias.length > 0);
  // Parte parcial: o bloco que não veio SAI do objeto, para a coletora manter o de antes.
  for (const k of ['avaliacoes', 'posts', 'seguidores', 'fotos']) assert.ok(!(k in r.dados.perfil), k);
  assert.equal(r.avisos.filter((a) => /My Business API/.test(a)).length, 1);
  assert.equal(de(reg, /mybusiness\.googleapis\.com\/v4/).length, 1, 'uma tentativa só');
  assert.deepEqual(r.publicacoes, []);
});

test('403 de escopo no GA4 vira falta_conectar só do GA4', async () => {
  const {ctx} = montar({ conexao: { ...CONEXAO, escopos: undefined }, rotas: [[/analyticsadmin/, () => erro(403, fx('ga4-erro-escopo'))]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'falta_conectar');
  assert.equal(r.partes.search_console.estado, 'ok');
});

test('403 no Search Console é "sem permissão na propriedade", nunca reconectar', async () => {
  const {ctx} = montar({ rotas: [[/searchAnalytics/, () => erro(403, fx('sc-erro-sem-permissao'))]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.search_console.estado, 'erro');
  assert.match(r.partes.search_console.motivo, /permissão/);
  assert.equal(r.partes.ga4.estado, 'ok');
});

test('sem a propriedade do G-W14DLRNWRD no GA4, ou sem propriedade verificada no Search Console: falta_configurar com o motivo', async () => {
  const {ctx} = montar({
    rotas: [[/properties\/222\/dataStreams/, () => ok(fx('ga4-fluxos-111'))], [/webmasters\/v3\/sites$/, () => ok(fx('sc-sites-nao-verificado'))]],
    canais: [{ codigo: 'site', url_perfil: 'https://impresilk.com.br' }],
  });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'falta_configurar');
  assert.match(r.partes.ga4.motivo, /G-W14DLRNWRD/);
  assert.equal(r.partes.search_console.estado, 'falta_configurar');
  assert.ok(!r.semanas.some((s) => s.canal === 'site'), 'sem dado, sem número da semana');
});

test('relatório recusado num lote: refaz um por um; o recusado vira aviso (sem travessão, sem token) e o resto chega', async () => {
  const recusa = { error: { code: 400, status: 'INVALID_ARGUMENT', message: `Field newVsReturning is not valid \u2014 Bearer ${TOKEN_VAZADO} here` } };
  const {ctx, reg} = montar({ rotas: [
    [/:batchRunReports$/, (u, init) => (JSON.stringify(init.body).includes('newVsReturning') ? erro(400, recusa) : null)],
    [/:runReport$/, (u, init) => (JSON.stringify(init.body).includes('newVsReturning') ? erro(400, recusa) : null)],
  ] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'ok');
  assert.equal(r.dados.ga4.novos_recorrentes, null);
  assert.deepEqual(simples(r.dados.ga4.recusados), ['novos_recorrentes']);
  assert.ok(r.dados.ga4.paginas.length > 0 && r.dados.ga4.cidades.length > 0, 'os outros do mesmo lote chegaram');
  assert.ok(!r.avisos.some((a) => /novos_recorrentes/.test(a)), 'nome interno do relatório no aviso');
  const aviso = r.avisos.find((a) => /usuários novos e recorrentes/.test(a));
  assert.ok(aviso && !TRAVESSAO.test(aviso) && !aviso.includes('vazado') && !/Field|not valid/.test(aviso), aviso);
  // O detalhe técnico fica só no diário, sem token.
  assert.ok(reg.logs.some((l) => /novos_recorrentes recusado \(Field newVsReturning is not valid/.test(l)), reg.logs.join(' | '));
  assert.ok(!reg.logs.join(' ').includes('vazado'));
  assert.ok(de(reg, /:runReport$/).length >= 5, 'o lote foi refeito um por um');
  semSegredo(r);
});

test('o caso ruim: nenhum aviso do google leva nome interno de bloco ou o inglês do Google (Search Console, corte do GA4, perfil marcado)', async () => {
  const ingles = { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument: dimension country is not allowed here.' } };
  const corte = (req) => ({ ...relatorioFalso(req, { pedidosGa4: [] }), metadata: { currencyCode: 'BRL', timeZone: 'America/Sao_Paulo', dataTruncationReasons: [{ dataTruncationType: 'DATA_TRUNCATION_TYPE_GOOGLE_ADS', dataTruncationDate: '2023-10-01' }, { dataTruncationType: 'DATA_TRUNCATION_TYPE_NOVO_QUE_NINGUEM_CONHECE' }] } });
  const {ctx, reg} = montar({ rotas: [
    [/searchAnalytics\/query$/, (u, init) => ((init.body?.dimensions ?? [])[0] === 'country' ? erro(400, ingles) : null)],
    [/:batchRunReports$/, (u, init) => ok({ reports: init.body.requests.map(corte) })],
    [/VoiceOfMerchantState$/, () => ok({ hasVoiceOfMerchant: true, complyWithGuidelines: { recommendationReason: 'BUSINESS_LOCATION_SUSPENDED' } })],
  ] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.search_console.estado, 'ok');
  assert.ok(r.avisos.includes('Search Console: o Google recusou os países; esse quadro fica sem dado nesta coleta.'), r.avisos.join(' | '));
  assert.ok(r.avisos.includes('GA4: o Google cortou dados pela regra de 36 meses do Google Ads, antes de 01/10/2023.'), r.avisos.join(' | '));
  assert.ok(r.avisos.includes('GA4: o Google cortou dados por uma regra de guarda dele.'));
  assert.ok(r.avisos.includes('Perfil da Empresa: o Google marcou o perfil como suspenso; confira no Perfil da Empresa.'));
  for (const a of r.avisos) {
    assert.ok(!/"[a-z_ ]+"|\b[a-z]+_[a-z_]+\b|[A-Z]{3,}_[A-Z_]+|invalid argument|not allowed/.test(a), `aviso com nome interno ou inglês: ${a}`);
    assert.ok(!TRAVESSAO.test(a), a);
  }
  // O detalhe técnico ficou no diário.
  assert.ok(reg.logs.some((l) => /bloco paises recusado \(Request contains an invalid argument/.test(l)), reg.logs.join(' | '));
  assert.ok(reg.logs.some((l) => /corte de dados DATA_TRUNCATION_TYPE_NOVO_QUE_NINGUEM_CONHECE/.test(l)));
});

test('resposta grande demais para a coletora (HTTP 200): o lote refaz um por um, e a mensagem não é "erro 200"', async () => {
  const grande = () => { throw Object.assign(new Error('ga4 lote: grande_demais (HTTP 200)'), { codigo: 'grande_demais', status: 200 }); };
  const {ctx, reg} = montar({ rotas: [[/:batchRunReports$/, grande], [/:runReport$/, (u, init) => (JSON.stringify(init.body).includes('linkUrl') ? grande() : null)]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'ok');
  assert.ok(r.dados.ga4.semanas.length > 0 && r.dados.ga4.paginas.length > 0, 'os outros vieram um por um');
  assert.deepEqual(simples(r.dados.ga4.recusados), ['cliques_saida']);
  assert.ok(de(reg, /:runReport$/).length >= 12);
  const c = G.classificarErro('search_console', { ok: false, status: 200, codigo: 'grande_demais' });
  assert.deepEqual([c.estado, /tamanho máximo/.test(c.motivo)], ['erro', true]);
});

test('métrica do Perfil recusada: pede uma por uma e só ela fica vazia', async () => {
  const {ctx} = montar({ opcoes: { recusarMetricas: ['BUSINESS_FOOD_MENU_CLICKS'] } });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.perfil.estado, 'ok');
  assert.deepEqual(simples(r.dados.perfil.metricas_recusadas), ['BUSINESS_FOOD_MENU_CLICKS']);
  assert.ok(r.dados.perfil.dias.every((d) => d.cliques_cardapio === null));
  assert.ok(r.dados.perfil.dias.some((d) => d.ligacoes > 0));
  assert.ok(r.avisos.some((a) => a === 'Perfil da Empresa: o Google recusou os cliques no cardápio; esses números ficam vazios.'), r.avisos.join(' | '));
  assert.ok(!r.avisos.some((a) => /BUSINESS_FOOD_MENU_CLICKS/.test(a)), 'nome da API no aviso');
  // Uma impressão recusada: a soma das 4 visualizações não sai pela metade.
  const b = montar({ opcoes: { recusarMetricas: ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS'] } });
  const rb = await G.coletar(b.ctx);
  assert.ok(rb.semanas.filter((s) => s.canal === 'google').every((s) => s.numeros.impressoes === undefined));
});

test('o prazo acabando: para de chamar e fica parcial, com o motivo', async () => {
  const {ctx, reg} = montar({ prazo: (reg) => (reg.chamadas.length < 20 ? 100_000 : 5_000) });
  const r = await G.coletar(ctx);
  assert.ok(reg.chamadas.length <= 22, `chamou depois do prazo: ${reg.chamadas.length}`);
  assert.equal(r.estado, 'parcial');
  assert.ok(G.PARTES.some((p) => /tempo/.test(r.partes[p].motivo ?? '')));
  // Parte sem dado nenhum não é "parcial": a coletora apagaria o retrato bom de antes.
  for (const p of G.PARTES) if (!r.dados[p]) assert.notEqual(r.partes[p].estado, 'parcial', p);
  // Sem tempo para nada (nem a primeira chamada de cada parte): partes com erro, fonte parcial.
  const nada = montar({ prazo: () => 5_000 });
  const rn = await G.coletar(nada.ctx);
  assert.equal(rn.estado, 'parcial');
  assert.ok(G.PARTES.every((p) => rn.partes[p].estado === 'erro'));
  assert.equal(apis(nada.reg).length, 0);
});

test('"tempo" da coletora: com o orçamento no fim é falta de tempo; com folga é o Google lento', async () => {
  const lento = Object.assign(new Error('sc sites: tempo'), { codigo: 'tempo', status: null });
  const a = montar({ rotas: [[/webmasters\/v3\/sites$/, () => { throw lento; }]] });
  const ra = await G.coletar(a.ctx);
  assert.equal(ra.partes.search_console.estado, 'erro');
  assert.match(ra.partes.search_console.motivo, /não respondeu a tempo/);
  const b = montar({ prazo: (reg) => (reg.chamadas.some((c) => /webmasters\/v3\/sites$/.test(c.url)) ? 3_000 : 100_000), rotas: [[/webmasters\/v3\/sites$/, () => { throw lento; }]] });
  const rb = await G.coletar(b.ctx);
  assert.match(rb.partes.search_console.motivo, /tempo da coleta acabou/);
  const rede = montar({ rotas: [[/webmasters\/v3\/sites$/, () => { throw Object.assign(new Error('x'), { codigo: 'rede' }); }]] });
  assert.match((await G.coletar(rede.ctx)).partes.search_console.motivo, /rede/);
});

test('renovação com falha passageira e token ainda bom por uns minutos: coleta com ele e avisa', async () => {
  const conexao = { ...CONEXAO, access_token: 'acesso-quase-vencendo-de-teste', expira_em: new Date(Date.now() + 4 * 60_000).toISOString() };
  const {ctx, reg} = montar({ conexao, rotas: [[/oauth2\.googleapis\.com\/token/, () => erro(503, { error: 'backend_error' })]] });
  const r = await G.coletar(ctx);
  assert.equal(r.estado, 'ok');
  assert.equal(apis(reg)[0].headers.Authorization, 'Bearer acesso-quase-vencendo-de-teste');
  assert.ok(r.avisos.some((a) => /usou a de antes/.test(a)));
  assert.equal(r.conexao, undefined);
});

test('o caso ruim: quase sem erros de servidor sobrando na hora (10 por projeto e propriedade), o GA4 para antes de bloquear o projeto', async () => {
  const quase = (req) => ({ ...relatorioFalso(req, { pedidosGa4: [] }), propertyQuota: { tokensPerDay: { remaining: 150000 }, tokensPerProjectPerHour: { remaining: 13000 }, serverErrorsPerProjectPerHour: { consumed: 7, remaining: 3 } } });
  const {ctx, reg} = montar({ rotas: [[/:batchRunReports$/, (u, init) => ok({ reports: init.body.requests.map(quase) })]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'parcial');
  assert.match(r.partes.ga4.motivo, /cota/);
  assert.equal(de(reg, /analyticsdata/).length, 1, 'um lote só');
  assert.equal(r.dados.ga4.cota.erros_servidor_restantes, 3);
});

test('cota de tokens do GA4 baixa: para de pedir relatório antes de bloquear o projeto', async () => {
  const baixa = (req) => ({ ...relatorioFalso(req, { pedidosGa4: [] }), propertyQuota: { tokensPerDay: { remaining: 150000 }, tokensPerProjectPerHour: { consumed: 13800, remaining: 200 } } });
  const {ctx, reg} = montar({ rotas: [[/:batchRunReports$/, (u, init) => ok({ reports: init.body.requests.map(baixa) })]] });
  const r = await G.coletar(ctx);
  assert.equal(r.partes.ga4.estado, 'parcial');
  assert.match(r.partes.ga4.motivo, /cota/);
  assert.equal(de(reg, /analyticsdata/).length, 1, 'um lote só');
  assert.ok(r.dados.ga4.semanas.length > 0, 'o que chegou fica');
  assert.ok(!('paginas' in r.dados.ga4), 'o que não veio sai do objeto (a coletora mantém o de antes)');
});

test('prazo em segundos (a unidade não está no contrato): coleta normal, e para quando acaba', async () => {
  const a = montar({ prazo: () => 110 });
  assert.equal((await G.coletar(a.ctx)).estado, 'ok');
  const b = montar({ prazo: (reg) => (reg.chamadas.length < 10 ? 100 : 5) });
  await G.coletar(b.ctx);
  assert.ok(b.reg.chamadas.length <= 12, `chamou depois do prazo: ${b.reg.chamadas.length}`);
});

test('perfil sem avaliação nenhuma (sem total): uma chamada só, sem insistir em outra ordem', async () => {
  const {ctx, reg} = montar({ rotas: [[/\/reviews\?/, () => ok({})]] });
  const r = await G.coletar(ctx);
  assert.equal(de(reg, /\/reviews\?/).length, 1);
  assert.deepEqual([r.dados.perfil.avaliacoes.guardadas, r.dados.perfil.avaliacoes.total, r.dados.perfil.avaliacoes.completas], [0, null, null]);
});

test('paginação com teto: um nextPageToken sem fim para no teto', async () => {
  const {ctx, reg} = montar({ rotas: [[/mybusinessaccountmanagement/, () => ok({ ...fx('gbp-contas-p1'), nextPageToken: 'sem-fim' })]] });
  const r = await G.coletar(ctx);
  assert.equal(de(reg, /mybusinessaccountmanagement/).length, G.LIMITES.CONTAS_PAGINAS);
  assert.ok(r.avisos.some((a) => /teto/.test(a)));
});

test('GA4 só com o "purchase" padrão: leads nunca vão para a semana e o evento-chave do dia fica null', async () => {
  const {ctx, reg} = montar({ rotas: [[/keyEvents/, () => ok(fx('ga4-eventos-chave-so-padrao'))]] });
  const r = await G.coletar(ctx);
  assert.ok(r.semanas.filter((s) => s.canal === 'site').every((s) => !('leads' in s.numeros)));
  assert.ok(r.dados.ga4.dias.every((d) => d.eventos_chave === null));
  assert.ok(r.avisos.some((a) => /nenhum evento-chave/.test(a)));
  assert.ok(!reg.pedidosGa4.some((p) => JSON.stringify(p).includes('isKeyEvent')), 'não gasta cota com relatório que só daria zero');
});

test('cliques de saída não medidos: conversas não vão (null, nunca zero)', async () => {
  const vazio = (req) => ({ ...relatorioFalso(req, { pedidosGa4: [] }), rows: [], rowCount: 0 });
  const {ctx} = montar({ rotas: [[/:batchRunReports$/, (u, init) => {
    if (!JSON.stringify(init.body).includes('"click"')) return null;
    return ok({ reports: init.body.requests.map((q) => (JSON.stringify(q).includes('"click"') ? vazio(q) : relatorioFalso(q, { pedidosGa4: [] }))) });
  }]] });
  const r = await G.coletar(ctx);
  assert.equal(r.dados.ga4.cliques_saida, null);
  assert.equal(r.dados.ga4.whatsapp_medido, false);
  assert.ok(r.semanas.filter((s) => s.canal === 'site').every((s) => !('conversas' in s.numeros)));
});

test('o caso ruim: um clique no WhatsApp na semana aberta não põe "0 conversas" nas 8 semanas fechadas; a base zero começa na semana do primeiro clique', async () => {
  const j = G.janelas(HOJE);
  const semanas = SEGUNDAS.map((semana) => ({ semana, usuarios: 10, visualizacoes: 20, sessoes_engajadas: 5, eventos_chave: 1 }));
  const clique = (data, cliques = 1) => ({ data, dominio: 'wa.me', link: 'https://wa.me/5531900000000', cliques });
  // O único clique é de 13/10, na semana que ainda não fechou.
  const so = G.semanasDoSite({ semanas, whatsapp_medido: true, cliques_saida: [clique('2026-10-13')] }, null, j);
  assert.ok(so.every((l) => !('conversas' in l.numeros)), JSON.stringify(simples(so).find((l) => 'conversas' in l.numeros)));
  // Primeiro clique em 09/09: a semana de 07/09 em diante tem número (zero
  // é zero de verdade); antes dela, nada.
  const desde = G.semanasDoSite({ semanas, whatsapp_medido: true, cliques_saida: [clique('2026-09-09', 2), clique('2026-09-30', 1), clique('2026-10-13', 4)] }, null, j);
  const conversas = Object.fromEntries(simples(desde).map((l) => [l.semana, l.numeros.conversas]));
  assert.deepEqual(conversas, { '2026-08-17': undefined, '2026-08-24': undefined, '2026-08-31': undefined, '2026-09-07': 2, '2026-09-14': 0, '2026-09-21': 0, '2026-09-28': 1, '2026-10-05': 0 });
  // Clique que não é do WhatsApp não liga a medição.
  const outro = G.semanasDoSite({ semanas, whatsapp_medido: true, cliques_saida: [{ data: '2026-08-20', dominio: 'instagram.com', link: 'https://instagram.com/x', cliques: 3 }] }, null, j);
  assert.ok(outro.every((l) => !('conversas' in l.numeros)));
});

test('avaliações: a lista do Google veio incompleta e nem em outra ordem completou: aviso, e as da coleta anterior ficam', async () => {
  const anterior = { perfil: { avaliacoes: { lista: [{ id: 'D', estrelas: 5, criada_em: '2026-09-02T10:00:00Z', atualizada_em: '2026-09-02T10:00:00Z', resposta: null }] } } };
  const {ctx} = montar({ anterior, rotas: [[/\/reviews\?/, (url) => (new URL(url).searchParams.get('orderBy') ? ok({ reviews: [], totalReviewCount: 4 }) : null)]] });
  const r = await G.coletar(ctx);
  const av = r.dados.perfil.avaliacoes;
  assert.equal(av.total, 4); assert.equal(av.guardadas, 4); assert.equal(av.completas, true);
  assert.ok(av.lista.some((a) => a.id === 'D'), 'a D veio da coleta anterior');
  const sem = montar({ rotas: [[/\/reviews\?/, (url) => (new URL(url).searchParams.get('orderBy') ? ok({ reviews: [], totalReviewCount: 4 }) : null)]] });
  const r2 = await G.coletar(sem.ctx);
  assert.equal(r2.dados.perfil.avaliacoes.completas, false);
  assert.ok(r2.avisos.some((a) => /3 de 4 avaliações/.test(a)));
});

// ============================================================ caminho bom ==

test('caminho bom: as três partes, os números da semana do site e do google e as publicações', async () => {
  const {ctx, reg} = montar();
  const r = await G.coletar(ctx);
  assert.deepEqual(simples(Object.fromEntries(G.PARTES.map((p) => [p, r.partes[p].estado]))), { ga4: 'ok', search_console: 'ok', perfil: 'ok' });
  assert.equal(r.estado, 'ok');
  assert.equal(r.conta, 'conta-de-teste@example.com');
  assert.deepEqual(reg.naoAchadas, []);
  // Token: renovado uma vez, no cabeçalho, nunca na URL; a conexão volta para regravar.
  assert.equal(de(reg, /oauth2\.googleapis\.com\/token/).length, 1);
  for (const c of apis(reg)) {
    assert.equal(c.headers.Authorization, `Bearer ${ACESSO_NOVO}`);
    assert.ok(!c.url.includes(ACESSO_NOVO));
  }
  const conexao = semSegredo(r);
  assert.equal(conexao.access_token, ACESSO_NOVO);
  assert.equal(conexao.refresh_token, REFRESH);
  // GA4: tetos da documentação em todo pedido, e a cota sempre medida.
  assert.ok(reg.pedidosGa4.length >= 12);
  for (const p of reg.pedidosGa4) {
    assert.ok(p.metrics.length <= 10 && p.dimensions.length <= 9 && p.dateRanges.length <= 4, JSON.stringify(p.dimensions));
    assert.equal(p.returnPropertyQuota, true);
  }
  assert.ok(de(reg, /:batchRunReports$/).length >= 2, 'em lote de até 5');

  // ---- números da semana do SITE: as 8 semanas fechadas, nenhuma aberta, nenhum null.
  const site = r.semanas.filter((s) => s.canal === 'site');
  assert.deepEqual(site.map((s) => s.semana), SEGUNDAS);
  for (const s of r.semanas) for (const v of Object.values(s.numeros)) assert.ok(Number.isInteger(v) && v >= 0, `${s.canal} ${s.semana}: ${v}`);
  const n = (sem) => site.find((s) => s.semana === sem).numeros;
  const v = (m, k) => Number(valorFalso(m, k));
  assert.equal(n('2026-08-31').alcance, v('activeUsers', '2026-08-31'));
  assert.equal(n('2026-08-31').impressoes, v('screenPageViews', '2026-08-31'));
  assert.equal(n('2026-08-31').engajamento, v('engagedSessions', '2026-08-31'));
  assert.equal(n('2026-08-31').leads, v('keyEvents', '2026-08-31'));
  // generate_lead foi marcado em 26/08: as semanas de 17/08 e 24/08 não têm lead medido.
  assert.ok(!('leads' in n('2026-08-17')) && !('leads' in n('2026-08-24')));
  // WhatsApp: soma dos cliques em wa.me nos dias da semana (02/09 sem registro).
  const zap = dias('2026-08-31', '2026-09-06').filter((d) => !DIAS_MORTOS.has(d)).reduce((a, d) => a + v('eventCount', `${d}|wa.me|https://wa.me/5531900000000`), 0);
  assert.equal(n('2026-08-31').conversas, zap);
  // Semana sem registro no GA4: só os cliques do Search Console, nada de zero inventado.
  assert.deepEqual(simples(n(SEMANA_MORTA)), { cliques: valorSc('c', SEMANA_MORTA) });
  for (const s of SEGUNDAS) assert.equal(n(s).cliques, valorSc('c', s));

  // ---- números da semana do GOOGLE: semana de 05/10 ainda não fechou (quarta).
  const goo = r.semanas.filter((s) => s.canal === 'google');
  assert.deepEqual(goo.map((s) => s.semana), SEGUNDAS.slice(0, 7));
  const soma = (ms, s) => dias(s, somar(s, 6)).reduce((a, d) => a + ms.reduce((b, m) => b + perfilNoDia(m, d), 0), 0);
  const IMP = ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'];
  const g = (sem) => goo.find((s) => s.semana === sem).numeros;
  assert.equal(g('2026-09-07').impressoes, soma(IMP, '2026-09-07'));
  assert.equal(g('2026-09-07').cliques, soma(['WEBSITE_CLICKS', 'CALL_CLICKS', 'BUSINESS_DIRECTION_REQUESTS'], '2026-09-07'));
  // 03/09 nem veio nos cliques no site: a semana fica sem cliques (e com impressões).
  assert.ok(!('cliques' in g('2026-08-31')) && g('2026-08-31').impressoes > 0);
  assert.ok(goo.every((s) => !('seguidores' in s.numeros)), 'seguidores de hoje não vão para semana velha');

  // ---- publicações: só posts no ar e com link; o link sem rastreio; o dia de São Paulo.
  assert.equal(r.publicacoes.length, 3);
  const [p1, p2, p3] = simples(r.publicacoes).sort((a, b) => b.data.localeCompare(a.data));
  assert.deepEqual({ canal: p1.canal, url: p1.url, data: p1.data }, { canal: 'google', url: 'https://local.google.com/place?id=111&use=posts&lpsid=1', data: '2026-10-05' });
  assert.ok(p1.titulo.startsWith('Fachada nova') && p1.titulo.endsWith('...') && p1.titulo.length <= 80, p1.titulo);
  assert.equal(p2.titulo, 'Feira de Sinalização');
  assert.equal(p3.titulo, '10% em adesivos');
  assert.ok(r.publicacoes.every((p) => !('alcance' in p) && !('cliques' in p)), 'post do Perfil não tem número');

  // ---- dados para a tela.
  const ga4 = r.dados.ga4;
  assert.equal(ga4.propriedade.id, 'properties/222');
  assert.equal(ga4.propriedade.achada_por, 'medicao');
  assert.equal(ga4.propriedade.fuso, 'America/Sao_Paulo');
  assert.equal(ga4.eventos_chave_desde, '2026-08-26');
  assert.equal(ga4.vinculo_ads, false);
  assert.equal(ga4.ads, null);
  assert.equal(ga4.dias.length, dias('2026-08-17', '2026-10-13').length);
  const dia = (d) => ga4.dias.find((x) => x.data === d);
  assert.deepEqual([dia('2026-09-02').registrou, dia('2026-09-02').usuarios, dia('2026-09-02').taxa_engajamento], [false, 0, null]);
  assert.equal(dia('2026-09-16').usuarios, null, 'semana inteira sem registro não vira zero');
  assert.equal(dia('2026-08-20').eventos_chave, null, 'antes do evento-chave existir');
  assert.equal(dia('2026-08-27').eventos_chave, v('keyEvents', '2026-08-27'));
  assert.equal(dia('2026-08-27').taxa_engajamento, 0.6123);
  // Semana que começou antes do evento-chave (26/08): eventos-chave "não medido".
  assert.equal(ga4.semanas.find((s) => s.semana === '2026-08-24').eventos_chave, null);
  assert.equal(ga4.semanas.find((s) => s.semana === '2026-08-31').eventos_chave, v('keyEvents', '2026-08-31'));
  assert.ok(ga4.canais.filter((c) => c.semana === '2026-08-17').every((c) => c.eventos_chave === null));
  assert.ok(ga4.canais.some((c) => c.canal === 'AI Assistant'), 'canal novo passa sem lista fixa');
  assert.equal(ga4.whatsapp_medido, true);
  assert.deepEqual(ga4.paginas.map((p) => p.link).sort(), ['https://impresilk.com.br/', 'https://impresilk.com.br/?page_id=144'], 'a página do ?page_id não some dentro de "/"');
  assert.ok(ga4.entradas.some((e) => e.pagina === '/?page_id=144'));
  assert.ok(ga4.cota.projeto_hora_restante > 0);

  const sc = r.dados.search_console;
  assert.equal(sc.propriedade.site, 'sc-domain:impresilk.com.br', 'a de Domínio antes da de prefixo');
  assert.equal(sc.primeiro_dia_incompleto, '2026-10-12');
  assert.ok(sc.semanas.every((s) => s.fechada));
  const dsc = (d) => sc.dias.find((x) => x.data === d);
  assert.deepEqual([dsc('2026-09-10').cliques, dsc('2026-09-10').ctr], [0, null], 'dia fechado sem linha é zero');
  assert.equal(dsc('2026-10-14').cliques, null, 'dia aberto sem linha é atraso, não zero');
  assert.equal(dsc('2026-10-12').provisorio, true);
  assert.deepEqual(simples(sc.tipos.image), { cliques: 2, impressoes: 150, ctr: 0.0133, posicao: 12.5 });
  assert.equal(sc.tipos.discover, null, 'sem volume');
  assert.equal(sc.consultas[0].consulta, 'impresilk');
  assert.equal(sc.paises[0].pais, 'BRA');
  const web = sc.tipos.web;
  assert.deepEqual(simples(sc.marca.anonimas), { cliques: web.cliques - 80, impressoes: web.impressoes - 3400 });
  assert.equal(sc.sitemaps[0].erros, 1);
  assert.ok(r.avisos.some((a) => /sitemap com erro/.test(a)));
  assert.equal(sc.inspecoes.length, 2);
  assert.equal(sc.inspecoes[0].veredito, 'PASS');
  assert.equal(sc.por_hora[0].cliques, 17610);

  const pf = r.dados.perfil;
  assert.equal(pf.contas, 2, 'percorreu as duas páginas de contas');
  assert.equal(pf.local.id, 'locations/222');
  assert.equal(pf.conta.tipo, 'LOCATION_GROUP');
  assert.equal(pf.local.endereco, 'Rua de Teste, 100, Belo Horizonte, MG, 30000-000');
  assert.equal(pf.seguidores, 57);
  assert.deepEqual(simples(pf.fotos), { empresa: 12, clientes: 3, recentes: simples(pf.fotos.recentes) });
  assert.equal(pf.termos.length, 3);
  assert.deepEqual(simples(pf.termos[0]), { mes: '2026-09', completo: true, termos: [
    { termo: 'comunicação visual', usuarios: 132, abaixo_de: null }, { termo: 'impresilk', usuarios: 95, abaixo_de: null }, { termo: 'adesivo para vitrine', usuarios: null, abaixo_de: 15 }] });
  const av = pf.avaliacoes;
  assert.deepEqual([av.total, av.guardadas, av.completas, av.media], [4, 4, true, 4.5], 'a 2a página veio sem a D; outra ordem completou');
  assert.deepEqual(simples(av.distribuicao), { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 });
  assert.equal(av.sem_resposta, 2);
  assert.equal(av.taxa_resposta, 0.5);
  assert.equal(av.resposta_media_horas, 15.6);
  assert.equal(new Set(av.lista.map((a) => a.id)).size, 4, 'junta por reviewId, sem repetir');
  const dpf = (d) => pf.dias.find((x) => x.data === d);
  assert.equal(dpf('2026-09-01').cliques_site, 0, 'dia sem value e já fechado é zero');
  assert.equal(pf.dias_ate, '2026-10-13');
  assert.deepEqual([dpf('2026-10-10').reservas, dpf('2026-10-11').reservas], [0, null], 'reserva sem value: zero só no dia fechado');
  assert.equal(dpf('2026-09-03').cliques_site, null, 'dia que nem veio é null');
  assert.equal(dpf('2026-09-03').ligacoes, valorPerfil('CALL_CLICKS', '2026-09-03'));
  assert.equal(pf.semanas.find((s) => s.semana === '2026-10-05').fechada, false);
  assert.ok(reg.logs.some((l) => /chamadas/.test(l)));
});

test('o fetchJson pode devolver o envelope {ok, status, dados}: o resultado é o mesmo', async () => {
  const a = await G.coletar(montar().ctx);
  const b = await G.coletar(montar({ envelope: true }).ctx);
  assert.deepEqual(simples(b.semanas), simples(a.semanas));
  assert.deepEqual(simples(b.publicacoes), simples(a.publicacoes));
  assert.equal(b.estado, 'ok');
  const c = montar({ envelope: true, rotas: [[/mybusinessaccountmanagement/, () => erro(429, fx('gbp-erro-cota-zero'))]] });
  assert.equal((await G.coletar(c.ctx)).partes.perfil.estado, 'aguardando_aprovacao');
});

test('access token ainda válido no cofre: não renova e não devolve conexão', async () => {
  const conexao = { ...CONEXAO, access_token: 'acesso-ainda-valido-de-teste', expira_em: new Date(Date.now() + 3_000_000).toISOString() };
  const {ctx, reg} = montar({ conexao });
  const r = await G.coletar(ctx);
  assert.equal(de(reg, /oauth2/).length, 0);
  assert.equal(r.conexao, undefined);
  assert.equal(apis(reg)[0].headers.Authorization, 'Bearer acesso-ainda-valido-de-teste');
  assert.ok(!JSON.stringify(simples(r)).includes('ainda-valido'));
});

test('o caso ruim: seguidores do Perfil vai só na segunda logo depois da semana; a coleta de terça não troca o retrato', async () => {
  const terca = (await G.coletar(montar({ hoje: '2026-10-13' }).ctx)).semanas.filter((s) => s.canal === 'google');
  assert.equal(terca.filter((s) => 'seguidores' in s.numeros).length, 0, 'na terça o total já tem a segunda inteira de outra semana');
  const r = await G.coletar(montar({ hoje: '2026-10-12' }).ctx);
  const goo = r.semanas.filter((s) => s.canal === 'google');
  assert.deepEqual(simples(goo.find((s) => s.semana === '2026-10-05').numeros), { seguidores: 57 });
  assert.equal(goo.filter((s) => 'seguidores' in s.numeros).length, 1);
});

test('Search Console: a semana só fecha depois do first_incomplete_date', async () => {
  const r = await G.coletar(montar({ opcoes: { fid: '2026-10-10' } }).ctx);
  const s = r.dados.search_console.semanas.find((x) => x.semana === '2026-10-05');
  assert.deepEqual([s.fechada, s.cliques], [false, null]);
  assert.ok(!('cliques' in r.semanas.find((x) => x.canal === 'site' && x.semana === '2026-10-05').numeros));
  assert.ok('cliques' in r.semanas.find((x) => x.canal === 'site' && x.semana === '2026-09-28').numeros);
  // A última semana fechada é a de 28/09: o detalhe da semana olha ela.
  const pedidos = r.dados.search_console.consultas_semana;
  assert.ok(Array.isArray(pedidos));
});

test('canal "google" desligado: nem semana nem publicação do Perfil', async () => {
  const r = await G.coletar(montar({ canais: [{ codigo: 'site', url_perfil: 'https://impresilk.com.br' }] }).ctx);
  assert.ok(r.semanas.every((s) => s.canal === 'site'));
  assert.deepEqual(r.publicacoes, []);
});

test('GA4 com vínculo ao Google Ads: o relatório de anúncios vai sozinho (recusa não derruba o lote)', async () => {
  const {ctx, reg} = montar({ rotas: [[/googleAdsLinks/, () => ok(fx('ga4-vinculos-ads'))], [/:runReport$/, (u, init) => (JSON.stringify(init.body).includes('advertiserAdCost') ? erro(400, fx('ga4-erro-relatorio-recusado')) : null)]] });
  const r = await G.coletar(ctx);
  assert.equal(r.dados.ga4.vinculo_ads, true);
  assert.equal(r.dados.ga4.ads, null);
  // O aviso diz o caso em português, sem a chave interna nem o inglês do Google.
  assert.ok(r.avisos.includes('GA4: o Google recusou o custo do Google Ads por campanha (um campo ou uma combinação que ele não aceita); esse quadro fica sem dado.'), r.avisos.join(' | '));
  assert.ok(!r.avisos.some((a) => /"ads"|advertiserAdCost|compatible|Check/.test(a)));
  assert.ok(reg.logs.some((l) => /relatório ads recusado \(Field advertiserAdCost is not compatible/.test(l)), 'o detalhe vai para o diário');
  assert.equal(r.partes.ga4.estado, 'ok');
  assert.ok(!de(reg, /:batchRunReports$/).some((c) => JSON.stringify(c.body).includes('advertiserAdCost')));
});

test('o ID de medição que as etiquetas do site acharam também serve, e a propriedade anterior é olhada primeiro', async () => {
  const {ctx, reg} = montar({ medicoes: ['G-OUTRO12345', 'lixo'], anterior: { ga4: { propriedade: { id: 'properties/111', nome: 'Outro site' } } } });
  const r = await G.coletar(ctx);
  assert.equal(r.dados.ga4.propriedade.id, 'properties/111');
  assert.equal(de(reg, /accountSummaries/).length, 0, 'achou na propriedade conhecida, sem varrer as contas');
});

const COLETORA = new URL('mkt-fontes/coletora.mjs', SHARED);
test('com a coletora de verdade: uma coleta parcial não apaga o retrato bom de ontem', { skip: existsSync(COLETORA) ? false : 'coletora.mjs ainda não existe' }, async () => {
  const {juntarRetrato, normalizarResultado, prepararSemanas, prepararPublicacoes} = await import(COLETORA.href);
  const {normalizarLink} = await import(new URL('marketing.mjs', SHARED).href);
  const ontem = normalizarResultado(await G.coletar(montar().ctx));
  const retratoOntem = juntarRetrato(null, ontem, '2026-10-13T09:05:00.000Z');
  // Hoje: o tempo acabou depois de 20 chamadas, e o Perfil está sem cota.
  const hoje = normalizarResultado(await G.coletar(montar({
    prazo: (reg) => (reg.chamadas.length < 20 ? 100_000 : 5_000),
    rotas: [[/mybusinessaccountmanagement/, () => erro(429, fx('gbp-erro-cota-zero'))]],
  }).ctx));
  const r = juntarRetrato(retratoOntem, hoje, '2026-10-14T09:05:00.000Z');
  for (const p of G.PARTES) {
    assert.ok(r.dados[p], `a parte ${p} perdeu os dados`);
    // Parte que falhou hoje guarda a data da coleta boa de ontem; parcial e ok ganham a de hoje.
    if (!['ok', 'parcial'].includes(hoje.partes[p].estado)) assert.equal(r.partes[p].coletado_em, retratoOntem.partes[p].coletado_em, p);
    // Bloco que existia ontem continua existindo depois da junção.
    for (const k of Object.keys(retratoOntem.dados[p])) assert.ok(k in r.dados[p], `${p}.${k} sumiu`);
  }
  assert.ok(Array.isArray(r.dados.perfil.posts), 'o Perfil de ontem continua');
  assert.ok(r.dados.search_console.paginas?.length, 'bloco que não veio hoje continua o de ontem');
  // As linhas passam inteiras pela régua da coletora (nenhuma descartada).
  assert.equal(prepararSemanas(ontem.semanas).descartadas, 0);
  assert.equal(prepararPublicacoes(ontem.publicacoes, normalizarLink).descartadas, 0);
});

// ======================================================== funções puras ==

test('janelas: 8 semanas fechadas de segunda a domingo, no dia de São Paulo', () => {
  const j = G.janelas(HOJE);
  assert.deepEqual(j.semanas.map((s) => s.segunda), SEGUNDAS);
  assert.deepEqual([j.inicio, j.ultimoDomingo, j.ontem, j.segundaAtual], ['2026-08-17', '2026-10-11', '2026-10-13', '2026-10-12']);
  assert.ok(j.semanas.every((s) => s.domingo === somar(s.segunda, 6)));
  const seg = G.janelas('2026-10-12');
  assert.equal(seg.ontem, seg.ultimoDomingo, 'na segunda, ontem é o domingo fechado');
});

test('numeroApi: vazio e lixo são null; "0" é zero', () => {
  assert.equal(G.numeroApi(''), null); assert.equal(G.numeroApi(undefined), null); assert.equal(G.numeroApi('abc'), null);
  assert.equal(G.numeroApi('0'), 0); assert.equal(G.numeroApi('2541'), 2541); assert.equal(G.numeroApi(0.5), 0.5);
});

test('lerRelatorioGa4: o exemplo da documentação (valores em texto viram número)', () => {
  const r = G.lerRelatorioGa4(fx('ga4-runreport-exemplo'));
  assert.deepEqual(simples(r.linhas), [{ pais: 'Japan', usuarios: 2541 }, { pais: 'France', usuarios: 12 }]);
  assert.equal(r.cortado, false);
  assert.equal(r.cota, null);
});

test('lerRelatorioGa4: semana ISO vira segunda, lixo vira null, qualidade e cota lidas', () => {
  const r = G.lerRelatorioGa4(fx('ga4-relatorio-semanas'));
  assert.deepEqual(simples(r.linhas[0]), { semana: '2026-08-17', usuarios: 312, taxa_engajamento: 0.7239, tempo_engajamento_s: 5321.4 });
  assert.deepEqual(simples(r.linhas[1]), { semana: '2026-10-05', usuarios: 0, taxa_engajamento: 0, tempo_engajamento_s: 0 }, 'zero que veio é zero');
  assert.deepEqual([r.linhas[2].semana, r.linhas[2].taxa_engajamento, r.linhas[2].tempo_engajamento_s], ['2026-12-28', null, null]);
  assert.equal(r.cortado, true);
  assert.deepEqual(simples(r.qualidade), { linha_other: true, limiar_privacidade: true, amostragem: false, cortes: [{ tipo: 'DATA_TRUNCATION_TYPE_GOOGLE_ADS', desde: '2023-10-01' }] });
  assert.equal(r.cota.projeto_hora_restante, 13988);
  assert.equal(G.isoSemanaParaSegunda('202553'), null, '2025 não tem semana 53');
  assert.equal(G.isoSemanaParaSegunda('202601'), '2025-12-29');
  assert.equal(G.isoSemanaParaSegunda('2026-34'), null);
});

test('conferirPedidoGa4: recusa 11 métricas, 10 dimensões ou 5 intervalos; os relatórios do conector cabem', () => {
  const m = (n) => Array.from({ length: n }, (_, i) => ({ name: `m${i}` }));
  assert.throws(() => G.conferirPedidoGa4({ metrics: m(11), dimensions: [], dateRanges: [{}] }), /10 métricas/);
  assert.throws(() => G.conferirPedidoGa4({ metrics: m(1), dimensions: m(10), dateRanges: [{}] }), /9 dimensões/);
  assert.throws(() => G.conferirPedidoGa4({ metrics: m(1), dimensions: [], dateRanges: m(5) }), /4 intervalos/);
  const todos = G.relatoriosGa4(G.janelas(HOJE), { comAds: true });
  assert.ok(todos.length >= 13);
  for (const r of todos) assert.equal(r.pedido.returnPropertyQuota, true);
});

test('diasGa4: calendário completo; zero só na semana que teve registro; null antes da propriedade existir', () => {
  const rel = { linhas: [{ data: '2026-10-06', usuarios: 5, eventos_chave: 1, taxa_engajamento: 0.5 }] };
  const d = G.diasGa4(rel, '2026-09-28', '2026-10-07', { criadaEm: '2026-10-06', desdeEventosChave: '2026-10-01' });
  assert.equal(d.length, 10);
  assert.deepEqual([d[0].usuarios, d[0].registrou], [null, false], 'semana sem registro');
  assert.equal(d.find((x) => x.data === '2026-10-05').usuarios, null, 'antes de a propriedade existir');
  assert.deepEqual(simples(d.find((x) => x.data === '2026-10-07')), { data: '2026-10-07', registrou: false, usuarios: 0, novos: 0, sessoes: 0, sessoes_engajadas: 0, visualizacoes: 0, eventos: 0, taxa_engajamento: null, duracao_media_s: null, taxa_rejeicao: null, eventos_chave: 0 });
  const semConfig = G.diasGa4(rel, '2026-10-06', '2026-10-06', { desdeEventosChave: null });
  assert.equal(semConfig[0].eventos_chave, null);
});

test('classificarErro: cada 403 com o seu sentido', () => {
  assert.equal(G.classificarErro('ga4', { status: 401 }).estado, 'reconectar');
  assert.equal(G.classificarErro('ga4', { status: 403, dados: fx('ga4-erro-escopo') }).estado, 'falta_conectar');
  assert.equal(G.classificarErro('ga4', { status: 403, dados: fx('ga4-erro-api-desligada') }).estado, 'falta_configurar');
  assert.equal(G.classificarErro('perfil', { status: 403, dados: fx('gbp-erro-api-desligada') }).estado, 'aguardando_aprovacao');
  assert.equal(G.classificarErro('perfil', { status: 429, dados: fx('gbp-erro-cota-zero') }).estado, 'aguardando_aprovacao');
  assert.equal(G.classificarErro('perfil', { status: 429, dados: {} }).estado, 'parcial', '429 depois da primeira chamada é pico de uso');
  assert.equal(G.classificarErro('search_console', { status: 403, dados: fx('sc-erro-sem-permissao') }).estado, 'erro');
  assert.equal(G.classificarErro('search_console', { status: 0 }).estado, 'erro');
  assert.equal(G.classificarErro('ga4', { semTempo: true, status: 0 }).estado, 'parcial');
});

test('estadoGeral: tudo ok, parcial com alguma parte boa, e o que mais pede ação quando nenhuma tem dado', () => {
  const e = (a, b, c) => G.estadoGeral({ ga4: { estado: a }, search_console: { estado: b }, perfil: { estado: c } });
  assert.equal(e('ok', 'ok', 'ok'), 'ok');
  assert.equal(e('ok', 'ok', 'aguardando_aprovacao'), 'parcial');
  assert.equal(e('reconectar', 'falta_conectar', 'aguardando_aprovacao'), 'reconectar');
  assert.equal(e('falta_configurar', 'falta_configurar', 'aguardando_aprovacao'), 'falta_configurar');
  assert.equal(e('aguardando_aprovacao', 'aguardando_aprovacao', 'aguardando_aprovacao'), 'aguardando_aprovacao');
});

test('escoposDaParte: URL inteira ou nome curto; lista vazia é "não sei", não "nada"', () => {
  assert.deepEqual(simples(G.escoposDaParte(ESCOPOS_TODOS)), { ga4: true, search_console: true, perfil: true });
  assert.deepEqual(simples(G.escoposDaParte('analytics.readonly webmasters')), { ga4: true, search_console: true, perfil: false });
  assert.deepEqual(simples(G.escoposDaParte([])), { ga4: null, search_console: null, perfil: null });
  assert.deepEqual(simples(G.escoposDaParte(undefined)), { ga4: null, search_console: null, perfil: null });
});

test('escolherPropriedadeSc: Domínio primeiro, prefixo depois, não verificado nunca', () => {
  assert.equal(G.escolherPropriedadeSc(fx('sc-sites').siteEntry, 'impresilk.com.br').site, 'sc-domain:impresilk.com.br');
  assert.equal(G.escolherPropriedadeSc(fx('sc-sites-nao-verificado').siteEntry, 'impresilk.com.br'), null);
  assert.equal(G.escolherPropriedadeSc([{ siteUrl: 'https://www.impresilk.com.br/', permissionLevel: 'siteRestrictedUser' }], 'impresilk.com.br').site, 'https://www.impresilk.com.br/');
});

test('semanaScFechada e lerSearchAnalytics: o metadata só vem com dado incompleto no intervalo', () => {
  assert.equal(G.semanaScFechada('2026-10-11', '2026-10-12'), true);
  assert.equal(G.semanaScFechada('2026-10-11', '2026-10-11'), false);
  assert.equal(G.semanaScFechada('2026-10-11', null), true, 'sem metadata, fechada');
  const r = G.lerSearchAnalytics(fx('sc-por-hora'), ['hour']);
  assert.deepEqual(simples(r.linhas[0]), { hora: '2025-04-07T00:00:00-07:00', cliques: 17610, impressoes: 1571473, ctr: 0.0112, posicao: 10.07 });
  assert.equal(r.agregacao, 'byProperty');
});

test('lerSitemaps e lerInspecao: contagem em texto vira número; campo descontinuado fica de fora', () => {
  const [s] = G.lerSitemaps(fx('sc-sitemaps'));
  assert.deepEqual([s.avisos, s.erros, s.indice], [0, 1, true]);
  assert.deepEqual(simples(s.conteudos), [{ tipo: 'web', enviados: 24 }]);
  const i = G.lerInspecao(fx('sc-inspecao'), 'https://impresilk.com.br/?page_id=144');
  assert.deepEqual([i.veredito, i.busca, i.rastreado_como], ['PASS', 'SUCCESSFUL', 'MOBILE']);
  assert.deepEqual(simples(i.ricos), { veredito: 'PASS', tipos: ['Breadcrumbs'] });
  assert.equal(G.lerInspecao({}, 'x'), null);
});

test('o caso ruim: dia recente que o Google ainda não processou (só a data, sem value) é null, não zero; a semana aberta não mostra queda que não existe', () => {
  // Terça, 13/10: os dias 10, 11 e 12 vieram só com a data, como a API manda
  // um dia sem valor. Antes eles viravam 0 e a semana de 05/10 caía de 700
  // para 500 visualizações sem ter caído nada.
  const hoje = '2026-10-13', j = G.janelas(hoje);
  const recentes = new Set(['2026-10-10', '2026-10-11', '2026-10-12']);
  const resposta = (semValor) => ({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: Object.keys(G.METRICAS_DIARIAS).map((m) => ({ dailyMetric: m, timeSeries: { datedValues: dias(j.inicio, j.ontem)
    .map((d) => (semValor.has(d) ? { date: gd(d) } : { date: gd(d), value: m.includes('IMPRESSIONS') ? '25' : '3' })) } })) }] });
  const s = G.lerSerieDiaria(resposta(recentes), j.inicio, j.ontem, { hoje });
  for (const d of s.dias.filter((x) => recentes.has(x.data))) for (const c of Object.values(G.METRICAS_DIARIAS)) assert.equal(d[c], null, `${d.data} ${c}`);
  assert.equal(s.dias_ate, '2026-10-09');
  const sem = G.semanasPerfil(s.dias, j);
  const w = (x) => sem.find((y) => y.semana === x);
  assert.deepEqual([w('2026-09-28').fechada, w('2026-09-28').impressoes, w('2026-09-28').cliques], [true, 700, 63]);
  assert.deepEqual([w('2026-10-05').fechada, w('2026-10-05').impressoes, w('2026-10-05').cliques], [false, null, null], 'nada de 500 e 45');
  // O Google atrasou mais que 3 dias (sábado, 17/10, e nada desde o dia 10):
  // a semana de 05/10 já "fechou" pela régua, mas não entra pela metade.
  const hoje2 = '2026-10-17', j2 = G.janelas(hoje2);
  const atrasados = new Set(dias('2026-10-10', j2.ontem));
  const s2 = G.lerSerieDiaria(resposta(atrasados), j2.inicio, j2.ontem, { hoje: hoje2 });
  assert.deepEqual([s2.dias.find((d) => d.data === '2026-10-10').ligacoes, s2.dias_ate], [null, '2026-10-09'], 'depois do último dia com número não é zero');
  const perfil = { semanas: G.semanasPerfil(s2.dias, j2), seguidores: null };
  assert.equal(perfil.semanas.find((y) => y.semana === '2026-10-05').fechada, true);
  assert.equal(G.semanasDoGoogle(perfil, j2).some((l) => l.semana === '2026-10-05'), false, 'semana pela metade não vai para o banco');
  // Controle: com os dias já fechados e um dia zerado no meio da série (o
  // Google omite o zero), o zero de verdade continua zero.
  const meio = G.lerSerieDiaria(resposta(new Set(['2026-09-30'])), j.inicio, j.ontem, { hoje });
  assert.equal(meio.dias.find((d) => d.data === '2026-09-30').ligacoes, 0);
});

test('lerSerieDiaria: o exemplo da pesquisa (dia sem value e já fechado é zero, dia fora da série é null)', () => {
  const r = G.lerSerieDiaria(fx('gbp-metricas-exemplo'), '2026-10-04', '2026-10-07', { hoje: '2026-10-14' });
  const d = (x) => r.dias.find((y) => y.data === x);
  assert.deepEqual([d('2026-10-05').cliques_site, d('2026-10-06').cliques_site, d('2026-10-07').ligacoes], [4, 0, 0]);
  assert.equal(d('2026-10-04').cliques_site, null);
  assert.equal(d('2026-10-05').rotas, null, 'métrica que não voltou');
  assert.equal(d('2026-10-05').impressoes_busca_celular, 87);
  assert.deepEqual([...r.metricas].sort(), ['cliques_site', 'impressoes_busca_celular', 'ligacoes']);
  assert.equal(r.dias_ate, '2026-10-07');
  // O mesmo exemplo lido no dia seguinte: 06 e 07 ainda são recentes demais
  // para o zero (sem hoje, conta como se fosse o dia depois do fim).
  const cedo = G.lerSerieDiaria(fx('gbp-metricas-exemplo'), '2026-10-04', '2026-10-07');
  const c = (x) => cedo.dias.find((y) => y.data === x);
  assert.deepEqual([c('2026-10-05').cliques_site, c('2026-10-06').cliques_site, c('2026-10-07').ligacoes], [4, null, null]);
  assert.ok(!Object.keys(G.METRICAS_DIARIAS).some((m) => /CONVERSATIONS|FOOD_ORDERS/.test(m)), 'métricas descontinuadas fora');
});

test('semanasPerfil: soma só com a semana inteira; fechada 3 dias depois do domingo', () => {
  const j = G.janelas(HOJE);
  const diasCheios = dias(j.inicio, j.ontem).map((d) => ({ data: d, ...Object.fromEntries(Object.values(G.METRICAS_DIARIAS).map((c) => [c, 1])) }));
  diasCheios.find((d) => d.data === '2026-09-08').rotas = null;
  const s = G.semanasPerfil(diasCheios, j);
  const w = (x) => s.find((y) => y.semana === x);
  assert.deepEqual([w('2026-08-17').impressoes, w('2026-08-17').cliques, w('2026-08-17').interacoes], [28, 21, 28]);
  assert.deepEqual([w('2026-09-07').rotas, w('2026-09-07').cliques, w('2026-09-07').cliques_site], [null, null, 7]);
  assert.equal(w('2026-10-05').fechada, false);
  assert.equal(G.semanasPerfil(diasCheios, G.janelas('2026-10-15')).find((y) => y.semana === '2026-10-05').fechada, true);
});

test('escolherLocal: pelo cid do link do canal, depois pelo site da casa, depois o primeiro', () => {
  const l = G.lerLocais(fx('gbp-locais'), 'accounts/111');
  const outro = { ...l[0], id: 'locations/999', site: 'https://outro.com.br', maps: 'https://maps.google.com/maps?cid=1', place_id: 'X' };
  assert.equal(G.escolherLocal([outro, l[0]], 'impresilk.com.br', 'https://www.google.com/maps?cid=987654321').id, 'locations/222');
  assert.equal(G.escolherLocal([outro, l[0]], 'impresilk.com.br', null).id, 'locations/222');
  assert.equal(G.escolherLocal([outro], 'impresilk.com.br', null).id, 'locations/999');
  assert.equal(G.escolherLocal([], 'impresilk.com.br', null), null);
});

test('lerTermos e mesesDeTermos: "menos de N" não vira número; mês só completo depois do dia 5', () => {
  assert.deepEqual(simples(G.lerTermos(fx('gbp-termos'))[2]), { termo: 'adesivo para vitrine', usuarios: null, abaixo_de: 15 });
  assert.deepEqual(simples(G.mesesDeTermos('2026-10-04')), [{ ano: 2026, mes: 9, completo: false }, { ano: 2026, mes: 8, completo: true }, { ano: 2026, mes: 7, completo: true }]);
  assert.deepEqual(simples(G.mesesDeTermos('2026-01-20', 1)), [{ ano: 2025, mes: 12, completo: true }]);
});

test('postParaPublicacao: só no ar e com link; título do evento ou da oferta; data de São Paulo', () => {
  const posts = G.lerPosts(fx('gbp-posts'));
  const pubs = posts.map(G.postParaPublicacao);
  assert.equal(pubs[3], null, 'recusado');
  assert.equal(pubs[4], null, 'sem link');
  assert.equal(pubs[0].data, '2026-10-05');
  assert.equal(pubs[2].titulo, '10% em adesivos');
  assert.equal(G.postParaPublicacao({ ...posts[0], link: 'nao e link' }), null);
  assert.equal(posts[0].botao.tipo, 'LEARN_MORE');
});

test('juntarAvaliacoes e resumoAvaliacoes: por reviewId, a mais atualizada vence', () => {
  const a1 = { id: 'A', estrelas: 3, criada_em: '2026-09-01T00:00:00Z', atualizada_em: '2026-09-01T00:00:00Z' };
  const a2 = { ...a1, estrelas: 5, atualizada_em: '2026-09-05T00:00:00Z' };
  const j = G.juntarAvaliacoes([a2], [a1]);
  assert.equal(j.length, 1); assert.equal(j[0].estrelas, 5);
  const r = G.resumoAvaliacoes(j, { media: 5, total: 1 }, G.janelas(HOJE));
  assert.deepEqual([r.completas, r.sem_resposta, r.taxa_resposta, r.resposta_media_horas], [true, 1, 0, null]);
  assert.deepEqual(simples(r.por_semana.find((s) => s.semana === '2026-08-31')), { semana: '2026-08-31', novas: 1, media: 5 });
  assert.equal(G.resumoAvaliacoes([], {}).completas, null, 'sem total, não dá para dizer');
});

test('limparTexto: tira travessão e qualquer coisa com cara de token', () => {
  const t = G.limparTexto(`erro \u2014 Bearer ${TOKEN_VAZADO} e 1//xyz e meia \u2013 risca e solto ${PREFIXO_GOOGLE}solto-de-teste`);
  assert.ok(!TRAVESSAO.test(t) && !t.includes(PREFIXO_GOOGLE) && !t.includes('1//') && !t.includes('vazado'), t);
});

test('semanasDoSite: chave sem número fica de fora (null apagaria o número lançado à mão)', () => {
  const j = G.janelas(HOJE);
  const linhas = G.semanasDoSite({ semanas: [{ semana: '2026-09-28', usuarios: 10, visualizacoes: null, sessoes_engajadas: 4, eventos_chave: 2 }] }, null, j, { desdeEventosChave: undefined });
  assert.deepEqual(simples(linhas), [{ canal: 'site', semana: '2026-09-28', numeros: { alcance: 10, engajamento: 4 } }]);
  assert.deepEqual(G.semanasDoSite(null, null, j), []);
});
