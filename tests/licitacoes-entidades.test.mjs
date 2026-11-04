import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {atenderEntidadesLicitacoes} from '../supabase/functions/_shared/licitacoes-entidades-handler.mjs';
import {MUNICIPIOS} from '../supabase/functions/_shared/licitacoes-controle.mjs';
import {prepararEntidade} from '../supabase/functions/_shared/licitacoes-entidades.mjs';

const empresa='73405710-78db-461b-9d33-37a228fd62c0',pessoa='63405710-78db-461b-9d33-37a228fd62c0',novoId='53405710-78db-461b-9d33-37a228fd62c0',portal='83405710-78db-461b-9d33-37a228fd62c0';
const linha=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const base=[linha('documentos_titulares',empresa,{tipo:'empresa',nome:'Empresa fictícia'}),linha('documentos_titulares',pessoa,{tipo:'pessoa',nome:'PESSOA-PRIVADA'}),linha('licitacoes_cadastros',portal,{titularId:empresa,nome:'Portal fictício',situacao:'ativo'})];
const ficha=(patch={})=>({novoId,nome:'Organização fictícia',tipo:'orgao',municipios:['Montes Claros'],...patch});
function banco(rows=[],options={}){
 const estado={linhas:structuredClone([...base,...rows]),escritas:[],consultas:[]};
 const sb={from(tabela){assert.equal(tabela,'painel_registros');let filtros=[],de=0,ate=Infinity;const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},range(a,b){de=a;ate=b;return q;},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]||null};},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(){estado.consultas.push(structuredClone(filtros));if(options.falhaLeitura)return {error:{message:'DETALHE-PRIVADO'},data:null};return {data:structuredClone(estado.linhas.filter(r=>filtros.every(([k,v])=>r[k]===v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(de,ate+1)),error:null};}return q;
 },async rpc(n,p){assert.equal(n,'painel_registro_gravar');if(options.antesRpc)await options.antesRpc(n,p,estado);const r=estado.linhas.find(r=>r.colecao===p.p_colecao&&r.id===p.p_id);if(JSON.stringify(r?.registro||null)!==JSON.stringify(p.p_anterior||null))return {data:null,error:{code:'40001',message:'DETALHE-PRIVADO'}};const reg=structuredClone(p.p_registro);if(r)r.registro=reg;else estado.linhas.push(linha(p.p_colecao,p.p_id,reg));estado.escritas.push(structuredClone(p));return {data:reg,error:null};}};
 return {sb,...estado};
}
function ambiente({perms=['licitacoes'],rows=[],options={},db=banco(rows,options),sessao=true,revogado=()=>false,jwt}={}){
 let handler;const source=readFileSync(new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{...acesso,atenderEntidadesLicitacoes,Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>db.sb,verificarJwt:jwt||async function(){return sessao?{sub:'operador-ficticio',nome:'Operador fictício',perms}:null;},crachaRevogado:revogado,crypto:webcrypto,Request,Response,URL,TextEncoder,console:{error(){}}});
 return {...db,async chamar(corpo,token=true){const r=await handler(new Request('https://test.invalid',{method:'POST',headers:token?{authorization:'Bearer teste'}:{},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}};
}
const gravar=(a,item=ficha(),versao)=>a.chamar({action:'salvarEntidadeLicitacoes',item,versao});

test('entidades: sessão e permissão antes de qualquer leitura ou gravação',async()=>{
 for(const a of [ambiente({sessao:false}),ambiente({perms:['documentos']}),ambiente({perms:[]})])for(const action of ['listarEntidadesLicitacoes','salvarEntidadeLicitacoes','arquivarEntidadeLicitacoes']){const r=await a.chamar({action,item:ficha(),id:novoId});assert.ok([401,403].includes(r.status));assert.equal(a.consultas.length,0);assert.equal(a.escritas.length,0);}
 assert.equal((await ambiente().chamar({action:'listarEntidadesLicitacoes'},false)).status,401);
});
test('entidades: revogação e JWT expirado bloqueiam escrita e resposta',async()=>{
 for(const bloqueio of [1,2]){let n=0;const a=ambiente({revogado:async(_sb,_s,_sessao,estrito)=>estrito&&++n===bloqueio}),r=await gravar(a);assert.equal(r.status,401);assert.equal(a.escritas.length,0);}
 let n=0;const a=ambiente({revogado:async(_sb,_s,_sessao,estrito)=>estrito&&++n===2});assert.equal((await a.chamar({action:'listarEntidadesLicitacoes'})).status,401);
 n=0;const b=ambiente({jwt:async()=>++n<3?{sub:'ficticio',perms:['licitacoes']}:null});assert.equal((await gravar(b)).status,401);assert.equal(b.escritas.length,0);
});
test('entidades: criação sem site, cadastro ou inscrição externa; autoria e versão do servidor',async()=>{
 const a=ambiente(),r=await gravar(a);assert.equal(r.status,200);assert.equal(r.cache,'no-store');const {item}=r.body;
 assert.equal(item.id,novoId);assert.equal(item.site,'');assert.deepEqual(item.cadastroIds,[]);assert.equal(item.cadastroExigido,'confirmar');assert.equal(item.criadoPor,'Operador fictício');assert.equal(item.criadoEm,item.atualizadoEm);assert.equal(item.historico.length,1);assert.equal(item.historico[0].antes,null);assert.equal(a.escritas[0].p_colecao,'licitacoes_entidades');
});
test('entidades: retry com novoId estável e criações simultâneas não duplicam',async()=>{
 const a=ambiente(),rs=await Promise.all([gravar(a),gravar(a,ficha({nome:'Outro envio'}))]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(a.escritas.length,1);assert.equal(a.linhas.filter(r=>r.colecao==='licitacoes_entidades').length,1);const antes=structuredClone(a.linhas);assert.equal((await gravar(a)).status,409);assert.deepEqual(a.linhas,antes);
});
test('entidades: edição parcial exige versão, preserva dados e deixa trocar cidades/nome',async()=>{
 const a=ambiente(),first=(await gravar(a,ficha({contato:'Compras fictício',email:'compras@example.com',cadastroIds:[portal]}))).body.item;
 assert.equal((await gravar(a,{id:first.id,nome:'Sem versão'})).status,409);assert.equal((await gravar(a,{id:empresa,nome:'Não criar'},'')).status,409);
 const r=await gravar(a,{id:first.id,nome:'Empresa fictícia atualizada',tipo:'empresa',municipios:['Salinas','Espinosa']},first.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.item.email,'compras@example.com');assert.deepEqual(r.body.item.cadastroIds,[portal]);assert.deepEqual(r.body.item.municipios,['Salinas','Espinosa']);assert.equal(r.body.item.historico.length,2);assert.deepEqual(r.body.item.historico[0],first.historico[0]);assert.notEqual(r.body.item.atualizadoEm,first.atualizadoEm);
 assert.equal((await gravar(a,{id:first.id,nome:'Edição vencida'},first.atualizadoEm)).status,409);
});
test('entidades: corrida entre leitura e RPC não sobrescreve vencedor',async()=>{
 let correr=false;const a=ambiente({options:{antesRpc(_n,p,db){if(correr)db.linhas.find(r=>r.id===p.p_id).registro.atualizadoEm='outra-versao';}}}),first=(await gravar(a)).body.item;correr=true;
 const r=await gravar(a,{id:first.id,nome:'Edição vencida'},first.atualizadoEm);assert.equal(r.status,409);assert.equal(a.escritas.length,1);assert.equal(a.linhas.find(r=>r.id===first.id).registro.nome,'Organização fictícia');
});
test('entidades: arquivar e reativar preserva contatos, cidades e vínculos',async()=>{
 const a=ambiente(),first=(await gravar(a,ficha({telefone:'Contato de demonstração',cadastroIds:[portal]}))).body.item;
 const r=await a.chamar({action:'arquivarEntidadeLicitacoes',id:first.id,versao:first.atualizadoEm});assert.equal(r.status,200);assert.equal(r.body.item.situacao,'arquivado');assert.equal(r.body.item.historico.at(-1).acao,'arquivar');
 const volta=await gravar(a,{id:first.id,situacao:'ativo'},r.body.item.atualizadoEm);assert.equal(volta.status,200);assert.equal(volta.body.item.telefone,first.telefone);assert.deepEqual(volta.body.item.cadastroIds,[portal]);assert.equal(a.linhas.filter(r=>r.colecao==='licitacoes_entidades').length,1);
});
test('entidades: somente catálogo canônico de 89 municípios, sem duplicatas ou sede inferida',async()=>{
 assert.equal(MUNICIPIOS.length,89);const a=ambiente(),r=await gravar(a,ficha({municipios:[...MUNICIPIOS]}));assert.equal(r.status,200);assert.deepEqual(r.body.item.municipios,MUNICIPIOS);
 for(const municipios of [[],['Montes Claros','Montes Claros'],['montes claros'],['Belo Horizonte'],[''],null,'Salinas',[1]]){const a=ambiente();assert.equal((await gravar(a,ficha({municipios}))).status,422);assert.equal(a.escritas.length,0);}
});
test('entidades: campos fechados, limites, datas e enums inválidos não escrevem',async()=>{
 for(const patch of [{novoId:'nome livre'},{id:novoId},{nome:''},{nome:'a'.repeat(201)},{contato:'a'.repeat(201)},{telefone:'a'.repeat(81)},{endereco:'a'.repeat(801)},{email:'a'.repeat(255)},{email:'a@'},{responsavel:'a'.repeat(201)},{proximaAcao:'a'.repeat(2001)},{observacao:'a'.repeat(4001)},{prazoAcao:'2026-02-30'},{prazoAcao:'0000-01-01'},{tipo:'pessoa'},{situacao:'vencido'},{prioridade:'urgente'},{cadastroExigido:true},{historico:[]},{criadoEm:'ontem'},{atualizadoPor:'Outro'},{anexos:[]},{titularId:pessoa}]){const a=ambiente(),r=await gravar(a,ficha(patch));assert.equal(r.status,422,JSON.stringify(patch));assert.equal(a.escritas.length,0);}
});
test('entidades: sites seguros, sem credenciais e não obrigatórios',async()=>{
 for(const site of ['javascript:alert(1)','data:text/plain,oi','https://user:password@example.com','/relativo','https://example.com/\nsecreto','https://example.com/'+'x'.repeat(2000),'https:\\example.com'])assert.equal((await gravar(ambiente(),ficha({site}))).status,422);
 assert.equal((await gravar(ambiente(),ficha({site:'https://example.com/cadastro'}))).status,200);
});
test('entidades: cadastro vinculado deve existir e pertencer a titular empresa',async()=>{
 for(const cadastroIds of [[empresa],['Nome livre'],[portal,portal],Array.from({length:51},()=>portal),'portal']){const a=ambiente(),r=await gravar(a,ficha({cadastroIds}));assert.ok([403,422].includes(r.status));assert.equal(a.escritas.length,0);}
 const a=ambiente();a.linhas.find(r=>r.id===portal).registro.titularId=pessoa;assert.equal((await gravar(a,ficha({cadastroIds:[portal]}))).status,403);
 const b=ambiente(),r=await gravar(b,ficha({cadastroIds:[portal]}));assert.equal(r.status,200);assert.deepEqual(r.body.item.cadastroIds,[portal]);assert.ok(b.consultas.every(fs=>!fs.some(([k,v])=>k==='colecao'&&['ativo','ativo_lixeira'].includes(v))));
});
test('entidades: vínculo que se tornou restrito é ocultado e preservado ao salvar',async()=>{
 const a=ambiente(),first=(await gravar(a,ficha({cadastroIds:[portal]}))).body.item;a.linhas.find(r=>r.id===portal).registro.titularId=pessoa;
 const list=await a.chamar({action:'listarEntidadesLicitacoes'});assert.equal(list.body.itens[0].cadastrosRestritos,true);assert.deepEqual(list.body.itens[0].cadastroIds,[]);assert.doesNotMatch(JSON.stringify(list.body),new RegExp(portal+'|PESSOA-PRIVADA'));
 const r=await gravar(a,{id:first.id,cadastroIds:[],nome:'Edição preservando vínculo'},first.atualizadoEm);assert.equal(r.status,200);assert.deepEqual(a.linhas.find(r=>r.id===novoId).registro.cadastroIds,[portal]);assert.deepEqual(r.body.item.cadastroIds,[]);
});
test('entidades: projeção fechada, paginação completa e falha de leitura não vira vazio',async()=>{
 const rows=Array.from({length:1001},(_,i)=>linha('licitacoes_entidades','id-'+String(i).padStart(4,'0'),{nome:'Ficha fictícia '+i,tipo:'orgao',municipios:['Salinas'],extra:'SEGREDO',historico:[{depois:{nome:'Nome',segredo:'PRIVADO'}}]}));const a=ambiente({rows}),r=await a.chamar({action:'listarEntidadesLicitacoes'});assert.equal(r.body.itens.length,1001);assert.doesNotMatch(JSON.stringify(r.body),/SEGREDO|PRIVADO|PESSOA-PRIVADA/);assert.equal(a.escritas.length,0);
 const fail=await ambiente({options:{falhaLeitura:true}}).chamar({action:'listarEntidadesLicitacoes'});assert.equal(fail.status,500);assert.equal('itens' in fail.body,false);assert.doesNotMatch(JSON.stringify(fail.body),/DETALHE-PRIVADO/);
});
test('entidades: PostgreSQL local usa RPC existente com comparação integral e retry seguro',async()=>{
 const db=new PGlite();try{await db.exec('create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');await db.exec(readFileSync(new URL('../supabase/migrations/20260906_proteger_registro_retirado.sql',import.meta.url),'utf8'));
 const original={id:novoId,nome:'Original',municipios:['Salinas'],cadastroIds:[portal],atualizadoEm:'v1'},novo={...original,nome:'Atualizado',atualizadoEm:'v2'};await db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_entidades',novoId,original,null]);await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_entidades',novoId,novo,null]),e=>e.code==='40001');await db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_entidades',novoId,novo,original]);await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_entidades',novoId,original,original]),e=>e.code==='40001');assert.deepEqual((await db.query('select registro from painel_registros')).rows[0].registro,novo);
 }finally{await db.close();}
});
test('entidades: validação não muta entrada nem dados anteriores',()=>{
 const item=ficha({cadastroIds:[portal]}),copy=structuredClone(item);prepararEntidade(item,null,new Map([[portal,base[2].registro]]),new Map([[empresa,base[0].registro]]));assert.deepEqual(item,copy);
});

test('entidades: endereço opcional persiste integralmente em leitura, edição e histórico',async()=>{
 const a=ambiente(),endereco='Avenida de demonstração, 123, Centro, Salinas - MG',first=(await gravar(a,ficha({endereco}))).body.item;assert.equal(first.endereco,endereco);assert.equal(first.historico[0].depois.endereco,endereco);const r=await gravar(a,{id:first.id,responsavel:'Responsável fictício'},first.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.item.endereco,endereco);assert.equal((await a.chamar({action:'listarEntidadesLicitacoes'})).body.itens[0].endereco,endereco);
});
