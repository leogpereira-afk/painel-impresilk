const bytesDe=valor=>new TextEncoder().encode(JSON.stringify(valor));
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

export async function avancarCopia(estado,lerPagina,guardarParte,maxPaginas=4) {
 if(estado.terminou)return estado;
 if(!/^[a-z0-9_-]+$/i.test(estado.sistema)||!/^[a-z0-9_-]+$/i.test(estado.operacao))throw new Error('Identificação da cópia inválida.');
 const registros=[],vistos=new Set();let after=estado.after,paginas=estado.paginas,terminou=false;
 for(let i=0;i<maxPaginas;i++) {
  if(paginas>=300)throw new Error('Cópia incompleta: limite de páginas atingido.');
  vistos.add(JSON.stringify(after));
  const pagina=await lerPagina(after);
  if(!Array.isArray(pagina.registros))throw new Error('Resposta sem coleção de registros.');
  registros.push(...pagina.registros);paginas++;
  after=pagina.nextAfter??null;
  if(after===null){terminou=true;break;}
  if(vistos.has(JSON.stringify(after)))throw new Error('Cópia interrompida: cursor repetido.');
 }
 const numero=estado.partes.length+1;
 const corpo={sistema:estado.sistema,numero,registros},bytes=bytesDe(corpo);
 const sha256=await hash(bytes);
 const caminho=`${estado.sistema}/partes/${estado.operacao}/${String(numero).padStart(4,'0')}-${sha256}.json`;
 await guardarParte(caminho,corpo);
 return {...estado,after,paginas,terminou,registros:estado.registros+registros.length,partes:[...estado.partes,{numero,caminho,sha256,bytes:bytes.length,registros:registros.length}]};
}

export async function reconstituirCopia(manifesto,lerArquivo) {
 if(!manifesto.terminou||!manifesto.partes?.length)throw new Error('Cópia incompleta.');
 const registros=[];
 for(const [i,parte] of manifesto.partes.entries()) {
  if(parte.numero!==i+1 || !parte.caminho.startsWith(`${manifesto.sistema}/partes/${manifesto.operacao}/`) || parte.caminho.includes('..'))throw new Error('Sequência de partes inválida.');
  const bytes=await lerArquivo(parte.caminho);
  if(!bytes)throw new Error('Parte ausente.');
  if(bytes.length!==parte.bytes || await hash(bytes)!==parte.sha256)throw new Error('Falha na integridade da parte.');
  const corpo=JSON.parse(new TextDecoder().decode(bytes));
  if(corpo.sistema!==manifesto.sistema || corpo.numero!==parte.numero || !Array.isArray(corpo.registros) || corpo.registros.length!==parte.registros)throw new Error('Conteúdo da parte inválido.');
  registros.push(...corpo.registros);
 }
 if(registros.length!==manifesto.registros)throw new Error('A contagem de registros não confere.');
 return registros;
}
