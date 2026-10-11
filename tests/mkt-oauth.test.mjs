// As conexões OAuth do Marketing (Google, LinkedIn, Pinterest): o state, a
// troca do code, a renovação e a volta pública (painel-mkt-oauth), executada
// de verdade (esbuild + vm) com banco e provedor de mentira.
//
// Nada aqui é credencial de verdade: os valores são inventados, com cara de
// token só para a faxina ter o que achar. Nenhuma chamada sai para a rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  PROVEDORES, FONTES_OAUTH, REDIRECT_URI, DESTINO_RETORNO, MOTIVOS, VALIDADE_STATE_S, ErroOAuth,
  assinarState, conferirState, urlDeAutorizacao, trocarCodigo, renovar, precisaRenovar, partesSemEscopo,
  avisosDaConexao, destinoDoRetorno, revogar, provedorConfigurado, novoNonce, gerarPkce,
} from '../supabase/functions/_shared/mkt-oauth.mjs';

const SEGREDO = 'segredo-de-teste-do-cracha-0123456789';
const AGORA = Date.parse('2026-10-11T12:00:00Z');
const G = (n) => `https://www.googleapis.com/auth/${n}`;
const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'id-google-teste.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-segredo-google-de-teste',
  LINKEDIN_CLIENT_ID: 'idlinkedinteste',
  LINKEDIN_CLIENT_SECRET: 'segredo-linkedin-de-teste',
  PINTEREST_CLIENT_ID: '1500000',
  PINTEREST_CLIENT_SECRET: 'segredo-pinterest-de-teste',
};
const env = (n) => ENV[n];

/** Provedor de mentira: guarda cada pedido e responde o que o teste mandou. */
function provedor(respostas) {
  const pedidos = [];
  const fetch = async (url, init = {}) => {
    pedidos.push({ url: String(url), metodo: init.method, headers: init.headers || {}, corpo: init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null });
    const r = typeof respostas === 'function' ? respostas(String(url), init, pedidos.length) : respostas.shift();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, pedidos };
}

// O formato do state é conhecido do teste para fabricar um "bem assinado"
// com fonte fora da lista (assinarState se recusa a assinar esse).
const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
async function stateFabricado(dados, segredo = SEGREDO) {
  const corpo = b64url(enc.encode(JSON.stringify(dados)));
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', chave, enc.encode(`painel-mkt-oauth.state.v1.${corpo}`)));
  return `${corpo}.${b64url(sig)}`;
}
const recusaState = async (state, detalhe, segredo = SEGREDO, agora = AGORA) => {
  await assert.rejects(conferirState(state, segredo, agora), (e) => e instanceof ErroOAuth && e.codigo === 'state_invalido' && (!detalhe || e.detalhe === detalhe));
};

// ------------------------------------------------------------------ state --

test('o caso ruim: state adulterado, de outra chave, vencido ou de fonte fora da lista é recusado', async () => {
  const bom = await assinarState({ fonte: 'google', quem: 'gil' }, SEGREDO, AGORA);
  const [corpo, sig] = bom.split('.');
  // Corpo trocado (outra fonte), assinatura mantida.
  const outroCorpo = b64url(enc.encode(JSON.stringify({ fonte: 'linkedin', quem: 'gil', exp: Math.floor(AGORA / 1000) + 300, n: 'x' })));
  await recusaState(`${outroCorpo}.${sig}`, 'assinatura');
  // Assinatura com um caractere trocado.
  await recusaState(`${corpo}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`, 'assinatura');
  // Assinado com outra chave.
  await recusaState(await assinarState({ fonte: 'google', quem: 'gil' }, 'outra-chave-qualquer-de-teste', AGORA), 'assinatura');
  // Vencido: 10 minutos e 1 segundo depois.
  await recusaState(bom, 'vencido', SEGREDO, AGORA + (VALIDADE_STATE_S + 1) * 1000);
  // Prazo mais longo que o nosso não saiu daqui, mesmo com a chave certa.
  await recusaState(await stateFabricado({ fonte: 'google', quem: 'gil', exp: Math.floor(AGORA / 1000) + 86400 }), 'vencido');
  // Fonte fora da lista, bem assinada.
  await recusaState(await stateFabricado({ fonte: 'meta', quem: 'gil', exp: Math.floor(AGORA / 1000) + 300 }), 'fonte');
  // Formato e servidor sem segredo.
  for (const ruim of ['', 'abc', 'a.b.c', undefined, 'x'.repeat(3000)]) await recusaState(ruim, null);
  await recusaState(bom, 'segredo', '');
  // E quem assina também se recusa.
  await assert.rejects(assinarState({ fonte: 'meta', quem: 'gil' }, SEGREDO), (e) => e.codigo === 'fonte_invalida');
  await assert.rejects(assinarState({ fonte: 'google', quem: 'gil' }, ''), (e) => e.codigo === 'falta_configurar');
  await assert.rejects(assinarState({ fonte: 'google', quem: '' }, SEGREDO), (e) => e.codigo === 'state_invalido');
});

test('state bom devolve a fonte e quem pediu; dois cliques dão states diferentes', async () => {
  const a = await assinarState({ fonte: 'pinterest', quem: 'gil' }, SEGREDO, AGORA);
  const b = await assinarState({ fonte: 'pinterest', quem: 'gil' }, SEGREDO, AGORA);
  assert.notEqual(a, b);
  const conferido = await conferirState(a, SEGREDO, AGORA + 9 * 60 * 1000);
  assert.deepEqual({ ...conferido, n: undefined }, { fonte: 'pinterest', quem: 'gil', exp: Math.floor(AGORA / 1000) + VALIDADE_STATE_S, n: undefined });
  assert.match(conferido.n, /^[A-Za-z0-9_-]{16,64}$/, 'o nonce volta para ser consumido no servidor');
  // O nonce de quem chama vai dentro da assinatura.
  const n = novoNonce();
  assert.equal((await conferirState(await assinarState({ fonte: 'google', quem: 'gil', n }, SEGREDO, AGORA), SEGREDO, AGORA)).n, n);
  await assert.rejects(assinarState({ fonte: 'google', quem: 'gil', n: 'curto' }, SEGREDO), (e) => e.codigo === 'state_invalido');
  // State bem assinado sem nonce (como os de antes) não vale.
  await recusaState(await stateFabricado({ fonte: 'google', quem: 'gil', exp: Math.floor(AGORA / 1000) + 300 }), 'formato');
  assert.match(a, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'cabe na URL sem escapar nada');
});

// ------------------------------------------------------------ autorização --

test('o caso ruim: sem o app cadastrado nos Secrets, nada de URL (falta_configurar)', () => {
  assert.throws(() => urlDeAutorizacao('google', 'st', {}), (e) => e.codigo === 'falta_configurar');
  assert.throws(() => urlDeAutorizacao('linkedin', 'st', { LINKEDIN_CLIENT_ID: 'x' }), (e) => e.codigo === 'falta_configurar', 'sem a chave secreta também não');
  assert.throws(() => urlDeAutorizacao('meta', 'st', env), (e) => e.codigo === 'fonte_invalida');
  assert.equal(provedorConfigurado('google', {}), false);
  assert.equal(provedorConfigurado('google', env), true);
});

test('URL do Google: só os três escopos (sem adwords), offline, consent, escopos somados e o retorno fixo', () => {
  const u = new URL(urlDeAutorizacao('google', 'ESTADO', env));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const q = Object.fromEntries(u.searchParams);
  assert.equal(q.response_type, 'code');
  assert.equal(q.client_id, ENV.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(q.redirect_uri, REDIRECT_URI);
  assert.equal(q.state, 'ESTADO');
  assert.deepEqual(q.scope.split(' '), [G('analytics.readonly'), G('webmasters.readonly'), G('business.manage')]);
  assert.equal(/adwords/.test(u.toString()), false, 'o escopo restrito do Google Ads não entra no botão');
  assert.equal(q.access_type, 'offline');
  assert.equal(q.prompt, 'consent');
  assert.equal(q.include_granted_scopes, 'true');
  assert.equal(u.toString().includes(ENV.GOOGLE_OAUTH_CLIENT_SECRET), false, 'a chave secreta nunca vai na URL');
  assert.equal(u.toString().includes('+'), false, 'espaço vai como %20');
  assert.equal(q.code_challenge, undefined, 'sem desafio, sem PKCE');
});

test('PKCE: o desafio (S256) vai na URL só onde o provedor usa; o verificador vai só na troca', async () => {
  const { verificador, desafio } = await gerarPkce();
  assert.match(verificador, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(desafio, Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))).toString('base64url'));
  const g = new URL(urlDeAutorizacao('google', 'S', env, { desafio }));
  assert.deepEqual([g.searchParams.get('code_challenge'), g.searchParams.get('code_challenge_method')], [desafio, 'S256']);
  assert.equal(g.toString().includes(verificador), false);
  for (const f of ['linkedin', 'pinterest']) assert.equal(new URL(urlDeAutorizacao(f, 'S', env, { desafio })).searchParams.get('code_challenge'), null, f);
  assert.equal(new URL(urlDeAutorizacao('google', 'S', env, { desafio: 'torto' })).searchParams.get('code_challenge'), null);
  const { fetch, pedidos } = provedor([{ corpo: { access_token: 'ya29.x', refresh_token: '1//y', expires_in: 3599 } }]);
  await trocarCodigo('google', 'c', env, fetch, { agora: AGORA, quem: 'gil', verificador });
  assert.equal(pedidos[0].corpo.code_verifier, verificador);
});

test('URL do LinkedIn e do Pinterest: escopos fixos de cada um e o separador certo', () => {
  const l = new URL(urlDeAutorizacao('linkedin', 'S', env));
  assert.equal(l.origin + l.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.equal(l.searchParams.get('scope'), 'rw_organization_admin r_organization_social r_organization_social_feed');
  const p = new URL(urlDeAutorizacao('pinterest', 'S', env));
  assert.equal(p.origin + p.pathname, 'https://www.pinterest.com/oauth/');
  assert.equal(p.searchParams.get('scope'), 'user_accounts:read,pins:read,boards:read,ads:read');
  for (const u of [l, p]) assert.equal(u.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.deepEqual([...FONTES_OAUTH], ['google', 'linkedin', 'pinterest']);
});

// ---------------------------------------------------------------- troca --

test('o caso ruim: provedor que recusa a troca vira troca_falhou, sem texto do provedor na mensagem', async () => {
  const { fetch } = provedor([{ status: 400, corpo: { error: 'invalid_grant', error_description: 'Bad Request client_secret=GOCSPX-vazou' } }]);
  await assert.rejects(trocarCodigo('google', 'codigo-1', env, fetch, { agora: AGORA, quem: 'gil' }), (e) => {
    assert.equal(e.codigo, 'troca_falhou');
    assert.equal(e.status, 400);
    assert.equal(/vazou|invalid_grant|client_secret/.test(e.message), false);
    return true;
  });
  // Rede caída: transitório, também sem texto.
  const caiu = provedor([new Error('connect ECONNREFUSED token=abc')]);
  await assert.rejects(trocarCodigo('google', 'c', env, caiu.fetch), (e) => e.codigo === 'troca_falhou' && e.transitorio === true && !/token=abc/.test(e.message));
  // Code com espaço ou vazio nem sai daqui.
  const nada = provedor([]);
  await assert.rejects(trocarCodigo('google', 'a b', env, nada.fetch), (e) => e.codigo === 'troca_falhou');
  assert.equal(nada.pedidos.length, 0);
});

test('o caso ruim: Google sem refresh token não vira conexão (sem_refresh)', async () => {
  const { fetch } = provedor([{ corpo: { access_token: 'ya29.sem-refresh', expires_in: 3599, scope: G('analytics.readonly') } }]);
  await assert.rejects(trocarCodigo('google', 'c', env, fetch, { agora: AGORA }), (e) => e.codigo === 'sem_refresh');
});

test('escopos concedidos parciais do Google: guarda o que voltou de verdade e aponta a parte que ficou sem acesso', async () => {
  const { fetch, pedidos } = provedor([{ corpo: {
    access_token: 'ya29.token-de-teste', expires_in: 3599, refresh_token: '1//refresh-de-teste', token_type: 'Bearer',
    // O Léo desmarcou a caixinha do Perfil da Empresa.
    scope: `${G('webmasters.readonly')} ${G('analytics.readonly')}`,
  } }]);
  const c = await trocarCodigo('google', 'codigo-bom', env, fetch, { agora: AGORA, quem: 'gil' });
  assert.deepEqual(c.escopos, [G('webmasters.readonly'), G('analytics.readonly')]);
  assert.deepEqual(partesSemEscopo('google', c.escopos), ['perfil']);
  const avisos = avisosDaConexao('google', c, AGORA);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Perfil da Empresa/);
  assert.equal(/[–—]/.test(avisos[0]), false, 'sem travessão');
  // A conexão no formato do cofre.
  assert.deepEqual(Object.keys(c).sort(), ['access_token', 'conectado_em', 'conectado_por', 'escopos', 'expira_em', 'refresh_token']);
  assert.equal(c.conectado_por, 'gil');
  assert.equal(c.conectado_em, new Date(AGORA).toISOString());
  assert.equal(c.expira_em, new Date(AGORA + 3599 * 1000).toISOString());
  // O pedido: client no corpo, redirect fixo, grant certo.
  const p = pedidos[0];
  assert.equal(p.url, 'https://oauth2.googleapis.com/token');
  assert.equal(p.metodo, 'POST');
  assert.deepEqual(p.corpo, { grant_type: 'authorization_code', code: 'codigo-bom', redirect_uri: REDIRECT_URI, client_id: ENV.GOOGLE_OAUTH_CLIENT_ID, client_secret: ENV.GOOGLE_OAUTH_CLIENT_SECRET });
  assert.match(avisosDaConexao('google', { ...c, escopos: [] }, AGORA)[0], /para o Analytics, o Search Console e o Perfil da Empresa\./);
  // Com todos os escopos, nenhuma parte fica de fora.
  assert.deepEqual(partesSemEscopo('google', PROVEDORES.google.escopos), []);
});

test('LinkedIn sem refresh token é aceito (é nao_confirmado para o app deles) e avisa perto do vencimento', async () => {
  const { fetch } = provedor([{ corpo: { access_token: 'AQV-token-linkedin-de-teste', expires_in: 5184000, scope: 'r_organization_social,rw_organization_admin,r_organization_social_feed' } }]);
  const c = await trocarCodigo('linkedin', 'c', env, fetch, { agora: AGORA, quem: 'leo' });
  assert.equal('refresh_token' in c, false);
  assert.deepEqual(c.escopos, ['r_organization_social', 'rw_organization_admin', 'r_organization_social_feed']);
  assert.deepEqual(avisosDaConexao('linkedin', c, AGORA), []);
  const quaseVencendo = AGORA + 55 * 86400 * 1000;
  assert.match(avisosDaConexao('linkedin', c, quaseVencendo)[0], /vence em 5 dia/);
  await assert.rejects(renovar('linkedin', c, env, fetch), (e) => e.codigo === 'reconectar');
});

// ------------------------------------------------------------- renovação --

test('o caso ruim: refresh recusado vira reconectar; client recusado e servidor fora do ar são outra coisa', async () => {
  const conexao = { access_token: 'ya29.velho', refresh_token: '1//refresh-velho', escopos: [G('analytics.readonly')], conectado_por: 'gil', conectado_em: '2026-09-01T00:00:00.000Z' };
  for (const [resposta, codigo] of [
    [{ status: 400, corpo: { error: 'invalid_grant' } }, 'reconectar'],
    [{ status: 401, corpo: { code: 2, message: 'Authentication failed.' } }, 'reconectar'],
    [{ status: 401, corpo: { error: 'invalid_client' } }, 'credencial_recusada'],
    [{ status: 503, corpo: {} }, 'troca_falhou'],
  ]) {
    const { fetch } = provedor([resposta]);
    await assert.rejects(renovar('google', conexao, env, fetch, { agora: AGORA }), (e) => e.codigo === codigo, codigo);
  }
  await assert.rejects(renovar('google', { access_token: 'x' }, env, provedor([]).fetch), (e) => e.codigo === 'reconectar');
});

test('renovação do Google: refresh e escopos de antes continuam quando o Google não manda de novo', async () => {
  const conexao = { access_token: 'ya29.velho', refresh_token: '1//refresh-que-fica', escopos: [G('analytics.readonly')], conta: 'Impresilk', conectado_por: 'gil', conectado_em: '2026-09-01T00:00:00.000Z' };
  const { fetch, pedidos } = provedor([{ corpo: { access_token: 'ya29.novo', expires_in: 3599 } }]);
  const c = await renovar('google', conexao, env, fetch, { agora: AGORA });
  assert.equal(c.access_token, 'ya29.novo');
  assert.equal(c.refresh_token, '1//refresh-que-fica');
  assert.deepEqual(c.escopos, [G('analytics.readonly')], 'o que o Léo desmarcou continua desmarcado');
  assert.equal(c.conta, 'Impresilk');
  assert.equal(c.conectado_por, 'gil');
  assert.deepEqual(pedidos[0].corpo, { grant_type: 'refresh_token', refresh_token: '1//refresh-que-fica', client_id: ENV.GOOGLE_OAUTH_CLIENT_ID, client_secret: ENV.GOOGLE_OAUTH_CLIENT_SECRET });
});

test('refresh do Pinterest: Basic no cabeçalho, segredo fora do corpo, e o refresh token NOVO com a data nova é o que fica', async () => {
  const conexao = {
    access_token: 'pina_ACCESSvelho0000000000000000000', refresh_token: 'pinr_REFRESHvelho000000000000000000',
    expira_em: new Date(AGORA + 3 * 86400 * 1000).toISOString(), refresh_expira_em: new Date(AGORA + 20 * 86400 * 1000).toISOString(),
    escopos: ['user_accounts:read', 'pins:read'], conectado_por: 'leo', conectado_em: '2026-08-01T00:00:00.000Z',
  };
  assert.equal(precisaRenovar('pinterest', conexao, AGORA), true);
  const novoAte = Math.floor(AGORA / 1000) + 5184000;
  const { fetch, pedidos } = provedor([{ corpo: {
    access_token: 'pina_ACCESSnovo1111111111111111111', refresh_token: 'pinr_REFRESHnovo111111111111111111', response_type: 'refresh_token',
    token_type: 'bearer', expires_in: 2592000, refresh_token_expires_in: 5184000, refresh_token_expires_at: novoAte, scope: 'user_accounts:read,pins:read',
  } }]);
  const c = await renovar('pinterest', conexao, env, fetch, { agora: AGORA });
  assert.equal(c.refresh_token, 'pinr_REFRESHnovo111111111111111111');
  assert.equal(c.access_token, 'pina_ACCESSnovo1111111111111111111');
  assert.equal(c.refresh_expira_em, new Date(novoAte * 1000).toISOString());
  assert.equal(c.expira_em, new Date(AGORA + 2592000 * 1000).toISOString());
  assert.equal(c.conectado_por, 'leo');
  assert.equal(precisaRenovar('pinterest', c, AGORA), false, 'renovada, só daqui a 23 dias');
  const p = pedidos[0];
  assert.equal(p.url, 'https://api.pinterest.com/v5/oauth/token');
  assert.equal(p.headers.Authorization, `Basic ${Buffer.from(`${ENV.PINTEREST_CLIENT_ID}:${ENV.PINTEREST_CLIENT_SECRET}`).toString('base64')}`);
  assert.deepEqual(p.corpo, { grant_type: 'refresh_token', refresh_token: 'pinr_REFRESHvelho000000000000000000' });
});

test('quando renovar: Google sempre perto da hora; Pinterest com 7 dias de folga no access e 30 no refresh', () => {
  const em = (ms) => new Date(AGORA + ms).toISOString();
  assert.equal(precisaRenovar('google', { access_token: 'a', expira_em: em(4 * 60 * 1000) }, AGORA), true);
  assert.equal(precisaRenovar('google', { access_token: 'a', expira_em: em(50 * 60 * 1000) }, AGORA), false);
  assert.equal(precisaRenovar('google', { access_token: 'a' }, AGORA), true, 'sem prazo, renova');
  assert.equal(precisaRenovar('pinterest', { access_token: 'a', expira_em: em(20 * 86400e3), refresh_expira_em: em(25 * 86400e3) }, AGORA), true);
  assert.equal(precisaRenovar('pinterest', { access_token: 'a', expira_em: em(20 * 86400e3), refresh_expira_em: em(50 * 86400e3) }, AGORA), false);
  assert.equal(precisaRenovar('meta', { access_token: 'a' }, AGORA), false);
});

test('revogar: o Google recebe o refresh token no endpoint de revogação; LinkedIn e Pinterest não têm', async () => {
  const { fetch, pedidos } = provedor([{ status: 200, corpo: {} }]);
  assert.equal(await revogar('google', { access_token: 'ya29.a', refresh_token: '1//r' }, fetch), true);
  assert.equal(pedidos[0].url, 'https://oauth2.googleapis.com/revoke');
  assert.deepEqual(pedidos[0].corpo, { token: '1//r' });
  assert.equal(await revogar('google', { refresh_token: '1//r' }, provedor([new Error('rede')]).fetch), false);
  assert.equal(await revogar('linkedin', { access_token: 'x' }, fetch), null);
  assert.equal(await revogar('pinterest', { access_token: 'x' }, fetch), null);
});

test('destino da volta: fixo, só fonte da lista e só motivo conhecido', () => {
  assert.equal(destinoDoRetorno('google', null), `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=ok`);
  assert.equal(destinoDoRetorno('linkedin', 'negado'), `${DESTINO_RETORNO}?secao=marketing&conexao=linkedin&r=erro&motivo=negado`);
  assert.equal(destinoDoRetorno('https://evil.example', 'texto do provedor'), `${DESTINO_RETORNO}?secao=marketing&r=erro&motivo=troca_falhou`);
  for (const t of Object.values(MOTIVOS)) assert.equal(/[–—]/.test(t), false, t);
  // Os dois motivos da confirmação, com o texto para gente.
  for (const m of ['pedido_vencido', 'outra_pessoa']) assert.ok(typeof MOTIVOS[m] === 'string' && MOTIVOS[m].length > 20, m);
});

test('o caso ruim (destino): o confirmar só vai na volta boa, só de fonte da lista e só com nonce no formato', () => {
  const n = novoNonce();
  assert.equal(destinoDoRetorno('google', null, n), `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=ok&confirmar=${n}`);
  // Volta com erro não manda confirmar nada.
  assert.equal(destinoDoRetorno('google', 'negado', n), `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=erro&motivo=negado`);
  // Nonce torto (ou texto que tentasse levar outro parâmetro) fica de fora.
  for (const ruim of ['curto', `${n}&next=https://evil.example`, `${n}/../x`, 42, null]) {
    assert.equal(destinoDoRetorno('google', null, ruim), `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=ok`, String(ruim));
  }
  // Sem fonte da lista, não há o que confirmar.
  assert.equal(destinoDoRetorno('meta', null, n), `${DESTINO_RETORNO}?secao=marketing&r=ok`);
});

// -------------------------------------------- a volta: painel-mkt-oauth --

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite'))('esbuild');
const fonteOauth = readFileSync(new URL('../supabase/functions/painel-mkt-oauth/index.ts', import.meta.url), 'utf8')
  .replace(/^import.*createClient.*\n/m, 'const createClient=globalThis.createClient;\n');
const codigoOauth = buildSync({ stdin: { contents: fonteOauth, loader: 'ts', resolveDir: fileURLToPath(new URL('../supabase/functions/painel-mkt-oauth/', import.meta.url)) }, bundle: true, write: false, format: 'iife', platform: 'node' }).outputFiles[0].text;

/** A volta com banco e provedor de mentira. Os pedidos guardados no clique
 *  (painel_mkt_conexao_pedido) ficam num Map, e o consumir apaga e devolve,
 *  como no banco. `gravados` são as gravações no cofre. */
function volta({ respostas = [], erroGravar = null, erroConsumir = null } = {}) {
  let handler;
  const gravados = [], pedidos = new Map();
  const prov = provedor(respostas);
  const sb = { async rpc(n, p) {
    if (n === 'painel_mkt_conexao_consumir') {
      if (erroConsumir) return { data: null, error: erroConsumir };
      const v = pedidos.get(p.p_nonce) ?? null;
      pedidos.delete(p.p_nonce);
      return { data: v, error: null };
    }
    gravados.push({ n, p: JSON.parse(JSON.stringify(p)) });
    return erroGravar ? { error: erroGravar } : { data: null, error: null };
  } };
  const envVolta = { ...ENV, PAINEL_JWT_SECRET: SEGREDO, SUPABASE_URL: 'https://exemplo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-de-teste' };
  vm.runInNewContext(codigoOauth, {
    createClient: () => sb, Deno: { env: { get: (n) => envVolta[n] }, serve: (fn) => { handler = fn; } },
    Response, Request, URL, URLSearchParams, crypto, console: { error() {}, log() {} }, TextEncoder, TextDecoder, btoa, atob, AbortSignal, fetch: prov.fetch,
  });
  return {
    gravados, pedidos: prov.pedidos, guardados: pedidos,
    /** O clique em Conectar: guarda o pedido e devolve o state assinado. */
    async clique(fonte, quem = 'gil', { verificador = null } = {}) {
      const n = novoNonce();
      pedidos.set(n, { fonte, quem, verificador });
      return assinarState({ fonte, quem, n }, SEGREDO);
    },
    async get(query, metodo = 'GET') {
      const r = await handler(new Request(`https://exemplo.supabase.co/functions/v1/painel-mkt-oauth?${query}`, { method: metodo }));
      return { status: r.status, local: r.headers.get('location'), texto: await r.text(), cabecalhos: r.headers };
    },
  };
}
const motivo = (local) => new URL(local).searchParams.get('motivo');
// O nonce que está dentro do state (o mesmo que a volta manda confirmar).
const nonceDe = async (state) => (await conferirState(state, SEGREDO)).n;
const COFRE = 'painel_mkt_conexao_gravar', PENDENTE = 'painel_mkt_conexao_pendente';

test('o caso ruim (volta): método errado, sem state, code e error juntos: 400 curto e nada gravado', async () => {
  const t = volta();
  const st = await t.clique('google');
  for (const [q, m] of [[`code=1&state=${st}`, 'POST'], ['code=1', 'GET'], [`state=${st}`, 'GET'], [`code=1&error=x&state=${st}`, 'GET']]) {
    const r = await t.get(q, m);
    assert.equal(r.status, 400, q);
    assert.equal(r.texto, 'Pedido inválido.');
  }
  assert.equal(t.gravados.length, 0);
  assert.equal(t.pedidos.length, 0);
});

test('o caso ruim (volta): state adulterado volta com state_invalido, sem fonte, sem troca e sem gravar', async () => {
  const t = volta({ respostas: [{ corpo: { access_token: 'ya29.x', refresh_token: '1//y' } }] });
  const st = await assinarState({ fonte: 'google', quem: 'gil' }, 'chave-de-outro-lugar-qualquer');
  const r = await t.get(`code=abc&state=${st}`);
  assert.equal(r.status, 302);
  assert.equal(r.local, `${DESTINO_RETORNO}?secao=marketing&r=erro&motivo=state_invalido`);
  assert.equal(t.pedidos.length, 0, 'code de state ruim não vai ao provedor');
  assert.equal(t.gravados.length, 0);
});

test('volta com error (o Léo cancelou): negado, sem troca, e o state cancelado não vale de novo', async () => {
  const t = volta({ respostas: [{ corpo: { access_token: 'AQV-x', expires_in: 5184000 } }] });
  const st = await t.clique('linkedin');
  const r = await t.get(`error=user_cancelled_authorize&error_description=The+user+cancelled&state=${st}`);
  assert.equal(r.local, `${DESTINO_RETORNO}?secao=marketing&conexao=linkedin&r=erro&motivo=negado`);
  assert.equal(r.local.includes('cancelled'), false, 'texto do provedor não ecoa');
  assert.equal(t.pedidos.length + t.gravados.length, 0);
  assert.equal(motivo((await t.get(`code=CODE-DE-OUTRO&state=${st}`)).local), 'state_invalido');
  assert.equal(t.pedidos.length + t.gravados.length, 0);
});

test('o caso ruim (volta): o mesmo state usado duas vezes troca e grava UMA vez; a segunda é state_invalido', async () => {
  const t = volta({ respostas: [
    { corpo: { access_token: 'ya29.da-casa', expires_in: 3599, refresh_token: '1//refresh-DA-CASA', scope: PROVEDORES.google.escopos.join(' ') } },
    { corpo: { access_token: 'ya29.de-outra-conta', expires_in: 3599, refresh_token: '1//refresh-OUTRA', scope: PROVEDORES.google.escopos.join(' ') } },
  ] });
  const st = await t.clique('google', 'gil');
  assert.equal((await t.get(`code=CODE-DO-LEO&state=${st}`)).local, `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=ok&confirmar=${await nonceDe(st)}`);
  const r = await t.get(`code=CODE-DE-OUTRA-CONTA&state=${st}`);
  assert.equal(r.local, `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=erro&motivo=state_invalido`);
  assert.equal(t.pedidos.length, 1, 'o code da segunda volta nem foi ao provedor');
  assert.equal(t.gravados.length, 1);
  assert.equal(t.gravados[0].n, PENDENTE);
  assert.equal(t.gravados[0].p.p_valor.refresh_token, '1//refresh-DA-CASA');
  // State bem assinado, mas sem pedido guardado (nunca saiu de um clique),
  // ou com o pedido de outra fonte ou de outro login: também não.
  const solto = await assinarState({ fonte: 'google', quem: 'gil' }, SEGREDO);
  assert.equal(motivo((await t.get(`code=c&state=${solto}`)).local), 'state_invalido');
  const n = novoNonce();
  t.guardados.set(n, { fonte: 'linkedin', quem: 'gil', verificador: null });
  assert.equal(motivo((await t.get(`code=c&state=${await assinarState({ fonte: 'google', quem: 'gil', n }, SEGREDO)}`)).local), 'state_invalido');
  const n2 = novoNonce();
  t.guardados.set(n2, { fonte: 'google', quem: 'outro', verificador: null });
  assert.equal(motivo((await t.get(`code=c&state=${await assinarState({ fonte: 'google', quem: 'gil', n: n2 }, SEGREDO)}`)).local), 'state_invalido');
  assert.equal(t.pedidos.length, 1);
  assert.equal(t.gravados.length, 1);
  // Banco fora do ar na hora de conferir o pedido: motivo próprio, sem troca.
  const fora = volta({ erroConsumir: { code: 'XX000', message: 'banco caiu' } });
  const r2 = await fora.get(`code=c&state=${await fora.clique('pinterest')}`);
  assert.equal(motivo(r2.local), 'pedido_falhou');
  assert.equal(r2.local.includes('banco'), false);
  assert.equal(fora.pedidos.length + fora.gravados.length, 0);
});

test('volta com PKCE: o verificador guardado no clique vai na troca; sem PKCE, nada de code_verifier', async () => {
  const t = volta({ respostas: [{ corpo: { access_token: 'ya29.x', expires_in: 3599, refresh_token: '1//y' } }, { corpo: { access_token: 'AQV-x', expires_in: 5184000 } }] });
  const { verificador } = await gerarPkce();
  await t.get(`code=c1&state=${await t.clique('google', 'gil', { verificador })}`);
  assert.equal(t.pedidos[0].corpo.code_verifier, verificador);
  await t.get(`code=c2&state=${await t.clique('linkedin')}`);
  assert.equal('code_verifier' in t.pedidos[1].corpo, false);
  assert.equal(t.gravados.length, 2);
});

test('o caso ruim (volta): quem tem a URL do Léo e volta ANTES dele não grava no cofre; só deixa uma pendente amarrada ao Léo', async () => {
  // O caso da segunda revisão: o Léo clica em Conectar e larga a aba; outra
  // pessoa abre a MESMA URL (state e desafio do PKCE intactos), entra com a
  // conta dela e autoriza. O provedor de mentira aceita, como o real aceita.
  const t = volta({ respostas: [
    { corpo: { access_token: 'ya29.da-outra-conta', expires_in: 3599, refresh_token: '1//refresh-OUTRA-CONTA', scope: PROVEDORES.google.escopos.join(' ') } },
    { corpo: { access_token: 'ya29.do-leo', expires_in: 3599, refresh_token: '1//refresh-DO-LEO', scope: PROVEDORES.google.escopos.join(' ') } },
  ] });
  const { verificador } = await gerarPkce();
  const st = await t.clique('google', 'leo', { verificador });
  const n = await nonceDe(st);
  const outra = await t.get(`code=CODE-DA-OUTRA-CONTA&state=${st}`);
  // A volta diz "confirme"; quem confirma é a tela, com o crachá.
  assert.equal(outra.local, `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=ok&confirmar=${n}`);
  assert.equal(t.gravados.some((g) => g.n === COFRE), false, 'nada vai para o cofre sem a confirmação');
  assert.deepEqual(t.gravados.map((g) => g.n), [PENDENTE]);
  const { p } = t.gravados[0];
  // Amarrada ao pedido: o nonce do clique e o login de QUEM CLICOU, por 10 minutos.
  assert.deepEqual([p.p_nonce, p.p_fonte, p.p_quem, p.p_validade_s], [n, 'google', 'leo', VALIDADE_STATE_S]);
  assert.equal(p.p_valor.refresh_token, '1//refresh-OUTRA-CONTA');
  assert.equal(outra.local.includes('refresh'), false);
  // O Léo volta depois: o state já foi usado, e nada é trocado nem gravado.
  assert.equal(motivo((await t.get(`code=CODE-DO-LEO&state=${st}`)).local), 'state_invalido');
  assert.equal(t.pedidos.length, 1);
  assert.equal(t.gravados.length, 1);
});

test('volta boa: troca, deixa a conexão pendente com quem estava no state e volta para a tela fixa pedindo a confirmação, sem code nem token na URL', async () => {
  const t = volta({ respostas: [{ corpo: { access_token: 'ya29.novo-token', expires_in: 3599, refresh_token: '1//novo-refresh', scope: PROVEDORES.google.escopos.join(' ') } }] });
  const st = await t.clique('google', 'gil');
  // Um destino na query não muda nada: o destino é fixo.
  const r = await t.get(`code=CODIGO-SECRETO&state=${st}&redirect_uri=https://evil.example&next=https://evil.example&confirmar=outro-nonce-0123456789`);
  assert.equal(r.status, 302);
  assert.equal(r.local, `${DESTINO_RETORNO}?secao=marketing&conexao=google&r=ok&confirmar=${await nonceDe(st)}`, 'o confirmar é o do pedido, nunca o da URL');
  assert.equal(r.cabecalhos.get('referrer-policy'), 'no-referrer');
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
  assert.equal(r.texto, '');
  assert.equal(r.local.includes('CODIGO-SECRETO'), false);
  assert.equal(t.pedidos[0].corpo.code, 'CODIGO-SECRETO');
  assert.equal(t.pedidos[0].corpo.redirect_uri, REDIRECT_URI);
  assert.equal(t.gravados.length, 1);
  const { n, p } = t.gravados[0];
  assert.equal(n, PENDENTE);
  assert.equal(p.p_fonte, 'google');
  assert.equal(p.p_quem, 'gil');
  assert.equal(p.p_valor.conectado_por, 'gil');
  assert.equal(p.p_valor.refresh_token, '1//novo-refresh');
  assert.deepEqual(p.p_valor.escopos, [...PROVEDORES.google.escopos]);
});

test('volta: provedor recusa, Google sem refresh e cofre fora do ar viram motivos curtos, nunca o texto deles', async () => {
  let t = volta({ respostas: [{ status: 400, corpo: { error: 'invalid_grant', error_description: 'segredo-pinterest-de-teste' } }] });
  const st = (f) => t.clique(f);
  let r = await t.get(`code=c&state=${await st('pinterest')}`);
  assert.equal(motivo(r.local), 'troca_falhou');
  assert.equal(/segredo|invalid/.test(r.local), false);
  assert.equal(t.gravados.length, 0);
  t = volta({ respostas: [{ corpo: { access_token: 'ya29.so-access', expires_in: 3599 } }] });
  r = await t.get(`code=c&state=${await st('google')}`);
  assert.equal(motivo(r.local), 'sem_refresh');
  assert.equal(t.gravados.length, 0);
  t = volta({ respostas: [{ corpo: { access_token: 'AQV-x', expires_in: 5184000 } }], erroGravar: { code: 'XX000', message: 'vault caiu com segredo' } });
  r = await t.get(`code=c&state=${await st('linkedin')}`);
  assert.equal(motivo(r.local), 'gravar_falhou');
  assert.equal(r.local.includes('vault'), false);
});

test('nenhum texto novo das conexões tem travessão', () => {
  for (const arq of ['../supabase/functions/_shared/mkt-oauth.mjs', '../supabase/functions/painel-mkt-oauth/index.ts']) {
    const texto = readFileSync(new URL(arq, import.meta.url), 'utf8');
    assert.equal(/[–—]/.test(texto), false, arq);
  }
});

test('o caso ruim (volta, revisão de 12/10): state bem assinado e VENCIDO volta com a fonte, para a tela dizer de qual conexão; assinatura errada continua sem fonte', async () => {
  // O Léo demorou mais de 10 minutos na tela do provedor: a assinatura é a
  // nossa, a fonte é confiável, e a volta diz qual conexão não foi feita.
  const t = volta({ respostas: [{ corpo: { access_token: 'x' } }] });
  const vencido = await assinarState({ fonte: 'pinterest', quem: 'gil', exp: Math.floor(Date.now() / 1000) - 5, n: novoNonce() }, SEGREDO);
  await assert.rejects(conferirState(vencido, SEGREDO), (e) => e instanceof ErroOAuth && e.detalhe === 'vencido' && e.fonte === 'pinterest');
  const r = await t.get(`code=abc&state=${vencido}`);
  assert.equal(r.local, `${DESTINO_RETORNO}?secao=marketing&conexao=pinterest&r=erro&motivo=state_invalido`);
  assert.equal(t.pedidos.length + t.gravados.length, 0, 'nada trocado, nada gravado');
  // Assinado com outra chave: a fonte de dentro não é nossa, e não vai.
  const outro = await assinarState({ fonte: 'google', quem: 'gil', n: novoNonce() }, 'chave-de-outro-lugar-qualquer');
  await assert.rejects(conferirState(outro, SEGREDO), (e) => e instanceof ErroOAuth && e.fonte === null);
  assert.equal((await t.get(`code=abc&state=${outro}`)).local, `${DESTINO_RETORNO}?secao=marketing&r=erro&motivo=state_invalido`);
});
