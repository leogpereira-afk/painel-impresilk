import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-virada/index.ts',import.meta.url),'utf8')
 .replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n')
 .replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-virada/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
const master={sub:'pessoa4',nome:'Pessoa fictícia 4',master:true,perms:['*']};
const session=n=>({sub:'pessoa'+n,nome:'Pessoa fictícia '+n,perms:['virada']});
const jpg=Buffer.from([255,216,255,224,0,255,217]).toString('base64');
function setup(){
 let handler,auth=master,revoked=false,conflict=false,lost=false,network=false,brokenIdentity=false,ciclo=null;
 const files=new Map(),queries=[],rpcCalls=[],revocationFlags=[];
 const accounts=[1,2,3,4].map(n=>({id:'account'+n,usuario:'pessoa'+n,colaborador_id:'rh-'+n,ativo:true})),aliases=[];
 const rh={colaboradores:[1,2,3,4].map(n=>({id:'rh-'+n,nome:'Pessoa fictícia '+n,cargoId:'cargo',statusId:'ativo',saiu:null})),status:[{id:'ativo',ativo:'true'}],cargos:[{id:'cargo',nome:'Função fictícia'}]};
 const sb={from(tabela){
  let colecao,filters=[];
  const result=()=>({data:(tabela==='acesso_conta'?accounts:aliases).filter(x=>filters.every(([k,v])=>String(x[k]).toLowerCase()===String(v).toLowerCase())),...(brokenIdentity?{error:{message:'indisponível'}}:{})});
  const q={select(colunas){queries.push({tabela,colunas});return q;},eq(k,v){filters.push([k,v]);if(k==='colecao')colecao=v;return q;},ilike(k,v){filters.push([k,v.replace(/\\([\\%_])/g,'$1')]);return q;},limit(){return Promise.resolve(result());},order(){return q;},range(a,b){return Promise.resolve({data:structuredClone((rh[colecao]||[]).slice(a,b+1))});},maybeSingle(){return Promise.resolve(tabela==='virada_ciclos'?{data:ciclo?{id:ciclo.id,versao:ciclo.versao,registro:structuredClone(ciclo)}:null}:{data:result().data[0]||null});}};
  return q;
 },async rpc(name,p){
  rpcCalls.push({name,p:structuredClone(p)});
  if(network)throw new Error('transporte indisponível');
  if(conflict||ciclo&&ciclo.versao!==p.p_versao)return {error:{code:'40001'}};
  ciclo=structuredClone(p.p_registro);if(lost){lost=false;throw new Error('resposta perdida após commit');}return {};
 },storage:{from(bucket){assert.equal(bucket,'virada-evidencias');return {async upload(k,v){assert.ok(!files.has(k));files.set(k,v);return {};},async remove(keys){keys.forEach(k=>files.delete(k));return {};},async createSignedUrl(k,ttl){assert.equal(ttl,300);if(!files.has(k))return {error:{code:'404'}};return {data:{signedUrl:'https://private.example/'+k}};}};}}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>auth,crachaRevogado:async(_sb,_sys,_s,strict)=>{revocationFlags.push(strict);return revoked;},Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,crypto,atob,Uint8Array,DataView,TextEncoder,TextDecoder,structuredClone,console:{error(){}}});
 const call=async(body,opts={})=>{const response=await handler(new Request('http://test.local',{method:opts.method||'POST',headers:opts.noAuth?{}:{authorization:'Bearer test'},body:opts.raw!==undefined?opts.raw:JSON.stringify(body)}));return {status:response.status,...await response.json()};};
 return {call,files,queries,rpcCalls,revocationFlags,accounts,aliases,rh,get ciclo(){return ciclo;},session:s=>auth=s,revoke:()=>revoked=true,conflict:()=>conflict=true,lose:()=>lost=true,network:()=>network=true,breakIdentity:()=>brokenIdentity=true};
}
async function create(t){return t.call({action:'salvarCiclo',versao:0,item:{nome:'Ciclo de teste',inicio:'2026-01-01',participantes:[{rhId:'rh-1',nome:'Forjado',mentorId:'rh-2'},{rhId:'rh-2'},{rhId:'rh-3'},{rhId:'rh-4'}]}});}
const mutate=(t,b)=>t.call({idCiclo:t.ciclo.id,versao:t.ciclo.versao,...b});
async function mission(t,n=0){const r=await mutate(t,{action:'salvarMissao',item:{participanteId:t.ciclo.participantes[n].id,titulo:'Conferência fictícia',objetivo:'Melhorar processo',tipo:'melhoria',fase:30,prazo:'2026-01-20'}});assert.equal(r.status,200);return t.ciclo.missoes.at(-1);}
async function evidence(t,m){const r=await mutate(t,{action:'evidencia',missaoId:m.id,texto:'Relato privado',resultado:'Resultado privado'});assert.equal(r.status,200);return t.ciclo.missoes.find(x=>x.id===m.id).evidencias.at(-1);}
const upload=(t,m,e)=>mutate(t,{action:'anexar',missaoId:m.id,evidenciaId:e.id,nome:'foto.jpg',mime:'image/jpeg',base64:jpg});
test('Edge exige sessão, módulo e revogação estrita; sem ciclo retorna null',async()=>{
 const t=setup();assert.equal((await t.call({action:'listar'},{noAuth:true})).status,401);
 t.session({...session(1),perms:['agenda']});assert.equal((await t.call({action:'listar'})).status,403);
 t.session(session(1));const empty=await t.call({action:'listar'});assert.equal(empty.status,200);assert.equal(empty.ciclo,null);
 t.revoke();assert.equal((await t.call({action:'listar'})).status,401);assert.ok(t.revocationFlags.every(Boolean));
});
test('diretório e configuração são só direção, dados mínimos e nome vem do RH',async()=>{
 const t=setup();t.session({...session(1),perms:['*']});assert.equal((await t.call({action:'pessoas'})).status,403);assert.equal((await create(t)).status,403);
 t.session(master);const people=await t.call({action:'pessoas'});assert.equal(people.pessoas.length,4);assert.deepEqual(Object.keys(people.pessoas[0]).sort(),['funcao','id','nome']);
 assert.equal((await create(t)).status,200);assert.equal(t.ciclo.participantes[0].nome,'Pessoa fictícia 1');
 assert.ok(t.queries.every(q=>!q.colunas.includes('cpf')&&!q.colunas.includes('salario')&&q.colunas!=='*'));
});
test('isolamento real entre participante, mentor, direção e curinga, incluindo fotos',async()=>{
 const t=setup();await create(t);const m=await mission(t),e=await evidence(t,m);assert.equal((await upload(t,m,e)).status,200);const file=t.ciclo.missoes[0].evidencias[0].fotos[0];
 t.session(session(1));const own=await t.call({action:'listar'});assert.equal(own.ciclo.missoes.length,1);assert.equal(own.ciclo.missoes[0].evidencias[0].fotos[0].chave,undefined);
 assert.equal((await t.call({action:'foto',idCiclo:t.ciclo.id,missaoId:m.id,arquivoId:file.id})).status,200);
 t.session(session(2));assert.equal((await t.call({action:'listar'})).ciclo.missoes.length,1);
 t.session({...session(3),perms:['*']});assert.equal((await t.call({action:'listar'})).ciclo.missoes.length,0);
 assert.equal((await t.call({action:'foto',idCiclo:t.ciclo.id,missaoId:m.id,arquivoId:file.id})).status,404);
 assert.equal((await mutate(t,{action:'comentar',missaoId:m.id,texto:'Não permitido'})).status,404);
 t.session({...session(8),nome:'Pessoa fictícia 1'});assert.equal((await t.call({action:'listar'})).status,403);
});
test('fluxo completo valida só com outra pessoa, reabre e restaura XP sem duplicação',async()=>{
 const t=setup();await create(t);const m=await mission(t);t.session(session(1));await evidence(t,m);assert.equal((await mutate(t,{action:'estado',missaoId:m.id,status:'em_validacao'})).status,200);
 assert.equal((await mutate(t,{action:'validar',missaoId:m.id,parecer:'Auto'})).status,403);
 t.session(session(2));let r=await mutate(t,{action:'validar',missaoId:m.id,parecer:'Conferido'});assert.equal(r.ciclo.missoes[0].xp,10);
 const version=t.ciclo.versao;assert.equal((await mutate(t,{action:'validar',missaoId:m.id,parecer:'Repetido'})).status,409);assert.equal(t.ciclo.versao,version);
 r=await mutate(t,{action:'reabrir',missaoId:m.id,motivo:'Nova conferência'});assert.equal(r.ciclo.missoes[0].xp,0);
 await mutate(t,{action:'estado',missaoId:m.id,status:'em_validacao'});r=await mutate(t,{action:'validar',missaoId:m.id,parecer:'Conferido novamente'});assert.equal(r.ciclo.missoes[0].xp,10);
});
test('fotos com assinatura inválida e quinta foto são recusadas sem upload',async()=>{
 const t=setup();await create(t);const m=await mission(t),e=await evidence(t,m);
 assert.equal((await mutate(t,{action:'anexar',missaoId:m.id,evidenciaId:e.id,nome:'foto.png',mime:'image/png',base64:jpg})).status,422);assert.equal(t.files.size,0);
 for(let i=0;i<4;i++)assert.equal((await upload(t,m,e)).status,200);
 assert.equal((await upload(t,m,e)).status,422);assert.equal(t.files.size,4);
});
test('CAS rejeitado remove upload órfão e preserva evidências anteriores',async()=>{
 const t=setup();await create(t);const m=await mission(t),e=await evidence(t,m);t.conflict();assert.equal((await upload(t,m,e)).status,409);assert.equal(t.files.size,0);assert.equal(t.ciclo.missoes[0].evidencias[0].fotos.length,0);
});
test('resposta perdida depois do commit reconfirma e nunca apaga foto referenciada',async()=>{
 const t=setup();await create(t);const m=await mission(t),e=await evidence(t,m);t.lose();const r=await upload(t,m,e);
 assert.equal(r.status,200);assert.equal(t.files.size,1);assert.equal(t.ciclo.missoes[0].evidencias[0].fotos.length,1);
});
test('erro de transporte sem resultado certo preserva arquivo privado para reconciliação',async()=>{
 const t=setup();await create(t);const m=await mission(t),e=await evidence(t,m);t.network();assert.equal((await upload(t,m,e)).status,500);assert.equal(t.files.size,1);assert.equal(t.ciclo.missoes[0].evidencias[0].fotos.length,0);
});
test('mural compartilha resumo e foto selecionada, sem abrir PDI ou feedback',async()=>{
 const t=setup();await create(t);const m=await mission(t),e=await evidence(t,m);await upload(t,m,e);await mutate(t,{action:'comentar',missaoId:m.id,texto:'Feedback privado'});
 await mutate(t,{action:'publicar',missaoId:m.id,titulo:'Resumo de processo',texto:'Aprendizado da equipe',evidenciaIds:[e.id]});
 t.session(session(3));const r=await t.call({action:'listar'});assert.equal(r.ciclo.missoes.length,0);const post=r.ciclo.mural[0];
 for(const secret of ['Relato privado','Resultado privado','Feedback privado','origemMissaoId','virada/'])assert.ok(!JSON.stringify(r).includes(secret));
 assert.equal((await t.call({action:'foto',idCiclo:t.ciclo.id,postId:post.id,arquivoId:post.fotos[0].id})).status,200);
 assert.equal((await mutate(t,{action:'comentar',postId:post.id,texto:'Aprendizado útil'})).status,200);
});
test('vínculo ambíguo/inativo e erro de identidade não ganham acesso por nome',async()=>{
 for(const change of [t=>t.accounts[0].ativo=false,t=>t.accounts.push({...t.accounts[0],id:'duplicado'}),t=>t.aliases.push({conta_id:'outra',ativo:true,login:'pessoa1',sistema:'painel'})]){
  const t=setup();await create(t);await mission(t);change(t);t.session(session(1));assert.equal((await t.call({action:'listar'})).status,403);
 }
 const t=setup();await create(t);t.breakIdentity();assert.equal((await t.call({action:'listar'})).status,503);
});
test('versão antiga, corpo inválido e ação desconhecida são recusados sem gravação',async()=>{
 const t=setup();await create(t);const m=await mission(t);const count=t.rpcCalls.length;
 assert.equal((await t.call({action:'estado',idCiclo:t.ciclo.id,versao:0,missaoId:m.id,status:'em_andamento'})).status,409);
 assert.equal((await t.call(null)).status,400);assert.equal((await t.call(null,{raw:'{'})).status,400);assert.equal((await t.call({action:'inventada'})).status,400);assert.equal(t.rpcCalls.length,count);
});

const pdf=Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n').toString('base64');
const sendPdi=(t,n=0,extra={})=>mutate(t,{action:'anexarPdi',participanteId:t.ciclo.participantes[n].id,nome:'plano-ficticio.pdf',mime:'application/pdf',base64:pdf,...extra});
test('PDF reservado: direção publica; titular e mentor baixam; outro e curinga não',async()=>{
 const t=setup();await create(t);assert.equal((await sendPdi(t)).status,200);const d=t.ciclo.participantes[0].documentos[0];assert.equal(d.sha256.length,64);
 const pedido={action:'documentoPdi',idCiclo:t.ciclo.id,participanteId:t.ciclo.participantes[0].id,arquivoId:d.id};
 for(const n of [1,2]){t.session(session(n));const r=await t.call({action:'listar'});assert.equal(r.ciclo.participantes.find(p=>p.id===pedido.participanteId).documentos[0].chave,undefined);assert.equal((await t.call(pedido)).status,200);assert.equal((await sendPdi(t)).status,403);}
 t.session({...session(3),perms:['*']});assert.equal((await t.call(pedido)).status,404);assert.ok(!JSON.stringify(await t.call({action:'listar'})).includes(d.id));
});
test('PDI do mentor não vaza para participante que só vê o nome do acompanhador',async()=>{
 const t=setup();await create(t);await sendPdi(t,1);const id=t.ciclo.participantes[1].documentos[0].id;t.session(session(1));const r=await t.call({action:'listar'});assert.ok(r.ciclo.participantes.some(p=>p.id===t.ciclo.participantes[1].id));assert.ok(!JSON.stringify(r).includes(id));
});
test('PDF invalido não sobe; nova versão e reconfiguração preservam documentos e funções',async()=>{
 const t=setup();await create(t);assert.equal((await sendPdi(t,0,{base64:jpg})).status,422);assert.equal(t.files.size,0);
 await sendPdi(t);await sendPdi(t);assert.equal(t.ciclo.participantes[0].documentos.length,2);assert.equal(t.files.size,2);
 const ps=t.ciclo.participantes.map(p=>({...p,funcao:'Função do programa'}));assert.equal((await mutate(t,{action:'salvarCiclo',item:{nome:t.ciclo.nome,participantes:ps}})).status,200);assert.equal(t.ciclo.participantes[0].documentos.length,2);assert.equal(t.ciclo.participantes[0].funcao,'Função do programa');
 assert.equal((await mutate(t,{action:'salvarCiclo',item:{nome:t.ciclo.nome,participantes:ps.slice(1)}})).status,422);
});
test('PDF concorrente rejeitado limpa órfão; confirmação perdida mantém PDF referenciado',async()=>{
 const t=setup();await create(t);t.conflict();assert.equal((await sendPdi(t)).status,409);assert.equal(t.files.size,0);
 const u=setup();await create(u);u.lose();assert.equal((await sendPdi(u)).status,200);assert.equal(u.files.size,1);assert.equal(u.ciclo.participantes[0].documentos.length,1);
});

test('direção fora da contagem de empregados participa; inativos e desligados não entram',async()=>{
 const t=setup();t.rh.status.push({id:'direcao',ativo:'false'},{id:'inativo',ativo:'false'});
 t.rh.colaboradores[3].statusId='direcao';t.rh.colaboradores[2].statusId='inativo';t.rh.colaboradores[1].saiu='2026-01-01';
 const r=await t.call({action:'pessoas'});assert.equal(r.status,200);assert.deepEqual(r.pessoas.map(x=>x.id),['rh-1','rh-4']);
 const salvo=await t.call({action:'salvarCiclo',versao:0,item:{nome:'Ciclo fictício',participantes:[{rhId:'rh-1',mentorId:'rh-4'},{rhId:'rh-4',mentorId:'rh-1'}]}});assert.equal(salvo.status,200);
});
