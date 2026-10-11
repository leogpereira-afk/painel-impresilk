/* A FONTE GOOGLE, UMA PARTE POR LIGAÇÃO: Google Analytics e Search Console
 * no canal site, o Perfil da Empresa no canal google. As contas estão em
 * lib/calc/marketing-dados-google.js. */
import { useMemo } from 'react';
import { quadrosGa4, quadrosPerfilEmpresa, quadrosSearchConsole } from '../../../lib/calc/marketing-dados-google.js';
import { quadrosDaLigacao } from '../../../lib/calc/marketing-dados-canal.js';
import { ListaDeQuadros } from './QuadroDados.jsx';

const POR_PARTE = { ga4: quadrosGa4, search_console: quadrosSearchConsole, perfil: quadrosPerfilEmpresa };

export default function DadosGoogle({ ligacao, hoje }) {
  const quadros = useMemo(() => (POR_PARTE[ligacao.parte] ?? quadrosDaLigacao)(ligacao, { hoje }), [ligacao, hoje]);
  return <ListaDeQuadros quadros={quadros} />;
}
