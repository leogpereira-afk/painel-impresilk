import {API} from '../lib/api.js';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
export async function chamarComercial(action,dados={},signal){
 const r=await comCracha(`${API}/painel-comercial`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...dados}),signal});
 const b=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(b?.erro||mensagemDoStatus(r.status)),{status:r.status});return b;
}
