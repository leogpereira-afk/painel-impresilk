// ZIP sem compressão: preserva os bytes originais de PDFs assinados e imagens.
// Limites conservadores evitam reter pacotes ilimitados na memória do celular.
export const MAX_ZIP_ARQUIVOS=80;
export const MAX_ZIP_BYTES=40*1024*1024;
const encoder=new TextEncoder();
const tabela=Uint32Array.from({length:256},(_,n)=>{
 let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
export function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=tabela[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
export function nomeArquivoZip(nome){
 const limpo=String(nome||'arquivo').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'-').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,180);
 return limpo||'arquivo';
}
function nomesUnicos(entradas){
 const usados=new Set();return entradas.map(e=>{
  const base=nomeArquivoZip(e.nome),ponto=base.lastIndexOf('.'),raiz=ponto>0?base.slice(0,ponto):base,ext=ponto>0?base.slice(ponto):'';
  let nome=base,n=2;while(usados.has(nome.toLocaleLowerCase('pt-BR')))nome=`${raiz} (${n++})${ext}`;
  usados.add(nome.toLocaleLowerCase('pt-BR'));return{...e,nome};
 });
}
export function criarZip(entradas){
 if(!Array.isArray(entradas)||!entradas.length)throw new Error('Selecione pelo menos um arquivo.');
 if(entradas.length>MAX_ZIP_ARQUIVOS)throw new Error('O kit permite até 80 arquivos, incluindo o índice.');
 let bytes=0;
 for(const e of entradas){if(!(e?.bytes instanceof Uint8Array))throw new Error('Arquivo sem bytes válidos. O kit não foi gerado.');bytes+=e.bytes.byteLength;}
 if(bytes>MAX_ZIP_BYTES)throw new Error('O kit excede 40 MB. Divida os documentos em kits menores.');
 const itens=nomesUnicos(entradas).map(e=>({...e,nomeBytes:encoder.encode(e.nome),crc:crc32(e.bytes)}));
 const locais=itens.reduce((n,e)=>n+30+e.nomeBytes.length+e.bytes.length,0),centrais=itens.reduce((n,e)=>n+46+e.nomeBytes.length,0);
 const saida=new Uint8Array(locais+centrais+22),view=new DataView(saida.buffer);let pos=0,central=locais;
 const u16=(p,v)=>view.setUint16(p,v,true),u32=(p,v)=>view.setUint32(p,v,true);
 for(const e of itens){
  const inicio=pos;u32(pos,0x04034b50);u16(pos+4,20);u16(pos+6,0x800);u16(pos+8,0);u16(pos+12,33);
  u32(pos+14,e.crc);u32(pos+18,e.bytes.length);u32(pos+22,e.bytes.length);u16(pos+26,e.nomeBytes.length);
  saida.set(e.nomeBytes,pos+30);saida.set(e.bytes,pos+30+e.nomeBytes.length);pos+=30+e.nomeBytes.length+e.bytes.length;
  u32(central,0x02014b50);u16(central+4,20);u16(central+6,20);u16(central+8,0x800);u16(central+10,0);u16(central+14,33);
  u32(central+16,e.crc);u32(central+20,e.bytes.length);u32(central+24,e.bytes.length);u16(central+28,e.nomeBytes.length);u32(central+42,inicio);
  saida.set(e.nomeBytes,central+46);central+=46+e.nomeBytes.length;
 }
 u32(central,0x06054b50);u16(central+8,itens.length);u16(central+10,itens.length);u32(central+12,centrais);u32(central+16,locais);
 return saida;
}
