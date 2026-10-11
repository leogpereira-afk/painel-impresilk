/* O CONECTOR "site" NA SUB-ABA "DADOS" DO CANAL SITE: o que se lê do site de
 * fora, sem login (formato na seção FORMATO de
 * supabase/functions/_shared/mkt-fontes/site.mjs).
 *
 * Sete quadros, cada um com as partes da fonte que ele mostra (o estado do
 * quadro é o pior entre elas):
 *  - Avisos de melhoria (as conferências que o conector tirou desta coleta);
 *  - Etiquetas por página (paginas): GA4, Google Ads, Gerenciador de Tags,
 *    Pixel da Meta e as outras, em que página cada uma falta, e os scripts,
 *    eventos, verificações e consentimento de cada página;
 *  - Páginas do site (paginas): o SEO, o compartilhamento (Open Graph), os
 *    dados estruturados, os contatos, a plataforma e a resposta de CADA
 *    página lida, e não só da inicial;
 *  - Velocidade, PageSpeed (pagespeed): as notas do celular e do computador;
 *  - Experiência real, CrUX (crux): LCP, INP e CLS de quem usa o Chrome;
 *  - robots.txt e sitemap (robots, sitemap);
 *  - WordPress, versões e DNS (wordpress, versoes, dns).
 *
 * TODO TEXTO DAQUI VEIO DO HTML DO SITE (um site invadido escreve o que
 * quiser): sai como texto, e link só pelo linkSeguro (marketing-dados.js).
 */
import {
  blocoAvisos,
  blocoGrafico,
  blocoNumeros,
  blocoPares,
  blocoTabela,
  blocoTexto,
  col,
  conhecido,
  formatar,
  juntar,
  lista,
  medida,
  montarQuadro,
  numero,
  objeto,
  ordenar,
  plural,
  rotuloDia,
  rotuloInstante,
  rotuloPeriodo,
  secao,
  secaoTabela,
  texto,
  traduzir,
} from './marketing-dados.js';
import { fmtDecimal, fmtNumero, motivoLegivel } from './marketing-fontes.js';

/** As etiquetas que o conector procura, na ordem da tela (os nomes são os
 *  das conferências do conector: "Gerenciador de Tags", "Pixel da Meta"). */
export const ETIQUETAS = Object.freeze([
  ['ga4', 'GA4'],
  ['google_ads', 'Google Ads'],
  ['gtm', 'Gerenciador de Tags'],
  ['meta_pixel', 'Pixel da Meta'],
  ['linkedin', 'LinkedIn Insight'],
  ['pinterest', 'Pinterest'],
  ['tiktok', 'TikTok'],
  ['clarity', 'Clarity'],
  ['hotjar', 'Hotjar'],
  ['contentsquare', 'Contentsquare'],
]);

/** Os scripts que o conector acha na página mesmo sem o ID (os "sinais"). */
export const SINAIS = Object.freeze([
  ['gtag_script', 'Google (gtag)'],
  ['meta_script', 'Meta'],
  ['linkedin_script', 'LinkedIn'],
  ['linkedin_lintrk', 'LinkedIn (lintrk)'],
  ['pinterest_script', 'Pinterest'],
  ['tiktok_script', 'TikTok'],
  ['clarity_script', 'Clarity'],
  ['hotjar_script', 'Hotjar'],
  ['contentsquare_uxa', 'Contentsquare'],
]);

const VERIFICACOES = Object.freeze([
  ['google_site_verification', 'Google'],
  ['facebook_domain_verification', 'Facebook'],
  ['pinterest', 'Pinterest'],
  ['bing', 'Bing'],
]);

// As sete chaves do Consent Mode do Google, com nome de gente. Chave fora
// delas (erro de digitação no site) vira "outra chave", nunca o código.
const CHAVES_CONSENTIMENTO = Object.freeze({
  ad_storage: 'anúncios (cookies)', analytics_storage: 'análise (cookies)', ad_user_data: 'dados para anúncios', ad_personalization: 'anúncios personalizados',
  functionality_storage: 'funcionamento do site', personalization_storage: 'personalização', security_storage: 'segurança',
});
export const nomeDaChaveDeConsentimento = (k) => traduzir(CHAVES_CONSENTIMENTO, k, 'outra chave');
// O tipo do Open Graph e o cartão do X que a página declara (vocabulário
// fixo): o conhecido em português; o que o site inventou vai como ele
// escreveu (é texto do site, como o título).
const TIPO_OG = Object.freeze({ website: 'site', article: 'artigo', product: 'produto', profile: 'perfil', 'business.business': 'empresa', book: 'livro', 'video.other': 'vídeo', 'video.movie': 'vídeo', 'music.song': 'música' });
const CARTAO_X = Object.freeze({ summary: 'resumo', summary_large_image: 'resumo com imagem grande', app: 'aplicativo', player: 'vídeo ou áudio' });
const traduzirDoSite = (mapa, v) => conhecido(mapa, typeof v === 'string' ? v.trim().toLowerCase() : v) ?? texto(v, 80);

/** O cabeçalho x-cache do servidor ("HIT", "MISS", "HIT from cloudfront")
 *  em português; valor que a tela não conhece vai como o servidor escreveu
 *  (é texto do servidor). */
export function textoDoCache(v) {
  const t = texto(v, 80);
  if (!t) return null;
  if (/\bHIT\b/i.test(t)) return 'servida do cache';
  if (/\bMISS\b/i.test(t)) return 'fora do cache';
  if (/\bBYPASS\b/i.test(t)) return 'cache ignorado';
  if (/\b(EXPIRED|STALE)\b/i.test(t)) return 'cache vencido';
  if (/\bDYNAMIC\b/i.test(t)) return 'sem cache (página dinâmica)';
  return t;
}

/** O caminho de um endereço do site ("/?page_id=144"), para a tabela caber;
 *  o endereço inteiro vai no title e no link. */
export function caminho(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || '/';
  } catch {
    return texto(url, 120);
  }
}

const semWww = (h) => String(h ?? '').replace(/^www\./i, '').toLowerCase();

/** Um endereço citado numa página (canônico, imagem, logo): só o caminho
 *  quando é do mesmo site da página; de outro site, com o nome dele na
 *  frente, porque um canônico que aponta para fora não pode parecer da casa. */
export function enderecoRelativo(url, base) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    let mesmo = false;
    try {
      mesmo = !!base && semWww(new URL(base).hostname) === semWww(u.hostname);
    } catch {
      mesmo = false;
    }
    if (mesmo) return `${u.pathname}${u.search}` || '/';
    return `${semWww(u.hostname)}${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  } catch {
    return texto(url, 120);
  }
}

/** Os dois endereços são a mesma página? (com e sem www, com e sem a barra
 *  do fim). O canônico que aponta para a própria página é o normal, e a
 *  tabela diz isso em vez de repetir o endereço. */
export function mesmoEndereco(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    const chave = (u) => `${semWww(u.hostname)}${u.pathname.replace(/\/+$/, '')}${u.search}`;
    return chave(x) === chave(y);
  } catch {
    return false;
  }
}

/** Perfil de rede social curto: "instagram.com/impresilk". */
export function enderecoCurto(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    return `${semWww(u.hostname)}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return texto(url, 120);
  }
}

/* As réguas do Google para as medidas de velocidade (web.dev e Lighthouse):
   até o primeiro número é bom, até o segundo precisa melhorar, acima é
   ruim. */
export const REGUAS = Object.freeze({
  lcp_ms: [2500, 4000],
  inp_ms: [200, 500],
  cls: [0.1, 0.25],
  fcp_ms: [1800, 3000],
  ttfb_ms: [800, 1800],
  tbt_ms: [200, 600],
  si_ms: [3400, 5800],
  tti_ms: [3800, 7300],
});
const FAIXA_TOM = Object.freeze({ bom: 'ok', melhorar: 'warn', ruim: 'bad' });
const FAIXA_TEXTO = Object.freeze({ bom: 'bom', melhorar: 'precisa melhorar', ruim: 'ruim' });

/** O tom de uma medida pela régua (null quando não mediu ou não tem régua). */
export function tomDaMedida(chave, v) {
  const n = medida(v);
  const r = REGUAS[chave];
  if (n === null || !r) return null;
  return n <= r[0] ? 'ok' : n <= r[1] ? 'warn' : 'bad';
}

/** O tom de uma nota do PageSpeed (0 a 100): 90 ou mais verde, 50 a 89
 *  âmbar, abaixo de 50 vermelho (a régua do próprio Lighthouse). */
export function tomDaNota(v) {
  const n = medida(v);
  if (n === null) return null;
  return n >= 90 ? 'ok' : n >= 50 ? 'warn' : 'bad';
}

const MEDIDAS = Object.freeze([
  ['lcp_ms', 'Maior conteúdo (LCP)', 'ms'],
  ['inp_ms', 'Resposta ao toque (INP)', 'ms'],
  ['cls', 'Estabilidade (CLS)', 'dec2'],
  ['fcp_ms', 'Primeiro conteúdo (FCP)', 'ms'],
  ['ttfb_ms', 'Resposta do servidor (TTFB)', 'ms'],
]);
// A CrUX também manda o tempo de ida e volta da rede (só o percentil 75,
// sem a régua de bom e ruim).
const MEDIDAS_CRUX = Object.freeze([...MEDIDAS, ['rtt_ms', 'Ida e volta da rede (RTT)', 'ms']]);

/** O problema de um endereço do site (as tentativas do sitemap): http_404
 *  vira "respondeu 404"; os outros códigos, a frase do motivo. */
function problemaDoSite(codigo) {
  const c = texto(codigo, 60);
  if (!c) return null;
  const http = /^http_(\d{3})$/.exec(c);
  if (http) return `respondeu ${http[1]}`;
  return motivoLegivel(c) ?? 'outro problema';
}

/** Os nomes marcados (true) de um objeto de sim e não. Objeto ausente é
 *  null (não lido); lido e sem nenhum marcado é `nenhum`. */
function marcados(obj, nomes, nenhum = 'nenhum') {
  if (!objeto(obj)) return null;
  const l = nomes.filter(([k]) => obj[k] === true).map(([, r]) => r);
  return l.length ? l.join(', ') : nenhum;
}

/** A lista que a página trouxe: vazia é `nenhum` (lida, e não tem);
 *  ausente é null (não lida). */
const listaOuNenhum = (v, nenhum = 'nenhum', rotular) => (Array.isArray(v) ? juntar(v, rotular ? { rotular } : {}) ?? nenhum : null);

/* ------------------------------------------------------------- avisos -- */

const ORDEM_NIVEL = { alerta: 0, atencao: 1, info: 2 };

function corpoAvisos(conferencias) {
  const itens = lista(conferencias)
    .filter((c) => objeto(c) && texto(c.texto))
    .sort((a, b) => (ORDEM_NIVEL[a.nivel] ?? 3) - (ORDEM_NIVEL[b.nivel] ?? 3));
  const conta = (n) => itens.filter((c) => c.nivel === n).length;
  return {
    destaque: itens.length ? plural(itens.length, 'aviso', 'avisos') : 'nenhum aviso',
    topo: itens.length
      ? [
        blocoNumeros([
          numero({ id: 'alerta', rotulo: 'Alertas', valor: conta('alerta') }),
          numero({ id: 'atencao', rotulo: 'Pedem atenção', valor: conta('atencao') }),
          numero({ id: 'info', rotulo: 'Para saber', valor: conta('info') }),
        ]),
        blocoAvisos(itens.map((c) => ({ nivel: c.nivel, texto: texto(c.texto, 400) }))),
      ]
      : [blocoTexto('Nenhum aviso: a última coleta não achou o que melhorar.', 'ok')],
    notas: ['Tirados só das partes do site que vieram nesta coleta.'],
  };
}

/* ---------------------------------------------------------- etiquetas -- */

/* A marca de uma etiqueta numa página: instalada; FALTA quando o conector
   lista a página em `sem` (a etiqueta está em outras e esta, que está no
   Google, não tem); senão, não aparece (em página nenhuma, ou numa página
   fora do Google, que o conector não conta como falta). A matriz e a tabela
   "Por etiqueta" dizem a mesma coisa. */
function marcaDaEtiqueta(pagina, chave, tipos) {
  if (lista(pagina?.etiquetas?.[chave]).length) return 'sim';
  const t = tipos[chave];
  return t?.presente === true && lista(t.sem).includes(pagina?.url) ? 'falta' : 'nao';
}

const colPagina = () => col('pagina', 'Página', 'texto', { valor: (p) => caminho(p.url), link: (p) => p.url, titulo: (p) => p.url });

/** As chaves do Consent Mode que aparecem em alguma página (sem repetir).
 *  Nenhuma página com o consentimento lido: null. */
export function chavesDoConsentimento(paginas) {
  const lidas = lista(paginas).filter((p) => objeto(p) && !p.erro && objeto(p.consentimento) && Array.isArray(p.consentimento.consent_chaves));
  if (!lidas.length) return null;
  return juntar([...new Set(lidas.flatMap((p) => lista(p.consentimento.consent_chaves).map(nomeDaChaveDeConsentimento)))]) ?? 'nenhuma';
}

function corpoEtiquetas(pg) {
  const et = objeto(pg.etiquetas) ? pg.etiquetas : {};
  const tipos = objeto(et.tipos) ? et.tipos : {};
  const paginas = lista(pg.lista).filter(objeto);
  const abertas = paginas.filter((p) => !p.erro);
  const lidas = medida(et.paginas_lidas) ?? abertas.length;
  const presentes = ETIQUETAS.filter(([k]) => tipos[k]?.presente === true);
  const comFalta = presentes.filter(([k]) => lista(tipos[k]?.sem).length > 0);
  const consent = objeto(et.consentimento) ? et.consentimento : {};
  const ver = objeto(et.verificacoes) ? et.verificacoes : {};
  const ev = objeto(et.eventos) ? et.eventos : {};

  const colunasMatriz = [
    colPagina(),
    ...ETIQUETAS.map(([k, rotulo]) =>
      col(k, rotulo, 'texto', {
        valor: (p) => (p.erro ? null : { sim: 'sim', falta: 'falta', nao: 'não' }[marcaDaEtiqueta(p, k, tipos)]),
        marca: (p) => (p.erro ? null : marcaDaEtiqueta(p, k, tipos)),
        titulo: (p) => {
          const m = marcaDaEtiqueta(p, k, tipos);
          if (m === 'sim') return `${rotulo} instalada nesta página (${lista(p.etiquetas?.[k]).join(', ')})`;
          if (m === 'falta') return `${rotulo} falta nesta página (está em outras)`;
          return tipos[k]?.presente === true ? `${rotulo} não aparece nesta página, que está fora do Google (não conta como falta)` : `${rotulo} não aparece em nenhuma página lida`;
        },
      })
    ),
  ];

  return {
    destaque: `${presentes.length} de ${ETIQUETAS.length} etiquetas${comFalta.length ? `, ${comFalta.length} com falta` : ''}`,
    topo: [
      blocoNumeros([
        numero({ id: 'lidas', rotulo: 'Páginas lidas', valor: lidas }),
        numero({ id: 'presentes', rotulo: 'Etiquetas achadas', valor: presentes.length, titulo: `De ${ETIQUETAS.length} que o Painel procura.` }),
        numero({ id: 'falta', rotulo: 'Faltam em alguma página', valor: comFalta.length }),
        numero({ id: 'consent', rotulo: 'Consent Mode', tipo: 'sim', valor: typeof consent.consent_mode === 'boolean' ? consent.consent_mode : null }),
        numero({ id: 'banner', rotulo: 'Banner de cookies', tipo: 'texto', valor: consent.banner ?? (typeof consent.consent_mode === 'boolean' ? 'nenhum achado' : null) }),
      ]),
    ],
    secoes: [
      secaoTabela('por_pagina', 'Etiquetas por página', paginas, colunasMatriz, {
        aberta: true, limite: 15, unidade: ['página', 'páginas'],
        nota: 'Marcado: instalada. Falta: a etiqueta está em outras páginas e não nesta. Traço: não aparece (em página nenhuma, ou numa página fora do Google, que não conta). Página que não abriu fica sem marca.',
      }),
      secaoTabela('tipos', 'Por etiqueta', ETIQUETAS.map(([k, rotulo]) => ({ chave: k, rotulo, ...(objeto(tipos[k]) ? tipos[k] : {}) })), [
        col('rotulo', 'Etiqueta'),
        col('situacao', 'Situação', 'texto', {
          valor: (t) => (t.presente === true ? `em ${formatar('int', t.paginas)} de ${formatar('int', lidas)} páginas` : t.presente === false ? 'não encontrada' : null),
          tom: (t) => (t.presente === true ? (lista(t.sem).length ? 'warn' : 'ok') : null),
        }),
        col('ids', 'IDs', 'texto', { valor: (t) => lista(t.ids).join(', ') || null }),
        col('sem', 'Falta em', 'texto', { valor: (t) => lista(t.sem).map(caminho).filter(Boolean).join(', ') || null, max: 400 }),
        col('confirmado', 'Padrão', 'texto', { valor: (t) => (t.presente !== true ? null : t.confirmado === false ? 'de guias de terceiros' : 'oficial') }),
      ], { unidade: ['etiqueta', 'etiquetas'] }),
      secao('eventos', 'Eventos e conversões', [
        blocoPares([
          { rotulo: 'Eventos do Google (gtag)', valor: lista(ev.gtag).join(', ') || 'nenhum' },
          { rotulo: 'Eventos da Meta (fbq)', valor: lista(ev.fbq).join(', ') || 'nenhum' },
          { rotulo: 'Eventos do Pinterest', valor: lista(ev.pintrk).join(', ') || 'nenhum' },
          { rotulo: 'Rótulos de conversão do Google Ads', valor: lista(et.rotulos_conversao).join(', ') || 'nenhum' },
        ]),
      ]),
      secao('verificacoes', 'Verificações e consentimento', [
        blocoPares([
          { rotulo: 'Verificação do Google', valor: ver.google_site_verification, tipo: 'sim' },
          { rotulo: 'Verificação do Facebook', valor: ver.facebook_domain_verification, tipo: 'sim' },
          { rotulo: 'Verificação do Pinterest', valor: ver.pinterest, tipo: 'sim' },
          { rotulo: 'Verificação do Bing', valor: ver.bing, tipo: 'sim' },
          { rotulo: 'Consent Mode do Google', valor: consent.consent_mode, tipo: 'sim' },
          { rotulo: 'Chaves do Consent Mode', valor: chavesDoConsentimento(paginas) },
          { rotulo: 'Banner de cookies', valor: consent.banner ?? (typeof consent.consent_mode === 'boolean' ? 'nenhum achado' : null) },
        ]),
      ]),
      // O que cada página tem por dentro: o script de cada ferramenta (mesmo
      // sem o ID), os eventos, as verificações e o consentimento.
      secaoTabela('scripts', 'Scripts e eventos por página', abertas, [
        colPagina(),
        col('sinais', 'Scripts achados', 'texto', { valor: (p) => marcados(p.sinais, SINAIS), max: 300, titulo: () => 'O script da ferramenta está na página, mesmo quando o ID dela não aparece.' }),
        col('ev_gtag', 'Eventos do Google', 'texto', { valor: (p) => (objeto(p.eventos) ? listaOuNenhum(p.eventos.gtag) : null) }),
        col('ev_fbq', 'Eventos da Meta', 'texto', { valor: (p) => (objeto(p.eventos) ? listaOuNenhum(p.eventos.fbq) : null) }),
        col('ev_pintrk', 'Eventos do Pinterest', 'texto', { valor: (p) => (objeto(p.eventos) ? listaOuNenhum(p.eventos.pintrk) : null) }),
        col('rotulos', 'Rótulos de conversão', 'texto', { valor: (p) => (objeto(p.etiquetas) ? listaOuNenhum(p.etiquetas.ads_rotulos) : null) }),
        col('verificacoes', 'Verificações', 'texto', { valor: (p) => marcados(p.verificacoes, VERIFICACOES, 'nenhuma') }),
        col('consent', 'Consent Mode', 'sim', { valor: (p) => (objeto(p.consentimento) ? p.consentimento.consent_mode : null) }),
        col('consent_chaves', 'Chaves do consentimento', 'texto', { valor: (p) => (objeto(p.consentimento) ? listaOuNenhum(p.consentimento.consent_chaves, 'nenhuma', nomeDaChaveDeConsentimento) : null) }),
        col('banner', 'Banner de cookies', 'texto', { valor: (p) => (objeto(p.consentimento) ? texto(p.consentimento.banner) ?? 'nenhum' : null) }),
      ], { limite: 15, unidade: ['página', 'páginas'], vazio: 'Nenhuma página abriu nesta coleta.', nota: 'Só as páginas que abriram.' }),
    ],
  };
}

/* ------------------------------------------------------ as páginas -- */

/** O resumo das páginas lidas (os números do topo do quadro das páginas).
 *  Cada contagem só existe quando alguma página que abriu trouxe a parte
 *  dela; sem nenhuma, null (não medido), nunca 0. */
export function resumoDasPaginas(paginas) {
  const todas = lista(paginas).filter(objeto);
  const abertas = todas.filter((p) => !p.erro);
  const comSeo = abertas.filter((p) => objeto(p.seo));
  const comOg = abertas.filter((p) => objeto(p.og));
  const conta = (l, f) => (l.length ? l.filter(f).length : null);
  return {
    abertas: todas.length ? abertas.length : null,
    naoAbriram: todas.length ? todas.length - abertas.length : null,
    semDescricao: conta(comSeo, (p) => !texto(p.seo.descricao)),
    semCanonico: conta(comSeo, (p) => !texto(p.seo.canonical)),
    h1ForaDoPadrao: conta(comSeo.filter((p) => medida(p.seo.h1) !== null), (p) => medida(p.seo.h1) !== 1),
    foraDoGoogle: conta(comSeo.filter((p) => typeof p.seo.noindex === 'boolean'), (p) => p.seo.noindex === true),
    semImagem: conta(comOg, (p) => !texto(p.og.imagem)),
  };
}

/** "1.200 x 630" (a imagem de compartilhamento), ou null sem as duas medidas. */
function tamanhoDaImagem(og) {
  const l = medida(og?.imagem_largura), a = medida(og?.imagem_altura);
  return l === null || a === null ? null : `${fmtNumero(l)} x ${fmtNumero(a)}`;
}

/** As coordenadas dos dados estruturados ("-19,91910; -43,93860"). */
function coordenadas(geo) {
  if (!objeto(geo)) return null;
  const lat = medida(geo.lat), lng = medida(geo.lng);
  return lat === null || lng === null ? null : `${fmtDecimal(lat, { casas: 5 })}; ${fmtDecimal(lng, { casas: 5 })}`;
}

function corpoPaginas(pg, site, hoje) {
  const paginas = lista(pg.lista).filter(objeto);
  const abertas = paginas.filter((p) => !p.erro);
  const r = resumoDasPaginas(paginas);
  const www = objeto(pg.redirecionamento_www) ? pg.redirecionamento_www : null;
  const inicio = paginas[0] && !paginas[0].erro ? paginas[0] : null;
  const fora = paginas.length - abertas.length;
  const notaFora = fora === 1
    ? 'Uma página não abriu: ela aparece só em "Resposta das páginas".'
    : fora > 1 ? `${fmtNumero(fora)} páginas não abriram: elas aparecem só em "Resposta das páginas".` : null;
  // Uma tabela por assunto, uma linha por página que abriu.
  const porPagina = (id, titulo, colunas, opcoes = {}) =>
    secaoTabela(id, titulo, abertas, [colPagina(), ...colunas], {
      hoje, limite: 15, unidade: ['página', 'páginas'], vazio: 'Nenhuma página abriu nesta coleta.',
      ...opcoes,
      nota: [opcoes.nota, notaFora].filter(Boolean).join(' ') || null,
    });
  const seo = (p) => (objeto(p.seo) ? p.seo : null);
  const og = (p) => (objeto(p.og) ? p.og : null);
  const de = (p) => (objeto(p.dados_estruturados) ? p.dados_estruturados : null);
  const ct = (p) => (objeto(p.contatos) ? p.contatos : null);
  const pl = (p) => (objeto(p.plataforma) ? p.plataforma : null);
  const sv = (p) => (objeto(p.servidor) ? p.servidor : null);

  return {
    destaque: r.abertas === null ? null : `${plural(r.abertas, 'página lida', 'páginas lidas')}${r.semDescricao ? `, ${formatar('int', r.semDescricao)} sem descrição` : ''}`,
    topo: [
      blocoNumeros([
        numero({ id: 'abertas', rotulo: 'Páginas que abriram', valor: r.abertas }),
        numero({ id: 'falharam', rotulo: 'Não abriram', valor: r.naoAbriram }),
        numero({ id: 'sem_descricao', rotulo: 'Sem descrição', valor: r.semDescricao, titulo: 'Páginas sem a meta description, o texto que o Google mostra embaixo do título.' }),
        numero({ id: 'sem_canonico', rotulo: 'Sem canônico', valor: r.semCanonico }),
        numero({ id: 'h1', rotulo: 'H1 fora do padrão', valor: r.h1ForaDoPadrao, titulo: 'Páginas sem título H1 ou com mais de um (o padrão é um só).' }),
        numero({ id: 'noindex', rotulo: 'Fora do Google', valor: r.foraDoGoogle, titulo: 'Páginas com noindex: o Google não as mostra.' }),
        numero({ id: 'sem_imagem', rotulo: 'Sem imagem ao compartilhar', valor: r.semImagem }),
      ]),
    ],
    secoes: [
      porPagina('seo', 'SEO por página', [
        col('titulo', 'Título', 'texto', { valor: (p) => seo(p)?.titulo, max: 160 }),
        col('descricao', 'Descrição', 'texto', {
          valor: (p) => (seo(p) ? texto(seo(p).descricao, 300) ?? 'sem descrição' : null),
          tom: (p) => (seo(p) && !texto(seo(p).descricao) ? 'warn' : null),
        }),
        col('canonical', 'Canônico', 'texto', {
          valor: (p) => (seo(p) ? (texto(seo(p).canonical) ? (mesmoEndereco(seo(p).canonical, p.url) ? 'a própria página' : enderecoRelativo(seo(p).canonical, p.url)) : 'sem canônico') : null),
          link: (p) => seo(p)?.canonical,
          titulo: (p) => seo(p)?.canonical,
        }),
        col('robots', 'Robots da página', 'texto', { valor: (p) => (seo(p) ? texto(seo(p).robots, 160) ?? 'padrão (sem a meta robots)' : null) }),
        col('lang', 'Idioma', 'idioma', { valor: (p) => seo(p)?.lang }),
        col('h1', 'Títulos H1', 'int', { valor: (p) => seo(p)?.h1, tom: (p) => (medida(seo(p)?.h1) !== null && medida(seo(p).h1) !== 1 ? 'warn' : null) }),
        col('noindex', 'Fora do Google (noindex)', 'sim', { valor: (p) => seo(p)?.noindex, tom: (p) => (seo(p)?.noindex === true ? 'warn' : null) }),
      ], { aberta: true, nota: 'O título e a descrição são o que o Google costuma mostrar no resultado. Canônico: o endereço que a página diz ser o dela.' }),
      porPagina('compartilhamento', 'Compartilhamento (Open Graph)', [
        col('og_titulo', 'Título', 'texto', { valor: (p) => og(p)?.titulo, max: 160 }),
        col('og_descricao', 'Descrição', 'texto', { valor: (p) => og(p)?.descricao, max: 300 }),
        col('og_imagem', 'Imagem', 'texto', {
          valor: (p) => (og(p) ? (texto(og(p).imagem) ? enderecoRelativo(og(p).imagem, p.url) : 'sem imagem') : null),
          link: (p) => og(p)?.imagem,
          titulo: (p) => og(p)?.imagem,
          tom: (p) => (og(p) && !texto(og(p).imagem) ? 'warn' : null),
        }),
        col('og_tamanho', 'Tamanho da imagem', 'texto', { valor: (p) => tamanhoDaImagem(og(p)), numerico: true }),
        col('og_tipo', 'Tipo', 'texto', { valor: (p) => traduzirDoSite(TIPO_OG, og(p)?.tipo) }),
        col('og_site', 'Nome do site', 'texto', { valor: (p) => og(p)?.nome_site }),
        col('og_url', 'Endereço compartilhado', 'texto', { valor: (p) => (texto(og(p)?.url) ? (mesmoEndereco(og(p).url, p.url) ? 'a própria página' : enderecoRelativo(og(p).url, p.url)) : null), link: (p) => og(p)?.url, titulo: (p) => og(p)?.url }),
        col('og_cartao', 'Cartão do X (Twitter)', 'texto', { valor: (p) => traduzirDoSite(CARTAO_X, og(p)?.twitter_card) }),
        col('og_atualizado', 'Atualizado', 'instante', { valor: (p) => og(p)?.atualizado_em }),
      ], { nota: 'O que aparece quando alguém manda o link no WhatsApp, no Facebook ou no LinkedIn.' }),
      porPagina('estruturados', 'Dados estruturados', [
        col('de_tipos', 'Tipos', 'texto', { valor: (p) => (de(p) ? listaOuNenhum(de(p).tipos) : null) }),
        col('de_local', 'LocalBusiness', 'sim', { valor: (p) => de(p)?.local_business }),
        col('de_nome', 'Nome', 'texto', { valor: (p) => de(p)?.nome, max: 120 }),
        col('de_telefone', 'Telefone', 'texto', { valor: (p) => de(p)?.telefone }),
        col('de_endereco', 'Endereço', 'texto', { valor: (p) => (typeof de(p)?.endereco === 'string' ? de(p).endereco : null), max: 200 }),
        col('de_geo', 'Coordenadas', 'texto', { valor: (p) => coordenadas(de(p)?.geo) }),
        col('de_horario', 'Horário de funcionamento', 'sim', { valor: (p) => de(p)?.horario }),
        col('de_perfis', 'Perfis citados', 'texto', { valor: (p) => (de(p) ? listaOuNenhum(de(p).mesmo_que, 'nenhum', enderecoCurto) : null), titulo: (p) => juntar(de(p)?.mesmo_que) }),
        col('de_logo', 'Logo', 'texto', {
          valor: (p) => (texto(de(p)?.logo) ? `${enderecoRelativo(de(p).logo, p.url)}${de(p).logo_http ? ' (sem cadeado, http)' : ''}` : null),
          link: (p) => de(p)?.logo,
          tom: (p) => (de(p)?.logo_http === true ? 'warn' : null),
        }),
        col('de_invalidos', 'Blocos com erro', 'int', { valor: (p) => de(p)?.invalidos, tom: (p) => ((medida(de(p)?.invalidos) ?? 0) > 0 ? 'bad' : null) }),
      ], { nota: 'O que a página diz ao Google sobre a empresa (JSON-LD). Bloco com erro o Google não lê.' }),
      porPagina('contatos', 'Contatos nas páginas', [
        col('ct_whatsapp', 'WhatsApp', 'texto', { valor: (p) => (ct(p) ? listaOuNenhum(ct(p).whatsapp) : null) }),
        col('ct_telefones', 'Telefones', 'texto', { valor: (p) => (ct(p) ? listaOuNenhum(ct(p).telefones) : null) }),
        col('ct_emails', 'E-mails', 'texto', { valor: (p) => (ct(p) ? listaOuNenhum(ct(p).emails) : null) }),
        col('ct_redes', 'Redes sociais', 'texto', { valor: (p) => (ct(p) ? listaOuNenhum(ct(p).redes, 'nenhuma', enderecoCurto) : null), max: 300 }),
        col('ct_posts', 'Links para posts do Instagram', 'int', { valor: (p) => (ct(p) && Array.isArray(ct(p).instagram_posts) ? ct(p).instagram_posts.length : null) }),
        col('ct_mapa', 'Mapa', 'sim', { valor: (p) => ct(p)?.mapa }),
      ], { nota: 'Os links de contato que estão no HTML de cada página.' }),
      porPagina('plataforma', 'Plataforma e servidor', [
        col('pl_wp', 'WordPress', 'texto', { valor: (p) => pl(p)?.wordpress }),
        col('pl_elementor', 'Elementor', 'texto', { valor: (p) => pl(p)?.elementor }),
        col('pl_woo', 'WooCommerce', 'texto', { valor: (p) => pl(p)?.woocommerce }),
        col('pl_litespeed', 'LiteSpeed Cache', 'texto', { valor: (p) => pl(p)?.litespeed_cache }),
        col('pl_yoast', 'Yoast', 'texto', { valor: (p) => pl(p)?.yoast }),
        col('pl_seo', 'Plugin de SEO', 'texto', { valor: (p) => pl(p)?.seo }),
        col('pl_tema', 'Tema', 'texto', { valor: (p) => pl(p)?.tema }),
        col('pl_base64', 'Scripts em base64', 'int', { valor: (p) => pl(p)?.scripts_base64, titulo: () => 'Scripts escondidos em base64 que o Painel abriu para procurar as etiquetas.' }),
        col('sv_server', 'Servidor', 'texto', { valor: (p) => sv(p)?.server }),
        col('sv_powered', 'Feito com', 'texto', { valor: (p) => sv(p)?.x_powered_by }),
        col('sv_cache', 'Cache da página', 'texto', { valor: (p) => textoDoCache(sv(p)?.x_cache) }),
      ], { nota: 'As versões são as que o HTML mostra; a versão que a página não mostra fica sem número.' }),
      secaoTabela('resposta', 'Resposta das páginas', paginas, [
        colPagina(),
        col('status', 'Status', 'int', { tom: (p) => (medida(p.status) !== null && medida(p.status) >= 400 ? 'bad' : null) }),
        col('ms_cabecalho', 'Resposta', 'ms'),
        col('ms_total', 'Total', 'ms'),
        col('kb', 'Tamanho', 'texto', { valor: (p) => (medida(p.bytes) === null ? null : `${formatar('int', Math.round(medida(p.bytes) / 1024))} KB${p.truncada ? ' (cortada)' : ''}`), numerico: true }),
        col('erro', 'Erro', 'texto', { valor: (p) => (p.erro ? `${problemaDoSite(p.erro) ?? 'outro problema'}${p.trecho ? `: ${texto(p.trecho, 120)}` : ''}` : null), tom: (p) => (p.erro ? 'bad' : null) }),
      ], { limite: 15, unidade: ['página', 'páginas'], vazio: 'Nenhuma página lida nesta coleta.', nota: 'Os tempos são medidos do servidor do Painel, não do aparelho de quem visita.' }),
      inicio ? secao('inicio', 'Página inicial', [blocoPares(paresDaPagina(inicio, site, www, hoje))]) : null,
    ],
  };
}

function paresDaPagina(p, site, www, hoje) {
  const seo = objeto(p.seo) ? p.seo : {};
  const og = objeto(p.og) ? p.og : {};
  const de = objeto(p.dados_estruturados) ? p.dados_estruturados : {};
  const pl = objeto(p.plataforma) ? p.plataforma : {};
  const ct = objeto(p.contatos) ? p.contatos : {};
  const sv = objeto(p.servidor) ? p.servidor : {};
  const versao = (nome, v) => (texto(v, 20) ? `${nome} ${texto(v, 20)}` : null);
  return [
    { rotulo: 'Site', valor: site?.nome },
    { rotulo: 'Domínio', valor: site?.dominio },
    { rotulo: 'Endereço medido', valor: site?.inicio ?? p.url, link: site?.inicio ?? p.url },
    { rotulo: 'Título (SEO)', valor: seo.titulo },
    { rotulo: 'Descrição (SEO)', valor: seo.descricao },
    { rotulo: 'Canônico', valor: seo.canonical, link: seo.canonical },
    { rotulo: 'Robots da página', valor: seo.robots },
    { rotulo: 'Idioma', valor: seo.lang, tipo: 'idioma' },
    { rotulo: 'Títulos H1', valor: seo.h1, tipo: 'int' },
    { rotulo: 'Compartilhamento (título)', valor: og.titulo },
    { rotulo: 'Compartilhamento (imagem)', valor: og.imagem ? `${enderecoRelativo(og.imagem, p.url)}${tamanhoDaImagem(og) ? ` (${tamanhoDaImagem(og)})` : ''}` : null, link: og.imagem },
    { rotulo: 'Compartilhamento atualizado', valor: og.atualizado_em, tipo: 'instante', hoje },
    { rotulo: 'Dados estruturados', valor: lista(de.tipos).join(', ') || null },
    { rotulo: 'LocalBusiness', valor: de.local_business, tipo: 'sim' },
    { rotulo: 'Telefone (dados estruturados)', valor: de.telefone },
    { rotulo: 'Endereço (dados estruturados)', valor: typeof de.endereco === 'string' ? de.endereco : null },
    { rotulo: 'Logo', valor: de.logo ? `${enderecoRelativo(de.logo, p.url)}${de.logo_http ? ' (sem cadeado, http)' : ''}` : null, link: de.logo },
    { rotulo: 'Plataforma', valor: [versao('WordPress', pl.wordpress), versao('Elementor', pl.elementor), versao('WooCommerce', pl.woocommerce), versao('LiteSpeed Cache', pl.litespeed_cache), versao('Yoast', pl.yoast)].filter(Boolean).join(', ') || null },
    { rotulo: 'Plugin de SEO', valor: pl.seo },
    { rotulo: 'Tema', valor: pl.tema },
    { rotulo: 'WhatsApp no site', valor: lista(ct.whatsapp).join(', ') || null },
    { rotulo: 'Telefones no site', valor: lista(ct.telefones).join(', ') || null },
    { rotulo: 'E-mails no site', valor: lista(ct.emails).join(', ') || null },
    { rotulo: 'Redes sociais no site', valor: lista(ct.redes).map((r) => texto(r, 120)).filter(Boolean).join(', ') || null },
    { rotulo: 'Mapa na página', valor: ct.mapa, tipo: 'sim' },
    { rotulo: 'Servidor', valor: [texto(sv.server, 60), texto(sv.x_powered_by, 60)].filter(Boolean).join(', ') || null },
    { rotulo: 'Cache da página', valor: textoDoCache(sv.x_cache) },
    { rotulo: 'Com e sem www', valor: www ? `${caminho(www.de) ? texto(www.de, 120) : 'o outro endereço'} ${medida(www.status) ? `responde ${www.status}` : 'não responde'}${www.para ? ` e leva para ${texto(www.para, 120)}` : ''}` : null },
  ];
}

/* ---------------------------------------------------------- pagespeed -- */

const NOTAS = Object.freeze([
  ['desempenho', 'Desempenho'],
  ['acessibilidade', 'Acessibilidade'],
  ['boas_praticas', 'Boas práticas'],
  ['seo', 'SEO'],
  ['agentes', 'Leitura por agentes de IA'],
]);
const CATEGORIA_PSI = Object.freeze({ desempenho: 'desempenho', acessibilidade: 'acessibilidade', boas_praticas: 'boas práticas', seo: 'SEO', agentes: 'agentes de IA' });
const LABORATORIO = Object.freeze([
  ['fcp_ms', 'Primeiro conteúdo (FCP)', 'ms'],
  ['lcp_ms', 'Maior conteúdo (LCP)', 'ms'],
  ['tbt_ms', 'Bloqueio total (TBT)', 'ms'],
  ['cls', 'Estabilidade (CLS)', 'dec3'],
  ['si_ms', 'Índice de velocidade', 'ms'],
  ['tti_ms', 'Tempo até interagir', 'ms'],
  ['ttfb_ms', 'Resposta do servidor', 'ms'],
]);

/** Uma conferência da leitura por agentes de IA, com a régua do conector:
 *  passa com nota de 0,9 para cima (a nota vem de 0 a 1); "não se aplica" e
 *  "só informa" não contam para passar nem para falhar. Sem nota: null. */
export function situacaoDaConferencia(nota, modo) {
  if (modo === 'notApplicable') return 'não se aplica';
  if (modo === 'informative' || modo === 'manual') return 'só informa';
  if (modo === 'error') return 'deu erro';
  const n = medida(nota);
  if (n === null) return null;
  return n >= 0.9 ? 'passou' : 'não passou';
}
const TOM_CONFERENCIA = Object.freeze({ passou: 'ok', 'não passou': 'warn', 'deu erro': 'bad' });

/** "nota 60, passou em 2 de 3" (o resumo dos agentes de IA de um aparelho). */
function resumoAgentes(a) {
  if (!objeto(a)) return null;
  const partes = [];
  if (medida(a.nota) !== null) partes.push(`nota ${formatar('int', a.nota)}`);
  if (medida(a.passou) !== null && medida(a.total) !== null) partes.push(`passou em ${formatar('int', a.passou)} de ${formatar('int', a.total)} conferências`);
  return partes.join(', ') || null;
}

/** As linhas "medida x aparelho" de dois objetos (celular, computador). */
function porAparelho(itens, cel, comp, pegar) {
  return itens.map(([k, rotulo, tipo]) => ({ chave: k, rotulo, tipo, celular: pegar(cel, k), computador: pegar(comp, k) }));
}

function corpoPagespeed(ps, hoje) {
  const cel = objeto(ps.celular) ? ps.celular : null;
  const comp = objeto(ps.computador) ? ps.computador : null;
  const nota = (psi, k) => (psi && objeto(psi.notas) ? psi.notas[k] : null);
  const lab = (psi, k) => (psi && objeto(psi.laboratorio) ? psi.laboratorio[k] : null);
  const colsAparelho = (tipoDe, tomDe) => [
    col('rotulo', 'Medida'),
    col('celular', 'Celular', 'texto', { valor: (l) => (medida(l.celular) === null ? null : formatar(tipoDe(l), l.celular)), tom: (l) => tomDe(l, l.celular), numerico: true }),
    col('computador', 'Computador', 'texto', { valor: (l) => (medida(l.computador) === null ? null : formatar(tipoDe(l), l.computador)), tom: (l) => tomDe(l, l.computador), numerico: true }),
  ];

  // O que melhorar: o mesmo item nos dois aparelhos vira uma linha.
  const itens = new Map();
  for (const [aparelho, psi] of [['celular', cel], ['computador', comp]]) {
    for (const m of lista(psi?.melhorar).filter(objeto)) {
      const k = String(m.id ?? m.titulo);
      if (!itens.has(k)) itens.set(k, { id: k, titulo: m.titulo, categoria: m.categoria, valor: m.valor, celular: null, computador: null, notaCelular: null, notaComputador: null });
      const item = itens.get(k);
      item[aparelho] = medida(m.economia_ms);
      item[aparelho === 'celular' ? 'notaCelular' : 'notaComputador'] = medida(m.nota);
    }
  }
  const melhorar = ordenar([...itens.values()], (l) => Math.max(l.celular ?? -1, l.computador ?? -1));
  const auditorias = new Map();
  for (const [aparelho, psi] of [['celular', cel], ['computador', comp]]) {
    for (const a of lista(psi?.agentes?.auditorias).filter(objeto)) {
      const k = String(a.id ?? a.titulo);
      if (!auditorias.has(k)) auditorias.set(k, { id: k, titulo: a.titulo, valor: a.valor ?? null, celular: null, computador: null });
      const item = auditorias.get(k);
      item[aparelho] = situacaoDaConferencia(a.nota, a.modo);
      item.valor = item.valor ?? a.valor ?? null;
    }
  }
  const campo = (psi) => (objeto(psi?.campo_pagina) ? psi.campo_pagina : objeto(psi?.campo_origem) ? psi.campo_origem : null);
  const campoCel = campo(cel), campoComp = campo(comp);
  const p75 = (c, k) => (c && objeto(c[k]) ? c[k].p75 : null);
  const faixa = (c, k) => (c && objeto(c[k]) ? FAIXA_TOM[c[k].faixa] ?? null : null);
  const quando = cel?.medido_em || comp?.medido_em;
  const versao = texto(cel?.lighthouse || comp?.lighthouse, 20);
  const geral = [['no celular', campoCel], ['no computador', campoComp]]
    .filter(([, c]) => c && FAIXA_TEXTO[c.geral])
    .map(([ap, c]) => `${FAIXA_TEXTO[c.geral]} ${ap}`);
  // O endereço em que o PageSpeed terminou, quando é outro (redirecionou).
  const finais = [...new Set([cel?.url_final, comp?.url_final].map((u) => texto(u, 200)).filter(Boolean))].filter((u) => u !== texto(ps.url, 200));

  return {
    destaque: `desempenho: celular ${formatar('int', nota(cel, 'desempenho'))}, computador ${formatar('int', nota(comp, 'desempenho'))}`,
    topo: [
      blocoTabela(porAparelho(NOTAS.map(([k, r]) => [k, r, 'int']), cel, comp, nota), colsAparelho(() => 'int', (_l, v) => tomDaNota(v)), {
        nota: 'Notas de 0 a 100: 90 ou mais é bom, de 50 a 89 precisa melhorar, abaixo de 50 é ruim.',
      }),
      blocoAvisos([
        cel?.erro_execucao && { nivel: 'alerta', texto: `O PageSpeed falhou no celular: ${texto(cel.erro_execucao, 200)}` },
        comp?.erro_execucao && { nivel: 'alerta', texto: `O PageSpeed falhou no computador: ${texto(comp.erro_execucao, 200)}` },
        ...[...lista(cel?.avisos_execucao), ...lista(comp?.avisos_execucao)].map((a) => texto(a, 300) && { nivel: 'info', texto: texto(a, 300) }),
      ]),
    ],
    secoes: [
      secaoTabela('laboratorio', 'Medidas de laboratório', porAparelho(LABORATORIO, cel, comp, lab), colsAparelho((l) => l.tipo, (l, v) => tomDaMedida(l.chave, v)), {
        unidade: ['medida', 'medidas'], nota: 'Uma visita simulada pelo Google, não a de gente de verdade (essa fica no quadro da experiência real).',
      }),
      secaoTabela('melhorar', 'O que melhorar', melhorar, [
        col('titulo', 'Item', 'texto', { max: 160 }),
        col('categoria', 'Área', 'texto', { valor: (l) => traduzir(CATEGORIA_PSI, l.categoria, 'outra área') }),
        col('valor', 'Detalhe', 'texto', { max: 160 }),
        col('celular', 'Economia no celular', 'ms'),
        col('computador', 'Economia no computador', 'ms'),
        col('notaCelular', 'Nota no celular', 'int', { tom: (l) => tomDaNota(l.notaCelular) }),
        col('notaComputador', 'Nota no computador', 'int', { tom: (l) => tomDaNota(l.notaComputador) }),
      ], { aberta: true, unidade: ['item', 'itens'], vazio: 'O PageSpeed não apontou nada para melhorar.', nota: 'A nota de cada item vai de 0 a 100; o item que não apareceu num aparelho fica sem nota nele.' }),
      secaoTabela('agentes', 'Leitura por agentes de IA', [...auditorias.values()], [
        col('titulo', 'Conferência', 'texto', { max: 160 }),
        col('valor', 'Detalhe', 'texto', { max: 120 }),
        col('celular', 'Celular', 'texto', { tom: (l) => TOM_CONFERENCIA[l.celular] ?? null }),
        col('computador', 'Computador', 'texto', { tom: (l) => TOM_CONFERENCIA[l.computador] ?? null }),
      ], {
        unidade: ['conferência', 'conferências'], semDado: 'Não veio nesta coleta.', vazio: 'Não veio nesta coleta.',
        antes: objeto(cel?.agentes) || objeto(comp?.agentes) ? [blocoPares([{ rotulo: 'No celular', valor: resumoAgentes(cel?.agentes) }, { rotulo: 'No computador', valor: resumoAgentes(comp?.agentes) }])] : [],
        nota: 'Passa com nota de 90% para cima. "Não se aplica" e "só informa" não contam.',
      }),
      campoCel || campoComp
        ? secaoTabela('campo', 'Visitas reais no PageSpeed', MEDIDAS.map(([k, rotulo, tipo]) => ({ chave: k, rotulo, tipo, celular: p75(campoCel, k), computador: p75(campoComp, k), tc: faixa(campoCel, k), tp: faixa(campoComp, k) })), [
          col('rotulo', 'Medida'),
          col('celular', 'Celular', 'texto', { valor: (l) => (medida(l.celular) === null ? null : formatar(l.tipo, l.celular)), tom: (l) => l.tc, numerico: true }),
          col('computador', 'Computador', 'texto', { valor: (l) => (medida(l.computador) === null ? null : formatar(l.tipo, l.computador)), tom: (l) => l.tp, numerico: true }),
        ], {
          unidade: ['medida', 'medidas'],
          nota: [
            campoCel?.caiu_para_origem || campoComp?.caiu_para_origem ? 'Sem visitas bastantes na página: o Google mostra o site inteiro (a origem).' : 'O percentil 75 das visitas reais dos últimos 28 dias.',
            geral.length ? `Avaliação geral do Google: ${geral.join(', ')}.` : null,
          ].filter(Boolean).join(' '),
        })
        : null,
    ],
    notas: [
      quando ? `Medido em ${rotuloInstante(quando, hoje)}${versao ? ` com o Lighthouse ${versao}` : ''}.` : null,
      texto(ps.url, 200) ? `Endereço medido: ${texto(ps.url, 200)}.` : null,
      finais.length ? `O PageSpeed terminou em ${finais.join(' e ')} (o endereço redirecionou).` : null,
    ],
  };
}

/* --------------------------------------------------------------- crux -- */

// As consultas da CrUX que a tela mostra lado a lado: o site no celular, no
// computador e em todos os aparelhos, e só a página inicial.
const ORIGENS_CRUX = Object.freeze([['celular', 'Celular'], ['computador', 'Computador'], ['todos', 'Todos'], ['inicio', 'Página inicial']]);
const PARTES_LCP = Object.freeze([
  ['ttfb_ms', 'Resposta do servidor'],
  ['atraso_carga_ms', 'Atraso até começar a carregar'],
  ['duracao_carga_ms', 'Duração da carga'],
  ['atraso_render_ms', 'Atraso até desenhar'],
]);
const NAV = Object.freeze({ navigate: 'link ou endereço digitado', navigate_cache: 'link, da memória do navegador', reload: 'recarregar', restore: 'aba restaurada', back_forward: 'voltar ou avançar', back_forward_cache: 'voltar ou avançar, da memória', prerender: 'pré-carregada' });
const HISTORICO = Object.freeze([
  ['lcp_ms', 'LCP', 'ms'],
  ['inp_ms', 'INP', 'ms'],
  ['cls', 'CLS', 'dec2'],
  ['fcp_ms', 'FCP', 'ms'],
  ['ttfb_ms', 'TTFB', 'ms'],
  ['lcp_bom', 'LCP bom', 'fracao'],
  ['inp_bom', 'INP bom', 'fracao'],
  ['cls_bom', 'CLS bom', 'fracao'],
]);

function linhasCrux(origem, medidas = MEDIDAS_CRUX) {
  const m = (c, k) => (objeto(c?.metricas) && objeto(c.metricas[k]) ? c.metricas[k] : null);
  return medidas.map(([k, rotulo, tipo]) => ({ chave: k, rotulo, tipo, ...Object.fromEntries(Object.entries(origem).map(([ap, c]) => [ap, m(c, k)?.p75 ?? null])) }));
}

/** Uma tabela "chave x consulta" dos mapas {chave: fração} da CrUX (tipo do
 *  maior conteúdo, como as visitas chegam, aparelhos): uma linha por chave,
 *  uma coluna por consulta que trouxe o mapa. Nenhuma trouxe: null. */
function tabelaDeFracoes(fontes, consultas, campo, { rotulo, rotular, titulo = null }) {
  const com = consultas.filter(([k]) => objeto(fontes[k]?.[campo]));
  if (!com.length) return null;
  const chaves = [...new Set(com.flatMap(([k]) => Object.keys(fontes[k][campo])))];
  const linhas = ordenar(chaves.map((ch) => ({ chave: ch, rotulo: rotular(ch), ...Object.fromEntries(com.map(([k]) => [k, fontes[k][campo][ch] ?? null])) })), com[0][0]);
  return blocoTabela(linhas, [col('rotulo', rotulo), ...com.map(([k, r]) => col(k, r, 'fracao', { casas: 0 }))], { chave: 'chave', titulo });
}

/** As janelas do histórico de um aparelho, da mais nova para a mais velha. */
function linhasDoHistorico(h) {
  if (!objeto(h)) return [];
  return lista(h.periodos)
    .map((p, i) => ({ ate: p?.ate ?? null, ...Object.fromEntries(HISTORICO.map(([k]) => [k, lista(h[k])[i] ?? null])) }))
    .reverse();
}
const colsHistorico = () => [
  col('ate', 'Janela até', 'dia'),
  ...HISTORICO.map(([k, rotulo, tipo]) => col(k, rotulo, tipo, { casas: tipo === 'fracao' ? 0 : undefined, tom: (l) => tomDaMedida(k, l[k]) })),
];

function corpoCrux(c, hoje) {
  const origem = objeto(c.origem) ? c.origem : {};
  const fontes = {
    celular: objeto(origem.celular) ? origem.celular : null,
    computador: objeto(origem.computador) ? origem.computador : null,
    todos: objeto(origem.todos) ? origem.todos : null,
    inicio: objeto(c.inicio) ? c.inicio : null,
  };
  const cel = fontes.celular;
  const ref = fontes.todos || fontes.celular || fontes.computador;
  const per = objeto(ref?.periodo) ? ref.periodo : null;
  const colsP75 = (aparelhos) => [
    col('rotulo', 'Medida'),
    ...aparelhos.map(([ap, rotulo]) => col(ap, rotulo, 'texto', { valor: (l) => (medida(l[ap]) === null ? null : formatar(l.tipo, l[ap])), tom: (l) => tomDaMedida(l.chave, l[ap]), numerico: true })),
  ];
  const aparelhos = ORIGENS_CRUX.filter(([k]) => k !== 'inicio');
  const presentes = ORIGENS_CRUX.filter(([k]) => fontes[k]);
  const hist = objeto(c.historico) ? c.historico : {};
  const hc = objeto(hist.celular) ? hist.celular : null;
  const hp = objeto(hist.computador) ? hist.computador : null;
  const linhasGrafico = lista(hc?.periodos).map((p, i) => ({ ate: p?.ate, lcpCel: lista(hc?.lcp_ms)[i] ?? null }));
  const historicoCel = linhasDoHistorico(hc);
  const historicoComp = linhasDoHistorico(hp);
  const distrib = [];
  for (const [ap, rotuloAp] of presentes) {
    for (const [k, rotulo] of MEDIDAS) {
      const m = objeto(fontes[ap].metricas) && objeto(fontes[ap].metricas[k]) ? fontes[ap].metricas[k] : null;
      if (m) distrib.push({ id: `${ap}-${k}`, rotulo, aparelho: rotuloAp, bom: m.bom, melhorar: m.melhorar, ruim: m.ruim });
    }
  }
  const comPartes = presentes.filter(([k]) => objeto(fontes[k].lcp_partes));
  const lcpCel = cel && objeto(cel.metricas?.lcp_ms) ? cel.metricas.lcp_ms.p75 : null;
  const tabelaTipo = tabelaDeFracoes(fontes, presentes, 'lcp_tipo', { rotulo: 'Tipo', rotular: (k) => traduzir({ image: 'imagem', text: 'texto' }, k, 'outro tipo'), titulo: 'O maior conteúdo é' });
  const tabelaNav = tabelaDeFracoes(fontes, presentes, 'navegacao', { rotulo: 'Como chegou', rotular: (k) => traduzir(NAV, k, 'outro jeito') });
  // A fatia de cada aparelho só faz sentido nas consultas de todos os
  // aparelhos (o site inteiro e a página inicial).
  const tabelaAparelhos = tabelaDeFracoes(fontes, ORIGENS_CRUX.filter(([k]) => k === 'todos' || k === 'inicio'), 'aparelhos', {
    rotulo: 'Aparelho', rotular: (k) => traduzir({ phone: 'celular', desktop: 'computador', tablet: 'tablet' }, k, 'outro aparelho'),
  });

  return {
    destaque: medida(lcpCel) !== null ? `LCP no celular ${formatar('ms', lcpCel)}` : null,
    topo: [
      blocoTabela(linhasCrux(origem), colsP75(aparelhos.filter(([ap]) => objeto(origem[ap]))), {
        nota: `O percentil 75: três de cada quatro visitas foram tão rápidas ou mais${per ? `, ${rotuloPeriodo(per.de, per.ate, hoje)}` : ''}. Bom: LCP até 2,5 s, INP até 200 ms, CLS até 0,1.`,
      }),
      blocoGrafico(linhasGrafico, { x: 'ate', y: 'lcpCel', titulo: 'LCP no celular, janelas de 28 dias', tipo: 'ms', hoje }),
    ],
    secoes: [
      secaoTabela('distribuicao', 'Bom, melhorar e ruim', distrib, [
        col('rotulo', 'Medida'), col('aparelho', 'Consulta'), col('bom', 'Bom', 'fracao', { casas: 0 }), col('melhorar', 'Melhorar', 'fracao', { casas: 0 }), col('ruim', 'Ruim', 'fracao', { casas: 0 }),
      ], { unidade: ['linha', 'linhas'], nota: 'A fatia das visitas em cada faixa da régua do Google.' }),
      secao('historico', 'Histórico', historicoCel.length || historicoComp.length
        ? [
          historicoCel.length ? blocoTabela(historicoCel, colsHistorico(), { hoje, titulo: 'Celular' }) : null,
          historicoComp.length ? blocoTabela(historicoComp, colsHistorico(), { hoje, titulo: 'Computador' }) : null,
          blocoTexto('Cada janela tem 28 dias e termina num sábado. "Bom" é a fatia das visitas dentro da régua do Google.'),
        ]
        : [blocoTexto('Sem histórico nesta coleta.')], { resumo: historicoCel.length || historicoComp.length ? plural(Math.max(historicoCel.length, historicoComp.length), 'janela', 'janelas') : 'não medido' }),
      secaoTabela('semanas', 'Por semana', [...lista(c.semanas)].filter(objeto).reverse(), [
        col('semana', 'Semana de', 'dia'),
        col('lcpCel', 'LCP celular', 'ms', { valor: (s) => s.celular?.lcp_ms, tom: (s) => tomDaMedida('lcp_ms', s.celular?.lcp_ms) }),
        col('inpCel', 'INP celular', 'ms', { valor: (s) => s.celular?.inp_ms, tom: (s) => tomDaMedida('inp_ms', s.celular?.inp_ms) }),
        col('clsCel', 'CLS celular', 'dec2', { valor: (s) => s.celular?.cls, tom: (s) => tomDaMedida('cls', s.celular?.cls) }),
        col('lcpComp', 'LCP computador', 'ms', { valor: (s) => s.computador?.lcp_ms, tom: (s) => tomDaMedida('lcp_ms', s.computador?.lcp_ms) }),
        col('inpComp', 'INP computador', 'ms', { valor: (s) => s.computador?.inp_ms, tom: (s) => tomDaMedida('inp_ms', s.computador?.inp_ms) }),
        col('clsComp', 'CLS computador', 'dec2', { valor: (s) => s.computador?.cls, tom: (s) => tomDaMedida('cls', s.computador?.cls) }),
      ], { hoje, unidade: ['semana', 'semanas'], nota: 'A janela de 28 dias que termina no sábado de cada semana.' }),
      secao('lcp', 'O que atrasa o LCP', [
        comPartes.length
          ? blocoTabela(PARTES_LCP.map(([k, rotulo]) => ({ chave: k, rotulo, ...Object.fromEntries(comPartes.map(([o]) => [o, fontes[o].lcp_partes[k] ?? null])) })), [
            col('rotulo', 'Parte'),
            ...comPartes.map(([o, r]) => col(o, r, 'ms')),
          ], { chave: 'chave' })
          : blocoTexto('Não veio nesta coleta.'),
        tabelaTipo,
      ]),
      tabelaNav ? secao('navegacao', 'Como as visitas chegam', [tabelaNav]) : null,
      tabelaAparelhos ? secao('aparelhos', 'Aparelhos das visitas', [tabelaAparelhos]) : null,
      fontes.inicio
        ? secaoTabela('inicio', 'Só a página inicial', linhasCrux({ todos: fontes.inicio }), colsP75([['todos', 'Todos os aparelhos']]), {
          unidade: ['medida', 'medidas'],
          nota: objeto(fontes.inicio.periodo) && rotuloPeriodo(fontes.inicio.periodo.de, fontes.inicio.periodo.ate, hoje) ? `Janela ${rotuloPeriodo(fontes.inicio.periodo.de, fontes.inicio.periodo.ate, hoje)}.` : null,
        })
        : null,
    ],
    notas: [`Visitas reais de quem usa o Chrome (CrUX)${per ? `, janela de 28 dias até ${rotuloDia(per.ate, hoje)}` : ''}.`],
  };
}

/* ---------------------------------------------------- robots e sitemap -- */

function corpoRobotsSitemap(robots, sitemap, hoje) {
  const r = objeto(robots) ? robots : null;
  const s = objeto(sitemap) ? sitemap : null;
  const regras = objeto(r?.regras_todos) ? r.regras_todos : {};
  return {
    destaque: s ? (s.url ? `${formatar('int', s.total_urls)} endereços no sitemap` : 'sitemap não achado') : null,
    topo: [
      blocoNumeros([
        numero({ id: 'robots', rotulo: 'robots.txt', tipo: 'texto', valor: r ? (r.existe ? 'existe' : 'não existe') : null }),
        numero({ id: 'bloqueia', rotulo: 'Bloqueia o Google', tipo: 'sim', valor: r ? r.bloqueia_google ?? null : null }),
        numero({ id: 'sitemap', rotulo: 'Sitemap', tipo: 'texto', valor: s ? (s.url ? 'achado' : 'não achado') : null }),
        numero({ id: 'urls', rotulo: 'Endereços no sitemap', valor: s?.total_urls }),
        numero({ id: 'ultima', rotulo: 'Última alteração', tipo: 'dia', valor: s?.ultima_modificacao, hoje }),
      ]),
    ],
    secoes: [
      r
        ? secao('robots', 'robots.txt', [
          blocoPares([
            { rotulo: 'Existe', valor: r.existe, tipo: 'sim' },
            { rotulo: 'Resposta', valor: r.status, tipo: 'int' },
            { rotulo: 'Bloqueia tudo', valor: r.bloqueia_tudo, tipo: 'sim' },
            { rotulo: 'Bloqueia o Google', valor: r.bloqueia_google, tipo: 'sim' },
            { rotulo: 'Sitemaps declarados', valor: lista(r.sitemaps).join(', ') || 'nenhum' },
            { rotulo: 'Proibido para todos', valor: lista(regras.disallow).join(', ') || 'nada' },
            { rotulo: 'Liberado para todos', valor: lista(regras.allow).join(', ') || 'nada' },
            { rotulo: 'Grupos de regras', valor: r.grupos, tipo: 'int' },
            { rotulo: 'Linhas', valor: r.linhas, tipo: 'int' },
          ]),
        ])
        : secao('robots', 'robots.txt', [blocoTexto('Não veio nesta coleta.')], { resumo: 'não medido' }),
      s
        ? secao('sitemap', 'Sitemap', [
          blocoPares([
            { rotulo: 'Endereço que respondeu', valor: s.url ?? 'nenhum', link: s.url },
            { rotulo: 'Tipo', valor: traduzir({ indice: 'índice de sitemaps', urls: 'lista de endereços' }, s.tipo, 'outro tipo') },
            { rotulo: 'Endereços', valor: s.total_urls, tipo: 'int' },
            { rotulo: 'Última alteração', valor: s.ultima_modificacao, tipo: 'instante', hoje },
            { rotulo: 'Sitemaps internos não lidos', valor: s.subs_nao_lidos, tipo: 'int' },
          ]),
          lista(s.subs).length
            ? blocoTabela(lista(s.subs).filter(objeto), [
              col('url', 'Sitemap interno', 'texto', { valor: (x) => caminho(x.url), link: (x) => x.url, titulo: (x) => x.url }),
              col('urls', 'Endereços', 'int'),
              col('ultima_modificacao', 'Última alteração', 'dia'),
              col('problema', 'Problema', 'texto', { valor: (x) => problemaDoSite(x.problema), tom: (x) => (x.problema ? 'warn' : null) }),
            ], { hoje })
            : null,
          lista(s.tentativas).length
            ? blocoTabela(lista(s.tentativas).filter(objeto), [
              col('url', 'Endereço tentado', 'texto', { valor: (x) => caminho(x.url), link: (x) => x.url, titulo: (x) => x.url }),
              col('status', 'Resposta', 'int'),
              col('problema', 'Problema', 'texto', { valor: (x) => problemaDoSite(x.problema), tom: (x) => (x.problema ? 'warn' : null) }),
            ], { nota: 'Os endereços de sitemap que o Painel tentou antes de achar um.' })
            : null,
        ])
        : secao('sitemap', 'Sitemap', [blocoTexto('Não veio nesta coleta.')], { resumo: 'não medido' }),
      secaoTabela('urls', 'Endereços no sitemap', s ? lista(s.urls).filter(objeto) : null, [
        col('loc', 'Endereço', 'texto', { valor: (x) => caminho(x.loc), link: (x) => x.loc, titulo: (x) => x.loc }),
        col('lastmod', 'Alterado', 'dia'),
      ], { hoje, limite: 15, unidade: ['endereço', 'endereços'], semDado: 'Não veio nesta coleta.', vazio: 'O sitemap não lista endereço nenhum.', nota: 'Até 200 endereços.' }),
    ],
  };
}

/* ------------------------------------------------ WordPress, versões e DNS -- */

const COMPONENTES = Object.freeze({ wordpress: 'WordPress', elementor: 'Elementor', litespeed_cache: 'LiteSpeed Cache', yoast: 'Yoast SEO', woocommerce: 'WooCommerce' });

function corpoWordpress(wp, versoes, dns, hoje) {
  const w = objeto(wp) ? wp : null;
  const v = objeto(versoes) ? Object.entries(versoes).filter(([, x]) => objeto(x)).map(([k, x]) => ({ componente: traduzir(COMPONENTES, k, 'outro componente'), ...x })) : null;
  const d = objeto(dns) ? dns : null;
  const desatualizados = v ? v.filter((x) => x.desatualizado === true).length : null;
  const colsWp = [
    col('titulo', 'Título', 'texto', { link: (x) => x.link ?? x.link_curto, titulo: (x) => x.link_curto ?? x.link, max: 140 }),
    col('slug', 'Endereço (slug)', 'texto', { max: 80 }),
    col('publicado_em', 'Publicado', 'dia'),
    col('modificado_em', 'Alterado', 'dia'),
    col('padrao_wp', 'Exemplo do WordPress', 'sim', { tom: (x) => (x.padrao_wp ? 'warn' : null) }),
  ];
  const DMARC = { none: 'só observa (none)', quarantine: 'quarentena', reject: 'recusa' };
  return {
    destaque: desatualizados ? plural(desatualizados, 'componente desatualizado', 'componentes desatualizados') : w ? (w.rest ? 'REST aberta' : 'REST fechada') : null,
    topo: [
      blocoNumeros([
        numero({ id: 'rest', rotulo: 'REST do WordPress', tipo: 'texto', valor: w ? (w.rest ? 'aberta' : 'fechada') : null }),
        numero({ id: 'paginas', rotulo: 'Páginas publicadas', valor: w?.paginas?.total }),
        numero({ id: 'posts', rotulo: 'Posts', valor: w?.posts?.total }),
        numero({ id: 'desatualizados', rotulo: 'Desatualizados', valor: desatualizados }),
        numero({ id: 'dmarc', rotulo: 'DMARC', tipo: 'texto', valor: d ? (objeto(d.dmarc) ? traduzir(DMARC, d.dmarc.politica, 'outra política') : 'sem DMARC') : null }),
      ]),
    ],
    secoes: [
      secaoTabela('versoes', 'Versões', v, [
        col('componente', 'Componente'),
        col('site', 'No site'),
        col('atual', 'Atual'),
        col('situacao', 'Situação', 'texto', { valor: (x) => (x.desatualizado === true ? 'desatualizado' : x.desatualizado === false ? 'em dia' : null), tom: (x) => (x.desatualizado === true ? 'warn' : x.desatualizado === false ? 'ok' : null) }),
      ], { aberta: true, unidade: ['componente', 'componentes'], semDado: 'Não veio nesta coleta.', vazio: 'O HTML não mostrou a versão de nenhum componente.' }),
      w
        ? secao('plugins', 'Plugins e REST', [
          blocoPares([
            { rotulo: 'REST', valor: w.rest ? 'aberta' : 'fechada' },
            // Por que fechou: no formato de antes, o código em "motivo" virado
            // frase. Na revisão 2 ele virou wordpress.codigo (que não vai
            // para a tela) e a frase chega no motivo da parte wordpress, que
            // o quadro já mostra como nota.
            !w.rest && motivoLegivel(w.motivo) && { rotulo: 'Por que está fechada', valor: motivoLegivel(w.motivo) },
            { rotulo: 'Nome do site', valor: w.nome },
            { rotulo: 'Endereço da REST', valor: w.base, link: w.base },
            { rotulo: 'Plugins achados', valor: lista(w.plugins).join(', ') || 'nenhum' },
            { rotulo: 'Rotas da REST', valor: lista(w.namespaces).join(', ') || null },
          ]),
        ])
        : null,
      secaoTabela('paginas_wp', 'Páginas do WordPress', w && objeto(w.paginas) ? lista(w.paginas.itens).filter(objeto) : null, colsWp, {
        hoje, unidade: ['página', 'páginas'], semDado: 'Não veio nesta coleta.', vazio: 'Nenhuma página publicada.', nota: w?.paginas?.cortado ? 'Lista cortada em 200.' : null,
      }),
      secaoTabela('posts_wp', 'Posts do WordPress', w && objeto(w.posts) ? lista(w.posts.itens).filter(objeto) : null, colsWp, {
        hoje, unidade: ['post', 'posts'], semDado: 'Não veio nesta coleta.', vazio: 'Nenhum post publicado.', nota: w?.posts?.cortado ? 'Lista cortada em 200.' : null,
      }),
      d
        ? secao('dns', 'DNS e e-mail', [
          blocoPares([
            { rotulo: 'Domínio', valor: d.dominio },
            { rotulo: 'SPF', valor: d.spf ?? 'sem SPF' },
            { rotulo: 'DMARC', valor: objeto(d.dmarc) ? `${traduzir(DMARC, d.dmarc.politica, 'outra política') ?? 'sem política'}: ${texto(d.dmarc.registro, 200) ?? ''}` : 'sem DMARC' },
            { rotulo: 'Servidores de e-mail (MX)', valor: lista(d.mx).join(', ') || 'nenhum' },
            { rotulo: 'Verificação do Google no DNS', valor: d.verificacoes?.google_site_verification, tipo: 'sim' },
            { rotulo: 'Verificação do Facebook no DNS', valor: d.verificacoes?.facebook_domain_verification, tipo: 'sim' },
            { rotulo: 'Registros TXT', valor: d.txt_total, tipo: 'int' },
          ]),
        ])
        : secao('dns', 'DNS e e-mail', [blocoTexto('Não veio nesta coleta.')], { resumo: 'não medido' }),
    ],
  };
}

/** Os quadros do conector do site (ligação site do canal site). Fonte sem
 *  dado nenhum e parada (falta configurar, erro): um quadro só, com o
 *  estado. */
export function quadrosSite(l, { hoje } = {}) {
  const d = objeto(l?.dados) ? l.dados : {};
  const base = { ligacao: l, hoje };
  if (!Object.keys(d).length) return [montarQuadro({ ...base, id: 'site', titulo: 'Site', rotuloFonte: 'Site', temDado: false, vazio: 'O site ainda não foi lido.' })];
  const ps = objeto(d.pagespeed) ? d.pagespeed : null;
  return [
    montarQuadro({ ...base, id: 'site-avisos', titulo: 'Avisos de melhoria do site', rotuloFonte: 'Site', temDado: Array.isArray(d.conferencias), vazio: 'Não veio nesta coleta.', corpo: () => corpoAvisos(d.conferencias) }),
    montarQuadro({ ...base, id: 'site-etiquetas', titulo: 'Etiquetas do site', rotuloFonte: 'Site', partes: ['paginas'], temDado: objeto(d.paginas), corpo: () => corpoEtiquetas(d.paginas) }),
    montarQuadro({ ...base, id: 'site-paginas', titulo: 'Páginas do site', rotuloFonte: 'Site', partes: ['paginas'], temDado: objeto(d.paginas), corpo: () => corpoPaginas(d.paginas, d.site, hoje) }),
    montarQuadro({ ...base, id: 'site-pagespeed', titulo: 'Velocidade (PageSpeed)', rotuloFonte: 'PageSpeed Insights', partes: ['pagespeed'], temDado: !!ps && (objeto(ps.celular) || objeto(ps.computador)), corpo: () => corpoPagespeed(ps, hoje) }),
    montarQuadro({
      ...base, id: 'site-crux', titulo: 'Experiência real (Chrome)', rotuloFonte: 'CrUX', partes: ['crux'],
      temDado: objeto(d.crux) && !(d.crux.sem_dados === true && !objeto(d.crux.origem?.celular) && !objeto(d.crux.origem?.computador) && !objeto(d.crux.origem?.todos)),
      vazio: objeto(d.crux) ? 'O Chrome ainda não tem visitas suficientes deste site para medir.' : 'Não veio nesta coleta.',
      corpo: () => corpoCrux(d.crux, hoje),
    }),
    montarQuadro({ ...base, id: 'site-robots', titulo: 'robots.txt e sitemap', rotuloFonte: 'Site', partes: ['robots', 'sitemap'], temDado: objeto(d.robots) || objeto(d.sitemap), corpo: () => corpoRobotsSitemap(d.robots, d.sitemap, hoje) }),
    montarQuadro({ ...base, id: 'site-wordpress', titulo: 'WordPress, versões e DNS', rotuloFonte: 'Site', partes: ['wordpress', 'versoes', 'dns'], temDado: objeto(d.wordpress) || objeto(d.versoes) || objeto(d.dns), corpo: () => corpoWordpress(d.wordpress, d.versoes, d.dns, hoje) }),
  ];
}
