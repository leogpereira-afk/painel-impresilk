const iso=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||'').slice(0,10))?String(d).slice(0,10):'';
export function validadeOrcamento(o){
 const de=iso(o.dataCadastro),dias=Number(o.validade);
 if(!de||!Number.isInteger(dias)||dias<=0)return '';
 const d=new Date(de+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+dias);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}
export function diasSemContato(o,hoje){
 const de=iso(o.ultimoContato||o.ultimaAcao?.contatoEm||o.dataCadastro);
 if(!de||!iso(hoje))return null;
 return Math.max(0,Math.floor((Date.parse(hoje+'T12:00:00Z')-Date.parse(de+'T12:00:00Z'))/86400000));
}
export const FILTROS_ORCAMENTOS=[['','Todas'],['sem_acao','Sem próximo passo'],['aguardando_cliente','Aguardando cliente'],['aguardando_equipe','Providência interna'],['negociacao','Em negociação'],['vencimento','Validade próxima / vencida'],['enviados','Envio confirmado'],['ganho','Aprovados'],['perdido','Perdidos']];
export function filtrarOrcamentos(lista,{fase='',hoje,diasVencimento=3}){
 return lista.filter(o=>{
  if(!fase)return true;
  if(['ganho','perdido'].includes(fase))return o.situacao===fase;
  if(o.situacao!=='aberto')return false;
  const ativa=o.proximaAcao;
  if(fase==='sem_acao')return !ativa&&!iso(o.acompanhamento?.proximoToque);
  if(fase==='aguardando_cliente'||fase==='aguardando_equipe')return (ativa?.fase||o.ultimaAcao?.fase)===fase;
  if(fase==='negociacao')return (ativa?.fase||o.ultimaAcao?.fase)==='em_andamento';
  if(fase==='enviados')return Boolean(o.envioConfirmadoEm);
  if(fase==='vencimento'){const v=validadeOrcamento(o);return Boolean(v)&&Date.parse(v+'T12:00:00Z')-Date.parse(hoje+'T12:00:00Z')<=diasVencimento*86400000;}
  return false;
 });
}

export function filtrarFilaPrioridades(r,grupo='todas'){
 const tem=(a,t)=>a.tipo===t||(a.motivos||[]).some(m=>m.tipo===t);
 const semIds=new Set((r.semProximaAcao||[]).map(o=>String(o.id)));
 const filtros={atrasadas:a=>tem(a,'Retorno atrasado'),hoje:a=>tem(a,'Retorno de hoje'),programadas:a=>tem(a,'Retorno programado'),sem_acao:a=>semIds.has(String(a.orcamentoId))||tem(a,'Sem próxima ação'),pendencias:a=>!!a.pendencias||tem(a,'Negociação com pendência'),relacionamento:a=>a.tipoAcao&&a.tipoAcao!=='acompanhamento'};
 return (r.prioridades||[]).filter(filtros[grupo]||(()=>true));
}
