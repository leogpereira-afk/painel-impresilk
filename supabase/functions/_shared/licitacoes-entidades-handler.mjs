import {temPermissao} from './patrimonio-acesso.mjs';
import {conferirVersao,novoInstante} from './documentos.mjs';
import {falhaEntidade,identidadeEntidade,prepararEntidade,entidadePublica,snapshotEntidade} from './licitacoes-entidades.mjs';

export async function atenderEntidadesLicitacoes({sb,sessao,corpo,resposta,quem,revalidarSessao}){
 if(!sessao)falhaEntidade('Entre no sistema.',401);
 if(!temPermissao(sessao,'licitacoes'))falhaEntidade('Sem acesso a Licitações.',403);
 if(typeof revalidarSessao!=='function')falhaEntidade('Conferência de acesso indisponível.',503);
 await revalidarSessao();
 const colecao='licitacoes_entidades';
 const carregar=async nome=>{const rows=[];for(let de=0;;de+=1000){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',nome).order('id').range(de,de+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)return rows;}};
 const ler=async id=>{const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',colecao).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;};
 const titulares=new Map((await carregar('documentos_titulares')).map(r=>[r.id,r.registro]));
 const cadastros=new Map((await carregar('licitacoes_cadastros')).map(r=>[r.id,r.registro]));
 const publico=(id,r)=>entidadePublica(id,r,cadastros,titulares);
 const responder=async body=>{await revalidarSessao();return resposta(body);};
 switch(corpo.action){
  case 'listarEntidadesLicitacoes':return responder({ok:true,itens:(await carregar(colecao)).map(r=>publico(r.id,r.registro))});
  case 'salvarEntidadeLicitacoes':
  case 'arquivarEntidadeLicitacoes':{
   const arquivar=corpo.action==='arquivarEntidadeLicitacoes',item=arquivar?{id:corpo.id,situacao:'arquivado'}:corpo.item,{id,edicao}=identidadeEntidade(item);
   const existente=await ler(id),anterior=edicao?existente:null;
   if(edicao&&!anterior)falhaEntidade('Ficha não encontrada. Atualize a lista.',409);
   if(!edicao&&existente)falhaEntidade('Esta ficha já foi salva. Atualize a lista para continuar pela ficha existente.',409);
   if(anterior)conferirVersao(anterior,corpo.versao);
   const campos=prepararEntidade(item,anterior,cadastros,titulares),agora=novoInstante(anterior);
   const novo={...campos,id,criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||quem,atualizadoEm:agora,atualizadoPor:quem,historico:[...(Array.isArray(anterior?.historico)?anterior.historico:[]),{id:crypto.randomUUID(),em:agora,por:quem,acao:arquivar?'arquivar':edicao?'editar':'criar',antes:anterior?snapshotEntidade(anterior):null,depois:snapshotEntidade(campos)}]};
   await revalidarSessao();
   const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:colecao,p_id:id,p_registro:novo,p_anterior:anterior});
   if(error){if(['23505','40001'].includes(error.code))falhaEntidade('Esta ficha foi salva ou alterada em outra sessão. Atualize a lista antes de continuar.',409);throw error;}
   return responder({ok:true,item:publico(id,data||novo)});
  }
  default:falhaEntidade('Ação desconhecida.',400);
 }
}
