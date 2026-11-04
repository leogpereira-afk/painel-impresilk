import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {atenderRotasLicitacoes} from '../supabase/functions/_shared/licitacoes-rotas-handler.mjs';
import {MUNICIPIOS} from '../supabase/functions/_shared/licitacoes-controle.mjs';
import {prepararRota,idRotaLicitacoes,ORIGEM_IMPRESILK,diaBrasiliaRota} from '../supabase/functions/_shared/licitacoes-rotas.mjs';

const empresa='73405710-78db-461b-9d33-37a228fd62c0',pessoa='63405710-78db-461b-9d33-37a228fd62c0',novoId='53405710-78db-461b-9d33-37a228fd62c0',portal='83405710-78db-461b-9d33-37a228fd62c0';
const linha=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const base=[linha('documentos_titulares',empresa,{tipo:'empresa',nome:'Empresa fictícia'}),linha('documentos_titulares',pessoa,{tipo:'pessoa',nome:'PESSOA-PRIVADA'}),linha('licitacoes_cadastros',portal,{titularId:empresa,nome:'Portal fictício',situacao:'ativo'})];
const ficha=(patch={})=>({municipio:'Salinas',distanciaKm:125.75,tempoMinutos:130,consultadoEm:'2026-01-01',fonteUrl:'https://example.com/rota-ficticia',observacao:'Medição fictícia para teste; não representa distância real.',...patch});
function banco(rows=[],options={}){
 const estado={linhas:structuredClone([...base,...rows]),escritas:[],consultas:[]};
 const sb={from(tabela){assert.equal(tabela,'painel_registros');let filtros=[],de=0,ate=Infinity;const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},range(a,b){de=a;ate=b;return q;},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]||null};},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(){estado.consultas.push(structuredClone(filtros));if(options.falhaLeitura)return {error:{message:'DETALHE-PRIVADO'},data:null};return {data:structuredClone(estado.linhas.filter(r=>filtros.every(([k,v])=>r[k]===v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(de,ate+1)),error:null};}return q;
 },async rpc(n,p){assert.equal(n,'painel_registro_gravar');if(options.antesRpc)await options.antesRpc(n,p,estado);const r=estado.linhas.find(r=>r.colecao===p.p_colecao&&r.id===p.p_id);if(JSON.stringify(r?.registro||null)!==JSON.stringify(p.p_anterior||null))return {data:null,error:{code:'40001',message:'DETALHE-PRIVADO'}};const reg=structuredClone(p.p_registro);if(r)r.registro=reg;else estado.linhas.push(linha(p.p_colecao,p.p_id,reg));estado.escritas.push(structuredClone(p));return {data:reg,error:null};}};
 return {sb,...estado};
}
function ambiente({perms=['licitacoes'],rows=[],options={},db=banco(rows,options),sessao=true,revogado=()=>false,jwt}={}){
 let handler;const source=readFileSync(new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{...acesso,atenderRotasLicitacoes,Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>db.sb,verificarJwt:jwt||async function(){return sessao?{sub:'operador-ficticio',nome:'Operador fictício',perms}:null;},crachaRevogado:revogado,crypto:webcrypto,Request,Response,URL,TextEncoder,console:{error(){}}});
 return {...db,async chamar(corpo,token=true){const r=await handler(new Request('https://test.invalid',{method:'POST',headers:token?{authorization:'Bearer teste'}:{},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}};
}
const gravar=(a,item=ficha(),versao)=>a.chamar({action:'salvarRotaLicitacoes',item,versao});

test('rotas: sessão e permissão antes de qualquer leitura ou gravação',async()=>{
 for(const a of [ambiente({sessao:false}),ambiente({perms:['documentos']}),ambiente({perms:[]})])for(const action of ['listarRotasLicitacoes','salvarRotaLicitacoes']){const r=await a.chamar({action,item:ficha()});assert.ok([401,403].includes(r.status));assert.equal(a.consultas.length,0);assert.equal(a.escritas.length,0);}
 assert.equal((await ambiente().chamar({action:'listarRotasLicitacoes'},false)).status,401);
});
test('rotas: revogação e JWT expirado bloqueiam escrita e resposta',async()=>{
 for(const bloqueio of [1,2]){let n=0;const a=ambiente({revogado:async(_sb,_s,_sessao,estrito)=>estrito&&++n===bloqueio}),r=await gravar(a);assert.equal(r.status,401);assert.equal(a.escritas.length,0);}
 let n=0;const a=ambiente({revogado:async(_sb,_s,_sessao,estrito)=>estrito&&++n===2});assert.equal((await a.chamar({action:'listarRotasLicitacoes'})).status,401);
 n=0;const b=ambiente({jwt:async()=>++n<3?{sub:'ficticio',perms:['licitacoes']}:null});assert.equal((await gravar(b)).status,401);assert.equal(b.escritas.length,0);
});
test('rotas: origem autoritativa, cadastro completo, ID estável e nenhuma consulta externa',async()=>{
 const a=ambiente(),r=await gravar(a);assert.equal(r.status,200);assert.equal(r.cache,'no-store');const {item}=r.body;assert.equal(item.id,await idRotaLicitacoes('Salinas'));assert.equal(item.origem,ORIGEM_IMPRESILK);assert.equal(item.distanciaKm,125.75);assert.equal(item.tempoMinutos,130);assert.equal(item.criadoPor,'Operador fictício');assert.equal(item.criadoEm,item.atualizadoEm);assert.equal(item.historico.length,1);assert.equal(item.historico[0].antes,null);assert.equal(a.escritas[0].p_colecao,'licitacoes_rotas');assert.ok(a.consultas.every(fs=>fs.some(([k,v])=>k==='colecao'&&v==='licitacoes_rotas')));
});
test('rotas: repetição e duas criações simultâneas não duplicam ou sobrescrevem',async()=>{
 const a=ambiente(),rs=await Promise.all([gravar(a),gravar(a,ficha({distanciaKm:130}))]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(a.escritas.length,1);assert.equal(a.linhas.filter(r=>r.colecao==='licitacoes_rotas').length,1);const antes=structuredClone(a.linhas);assert.equal((await gravar(a)).status,409);assert.deepEqual(a.linhas,antes);
});
test('rotas: edição exige versão e identidade do município; preserva histórico e campos exatos',async()=>{
 const a=ambiente(),first=(await gravar(a)).body.item,item=ficha({id:first.id,distanciaKm:127.85,tempoMinutos:140});assert.equal((await gravar(a,item)).status,409);
 assert.equal((await gravar(a,ficha({id:first.id,municipio:'Montes Claros'}),first.atualizadoEm)).status,409);
 assert.equal((await gravar(a,ficha({id:await idRotaLicitacoes('Montes Claros'),municipio:'Montes Claros'}),'v1')).status,409);
 const r=await gravar(a,item,first.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.item.distanciaKm,127.85);assert.equal(r.body.item.tempoMinutos,140);assert.equal(r.body.item.historico.length,2);assert.deepEqual(r.body.item.historico[0],first.historico[0]);assert.equal(r.body.item.criadoEm,first.criadoEm);assert.equal(r.body.item.historico[1].antes.distanciaKm,125.75);assert.equal(r.body.item.historico[1].depois.distanciaKm,127.85);assert.notEqual(r.body.item.atualizadoEm,first.atualizadoEm);
 assert.equal((await gravar(a,item,first.atualizadoEm)).status,409);
});
test('rotas: corrida entre leitura e RPC não sobrescreve vencedor',async()=>{
 let correr=false;const a=ambiente({options:{antesRpc(_n,p,db){if(correr)db.linhas.find(r=>r.id===p.p_id).registro.atualizadoEm='outra-versao';}}}),first=(await gravar(a)).body.item;correr=true;
 const r=await gravar(a,ficha({id:first.id,distanciaKm:200}),first.atualizadoEm);assert.equal(r.status,409);assert.equal(a.escritas.length,1);assert.equal(a.linhas.find(r=>r.id===first.id).registro.distanciaKm,125.75);
});
test('rotas: os 89 municípios geram IDs distintos; nomes não canônicos são recusados',async()=>{
 assert.equal(MUNICIPIOS.length,89);assert.equal(new Set(await Promise.all(MUNICIPIOS.map(idRotaLicitacoes))).size,89);
 for(const municipio of ['Belo Horizonte','salinas','',null,12])assert.equal((await gravar(ambiente(),ficha({municipio}))).status,422);
});
test('rotas: limites numéricos estritos, campos obrigatórios e metadados não editáveis',async()=>{
 for(const patch of [{distanciaKm:undefined},{distanciaKm:null},{distanciaKm:'100'},{distanciaKm:-0.01},{distanciaKm:3000.01},{tempoMinutos:undefined},{tempoMinutos:null},{tempoMinutos:'60'},{tempoMinutos:1.5},{tempoMinutos:-1},{tempoMinutos:4321},{consultadoEm:''},{consultadoEm:'2026-02-30'},{consultadoEm:'0000-01-01'},{consultadoEm:'2999-12-31'},{fonteUrl:''},{observacao:'a'.repeat(2001)},{id:'nome livre'},{novoId},{origem:'Outra sede'},{historico:[]},{criadoEm:'ontem'},{atualizadoPor:'Outro'}]){const a=ambiente(),r=await gravar(a,ficha(patch));assert.equal(r.status,422,JSON.stringify(patch));assert.equal(a.escritas.length,0);}
 for(const distanciaKm of [NaN,Infinity,-Infinity])assert.throws(()=>prepararRota(ficha({distanciaKm})),/quilômetros/);
 for(const [distanciaKm,tempoMinutos] of [[0,0],[3000,4320]])assert.equal((await gravar(ambiente(),ficha({distanciaKm,tempoMinutos}))).status,200);
});
test('rotas: data usa Brasília e não aceita dia futuro nem faltante',()=>{
 assert.equal(diaBrasiliaRota(new Date('2026-11-04T02:59:59Z')),'2026-11-03');assert.equal(diaBrasiliaRota(new Date('2026-11-04T03:00:00Z')),'2026-11-04');
 assert.throws(()=>prepararRota(ficha({consultadoEm:'2026-11-04'}),'2026-11-03'),/até hoje/);assert.equal(prepararRota(ficha({consultadoEm:'2026-11-03'}),'2026-11-03').consultadoEm,'2026-11-03');
});
test('rotas: fonte exige HTTP/HTTPS válida sem credenciais ou controles',async()=>{
 for(const fonteUrl of ['javascript:alert(1)','data:text/plain,oi','https://user:password@example.com','/relativo','https://example.com/\nsecreto','https://example.com/'+'x'.repeat(2000),'https:\\example.com'])assert.equal((await gravar(ambiente(),ficha({fonteUrl}))).status,422);
});
test('rotas: lista só origem atual, projeção fechada e falha de leitura não vira vazio',async()=>{
 const a=ambiente(),first=(await gravar(a)).body.item,row=a.linhas.find(r=>r.id===first.id);row.registro.segredo='SEGREDO';row.registro.historico[0].depois.segredo='PRIVADO';a.linhas.push(linha('licitacoes_rotas','anterior',{origem:'Sede antiga',municipio:'Salinas',distanciaKm:20}));
 const r=await a.chamar({action:'listarRotasLicitacoes'});assert.equal(r.body.itens.length,1);assert.doesNotMatch(JSON.stringify(r.body),/SEGREDO|PRIVADO|Sede antiga/);assert.equal(a.linhas.some(r=>r.id==='anterior'),true);
 const fail=await ambiente({options:{falhaLeitura:true}}).chamar({action:'listarRotasLicitacoes'});assert.equal(fail.status,500);assert.equal('itens' in fail.body,false);assert.doesNotMatch(JSON.stringify(fail.body),/DETALHE-PRIVADO/);
});
test('rotas: PostgreSQL local mantém CAS e impede retry duplicado',async()=>{
 const db=new PGlite();try{await db.exec('create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');await db.exec(readFileSync(new URL('../supabase/migrations/20260906_proteger_registro_retirado.sql',import.meta.url),'utf8'));
 const id=await idRotaLicitacoes('Salinas'),original={id,origem:ORIGEM_IMPRESILK,...ficha(),atualizadoEm:'v1'},novo={...original,distanciaKm:130,atualizadoEm:'v2'};await db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_rotas',id,original,null]);await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_rotas',id,novo,null]),e=>e.code==='40001');await db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_rotas',id,novo,original]);await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_rotas',id,original,original]),e=>e.code==='40001');assert.deepEqual((await db.query('select registro from painel_registros')).rows[0].registro,novo);
 }finally{await db.close();}
});
test('rotas: validação não muta entrada',()=>{const item=ficha(),antes=structuredClone(item);prepararRota(item);assert.deepEqual(item,antes);});
