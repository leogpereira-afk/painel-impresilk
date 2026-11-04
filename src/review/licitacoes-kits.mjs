// Simulação local: usa o handler verdadeiro, banco e arquivos fictícios em memória.
import {atenderKitsLicitacoes} from '../../supabase/functions/_shared/licitacoes-kits-handler.mjs';
import {bancoDocumentosDemo,prepararDocumentosDemo,sincronizarLicitacoesDocumentosDemo} from './documentos.mjs';
const actions=new Set(['listarKitsLicitacoes','salvarKitLicitacoes','prepararDownloadKitLicitacoes','arquivarKitLicitacoes','restaurarKitLicitacoes']);
const resposta=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
let preparado;
async function preparar(sb,licitacoes){
 const lic=licitacoes.find(l=>l.id==='demo-trabalho-1');if(!lic)return;
 await atenderKitsLicitacoes({sb,sessao:{master:true},quem:'Conta de demonstração',revalidarSessao:async()=>{},resposta,corpo:{action:'salvarKitLicitacoes',item:{
  cadastroId:'53405710-78db-461b-9d33-37a228fd62c0',nome:'Kit de sinalização · demonstração',licitacaoId:lic.id,titularId:'73405710-78db-461b-9d33-37a228fd62c0',requisitos:[
   {id:'demo-contrato',categoria:'Contrato social',descricao:'Contrato social atualizado',documentoId:'contrato-licitacoes-demo'},
   {id:'demo-cnd',categoria:'CND Federal',descricao:'Regularidade fiscal federal',documentoId:'cnd-licitacoes-demo'},
   {id:'demo-atestado',categoria:'Atestado de capacidade técnica',descricao:'Atestado compatível com o serviço do edital',documentoId:''},
  ]
 }}});
}
export async function respostaKitsLicitacoes(corpo,sessao,bens,licitacoes){
 if(!actions.has(corpo.action))return null;
 prepararDocumentosDemo(bens);sincronizarLicitacoesDocumentosDemo(licitacoes);
 const sb=bancoDocumentosDemo();
 try{
  preparado??=preparar(sb,licitacoes);await preparado;
  return await atenderKitsLicitacoes({sb,sessao,corpo,resposta,quem:'Conta de demonstração',revalidarSessao:async()=>{}});
 }catch(e){return resposta({ok:false,erro:e.message},e.status||500);}
}
