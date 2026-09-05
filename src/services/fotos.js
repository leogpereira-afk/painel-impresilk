import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';
async function chamar(action,bemId,campos={}){
 const r=await comCracha(`${API}/painel-fotos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,bemId,...campos})});
 const b=await r.json().catch(()=>null);if(!r.ok)throw new Error(b?.erro||mensagemDoStatus(r.status));return b;
}
export const listarFotos=bemId=>chamar('listar',bemId).then(b=>b.fotos||[]);
export const adicionarFoto=(bemId,base64,nome)=>chamar('adicionar',bemId,{base64,nome});
export const removerFoto=(bemId,id)=>chamar('remover',bemId,{id});
export async function prepararFoto(file){
 if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw new Error('Escolha uma foto JPG, PNG ou WebP.');
 if(file.size>20*1024*1024)throw new Error('Escolha uma foto de até 20 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Não foi possível ler a foto.'));im.src=url;});
  const escala=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*escala));canvas.height=Math.max(1,Math.round(img.naturalHeight*escala));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const base64=canvas.toDataURL('image/jpeg',0.82).split(',')[1];if(base64.length>4*1024*1024)throw new Error('A imagem ainda está grande. Escolha uma versão menor.');return base64;
 }finally{URL.revokeObjectURL(url);}
}
