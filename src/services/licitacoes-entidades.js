import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';
async function chamar(action,dados={},signal){
 const resp=await comCracha(`${API}/painel-ativos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...dados}),signal});
 const corpo=await resp.json().catch(()=>null);
 if(!resp.ok||!corpo||corpo.ok===false||corpo.erro)throw Object.assign(new Error(corpo?.erro||mensagemDoStatus(resp.status)),{status:resp.status});
 return corpo;
}
export const listarEntidadesLicitacoes=signal=>chamar('listarEntidadesLicitacoes',{},signal);
export const salvarEntidadeLicitacoes=(item,versao)=>chamar('salvarEntidadeLicitacoes',{item,versao});
