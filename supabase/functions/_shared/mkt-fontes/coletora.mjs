/* AS REGRAS DA COLETORA DO MARKETING, SEM REDE E SEM BANCO.
 *
 * Contrato: docs/marketing/integracoes-contrato.md, seção 4. A Edge Function
 * painel-mkt-fontes faz a parte de entrada e saída (cofre, cache, RPCs); o
 * que é regra mora aqui, onde o teste alcança sem servidor:
 *
 *  - o buscador do ctx (fetchJson e fetchTexto): tempo por chamada, novas
 *    tentativas só em 429 e 5xx (e só quando o Retry-After pedido cabe
 *    inteiro; nos hosts de SEM_REPETIR, nunca), nada de insistir em 401 e
 *    403, só leitura
 *    (GET, HEAD e POST de consulta), só os hosts daquela fonte e, no site,
 *    só o próprio domínio (contra SSRF);
 *  - o orçamento de 110 s da execução inteira;
 *  - a junção do retrato novo com o anterior, parte por parte;
 *  - a faxina de segredos antes de qualquer gravação ou resposta;
 *  - o diário das execuções.
 *
 * COMO O CONECTOR USA O ctx.fetchJson (a interface que os seis seguem):
 *   const dados = await ctx.fetchJson(url, { method, headers, body, rotulo });
 *   - devolve o JSON já lido (null se o corpo veio vazio);
 *   - em falha LANÇA um ErroFonte com .codigo ('nao_autorizado', 'limite',
 *     'servidor', 'http', 'tempo', 'rede', 'resposta_invalida',
 *     'url_recusada', 'metodo_recusado', 'grande_demais', 'limite_paginas'),
 *     .status (HTTP ou null), .rotulo e .corpo (o JSON de erro do provedor,
 *     para o conector decidir; nunca vai para o cache como está);
 *   - body objeto vira JSON; texto ou URLSearchParams vai como veio;
 *   - { texto: true } devolve o corpo como texto (é o mesmo que fetchTexto).
 * A mensagem do erro é "rotulo: codigo (HTTP n)". Nunca leva a URL, que pode
 * carregar chave na query.
 *
 * E O ctx.fetch (o fetch cru, para quem precisa da Response: o HTML do site,
 * que segue redirecionamento à mão e corta em 2 MB, e a troca de token).
 * Mesma assinatura do fetch, com as travas que não dependem do conector:
 * só os hosts da fonte e só https (url_recusada, lançado antes de sair),
 * só GET, HEAD e POST, redirecionamento nunca seguido sozinho (redirect
 * 'manual' sempre: quem segue confere o próximo salto), o fim do orçamento
 * aborta a chamada, e cada ida conta no diário. O limite de páginas e de
 * bytes do site fica com quem lê a Response.
 *
 * E TRÊS OPCIONAIS no ctx, fora do contrato (extrasDoCtx, mais abaixo):
 * ctx.anterior (os dados do retrato guardado), ctx.chamadasHoje (as chamadas
 * das últimas 24 h, pelo diário) e, só no google, ctx.ga4Medicoes (os IDs G-
 * que o site achou). Conector que não usa, não lê.
 */

export const ORCAMENTO_MS = 110_000;
export const TEMPO_CHAMADA_MS = 20_000;
export const NOVAS_TENTATIVAS = 2;
// A espera mais longa que uma nova tentativa aceita. Quando o provedor pede
// MAIS que isto no Retry-After, a coleta não repete: encurtar a espera e
// insistir não é respeitar o pedido, é gastar a cota de quem pediu calma.
export const ESPERA_MAXIMA_MS = 15_000;
// Hosts em que a coleta NÃO repete pedido nenhum (429 nem 5xx), pela pesquisa
// de cada provedor:
//  - analyticsdata.googleapis.com: o GA4 dá só 10 erros 500/503 por hora por
//    projeto e propriedade, e estourar bloqueia o projeto inteiro naquela
//    propriedade; a pesquisa manda parar no primeiro 429. Repetir cada 5xx
//    duas vezes faria 3 erros por relatório;
//  - api.linkedin.com: 100 chamadas por dia por membro, e cada ida conta. O
//    conector controla o orçamento pedido a pedido; a repetição escondida
//    aqui furaria essa conta.
export const SEM_REPETIR = Object.freeze(['analyticsdata.googleapis.com', 'api.linkedin.com']);
export const LIMITE_PAGINAS_SITE = 15;
export const LIMITE_BYTES_SITE = 2 * 1024 * 1024;
export const LIMITE_BYTES_API = 8 * 1024 * 1024;
export const MAX_REDIRECIONAMENTOS = 3;
export const DIARIO_POR_FONTE = 20;
const JANELA_ANDANDO_MS = 150_000;
const ESTADOS = ['ok', 'parcial', 'falta_configurar', 'falta_conectar', 'reconectar', 'aguardando_aprovacao', 'erro'];
const NUMEROS_SEMANA = ['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads'];
const NUMEROS_PUBLICACAO = ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'];
const MAX_NUMERO = 1e9;

export class ErroFonte extends Error {
  constructor(codigo, { status = null, rotulo = 'chamada', corpo = null } = {}) {
    super(`${rotulo}: ${codigo}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'ErroFonte';
    this.codigo = codigo;
    this.status = status;
    this.rotulo = rotulo;
    this.corpo = corpo;
  }
}

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const textoCurto = (v, max) => (typeof v === 'string' ? v.replace(CONTROLE, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ------------------------------------------------------------------ hosts --

/** O nome como o DNS o enxerga: minúsculo e sem o ponto final. Para o
 *  resolvedor, "www.exemplo.com.br." (o ponto da raiz do DNS) é o MESMO nome
 *  que "www.exemplo.com.br"; o parser de URL também vira "%2E" e os pontos
 *  largos (U+3002, U+FF0E, U+FF61) num ponto final. Quem compara texto sem
 *  tirar esse ponto acha que são dois nomes, e foi assim que um
 *  redirecionamento para o nome com ponto furou a trava do site (revisão 2,
 *  achado de segurança). Só UM ponto sai: dois pontos no fim é nome torto, e
 *  o hostPublico recusa. */
export const semPontoFinal = (host) => String(host || '').toLowerCase().replace(/\.$/, '');

/** Host que dá para buscar da internet aberta: nome com ponto, sem IP
 *  (nem nas formas disfarçadas, como 0x7f.1 ou 2130706433), sem nomes de
 *  rede interna. */
export function hostPublico(host) {
  const h = semPontoFinal(host);
  if (!h || h.length > 253 || !h.includes('.') || /[:[\]]/.test(h)) return false;
  if (/^[a-z0-9.-]+$/.test(h) === false) return false;
  // Rótulo vazio ("a..b", ou dois pontos no fim) é nome torto, não site.
  if (h.split('.').some((p) => !p)) return false;
  if (h.split('.').every((p) => /^(0x[0-9a-f]+|\d+)$/.test(p))) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|arpa|onion)$/.test(h)) return false;
  return true;
}

// Os hosts de cada fonte. Fora daqui, o ctx não busca: um link de paginação
// que apontasse para outro lugar não leva o token junto.
const HOSTS_FIXOS = {
  // PageSpeed e CrUX (googleapis), certificado (Cert Spotter), DNS (Google
  // DNS) e versões do WordPress: os públicos que a pesquisa do site usa.
  site: { exatos: ['api.certspotter.com', 'dns.google', 'api.wordpress.org'], sufixos: ['.googleapis.com'] },
  google: { exatos: [], sufixos: ['.googleapis.com'] },
  google_ads: { exatos: [], sufixos: ['.googleapis.com'] },
  meta: { exatos: ['graph.facebook.com', 'graph.instagram.com'], sufixos: [] },
  linkedin: { exatos: ['api.linkedin.com', 'www.linkedin.com'], sufixos: [] },
  pinterest: { exatos: ['api.pinterest.com'], sufixos: [] },
};

/** O domínio do site da casa, tirado do url_perfil do canal "site". Sem
 *  ele (ou com um endereço que não é público), o site não é buscado. */
export function dominioDoSite(canais) {
  const site = (canais || []).find((c) => c?.codigo === 'site');
  try {
    const h = semPontoFinal(new URL(site?.url_perfil || '').hostname).replace(/^www\./, '');
    return hostPublico(h) ? h : null;
  } catch {
    return null;
  }
}

export function regraDeHosts(fonte, canais) {
  const fixos = HOSTS_FIXOS[fonte] || { exatos: [], sufixos: [] };
  return { exatos: [...fixos.exatos], sufixos: [...fixos.sufixos], site: fonte === 'site' ? dominioDoSite(canais) : null };
}

const doSite = (host, dominio) => !!dominio && (host === dominio || host === `www.${dominio}`);

/** A URL pode ser buscada por esta fonte? Devolve a URL ou lança. A URL que
 *  volta leva o nome SEM o ponto final (semPontoFinal): é ela que vai para a
 *  rede e para a comparação do próximo salto, então o nome que foi conferido
 *  é o mesmo texto que é pedido, inclusive no que vem do Location. */
export function conferirUrl(url, regra, rotulo = 'chamada') {
  let u;
  try { u = new URL(String(url)); } catch { throw new ErroFonte('url_recusada', { rotulo }); }
  const h = semPontoFinal(u.hostname);
  const ok = u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && hostPublico(h)
    && (regra.exatos.includes(h) || regra.sufixos.some((s) => h.endsWith(s) && h.length > s.length) || doSite(h, regra.site));
  if (!ok) throw new ErroFonte('url_recusada', { rotulo });
  if (u.hostname !== h) u.hostname = h;
  return u;
}

// -------------------------------------------------------------- buscador --

function esperaPedida(cabecalho, agora = Date.now()) {
  if (!cabecalho) return null;
  const s = Number(cabecalho);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(cabecalho) - agora;
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

async function lerLimitado(resposta, max, rotulo) {
  const declarado = Number(resposta.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > max) {
    try { await resposta.body?.cancel(); } catch { /* já fechado */ }
    throw new ErroFonte('grande_demais', { status: resposta.status, rotulo });
  }
  if (!resposta.body?.getReader) {
    const buf = new Uint8Array(await resposta.arrayBuffer());
    if (buf.length > max) throw new ErroFonte('grande_demais', { status: resposta.status, rotulo });
    return new TextDecoder().decode(buf);
  }
  const leitor = resposta.body.getReader();
  const pedacos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      try { await leitor.cancel(); } catch { /* já fechado */ }
      throw new ErroFonte('grande_demais', { status: resposta.status, rotulo });
    }
    pedacos.push(value);
  }
  const tudo = new Uint8Array(total);
  let i = 0;
  for (const p of pedacos) { tudo.set(p, i); i += p.length; }
  return new TextDecoder().decode(tudo);
}

async function corpoDeErro(resposta) {
  try {
    const t = await lerLimitado(resposta, 64 * 1024, 'erro');
    try { return JSON.parse(t); } catch { return t.slice(0, 2000); }
  } catch {
    return null;
  }
}

const METODOS = ['GET', 'HEAD', 'POST'];

/** O ctx.fetchJson e o ctx.fetchTexto de uma execução. `prazo()` diz quanto
 *  resta do orçamento; `sinal` aborta tudo quando o orçamento acaba;
 *  `contar()` soma cada ida à rede (tentativas e redirecionamentos também)
 *  para o diário. */
export function criarBuscador({ fetch, regra, prazo, sinal = null, contar = () => {}, esperar = dormir }) {
  let paginasDoSite = 0;

  async function pedir(url, opcoes = {}, comoTexto = false) {
    const op = objeto(opcoes) ? opcoes : {};
    const rotulo = textoCurto(op.rotulo, 80) || 'chamada';
    let alvo = conferirUrl(url, regra, rotulo);
    let metodo = String(op.method || 'GET').toUpperCase();
    // Só leitura nos provedores. POST fica porque as consultas do GA4 e do
    // CrUX são POST; o resto (PUT, PATCH, DELETE) não sai daqui.
    if (!METODOS.includes(metodo)) throw new ErroFonte('metodo_recusado', { rotulo });
    const headers = {};
    if (objeto(op.headers)) for (const [k, v] of Object.entries(op.headers)) if (v != null) headers[k] = String(v);
    let corpo = op.body;
    // Objeto simples ou lista vira JSON. A conferência é pelo toString, não
    // pelo protótipo: o objeto pode ter nascido em outro "mundo" (o teste
    // roda a function numa vm) e continuar sendo um objeto simples.
    if (Array.isArray(corpo) || Object.prototype.toString.call(corpo) === '[object Object]') {
      corpo = JSON.stringify(corpo);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    }
    const ehSite = doSite(alvo.hostname.toLowerCase(), regra.site);
    if (ehSite && (comoTexto || op.texto === true)) {
      if (paginasDoSite >= LIMITE_PAGINAS_SITE) throw new ErroFonte('limite_paginas', { rotulo });
      paginasDoSite++;
    }
    const maximo = ehSite ? LIMITE_BYTES_SITE : LIMITE_BYTES_API;
    let saltos = 0;
    for (let tentativa = 0; ;) {
      if (sinal?.aborted || prazo() < 500) throw new ErroFonte('tempo', { rotulo });
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), Math.min(TEMPO_CHAMADA_MS, prazo()));
      const soltar = () => controle.abort();
      sinal?.addEventListener?.('abort', soltar);
      try {
        let resposta;
        try {
          contar();
          resposta = await fetch(alvo.toString(), { method: metodo, headers, body: metodo === 'GET' || metodo === 'HEAD' ? undefined : corpo, signal: controle.signal, redirect: 'manual' });
        } catch {
          throw new ErroFonte(controle.signal.aborted ? 'tempo' : 'rede', { rotulo });
        }
        const s = resposta.status;
        if ([301, 302, 303, 307, 308].includes(s) && resposta.headers.get('location')) {
          // Redirecionamento seguido à mão: cada salto passa pela mesma
          // conferência de host (um redirecionamento para a rede interna
          // é o SSRF clássico) e o cabeçalho de autorização não atravessa
          // para outro host.
          if (++saltos > MAX_REDIRECIONAMENTOS) throw new ErroFonte('redirecionamentos', { status: s, rotulo });
          const proximo = conferirUrl(new URL(resposta.headers.get('location'), alvo).toString(), regra, rotulo);
          if (proximo.host !== alvo.host) for (const k of Object.keys(headers)) if (k.toLowerCase() === 'authorization') delete headers[k];
          if (s === 303 || ((s === 301 || s === 302) && metodo === 'POST')) metodo = 'GET';
          try { await resposta.body?.cancel(); } catch { /* já fechado */ }
          alvo = proximo;
          continue;
        }
        if (s === 401 || s === 403) {
          // Token morto não insiste: repetir 401 gasta a cota de erros do
          // GA4 e não muda a resposta.
          throw new ErroFonte('nao_autorizado', { status: s, rotulo, corpo: await corpoDeErro(resposta) });
        }
        if (s === 429 || s >= 500) {
          // O Retry-After manda: só repete quando a espera PEDIDA cabe inteira
          // (no teto e no que resta do orçamento). Sem ele, a espera cresce
          // 1 s, 2 s. E há hosts em que não se repete nunca (SEM_REPETIR).
          const pedida = esperaPedida(resposta.headers.get('retry-after'));
          const espera = pedida ?? Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** tentativa);
          const repete = !SEM_REPETIR.includes(alvo.hostname.toLowerCase()) && (pedida == null || pedida <= ESPERA_MAXIMA_MS);
          if (repete && tentativa < NOVAS_TENTATIVAS && espera + 1000 < prazo() && !sinal?.aborted) {
            try { await resposta.body?.cancel(); } catch { /* já fechado */ }
            clearTimeout(relogio);
            await esperar(espera);
            tentativa++;
            continue;
          }
          throw new ErroFonte(s === 429 ? 'limite' : 'servidor', { status: s, rotulo, corpo: await corpoDeErro(resposta) });
        }
        if (s < 200 || s >= 300) throw new ErroFonte('http', { status: s, rotulo, corpo: await corpoDeErro(resposta) });
        if (metodo === 'HEAD') return null;
        let texto;
        try {
          texto = await lerLimitado(resposta, maximo, rotulo);
        } catch (e) {
          if (e instanceof ErroFonte) throw e;
          throw new ErroFonte(controle.signal.aborted ? 'tempo' : 'rede', { rotulo });
        }
        if (comoTexto || op.texto === true) return texto;
        if (!texto.trim()) return null;
        try { return JSON.parse(texto); } catch { throw new ErroFonte('resposta_invalida', { status: s, rotulo }); }
      } finally {
        clearTimeout(relogio);
        sinal?.removeEventListener?.('abort', soltar);
      }
    }
  }

  /* O fetch cru (ctx.fetch). Ver o comentário do topo. */
  async function cru(url, init = {}) {
    const op = objeto(init) ? init : {};
    const alvo = conferirUrl(url, regra, 'fetch');
    const metodo = String(op.method || 'GET').toUpperCase();
    if (!METODOS.includes(metodo)) throw new ErroFonte('metodo_recusado', { rotulo: 'fetch' });
    if (sinal?.aborted || prazo() < 500) throw new ErroFonte('tempo', { rotulo: 'fetch' });
    const sinais = [sinal, op.signal].filter(Boolean);
    const juntos = sinais.length > 1 && typeof AbortSignal.any === 'function' ? AbortSignal.any(sinais) : sinais[0];
    contar();
    return fetch(alvo.toString(), { ...op, method: metodo, redirect: 'manual', ...(juntos ? { signal: juntos } : {}) });
  }

  return {
    fetchJson: (url, op) => pedir(url, op, false),
    fetchTexto: (url, op) => pedir(url, op, true),
    fetch: cru,
  };
}

// ------------------------------------------------------------- orçamento --

const ESTOUROU = Symbol('estourou');

/** Roda `fn` com teto de tempo. Nunca lança: {valor}, {erro} ou
 *  {estourou: true}. Quando estoura, chama `aoEstourar` (que aborta as
 *  chamadas em voo) e segue sem esperar o conector. */
export async function comOrcamento(fn, ms, aoEstourar = () => {}) {
  let relogio;
  const teto = new Promise((r) => { relogio = setTimeout(() => r(ESTOUROU), Math.max(0, ms)); });
  try {
    const v = await Promise.race([Promise.resolve().then(fn), teto]);
    if (v === ESTOUROU) {
      try { aoEstourar(); } catch { /* nada a fazer */ }
      return { estourou: true };
    }
    return { valor: v };
  } catch (erro) {
    return { erro };
  } finally {
    clearTimeout(relogio);
  }
}

// ------------------------------------------------------------- segredos --

// Campos do JSON da conta de serviço que não são segredo (e que a tela pode
// querer mostrar, como o e-mail da conta para o passo "dar acesso").
const JSON_PUBLICO = new Set(['type', 'client_email', 'client_id', 'project_id', 'auth_uri', 'token_uri', 'auth_provider_x509_cert_url', 'client_x509_cert_url', 'universe_domain']);

/** Os valores a esconder, a partir dos valores dos secrets: o valor
 *  inteiro e, se for um JSON (a conta de serviço do Google Ads), cada campo
 *  secreto dele, porque a chave privada pode aparecer sozinha. */
export function segredosDosValores(valores) {
  const fora = new Set();
  for (const v of valores || []) {
    if (typeof v !== 'string' || v.trim().length < 8) continue;
    fora.add(v.trim());
    try {
      const j = JSON.parse(v);
      if (objeto(j)) for (const [k, x] of Object.entries(j)) if (!JSON_PUBLICO.has(k) && typeof x === 'string' && x.length >= 16) fora.add(x);
    } catch { /* não é JSON */ }
  }
  return [...fora].sort((a, b) => b.length - a.length);
}

const CHAVE_SECRETA = /^(access_?token|refresh_?token|id_?token|client_?secret|api_?key|apikey|private_?key(_?id)?|authorization|password|senha|secret|token|x-goog-api-key|bearer|cookie|set-cookie)$/i;
// Formatos conhecidos de credencial, para o que escapar da lista de valores:
// chave de API do Google, access e refresh token do Google, token da Meta,
// tokens do Pinterest, chave privada em PEM.
const PADROES = [
  [/([?&#](?:access_token|refresh_token|client_secret|key|api_key|token|code)=)[^&#\s"'<>]+/gi, '$1[oculto]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 [oculto]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[oculto]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[oculto]'],
  [/\bya29\.[0-9A-Za-z._-]{10,}/g, '[oculto]'],
  [/(^|[^A-Za-z0-9])1\/\/[0-9A-Za-z._-]{20,}/g, '$1[oculto]'],
  [/\bEAA[A-Za-z0-9]{30,}/g, '[oculto]'],
  [/\bpin[arc]_?[A-Za-z0-9._-]{30,}/g, (m) => (/[0-9]/.test(m) && /[A-Z]/.test(m) ? '[oculto]' : m)],
];

function limparTexto(t, segredos) {
  let s = t;
  for (const seg of segredos) if (s.includes(seg)) s = s.split(seg).join('[oculto]');
  for (const [re, troca] of PADROES) s = s.replace(re, troca);
  return s;
}

/** Cópia do valor sem nada que pareça credencial: some a chave com nome de
 *  segredo, some o valor de qualquer secret onde estiver, e somem os
 *  formatos conhecidos de token. Roda em TUDO que vai para o cache, para o
 *  diário e para a resposta. */
export function limparSegredos(valor, segredos = []) {
  const lista = (segredos || []).filter((s) => typeof s === 'string' && s.length >= 8);
  // Só os ancestrais contam como ciclo: o mesmo objeto citado em dois
  // lugares (sem ciclo) sai inteiro nos dois.
  const caminho = new Set();
  const andar = (v, fundo) => {
    if (fundo > 40) return null;
    if (typeof v === 'string') return limparTexto(v, lista);
    if (v == null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'object') return null;
    if (caminho.has(v)) return null;
    caminho.add(v);
    try {
      if (Array.isArray(v)) return v.map((x) => andar(x, fundo + 1));
      if (typeof v.toISOString === 'function') return v.toISOString();
      const fora = {};
      for (const [k, x] of Object.entries(v)) {
        if (CHAVE_SECRETA.test(k)) continue;
        fora[limparTexto(k, lista)] = andar(x, fundo + 1);
      }
      return fora;
    } finally {
      caminho.delete(v);
    }
  };
  return andar(valor, 0);
}

// ---------------------------------------------------------- resultado --

const dataIso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
// O código técnico da parte (sem_ip, http_503, limite_de_chamadas...): só
// letras minúsculas, dígitos e sublinhado, porque ele não é texto para gente e
// não pode carregar nada do provedor.
const codigoDaParte = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,60}$/.test(v) ? v : null);

/** O que o conector devolveu, conferido: estado da lista, partes no
 *  formato, listas que são listas. Conector que devolve lixo vira "erro"
 *  com aviso, não derruba a coletora. */
export function normalizarResultado(bruto) {
  if (!objeto(bruto)) {
    return { estado: 'erro', conta: null, partes: {}, dados: {}, semanas: [], publicacoes: [], conexao: null, avisos: ['O conector não devolveu resultado.'] };
  }
  const partes = {};
  if (objeto(bruto.partes)) {
    for (const [nome, p] of Object.entries(bruto.partes).slice(0, 30)) {
      if (!/^[a-z0-9_]{1,40}$/.test(nome) || !objeto(p)) continue;
      partes[nome] = {
        estado: ESTADOS.includes(p.estado) ? p.estado : 'erro',
        // motivo é a frase para gente (a tela mostra como texto); o código
        // técnico, quando o conector tem um, vem à parte em "codigo".
        motivo: textoCurto(p.motivo, 300) || null,
        coletado_em: dataIso(p.coletado_em),
      };
      const codigo = codigoDaParte(p.codigo);
      if (codigo) partes[nome].codigo = codigo;
    }
  }
  // A faxina que o conector pede (o LinkedIn manda em todo retorno). Daqui
  // só sai o código do canal: os prazos de guarda são regra, ficam fixos na
  // coletora, e um conector com defeito não encurta a guarda para 1 dia.
  const faxina = objeto(bruto.faxina) && typeof bruto.faxina.canal === 'string' && /^[a-z0-9_-]{2,30}$/.test(bruto.faxina.canal) ? { canal: bruto.faxina.canal } : null;
  return {
    estado: ESTADOS.includes(bruto.estado) ? bruto.estado : 'erro',
    faxina,
    conta: textoCurto(bruto.conta, 200) || null,
    partes,
    dados: objeto(bruto.dados) ? bruto.dados : {},
    semanas: Array.isArray(bruto.semanas) ? bruto.semanas.slice(0, 2000) : [],
    publicacoes: Array.isArray(bruto.publicacoes) ? bruto.publicacoes.slice(0, 5000) : [],
    conexao: objeto(bruto.conexao) ? bruto.conexao : null,
    avisos: Array.isArray(bruto.avisos) ? bruto.avisos.map((a) => textoCurto(a, 500)).filter(Boolean).slice(0, 30) : [],
  };
}

const boa = (e) => e === 'ok' || e === 'parcial';

/** O RETRATO QUE VAI PARA O CACHE, juntando o novo com o anterior.
 *
 *  Coleta inteira boa (estado ok e todas as partes ok): o novo manda
 *  sozinho. Nos outros casos, parte por parte:
 *   - parte que falhou mantém os dados e a data da coleta boa anterior
 *     (com o motivo novo e a hora da tentativa): um soluço do Search Console
 *     não apaga a semana de números que já estava na tela;
 *   - parte parcial junta o novo por cima do anterior, campo a campo;
 *   - parte ok troca;
 *   - parte que não veio desta vez fica como estava.
 *  Avisos são só os desta execução. */
export function juntarRetrato(anterior, novo, agoraIso) {
  const ant = objeto(anterior) ? anterior : {};
  const pAnt = objeto(ant.partes) ? ant.partes : {};
  const dAnt = objeto(ant.dados) ? ant.dados : {};
  const partesNovas = objeto(novo.partes) ? novo.partes : {};
  const dadosNovos = objeto(novo.dados) ? novo.dados : {};
  const tudoOk = novo.estado === 'ok' && Object.values(partesNovas).every((p) => p.estado === 'ok');
  // O código técnico só vai quando existe: parte sem código fica com o mesmo
  // formato de sempre.
  const comCodigo = (parte, p) => (codigoDaParte(p.codigo) ? { ...parte, codigo: p.codigo } : parte);
  let partes, dados;
  if (tudoOk) {
    partes = {};
    for (const [nome, p] of Object.entries(partesNovas)) partes[nome] = comCodigo({ estado: p.estado, motivo: p.motivo ?? null, coletado_em: p.coletado_em || agoraIso }, p);
    dados = dadosNovos;
  } else {
    partes = { ...pAnt };
    for (const [nome, p] of Object.entries(partesNovas)) {
      partes[nome] = comCodigo(boa(p.estado)
        ? { estado: p.estado, motivo: p.motivo ?? null, coletado_em: p.coletado_em || agoraIso }
        : { estado: p.estado, motivo: p.motivo ?? null, coletado_em: pAnt[nome]?.coletado_em ?? null, tentado_em: agoraIso }, p);
    }
    dados = { ...dAnt };
    for (const [k, v] of Object.entries(dadosNovos)) {
      if (v === undefined) continue;
      const parte = partesNovas[k];
      if (parte && !boa(parte.estado) && k in dAnt) continue;
      if (parte?.estado === 'parcial' && objeto(v) && objeto(dAnt[k])) { dados[k] = { ...dAnt[k], ...v }; continue; }
      dados[k] = v;
    }
  }
  const algoBom = novo.estado === 'ok' || Object.values(partesNovas).some((p) => boa(p.estado));
  return {
    estado: novo.estado,
    conta: novo.conta || ant.conta || null,
    partes,
    dados,
    avisos: Array.isArray(novo.avisos) ? novo.avisos : [],
    coletado_em: agoraIso,
    ultima_boa_em: algoBom ? agoraIso : ant.ultima_boa_em ?? null,
  };
}

// -------------------------------------------- linhas para as RPCs do banco --

// Número que veio da API: inteiro de 0 a 1 bilhão (o mesmo check das
// tabelas). Texto com dígitos vale (o GA4 manda número como texto). O resto
// é "não informado" e não vai: nulo nunca vira zero, e um número ausente não
// apaga o que já estava gravado.
function inteiroDaApi(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const r = Math.round(n);
  return r <= MAX_NUMERO ? r : null;
}

function dataValida(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 2000 && a <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const CODIGO_CANAL = /^[a-z0-9_-]{2,30}$/;

/** As linhas para painel_mkt_api_metricas: canal pelo código, semana na
 *  segunda-feira, só os números que vieram. Linha repetida (mesmo canal e
 *  semana) junta, a última manda em cada número. */
export function prepararSemanas(linhas) {
  const porChave = new Map();
  let descartadas = 0;
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const canal = objeto(l) && typeof l.canal === 'string' ? l.canal.trim() : '';
    const semana = objeto(l) && typeof l.semana === 'string' ? l.semana.slice(0, 10) : '';
    if (!CODIGO_CANAL.test(canal) || !dataValida(semana) || new Date(`${semana}T12:00:00Z`).getUTCDay() !== 1 || !objeto(l.numeros)) { descartadas++; continue; }
    const numeros = {};
    for (const k of NUMEROS_SEMANA) {
      const n = inteiroDaApi(l.numeros[k]);
      if (n != null) numeros[k] = n;
    }
    if (!Object.keys(numeros).length) { descartadas++; continue; }
    const chave = `${canal} ${semana}`;
    const antes = porChave.get(chave);
    porChave.set(chave, { canal, semana, numeros: { ...(antes?.numeros || {}), ...numeros } });
  }
  return { linhas: [...porChave.values()], descartadas };
}

/** As linhas para painel_mkt_api_publicacoes: link normalizado (a chave da
 *  tabela é canal + link, então sem link a linha não entra: entraria de novo
 *  a cada coleta), data AAAA-MM-DD, título só se veio (título vazio não
 *  apaga o que existe), números só os que vieram. */
export function prepararPublicacoes(linhas, normalizarLink) {
  const porChave = new Map();
  let descartadas = 0;
  for (const l of Array.isArray(linhas) ? linhas : []) {
    if (!objeto(l)) { descartadas++; continue; }
    const canal = typeof l.canal === 'string' ? l.canal.trim() : '';
    const data = typeof l.data === 'string' ? l.data.slice(0, 10) : '';
    let url = null;
    try { url = normalizarLink(l.url); } catch { url = null; }
    if (!CODIGO_CANAL.test(canal) || !dataValida(data) || !url) { descartadas++; continue; }
    const linha = { canal, url, data };
    const titulo = textoCurto(l.titulo, 200);
    if (titulo) linha.titulo = titulo;
    for (const k of NUMEROS_PUBLICACAO) {
      const n = inteiroDaApi(l[k]);
      if (n != null) linha[k] = n;
    }
    porChave.set(`${canal} ${url}`, linha);
  }
  return { linhas: [...porChave.values()], descartadas };
}

// ------------------------------------------------------------------ diário --

/* QUEM GRAVA O DIÁRIO É O BANCO (painel_mkt_coleta_anotar, migração
 * 20261012a), num passo só e sob trava: as seis fontes escrevem na MESMA
 * linha do painel_cache, e o "lê, junta e grava" feito daqui perdia escrita
 * quando duas coletas terminavam juntas (uma execução que terminou ok
 * aparecia depois como interrompida, com 0 chamadas). As duas funções abaixo
 * são a MESMA regra escrita em JavaScript: o teste de banco confere que a
 * função do banco dá o mesmo resultado, e os testes das Edge Functions usam
 * esta como o banco de mentira. Mudou uma, muda a outra. */

const MSG_INTERROMPIDA = 'A execução parou sem terminar (o servidor encerrou antes do fim).';
// O gasto por hora fica 48 h no diário; a conta do dia olha 25 h (ver
// extrasDoCtx).
const GUARDA_COTA_MS = 48 * 3600 * 1000;
const HORA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}$/;
const instanteDaHora = (h) => (HORA_ISO.test(h) ? Date.parse(`${h}:00:00.000Z`) : NaN);

/** O gasto de chamadas por fonte e por hora (UTC, "AAAA-MM-DDTHH"), com a
 *  entrada somada quando ela fecha uma execução. É ESTA conta que diz quanto
 *  da cota do dia já foi (LinkedIn, Pinterest), e não as 20 últimas
 *  execuções: vinte cliques em "Atualizar agora" que não gastam nada
 *  empurrariam para fora do diário as execuções que gastaram. */
export function somarCota(cota, entrada, agora = Date.now()) {
  const fora = {};
  if (objeto(cota)) {
    for (const [fonte, horas] of Object.entries(cota)) {
      if (!objeto(horas)) continue;
      for (const [h, n] of Object.entries(horas)) {
        const t = instanteDaHora(h);
        if (!Number.isInteger(n) || n <= 0 || !Number.isFinite(t) || agora - t >= GUARDA_COTA_MS) continue;
        (fora[fonte] ||= {})[h] = n;
      }
    }
  }
  const n = entrada?.chamadas;
  const hora = typeof entrada?.inicio === 'string' ? entrada.inicio.slice(0, 13) : '';
  if (entrada?.fim && typeof entrada.fonte === 'string' && Number.isInteger(n) && n > 0 && n < 1e7 && HORA_ISO.test(hora)) {
    const horas = (fora[entrada.fonte] ||= {});
    horas[hora] = (horas[hora] || 0) + n;
  }
  return fora;
}

/** Anota uma execução no diário (a mais nova primeiro) e guarda as 20
 *  últimas de cada fonte, mais o gasto por hora (somarCota). Execução de
 *  outra rodada que ficou "andando" além da janela morreu sem terminar (a
 *  Edge Function foi derrubada por fora, e aí nenhum catch roda): vira
 *  "interrompida", para ninguém achar que ainda está coletando. A ordem é a
 *  do texto do início (ISO, comparado letra a letra, como o collate "C" do
 *  banco); sem início, vai para o fim. */
export function anotarDiario(diario, entrada, agora = Date.now()) {
  const antes = objeto(diario) && Array.isArray(diario.execucoes) ? diario.execucoes.filter(objeto) : [];
  const outras = antes.filter((e) => e.id !== entrada.id).map((e) => {
    const inicio = Date.parse(typeof e.inicio === 'string' ? e.inicio : '');
    return e.estado === 'andando' && (!Number.isFinite(inicio) || agora - inicio >= JANELA_ANDANDO_MS)
      ? { ...e, estado: 'interrompida', erro: typeof e.erro === 'string' && e.erro ? e.erro : MSG_INTERROMPIDA }
      : e;
  });
  const chave = (e) => (typeof e.inicio === 'string' ? e.inicio : null);
  const todas = [entrada, ...outras].map((e, pos) => ({ e, pos })).sort((a, b) => {
    const x = chave(a.e), y = chave(b.e);
    if (x !== y) { if (x == null) return 1; if (y == null) return -1; return x < y ? 1 : -1; }
    return a.pos - b.pos;
  }).map((x) => x.e);
  const porFonte = new Map();
  const execucoes = todas.filter((e) => {
    const n = (porFonte.get(e.fonte) || 0) + 1;
    porFonte.set(e.fonte, n);
    return n <= DIARIO_POR_FONTE;
  });
  return { versao: 1, execucoes, cota: somarCota(diario?.cota, entrada, agora) };
}

/** A anotação com a trava de uma execução por fonte (o p_exclusiva da
 *  painel_mkt_coleta_anotar): se outra execução da mesma fonte começou há
 *  menos de 150 s e ainda está "andando", nada é gravado e volta
 *  { andando: true }. Senão, { andando: false, diario } com o diário novo. */
export function anotarComTrava(diario, entrada, { exclusiva = false, agora = Date.now() } = {}) {
  if (exclusiva) {
    const lista = objeto(diario) && Array.isArray(diario.execucoes) ? diario.execucoes : [];
    const ocupada = lista.some((e) => {
      if (!objeto(e) || e.fonte !== entrada.fonte || e.id === entrada.id || e.estado !== 'andando') return false;
      const inicio = Date.parse(typeof e.inicio === 'string' ? e.inicio : '');
      return Number.isFinite(inicio) && agora - inicio < JANELA_ANDANDO_MS;
    });
    if (ocupada) return { andando: true };
  }
  return { andando: false, diario: anotarDiario(diario, entrada, agora) };
}

// ------------------------------------------------- o que vai a mais no ctx --

const JANELA_COTA_MS = 24 * 3600 * 1000;
const MEDICAO_GA4 = /^G-[A-Z0-9]{4,20}$/i;

/** O que a coletora passa no ctx além do contrato. Tudo é opcional: o
 *  conector que não usa um campo simplesmente não lê.
 *  - anterior: os `dados` do retrato guardado desta fonte (já passaram pela
 *    faxina de segredos). O google usa para não perder avaliações que a lista
 *    do Google deixou de mandar e para achar a propriedade do GA4 com um
 *    pedido só; o google_ads, para guardar os leads de formulário que o Google
 *    apaga em 60 dias. Sem isso a juntarRetrato troca a parte inteira pela
 *    nova, e o lead antigo some.
 *  - chamadasHoje: quantas chamadas esta fonte gastou nas últimas 24 horas.
 *    O LinkedIn conta 100 por dia por pessoa e o Pinterest 1000 por dia para
 *    o app; sem esta conta o cron mais alguns cliques em "Atualizar agora"
 *    passariam do teto, e o resto do dia ficaria sem dado. Janela de 24 h
 *    corridas, e não "desde a meia-noite": é o lado seguro para os dois
 *    jeitos de contar dos provedores. Vale a MAIOR de duas contas: o gasto
 *    por hora do diário (somarCota, que não esquece quando o diário corta as
 *    execuções em 20) e a soma das execuções guardadas (o diário antigo, sem
 *    o gasto por hora). Na conta por hora entram 25 h: a hora cheia em que a
 *    execução começou pode ter começado até 1 h antes dela.
 *  - ga4Medicoes: os IDs G- que o conector do site achou nas páginas (só para
 *    o google), para ele achar a propriedade do GA4 pela etiqueta instalada. */
export function extrasDoCtx(fonte, { anterior = null, diario = null, site = null, agora = Date.now() } = {}) {
  const extras = { anterior: objeto(anterior) && objeto(anterior.dados) ? anterior.dados : null };
  let gastas = 0;
  const lista = objeto(diario) && Array.isArray(diario.execucoes) ? diario.execucoes : [];
  for (const e of lista) {
    if (!objeto(e) || e.fonte !== fonte || !Number.isInteger(e.chamadas) || e.chamadas < 0) continue;
    const inicio = Date.parse(e.inicio || '');
    if (Number.isFinite(inicio) && agora - inicio < JANELA_COTA_MS) gastas += e.chamadas;
  }
  let porHora = 0;
  const horas = objeto(diario) && objeto(diario.cota) && objeto(diario.cota[fonte]) ? diario.cota[fonte] : {};
  for (const [h, n] of Object.entries(horas)) {
    const t = instanteDaHora(h);
    if (Number.isInteger(n) && n > 0 && Number.isFinite(t) && agora - t < JANELA_COTA_MS + 3600 * 1000) porHora += n;
  }
  extras.chamadasHoje = Math.max(gastas, porHora);
  if (fonte === 'google') {
    const ids = site?.dados?.paginas?.etiquetas?.tipos?.ga4?.ids;
    extras.ga4Medicoes = Array.isArray(ids) ? [...new Set(ids.filter((x) => typeof x === 'string' && MEDICAO_GA4.test(x)))].slice(0, 10) : [];
  }
  return extras;
}

// ------------------------------------------------------------- env do ctx --

const ENV_DA_CASA = /^(SUPABASE|PAINEL|SB)_|SERVICE_ROLE|JWT/;
const ENV_DE_PROVEDOR = /^(GOOGLE|META|FACEBOOK|INSTAGRAM|LINKEDIN|PINTEREST|GA4|GSC|GBP|MKT)_[A-Z0-9_]{1,60}$/;

/** O ctx.env do conector: só secrets de provedor (e os que ele declarou).
 *  Os da casa (PAINEL_TOKEN, a chave do banco, o segredo do crachá) nunca
 *  chegam a um conector. `lembrar(valor, nome)` recebe todo valor entregue,
 *  para a faxina decidir o que esconder. */
export function envDoConector(ler, declarados = [], lembrar = () => {}) {
  const lista = Array.isArray(declarados) ? declarados.filter((n) => typeof n === 'string') : [];
  return (nome) => {
    const n = String(nome ?? '');
    if (ENV_DA_CASA.test(n) || (!lista.includes(n) && !ENV_DE_PROVEDOR.test(n))) return null;
    const v = ler(n);
    if (typeof v !== 'string' || !v) return null;
    lembrar(v, n);
    return v;
  };
}
