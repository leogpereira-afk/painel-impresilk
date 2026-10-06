import {API} from '../lib/api.js';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {validarArquivoReuniao} from '../../supabase/functions/_shared/reunioes.mjs';
async function chamar(action,dados={}){
 const r=await comCracha(`${API}/painel-reunioes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...dados})});
 const b=await r.json().catch(()=>null);if(!r.ok||!b?.ok)throw new Error(b?.erro||mensagemDoStatus(r.status));return b;
}
export const listarReunioes=()=>chamar('listar').then(r=>r.itens);
export const salvarReuniao=item=>chamar('salvar',{item}).then(r=>r.item);
export const registrarReuniao=(r,texto)=>chamar('registro',{id:r.id,versao:r.versao,texto}).then(x=>x.item);
export const abrirArquivoReuniao=(id,arquivoId)=>chamar('arquivo',{id,arquivoId}).then(r=>r.url);
export async function anexarReuniao(r,arquivo){
 validarArquivoReuniao(arquivo.name,arquivo.type,arquivo.size);
 const base64=await new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(String(leitor.result).split(',')[1]);leitor.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));leitor.readAsDataURL(arquivo);});
 return chamar('anexar',{id:r.id,versao:r.versao,nome:arquivo.name,mime:arquivo.type,base64}).then(x=>x.item);
}
