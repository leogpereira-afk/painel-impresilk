import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function funcao(nome,{revogada=false,erroBanco=false}={}) {
 let handler;const operacoes=[];
 const banco={storage:{from:()=>({})},rpc:async (nome,args)=>{operacoes.push({nome,args});return erroBanco?{data:null,error:{message:'falha de gravação simulada'}}:{data:{gravou:2,contas:0,verificado:true},error:null};},from:tabela=>{let q; q=new Proxy({}, {get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve(erroBanco?{data:null,error:{message:'falha de gravação simulada'}}:{data:[],error:null}).then(resolve,reject);if(key==='maybeSingle')return async()=>({data:null,error:null});return()=>q;}});operacoes.push({tabela});return q;}};
 globalThis.__testeBanco=banco;globalThis.__testeRevogada=revogada;
 globalThis.Deno={env:{get:()=> 'teste',toObject:()=>({})},serve:fn=>handler=fn};
 let s=await readFile(new URL(`../supabase/functions/${nome}/index.ts`,import.meta.url),'utf8');
 s=s.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__testeBanco;')
 .replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,`const verificarJwt=async token=>token==='direcao'?{master:true,sub:'direcao'}:token==='glossario'?{sub:'pessoa',perms:['glossario']}:token==='vendas'?{sub:'vendas',perms:['orcamentos']}:null;const crachaRevogado=async()=>globalThis.__testeRevogada;`);
 s='const console={...globalThis.console,error:()=>{}};\n'+s;
 const bundle=await build({stdin:{contents:s,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/'+nome+'/',import.meta.url))},bundle:true,format:'esm',platform:'neutral',write:false});const code=bundle.outputFiles[0].text;await import('data:text/javascript;base64,'+Buffer.from(code+'\n//'+Math.random()).toString('base64'));
 return {operacoes,chamar:async (token,body)=>{const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
test('restauração não informa sucesso quando o banco recusa a gravação',async()=>{
 const f=await funcao('painel-backup',{erroBanco:true});
 const r=await f.chamar('direcao',{action:'restaurar',backup:{versao:2,sistema:'painel',painel:{config:{parametros:{teste:1}}}}});
 assert.equal(r.status,500);assert.notEqual(r.body.ok,true);
});
test('todas as operações privilegiadas de backup recusam sessão revogada',async()=>{
 const f=await funcao('painel-backup',{revogada:true});
 for(const action of ['status','restaurar','registrarManual','exportar','backupAgora']) {
  const r=await f.chamar('direcao',{action,backup:{versao:2,sistema:'painel',painel:{}}});
  assert.equal(r.status,401,action);assert.equal(r.body.semSessao,true,action);
 }
 assert.equal(f.operacoes.length,0,'sessão revogada não chega aos dados');
});
test('perfil de Glossário não lê nem escreve marcações comerciais e financeiras',async()=>{
 const f=await funcao('painel-config');
 for(const chave of ['ov_rec','ov_orc'])for(const action of ['get','merge']){
  const r=await f.chamar('glossario',{action,chave,patch:{exemplo:{motivo:'fictício'}}});assert.equal(r.status,403,`${action} ${chave}`);
 }
});
test('perfil autorizado mantém acesso às próprias marcações de orçamentos',async()=>{
 const f=await funcao('painel-config');const r=await f.chamar('vendas',{action:'get',chave:'ov_orc'});assert.equal(r.status,200);
});

test('substituição integral antiga é recusada sem apagar registros',async()=>{
 const f=await funcao('painel-config');
 for(const chave of ['config','ov_rec','ov_orc','compromissos','patrimonio'])assert.equal((await f.chamar('direcao',{action:'set',chave,valor:{}})).status,403);
 assert.equal(f.operacoes.length,0);
});
