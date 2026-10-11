import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';

async function chamar(funcao,action,dados={}){
  const resp=await comCracha(`${API}/${funcao}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...dados})});
  const body=await resp.json().catch(()=>null);
  if(!resp.ok)throw Object.assign(new Error(body?.erro||mensagemDoStatus(resp.status)),{status:resp.status});
  return body;
}
export const salvarFisico=(item,versao=null)=>chamar('painel-ativos','salvarFisico',{item,versao}).then(r=>r.item);
export const lerConferencias=()=>chamar('painel-config','lerConferencias').then(r=>r.itens||{});
export const salvarConferencia=(id,dados)=>chamar('painel-config','salvarConferencia',{id,dados}).then(r=>r.item);
export const lerLimiteManutencao=()=>chamar('painel-config','patrimonioParametros').then(r=>({limiteManutencaoPercentual:r.limiteManutencaoPercentual??null}));
export const guardarArquivoIncendio=(id,base64,mime,nome)=>chamar('painel-ativos','guardarArquivoIncendio',{id,base64,mime,nome}).then(r=>r.arquivoIncendio);
export const lerArquivoIncendio=id=>chamar('painel-ativos','lerArquivoIncendio',{id});
