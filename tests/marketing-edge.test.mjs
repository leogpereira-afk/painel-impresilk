// A porta painel-marketing, executada de verdade (esbuild + vm), com banco de
// mentira. Confere quem entra, o que chega no banco e o que volta para a tela.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-marketing/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-marketing/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
const ID='7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function setup(){
 let handler,session={sub:'ana',nome:'Ana',perms:['marketing']},revoked=false;const chamadas=[];let rpcErro=null;
 const db={
  painel_mkt_acoes:[{id:ID,nome:'Reel',canal_texto:'Instagram',responsavel_texto:'Ana',prazo:'2026-10-20',situacao:'Ideia',investimento:'0',versao:2,retirada_em:null,legado_id:null},{id:'aaaaaaaa-1c2d-4e5f-8a9b-0c1d2e3f4a5b',nome:'Retirada',prazo:'2026-10-01',situacao:'Ideia',investimento:'0',versao:1,retirada_em:'2026-10-02',legado_id:null}],
  painel_mkt_orcamento_vinculo:[{orcamento_id:'123',acao_id:ID}],
  painel_registros:[{colecao:'marketing',id:'mkt-velha',registro:{tipo:'acao',nome:'Antiga'}},{colecao:'marketing',id:'ml-1',registro:{nome:'Drive',url:'https://x.com'}}],
 };
 const sb={from(table){let rows=(db[table]||[]).map(r=>structuredClone(r));const q={select(){return q},eq(k,v){rows=rows.filter(x=>(k==='registro->>tipo'?x.registro?.tipo:x[k])===v);return q},is(k,v){rows=rows.filter(x=>(x[k]??null)===v);return q},not(k,op,v){rows=rows.filter(x=>(x[k]??null)!==v);return q},order(){return q},range(a,b){return Promise.resolve({data:rows.slice(a,b+1)})}};return q},
  async rpc(n,p){chamadas.push({n,p});if(rpcErro)return {error:rpcErro};if(n==='painel_mkt_salvar_acao')return {data:{id:p.p_id||'bbbbbbbb-1c2d-4e5f-8a9b-0c1d2e3f4a5b',...p.p_dados,versao:(p.p_versao||0)+1,orcamentos:p.p_orcamentos}};if(n==='painel_mkt_migrar_legado')return {data:{total:1,migradas:1,vinculos:0}};return {data:{}};}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>session,crachaRevogado:async()=>revoked,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,crypto,console});
 return {db,chamadas,session:s=>session=s,revoke:()=>revoked=true,erro:e=>rpcErro=e,async call(body={},auth=true){const r=await handler(new Request('http://local',{method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:JSON.stringify(body)}));return {status:r.status,...await r.json()}}};
}

test('porta: sem crachá 401, crachá revogado 401, sem o módulo 403', async()=>{
 const t=setup();assert.equal((await t.call({action:'acoes'},false)).status,401);
 t.session({sub:'x',perms:['orcamentos']});assert.equal((await t.call({action:'acoes'})).status,403);
 t.session({sub:'x',perms:['marketing']});t.revoke();assert.equal((await t.call({action:'acoes'})).status,401);
 assert.equal(t.chamadas.length,0);
});

test('lista só as ações não retiradas, com os orçamentos, e conta as antigas pendentes', async()=>{
 const t=setup(),r=await t.call({action:'acoes'});
 assert.equal(r.status,200);assert.equal(r.acoes.length,1);assert.equal(r.acoes[0].nome,'Reel');
 assert.deepEqual(r.acoes[0].orcamentos,['123']);assert.equal(r.acoes[0].canal,'Instagram');
 assert.equal(r.legado.pendentes,1);assert.equal(r.podeMigrar,false);
 t.db.painel_mkt_acoes.push({id:'cccccccc-1c2d-4e5f-8a9b-0c1d2e3f4a5b',nome:'Migrada',prazo:'2026-10-01',situacao:'Ideia',investimento:0,versao:1,retirada_em:null,legado_id:'mkt-velha'});
 assert.equal((await t.call({action:'acoes'})).legado.pendentes,0);
});

test('salvar: campos conferidos ANTES do banco; edição exige versão', async()=>{
 const t=setup();
 assert.equal((await t.call({action:'salvarAcao',acao:{nome:'',responsavel:'Ana',prazo:'2026-10-20'}})).status,422);
 assert.equal((await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'}})).status,409);
 assert.equal((await t.call({action:'salvarAcao',acao:{id:'mkt-1',nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'},versao:1})).status,400);
 assert.equal(t.chamadas.length,0);
 const r=await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavel:'Ana',prazo:'2026-10-20',orcamentos:['9','1','9'],investimento:10},versao:2});
 assert.equal(r.status,200);const c=t.chamadas[0];
 assert.equal(c.n,'painel_mkt_salvar_acao');assert.equal(c.p.p_id,ID);assert.equal(c.p.p_versao,2);assert.equal(c.p.p_quem,'ana');
 assert.deepEqual([...c.p.p_orcamentos],['1','9']);assert.equal(c.p.p_dados.responsavel_texto,'Ana');assert.equal(r.acao.versao,3);
});

test('nova ação vai sem id e sem versão (o banco gera o UUID)', async()=>{
 const t=setup(),r=await t.call({action:'salvarAcao',acao:{nome:'Outdoor',responsavel:'Bia',prazo:'2026-11-01'}});
 assert.equal(r.status,200);assert.equal(t.chamadas[0].p.p_id,null);assert.equal(t.chamadas[0].p.p_versao,null);
});

test('ação nova com o id da tela vai como criação (novo), sem versão', async()=>{
 const t=setup(),r=await t.call({action:'salvarAcao',novo:true,acao:{id:ID,nome:'Outdoor',responsavel:'Bia',prazo:'2026-11-01'}});
 assert.equal(r.status,200);assert.equal(t.chamadas[0].p.p_id,ID);assert.equal(t.chamadas[0].p.p_versao,null);
});

test('o caso ruim: orçamento de outra ação volta como 409 com o nome dela', async()=>{
 const t=setup();t.erro({code:'23505',message:'Orçamento já vinculado',details:JSON.stringify({orcamento:'123',acao:'Outdoor Fenics'})});
 const r=await t.call({action:'salvarAcao',acao:{nome:'Reel',responsavel:'Ana',prazo:'2026-10-20',orcamentos:['123']}});
 assert.equal(r.status,409);assert.match(r.erro,/123.*Outdoor Fenics/);
 t.erro({code:'40001',message:'Conflito de versão'});
 assert.equal((await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'},versao:1})).status,409);
 t.erro({code:'XX000',message:'falha interna com dado sensível'});
 const r500=await t.call({action:'salvarAcao',acao:{nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'}});
 assert.equal(r500.status,500);assert.equal(r500.erro.includes('sensível'),false);
});

test('retirar exige id válido e versão; migrar é só da direção', async()=>{
 const t=setup();
 assert.equal((await t.call({action:'retirarAcao',id:ID})).status,409);
 assert.equal((await t.call({action:'retirarAcao',id:ID,versao:2})).status,200);
 assert.equal(t.chamadas.at(-1).n,'painel_mkt_retirar_acao');
 assert.equal((await t.call({action:'migrarLegado'})).status,403);
 t.session({sub:'leo',master:true});const r=await t.call({action:'migrarLegado'});
 assert.equal(r.status,200);assert.equal(r.resultado.migradas,1);
 assert.equal((await t.call({action:'apagarTudo'})).status,400);
});
