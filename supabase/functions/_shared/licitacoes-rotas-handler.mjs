import {temPermissao} from './patrimonio-acesso.mjs';
import {conferirVersao,novoInstante} from './documentos.mjs';
import {ORIGEM_IMPRESILK,falhaRota,prepararRota,idRotaLicitacoes,rotaPublica,snapshotRota} from './licitacoes-rotas.mjs';

export async function atenderRotasLicitacoes({sb,sessao,corpo,resposta,quem,revalidarSessao}){
 if(!sessao)falhaRota('Entre no sistema.',401);
 if(!temPermissao(sessao,'licitacoes'))falhaRota('Sem acesso a Licitações.',403);
 if(typeof revalidarSessao!=='function')falhaRota('Conferência de acesso indisponível.',503);
 await revalidarSessao();
 const colecao='licitacoes_rotas';
 const ler=async id=>{const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',colecao).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;};
 const responder=async body=>{await revalidarSessao();return resposta(body);};
 switch(corpo.action){
  case 'listarRotasLicitacoes':{
   const itens=[];for(let de=0;;de+=1000){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',colecao).order('id').range(de,de+999);if(error)throw error;itens.push(...(data||[]).filter(r=>r.registro?.origem===ORIGEM_IMPRESILK).map(r=>rotaPublica(r.id,r.registro)));if((data||[]).length<1000)break;}
   return responder({ok:true,itens});
  }
  case 'salvarRotaLicitacoes':{
   const item=corpo.item,campos=prepararRota(item),id=await idRotaLicitacoes(campos.municipio),edicao=Object.hasOwn(item,'id');
   if(edicao&&item.id.toLowerCase()!==id)falhaRota('Cidade e origem identificam esta rota. Abra a ficha da cidade desejada para registrar outro percurso.',409);
   const existente=await ler(id),anterior=edicao?existente:null;
   if(edicao&&!anterior)falhaRota('Rota não encontrada. Atualize a lista.',409);
   if(!edicao&&existente)falhaRota('Esta cidade já possui uma rota salva para a origem. Atualize a lista e edite a ficha existente.',409);
   if(anterior&&anterior.origem!==ORIGEM_IMPRESILK)falhaRota('A origem desta rota mudou. Atualize a lista.',409);
   if(anterior)conferirVersao(anterior,corpo.versao);
   const agora=novoInstante(anterior),novo={...campos,id,origem:ORIGEM_IMPRESILK,criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||quem,atualizadoEm:agora,atualizadoPor:quem,historico:[...(Array.isArray(anterior?.historico)?anterior.historico:[]),{id:crypto.randomUUID(),em:agora,por:quem,acao:edicao?'editar':'criar',antes:anterior?snapshotRota(anterior):null,depois:snapshotRota(campos)}]};
   await revalidarSessao();
   const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:colecao,p_id:id,p_registro:novo,p_anterior:anterior});
   if(error){if(['23505','40001'].includes(error.code))falhaRota('Esta rota foi salva ou alterada em outra sessão. Atualize a lista antes de continuar.',409);throw error;}
   return responder({ok:true,item:rotaPublica(id,data||novo)});
  }
  default:falhaRota('Ação desconhecida.',400);
 }
}
