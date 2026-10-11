/* AS CONEXÕES OAUTH DO MARKETING: Google, LinkedIn e Pinterest.
 *
 * Contrato: docs/marketing/integracoes-contrato.md, seção 2. A pesquisa de
 * cada provedor (documentação oficial de outubro de 2026, com contraprova)
 * está fora do repositório, em integracoes-pesquisa.json, nas chaves
 * "google-oauth-ga4", "linkedin" e "pinterest". Onde levantamento e
 * contraprova discordaram, valeu a contraprova; o que mudou por causa dela
 * está anotado em cada provedor abaixo.
 *
 * Quem usa:
 *  - painel-marketing: monta a URL do botão "Conectar" (conectarInicio),
 *    guarda o pedido no servidor (nonce e verificador do PKCE), confirma a
 *    conexão pendente com o crachá de quem clicou (conectarConfirmar) e
 *    revoga no "Desconectar";
 *  - painel-mkt-oauth: confere o state, CONSOME o pedido guardado, troca o
 *    code e deixa a conexão PENDENTE (não no cofre);
 *  - painel-mkt-fontes: renova o token antes de cada coleta.
 *
 * Tudo aqui é função pura: o fetch entra por parâmetro, e o relógio também.
 * É o que deixa o teste (tests/mkt-oauth.test.mjs) provar a troca, a
 * renovação e o state sem rede e sem credencial de verdade.
 *
 * REGRA QUE NÃO SE DOBRA: nenhum texto que o provedor devolve sai daqui numa
 * mensagem de erro. O erro carrega só um código curto (ErroOAuth.codigo) e o
 * status HTTP. Resposta de erro de OAuth pode trazer o que foi enviado, e o
 * que foi enviado inclui o client secret e o refresh token.
 */

export const REDIRECT_URI = 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-mkt-oauth';

// Para onde o retorno do provedor manda o Léo de volta. Fixo, de propósito:
// destino que viesse da URL faria desta function um redirecionador aberto.
export const DESTINO_RETORNO = 'https://leogpereira-afk.github.io/painel-impresilk/configuracoes';

// O state vale 10 minutos: o tempo de entrar na conta, ler a tela de
// permissão e clicar em Permitir. Mais que isso, um link esquecido numa aba
// viraria um convite reaproveitável.
//
// E vale UMA VEZ. A assinatura prova que o state saiu do Painel, mas não
// impedia o mesmo state de ser usado de novo dentro dos 10 minutos. Por isso
// o nonce ("n") de cada clique fica guardado no servidor
// (painel_mkt_conexao_pedido) e a volta o consome num passo só
// (painel_mkt_conexao_consumir): state já usado ou desconhecido não troca
// code nenhum.
//
// O uso único só segura quem chega DEPOIS da primeira volta. Quem tem a URL
// da tela de permissão (aba esquecida, histórico do computador do
// escritório, link colado para pedir ajuda) e volta ANTES do Léo passava,
// com a conta dele, e o PKCE não impede: o desafio vai na mesma URL
// (segunda revisão, 11/10). Por isso a volta não grava no cofre: a conexão
// fica PENDENTE (painel_mkt_conexao_pendente), amarrada ao nonce e a quem
// clicou, e só entra quando a tela confirma com o CRACHÁ dessa pessoa
// (conectarConfirmar, na painel-marketing). Quem tem só a URL completa o
// consentimento, mas não tem o crachá.
export const VALIDADE_STATE_S = 10 * 60;

const GOOGLE_ESCOPO = (nome) => `https://www.googleapis.com/auth/${nome}`;

export const PROVEDORES = Object.freeze({
  google: Object.freeze({
    pesquisa: 'google-oauth-ga4',
    nome: 'Google',
    urlAutorizacao: 'https://accounts.google.com/o/oauth2/v2/auth',
    urlToken: 'https://oauth2.googleapis.com/token',
    urlRevogar: 'https://oauth2.googleapis.com/revoke',
    // Um consentimento para os três. SEM o adwords: a contraprova achou a
    // página do Google Ads (30/09/2026) chamando o escopo de RESTRITO, e
    // juntá-lo aqui deixaria o app inteiro como "não verificado com escopo
    // restrito". O Google Ads vai por conta de serviço (GOOGLE_ADS_SA_JSON).
    escopos: Object.freeze([GOOGLE_ESCOPO('analytics.readonly'), GOOGLE_ESCOPO('webmasters.readonly'), GOOGLE_ESCOPO('business.manage')]),
    // Que parte da coleta cada escopo libera. Com consentimento granular o
    // Léo pode desmarcar uma caixinha, e aí só aquela parte fica sem acesso.
    partesPorEscopo: Object.freeze({
      ga4: GOOGLE_ESCOPO('analytics.readonly'),
      search_console: GOOGLE_ESCOPO('webmasters.readonly'),
      perfil: GOOGLE_ESCOPO('business.manage'),
    }),
    separadorEscopo: ' ',
    // offline: sem isto não vem refresh token. consent: o refresh token só
    // vem na primeira autorização, e a reconexão precisa dele de novo.
    // include_granted_scopes: somar escopo depois sem perder os de antes.
    extras: Object.freeze({ access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }),
    secrets: Object.freeze({ id: 'GOOGLE_OAUTH_CLIENT_ID', segredo: 'GOOGLE_OAUTH_CLIENT_SECRET' }),
    autenticacao: 'corpo',
    exigeRefresh: true,
    // O access token dura cerca de 1 hora: renova a cada coleta.
    margemRenovarS: 5 * 60,
    // PKCE (RFC 7636, S256): o verificador fica guardado no servidor junto
    // com o nonce, e só a troca feita pela painel-mkt-oauth o conhece; um
    // code tirado de outro pedido de autorização não fecha com ele. O
    // servidor de OAuth do Google aceita PKCE também com app web (com a
    // chave secreta junto). ATENÇÃO: a pesquisa (integracoes-pesquisa.json)
    // não cobre PKCE; se a troca passar a falhar com "troca_falhou", é aqui
    // que se desliga.
    pkce: true,
  }),
  linkedin: Object.freeze({
    pesquisa: 'linkedin',
    nome: 'LinkedIn',
    urlAutorizacao: 'https://www.linkedin.com/oauth/v2/authorization',
    urlToken: 'https://www.linkedin.com/oauth/v2/accessToken',
    urlRevogar: null,
    // Lista FIXA: pedir escopo diferente numa reconexão invalida todos os
    // tokens anteriores. Não há escopo só de leitura para as estatísticas
    // da Página (rw_organization_admin); o coletor só faz GET.
    // r_basicprofile ficou de fora: a Community Management API tem de ser o
    // único produto do app, e escopo que o app não tem derruba a autorização.
    escopos: Object.freeze(['rw_organization_admin', 'r_organization_social', 'r_organization_social_feed']),
    partesPorEscopo: null,
    separadorEscopo: ' ',
    extras: Object.freeze({}),
    secrets: Object.freeze({ id: 'LINKEDIN_CLIENT_ID', segredo: 'LINKEDIN_CLIENT_SECRET' }),
    autenticacao: 'corpo',
    // Refresh token para app de Community Management é nao_confirmado na
    // documentação (duas páginas se contradizem). Sem ele a conexão vale
    // os 60 dias do access token e a tela avisa para reconectar.
    exigeRefresh: false,
    margemRenovarS: 7 * 24 * 3600,
    // PKCE no LinkedIn é do fluxo de app nativo, liberado caso a caso; a
    // pesquisa não confirma para o app web. Desligado.
    pkce: false,
  }),
  pinterest: Object.freeze({
    pesquisa: 'pinterest',
    nome: 'Pinterest',
    urlAutorizacao: 'https://www.pinterest.com/oauth/',
    urlToken: 'https://api.pinterest.com/v5/oauth/token',
    urlRevogar: null,
    // boards:read também é exigido por GET /v5/pins; ads:read só tem uso
    // com conta de anúncios, mas é o único caminho para o audience_insights.
    escopos: Object.freeze(['user_accounts:read', 'pins:read', 'boards:read', 'ads:read']),
    partesPorEscopo: null,
    separadorEscopo: ',',
    extras: Object.freeze({}),
    secrets: Object.freeze({ id: 'PINTEREST_CLIENT_ID', segredo: 'PINTEREST_CLIENT_SECRET' }),
    // O Pinterest quer o client no cabeçalho Basic, não no corpo.
    autenticacao: 'basic',
    exigeRefresh: true,
    // Access token de 30 dias; o refresh contínuo vale 60 e cada renovação
    // devolve um NOVO. Renovar com folga mantém os dois vivos sem reconectar.
    margemRenovarS: 7 * 24 * 3600,
    margemRefreshS: 30 * 24 * 3600,
    // A pesquisa não confirma PKCE na API v5 do Pinterest. Desligado.
    pkce: false,
  }),
});

export const FONTES_OAUTH = Object.freeze(Object.keys(PROVEDORES));

/* Os códigos curtos que o retorno manda para a tela (r=erro&motivo=...), e
   os da confirmação (conectarConfirmar devolve {erro, motivo}), com o texto
   para gente. A tela importa daqui, e a ação "fontes" devolve o mapa: código
   novo entra com o texto junto, e nenhum texto vem do provedor. */
export const MOTIVOS = Object.freeze({
  state_invalido: 'O pedido de conexão venceu ou não saiu do Painel. Clique em Conectar de novo.',
  negado: 'A permissão não foi dada na tela do provedor. Para ligar, clique em Conectar e aceite.',
  troca_falhou: 'O provedor não confirmou a conexão. Tente de novo em alguns minutos.',
  sem_refresh: 'O provedor não mandou a chave de renovação. Tire o acesso do app na sua conta e conecte de novo.',
  falta_configurar: 'Faltam o ID e a chave secreta do app nos Secrets do Supabase.',
  gravar_falhou: 'A conexão foi aceita, mas o Painel não conseguiu guardar. Tente de novo.',
  pedido_falhou: 'O Painel não conseguiu conferir o pedido de conexão agora. Tente de novo em alguns minutos.',
  // Da confirmação, depois da volta do provedor (conectarConfirmar).
  pedido_vencido: 'A conexão não foi confirmada a tempo, já foi usada ou foi trocada por um clique mais novo. Clique em Conectar de novo.',
  outra_pessoa: 'Esta conexão foi pedida por outra pessoa. Só quem clicou em Conectar pode confirmar; para ligar com a sua conta, clique em Conectar.',
});

// O Desconectar do Google revoga o token, e a revogação vale para o projeto
// inteiro: os três juntos caem. A tela mostra isto antes de confirmar.
export const AVISO_DESCONECTAR_GOOGLE = 'Desconectar o Google desliga juntos o Analytics, o Search Console e o Perfil da Empresa.';

export class ErroOAuth extends Error {
  /** `codigo` é curto e fixo; `detalhe` também (nunca texto do provedor). */
  constructor(codigo, { status = null, detalhe = null, transitorio = false } = {}) {
    super(codigo);
    this.name = 'ErroOAuth';
    this.codigo = codigo;
    this.status = status;
    this.detalhe = detalhe;
    this.transitorio = transitorio;
  }
}

// ------------------------------------------------------------- base64url --
// Codificador criado na hora, não no carregamento: este arquivo entra no
// pacote da painel-marketing, e nada aqui pode depender de global no topo
// (o teste daquela porta roda numa vm sem TextEncoder).
const enc = { encode: (t) => new TextEncoder().encode(t) };
const dec = { decode: (b) => new TextDecoder().decode(b) };
function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64url(texto) {
  let s = texto.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const chaveHmac = (segredo) => crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

// Separação de domínio: o state é assinado com o MESMO PAINEL_JWT_SECRET do
// crachá. O prefixo garante que uma assinatura de state nunca valha como a
// de um crachá, nem o contrário (o crachá assina "cabeçalho.corpo").
const DOMINIO_STATE = 'painel-mkt-oauth.state.v1.';

const ler = (env, nome) => {
  const v = typeof env === 'function' ? env(nome) : env?.[nome];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const provedor = (fonte) => {
  const p = Object.prototype.hasOwnProperty.call(PROVEDORES, fonte) ? PROVEDORES[fonte] : null;
  if (!p) throw new ErroOAuth('fonte_invalida');
  return p;
};

/** O app daquele provedor está cadastrado (ID e chave secreta existem)?
 *  Olha só se existem, nunca o valor. */
export function provedorConfigurado(fonte, env) {
  const p = PROVEDORES[fonte];
  return !!p && !!ler(env, p.secrets.id) && !!ler(env, p.secrets.segredo);
}

function credenciais(fonte, env) {
  const p = provedor(fonte);
  const id = ler(env, p.secrets.id), segredo = ler(env, p.secrets.segredo);
  if (!id || !segredo) throw new ErroOAuth('falta_configurar');
  return { p, id, segredo };
}

// ------------------------------------------------------------------ state --

// O nonce de cada clique em Conectar: 16 bytes aleatórios em base64url (22
// letras). É ele que a volta consome no servidor.
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
export const novoNonce = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

/** O par do PKCE (S256): o verificador (43 letras, guardado no servidor) e
 *  o desafio (o SHA-256 dele, que vai na URL de autorização). */
export async function gerarPkce() {
  const verificador = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const desafio = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verificador))));
  return { verificador, desafio };
}

/** Assina o state que vai na URL do provedor e volta no retorno. Quem, qual
 *  fonte e o nonce ficam DENTRO da assinatura: o retorno não tem crachá, e é
 *  por aqui que ele sabe quem pediu, para qual provedor e qual pedido
 *  guardado consumir. Sem `n`, um nonce novo é sorteado (e aí não há pedido
 *  guardado: a volta recusa). */
export async function assinarState({ fonte, quem, exp, n } = {}, segredo, agora = Date.now()) {
  if (typeof segredo !== 'string' || !segredo) throw new ErroOAuth('falta_configurar', { detalhe: 'segredo' });
  provedor(fonte);
  const login = typeof quem === 'string' ? quem.trim() : '';
  if (!login || login.length > 100) throw new ErroOAuth('state_invalido', { detalhe: 'quem' });
  const vence = Number.isFinite(exp) ? Math.floor(exp) : Math.floor(agora / 1000) + VALIDADE_STATE_S;
  if (n !== undefined && !(typeof n === 'string' && NONCE.test(n))) throw new ErroOAuth('state_invalido', { detalhe: 'nonce' });
  // O nonce faz cada clique em Conectar ter um state diferente.
  const nonce = n ?? novoNonce();
  const corpo = b64url(enc.encode(JSON.stringify({ fonte, quem: login, exp: vence, n: nonce })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await chaveHmac(segredo), enc.encode(DOMINIO_STATE + corpo)));
  return `${corpo}.${b64url(sig)}`;
}

/** Confere o state do retorno. Devolve {fonte, quem, exp, n} ou lança
 *  ErroOAuth('state_invalido') com o detalhe (formato, assinatura, vencido,
 *  fonte). A comparação da assinatura é a do crypto.subtle.verify, que não
 *  vaza tempo. Conferir NÃO basta: quem chama ainda consome o nonce `n` no
 *  servidor (painel_mkt_conexao_consumir), que é o que faz o state valer uma
 *  vez só. */
export async function conferirState(state, segredo, agora = Date.now()) {
  const recusa = (detalhe) => new ErroOAuth('state_invalido', { detalhe });
  if (typeof segredo !== 'string' || !segredo) throw recusa('segredo');
  if (typeof state !== 'string' || state.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(state)) throw recusa('formato');
  const [corpo, sig] = state.split('.');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await chaveHmac(segredo), deB64url(sig), enc.encode(DOMINIO_STATE + corpo));
  } catch {
    ok = false;
  }
  if (!ok) throw recusa('assinatura');
  let dados;
  try { dados = JSON.parse(dec.decode(deB64url(corpo))); } catch { throw recusa('formato'); }
  if (!dados || typeof dados !== 'object') throw recusa('formato');
  if (!FONTES_OAUTH.includes(dados.fonte)) throw recusa('fonte');
  if (typeof dados.quem !== 'string' || !dados.quem || dados.quem.length > 100) throw recusa('formato');
  const segundos = Math.floor(agora / 1000);
  if (!Number.isFinite(dados.exp) || dados.exp < segundos) throw recusa('vencido');
  // Validade maior que a nossa não saiu daqui, nem com a chave certa.
  if (dados.exp - segundos > VALIDADE_STATE_S + 60) throw recusa('vencido');
  // Sem o nonce não há pedido guardado para consumir.
  if (typeof dados.n !== 'string' || !NONCE.test(dados.n)) throw recusa('formato');
  return { fonte: dados.fonte, quem: dados.quem, exp: dados.exp, n: dados.n };
}

// ------------------------------------------------------------ autorização --

// encodeURIComponent em tudo: espaço vira %20, que os três aceitam (o "+"
// do URLSearchParams é ambíguo para alguns servidores de OAuth).
const query = (pares) => Object.entries(pares).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/** A URL da tela de permissão do provedor. Sem o app cadastrado nos Secrets,
 *  lança ErroOAuth('falta_configurar'): melhor a tela dizer o que falta que
 *  mandar o Léo para uma página de erro do provedor. Com `desafio` (o do
 *  gerarPkce) e o provedor com PKCE ligado, o desafio vai junto (S256). */
export function urlDeAutorizacao(fonte, state, env, { desafio = null } = {}) {
  const { p, id } = credenciais(fonte, env);
  if (typeof state !== 'string' || !state) throw new ErroOAuth('state_invalido', { detalhe: 'formato' });
  const pkce = p.pkce && typeof desafio === 'string' && /^[A-Za-z0-9_-]{43}$/.test(desafio) ? { code_challenge: desafio, code_challenge_method: 'S256' } : {};
  return `${p.urlAutorizacao}?${query({
    response_type: 'code',
    client_id: id,
    redirect_uri: REDIRECT_URI,
    scope: p.escopos.join(p.separadorEscopo),
    state,
    ...p.extras,
    ...pkce,
  })}`;
}

/** Para onde o retorno manda o Léo. Só a fonte da lista e só motivo
 *  conhecido entram na URL: nada que veio do provedor. Na volta boa vai
 *  junto `confirmar=<nonce>`: a tela chama a conectarConfirmar com ele e o
 *  crachá de quem está nela, e só então a conexão pendente entra no cofre.
 *  O nonce sozinho não confirma nada (precisa do crachá de quem clicou), e
 *  ele já estava na URL da tela de permissão, dentro do state. */
export function destinoDoRetorno(fonte, motivo = null, confirmar = null) {
  const pares = { secao: 'marketing' };
  if (FONTES_OAUTH.includes(fonte)) pares.conexao = fonte;
  pares.r = motivo ? 'erro' : 'ok';
  if (motivo) pares.motivo = Object.prototype.hasOwnProperty.call(MOTIVOS, motivo) ? motivo : 'troca_falhou';
  else if (pares.conexao && typeof confirmar === 'string' && NONCE.test(confirmar)) pares.confirmar = confirmar;
  return `${DESTINO_RETORNO}?${query(pares)}`;
}

/** O nonce que a tela devolve na conectarConfirmar está no formato de um
 *  nonce de pedido? (O resto, se existe, se é da pessoa e se ainda vale, é o
 *  banco que confere.) */
export const nonceValido = (n) => typeof n === 'string' && NONCE.test(n);

// ------------------------------------------------------- troca e renovação --

/** Os escopos que o provedor DEVOLVEU. Google separa por espaço, LinkedIn e
 *  Pinterest por vírgula; os dois jeitos valem para todos. Sem o campo, a
 *  RFC 6749 (5.1) diz que o concedido é igual ao pedido. */
function escoposDe(scope, p) {
  if (typeof scope !== 'string' || !scope.trim()) return [...p.escopos];
  const lista = scope.split(/[\s,]+/).map((s) => s.trim()).filter((s) => s && s.length <= 200);
  return [...new Set(lista)].slice(0, 40);
}

const iso = (ms) => new Date(ms).toISOString();
const segundosPositivos = (v) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function montarConexao(p, dados, anterior, agora, quem) {
  const expira = segundosPositivos(dados.expires_in);
  const refreshAte = segundosPositivos(dados.refresh_token_expires_at);
  const refreshEm = segundosPositivos(dados.refresh_token_expires_in);
  const conexao = {
    access_token: dados.access_token,
    // Google não devolve refresh token na renovação: o de antes continua.
    // Pinterest devolve um NOVO a cada renovação, e é o novo que fica.
    refresh_token: typeof dados.refresh_token === 'string' && dados.refresh_token ? dados.refresh_token : anterior?.refresh_token ?? null,
    expira_em: expira ? iso(agora + expira * 1000) : null,
    // Pinterest manda a data (refresh_token_expires_at, em segundos Unix);
    // LinkedIn e Pinterest mandam também quanto falta. A data manda.
    refresh_expira_em: refreshAte ? iso(refreshAte * 1000) : refreshEm ? iso(agora + refreshEm * 1000) : anterior?.refresh_expira_em ?? null,
    escopos: escoposDe(dados.scope, p),
    conta: anterior?.conta ?? null,
    conectado_por: anterior?.conectado_por ?? quem ?? null,
    conectado_em: anterior?.conectado_em ?? iso(agora),
  };
  // Na renovação sem o campo scope, os escopos de antes valem (o Google
  // pode omitir; supor o pedido apagaria o que o Léo desmarcou).
  if (anterior && (typeof dados.scope !== 'string' || !dados.scope.trim()) && Array.isArray(anterior.escopos)) conexao.escopos = [...anterior.escopos];
  for (const k of ['refresh_token', 'expira_em', 'refresh_expira_em', 'conta']) if (conexao[k] == null) delete conexao[k];
  return conexao;
}

async function pedirToken(fonte, corpo, env, fetch) {
  const { p, id, segredo } = credenciais(fonte, env);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const campos = { ...corpo };
  if (p.autenticacao === 'basic') headers.Authorization = `Basic ${btoa(`${id}:${segredo}`)}`;
  else Object.assign(campos, { client_id: id, client_secret: segredo });
  let resposta;
  try {
    resposta = await fetch(p.urlToken, { method: 'POST', headers, body: query(campos) });
  } catch {
    // Rede ou tempo: não diz nada do provedor, e pode passar.
    throw new ErroOAuth('troca_falhou', { transitorio: true });
  }
  let dados = null;
  try { dados = await resposta.json(); } catch { dados = null; }
  return { p, resposta, dados: dados && typeof dados === 'object' ? dados : {} };
}

/** Troca o code do retorno pela conexão (o JSON que vai para o cofre). Com
 *  `verificador` (o do PKCE, guardado no servidor desde o clique), ele vai
 *  junto como code_verifier. */
export async function trocarCodigo(fonte, code, env, fetch, { agora = Date.now(), quem = null, verificador = null } = {}) {
  if (typeof code !== 'string' || !code || code.length > 4096 || /[\s\u0000-\u001f]/.test(code)) throw new ErroOAuth('troca_falhou', { detalhe: 'code' });
  const campos = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI };
  if (typeof verificador === 'string' && verificador) campos.code_verifier = verificador;
  const { p, resposta, dados } = await pedirToken(fonte, campos, env, fetch);
  if (!resposta.ok || typeof dados.access_token !== 'string' || !dados.access_token) {
    throw new ErroOAuth('troca_falhou', { status: resposta.status, transitorio: resposta.status === 429 || resposta.status >= 500 });
  }
  // Sem refresh token, Google e Pinterest param de funcionar em 1 hora e
  // 30 dias. Gravar assim seria uma conexão que morre calada.
  if (p.exigeRefresh && !(typeof dados.refresh_token === 'string' && dados.refresh_token)) throw new ErroOAuth('sem_refresh');
  return montarConexao(p, dados, null, agora, quem);
}

/** Renova o access token. Devolve a conexão NOVA, que precisa ser gravada
 *  (o Pinterest troca o refresh token a cada renovação). Token recusado
 *  (invalid_grant, 401) vira ErroOAuth('reconectar'): não adianta insistir,
 *  e insistir gasta a cota de erros do GA4. */
export async function renovar(fonte, conexao, env, fetch, { agora = Date.now() } = {}) {
  if (!conexao || typeof conexao.refresh_token !== 'string' || !conexao.refresh_token) throw new ErroOAuth('reconectar', { detalhe: 'sem_refresh' });
  const { p, resposta, dados } = await pedirToken(fonte, { grant_type: 'refresh_token', refresh_token: conexao.refresh_token }, env, fetch);
  if (!resposta.ok) {
    const codigo = typeof dados.error === 'string' ? dados.error : '';
    if (codigo === 'invalid_client' || codigo === 'unauthorized_client') throw new ErroOAuth('credencial_recusada', { status: resposta.status });
    if (resposta.status === 401 || codigo === 'invalid_grant' || codigo === 'invalid_token') throw new ErroOAuth('reconectar', { status: resposta.status });
    throw new ErroOAuth('troca_falhou', { status: resposta.status, transitorio: resposta.status === 429 || resposta.status >= 500 });
  }
  if (typeof dados.access_token !== 'string' || !dados.access_token) throw new ErroOAuth('troca_falhou', { status: resposta.status });
  return montarConexao(p, dados, conexao, agora, null);
}

/** Está na hora de renovar? Sem prazo conhecido, sim. */
export function precisaRenovar(fonte, conexao, agora = Date.now()) {
  const p = PROVEDORES[fonte];
  if (!p || !conexao) return false;
  const vence = Date.parse(conexao.expira_em || '');
  if (!conexao.access_token || !Number.isFinite(vence) || vence - agora < p.margemRenovarS * 1000) return true;
  const refreshVence = Date.parse(conexao.refresh_expira_em || '');
  return !!p.margemRefreshS && Number.isFinite(refreshVence) && refreshVence - agora < p.margemRefreshS * 1000;
}

/** O access token guardado ainda vale agora? */
export function tokenValido(conexao, agora = Date.now()) {
  const vence = Date.parse(conexao?.expira_em || '');
  return !!conexao?.access_token && (!Number.isFinite(vence) || vence > agora + 60_000);
}

/** As partes que os escopos concedidos NÃO liberam (só o Google tem partes
 *  por escopo). */
export function partesSemEscopo(fonte, escopos) {
  const mapa = PROVEDORES[fonte]?.partesPorEscopo;
  if (!mapa) return [];
  const tem = new Set(Array.isArray(escopos) ? escopos : []);
  return Object.entries(mapa).filter(([, e]) => !tem.has(e)).map(([parte]) => parte);
}

const NOME_PARTE = { ga4: 'o Analytics', search_console: 'o Search Console', perfil: 'o Perfil da Empresa' };

/** Avisos para gente sobre a conexão: escopo desmarcado, prazo chegando. */
export function avisosDaConexao(fonte, conexao, agora = Date.now()) {
  const p = PROVEDORES[fonte];
  if (!p || !conexao) return [];
  const avisos = [];
  const faltam = partesSemEscopo(fonte, conexao.escopos);
  if (faltam.length) {
    const nomes = faltam.map((x) => NOME_PARTE[x] || x);
    const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0];
    avisos.push(`Na conexão com o ${p.nome}, ficou desmarcada a permissão para ${lista}. Clique em Reconectar e deixe todas as caixas marcadas.`);
  }
  const dia = 24 * 3600 * 1000;
  const vence = Date.parse(conexao.expira_em || '');
  if (!conexao.refresh_token && Number.isFinite(vence) && vence - agora < 7 * dia) {
    const dias = Math.max(0, Math.ceil((vence - agora) / dia));
    avisos.push(dias ? `A conexão com o ${p.nome} vence em ${dias} dia(s). Clique em Reconectar antes disso.` : `A conexão com o ${p.nome} venceu. Clique em Reconectar.`);
  }
  const refreshVence = Date.parse(conexao.refresh_expira_em || '');
  if (Number.isFinite(refreshVence) && refreshVence - agora < 14 * dia) {
    const dias = Math.max(0, Math.ceil((refreshVence - agora) / dia));
    // No LinkedIn o prazo do refresh conta da primeira autorização e não
    // cresce; no Pinterest ele cresce a cada renovação, e chegar aqui quer
    // dizer que as renovações estão falhando. Nos dois casos, reconectar.
    avisos.push(dias ? `A autorização do ${p.nome} termina em ${dias} dia(s). Clique em Reconectar.` : `A autorização do ${p.nome} terminou. Clique em Reconectar.`);
  }
  return avisos;
}

/** Revoga no provedor (só o Google tem endpoint). Devolve true, false (o
 *  provedor recusou ou não respondeu) ou null (o provedor não revoga por
 *  API). Revogar o refresh token derruba os access tokens junto. */
export async function revogar(fonte, conexao, fetch) {
  const p = PROVEDORES[fonte];
  if (!p?.urlRevogar) return null;
  const token = conexao?.refresh_token || conexao?.access_token;
  if (!token) return null;
  try {
    const r = await fetch(p.urlRevogar, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: query({ token }) });
    return r.ok;
  } catch {
    return false;
  }
}
