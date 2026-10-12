// AS SEIS FONTES DO MARKETING DE PONTA A PONTA: a coletora de verdade
// (painel-mkt-fontes, empacotada com esbuild e rodada numa vm, como em
// tests/marketing-edge.test.mjs) com os SEIS conectores de verdade (o
// registro.mjs real, sem troca), o mkt-oauth.mjs real e as funções do banco de
// verdade (as migrações 20261010a, 20261011a e 20261012a num PostgreSQL em
// memória, o PGlite, com os mesmos stubs de Vault, cron e net do
// tests/marketing-fontes-banco.test.mjs).
//
// O que é de mentira: a rede (um fetch que responde com as fixtures de cada
// conector, em tests/fixtures/mkt-<fonte>), o painel_cache (um Map) e o
// relógio (fixo em 11/10/2026, domingo, para as fixtures não envelhecerem e o
// teste não passar só hoje). O relógio do BANCO também: o now() das
// migrações vira um relógio de teste que anda junto com o da vm. Sem isso o
// banco usava a data da máquina, e a partir de 11/08/2027 a faxina do
// LinkedIn apagaria a semana de 10/08/2026 e o teste quebraria sozinho.
//
// Os testes por conector já provam cada peça sozinha. Este prova as costuras:
// o ctx que a coletora monta é o que os conectores esperam; o que eles
// devolvem cabe nas RPCs (nenhuma linha recusada pelo banco); a renovação de
// token passa pelo mkt-oauth.mjs e o refresh novo do Pinterest chega ao cofre;
// a faxina do LinkedIn roda; nada de segredo vai para o cache, o diário, a
// resposta ou a URL; e o que a porta da tela (painel-marketing) entrega a cada
// papel.
//
// Sem o PGlite (desde 12/10/2026 ele está no devDependencies, e a CI roda com
// ele; tests/banco-na-ci.test.mjs trava a falta), o banco vira um de mentira que só anota as
// RPCs e responde no formato da migração. Tudo roda do mesmo jeito; o que só
// o banco de verdade sabe dizer (linha recusada pela regra da migração, a
// segunda coleta não regravar nada) fica conferido quando o PGlite existe.
//
// Nenhuma credencial é de verdade: todo valor de segredo aqui tem FICTICIO no
// texto, e a chave RSA da conta de serviço do Google Ads é gerada na hora.
//   PGLITE_PATH=/.../dist/index.js node --test tests/mkt-fontes-integracao.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FONTES, SECRETS_PADRAO, SECRETS_OPCIONAIS_PADRAO } from '../supabase/functions/_shared/mkt-fontes/info.mjs';
import { extrasDoCtx, anotarComTrava } from '../supabase/functions/_shared/mkt-fontes/coletora.mjs';
import { consultas, periodo } from '../supabase/functions/_shared/mkt-fontes/google_ads.mjs';
import { METRICAS_CONTA, METRICAS_PIN, METRICAS_PIN_VIDEO } from '../supabase/functions/_shared/mkt-fontes/pinterest.mjs';
import { normalizarLink } from '../supabase/functions/_shared/marketing.mjs';

// O Supabase roda em UTC; os conectores fazem as contas no fuso de São Paulo.
process.env.TZ = 'UTC';

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { if (process.env.PGLITE_PATH) ({ PGlite } = await import(pathToFileURL(process.env.PGLITE_PATH).href)); }

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite'))('esbuild');
const pasta = (p) => fileURLToPath(new URL(p, import.meta.url));
const empacotar = (arquivo, trocas) => {
  let fonte = readFileSync(new URL(arquivo, import.meta.url), 'utf8');
  for (const [re, por] of trocas) {
    assert.ok(re.test(fonte), `a troca ${re} não achou o import em ${arquivo}`);
    fonte = fonte.replace(re, por);
  }
  return buildSync({ stdin: { contents: fonte, loader: 'ts', resolveDir: pasta(arquivo.replace(/index\.ts$/, '')) }, bundle: true, write: false, format: 'iife', platform: 'node' }).outputFiles[0].text;
};
// Só o cliente do banco é trocado. O registro dos conectores entra como está.
const codigoColetora = empacotar('../supabase/functions/painel-mkt-fontes/index.ts', [
  [/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n'],
]);
const codigoMarketing = empacotar('../supabase/functions/painel-marketing/index.ts', [
  [/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n'],
  [/^import.*verificarJwt.*\n/m, 'const {verificarJwt,crachaRevogado}=globalThis;\n'],
]);

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const TRAVESSAO = /[\u2013\u2014]/;

// ------------------------------------------------------------------ relógio --
// Domingo, 11/10/2026, meio-dia em São Paulo. A semana de 05/10 ainda está
// aberta; as 8 fechadas vão de 10/08 a 28/09. O banco (PGlite) enxerga a
// mesma hora (ver bancoDeVerdade): a regra da semana aberta e a faxina do
// LinkedIn contam a partir dela, e não da data da máquina.
const AGORA = Date.parse('2026-10-11T15:00:00.000Z');
const HOJE = '2026-10-11';
const SEGUNDAS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
const DIA = 86_400_000;
function relogio() {
  const Real = Date;
  const desvio = AGORA - Real.now();
  return class Relogio extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + desvio); }
    static now() { return Real.now() + desvio; }
  };
}

// ---------------------------------------------------------- segredos falsos --
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const PKCS8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', par.privateKey)).toString('base64');
const PEM = `-----BEGIN PRIVATE KEY-----\n${PKCS8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const SA = { type: 'service_account', project_id: 'projeto-ficticio', private_key_id: 'idchaveFICTICIA0123456789', private_key: PEM, client_email: 'painel-ads@projeto-ficticio.iam.gserviceaccount.com' };
const ENV = {
  SUPABASE_URL: 'https://exemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-FICTICIA-0123456789',
  PAINEL_TOKEN: 'token-de-maquina-FICTICIO-0123456789',
  PAINEL_JWT_SECRET: 'segredo-do-cracha-FICTICIO-0123456789',
  GOOGLE_API_KEY: 'chave-google-FICTICIA-0123456789',
  META_TOKEN: 'token-meta-FICTICIO-0123456789',
  GOOGLE_ADS_SA_JSON: JSON.stringify(SA),
  GOOGLE_OAUTH_CLIENT_ID: 'id-google-ficticio.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-google-FICTICIO-0123',
  LINKEDIN_CLIENT_ID: 'idlinkedinficticio',
  LINKEDIN_CLIENT_SECRET: 'segredo-linkedin-FICTICIO-0123',
  PINTEREST_CLIENT_ID: '1500000',
  PINTEREST_CLIENT_SECRET: 'segredo-pinterest-FICTICIO-0123',
};
const TOKEN_ADS = 'acesso-ads-FICTICIO-0123456789';
const NOVOS = { googleAcesso: 'acesso-de-teste-nao-real-0001', pinAcesso: 'tk-ficticio-NOVO-pina', pinRefresh: 'rf-ficticio-NOVO-pinr' };
const iso = (ms) => new Date(ms).toISOString();
const CONEXOES = {
  // Vencido: a coletora renova antes de rodar o conector.
  google: { access_token: 'acesso-google-VENCIDO-FICTICIO', refresh_token: 'refresh-google-FICTICIO-0123', expira_em: iso(AGORA - 3600_000), escopos: ['analytics.readonly', 'webmasters.readonly', 'business.manage'].map((e) => `https://www.googleapis.com/auth/${e}`), conta: 'conta-ficticia@example.com', conectado_por: 'leo', conectado_em: '2026-10-01T12:00:00.000Z' },
  // Vale 40 dias: nada a renovar.
  linkedin: { access_token: 'acesso-linkedin-FICTICIO-0123', refresh_token: 'refresh-linkedin-FICTICIO-0123', expira_em: iso(AGORA + 40 * DIA), refresh_expira_em: iso(AGORA + 300 * DIA), escopos: ['rw_organization_admin', 'r_organization_social', 'r_organization_social_feed'], conta: 'Empresa Exemplo Ltda', conectado_por: 'leo', conectado_em: '2026-10-01T12:00:00.000Z' },
  // Vence em 3 dias: a coletora renova (folga de 7), e o Pinterest troca o refresh.
  pinterest: { access_token: 'acesso-pinterest-VELHO-FICTICIO', refresh_token: 'refresh-pinterest-VELHO-FICTICIO', expira_em: iso(AGORA + 3 * DIA), refresh_expira_em: iso(AGORA + 50 * DIA), escopos: ['user_accounts:read', 'pins:read', 'boards:read', 'ads:read'], conta: 'Empresa Exemplo', conectado_por: 'leo', conectado_em: '2026-10-01T12:00:00.000Z' },
};
// Tudo que não pode sair do cofre e do env. Os IDs de app OAuth não são
// segredo (vão na URL de autorização).
const SEGREDOS = [
  ...Object.entries(ENV).filter(([k]) => k !== 'SUPABASE_URL' && !/_CLIENT_ID$/.test(k)).map(([, v]) => v),
  SA.private_key, SA.private_key_id, PKCS8.slice(40, 120), TOKEN_ADS, ...Object.values(NOVOS),
  ...Object.values(CONEXOES).flatMap((c) => [c.access_token, c.refresh_token]),
  'TOKEN-DA-PAGINA-FICTICIO', 'TOKEN-DA-OUTRA-FICTICIO',
];
const vazou = (texto) => SEGREDOS.filter((s) => texto.includes(s)).map((s) => `${s.slice(0, 12)}...`);

// -------------------------------------------------------------------- canais --
const CANAIS = [
  { codigo: 'site', url_perfil: 'https://exemplo.com.br' },
  { codigo: 'google', url_perfil: null },
  { codigo: 'facebook', url_perfil: 'https://www.facebook.com/impresilk.exemplo' },
  { codigo: 'instagram', url_perfil: 'https://www.instagram.com/impresilk_exemplo/' },
  { codigo: 'linkedin', url_perfil: 'https://www.linkedin.com/company/empresa-exemplo' },
  { codigo: 'pinterest', url_perfil: 'https://br.pinterest.com/empresa_exemplo/' },
];

// ============================================================ a rede falsa ==
const ler = (sub, n) => readFileSync(new URL(`./fixtures/${sub}/${n}`, import.meta.url), 'utf8');
const fj = (sub, n) => JSON.parse(ler(sub, `${n}.json`));
const ok = (corpo, headers = {}) => ({ status: 200, corpo, headers });
const falha = (status, corpo = null) => ({ status, corpo });
const somar = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dias = (de, ate) => { const f = []; for (let d = de; d <= ate; d = somar(d, 1)) f.push(d); return f; };
const segundaDe = (d) => somar(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));

// ----- site (tests/mkt-site.test.mjs: domínio exemplo.com.br) -----
const O = 'https://exemplo.com.br';
const pagCom = (t) => `<!DOCTYPE html><html lang="pt-BR"><head><title>${t}</title><script async src="https://www.googletagmanager.com/gtag/js?id=G-EXEMPLO123"></script><script>gtag('config','G-EXEMPLO123');</script></head><body><h1>${t}</h1></body></html>`;
const html = (corpo, h = {}) => ({ status: 200, corpo, headers: { 'content-type': 'text/html; charset=UTF-8', ...h } });
const xml = (corpo) => ({ status: 200, corpo, headers: { 'content-type': 'application/xml' } });
const ir = (para, status = 301) => ({ status, corpo: '', headers: { location: para } });
const fs = (n) => ler('mkt-site', n);
const ROTAS_SITE = {
  [`${O}/`]: html(fs('home.html'), { server: 'nginx/1.24.0', 'x-cache': 'MISS', link: `<${O}/index.php?rest_route=/>; rel="https://api.w.org/"` }),
  'https://www.exemplo.com.br/': ir(`${O}/`),
  [`${O}/robots.txt`]: { status: 200, corpo: fs('robots.txt'), headers: { 'content-type': 'text/plain' } },
  [`${O}/sitemap_index.xml`]: ir(`${O}/sitemap_index.xml/`),
  [`${O}/sitemap_index.xml/`]: ir(`${O}/sitemap_index.xml/`),
  [`${O}/?sitemap=1`]: xml(fs('sitemap-indice.xml')),
  [`${O}/?sitemap=page&sitemap_n=1`]: xml(fs('sitemap-page.xml')),
  [`${O}/?sitemap=post&sitemap_n=1`]: xml(fs('sitemap-post.xml')),
  [`${O}/?sitemap=category&sitemap_n=1`]: xml(fs('sitemap-category.xml')),
  [`${O}/?page_id=151`]: html(fs('pagina-etiquetas.html')),
  [`${O}/?page_id=144`]: html(fs('pagina-simples.html')),
  [`${O}/?page_id=2`]: html(fs('pagina-exemplo.html')),
  [`${O}/?page_id=209`]: html(pagCom('Trabalhe conosco')),
  [`${O}/?p=1`]: html(pagCom('Olá, mundo!')),
  [`${O}/?cat=1`]: html(pagCom('Sem categoria')),
  'rest:/wp/v2/pages': { status: 200, corpo: fs('wp-pages.json'), headers: { 'content-type': 'application/json', 'x-wp-total': '5', 'x-wp-totalpages': '1' } },
  'rest:/wp/v2/posts': { status: 200, corpo: fs('wp-posts.json'), headers: { 'content-type': 'application/json', 'x-wp-total': '1', 'x-wp-totalpages': '1' } },
  'rest:/': { status: 200, corpo: fs('wp-raiz.json'), headers: { 'content-type': 'application/json' } },
};
function doSite(u) {
  const rr = u.searchParams.get('rest_route');
  return ROTAS_SITE[rr != null && u.pathname === '/index.php' ? `rest:${rr}` : u.toString()] ?? { status: 404, corpo: '<html>não achei</html>', headers: { 'content-type': 'text/html' } };
}
function doGoogleDoSite(u, corpo) {
  if (u.hostname === 'dns.google') {
    const n = u.searchParams.get('name'), t = u.searchParams.get('type');
    // 203.0.113.0/24 é a faixa de documentação: IP "de internet" de mentira.
    return ok(t === 'A' ? { Status: 0, Answer: [{ name: `${n}.`, type: 1, TTL: 300, data: '203.0.113.10' }] } : t === 'AAAA' ? { Status: 0 } : t === 'MX' ? fj('mkt-site', 'dns-mx') : n.startsWith('_dmarc.') ? fj('mkt-site', 'dns-dmarc') : fj('mkt-site', 'dns-txt'));
  }
  if (u.hostname === 'api.wordpress.org') return ok(u.pathname.includes('/core/') ? fj('mkt-site', 'wporg-core') : existsSync(new URL(`./fixtures/mkt-site/wporg-${u.searchParams.get('request[slug]')}.json`, import.meta.url)) ? fj('mkt-site', `wporg-${u.searchParams.get('request[slug]')}`) : { error: 'Plugin not found.' });
  if (u.hostname === 'chromeuxreport.googleapis.com') return ok(u.pathname.endsWith(':queryHistoryRecord') ? fj('mkt-site', 'crux-historico') : fj('mkt-site', 'crux-origem'));
  if (u.hostname === 'pagespeedonline.googleapis.com') {
    const est = u.searchParams.get('strategy'), cats = u.searchParams.getAll('category');
    return ok(cats.includes('AGENTIC_BROWSING') ? fj('mkt-site', 'psi-agentes') : fj('mkt-site', est === 'MOBILE' ? 'psi-mobile' : 'psi-desktop'));
  }
  return null;
}

// ----- google (tests/mkt-google.test.mjs, com o domínio do site trocado) -----
const fg = (n) => fj('mkt-google', n);
const SEMANA_MORTA = '2026-09-14';
const DIAS_MORTOS = new Set([...dias('2026-09-14', '2026-09-20'), '2026-09-02']);
const VALORES = {
  sessionDefaultChannelGroup: ['Organic Search', 'Direct'], sessionSourceMedium: ['google / organic', '(direct) / (none)'], sessionCampaignName: ['(organic)'],
  pagePathPlusQueryString: ['/', '/?page_id=144'], pageTitle: ['Impresilk', 'Valores'], hostName: ['exemplo.com.br'], landingPagePlusQueryString: ['/', '/?page_id=144'],
  city: ['Belo Horizonte'], region: ['Minas Gerais'], country: ['Brazil'], deviceCategory: ['mobile', 'desktop'], newVsReturning: ['new', 'returning'],
  eventName: ['generate_lead'], linkDomain: ['wa.me'], linkUrl: ['https://wa.me/5531900000000'], sessionGoogleAdsCampaignName: ['Fachadas'],
};
const TIPOS = { engagementRate: 'TYPE_FLOAT', bounceRate: 'TYPE_FLOAT', returnOnAdSpend: 'TYPE_FLOAT', averageSessionDuration: 'TYPE_SECONDS', userEngagementDuration: 'TYPE_SECONDS', advertiserAdCost: 'TYPE_CURRENCY', advertiserAdCostPerClick: 'TYPE_CURRENCY' };
const isoAnoSemana = (d0) => {
  const d = new Date(`${d0}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear(), q1 = new Date(Date.UTC(ano, 0, 1, 12)); q1.setUTCDate(1 + ((4 - q1.getUTCDay() + 7) % 7));
  return `${ano}${String(1 + Math.round((d - q1) / 6048e5)).padStart(2, '0')}`;
};
const valorFalso = (m, chave) => {
  if (TIPOS[m] === 'TYPE_FLOAT') return '0.6123';
  if (TIPOS[m]) return '75.5';
  let h = m.length * 7; for (const c of chave) h += c.charCodeAt(0);
  return String(20 + (h % 500));
};
function relatorioGa4(req) {
  const dims = (req.dimensions ?? []).map((d) => d.name), mets = (req.metrics ?? []).map((m) => m.name);
  const { startDate, endDate } = req.dateRanges[0];
  const tempo = dims.find((d) => d === 'date' || d === 'isoYearIsoWeek'), cat = dims.filter((d) => d !== tempo);
  let instantes = [[null, 'periodo']];
  if (tempo === 'date') instantes = dias(startDate, endDate).filter((d) => !DIAS_MORTOS.has(d)).map((d) => [d.replaceAll('-', ''), d]);
  if (tempo === 'isoYearIsoWeek') { instantes = []; for (let s = segundaDe(startDate); s <= endDate; s = somar(s, 7)) if (s !== SEMANA_MORTA) instantes.push([isoAnoSemana(s), s]); }
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
  };
}
// O Search Console: o primeiro dia incompleto é anteontem.
const PRIMEIRO_INCOMPLETO = somar(HOJE, -2);
const valorSc = (t, k) => { let h = t === 'c' ? 3 : 11; for (const c of k) h += c.charCodeAt(0); return t === 'c' ? 100 + (h % 60) : 4000 + (h % 900); };
function searchConsole(c) {
  const dims = c.dimensions ?? [], tipo = c.type ?? 'web';
  if (tipo !== 'web') return { responseAggregationType: 'byProperty' };
  if (c.dimensionFilterGroups) return { rows: [{ clicks: 30, impressions: 400, ctr: 0.05, position: 3 }] };
  if (!dims.length) return { rows: [{ clicks: valorSc('c', c.startDate), impressions: valorSc('i', c.startDate), ctr: 0.025, position: 14.2 }], responseAggregationType: 'byProperty' };
  if (dims[0] === 'date') {
    const rows = dias(c.startDate, c.endDate).filter((d) => d <= PRIMEIRO_INCOMPLETO).map((d) => ({ keys: [d], clicks: valorSc('c', d) % 20, impressions: valorSc('i', d) % 700, ctr: 0.02, position: 15.5 }));
    return { rows, responseAggregationType: 'byProperty', ...(c.dataState === 'all' ? { metadata: { first_incomplete_date: PRIMEIRO_INCOMPLETO } } : {}) };
  }
  if (dims[0] === 'hour') return fg('sc-por-hora');
  if (c.startRow) return { rows: [] };
  if (dims[0] === 'query') return fg('sc-consultas');
  if (dims[0] === 'page') return fg('sc-paginas');
  return { rows: [] };
}
const gd = (d) => { const [year, month, day] = d.split('-').map(Number); return { year, month, day }; };
function metricasPerfil(u) {
  const q = u.searchParams, metricas = q.getAll('dailyMetrics');
  const data = (p) => `${q.get(`dailyRange.${p}_date.year`)}-${q.get(`dailyRange.${p}_date.month`).padStart(2, '0')}-${q.get(`dailyRange.${p}_date.day`).padStart(2, '0')}`;
  const dd = dias(data('start'), data('end'));
  const valor = (m, d) => { let h = m.length; for (const c of d) h += c.charCodeAt(0); return 1 + (h % 30); };
  return { multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: metricas.map((m) => ({ dailyMetric: m, timeSeries: { datedValues: dd.map((d) => ({ date: gd(d), value: String(valor(m, d)) })) } })) }] };
}
function doGoogle(url, corpo) {
  if (/analyticsadmin\.googleapis\.com\/v1beta\/accountSummaries/.test(url)) return ok(fg('ga4-contas'));
  if (/properties\/111\/dataStreams/.test(url)) return ok(fg('ga4-fluxos-111'));
  if (/properties\/222\/dataStreams/.test(url)) return ok(fg('ga4-fluxos-222'));
  if (/properties\/222\/keyEvents/.test(url)) return ok(fg('ga4-eventos-chave'));
  if (/properties\/222\/googleAdsLinks/.test(url)) return ok({});
  if (/analyticsadmin\.googleapis\.com\/v1beta\/properties\/222$/.test(url)) return ok(fg('ga4-propriedade'));
  if (/:batchRunReports$/.test(url)) return ok({ reports: corpo.requests.map(relatorioGa4) });
  if (/:runReport$/.test(url)) return ok(relatorioGa4(corpo));
  if (url === 'https://www.googleapis.com/webmasters/v3/sites') return ok({ siteEntry: [{ siteUrl: 'sc-domain:exemplo.com.br', permissionLevel: 'siteOwner' }] });
  if (/searchAnalytics\/query$/.test(url)) return ok(searchConsole(corpo));
  if (/\/sitemaps$/.test(url)) return ok(fg('sc-sitemaps'));
  if (/urlInspection\/index:inspect$/.test(url)) return ok(fg('sc-inspecao'));
  if (/mybusinessaccountmanagement\.googleapis\.com\/v1\/accounts/.test(url)) return ok(fg(url.includes('pageToken=p2') ? 'gbp-contas-p2' : 'gbp-contas-p1'));
  if (/accounts\/100\/locations\?/.test(url)) return ok({});
  if (/accounts\/111\/locations\?/.test(url)) return ok(fg('gbp-locais'));
  if (/VoiceOfMerchantState$/.test(url)) return ok(fg('gbp-situacao'));
  if (/locations\/222\/attributes$/.test(url)) return ok(fg('gbp-atributos'));
  if (/fetchMultiDailyMetricsTimeSeries/.test(url)) return ok(metricasPerfil(new URL(url)));
  if (/searchkeywords\/impressions\/monthly/.test(url)) return ok(fg('gbp-termos'));
  if (/\/reviews\?/.test(url)) {
    const q = new URL(url).searchParams;
    if (!q.get('orderBy')) return ok(fg(q.get('pageToken') === 'r2' ? 'gbp-avaliacoes-p2' : 'gbp-avaliacoes-p1'));
    return ok(q.get('pageToken') ? { reviews: [], totalReviewCount: 4 } : fg('gbp-avaliacoes-nota'));
  }
  if (/\/localPosts\?/.test(url)) return ok(fg('gbp-posts'));
  if (/\/media\/customers\?/.test(url)) return ok(fg('gbp-midias-clientes'));
  if (/\/media\?/.test(url)) return ok(fg('gbp-midias'));
  if (/\/followers\/metadata$/.test(url)) return ok(fg('gbp-seguidores'));
  return null;
}

// ----- google ads (tests/mkt-google_ads.test.mjs, roteado pela consulta GAQL) -----
const fa = (n) => (existsSync(new URL(`./fixtures/mkt-google_ads/${n}.json`, import.meta.url)) ? fj('mkt-google_ads', n) : { results: [] });
const FIXTURE_ADS = {
  semanas: 'semanas', conversoesSemana: 'conversoes-semana', acoes: 'acoes-conversao', campanhasLista: 'campanhas-lista', campanhasDias: 'campanhas-dias',
  ligacoes: 'ligacoes', leads: 'leads', dias: 'dias', termos: 'termos', palavras: 'palavras', grupos: 'grupos', anuncios: 'anuncios', parcela: 'parcela',
  chamadas: 'chamadas', paginas: 'paginas', cidades: 'cidades', horarios: 'horarios', aparelhos: 'aparelhos', idade: 'idade', genero: 'genero',
  termosPmax: 'termos-pmax', categorias: 'categorias', pmax: 'pmax', alteracoes: 'alteracoes',
};
const CONSULTA_ADS = new Map(Object.entries(consultas(periodo(HOJE))).map(([k, q]) => [q, k.replace(/Reserva$/, '')]));
function doGoogleAds(u, corpo, opcoes) {
  if (u.pathname.endsWith('/customers:listAccessibleCustomers')) return ok(fa('contas-acessiveis'));
  const m = /\/customers\/(\d+)\/googleAds:search$/.exec(u.pathname);
  if (!m) return null;
  const q = String(corpo?.query ?? '');
  if (/FROM geo_target_constant/.test(q)) return ok(fa('geo-nomes'));
  const nome = CONSULTA_ADS.get(q);
  if (nome === 'conta') return ok(fa(`conta-${m[1]}`));
  if (nome === 'filhas') return ok(fa(`filhas-${m[1]}`));
  // O Google apaga o lead de formulário depois de 60 dias.
  if (nome === 'leads' && opcoes.semLeads) return ok({ results: [] });
  return ok(FIXTURE_ADS[nome] ? fa(FIXTURE_ADS[nome]) : { results: [] });
}

// ----- meta (tests/mkt-meta.test.mjs) -----
const fm = (n) => fj('mkt-meta', n);
const PAGE = '100000000000001', IG = '17841400000000001', ACT = 'act_1000000001', PIX = '809468386955046';
class ErroHttp { constructor(status, corpo) { this.status = status; this.corpo = corpo; } }
const filtrar = (f, metricas, recusar = []) => {
  if (metricas.some((m) => recusar.includes(m))) throw new ErroHttp(400, fm('erro-metrica'));
  return { ...f, data: f.data.filter((d) => metricas.includes(d.name)) };
};
function rotaMeta(u) {
  const p = u.pathname.replace(/^\/v26\.0/, '');
  const q = Object.fromEntries(u.searchParams);
  const metricas = (q.metric || '').split(',').filter(Boolean);
  switch (p) {
    case '/me/accounts': return fm('me-accounts');
    case `/${PAGE}`: return fm('pagina');
    case `/${PAGE}/insights`:
      if (q.period === 'day') return filtrar(fm('pagina-insights-dia'), metricas);
      if (q.period === 'week') return filtrar(fm('pagina-insights-semana'), metricas);
      if (q.period === 'days_28') return filtrar(fm('pagina-insights-28'), metricas);
      return filtrar(fm('pagina-lugares'), metricas, ['page_follows_city']);
    case `/${PAGE}/published_posts`: return q.after === 'B' ? fm('posts-p2') : fm('posts-p1');
    case `/${PAGE}/video_reels`: throw new ErroHttp(400, fm('erro-permissao'));
    case `/${IG}`: return fm('ig-conta');
    case `/${IG}/insights`:
      if (q.breakdown === 'media_product_type') return fm('ig-insights-quebra');
      if (q.breakdown === 'follow_type' && metricas.includes('follows_and_unfollows')) return fm('ig-seguir');
      if (['follow_type', 'follower_type', 'contact_button_type'].includes(q.breakdown)) return filtrar(fm('ig-quebras'), metricas);
      if (['age', 'city', 'country', 'gender'].includes(q.breakdown)) return { data: fm('ig-demografia')[q.breakdown].filter((d) => metricas.includes(d.name)) };
      if (q.metric_type === 'time_series') return fm('ig-serie');
      return filtrar(fm('ig-insights-semana'), metricas);
    case `/${IG}/media`: return fm('ig-midias');
    case `/${IG}/stories`: return fm('ig-stories');
    case '/me/adaccounts': return fm('adaccounts');
    case `/${ACT}/insights`:
      if (q.level === 'campaign') return q.time_increment === '1' ? fm('ads-campanha-dia') : fm('ads-campanha');
      if (q.breakdowns === 'publisher_platform') return fm('ads-plataforma');
      if (q.time_increment === '7') return fm('ads-semana');
      return fm('ads-dia');
    case `/${ACT}/campaigns`: return fm('campanhas');
    case `/${ACT}/adspixels`: return fm('adspixels');
    case `/${PIX}`: return fm('pixel');
    case `/${PIX}/stats`: return fm({ event: 'pixel-stats-evento', event_source: 'pixel-stats-origem', url: 'pixel-stats-url' }[q.aggregation]);
    case '/dataset_quality': return fm('dataset-quality');
    case '/7001/video_insights': return fm('reel-insights');
    case '/18000000000000001/insights':
      if (metricas.includes('facebook_views')) throw new ErroHttp(400, fm('erro-metrica'));
      return filtrar(fm('ig-midia-feed'), metricas);
    case '/18000000000000002/insights':
      return metricas.includes('facebook_views') ? filtrar(fm('ig-midia-cruzadas'), metricas) : filtrar(fm('ig-midia-reels'), metricas);
    case '/18000000000000009/insights': throw new ErroHttp(400, fm('erro-poucos'));
  }
  if (/^\/\d+_\d+\/insights$/.test(p)) return filtrar(metricas.some((m) => m.startsWith('post_video')) ? fm('post-video-insights') : fm('post-insights'), metricas);
  return undefined;
}
function doMeta(u) {
  try {
    const r = rotaMeta(u);
    return r === undefined ? null : ok(r);
  } catch (e) {
    if (e instanceof ErroHttp) return falha(e.status, e.corpo);
    throw e;
  }
}

// ----- linkedin (tests/mkt-linkedin.test.mjs) -----
const fl = (n) => fj('mkt-linkedin', n);
const ORG = 'urn:li:organization:90000001';
const intervalo = (url) => { const m = /timeRange:\(start:(\d+),end:(\d+)\)/.exec(decodeURIComponent(url)); return m ? [Number(m[1]), Number(m[2])] : null; };
function serie(url, f) {
  const [a, b] = intervalo(url); const elements = [];
  for (let t = a; t < b; t += DIA) { const x = f(new Date(t).toISOString().slice(0, 10)); if (x) elements.push({ timeRange: { start: t, end: t + DIA }, ...x }); }
  return { paging: { count: 10, start: 0 }, elements };
}
const ganho = () => ({ followerGains: { organicFollowerGain: 3, paidFollowerGain: 1 }, organizationalEntity: ORG });
const visita = () => ({ organization: ORG, totalPageStatistics: { clicks: { desktopCustomButtonClickCounts: [{ customButtonType: 'VISIT_WEBSITE', clicks: 1 }], mobileCustomButtonClickCounts: [] },
  views: { allPageViews: { pageViews: 10, uniquePageViews: 7 }, overviewPageViews: { pageViews: 6, uniquePageViews: 4 }, careersPageViews: { pageViews: 0, uniquePageViews: 0 } } } });
const conteudoDia = () => ({ organizationalEntity: ORG, totalShareStatistics: { impressionCount: 100, uniqueImpressionsCount: 60, clickCount: 5, likeCount: 4, commentCount: 1, shareCount: 1, engagement: 0.11 } });
function doLinkedin(u, url) {
  if (u.hostname !== 'api.linkedin.com') return null;
  const p = u.pathname.replace(/^\/rest/, ''), janela = url.includes('timeIntervals=');
  const porPost = /[?&](shares=|ugcPosts)/.test(url);
  if (p === '/organizationAcls') return ok(fl('acl'));
  if (p === '/organizations/90000001') return ok(fl('organizacao'));
  if (p.startsWith('/networkSizes/')) return ok(fl('network-sizes'));
  if (p === '/organizationalEntityFollowerStatistics') return ok(janela ? serie(url, ganho) : fl('seguidores-perfil'));
  if (p === '/organizationPageStatistics') return ok(janela ? serie(url, visita) : fl('visitas-desde-sempre'));
  if (p === '/organizationalEntityShareStatistics') return ok(porPost ? fl('estatistica-por-post') : janela ? serie(url, conteudoDia) : fl('conteudo-desde-sempre'));
  if (p === '/posts') return ok(fl('posts'));
  if (p.startsWith('/socialMetadata/')) return ok(fl('social-metadata'));
  if (p === '/videoAnalytics') return ok(fl('video'));
  return null;
}

// ----- pinterest (tests/mkt-pinterest.test.mjs) -----
const fp = (n) => fj('mkt-pinterest', n);
const VIDEOS = new Set(['1000000000000000002']);
const statusDoDia = (dia) => (dia >= somar(HOJE, -2) ? 'ESTIMATE' : 'READY');
const CONTA_PIN = { ALL: { IMPRESSION: 100, ENGAGEMENT: 10, PIN_CLICK: 4, OUTBOUND_CLICK: 3, SAVE: 2 }, ORGANIC: { IMPRESSION: 80, ENGAGEMENT: 8, PIN_CLICK: 3, OUTBOUND_CLICK: 2, SAVE: 2 }, PAID: { IMPRESSION: 20, ENGAGEMENT: 2, PIN_CLICK: 1, OUTBOUND_CLICK: 1, SAVE: 0 } };
const SPLITS = { APP_TYPE: ['MOBILE', 'WEB', 'TABLET'], SOURCE: ['YOUR_PINS', 'OTHER_PINS'], PIN_FORMAT: ['ORGANIC_IMAGE', 'ORGANIC_VIDEO'], OWNED_CONTENT: ['OWNED', 'NOT_OWNED'] };
function serieContaPin(u) {
  const q = u.searchParams, metricas = (q.get('metric_types') || '').split(',').filter(Boolean);
  if (!metricas.length || metricas.some((m) => !METRICAS_CONTA.includes(m))) return falha(400, fp('erro-400-metrica'));
  const base = CONTA_PIN[q.get('content_type') || 'ALL'];
  const valor = (m) => (m.endsWith('_RATE') ? base[m.replace('_RATE', '')] / base.IMPRESSION : base[m]);
  const ds = dias(q.get('start_date'), q.get('end_date'));
  const summary_metrics = Object.fromEntries(metricas.map((m) => [m, m.endsWith('_RATE') ? valor(m) : valor(m) * ds.length]));
  if (q.get('split_field')) return ok(Object.fromEntries(SPLITS[q.get('split_field')].map((g) => [g, { summary_metrics }])));
  return ok({ all: { daily_metrics: ds.map((d) => ({ date: d, data_status: statusDoDia(d), metrics: Object.fromEntries(metricas.map((m) => [m, valor(m)])) })), summary_metrics } });
}
const PIN_VALOR = { IMPRESSION: 10, OUTBOUND_CLICK: 1, PIN_CLICK: 2, SAVE: 1, SAVE_RATE: 0.1, USER_FOLLOW: 1, PROFILE_VISIT: 1, TOTAL_COMMENTS: 0, TOTAL_REACTIONS: 1 };
function seriePin(u) {
  const id = u.pathname.split('/')[3], metricas = (u.searchParams.get('metric_types') || '').split(',').filter(Boolean);
  const aceitas = VIDEOS.has(id) ? METRICAS_PIN_VIDEO : METRICAS_PIN;
  if (!metricas.length || metricas.some((m) => !aceitas.includes(m))) return falha(400, fp('erro-400-metrica'));
  const v = (m) => PIN_VALOR[m] ?? 5;
  const ds = dias(u.searchParams.get('start_date'), u.searchParams.get('end_date'));
  return ok({ ALL: {
    daily_metrics: ds.map((d) => ({ date: d, data_status: statusDoDia(d), metrics: Object.fromEntries(metricas.map((m) => [m, v(m)])) })),
    summary_metrics: Object.fromEntries(metricas.map((m) => [m, m.endsWith('_RATE') ? v(m) : v(m) * ds.length])),
    lifetime_metrics: { TOTAL_COMMENTS: 4, TOTAL_REACTIONS: 9 },
  } });
}
function doPinterest(u) {
  if (u.hostname !== 'api.pinterest.com') return null;
  const p = u.pathname, q = u.searchParams;
  if (p === '/v5/user_account') return ok(fp('user-account'));
  if (p === '/v5/user_account/analytics') return serieContaPin(u);
  if (p === '/v5/user_account/analytics/top_pins') return ok(fp('top-pins'));
  if (p === '/v5/user_account/analytics/top_video_pins') return ok(fp('top-video-pins'));
  if (p === '/v5/pins') return ok(q.get('domain') ? fp('pins-site') : q.get('bookmark') === 'bm-pagina-2' ? fp('pins-p2') : fp('pins-p1'));
  if (/^\/v5\/pins\/\d+\/analytics$/.test(p)) return seriePin(u);
  if (p === '/v5/boards') return ok(fp('boards'));
  if (p === '/v5/ad_accounts') return ok(fp('ad-accounts'));
  if (p === '/v5/ad_accounts/549755885175/analytics') {
    if (q.has('engagement_window_days')) return falha(400, fp('erro-400-metrica'));
    return ok(fp('anuncios-por-dia').filter((l) => l.DATE >= q.get('start_date') && l.DATE <= q.get('end_date')));
  }
  if (p === '/v5/ad_accounts/549755885175/campaigns') return ok(fp('campanhas'));
  if (p === '/v5/ad_accounts/549755885175/campaigns/analytics') return q.has('engagement_window_days') ? falha(400) : ok(fp('campanhas-analise'));
  if (p === '/v5/ad_accounts/549755885175/audience_insights') return ok(q.get('audience_insight_type') === 'YOUR_TOTAL_AUDIENCE' ? fp('publico-total') : fp('publico-engajado'));
  return null;
}

// ----- os endpoints de token -----
function doToken(u, corpoTexto) {
  const f = new URLSearchParams(corpoTexto || '');
  if (u.toString() === 'https://oauth2.googleapis.com/token') {
    if (f.get('grant_type') === 'refresh_token') return ok(fg('token-renovado'));
    if (f.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && f.get('assertion')) return ok({ access_token: TOKEN_ADS, expires_in: 3599, token_type: 'Bearer' });
    return falha(400, { error: 'invalid_request' });
  }
  if (u.toString() === 'https://api.pinterest.com/v5/oauth/token' && f.get('grant_type') === 'refresh_token') return ok(fp('token-renovado'));
  if (u.toString() === 'https://www.linkedin.com/oauth/v2/accessToken') return falha(400, { error: 'invalid_grant' });
  return null;
}

/** A internet de mentira. Cada pedido fica anotado com a fonte que estava
 *  rodando, para o teste conferir onde cada uma pode bater. */
function internet({ foraDoAr = false } = {}) {
  const pedidos = [];
  const opcoes = { semLeads: false };
  let fonte = null;
  const responder = (url, init) => {
    const u = new URL(url);
    const texto = typeof init.body === 'string' ? init.body : init.body == null ? '' : String(init.body);
    let json = null;
    try { json = texto.startsWith('{') ? JSON.parse(texto) : null; } catch { json = null; }
    if (u.hostname === 'exemplo.com.br' || u.hostname === 'www.exemplo.com.br') return doSite(u);
    return doToken(u, texto) ?? doGoogleDoSite(u, json) ?? (u.hostname === 'googleads.googleapis.com' ? doGoogleAds(u, json, opcoes) : null)
      ?? (/googleapis\.com$/.test(u.hostname) ? doGoogle(u.toString(), json) : null)
      ?? (u.hostname === 'graph.facebook.com' ? doMeta(u) : null) ?? doLinkedin(u, u.toString()) ?? doPinterest(u)
      ?? falha(404, { error: { code: 404, message: 'rota falsa' } });
  };
  const fetch = async (url, init = {}) => {
    const cab = {};
    for (const [k, v] of Object.entries(init.headers || {})) cab[k.toLowerCase()] = String(v);
    pedidos.push({ fonte, url: String(url), metodo: init.method || 'GET', cabecalhos: cab, redirect: init.redirect ?? null });
    if (foraDoAr) throw new TypeError('fetch failed');
    const r = responder(String(url), init);
    const corpo = typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo ?? {});
    const tipo = typeof r.corpo === 'string' ? 'text/plain' : 'application/json';
    const resposta = new Response(r.status === 304 ? null : corpo, { status: r.status, headers: { 'content-type': tipo, ...(r.headers || {}) } });
    // Como o fetch de verdade: sem redirect 'manual', o 3xx é seguido sozinho
    // (é isso que a coletora e o site nunca podem deixar acontecer).
    const destino = r.status >= 300 && r.status < 400 ? r.headers?.location : null;
    if (destino && init.redirect !== 'manual') return fetch(new URL(destino, url).toString(), init);
    return resposta;
  };
  return { fetch, pedidos, rodando: (f) => { fonte = f; }, ajustar: (o) => Object.assign(opcoes, o) };
}

// ================================================================== o banco ==
const STUBS = `
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, description text not null default '',
  secret text not null, key_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create view vault.decrypted_secrets as
  select id, name, description, secret, convert_from(decode(secret, 'base64'), 'utf8') as decrypted_secret, key_id, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language plpgsql as $$
declare i uuid;
begin
  insert into vault.secrets(name, description, secret, key_id) values ($2, coalesce($3, ''), encode(convert_to($1, 'utf8'), 'base64'), $4) returning id into i;
  return i;
end $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language plpgsql as $$
begin
  update vault.secrets set secret = coalesce(encode(convert_to($2, 'utf8'), 'base64'), secret), name = coalesce($3, name),
    description = coalesce($4, description), updated_at = now() where id = $1;
end $$;
create schema cron;
create table cron.job(jobid bigserial primary key, jobname text unique, schedule text not null, command text not null);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare i bigint;
begin insert into cron.job(jobname, schedule, command) values ($1, $2, $3) returning jobid into i; return i; end $$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
begin delete from cron.job where jobname = $1; if not found then raise exception 'could not find valid entry for job ''%''', $1; end if; return true; end $$;
create schema net;
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 1::bigint $$;
`;
const CANAL_BASE = { grupo: 'digital', icone: 'globe', cor: '#0a66c2', ordem: 10, ativo: true, em_implantacao: false, dias_parado: 7 };

/* O relógio do banco é o da vm: toda chamada a now() das migrações vira
   public.painel_teste_agora(), que é o now() de verdade mais o mesmo desvio
   que o relogio() dá à vm (as duas horas andam juntas). Só aqui, no teste: a
   migração não muda. `agora` é a hora que a vm vai ver. */
const RELOGIO_DO_BANCO = 'public.painel_teste_agora()';
async function bancoDeVerdade(agora = AGORA) {
  const pg = new PGlite();
  const desvio = Math.round(agora - Date.now());
  await pg.exec(`set timezone = 'Pacific/Kiritimati';
    create role anon; create role authenticated; create role service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create function ${RELOGIO_DO_BANCO} returns timestamptz language sql stable as $$ select now() + interval '${desvio} milliseconds' $$;
    create table public.painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));
    create table public.painel_config_global(id boolean primary key,config jsonb,atualizado_em timestamptz);
    create table public.painel_contas(usuario text primary key,nome text,permissoes jsonb,vendedor_id text,hash text,salt text,iter int,atualizado_em timestamptz);
    create table public.painel_cache(chave text primary key,valor jsonb not null,atualizado_em timestamptz not null default now());`);
  await pg.exec(STUBS);
  for (const arquivo of ['20261010a_marketing_base.sql', '20261011a_marketing_canais.sql', '20261012a_marketing_fontes.sql']) {
    const sql = readFileSync(new URL(`../supabase/migrations/${arquivo}`, import.meta.url), 'utf8');
    await pg.exec(sql.replace(/\bnow\(\)/gi, RELOGIO_DO_BANCO));
  }
  for (const c of CANAIS) {
    await pg.query('select public.painel_mkt_salvar_canal($1::uuid, $2::jsonb, $3::int, $4)', [null, JSON.stringify({ ...CANAL_BASE, codigo: c.codigo, nome: c.codigo, url_perfil: c.url_perfil }), null, 'leo']);
  }
  for (const [fonte, valor] of Object.entries(CONEXOES)) await pg.query('select public.painel_mkt_conexao_gravar($1, $2::jsonb)', [fonte, JSON.stringify(valor)]);
  return {
    deVerdade: true,
    pg,
    canais: async () => (await pg.query('select codigo, nome, url_perfil from public.painel_mkt_canais where ativo order by ordem, codigo')).rows,
    // A RPC pelo nome dos parâmetros, como o PostgREST faz.
    async rpc(nome, params = {}) {
      assert.match(nome, /^painel_mkt_[a-z_]+$/);
      const chaves = Object.keys(params);
      // null vai sem tipo: o PostgREST escolhe a função pelo nome dos
      // parâmetros, e o banco acha o tipo do nulo pela assinatura.
      const tipo = (v) => (v === null ? '' : typeof v === 'object' ? '::jsonb' : typeof v === 'number' ? '::int' : typeof v === 'boolean' ? '::boolean' : '::text');
      const args = chaves.map((k, i) => `${k} => $${i + 1}${tipo(params[k])}`).join(', ');
      const valores = chaves.map((k) => (params[k] !== null && typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]));
      return (await pg.query(`select public.${nome}(${args}) as r`, valores)).rows[0]?.r ?? null;
    },
  };
}

/** O banco sem PGlite: as RPCs respondem no formato da migração, sem as regras
 *  dela (aceitam tudo). O cofre é um objeto, e a info sai sem token, como a
 *  painel_mkt_conexao_info. */
function bancoDeMentira() {
  const cofre = clone(CONEXOES);
  const respostas = {
    painel_mkt_conexao_ler: (p) => clone(cofre[p.p_fonte] ?? null),
    painel_mkt_conexao_gravar: (p) => { cofre[p.p_fonte] = clone(p.p_valor); return null; },
    painel_mkt_conexao_regravar: (p) => {
      const id = (c) => [c?.access_token ?? null, c?.refresh_token ?? null, c?.conectado_em ?? null].join('|');
      if (!cofre[p.p_fonte] || id(cofre[p.p_fonte]) !== id(p.p_esperado)) return 'mudou';
      cofre[p.p_fonte] = clone(p.p_valor);
      return 'gravada';
    },
    painel_mkt_conexao_apagar: (p) => { delete cofre[p.p_fonte]; return null; },
    painel_mkt_conexao_info: () => Object.fromEntries(Object.entries(cofre).map(([f, c]) => [f, {
      conectado_em: c.conectado_em ?? null, conectado_por: c.conectado_por ?? null, conta: c.conta ?? null,
      escopos: c.escopos ?? [], expira_em: c.expira_em ?? null, refresh_expira_em: c.refresh_expira_em ?? null,
    }])),
    painel_mkt_api_metricas: (p) => ({ gravadas: p.p_linhas.length, iguais: 0, ignoradas: [] }),
    painel_mkt_api_publicacoes: (p) => ({ inseridas: p.p_linhas.length, atualizadas: 0, iguais: 0, retiradas: 0, ignoradas: [] }),
    painel_mkt_api_faxina: (p) => ({ canal: p.p_canal, numeros_apagados: 0, publicacoes_limpas: 0, titulos_zerados: 0 }),
  };
  return {
    deVerdade: false,
    canais: async () => CANAIS.map((c) => ({ codigo: c.codigo, nome: c.codigo, url_perfil: c.url_perfil })),
    async rpc(nome, params = {}) {
      if (!respostas[nome]) throw Object.assign(new Error(`função ${nome} não existe`), { code: '42883' });
      return respostas[nome](clone(params));
    },
  };
}
const abrirBanco = () => (PGlite ? bancoDeVerdade() : Promise.resolve(bancoDeMentira()));
const conexaoGuardada = (banco, fonte) => banco.rpc('painel_mkt_conexao_ler', { p_fonte: fonte });

/* O diário e a trava da coleta são funções do banco que leem e gravam uma
   linha do painel_cache, e o painel_cache aqui é o Map. Com o PGlite, a
   função do banco roda de verdade: a linha vai do Map para o banco antes, e
   volta depois. Sem ele, a mesma regra em JavaScript (anotarComTrava; o teste
   de banco confere que as duas são a mesma). */
const NA_LINHA_DO_CACHE = { painel_mkt_coleta_anotar: 'mkt_coleta_diario', painel_mkt_coleta_pedir: 'mkt_coleta_pedidos' };
async function rpcNoCache(banco, cache, nome, params) {
  const chave = NA_LINHA_DO_CACHE[nome];
  if (banco.deVerdade) {
    await banco.pg.query('delete from public.painel_cache where chave = $1', [chave]);
    if (cache.has(chave)) await banco.pg.query('insert into public.painel_cache (chave, valor) values ($1, $2::jsonb)', [chave, JSON.stringify(cache.get(chave))]);
    const data = await banco.rpc(nome, params);
    const linha = (await banco.pg.query('select valor from public.painel_cache where chave = $1', [chave])).rows[0];
    if (linha) cache.set(chave, clone(linha.valor));
    return data;
  }
  if (nome === 'painel_mkt_coleta_anotar') {
    // A hora da vm (o relógio fixo do teste), como o banco de verdade veria.
    const r = anotarComTrava(cache.get(chave) ?? null, params.p_entrada, { exclusiva: params.p_exclusiva, agora: AGORA });
    if (r.andando) return { andando: true };
    cache.set(chave, clone(r.diario));
    return params.p_exclusiva ? { andando: false, diario: clone(r.diario) } : { andando: false };
  }
  throw new Error(`${nome} sem banco de mentira`);
}

/** O supabase-js de mentira: painel_cache num Map, o resto no PGlite. As RPCs
 *  vão ao banco de verdade por nome de parâmetro, como o PostgREST faz. */
function supabaseFalso(banco, cache, { tabelas = {} } = {}) {
  const rpcs = [], upserts = [];
  const sb = {
    from(tabela) {
      const filtro = {};
      let lista = null;
      const q = {
        select: () => q,
        eq: (k, v) => { filtro[k] = v; return q; },
        in: (k, vs) => { lista = vs; return q; },
        maybeSingle: async () => {
          if (tabela === 'painel_cache') { const v = cache.get(filtro.chave); return { data: v === undefined ? null : { valor: clone(v) }, error: null }; }
          const linhas = (tabelas[tabela] || []).filter((x) => Object.entries(filtro).every(([k, v]) => x[k] === v));
          return { data: clone(linhas[0] ?? null), error: null };
        },
        upsert: async (linha) => { upserts.push(clone(linha)); cache.set(linha.chave, clone(linha.valor)); return { error: null }; },
        then: (feito, falhou) => (async () => {
          if (tabela === 'painel_mkt_canais') { assert.equal(filtro.ativo, true, 'a coletora lê só os canais ativos'); return { data: await banco.canais(), error: null }; }
          if (tabela === 'painel_cache' && lista) return { data: lista.filter((k) => cache.has(k)).map((k) => ({ chave: k, valor: clone(cache.get(k)), atualizado_em: iso(AGORA) })), error: null };
          let linhas = (tabelas[tabela] || []).filter((x) => Object.entries(filtro).every(([k, v]) => x[k] === v));
          if (lista) linhas = linhas.filter((x) => Object.values(x).some((v) => lista.includes(v)));
          return { data: clone(linhas), error: null };
        })().then(feito, falhou),
      };
      return q;
    },
    async rpc(nome, params = {}) {
      rpcs.push({ nome, params: clone(params) });
      try {
        const data = NA_LINHA_DO_CACHE[nome] ? await rpcNoCache(banco, cache, nome, clone(params)) : await banco.rpc(nome, clone(params));
        rpcs.at(-1).resposta = clone(data);
        return { data, error: null };
      } catch (e) {
        rpcs.at(-1).erro = e.code;
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
  };
  return { sb, rpcs, upserts };
}

const globais = (rede, erros) => ({
  Response, Request, Headers, URL, URLSearchParams, crypto, TextEncoder, TextDecoder, btoa, atob, AbortController, AbortSignal, structuredClone, DOMException,
  setTimeout, clearTimeout, Date: relogio(), fetch: rede.fetch,
  console: { error: (...a) => erros.push(a.map(String).join(' ')), log() {}, warn() {}, info() {} },
});

/** A coletora de verdade, com o banco de verdade e a rede de mentira. */
function coletora(banco, { cache = new Map(), rede = internet() } = {}) {
  let handler;
  const erros = [];
  const b = supabaseFalso(banco, cache);
  vm.runInNewContext(codigoColetora, { ...globais(rede, erros), createClient: () => b.sb, Deno: { env: { get: (n) => ENV[n] }, serve: (fn) => { handler = fn; } } });
  return {
    cache, rede, erros, ...b,
    async coletar(fonte) {
      rede.rodando(fonte);
      const r = await handler(new Request('https://exemplo.supabase.co/functions/v1/painel-mkt-fontes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': ENV.PAINEL_TOKEN }, body: JSON.stringify({ action: 'coletar', fonte }) }));
      const texto = await r.text();
      return { status: r.status, texto, corpo: JSON.parse(texto) };
    },
  };
}

/** A porta da tela (painel-marketing) lendo o mesmo cache e o mesmo cofre. */
const ANA = { sub: 'ana', perms: ['marketing'] }, GIL = { sub: 'gil', perms: ['marketing'] };
function portaDaTela(banco, cache) {
  let handler, sessao = ANA;
  const tabelas = {
    acesso_conta: [{ id: 'c-ana', usuario: 'ana', id_pessoa: '123456' }, { id: 'c-gil', usuario: 'gil', id_pessoa: '555555' }],
    acesso_papel: [],
    painel_mkt_papeis: [{ id_pessoa: '555555', papel: 'gestao' }],
  };
  const b = supabaseFalso(banco, cache, { tabelas });
  const erros = [];
  const rede = { fetch: async () => { throw new Error('a porta não devia sair para a rede aqui'); } };
  vm.runInNewContext(codigoMarketing, { ...globais(rede, erros), createClient: () => b.sb, verificarJwt: async () => sessao, crachaRevogado: async () => false, Deno: { env: { get: (n) => ENV[n] }, serve: (fn) => { handler = fn; } } });
  return {
    entrar: (s) => { sessao = s; },
    async pedir(corpo) {
      const r = await handler(new Request('http://local', { method: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(corpo) }));
      const texto = await r.text();
      return { status: r.status, texto, ...JSON.parse(texto) };
    },
  };
}

// Onde cada fonte pode bater (a regra de hosts da coletora, vista de fora).
const HOSTS = {
  site: /^(www\.)?exemplo\.com\.br$|\.googleapis\.com$|^dns\.google$|^api\.wordpress\.org$/,
  google: /\.googleapis\.com$/,
  google_ads: /\.googleapis\.com$/,
  meta: /^graph\.(facebook|instagram)\.com$/,
  linkedin: /^(api|www)\.linkedin\.com$/,
  pinterest: /^api\.pinterest\.com$/,
};
const execucoes = (cache, fonte) => (cache.get('mkt_coleta_diario')?.execucoes ?? []).filter((e) => e.fonte === fonte);
const rpcsDe = (t, nome) => t.rpcs.filter((r) => r.nome === nome);

// ================================================================== os testes ==

test('o caso ruim: o banco do teste de ponta a ponta enxerga a data da vm, e não a da máquina (senão quebra sozinho em 11/08/2027)', { skip: PGlite ? false : 'sem PGlite: o banco de mentira não tem relógio' }, async () => {
  const hojeDo = async (b) => (await b.pg.query(`select ((${RELOGIO_DO_BANCO}) at time zone 'America/Sao_Paulo')::date::text h`)).rows[0].h;
  // A vm de sempre (11/10/2026) e uma vm um ano adiante: o banco segue a vm.
  assert.equal(await hojeDo(await bancoDeVerdade()), HOJE);
  const adiante = await bancoDeVerdade(Date.parse('2027-08-11T15:00:00.000Z'));
  assert.equal(await hojeDo(adiante), '2027-08-11');
  // Nenhuma função nem coluna do Marketing ficou lendo o relógio da máquina.
  const banco = await bancoDeVerdade();
  const funcoes = (await banco.pg.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'painel_mkt_%' and p.prosrc ~* '\mnow\(\)'`)).rows.map((x) => x.proname);
  assert.deepEqual(funcoes, []);
  const colunas = (await banco.pg.query(`select c.relname, a.attname from pg_attrdef d join pg_class c on c.oid = d.adrelid
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where c.relname like 'painel_mkt_%' and pg_get_expr(d.adbin, d.adrelid) ~* '\mnow\(\)'`)).rows;
  assert.deepEqual(colunas, []);
  // E a regra que quebrava: com a vm em 11/10/2026, a semana de 10/08/2026
  // tem menos de 1 ano, e a faxina não a apaga (o banco a 2027 apagaria).
  const semana = { canal: 'linkedin', semana: '2026-08-10', numeros: { impressoes: 10 } };
  assert.equal((await banco.rpc('painel_mkt_api_metricas', { p_linhas: [semana], p_quem: 'teste' })).gravadas, 1);
  assert.equal((await banco.rpc('painel_mkt_api_faxina', { p_canal: 'linkedin', p_dias_numeros: 365, p_dias_titulo: null })).numeros_apagados, 0);
  assert.equal((await adiante.rpc('painel_mkt_api_metricas', { p_linhas: [semana], p_quem: 'teste' })).gravadas, 1);
  assert.equal((await adiante.rpc('painel_mkt_api_faxina', { p_canal: 'linkedin', p_dias_numeros: 365, p_dias_titulo: null })).numeros_apagados, 1, 'controle: a vm a 2027 vê a semana velha');
});

test('o caso ruim (extras do ctx): diário de outra fonte, velho ou torto não conta; ID que não é G- não passa; sem retrato, sem anterior', () => {
  const agora = AGORA;
  const diario = { versao: 1, execucoes: [
    { fonte: 'linkedin', inicio: iso(agora - 2 * 3600_000), chamadas: 30 },
    { fonte: 'linkedin', inicio: iso(agora - 23 * 3600_000), chamadas: 12 },
    { fonte: 'linkedin', inicio: iso(agora - 25 * 3600_000), chamadas: 40 }, // mais de 24 h: já saiu da conta
    { fonte: 'pinterest', inicio: iso(agora - 3600_000), chamadas: 99 }, // outra fonte
    { fonte: 'linkedin', inicio: 'ontem', chamadas: 50 }, // data torta
    { fonte: 'linkedin', inicio: iso(agora - 3600_000), chamadas: -5 }, // número torto
    { fonte: 'linkedin', inicio: iso(agora - 3600_000), chamadas: '7' },
    null, 'lixo',
  ] };
  const site = { dados: { paginas: { etiquetas: { tipos: { ga4: { ids: ['G-W14DLRNWRD', 'G-W14DLRNWRD', 'UA-123-1', '<script>', 'G-', 42, 'G-OUTRA1234'] } } } } } };
  const li = extrasDoCtx('linkedin', { anterior: { estado: 'ok', dados: { pagina: { nome: 'X' } } }, diario, site, agora });
  assert.equal(li.chamadasHoje, 42);
  assert.deepEqual(li.anterior, { pagina: { nome: 'X' } }, 'vai só o dados, nunca o retrato inteiro');
  assert.equal('ga4Medicoes' in li, false, 'as etiquetas do site só interessam ao google');
  const g = extrasDoCtx('google', { site, agora });
  assert.deepEqual(g.ga4Medicoes, ['G-W14DLRNWRD', 'G-OUTRA1234']);
  assert.equal(g.chamadasHoje, 0, 'sem diário, nada gasto');
  assert.equal(g.anterior, null);
  for (const anterior of [null, 'texto', { estado: 'ok' }, { dados: [1, 2] }]) assert.equal(extrasDoCtx('site', { anterior }).anterior, null);
  assert.deepEqual(extrasDoCtx('google', { site: { dados: { paginas: null } } }).ga4Medicoes, []);
});

test('o caso ruim (ponta a ponta): rede fora do ar não inventa número nem apaga o que estava na tela; o diário anota e nada vaza', async () => {
  const banco = await abrirBanco();
  const cache = new Map();

  // 1. Primeira coleta da vida, com a rede caída: nada para mostrar, e nada
  //    vira zero.
  const caida = coletora(banco, { cache, rede: internet({ foraDoAr: true }) });
  for (const fonte of FONTES) {
    const r = await caida.coletar(fonte);
    assert.equal(r.status, 200, fonte);
    assert.equal(r.corpo.estado, 'erro', `${fonte}: tudo falhou e o estado diz ${r.corpo.estado}`);
    const [e] = execucoes(cache, fonte);
    assert.equal(e.estado, 'erro', `${fonte}: o diário fecha a execução com o estado dela`);
    assert.ok(e.fim, `${fonte}: o diário tem o fim`);
    assert.equal(cache.get(`mkt_fonte_${fonte}`).ultima_boa_em, null, `${fonte}: nada veio bom`);
  }
  assert.deepEqual(rpcsDe(caida, 'painel_mkt_api_metricas'), [], 'nenhum número sem coleta');
  assert.deepEqual(rpcsDe(caida, 'painel_mkt_api_publicacoes'), []);
  assert.equal(rpcsDe(caida, 'painel_mkt_api_faxina').length, 1, 'a faxina do LinkedIn roda mesmo na coleta que falhou');
  assert.deepEqual(rpcsDe(caida, 'painel_mkt_conexao_regravar'), [], 'renovação que não aconteceu não toca o cofre');
  assert.equal((await conexaoGuardada(banco, 'pinterest')).refresh_token, CONEXOES.pinterest.refresh_token);

  // 2. Uma coleta boa, e de novo a rede caída: cada parte que falhou fica
  //    com os dados e a data da coleta boa.
  const boa = coletora(banco, { cache });
  for (const fonte of FONTES) assert.equal((await boa.coletar(fonte)).corpo.estado, 'ok', fonte);
  const antes = Object.fromEntries(FONTES.map((f) => [f, clone(cache.get(`mkt_fonte_${f}`))]));
  const deNovo = coletora(banco, { cache, rede: internet({ foraDoAr: true }) });
  for (const fonte of FONTES) {
    const r = await deNovo.coletar(fonte);
    assert.equal(r.corpo.estado, 'erro', fonte);
    const v = cache.get(`mkt_fonte_${fonte}`), a = antes[fonte];
    assert.equal(v.ultima_boa_em, a.ultima_boa_em, `${fonte}: a última coleta boa continua a de antes`);
    for (const [parte, p] of Object.entries(a.partes)) {
      assert.equal(v.partes[parte].coletado_em, p.coletado_em, `${fonte}.${parte}: a data do dado não anda sem dado novo`);
      if (parte in a.dados) assert.deepEqual(v.dados[parte], a.dados[parte], `${fonte}.${parte}: o dado bom de antes sumiu`);
    }
  }
  assert.deepEqual(rpcsDe(deNovo, 'painel_mkt_api_metricas'), []);
  assert.deepEqual(rpcsDe(deNovo, 'painel_mkt_api_publicacoes'), []);
  assert.deepEqual(rpcsDe(deNovo, 'painel_mkt_conexao_regravar'), []);
  for (const t of [caida, boa, deNovo]) {
    assert.deepEqual(vazou(JSON.stringify(t.upserts)), []);
    assert.deepEqual(vazou(JSON.stringify([...t.cache.values()])), [], 'segredo no diário');
    assert.deepEqual(t.erros, [], 'nada estourou sem ser tratado');
  }
});

test('o caso ruim: com a cota do dia quase gasta (diário das últimas 24 h), o LinkedIn e o Pinterest encolhem a coleta em vez de estourar o teto', async () => {
  const banco = await abrirBanco();
  const execucao = (fonte, horas, chamadas) => ({ id: `${fonte}-${horas}`, fonte, inicio: iso(AGORA - horas * 3600_000), fim: iso(AGORA - horas * 3600_000 + 30_000), estado: 'ok', chamadas, quem: 'ana' });
  const cache = new Map([['mkt_coleta_diario', { versao: 1, execucoes: [
    execucao('linkedin', 2, 50), execucao('linkedin', 20, 30), execucao('linkedin', 30, 99), // a de 30 h já saiu da conta
    execucao('pinterest', 1, 950),
  ] }]]);
  const t = coletora(banco, { cache });
  const li = await t.coletar('linkedin');
  const cotaLi = cache.get('mkt_fonte_linkedin').dados.cota;
  // 100 por dia, 10 de reserva, 80 já gastos: sobram 10 para esta coleta.
  assert.equal(cotaLi.orcamento, 10);
  assert.ok(cotaLi.usadas <= 10 && li.corpo.chamadas <= 10, `o LinkedIn gastou ${li.corpo.chamadas}`);
  assert.equal(li.corpo.estado, 'parcial');
  assert.ok(cache.get('mkt_fonte_linkedin').avisos.some((a) => /usou as 10 chamadas/.test(a)));
  const pin = await t.coletar('pinterest');
  // 1000 por dia para o app, 100 de reserva, 950 já gastos: nenhuma.
  assert.equal(cache.get('mkt_fonte_pinterest').dados.cota?.orcamento ?? 0, 0);
  assert.ok(pin.corpo.chamadas <= 1, `o Pinterest gastou ${pin.corpo.chamadas} (só a renovação do token pode ir)`);
  assert.ok(cache.get('mkt_fonte_pinterest').avisos.some((a) => /cota do dia do Pinterest já foi usada/.test(a)));
  assert.equal(rpcsDe(t, 'painel_mkt_api_publicacoes').some((r) => r.params.p_linhas.some((l) => l.canal === 'pinterest')), false, 'sem chamada, sem publicação');
});

test('ponta a ponta: as seis fontes com os conectores de verdade gravam o retrato, as semanas, as publicações, a conexão e o diário, sem segredo', async (ctxTeste) => {
  const banco = await abrirBanco();
  if (!banco.deVerdade) ctxTeste.diagnostic('sem PGlite: as conferências que só o banco de verdade faz ficaram de fora');
  const t = coletora(banco);
  const respostas = {};
  // O site primeiro: o google lê do retrato dele os IDs G- das etiquetas.
  for (const fonte of FONTES) respostas[fonte] = await t.coletar(fonte);

  // ---- respostas e estados ----
  for (const fonte of FONTES) {
    const r = respostas[fonte];
    assert.equal(r.status, 200, fonte);
    assert.equal(r.corpo.ok, true, fonte);
    assert.equal(r.corpo.fonte, fonte);
    // Com as fixtures inteiras, toda parte de toda fonte vem.
    assert.equal(r.corpo.estado, 'ok', `${fonte} terminou em ${r.corpo.estado}`);
    assert.ok(r.corpo.chamadas > 0, `${fonte} não chamou nada`);
  }
  assert.deepEqual(t.erros, [], 'nada estourou sem ser tratado');

  // ---- a rede: cada fonte só nos hosts dela; segredo nunca na URL; autorização nunca no site ----
  for (const p of t.rede.pedidos) {
    const host = new URL(p.url).hostname;
    assert.match(host, HOSTS[p.fonte], `${p.fonte} bateu em ${host}`);
    assert.deepEqual(vazou(p.url), [], `segredo na URL de ${p.fonte}: ${host}`);
    if (/exemplo\.com\.br$/.test(host)) assert.equal('authorization' in p.cabecalhos || 'x-goog-api-key' in p.cabecalhos, false, 'credencial foi para o site');
    // Todo pedido da coletora é sem seguir redirecionamento sozinho.
    assert.equal(p.redirect, 'manual', `${p.fonte}: ${host} sem redirect manual`);
    assert.ok(['GET', 'HEAD', 'POST'].includes(p.metodo), `${p.fonte}: ${p.metodo}`);
  }
  // A chave do Google vai no cabeçalho, para o PageSpeed e o CrUX.
  assert.ok(t.rede.pedidos.some((p) => p.fonte === 'site' && /chromeuxreport/.test(p.url) && p.cabecalhos['x-goog-api-key'] === ENV.GOOGLE_API_KEY));
  // O token da Meta vai no cabeçalho, nunca na URL.
  assert.ok(t.rede.pedidos.filter((p) => p.fonte === 'meta').every((p) => p.cabecalhos.authorization?.startsWith('Bearer ')));

  // ---- renovação de token pelo mkt-oauth.mjs, e o refresh novo do Pinterest no cofre ----
  const tokenPedidos = t.rede.pedidos.filter((p) => /oauth2\.googleapis\.com\/token|\/oauth\/token|accessToken/.test(p.url));
  assert.deepEqual(tokenPedidos.map((p) => `${p.fonte} ${new URL(p.url).hostname}`).sort(), ['google oauth2.googleapis.com', 'google_ads oauth2.googleapis.com', 'pinterest api.pinterest.com']);
  assert.match(tokenPedidos.find((p) => p.fonte === 'pinterest').cabecalhos.authorization, /^Basic /, 'o Pinterest quer o client no Basic');
  // A coletora nunca grava de cima: só regrava a conexão que leu (e todas
  // conferiram, porque ninguém mexeu no cofre durante a coleta).
  assert.deepEqual(rpcsDe(t, 'painel_mkt_conexao_gravar'), []);
  const regravadas = rpcsDe(t, 'painel_mkt_conexao_regravar');
  assert.deepEqual([...new Set(regravadas.map((r) => r.params.p_fonte))].sort(), ['google', 'pinterest']);
  for (const r of regravadas) assert.equal(r.resposta, 'gravada', `${r.params.p_fonte}: ${r.resposta}`);
  const cofre = Object.fromEntries(await Promise.all(['google', 'linkedin', 'pinterest'].map(async (f) => [f, await conexaoGuardada(banco, f)])));
  assert.equal(cofre.pinterest.refresh_token, NOVOS.pinRefresh, 'o refresh token NOVO do Pinterest foi guardado');
  assert.equal(cofre.pinterest.access_token, NOVOS.pinAcesso);
  assert.equal(cofre.pinterest.conectado_por, 'leo', 'renovar não muda quem conectou');
  assert.equal(cofre.google.access_token, NOVOS.googleAcesso);
  assert.equal(cofre.google.refresh_token, CONEXOES.google.refresh_token, 'o Google não manda refresh novo; o de antes fica');
  assert.ok(Date.parse(cofre.google.expira_em) > AGORA + 50 * 60_000);
  assert.deepEqual(cofre.linkedin, CONEXOES.linkedin, 'conexão que não venceu não é regravada');
  const info = await banco.rpc('painel_mkt_conexao_info');
  assert.deepEqual(vazou(JSON.stringify(info)), [], 'a info do cofre não tem token');

  // ---- números da semana: nas RPCs de verdade, e nenhuma linha recusada pelo banco ----
  const metricas = rpcsDe(t, 'painel_mkt_api_metricas');
  const linhas = metricas.flatMap((r) => r.params.p_linhas);
  for (const r of metricas) {
    assert.equal(r.erro, undefined, `RPC de semanas falhou: ${r.erro}`);
    assert.deepEqual(r.resposta.ignoradas, [], `o banco recusou linha: ${JSON.stringify(r.resposta.ignoradas).slice(0, 300)}`);
    assert.match(r.params.p_quem, /^coleta (site|google|meta|google_ads|linkedin|pinterest)$/);
  }
  const canaisComSemana = [...new Set(linhas.map((l) => l.canal))].sort();
  assert.deepEqual(canaisComSemana, ['facebook', 'google', 'instagram', 'linkedin', 'pinterest', 'site']);
  for (const l of linhas) {
    assert.ok(SEGUNDAS.includes(l.semana), `${l.canal}: semana ${l.semana} não é uma das 8 fechadas`);
    assert.ok(Object.keys(l.numeros).length > 0);
    for (const [k, v] of Object.entries(l.numeros)) {
      assert.ok(['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads'].includes(k), k);
      assert.ok(Number.isInteger(v) && v >= 0, `${l.canal} ${l.semana} ${k}=${v}: número nulo ou torto não vai`);
    }
  }
  // Semana em que o GA4 não registrou nada não manda número do site (null, nunca zero).
  assert.equal(linhas.some((l) => l.canal === 'site' && l.semana === SEMANA_MORTA && ('alcance' in l.numeros || 'impressoes' in l.numeros)), false);
  if (banco.deVerdade) {
    const noBanco = (await banco.pg.query(`select c.codigo, count(*)::int n from public.painel_mkt_metricas_canal m join public.painel_mkt_canais c on c.id = m.canal_id
      where m.fonte = 'api' group by c.codigo order by c.codigo`)).rows;
    assert.deepEqual(noBanco.map((x) => x.codigo), canaisComSemana);
  }

  // ---- publicações ----
  const pubRpcs = rpcsDe(t, 'painel_mkt_api_publicacoes');
  const pubs = pubRpcs.flatMap((r) => r.params.p_linhas);
  for (const r of pubRpcs) {
    assert.equal(r.erro, undefined, `RPC de publicações falhou: ${r.erro}`);
    assert.deepEqual(r.resposta.ignoradas, [], `o banco recusou publicação: ${JSON.stringify(r.resposta.ignoradas).slice(0, 300)}`);
    assert.equal(r.resposta.inseridas, r.params.p_linhas.length);
  }
  assert.deepEqual([...new Set(pubs.map((p) => p.canal))].sort(), ['facebook', 'google', 'instagram', 'linkedin', 'pinterest', 'site']);
  for (const p of pubs) {
    assert.equal(normalizarLink(p.url), p.url, `link sem normalizar: ${p.url}`);
    assert.match(p.data, /^\d{4}-\d{2}-\d{2}$/);
    for (const k of ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads']) if (k in p) assert.ok(Number.isInteger(p[k]) && p[k] >= 0, `${p.canal} ${k}`);
    // O título é conteúdo do dono (a página "Trabalhe conosco &#8211; vagas"
    // do WordPress chega com a meia-risca): vai como o provedor mandou. A
    // regra do travessão vale para o texto que o Painel escreve (avisos e
    // motivos, conferidos abaixo).
    if ('titulo' in p) assert.ok(typeof p.titulo === 'string' && p.titulo.length > 0 && p.titulo.length <= 200, `${p.canal}: título vazio vai sem a chave`);
  }
  assert.ok(pubs.filter((p) => p.canal === 'linkedin').every((p) => !('titulo' in p)), 'LinkedIn: só url e data, sem título');
  for (const p of pubs.filter((x) => x.canal === 'pinterest')) assert.match(p.url, /^https:\/\/www\.pinterest\.com\/pin\/\d+\/?$/);
  if (banco.deVerdade) assert.equal((await banco.pg.query("select count(*)::int n from public.painel_mkt_publicacoes where fonte = 'api'")).rows[0].n, pubs.length);

  // ---- a faxina do LinkedIn, com o canal que ele achou e os prazos fixos ----
  const faxina = rpcsDe(t, 'painel_mkt_api_faxina');
  assert.equal(faxina.length, 1);
  // O título vai nulo: o LinkedIn nunca manda título (o que houver ali foi digitado).
  assert.deepEqual(faxina[0].params, { p_canal: 'linkedin', p_dias_numeros: 365, p_dias_titulo: null });
  assert.equal(faxina[0].resposta.canal, 'linkedin');

  // ---- o retrato no painel_cache ----
  for (const fonte of FONTES) {
    const v = t.cache.get(`mkt_fonte_${fonte}`);
    assert.ok(v, `${fonte} sem retrato`);
    assert.equal(v.estado, respostas[fonte].corpo.estado);
    assert.ok(Object.keys(v.partes).length > 0, `${fonte} sem partes`);
    assert.ok(Object.keys(v.dados).length > 0, `${fonte} sem dados`);
    assert.equal(v.coletado_em, respostas[fonte].corpo.coletadoEm);
    assert.ok(v.ultima_boa_em, `${fonte}: alguma parte veio boa`);
    assert.deepEqual(v.secrets, [...SECRETS_PADRAO[fonte]], `${fonte}: os NOMES dos secrets do conector`);
    assert.deepEqual(v.secretsOpcionais, [...SECRETS_OPCIONAIS_PADRAO[fonte]], `${fonte}: os NOMES dos opcionais do conector`);
    assert.ok(v.avisos.length <= 30 && v.avisos.every((a) => typeof a === 'string' && !TRAVESSAO.test(a)), `${fonte}: avisos`);
    for (const p of Object.values(v.partes)) assert.equal(TRAVESSAO.test(p.motivo ?? ''), false);
  }
  // Uma amostra do que cada conector entrega à tela, pelo FORMATO dele.
  const c = (f) => t.cache.get(`mkt_fonte_${f}`).dados;
  assert.equal(c('site').site.dominio, 'exemplo.com.br');
  assert.equal(c('google').ga4.propriedade.medicao, 'G-W14DLRNWRD');
  assert.equal(c('meta').pagina.id, PAGE);
  assert.equal(typeof c('meta').pagina.seguidores, 'number');
  assert.ok(c('google_ads').conta.id);
  assert.equal(c('linkedin').pagina.urn, ORG);
  assert.ok(c('pinterest').pins.itens.length > 0 && c('pinterest').pins.itens.every((p) => /^https:\/\/www\.pinterest\.com\/pin\/\d+\/$/.test(p.url)));

  // ---- nenhum segredo no cache, no diário ou nas respostas ----
  assert.deepEqual(vazou(JSON.stringify(t.upserts)), [], 'segredo no painel_cache');
  assert.deepEqual(vazou(JSON.stringify([...t.cache.values()])), [], 'segredo no diário');
  assert.deepEqual(vazou(JSON.stringify(Object.values(respostas).map((r) => r.texto))), [], 'segredo na resposta');
  assert.deepEqual(vazou(JSON.stringify([...metricas, ...pubRpcs].map((r) => r.params))), [], 'segredo nas linhas das RPCs');
  assert.equal(/BEGIN [A-Z ]*PRIVATE KEY/.test(JSON.stringify(t.upserts)), false);

  // ---- o diário: uma execução por fonte, fechada, com o que foi gravado ----
  for (const fonte of FONTES) {
    const ex = execucoes(t.cache, fonte);
    assert.equal(ex.length, 1, fonte);
    const [e] = ex;
    assert.equal(e.estado, respostas[fonte].corpo.estado);
    assert.equal(e.chamadas, respostas[fonte].corpo.chamadas);
    assert.equal(e.quem, 'cron');
    assert.ok(e.fim && e.inicio <= e.fim);
    assert.equal(e.erro, undefined, `${fonte}: ${e.erro}`);
  }
  const logDe = (f) => execucoes(t.cache, f)[0].log ?? [];
  for (const f of ['site', 'google', 'meta', 'linkedin', 'pinterest']) assert.ok(logDe(f).some((l) => /^publicações: \d+ nova/.test(l)), `${f}: publicações no diário`);
  for (const f of ['google', 'meta', 'linkedin', 'pinterest']) assert.ok(logDe(f).some((l) => /^semanas: \d+ gravada/.test(l)), `${f}: semanas no diário`);
  assert.ok(logDe('linkedin').some((l) => /^faxina: 0 semana\(s\) e 0 publicação\(ões\) sem os números do LinkedIn, 0 título\(s\) zerado\(s\)$/.test(l)), logDe('linkedin').join(' | '));
  assert.ok(logDe('pinterest').some((l) => /token renovado; refresh novo/.test(l)));

  // ---- de novo, como o cron do dia seguinte: idempotente ----
  const leadsAntes = Object.keys(c('google_ads').leads.restrito.porId).sort();
  assert.ok(leadsAntes.length > 0);
  // E o Google apagou os leads de formulário (60 dias) entre uma e outra.
  t.rede.ajustar({ semLeads: true });
  for (const fonte of FONTES) assert.equal((await t.coletar(fonte)).status, 200);
  // A guarda dos leads: a coletora passou o retrato anterior (ctx.anterior),
  // e o que o Google apagou continua guardado.
  const leads = c('google_ads').leads;
  assert.deepEqual(Object.keys(leads.restrito.porId).sort(), leadsAntes, 'lead que o Google apagou sumiu do Painel');
  assert.equal(leads.ultimos60, 0);
  assert.equal(leads.total, leadsAntes.length);
  const segundaVolta = (nome) => rpcsDe(t, nome).slice(nome === 'painel_mkt_api_metricas' ? metricas.length : pubRpcs.length);
  assert.equal(segundaVolta('painel_mkt_api_metricas').length, metricas.length, 'a segunda volta manda as mesmas semanas');
  // Só o banco de verdade sabe dizer que nada mudou.
  if (banco.deVerdade) {
    for (const r of segundaVolta('painel_mkt_api_metricas')) {
      assert.equal(r.resposta.gravadas, 0, `semana regravada sem mudar: ${r.params.p_quem}`);
      assert.equal(r.resposta.iguais, r.params.p_linhas.length);
    }
    for (const r of segundaVolta('painel_mkt_api_publicacoes')) assert.equal(r.resposta.inseridas, 0, `publicação duplicada: ${r.params.p_quem}`);
  }
  // A segunda volta já sabe quanto a primeira gastou (o LinkedIn tem 100 por dia).
  for (const fonte of FONTES) assert.equal(execucoes(t.cache, fonte).length, 2);
  // O Pinterest não renova de novo: o token novo vale 30 dias.
  assert.equal(t.rede.pedidos.filter((p) => /api\.pinterest\.com\/v5\/oauth\/token/.test(p.url)).length, 1);

  // ---- e a porta da tela lê o que a coletora gravou ----
  const porta = portaDaTela(banco, t.cache);
  for (const [quem, verRestrito] of [[ANA, false], [GIL, true]]) {
    porta.entrar(quem);
    const r = await porta.pedir({ action: 'fontes' });
    assert.equal(r.status, 200, quem.sub);
    assert.deepEqual(vazou(r.texto), [], `${quem.sub}: segredo na tela`);
    for (const fonte of FONTES) {
      const f = r.fontes[fonte];
      assert.equal(f.configurado, true, `${fonte}: os secrets existem`);
      assert.equal(f.estado, t.cache.get(`mkt_fonte_${fonte}`).estado, `${fonte}: a tela mostra o estado do cache`);
      assert.equal(f.ultimas.length, 2);
    }
    for (const fonte of ['google', 'linkedin', 'pinterest']) assert.ok(r.fontes[fonte].conexao?.conectadoEm, `${fonte}: conectado`);
    // Dado pessoal (leads de formulário, quem ligou, quem mexeu na conta) só
    // para a gestão.
    assert.equal(r.texto.includes('"restrito"'), verRestrito, `${quem.sub}: restrito ${verRestrito ? 'devia' : 'não devia'} aparecer`);
    assert.equal('restrito' in (r.fontes.google_ads.dados.leads ?? {}), verRestrito);
    // Os opcionais: só o nome e se está cadastrado (aqui só a GOOGLE_API_KEY).
    assert.deepEqual(r.fontes.site.opcionais, [{ nome: 'GOOGLE_API_KEY', cadastrado: true }]);
    assert.deepEqual(r.fontes.meta.opcionais, [{ nome: 'META_APP_SECRET', cadastrado: false }]);
    assert.deepEqual(r.fontes.google_ads.opcionais.map((o) => [o.nome, o.cadastrado]), [['GOOGLE_ADS_CUSTOMER_ID', false], ['GOOGLE_ADS_LOGIN_CUSTOMER_ID', false]]);
    // A LEITURA LEVE com o retrato de verdade: cada fonte é a da cheia sem
    // os "dados", e nenhum número nem dado pessoal sai, nem para a gestão.
    const leve = await porta.pedir({ action: 'fontes', leve: true });
    assert.equal(leve.status, 200);
    for (const fonte of FONTES) {
      const { dados, ...semDados } = r.fontes[fonte];
      assert.ok(Object.keys(dados).length > 0, `${fonte}: a cheia tem os dados`);
      assert.deepEqual(leve.fontes[fonte], semDados, `${quem.sub} ${fonte}: a leve é a cheia sem os dados`);
    }
    assert.equal(leve.texto.includes('"restrito"'), false, `${quem.sub}: restrito na leitura leve`);
    assert.ok(leve.texto.length * 4 < r.texto.length, `${quem.sub}: a leve (${leve.texto.length} bytes) devia ser bem menor que a cheia (${r.texto.length})`);
    // E a do canal: só as fontes pedidas, com os dados.
    const doSite = await porta.pedir({ action: 'fontes', fontes: ['site', 'google', 'google_ads'] });
    assert.deepEqual(doSite.ordem, ['site', 'google', 'google_ads']);
    for (const fonte of doSite.ordem) assert.deepEqual(doSite.fontes[fonte], r.fontes[fonte], `${quem.sub} ${fonte}`);
  }
});
