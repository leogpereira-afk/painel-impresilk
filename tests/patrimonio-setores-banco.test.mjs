// PostgreSQL em memória, sem tocar o Supabase. Mesmo caminho opcional de PGlite
// usado nos demais testes de banco: PGLITE_PATH=/.../dist/index.js node --test ...
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;
try { ({PGlite}=await import('@electric-sql/pglite')); }
catch { if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href)); }

test('migração protege setor, edição legada, restauração e número único no PostgreSQL', {skip:PGlite?false:'PGlite ausente: defina PGLITE_PATH'}, async()=>{
 const db=new PGlite();
 const executarErro=async(sql,code)=>{
  await assert.rejects(db.exec(sql),e=>e.code===code);
  await db.exec('rollback');
 };
 try {
  await db.exec(`create role anon; create role authenticated;
   create table public.painel_registros(colecao text,id text,registro jsonb,primary key(colecao,id));
   insert into public.painel_registros values('patrimonio','legado','{"codigo":"OLD-01","setorSigla":"INEXISTENTE","valor":10}');`);
  const sql=await readFile(new URL('../supabase/migrations/20261005_patrimonio_controles.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into public.painel_registros values('setores','pro','{"sigla":"PRO"}');
   insert into public.painel_registros values('patrimonio','bem','{"codigo":"PRO-01","setorSigla":"PRO","situacao":"baixado"}');`);
  await executarErro(`insert into public.painel_registros values('patrimonio','semsetor','{"setorSigla":"FALTA"}');`,'23503');
  await executarErro(`delete from public.painel_registros where colecao='setores' and id='pro';`,'23503');
  await executarErro(`update public.painel_registros set registro='{"sigla":"NOVA"}' where colecao='setores' and id='pro';`,'23503');
  await db.exec(`update public.painel_registros set registro=registro||'{"valor":20}' where colecao='patrimonio' and id='legado';`);
  assert.equal((await db.query(`select registro->>'valor' as v from public.painel_registros where id='legado'`)).rows[0].v,'20');
  await db.exec(`begin;
   insert into public.painel_registros values('setores','adm','{"sigla":"ADM"}');
   update public.painel_registros set registro=registro||'{"setorSigla":"ADM"}' where colecao='patrimonio' and id='bem';
   delete from public.painel_registros where colecao='setores' and id='pro';
   commit;`);
  await db.exec(`begin;
   insert into public.painel_registros values('patrimonio','restaurado','{"setorSigla":"EST"}');
   insert into public.painel_registros values('setores','est','{"sigla":"EST"}');
   commit;`);
  await db.exec(`insert into public.painel_registros values('patrimonio_controles','a','{"tipo":"camas","numeroChave":"1"}');`);
  await executarErro(`insert into public.painel_registros values('patrimonio_controles','b','{"tipo":"camas","numeroChave":"1"}');`,'23505');
  await db.exec(`insert into public.painel_registros values('patrimonio_controles','b','{"tipo":"armarios","numeroChave":"1"}');`);
 }finally{await db.close();}
});
