/* A FONTE META, UMA PARTE POR LIGAÇÃO: a Página, os anúncios e o Pixel no
 * canal facebook; o Instagram no canal instagram (com anúncio e
 * impulsionamento dentro: a tela não chama de orgânico). As contas estão em
 * lib/calc/marketing-dados-meta.js. */
import { useMemo } from 'react';
import { quadrosAnunciosMeta, quadrosInstagram, quadrosPaginaFacebook, quadrosPixelMeta } from '../../../lib/calc/marketing-dados-meta.js';
import { quadrosDaLigacao } from '../../../lib/calc/marketing-dados-canal.js';
import { ListaDeQuadros } from './QuadroDados.jsx';

const POR_PARTE = { pagina: quadrosPaginaFacebook, anuncios: quadrosAnunciosMeta, pixel: quadrosPixelMeta, instagram: quadrosInstagram };

export default function DadosMeta({ ligacao, hoje }) {
  const quadros = useMemo(() => (POR_PARTE[ligacao.parte] ?? quadrosDaLigacao)(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}
