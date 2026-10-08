// Orientações calculadas somente com os dados que esta pessoa pode consultar.
export function resumoProcesso(item,hoje){
 const etapas=item.etapas||[],registros=item.registros||[],abertas=etapas.filter(e=>e.situacao!=='concluida');
 const encerrado=['concluida','cancelada'].includes(item.situacao);
 const atrasadas=encerrado?[]:abertas.filter(e=>e.prazo&&e.prazo<hoje);
 const bloqueadas=encerrado?[]:abertas.filter(e=>e.situacao==='bloqueada');
 const validar=encerrado?[]:abertas.filter(e=>e.situacao==='validacao');
 const disponiveis=encerrado?[]:abertas.filter(e=>['pendente','execucao'].includes(e.situacao)&&(e.dependeDe||[]).every(id=>etapas.some(p=>p.id===id&&p.situacao==='concluida'))).sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999'));
 const sinais=[];
 if(!encerrado){
  if(bloqueadas.length)sinais.push({tipo:'bloqueio',aba:'etapas',titulo:`${bloqueadas.length} etapa(s) bloqueada(s)`,texto:'Confira o motivo e combine com o responsável o que falta para avançar.'});
  if(atrasadas.length)sinais.push({tipo:'atraso',aba:'etapas',titulo:`${atrasadas.length} etapa(s) com prazo vencido`,texto:'Registre a situação real e alinhe o prazo com a equipe interna.'});
  if(item.prazo&&item.prazo<hoje)sinais.push({tipo:'prazo',aba:'etapas',titulo:'Prazo geral vencido',texto:'Revise o que falta entregar com o responsável pelo processo.'});
  if(validar.length)sinais.push({tipo:'validacao',aba:'etapas',titulo:`${validar.length} entrega(s) aguardando validação`,texto:'A equipe interna precisa conferir o resultado antes de concluir.'});
  if(!etapas.length)sinais.push({tipo:'plano',aba:'etapas',titulo:'Plano de trabalho ainda não definido',texto:'Combine etapas, responsáveis e prazos com a equipe interna.'});
  const implantando=registros.filter(x=>x.tipo==='acao'&&x.implantacao?.situacao==='em_implantacao').length;
  if(implantando)sinais.push({tipo:'implantacao',aba:'acoes',titulo:`${implantando} ação(ões) em implantação`,texto:'Registre como a mudança está sendo aplicada e o resultado observado.'});
  if(!registros.length)sinais.push({tipo:'registro',aba:'acoes',titulo:'Registre o ponto de partida',texto:'Descreva o diagnóstico, o que já foi feito e o próximo passo.'});
  if(!item.anexos?.length)sinais.push({tipo:'arquivo',aba:'arquivos',titulo:'Reúna os materiais do trabalho',texto:'Anexe os documentos que sustentam as ações e os resultados.'});
 }
 return {implantadas:registros.filter(x=>x.tipo==='acao'&&x.implantacao?.situacao==='implantada').length,encerrado,atrasadas,bloqueadas,validar,proxima:disponiveis[0]||null,sinais,concluidas:etapas.length-abertas.length,acoes:registros.filter(r=>r.tipo==='acao').length};
}
