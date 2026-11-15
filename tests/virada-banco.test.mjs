import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const id='00000000-0000-4000-8000-000000000001',outro='00000000-0000-4000-8000-000000000002';
const snapshot=(versao=1,extra={})=>({id,versao,dias:90,nome:'Ciclo fictício',participantes:[],missoes:[],mural:[],historico:[],...extra});
const save=(versao,registro=snapshot(versao+1),key=id)=>db.query('select public.virada_ciclo_gravar($1::uuid,$2::bigint,$3::jsonb)',[key,versao,JSON.stringify(registro)]);
before(async()=>{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id text,bucket_id text); alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated; create policy legado_amplo on storage.objects for all to anon,authenticated using(true) with check(true);');
 await db.exec(readFileSync(new URL('../supabase/migrations/20261115_a_virada.sql',import.meta.url),'utf8'));
});
after(()=>db.close());beforeEach(()=>db.exec('reset role; truncate public.virada_ciclos'));
test('anon e authenticated não leem, escrevem nem chamam RPC; service_role grava',async()=>{
 for(const role of ['anon','authenticated']) {await db.exec('set role '+role);await assert.rejects(save(0),e=>e.code==='42501');await assert.rejects(db.query('select * from public.virada_ciclos'),e=>e.code==='42501');await db.exec('reset role');}
 await db.exec('set role service_role');await save(0);assert.equal((await db.query('select versao from public.virada_ciclos')).rows[0].versao,1);
});
test('CAS real permite só um escritor, preserva vencedor e não duplica XP',async()=>{
 await save(0);const results=await Promise.allSettled([save(1,snapshot(2,{nome:'Vencedor A'})),save(1,snapshot(2,{nome:'Vencedor B'}))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'40001');
 assert.equal((await db.query('select count(*) as n from public.virada_ciclos')).rows[0].n,1);
 assert.equal((await db.query('select versao from public.virada_ciclos')).rows[0].versao,2);
});
test('criação repetida e segundo ciclo ativo são recusados',async()=>{
 await save(0);await assert.rejects(save(0),e=>e.code==='40001');await assert.rejects(save(0,snapshot(1,{id:outro}),outro),e=>e.code==='23505');
});
test('snapshot sem estrutura, versão inconsistente ou ID divergente é recusado',async()=>{
 await assert.rejects(save(0,{id,versao:1,dias:90}),e=>e.code==='23514');
 await assert.rejects(save(0,snapshot(3)),e=>e.code==='22023');
 await assert.rejects(save(0,snapshot(1,{id:outro})),e=>e.code==='22023');
});
test('bucket é privado, restringe MIME/tamanho e migração não concede policy pública',async()=>{
 const bucket=(await db.query('select * from storage.buckets')).rows[0];assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,6291456);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.virada_ciclos'::regclass")).rows[0].relrowsecurity,true);
});

test('policy restritiva protege bucket mesmo se houver policy legada ampla',async()=>{
 await db.exec("insert into storage.objects values ('privado','virada-evidencias'),('outro','outro-bucket')");
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  assert.deepEqual((await db.query('select id from storage.objects')).rows.map(r=>r.id),['outro']);
  await assert.rejects(db.query("insert into storage.objects values('forjado','virada-evidencias')"),e=>e.code==='42501');
  await db.exec('reset role');
 }
});
