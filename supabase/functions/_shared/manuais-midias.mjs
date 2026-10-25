import {falhaManual} from './manuais-maquinas.mjs';
const BASE='https://heveemylixartyijxewh.supabase.co/storage/v1/object/public/painel-arquivos/';
export function fotosConteudo(c){return [c?.foto,...(c?.galeria||[]),...(c?.consumiveis||[]).map(i=>i.foto)].filter(f=>f?.url);}
export function caminhoMidia(url,referencia){
 if(!url?.startsWith(BASE+'manuais/'))return null;
 const p=url.slice(BASE.length),raiz=`manuais/${referencia.tipo}/${referencia.id}/`;
 if(!p.startsWith(raiz)||!new RegExp('^(livre|restrito)/[a-f0-9-]+\\.(png|jpg|webp)$').test(p.slice(raiz.length)))falhaManual('Imagem não pertence a este manual.',422);
 return p;
}
export function validarMidiasConteudo(c,referencia){for(const f of fotosConteudo(c))caminhoMidia(f.url,referencia);}
export async function assinarMidias(sb,m,podeInventario){
 if(!m)return m;const urls=[...new Set([m,...(m.historico||[])].flatMap(v=>fotosConteudo(v.conteudo).map(f=>f.url)))];const midias={};
 await Promise.all(urls.map(async url=>{const p=caminhoMidia(url,m.referencia);if(!p)return;if(p.includes('/restrito/')&&!podeInventario){midias[url]='';return;}const {data,error}=await sb.storage.from('painel-arquivos').createSignedUrl(p,3600);if(error)throw error;midias[url]=data.signedUrl;}));
 return Object.keys(midias).length?{...m,midias}:m;
}
export async function salvarMidiaManual(sb,corpo,ref,podeInventario){
 const {mime,base64,restrita}=corpo;if(typeof restrita!=='boolean'||restrita&&!podeInventario)falhaManual('Sem acesso às imagens do Inventário.',403);
 if(typeof base64!=='string'||!base64||base64.length>4*1024*1024)falhaManual('Imagem excede 3 MB.');
 let b;try{b=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{falhaManual('Imagem inválida.');}
 const jpg=b[0]===255&&b[1]===216&&b[2]===255,png=[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v),webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 const ext=({'image/jpeg':jpg?'jpg':'','image/png':png?'png':'','image/webp':webp?'webp':''})[mime];if(!ext)falhaManual('Formato da imagem inválido.');
 const p=`manuais/${ref.tipo}/${ref.id}/${restrita?'restrito':'livre'}/${crypto.randomUUID()}.${ext}`;
 const {error}=await sb.storage.from('painel-arquivos').upload(p,b,{contentType:mime,upsert:false});if(error)throw error;return {url:BASE+p};
}
