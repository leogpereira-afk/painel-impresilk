import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import assert from 'node:assert/strict';
let handler,failInsert=false,revogada=false;
const rows=[{colecao:'patrimonio',id:'bem-a',registro:{nome:'A'}},{colecao:'patrimonio',id:'bem-b',registro:{nome:'B'}},{colecao:'ativo',id:'cam-a',registro:{tipo:'seguranca',categoria:'Câmera'}},{colecao:'ativo',id:'alarme-a',registro:{tipo:'seguranca',categoria:'Alarme'}}],files=new Map();
function from(){let filters=[],action='select',body,single=false;
 const q=new Proxy({}, {get(_,k){if(k==='then')return (ok,no)=>{const matched=()=>rows.filter(r=>filters.every(([f,v])=>f==='registro->>bemId'?r.registro.bemId===v:r[f]===v));let data=matched(),error=null;
 if(action==='insert'){if(failInsert)error={message:'falha simulada'};else rows.push(body);data=null;}
 if(action==='delete'){for(const r of matched())rows.splice(rows.indexOf(r),1);data=null;}
 return Promise.resolve({data:single?data?.[0]||null:data,error}).then(ok,no);};
 return (...args)=>{if(k==='eq')filters.push(args);if(k==='maybeSingle')single=true;if(['insert','delete'].includes(k)){action=k;body=args[0];}return q;};}});return q;
}
const storage={upload:async(path,bytes)=>{files.set(path,bytes);return {error:null};},remove:async(paths)=>{paths.forEach(p=>files.delete(p));return {error:null};},createSignedUrl:async p=>({data:{signedUrl:'https://test.invalid/'+p},error:null})};
globalThis.__fotoBanco={from,storage:{from:()=>storage}};globalThis.__revogada=()=>revogada;
globalThis.Deno={env:{get:()=> 'teste'},serve:fn=>handler=fn};
let src=await readFile(new URL('../supabase/functions/painel-fotos/index.ts',import.meta.url),'utf8');
src=src.replace(/import \{createClient\} from [^;]+;/,'const createClient=()=>globalThis.__fotoBanco;').replace(/import \{verificarJwt,crachaRevogado\} from [^;]+;/,`const verificarJwt=async t=>t==='pat'?{sub:'operador',perms:['inventario-valores']}:t==='seg'?{sub:'seguranca',perms:['seguranca']}:t==='outro'?{sub:'outro',perms:['marketing']}:null;const crachaRevogado=async()=>globalThis.__revogada();`);
const {code}=await transform(src,{loader:'ts',format:'esm',target:'es2022'});await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const request=(token,action,bemId='bem-a',extra={})=>handler(new Request('https://test.invalid',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({action,bemId,...extra})}));
assert.equal((await request(null,'listar')).status,401);assert.equal((await request('outro','listar')).status,403);
revogada=true;assert.equal((await request('pat','listar')).status,401);revogada=false;
assert.equal((await request('pat','listar','inexistente')).status,404);
assert.equal((await request('pat','adicionar','bem-a',{base64:btoa('not image')})).status,400);
const jpeg=btoa(String.fromCharCode(255,216,255,224,255,217));
const added=await request('pat','adicionar','bem-a',{base64:jpeg,nome:'Frente.jpg'});assert.equal(added.status,200);const {id}=await added.json();assert.equal(files.size,1);
assert.equal(rows.find(r=>r.id===id).registro.criadoPor,'operador');
const lista=await (await request('pat','listar')).json();assert.equal(lista.fotos.length,1);
assert.equal((await (await request('pat','listar','bem-b')).json()).fotos.length,0);
assert.equal((await request('pat','remover','bem-b',{id})).status,404);assert.equal(files.size,1);
assert.equal((await request('pat','remover','bem-a',{id})).status,200);assert.equal(files.size,0);assert.equal(rows.length,4);
failInsert=true;const log=console.error;console.error=()=>{};try{assert.equal((await request('pat','adicionar','bem-a',{base64:jpeg})).status,500);}finally{console.error=log;}
assert.equal(files.size,0,'falha no cadastro limpa o upload sem vínculo');
failInsert=false;
assert.equal((await request('seg','listar','bem-a',{escopo:'seguranca'})).status,404);
assert.equal((await request('seg','adicionar','alarme-a',{escopo:'seguranca',base64:jpeg})).status,403);
assert.equal((await request('pat','listar','cam-a',{escopo:'seguranca'})).status,403);
const segFoto=await request('seg','adicionar','cam-a',{escopo:'seguranca',base64:jpeg});assert.equal(segFoto.status,200);
assert.equal(rows.at(-1).colecao,'seguranca_foto');assert.match(rows.at(-1).registro.caminho,/^seguranca\/cam-a\//);
assert.equal((await (await request('seg','listar','cam-a',{escopo:'seguranca'})).json()).fotos.length,1);
console.log('Fotos: login, módulo, revogação, equipamento existente, formato, autoria, isolamento, remoção e limpeza após falha conferidos.');
