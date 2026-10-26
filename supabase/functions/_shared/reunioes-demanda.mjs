import {ErroReuniao,idValido,podeEditarReuniao,carimbarReuniao} from './reunioes.mjs';
import {prepararProcesso,carimbarProcesso,SETORES} from './processos.mjs';

export const podeCriarDemandaReuniao=s=>!!s&&!s.externo&&(s.master===true||s.perms?.includes('*')||s.perms?.includes('demandas'));
export async function idDemandaReuniao(reuniaoId,decisaoId){
 if(!idValido(reuniaoId)||!idValido(decisaoId))throw new ErroReuniao('Identificação da decisão inválida.');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([reuniaoId,decisaoId])));
 return 'reuniao_'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
// O vínculo só é persistido junto com a demanda pelo lote atômico da API.
export async function prepararDemandaReuniao(reuniao,decisaoId,s,pessoas=[],agora=new Date().toISOString()){
 if(!podeCriarDemandaReuniao(s))throw new ErroReuniao('Sem acesso a Demandas.',403);
 if(!podeEditarReuniao(reuniao,s))throw new ErroReuniao('Somente quem criou ou a direção pode encaminhar esta decisão.',403);
 const decisao=reuniao?.decisoes?.find(d=>d.id===decisaoId);
 if(!decisao)throw new ErroReuniao('Decisão não encontrada.',404);
 if(decisao.demandaId)throw new ErroReuniao('Esta decisão já está vinculada a uma demanda.',409);
 if(reuniao.situacao==='cancelado')throw new ErroReuniao('Reabra o encontro antes de encaminhar uma decisão.');
 const pessoa=pessoas.find(p=>p.id===decisao.responsavelRhId);
 if(!pessoa)throw new ErroReuniao('Selecione na decisão um responsável disponível no RH.');
 const id=await idDemandaReuniao(reuniao.id,decisao.id);
 const demanda=carimbarProcesso({...prepararProcesso({id,tipo:'demanda',titulo:decisao.texto.slice(0,180),objetivo:decisao.texto,situacao:'nova',setor:Object.hasOwn(SETORES,reuniao.setor)?reuniao.setor:'outros',prioridade:'normal',prazo:decisao.prazo||'',responsavelRhId:pessoa.id,envolvidos:[{rhId:pessoa.id}],etapas:[]},null,s,pessoas,agora),origemReuniaoId:reuniao.id,origemDecisaoId:decisao.id},s,'Criou demanda a partir de decisão de reunião',agora);
 const item=carimbarReuniao({...reuniao,decisoes:reuniao.decisoes.map(d=>d.id===decisao.id?{...d,demandaId:id}:d)},s,'Encaminhou decisão para Demandas',agora);
 return {reuniao:item,demanda};
}
