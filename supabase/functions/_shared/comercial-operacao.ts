import {agendaCompleta,canceladaPCP,dia,encerradaERP,prazo,status,rotuloStatus} from './agenda-pcp.ts';
const texto=(v:unknown,max=200)=>String(v??'').trim().slice(0,max);
export function projetarOperacaoComercial(o:any,ordemId:string,consultadoEm:string) {
 const baixada=encerradaERP(o),cancelada=canceladaPCP(o);
 const declarada=!!o.finalizadaPorCampo?.finalizadaEm&&o.finalizadaPorCampo.finalizadaEm===o.finalizadaEm;
 const conferida=declarada&&finalizacaoConferida(o);
 const entregaRealEm=dia(o?.finalizadaEm)&&dia(o.finalizadaEm)<=dia(consultadoEm)&&!baixada&&!cancelada&&(!declarada||conferida)?texto(o.finalizadaEm,40):null;
 const st=cancelada?'cancelada':status(o);
 return {estado:'disponivel',fonte:'PCP',pcpId:texto(o.id,80),ordemId,status:st,rotuloStatus:cancelada?'Cancelada no PCP':rotuloStatus(o,st),responsavelPCP:texto(o.responsavelPCP,180)||null,pendencias:{estado:'nao_informado',itens:[],motivo:'A fonte consultada não disponibiliza pendências estruturadas de arte, medição ou aprovação.'},previsaoEstimada:dia(o.previsaoEntrega)||null,previsaoConfirmada:!cancelada&&!baixada&&agendaCompleta(o)&&o.confirmacao==='Confirmado'?prazo(o)||null:null,entregaRealEm,elegivelPosVenda:!!entregaRealEm,encerradaERP:baixada,cancelada,estadoEntrega:cancelada?'cancelada':entregaRealEm?'concluida':declarada?'declarada':'sem_confirmacao',atualizadoEm:texto(o.atualizado_em||o.atualizadoEm,40)||null,consultadoEm};
}
// Conferência da declaração: mesma regra de eventosLidos/eventosAtivos e
// implicitoConferido do PCP (_shared/pcp-entrega-item.mjs, main 11/10/2026).
function finalizacaoConferida(o:any) {
 const alvo='fim:'+String(o.finalizadaPorCampo.finalizadaEm);
 return (Array.isArray(o.itens)?o.itens:[]).some((i:any)=>{
  const vistos=new Set(),lidos=(Array.isArray(i?.entregas)?i.entregas:[]).filter((e:any)=>{
   const id=texto(e?.id);if(!id||vistos.has(id)||!['entregue','retirado','problema','cancelado','desfeito','conferido'].includes(e?.tipo)||!/^\d{4}-\d{2}-\d{2}$/.test(e.dia)||dia(e.dia)!==e.dia||(['entregue','retirado'].includes(e.tipo)&&(!Number.isInteger(e.qtde)||e.qtde<1)))return false;vistos.add(id);return true;
  });
  const porId=new Map(lidos.map((e:any)=>[texto(e.id),e])),anulados=new Set();
  for(const e of lidos){const ref:any=e.tipo==='desfeito'?porId.get(texto(e.alvo)):null;if(ref&&ref.tipo!=='desfeito')anulados.add(texto(ref.id));}
  return lidos.some((e:any)=>e.tipo==='conferido'&&!anulados.has(texto(e.id))&&texto(e.alvo)===alvo);
 });
}
// Lista fechada. Valores, contatos, anexos e notas do PCP não saem da porta.
const CAMPOS='id,atualizado_em,numero:registro->>numero,tipo:registro->>tipo,responsavelPCP:registro->>responsavelPCP,previsaoEntrega:registro->>previsaoEntrega,instalacao:registro->instalacao,equipe:registro->equipe,confirmacao:registro->>confirmacao,horaSaida:registro->>horaSaida,liberadoPCP:registro->liberadoPCP,finalizadaEm:registro->>finalizadaEm,finalizadoPor:registro->>finalizadoPor,finalizadaPorCampo:registro->finalizadaPorCampo,itens:registro->itens,baixaAutoERP:registro->baixaAutoERP,cancelamento:registro->cancelamento';
export async function consultarOperacoesComerciais(sb:any,vendas:any[],consultadoEm=new Date().toISOString()) {
 const mapa=new Map<string,any>(),porId=new Map(vendas.map(o=>[String(o.id),o])),unicos=[...porId.keys()];
 const vazio=(ordemId:string,estado:string,codigo:string)=>({estado,fonte:'PCP',ordemId,pcpId:null,vinculo:null,responsavelPCP:null,pendencias:{estado:'nao_informado',itens:[]},previsaoEstimada:null,previsaoConfirmada:null,entregaRealEm:null,elegivelPosVenda:false,atualizadoEm:null,consultadoEm,codigo});
 for(const id of unicos)mapa.set(id,vazio(id,'sem_vinculo','PCP_SEM_VINCULO'));
 try{
  // Contrato real do importador: número une ERP/PCP, PCP preserva ID próprio.
  // Conferir unicidade GLOBAL comercial antes de procurar qualquer O.S. PCP.
  const numeros=[...new Set(vendas.map(o=>String(o.numero||'')).filter(n=>/^\d{1,12}$/.test(n)))],comerciais:any[]=[],pcp:any[]=[];
  for(let de=0;de<numeros.length;de+=200){
   const lote=numeros.slice(de,de+200);
   for(let inicio=0;inicio<100000;inicio+=500){
    const q=sb.from('painel_ordens').select('id,numero').in('numero',lote);
    const {data,error}=await q.order('id').range(inicio,inicio+499);if(error||!Array.isArray(data))throw new Error('Operação indisponível');
    comerciais.push(...data);if(data.length<500)break;if(inicio===99500)throw new Error('Leitura incompleta');
   }
   const seguros=lote.filter(n=>{const registros=comerciais.filter(o=>String(o.numero)===n);return registros.length===1&&porId.has(String(registros[0].id));});
   if(!seguros.length)continue;
   for(let inicio=0;inicio<100000;inicio+=500){
    const {data,error}=await sb.from('pcp_registros').select(CAMPOS).eq('colecao','os').eq('apagado',false).in('registro->>numero',seguros).order('id').range(inicio,inicio+499);
    if(error||!Array.isArray(data))throw new Error('Operação indisponível');pcp.push(...data);if(data.length<500)break;if(inicio===99500)throw new Error('Leitura incompleta');
   }
  }
  for(const [id,o] of porId){
   const numero=String(o.numero||''),com=comerciais.filter(r=>String(r.numero)===numero),candidatos=pcp.filter(r=>String(r.numero)===numero);
   if(com.length!==1||String(com[0].id)!==id){mapa.set(id,vazio(id,'sem_vinculo','PCP_IDENTIDADE_COMERCIAL_AMBIGUA'));continue;}
   const explicito=String(o.pcpId||'');
   const encontrados=explicito?candidatos.filter(r=>String(r.id)===explicito):candidatos;
   if(candidatos.length!==1||encontrados.length!==1){if(candidatos.length>1)mapa.set(id,vazio(id,'sem_vinculo','PCP_VINCULO_AMBIGUO'));continue;}
   const p=encontrados[0],vinculo={metodo:explicito?'id_explicito':'numero_unico',ordemId:id,pcpId:String(p.id),numero};
   mapa.set(id,{...projetarOperacaoComercial(p,id,consultadoEm),vinculo});
  }
 }catch{for(const id of unicos)mapa.set(id,vazio(id,'indisponivel','PCP_INDISPONIVEL'));}
 return mapa;
}
export function enriquecerVendasOperacao(vendas:any[],operacoes:Map<string,any>) {
 return vendas.map(o=>{const op=operacoes.get(String(o.id));return {...o,entregaRealEm:op?.entregaRealEm||null,elegivelPosVenda:op?.elegivelPosVenda===true,operacao:op||null};});
}
