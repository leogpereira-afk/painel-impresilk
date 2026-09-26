// Exercita somente leituras e barreiras de acesso com banco e autenticação simulados.
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const sourceUrl=new URL('../supabase/functions/painel-acesso/index.ts',import.meta.url);
let handler, falhar=false;
const consultas=[];
function consulta(tabela){
 let single=false;
 const query=new Proxy({}, {get(_obj,metodo){
   if(metodo==='then')return (ok,erro)=>Promise.resolve({data:single?null:[],error:falhar?{message:'falha simulada'}:null}).then(ok,erro);
   if(['insert','update','delete','upsert'].includes(metodo))throw new Error('listar não pode gravar dados');
   return ()=>{if(metodo==='maybeSingle'||metodo==='single')single=true;return query;};
 }});
 consultas.push(tabela);return query;
}
globalThis.__acessosBanco={from:consulta,rpc:consulta};
globalThis.Deno={env:{get:()=> 'somente-teste'},serve:fn=>{handler=fn;}};
let source=await readFile(sourceUrl,'utf8');
source=source.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__acessosBanco;');
source=source.replace(/import \{ hashSenha, verificarJwt, crachaRevogado \} from [^;]+;/,`const hashSenha=()=>{throw new Error('Não deve gerar senha')}; const verificarJwt=async token=>token==='direcao'?{master:true}:token==='usuario'?{master:false}:null; const crachaRevogado=async()=>false;`);
// Empacotado (e nao so transpilado): a painel-acesso importa regras de
// _shared/*.ts desde 26/09/2026, e um modulo data: nao resolve caminho relativo.
const saida=await build({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-acesso/',import.meta.url))},bundle:true,format:'esm',platform:'neutral',target:'es2022',write:false,logLevel:'silent'});
await import(`data:text/javascript;base64,${Buffer.from(saida.outputFiles[0].text).toString('base64')}`);
const request=token=>new Request('https://teste.invalid',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({action:'listar'})});
assert.equal((await handler(request())).status,401);
assert.equal((await handler(request('usuario'))).status,403);
assert.equal(consultas.length,0,'sem autenticação não consulta contas');
const r=await handler(request('direcao'));
assert.equal(r.status,200);
const body=await r.json();assert.equal(body.ok,true);assert.equal(body.contas.length,0);
assert.equal(body.fontes.domo.estado,'nao_integrado');assert.equal(body.fontes.rh.estado,'consultado');
falhar=true;
const log=console.error;console.error=()=>{};
try{assert.equal((await handler(request('direcao'))).status,500,'falha de consulta não vira sucesso vazio');}finally{console.error=log;}
console.log('Acessos: 401 sem sessão, 403 sem direção, leitura vazia válida e falha de fonte conferidos; nenhuma gravação.');
