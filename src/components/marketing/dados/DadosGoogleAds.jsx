/* O GOOGLE ADS NO CANAL SITE (ele não tem canal próprio): gasto, cliques,
 * impressões e conversões, campanhas (com a parcela de impressões, o vídeo e
 * o Display de cada uma), termos e as outras partes. As contas estão em
 * lib/calc/marketing-dados-ads.js. */
import { useMemo } from 'react';
import { quadrosGoogleAds } from '../../../lib/calc/marketing-dados-ads.js';
import { ListaDeQuadros } from './QuadroDados.jsx';

export default function DadosGoogleAds({ ligacao, hoje }) {
  const quadros = useMemo(() => quadrosGoogleAds(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}
