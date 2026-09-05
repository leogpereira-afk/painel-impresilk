import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {carregarClientes,carregarFunil,normalizarCliente} from './lib/crm-mubi.mjs';
const c=normalizarCliente({id:1,nome_fantasia:'Teste',observacao_bancaria:'privada',cnpj_cpf:'01.234.567/0001-89',origem:'Indicação',contatos:[{nome_contato:'Contato',email:'x@example.test',contato_financeiro:'Sim'}]});
assert.equal(c.documento,'01234567000189');assert.equal(c.contatos[0].financeiro,true);assert.equal(c.observacao_bancaria,undefined);
await assert.rejects(()=>carregarClientes(async()=>[]));await assert.rejects(()=>carregarClientes(async()=>[{id:1}]));
const busca=async(p,q)=>p==='usuario'?[{id:1,nome:'Responsável'}]:p==='funil-vendas-grupo'?[{id:2,nome:'Funil'}]:p.startsWith('funil-vendas-fase')?[{id:3,nome:'Fase',sequencia:1}]:q.fase_id===3?[{id:4,titulo:'Card',cliente:{id:1,nome:'Cliente'},grupo:{id:2,nome:'Funil'},fase:{id:3,nome:'Fase'},responsavel:1,valor:0}]:[];
const funil=await carregarFunil(busca);assert.equal(funil.cards.length,1);assert.equal(funil.cards[0].clienteId,'1');assert.equal(funil.cards[0].valor,0);assert.equal(funil.cards[0].responsavel,'Responsável');
await assert.rejects(()=>carregarFunil(async(p,q)=>{if(p==='funil-vendas-card')throw new Error('falhou uma fase');return busca(p,q);}));
let handler,revogado=false,falhaBanco=false;const rows={crm_clientes:{valor:{versao:1,completo:true,clientes:{'1':c}},atualizado_em:'2026-09-05'},crm_funil:{valor:funil,atualizado_em:'2026-09-05'}};
function from(){let chave;const q=new Proxy({}, {get(_,k){if(k==='then')return(ok,no)=>Promise.resolve({data:rows[chave]||null,error:falhaBanco?{message:'erro'}:null}).then(ok,no);return(...args)=>{if(k==='eq'&&args[0]==='chave')chave=args[1];return q;};}});return q;}
globalThis.__crmDb={from};globalThis.__crmRevogado=()=>revogado;
globalThis.Deno={env:{get:k=>k==='PAINEL_GH_ACTIONS_TOKEN'?'':'teste'},serve:fn=>handler=fn};
let src=await readFile('supabase/functions/painel-dados/index.ts','utf8');src=src.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__crmDb;').replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,`const verificarJwt=async t=>t==='vendas'?{perms:['orcamentos']}:t==='outro'?{perms:['patrimonio']}:null;const crachaRevogado=async()=>globalThis.__crmRevogado();`);
await import('data:text/javascript;base64,'+Buffer.from((await transform(src,{loader:'ts',format:'esm',target:'es2022'})).code).toString('base64'));
const req=(mod,token,id='1')=>handler(new Request(`https://test.invalid?modulo=${mod}&id=${id}`,{headers:token?{authorization:`Bearer ${token}`}:{}}));
for(const mod of ['crm','cliente360']){assert.equal((await req(mod)).status,401);assert.equal((await req(mod,'outro')).status,403);revogado=true;assert.equal((await req(mod,'vendas')).status,401);revogado=false;assert.equal((await req(mod,'vendas')).status,200);}
assert.equal((await req('cliente360','vendas','__proto__')).status,400);
const ficha=await(await req('cliente360','vendas')).json();assert.equal(ficha.cliente.id,'1');assert.equal(ficha.clientes,undefined);assert.equal(ficha.recebiveis,undefined);
assert.equal((await(await req('cliente360','vendas','2')).json()).cliente,null);
falhaBanco=true;assert.equal((await req('crm','vendas')).status,503);falhaBanco=false;delete rows.crm_funil;assert.equal((await req('crm','vendas')).status,503);
console.log('CRM: normalização, privacidade, carga completa, vínculos, login, permissões, revogação e falhas conferidos.');
// Ingestão: o token é o mesmo já usado pela carga; sem ele não há leitura nem escrita.
src=await readFile('supabase/functions/painel-cache/index.ts','utf8');src=src.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__crmDb;');
await import('data:text/javascript;base64,'+Buffer.from((await transform(src,{loader:'ts',format:'esm',target:'es2022'})).code).toString('base64'));
const gravar=(chave,valor,token='teste')=>handler(new Request('https://test.invalid',{method:'POST',headers:{'x-token':token},body:JSON.stringify({chave,valor})}));
assert.equal((await gravar('crm_funil',funil,'inválido')).status,401);
assert.equal((await gravar('crm_funil',{...funil,completo:false})).status,400);
assert.equal((await gravar('crm_clientes',{versao:1,completo:true,clientes:{}})).status,400);
rows.crm_funil={valor:funil};assert.equal((await gravar('crm_funil',{...funil,cards:[]})).status,409);
assert.equal((await gravar('crm_funil',funil)).status,200);
console.log('Ingestão CRM: token, snapshot completo e preservação da base preenchida conferidos.');
