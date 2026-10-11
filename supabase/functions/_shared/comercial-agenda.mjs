// Projeções somente de leitura: a identidade pertence à ação comercial.
import {dataISO} from './comercial.mjs';
const id=v=>String(v??'').trim();
const texto=(v,max=500)=>String(v??'').trim().slice(0,max);
export const destinoAcaoComercial=a=>`/comercial?acao=${encodeURIComponent(id(a.acaoId||a.id))}`;
export function projetarAcoesComerciais(acoes,escopo,mes='') {
 return (acoes||[]).filter(a=>a&&id(a.id)&&(escopo.ids===null||(escopo.ids||[]).includes(id(a.vendedorId)))&&dataISO(a.data)&&(!mes||a.data.startsWith(mes)))
  .map(a=>({id:id(a.id),acaoId:id(a.id),origem:'comercial',tipo:'Comercial',cor:'#b45309',titulo:texto(a.descricao,500),descricao:[texto(a.cliente,180),texto(a.vendedorNome||escopo.vendedores?.find(v=>id(v.id)===id(a.vendedorId))?.nome,180)].filter(Boolean).join(' · '),cliente:texto(a.cliente,180),clienteId:id(a.clienteId),data:a.data,hora:texto(a.hora,5),feito:a.status==='concluida',concluido:a.status==='concluida',feitoEm:a.status==='concluida'?a.atualizadoEm||null:null,vendedorId:id(a.vendedorId),vendedorNome:texto(a.vendedorNome||escopo.vendedores?.find(v=>id(v.id)===id(a.vendedorId))?.nome,180),compromissoId:id(a.compromissoId)||null,orcamentoId:id(a.orcamentoId)||null,ordemId:id(a.ordemId)||null,versao:a.versao??null,atualizadoEm:a.atualizadoEm||null,contatoEm:a.contatoEm||null,recorrenteAnual:false,href:destinoAcaoComercial(a)}));
}
// Comparação apenas de referências explícitas. Sem casamento por título,
// cliente ou data, e sem apagar o registro legado quando houver divergência.
export function combinarCompromissosComerciais(mapa,eventos,vinculosLegados=[]) {
 const saida={...(mapa||{})},conflitos=[];
 for(const vinculo of vinculosLegados||[]){
  const compromissoId=id(vinculo.compromissoId),c=saida[compromissoId];
  if(!compromissoId||!c)continue; // Referência fora do escopo não revela seu dono.
  const divergente=c.data!==vinculo.data||!!c.feito!==!!vinculo.feito;
  saida[compromissoId]={...c,vinculoComercialLegado:{...vinculo,divergente},conflitoComercial:divergente?'O retorno da Mesa e este compromisso têm data ou situação diferentes. Confira os dois registros.':null};
  if(divergente)conflitos.push({compromissoId,orcamentoId:id(vinculo.orcamentoId),codigo:'VINCULO_DIVERGENTE'});
 }
 for(const e of eventos||[]){
  const compromissoId=id(e.compromissoId),legado=compromissoId?saida[compromissoId]:null;
  const conflito=legado&&(legado.data!==e.data||!!legado.feito!==!!e.feito);
  if(legado&&!conflito)delete saida[compromissoId]; // Uma só linha, ID canônico.
  if(conflito){saida[compromissoId]={...legado,conflitoComercial:'Este compromisso e a ação comercial têm data ou situação diferentes. Confira os dois registros.'};conflitos.push({acaoId:e.id,compromissoId,codigo:'VINCULO_DIVERGENTE'});}
  const chave=Object.hasOwn(saida,e.id)?`comercial:${e.id}`:e.id;
  saida[chave]={...e,id:e.id,tipo:'retorno',dono:`comercial:${e.vendedorId}`,donoNome:e.vendedorNome,projecaoComercial:true,conflitoComercial:conflito?'O compromisso legado diverge desta ação. Confira o vínculo antes de alterar.':null};
 }
 return {mapa:saida,conflitos};
}
export function vinculosMesaComercial(marcacoes,orcamentos) {
 const permitidos=new Set((orcamentos||[]).map(o=>id(o.id)));
 return (marcacoes||[]).filter(m=>permitidos.has(id(m.id))&&id(m.registro?.compromissoId)).map(m=>({orcamentoId:id(m.id),compromissoId:id(m.registro.compromissoId),data:dataISO(m.registro.proximoToque)?m.registro.proximoToque:null,feito:['ganho','perdido'].includes(m.registro.situacao),origem:'mesa'}));
}
