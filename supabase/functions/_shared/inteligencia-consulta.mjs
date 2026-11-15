// Respostas sintéticas nos testes; nunca converte falha de detalhe em vazio.
export async function consultarPagina({buscar,lista=true,pausa=ms=>new Promise(r=>setTimeout(r,ms))}){
 const primeira=await buscar();
 if(primeira.ok)return primeira.json();
 if(primeira.status!==404||!lista)throw Error(`Mubisys HTTP ${primeira.status}; fonte não conferida.`);
 await pausa(2000);
 const segunda=await buscar();
 if(segunda.ok)return segunda.json();
 if(segunda.status===404)return [];
 throw Error(`Mubisys HTTP ${segunda.status}; fonte não conferida.`);
}
