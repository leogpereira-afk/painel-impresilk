import {API} from '../lib/api.js';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
export const alteracoesComerciais=new EventTarget();
export async function chamarComercial(action,dados={},signal){
 const r=await comCracha(`${API}/painel-comercial`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...dados}),signal});
 const b=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(b?.erro||mensagemDoStatus(r.status)),{status:r.status});
 if(/^(salvar|gravar|excluir|configurar|remover|concluir)/.test(action))alteracoesComerciais.dispatchEvent(new Event('alteracao'));
 return b;
}
