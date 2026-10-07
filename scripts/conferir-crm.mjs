import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
const empacotar=async(src,dir)=>{const r=await build({stdin:{contents:src,resolveDir:resolve(dir),loader:'ts'},bundle:true,format:'esm',platform:'neutral',write:false});return r.outputFiles[0].text;};
import {carregarClientes,carregarFunil,normalizarCliente} from './lib/crm-mubi.mjs';
const c=normalizarCliente({id:1,nome_fantasia:'Teste',observacao_bancaria:'privada',cnpj_cpf:'01.234.567/0001-89',origem:'Indicação',contatos:[{nome_contato:'Contato',email:'x@example.test',contato_financeiro:'Sim'}]});
assert.equal(c.documento,'01234567000189');assert.equal(c.contatos[0].financeiro,true);assert.equal(c.observacao_bancaria,undefined);
await assert.rejects(()=>carregarClientes(async()=>[]));await assert.rejects(()=>carregarClientes(async()=>[{id:1}]));
const busca=async(p,q)=>p==='usuario'?[{id:1,nome:'Responsável'}]:p==='funil-vendas-grupo'?[{id:2,nome:'Funil'}]:p.startsWith('funil-vendas-fase')?[{id:3,nome:'Fase',sequencia:1}]:q.fase_id===3?[{id:4,titulo:'Card',cliente:{id:1,nome:'Cliente'},grupo:{id:2,nome:'Funil'},fase:{id:3,nome:'Fase'},responsavel:1,valor:0}]:[];
const funil=await carregarFunil(busca);assert.equal(funil.cards.length,1);assert.equal(funil.cards[0].clienteId,'1');assert.equal(funil.cards[0].valor,0);assert.equal(funil.cards[0].responsavel,'Responsável');
await assert.rejects(()=>carregarFunil(async(p,q)=>{if(p==='funil-vendas-card')throw new Error('falhou uma fase');return busca(p,q);}));
let handler,revogado=false,falhaBanco=false,falhaHistorico=false;const rows={comercial_catalogo:{valor:{completo:true,vendedores:[{id:'1',nome:'Responsável'},{id:'2',nome:'Outra vendedora'}]}},orcamentos:{valor:[]},crm_clientes:{valor:{versao:1,completo:true,clientes:{'1':{...c,responsavel:'Responsável'}}},atualizado_em:'2026-09-05'},crm_funil:{valor:funil,atualizado_em:'2026-09-05'}};
const ordens=[{id:'historica-propria',cliente:'Cliente histórico sem cadastro',data:'2024-03-10',valor:100,vendedor:'Responsável',comercial:{tipo:'Normal',clienteId:'3'}},{id:'historica-alheia',cliente:'Cliente alheio',data:'2024-03-10',valor:999,vendedor:'Outra vendedora',comercial:{tipo:'Normal',clienteId:'4'}}];
function from(tabela){
 assert.ok(['painel_cache','painel_registros','painel_ordens'].includes(tabela),`Tabela não modelada na verificação: ${tabela}`);
 let chave,chaves=null,inicio=0,fim=999;
 const q=new Proxy({}, {get(_,k){
  if(k==='then')return(ok,no)=>{
   const data=tabela==='painel_ordens'?ordens.slice(inicio,fim+1):tabela==='painel_registros'?null:chaves?Object.entries(rows).filter(([chave])=>chaves.includes(chave)).map(([chave,r])=>({chave,...r})):rows[chave]||null;
   return Promise.resolve({data,error:falhaBanco||(tabela==='painel_ordens'&&falhaHistorico)?{message:'erro'}:null}).then(ok,no);
  };
  return(...args)=>{if(k==='eq'&&args[0]==='chave')chave=args[1];if(k==='in')chaves=args[1];if(k==='range')[inicio,fim]=args;return q;};
 }});return q;
}
globalThis.__crmDb={from,rpc:async(_,{p_id})=>({data:rows.crm_clientes?{completo:rows.crm_clientes.valor.completo,cliente:rows.crm_clientes.valor.clientes[p_id]||null,atualizadoEm:rows.crm_clientes.atualizado_em}:null,error:falhaBanco?{message:'erro'}:null})};globalThis.__crmRevogado=()=>revogado;
globalThis.Deno={env:{get:k=>k==='PAINEL_GH_ACTIONS_TOKEN'?'':'teste'},serve:fn=>handler=fn};
let src=await readFile('supabase/functions/painel-dados/index.ts','utf8');src=src.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__crmDb;').replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,`const verificarJwt=async t=>t==='vendas'?{sub:'vendas',vend:'Responsável',perms:['orcamentos']}:t==='outro'?{perms:['patrimonio']}:null;const crachaRevogado=async()=>globalThis.__crmRevogado();`);
await import('data:text/javascript;base64,'+Buffer.from(await empacotar(src,'supabase/functions/painel-dados')).toString('base64'));
const req=(mod,token,id='1')=>handler(new Request(`https://test.invalid?modulo=${mod}&id=${id}`,{headers:token?{authorization:`Bearer ${token}`}:{}}));
for(const mod of ['crm','cliente360']){assert.equal((await req(mod)).status,401);assert.equal((await req(mod,'outro')).status,403);revogado=true;assert.equal((await req(mod,'vendas')).status,401);revogado=false;assert.equal((await req(mod,'vendas')).status,200);}
assert.equal((await req('cliente360','vendas','__proto__')).status,400);
const ficha=await(await req('cliente360','vendas')).json();assert.equal(ficha.cliente.id,'1');assert.equal(ficha.clientes,undefined);assert.equal(ficha.recebiveis,undefined);
assert.equal((await req('cliente360','vendas','2')).status,403);
const historico=await(await req('cliente360','vendas','3')).json();assert.equal(historico.cliente.id,'3');assert.equal(historico.cliente.cadastroCompleto,false);assert.equal(historico.cliente.telefone,undefined);assert.equal(historico.cliente.valorHistorico,10000);
assert.equal((await req('cliente360','vendas','4')).status,403);
falhaHistorico=true;const indisponivel=await req('cliente360','vendas');assert.equal(indisponivel.status,503);assert.equal((await indisponivel.json()).cliente,undefined);falhaHistorico=false;
falhaBanco=true;assert.equal((await req('crm','vendas')).status,503);falhaBanco=false;delete rows.crm_funil;assert.equal((await req('crm','vendas')).status,503);
console.log('CRM: normalização, privacidade, carga completa, vínculos, carteira histórica, login, permissões, revogação e falhas conferidos.');
// Ingestão: o token é o mesmo já usado pela carga; sem ele não há leitura nem escrita.
src=await readFile('supabase/functions/painel-cache/index.ts','utf8');src=src.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__crmDb;');
await import('data:text/javascript;base64,'+Buffer.from(await empacotar(src,'supabase/functions/painel-cache')).toString('base64'));
const gravar=(chave,valor,token='teste')=>handler(new Request('https://test.invalid',{method:'POST',headers:{'x-token':token},body:JSON.stringify({chave,valor})}));
assert.equal((await gravar('crm_funil',funil,'inválido')).status,401);
assert.equal((await gravar('crm_funil',{...funil,completo:false})).status,400);
assert.equal((await gravar('crm_clientes',{versao:1,completo:true,clientes:{}})).status,400);
rows.crm_funil={valor:funil};assert.equal((await gravar('crm_funil',{...funil,cards:[]})).status,409);
assert.equal((await gravar('crm_funil',funil)).status,200);
console.log('Ingestão CRM: token, snapshot completo e preservação da base preenchida conferidos.');
