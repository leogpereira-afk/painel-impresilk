/* OS DADOS FICTÍCIOS DAS FONTES DO MARKETING, PARA A PRÉVIA DA TELA.
 *
 * COMO GERAR DE NOVO (depois de mexer num conector, no info.mjs, na coletora
 * ou na porta painel-marketing), na pasta do Painel:
 *
 *   PATH=$HOME/apps/node20/bin:$PATH node tests/gerar-fontes-ficticias.mjs
 *
 * Grava dois arquivos em src/review/, no formato EXATO da resposta da ação
 * "fontes" da painel-marketing para a gestão (contrato em
 * docs/marketing/integracoes-contrato.md, seção 6):
 *  - fontes-ficticias.json: a variedade de estados com que a prévia abre.
 *    site ok; google parcial (GA4 e Search Console ok, o Perfil da Empresa
 *    aguardando a aprovação do Google); meta ok (com uma coleta de ontem que
 *    falhou por rede, para o histórico ter um erro); google_ads aguardando
 *    aprovação (o projeto sem o nível Explorer); linkedin sem os secrets do
 *    app (falta_configurar); pinterest com os secrets e sem conexão
 *    (falta_conectar);
 *  - fontes-ficticias-cheias.json: as seis ok, com todos os quadros. A
 *    prévia abre com ele em ?cenario=fontes-cheias, e o "Atualizar agora" de uma
 *    fonte recém conectada na prévia traz os dados dela daqui.
 *
 * NADA É INVENTADO À MÃO. Quem escreve os dados são os seis conectores de
 * verdade (supabase/functions/_shared/mkt-fontes/), rodando dentro da
 * coletora de verdade (painel-mkt-fontes), e quem monta a resposta é a porta
 * de verdade (painel-marketing, ação "fontes", que passa cada fonte pelo
 * fonteParaTela do info.mjs). As duas Edge Functions são empacotadas com o
 * esbuild e rodam numa vm, como em tests/mkt-fontes-integracao.test.mjs. O
 * que é de mentira: a rede (as fixtures de tests/fixtures/mkt-<fonte>, todas
 * fictícias: domínio exemplo.com.br, "Gráfica Exemplo"), o banco (um objeto
 * e um Map), os secrets (todo valor tem FICTICIO no texto) e o relógio.
 *
 * O RELÓGIO É FIXO: dois dias de cron (13 e 14/10/2026, na hora dos jobs da
 * migração 20261012a, de 09:05 a 09:35 UTC) e a leitura da tela às 12h de
 * 14/10 em São Paulo. A cada leitura ele anda 1 ms (a execução "dura" o que
 * o código pede de hora), e por isso o arquivo sai IGUAL toda vez: o teste
 * tests/mkt-fontes-ficticias.test.mjs gera de novo em memória e compara com
 * o que está em src/review/. Se um conector mudou e ninguém gerou de novo, o
 * teste diz o comando lá de cima.
 *
 * A REDE DE MENTIRA é a mesma do teste de ponta a ponta, onde ela é a régua
 * do "ok" das seis fontes. Foi copiada, e não importada, porque aquele
 * arquivo é um teste (importá-lo rodaria os testes dele). Se um conector
 * passar a chamar outro endereço, a fonte sai com erro aqui e o teste da
 * variedade reclama, em vez de a prévia mostrar um retrato velho calado.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FONTES } from '../supabase/functions/_shared/mkt-fontes/info.mjs';
import { anotarComTrava } from '../supabase/functions/_shared/mkt-fontes/coletora.mjs';
import { consultas, periodo } from '../supabase/functions/_shared/mkt-fontes/google_ads.mjs';
import { METRICAS_CONTA, METRICAS_PIN, METRICAS_PIN_VIDEO } from '../supabase/functions/_shared/mkt-fontes/pinterest.mjs';

export const COMANDO = 'PATH=$HOME/apps/node20/bin:$PATH node tests/gerar-fontes-ficticias.mjs';

/* Os dois retratos. `semSecrets`: os secrets que NÃO existem no ambiente de
   mentira; `conexoes`: as fontes OAuth com conexão no cofre; `foraDoAr`: em
   que dia a rede caiu para qual fonte. */
export const CENARIOS = Object.freeze({
  variedade: Object.freeze({
    arquivo: 'src/review/fontes-ficticias.json',
    semSecrets: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    conexoes: ['google'],
    perfilAguardando: true,
    adsAguardando: true,
    foraDoAr: { '2026-10-13': ['meta'] },
  }),
  cheio: Object.freeze({
    arquivo: 'src/review/fontes-ficticias-cheias.json',
    semSecrets: [],
    conexoes: ['google', 'linkedin', 'pinterest'],
    perfilAguardando: false,
    adsAguardando: false,
    foraDoAr: {},
  }),
});

// Os dois dias de cron e a hora de cada job (migração 20261012a). O site vem
// antes do google de propósito: o google lê do retrato do site os IDs G-.
// Depois de tudo o que as fixtures têm de data: a mais nova é de 12/10 (story,
// post do LinkedIn, semana de anúncios da Meta). Antes os dias eram 10 e 11/10,
// e a prévia mostrava conteúdo "de amanhã" (revisão de 12/10/2026).
const DIAS = ['2026-10-13', '2026-10-14'];
const MINUTO = { site: '05', google: '11', meta: '17', google_ads: '23', linkedin: '29', pinterest: '35' };
// A tela lê às 12h de quarta, 14/10/2026, em São Paulo.
// A prévia ancora as datas em hoje a partir deste dia (DIA_DOS_DADOS de
// src/review/marketing-fontes.mjs; o teste dos dados fictícios confere).
export const LEITURA = '2026-10-14T15:00:00.000Z';
const DIA_MS = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

// ------------------------------------------------------------------ relógio --

/** O Date das vms: parado na hora escolhida e andando um passo a cada
 *  leitura. Hora de verdade deixaria o arquivo diferente a cada geração. O
 *  passo de 40 ms faz uma coleta "durar" de 1 a 8 s, perto do que dura no
 *  servidor, e longe do orçamento de 110 s (nenhum conector corta caminho
 *  por falta de tempo). */
const PASSO_DO_RELOGIO_MS = 40;
function criarRelogio() {
  const Real = Date;
  let agora = Real.parse(LEITURA);
  const ler = () => (agora += PASSO_DO_RELOGIO_MS);
  class Relogio extends Real {
    constructor(...a) { if (a.length) super(...a); else super(ler()); }
    static now() { return ler(); }
  }
  return { Date: Relogio, acertar: (instante) => { agora = Real.parse(instante); }, agora: () => agora };
}

// ---------------------------------------------------------- segredos falsos --

const ENV_BASE = Object.freeze({
  SUPABASE_URL: 'https://exemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-FICTICIA-0123456789',
  PAINEL_TOKEN: 'token-de-maquina-FICTICIO-0123456789',
  PAINEL_JWT_SECRET: 'segredo-do-cracha-FICTICIO-0123456789',
  GOOGLE_API_KEY: 'chave-google-FICTICIA-0123456789',
  META_TOKEN: 'token-meta-FICTICIO-0123456789',
  GOOGLE_OAUTH_CLIENT_ID: 'id-google-ficticio.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-google-FICTICIO-0123',
  LINKEDIN_CLIENT_ID: 'idlinkedinficticio',
  LINKEDIN_CLIENT_SECRET: 'segredo-linkedin-FICTICIO-0123',
  PINTEREST_CLIENT_ID: '1500000',
  PINTEREST_CLIENT_SECRET: 'segredo-pinterest-FICTICIO-0123',
});
const TOKEN_ADS = 'acesso-ads-FICTICIO-0123456789';

/* A conta de serviço do Google Ads com uma chave RSA nova a cada geração (o
   conector assina o JWT com ela). A assinatura muda, mas nunca chega à tela:
   o token que volta da rede de mentira é sempre o mesmo. */
let contaDeServico = null;
async function contaDoAds() {
  if (contaDeServico) return contaDeServico;
  const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', par.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  contaDeServico = { type: 'service_account', project_id: 'projeto-ficticio', private_key_id: 'idchaveFICTICIA0123456789', private_key: pem, client_email: 'painel-ads@projeto-ficticio.iam.gserviceaccount.com' };
  return contaDeServico;
}

/** O ambiente de mentira de um cenário (o que o Deno.env.get devolve). */
async function ambiente(cenario) {
  const env = { ...ENV_BASE, GOOGLE_ADS_SA_JSON: JSON.stringify(await contaDoAds()) };
  for (const n of cenario.semSecrets) delete env[n];
  return env;
}

/** Tudo que não pode aparecer no arquivo da prévia: o valor de cada secret
 *  de mentira (menos o endereço do banco e os IDs de app OAuth, que não são
 *  segredo), os tokens das conexões e os que a rede de mentira devolve. */
export function segredosFicticios() {
  const env = Object.entries(ENV_BASE).filter(([k]) => k !== 'SUPABASE_URL' && !/_CLIENT_ID$/.test(k)).map(([, v]) => v);
  const conexoes = Object.values(conexoesIniciais()).flatMap((c) => [c.access_token, c.refresh_token]);
  return [...env, ...conexoes, TOKEN_ADS, 'idchaveFICTICIA0123456789', 'acesso-de-teste-nao-real-0001', 'tk-ficticio-NOVO-pina', 'rf-ficticio-NOVO-pinr', 'TOKEN-DA-PAGINA-FICTICIO', 'TOKEN-DA-OUTRA-FICTICIO'];
}

// As conexões do cofre de mentira, no formato que a painel-mkt-oauth grava.
// conectado_por é um login fictício da direção (só a gestão conecta).
const ESCOPOS_GOOGLE = ['analytics.readonly', 'webmasters.readonly', 'business.manage'].map((e) => `https://www.googleapis.com/auth/${e}`);
function conexoesIniciais() {
  const dia1 = Date.parse(`${DIAS[0]}T09:00:00.000Z`);
  return {
    // Vencido no primeiro dia: a coletora renova antes de rodar o conector.
    google: { access_token: 'acesso-google-VENCIDO-FICTICIO', refresh_token: 'refresh-google-FICTICIO-0123', expira_em: iso(dia1 - 3600_000), escopos: ESCOPOS_GOOGLE, conta: 'marketing@exemplo.com.br', conectado_por: 'direcao.exemplo', conectado_em: '2026-10-01T12:00:00.000Z' },
    linkedin: { access_token: 'acesso-linkedin-FICTICIO-0123', refresh_token: 'refresh-linkedin-FICTICIO-0123', expira_em: iso(dia1 + 40 * DIA_MS), refresh_expira_em: iso(dia1 + 300 * DIA_MS), escopos: ['rw_organization_admin', 'r_organization_social', 'r_organization_social_feed'], conta: 'Gráfica Exemplo', conectado_por: 'direcao.exemplo', conectado_em: '2026-10-01T12:00:00.000Z' },
    // Vence em 3 dias: a coletora renova (folga de 7) e o Pinterest troca o refresh.
    pinterest: { access_token: 'acesso-pinterest-VELHO-FICTICIO', refresh_token: 'refresh-pinterest-VELHO-FICTICIO', expira_em: iso(dia1 + 3 * DIA_MS), refresh_expira_em: iso(dia1 + 50 * DIA_MS), escopos: ['user_accounts:read', 'pins:read', 'boards:read', 'ads:read'], conta: 'Gráfica Exemplo', conectado_por: 'direcao.exemplo', conectado_em: '2026-10-01T12:00:00.000Z' },
  };
}

// Os canais ativos que a coletora lê (o endereço do site manda no conector do site).
const CANAIS = Object.freeze([
  { codigo: 'site', nome: 'Site', url_perfil: 'https://exemplo.com.br' },
  { codigo: 'google', nome: 'Google Meu Negócio', url_perfil: null },
  { codigo: 'facebook', nome: 'Facebook', url_perfil: 'https://www.facebook.com/impresilk.exemplo' },
  { codigo: 'instagram', nome: 'Instagram', url_perfil: 'https://www.instagram.com/impresilk_exemplo/' },
  { codigo: 'linkedin', nome: 'LinkedIn', url_perfil: 'https://www.linkedin.com/company/empresa-exemplo' },
  { codigo: 'pinterest', nome: 'Pinterest', url_perfil: 'https://br.pinterest.com/empresa_exemplo/' },
]);

// ============================================================ a rede falsa ==
// Copiada de tests/mkt-fontes-integracao.test.mjs (ver o topo). O que mudou:
// o "hoje" de cada rodada entra pelo `rodada` (lá era fixo em 11/10), e o
// cenário escolhe as falhas (Perfil e Google Ads sem aprovação, rede caída).

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const ler = (sub, n) => readFileSync(new URL(`./fixtures/${sub}/${n}`, import.meta.url), 'utf8');
const fj = (sub, n) => JSON.parse(ler(sub, `${n}.json`));
const ok = (corpo, headers = {}) => ({ status: 200, corpo, headers });
const falha = (status, corpo = null, headers = {}) => ({ status, corpo, headers });
const somar = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dias = (de, ate) => { const f = []; for (let d = de; d <= ate; d = somar(d, 1)) f.push(d); return f; };
const segundaDe = (d) => somar(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));

// ----- site (domínio exemplo.com.br, das fixtures do tests/mkt-site.test.mjs) -----
const O = 'https://exemplo.com.br';
const pagCom = (t) => `<!DOCTYPE html><html lang="pt-BR"><head><title>${t}</title><script async src="https://www.googletagmanager.com/gtag/js?id=G-EXEMPLO123"></script><script>gtag('config','G-EXEMPLO123');</script></head><body><h1>${t}</h1></body></html>`;
const html = (corpo, h = {}) => ({ status: 200, corpo, headers: { 'content-type': 'text/html; charset=UTF-8', ...h } });
const xml = (corpo) => ({ status: 200, corpo, headers: { 'content-type': 'application/xml' } });
const ir = (para, status = 301) => ({ status, corpo: '', headers: { location: para } });
const fs = (n) => ler('mkt-site', n);
let rotasSite = null;
const ROTAS_SITE = () => (rotasSite ??= {
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
});
function doSite(u) {
  const rr = u.searchParams.get('rest_route');
  return ROTAS_SITE()[rr != null && u.pathname === '/index.php' ? `rest:${rr}` : u.toString()] ?? { status: 404, corpo: '<html>não achei</html>', headers: { 'content-type': 'text/html' } };
}
function doGoogleDoSite(u) {
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

// ----- google (das fixtures do tests/mkt-google.test.mjs) -----
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
const valorSc = (t, k) => { let h = t === 'c' ? 3 : 11; for (const c of k) h += c.charCodeAt(0); return t === 'c' ? 100 + (h % 60) : 4000 + (h % 900); };
function searchConsole(c, hoje) {
  // O primeiro dia incompleto do Search Console é anteontem.
  const incompleto = somar(hoje, -2);
  const dims = c.dimensions ?? [], tipo = c.type ?? 'web';
  if (tipo !== 'web') return { responseAggregationType: 'byProperty' };
  if (c.dimensionFilterGroups) return { rows: [{ clicks: 30, impressions: 400, ctr: 0.05, position: 3 }] };
  if (!dims.length) return { rows: [{ clicks: valorSc('c', c.startDate), impressions: valorSc('i', c.startDate), ctr: 0.025, position: 14.2 }], responseAggregationType: 'byProperty' };
  if (dims[0] === 'date') {
    const rows = dias(c.startDate, c.endDate).filter((d) => d <= incompleto).map((d) => ({ keys: [d], clicks: valorSc('c', d) % 20, impressions: valorSc('i', d) % 700, ctr: 0.02, position: 15.5 }));
    return { rows, responseAggregationType: 'byProperty', ...(c.dataState === 'all' ? { metadata: { first_incomplete_date: incompleto } } : {}) };
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
function doGoogle(url, corpo, rodada) {
  // Antes da aprovação, TODA chamada do Perfil volta 429 com a cota 0 (a
  // fila do Google). O Retry-After longo faz a coletora não repetir (ela só
  // repete quando a espera pedida cabe em 15 s): o resultado é o mesmo, e a
  // geração não fica 3 s parada esperando à toa.
  if (rodada.cenario.perfilAguardando && /mybusiness[a-z]*\.googleapis\.com|businessprofileperformance\.googleapis\.com/.test(url)) return falha(429, fg('gbp-erro-cota-zero'), { 'retry-after': '60' });
  if (/analyticsadmin\.googleapis\.com\/v1beta\/accountSummaries/.test(url)) return ok(fg('ga4-contas'));
  if (/properties\/111\/dataStreams/.test(url)) return ok(fg('ga4-fluxos-111'));
  if (/properties\/222\/dataStreams/.test(url)) return ok(fg('ga4-fluxos-222'));
  if (/properties\/222\/keyEvents/.test(url)) return ok(fg('ga4-eventos-chave'));
  if (/properties\/222\/googleAdsLinks/.test(url)) return ok({});
  if (/analyticsadmin\.googleapis\.com\/v1beta\/properties\/222$/.test(url)) return ok(fg('ga4-propriedade'));
  if (/:batchRunReports$/.test(url)) return ok({ reports: corpo.requests.map(relatorioGa4) });
  if (/:runReport$/.test(url)) return ok(relatorioGa4(corpo));
  if (url === 'https://www.googleapis.com/webmasters/v3/sites') return ok({ siteEntry: [{ siteUrl: 'sc-domain:exemplo.com.br', permissionLevel: 'siteOwner' }] });
  if (/searchAnalytics\/query$/.test(url)) return ok(searchConsole(corpo, rodada.hoje));
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

// ----- google ads (das fixtures do tests/mkt-google_ads.test.mjs, roteado pela consulta GAQL) -----
const fa = (n) => (existsSync(new URL(`./fixtures/mkt-google_ads/${n}.json`, import.meta.url)) ? fj('mkt-google_ads', n) : { results: [] });
const FIXTURE_ADS = {
  semanas: 'semanas', conversoesSemana: 'conversoes-semana', acoes: 'acoes-conversao', campanhasLista: 'campanhas-lista', campanhasDias: 'campanhas-dias',
  ligacoes: 'ligacoes', leads: 'leads', dias: 'dias', termos: 'termos', palavras: 'palavras', grupos: 'grupos', anuncios: 'anuncios', parcela: 'parcela',
  chamadas: 'chamadas', paginas: 'paginas', cidades: 'cidades', horarios: 'horarios', aparelhos: 'aparelhos', idade: 'idade', genero: 'genero',
  termosPmax: 'termos-pmax', categorias: 'categorias', pmax: 'pmax', alteracoes: 'alteracoes',
};
// As consultas GAQL dependem do período, que depende do dia da rodada.
const consultasDoDia = new Map();
function nomeDaConsulta(q, hoje) {
  if (!consultasDoDia.has(hoje)) consultasDoDia.set(hoje, new Map(Object.entries(consultas(periodo(hoje))).map(([k, texto]) => [texto, k.replace(/Reserva$/, '')])));
  return consultasDoDia.get(hoje).get(q);
}
function doGoogleAds(u, corpo, rodada) {
  if (u.pathname.endsWith('/customers:listAccessibleCustomers')) return ok(fa('contas-acessiveis'));
  const m = /\/customers\/(\d+)\/googleAds:search$/.exec(u.pathname);
  if (!m) return null;
  // O projeto do Google Cloud ainda sem o nível Explorer: a primeira consulta
  // de verdade volta 403, e o conector para ali.
  if (rodada.cenario.adsAguardando) return falha(403, fa('erro-aprovacao'));
  const q = String(corpo?.query ?? '');
  if (/FROM geo_target_constant/.test(q)) return ok(fa('geo-nomes'));
  const nome = nomeDaConsulta(q, rodada.hoje);
  if (nome === 'conta') return ok(fa(`conta-${m[1]}`));
  if (nome === 'filhas') return ok(fa(`filhas-${m[1]}`));
  return ok(FIXTURE_ADS[nome] ? fa(FIXTURE_ADS[nome]) : { results: [] });
}

// ----- meta (das fixtures do tests/mkt-meta.test.mjs) -----
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

// ----- linkedin (das fixtures do tests/mkt-linkedin.test.mjs) -----
const fl = (n) => fj('mkt-linkedin', n);
const ORG = 'urn:li:organization:90000001';
const intervalo = (url) => { const m = /timeRange:\(start:(\d+),end:(\d+)\)/.exec(decodeURIComponent(url)); return m ? [Number(m[1]), Number(m[2])] : null; };
function serie(url, f) {
  const [a, b] = intervalo(url); const elements = [];
  for (let t = a; t < b; t += DIA_MS) { const x = f(new Date(t).toISOString().slice(0, 10)); if (x) elements.push({ timeRange: { start: t, end: t + DIA_MS }, ...x }); }
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

// ----- pinterest (das fixtures do tests/mkt-pinterest.test.mjs) -----
const fp = (n) => fj('mkt-pinterest', n);
const VIDEOS = new Set(['1000000000000000002']);
const CONTA_PIN = { ALL: { IMPRESSION: 100, ENGAGEMENT: 10, PIN_CLICK: 4, OUTBOUND_CLICK: 3, SAVE: 2 }, ORGANIC: { IMPRESSION: 80, ENGAGEMENT: 8, PIN_CLICK: 3, OUTBOUND_CLICK: 2, SAVE: 2 }, PAID: { IMPRESSION: 20, ENGAGEMENT: 2, PIN_CLICK: 1, OUTBOUND_CLICK: 1, SAVE: 0 } };
const SPLITS = { APP_TYPE: ['MOBILE', 'WEB', 'TABLET'], SOURCE: ['YOUR_PINS', 'OTHER_PINS'], PIN_FORMAT: ['ORGANIC_IMAGE', 'ORGANIC_VIDEO'], OWNED_CONTENT: ['OWNED', 'NOT_OWNED'] };
// Os dois últimos dias ainda estão em processamento (o Pinterest atrasa ~48 h).
const statusDoDia = (dia, hoje) => (dia >= somar(hoje, -2) ? 'ESTIMATE' : 'READY');
function serieContaPin(u, hoje) {
  const q = u.searchParams, metricas = (q.get('metric_types') || '').split(',').filter(Boolean);
  if (!metricas.length || metricas.some((m) => !METRICAS_CONTA.includes(m))) return falha(400, fp('erro-400-metrica'));
  const base = CONTA_PIN[q.get('content_type') || 'ALL'];
  const valor = (m) => (m.endsWith('_RATE') ? base[m.replace('_RATE', '')] / base.IMPRESSION : base[m]);
  const ds = dias(q.get('start_date'), q.get('end_date'));
  const summary_metrics = Object.fromEntries(metricas.map((m) => [m, m.endsWith('_RATE') ? valor(m) : valor(m) * ds.length]));
  if (q.get('split_field')) return ok(Object.fromEntries(SPLITS[q.get('split_field')].map((g) => [g, { summary_metrics }])));
  return ok({ all: { daily_metrics: ds.map((d) => ({ date: d, data_status: statusDoDia(d, hoje), metrics: Object.fromEntries(metricas.map((m) => [m, valor(m)])) })), summary_metrics } });
}
const PIN_VALOR = { IMPRESSION: 10, OUTBOUND_CLICK: 1, PIN_CLICK: 2, SAVE: 1, SAVE_RATE: 0.1, USER_FOLLOW: 1, PROFILE_VISIT: 1, TOTAL_COMMENTS: 0, TOTAL_REACTIONS: 1 };
function seriePin(u, hoje) {
  const id = u.pathname.split('/')[3], metricas = (u.searchParams.get('metric_types') || '').split(',').filter(Boolean);
  const aceitas = VIDEOS.has(id) ? METRICAS_PIN_VIDEO : METRICAS_PIN;
  if (!metricas.length || metricas.some((m) => !aceitas.includes(m))) return falha(400, fp('erro-400-metrica'));
  const v = (m) => PIN_VALOR[m] ?? 5;
  const ds = dias(u.searchParams.get('start_date'), u.searchParams.get('end_date'));
  return ok({ ALL: {
    daily_metrics: ds.map((d) => ({ date: d, data_status: statusDoDia(d, hoje), metrics: Object.fromEntries(metricas.map((m) => [m, v(m)])) })),
    summary_metrics: Object.fromEntries(metricas.map((m) => [m, m.endsWith('_RATE') ? v(m) : v(m) * ds.length])),
    lifetime_metrics: { TOTAL_COMMENTS: 4, TOTAL_REACTIONS: 9 },
  } });
}
function doPinterest(u, hoje) {
  if (u.hostname !== 'api.pinterest.com') return null;
  const p = u.pathname, q = u.searchParams;
  if (p === '/v5/user_account') return ok(fp('user-account'));
  if (p === '/v5/user_account/analytics') return serieContaPin(u, hoje);
  if (p === '/v5/user_account/analytics/top_pins') return ok(fp('top-pins'));
  if (p === '/v5/user_account/analytics/top_video_pins') return ok(fp('top-video-pins'));
  if (p === '/v5/pins') return ok(q.get('domain') ? fp('pins-site') : q.get('bookmark') === 'bm-pagina-2' ? fp('pins-p2') : fp('pins-p1'));
  if (/^\/v5\/pins\/\d+\/analytics$/.test(p)) return seriePin(u, hoje);
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

/** A internet de mentira de um cenário. `rodada` diz que fonte está rodando
 *  e em que dia (o "hoje" das fixtures que dependem da data). */
function internet(cenario) {
  const rodada = { cenario, fonte: null, hoje: DIAS.at(-1), caida: false };
  const responder = (url, init) => {
    const u = new URL(url);
    const texto = typeof init.body === 'string' ? init.body : init.body == null ? '' : String(init.body);
    let json = null;
    try { json = texto.startsWith('{') ? JSON.parse(texto) : null; } catch { json = null; }
    if (u.hostname === 'exemplo.com.br' || u.hostname === 'www.exemplo.com.br') return doSite(u);
    return doToken(u, texto) ?? doGoogleDoSite(u) ?? (u.hostname === 'googleads.googleapis.com' ? doGoogleAds(u, json, rodada) : null)
      ?? (/googleapis\.com$/.test(u.hostname) ? doGoogle(u.toString(), json, rodada) : null)
      ?? (u.hostname === 'graph.facebook.com' ? doMeta(u) : null) ?? doLinkedin(u, u.toString()) ?? doPinterest(u, rodada.hoje)
      ?? falha(404, { error: { code: 404, message: 'rota falsa' } });
  };
  const fetch = async (url, init = {}) => {
    if (rodada.caida) throw new TypeError('fetch failed');
    const r = responder(String(url), init);
    const corpo = typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo ?? {});
    const tipo = typeof r.corpo === 'string' ? 'text/plain' : 'application/json';
    const resposta = new Response(r.status === 304 ? null : corpo, { status: r.status, headers: { 'content-type': tipo, ...(r.headers || {}) } });
    // Como o fetch de verdade: sem redirect 'manual', o 3xx é seguido sozinho.
    const destino = r.status >= 300 && r.status < 400 ? r.headers?.location : null;
    if (destino && init.redirect !== 'manual') return fetch(new URL(destino, url).toString(), init);
    return resposta;
  };
  return {
    fetch,
    rodar: (fonte, hoje) => { Object.assign(rodada, { fonte, hoje, caida: (cenario.foraDoAr[hoje] || []).includes(fonte) }); },
  };
}

// ================================================================== o banco ==

/** O banco de mentira: o cofre é um objeto (a info sai sem token, como a
 *  painel_mkt_conexao_info), as RPCs de números aceitam tudo, e o diário
 *  segue a MESMA regra do banco (anotarComTrava, que o teste do banco
 *  confere contra a função de verdade). */
function bancoFalso(fontesConectadas, relogio, cache) {
  const todas = conexoesIniciais();
  const cofre = Object.fromEntries(fontesConectadas.map((f) => [f, clone(todas[f])]));
  const identidade = (c) => [c?.access_token ?? null, c?.refresh_token ?? null, c?.conectado_em ?? null].join('|');
  const respostas = {
    painel_mkt_conexao_ler: (p) => clone(cofre[p.p_fonte] ?? null),
    painel_mkt_conexao_regravar: (p) => {
      if (!cofre[p.p_fonte] || identidade(cofre[p.p_fonte]) !== identidade(p.p_esperado)) return 'mudou';
      cofre[p.p_fonte] = clone(p.p_valor);
      return 'gravada';
    },
    painel_mkt_conexao_info: () => Object.fromEntries(Object.entries(cofre).map(([f, c]) => [f, {
      conectado_em: c.conectado_em ?? null, conectado_por: c.conectado_por ?? null, conta: c.conta ?? null,
      escopos: c.escopos ?? [], expira_em: c.expira_em ?? null, refresh_expira_em: c.refresh_expira_em ?? null,
    }])),
    painel_mkt_api_metricas: (p) => ({ gravadas: p.p_linhas.length, iguais: 0, ignoradas: [] }),
    painel_mkt_api_publicacoes: (p) => ({ inseridas: p.p_linhas.length, atualizadas: 0, iguais: 0, retiradas: 0, ignoradas: [] }),
    painel_mkt_api_faxina: (p) => ({ canal: p.p_canal, numeros_apagados: 0, publicacoes_limpas: 0, titulos_zerados: 0 }),
    painel_mkt_coleta_anotar: (p) => {
      // A hora do relógio de mentira, sem fazê-lo andar (o banco não conta como leitura da vm).
      const r = anotarComTrava(cache.get('mkt_coleta_diario') ?? null, p.p_entrada, { exclusiva: p.p_exclusiva, agora: relogio.agora() });
      if (r.andando) return { andando: true };
      cache.set('mkt_coleta_diario', clone(r.diario));
      return p.p_exclusiva ? { andando: false, diario: clone(r.diario) } : { andando: false };
    },
  };
  return {
    rpc(nome, params) {
      if (!respostas[nome]) throw Object.assign(new Error(`função ${nome} não existe no banco de mentira`), { code: '42883' });
      return respostas[nome](clone(params));
    },
  };
}

/** O supabase-js de mentira das duas portas: painel_cache num Map, os canais
 *  numa lista, as RPCs no banco de mentira. Tabela fora disso é erro alto
 *  (o gerador nunca pode sair com um retrato montado em cima de um buraco). */
function supabaseFalso(banco, cache) {
  return {
    from(tabela) {
      const filtro = {};
      let lista = null;
      const q = {
        select: () => q,
        eq: (k, v) => { filtro[k] = v; return q; },
        in: (k, vs) => { lista = vs; return q; },
        maybeSingle: async () => {
          if (tabela !== 'painel_cache') return { data: null, error: { code: 'XX000', message: `tabela ${tabela} fora do gerador` } };
          const v = cache.get(filtro.chave);
          return { data: v === undefined ? null : { valor: clone(v) }, error: null };
        },
        upsert: async (linha) => { cache.set(linha.chave, clone(linha.valor)); return { error: null }; },
        then: (feito, falhou) => (async () => {
          if (tabela === 'painel_mkt_canais') return { data: clone(CANAIS), error: null };
          if (tabela === 'painel_cache' && lista) return { data: lista.filter((k) => cache.has(k)).map((k) => ({ chave: k, valor: clone(cache.get(k)), atualizado_em: LEITURA })), error: null };
          return { data: null, error: { code: 'XX000', message: `tabela ${tabela} fora do gerador` } };
        })().then(feito, falhou),
      };
      return q;
    },
    async rpc(nome, params = {}) {
      try { return { data: banco.rpc(nome, params), error: null }; } catch (e) { return { data: null, error: { code: e.code ?? 'XX000', message: e.message } }; }
    },
  };
}

// ====================================================== as duas Edge Functions ==

const require = createRequire(import.meta.url);
const pasta = (p) => fileURLToPath(new URL(p, import.meta.url));
const pacotes = {};
/** A Edge Function empacotada (esbuild, que vem com o vite), com o cliente do
 *  banco e a conferência do crachá trocados por globais da vm. */
function empacotar(arquivo, trocas) {
  if (pacotes[arquivo]) return pacotes[arquivo];
  const { buildSync } = createRequire(require.resolve('vite'))('esbuild');
  let fonte = readFileSync(new URL(arquivo, import.meta.url), 'utf8');
  for (const [re, por] of trocas) {
    if (!re.test(fonte)) throw new Error(`a troca ${re} não achou o import em ${arquivo}`);
    fonte = fonte.replace(re, por);
  }
  pacotes[arquivo] = buildSync({ stdin: { contents: fonte, loader: 'ts', resolveDir: pasta(arquivo.replace(/index\.ts$/, '')) }, bundle: true, write: false, format: 'iife', platform: 'node' }).outputFiles[0].text;
  return pacotes[arquivo];
}
const COLETORA = '../supabase/functions/painel-mkt-fontes/index.ts';
const PORTA = '../supabase/functions/painel-marketing/index.ts';

const globais = (fetch, relogio, erros) => ({
  Response, Request, Headers, URL, URLSearchParams, crypto, TextEncoder, TextDecoder, btoa, atob, AbortController, AbortSignal, structuredClone, DOMException,
  setTimeout, clearTimeout, Date: relogio.Date, fetch,
  console: { error: (...a) => erros.push(a.map(String).join(' ')), log() {}, warn() {}, info() {} },
});

function carregar(arquivo, trocas, contexto) {
  let handler = null;
  vm.runInNewContext(empacotar(arquivo, trocas), { ...contexto, Deno: { ...contexto.Deno, serve: (fn) => { handler = fn; } } });
  if (!handler) throw new Error(`${arquivo} não registrou o Deno.serve`);
  return handler;
}

// ================================================================= a geração ==

/** Gera, em memória, a resposta da ação "fontes" de um cenário. */
export async function gerarFontesFicticias(nome) {
  const cenario = CENARIOS[nome];
  if (!cenario) throw new Error(`cenário desconhecido: ${nome}`);
  const relogio = criarRelogio();
  const env = await ambiente(cenario);
  const cache = new Map();
  const sb = supabaseFalso(bancoFalso(cenario.conexoes, relogio, cache), cache);
  const rede = internet(cenario);
  const erros = [];
  const Deno = { env: { get: (n) => env[n] } };

  const coletora = carregar(COLETORA, [[/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n']], {
    ...globais(rede.fetch, relogio, erros), createClient: () => sb, Deno,
  });
  // Dois dias de cron, cada fonte na hora do job dela.
  for (const hoje of DIAS) {
    for (const fonte of FONTES) {
      relogio.acertar(`${hoje}T09:${MINUTO[fonte]}:00.000Z`);
      rede.rodar(fonte, hoje);
      const r = await coletora(new Request('https://exemplo.supabase.co/functions/v1/painel-mkt-fontes', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-token': env.PAINEL_TOKEN }, body: JSON.stringify({ action: 'coletar', fonte }),
      }));
      if (r.status !== 200) throw new Error(`a coletora respondeu ${r.status} para ${fonte} em ${hoje}`);
    }
  }

  // A tela lê pela porta de verdade, como a direção (gestão: vê tudo, até as
  // chaves "restrito"; a prévia tira essas chaves dos outros papéis).
  relogio.acertar(LEITURA);
  const rede404 = async () => { throw new Error('a porta da tela não sai para a rede na ação "fontes"'); };
  const porta = carregar(PORTA, [
    [/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n'],
    [/^import.*verificarJwt.*\n/m, 'const {verificarJwt,crachaRevogado}=globalThis;\n'],
  ], {
    ...globais(rede404, relogio, erros), createClient: () => sb, Deno,
    verificarJwt: async () => ({ sub: 'direcao.exemplo', master: true }), crachaRevogado: async () => false,
  });
  const r = await porta(new Request('http://local', { method: 'POST', headers: { authorization: 'Bearer previa' }, body: JSON.stringify({ action: 'fontes' }) }));
  const corpo = await r.json();
  if (r.status !== 200 || !corpo?.ok) throw new Error(`a porta respondeu ${r.status} à ação "fontes": ${JSON.stringify(corpo).slice(0, 200)}`);
  if (erros.length) throw new Error(`as Edge Functions registraram erro durante a geração: ${erros.join(' | ').slice(0, 500)}`);
  return {
    _comentario: `Gerado por tests/gerar-fontes-ficticias.mjs (cenário "${nome}"), com os conectores, a coletora e a porta de verdade e as fixtures fictícias de tests/fixtures. Não edite à mão: rode ${COMANDO}`,
    ...corpo,
  };
}

/** O texto do arquivo, do jeito que fica gravado (uma linha por chave, para
 *  a diferença entre duas gerações ser legível). */
export const textoDoArquivo = (resposta) => `${JSON.stringify(resposta, null, 1)}\n`;
export const caminhoDoArquivo = (nome) => fileURLToPath(new URL(`../${CENARIOS[nome].arquivo}`, import.meta.url));

// Rodado direto (node tests/gerar-fontes-ficticias.mjs): grava os dois arquivos.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // O Supabase roda em UTC; o fuso desta máquina não pode mudar o arquivo.
  process.env.TZ = 'UTC';
  for (const nome of Object.keys(CENARIOS)) {
    const resposta = await gerarFontesFicticias(nome);
    writeFileSync(caminhoDoArquivo(nome), textoDoArquivo(resposta));
    const estados = Object.values(resposta.fontes).map((f) => `${f.fonte} ${f.estado}`).join(', ');
    console.log(`${CENARIOS[nome].arquivo}: ${estados}`);
  }
}
