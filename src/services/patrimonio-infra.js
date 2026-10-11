import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';

async function chamar(action,corpo={}) {
 const resp=await comCracha(`${API}/painel-config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...corpo})});
 const dados=await resp.json().catch(()=>null);
 if(!resp.ok){const erro=new Error(dados?.erro||mensagemDoStatus(resp.status));erro.status=resp.status;throw erro;}
 return dados;
}

export const lerInfra=()=>chamar('lerInfra');
export const salvarInfra=(id,dados,versaoAnterior=null)=>chamar('salvarInfra',{id,dados,versaoAnterior});
export const guardarContratoInfra=(id,base64,mime,nome,versaoAnterior=null)=>chamar('guardarContratoInfra',{id,base64,mime,nome,versaoAnterior});
export const lerContratoInfra=id=>chamar('lerContratoInfra',{id});
