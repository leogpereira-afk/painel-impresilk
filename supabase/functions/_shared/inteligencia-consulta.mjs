// Confirma ausência somente após três 404 consecutivos da mesma lista.
export async function consultarPagina({buscar,lista=true,pausa=ms=>new Promise(r=>setTimeout(r,ms))}){
 for(let tentativa=0;tentativa<3;tentativa++){
  if(tentativa)await pausa(2100);
  const r=await buscar();
  if(r.ok)return r.json();
  if(r.status!==404||!lista)throw Error(`Mubisys HTTP ${r.status}; fonte não conferida.`);
 }
 return [];
}
