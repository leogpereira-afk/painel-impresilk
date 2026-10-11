import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;try{({PGlite}=await import('@electric-sql/pglite'));}catch{if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href));}
test('PostgreSQL recusa telefone duplicado, vínculo inválido e retirada do aparelho/setor em uso',{skip:!PGlite},async()=>{
 const db=new PGlite();
 const falha=async(sql,code)=>{await assert.rejects(db.exec(sql),e=>e.code===code);await db.exec('rollback');};
 try{
  await db.exec(`create role anon;create role authenticated;create table painel_registros(colecao text,id text,registro jsonb,primary key(colecao,id));`);
  const sql=await readFile(new URL('../supabase/migrations/20261011120000_ramais_vinculos.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into painel_registros values ('setores','s','{}'),('ativo','a','{"tipo":"informatica","categoria":"Telefone"}'),('ativo','b','{"tipo":"informatica","categoria":"Telefone"}'),('ativo','central','{"tipo":"informatica","categoria":"Central telefônica"}');
  insert into painel_registros values('patrimonio_controles','r','{"tipo":"ramais","setorId":"s","aparelhoId":"a"}');`);
  await falha(`insert into painel_registros values('patrimonio_controles','r2','{"tipo":"ramais","aparelhoId":"a"}');`,'23505');
  await falha(`insert into painel_registros values('patrimonio_controles','r3','{"tipo":"ramais","aparelhoId":"central"}');`,'23503');
  await falha(`insert into painel_registros values('patrimonio_controles','r3','{"tipo":"ramais","setorId":"inexistente"}');`,'23503');
  await falha(`delete from painel_registros where colecao='ativo' and id='a';`,'23503');
  await falha(`delete from painel_registros where colecao='setores' and id='s';`,'23503');
  await falha(`update painel_registros set registro='{"tipo":"informatica","categoria":"Notebook"}' where id='a';`,'23503');
  await db.exec(`begin;update painel_registros set registro=registro||'{"aparelhoId":"b"}' where id='r';delete from painel_registros where id='a';commit;`);
  await db.exec(`insert into painel_registros values('patrimonio','bem','{}');update painel_registros set registro=registro||'{"bemId":"bem"}' where id='b';`);
  await falha(`update painel_registros set registro=registro||'{"bemId":"bem"}' where id='central';`,'23503');
  assert.equal((await db.query(`select registro->>'aparelhoId' as id from painel_registros where id='r'`)).rows[0].id,'b');
 }finally{await db.close();}
});

test('RPC aceita telefonia, persiste o mesmo bem e não toma inventário de outro item',{skip:!PGlite},async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
  create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));
  create function patrimonio_proxima_etiqueta(text) returns text language sql as $$select 'TESTE-001'::text$$;
  create function painel_registro_gravar(p_colecao text,p_id text,p_registro jsonb,p_anterior jsonb) returns jsonb language plpgsql set search_path=public as $$begin
   if (select registro from painel_registros where colecao=p_colecao and id=p_id) is distinct from p_anterior then raise exception using errcode='40001',message='conflito';end if;
   insert into painel_registros values(p_colecao,p_id,p_registro,now()) on conflict(colecao,id) do update set registro=excluded.registro;
   return p_registro;end $$;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261011120100_equipamentos_familias.sql',import.meta.url),'utf8'));
  let r=await db.query(`select painel_equipamento_gravar('tel','{"id":"tel","tipo":"informatica"}',null,'bem','{}','teste') as r`);
  const ativo=r.rows[0].r.item;assert.equal(ativo.bemId,'bem');
  r=await db.query(`select painel_equipamento_gravar('tel',$1,$2,'bem','{}','teste') as r`,[JSON.stringify({...ativo,nome:'Editado'}),JSON.stringify(ativo)]);
  assert.equal(r.rows[0].r.item.bemId,'bem');assert.equal((await db.query(`select count(*)::int as n from painel_registros where colecao='patrimonio'`)).rows[0].n,1);
  await assert.rejects(db.query(`select painel_equipamento_gravar('outro','{"tipo":"seguranca"}',null,'bem','{}','teste')`),e=>e.code==='23503');
 }finally{await db.close();}
});
