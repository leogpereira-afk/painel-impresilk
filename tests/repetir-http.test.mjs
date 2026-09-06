import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const {code}=await transform(await readFile(new URL('../supabase/functions/_shared/repetir-http.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'});
const {buscarComRetentativa}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('limite temporário lançado pelo transporte respeita a espera e tenta novamente',async(t)=>{
 let chamadas=0;const esperas=[];
 t.mock.method(globalThis,'fetch',async()=>{if(++chamadas<3)throw new Error('Rate limit exceeded for trace teste. Retry after 41757ms.');return new Response('ok');});
 const r=await buscarComRetentativa('https://exemplo.invalid',{},async ms=>esperas.push(ms));
 assert.equal(r.status,200);assert.equal(chamadas,3);assert.equal(esperas.length,2);assert.ok(esperas.every(ms=>ms>=41757&&ms<=45000));
});
test('limite persistente termina após três tentativas e não informa sucesso',async(t)=>{
 let chamadas=0;t.mock.method(globalThis,'fetch',async()=>{chamadas++;throw new Error('Rate limit exceeded for trace teste. Retry after 1000ms.');});
 await assert.rejects(buscarComRetentativa('https://exemplo.invalid',{},async()=>{}),/Rate limit/);assert.equal(chamadas,3);
});
test('erro de autorização e falha comum de transporte não são repetidos',async(t)=>{
 let chamadas=0;t.mock.method(globalThis,'fetch',async()=>{chamadas++;return new Response('negado',{status:403});});
 assert.equal((await buscarComRetentativa('https://exemplo.invalid',{},async()=>{})).status,403);assert.equal(chamadas,1);
 globalThis.fetch=async()=>{chamadas++;throw new Error('Falha desconhecida');};
 await assert.rejects(buscarComRetentativa('https://exemplo.invalid',{},async()=>{}),/desconhecida/);assert.equal(chamadas,2);
});
