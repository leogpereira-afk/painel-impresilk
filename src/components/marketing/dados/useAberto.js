/* QUADRO ABERTO OU FECHADO, LEMBRADO NO APARELHO (o padrão da casa para tela
 * de análise: todo quadro recolhe, e a escolha volta na próxima visita).
 *
 * Uma chave só no localStorage para a sub-aba Dados ("mkt_dados_secoes"),
 * com uma entrada POR QUADRO e POR SEÇÃO ("ga4", "ga4/canais"): quadro novo
 * entra com o padrão dele sem apagar o que a pessoa já escolheu nos outros.
 * Só o id do quadro vai para lá, nunca dado. Sem localStorage (aba anônima,
 * armazenamento bloqueado), a escolha vale até fechar a página.
 */
import { useCallback, useState } from 'react';

const CHAVE = 'mkt_dados_secoes';
let mapa = null;

function ler() {
  if (mapa) return mapa;
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    mapa = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    mapa = {};
  }
  return mapa;
}

function gravar(id, aberto) {
  mapa = { ...ler(), [id]: aberto };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(mapa));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

const guardado = (id, padrao) => {
  const v = ler()[id];
  return typeof v === 'boolean' ? v : padrao;
};

/** [aberto, alternar] de um quadro. */
export function useAberto(id, padrao = true) {
  const [aberto, setAberto] = useState(() => guardado(id, padrao));
  const alternar = useCallback(() => {
    setAberto((a) => !a);
    gravar(id, !guardado(id, padrao));
  }, [id, padrao]);
  return [aberto, alternar];
}

/** As seções de um quadro: {aberta(id, padrao), alternar(id, padrao)}. */
export function useSecoesAbertas(quadroId) {
  const [, setVersao] = useState(0);
  const chave = (id) => `${quadroId}/${id}`;
  const aberta = (id, padrao = false) => guardado(chave(id), padrao);
  const alternar = (id, padrao = false) => {
    gravar(chave(id), !guardado(chave(id), padrao));
    setVersao((v) => v + 1);
  };
  return { aberta, alternar };
}
