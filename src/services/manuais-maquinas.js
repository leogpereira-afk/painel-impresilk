import {comCracha, mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';

async function chamar(action,dados={}) {
  const r=await comCracha(`${API}/painel-config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...dados})});
  const corpo=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(corpo?.erro||mensagemDoStatus(r.status)),{status:r.status});
  return corpo;
}
export const listarManuaisMaquinas=()=>chamar('manuaisMaquinasListar').then(r=>r.itens||[]);
export const listarCatalogoManuais=()=>chamar('manuaisMaquinasCatalogo').then(r=>r.itens||[]);
export const lerManualMaquina=referencia=>chamar('manuaisMaquinasLer',{referencia}).then(r=>r.manual||null);
export const salvarManualMaquina=(referencia,conteudo,versaoAnterior=null)=>chamar('manuaisMaquinasSalvar',{referencia,conteudo,versaoAnterior}).then(r=>r.manual);
export const aprovarManualMaquina=(referencia,versaoAnterior)=>chamar('manuaisMaquinasAprovar',{referencia,versaoAnterior}).then(r=>r.manual);
