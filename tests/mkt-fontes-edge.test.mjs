// A coletora do Marketing (painel-mkt-fontes) e as ações novas da porta
// painel-marketing (fontes, conectarInicio, desconectar, coletarAgora),
// executadas de verdade (esbuild + vm) com banco, provedores e conectores de
// mentira. Os conectores reais são de outro arquivo (e de outro teste): aqui
// entram conectores falsos, escritos para cada caso ruim.
//
// Os relógios da vm andam 1000 vezes mais rápido (setTimeout dividido por
// 1000): o orçamento de 110 s vira 110 ms, e o teste do "estourou o prazo"
// roda em instantes sem mexer no código.
//
// Nenhuma credencial é de verdade: os valores são inventados, com cara de
// token só para a faxina ter o que achar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { FONTES, SECRETS_PADRAO, SECRETS_OPCIONAIS_PADRAO, TRAVA_COLETA_MS, nomeDeSecretValido } from '../supabase/functions/_shared/mkt-fontes/info.mjs';
import { conferirState, AVISO_DESCONECTAR_GOOGLE, PROVEDORES, MOTIVOS } from '../supabase/functions/_shared/mkt-oauth.mjs';
import {
  juntarRetrato, DIAS_GUARDA_PARTE, limparSegredos, segredosDosValores, prepararSemanas, anotarDiario, anotarComTrava, hostPublico, extrasDoCtx, ESPERA_MAXIMA_MS,
  criarBuscador, regraDeHosts, conferirUrl, normalizarResultado,
} from '../supabase/functions/_shared/mkt-fontes/coletora.mjs';

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
// O registro de verdade importa os seis conectores; aqui ele vira os falsos.
const codigoColetora = empacotar('../supabase/functions/painel-mkt-fontes/index.ts', [
  [/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n'],
  [/^import \{ CONECTORES \} from .*\n/m, 'const {CONECTORES}=globalThis;\n'],
]);
const codigoMarketing = empacotar('../supabase/functions/painel-marketing/index.ts', [
  [/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n'],
  [/^import.*verificarJwt.*\n/m, 'const {verificarJwt,crachaRevogado}=globalThis;\n'],
]);
// A volta do OAuth de verdade, para o caminho inteiro: clique na porta, volta
// do provedor, confirmação e coleta, no mesmo banco de mentira.
const codigoVolta = empacotar('../supabase/functions/painel-mkt-oauth/index.ts', [
  [/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n'],
]);

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const G = (n) => `https://www.googleapis.com/auth/${n}`;
const SA_JSON = JSON.stringify({ type: 'service_account', client_email: 'coletor@projeto-teste.iam.gserviceaccount.com', private_key_id: 'idchaveprivadaFALSA0123456789', private_key: '-----BEGIN PRIVATE KEY-----\nMIIEchaveFALSAdeTESTEsoparaafaxina0123\n-----END PRIVATE KEY-----\n' });
const ENV = {
  SUPABASE_URL: 'https://exemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb-chave-de-servico-FALSA-0123456789',
  PAINEL_TOKEN: 'token-de-maquina-FALSO-0123456789',
  PAINEL_JWT_SECRET: 'segredo-do-cracha-FALSO-0123456789',
  // Montada na hora: com o prefixo e o tamanho de uma chave do Google escritos
  // no arquivo, a varredura de segredos do GitHub barraria o push (o
  // repositório é público). O valor é o mesmo, falso, e tem a cara de chave
  // de que a faxina precisa.
  GOOGLE_API_KEY: ['AI', 'za'].join('') + 'FALSAfalsaFALSAfalsaFALSAfalsa12345',
  META_TOKEN: 'EAAfalsoMETAtokenDEteste1234567890abcdefXYZ',
  GOOGLE_ADS_SA_JSON: SA_JSON,
  GOOGLE_OAUTH_CLIENT_ID: 'id-google-teste.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-segredo-google-FALSO-0123',
  LINKEDIN_CLIENT_ID: 'idlinkedinteste',
  LINKEDIN_CLIENT_SECRET: 'segredo-linkedin-FALSO-0123',
  PINTEREST_CLIENT_ID: '1500000',
  PINTEREST_CLIENT_SECRET: 'segredo-pinterest-FALSO-0123',
};
// Tudo que não pode aparecer fora do cofre.
const SEGREDOS = [...Object.entries(ENV).filter(([k]) => k !== 'SUPABASE_URL' && !/_CLIENT_ID$/.test(k)).map(([, v]) => v), JSON.parse(SA_JSON).private_key, JSON.parse(SA_JSON).private_key_id];
const vazou = (texto, extras = []) => [...SEGREDOS, ...extras].filter((s) => texto.includes(s));

const CANAIS = [
  { codigo: 'site', nome: 'Site', url_perfil: 'https://impresilk.com.br' },
  { codigo: 'google', nome: 'Google Meu Negócio', url_perfil: null },
  { codigo: 'linkedin', nome: 'LinkedIn', url_perfil: null },
  { codigo: 'pinterest', nome: 'Pinterest', url_perfil: null },
];

const resposta = (corpo, status = 200, cabecalhos = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'Content-Type': typeof corpo === 'string' ? 'text/html' : 'application/json', ...cabecalhos } });

/** Banco de mentira: cache (chave -> valor), cofre (fonte -> conexão), RPCs
 *  anotadas. As RPCs que no banco são "um passo só" (o diário, a trava do
 *  botão, a regravação da conexão, o pedido de conexão) são síncronas aqui
 *  dentro, e por isso atômicas como lá: a regra é a mesma (o diário usa o
 *  anotarComTrava, que o teste de banco confere contra a função do banco). */
const identidade = (c) => [c?.access_token ?? null, c?.refresh_token ?? null, c?.conectado_em ?? null].join('|');
function banco({ cache = {}, conexoes = {}, canais = CANAIS, rpcErro = {}, cacheErro = null } = {}) {
  // pendentes: a conexão que voltou do provedor e espera a confirmação de
  // quem clicou, uma por fonte, como no Vault (mkt_pendente_<fonte>).
  const db = { cache: new Map(Object.entries(cache).map(([k, v]) => [k, clone(v)])), conexoes: clone(conexoes), rpcs: [], upserts: [], apagados: [], pedidosOauth: new Map(), pendentes: {} };
  const sb = {
    from(tabela) {
      const filtro = {};
      let lista = null, apagar = false;
      const q = {
        select: () => q,
        eq: (k, v) => { filtro[k] = v; return q; },
        in: (k, vs) => { lista = vs; return q; },
        delete: () => { apagar = true; return q; },
        maybeSingle: async () => {
          const v = db.cache.get(filtro.chave);
          return { data: v === undefined ? null : { valor: clone(v) }, error: null };
        },
        upsert: async (linha) => { db.upserts.push(clone(linha)); db.cache.set(linha.chave, clone(linha.valor)); return { error: null }; },
        then: (ok, erro) => {
          if (apagar) {
            if (tabela !== 'painel_cache' || typeof filtro.chave !== 'string') throw new Error('o banco de mentira só apaga painel_cache por chave');
            if (cacheErro) return Promise.resolve({ data: null, error: cacheErro }).then(ok, erro);
            db.apagados.push(filtro.chave);
            db.cache.delete(filtro.chave);
            return Promise.resolve({ data: null, error: null }).then(ok, erro);
          }
          let data = [];
          if (tabela === 'painel_mkt_canais') data = clone(canais);
          if (tabela === 'painel_cache' && lista) data = lista.filter((k) => db.cache.has(k)).map((k) => ({ chave: k, valor: clone(db.cache.get(k)), atualizado_em: '2026-10-11T09:00:00Z' }));
          return Promise.resolve({ data, error: null }).then(ok, erro);
        },
      };
      return q;
    },
    async rpc(n, p) {
      db.rpcs.push({ n, p: clone(p) });
      if (rpcErro[n]) return { data: null, error: rpcErro[n] };
      if (n === 'painel_mkt_conexao_ler') return { data: clone(db.conexoes[p.p_fonte] ?? null), error: null };
      if (n === 'painel_mkt_conexao_gravar') { db.conexoes[p.p_fonte] = clone(p.p_valor); return { data: null, error: null }; }
      // A regra do banco (20261012a): o Desconectar leva a pendente junto, e
      // o clique novo também; a confirmação confere nonce, prazo e quem, num
      // passo só, e é de uso único (o teste de banco confere a de verdade).
      if (n === 'painel_mkt_conexao_apagar') { delete db.conexoes[p.p_fonte]; delete db.pendentes[p.p_fonte]; return { data: null, error: null }; }
      if (n === 'painel_mkt_conexao_pendente') {
        db.pendentes[p.p_fonte] = { nonce: p.p_nonce, quem: p.p_quem, exp: Date.now() + p.p_validade_s * 1000, conexao: clone(p.p_valor) };
        return { data: null, error: null };
      }
      if (n === 'painel_mkt_conexao_confirmar') {
        const pend = db.pendentes[p.p_fonte];
        if (!pend || pend.nonce !== p.p_nonce) return { data: { ok: false, motivo: 'pedido_vencido' }, error: null };
        if (pend.exp < Date.now()) { delete db.pendentes[p.p_fonte]; return { data: { ok: false, motivo: 'pedido_vencido' }, error: null }; }
        if (pend.quem !== p.p_quem) return { data: { ok: false, motivo: 'outra_pessoa' }, error: null };
        db.conexoes[p.p_fonte] = clone(pend.conexao);
        delete db.pendentes[p.p_fonte];
        return { data: { ok: true }, error: null };
      }
      if (n === 'painel_mkt_conexao_regravar') {
        const atual = db.conexoes[p.p_fonte];
        if (!atual || identidade(atual) !== identidade(p.p_esperado)) return { data: 'mudou', error: null };
        db.conexoes[p.p_fonte] = clone(p.p_valor);
        return { data: 'gravada', error: null };
      }
      if (n === 'painel_mkt_conexao_pedido') { db.pedidosOauth.set(p.p_nonce, { fonte: p.p_fonte, quem: p.p_quem, verificador: p.p_verificador }); delete db.pendentes[p.p_fonte]; return { data: null, error: null }; }
      if (n === 'painel_mkt_conexao_consumir') { const v = db.pedidosOauth.get(p.p_nonce) ?? null; db.pedidosOauth.delete(p.p_nonce); return { data: clone(v), error: null }; }
      if (n === 'painel_mkt_coleta_anotar') {
        const r = anotarComTrava(db.cache.get('mkt_coleta_diario') ?? null, clone(p.p_entrada), { exclusiva: p.p_exclusiva, agora: Date.now() });
        if (r.andando) return { data: { andando: true }, error: null };
        db.cache.set('mkt_coleta_diario', clone(r.diario));
        return { data: p.p_exclusiva ? { andando: false, diario: clone(r.diario) } : { andando: false }, error: null };
      }
      if (n === 'painel_mkt_coleta_pedir') {
        const pedidos = db.cache.get('mkt_coleta_pedidos') ?? {};
        const ultimo = Date.parse(pedidos[p.p_fonte]?.em || '');
        const falta = Number.isFinite(ultimo) ? ultimo + p.p_intervalo_s * 1000 - Date.now() : 0;
        if (falta > 0) return { data: { ok: false, aguardar_s: Math.min(p.p_intervalo_s, Math.max(1, Math.ceil(falta / 1000))) }, error: null };
        db.cache.set('mkt_coleta_pedidos', { ...pedidos, [p.p_fonte]: { em: new Date().toISOString(), por: p.p_quem } });
        return { data: { ok: true }, error: null };
      }
      // De propósito, um "info" com defeito que devolve o token junto: a porta
      // não pode repassar o que não está na lista dela.
      if (n === 'painel_mkt_conexao_info') return { data: clone(db.conexoes), error: null };
      if (n === 'painel_mkt_api_metricas') return { data: { gravadas: p.p_linhas.length, ignoradas: [] }, error: null };
      if (n === 'painel_mkt_api_publicacoes') return { data: { inseridas: p.p_linhas.length, atualizadas: 0, iguais: 0, retiradas: 0 }, error: null };
      return { data: null, error: null };
    },
  };
  return { db, sb };
}

const relogioRapido = { setTimeout: (fn, ms, ...a) => setTimeout(fn, Math.ceil((ms || 0) / 1000), ...a), clearTimeout };
const globais = { Response, Request, URL, URLSearchParams, crypto, console: { error() {}, log() {} }, TextEncoder, TextDecoder, btoa, atob, AbortController, AbortSignal, structuredClone, DOMException };

/** A coletora com conectores, banco e rede de mentira. */
function coletora({ env = ENV, conectores = {}, b = banco(), rede = async () => { throw new Error('rede proibida neste teste'); } } = {}) {
  let handler;
  const pedidos = [];
  // Como o fetch de verdade: sem redirect 'manual', o 3xx é seguido sozinho
  // (é isso que a coletora não pode deixar acontecer no site).
  const fetch = async (url, init = {}) => {
    pedidos.push({ url: String(url), metodo: init.method || 'GET', headers: { ...(init.headers || {}) }, corpo: init.body ?? null });
    const r = await rede(String(url), init, pedidos.length);
    const destino = r?.status >= 300 && r?.status < 400 ? r.headers.get('location') : null;
    if (destino && init.redirect !== 'manual') return fetch(new URL(destino, url).toString(), init);
    return r;
  };
  vm.runInNewContext(codigoColetora, { ...globais, ...relogioRapido, createClient: () => b.sb, CONECTORES: conectores, Deno: { env: { get: (n) => env[n] }, serve: (fn) => { handler = fn; } }, fetch });
  return {
    ...b, pedidos,
    async post(corpo, token = env.PAINEL_TOKEN, metodo = 'POST') {
      const headers = { 'content-type': 'application/json' };
      if (token != null) headers['x-token'] = token;
      const r = await handler(new Request('https://exemplo.supabase.co/functions/v1/painel-mkt-fontes', { method: metodo, headers, body: metodo === 'GET' ? undefined : JSON.stringify(corpo) }));
      const texto = await r.text();
      let json = null;
      try { json = JSON.parse(texto); } catch { json = null; }
      return { status: r.status, corpo: json, texto };
    },
  };
}
const conector = (fonte, coletar, SECRETS = SECRETS_PADRAO[fonte]) => ({ FONTE: fonte, SECRETS, coletar });
const rpcs = (t) => t.db.rpcs.map((r) => r.n);
const diario = (t) => t.db.cache.get('mkt_coleta_diario')?.execucoes ?? [];

// ------------------------------------------------------------ a coletora --

test('o caso ruim: sem x-token, com x-token errado ou sem PAINEL_TOKEN no servidor, 401 e nada roda', async () => {
  let rodou = 0;
  const conectores = { site: conector('site', async () => { rodou++; return { estado: 'ok', partes: {}, dados: {} }; }) };
  const t = coletora({ conectores });
  for (const token of [null, '', 'errado', `${ENV.PAINEL_TOKEN}x`, ENV.PAINEL_JWT_SECRET]) {
    const r = await t.post({ action: 'coletar', fonte: 'site' }, token);
    assert.equal(r.status, 401, String(token));
    assert.equal(r.texto.includes(ENV.PAINEL_TOKEN), false);
  }
  const semToken = coletora({ conectores, env: { ...ENV, PAINEL_TOKEN: undefined } });
  assert.equal((await semToken.post({ action: 'coletar', fonte: 'site' }, '')).status, 401);
  assert.equal((await semToken.post({ action: 'coletar', fonte: 'site' }, 'undefined')).status, 401);
  assert.equal(rodou, 0);
  assert.deepEqual([...t.db.upserts, ...t.db.rpcs, ...semToken.db.upserts], []);
});

test('o caso ruim: GET, fonte fora da lista e ação desconhecida são recusados sem rodar nada', async () => {
  let rodou = 0;
  const t = coletora({ conectores: { site: conector('site', async () => { rodou++; return {}; }) } });
  assert.equal((await t.post(null, ENV.PAINEL_TOKEN, 'GET')).status, 405);
  assert.equal((await t.post({ action: 'coletar', fonte: 'tiktok' })).status, 400);
  assert.equal((await t.post({ action: 'coletar', fonte: 'meta' })).status, 400, 'fonte da lista sem conector no registro');
  assert.equal((await t.post({ action: 'apagarTudo', fonte: 'site' })).status, 400);
  assert.equal(rodou, 0);
});

test('o caso ruim: conector que estoura o prazo dá parcial, e o que estava na tela continua', async () => {
  const anterior = {
    estado: 'ok', conta: 'impresilk.com.br', avisos: [], coletado_em: '2026-10-10T09:05:00.000Z', ultima_boa_em: '2026-10-10T09:05:00.000Z',
    partes: { html: { estado: 'ok', motivo: null, coletado_em: '2026-10-10T09:05:00.000Z' } },
    dados: { html: { etiquetas: ['GA4', 'Pixel da Meta'] } },
  };
  let abortado = null;
  const conectores = {
    site: conector('site', async (ctx) => {
      // Uma chamada que só termina se for abortada, e depois nada.
      try { await ctx.fetchJson('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=x', { rotulo: 'psi' }); } catch (e) { abortado = e.codigo; }
      await new Promise(() => {});
    }),
  };
  const rede = (url, init) => new Promise((_, rejeita) => init.signal.addEventListener('abort', () => rejeita(new DOMException('abortada', 'AbortError'))));
  const t = coletora({ conectores, b: banco({ cache: { mkt_fonte_site: anterior } }), rede });
  const r = await t.post({ action: 'coletar', fonte: 'site' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.estado, 'parcial');
  const v = t.db.cache.get('mkt_fonte_site');
  assert.equal(v.estado, 'parcial');
  assert.deepEqual(v.dados, anterior.dados, 'os dados de antes continuam');
  assert.deepEqual(v.partes, anterior.partes);
  assert.equal(v.ultima_boa_em, anterior.ultima_boa_em, 'tempo esgotado sem nada novo não é coleta boa');
  assert.match(v.avisos[0], /passou do tempo/);
  const [ultima] = diario(t);
  assert.equal(ultima.estado, 'parcial');
  assert.match(ultima.erro, /tempo esgotado/);
  assert.ok(ultima.fim);
  assert.equal(diario(t).some((e) => e.estado === 'andando'), false);
  // A chamada que estava em voo foi cortada pelo tempo (a de 20 s, ou o fim do orçamento).
  assert.equal(abortado, 'tempo');
});

test('o caso ruim: erro de uma parte não apaga os dados bons anteriores dela; a parte boa troca', async () => {
  const T0 = '2026-10-10T09:05:00.000Z';
  const anterior = {
    estado: 'ok', conta: 'Impresilk GA4', avisos: [], coletado_em: T0, ultima_boa_em: T0,
    partes: { ga4: { estado: 'ok', coletado_em: T0 }, search_console: { estado: 'ok', coletado_em: T0 } },
    dados: { ga4: { usuarios: 100 }, search_console: { cliques: 40, consultas: [{ termo: 'placa de acm', cliques: 10 }] } },
  };
  const conexao = { access_token: 'ya29.velhoFALSO0123456789', refresh_token: '1//refreshGOOGLEfalso0123456789abc', expira_em: '2026-10-10T10:00:00.000Z', escopos: [...PROVEDORES.google.escopos], conectado_por: 'gil', conectado_em: T0, conta: 'Impresilk GA4' };
  const visto = {};
  const conectores = {
    google: conector('google', async (ctx) => {
      visto.token = ctx.conexao.access_token;
      const partes = {}, dados = {};
      const ga4 = await ctx.fetchJson('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport', { method: 'POST', headers: { Authorization: `Bearer ${ctx.conexao.access_token}` }, body: { dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }] }, rotulo: 'ga4 resumo' });
      dados.ga4 = { usuarios: ga4.total };
      partes.ga4 = { estado: 'ok' };
      try {
        await ctx.fetchJson('https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aimpresilk.com.br/searchAnalytics/query', { method: 'POST', headers: { Authorization: `Bearer ${ctx.conexao.access_token}` }, body: {}, rotulo: 'search console' });
      } catch (e) {
        visto.erro = { codigo: e.codigo, status: e.status, mensagem: e.message };
        partes.search_console = { estado: 'erro', motivo: e.message };
        dados.search_console = null;
      }
      return { estado: 'parcial', conta: 'Impresilk GA4', partes, dados, semanas: [], publicacoes: [], avisos: ['O Search Console não respondeu.'] };
    }),
  };
  const rede = (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') return resposta({ access_token: 'ya29.novoFALSO0123456789', expires_in: 3599, scope: PROVEDORES.google.escopos.join(' ') });
    if (url.startsWith('https://analyticsdata.googleapis.com/')) return resposta({ total: 120 });
    if (url.startsWith('https://searchconsole.googleapis.com/')) return resposta({ error: { code: 500, message: 'Internal' } }, 500);
    throw new Error(`inesperado ${url}`);
  };
  const t = coletora({ conectores, b: banco({ cache: { mkt_fonte_google: anterior }, conexoes: { google: conexao } }), rede });
  const r = await t.post({ action: 'coletar', fonte: 'google' });
  assert.equal(r.status, 200);
  const v = t.db.cache.get('mkt_fonte_google');
  assert.equal(v.estado, 'parcial');
  assert.deepEqual(v.dados.search_console, anterior.dados.search_console, 'o soluço do Search Console não apaga o que estava na tela');
  assert.deepEqual(v.dados.ga4, { usuarios: 120 }, 'a parte boa troca');
  assert.equal(v.partes.search_console.estado, 'erro');
  assert.equal(v.partes.search_console.coletado_em, T0, 'a data é a da coleta boa que está na tela');
  assert.ok(v.partes.search_console.tentado_em);
  assert.notEqual(v.partes.ga4.coletado_em, T0);
  assert.equal(v.ultima_boa_em, v.coletado_em);
  // O 500 foi tentado de novo duas vezes, e só então virou erro.
  assert.deepEqual(visto.erro, { codigo: 'servidor', status: 500, mensagem: 'search console: servidor (HTTP 500)' });
  assert.equal(t.pedidos.filter((p) => p.url.startsWith('https://searchconsole.')).length, 3);
  // O conector recebeu o token já renovado, e a renovação foi guardada
  // (condicional: o cofre ainda tinha a conexão que a coletora leu).
  assert.equal(visto.token, 'ya29.novoFALSO0123456789');
  const gravou = t.db.rpcs.find((x) => x.n === 'painel_mkt_conexao_regravar');
  assert.deepEqual(gravou.p.p_esperado, { access_token: conexao.access_token, refresh_token: conexao.refresh_token, conectado_em: conexao.conectado_em });
  assert.equal(gravou.p.p_valor.access_token, 'ya29.novoFALSO0123456789');
  assert.equal(gravou.p.p_valor.refresh_token, conexao.refresh_token);
  assert.equal(gravou.p.p_valor.conectado_por, 'gil');
  assert.equal(diario(t)[0].chamadas, 1 + 1 + 3, 'token + GA4 + Search Console com 2 novas tentativas');
});

test('o caso ruim: nenhum segredo vai para o cache, o diário ou a resposta, e os da casa nem chegam ao conector', async () => {
  const visto = {};
  const malicioso = conector('meta', async (ctx) => {
    const tok = ctx.env('META_TOKEN');
    visto.meta = tok;
    for (const n of ['PAINEL_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'PAINEL_JWT_SECRET', 'SUPABASE_URL', 'HOME']) visto[n] = ctx.env(n);
    const ads = ctx.env('GOOGLE_ADS_SA_JSON');
    visto.pagina = ctx.env('META_PAGE_ID');
    ctx.log(`token ${tok}`);
    ctx.log(`https://graph.facebook.com/v23.0/me?fields=id&access_token=${tok}`);
    return {
      estado: 'ok', conta: `Página ${tok}`,
      partes: { pagina: { estado: 'ok', motivo: `falhou com ${tok}` } },
      dados: {
        token: tok, access_token: tok, [tok]: 'chave com o token',
        aninhado: { url: `https://graph.facebook.com/x?access_token=${tok}&after=abc`, cabecalho: `Bearer ${tok}`, lista: [tok, ENV.GOOGLE_API_KEY, JSON.parse(ads).private_key, ENV.GOOGLE_OAUTH_CLIENT_SECRET] },
        servico: ENV.SUPABASE_SERVICE_ROLE_KEY,
        legitimo: { seguidores: 5230, pagina: 'Impresilk', link: `https://www.facebook.com/${visto.pagina}`, pin: '1500000123456789' },
      },
      avisos: [`o token é ${tok}`],
      semanas: [], publicacoes: [],
    };
  }, ['META_TOKEN']);
  // ID de página não é segredo (a faxina não pode apagar o link da página),
  // nem o ID do app OAuth dentro de um ID de Pin.
  const t = coletora({ conectores: { meta: malicioso }, env: { ...ENV, META_PAGE_ID: '100012345678901', PINTEREST_CLIENT_ID: '15000001' } });
  const r = await t.post({ action: 'coletar', fonte: 'meta' });
  assert.equal(r.status, 200);
  assert.equal(visto.meta, ENV.META_TOKEN, 'o conector recebe o secret dele');
  for (const n of ['PAINEL_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'PAINEL_JWT_SECRET', 'SUPABASE_URL', 'HOME']) assert.equal(visto[n], null, `${n} não chega ao conector`);
  const tudo = JSON.stringify([t.db.upserts, r.texto]);
  assert.deepEqual(vazou(tudo), []);
  assert.equal(/EAA[A-Za-z0-9]{20}/.test(tudo), false);
  assert.equal(/BEGIN PRIVATE KEY/.test(tudo), false);
  // O que não é segredo continua.
  const v = t.db.cache.get('mkt_fonte_meta');
  assert.deepEqual(v.dados.legitimo, { seguidores: 5230, pagina: 'Impresilk', link: 'https://www.facebook.com/100012345678901', pin: '1500000123456789' });
  assert.equal('token' in v.dados || 'access_token' in v.dados, false);
  assert.match(v.dados.aninhado.url, /access_token=\[oculto\]&after=abc/);
  assert.deepEqual(v.secrets, ['META_TOKEN'], 'o NOME do secret vai, o valor não');
  // Conector que lança erro com o token na mensagem: o diário guarda só o código.
  const t2 = coletora({ conectores: { meta: conector('meta', async (ctx) => { throw new Error(`falhou com ${ctx.env('META_TOKEN')}`); }) } });
  const r2 = await t2.post({ action: 'coletar', fonte: 'meta' });
  assert.equal(r2.corpo.estado, 'erro');
  assert.equal(diario(t2)[0].erro, 'falha inesperada');
  assert.deepEqual(vazou(JSON.stringify([t2.db.upserts, r2.texto])), []);
});

test('refresh do Pinterest: o refresh token NOVO é gravado antes de tudo, e não aparece no cache', async () => {
  const AGORA = Date.now();
  const conexao = {
    access_token: 'pina_ACCESSvelhoFALSO000000000000000', refresh_token: 'pinr_REFRESHvelhoFALSO00000000000000',
    expira_em: new Date(AGORA + 3 * 86400e3).toISOString(), refresh_expira_em: new Date(AGORA + 40 * 86400e3).toISOString(),
    escopos: ['user_accounts:read', 'pins:read', 'boards:read', 'ads:read'], conectado_por: 'leo', conectado_em: '2026-08-01T00:00:00.000Z',
  };
  const NOVO = 'pinr_REFRESHnovoFALSO1111111111111111';
  let tokenUsado = null;
  const conectores = {
    pinterest: conector('pinterest', async (ctx) => {
      tokenUsado = ctx.conexao.access_token;
      return { estado: 'ok', conta: 'impresilk', partes: { conta: { estado: 'ok' } }, dados: { seguidores: 88 }, semanas: [{ canal: 'pinterest', semana: '2026-09-28', numeros: { impressoes: 300, seguidores: null } }], publicacoes: [] };
    }),
  };
  const rede = (url) => {
    if (url === 'https://api.pinterest.com/v5/oauth/token') {
      return resposta({ access_token: 'pina_ACCESSnovoFALSO111111111111111', refresh_token: NOVO, expires_in: 2592000, refresh_token_expires_in: 5184000, refresh_token_expires_at: Math.floor(AGORA / 1000) + 5184000, scope: 'user_accounts:read,pins:read,boards:read,ads:read' });
    }
    throw new Error(`inesperado ${url}`);
  };
  const t = coletora({ conectores, b: banco({ conexoes: { pinterest: conexao } }), rede });
  const r = await t.post({ action: 'coletar', fonte: 'pinterest', quem: 'ana' });
  assert.equal(r.corpo.estado, 'ok');
  // A renovada é guardada ANTES do conector rodar; o nome da conta que o
  // conector achou vai depois, com a mesma conferência.
  assert.deepEqual(rpcs(t), ['painel_mkt_coleta_anotar', 'painel_mkt_conexao_ler', 'painel_mkt_conexao_regravar', 'painel_mkt_conexao_regravar', 'painel_mkt_api_metricas', 'painel_mkt_coleta_anotar'], 'a conexão renovada é a primeira gravação');
  assert.equal(t.db.rpcs[2].p.p_valor.refresh_token, NOVO);
  assert.equal('conta' in t.db.rpcs[2].p.p_valor, false, 'a primeira gravação é só a renovação');
  const gravada = t.db.conexoes.pinterest;
  assert.equal(gravada.refresh_token, NOVO);
  assert.equal(gravada.conectado_por, 'leo');
  assert.equal(gravada.conta, 'impresilk', 'o nome da conta que o conector achou vai para a conexão');
  assert.equal(tokenUsado, 'pina_ACCESSnovoFALSO111111111111111');
  const pedido = t.pedidos[0];
  assert.equal(pedido.headers.Authorization, `Basic ${Buffer.from(`${ENV.PINTEREST_CLIENT_ID}:${ENV.PINTEREST_CLIENT_SECRET}`).toString('base64')}`);
  assert.equal(String(pedido.corpo).includes(ENV.PINTEREST_CLIENT_SECRET), false);
  // Semana só com o número que veio; quem pediu fica no rastro.
  const met = t.db.rpcs.find((x) => x.n === 'painel_mkt_api_metricas').p;
  assert.deepEqual(met.p_linhas, [{ canal: 'pinterest', semana: '2026-09-28', numeros: { impressoes: 300 } }]);
  assert.equal(met.p_quem, 'ana (coleta pinterest)');
  assert.deepEqual(vazou(JSON.stringify(t.db.upserts), [NOVO, conexao.refresh_token, conexao.access_token]), []);
});

test('o caso ruim: conexão renovada pelo próprio conector sem refresh token não apaga o refresh guardado', async () => {
  const conexao = { access_token: 'AQV-velhoFALSO0123456789', refresh_token: 'AQX-refreshFALSO0123456789', expira_em: new Date(Date.now() + 40 * 86400e3).toISOString(), escopos: ['rw_organization_admin'], conectado_por: 'leo', conectado_em: '2026-10-01T00:00:00.000Z' };
  const conectores = { linkedin: conector('linkedin', async () => ({ estado: 'ok', partes: {}, dados: {}, conexao: { access_token: 'AQV-novoFALSO0123456789', refresh_token: undefined, expira_em: null } })) };
  const t = coletora({ conectores, b: banco({ conexoes: { linkedin: conexao } }) });
  await t.post({ action: 'coletar', fonte: 'linkedin' });
  const gravada = t.db.conexoes.linkedin;
  assert.equal(gravada.access_token, 'AQV-novoFALSO0123456789');
  assert.equal(gravada.refresh_token, conexao.refresh_token);
  assert.equal(gravada.expira_em, conexao.expira_em);
  assert.equal(gravada.conectado_por, 'leo');
});

test('o caso ruim: refresh recusado vira "reconectar" sem rodar o conector, e a conexão fica guardada como estava', async () => {
  let rodou = 0;
  const conexao = { access_token: 'ya29.velho', refresh_token: '1//refreshMORTOfalso0123456789', expira_em: '2026-01-01T00:00:00.000Z', escopos: [], conectado_por: 'gil', conectado_em: '2026-01-01T00:00:00.000Z' };
  const t = coletora({
    conectores: { google: conector('google', async () => { rodou++; return {}; }) },
    b: banco({ conexoes: { google: conexao }, cache: { mkt_fonte_google: { estado: 'ok', dados: { ga4: { usuarios: 1 } }, partes: {} } } }),
    rede: () => resposta({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400),
  });
  const r = await t.post({ action: 'coletar', fonte: 'google' });
  assert.equal(r.corpo.estado, 'reconectar');
  assert.equal(rodou, 0);
  assert.equal(rpcs(t).some((n) => /painel_mkt_conexao_(re)?gravar/.test(n)), false);
  assert.deepEqual(t.db.cache.get('mkt_fonte_google').dados, { ga4: { usuarios: 1 } });
  assert.match(t.db.cache.get('mkt_fonte_google').avisos[0], /Reconectar/);
  assert.equal(t.pedidos.length, 1, 'token morto não insiste');
});

test('o caso ruim: conexão ilegível no cofre vira "reconectar", sem rodar o conector e sem texto do banco', async () => {
  let rodou = 0;
  const t = coletora({ conectores: { pinterest: conector('pinterest', async () => { rodou++; return {}; }) }, b: banco({ rpcErro: { painel_mkt_conexao_ler: { code: 'XX001', message: 'A conexão guardada de pinterest está ilegível no cofre; conecte de novo' } } }) });
  const r = await t.post({ action: 'coletar', fonte: 'pinterest' });
  assert.equal(r.corpo.estado, 'reconectar');
  assert.equal(rodou, 0);
  assert.equal(diario(t)[0].erro, 'banco: XX001');
  assert.match(t.db.cache.get('mkt_fonte_pinterest').avisos[0], /ilegível/);
});

test('o caso ruim: OAuth sem o app cadastrado é falta_configurar; sem conexão é falta_conectar; o conector nem roda', async () => {
  let rodou = 0;
  const conectores = { linkedin: conector('linkedin', async () => { rodou++; return {}; }) };
  const semApp = coletora({ conectores, env: { ...ENV, LINKEDIN_CLIENT_SECRET: '' } });
  assert.equal((await semApp.post({ action: 'coletar', fonte: 'linkedin' })).corpo.estado, 'falta_configurar');
  const semConexao = coletora({ conectores });
  assert.equal((await semConexao.post({ action: 'coletar', fonte: 'linkedin' })).corpo.estado, 'falta_conectar');
  assert.equal(rodou, 0);
  // A retenção do LinkedIn roda mesmo assim: o prazo de guarda corre sem
  // coleta. O título vai nulo: o LinkedIn nunca manda título, e o que está
  // lá foi gente que digitou.
  const faxina = semConexao.db.rpcs.find((x) => x.n === 'painel_mkt_api_faxina');
  assert.deepEqual(faxina.p, { p_canal: 'linkedin', p_dias_numeros: 365, p_dias_titulo: null });
});

test('o caso ruim: a faxina do LinkedIn usa o canal que o conector achou, mas nunca o prazo dele', async () => {
  const conexao = { access_token: 'AQV-tokenFALSO0123456789', expira_em: new Date(Date.now() + 40 * 86400e3).toISOString(), escopos: [], conectado_por: 'leo', conectado_em: '2026-10-01T00:00:00.000Z' };
  const conectores = { linkedin: conector('linkedin', async () => ({ estado: 'ok', partes: {}, dados: {}, faxina: { canal: 'linkedin-empresa', dias_numeros: 1, dias_titulo: 1 } })) };
  const t = coletora({ conectores, b: banco({ conexoes: { linkedin: conexao } }) });
  await t.post({ action: 'coletar', fonte: 'linkedin' });
  assert.deepEqual(t.db.rpcs.find((x) => x.n === 'painel_mkt_api_faxina').p, { p_canal: 'linkedin-empresa', p_dias_numeros: 365, p_dias_titulo: null });
  assert.equal(rpcs(t).some((n) => /painel_mkt_conexao_(re)?gravar/.test(n)), false, 'token com 40 dias não renova, e nada muda no cofre');
});

test('o caso ruim: o site só busca o próprio domínio por https, sem IP, sem método de escrita e até 15 páginas', async () => {
  const resultado = {};
  const conectores = {
    site: conector('site', async (ctx) => {
      const tenta = async (nome, fn) => { try { await fn(); resultado[nome] = 'ok'; } catch (e) { resultado[nome] = e.codigo; } };
      await tenta('home', () => ctx.fetchTexto('https://impresilk.com.br/', { rotulo: 'home' }));
      await tenta('http', () => ctx.fetchTexto('http://impresilk.com.br/'));
      await tenta('ip', () => ctx.fetchTexto('https://169.254.169.254/latest/meta-data'));
      await tenta('ipDisfarcado', () => ctx.fetchTexto('https://2130706433/'));
      await tenta('localhost', () => ctx.fetchTexto('https://localhost/'));
      await tenta('outro', () => ctx.fetchTexto('https://evil.example.com/'));
      await tenta('parecido', () => ctx.fetchTexto('https://impresilk.com.br.evil.com/'));
      await tenta('porta', () => ctx.fetchTexto('https://impresilk.com.br:8443/'));
      await tenta('usuario', () => ctx.fetchTexto('https://admin@impresilk.com.br/'));
      await tenta('redireciona', () => ctx.fetchTexto('https://impresilk.com.br/redireciona'));
      await tenta('apagar', () => ctx.fetchJson('https://impresilk.com.br/wp-json/wp/v2/posts/1', { method: 'DELETE' }));
      await tenta('psi', () => ctx.fetchJson('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fimpresilk.com.br', { headers: { 'x-goog-api-key': ctx.env('GOOGLE_API_KEY') }, rotulo: 'psi' }));
      for (let i = 0; i < 16; i++) await tenta(`pagina${i}`, () => ctx.fetchTexto(`https://www.impresilk.com.br/pagina-${i}`));
      // O fetch cru (o do HTML do site): as mesmas travas de host e método,
      // e o redirecionamento nunca é seguido sozinho.
      await tenta('cruIp', () => ctx.fetch('https://169.254.169.254/latest/meta-data'));
      await tenta('cruOutro', () => ctx.fetch('https://evil.example.com/', { method: 'GET' }));
      await tenta('cruPut', () => ctx.fetch('https://impresilk.com.br/wp-json/wp/v2/posts/1', { method: 'PUT', body: '{}' }));
      const r = await ctx.fetch('https://impresilk.com.br/redireciona', { redirect: 'follow' });
      resultado.cruRedireciona = r.status;
      return { estado: 'ok', partes: {}, dados: { resultado } };
    }),
  };
  const rede = (url) => {
    if (url === 'https://impresilk.com.br/redireciona') return resposta('', 302, { Location: 'https://127.0.0.1/admin' });
    if (url === 'https://127.0.0.1/admin') return resposta('<html>painel interno</html>');
    if (url.startsWith('https://pagespeedonline.googleapis.com/')) return resposta({ lighthouseResult: {} });
    if (url.startsWith('https://impresilk.com.br/') || url.startsWith('https://www.impresilk.com.br/')) return resposta('<html><head></head></html>');
    throw new Error(`inesperado ${url}`);
  };
  const t = coletora({ conectores, rede });
  assert.equal((await t.post({ action: 'coletar', fonte: 'site' })).status, 200);
  for (const nome of ['http', 'ip', 'ipDisfarcado', 'localhost', 'outro', 'parecido', 'porta', 'usuario', 'redireciona']) assert.equal(resultado[nome], 'url_recusada', nome);
  assert.equal(resultado.home, 'ok');
  assert.equal(resultado.psi, 'ok');
  assert.equal(resultado.apagar, 'metodo_recusado');
  // home e redireciona contam: sobram 13 páginas.
  assert.equal(resultado.pagina12, 'ok');
  assert.equal(resultado.pagina13, 'limite_paginas');
  assert.equal(resultado.cruIp, 'url_recusada');
  assert.equal(resultado.cruOutro, 'url_recusada');
  assert.equal(resultado.cruPut, 'metodo_recusado');
  assert.equal(resultado.cruRedireciona, 302, 'o fetch cru devolve o 302 em vez de seguir para o IP');
  assert.equal(t.pedidos.some((p) => /127\.0\.0\.1|169\.254|localhost|evil|2130706433|8443|admin@/.test(p.url)), false, 'nada fora do domínio chegou à rede');
  const psi = t.pedidos.find((p) => p.url.startsWith('https://pagespeedonline'));
  assert.equal(psi.url.includes(ENV.GOOGLE_API_KEY), false, 'a chave vai no cabeçalho, nunca na URL');
  assert.equal(psi.headers['x-goog-api-key'], ENV.GOOGLE_API_KEY);
});

test('o caso ruim: 401 do provedor não se repete; 429 respeita o Retry-After e desiste depois de 2 novas tentativas', async () => {
  const visto = {};
  const conectores = {
    meta: conector('meta', async (ctx) => {
      try { await ctx.fetchJson('https://graph.facebook.com/v23.0/morto', { rotulo: 'página' }); } catch (e) { visto.morto = { codigo: e.codigo, status: e.status, mensagem: e.message, corpo: e.corpo }; }
      try { await ctx.fetchJson('https://graph.facebook.com/v23.0/limite', { rotulo: 'insights' }); } catch (e) { visto.limite = { codigo: e.codigo, status: e.status }; }
      try { await ctx.fetchJson('https://graph.facebook.com/v23.0/lixo', { rotulo: 'posts' }); } catch (e) { visto.lixo = e.codigo; }
      return { estado: 'parcial', partes: {}, dados: {} };
    }),
  };
  const rede = (url) => {
    if (url.endsWith('/morto')) return resposta({ error: { code: 190, message: 'Error validating access token' } }, 401);
    if (url.endsWith('/limite')) return resposta({ error: { code: 4 } }, 429, { 'Retry-After': '1' });
    if (url.endsWith('/lixo')) return resposta('isto não é json');
    throw new Error(url);
  };
  const t = coletora({ conectores, rede });
  await t.post({ action: 'coletar', fonte: 'meta' });
  // O corpo nasceu dentro da vm (outro mundo): compara pela cópia.
  assert.deepEqual(clone(visto.morto), { codigo: 'nao_autorizado', status: 401, mensagem: 'página: nao_autorizado (HTTP 401)', corpo: { error: { code: 190, message: 'Error validating access token' } } });
  assert.deepEqual(visto.limite, { codigo: 'limite', status: 429 });
  assert.equal(visto.lixo, 'resposta_invalida');
  assert.equal(t.pedidos.filter((p) => p.url.endsWith('/morto')).length, 1);
  assert.equal(t.pedidos.filter((p) => p.url.endsWith('/limite')).length, 3);
});

test('o caso ruim: segunda execução da mesma fonte enquanto a primeira anda volta "andando"; a que morreu vira interrompida', async () => {
  let rodou = 0;
  const conectores = { site: conector('site', async () => { rodou++; return { estado: 'ok', partes: {}, dados: {} }; }) };
  const agora = Date.now();
  const andando = { versao: 1, execucoes: [{ id: 'a1', fonte: 'site', inicio: new Date(agora - 10_000).toISOString(), estado: 'andando' }] };
  const t = coletora({ conectores, b: banco({ cache: { mkt_coleta_diario: andando } }) });
  const r = await t.post({ action: 'coletar', fonte: 'site' });
  assert.deepEqual(r.corpo, { ok: true, fonte: 'site', andando: true });
  assert.equal(rodou, 0);
  const morta = { versao: 1, execucoes: [{ id: 'a1', fonte: 'site', inicio: new Date(agora - 10 * 60_000).toISOString(), estado: 'andando' }] };
  const t2 = coletora({ conectores, b: banco({ cache: { mkt_coleta_diario: morta } }) });
  assert.equal((await t2.post({ action: 'coletar', fonte: 'site' })).corpo.estado, 'ok');
  assert.equal(rodou, 1);
  const [nova, velha] = diario(t2);
  assert.equal(nova.estado, 'ok');
  assert.equal(velha.estado, 'interrompida');
  assert.match(velha.erro, /parou sem terminar/);
});

test('semanas e publicações vão às RPCs só com o que veio: número nulo ou ruim não vai, link sem rastreio, sem link não entra', async () => {
  const conectores = {
    site: conector('site', async () => ({
      estado: 'ok', partes: { ga4: { estado: 'ok' } }, dados: {},
      semanas: [
        { canal: 'site', semana: '2026-09-28', numeros: { alcance: '120', impressoes: 300.4, leads: null, cliques: -1, conversas: 'muitas' } },
        { canal: 'site', semana: '2026-09-30', numeros: { alcance: 1 } },
        { canal: 'SITE!', semana: '2026-09-28', numeros: { alcance: 1 } },
        { canal: 'site', semana: '2026-09-21', numeros: { leads: null } },
      ],
      publicacoes: [
        { canal: 'site', url: 'https://impresilk.com.br/blog/placas/?utm_source=x#topo', data: '2026-09-29T10:00:00Z', titulo: '', alcance: null, cliques: 7 },
        { canal: 'site', data: '2026-09-29', titulo: 'sem link' },
        { canal: 'site', url: 'javascript:alert(1)', data: '2026-09-29' },
        { canal: 'site', url: 'https://impresilk.com.br/p', data: '29/09/2026' },
      ],
    })),
  };
  const t = coletora({ conectores });
  await t.post({ action: 'coletar', fonte: 'site' });
  const met = t.db.rpcs.find((x) => x.n === 'painel_mkt_api_metricas').p;
  assert.deepEqual(met.p_linhas, [{ canal: 'site', semana: '2026-09-28', numeros: { alcance: 120, impressoes: 300 } }]);
  assert.equal(met.p_quem, 'coleta site');
  const pubs = t.db.rpcs.find((x) => x.n === 'painel_mkt_api_publicacoes').p;
  assert.deepEqual(pubs.p_linhas, [{ canal: 'site', url: 'https://impresilk.com.br/blog/placas', data: '2026-09-29', cliques: 7 }]);
  assert.match(diario(t)[0].log.join(' '), /3 semana\(s\) fora do formato/);
});


// ---------------------------------- a conexão e o diário durante a coleta --

const AGORA_T = Date.now();
const CONEXOES_T = {
  // Vence em 3 dias: a coletora renova (folga de 7) e o Pinterest troca o refresh.
  pinterest: { access_token: 'pina_ACCESSvelhoFALSO000000000000000', refresh_token: 'pinr_REFRESHvelhoFALSO00000000000000', expira_em: new Date(AGORA_T + 3 * 86400e3).toISOString(), refresh_expira_em: new Date(AGORA_T + 40 * 86400e3).toISOString(), escopos: [], conectado_por: 'leo', conectado_em: '2026-08-01T00:00:00.000Z' },
  // Vale 40 dias e ainda não tem o nome da conta: o conector devolve a conta.
  linkedin: { access_token: 'AQV-tokenFALSO0123456789', expira_em: new Date(AGORA_T + 40 * 86400e3).toISOString(), escopos: [], conectado_por: 'leo', conectado_em: '2026-10-01T00:00:00.000Z' },
  // Vencido: o Google renova em toda coleta (o token dura 1 h).
  google: { access_token: 'ya29.velhoFALSO0123456789', refresh_token: '1//refreshGOOGLEfalso0123456789abc', expira_em: new Date(AGORA_T - 1000).toISOString(), escopos: [...PROVEDORES.google.escopos], conectado_por: 'gil', conectado_em: '2026-09-01T00:00:00.000Z' },
};
const TOKEN_T = {
  pinterest: ['https://api.pinterest.com/v5/oauth/token', { access_token: 'pina_ACCESSnovoFALSO111111111111111', refresh_token: 'pinr_REFRESHnovoFALSO1111111111111111', expires_in: 2592000 }],
  google: ['https://oauth2.googleapis.com/token', { access_token: 'ya29.novoFALSO0123456789', expires_in: 3599 }],
};
const redeDoToken = (fonte, antes = () => {}) => async (url) => {
  const [u, corpo] = TOKEN_T[fonte] || [];
  if (url === u) { await antes(); return resposta(corpo); }
  throw new Error(`inesperado ${url}`);
};

test('o caso ruim: Desconectar no meio da coleta não é desfeito; a conexão apagada continua apagada (Pinterest, LinkedIn e Google)', async () => {
  for (const fonte of ['pinterest', 'linkedin', 'google']) {
    const b = banco({ conexoes: { [fonte]: CONEXOES_T[fonte] } });
    // A porta da tela e a coletora no MESMO banco: o Desconectar de verdade.
    const tela = porta({ b, rede: async () => resposta({}, 200) });
    tela.sessao(GIL);
    const conectores = { [fonte]: conector(fonte, async () => {
      const r = await tela.call({ action: 'desconectar', fonte });
      assert.equal(r.status, 200, fonte);
      return { estado: 'ok', conta: 'Impresilk', partes: { conta: { estado: 'ok' } }, dados: { seguidores: 1 } };
    }) };
    const t = coletora({ conectores, b, rede: redeDoToken(fonte) });
    const r = await t.post({ action: 'coletar', fonte });
    assert.equal(r.status, 200, fonte);
    assert.equal(fonte in b.db.conexoes, false, `${fonte}: a conexão apagada voltou ao cofre`);
    assert.ok(b.db.cache.get(`mkt_fonte_${fonte}`).avisos.some((a) => /mudou durante a coleta/.test(a)), `${fonte}: sem aviso`);
    assert.match(diario(t)[0].log.join(' '), /a conexão mudou no cofre durante a coleta/);
    // E a tela diz "falta conectar", não "conectado".
    const f = (await tela.call({ action: 'fontes' })).fontes[fonte];
    assert.equal(f.estado, 'falta_conectar', fonte);
    assert.equal(f.conexao, null, fonte);
  }
});

test('o caso ruim: Reconectar com outra conta no meio da coleta não é trocado de volta pela conexão velha', async () => {
  const C2 = { access_token: 'ya29.C2novaFALSO0123456789', refresh_token: '1//refreshC2falsoNOVO0123456789abcd', expira_em: new Date(AGORA_T + 3600e3).toISOString(), escopos: [...PROVEDORES.google.escopos], conta: 'Conta Nova', conectado_por: 'gil', conectado_em: new Date(AGORA_T).toISOString() };
  const b = banco({ conexoes: { google: CONEXOES_T.google } });
  // A volta do OAuth grava de cima, pela mesma RPC da painel-mkt-oauth.
  const conectores = { google: conector('google', async () => {
    await b.sb.rpc('painel_mkt_conexao_gravar', { p_fonte: 'google', p_valor: C2 });
    return { estado: 'ok', conta: 'Conta Antiga', partes: {}, dados: {} };
  }) };
  const t = coletora({ conectores, b, rede: redeDoToken('google') });
  await t.post({ action: 'coletar', fonte: 'google' });
  assert.deepEqual(b.db.conexoes.google, C2, 'a reconexão de agora fica');
});

test('o caso ruim: Desconectar durante a renovação: a renovada não é guardada e o conector nem roda', async () => {
  let rodou = 0;
  const b = banco({ conexoes: { pinterest: CONEXOES_T.pinterest } });
  const conectores = { pinterest: conector('pinterest', async () => { rodou++; return { estado: 'ok', partes: {}, dados: {} }; }) };
  const t = coletora({ conectores, b, rede: redeDoToken('pinterest', () => { delete b.db.conexoes.pinterest; }) });
  const r = await t.post({ action: 'coletar', fonte: 'pinterest' });
  assert.equal(rodou, 0, 'conexão que mudou no cofre não serve para coletar');
  assert.equal(r.corpo.estado, 'parcial');
  assert.equal('pinterest' in b.db.conexoes, false);
  assert.match(t.db.cache.get('mkt_fonte_pinterest').avisos[0], /mudou durante a coleta/);
});

test('o caso ruim: duas coletas do Pinterest ao mesmo tempo: uma anda, a outra volta "andando", e o refresh é renovado uma vez só', async () => {
  const b = banco({ conexoes: { pinterest: CONEXOES_T.pinterest } });
  let renovacoes = 0, rodou = 0;
  const rede = redeDoToken('pinterest', async () => { renovacoes++; await new Promise((r) => setTimeout(r, 5)); });
  const conectores = { pinterest: conector('pinterest', async () => { rodou++; return { estado: 'ok', partes: {}, dados: {} }; }) };
  const t = coletora({ conectores, b, rede });
  const rs = await Promise.all([t.post({ action: 'coletar', fonte: 'pinterest', quem: 'ana' }), t.post({ action: 'coletar', fonte: 'pinterest', quem: 'bia' })]);
  assert.deepEqual(rs.map((r) => r.corpo.andando === true).sort(), [false, true]);
  assert.equal(renovacoes, 1, 'o mesmo refresh token renovado duas vezes');
  assert.equal(rodou, 1);
  assert.equal(b.db.conexoes.pinterest.refresh_token, TOKEN_T.pinterest[1].refresh_token);
  assert.deepEqual(diario(t).map((e) => e.estado), ['ok']);
});

test('o caso ruim: duas fontes que terminam juntas ficam as duas no diário, cada uma com o estado e as chamadas dela', async () => {
  const b = banco();
  const um = (fonte, url) => conector(fonte, async (ctx) => {
    await ctx.fetchJson(url, { rotulo: fonte });
    return { estado: 'ok', partes: {}, dados: {} };
  });
  const conectores = { meta: um('meta', 'https://graph.facebook.com/v23.0/me'), site: um('site', 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/x') };
  const rede = async () => { await new Promise((r) => setTimeout(r, 3)); return resposta({ ok: 1 }); };
  const t = coletora({ conectores, b, rede });
  await Promise.all([t.post({ action: 'coletar', fonte: 'meta' }), t.post({ action: 'coletar', fonte: 'site' })]);
  const d = diario(t);
  assert.deepEqual(d.map((e) => [e.fonte, e.estado, e.chamadas]).sort(), [['meta', 'ok', 1], ['site', 'ok', 1]]);
  assert.deepEqual(Object.keys(b.db.cache.get('mkt_coleta_diario').cota).sort(), ['meta', 'site']);
  assert.equal(b.db.upserts.some((u) => u.chave === 'mkt_coleta_diario'), false, 'o diário só é gravado pelo banco, num passo');
});

test('o caso ruim: 20 cliques que não gastam nada não apagam a conta do dia (o gasto por hora fica no diário)', async () => {
  const agora = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  let d = null;
  // O cron gastou 40, e dois cliques gastaram 40 e 10.
  for (const [i, n] of [[0, 40], [1, 40], [2, 10]]) d = anotarDiario(d, { id: `g${i}`, fonte: 'linkedin', inicio: iso(agora - (90 - i * 10) * 60_000), fim: iso(agora - (89 - i * 10) * 60_000), estado: 'ok', chamadas: n }, agora);
  // Vinte cliques depois, com o orçamento zerado: 0 cada.
  for (let i = 0; i < 20; i++) d = anotarDiario(d, { id: `z${i}`, fonte: 'linkedin', inicio: iso(agora - (40 - i) * 60_000), fim: iso(agora - (40 - i) * 60_000 + 1000), estado: 'parcial', chamadas: 0 }, agora);
  assert.ok(d.execucoes.filter((e) => e.fonte === 'linkedin').every((e) => e.chamadas === 0), 'as que gastaram saíram das 20 do diário');
  assert.equal(extrasDoCtx('linkedin', { diario: d, agora }).chamadasHoje, 90);
  assert.equal(extrasDoCtx('pinterest', { diario: d, agora }).chamadasHoje, 0, 'outra fonte não entra');
  // Hora cheia de mais de 25 h sai da conta; a de quase 24 h ainda entra (a
  // hora cheia pode ter começado até 1 h antes da execução: lado seguro).
  const velho = { versao: 1, execucoes: [], cota: { linkedin: { [iso(agora - 26 * 3600e3).slice(0, 13)]: 70, [iso(agora - 23.5 * 3600e3).slice(0, 13)]: 5 } } };
  assert.equal(extrasDoCtx('linkedin', { diario: velho, agora }).chamadasHoje, 5);
  // E a coletora entrega esse número ao conector.
  let visto = null;
  const t = coletora({
    conectores: { linkedin: conector('linkedin', async (ctx) => { visto = ctx.chamadasHoje; return { estado: 'ok', partes: {}, dados: {} }; }) },
    b: banco({ cache: { mkt_coleta_diario: d }, conexoes: { linkedin: CONEXOES_T.linkedin } }),
  });
  await t.post({ action: 'coletar', fonte: 'linkedin' });
  assert.equal(visto, 90);
});

test('o caso ruim: 429 com Retry-After de 1 hora não é repetido; GA4 e LinkedIn não repetem nem 429 nem 5xx; o que cabe é respeitado inteiro', async () => {
  const rodar = async (fonte, url, status, cabecalhos = {}) => {
    const idas = [], esperas = [];
    let resta = 110_000;
    const b = criarBuscador({
      fetch: async (u) => { idas.push(u); return resposta({ erro: 'calma' }, status, cabecalhos); },
      regra: regraDeHosts(fonte, CANAIS), prazo: () => resta, esperar: async (ms) => { esperas.push(ms); resta -= ms; },
    });
    let erro = null;
    try { await b.fetchJson(url, { rotulo: 'teste' }); } catch (e) { erro = e.codigo; }
    return { idas: idas.length, esperas, erro };
  };
  // O caso do achado: 1 hora pedida. Uma ida, nenhuma espera, "limite".
  assert.deepEqual(await rodar('linkedin', 'https://api.linkedin.com/rest/x', 429, { 'Retry-After': '3600' }), { idas: 1, esperas: [], erro: 'limite' });
  for (const ra of [String(ESPERA_MAXIMA_MS / 1000 + 1), '86400', new Date(Date.now() + 3600e3).toUTCString()]) {
    assert.deepEqual(await rodar('meta', 'https://graph.facebook.com/v23.0/x', 429, { 'Retry-After': ra }), { idas: 1, esperas: [], erro: 'limite' }, ra);
  }
  // O que cabe inteiro é respeitado (e não trocado pelo 1 s, 2 s).
  assert.deepEqual(await rodar('meta', 'https://graph.facebook.com/v23.0/x', 429, { 'Retry-After': '2' }), { idas: 3, esperas: [2000, 2000], erro: 'limite' });
  assert.deepEqual(await rodar('meta', 'https://graph.facebook.com/v23.0/x', 503), { idas: 3, esperas: [1000, 2000], erro: 'servidor' });
  // GA4 (10 erros de servidor por hora; parar no primeiro 429) e LinkedIn (100 por dia): uma ida só.
  for (const [status, erro] of [[500, 'servidor'], [503, 'servidor'], [429, 'limite']]) {
    assert.deepEqual(await rodar('google', 'https://analyticsdata.googleapis.com/v1beta/properties/1:runReport', status), { idas: 1, esperas: [], erro }, `ga4 ${status}`);
    assert.deepEqual(await rodar('linkedin', 'https://api.linkedin.com/rest/organizationalEntityShareStatistics', status), { idas: 1, esperas: [], erro }, `linkedin ${status}`);
  }
  // Os outros do Google continuam repetindo.
  assert.equal((await rodar('google', 'https://searchconsole.googleapis.com/webmasters/v3/x', 503)).idas, 3);
});

// ---------------------------------------------------- regras sem servidor --

test('o caso ruim (junção): coleta que falhou inteira não apaga nada; coleta toda ok troca tudo', () => {
  const ant = { conta: 'X', partes: { a: { estado: 'ok', coletado_em: 'T0' } }, dados: { a: { n: 1 }, resumo: { velho: true } }, ultima_boa_em: 'T0' };
  const falhou = juntarRetrato(ant, { estado: 'erro', conta: null, partes: {}, dados: {}, avisos: ['x'] }, 'T1');
  assert.deepEqual(falhou.dados, ant.dados);
  assert.deepEqual(falhou.partes, ant.partes);
  assert.equal(falhou.ultima_boa_em, 'T0');
  assert.equal(falhou.conta, 'X');
  const ok = juntarRetrato(ant, { estado: 'ok', conta: 'Y', partes: { a: { estado: 'ok' } }, dados: { a: { n: 2 } }, avisos: [] }, 'T1');
  assert.deepEqual(ok.dados, { a: { n: 2 } }, 'tudo ok: o retrato novo manda sozinho');
  assert.equal(ok.partes.a.coletado_em, 'T1');
  const parcial = juntarRetrato({ partes: { a: { estado: 'ok', coletado_em: 'T0' } }, dados: { a: { n: 1, lista: [1] } } }, { estado: 'parcial', partes: { a: { estado: 'parcial' } }, dados: { a: { n: 3 } }, avisos: [] }, 'T1');
  assert.deepEqual(parcial.dados.a, { n: 3, lista: [1] }, 'parte parcial junta campo a campo');
});

test('o caso ruim (prazo da parte): fonte que só falha não guarda o último retrato para sempre', () => {
  // O token do LinkedIn venceu há mais de um ano e o cron segue rodando e falhando todo dia.
  const ant = {
    conta: 'X', ultima_boa_em: '2025-10-01T09:29:00.000Z',
    partes: { paginas: { estado: 'ok', coletado_em: '2025-10-01T09:29:00.000Z' }, posts: { estado: 'ok', coletado_em: '2025-11-01T09:29:00.000Z' } },
    dados: { paginas: { seguidores: 10 }, posts: { itens: [1] }, conta: { nome: 'X' } },
  };
  const agora = '2026-10-12T09:29:00.000Z';
  const r = juntarRetrato(ant, { estado: 'erro', conta: null, partes: { paginas: { estado: 'erro', motivo: 'reconectar' } }, dados: {}, avisos: [] }, agora);
  assert.equal(r.dados.paginas, undefined, 'parte com a última coleta boa de mais de 1 ano sai');
  assert.equal(r.partes.paginas.coletado_em, null);
  assert.equal(r.partes.paginas.motivo, 'reconectar');
  assert.deepEqual(r.dados.posts, { itens: [1] }, 'a de menos de 1 ano fica');
  assert.equal(r.partes.posts.coletado_em, '2025-11-01T09:29:00.000Z');
  assert.equal(r.dados.conta, undefined, 'dado sem parte vence com a última coleta boa da fonte');
  // Dado novo desta execução nunca vence, nem com a parte antiga.
  const r2 = juntarRetrato(ant, { estado: 'parcial', partes: { paginas: { estado: 'parcial' } }, dados: { paginas: { alcance: 3 } }, avisos: [] }, agora);
  assert.deepEqual(r2.dados.paginas, { seguidores: 10, alcance: 3 });
  assert.equal(r2.partes.paginas.coletado_em, agora);
  assert.equal(DIAS_GUARDA_PARTE, 365);
});

test('o caso ruim (faxina): chave secreta, valor de secret, token na URL e chave privada somem; o resto fica', () => {
  const segredos = segredosDosValores([ENV.META_TOKEN, SA_JSON, 'curto']);
  assert.ok(segredos.includes(JSON.parse(SA_JSON).private_key));
  assert.equal(segredos.includes('curto'), false);
  assert.equal(segredos.includes('coletor@projeto-teste.iam.gserviceaccount.com'), false, 'o e-mail da conta de serviço não é segredo');
  const limpo = limparSegredos({
    refresh_token: 'x', Authorization: 'y', ok: 1, lista: [`a ${ENV.META_TOKEN} b`], url: 'https://x.com/?key=AIzaQQQ&q=1',
    google: 'ya29.a0AfH6SMBfalsoTOKENgoogle', refresh: '1//0gFALSOrefreshTOKENgoogle0123', pin: 'pina_AbCdEfGh0123456789AbCdEfGh0123456',
    slug: 'pinacoteca-do-estado-de-sao-paulo-exposicao', nulo: null, zero: 0, data: new Date('2026-10-11T00:00:00Z'), nan: NaN,
  }, segredos);
  assert.deepEqual(limpo, {
    ok: 1, lista: ['a [oculto] b'], url: 'https://x.com/?key=[oculto]&q=1', google: '[oculto]', refresh: '[oculto]', pin: '[oculto]',
    slug: 'pinacoteca-do-estado-de-sao-paulo-exposicao', nulo: null, zero: 0, data: '2026-10-11T00:00:00.000Z', nan: null,
  });
  // Objeto citado duas vezes (sem ciclo) sai inteiro nas duas; ciclo vira nulo.
  const comum = { n: 1 };
  const ciclo = { comum, outro: comum };
  ciclo.eu = ciclo;
  assert.deepEqual(limparSegredos(ciclo, []), { comum: { n: 1 }, outro: { n: 1 }, eu: null });
});

test('o caso ruim (ponto final): o nome com ponto (ou %2E) sai SEM o ponto, inclusive o que vem do Location; dois pontos é recusado', async () => {
  const regra = regraDeHosts('site', [{ codigo: 'site', url_perfil: 'https://impresilk.com.br' }]);
  // Para o DNS, "www.impresilk.com.br." é o mesmo nome; para quem compara
  // texto, não era: a URL com o ponto passava e saía assim para a rede.
  for (const [entra, sai] of [
    ['https://www.impresilk.com.br./a?b=1', 'https://www.impresilk.com.br/a?b=1'],
    ['https://www.impresilk.com.br%2E/', 'https://www.impresilk.com.br/'],
    ['https://WWW.Impresilk.com.br./', 'https://www.impresilk.com.br/'],
    ['https://graph.facebook.com./v26.0/me', 'https://graph.facebook.com/v26.0/me'],
  ]) assert.equal(conferirUrl(entra, entra.includes('facebook') ? regraDeHosts('meta', []) : regra).toString(), sai, entra);
  for (const ruim of ['https://www.impresilk.com.br../', 'https://impresilk..com.br/', 'https://.impresilk.com.br/']) {
    assert.throws(() => conferirUrl(ruim, regra), (e) => e.codigo === 'url_recusada', ruim);
  }
  assert.equal(hostPublico('impresilk..com.br'), false);
  assert.equal(hostPublico('impresilk.com.br.'), true, 'um ponto final é o mesmo nome');
  // O redirecionamento seguido pela coletora (fetchJson) também sai sem o ponto.
  const pedidos = [];
  const b = criarBuscador({
    fetch: async (url) => {
      pedidos.push(url);
      if (url === 'https://impresilk.com.br/wp-json/') return new Response('', { status: 301, headers: { location: 'https://www.impresilk.com.br./wp-json/' } });
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    regra, prazo: () => 100_000,
  });
  assert.deepEqual(await b.fetchJson('https://impresilk.com.br/wp-json/'), { ok: true });
  assert.deepEqual(pedidos, ['https://impresilk.com.br/wp-json/', 'https://www.impresilk.com.br/wp-json/']);
  // E o fetch cru também.
  await b.fetch('https://www.impresilk.com.br%2E/x');
  assert.equal(pedidos.at(-1), 'https://www.impresilk.com.br/x');
});

test('o caso ruim (motivo): o código técnico da parte passa pela coletora em "codigo"; código torto não passa', () => {
  const r = normalizarResultado({ estado: 'parcial', partes: {
    a: { estado: 'erro', motivo: 'A Meta pediu calma.', codigo: 'limite_de_chamadas', coletado_em: '2026-10-11T09:05:00.000Z' },
    b: { estado: 'erro', motivo: 'Frase.', codigo: 'Não é código <script>' },
    c: { estado: 'ok' },
  } });
  assert.deepEqual(r.partes.a, { estado: 'erro', motivo: 'A Meta pediu calma.', coletado_em: '2026-10-11T09:05:00.000Z', codigo: 'limite_de_chamadas' });
  assert.equal('codigo' in r.partes.b, false);
  assert.deepEqual(r.partes.c, { estado: 'ok', motivo: null, coletado_em: null });
  // Na junção com o retrato anterior, o código acompanha a parte nova.
  const j = juntarRetrato({ partes: { a: { estado: 'ok', coletado_em: 'T0' } }, dados: { a: { n: 1 } } }, r, 'T1');
  assert.deepEqual([j.partes.a.codigo, j.partes.a.coletado_em, j.partes.a.tentado_em], ['limite_de_chamadas', 'T0', 'T1']);
  assert.equal('codigo' in j.partes.c, false, 'parte sem código fica com o formato de sempre');
});

test('o caso ruim (regras): IP disfarçado não é host público; semana fora da segunda não entra; diário guarda 20 por fonte', () => {
  for (const h of ['127.0.0.1', '10.0.0.1', '2130706433', '0x7f.0.0.1', 'localhost', 'intranet.local', 'meu.internal', '[::1]', 'sem-ponto']) assert.equal(hostPublico(h), false, h);
  for (const h of ['impresilk.com.br', 'www.impresilk.com.br', 'api.pinterest.com']) assert.equal(hostPublico(h), true, h);
  assert.deepEqual(prepararSemanas([{ canal: 'site', semana: '2026-10-04', numeros: { alcance: 1 } }]).linhas, [], 'domingo não é semana');
  let d = null;
  for (let i = 0; i < 25; i++) d = anotarDiario(d, { id: `s${i}`, fonte: 'site', inicio: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), estado: 'ok' });
  d = anotarDiario(d, { id: 'g1', fonte: 'google', inicio: '2026-09-01T00:00:00.000Z', estado: 'ok' });
  assert.equal(d.execucoes.filter((e) => e.fonte === 'site').length, 20);
  assert.equal(d.execucoes[0].id, 's24', 'a mais nova primeiro');
  assert.equal(d.execucoes.some((e) => e.id === 'g1'), true, 'a outra fonte não perde as dela');
});

// ---------------------------------------------- a porta: painel-marketing --

const ANA = { sub: 'ana', perms: ['marketing'] }, BIA = { sub: 'bia', perms: ['marketing'] }, GIL = { sub: 'gil', perms: ['marketing'] }, LEO = { sub: 'leo', master: true };

function porta({ env = ENV, cache = {}, conexoes = {}, rede = async () => resposta({ ok: true, fonte: 'x', estado: 'ok' }), infoErro = null, rpcErro = {}, b: bDeFora = null } = {}) {
  let handler, sessao = ANA;
  const tabelas = {
    acesso_conta: [{ id: 'c-ana', usuario: 'ana', id_pessoa: '123456' }, { id: 'c-bia', usuario: 'bia', id_pessoa: '222222' }, { id: 'c-gil', usuario: 'gil', id_pessoa: '555555' }, { id: 'c-leo', usuario: 'leo', id_pessoa: '999999' }],
    acesso_papel: [],
    painel_mkt_papeis: [{ id_pessoa: '222222', papel: 'visualizacao' }, { id_pessoa: '555555', papel: 'gestao' }],
  };
  // Com `b`, a porta divide o banco com uma coletora (o Desconectar no meio
  // de uma coleta).
  const b = bDeFora ?? banco({ cache, conexoes, rpcErro: { ...rpcErro, ...(infoErro ? { painel_mkt_conexao_info: infoErro } : {}) } });
  const sb = {
    from(t) {
      if (t === 'painel_cache') return b.sb.from(t);
      let linhas = (tabelas[t] || []).map(clone);
      const q = {
        select: () => q, eq: (k, v) => { linhas = linhas.filter((x) => x[k] === v); return q; }, in: (k, vs) => { linhas = linhas.filter((x) => vs.includes(x[k])); return q; },
        maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }), then: (ok, erro) => Promise.resolve({ data: linhas, error: null }).then(ok, erro),
      };
      return q;
    },
    rpc: (n, p) => b.sb.rpc(n, p),
  };
  const pedidos = [];
  const fetch = async (url, init = {}) => {
    pedidos.push({ url: String(url), headers: { ...(init.headers || {}) }, corpo: init.body ? String(init.body) : null });
    return rede(String(url), init);
  };
  vm.runInNewContext(codigoMarketing, { ...globais, setTimeout, clearTimeout, createClient: () => sb, verificarJwt: async () => sessao, crachaRevogado: async () => false, Deno: { env: { get: (n) => env[n] }, serve: (fn) => { handler = fn; } }, fetch });
  return {
    db: b.db, pedidos,
    sessao: (s) => { sessao = s; },
    async call(corpo) {
      const r = await handler(new Request('http://local', { method: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(corpo) }));
      const texto = await r.text();
      return { status: r.status, texto, ...JSON.parse(texto) };
    },
  };
}

test('o caso ruim: "fontes" não leva token nem segredo, nem quando o cofre devolve token junto; todos os papéis veem', async () => {
  const conexoes = {
    google: { access_token: 'ya29.VAZOUfalso0123456789', refresh_token: '1//VAZOUfalso0123456789abcdef', conectado_em: '2026-10-01T12:00:00.000Z', conectado_por: 'gil', conta: 'Impresilk GA4', escopos: [G('analytics.readonly')], expira_em: '2026-10-11T13:00:00.000Z', client_secret: 'VAZOU' },
  };
  const cache = {
    mkt_fonte_google: { estado: 'parcial', conta: 'Impresilk GA4', partes: { ga4: { estado: 'ok', coletado_em: '2026-10-11T09:05:00.000Z' }, perfil: { estado: 'aguardando_aprovacao', motivo: 'Aguardando o Google.', coletado_em: null } }, dados: { ga4: { usuarios: 120 } }, avisos: ['O Perfil aguarda aprovação.'], coletado_em: '2026-10-11T09:05:00.000Z', ultima_boa_em: '2026-10-11T09:05:00.000Z', secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] },
    mkt_fonte_meta: { estado: 'ok', dados: { seguidores: 10 }, partes: {}, secrets: ['META_TOKEN', 'META_PAGE_ID'] },
    mkt_coleta_diario: { versao: 1, execucoes: [{ id: 'e1', fonte: 'google', inicio: '2026-10-11T09:05:00.000Z', fim: '2026-10-11T09:05:40.000Z', estado: 'parcial', chamadas: 9, log: ['detalhe interno'] }] },
  };
  const env = { ...ENV, PINTEREST_CLIENT_ID: '', PINTEREST_CLIENT_SECRET: '' };
  const t = porta({ env, cache, conexoes });
  for (const s of [BIA, ANA, GIL, LEO]) {
    t.sessao(s);
    const r = await t.call({ action: 'fontes' });
    assert.equal(r.status, 200, s.sub);
    assert.deepEqual(vazou(r.texto, ['VAZOU']), [], s.sub);
  }
  const r = await t.call({ action: 'fontes' });
  assert.deepEqual(r.ordem, [...FONTES]);
  const g = r.fontes.google;
  assert.equal(g.estado, 'parcial');
  assert.equal(g.configurado, true);
  assert.deepEqual(Object.keys(g.conexao).sort(), ['conectadoEm', 'conectadoPor', 'conta', 'escopos', 'expiraEm', 'refreshExpiraEm']);
  assert.equal(g.conexao.conta, 'Impresilk GA4');
  assert.deepEqual(g.dados, { ga4: { usuarios: 120 } });
  assert.equal(g.partes.perfil.estado, 'aguardando_aprovacao');
  assert.deepEqual(g.ultimas, [{ inicio: '2026-10-11T09:05:00.000Z', fim: '2026-10-11T09:05:40.000Z', estado: 'parcial', chamadas: 9, erro: null }]);
  assert.equal(r.texto.includes('detalhe interno'), false, 'o log do diário não vai para a tela');
  // A verdade de agora manda no estado: sem conexão, sem app.
  assert.equal(r.fontes.linkedin.estado, 'falta_conectar');
  assert.equal(r.fontes.linkedin.conexao, null);
  assert.equal(r.fontes.pinterest.estado, 'falta_configurar');
  assert.equal(r.fontes.pinterest.configurado, false);
  // Os nomes de secret que o conector declarou valem mais que a lista padrão.
  assert.equal(r.fontes.meta.configurado, false, 'META_PAGE_ID não existe no servidor');
  assert.equal(r.fontes.meta.conexao, null, 'Meta não é OAuth');
  // Nunca coletada: estado nulo, e não zero nem "ok".
  assert.equal(r.fontes.site.estado, null);
  assert.equal(r.fontes.site.coletadoEm, null);
  assert.equal(t.db.upserts.length, 0, 'ler não grava');
});

test('fontes: cofre fora do ar não apaga a tela; as fontes saem sem conexão e com aviso', async () => {
  const t = porta({ cache: { mkt_fonte_linkedin: { estado: 'ok', dados: { seguidores: 3 }, partes: {} } }, infoErro: { code: 'XX000', message: 'vault caiu' } });
  const r = await t.call({ action: 'fontes' });
  assert.equal(r.status, 200);
  assert.equal(r.fontes.linkedin.estado, 'ok', 'sem saber da conexão, não diz que falta conectar');
  assert.deepEqual(r.fontes.linkedin.dados, { seguidores: 3 });
  assert.match(r.avisos[0], /conexões/);
  assert.equal(r.texto.includes('vault caiu'), false);
});

// A leitura leve e por fonte (11/10/2026): a faixa da Visão geral e o bloco
// Conexões pedem {leve: true}; a sub-aba Dados pede {fontes: [as do canal]}.
const CACHE_LEVE = {
  mkt_fonte_google: {
    estado: 'parcial', conta: 'Impresilk GA4', avisos: ['O Perfil aguarda aprovação.'], coletado_em: '2026-10-11T09:11:00.000Z', ultima_boa_em: '2026-10-11T09:11:00.000Z',
    partes: { ga4: { estado: 'ok', coletado_em: '2026-10-11T09:11:00.000Z' }, perfil: { estado: 'aguardando_aprovacao', motivo: 'Aguardando o Google.', codigo: 'aguardando', coletado_em: null } },
    dados: { ga4: { usuarios: 797001, paginas: [{ caminho: '/', visualizacoes: 797002 }] } },
  },
  mkt_fonte_google_ads: {
    estado: 'ok', conta: 'Conta Exemplo', avisos: [], coletado_em: '2026-10-11T09:23:00.000Z', ultima_boa_em: '2026-10-11T09:23:00.000Z',
    partes: { leads: { estado: 'ok', coletado_em: '2026-10-11T09:23:00.000Z' } },
    dados: { leads: { total: 1, restrito: { porId: { l1: { nome: 'Fulana de Teste', email: 'fulana@example.com' } } } } },
  },
  mkt_coleta_diario: { versao: 1, execucoes: [{ id: 'e1', fonte: 'google', inicio: '2026-10-11T09:11:00.000Z', fim: '2026-10-11T09:11:40.000Z', estado: 'parcial', chamadas: 9 }] },
};
const CONEXOES_LEVE = { google: { conectado_em: '2026-10-01T12:00:00.000Z', conectado_por: 'gil', conta: 'Impresilk GA4', escopos: [G('analytics.readonly')], expira_em: '2026-10-11T13:00:00.000Z' } };

test('o caso ruim: "fontes" leve não leva "dados" (nem o "restrito") para papel nenhum, e o resto da fonte é o mesmo da leitura cheia', async () => {
  const t = porta({ cache: CACHE_LEVE, conexoes: CONEXOES_LEVE });
  for (const s of [BIA, ANA, GIL, LEO]) {
    t.sessao(s);
    const leve = await t.call({ action: 'fontes', leve: true });
    assert.equal(leve.status, 200, s.sub);
    for (const f of FONTES) assert.equal('dados' in leve.fontes[f], false, `${s.sub} ${f}: a leve não leva a chave "dados", nem vazia`);
    assert.equal(/79700\d|Fulana|fulana@|"restrito"/.test(leve.texto), false, `${s.sub}: número ou dado pessoal na leitura leve`);
    // Tudo o que a faixa e o Conexões usam continua lá, igual ao da cheia.
    const cheia = await t.call({ action: 'fontes' });
    for (const f of FONTES) {
      const { dados, ...semDados } = cheia.fontes[f];
      assert.ok(dados && typeof dados === 'object', `${s.sub} ${f}: a cheia continua com os dados`);
      assert.deepEqual(leve.fontes[f], semDados, `${s.sub} ${f}`);
    }
    assert.deepEqual([leve.papel, leve.ordem, leve.avisos, leve.motivos], [cheia.papel, cheia.ordem, cheia.avisos, cheia.motivos], s.sub);
  }
  const g = (await t.call({ action: 'fontes', leve: true })).fontes.google;
  assert.deepEqual([g.estado, g.conta, g.partes.perfil.estado, g.partes.perfil.codigo, g.avisos, g.coletadoEm, g.configurado], ['parcial', 'Impresilk GA4', 'aguardando_aprovacao', 'aguardando', ['O Perfil aguarda aprovação.'], '2026-10-11T09:11:00.000Z', true]);
  assert.equal(g.conexao.conectadoPor, 'gil');
  assert.equal(g.ultimas[0].chamadas, 9);
  // "leve" que não é true (texto, número) vale como "não mandou": vem cheia.
  for (const leve of ['sim', 1, 'true', null]) assert.ok('dados' in (await t.call({ action: 'fontes', leve })).fontes.google, String(leve));
  assert.equal(t.db.upserts.length, 0, 'ler não grava');
});

test('o caso ruim: "fontes" com a lista traz só as pedidas (desconhecida, torta e repetida são ignoradas), e o "restrito" continua só da gestão', async () => {
  const t = porta({ cache: CACHE_LEVE, conexoes: CONEXOES_LEVE });
  for (const s of [BIA, ANA]) {
    t.sessao(s);
    const r = await t.call({ action: 'fontes', fontes: ['google_ads', 'tiktok', 42, '__proto__', null, { f: 'site' }, 'google', 'google_ads'] });
    assert.equal(r.status, 200, s.sub);
    // Na ordem de FONTES, cada uma uma vez só.
    assert.deepEqual(r.ordem, ['google', 'google_ads'], s.sub);
    assert.deepEqual(Object.keys(r.fontes), ['google', 'google_ads'], s.sub);
    assert.deepEqual(r.fontes.google.dados, CACHE_LEVE.mkt_fonte_google.dados, `${s.sub}: a pedida vem com os dados`);
    assert.equal(/"restrito"|Fulana|fulana@/.test(r.texto), false, `${s.sub}: pedir só a fonte não abre o dado pessoal`);
    assert.deepEqual(r.fontes.google_ads.dados, { leads: { total: 1 } }, s.sub);
  }
  for (const s of [GIL, LEO]) {
    t.sessao(s);
    const r = await t.call({ action: 'fontes', fontes: ['google_ads'] });
    assert.deepEqual(r.ordem, ['google_ads']);
    assert.deepEqual(r.fontes.google_ads.dados.leads.restrito, CACHE_LEVE.mkt_fonte_google_ads.dados.leads.restrito, `${s.sub}: a gestão vê`);
  }
  // As duas juntas: só as pedidas, sem os dados.
  const lf = await t.call({ action: 'fontes', leve: true, fontes: ['google_ads'] });
  assert.deepEqual(Object.keys(lf.fontes), ['google_ads']);
  assert.equal('dados' in lf.fontes.google_ads, false);
  assert.equal(lf.texto.includes('"restrito"'), false, 'nem a gestão recebe o restrito na leve');
  // Lista vazia (ou só de desconhecidas): nenhuma fonte, e nem vai ao banco.
  const rpcsAntes = t.db.rpcs.length;
  for (const fontes of [[], ['tiktok', 'orkut']]) {
    const r = await t.call({ action: 'fontes', fontes });
    assert.deepEqual([r.status, r.ordem, r.fontes, r.avisos], [200, [], {}, []], JSON.stringify(fontes));
    assert.deepEqual(r.motivos, MOTIVOS);
  }
  assert.equal(t.db.rpcs.length, rpcsAntes, 'nem a conexão foi lida');
  // O que não é lista vale como "não mandou": igual a antes (as seis, cheias).
  for (const fontes of ['google', { google: true }, 7, null]) {
    const r = await t.call({ action: 'fontes', fontes });
    assert.deepEqual(r.ordem, [...FONTES], JSON.stringify(fontes));
    assert.ok(FONTES.every((f) => 'dados' in r.fontes[f]), JSON.stringify(fontes));
  }
});

test('o caso ruim: os opcionais saem só com o NOME e se estão cadastrados; nome da casa no cache não vira pergunta', async () => {
  const env = { ...ENV, META_APP_SECRET: 'segredo-do-app-meta-FALSO-0123456789', GOOGLE_ADS_CUSTOMER_ID: '9876543210' };
  const cache = {
    // O que a coletora gravou: os nomes que o conector declarou.
    mkt_fonte_meta: { estado: 'ok', partes: {}, dados: {}, secrets: ['META_TOKEN'], secretsOpcionais: ['META_APP_SECRET'] },
    // Um nome da casa no cache (conector com defeito): a lista dele inteira
    // é trocada pela padrão, e a tela nunca fica sabendo se o PAINEL_TOKEN existe.
    mkt_fonte_google_ads: { estado: 'ok', partes: {}, dados: {}, secretsOpcionais: ['PAINEL_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'] },
    mkt_fonte_site: { estado: 'ok', partes: {}, dados: {}, secretsOpcionais: ['GOOGLE_API_KEY', 'GOOGLE_API_KEY'] },
  };
  const t = porta({ env, cache });
  for (const leve of [true, false]) {
    const r = await t.call({ action: 'fontes', leve });
    assert.deepEqual(r.fontes.meta.opcionais, [{ nome: 'META_APP_SECRET', cadastrado: true }]);
    assert.deepEqual(r.fontes.google_ads.opcionais, [{ nome: 'GOOGLE_ADS_CUSTOMER_ID', cadastrado: true }, { nome: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', cadastrado: false }]);
    assert.deepEqual(r.fontes.site.opcionais, [{ nome: 'GOOGLE_API_KEY', cadastrado: true }]);
    // Nunca coletada: a lista padrão (que o teste dos conectores confere).
    assert.deepEqual(r.fontes.linkedin.opcionais, []);
    assert.equal(r.texto.includes('PAINEL_TOKEN'), false);
    assert.deepEqual(vazou(r.texto, [env.META_APP_SECRET, env.GOOGLE_ADS_CUSTOMER_ID]), [], 'valor de opcional na tela');
    // Opcional não muda o "configurado" (a fonte funciona sem ele).
    assert.equal(r.fontes.meta.configurado, true);
  }
  assert.deepEqual((await porta({ cache }).call({ action: 'fontes' })).fontes.meta.opcionais, [{ nome: 'META_APP_SECRET', cadastrado: false }]);
  // A coletora grava os NOMES que o conector declarou (sem os da casa), nunca o valor.
  const col = coletora({ env, conectores: { meta: { ...conector('meta', async () => ({ estado: 'ok', conta: 'Página Exemplo', partes: {}, dados: {}, avisos: [] })), SECRETS_OPCIONAIS: ['META_APP_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'] } } });
  assert.equal((await col.post({ action: 'coletar', fonte: 'meta' })).status, 200);
  assert.deepEqual(col.db.cache.get('mkt_fonte_meta').secretsOpcionais, ['META_APP_SECRET']);
  assert.deepEqual(vazou(JSON.stringify([...col.db.cache.values()]), [env.META_APP_SECRET]), []);
});

test('o caso ruim: conectarInicio é só da gestão; fonte fora do OAuth e app sem cadastro são recusados', async () => {
  const t = porta();
  for (const s of [ANA, BIA]) {
    t.sessao(s);
    const r = await t.call({ action: 'conectarInicio', fonte: 'google' });
    assert.equal(r.status, 403, s.sub);
    assert.match(r.erro, /gestão/);
  }
  t.sessao(GIL);
  assert.equal((await t.call({ action: 'conectarInicio', fonte: 'meta' })).status, 422);
  assert.equal((await t.call({ action: 'conectarInicio' })).status, 422);
  const semApp = porta({ env: { ...ENV, GOOGLE_OAUTH_CLIENT_ID: '' } });
  semApp.sessao(LEO);
  const r = await semApp.call({ action: 'conectarInicio', fonte: 'google' });
  assert.equal(r.status, 422);
  assert.equal(r.faltaConfigurar, true);
  assert.match(r.erro, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.deepEqual(vazou(r.texto), []);
});

test('conectarInicio: a URL leva um state que a volta aceita, com a fonte e quem pediu', async () => {
  const t = porta();
  t.sessao(GIL);
  const r = await t.call({ action: 'conectarInicio', fonte: 'google' });
  assert.equal(r.status, 200);
  const u = new URL(r.url);
  assert.equal(u.origin, 'https://accounts.google.com');
  assert.equal(u.searchParams.get('client_id'), ENV.GOOGLE_OAUTH_CLIENT_ID);
  assert.deepEqual(vazou(r.texto), [], 'nem a chave do app nem o segredo do crachá vão na URL');
  const state = await conferirState(u.searchParams.get('state'), ENV.PAINEL_JWT_SECRET);
  assert.equal(state.fonte, 'google');
  assert.equal(state.quem, 'gil');
  t.sessao(LEO);
  const l = await t.call({ action: 'conectarInicio', fonte: 'linkedin' });
  assert.equal((await conferirState(new URL(l.url).searchParams.get('state'), ENV.PAINEL_JWT_SECRET)).quem, 'leo');
});

test('o caso ruim: desconectar é só da gestão; no Google revoga e apaga; LinkedIn só apaga', async () => {
  const conexoes = { google: { access_token: 'ya29.a', refresh_token: '1//refreshPARArevogar0123456789', escopos: [] }, linkedin: { access_token: 'AQV-a', escopos: [] } };
  const t = porta({ conexoes, rede: async () => resposta({}, 200) });
  t.sessao(ANA);
  assert.equal((await t.call({ action: 'desconectar', fonte: 'google' })).status, 403);
  t.sessao(BIA);
  assert.equal((await t.call({ action: 'desconectar', fonte: 'google' })).status, 403);
  assert.deepEqual(rpcs({ db: t.db }), []);
  assert.equal(t.pedidos.length, 0);
  t.sessao(GIL);
  const r = await t.call({ action: 'desconectar', fonte: 'google' });
  assert.equal(r.status, 200);
  assert.equal(r.revogado, true);
  assert.equal(r.aviso, AVISO_DESCONECTAR_GOOGLE);
  assert.equal(t.pedidos[0].url, 'https://oauth2.googleapis.com/revoke');
  assert.equal(t.pedidos[0].corpo, 'token=1%2F%2FrefreshPARArevogar0123456789');
  assert.deepEqual(rpcs({ db: t.db }), ['painel_mkt_conexao_ler', 'painel_mkt_conexao_apagar']);
  assert.equal('google' in t.db.conexoes, false);
  assert.equal(r.texto.includes('refreshPARArevogar'), false);
  const l = await t.call({ action: 'desconectar', fonte: 'linkedin' });
  assert.equal(l.revogado, null);
  assert.equal(t.pedidos.length, 1, 'LinkedIn não tem revogação por API');
  assert.equal('linkedin' in t.db.conexoes, false);
  // Cofre ilegível não tranca o Desconectar: não revoga (não há o quê) e apaga.
  const ilegivel = porta({ conexoes, rpcErro: { painel_mkt_conexao_ler: { code: 'XX001', message: 'A conexão guardada de google está ilegível no cofre' } } });
  ilegivel.sessao(LEO);
  const il = await ilegivel.call({ action: 'desconectar', fonte: 'google' });
  assert.equal(il.status, 200);
  assert.equal(il.revogado, false);
  assert.equal('google' in ilegivel.db.conexoes, false);
  assert.equal(ilegivel.pedidos.length, 0);
  // Google que não confirma a revogação: apaga do Painel e avisa o caminho.
  const falha = porta({ conexoes, rede: async () => resposta({ error: 'invalid_token' }, 400) });
  falha.sessao(LEO);
  const f = await falha.call({ action: 'desconectar', fonte: 'google' });
  assert.equal(f.revogado, false);
  assert.match(f.aviso, /não confirmou/);
  assert.equal('google' in falha.db.conexoes, false);
});

test('o caso ruim: coletarAgora não é da visualização, e a trava de 2 minutos vale por fonte, para todo mundo', async () => {
  const t = porta({ rede: async () => resposta({ ok: true, fonte: 'google', estado: 'ok', coletadoEm: '2026-10-11T12:00:00.000Z' }) });
  t.sessao(BIA);
  assert.equal((await t.call({ action: 'coletarAgora', fonte: 'google' })).status, 403);
  assert.equal(t.pedidos.length, 0);
  assert.equal(t.db.upserts.length, 0);
  t.sessao(ANA);
  assert.equal((await t.call({ action: 'coletarAgora', fonte: 'tiktok' })).status, 422);
  const r = await t.call({ action: 'coletarAgora', fonte: 'google' });
  assert.equal(r.status, 200);
  assert.equal(r.andando, false);
  assert.equal(r.fonte.fonte, 'google');
  // O pedido à coletora: o endereço do projeto, o token de máquina no
  // cabeçalho (e só lá), quem pediu e a espera curta.
  const p = t.pedidos[0];
  assert.equal(p.url, 'https://exemplo.supabase.co/functions/v1/painel-mkt-fontes');
  assert.equal(p.headers['x-token'], ENV.PAINEL_TOKEN);
  assert.deepEqual(JSON.parse(p.corpo), { action: 'coletar', fonte: 'google', quem: 'ana', esperarMs: 22000 });
  assert.deepEqual(vazou(r.texto), [], 'o token de máquina não volta para a tela');
  // De novo logo em seguida: travado, para a Ana e para a gestão.
  const de_novo = await t.call({ action: 'coletarAgora', fonte: 'google' });
  assert.equal(de_novo.status, 429);
  assert.ok(de_novo.aguardarSegundos > 100 && de_novo.aguardarSegundos <= 120);
  t.sessao(GIL);
  assert.equal((await t.call({ action: 'coletarAgora', fonte: 'google' })).status, 429);
  assert.equal(t.pedidos.length, 1, 'travado não chama a coletora');
  // Outra fonte não espera.
  assert.equal((await t.call({ action: 'coletarAgora', fonte: 'site' })).status, 200);
  // Passados os 2 minutos, libera.
  const pedidos = t.db.cache.get('mkt_coleta_pedidos');
  pedidos.google.em = new Date(Date.now() - TRAVA_COLETA_MS - 1000).toISOString();
  t.db.cache.set('mkt_coleta_pedidos', pedidos);
  assert.equal((await t.call({ action: 'coletarAgora', fonte: 'google' })).status, 200);
  assert.equal(t.pedidos.length, 3);
});

test('coletarAgora: coletora lenta devolve "andando"; coletora que recusa vira 502 sem o texto dela; sem PAINEL_TOKEN, 503', async () => {
  const lenta = porta({ rede: async () => resposta({ ok: true, fonte: 'site', andando: true }) });
  assert.deepEqual((await lenta.call({ action: 'coletarAgora', fonte: 'site' })).andando, true);
  const estourou = porta({ rede: async () => { throw new DOMException('passou do tempo', 'TimeoutError'); } });
  const e = await estourou.call({ action: 'coletarAgora', fonte: 'site' });
  assert.equal(e.status, 200);
  assert.equal(e.andando, true);
  const recusa = porta({ rede: async () => resposta({ erro: 'nao autorizado com detalhe interno' }, 401) });
  const r = await recusa.call({ action: 'coletarAgora', fonte: 'site' });
  assert.equal(r.status, 502);
  assert.equal(r.texto.includes('detalhe interno'), false);
  const semToken = porta({ env: { ...ENV, PAINEL_TOKEN: '' } });
  assert.equal((await semToken.call({ action: 'coletarAgora', fonte: 'site' })).status, 503);
  assert.equal(semToken.pedidos.length, 0);
});


test('o caso ruim: cinco "Atualizar agora" ao mesmo tempo viram UMA coleta; e o pedido de outra fonte feito junto não some', async () => {
  const t = porta({ rede: async () => resposta({ ok: true, fonte: 'linkedin', estado: 'ok' }) });
  t.sessao(ANA);
  const rs = await Promise.all(Array.from({ length: 5 }, () => t.call({ action: 'coletarAgora', fonte: 'linkedin' })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 429, 429, 429, 429]);
  assert.equal(t.pedidos.length, 1, 'a coletora foi chamada mais de uma vez');
  // Duas fontes ao mesmo tempo: as duas passam, e as duas ficam marcadas.
  const t2 = porta({ rede: async () => resposta({ ok: true, fonte: 'x', estado: 'ok' }) });
  const [a, b] = await Promise.all([t2.call({ action: 'coletarAgora', fonte: 'site' }), t2.call({ action: 'coletarAgora', fonte: 'pinterest' })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(Object.keys(t2.db.cache.get('mkt_coleta_pedidos')).sort(), ['pinterest', 'site']);
  assert.equal((await t2.call({ action: 'coletarAgora', fonte: 'site' })).status, 429);
  assert.equal((await t2.call({ action: 'coletarAgora', fonte: 'pinterest' })).status, 429);
  assert.equal(t2.db.upserts.some((u) => u.chave === 'mkt_coleta_pedidos'), false, 'a trava só é gravada pelo banco, num passo');
});

test('conectarInicio guarda o pedido no servidor (o nonce e, no Google, o verificador do PKCE) e manda só o desafio na URL', async () => {
  const t = porta();
  t.sessao(GIL);
  const r = await t.call({ action: 'conectarInicio', fonte: 'google' });
  const u = new URL(r.url);
  const st = await conferirState(u.searchParams.get('state'), ENV.PAINEL_JWT_SECRET);
  const pedido = t.db.pedidosOauth.get(st.n);
  assert.deepEqual([pedido.fonte, pedido.quem], ['google', 'gil']);
  assert.match(pedido.verificador, /^[A-Za-z0-9_-]{43}$/);
  const desafio = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pedido.verificador))).toString('base64url');
  assert.equal(u.searchParams.get('code_challenge'), desafio);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(r.texto.includes(pedido.verificador), false, 'o verificador nunca sai do servidor');
  const pedidoRpc = t.db.rpcs.find((x) => x.n === 'painel_mkt_conexao_pedido').p;
  assert.equal(pedidoRpc.p_validade_s, 600);
  // LinkedIn: sem PKCE (a pesquisa não confirma), mas com o nonce guardado.
  const l = await t.call({ action: 'conectarInicio', fonte: 'linkedin' });
  const ul = new URL(l.url);
  assert.equal(ul.searchParams.get('code_challenge'), null);
  const sl = await conferirState(ul.searchParams.get('state'), ENV.PAINEL_JWT_SECRET);
  assert.deepEqual(t.db.pedidosOauth.get(sl.n), { fonte: 'linkedin', quem: 'gil', verificador: null });
  assert.notEqual(sl.n, st.n);
});

test('o caso ruim: o código técnico da parte chega à tela só no formato [a-z0-9_]; o resto vira nulo, e a frase continua em motivo', async () => {
  const cache = { mkt_fonte_meta: { estado: 'parcial', dados: {}, partes: {
    pagina: { estado: 'erro', motivo: 'A Meta pediu calma.', codigo: 'limite_de_chamadas' },
    instagram: { estado: 'erro', motivo: 'Frase.', codigo: 'Não é código <script>' },
    anuncios: { estado: 'ok' },
  } } };
  const t = porta({ cache });
  const p = (await t.call({ action: 'fontes' })).fontes.meta.partes;
  assert.deepEqual([p.pagina.codigo, p.instagram.codigo, p.anuncios.codigo], ['limite_de_chamadas', null, null]);
  assert.deepEqual([p.pagina.motivo, p.instagram.motivo], ['A Meta pediu calma.', 'Frase.']);
});

// ------------------------------------------- a confirmação da conexão --
// A volta do provedor (painel-mkt-oauth) deixa a conexão PENDENTE; só o
// crachá de quem clicou em Conectar a leva para o cofre (conectarConfirmar).

/** A volta do provedor de verdade, no banco de mentira `b`, com o provedor
 *  de mentira `rede` (a troca do code). */
function voltaDoProvedor({ b, rede, env = ENV }) {
  let handler;
  vm.runInNewContext(codigoVolta, { ...globais, createClient: () => b.sb, Deno: { env: { get: (n) => env[n] }, serve: (fn) => { handler = fn; } }, fetch: async (url, init = {}) => rede(String(url), init) });
  return {
    async get(query) {
      const r = await handler(new Request(`https://exemplo.supabase.co/functions/v1/painel-mkt-oauth?${query}`));
      return { status: r.status, local: r.headers.get('location') };
    },
  };
}
const NONCE_T = 'nonce-de-teste-0123456789';
const PENDENTE_T = { access_token: 'ya29.pendenteFALSO0123456789', refresh_token: '1//refreshPENDENTEfalso0123456789', expira_em: '2026-10-12T10:00:00.000Z', escopos: ['user_accounts:read'], conectado_por: 'gil', conectado_em: '2026-10-12T09:00:00.000Z' };

test('o caso ruim: conectarConfirmar é só da gestão; fonte fora do OAuth é 422; nonce torto é 404 pedido_vencido sem ir ao banco', async () => {
  const t = porta();
  for (const s of [ANA, BIA]) {
    t.sessao(s);
    const r = await t.call({ action: 'conectarConfirmar', fonte: 'google', nonce: NONCE_T });
    assert.equal(r.status, 403, s.sub);
    assert.match(r.erro, /gestão/);
  }
  t.sessao(GIL);
  assert.equal((await t.call({ action: 'conectarConfirmar', fonte: 'meta', nonce: NONCE_T })).status, 422);
  assert.equal((await t.call({ action: 'conectarConfirmar', nonce: NONCE_T })).status, 422);
  for (const ruim of [undefined, '', 'curto', 'x'.repeat(65), 'com espaço 0123456789', 42]) {
    const r = await t.call({ action: 'conectarConfirmar', fonte: 'google', nonce: ruim });
    assert.deepEqual([r.status, r.motivo, r.erro], [404, 'pedido_vencido', MOTIVOS.pedido_vencido], String(ruim));
  }
  assert.deepEqual(rpcs({ db: t.db }), [], 'nada foi ao banco');
});

test('o caso ruim: quem tem só a URL do Léo completa o consentimento, mas a conta dele nunca chega ao cofre nem à coleta; o Léo clica de novo e conecta a dele', async () => {
  const b = banco();
  const tela = porta({ b });
  // O provedor de mentira troca o code pela conta de quem autorizou, como o
  // real faz com quem abrir a URL.
  const donos = { 'CODE-DA-OUTRA-PESSOA': 'OUTRA', 'CODE-DO-LEO': 'LEO' };
  const volta = voltaDoProvedor({ b, rede: async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    const dono = donos[new URLSearchParams(String(init.body)).get('code')];
    return resposta({ access_token: `ya29.${dono}FALSO0123456789`, refresh_token: `1//refresh${dono}FALSO0123456789`, expires_in: 3599, scope: PROVEDORES.google.escopos.join(' ') });
  } });
  tela.sessao(LEO);
  const ini = await tela.call({ action: 'conectarInicio', fonte: 'google' });
  const state = new URL(ini.url).searchParams.get('state');
  const n = (await conferirState(state, ENV.PAINEL_JWT_SECRET)).n;
  assert.equal(ini.nonce, n, 'a tela recebe o nonce do clique, para conferir a volta');
  // Outra pessoa abre a MESMA URL antes do Léo e autoriza com a conta dela.
  const r1 = await volta.get(`code=CODE-DA-OUTRA-PESSOA&state=${encodeURIComponent(state)}`);
  assert.equal(new URL(r1.local).searchParams.get('confirmar'), n);
  assert.equal('google' in b.db.conexoes, false, 'nada no cofre sem a confirmação');
  assert.equal(b.db.pendentes.google.quem, 'leo', 'a pendente fica amarrada a quem clicou');
  // O navegador dela, com o crachá de outra pessoa da gestão, não confirma.
  tela.sessao(GIL);
  const outra = await tela.call({ action: 'conectarConfirmar', fonte: 'google', nonce: n });
  assert.deepEqual([outra.status, outra.motivo, outra.erro], [403, 'outra_pessoa', MOTIVOS.outra_pessoa]);
  assert.equal('google' in b.db.conexoes, false);
  // A coleta não vê conexão nenhuma: o conector nem roda.
  let rodou = 0;
  const col = coletora({ b, conectores: { google: conector('google', async () => { rodou++; return { estado: 'ok', partes: {}, dados: {} }; }) } });
  assert.equal((await col.post({ action: 'coletar', fonte: 'google' })).corpo.estado, 'falta_conectar');
  assert.equal(rodou, 0);
  // A volta do Léo com o mesmo state: já usado.
  assert.equal(new URL((await volta.get(`code=CODE-DO-LEO&state=${encodeURIComponent(state)}`)).local).searchParams.get('motivo'), 'state_invalido');
  // O Léo clica de novo: a pendente da outra conta sai, e a dele entra pela confirmação.
  tela.sessao(LEO);
  const ini2 = await tela.call({ action: 'conectarInicio', fonte: 'google' });
  assert.equal('google' in b.db.pendentes, false, 'o clique novo derrubou a pendente da outra conta');
  const r2 = await volta.get(`code=CODE-DO-LEO&state=${encodeURIComponent(new URL(ini2.url).searchParams.get('state'))}`);
  const n2 = new URL(r2.local).searchParams.get('confirmar');
  assert.equal(n2, ini2.nonce);
  const ok = await tela.call({ action: 'conectarConfirmar', fonte: 'google', nonce: n2 });
  assert.equal(ok.status, 200);
  assert.equal(ok.ok, true);
  assert.equal(ok.fonte.conexao.conectadoPor, 'leo');
  assert.equal(b.db.conexoes.google.refresh_token, '1//refreshLEOFALSO0123456789');
  assert.deepEqual(vazou(ok.texto, ['refreshLEO', 'ya29.LEO', 'refreshOUTRA']), []);
  // Uso único.
  const de_novo = await tela.call({ action: 'conectarConfirmar', fonte: 'google', nonce: n2 });
  assert.deepEqual([de_novo.status, de_novo.motivo], [404, 'pedido_vencido']);
});

test('o caso ruim: confirmação vencida é 404 pedido_vencido; outra pessoa é 403 e a pendente fica para quem clicou; a boa devolve a fonte no formato da ação fontes, sem token', async () => {
  const b = banco();
  const t = porta({ b });
  t.sessao(GIL);
  // Vencida: passou dos 10 minutos.
  b.db.pendentes.linkedin = { nonce: NONCE_T, quem: 'gil', exp: Date.now() - 1, conexao: clone(PENDENTE_T) };
  const v = await t.call({ action: 'conectarConfirmar', fonte: 'linkedin', nonce: NONCE_T });
  assert.deepEqual([v.status, v.motivo, v.erro], [404, 'pedido_vencido', MOTIVOS.pedido_vencido]);
  assert.equal('linkedin' in b.db.conexoes, false);
  // De outra pessoa: recusa, e a pendente continua para quem clicou.
  b.db.pendentes.pinterest = { nonce: NONCE_T, quem: 'gil', exp: Date.now() + 600_000, conexao: clone(PENDENTE_T) };
  t.sessao(LEO);
  const o = await t.call({ action: 'conectarConfirmar', fonte: 'pinterest', nonce: NONCE_T });
  assert.deepEqual([o.status, o.motivo], [403, 'outra_pessoa']);
  assert.ok(b.db.pendentes.pinterest);
  t.sessao(GIL);
  const ok = await t.call({ action: 'conectarConfirmar', fonte: 'pinterest', nonce: NONCE_T });
  assert.equal(ok.status, 200);
  const daLista = (await t.call({ action: 'fontes' })).fontes.pinterest;
  assert.deepEqual(Object.keys(ok.fonte).sort(), Object.keys(daLista).sort(), 'o mesmo formato de uma fonte da ação "fontes"');
  assert.equal(ok.fonte.conexao.conectadoPor, 'gil');
  assert.deepEqual(vazou(ok.texto, [PENDENTE_T.access_token, PENDENTE_T.refresh_token]), []);
  // Quem confirma é sempre o crachá: o corpo não escolhe o "quem".
  await t.call({ action: 'conectarConfirmar', fonte: 'google', nonce: NONCE_T, quem: 'leo' });
  assert.equal(b.db.rpcs.at(-1).p.p_quem, 'gil');
});

test('o caso ruim: Desconectar o LinkedIn leva junto o retrato do cache, e os números dos posts não ficam para sempre; o retrato do Google fica', async () => {
  const T0 = '2026-09-01T09:29:00.000Z';
  const retratoLi = {
    estado: 'ok', conta: 'Empresa Exemplo', avisos: [], coletado_em: T0, ultima_boa_em: T0,
    partes: { posts: { estado: 'ok', coletado_em: T0 }, conteudo: { estado: 'ok', coletado_em: T0 } },
    dados: { posts: { itens: [{ url: 'https://www.linkedin.com/feed/update/1', impressoes: 797001, alcance: 797002, engajamento: 797003, cliques: 797004 }] }, conteudo: { desde_sempre: { impressoes: 797099 } } },
  };
  const retratoG = { estado: 'ok', conta: 'GA4', partes: {}, dados: { ga4: { usuarios: 120 } }, coletado_em: T0 };
  const conexoes = {
    linkedin: { access_token: 'AQV-FALSO-0123456789', escopos: [], conectado_por: 'gil', conectado_em: '2026-09-01T00:00:00.000Z' },
    google: { access_token: 'ya29.a', refresh_token: '1//refreshPARArevogar0123456789', escopos: [] },
  };
  const b = banco({ cache: { mkt_fonte_linkedin: retratoLi, mkt_fonte_google: retratoG }, conexoes });
  const t = porta({ b, rede: async () => resposta({}, 200) });
  t.sessao(GIL);
  assert.equal((await t.call({ action: 'desconectar', fonte: 'linkedin' })).status, 200);
  assert.equal(b.db.cache.has('mkt_fonte_linkedin'), false);
  // As coletas de todo dia depois do Desconectar ("falta conectar") não trazem nada de volta.
  const col = coletora({ b, conectores: { linkedin: conector('linkedin', async () => { throw new Error('sem conexão o conector não roda'); }) } });
  for (let i = 0; i < 3; i++) assert.equal((await col.post({ action: 'coletar', fonte: 'linkedin' })).corpo.estado, 'falta_conectar');
  const f = (await t.call({ action: 'fontes' })).fontes.linkedin;
  assert.equal(f.estado, 'falta_conectar');
  assert.deepEqual(f.dados, {});
  assert.equal(/79700\d|797099/.test(JSON.stringify([...b.db.cache.values()])), false);
  // O Google desconectado fica com o último retrato (não há regra de guarda que mande apagar).
  assert.equal((await t.call({ action: 'desconectar', fonte: 'google' })).status, 200);
  assert.deepEqual(b.db.cache.get('mkt_fonte_google').dados, retratoG.dados);
  assert.deepEqual(b.db.apagados, ['mkt_fonte_linkedin']);
  // Cache que não deixa apagar: a conexão sai assim mesmo, e a tela é avisada.
  const bf = banco({ cache: { mkt_fonte_linkedin: retratoLi }, conexoes, cacheErro: { code: 'XX000', message: 'cache caiu' } });
  const tf = porta({ b: bf });
  tf.sessao(GIL);
  const r = await tf.call({ action: 'desconectar', fonte: 'linkedin' });
  assert.equal(r.status, 200);
  assert.equal('linkedin' in bf.db.conexoes, false);
  assert.match(r.aviso, /não saíram/);
  assert.equal(r.texto.includes('cache caiu'), false);
});

test('o caso ruim (revisão de 12/10): secret cadastrado depois da coleta não fica "Falta configurar" com o aviso velho até a próxima coleta', async () => {
  // A coleta das 6h rodou SEM o META_TOKEN (o conector parou na porta); o
  // Léo cadastrou o secret às 9h. A porta lê o retrato da manhã com o secret
  // já existindo.
  const parado = { estado: 'falta_configurar', partes: { pagina: { estado: 'falta_configurar', motivo: 'Falta cadastrar o secret META_TOKEN no Supabase.', codigo: 'sem_token' } }, dados: {},
    avisos: ['Falta cadastrar o secret META_TOKEN no Supabase (o token do usuário do sistema da Meta).'] };
  const b = banco();
  const col = coletora({ b, env: { ...ENV, META_TOKEN: '' }, conectores: { meta: conector('meta', async (ctx) => (ctx.env('META_TOKEN') ? { estado: 'ok', partes: {}, dados: {} } : parado)) } });
  assert.equal((await col.post({ action: 'coletar', fonte: 'meta' })).corpo.estado, 'falta_configurar');
  const retrato = b.db.cache.get('mkt_fonte_meta');
  // A coletora anota os NOMES do que faltava (nunca valor) e o começo da execução.
  assert.deepEqual(retrato.faltavam, ['META_TOKEN']);
  assert.deepEqual(retrato.opcionaisFaltavam, []);
  assert.equal(retrato.iniciado_em, diario({ db: b.db })[0].inicio);
  assert.ok(Date.parse(retrato.iniciado_em) <= Date.parse(retrato.coletado_em));
  const t = porta({ b });
  t.sessao(GIL);
  const m = (await t.call({ action: 'fontes', leve: true })).fontes.meta;
  assert.equal(m.configurado, true);
  assert.equal(m.estado, 'aguardando_coleta', 'nem "Falta configurar" (o secret existe) nem "ok" (ainda não coletou)');
  assert.deepEqual(m.avisos, [], 'o aviso da falta saiu');
  assert.deepEqual([m.partes.pagina.estado, m.partes.pagina.motivo, m.partes.pagina.codigo], ['aguardando_coleta', null, null]);
  assert.equal(m.iniciadoEm, retrato.iniciado_em);
  // Sem o secret, continua "Falta configurar" (é a verdade de agora).
  const sem = porta({ b, env: { ...ENV, META_TOKEN: '' } });
  sem.sessao(GIL);
  assert.equal((await sem.call({ action: 'fontes', leve: true })).fontes.meta.estado, 'falta_configurar');
  // Falta de configuração com o secret PRESENTE na coleta (o JSON da conta
  // de serviço torto) não é velha: fica "Falta configurar", com o aviso.
  const torto = { estado: 'falta_configurar', partes: { conta: { estado: 'falta_configurar', motivo: 'O GOOGLE_ADS_SA_JSON não é o arquivo JSON de uma conta de serviço.', codigo: 'json_invalido' } }, dados: {}, avisos: ['Confira o arquivo.'] };
  const colAds = coletora({ b, conectores: { google_ads: conector('google_ads', async () => torto) } });
  await colAds.post({ action: 'coletar', fonte: 'google_ads' });
  assert.deepEqual(b.db.cache.get('mkt_fonte_google_ads').faltavam, []);
  const ads = (await t.call({ action: 'fontes', leve: true })).fontes.google_ads;
  assert.deepEqual([ads.estado, ads.partes.conta.estado, ads.partes.conta.codigo, ads.avisos], ['falta_configurar', 'falta_configurar', 'json_invalido', ['Confira o arquivo.']]);
});

test('o caso ruim (revisão de 12/10): opcional cadastrado depois da coleta: a parte que ficou sem ele e o aviso da falta saem; o resto fica', async () => {
  const b = banco({ cache: { mkt_fonte_site: {
    estado: 'parcial', coletado_em: '2026-10-11T09:05:00.000Z', ultima_boa_em: '2026-10-11T09:05:00.000Z', faltavam: [], opcionaisFaltavam: ['GOOGLE_API_KEY'],
    partes: { paginas: { estado: 'ok', coletado_em: '2026-10-11T09:05:00.000Z' }, pagespeed: { estado: 'falta_configurar', motivo: 'Falta cadastrar a chave GOOGLE_API_KEY nos Secrets do Supabase.', codigo: 'sem_chave' }, crux: { estado: 'falta_configurar', motivo: 'sem_chave' }, dns: { estado: 'falta_configurar', motivo: 'Outra coisa.', codigo: 'outra' } },
    dados: {}, avisos: ['PageSpeed e CrUX ficam desligados até a chave GOOGLE_API_KEY ser cadastrada nos Secrets do Supabase.', 'Não deu para ler 1 página do site nesta coleta.'],
  } } });
  const t = porta({ b });
  t.sessao(GIL);
  const s = (await t.call({ action: 'fontes', leve: true })).fontes.site;
  assert.equal(s.estado, 'parcial');
  assert.deepEqual(s.avisos, ['Não deu para ler 1 página do site nesta coleta.']);
  assert.deepEqual([s.partes.pagespeed.estado, s.partes.crux.estado], ['aguardando_coleta', 'aguardando_coleta']);
  assert.deepEqual([s.partes.dns.estado, s.partes.dns.codigo], ['falta_configurar', 'outra'], 'parte que falta por outro motivo fica');
  assert.equal(s.partes.paginas.estado, 'ok');
  // Sem a chave agora, nada muda.
  const sem = porta({ b, env: { ...ENV, GOOGLE_API_KEY: '' } });
  sem.sessao(GIL);
  const s2 = (await sem.call({ action: 'fontes', leve: true })).fontes.site;
  assert.equal(s2.partes.pagespeed.estado, 'falta_configurar');
  assert.equal(s2.avisos.length, 2);
});

test('o caso ruim (revisão de 12/10): o erro técnico do diário só vai para a gestão', async () => {
  const cache = {
    mkt_fonte_google: { estado: 'erro', coletado_em: '2026-10-11T09:11:00.000Z', partes: {}, dados: {} },
    mkt_coleta_diario: { versao: 1, execucoes: [{ id: 'e1', fonte: 'google', inicio: '2026-10-11T09:10:00.000Z', fim: '2026-10-11T09:11:00.000Z', estado: 'erro', chamadas: 3, erro: 'ga4 lote: servidor (HTTP 503); semanas não gravadas (banco: 40001)' }] },
  };
  const t = porta({ cache, conexoes: { google: { conectado_em: '2026-10-01T12:00:00.000Z', conectado_por: 'gil', escopos: [] } } });
  for (const [s, esperado] of [[GIL, 'ga4 lote: servidor (HTTP 503); semanas não gravadas (banco: 40001)'], [ANA, null], [BIA, null]]) {
    t.sessao(s);
    const r = await t.call({ action: 'fontes', leve: true });
    assert.equal(r.fontes.google.ultimas[0].erro, esperado, s.sub);
    assert.equal(r.fontes.google.ultimas[0].estado, 'erro', 'o estado da execução vai para todos');
  }
});

test('o caso ruim (revisão de 12/10): cofre ilegível manda conexaoDesconhecida nas fontes por OAuth, para a tela não deduzir "falta conectar"', async () => {
  const cache = { mkt_fonte_google: { estado: 'ok', coletado_em: '2026-10-11T09:11:00.000Z', partes: {}, dados: {} } };
  const t = porta({ cache, infoErro: { code: 'XX000', message: 'vault caiu' } });
  t.sessao(GIL);
  const r = await t.call({ action: 'fontes', leve: true });
  assert.deepEqual([r.fontes.google.conexao, r.fontes.google.conexaoDesconhecida, r.fontes.google.estado], [null, true, 'ok']);
  assert.equal(r.fontes.linkedin.conexaoDesconhecida, true);
  assert.equal(r.fontes.site.conexaoDesconhecida, false, 'fonte sem OAuth não tem conexão a desconhecer');
  // Cofre lido: sem conexão é "falta conectar", e a conexão não é desconhecida.
  const ok = porta({ cache });
  ok.sessao(GIL);
  const g = (await ok.call({ action: 'fontes', leve: true })).fontes.google;
  assert.deepEqual([g.conexaoDesconhecida, g.estado], [false, 'falta_conectar']);
});

test('o caso ruim (revisão de 12/10): o Desconectar do LinkedIn que não apaga o retrato diz retratoFicou; o que apaga, não', async () => {
  const retratoLi = { estado: 'ok', coletado_em: '2026-09-01T09:29:00.000Z', ultima_boa_em: '2026-09-01T09:29:00.000Z', partes: {}, dados: { posts: { itens: [] } } };
  const conexoes = { linkedin: { access_token: 'AQV-FALSO-0123456789', escopos: [], conectado_por: 'gil', conectado_em: '2026-09-01T00:00:00.000Z' } };
  const bf = banco({ cache: { mkt_fonte_linkedin: retratoLi }, conexoes, cacheErro: { code: 'XX000', message: 'cache caiu' } });
  const tf = porta({ b: bf });
  tf.sessao(GIL);
  const r = await tf.call({ action: 'desconectar', fonte: 'linkedin' });
  assert.deepEqual([r.status, r.retratoFicou], [200, true]);
  const b = banco({ cache: { mkt_fonte_linkedin: retratoLi }, conexoes });
  const t = porta({ b });
  t.sessao(GIL);
  assert.equal((await t.call({ action: 'desconectar', fonte: 'linkedin' })).retratoFicou, false);
});

// ------------------------------------------------- registro e publicação --

test('o registro importa os seis conectores ESTATICAMENTE, na mesma lista de FONTES', () => {
  const texto = readFileSync(new URL('../supabase/functions/_shared/mkt-fontes/registro.mjs', import.meta.url), 'utf8');
  const importados = [...texto.matchAll(/^import \* as (\w+) from '\.\/(\w+)\.mjs';$/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(importados.map(([nome, arquivo]) => (nome === arquivo ? nome : `${nome}!=${arquivo}`)), [...FONTES]);
  assert.equal(/\bimport\s*\(/.test(texto), false, 'nada de import montado na hora: o Supabase não empacota');
  assert.match(texto, new RegExp(`CONECTORES = Object\\.freeze\\(\\{ ${FONTES.join(', ')} \\}\\)`));
});

const CONECTORES_REAIS = FONTES.map((f) => new URL(`../supabase/functions/_shared/mkt-fontes/${f}.mjs`, import.meta.url));
const faltam = CONECTORES_REAIS.filter((u) => !existsSync(u)).map((u) => u.pathname.split('/').pop());
test('os conectores reais seguem a interface, e os SECRETS deles batem com a lista padrão da tela', { skip: faltam.length ? `conectores ainda não escritos: ${faltam.join(', ')}` : false }, async () => {
  const { CONECTORES } = await import('../supabase/functions/_shared/mkt-fontes/registro.mjs');
  for (const f of FONTES) {
    const c = CONECTORES[f];
    assert.equal(c.FONTE, f, f);
    assert.equal(typeof c.coletar, 'function', f);
    assert.ok(Array.isArray(c.SECRETS) && c.SECRETS.every(nomeDeSecretValido), `${f}: SECRETS são nomes válidos e nenhum da casa`);
    // A lista padrão (info.mjs) só vale até a primeira coleta; mesmo assim
    // ela não pode mentir: se divergir, ajuste o SECRETS_PADRAO.
    assert.deepEqual([...c.SECRETS].sort(), [...SECRETS_PADRAO[f]].sort(), `${f}: SECRETS_PADRAO desatualizado`);
    // Os opcionais seguem a mesma regra (conector sem a lista: nenhum).
    const opcionais = c.SECRETS_OPCIONAIS ?? [];
    assert.ok(Array.isArray(opcionais) && opcionais.every(nomeDeSecretValido), `${f}: SECRETS_OPCIONAIS são nomes válidos e nenhum da casa`);
    assert.deepEqual([...opcionais].sort(), [...SECRETS_OPCIONAIS_PADRAO[f]].sort(), `${f}: SECRETS_OPCIONAIS_PADRAO desatualizado`);
    assert.equal(opcionais.some((n) => c.SECRETS.includes(n)), false, `${f}: um secret não é obrigatório e opcional ao mesmo tempo`);
  }
  // TODO NOME QUE O CONECTOR LÊ ESTÁ DECLARADO (obrigatório ou opcional): o
  // secret lido calado, sem estar em lista nenhuma, nunca aparece no "Como
  // ligar" nem na tela (foi assim com GOOGLE_ADS_CUSTOMER_ID e META_APP_SECRET).
  // Primeiro o detector, que tem de pegar as duas formas de leitura.
  const LEITURA = /env\??\.?\(\s*'([A-Z][A-Z0-9_]+)'\s*\)/g;
  assert.deepEqual([..."ctx.env?.('META_APP_SECRET'); env('GOOGLE_ADS_CUSTOMER_ID'); ctx.env('X_Y')".matchAll(LEITURA)].map((m) => m[1]), ['META_APP_SECRET', 'GOOGLE_ADS_CUSTOMER_ID', 'X_Y']);
  for (const f of FONTES) {
    const texto = readFileSync(new URL(`../supabase/functions/_shared/mkt-fontes/${f}.mjs`, import.meta.url), 'utf8');
    const declarados = new Set([...CONECTORES[f].SECRETS, ...(CONECTORES[f].SECRETS_OPCIONAIS ?? [])]);
    for (const [, nome] of texto.matchAll(LEITURA)) assert.ok(declarados.has(nome), `${f}: lê ${nome} sem declarar em SECRETS nem em SECRETS_OPCIONAIS`);
  }
});

test('publicar-functions.sh manda as subpastas de _shared (os conectores moram em _shared/mkt-fontes)', () => {
  const texto = readFileSync(new URL('../scripts/publicar-functions.sh', import.meta.url), 'utf8');
  assert.match(texto, /find _shared -type f/);
  assert.equal(/for dep in _shared\/\*\.mjs/.test(texto), false, 'o laço antigo só pegava o primeiro nível');
});

test('nenhum texto novo da coleta tem travessão', () => {
  for (const arq of ['../supabase/functions/painel-mkt-fontes/index.ts', '../supabase/functions/_shared/mkt-fontes/coletora.mjs', '../supabase/functions/_shared/mkt-fontes/info.mjs', '../supabase/functions/_shared/mkt-fontes/registro.mjs']) {
    assert.equal(/[–—]/.test(readFileSync(new URL(arq, import.meta.url), 'utf8')), false, arq);
  }
});
