import {API} from '../api.js';
import {getToken,comCracha} from '../sessao.js';

export async function acmRequest(action, payload = {}) {
  if (import.meta.env.MODE === 'review') {
    if (action === 'capabilities') return {ok:true,persistence:false,assistant:{available:false,reason:'A prévia local não envia projetos nem chama IA. A conexão será conferida após a publicação do servidor.'}};
    throw new Error('Esta prévia usa somente dados locais.');
  }
  const token=getToken();
  if(!token) throw new Error('Entre novamente no Painel para acessar seus projetos.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try {
    const response=await comCracha(`${API}/painel-acm`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...payload,action}),signal:controller.signal,cache:'no-store'});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok){const error=new Error(data?.error||'O servidor do ACM Studio não está disponível. Seu rascunho local foi preservado.');error.code=data?.code;throw error;}
    return data;
  } catch(error) {
    if(error.name==='AbortError'||controller.signal.aborted) throw new Error('O servidor demorou a responder. Confira a lista de projetos antes de repetir um salvamento.');
    throw error;
  } finally {clearTimeout(timer);}
}
