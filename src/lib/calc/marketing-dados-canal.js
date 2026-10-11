/* QUE QUADROS CADA CANAL MOSTRA NA SUB-ABA "DADOS", E EM QUE ORDEM.
 *
 * As ligações canal-fonte são as de FONTES_DO_CANAL (marketing-fontes.js);
 * aqui cada ligação ganha a função que monta os quadros dela, e o canal site
 * ganha a ordem da aba: primeiro o tráfego (Google Analytics, Search Console,
 * Google Ads), depois o que o conector do site lê de fora (etiquetas,
 * velocidade, sitemap). Ligação nova, sem função aqui, não some calada: vira
 * um quadro com o estado e a frase de que esta tela ainda não a desenha.
 */
import { fontesDoCanal, rotuloDaLigacao } from './marketing-fontes.js';
import { montarQuadro } from './marketing-dados.js';
import { quadrosGa4, quadrosPerfilEmpresa, quadrosSearchConsole } from './marketing-dados-google.js';
import { quadrosSite } from './marketing-dados-site.js';
import { quadrosGoogleAds } from './marketing-dados-ads.js';
import { quadrosAnunciosMeta, quadrosInstagram, quadrosPaginaFacebook, quadrosPixelMeta } from './marketing-dados-meta.js';
import { quadrosLinkedin, quadrosPinterest } from './marketing-dados-social.js';

/** A chave de uma ligação: "google:ga4", "site:" (fonte inteira). */
export const chaveDaLigacao = (l) => `${l?.fonte ?? ''}:${l?.parte ?? ''}`;

export const QUADROS_DA_LIGACAO = Object.freeze({
  'google:ga4': quadrosGa4,
  'google:search_console': quadrosSearchConsole,
  'google:perfil': quadrosPerfilEmpresa,
  'site:': quadrosSite,
  'google_ads:': quadrosGoogleAds,
  'meta:pagina': quadrosPaginaFacebook,
  'meta:anuncios': quadrosAnunciosMeta,
  'meta:pixel': quadrosPixelMeta,
  'meta:instagram': quadrosInstagram,
  'linkedin:': quadrosLinkedin,
  'pinterest:': quadrosPinterest,
});

/** Os quadros de uma ligação. */
export function quadrosDaLigacao(l, ctx = {}) {
  const montar = QUADROS_DA_LIGACAO[chaveDaLigacao(l)];
  if (montar) return montar(l, ctx);
  const rotulo = rotuloDaLigacao(l);
  return [montarQuadro({ id: chaveDaLigacao(l), titulo: rotulo, rotuloFonte: rotulo, ligacao: l, temDado: false, hoje: ctx.hoje, vazio: 'Esta tela ainda não sabe desenhar os dados desta fonte.' })];
}

// A ordem da aba quando ela não é a de FONTES_DO_CANAL.
const ORDEM_NA_ABA = Object.freeze({ site: Object.freeze(['google:ga4', 'google:search_console', 'google_ads:', 'site:']) });

/** As ligações do canal na ordem da aba (as que a ordem não conhece vão no
 *  fim, na ordem de FONTES_DO_CANAL). Canal sem integração: []. */
export function ligacoesNaAba(codigo, fontes) {
  const ligacoes = fontesDoCanal(codigo, fontes);
  const ordem = ORDEM_NA_ABA[codigo];
  if (!ordem) return ligacoes;
  const posicao = (l) => {
    const i = ordem.indexOf(chaveDaLigacao(l));
    return i === -1 ? ordem.length : i;
  };
  return ligacoes.map((l, i) => ({ l, i })).sort((a, b) => posicao(a.l) - posicao(b.l) || a.i - b.i).map((x) => x.l);
}

/** Todos os quadros do canal, na ordem da aba. */
export function quadrosDoCanal(codigo, fontes, ctx = {}) {
  return ligacoesNaAba(codigo, fontes).flatMap((l) => quadrosDaLigacao(l, ctx));
}
