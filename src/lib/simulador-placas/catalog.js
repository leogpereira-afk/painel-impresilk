import {API} from '../api.js';
import {getToken,comCracha} from '../sessao.js';
import {handleCatalog,ACMError} from './review-catalog.mjs';
export const catalogPreview=import.meta.env.MODE==='review';
export async function catalogRequest(action,payload={}){
 if(catalogPreview){
  const key='impresilk.simulador-placas.preview.v1';
  const read=()=>JSON.parse(localStorage.getItem(key)||'[]');
  const repo={list:async()=>read(),get:async id=>read().find(x=>x.id===id)??null,save:async(item,before)=>{const all=read(),current=all.find(x=>x.id===item.id)??null;if(JSON.stringify(current)!==JSON.stringify(before))throw new ACMError('CONFLICT','Atualize o cadastro.',409);localStorage.setItem(key,JSON.stringify([...all.filter(x=>x.id!==item.id),item]));}};
  return handleCatalog({action,...payload},{session:{sub:'preview',master:true,exp:Date.now()/1000+3600},repo});
 }
 const token=getToken();if(!token)throw Error('Entre novamente para abrir o cadastro compartilhado.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await comCracha(`${API}/painel-placas`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...payload}),signal:controller.signal,cache:'no-store'});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error(data?.error||'Cadastro compartilhado indisponível. Tente atualizar.');return data;}catch(e){if(e.name==='AbortError')throw Error('Sem resposta do cadastro. Atualize para conferir antes de repetir o salvamento.');throw e;}finally{clearTimeout(timer);}
}
