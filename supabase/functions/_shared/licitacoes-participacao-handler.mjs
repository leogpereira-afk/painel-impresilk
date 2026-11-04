import {temPermissao} from './patrimonio-acesso.mjs';
import {selecionarParticipacao,resolverParticipacao,montarParticipacao,mesmaParticipacao,falhaParticipacao,MODO_PREPARACAO_LICITACAO} from './licitacoes-participacao.mjs';

export async function atenderParticipacaoLicitacao({sb,sessao,corpo,resposta,quem,revalidarSessao,consultar,agora=()=>new Date()}){
 if(!sessao)falhaParticipacao('Entre no sistema.',401);
 if(!temPermissao(sessao,'licitacoes')||!temPermissao(sessao,'calendario-empresa'))falhaParticipacao('Seu acesso precisa incluir Licitações e Calendário da empresa.',403);
 if(typeof revalidarSessao!=='function'||typeof consultar!=='function')falhaParticipacao('A preparação está indisponível. Tente novamente mais tarde.',503);
 await revalidarSessao();
 const selecao=selecionarParticipacao(corpo),pesquisa=await consultar(selecao.relatorioId);
 await revalidarSessao();
 const {id}=await resolverParticipacao(pesquisa,selecao);
 let avisos=[];
 const ler=async(colecao,id)=>{const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',colecao).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;};
 const responder=async(item,repetido)=>{await revalidarSessao();return resposta({ok:true,item,repetido,modo:MODO_PREPARACAO_LICITACAO,avisos:[...avisos,...(repetido?['Este item já estava em acompanhamento. Datas, situação, anexos e checklist existentes foram preservados.']:[])]});};
 const existente=await ler('ativo',id);
 if(existente){if(!await mesmaParticipacao(existente,id))falhaParticipacao('Este identificador pertence a outro acompanhamento.',409);return responder(existente,true);}
 if(await ler('ativo_lixeira',id))falhaParticipacao('Este acompanhamento está na lixeira. Restaure a ficha existente antes de continuar.',409);
 const preparado=await montarParticipacao(pesquisa,selecao,{agora:agora(),quem});
 const {ficha}=preparado;avisos=preparado.avisos;
 await revalidarSessao();
 const {data,error}=await sb.rpc('painel_licitacao_preparar',{p_id:ficha.id,p_registro:ficha});
 if(error){
  if(['23505','40001'].includes(error.code)){
   const vencedor=await ler('ativo',ficha.id);if(await mesmaParticipacao(vencedor,ficha.id))return responder(vencedor,true);
   falhaParticipacao('O acompanhamento mudou durante a preparação. Atualize a lista antes de continuar.',409);
  }
  throw error;
 }
 const salvo=data?.item||await ler('ativo',ficha.id);
 if(!salvo||!await mesmaParticipacao(salvo,ficha.id))falhaParticipacao('A gravação não foi confirmada. Atualize a lista antes de tentar novamente.',503);
 return responder(salvo,data?.repetido===true);
}
