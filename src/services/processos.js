import {API} from '../lib/api.js';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {validarArquivoProcesso} from '../../supabase/functions/_shared/processos.mjs';
export async function chamarProcesso(action,dados={},convite=''){
 const body=JSON.stringify({action,...dados});
 let r;
 if(import.meta.env.MODE==='review')r=(await import('../review/processos.mjs')).respostaProcessos(JSON.parse(body),convite);
 else if(convite)r=await fetch(`${API}/painel-processos`,{method:'POST',headers:{'Content-Type':'application/json','x-convite':convite},body,referrerPolicy:'no-referrer'});
 else r=await comCracha(`${API}/painel-processos`,{method:'POST',headers:{'Content-Type':'application/json'},body});
 const b=await r.json().catch(()=>null);if(!r.ok||!b?.ok)throw new Error(b?.erro||mensagemDoStatus(r.status));return b;
}
export const lerAgendaProcessos=mes=>chamarProcesso('agenda',{mes}).then(r=>r.eventos);
export async function anexarProcesso(r,arquivo,convite=''){
 validarArquivoProcesso(arquivo.name,arquivo.type,arquivo.size);
 const base64=await new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(String(leitor.result).split(',')[1]);leitor.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));leitor.readAsDataURL(arquivo);});
 return chamarProcesso('anexar',{id:r.id,versao:r.versao,nome:arquivo.name,mime:arquivo.type,base64},convite);
}
