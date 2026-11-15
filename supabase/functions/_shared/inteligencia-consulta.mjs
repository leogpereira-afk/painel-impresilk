// Confirma ausência após três 404 consecutivos; espaça a proteção de erros do ERP.
// A API pode devolver 429 por repetição mesmo com cota geral disponível.
export async function consultarPagina({buscar,lista=true,pausa=ms=>new Promise(r=>setTimeout(r,ms))}){
 for(let tentativa=0;tentativa<3;tentativa++){
  if(tentativa)await pausa(31000);
  const r=await buscar();
  if(r.ok)return r.json();
  if(r.status===429){
   const retry=Number(r.headers?.get('retry-after'));
   console.warn(JSON.stringify({evento:'mubisys_limite',retryAfter:Number.isFinite(retry)?retry:null,limite:r.headers?.get('x-ratelimit-limit'),restante:r.headers?.get('x-ratelimit-remaining')}));
  }
  if(r.status!==404||!lista)throw Error(`Mubisys HTTP ${r.status}; fonte não conferida.`);
 }
 return [];
}
