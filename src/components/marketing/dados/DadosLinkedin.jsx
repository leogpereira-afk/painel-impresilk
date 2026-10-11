/* O LINKEDIN: página e seguidores, visitas, conteúdo e posts (sem texto nem
 * imagem, pela regra de guarda do LinkedIn). As contas estão em
 * lib/calc/marketing-dados-social.js. */
import { useMemo } from 'react';
import { quadrosLinkedin } from '../../../lib/calc/marketing-dados-social.js';
import { ListaDeQuadros } from './QuadroDados.jsx';

export default function DadosLinkedin({ ligacao, hoje }) {
  const quadros = useMemo(() => quadrosLinkedin(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}
