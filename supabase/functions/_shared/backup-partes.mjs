const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

// TETO DE TAMANHO POR PARTE. Contar só páginas não bastava: no Bosques, quatro
// páginas seguidas de títulos com anexos somam ~40 MB, e a função morria sem
// memória (HTTP 546) sempre na mesma parte. De 16/09 a 28/09/2026 a cópia parou
// em 14.400 de 16.162 registros, repetindo a mesma tentativa a cada 5 minutos.
// A página que passaria do teto fica para a próxima parte. Uma parte com uma
// página só leva a página inteira, porque página não se divide.
export const TETO_PARTE=8*1024*1024;

// base64 em BLOCOS de 3*8192 bytes. Múltiplo de 3: cada bloco vira base64
// completo (sem "=" no meio), e o arquivo inteiro nunca passa por um texto
// binário intermediário. Espalhar um array grande em String.fromCharCode(...)
// estoura a pilha.
export function base64(bytes) {
 const pedacos=[],BLOCO=3*8192;
 for(let i=0;i<bytes.length;i+=BLOCO)pedacos.push(btoa(String.fromCharCode(...bytes.subarray(i,i+BLOCO))));
 return pedacos.join('');
}

export async function avancarCopia(estado,lerPagina,guardarParte,maxPaginas=4,maxBytes=TETO_PARTE) {
 if(estado.terminou)return estado;
 if(!/^[a-z0-9_-]+$/i.test(estado.sistema)||!/^[a-z0-9_-]+$/i.test(estado.operacao))throw new Error('Identificação da cópia inválida.');
 const trechos=[],vistos=new Set();let after=estado.after,paginas=estado.paginas,terminou=false,quantos=0,tamanho=0;
 for(let i=0;i<maxPaginas;i++) {
  if(paginas>=300)throw new Error('Cópia incompleta: limite de páginas atingido.');
  vistos.add(JSON.stringify(after));
  const pagina=await lerPagina(after);
  if(!Array.isArray(pagina.registros))throw new Error('Resposta sem coleção de registros.');
  // Cada página vira texto uma vez só; a parte é montada com esses trechos.
  const trecho=JSON.stringify(pagina.registros).slice(1,-1);
  // Sem avançar o cursor: a próxima parte começa por esta página.
  if(i>0&&tamanho+trecho.length>maxBytes)break;
  if(trecho)trechos.push(trecho);
  tamanho+=trecho.length;quantos+=pagina.registros.length;paginas++;
  after=pagina.nextAfter??null;
  if(after===null){terminou=true;break;}
  if(vistos.has(JSON.stringify(after)))throw new Error('Cópia interrompida: cursor repetido.');
 }
 const numero=estado.partes.length+1;
 // O mesmo texto que JSON.stringify({sistema,numero,registros}) daria.
 const bytes=new TextEncoder().encode(`{"sistema":${JSON.stringify(estado.sistema)},"numero":${numero},"registros":[${trechos.join(',')}]}`);
 trechos.length=0;
 const sha256=await hash(bytes);
 const caminho=`${estado.sistema}/partes/${estado.operacao}/${String(numero).padStart(4,'0')}-${sha256}.json`;
 // Grava os mesmos bytes do hash: nada é serializado de novo no caminho.
 await guardarParte(caminho,bytes);
 return {...estado,after,paginas,terminou,registros:estado.registros+quantos,partes:[...estado.partes,{numero,caminho,sha256,bytes:bytes.length,registros:quantos}]};
}

export async function reconstituirCopia(manifesto,lerArquivo) {
 if(!manifesto.terminou||!manifesto.partes?.length)throw new Error('Cópia incompleta.');
 if(!/^[a-z0-9_-]+$/i.test(manifesto.sistema)||!/^[a-z0-9_-]+$/i.test(manifesto.operacao))throw new Error('Identificação da cópia inválida.');
 const registros=[];
 for(const [i,parte] of manifesto.partes.entries()) {
  const esperado=`${manifesto.sistema}/partes/${manifesto.operacao}/${String(i+1).padStart(4,'0')}-${parte.sha256}.json`;
  if(parte.numero!==i+1 || !/^[a-f0-9]{64}$/.test(parte.sha256) || parte.caminho!==esperado)throw new Error('Sequência de partes inválida.');
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
