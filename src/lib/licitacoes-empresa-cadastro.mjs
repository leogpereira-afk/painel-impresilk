import {normalizarUrlPortal} from '../../supabase/functions/_shared/licitacoes-cadastros.mjs';

const falha=(mensagem,status=409)=>Object.assign(new Error(mensagem),{status});
export function referenciaCadastroEmpresa(empresa,titulares=[]){
 const abrangencia=(empresa.municipios||[]).join(', ');
 return {nome:empresa.nome||'',categoria:'empresa',url:empresa.site||'',fonteUrl:empresa.site||'',titularId:titulares.length===1?titulares[0].id:'',abrangencia:abrangencia.length<=500?abrangencia:'Municípios atendidos conforme a ficha da empresa.',prioridade:empresa.prioridade||'media',proximaAcao:'Conferir o portal e os requisitos para cadastro de fornecedor.'};
}
export function encontrarCadastroEmpresa(itens,item){
 if(!item?.titularId)return null;
 let portal;try{portal=normalizarUrlPortal(item.url);}catch{return null;}
 return (itens||[]).find(i=>{try{return i.titularId===item.titularId&&normalizarUrlPortal(i.url)===portal;}catch{return false;}})||null;
}
export function empresaParaCadastro(itens,empresaId){
 const empresa=(itens||[]).find(i=>i.id===empresaId);
 if(!empresa)throw falha('A empresa não está disponível. O cadastro de fornecedor foi preservado.');
 if(empresa.tipo!=='empresa'||empresa.situacao==='arquivado')throw falha('A ficha deixou de ser uma empresa ativa. O cadastro foi preservado; confira a empresa antes de vincular.');
 return empresa;
}
export async function vincularCadastroEmpresa({empresaId,cadastroId,listarEntidades,salvarEntidade,podeContinuar=()=>true}){
 if(!podeContinuar())throw falha('A janela mudou. O cadastro foi preservado.');
 const lista=await listarEntidades();if(lista?.ok!==true||!Array.isArray(lista.itens))throw falha('Não foi possível confirmar a empresa atual. O cadastro foi preservado.',503);
 const empresa=empresaParaCadastro(lista.itens,empresaId),ids=empresa.cadastroIds||[];
 if(ids.includes(cadastroId))return {empresa,repetido:true};
 if(!podeContinuar())throw falha('A janela mudou. O cadastro foi preservado.');
 const retorno=await salvarEntidade({id:empresa.id,cadastroIds:[...new Set([...ids,cadastroId])]},empresa.atualizadoEm||'');
 if(retorno?.ok!==true||retorno.item?.id!==empresaId||!retorno.item?.cadastroIds?.includes(cadastroId))throw falha('O vínculo não foi confirmado. O cadastro de fornecedor foi preservado.',503);
 return {empresa:retorno.item,repetido:false};
}
export async function salvarCadastroEmpresa({item,versao,empresaId,cadastrosConhecidos=[],salvarCadastro,listarCadastros,podeContinuar=()=>true,...vinculo}){
 if(!podeContinuar())throw falha('A janela mudou. Seu preenchimento foi preservado.');
 if(!item.id){const existente=encontrarCadastroEmpresa(cadastrosConhecidos,item);if(existente)return {etapa:'existente',cadastro:existente};}
 let cadastro;
 try{
  const retorno=await salvarCadastro(item,versao);cadastro=retorno?.item;
  if(retorno?.ok!==true||!cadastro?.id||(item.id?cadastro.id!==item.id:!encontrarCadastroEmpresa([cadastro],item)))throw falha('A gravação do cadastro não foi confirmada.',503);
 }catch(e){
  if(item.id||!podeContinuar()||[401,403].includes(e.status))throw e;
  try{const lista=await listarCadastros();if(lista?.ok!==true||!Array.isArray(lista.itens))throw new Error('Resposta incompleta.');const existente=encontrarCadastroEmpresa(lista.itens,item);if(existente)return {etapa:'existente',cadastro:existente};}
  catch{throw falha(`${e.message||'Não foi possível salvar.'} Não foi possível confirmar se o cadastro já existe. Seu preenchimento foi preservado.`,e.status||503);}
  throw e;
 }
 try{return {etapa:'concluido',cadastro,...await vincularCadastroEmpresa({empresaId,cadastroId:cadastro.id,podeContinuar,...vinculo})};}
 catch(e){return {etapa:'vinculo-pendente',cadastro,erro:e.message||'Não foi possível vincular o cadastro.'};}
}
