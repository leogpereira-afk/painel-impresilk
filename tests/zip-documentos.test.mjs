import test from 'node:test';
import assert from 'node:assert/strict';
import { criarZip, crc32, nomeArquivoZip } from '../src/lib/zip.mjs';

test('ZIP preserva bytes e nomes UTF-8 com diretório central válido', () => {
 const pdf=new Uint8Array([37,80,68,70,0,255,12]),texto=new TextEncoder().encode('Emissão e validade\n');
 const zip=Buffer.from(criarZip([{nome:'certidão.pdf',bytes:pdf},{nome:'índice.txt',bytes:texto}]));
 assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt16LE(6),0x800);assert.equal(zip.readUInt16LE(8),0);
 const tamanho=zip.readUInt16LE(26),inicio=30+tamanho;
 assert.equal(zip.subarray(30,inicio).toString('utf8'),'certidão.pdf');assert.deepEqual(zip.subarray(inicio,inicio+pdf.length),Buffer.from(pdf));
 const fim=zip.length-22;assert.equal(zip.readUInt32LE(fim),0x06054b50);assert.equal(zip.readUInt16LE(fim+10),2);
 const central=zip.readUInt32LE(fim+16);assert.equal(zip.readUInt32LE(central),0x02014b50);assert.equal(zip.readUInt32LE(central+42),0);
 assert.equal(central+zip.readUInt32LE(fim+12),fim);
});
test('CRC32 confere vetor independente conhecido',()=>assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926));
test('nomes inseguros são convertidos em nomes simples e colisões preservam todos os arquivos',()=>{
 assert.equal(nomeArquivoZip('../../segredo.pdf').includes('/'),false);
 assert.equal(nomeArquivoZip('C:\\teste.pdf').includes('\\'),false);
 const zip=Buffer.from(criarZip([{nome:'A.pdf',bytes:new Uint8Array([1])},{nome:'a.pdf',bytes:new Uint8Array([2])}]));
 assert.ok(zip.includes(Buffer.from('a (2).pdf')));
});
test('recusa bytes ausentes e excesso antes de produzir pacote incompleto',()=>{
 assert.throws(()=>criarZip([{nome:'a.pdf'}]),/bytes/i);
 assert.throws(()=>criarZip(Array.from({length:81},(_,i)=>({nome:`${i}.pdf`,bytes:new Uint8Array()}))),/80/);
 assert.throws(()=>criarZip([{nome:'a',bytes:new Uint8Array(40*1024*1024+1)}]),/40/);
});
