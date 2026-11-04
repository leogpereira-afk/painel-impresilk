// Prévia começa sem quilômetros preenchidos: nunca inventa medições rodoviárias.
import {atenderRotasLicitacoes} from '../../supabase/functions/_shared/licitacoes-rotas-handler.mjs';
import {bancoDocumentosDemo} from './documentos.mjs';
const responder=(dados,status=200)=>new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});
export async function respostaRotasLicitacoes(corpo,sessao){
 if(!['listarRotasLicitacoes','salvarRotaLicitacoes'].includes(corpo.action))return null;
 try{return await atenderRotasLicitacoes({sb:bancoDocumentosDemo(),sessao,corpo,resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});}
 catch(e){return responder({ok:false,erro:e.message},e.status||500);}
}
