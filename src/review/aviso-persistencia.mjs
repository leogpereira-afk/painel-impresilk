export function avisoPersistenciaPrevia(pathname,search=''){
  if(pathname==='/virada')return 'Os exemplos de A Virada permanecem somente neste navegador, inclusive ao recarregar. Não são enviados à empresa.';
  if(pathname==='/ferramenta-ia'&&/ferramenta=(acm|letra-caixa|impressao-3d|acrylic|mdf|metalon)/.test(search))return 'Rascunhos de teste das ferramentas ficam neste navegador.';
  if(pathname==='/calendario-empresa')return 'Reuniões e registros de Demandas e Consultorias de teste permanecem nesta aba ao atualizar. Agendamentos de Licitações são descartados ao recarregar. Anexos de teste não são preservados.';
  if(['/consultorias','/demandas','/colaborar','/reunioes'].includes(pathname))return 'Reuniões, fichas e acessos de teste permanecem nesta aba ao atualizar. Anexos de teste não são preservados.';
  return 'Alterações nesta demonstração ficam apenas nesta aba e são descartadas ao recarregar.';
}
