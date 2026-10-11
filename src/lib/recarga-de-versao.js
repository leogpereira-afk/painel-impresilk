/* TELA BRANCA DEPOIS DE PUBLICAR UMA VERSÃO NOVA (achado na conferência do
 * que está no ar, 11/10/2026).
 *
 * Cada tela é um arquivo com hash no nome (React.lazy em App.jsx). Publicou
 * uma versão nova, os arquivos antigos saem do servidor; uma aba aberta
 * ANTES ainda pede o nome antigo, recebe 404, e sem ninguém para segurar o
 * erro o React desmonta tudo: a tela fica branca, sem uma palavra.
 *
 * O conserto (GuardaDeRota.jsx em volta do Suspense das rotas): falha de
 * carga de arquivo recarrega a página UMA vez, que aí já vem com os nomes
 * novos. A marca em sessionStorage impede o laço: se a carga falhar de novo
 * logo depois (servidor fora, sem rede, publicação quebrada), a tela mostra
 * a mensagem com o botão Recarregar em vez de recarregar para sempre.
 *
 * Aqui só a régua, sem React, para o teste (tests/recarga-de-versao.test.mjs).
 */

export const CHAVE_RECARGA = 'painel:recarga-de-versao';

/* Recarregou há menos disto e falhou de novo: não é versão velha, é outra
   coisa, e recarregar outra vez só repetiria a falha. Dois minutos cobrem a
   recarga numa rede ruim de obra; uma segunda publicação mais tarde no mesmo
   dia volta a ter direito à recarga automática. */
export const JANELA_RECARGA_MS = 2 * 60 * 1000;

/* As falhas que o Vite marca como de carga (evento vite:preloadError): o
   erro chega à GuardaDeRota como o mesmo objeto, e a marca vale mesmo quando
   o texto do navegador não diz nada de útil (o Safari só diz "Importing a
   module script failed."). */
const marcadas = new WeakSet();

export function marcarFalhaDeCarga(erro) {
  if (erro && typeof erro === 'object') marcadas.add(erro);
}

/* O texto que cada navegador põe quando o arquivo da tela não veio. */
const TEXTOS_DE_CARGA = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite, o CSS da tela
  /loading (css )?chunk [\w-]+ failed/i,
];

/** A falha é de arquivo da tela que não veio (versão velha, rede)? Erro de
 *  programa (um undefined dentro da tela) NÃO é: recarregar não conserta, e
 *  esconderia o erro atrás de uma página piscando. */
export function ehFalhaDeCarga(erro) {
  if (!erro) return false;
  if (typeof erro === 'object' && marcadas.has(erro)) return true;
  const texto = String(erro?.message ?? erro);
  return TEXTOS_DE_CARGA.some((re) => re.test(texto));
}

/** Decide se ainda pode recarregar sozinho e, se pode, deixa a marca.
 *  `armazem` é o sessionStorage (ou um falso, no teste). Armazém que não
 *  lê ou não grava (aba privada, bloqueio do navegador) NÃO recarrega: sem a
 *  marca não há como saber se já recarregou, e o risco é o laço. */
export function podeRecarregarSozinho(armazem, agora = Date.now()) {
  try {
    if (!armazem) return false;
    const antes = Number(armazem.getItem(CHAVE_RECARGA));
    if (Number.isFinite(antes) && antes > 0 && agora - antes >= 0 && agora - antes < JANELA_RECARGA_MS) return false;
    armazem.setItem(CHAVE_RECARGA, String(agora));
    // Conferir que gravou: armazém cheio pode engolir o setItem calado.
    return armazem.getItem(CHAVE_RECARGA) === String(agora);
  } catch {
    return false;
  }
}
