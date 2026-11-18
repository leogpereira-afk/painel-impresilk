import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-planejamento/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-planejamento/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
const master={sub:'gestor',master:true,nome:'Gestor Exemplo',perms:['calendario-empresa']};
const reader=(n=1)=>({sub:'pessoa'+n,nome:'Pessoa Exemplo '+n,perms:['calendario-empresa']});
const base=(extra={})=>({id:'acao-demo',versao:0,ano:2027,mes:1,titulo:'Ação fictícia',categoria:'saude',periodo:'mes',responsaveis:[],previstoCentavos:null,realizadoCentavos:null,situacao:'aberta',etapas:[],...extra});
function setup(){
 let handler,auth=master,revoked=false,conflict=false,lost=false,brokenRH=false,brokenIdentity=false;
 const registros=new Map(),files=new Map(),queries=[],flags=[],rpcs=[];
 const accounts=[{id:'conta-g',usuario:'gestor',colaborador_id:'rh-g',ativo:true},...[1,2,3].map(n=>({id:'conta-'+n,usuario:'pessoa'+n,colaborador_id:'rh-'+n,ativo:true}))];
 const rh={colaboradores:[1,2,3].map(n=>({id:'rh-'+n,idPessoa:'00000'+n,nome:'Pessoa Exemplo '+n,areaId:'a',statusId:'ativo',saiu:null,idPessoaBloqueado:false})),status:[{id:'ativo',ativo:'true'}],areas:[{id:'a',nome:'Equipe Exemplo'}]};
 const sb={from(tabela){
  const filters=[];let colunas='';const q={select(c){colunas=c;queries.push({tabela,colunas:c});return q;},eq(k,v){filters.push([k,v]);return q;},ilike(k,v){filters.push([k,v.replace(/\\([\\%_])/g,'$1')]);return q;},order(){return q;},
   async limit(){if(brokenIdentity)return {error:{message:'falhou'}};return {data:(tabela==='acesso_conta'?accounts:[]).filter(x=>filters.every(([k,v])=>String(x[k]).toLowerCase()===String(v).toLowerCase()))};},
   async range(a,b){const c=filters.find(([k])=>k==='colecao')?.[1];if(tabela==='registros')return brokenRH?{error:{message:'falhou'}}:{data:structuredClone((rh[c]||[]).slice(a,b+1))};return {data:[...registros.entries()].filter(([k])=>k.startsWith(c+':')).map(([k,r])=>({id:k.slice(c.length+1),registro:structuredClone(r)})).slice(a,b+1)};},
   async maybeSingle(){if(tabela==='painel_registros'){const c=filters.find(([k])=>k==='colecao')?.[1],id=filters.find(([k])=>k==='id')?.[1],r=registros.get(c+':'+id);return {data:r?{registro:structuredClone(r)}:null};}if(brokenIdentity)return {error:{message:'falhou'}};return {data:accounts.find(x=>filters.every(([k,v])=>x[k]===v))||null};}
  };return q;
 },async rpc(name,p){rpcs.push({name,p:structuredClone(p)});
  if(name==='painel_registro_gravar'){if(conflict)return {error:{code:'40001'}};const key=p.p_colecao+':'+p.p_id,antes=registros.get(key)||null;if(JSON.stringify(antes)!==JSON.stringify(p.p_anterior))return {error:{code:'40001'}};registros.set(key,structuredClone(p.p_registro));if(lost){lost=false;throw Error('resposta perdida');}return {data:p.p_registro};}
  if(name==='painel_planejamento_importar'){const itens=p.p_itens.map(x=>x.registro);for(const x of itens)registros.set('planejamento_anual:'+x.id,structuredClone(x));registros.set('planejamento_importacoes:'+p.p_lote_id,{hash:p.p_hash,itens});return {data:itens};}throw Error('rpc inesperada');
 },storage:{from(bucket){assert.equal(bucket,'painel-arquivos');return {async upload(k,bytes){assert.ok(!files.has(k));files.set(k,bytes);return {};},async remove(keys){keys.forEach(k=>files.delete(k));return {};},async createSignedUrl(k,ttl,opts){assert.equal(ttl,300);assert.ok(opts.download);return files.has(k)?{data:{signedUrl:'https://private.example/'+k}}:{error:{code:'404'}};}};}}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>auth,crachaRevogado:async(_s,_m,_u,strict)=>{flags.push(strict);return revoked;},Deno:{env:{get:()=> 'test'},serve:f=>handler=f},Response,Request,crypto,atob,Uint8Array,TextEncoder,TextDecoder,console:{error(){}}});
 const call=async(body,opts={})=>{const method=opts.method||'POST',r=await handler(new Request('https://test.invalid',{method,headers:opts.noAuth?{}:{authorization:'Bearer test'},...(['GET','HEAD'].includes(method)?{}:{body:opts.raw??JSON.stringify(body)})}));return {status:r.status,...await r.json()};};
 return {call,files,queries,rpcs,flags,rh,get item(){return registros.get('planejamento_anual:acao-demo');},registros,session:s=>auth=s,revoke:()=>revoked=true,conflict:()=>conflict=true,lose:()=>lost=true,breakRH:()=>brokenRH=true,breakIdentity:()=>brokenIdentity=true};
}
const pessoa=n=>({rhId:'rh-'+n,idPessoa:'00000'+n,nome:'Adulterado',setor:'Não confiável'});
const create=(t,extra={})=>t.call({action:'salvar',item:base(extra)});
const mutate=(t,b)=>t.call({id:t.item.id,versao:t.item.versao,...b});
const upload=t=>mutate(t,{action:'anexar',nome:'teste.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4\nDocumento fictício\n%%EOF').toString('base64'),descricao:'Anexo fictício'});
test('porta exige sessão, módulo e revogação estrita; método e JSON inválidos são recusados',async()=>{
 const t=setup();assert.equal((await t.call({action:'listar',ano:2027},{noAuth:true})).status,401);t.session({...reader(),perms:[]});assert.equal((await t.call({action:'listar',ano:2027})).status,403);t.session(master);assert.equal((await t.call(null,{raw:'{'})).status,400);assert.equal((await t.call(null,{method:'GET'})).status,405);t.revoke();assert.equal((await create(t)).status,401);assert.ok(t.flags.every(Boolean));assert.equal(t.registros.size,0);
});
test('diretório entrega só identidade mínima e grava nome oficial pelo RH',async()=>{
 const t=setup();const d=await t.call({action:'pessoas'});assert.equal(d.status,200);assert.deepEqual(Object.keys(d.pessoas[0]).sort(),['disponivel','idPessoa','nome','rhId','setor']);assert.ok(t.queries.every(q=>!q.colunas.includes('cpf')&&!q.colunas.includes('salario')&&q.colunas!=='*'));
 const r=await create(t,{responsaveis:[pessoa(1)]});assert.equal(r.status,200);assert.equal(r.item.responsaveis[0].nome,'Pessoa Exemplo 1');assert.equal(r.item.responsaveis[0].idPessoa,'000001');
});
test('leitor consulta, mas não cria nem modifica; responsável atualiza sem ampliar acesso',async()=>{
 const t=setup();await create(t,{responsaveis:[pessoa(1)]});t.session(reader(2));assert.equal((await t.call({action:'listar',ano:2027})).itens.length,1);assert.equal((await create(t,{id:'novo'})).status,403);assert.equal((await mutate(t,{action:'comentar',texto:'forjado'})).status,403);assert.equal((await upload(t)).status,403);
 t.session(reader(1));const r=await t.call({action:'salvar',item:{...t.item,situacao:'execucao'}});assert.equal(r.status,200);assert.equal((await t.call({action:'salvar',item:{...t.item,previstoCentavos:100}})).status,403);assert.equal((await mutate(t,{action:'comentar',texto:'Iniciamos'})).status,200);assert.equal(t.item.comentarios[0].por,'pessoa1');
});
test('falha RH/identidade nunca vira diretório vazio nem permissão ampliada',async()=>{
 const a=setup();a.breakRH();assert.equal((await a.call({action:'pessoas'})).status,503);assert.equal((await create(a,{responsaveis:[pessoa(1)]})).status,503);assert.equal(a.rpcs.length,0);
 const b=setup();b.breakIdentity();assert.equal((await create(b)).status,503);assert.equal(b.rpcs.length,0);
});
test('arquivo valida tipo, fornece URL curta, e remoção preserva bytes/histórico',async()=>{
 const t=setup();await create(t);assert.equal((await mutate(t,{action:'anexar',nome:'x.pdf',mime:'application/pdf',base64:Buffer.from('conteúdo inválido').toString('base64')})).status,422);assert.equal(t.files.size,0);
 assert.equal((await upload(t)).status,200);const arq=t.item.anexos[0];assert.equal((await mutate(t,{action:'arquivo',arquivoId:arq.id})).status,200);assert.equal((await mutate(t,{action:'removerAnexo',arquivoId:arq.id})).status,200);assert.ok(t.item.anexos[0].removidoEm);assert.equal(t.files.size,1);assert.equal(t.item.historico.length,3);
});
test('conflito limpa upload não salvo; resposta perdida não apaga arquivo já registrado',async()=>{
 const a=setup();await create(a);a.conflict();assert.equal((await upload(a)).status,409);assert.equal(a.files.size,0);assert.equal(a.item.anexos.length,0);
 const b=setup();await create(b);b.lose();assert.equal((await upload(b)).status,200);assert.equal(b.files.size,1);assert.equal(b.item.anexos.length,1);
});
test('importação repete o mesmo lote sem duplicar e preserva execução na atualização',async()=>{
 const t=setup(),item=base({origem:{chave:'plan-demo',campos:{titulo:'Ação fictícia'}},responsaveis:[]});const b={action:'importar',loteId:'lote-demo',itens:[{item,versao:0}]};assert.equal((await t.call(b)).status,200);assert.equal((await t.call(b)).status,200);assert.equal(t.rpcs.filter(r=>r.name==='painel_planejamento_importar').length,1);
 await t.call({action:'salvar',item:{...t.item,previstoCentavos:35000,responsaveis:[pessoa(1)],situacao:'execucao'}});
 const r=await t.call({action:'importar',loteId:'lote-demo2',itens:[{item:{...item,titulo:'Revisada'},versao:t.item.versao}]});assert.equal(r.status,200);assert.equal(t.item.previstoCentavos,35000);assert.equal(t.item.responsaveis.length,1);assert.equal(t.item.situacao,'execucao');assert.equal(t.item.titulo,'Revisada');
 assert.equal((await t.call({...b,itens:[]})).status,409);
});
