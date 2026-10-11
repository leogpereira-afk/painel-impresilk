/* O CANAL SITE, O QUE O CONECTOR DO SITE LÊ DE FORA: avisos de melhoria,
 * etiquetas por página, as páginas (SEO, compartilhamento, dados
 * estruturados, contatos e plataforma de cada uma), PageSpeed, CrUX,
 * robots.txt e sitemap, WordPress, versões e DNS. As contas estão em
 * lib/calc/marketing-dados-site.js. */
import { useMemo } from 'react';
import { quadrosSite } from '../../../lib/calc/marketing-dados-site.js';
import { ListaDeQuadros } from './QuadroDados.jsx';

export default function DadosSite({ ligacao, hoje }) {
  const quadros = useMemo(() => quadrosSite(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}
