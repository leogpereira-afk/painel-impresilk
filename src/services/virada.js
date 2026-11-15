import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';

export async function chamarVirada(action,corpo={}) {
  const resposta=await comCracha(`${API}/painel-virada`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...corpo})});
  const dados=await resposta.json().catch(()=>null);
  if(!resposta.ok||dados?.ok===false){const erro=new Error(dados?.erro||mensagemDoStatus(resposta.status));erro.status=resposta.status;throw erro;}
  if(!dados)throw new Error('Não foi possível ler a resposta. Tente novamente.');
  return dados;
}

export function lerFotoVirada(arquivo){
  if(!['image/jpeg','image/png','image/webp'].includes(arquivo.type))throw new Error('Escolha uma foto JPEG, PNG ou WebP.');
  if(arquivo.size>6*1024*1024)throw new Error('Cada foto pode ter até 6 MB.');
  return new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve({nome:arquivo.name,mime:arquivo.type,base64:String(leitor.result).split(',')[1]});leitor.onerror=()=>reject(new Error('Não foi possível ler esta foto.'));leitor.readAsDataURL(arquivo);});
}


export function lerPdfVirada(arquivo) {
  if (!/\.pdf$/i.test(arquivo.name) || arquivo.type && arquivo.type !== 'application/pdf' || arquivo.size > 6*1024*1024 || arquivo.size < 12) throw new Error('Escolha um PDF de até 6 MB.');
  return new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve({nome:arquivo.name,mime:'application/pdf',base64:String(leitor.result).split(',')[1]});leitor.onerror=()=>reject(new Error('Não foi possível ler o PDF.'));leitor.readAsDataURL(arquivo);});
}
