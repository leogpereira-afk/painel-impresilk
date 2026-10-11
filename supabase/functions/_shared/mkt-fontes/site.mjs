/* CONECTOR "site" DO MARKETING: o que dá para ler do site da casa de fora,
 * sem login.
 *
 * Contrato: docs/marketing/integracoes-contrato.md (seções 4 e 5). Pesquisa:
 * integracoes-pesquisa.json, chave "site-sem-credencial". Onde o levantamento
 * e a contraprova discordam, vale a contraprova, e ela mudou cinco coisas
 * aqui dentro:
 *  - o Clarity se acha pela CHAMADA FINAL do código oficial
 *    (window, document, "clarity", "script", "<id>"): a URL com o id só
 *    existe na rede, montada por concatenação;
 *  - o Hotjar novo é a etiqueta da Contentsquare (window._uxa e
 *    t.contentsquare.net/uxa/<id>.js);
 *  - o Pinterest também tem o noscript ct.pinterest.com/v3/?tid=<id>;
 *  - os padrões do LinkedIn vêm de guias de terceiros (a página oficial não
 *    mostra o código): saem marcados como não confirmados, com lintrk como
 *    sinal a mais;
 *  - a chave do Google vai no cabeçalho x-goog-api-key, nunca na URL; os
 *    dados de campo (LCP, INP, CLS reais) vêm da CrUX e da CrUX History, e o
 *    loadingExperience do PageSpeed é só extra (o Google avisou que vai
 *    tirá-lo, sem data); AGENTIC_BROWSING vai numa chamada separada, para que
 *    uma recusa dela não leve as quatro notas principais junto.
 *
 * DE ONDE VEM CADA COISA
 *  - HTML da página inicial e de até 14 páginas (sitemap primeiro, depois a
 *    REST): etiquetas, eventos, verificações, consentimento, JSON-LD, Open
 *    Graph, SEO da página, plataforma e contatos;
 *  - robots.txt e sitemap (contagem e última modificação);
 *  - REST pública do WordPress: páginas e posts (viram as publicações do
 *    canal site) e os namespaces (plugins instalados);
 *  - DNS público (dns.google): verificações por TXT, SPF, DMARC e MX;
 *  - api.wordpress.org: a versão atual do WordPress e dos plugins achados no
 *    HTML, para dizer o que está atrasado;
 *  - PageSpeed Insights (celular e computador), CrUX e CrUX History: só com a
 *    GOOGLE_API_KEY. Sem ela, essas duas partes ficam "falta_configurar" e o
 *    resto funciona. Por isso a chave NÃO está em SECRETS (a coletora acharia
 *    a fonte inteira desconfigurada) e sim em SECRETS_OPCIONAIS.
 *  - Fica de fora o Cert Spotter: para produção a SSLMate pede conta.
 *
 * SEGURANÇA (o endereço vem de um cadastro, então é tratado como entrada de
 * gente): todo pedido ao site passa por alvoPermitido. Só https, só o domínio
 * do url_perfil do canal site (com ou sem www), nenhum IP, nenhum nome
 * interno, nenhuma porta fora da 443, usuário e senha na URL recusados. O
 * redirecionamento é seguido À MÃO (redirect: 'manual'), no máximo 3 saltos,
 * e cada salto é conferido de novo: um 301 para 169.254.169.254 para ali.
 * Antes do primeiro pedido, o dns.google diz para que IP o nome (com e sem
 * www) aponta; IP interno para tudo ("127.0.0.1.nip.io" passa na trava de
 * nome, não na de IP). E o nome só é pedido se o DNS público MOSTROU um IP
 * de internet para ele: resposta sem nenhum A ou AAAA (NXDOMAIN, SERVFAIL,
 * só um CNAME para um nome que só a rede de dentro resolve) não conta como
 * "conferido". O nome do cadastro sem IP para tudo (motivo sem_ip); o outro
 * (com ou sem www) sem IP só não é pedido. Só quando o dns.google nem
 * responde a coleta segue sem conferir, e o diário registra.
 * Sobram dois riscos, anotados (o diário também lembra a cada coleta): a
 * troca de IP entre a conferência e o pedido (DNS rebinding) e o DNS que
 * responde uma coisa ao Google e outra ao servidor do Painel (split
 * horizon). Os dois só se fecham resolvendo o nome dentro do fetch e
 * conectando no IP conferido, o que o fetch do Deno não deixa fazer com o
 * certificado conferido pelo nome. O endereço é cadastrado pela gestão, e o
 * https com certificado limita o estrago a uma conexão cega na porta 443.
 * Cada página lê no máximo 2 MB; são no máximo 15 páginas por execução. O
 * http:// do site não é testado de propósito: a regra é https e só https.
 *
 * POR QUE O HTML NÃO VAI PELO ctx.fetchJson: ele devolve JSON, segue
 * redirecionamento sozinho e lança erro em 404 (que no site é fato, não
 * falha). Para o domínio do site o conector usa ctx.fetch (o fetch cru da
 * coletora, que já só deixa sair https para os hosts da fonte) ou, sem ele,
 * o fetch global, sempre com as travas daqui por cima. O ctx.fetchJson fica
 * para os endereços fixos (CrUX, dns.google, api.wordpress.org), que não vêm
 * de cadastro nenhum. O PageSpeed também vai pelo ctx.fetch: ele demora mais
 * que os 20 s que o fetchJson dá a cada chamada (ver pedirJsonDemorado).
 *
 * ------------------------------------------------------------------ FORMATO
 * O que coletar(ctx) devolve, no contrato da seção 4:
 *
 *   estado: 'ok' | 'parcial' | 'falta_configurar' | 'erro'
 *     ok: todas as partes ok. falta_configurar: o canal site não tem
 *     url_perfil válido, ou o nome dele aponta para IP interno (nada é
 *     pedido ao site). erro: nenhuma parte deu certo.
 *     parcial: o resto (inclusive "sem a chave do Google").
 *   conta: o domínio do site ('impresilk.com.br'), ou null.
 *   partes: { paginas, robots, sitemap, wordpress, dns, versoes, pagespeed,
 *             crux }, cada uma { estado, motivo?, codigo?, coletado_em }.
 *     motivo é FRASE para gente, em português, pronta para a tela mostrar
 *     como texto (MOTIVOS e fraseDoMotivo, mais abaixo). codigo é o código
 *     curto do mesmo caso, para quem precisa separar um do outro (nunca
 *     para mostrar): sem_endereco, sem_chave, chave_recusada,
 *     api_bloqueada, prazo, cota, servidor, sem_resposta, recusado,
 *     sem_dados, medicao_falhou, grande_demais, http_<n>, rede, certificado,
 *     tempo_esgotado, dns, laco, saltos_demais, redireciona_para_fora,
 *     fora_do_dominio, limite_paginas, nao_e_sitemap, rest_fechada,
 *     sem_wordpress, algumas_paginas, nada_a_conferir, ip_interno, sem_ip,
 *     falha_interna. Os dois vêm juntos ou não vêm (parte ok sem ressalva).
 *     Parte ok também pode trazer motivo: crux com sem_dados, wordpress com
 *     sem_wordpress ou rest_fechada, versoes com nada_a_conferir.
 *     Chave recusada não vira "reconectar": não há OAuth nesta fonte, o
 *     conserto é cadastrar uma chave boa, que é o passo de "falta_configurar".
 *   dados: as chaves têm o MESMO nome das partes (mais site e conferencias).
 *     Parte que falhou NÃO aparece em dados: a coletora junta parte por
 *     parte e mantém a da coleta anterior.
 *     TODO TEXTO DE dados VEM DE FORA (o HTML, a REST e o sitemap do site, e
 *     um site invadido escreve o que quiser neles): a tela escapa tudo e
 *     nunca monta HTML com isso. Link só vira link pelo linkSeguro da tela.
 *     Os campos de endereço (seo.canonical, og.url, og.imagem,
 *     dados_estruturados.logo e mesmo_que, wordpress.*.itens[].link,
 *     robots.sitemaps, sitemap.urls[].loc e subs[].url, pagespeed url_final)
 *     já saem daqui só como http:// ou https:// absoluto, ou null (urlHttp):
 *     um "javascript:" no canonical nunca chega à tela.
 *   semanas: [] sempre. Nenhum dos sete números da semana (seguidores,
 *     alcance, impressões, engajamento, cliques, conversas, leads) sai do
 *     HTML, do sitemap, do PageSpeed ou da CrUX. Os do canal site vêm do
 *     conector google (GA4: usuários em alcance, visualizações em
 *     impressões, sessões engajadas em engajamento, eventos-chave em leads;
 *     Search Console: cliques). Mandar zero aqui seria dizer que a semana
 *     teve zero. A leitura semanal desta fonte (LCP, INP e CLS reais das 8
 *     semanas fechadas) fica em dados.crux.semanas.
 *   publicacoes: páginas e posts publicados do WordPress, cada um
 *     { canal: 'site', url, data: AAAA-MM-DD (data de publicação no fuso de
 *     São Paulo), titulo (até 200) }, SEM números (o site não mede alcance
 *     por página; mandar null apagaria o lançado à mão). url é o LINK CURTO
 *     do WordPress, já normalizado: https://<domínio sem www>/?page_id=<id>
 *     para página e /?p=<id> para post (a página inicial também:
 *     ?page_id=140). Ele não muda quando os links permanentes mudam, e o
 *     WordPress redireciona dele para o link do momento; o link permanente
 *     fica em dados.wordpress.*.itens[].link. Ficam de fora o "Olá, mundo!"
 *     e a "Página de exemplo" do WordPress, que viram conferência, e o item
 *     cujo link aponta para outro domínio.
 *   avisos: frases para gente.
 *
 * dados.site = { dominio, inicio (o endereço FINAL da página inicial, o que o
 *   PageSpeed e a CrUX medem), nome: og:site_name ou o nome da REST, ou null }
 *
 * dados.paginas = {
 *   lista: [Pagina]          a página inicial é a lista[0]; até 15 páginas
 *   etiquetas: {
 *     tipos: { ga4, google_ads, gtm, meta_pixel, linkedin, pinterest, tiktok,
 *              clarity, hotjar, contentsquare }: cada um
 *       { ids: [..], presente: bool, paginas: quantas páginas têm,
 *         sem: [urls lidas (sem noindex) que não têm, quando alguma tem],
 *         confirmado: false para linkedin e tiktok (padrão de terceiros) }
 *     rotulos_conversao: ['AW-.../rotulo'],
 *     eventos: { gtag: [...], fbq: [...], pintrk: [...] },
 *     consentimento: { consent_mode: bool, banner: nome ou null },
 *     verificacoes: { google_site_verification, facebook_domain_verification,
 *                     pinterest, bing } (bool; achou na meta de alguma página)
 *     paginas_lidas: n
 *   }
 *   redirecionamento_www: { de, status, para } ou null (o endereço com ou sem
 *     www, o que não for o do cadastro; para é null quando não redireciona)
 * }
 * Pagina (que abriu) = {
 *   url, status, bytes, truncada (passou de 2 MB), ms_cabecalho, ms_total
 *     (medidos do servidor do Painel, não do cliente),
 *   servidor: { server, x_powered_by, x_cache },
 *   seo: { titulo, descricao, canonical, robots, noindex, lang, h1 },
 *   og: { titulo, descricao, imagem, imagem_largura, imagem_altura, url,
 *         tipo, nome_site, atualizado_em, twitter_card },
 *   etiquetas: { ga4: [], google_ads: [], ads_rotulos: [], gtm: [],
 *                meta_pixel: [], linkedin: [], pinterest: [], tiktok: [],
 *                clarity: [], hotjar: [], contentsquare: [] },
 *   sinais: { gtag_script, meta_script, linkedin_script, linkedin_lintrk,
 *             pinterest_script, tiktok_script, clarity_script, hotjar_script,
 *             contentsquare_uxa } (bool: o script está lá mesmo sem id),
 *   eventos: { gtag: [], fbq: [], pintrk: [] },
 *   verificacoes: { google_site_verification, facebook_domain_verification,
 *                   pinterest, bing },
 *   consentimento: { consent_mode, consent_chaves: [], banner },
 *   dados_estruturados: { tipos: [], local_business: bool, nome, telefone,
 *     endereco, geo: {lat, lng} ou null, horario: bool, mesmo_que: [],
 *     logo, logo_http: bool, invalidos: n },
 *   plataforma: { wordpress, elementor, litespeed_cache, yoast, woocommerce
 *     (versões ou null), seo: 'Rank Math' | 'Yoast SEO' | ... | null, tema,
 *     scripts_base64: n },
 *   contatos: { whatsapp: [], telefones: [], emails: [], redes: [],
 *               instagram_posts: [], mapa: bool }
 * }
 * Pagina (que não abriu) = { url, status (ou null), erro: código, trecho?
 *   (até 200 letras do corpo, quando veio 403 ou 503: costuma ser o
 *   firewall da hospedagem) }
 *
 * dados.robots = { existe, status, sitemaps: [], bloqueia_tudo,
 *   bloqueia_google, regras_todos: { disallow: [], allow: [] }, grupos,
 *   linhas }
 * dados.sitemap = { url (o que respondeu) ou null, tentativas: [{ url,
 *   status, problema }], tipo: 'indice' | 'urls' | null, subs: [{ url,
 *   urls, ultima_modificacao, problema? }], subs_nao_lidos, total_urls,
 *   ultima_modificacao, urls: [{ loc, lastmod }] (até 200) }
 * dados.wordpress = { rest: bool, codigo?, base, nome, namespaces: [],
 *   plugins: [], paginas: { total, cortado, itens }, posts: { total,
 *   cortado, itens } }, item = { id, tipo: 'pagina' | 'post', titulo, link
 *   (o link permanente de hoje), link_curto (?page_id=<id> ou ?p=<id>, o
 *   mesmo texto da url da publicação antes da normalização; null sem id),
 *   slug, publicado_em, modificado_em (ISO em UTC), padrao_wp }; até 200
 *   itens de cada. codigo só vem com rest false: o código da resposta que
 *   fechou a REST (http_401, http_403, http_404, http_410 ou rest_nao_json);
 *   a frase para gente está no motivo da parte wordpress.
 * dados.dns = { dominio, spf, dmarc: { politica, registro } ou null, mx: [],
 *   verificacoes: { google_site_verification, facebook_domain_verification },
 *   txt_total }
 * dados.versoes = { wordpress | elementor | litespeed_cache | yoast |
 *   woocommerce: { site, atual, desatualizado } } (só o que o HTML mostrou)
 * dados.pagespeed = { url, celular: Psi | null, computador: Psi | null }
 *   Psi = { url_final, lighthouse, medido_em, formato, erro_execucao,
 *     notas: { desempenho, acessibilidade, boas_praticas, seo, agentes }
 *       (0 a 100; null = a categoria não veio ou a execução falhou),
 *     laboratorio: { fcp_ms, lcp_ms, tbt_ms, cls, si_ms, tti_ms, ttfb_ms },
 *     melhorar: [{ categoria, id, titulo, nota, valor, economia_ms }],
 *     agentes: { nota, passou, total, auditorias: [{ id, titulo, nota,
 *       valor, modo }] } ou null,
 *     campo_pagina, campo_origem: { geral, caiu_para_origem, lcp_ms, inp_ms,
 *       cls, fcp_ms, ttfb_ms (cada um { p75, faixa: bom|melhorar|ruim }) }
 *       ou null (pouco tráfego, ou o Google já tirou o campo do PSI),
 *     avisos_execucao: [] }
 * dados.crux = {
 *   sem_dados: bool (o Chrome não tem visitas suficientes para medir),
 *   origem: { todos, celular, computador }: Crux | null,
 *   inicio: Crux | null (a página inicial, todos os aparelhos),
 *   historico: { celular, computador }: Historico | null,
 *   semanas: [{ semana (segunda), celular: { lcp_ms, inp_ms, cls, periodo }
 *     ou null, computador: idem }] (as 8 semanas fechadas; cada período da
 *     History é uma janela de 28 dias que termina num sábado, e cai na
 *     semana desse sábado)
 * }
 *   Crux = { chave: { origem, url, aparelho }, periodo: { de, ate },
 *     metricas: { lcp_ms, inp_ms, cls, fcp_ms, ttfb_ms, rtt_ms: { p75, bom,
 *       melhorar, ruim } ou null }, lcp_partes: { ttfb_ms, atraso_carga_ms,
 *       duracao_carga_ms, atraso_render_ms } ou null, lcp_tipo, navegacao,
 *     aparelhos: frações ou null }
 *   Historico = { periodos: [{ de, ate }], lcp_ms, inp_ms, cls, fcp_ms,
 *     ttfb_ms (p75 por período, null onde faltou dado), lcp_bom, inp_bom,
 *     cls_bom (fração boa por período) }
 * dados.conferencias = [{ codigo, nivel: 'alerta' | 'atencao' | 'info',
 *   texto }]: o que a tela mostra como "achados", tirados só das partes que
 *   vieram NESTA coleta.
 * ---------------------------------------------------------------------------
 */
import { normalizarLink, somarDias, segundaDaSemana, hojeSP } from '../marketing.mjs';

export const FONTE = 'site';
// Nada é obrigatório: o HTML, o robots, o sitemap e a REST não pedem nada.
export const SECRETS = [];
// Liga só o PageSpeed e a CrUX. A tela usa para dizer "falta a chave".
export const SECRETS_OPCIONAIS = ['GOOGLE_API_KEY'];

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGINAS = 15;
const MAX_SALTOS = 3;
const MAX_TENTATIVAS_SITEMAP = 6;
const MAX_SUBSITEMAPS = 5;
const MAX_URLS_SITEMAP = 5000;
const WP_POR_PAGINA = 100; // o teto da REST (confirmado na contraprova)
const WP_MAX_PAGINAS = 10;
const WP_ITENS_NA_TELA = 200;
const PARALELO_SITE = 4; // o site é pequeno e mora em hospedagem compartilhada
const TEMPO_PAGINA = 20_000;
// O PageSpeed leva de 10 a 60 s e o Google espera até 120 s: ver
// pedirJsonDemorado (vai pelo ctx.fetch, com este tempo).
const TEMPO_PSI = 100_000;
const MIN_PSI = 30_000; // com menos que isso, o PageSpeed não termina
const MIN_PEDIDO = 5_000;
const AGENTE = 'Mozilla/5.0 (compatible; PainelImpresilk/1.0)';
const PSI = 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed';
const CRUX = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const CRUX_HIST = 'https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord';
const DNS = 'https://dns.google/resolve';
const WPORG_CORE = 'https://api.wordpress.org/core/version-check/1.7/';
const WPORG_PLUGIN = 'https://api.wordpress.org/plugins/info/1.2/';
const PRINCIPAIS = ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO'];
const PARTES = ['paginas', 'robots', 'sitemap', 'wordpress', 'dns', 'versoes', 'pagespeed', 'crux'];

export class ErroSite extends Error {
  constructor(codigo, extra = {}) { super(codigo); this.codigo = codigo; Object.assign(this, extra); }
}

// O motivo de cada parte vai para a tela como texto (revisão 2): a frase é
// para gente, e o código curto fica ao lado, em "codigo", para quem precisa
// separar um caso do outro. A chave é o código interno (ver FORMATO).
export const MOTIVOS = Object.freeze({
  sem_endereco: 'O canal Site não tem um endereço público começando com https:// (Configurações, Marketing, Canais).',
  ip_interno: 'O endereço do canal Site aponta para um IP de rede interna, e nada foi lido.',
  sem_ip: 'O DNS público não mostrou um endereço de internet para este nome, e ele não foi pedido. A próxima coleta confere de novo.',
  falha_interna: 'Um erro inesperado no conector parou esta parte; a próxima coleta tenta de novo.',
  sem_chave: 'Falta cadastrar a chave GOOGLE_API_KEY nos Secrets do Supabase.',
  chave_recusada: 'O Google recusou a chave GOOGLE_API_KEY. Confira se ela existe e se está restrita à PageSpeed Insights API e à Chrome UX Report API.',
  api_bloqueada: 'A chave GOOGLE_API_KEY não tem acesso a esta API do Google: ative a API no projeto do Google Cloud e confira as restrições da chave.',
  prazo: 'O tempo da coleta acabou antes; o que faltou vem na próxima.',
  cota: 'A cota do Google para esta chave acabou por hoje.',
  servidor: 'O Google respondeu com erro do lado dele; a próxima coleta tenta de novo.',
  recusado: 'O Google recusou o pedido desta medição.',
  sem_dados: 'O Chrome ainda não tem visitas suficientes do site para medir a experiência real.',
  medicao_falhou: 'O PageSpeed não conseguiu medir a página desta vez.',
  grande_demais: 'A resposta passou do tamanho que a coleta aceita.',
  rede: 'Não deu para falar com o site agora (rede); a próxima coleta tenta de novo.',
  certificado: 'O certificado do site foi recusado na conexão segura. Confira se ele venceu.',
  tempo_esgotado: 'O site não respondeu a tempo.',
  dns: 'O nome do site não foi achado no DNS.',
  laco: 'O endereço entra em laço de redirecionamento.',
  saltos_demais: 'O endereço redireciona vezes demais.',
  redireciona_para_fora: 'O endereço redireciona para fora do domínio cadastrado no canal Site.',
  fora_do_dominio: 'O endereço está fora do domínio cadastrado e não foi pedido.',
  limite_paginas: 'A coleta chegou ao limite de páginas por execução.',
  nao_e_sitemap: 'O endereço do sitemap respondeu, mas não com um sitemap.',
  rest_fechada: 'A API pública do WordPress está fechada para leitura de fora.',
  sem_wordpress: 'O site não mostrou a API do WordPress (pode não ser WordPress).',
  algumas_paginas: 'Parte das páginas não abriu nesta coleta.',
  nada_a_conferir: 'O site não mostrou versão do WordPress nem de plugin para conferir.',
});
// O mesmo código diz coisas diferentes em cada parte: quem não respondeu
// na parte dns é o DNS do Google, e não o site.
const POR_PARTE = {
  dns: { sem_resposta: 'O DNS público do Google não respondeu desta vez.', tempo_esgotado: 'O DNS público do Google não respondeu a tempo.' },
  versoes: { sem_resposta: 'O api.wordpress.org não respondeu desta vez.' },
  pagespeed: { sem_resposta: 'O Google não respondeu desta vez.' },
  crux: { sem_resposta: 'O Google não respondeu desta vez.' },
};

/** O código curto da parte em frase para gente. Código desconhecido vira uma
 *  frase genérica (nunca o código cru na tela). */
export function fraseDoMotivo(codigo, parte = null) {
  if (!codigo) return null;
  const http = /^http_(\d{3})$/.exec(codigo);
  if (http) return `O site respondeu com erro ${http[1]}.`;
  const daParte = POR_PARTE[parte]?.[codigo];
  if (daParte) return daParte;
  if (codigo === 'sem_resposta') return 'Não houve resposta desta vez; a próxima coleta tenta de novo.';
  return MOTIVOS[codigo] ?? 'Esta parte não veio nesta coleta; a próxima tenta de novo.';
}

/** A parte no formato do contrato: motivo em frase, código ao lado. */
function parteDe(nome, estado, codigo, coletadoEm) {
  return codigo
    ? { estado, motivo: fraseDoMotivo(codigo, nome), codigo, coletado_em: coletadoEm }
    : { estado, coletado_em: coletadoEm };
}

// ------------------------------------------------------------- segurança --

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
// Nome que só existe dentro de rede (ou reservado para teste) não é site.
const RESERVADOS = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|test|invalid|example|onion)$/i;

function hostPublico(host) {
  if (!host || host.includes('[') || host.includes(':') || IPV4.test(host)) return false;
  // TLD só de letras: tira IP disfarçado (o parser de URL converte
  // "2130706433" e "0x7f.1" para pontos) e nome sem domínio.
  if (!/^[a-z0-9.-]+$/.test(host) || !/\.[a-z]{2,}$/.test(host)) return false;
  if (RESERVADOS.test(host)) return false;
  return host.split('.').every((p) => p && p.length <= 63 && !p.startsWith('-') && !p.endsWith('-'));
}

/** O nome como o DNS o enxerga: minúsculo e sem o ponto final. Para o
 *  resolvedor, "www.exemplo.com.br." (com o ponto da raiz do DNS) é o MESMO
 *  nome que "www.exemplo.com.br", e o parser de URL vira "%2E" e os pontos
 *  largos (U+3002, U+FF0E, U+FF61) nesse ponto final. Antes, a URL saía
 *  daqui COM o ponto e a trava do semIp (que guarda o nome sem ponto) não a
 *  reconhecia: um 301 para "https://www.<domínio>./" levava o pedido ao nome
 *  que o DNS público não mostrou (revisão 2, achado de segurança). Só UM
 *  ponto sai: dois pontos no fim deixam um rótulo vazio, e o hostPublico
 *  recusa. */
export const hostSemPonto = (h) => String(h ?? '').toLowerCase().replace(/\.$/, '');

/** Do url_perfil do canal site: { dominio (sem www), host, inicio } ou null.
 *  O cadastro pode estar em http://; a leitura é sempre em https. */
export function dominioDoSite(urlPerfil) {
  let u;
  try { u = new URL(String(urlPerfil ?? '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port) return null;
  const host = hostSemPonto(u.hostname);
  if (!hostPublico(host)) return null;
  return { dominio: host.replace(/^www\./, ''), host, inicio: `https://${host}/` };
}

/** A URL, limpa do "#" e com o nome SEM o ponto final, se ela pode ser
 *  pedida; senão null. É esta URL que vai para a rede, para o "vistos" (o
 *  laço) e para a trava do semIp: o nome conferido é o mesmo texto que sai. */
export function alvoPermitido(url, dominio) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = hostSemPonto(u.hostname);
  if (!hostPublico(host) || (host !== dominio && host !== `www.${dominio}`)) return null;
  if (u.hostname !== host) u.hostname = host;
  u.hash = '';
  return u.toString();
}

const hostDe = (u) => { try { return hostSemPonto(new URL(u).hostname); } catch { return null; } };

/** IP que não é de internet: rede interna, loopback, link-local (onde mora o
 *  metadado da nuvem), CGNAT, multicast e reservados. O que nem é IP também
 *  conta como interno (resposta estranha do DNS não abre a porta). */
export function ipPrivado(ip) {
  const s = String(ip ?? '').trim().toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.replace(/^::ffff:/, ''));
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (s.includes(':')) return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^::ffff:/.test(s) || /^64:ff9b:/.test(s);
  return true;
}

/** O que o DNS público diz de cada nome, ANTES do primeiro pedido ao site.
 *  A trava de nome não pega "127.0.0.1.nip.io"; o DNS pega. Pergunta ao
 *  dns.google (A e AAAA) e separa os nomes em:
 *   - internos: algum A ou AAAA de rede interna;
 *   - semIp: o dns.google RESPONDEU às duas perguntas e não deu nenhum A
 *     nem AAAA (Status de erro como NXDOMAIN e SERVFAIL, resposta vazia, ou
 *     só um CNAME). Isso NÃO é "conferido": o resolvedor do servidor do
 *     Painel pode achar um IP interno onde o Google não achou nada;
 *   - naoConferidos: o dns.google não respondeu (rede, tempo). Aí a coleta
 *     segue (DNS do Google fora do ar não para tudo) e o diário registra.
 *  Os nomes que mostraram IP de internet ficam de fora das três listas. */
export async function conferirDns(ctx, hosts, prazo) {
  if (!(Number(prazo()) >= MIN_PEDIDO)) return { internos: [], semIp: [], naoConferidos: [...hosts] };
  const consultas = hosts.flatMap((h) => [['A', 1], ['AAAA', 28]].map(([tipo, n]) => ({ h, tipo, n })));
  const rs = await Promise.all(consultas.map((q) => pedirJson(ctx, `${DNS}?name=${encodeURIComponent(q.h)}&type=${q.tipo}`, { method: 'GET', rotulo: `dns ${q.tipo}` })));
  const porHost = new Map(hosts.map((h) => [h, { respostas: 0, perguntas: 0, publico: false, interno: false }]));
  rs.forEach((r, i) => {
    const e = porHost.get(consultas[i].h);
    e.perguntas++;
    if (!r.ok || !objeto(r.corpo)) return;
    e.respostas++;
    for (const a of Array.isArray(r.corpo.Answer) ? r.corpo.Answer : []) {
      if (a?.type !== consultas[i].n) continue;
      if (ipPrivado(a.data)) e.interno = true; else e.publico = true;
    }
  });
  const internos = [], semIp = [], naoConferidos = [];
  for (const [h, e] of porHost) {
    if (e.interno) internos.push(h);
    else if (e.publico) continue;
    else if (e.respostas === e.perguntas) semIp.push(h);
    else naoConferidos.push(h);
  }
  return { internos, semIp, naoConferidos };
}

/** Endereço que pode ir para `dados`: só http:// ou https:// absoluto, até
 *  `max` letras; o resto (javascript:, data:, relativo, lixo) vira null. O
 *  texto vem do HTML do site, e um link desses na tela rodaria script na
 *  origem do Painel, onde mora o crachá. */
export function urlHttp(v, max = 500) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 2048 || /[\u0000-\u001f\u007f]/.test(t)) return null;
  let u;
  try { u = new URL(t); } catch { return null; }
  return u.protocol === 'http:' || u.protocol === 'https:' ? t.slice(0, max) : null;
}

// ------------------------------------------------------ pedidos ao site --

const CABECALHOS = ['server', 'x-powered-by', 'x-cache', 'content-type', 'content-length', 'x-wp-total', 'x-wp-totalpages', 'x-robots-tag', 'link'];
function cabecalhos(h) {
  const fora = {};
  for (const k of CABECALHOS) { const v = h?.get?.(k); if (v != null) fora[k] = String(v).slice(0, 500); }
  return fora;
}

function motivoDeRede(e) {
  const nome = String(e?.name ?? ''), msg = String(e?.message ?? '');
  // ErroFonte da coletora: 'tempo' (fim do orçamento) e 'url_recusada'.
  if (e?.codigo === 'tempo' || nome === 'TimeoutError' || nome === 'AbortError') return 'tempo_esgotado';
  if (e?.codigo === 'url_recusada') return 'fora_do_dominio';
  // Certificado vencido aparece assim: o fetch do Deno falha no aperto de mão.
  if (/certificate|cert_|ssl|tls/i.test(msg)) return 'certificado';
  if (/dns|resolve|ENOTFOUND|getaddrinfo|name not known/i.test(msg)) return 'dns';
  return 'rede';
}

async function descartar(r) { try { await r?.body?.cancel?.(); } catch { /* corpo já fechado */ } }

/** Lê o corpo até `max` bytes e para: uma página de 50 MB não entra inteira
 *  na memória da função (256 MB para tudo). */
export async function lerCorpo(r, max = MAX_BYTES) {
  if (!r?.body?.getReader) {
    const t = typeof r?.text === 'function' ? await r.text() : '';
    const b = new TextEncoder().encode(t);
    return b.byteLength > max
      ? { texto: new TextDecoder().decode(b.subarray(0, max)), bytes: max, truncado: true }
      : { texto: t, bytes: b.byteLength, truncado: false };
  }
  const leitor = r.body.getReader();
  const pedacos = [];
  let total = 0, truncado = false;
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    if (!value?.byteLength) continue;
    if (total + value.byteLength > max) {
      pedacos.push(value.subarray(0, max - total));
      total = max;
      truncado = true;
      try { await leitor.cancel(); } catch { /* já fechou */ }
      break;
    }
    pedacos.push(value);
    total += value.byteLength;
  }
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) { junto.set(p, pos); pos += p.byteLength; }
  return { texto: new TextDecoder('utf-8').decode(junto), bytes: total, truncado };
}

/** O buscador de texto do site, com todas as travas. Devolve
 *  { url, status, texto, bytes, truncado, headers, caminho, ms_cabecalho,
 *  ms_total } para qualquer status final (403 e 404 também: é fato do site),
 *  e lança ErroSite quando não há resposta ou o caminho sai da regra.
 *  Com { seguir: false } devolve o primeiro redirecionamento sem segui-lo. */
export function criarBuscador(fetchBruto, dominio, { prazo = () => Infinity, contar = () => {}, semIp = [] } = {}) {
  // Os nomes que o DNS público não mostrou com IP de internet (conferirDns):
  // nunca são pedidos, nem no meio de um redirecionamento. Os dois lados da
  // comparação vão sem o ponto final (hostSemPonto): "www.x." e "www.x" são
  // o mesmo nome para o resolvedor, e tem de ser para a trava também.
  const bloqueados = new Set((Array.isArray(semIp) ? semIp : []).map(hostSemPonto));
  return async function buscar(url, { seguir = true, max = MAX_BYTES } = {}) {
    let atual = alvoPermitido(url, dominio);
    if (!atual) throw new ErroSite('fora_do_dominio');
    const caminho = [];
    const vistos = new Set([atual]);
    const t0 = Date.now();
    for (;;) {
      if (bloqueados.has(hostDe(atual))) throw new ErroSite('sem_ip', { url: atual, caminho });
      const resta = Number(prazo());
      if (!(resta >= MIN_PEDIDO)) throw new ErroSite('prazo', { url: atual });
      let r;
      try {
        contar();
        r = await fetchBruto(atual, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'user-agent': AGENTE, accept: 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9,*/*;q=0.5' },
          signal: AbortSignal.timeout(Math.max(1000, Math.min(TEMPO_PAGINA, resta - 1000))),
        });
      } catch (e) {
        throw new ErroSite(motivoDeRede(e), { url: atual });
      }
      const msCabecalho = Date.now() - t0;
      const local = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (local) {
        await descartar(r);
        let prox = null;
        try { prox = new URL(local, atual).toString(); } catch { prox = null; }
        const permitido = prox ? alvoPermitido(prox, dominio) : null;
        if (!seguir) return { url: atual, status: r.status, para: permitido, fora: !permitido, caminho, ms_cabecalho: msCabecalho };
        caminho.push({ de: atual, para: permitido, status: r.status });
        if (!permitido) throw new ErroSite('redireciona_para_fora', { url: atual, status: r.status, caminho });
        if (vistos.has(permitido)) throw new ErroSite('laco', { url: atual, status: r.status, caminho });
        if (caminho.length > MAX_SALTOS) throw new ErroSite('saltos_demais', { url: atual, status: r.status, caminho });
        vistos.add(permitido);
        atual = permitido;
        continue;
      }
      if (!seguir) { await descartar(r); return { url: atual, status: r.status, para: null, fora: false, caminho, ms_cabecalho: msCabecalho }; }
      const corpo = await lerCorpo(r, max);
      return { url: atual, status: r.status, ...corpo, headers: cabecalhos(r.headers), caminho, ms_cabecalho: msCabecalho, ms_total: Date.now() - t0 };
    }
  };
}

// --------------------------------------------- pedidos de JSON (fixos) --

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

function jsonSeguro(t) {
  if (typeof t !== 'string') return t ?? null;
  try { return JSON.parse(t.replace(/^\uFEFF/, '').trim()); } catch { return null; }
}

/** Chama o ctx.fetchJson e devolve { ok, corpo } ou { ok: false, status,
 *  corpo }. Aceita o erro lançado com .status e .corpo (ou body/json) e
 *  também um envelope { status, json }: o formato exato da coletora ainda
 *  não existe quando este arquivo foi escrito. Nunca repassa a mensagem do
 *  provedor para fora (a do Google pode citar o consumidor da chave). */
async function pedirJson(ctx, url, opcoes) {
  if (typeof ctx?.fetchJson !== 'function') return { ok: false, status: null, corpo: null, sem_fetch: true };
  try {
    const r = await ctx.fetchJson(url, opcoes);
    if (objeto(r) && Number.isInteger(r.status) && ('json' in r || 'corpo' in r || 'dados' in r)) {
      const corpo = jsonSeguro(r.json ?? r.corpo ?? r.dados);
      return r.status >= 200 && r.status < 300 ? { ok: true, corpo } : { ok: false, status: r.status, corpo };
    }
    return { ok: true, corpo: r };
  } catch (e) {
    let status = Number(e?.status ?? e?.statusCode ?? e?.http);
    if (!Number.isInteger(status)) { const m = /HTTP\s*([1-5]\d\d)/i.exec(String(e?.message ?? '')); status = m ? Number(m[1]) : null; }
    const corpo = jsonSeguro(e?.corpo ?? e?.body ?? e?.json ?? e?.dados ?? e?.resposta ?? null);
    const nome = String(e?.name ?? '');
    return { ok: false, status, corpo, tempo: nome === 'TimeoutError' || nome === 'AbortError' || e?.codigo === 'tempo' };
  }
}

const MAX_BYTES_API = 8 * 1024 * 1024; // o mesmo teto que a coletora usa para API

/** O PageSpeed leva de 10 a 60 s (o Google espera até 120 s), e o
 *  ctx.fetchJson corta TODA chamada em 20 s: pelo fetchJson, metade das
 *  medições morreria no meio. Por isso o PageSpeed vai pelo ctx.fetch (o
 *  fetch cru da coletora, que confere o host, conta no diário e aborta no
 *  fim do orçamento), com o tempo dele. Sem ctx.fetch, cai no fetchJson
 *  pedindo timeoutMs. Lê no máximo 8 MB (a resposta traz capturas de tela
 *  em base64, que não são guardadas). */
async function pedirJsonDemorado(ctx, url, { headers, rotulo, timeoutMs }) {
  if (typeof ctx?.fetch !== 'function') return pedirJson(ctx, url, { method: 'GET', headers, rotulo, timeoutMs });
  const tempo = (e) => { const n = String(e?.name ?? ''); return n === 'TimeoutError' || n === 'AbortError' || e?.codigo === 'tempo'; };
  let r, lido;
  try {
    r = await ctx.fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
    lido = await lerCorpo(r, MAX_BYTES_API);
  } catch (e) {
    return { ok: false, status: null, corpo: null, tempo: tempo(e) };
  }
  if (lido.truncado) return { ok: false, status: null, corpo: null, grande: true };
  const corpo = jsonSeguro(lido.texto);
  if (r.status >= 200 && r.status < 300 && objeto(corpo)) return { ok: true, corpo };
  return { ok: false, status: r.status >= 200 && r.status < 300 ? null : r.status, corpo };
}

/** Erro do Google em código curto. 404 na CrUX é "sem dados" (site com pouca
 *  visita), não falha. chave_recusada vale para as duas APIs; api_bloqueada
 *  só para a API que respondeu (a chave pode estar restrita a uma só). */
export function motivoGoogle(status, corpo) {
  const erro = objeto(corpo?.error) ? corpo.error : {};
  const razoes = [...(Array.isArray(erro.details) ? erro.details : []), ...(Array.isArray(erro.errors) ? erro.errors : [])]
    .map((d) => String(d?.reason ?? '')).filter(Boolean);
  if (status === 404) return 'sem_dados';
  if (razoes.some((r) => ['API_KEY_INVALID', 'API_KEY_EXPIRED', 'keyInvalid', 'keyExpired'].includes(r))) return 'chave_recusada';
  if (status === 401) return 'chave_recusada';
  if (status === 400 && /api key not valid|api key expired/i.test(String(erro.message ?? ''))) return 'chave_recusada';
  if (status === 403) return 'api_bloqueada';
  if (status === 429) return 'cota';
  if (status === 400) return 'recusado';
  if (status >= 500) return 'servidor';
  return 'sem_resposta';
}
const DE_CHAVE = new Set(['chave_recusada', 'api_bloqueada']);

// ------------------------------------------------------------ texto/HTML --

const MARCAS = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308', cedil: '\u0327', ring: '\u030A' };
const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '\u2026', ndash: '\u2013', mdash: '\u2014',
  laquo: '\u00AB', raquo: '\u00BB', ldquo: '\u201C', rdquo: '\u201D', lsquo: '\u2018', rsquo: '\u2019', copy: '\u00A9',
  reg: '\u00AE', trade: '\u2122', ordm: '\u00BA', ordf: '\u00AA', deg: '\u00B0', middot: '\u00B7', bull: '\u2022', szlig: '\u00DF',
};

/** Entidades HTML do título da REST e dos atributos (&#8211;, &amp;, &aacute;). */
export function decodificarEntidades(t) {
  return String(t ?? '').replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,10});/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m;
    }
    if (ENTIDADES[e] != null) return ENTIDADES[e];
    const a = /^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil|ring)$/.exec(e);
    return a ? (a[1] + MARCAS[a[2]]).normalize('NFC') : m;
  });
}

function limparTexto(t, max = 300) {
  if (t == null) return null;
  const s = decodificarEntidades(String(t).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Atributos de uma tag, em qualquer ordem e com aspas simples, duplas ou
 *  sem aspas (a verificação do Search Console pode vir de qualquer jeito). */
export function atributos(tag) {
  const fora = {};
  const re = /([^\s=<>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of String(tag).matchAll(re)) {
    const k = m[1].toLowerCase();
    if (!(k in fora)) fora[k] = decodificarEntidades(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return fora;
}
const tagsDe = (html, nome) => html.match(new RegExp(`<${nome}\\b[^>]*>`, 'gi')) ?? [];

function base64ParaTexto(b64) {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return ''; }
}

/** O LiteSpeed Cache troca script inline por src="data:...;base64,...". A
 *  etiqueta pode estar lá dentro: decodifica antes de procurar. */
export function scriptsBase64(html) {
  const re = /\b(?:data-)?src\s*=\s*["']data:(?:text|application)\/(?:x-)?javascript;base64,([A-Za-z0-9+/=\s]{4,2000000})["']/gi;
  const fora = [];
  for (const m of String(html).matchAll(re)) {
    if (fora.length >= 100) break;
    const t = base64ParaTexto(m[1]);
    if (t) fora.push(t.slice(0, 500_000));
  }
  return fora;
}

// As etiquetas. Cada lista de padrões captura o id no grupo 1.
const PADROES = {
  ga4: [/gtag\/js\?id=(G-[A-Z0-9]{4,20})/g, /gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]{4,20})['"]/g],
  google_ads: [/gtag\/js\?id=(AW-[0-9]{6,15})/g, /gtag\(\s*['"]config['"]\s*,\s*['"](AW-[0-9]{6,15})['"]/g],
  ads_rotulos: [/send_to['"]?\s*:\s*['"](AW-[0-9]{6,15}\/[A-Za-z0-9_-]{4,40})['"]/g],
  // O snippet oficial do GTM monta a URL em pedaços: o id entre aspas basta.
  gtm: [/googletagmanager\.com\/(?:gtm\.js|ns\.html)\?id=(GTM-[A-Z0-9]{4,10})/g, /['"](GTM-[A-Z0-9]{4,10})['"]/g],
  meta_pixel: [/fbq\(\s*['"]init['"]\s*,\s*['"]?([0-9]{10,20})/g, /facebook\.com\/tr\/?\?id=([0-9]{10,20})/g],
  // Não confirmados na doc oficial (vêm de guias): ver NAO_CONFIRMADOS.
  linkedin: [/_linkedin_partner_id\s*=\s*['"]?([0-9]{3,12})/g, /px\.ads\.linkedin\.com\/collect\/?\?pid=([0-9]{3,12})/g],
  pinterest: [/pintrk\(\s*['"]load['"]\s*,\s*['"]([0-9]{6,20})['"]/g, /ct\.pinterest\.com\/v3\/?\?tid=([0-9]{6,20})/g],
  tiktok: [/ttq\.load\(\s*['"]([A-Z0-9]{10,30})['"]/g],
  // Contraprova: o código oficial monta "https://www.clarity.ms/tag/" + id;
  // o id só aparece na chamada final. O segundo padrão pega o raro plugin
  // que escreve a URL inteira.
  clarity: [/\(\s*window\s*,\s*document\s*,\s*['"]clarity['"]\s*,\s*['"]script['"]\s*,\s*['"]([A-Za-z0-9]{6,20})['"]\s*\)/g, /clarity\.ms\/tag\/([A-Za-z0-9]{6,20})/g],
  hotjar: [/hjid\s*:\s*([0-9]{4,12})/g, /static\.hotjar\.com\/c\/hotjar-([0-9]{4,12})\.js/g],
  contentsquare: [/t\.contentsquare\.net\/uxa\/([A-Za-z0-9]{6,20})\.js/g],
};
const SINAIS = {
  gtag_script: /googletagmanager\.com\/gtag\/js/,
  meta_script: /connect\.facebook\.net\/[A-Za-z_]+\/fbevents\.js/,
  linkedin_script: /snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/,
  linkedin_lintrk: /\blintrk\b/,
  pinterest_script: /s\.pinimg\.com\/ct\/core\.js/,
  tiktok_script: /analytics\.tiktok\.com\/i18n\/pixel\/events\.js/,
  clarity_script: /www\.clarity\.ms\/tag\//,
  hotjar_script: /static\.hotjar\.com\/c\/hotjar-/,
  contentsquare_uxa: /window\._uxa\b/,
};
// Qual sinal conta como "a etiqueta está lá" quando o id não foi achado.
const SINAL_DA_ETIQUETA = {
  meta_pixel: ['meta_script'], linkedin: ['linkedin_script', 'linkedin_lintrk'], pinterest: ['pinterest_script'],
  tiktok: ['tiktok_script'], clarity: ['clarity_script'], hotjar: ['hotjar_script'], contentsquare: ['contentsquare_uxa'],
};
export const TIPOS_ETIQUETA = ['ga4', 'google_ads', 'gtm', 'meta_pixel', 'linkedin', 'pinterest', 'tiktok', 'clarity', 'hotjar', 'contentsquare'];
const NAO_CONFIRMADOS = ['linkedin', 'tiktok'];
const BANNERS = [
  ['CookieYes', /cdn-cookieyes\.com\/client_data\//], ['Complianz', /\bcmplz[-_]/], ['Cookie Notice', /id\s*=\s*["']cookie-notice["']/],
  ['Cookiebot', /consent\.cookiebot\.com\/uc\.js/], ['GDPR Cookie Compliance', /moove_gdpr/], ['Real Cookie Banner', /real-cookie-banner/],
  ['Borlabs Cookie', /BorlabsCookie/],
];
const LOCAL_BUSINESS = new Set(['LocalBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness', 'AutomotiveBusiness', 'EntertainmentBusiness',
  'FinancialService', 'FoodEstablishment', 'HealthAndBeautyBusiness', 'LegalService', 'LodgingBusiness', 'MedicalBusiness', 'RealEstateAgent',
  'SportsActivityLocation', 'TravelAgency', 'EmploymentAgency', 'GovernmentOffice', 'RecyclingCenter', 'SelfStorage', 'ShoppingCenter',
  'ChildCare', 'DryCleaningOrLaundry', 'EmergencyService', 'InternetCafe', 'Library', 'TouristInformationCenter', 'AnimalShelter',
  'Electrician', 'GeneralContractor', 'HousePainter', 'Locksmith', 'Plumber', 'RoofingContractor', 'HVACBusiness', 'MovingCompany']);

const unicos = (xs, max = 20) => [...new Set(xs.filter((x) => x != null && x !== ''))].slice(0, max);
function capturar(texto, padroes, max = 10) {
  const fora = [];
  for (const re of padroes) for (const m of texto.matchAll(re)) fora.push(m[1]);
  return unicos(fora, max);
}

function lerJsonLd(html) {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nos = [];
  let invalidos = 0;
  for (const m of html.matchAll(re)) {
    let j;
    try { j = JSON.parse(m[1].trim()); } catch { invalidos++; continue; }
    for (const n of [].concat(j)) {
      if (!objeto(n)) continue;
      if (Array.isArray(n['@graph'])) nos.push(...n['@graph'].filter(objeto)); else nos.push(n);
    }
  }
  const tiposDe = (n) => [].concat(n['@type'] ?? []).map(String);
  const tipos = unicos(nos.flatMap(tiposDe), 30);
  const ehLocal = (n) => tiposDe(n).some((t) => LOCAL_BUSINESS.has(t) || /Store$/.test(t));
  const principal = nos.find(ehLocal) ?? nos.find((n) => tiposDe(n).some((t) => t === 'Organization' || t === 'Corporation')) ?? null;
  const porId = (ref) => (objeto(ref) && ref['@id'] && !ref.url ? nos.find((n) => n['@id'] === ref['@id']) ?? ref : ref);
  const logoBruto = porId(principal?.logo);
  const logo = typeof logoBruto === 'string' ? logoBruto : typeof logoBruto?.url === 'string' ? logoBruto.url : typeof logoBruto?.contentUrl === 'string' ? logoBruto.contentUrl : null;
  const end = porId(principal?.address);
  const endereco = typeof end === 'string' ? limparTexto(end, 200)
    : objeto(end) ? limparTexto([end.streetAddress, end.addressLocality, end.addressRegion].filter(Boolean).join(', '), 200) : null;
  const geo = porId(principal?.geo);
  const lat = Number(geo?.latitude), lng = Number(geo?.longitude);
  return {
    tipos,
    local_business: nos.some(ehLocal),
    nome: limparTexto(principal?.name, 160),
    telefone: limparTexto(principal?.telephone, 40),
    endereco,
    geo: geo && Number.isFinite(lat) && Number.isFinite(lng) && geo.latitude != null && geo.longitude != null ? { lat, lng } : null,
    horario: !!(principal?.openingHoursSpecification || principal?.openingHours),
    mesmo_que: unicos([].concat(principal?.sameAs ?? []).map((s) => urlHttp(s, 200)), 10),
    logo: urlHttp(logo, 300),
    logo_http: !!logo && /^http:\/\//i.test(logo),
    invalidos,
  };
}

const REDES = /^https?:\/\/(?:www\.|m\.|br\.)?(instagram\.com|facebook\.com|fb\.com|linkedin\.com|pinterest\.com(?:\.br)?|youtube\.com|tiktok\.com|x\.com|twitter\.com)\/([^?#"'\s]*)/i;
const NAO_E_PERFIL = /^(p|reel|reels|tv|stories|share|sharer|sharer\.php|intent|watch|embed|pin|dialog|plugins)(\/|$)/i;

function lerContatos(html) {
  const hrefs = [...html.matchAll(/\bhref\s*=\s*["']([^"']{1,500})["']/gi)].map((m) => decodificarEntidades(m[1]).trim());
  const whatsapp = [], telefones = [], emails = [], redes = [], posts = [];
  let mapa = false;
  for (const h of hrefs) {
    const w = /^(?:https?:\/\/)?(?:wa\.me\/|(?:api\.|web\.)?whatsapp\.com\/send\/?\?(?:[^#]*?&)?phone=)\+?([0-9]{8,15})/i.exec(h);
    if (w) { whatsapp.push(w[1]); continue; }
    const t = /^tel:([+0-9 ().-]{6,30})/i.exec(h);
    if (t) { telefones.push(t[1].replace(/[^0-9+]/g, '')); continue; }
    const e = /^mailto:([^?\s]{3,120})/i.exec(h);
    if (e) { emails.push(e[1].toLowerCase()); continue; }
    if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|g\.page\//i.test(h)) { mapa = true; continue; }
    const r = REDES.exec(h);
    if (r) {
      const rede = r[1].toLowerCase().replace(/^fb\.com$/, 'facebook.com');
      const caminho = r[2].replace(/\/+$/, '');
      const post = /^(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/.exec(caminho);
      if (rede === 'instagram.com' && post) { posts.push(post[1]); continue; }
      if (caminho && !NAO_E_PERFIL.test(caminho)) redes.push(`https://www.${rede}/${caminho}`.toLowerCase().slice(0, 200));
    }
  }
  return { whatsapp: unicos(whatsapp, 10), telefones: unicos(telefones, 10), emails: unicos(emails, 10), redes: unicos(redes, 15), instagram_posts: unicos(posts, 20), mapa };
}

/** Tudo o que se lê de UMA página. Função pura: html e os cabeçalhos que o
 *  buscador guardou (minúsculos). */
export function lerPagina(html, cab = {}) {
  const bruto = String(html ?? '');
  const decodificados = scriptsBase64(bruto);
  const tudo = decodificados.length ? `${bruto}\n${decodificados.join('\n')}` : bruto;
  const fimHead = bruto.search(/<\/head>/i);
  const head = fimHead > 0 ? bruto.slice(0, fimHead) : bruto;

  const metas = {}, geradores = [];
  for (const tag of tagsDe(bruto, 'meta')) {
    const a = atributos(tag);
    const k = String(a.name ?? a.property ?? a['http-equiv'] ?? '').toLowerCase();
    if (!k || a.content == null) continue;
    if (k === 'generator') geradores.push(a.content);
    else if (!(k in metas)) metas[k] = a.content;
  }
  const links = tagsDe(head, 'link').map(atributos);
  const canonical = links.find((l) => String(l.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'))?.href ?? null;
  const htmlTag = atributos(tagsDe(bruto, 'html')[0] ?? '');
  const bodyTag = atributos(tagsDe(bruto, 'body')[0] ?? '');
  const titulo = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const robots = metas.robots ?? null;
  const noindex = /noindex/i.test(robots ?? '') || /noindex/i.test(cab['x-robots-tag'] ?? '');

  const etiquetas = {};
  for (const [k, padroes] of Object.entries(PADROES)) etiquetas[k] = capturar(tudo, padroes);
  const sinais = {};
  for (const [k, re] of Object.entries(SINAIS)) sinais[k] = re.test(tudo);

  const consent = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]([\s\S]{0,600})/.exec(tudo);
  const chavesConsent = consent ? ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'].filter((c) => consent[1].includes(c)) : [];

  const versao = (re) => { for (const g of geradores) { const m = re.exec(g); if (m) return m[1]; } return null; };
  const seo = /rank-math-schema|Rank Math/i.test(bruto) ? 'Rank Math'
    : /Yoast SEO/i.test(bruto) ? 'Yoast SEO'
      : /All in One SEO|aioseo/i.test(bruto) ? 'All in One SEO'
        : /SEOPress/i.test(bruto) ? 'SEOPress' : null;
  const tema = /\bwp-theme-([a-z0-9_-]+)/i.exec(bodyTag.class ?? '')?.[1] ?? /\/wp-content\/themes\/([a-z0-9_-]+)\//i.exec(bruto)?.[1] ?? null;

  return {
    seo: {
      titulo: limparTexto(titulo, 300),
      descricao: limparTexto(metas.description, 400),
      canonical: urlHttp(canonical),
      robots: robots ? robots.slice(0, 200) : null,
      noindex,
      lang: htmlTag.lang ? htmlTag.lang.slice(0, 20) : null,
      h1: (bruto.match(/<h1\b/gi) ?? []).length,
    },
    og: {
      titulo: limparTexto(metas['og:title'], 300),
      descricao: limparTexto(metas['og:description'], 400),
      imagem: urlHttp(metas['og:image']),
      imagem_largura: Number.isFinite(parseInt(metas['og:image:width'], 10)) ? parseInt(metas['og:image:width'], 10) : null,
      imagem_altura: Number.isFinite(parseInt(metas['og:image:height'], 10)) ? parseInt(metas['og:image:height'], 10) : null,
      url: urlHttp(metas['og:url']),
      tipo: limparTexto(metas['og:type'], 40),
      nome_site: limparTexto(metas['og:site_name'], 160),
      atualizado_em: limparTexto(metas['og:updated_time'], 40),
      twitter_card: limparTexto(metas['twitter:card'], 40),
    },
    etiquetas,
    sinais,
    eventos: {
      gtag: capturar(tudo, [/gtag\(\s*['"]event['"]\s*,\s*['"]([A-Za-z0-9_]{1,40})['"]/g], 30),
      fbq: capturar(tudo, [/fbq\(\s*['"](?:track|trackCustom)['"]\s*,\s*['"]([A-Za-z0-9_]{1,40})['"]/g], 30),
      pintrk: capturar(tudo, [/pintrk\(\s*['"]track['"]\s*,\s*['"]([A-Za-z0-9_]{1,40})['"]/g], 30),
    },
    // Só se há a meta, não o código: ele não serve para nada na tela.
    verificacoes: {
      google_site_verification: !!metas['google-site-verification'],
      facebook_domain_verification: !!metas['facebook-domain-verification'],
      pinterest: !!metas['p:domain_verify'],
      bing: !!metas['msvalidate.01'],
    },
    consentimento: {
      consent_mode: !!consent,
      consent_chaves: chavesConsent,
      banner: BANNERS.find(([, re]) => re.test(tudo))?.[0] ?? null,
    },
    dados_estruturados: lerJsonLd(bruto),
    plataforma: {
      wordpress: versao(/^WordPress\s+([\d.]+)/i),
      elementor: versao(/^Elementor\s+([\d.]+)/i),
      woocommerce: versao(/^WooCommerce\s+([\d.]+)/i),
      litespeed_cache: /LiteSpeed Cache\s+([\d.]+)/.exec(bruto)?.[1] ?? null,
      yoast: /Yoast SEO plugin v([\d.]+)/i.exec(bruto)?.[1] ?? null,
      seo,
      tema: tema ? tema.toLowerCase().slice(0, 60) : null,
      scripts_base64: decodificados.length,
    },
    contatos: lerContatos(bruto),
  };
}

const presente = (p, t) => p.etiquetas[t].length > 0 || (SINAL_DA_ETIQUETA[t] ?? []).some((s) => p.sinais[s]);
const abriu = (p) => p && p.status >= 200 && p.status < 300 && !!p.etiquetas;

/** A soma das páginas lidas: o que aparece onde, e onde falta. */
export function somarEtiquetas(paginas) {
  const ok = paginas.filter(abriu);
  const consideradas = ok.filter((p) => !p.seo?.noindex);
  const tipos = {};
  for (const t of TIPOS_ETIQUETA) {
    const com = ok.filter((p) => presente(p, t));
    tipos[t] = {
      ids: unicos(ok.flatMap((p) => p.etiquetas[t]), 10),
      presente: com.length > 0,
      paginas: com.length,
      sem: com.length ? consideradas.filter((p) => !presente(p, t)).map((p) => p.url).slice(0, 15) : [],
      confirmado: !NAO_CONFIRMADOS.includes(t),
    };
  }
  const algum = (f) => ok.some(f);
  return {
    tipos,
    rotulos_conversao: unicos(ok.flatMap((p) => p.etiquetas.ads_rotulos), 20),
    eventos: {
      gtag: unicos(ok.flatMap((p) => p.eventos.gtag), 40),
      fbq: unicos(ok.flatMap((p) => p.eventos.fbq), 40),
      pintrk: unicos(ok.flatMap((p) => p.eventos.pintrk), 40),
    },
    consentimento: { consent_mode: algum((p) => p.consentimento.consent_mode), banner: ok.map((p) => p.consentimento.banner).find(Boolean) ?? null },
    verificacoes: {
      google_site_verification: algum((p) => p.verificacoes.google_site_verification),
      facebook_domain_verification: algum((p) => p.verificacoes.facebook_domain_verification),
      pinterest: algum((p) => p.verificacoes.pinterest),
      bing: algum((p) => p.verificacoes.bing),
    },
    paginas_lidas: ok.length,
  };
}

// --------------------------------------------------- robots e sitemap --

export function lerRobots(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const sitemaps = [], grupos = [];
  let atual = null, ultimoFoiAgente = false;
  for (const l of linhas) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
    if (!m) continue;
    const campo = m[1].toLowerCase(), valor = m[2].trim();
    // O endereço vem do arquivo do site: só http(s) absoluto vai adiante.
    if (campo === 'sitemap') { const u = urlHttp(valor); if (u) sitemaps.push(u); continue; }
    if (campo === 'user-agent') {
      // Vários User-agent seguidos dividem o mesmo grupo de regras.
      if (!atual || !ultimoFoiAgente) { atual = { agentes: [], disallow: [], allow: [] }; grupos.push(atual); }
      atual.agentes.push(valor.toLowerCase());
      ultimoFoiAgente = true;
      continue;
    }
    ultimoFoiAgente = false;
    if (!atual) continue;
    if (campo === 'disallow') atual.disallow.push(valor); else if (campo === 'allow') atual.allow.push(valor);
  }
  const regras = (agente) => {
    const gs = grupos.filter((g) => g.agentes.includes(agente));
    return { disallow: gs.flatMap((g) => g.disallow).filter(Boolean), allow: gs.flatMap((g) => g.allow).filter(Boolean) };
  };
  const bloqueia = (r) => r.disallow.includes('/') && !r.allow.includes('/');
  const todos = regras('*'), google = regras('googlebot');
  return {
    sitemaps: unicos(sitemaps, 20),
    bloqueia_tudo: bloqueia(todos),
    // Grupo próprio do Googlebot vale no lugar do "*" para ele.
    bloqueia_google: grupos.some((g) => g.agentes.includes('googlebot')) ? bloqueia(google) : bloqueia(todos),
    regras_todos: { disallow: todos.disallow.slice(0, 30), allow: todos.allow.slice(0, 30) },
    grupos: grupos.length,
    linhas: linhas.length,
  };
}

function valorXml(bloco, nome) {
  const m = new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)<\\/${nome}>`, 'i').exec(bloco);
  if (!m) return null;
  const v = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
  return v ? decodificarEntidades(v).slice(0, 500) : null;
}

/** Sitemap de índice (sitemapindex) ou de URLs (urlset). Sem parser de XML:
 *  só o que o protocolo garante (loc e lastmod). */
export function lerSitemap(xml) {
  const t = String(xml ?? '');
  const tipo = /<sitemapindex\b/i.test(t) ? 'indice' : /<urlset\b/i.test(t) ? 'urls' : null;
  if (!tipo) return { tipo: null, itens: [] };
  const bloco = tipo === 'indice' ? 'sitemap' : 'url';
  const itens = [];
  for (const m of t.matchAll(new RegExp(`<${bloco}\\b[^>]*>([\\s\\S]*?)<\\/${bloco}>`, 'gi'))) {
    if (itens.length >= MAX_URLS_SITEMAP) break;
    const loc = urlHttp(valorXml(m[1], 'loc'));
    if (loc) itens.push({ loc, lastmod: valorXml(m[1], 'lastmod') });
  }
  return { tipo, itens };
}

const maisRecente = (datas) => {
  let melhor = null, ms = -Infinity;
  for (const d of datas) { const x = Date.parse(d ?? ''); if (Number.isFinite(x) && x > ms) { ms = x; melhor = d; } }
  return melhor;
};

// Sub-sitemap de páginas primeiro, depois posts, depois o resto (categorias).
const pesoSub = (u) => (/page|pagina/i.test(u) ? 0 : /post/i.test(u) ? 1 : 2);

/** Chave de comparação de endereço: sem www, sem barra no fim, sem rastreio. */
export function chaveUrl(u) {
  let s;
  try { s = normalizarLink(u); } catch { s = String(u ?? ''); }
  return s.replace(/^https?:\/\/www\./i, 'https://').replace(/^http:\/\//i, 'https://').toLowerCase();
}

// ----------------------------------------------------------- WordPress --

const ISO_WP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const emUtc = (v) => (typeof v === 'string' && ISO_WP.test(v) ? `${v}Z` : null);
const PADRAO_SLUG = /^(hello-world|ola-mundo|sample-page|pagina-exemplo|pagina-de-exemplo)$/;

/** O "Olá, mundo!" e a "Página de exemplo" que o WordPress cria sozinho. */
function conteudoPadrao(o, tipo, titulo) {
  if (PADRAO_SLUG.test(String(o.slug ?? ''))) return true;
  if (tipo === 'post' && o.id === 1 && /mundo|world/i.test(titulo ?? '')) return true;
  return tipo === 'page' && o.id === 2 && /exemplo|sample/i.test(titulo ?? '');
}

/** O link curto que o próprio WordPress dá a cada conteúdo: ?page_id=<id>
 *  para página e ?p=<id> para post. Ele não muda quando a estrutura dos
 *  links permanentes muda (o WordPress redireciona dele para o link do
 *  momento), e por isso é a chave da publicação. O host é o domínio SEM www:
 *  o cadastro do canal e o endereço do WordPress podem trocar entre com e sem
 *  www, e a chave não pode trocar junto. */
export function linkCurtoWp(dominio, tipo, id) {
  if (!dominio || !Number.isInteger(id) || id <= 0) return null;
  if (tipo === 'pagina') return `https://${dominio}/?page_id=${id}`;
  if (tipo === 'post') return `https://${dominio}/?p=${id}`;
  return null;
}

/** Os itens da REST (wp/v2/pages com tipo 'page', wp/v2/posts com 'post').
 *  `dominio` (sem www) monta o link_curto; sem ele, link_curto é null. */
export function lerWpItens(lista, tipo, dominio = null) {
  const qual = tipo === 'post' ? 'post' : 'pagina';
  return (Array.isArray(lista) ? lista : []).filter(objeto).map((o) => {
    const titulo = limparTexto(objeto(o.title) ? o.title.rendered : o.title, 200);
    const id = Number.isInteger(o.id) ? o.id : null;
    return {
      id,
      tipo: qual,
      titulo,
      link: urlHttp(o.link),
      link_curto: linkCurtoWp(dominio, qual, id),
      slug: typeof o.slug === 'string' ? o.slug.slice(0, 200) : null,
      publicado_em: emUtc(o.date_gmt),
      modificado_em: emUtc(o.modified_gmt),
      padrao_wp: conteudoPadrao(o, tipo, titulo),
    };
  });
}

/** Páginas e posts publicados viram publicações do canal site. A url é o
 *  link curto (?page_id=<id> ou ?p=<id>), e não o link permanente: a chave da
 *  tabela é canal + url, e o link permanente MUDA quando a estrutura de links
 *  do WordPress muda (hoje as URLs bonitas do site estão em laço de 301 e a
 *  REST devolve ?page_id=144; consertadas, a mesma página viria como
 *  /missao-visao-e-valores/ e entraria de novo, para sempre ao lado da
 *  antiga, achado da revisão 2). O link permanente do momento fica em
 *  dados.wordpress (link), para a tela mostrar. O link do item ainda decide
 *  se o conteúdo é deste site: link para outro domínio fica de fora. */
export function publicacoesDoWordpress(itens, canal, dominio) {
  const fora = [], vistos = new Set();
  for (const i of itens) {
    if (i.padrao_wp || !i.link || !i.publicado_em) continue;
    let u;
    try { u = new URL(i.link); } catch { continue; }
    const host = hostSemPonto(u.hostname);
    if (host !== dominio && host !== `www.${dominio}`) continue;
    const curto = linkCurtoWp(dominio, i.tipo, i.id);
    if (!curto) continue;
    let url;
    try { url = normalizarLink(curto); } catch { continue; }
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    fora.push({ canal, url, data: hojeSP(new Date(i.publicado_em)), titulo: i.titulo ? i.titulo.slice(0, 200) : null });
  }
  return fora;
}

// Namespace da REST para nome de plugin (só os que ajudam o marketing).
const PLUGINS = [
  [/^rankmath\//, 'Rank Math'], [/^yoast\//, 'Yoast SEO'], [/^aioseo\//, 'All in One SEO'], [/^elementor-pro\//, 'Elementor Pro'],
  [/^elementor\//, 'Elementor'], [/^litespeed\//, 'LiteSpeed Cache'], [/^wc\//, 'WooCommerce'], [/^contact-form-7\//, 'Contact Form 7'],
  [/^jetpack\//, 'Jetpack'], [/^wordfence\//, 'Wordfence'], [/^wpforms\//, 'WPForms'], [/^google-site-kit\//, 'Site Kit by Google'],
  [/^complianz\//, 'Complianz'], [/^cookieyes\//, 'CookieYes'], [/^redirection\//, 'Redirection'], [/^wp-rocket\//, 'WP Rocket'],
];
export function pluginsDosNamespaces(ns) {
  const lista = Array.isArray(ns) ? ns.map(String) : [];
  return unicos(lista.map((n) => PLUGINS.find(([re]) => re.test(n))?.[1]).filter(Boolean), 30);
}

function rotaRest(base, rota, params) {
  return `${base}${rota}${base.includes('?') ? '&' : '?'}${params}`;
}

/** Onde a REST mora: o cabeçalho Link da página inicial diz
 *  (rel="https://api.w.org/"); sem ele, o ?rest_route=, que funciona com ou
 *  sem links bonitos. */
export function baseDaRest(link, alvo) {
  const m = /<([^>]+)>\s*;\s*rel\s*=\s*"?https:\/\/api\.w\.org\/"?/i.exec(String(link ?? ''));
  const achada = m ? alvoPermitido(m[1], alvo.dominio) : null;
  return achada ?? `https://${alvo.host}/index.php?rest_route=/`;
}

// ------------------------------------------------- PageSpeed e CrUX --

const CATEGORIAS = { performance: 'desempenho', accessibility: 'acessibilidade', 'best-practices': 'boas_praticas', seo: 'seo', 'agentic-browsing': 'agentes' };
const LAB = { 'first-contentful-paint': 'fcp_ms', 'largest-contentful-paint': 'lcp_ms', 'total-blocking-time': 'tbt_ms', 'cumulative-layout-shift': 'cls', 'speed-index': 'si_ms', interactive: 'tti_ms', 'server-response-time': 'ttfb_ms' };
const MODOS_SEM_NOTA = ['notApplicable', 'manual', 'informative', 'error'];
const FAIXA = { FAST: 'bom', AVERAGE: 'melhorar', SLOW: 'ruim' };

/** Número que pode vir como texto ("0.05" no CLS da CrUX) ou "NaN" (falta de
 *  dado na History). Ausente é null, nunca zero. */
function num(v) {
  if (v == null || v === '' || v === 'NaN') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
const nota100 = (s) => (typeof s === 'number' && Number.isFinite(s) ? Math.round(s * 100) : null);

export function urlPageSpeed(alvo, estrategia, categorias) {
  const p = new URLSearchParams({ url: alvo, strategy: estrategia, locale: 'pt_BR' });
  for (const c of categorias) p.append('category', c);
  return `${PSI}?${p}`;
}

/** Campo do PSI (loadingExperience). É extra: o Google vai tirar. O CLS vem
 *  multiplicado por 100 (convenção vista nos exemplos, não confirmada na
 *  doc). */
export function lerCampoPsi(le) {
  const m = le?.metrics;
  if (!objeto(m) || !Object.keys(m).length) return null;
  const mapa = { LARGEST_CONTENTFUL_PAINT_MS: 'lcp_ms', INTERACTION_TO_NEXT_PAINT: 'inp_ms', CUMULATIVE_LAYOUT_SHIFT_SCORE: 'cls', FIRST_CONTENTFUL_PAINT_MS: 'fcp_ms', EXPERIMENTAL_TIME_TO_FIRST_BYTE: 'ttfb_ms' };
  const fora = { geral: FAIXA[le.overall_category] ?? null, caiu_para_origem: le.origin_fallback === true };
  for (const [k, n] of Object.entries(mapa)) {
    const p = num(m[k]?.percentile);
    fora[n] = p == null ? null : { p75: n === 'cls' ? p / 100 : p, faixa: FAIXA[m[k].category] ?? null };
  }
  return fora;
}

function lerAgentes(lh) {
  const cat = lh?.categories?.['agentic-browsing'];
  if (!objeto(cat)) return null;
  const auditorias = (Array.isArray(cat.auditRefs) ? cat.auditRefs : []).map((r) => {
    const a = lh.audits?.[r?.id];
    return objeto(a) ? { id: String(r.id), titulo: limparTexto(a.title, 160), nota: num(a.score), valor: limparTexto(a.displayValue, 80), modo: a.scoreDisplayMode ?? null } : null;
  }).filter(Boolean);
  // O formato da nota desta categoria não está confirmado ("exibição em
  // fração"): guarda a nota se vier e conta quantas passaram.
  const contam = auditorias.filter((a) => a.nota != null && !MODOS_SEM_NOTA.includes(a.modo));
  return { nota: nota100(cat.score), passou: contam.filter((a) => a.nota >= 0.9).length, total: contam.length, auditorias };
}

function auditoriasRuins(lh) {
  const fora = [];
  for (const k of ['performance', 'accessibility', 'best-practices', 'seo']) {
    const refs = Array.isArray(lh.categories?.[k]?.auditRefs) ? lh.categories[k].auditRefs : [];
    const ruins = [];
    for (const r of refs) {
      const a = lh.audits?.[r?.id];
      // As métricas já aparecem no laboratório; "hidden" o próprio Lighthouse esconde.
      if (!objeto(a) || r.group === 'metrics' || r.group === 'hidden') continue;
      const s = num(a.score);
      if (s == null || s >= 0.9 || MODOS_SEM_NOTA.includes(a.scoreDisplayMode)) continue;
      const economia = num(a.metricSavings?.LCP) ?? num(a.metricSavings?.FCP) ?? num(a.details?.overallSavingsMs);
      ruins.push({ categoria: CATEGORIAS[k], id: String(r.id), titulo: limparTexto(a.title, 200), nota: nota100(s), valor: limparTexto(a.displayValue, 120), economia_ms: economia == null ? null : Math.round(economia), peso: num(r.weight) ?? 0 });
    }
    ruins.sort((a, b) => b.peso - a.peso || (b.economia_ms ?? 0) - (a.economia_ms ?? 0) || a.nota - b.nota);
    fora.push(...ruins.slice(0, 10).map(({ peso, ...x }) => x));
  }
  return fora;
}

/** Uma resposta do runPagespeed. runtimeError = medição que não vale (a doc
 *  manda descartar): as notas saem null, não zero. */
export function lerPageSpeed(corpo) {
  const lh = corpo?.lighthouseResult;
  if (!objeto(lh)) return null;
  const codigoErro = lh.runtimeError?.code;
  const erro = codigoErro && codigoErro !== 'NO_ERROR' ? String(codigoErro).slice(0, 60) : null;
  const notas = {};
  for (const [k, n] of Object.entries(CATEGORIAS)) notas[n] = erro ? null : nota100(lh.categories?.[k]?.score);
  const laboratorio = {};
  for (const [id, n] of Object.entries(LAB)) {
    const v = erro ? null : num(lh.audits?.[id]?.numericValue);
    laboratorio[n] = v == null ? null : n === 'cls' ? Math.round(v * 1000) / 1000 : Math.round(v);
  }
  return {
    url_final: urlHttp(lh.finalDisplayedUrl ?? lh.finalUrl),
    lighthouse: typeof lh.lighthouseVersion === 'string' ? lh.lighthouseVersion.slice(0, 20) : null,
    medido_em: typeof lh.fetchTime === 'string' ? lh.fetchTime : typeof corpo.analysisUTCTimestamp === 'string' ? corpo.analysisUTCTimestamp : null,
    formato: typeof lh.configSettings?.formFactor === 'string' ? lh.configSettings.formFactor : null,
    erro_execucao: erro,
    notas,
    laboratorio,
    melhorar: erro ? [] : auditoriasRuins(lh),
    agentes: erro ? null : lerAgentes(lh),
    campo_pagina: lerCampoPsi(corpo.loadingExperience),
    campo_origem: lerCampoPsi(corpo.originLoadingExperience),
    avisos_execucao: (Array.isArray(lh.runWarnings) ? lh.runWarnings : []).slice(0, 5).map((w) => limparTexto(w, 300)).filter(Boolean),
  };
}

/** A chamada principal e a de AGENTIC_BROWSING juntas num retrato só. */
function juntarPsi(principal, agentes) {
  if (!principal && !agentes?.agentes) return principal ?? null;
  const base = principal ?? {
    url_final: agentes.url_final, lighthouse: agentes.lighthouse, medido_em: agentes.medido_em, formato: agentes.formato, erro_execucao: null,
    notas: { desempenho: null, acessibilidade: null, boas_praticas: null, seo: null, agentes: null },
    laboratorio: Object.fromEntries(Object.values(LAB).map((n) => [n, null])), melhorar: [], agentes: null,
    campo_pagina: null, campo_origem: null, avisos_execucao: [],
  };
  if (agentes?.agentes) { base.agentes = agentes.agentes; base.notas.agentes = agentes.agentes.nota; }
  return base;
}

const CRUX_METRICAS = { largest_contentful_paint: 'lcp_ms', interaction_to_next_paint: 'inp_ms', cumulative_layout_shift: 'cls', first_contentful_paint: 'fcp_ms', experimental_time_to_first_byte: 'ttfb_ms', round_trip_time: 'rtt_ms' };
const CRUX_PARTES = { largest_contentful_paint_image_time_to_first_byte: 'ttfb_ms', largest_contentful_paint_image_resource_load_delay: 'atraso_carga_ms', largest_contentful_paint_image_resource_load_duration: 'duracao_carga_ms', largest_contentful_paint_image_element_render_delay: 'atraso_render_ms' };
const dataCrux = (d) => (objeto(d) && Number.isInteger(d.year) && Number.isInteger(d.month) && Number.isInteger(d.day)
  ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null);
function fracoes(f) {
  if (!objeto(f)) return null;
  const o = {};
  for (const [k, v] of Object.entries(f)) { const n = num(v); if (n != null) o[k] = n; }
  return Object.keys(o).length ? o : null;
}

/** Uma resposta do queryRecord. As métricas de anúncio (experimental_ad_*)
 *  só existem para páginas elegíveis e ficam de fora. */
export function lerCrux(corpo) {
  const r = corpo?.record;
  if (!objeto(r)) return null;
  const m = objeto(r.metrics) ? r.metrics : {};
  const metricas = {};
  for (const [k, n] of Object.entries(CRUX_METRICAS)) {
    const x = m[k];
    if (!objeto(x)) { metricas[n] = null; continue; }
    const h = Array.isArray(x.histogram) ? x.histogram.map((b) => num(b?.density)) : [];
    metricas[n] = { p75: num(x.percentiles?.p75), bom: h[0] ?? null, melhorar: h[1] ?? null, ruim: h[2] ?? null };
  }
  const partes = {};
  for (const [k, n] of Object.entries(CRUX_PARTES)) partes[n] = num(m[k]?.percentiles?.p75);
  return {
    chave: { origem: r.key?.origin ?? null, url: r.key?.url ?? null, aparelho: r.key?.formFactor ?? null },
    periodo: { de: dataCrux(r.collectionPeriod?.firstDate), ate: dataCrux(r.collectionPeriod?.lastDate) },
    metricas,
    lcp_partes: Object.values(partes).some((v) => v != null) ? partes : null,
    lcp_tipo: fracoes(m.largest_contentful_paint_resource_type?.fractions),
    navegacao: fracoes(m.navigation_types?.fractions),
    aparelhos: fracoes(m.form_factors?.fractions),
  };
}

/** Uma resposta do queryHistoryRecord: uma série por métrica, alinhada com
 *  os períodos (do mais antigo ao mais novo). */
export function lerCruxHistorico(corpo) {
  const r = corpo?.record;
  if (!objeto(r)) return null;
  const periodos = (Array.isArray(r.collectionPeriods) ? r.collectionPeriods : []).map((p) => ({ de: dataCrux(p?.firstDate), ate: dataCrux(p?.lastDate) }));
  const serie = (k) => { const s = r.metrics?.[k]?.percentilesTimeseries?.p75s; return periodos.map((_, i) => (Array.isArray(s) ? num(s[i]) : null)); };
  const bom = (k) => { const h = r.metrics?.[k]?.histogramTimeseries; const d = Array.isArray(h) ? h[0]?.densities : null; return periodos.map((_, i) => (Array.isArray(d) ? num(d[i]) : null)); };
  return {
    periodos,
    lcp_ms: serie('largest_contentful_paint'), inp_ms: serie('interaction_to_next_paint'), cls: serie('cumulative_layout_shift'),
    fcp_ms: serie('first_contentful_paint'), ttfb_ms: serie('experimental_time_to_first_byte'),
    lcp_bom: bom('largest_contentful_paint'), inp_bom: bom('interaction_to_next_paint'), cls_bom: bom('cumulative_layout_shift'),
  };
}

/** As n últimas semanas FECHADAS (segunda a domingo, fuso de São Paulo), da
 *  mais antiga para a mais nova. A semana de hoje nunca entra. */
export function semanasFechadas(hoje, n = 8) {
  const atual = segundaDaSemana(hoje);
  return Array.from({ length: n }, (_, i) => somarDias(atual, -7 * (n - i)));
}

/** Cada período da History termina num sábado: cai na semana desse sábado. */
export function cwvPorSemana(historico, semanas) {
  const pegar = (h, semana) => {
    if (!h) return null;
    const i = h.periodos.findIndex((p) => p.ate && segundaDaSemana(p.ate) === semana);
    if (i < 0) return null;
    const v = { lcp_ms: h.lcp_ms[i], inp_ms: h.inp_ms[i], cls: h.cls[i] };
    return Object.values(v).some((x) => x != null) ? { ...v, periodo: h.periodos[i] } : null;
  };
  return semanas.map((s) => ({ semana: s, celular: pegar(historico?.celular, s), computador: pegar(historico?.computador, s) }));
}

// ----------------------------------------------------------- DNS e versões --

const textoTxt = (d) => String(d ?? '').trim().replace(/"\s+"/g, '').replace(/^"|"$/g, '');

export function lerDns(txt, dmarc, mx) {
  const respostas = (c, tipo) => (Array.isArray(c?.Answer) ? c.Answer : []).filter((a) => a?.type === tipo).map((a) => String(a.data ?? ''));
  const textos = respostas(txt, 16).map(textoTxt);
  const dm = respostas(dmarc, 16).map(textoTxt).find((t) => /^v=DMARC1/i.test(t)) ?? null;
  return {
    spf: textos.find((t) => /^v=spf1/i.test(t))?.slice(0, 300) ?? null,
    dmarc: dm ? { politica: /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)/i.exec(dm)?.[1]?.toLowerCase() ?? null, registro: dm.slice(0, 300) } : null,
    mx: unicos(respostas(mx, 15).map((d) => d.trim().split(/\s+/).pop()?.replace(/\.$/, '').toLowerCase()), 10),
    verificacoes: {
      google_site_verification: textos.some((t) => /^google-site-verification=/i.test(t)),
      facebook_domain_verification: textos.some((t) => /^facebook-domain-verification=/i.test(t)),
    },
    txt_total: textos.length,
  };
}

/** a < b, comparando os números da versão (7.4 < 7.9.1; 3.31.3 < 4.3.4). */
export function versaoAtrasada(a, b) {
  if (!a || !b) return null;
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

const SLUGS = { elementor: 'elementor', litespeed_cache: 'litespeed-cache', yoast: 'wordpress-seo', woocommerce: 'woocommerce' };

// ---------------------------------------------------------- conferências --

const NOMES_ETIQUETA = { ga4: 'GA4', google_ads: 'Google Ads', gtm: 'Gerenciador de Tags', meta_pixel: 'Pixel da Meta', linkedin: 'LinkedIn Insight', pinterest: 'Pinterest', tiktok: 'TikTok', clarity: 'Clarity', hotjar: 'Hotjar', contentsquare: 'Contentsquare' };
const NOMES_VERSAO = { wordpress: 'WordPress', elementor: 'Elementor', litespeed_cache: 'LiteSpeed Cache', yoast: 'Yoast SEO', woocommerce: 'WooCommerce' };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const segundos = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const caminhoDe = (u) => { try { const x = new URL(u); return `${x.pathname}${x.search}`; } catch { return String(u); } };
// Título vindo do site entra numa frase nossa: o WordPress troca " - " por
// meia-risca (&#8211;) sozinho, e frase da casa não leva travessão.
const semTravessao = (t) => String(t).replace(/\s*[\u2013\u2014]\s*/g, ' - ');
const listaCurta = (xs, max = 3) => {
  const ys = xs.map(semTravessao);
  return ys.length > max ? `${ys.slice(0, max).join(', ')} e mais ${ys.length - max}` : ys.join(', ');
};

/** Os achados, tirados só das partes desta coleta. Nunca afirma o que de
 *  fora não dá para provar ("não encontrado de fora", nunca "não
 *  verificado"). */
export function conferir(d) {
  const c = [];
  const add = (codigo, nivel, texto) => c.push({ codigo, nivel, texto });
  const lista = d.paginas?.lista ?? [];
  const inicio = lista[0];
  const et = d.paginas?.etiquetas;

  if (d.robots) {
    if (!d.robots.existe) add('robots_ausente', 'atencao', 'O site não tem robots.txt.');
    else {
      if (d.robots.bloqueia_tudo) add('robots_bloqueia_tudo', 'alerta', 'O robots.txt bloqueia o site inteiro para os buscadores (Disallow: / para todos).');
      else if (d.robots.bloqueia_google) add('robots_bloqueia_google', 'alerta', 'O robots.txt bloqueia o Googlebot.');
      if (!d.robots.sitemaps.length) add('robots_sem_sitemap', 'atencao', 'O robots.txt não aponta o sitemap (falta a linha Sitemap:).');
    }
  }
  if (d.sitemap) {
    for (const t of d.sitemap.tentativas.filter((x) => x.problema === 'laco' || x.problema === 'saltos_demais')) {
      add('sitemap_laco', 'atencao', `O endereço ${caminhoDe(t.url)} entra em laço de redirecionamento.`);
    }
    if (!d.sitemap.url) add('sitemap_ausente', 'alerta', 'Nenhum sitemap respondeu nos endereços de costume.');
  }
  const itensWp = d.wordpress?.rest ? [...(d.wordpress.paginas?.itens ?? []), ...(d.wordpress.posts?.itens ?? [])] : [];
  const padrao = itensWp.filter((i) => i.padrao_wp);
  if (padrao.length) add('conteudo_padrao', 'atencao', `Conteúdo de exemplo do WordPress publicado: ${listaCurta(padrao.map((i) => i.titulo ?? i.slug ?? String(i.id)))}.`);
  if (d.sitemap?.url && !d.sitemap.subs_nao_lidos && d.wordpress?.rest && !d.wordpress.paginas?.cortado) {
    const noSitemap = new Map((d.sitemap.urls_todas ?? d.sitemap.urls ?? []).map((u) => [chaveUrl(u.loc), u]));
    const faltam = (d.wordpress.paginas?.itens ?? []).filter((i) => !i.padrao_wp && i.link && !noSitemap.has(chaveUrl(i.link)));
    if (faltam.length) add('fora_do_sitemap', 'atencao', `${plural(faltam.length, 'página publicada não está', 'páginas publicadas não estão')} no sitemap: ${listaCurta(faltam.map((i) => i.titulo ?? caminhoDe(i.link)))}.`);
    const atrasadas = itensWp.filter((i) => {
      const s = i.link ? noSitemap.get(chaveUrl(i.link)) : null;
      const lm = Date.parse(s?.lastmod ?? ''), mod = Date.parse(i.modificado_em ?? '');
      return Number.isFinite(lm) && Number.isFinite(mod) && lm < mod - 3_600_000;
    });
    if (atrasadas.length) add('sitemap_atrasado', 'info', `O sitemap mostra data de alteração mais antiga que a real em ${plural(atrasadas.length, 'página', 'páginas')}.`);
    const noindex = lista.filter((p) => abriu(p) && p.seo.noindex && noSitemap.has(chaveUrl(p.url)));
    if (noindex.length) add('noindex_no_sitemap', 'atencao', `${plural(noindex.length, 'página marcada como noindex está', 'páginas marcadas como noindex estão')} no sitemap: ${listaCurta(noindex.map((p) => p.seo.titulo ?? caminhoDe(p.url)))}.`);
  }
  const ROTULO_ERRO = { laco: 'laço de redirecionamento', saltos_demais: 'redirecionamentos demais', redireciona_para_fora: 'vai para fora do site' };
  const falhasHttp = lista.slice(1).filter((p) => (p.status >= 400 && p.status < 500 && /^http_/.test(p.erro ?? '')) || ROTULO_ERRO[p.erro]);
  if (falhasHttp.length) add('paginas_com_erro', 'atencao', `${plural(falhasHttp.length, 'página listada respondeu', 'páginas listadas responderam')} com erro: ${listaCurta(falhasHttp.map((p) => `${caminhoDe(p.url)} (${ROTULO_ERRO[p.erro] ?? p.status})`))}.`);

  if (et && et.paginas_lidas) {
    for (const t of TIPOS_ETIQUETA) {
      const x = et.tipos[t];
      if (x.presente && x.sem.length) add('etiqueta_faltando', 'atencao', `${NOMES_ETIQUETA[t]} não aparece em ${x.sem.length} das ${et.paginas_lidas} páginas lidas: ${listaCurta(x.sem.map(caminhoDe))}.`);
    }
    if (!et.tipos.ga4.presente && !et.tipos.gtm.presente) add('sem_ga4', 'alerta', 'Nenhuma etiqueta do GA4 nem do Gerenciador de Tags aparece no HTML do site.');
    else if (!et.tipos.ga4.presente) add('ga4_no_gtm', 'info', 'O GA4 não aparece no HTML; ele pode estar dentro do Gerenciador de Tags.');
    // Página a página: uma página com Consent Mode não protege as outras.
    const rastreio = ['ga4', 'google_ads', 'meta_pixel', 'linkedin', 'pinterest', 'tiktok', 'clarity', 'hotjar', 'contentsquare'];
    const soltas = lista.filter((p) => abriu(p) && rastreio.some((t) => presente(p, t)) && !p.consentimento.consent_mode && !p.consentimento.banner);
    if (soltas.length) {
      add('sem_consentimento', 'atencao', `Em ${plural(soltas.length, 'página', 'páginas')} as etiquetas disparam sem banner de cookies e sem Consent Mode. Vale avaliar com quem cuida da LGPD.`);
    }
    if (!et.verificacoes.google_site_verification && !d.dns?.verificacoes?.google_site_verification) {
      add('search_console_nao_encontrado', 'info', 'Verificação do Search Console não encontrada de fora (pode ter sido feita pelo GA4, por arquivo ou por CNAME).');
    }
    if (!et.verificacoes.facebook_domain_verification && !d.dns?.verificacoes?.facebook_domain_verification) {
      add('meta_dominio_nao_encontrado', 'info', 'Verificação do domínio na Meta não encontrada de fora (nem meta tag nem TXT no DNS).');
    }
  }
  if (abriu(inicio)) {
    const ds = inicio.dados_estruturados;
    if (!ds.local_business) add('sem_local_business', 'atencao', 'Os dados estruturados não têm LocalBusiness (endereço, telefone e horário), que o Google usa para negócio local.');
    if (ds.logo_http) add('logo_http', 'info', 'O logo dos dados estruturados está em http://, sem cadeado.');
    if (/^http:\/\//i.test(inicio.seo.canonical ?? '')) add('canonical_http', 'atencao', 'O endereço canônico da página inicial está em http://.');
    if (/\d/.test(inicio.servidor?.x_powered_by ?? '')) add('versoes_expostas', 'info', 'O cabeçalho x-powered-by mostra a versão do PHP, o que ajuda quem procura falha conhecida.');
    if (/miss/i.test(inicio.servidor?.x_cache ?? '')) add('cache_miss', 'info', 'A página inicial veio sem cache (x-cache MISS).');
    if (inicio.ms_cabecalho > 800) add('resposta_lenta', 'info', `A página inicial levou ${segundos(inicio.ms_cabecalho)} para começar a responder (medido do servidor do Painel, não do cliente).`);
  }
  const www = d.paginas?.redirecionamento_www;
  if (www && www.status >= 200 && www.status < 300) add('www_duplicado', 'info', 'O site abre com e sem www sem redirecionar um para o outro.');
  for (const [k, v] of Object.entries(d.versoes ?? {})) {
    if (v?.desatualizado) add('desatualizado', 'atencao', `${NOMES_VERSAO[k] ?? k} ${v.site} no site; a versão atual é ${v.atual}.`);
  }
  if (d.dns) {
    if (!d.dns.dmarc) add('sem_dmarc', 'atencao', 'O domínio não tem DMARC: qualquer um pode mandar e-mail em nome dele.');
    else if (d.dns.dmarc.politica === 'none') add('dmarc_none', 'info', 'O DMARC está em p=none: o e-mail do domínio só é observado, não protegido.');
    if (!d.dns.spf) add('sem_spf', 'atencao', 'O domínio não tem SPF.');
  }
  const cel = d.crux?.origem?.celular ?? d.crux?.origem?.todos;
  if (d.crux?.sem_dados) add('crux_sem_dados', 'info', 'O Chrome ainda não tem visitas suficientes do site para medir a experiência real.');
  else if (cel) {
    const p = (k) => cel.metricas?.[k]?.p75;
    if (p('lcp_ms') > 2500) add('lcp_lento', 'atencao', `No celular, o maior conteúdo leva ${segundos(p('lcp_ms'))} para aparecer (o bom é até 2,5 s).`);
    if (p('inp_ms') > 200) add('inp_lento', 'atencao', `No celular, a página leva ${p('inp_ms')} ms para responder a um toque (o bom é até 200 ms).`);
    if (p('cls') > 0.1) add('cls_alto', 'atencao', `No celular, a página pula enquanto carrega (CLS ${String(p('cls')).replace('.', ',')}; o bom é até 0,1).`);
  }
  const des = d.pagespeed?.celular?.notas?.desempenho;
  if (des != null && des < 50) add('desempenho_baixo', 'atencao', `A nota de desempenho no celular é ${des} de 100.`);
  return c;
}

// -------------------------------------------------------------- coleta --

/** Até `limite` tarefas ao mesmo tempo, na ordem. fn não pode lançar. */
async function emLotes(itens, limite, fn) {
  const fora = new Array(itens.length);
  let i = 0;
  const trabalhar = async () => { while (i < itens.length) { const k = i++; fora[k] = await fn(itens[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhar));
  return fora;
}

function trecho(r) {
  if (!r || !(r.status === 403 || r.status === 503 || r.status === 429)) return undefined;
  return limparTexto(String(r.texto ?? '').slice(0, 4000).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' '), 200) ?? undefined;
}

/** Uma página, sem lançar: { pagina, cab }. */
async function lerUma(buscar, url) {
  try {
    const r = await buscar(url);
    if (r.status < 200 || r.status > 299) {
      const p = { url: r.url, status: r.status, erro: `http_${r.status}` };
      const t = trecho(r);
      if (t) p.trecho = t;
      return { pagina: p, cab: r.headers };
    }
    const pagina = {
      url: r.url, status: r.status, bytes: r.bytes, truncada: r.truncado, ms_cabecalho: r.ms_cabecalho, ms_total: r.ms_total,
      servidor: { server: r.headers.server ?? null, x_powered_by: r.headers['x-powered-by'] ?? null, x_cache: r.headers['x-cache'] ?? null },
      ...lerPagina(r.texto, r.headers),
    };
    return { pagina, cab: r.headers };
  } catch (e) {
    return { pagina: { url, status: e?.status ?? null, erro: e?.codigo ?? 'rede' }, cab: {} };
  }
}

const falhaDeColeta = (codigo) => ['prazo', 'rede', 'tempo_esgotado', 'dns', 'certificado'].includes(codigo) || /^http_5\d\d$/.test(codigo ?? '');

async function coletarRobots(buscar, origem) {
  try {
    const r = await buscar(`${origem}/robots.txt`, { max: 512 * 1024 });
    if (r.status === 404 || r.status === 410) return { estado: 'ok', dados: { existe: false, status: r.status, sitemaps: [], bloqueia_tudo: false, bloqueia_google: false, regras_todos: { disallow: [], allow: [] }, grupos: 0, linhas: 0 } };
    if (r.status < 200 || r.status > 299) return { estado: 'erro', motivo: `http_${r.status}` };
    // Um robots.txt que é página HTML (o tema devolve a home com 200) não é robots.
    if (/<html\b/i.test(r.texto.slice(0, 2000))) return { estado: 'ok', dados: { existe: false, status: r.status, sitemaps: [], bloqueia_tudo: false, bloqueia_google: false, regras_todos: { disallow: [], allow: [] }, grupos: 0, linhas: 0 } };
    return { estado: 'ok', dados: { existe: true, status: r.status, ...lerRobots(r.texto) } };
  } catch (e) {
    return { estado: e?.codigo === 'prazo' ? 'parcial' : 'erro', motivo: e?.codigo ?? 'rede' };
  }
}

async function coletarSitemap(buscar, alvo, robots) {
  const origem = `https://${alvo.host}`;
  const candidatos = unicos([...(robots?.sitemaps ?? []), `${origem}/sitemap_index.xml`, `${origem}/wp-sitemap.xml`, `${origem}/?sitemap=1`, `${origem}/?sitemap=index`], 12);
  const tentativas = [];
  let achado = null, falhas = 0, prazo = false;
  for (const c of candidatos) {
    if (tentativas.length >= MAX_TENTATIVAS_SITEMAP) break;
    const alvoOk = alvoPermitido(c, alvo.dominio);
    if (!alvoOk) { tentativas.push({ url: String(c).slice(0, 200), status: null, problema: 'fora_do_dominio' }); continue; }
    try {
      const r = await buscar(alvoOk);
      const lido = r.status === 200 ? lerSitemap(r.texto) : { tipo: null, itens: [] };
      tentativas.push({ url: alvoOk, status: r.status, problema: lido.tipo ? null : r.status === 200 ? 'nao_e_sitemap' : `http_${r.status}` });
      if (r.status >= 500) falhas++;
      if (lido.tipo) { achado = { url: r.url, ...lido }; break; }
    } catch (e) {
      tentativas.push({ url: alvoOk, status: e?.status ?? null, problema: e?.codigo ?? 'rede' });
      if (falhaDeColeta(e?.codigo)) falhas++;
      if (e?.codigo === 'prazo') { prazo = true; break; }
    }
  }
  if (!achado) {
    // Só 404 e laços: o site não tem sitemap, e isso é achado. Rede caída ou
    // tempo esgotado: não deu para saber.
    if (prazo) return { estado: 'parcial', motivo: 'prazo' };
    if (falhas && falhas === tentativas.filter((t) => t.problema !== 'fora_do_dominio').length) return { estado: 'erro', motivo: tentativas.at(-1)?.problema ?? 'rede' };
    return { estado: 'ok', dados: { url: null, tentativas, tipo: null, subs: [], subs_nao_lidos: 0, total_urls: 0, ultima_modificacao: null, urls: [], urls_todas: [] } };
  }
  let urls = achado.tipo === 'urls' ? achado.itens : [];
  const subs = [];
  let naoLidos = 0, estado = 'ok', motivo;
  if (achado.tipo === 'indice') {
    const ordem = [...achado.itens].sort((a, b) => pesoSub(a.loc) - pesoSub(b.loc));
    const lerAgora = ordem.slice(0, MAX_SUBSITEMAPS);
    naoLidos = ordem.length - lerAgora.length;
    const lidos = await emLotes(lerAgora, PARALELO_SITE, async (s) => {
      const u = alvoPermitido(s.loc, alvo.dominio);
      if (!u) return { url: s.loc.slice(0, 200), urls: null, ultima_modificacao: s.lastmod, problema: 'fora_do_dominio', itens: [] };
      try {
        const r = await buscar(u);
        const l = r.status === 200 ? lerSitemap(r.texto) : { tipo: null, itens: [] };
        if (l.tipo !== 'urls') return { url: u, urls: null, ultima_modificacao: s.lastmod, problema: r.status === 200 ? 'nao_e_sitemap' : `http_${r.status}`, itens: [] };
        return { url: u, urls: l.itens.length, ultima_modificacao: maisRecente(l.itens.map((x) => x.lastmod)) ?? s.lastmod, itens: l.itens };
      } catch (e) {
        return { url: u, urls: null, ultima_modificacao: s.lastmod, problema: e?.codigo ?? 'rede', itens: [] };
      }
    });
    for (const s of lidos) { const { itens, ...resto } = s; subs.push(resto); urls = urls.concat(itens); }
    const ruins = subs.filter((s) => s.urls == null);
    if (ruins.length) {
      naoLidos += ruins.length;
      estado = 'parcial';
      motivo = ruins.some((s) => s.problema === 'prazo') ? 'prazo' : 'algumas_paginas';
    }
  }
  return {
    estado, motivo,
    dados: {
      url: achado.url, tentativas, tipo: achado.tipo, subs, subs_nao_lidos: naoLidos, total_urls: urls.length,
      ultima_modificacao: maisRecente(urls.map((u) => u.lastmod).concat(achado.itens.map((i) => i.lastmod))),
      urls: urls.slice(0, 200),
      urls_todas: urls,
    },
  };
}

async function listarWp(buscar, base, rota) {
  const itens = [];
  let total = null, cortado = false;
  for (let n = 1; n <= WP_MAX_PAGINAS; n++) {
    const r = await buscar(rotaRest(base, rota, `per_page=${WP_POR_PAGINA}&page=${n}&_fields=id,title,link,slug,date_gmt,modified_gmt`));
    if (r.status === 400 && n > 1) break; // passou da última página
    if (r.status !== 200) throw new ErroSite(`http_${r.status}`, { status: r.status });
    const lista = jsonSeguro(r.texto);
    if (!Array.isArray(lista)) throw new ErroSite('rest_nao_json');
    const paginas = parseInt(r.headers['x-wp-totalpages'], 10);
    if (n === 1) { const t = parseInt(r.headers['x-wp-total'], 10); total = Number.isFinite(t) ? t : null; }
    itens.push(...lista);
    const ultima = lista.length < WP_POR_PAGINA || (Number.isFinite(paginas) && n >= paginas);
    if (ultima) break;
    if (n === WP_MAX_PAGINAS) cortado = true;
  }
  return { itens, total: total ?? itens.length, cortado };
}

async function coletarWordpress(buscar, base, dominio) {
  const raizP = buscar(rotaRest(base, '', '_fields=name,description,namespaces')).catch((e) => e);
  const [paginas, posts, raiz] = await Promise.all([
    listarWp(buscar, base, 'wp/v2/pages').catch((e) => e),
    listarWp(buscar, base, 'wp/v2/posts').catch((e) => e),
    raizP,
  ]);
  const erroDe = (x) => (x instanceof Error || x?.codigo ? x : null);
  const ep = erroDe(paginas);
  if (ep) {
    // 401, 403 e 404 na REST são fato do site (REST fechada ou não é
    // WordPress); rede e tempo são falha da coleta.
    if (/^http_(401|403|404|410)$/.test(ep.codigo) || ep.codigo === 'rest_nao_json') {
      return { estado: 'ok', motivo: ep.codigo === 'http_404' || ep.codigo === 'rest_nao_json' ? 'sem_wordpress' : 'rest_fechada', dados: { rest: false, codigo: ep.codigo, base, nome: null, namespaces: [], plugins: [], paginas: null, posts: null } };
    }
    return { estado: ep.codigo === 'prazo' ? 'parcial' : 'erro', motivo: ep.codigo ?? 'rede' };
  }
  const raizJson = !erroDe(raiz) && raiz?.status === 200 ? jsonSeguro(raiz.texto) : null;
  const ns = Array.isArray(raizJson?.namespaces) ? raizJson.namespaces.map(String).slice(0, 80) : [];
  const pgs = lerWpItens(paginas.itens, 'page', dominio);
  const ps = erroDe(posts) ? null : lerWpItens(posts.itens, 'post', dominio);
  return {
    estado: ps ? 'ok' : 'parcial',
    motivo: ps ? undefined : posts.codigo ?? 'rede',
    dados: {
      rest: true, base, nome: limparTexto(raizJson?.name, 160), namespaces: ns, plugins: pluginsDosNamespaces(ns),
      paginas: { total: paginas.total, cortado: paginas.cortado, itens: pgs.slice(0, WP_ITENS_NA_TELA) },
      posts: ps ? { total: posts.total, cortado: posts.cortado, itens: ps.slice(0, WP_ITENS_NA_TELA) } : null,
    },
    todos: [...pgs, ...(ps ?? [])],
  };
}

/** O endereço com ou sem www, o que NÃO é o da página inicial depois dos
 *  redirecionamentos (cadastro com www num site que vive sem www não pode
 *  virar "abre dos dois jeitos"). */
async function checarWww(buscar, alvo, hostFinal) {
  const host = hostFinal ?? alvo.host;
  const outro = host.startsWith('www.') ? alvo.dominio : `www.${alvo.dominio}`;
  const de = `https://${outro}/`;
  try {
    const r = await buscar(de, { seguir: false });
    return { de, status: r.status, para: r.para };
  } catch {
    return null; // sem www no DNS é normal
  }
}

async function coletarDns(ctx, dominio, prazo) {
  if (!(Number(prazo()) >= MIN_PEDIDO)) return { estado: 'parcial', motivo: 'prazo' };
  const q = (nome, tipo) => pedirJson(ctx, `${DNS}?name=${encodeURIComponent(nome)}&type=${tipo}`, { method: 'GET', rotulo: `dns ${tipo}` });
  const [txt, dmarc, mx] = await Promise.all([q(dominio, 'TXT'), q(`_dmarc.${dominio}`, 'TXT'), q(dominio, 'MX')]);
  if (!txt.ok || !objeto(txt.corpo)) return { estado: 'erro', motivo: txt.sem_fetch ? 'falha_interna' : txt.tempo ? 'tempo_esgotado' : 'sem_resposta' };
  const parcial = !dmarc.ok || !mx.ok;
  return { estado: parcial ? 'parcial' : 'ok', motivo: parcial ? 'sem_resposta' : undefined, dados: { dominio, ...lerDns(txt.corpo, dmarc.ok ? dmarc.corpo : null, mx.ok ? mx.corpo : null) } };
}

async function coletarVersoes(ctx, plataforma, prazo) {
  const alvos = [];
  if (plataforma?.wordpress) alvos.push(['wordpress', plataforma.wordpress, WPORG_CORE]);
  for (const [k, slug] of Object.entries(SLUGS)) {
    if (plataforma?.[k]) alvos.push([k, plataforma[k], `${WPORG_PLUGIN}?action=plugin_information&request%5Bslug%5D=${slug}&request%5Bfields%5D%5Bsections%5D=0`]);
  }
  if (!alvos.length) return { estado: 'ok', motivo: 'nada_a_conferir', dados: {} };
  if (!(Number(prazo()) >= MIN_PEDIDO)) return { estado: 'parcial', motivo: 'prazo' };
  const respostas = await Promise.all(alvos.map(([k, , url]) => pedirJson(ctx, url, { method: 'GET', rotulo: `versao ${k}` })));
  const dados = {};
  let falhou = 0;
  alvos.forEach(([k, site], i) => {
    const r = respostas[i];
    const atual = !r.ok ? null : k === 'wordpress'
      ? (Array.isArray(r.corpo?.offers) ? r.corpo.offers[0]?.current ?? r.corpo.offers[0]?.version : null) ?? null
      : typeof r.corpo?.version === 'string' ? r.corpo.version : null;
    if (!atual) falhou++;
    dados[k] = { site, atual: atual ? String(atual).slice(0, 20) : null, desatualizado: atual ? versaoAtrasada(site, atual) : null };
  });
  return { estado: falhou === alvos.length ? 'erro' : falhou ? 'parcial' : 'ok', motivo: falhou ? 'sem_resposta' : undefined, dados };
}

/** O que mora no domínio do site: páginas, robots, sitemap, REST, mais DNS e
 *  versões (que precisam do que o HTML mostrou). A página inicial já vem
 *  lida (coletar precisa dela antes, para o Google medir o endereço final). */
async function coletarSite(ctx, buscar, alvo, prazo, primeira) {
  const res = {};
  const avisos = [];
  const { pagina: inicio, cab } = primeira;
  const hostFinal = abriu(inicio) ? hostDe(inicio.url) : null;
  const origem = `https://${hostFinal ?? alvo.host}`;
  const dnsP = coletarDns(ctx, alvo.dominio, prazo);

  // 1. Sem a página inicial não se sabe o que conferir de versão: a parte
  // espera a próxima coleta (erro mantém o retrato anterior), em vez de
  // dizer "nada a conferir".
  const versoesP = abriu(inicio) ? coletarVersoes(ctx, inicio.plataforma, prazo)
    : Promise.resolve({ estado: inicio.erro === 'prazo' ? 'parcial' : 'erro', motivo: inicio.erro ?? 'rede' });

  // 2. O resto do que não depende de nada, em paralelo.
  const [robots, wp, www] = await Promise.all([coletarRobots(buscar, origem), coletarWordpress(buscar, baseDaRest(cab?.link, alvo), alvo.dominio), checarWww(buscar, alvo, hostFinal)]);

  // 3. O sitemap (o robots pode apontar onde ele está).
  const sitemap = await coletarSitemap(buscar, alvo, robots.dados);

  // 4. As outras páginas: do sitemap primeiro (páginas, posts), depois as
  //    da REST, depois o resto do sitemap; no máximo 14 além da inicial.
  // (os sub-sitemaps já vieram na ordem páginas, posts, resto)
  const doSitemap = sitemap.dados?.urls_todas ?? [];
  const candidatos = [
    ...doSitemap.map((u) => u.loc),
    ...(wp.todos ?? []).filter((i) => !i.padrao_wp).map((i) => i.link),
    ...(wp.todos ?? []).filter((i) => i.padrao_wp).map((i) => i.link),
  ].filter(Boolean);
  // Se nem a inicial abriu (firewall, certificado, site fora), as outras
  // dariam o mesmo: não gasta 14 pedidos para saber disso.
  const outras = abriu(inicio) ? escolherPaginas(inicio.url, candidatos, alvo.dominio, MAX_PAGINAS - 1) : [];
  const lidas = await emLotes(outras, PARALELO_SITE, async (u) => (await lerUma(buscar, u)).pagina);
  const lista = [inicio, ...lidas];

  // Partes e dados.
  if (abriu(inicio)) {
    const ruins = lidas.filter((p) => p.erro && falhaDeColeta(p.erro));
    res.paginas = {
      estado: ruins.length ? 'parcial' : 'ok',
      motivo: ruins.length ? (ruins.some((p) => p.erro === 'prazo') ? 'prazo' : 'algumas_paginas') : undefined,
      dados: { lista, etiquetas: somarEtiquetas(lista), redirecionamento_www: www },
    };
    if (ruins.length) avisos.push(`Não deu para ler ${plural(ruins.length, 'página', 'páginas')} do site nesta coleta.`);
    const grandes = lista.filter((p) => p.truncada);
    if (grandes.length) avisos.push(`${plural(grandes.length, 'página passou', 'páginas passaram')} de 2 MB e só o começo foi lido.`);
  } else {
    res.paginas = { estado: inicio.erro === 'prazo' ? 'parcial' : 'erro', motivo: inicio.erro ?? 'rede' };
    if (inicio.status === 403 || inicio.status === 503 || inicio.status === 429) {
      avisos.push(`O site respondeu ${inicio.status} ao servidor do Painel. Pode ser o firewall da hospedagem barrando o acesso de fora.`);
    } else if (inicio.erro === 'certificado') {
      avisos.push('O certificado do site foi recusado na conexão segura. Confira se ele venceu.');
    } else if (inicio.erro === 'redireciona_para_fora') {
      avisos.push('A página inicial redireciona para fora do domínio cadastrado. Confira o endereço do canal Site.');
    } else {
      avisos.push('Não deu para abrir a página inicial do site nesta coleta.');
    }
  }
  res.robots = robots;
  if (sitemap.dados) {
    const { urls_todas: _todas, ...semTodas } = sitemap.dados;
    res.sitemap = { ...sitemap, dados: semTodas, todas: _todas };
  } else res.sitemap = sitemap;
  res.wordpress = wp;
  res.dns = await dnsP;
  res.versoes = await versoesP;
  return { res, avisos, todosWp: wp.todos ?? [], inicio };
}

/** Do sitemap e da REST, as páginas a ler além da inicial (sem repetir). */
export function escolherPaginas(inicio, candidatos, dominio, max = MAX_PAGINAS - 1) {
  const fora = [];
  const vistos = new Set([chaveUrl(inicio)]);
  for (const c of candidatos) {
    if (fora.length >= max) break;
    const u = alvoPermitido(c, dominio);
    if (!u) continue;
    const k = chaveUrl(u);
    if (vistos.has(k)) continue;
    vistos.add(k);
    fora.push(u);
  }
  return fora;
}

/** PageSpeed e CrUX, só com a chave. A chave vai no cabeçalho e em nenhum
 *  outro lugar. A primeira chamada (CrUX da origem) testa a chave: recusada,
 *  nada mais é pedido. */
async function coletarGoogle(ctx, chave, medir, prazo, hoje) {
  const avisos = [];
  const bloqueio = { psi: null, crux: null };
  const origem = medir.origem;
  const cab = { 'x-goog-api-key': chave, 'content-type': 'application/json' };

  const crux = async (corpo, rotulo, historico = false) => {
    if (bloqueio.crux) return { motivo: bloqueio.crux, pulado: true };
    if (!(Number(prazo()) >= MIN_PEDIDO)) return { motivo: 'prazo', pulado: true };
    const r = await pedirJson(ctx, historico ? CRUX_HIST : CRUX, { method: 'POST', headers: cab, body: JSON.stringify(corpo), rotulo });
    if (r.ok) return { corpo: r.corpo };
    const motivo = r.tempo ? 'sem_resposta' : motivoGoogle(r.status, r.corpo);
    // Chave recusada ou cota no fim: insistir só gasta erro (sem repetir).
    if (DE_CHAVE.has(motivo) || motivo === 'cota') bloqueio.crux = motivo;
    if (motivo === 'chave_recusada') bloqueio.psi = motivo;
    return { motivo };
  };
  const psi = async (estrategia, categorias, rotulo) => {
    if (bloqueio.psi) return { motivo: bloqueio.psi, pulado: true };
    const resta = Number(prazo());
    if (!(resta >= MIN_PSI)) return { motivo: 'prazo', pulado: true };
    const r = await pedirJsonDemorado(ctx, urlPageSpeed(medir.url, estrategia, categorias), {
      headers: { 'x-goog-api-key': chave }, rotulo, timeoutMs: Math.min(TEMPO_PSI, resta - MIN_PEDIDO),
    });
    if (r.ok) return { corpo: r.corpo };
    const motivo = r.grande ? 'grande_demais' : r.tempo ? 'sem_resposta' : motivoGoogle(r.status, r.corpo);
    if (DE_CHAVE.has(motivo)) bloqueio.psi = motivo;
    return { motivo };
  };

  // 1. A sonda.
  const todos = await crux({ origin: origem }, 'crux origem');
  // 2. O PageSpeed, que é o lento, sai já e em paralelo: as quatro chamadas
  //    juntas cabem nos 110 s; uma atrás da outra, não.
  const psiP = Promise.all([
    psi('MOBILE', PRINCIPAIS, 'pagespeed celular'), psi('DESKTOP', PRINCIPAIS, 'pagespeed computador'),
    psi('MOBILE', ['AGENTIC_BROWSING'], 'pagespeed celular agentes'), psi('DESKTOP', ['AGENTIC_BROWSING'], 'pagespeed computador agentes'),
  ]);
  // 3. O resto da CrUX. Se a origem inteira não tem dados, celular e
  //    computador também não (são pedaços dela): não pergunta.
  const semDados = todos.motivo === 'sem_dados';
  const pular = { motivo: 'sem_dados', pulado: true };
  const celular = semDados ? pular : await crux({ origin: origem, formFactor: 'PHONE' }, 'crux origem celular');
  const computador = semDados ? pular : await crux({ origin: origem, formFactor: 'DESKTOP' }, 'crux origem computador');
  const inicio = semDados ? pular : await crux({ url: medir.url }, 'crux pagina inicial');
  // A History pode ter semanas antigas mesmo quando a janela atual não tem.
  const histCel = await crux({ origin: origem, formFactor: 'PHONE', collectionPeriodCount: 25 }, 'crux historico celular', true);
  const histPc = histCel.motivo === 'sem_dados' ? pular : await crux({ origin: origem, formFactor: 'DESKTOP', collectionPeriodCount: 25 }, 'crux historico computador', true);
  const [psiCel, psiPc, agCel, agPc] = await psiP;

  const partes = {}, dados = {};

  // CrUX
  const chamadasCrux = [todos, celular, computador, inicio, histCel, histPc];
  if (DE_CHAVE.has(todos.motivo)) {
    partes.crux = { estado: 'falta_configurar', motivo: todos.motivo };
  } else if (todos.motivo && todos.motivo !== 'sem_dados') {
    partes.crux = { estado: todos.motivo === 'prazo' ? 'parcial' : 'erro', motivo: todos.motivo };
  } else {
    const falhas = chamadasCrux.filter((x) => x.motivo && x.motivo !== 'sem_dados');
    const vazio = chamadasCrux.every((x) => x.motivo === 'sem_dados');
    partes.crux = falhas.length ? { estado: 'parcial', motivo: falhas[0].motivo } : { estado: 'ok', motivo: vazio ? 'sem_dados' : undefined };
    const ler = (x) => (x.corpo ? lerCrux(x.corpo) : null);
    const historico = { celular: histCel.corpo ? lerCruxHistorico(histCel.corpo) : null, computador: histPc.corpo ? lerCruxHistorico(histPc.corpo) : null };
    dados.crux = {
      sem_dados: vazio,
      origem: { todos: ler(todos), celular: ler(celular), computador: ler(computador) },
      inicio: ler(inicio),
      historico,
      semanas: cwvPorSemana(historico, semanasFechadas(hoje)),
    };
  }

  // PageSpeed
  const principalCel = psiCel.corpo ? lerPageSpeed(psiCel.corpo) : null;
  const principalPc = psiPc.corpo ? lerPageSpeed(psiPc.corpo) : null;
  const valeu = (x) => !!x && !x.erro_execucao && Object.entries(x.notas).some(([k, v]) => k !== 'agentes' && v != null);
  // Resposta que chegou mas não mediu (runtimeError, sem nota nenhuma).
  const motivoDe = (r, x) => r.motivo ?? (valeu(x) ? null : 'medicao_falhou');
  const motivoPsi = [motivoDe(psiCel, principalCel), motivoDe(psiPc, principalPc)].find(Boolean);
  const celularPsi = juntarPsi(principalCel, agCel.corpo ? lerPageSpeed(agCel.corpo) : null);
  const pcPsi = juntarPsi(principalPc, agPc.corpo ? lerPageSpeed(agPc.corpo) : null);
  const bons = [valeu(principalCel), valeu(principalPc)].filter(Boolean).length;
  if (bons === 2) partes.pagespeed = { estado: 'ok' };
  else if (bons === 1) partes.pagespeed = { estado: 'parcial', motivo: motivoPsi };
  else if (DE_CHAVE.has(motivoPsi)) partes.pagespeed = { estado: 'falta_configurar', motivo: motivoPsi };
  else partes.pagespeed = { estado: motivoPsi === 'prazo' ? 'parcial' : 'erro', motivo: motivoPsi };
  if (bons) dados.pagespeed = { url: medir.url, celular: celularPsi, computador: pcPsi };
  for (const [x, nome] of [[celularPsi, 'celular'], [pcPsi, 'computador']]) {
    if (x?.erro_execucao) avisos.push(`O PageSpeed não conseguiu medir a página no ${nome} (${x.erro_execucao}); as notas desse lado ficam em branco.`);
  }
  const agRecusado = [agCel, agPc].filter((x) => x.motivo && !x.pulado && !DE_CHAVE.has(x.motivo));
  if (agRecusado.length && bons) avisos.push('O PageSpeed não devolveu a categoria de navegação por agentes (AGENTIC_BROWSING); as outras notas vieram.');

  // Avisos da chave, uma vez só.
  const motivosChave = new Set([todos.motivo, psiCel.motivo, psiPc.motivo].filter((m) => DE_CHAVE.has(m)));
  if (motivosChave.has('chave_recusada')) avisos.push('O Google recusou a chave GOOGLE_API_KEY. Confira se ela existe e se está restrita à PageSpeed Insights API e à Chrome UX Report API.');
  else {
    if (DE_CHAVE.has(todos.motivo)) avisos.push('A chave GOOGLE_API_KEY não tem acesso à Chrome UX Report API: ative a API no projeto do Google Cloud e confira as restrições da chave.');
    if (DE_CHAVE.has(psiCel.motivo) || DE_CHAVE.has(psiPc.motivo)) avisos.push('A chave GOOGLE_API_KEY não tem acesso à PageSpeed Insights API: ative a API no projeto do Google Cloud e confira as restrições da chave.');
  }
  if ([todos, psiCel, psiPc].some((x) => x.motivo === 'prazo')) avisos.push('O tempo da coleta acabou antes do PageSpeed ou da CrUX; o resto fica para a próxima.');
  if ([todos, psiCel, psiPc].some((x) => x.motivo === 'cota')) avisos.push('A cota do Google para esta chave acabou por hoje.');
  return { partes, dados, avisos };
}

function estadoGeral(partes) {
  const e = Object.values(partes).map((p) => p.estado);
  if (e.every((x) => x === 'ok')) return 'ok';
  if (!e.includes('ok') && !e.includes('parcial')) return 'erro';
  return 'parcial';
}

export async function coletar(ctx) {
  const hoje = typeof ctx?.hoje === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ctx.hoje) ? ctx.hoje : hojeSP();
  const prazo = typeof ctx?.prazo === 'function' ? () => Number(ctx.prazo()) : () => Infinity;
  const log = (t) => { try { ctx?.log?.(t); } catch { /* o diário não derruba a coleta */ } };
  const quando = () => new Date().toISOString();
  const canal = (Array.isArray(ctx?.canais) ? ctx.canais : []).find((c) => c?.codigo === 'site');
  const alvo = canal ? dominioDoSite(canal.url_perfil ?? canal.urlPerfil) : null;

  if (!alvo) {
    const em = quando();
    return {
      estado: 'falta_configurar', conta: null,
      partes: Object.fromEntries(PARTES.map((p) => [p, parteDe(p, 'falta_configurar', 'sem_endereco', em)])),
      dados: {}, semanas: [], publicacoes: [],
      avisos: [canal
        ? 'O endereço do canal Site precisa ser público e começar com https:// (Configurações, Marketing, Canais).'
        : 'Não há canal Site ativo com endereço cadastrado (Configurações, Marketing, Canais).'],
    };
  }

  // O nome passou na trava; agora o endereço: nenhum IP interno, e só o nome
  // que mostrou IP de internet no DNS público é pedido (conferirDns).
  const ips = await conferirDns(ctx, [alvo.dominio, `www.${alvo.dominio}`], prazo);
  if (ips.internos.length) {
    const em = quando();
    log('site: o endereço do canal Site aponta para IP interno; nada foi pedido');
    return {
      estado: 'falta_configurar', conta: null,
      partes: Object.fromEntries(PARTES.map((p) => [p, parteDe(p, 'falta_configurar', 'ip_interno', em)])),
      dados: {}, semanas: [], publicacoes: [],
      avisos: ['O endereço do canal Site aponta para um IP de rede interna, e por isso nada foi lido. Confira o endereço em Configurações, Marketing, Canais.'],
    };
  }
  // O nome do cadastro sem IP de internet no DNS público: nada é pedido. É
  // "erro" (e não falta_configurar): um SERVFAIL passa, e a próxima coleta
  // confere de novo; o que estava na tela continua.
  if (ips.semIp.includes(alvo.host)) {
    const em = quando();
    log(`site: o DNS público não mostrou IP de internet para ${alvo.host}; nada foi pedido`);
    return {
      estado: 'erro', conta: null,
      partes: Object.fromEntries(PARTES.map((p) => [p, parteDe(p, 'erro', 'sem_ip', em)])),
      dados: {}, semanas: [], publicacoes: [],
      avisos: [`O DNS público não mostrou um endereço de internet para ${alvo.host}, e por isso nada foi lido. Se o site está no ar, a próxima coleta confere de novo; se não, confira o endereço do canal Site em Configurações, Marketing, Canais.`],
    };
  }
  if (ips.semIp.length) log(`site: ${ips.semIp.join(', ')} sem IP de internet no DNS público; não será pedido`);
  if (ips.naoConferidos.length) log('site: o DNS não respondeu; o IP do site não foi conferido nesta coleta');
  else log('site: IP conferido no dns.google; a troca de IP depois da conferência (DNS rebinding) segue como risco anotado');

  const chave = String(ctx?.env?.('GOOGLE_API_KEY') ?? '').trim();
  const fetchBruto = typeof ctx?.fetch === 'function' ? ctx.fetch : globalThis.fetch;
  const buscar = criarBuscador(fetchBruto, alvo.dominio, { prazo, semIp: ips.semIp });

  // A página inicial vem antes de tudo: o PageSpeed e a CrUX medem o
  // endereço FINAL dela (cadastro com www num site que vive sem www daria
  // "sem dados" na CrUX), e a REST mora onde o cabeçalho Link dela diz.
  const primeira = await lerUma(buscar, alvo.inicio);
  const medir = abriu(primeira.pagina)
    ? { origem: new URL(primeira.pagina.url).origin, url: primeira.pagina.url }
    : { origem: `https://${alvo.host}`, url: alvo.inicio };

  const semChave = { partes: { pagespeed: { estado: 'falta_configurar', motivo: 'sem_chave' }, crux: { estado: 'falta_configurar', motivo: 'sem_chave' } }, dados: {}, avisos: ['PageSpeed e CrUX ficam desligados até a chave GOOGLE_API_KEY ser cadastrada nos Secrets do Supabase.'] };
  const falhou = (partesNomes) => (e) => {
    log(`site: falha interna (${String(e?.name ?? 'Error')})`);
    return { partes: Object.fromEntries(partesNomes.map((p) => [p, { estado: 'erro', motivo: 'falha_interna' }])), dados: {}, avisos: ['Um erro inesperado no conector do site parou parte da coleta.'] };
  };
  const [g, s] = await Promise.all([
    chave ? coletarGoogle(ctx, chave, medir, prazo, hoje).catch(falhou(['pagespeed', 'crux'])) : Promise.resolve(semChave),
    coletarSite(ctx, buscar, alvo, prazo, primeira).catch((e) => ({ ...falhou(['paginas', 'robots', 'sitemap', 'wordpress', 'dns', 'versoes'])(e), erro: true })),
  ]);

  const partes = {}, dados = {};
  const em = quando();
  if (!s.erro) {
    for (const [nome, r] of Object.entries(s.res)) {
      partes[nome] = parteDe(nome, r.estado, r.motivo, em);
      if (r.dados && r.estado !== 'erro') dados[nome] = r.dados;
    }
  } else {
    for (const [nome, p] of Object.entries(s.partes)) partes[nome] = parteDe(nome, p.estado, p.motivo, em);
  }
  for (const [nome, p] of Object.entries(g.partes)) partes[nome] = parteDe(nome, p.estado, p.motivo, em);
  Object.assign(dados, g.dados);

  const inicio = s.inicio;
  dados.site = {
    dominio: alvo.dominio,
    inicio: medir.url,
    nome: (abriu(inicio) ? inicio.og.nome_site : null) ?? dados.wordpress?.nome ?? null,
  };
  // A comparação sitemap x REST precisa da lista inteira do sitemap, que não
  // vai para a tela (até 5.000 endereços): entra só nesta conta.
  dados.conferencias = conferir({ ...dados, sitemap: dados.sitemap ? { ...dados.sitemap, urls_todas: s.res?.sitemap?.todas ?? dados.sitemap.urls } : undefined });

  const publicacoes = s.res?.wordpress?.estado !== 'erro' ? publicacoesDoWordpress(s.todosWp ?? [], canal.codigo, alvo.dominio) : [];
  const avisos = [...(s.avisos ?? []), ...(g.avisos ?? [])];
  for (const [nome, p] of Object.entries(partes)) if (p.codigo === 'prazo') log(`site: a parte ${nome} parou no prazo`);

  return { estado: estadoGeral(partes), conta: alvo.dominio, partes, dados, semanas: [], publicacoes, avisos };
}
