/* O PINTEREST: perfil e números da conta, melhores Pins, Pins e pastas,
 * análise por Pin e anúncios. As contas estão em
 * lib/calc/marketing-dados-social.js. */
import { useMemo } from 'react';
import { quadrosPinterest } from '../../../lib/calc/marketing-dados-social.js';
import { ListaDeQuadros } from './QuadroDados.jsx';

export default function DadosPinterest({ ligacao, hoje }) {
  const quadros = useMemo(() => quadrosPinterest(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}
