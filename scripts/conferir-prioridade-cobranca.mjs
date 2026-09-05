// Código real da função, autenticação e banco simulados. Nenhuma rede.
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import assert from 'node:assert/strict';
let handler,calls=[],falha=false,fotoProtegida=false;
const query=new Proxy({}, {get(_,k){if(k==='then')return (ok,no)=>Promise.resolve({data:fotoProtegida?[{id:"foto"}]:[],error:null}).then(ok,no);return ()=>query;}});
globalThis.__cobBanco={from:()=>query,rpc:async (name,args)=>{calls.push({name,args});return {error:falha?{message:'falha simulada'}:null};}};
globalThis.Deno={env:{get:()=> 'teste'},serve:fn=>{handler=fn;}};
let source=await readFile(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8');
source=source.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__cobBanco;');
source=source.replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,`const verificarJwt=async token=>token==='direcao'?{master:true,sub:'direcao',nome:'Direção'}:token==='cobrador'?{sub:'cobrador',perms:['contas-atrasadas']}:token==='vendedor'?{sub:'vendedor',perms:['orcamentos']}:null; const crachaRevogado=async()=>false;`);
const {code}=await transform(source,{loader:'ts',format:'esm',target:'es2022'});await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const req=(token,patch={cliente:'Exemplo',prioridade:'alta'})=>new Request('https://teste.invalid',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({action:'merge',chave:'cobrancas',patch:{EXEMPLO:patch}})});
assert.equal((await handler(req())).status,401);assert.equal((await handler(req('vendedor'))).status,403);assert.equal(calls.length,0);
assert.equal((await handler(req('cobrador'))).status,200);assert.deepEqual(calls.pop(),{name:'cobranca_priorizar',args:{p_id:'EXEMPLO',p_cliente:'Exemplo',p_prioridade:'alta',p_quem:'cobrador'}});
for(const prioridade of ['urgente',null,{},false])assert.equal((await handler(req('direcao',{prioridade}))).status,400);
assert.equal((await handler(req('direcao',{prioridade:'alta',chamadoId:'a'}))).status,400);assert.equal(calls.length,0);
assert.equal((await handler(req('direcao',{cliente:'Exemplo',chamadoId:'a',chamado:{resumo:'Teste'}}))).status,200);assert.equal(calls.pop().name,'cobranca_mexer');
falha=true;const log=console.error;console.error=()=>{};try{assert.equal((await handler(req('direcao'))).status,500);}finally{console.error=log;}
console.log('Prioridade: autenticação, permissão do módulo, autoria do servidor, validação, diário existente e falha de gravação conferidos.');

fotoProtegida=true;
const apagar=new Request('https://teste.invalid',{method:'POST',headers:{authorization:'Bearer direcao'},body:JSON.stringify({action:'removerId',chave:'patrimonio',id:'bem'})});
assert.equal((await handler(apagar)).status,409,'equipamento com foto não desaparece da galeria');
console.log('Patrimônio: exclusão com fotos vinculadas recusada; baixa mantém o histórico.');
