import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const sql=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const registro=(id,versao=1,extra={})=>({id,versao,titulo:'Ação fictícia',ano:2027,mes:1,origem:{chave:'origem-'+id},historico:[],anexos:[],...extra});
const op=(id,anterior=null,extra={})=>({id,anterior,registro:registro(id,(anterior?.versao||0)+1,extra)});
const importar=(ops,id='lote',hash='a'.repeat(64))=>db.query('select public.painel_planejamento_importar($1,$2,$3::jsonb) as itens',[id,hash,JSON.stringify(ops)]);
const obter=async id=>(await db.query("select registro from painel_registros where colecao='planejamento_anual' and id=$1",[id])).rows[0]?.registro;
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema storage;
 create table public.painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id)); alter table public.painel_registros enable row level security;
 create table storage.objects(id text,bucket_id text,name text); alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
 create policy legado_amplo on storage.objects for all to anon,authenticated using(true) with check(true);`);
 await db.exec(sql('20260906_proteger_registro_retirado.sql'));
 await db.exec('revoke all on function public.painel_registro_gravar(text,text,jsonb,jsonb) from public,anon,authenticated; grant execute on function public.painel_registro_gravar(text,text,jsonb,jsonb) to service_role;');
 await db.exec(sql('20261118_planejamento_anual.sql'));
});
after(()=>db.close());beforeEach(()=>db.exec('reset role; truncate public.painel_registros; truncate storage.objects;'));
test('só service_role pode importar; clientes diretos não acessam os registros',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(importar([op('a')]),e=>e.code==='42501');await assert.rejects(db.query('select * from public.painel_registros'),e=>e.code==='42501');await db.exec('reset role');}
 await db.exec('set role service_role');const r=await importar([op('a')]);assert.equal(r.rows[0].itens[0].id,'a');
});
test('lote é idempotente e conteúdo diferente não reutiliza a mesma chave',async()=>{
 const ops=[op('a'),op('b')];await importar(ops);await importar(ops);assert.equal((await db.query("select count(*)::int as n from painel_registros where colecao='planejamento_anual'")).rows[0].n,2);
 await assert.rejects(importar([op('c')],'lote','b'.repeat(64)),e=>e.code==='40001');assert.equal(await obter('c'),undefined);
});
test('conflito no último item desfaz as gravações anteriores do lote',async()=>{
 await importar([op('a'),op('z')]);const a=await obter('a');await assert.rejects(importar([op('a',a,{titulo:'Mudou'}),op('z',{id:'z',versao:0},{titulo:'Conflito'})],'segundo'),e=>e.code==='40001');assert.equal((await obter('a')).versao,1);assert.equal((await obter('a')).titulo,'Ação fictícia');
});
test('mesma origem não pode gerar segunda ação nem importação parcial',async()=>{
 await importar([op('a')]);await assert.rejects(importar([op('b'),op('z',null,{origem:{chave:'origem-a'}})],'duplicado'),e=>e.code==='23505');assert.equal(await obter('b'),undefined);assert.equal(await obter('z'),undefined);
});
test('valida IDs, origem e sequência de versão antes de salvar',async()=>{
 const casos=[[],[op('a'),op('a')],[{...op('a'),id:'outro'}],[op('a',null,{origem:{}})],[op('a',null,{versao:5})],[op('a',null,{versao:'1'})],[{...op('a'),anterior:{id:'alheio',versao:0}}]];
 for(const ops of casos)await assert.rejects(importar(ops),e=>e.code==='22023');assert.equal((await db.query('select count(*)::int as n from painel_registros')).rows[0].n,0);
});
test('anexos do planejamento são privados mesmo com policy legada permissiva',async()=>{
 await db.exec("insert into storage.objects values('arquivo-privado','painel-arquivos','planejamento/acao/arquivo.pdf'),('outro','painel-arquivos','processos/outro/arquivo.pdf')");
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);assert.deepEqual((await db.query('select id from storage.objects')).rows.map(x=>x.id),['outro']);await assert.rejects(db.query("insert into storage.objects values('forjado','painel-arquivos','planejamento/acao/novo.pdf')"),e=>e.code==='42501');await db.exec('reset role');}
});
