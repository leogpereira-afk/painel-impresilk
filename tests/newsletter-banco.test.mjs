import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/20261016014056_newsletter_estrutura.sql',import.meta.url),'utf8');
const I='a0000000-0000-4000-8000-000000000001', L='a0000000-0000-4000-8000-000000000002', J='a0000000-0000-4000-8000-000000000003';
test('banco: histórico, conflito, supressão, unicidade e RLS',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');await db.exec(sql);
 const salvar=(id,tipo,dados,v=null)=>db.query('select to_jsonb(public.painel_newsletter_salvar($1,$2,$3,$4,$5)) as r',[id,tipo,JSON.stringify(dados),v,'exemplo']).then(r=>r.rows[0].r);
 await salvar(L,'lista',{nome:'Exemplo'});
 const c={email:'exemplo@example.com',situacao:'pendente',listas:[L]};
 await salvar(I,'contato',c);
 await assert.rejects(salvar(J,'contato',c),e=>e.code==='23505');
 await assert.rejects(salvar(I,'contato',c,5),/NEWSLETTER_CONFLITO/);
 await assert.rejects(salvar(I,'contato',{...c,listas:[J]},1),/NEWSLETTER_LISTA_INVALIDA/);
 assert.equal((await salvar(I,'contato',{...c,situacao:'descadastrado'},1)).versao,2);
 await assert.rejects(salvar(I,'contato',{...c,situacao:'inscrito'},2),/NEWSLETTER_SUPRIMIDO/);
 await assert.rejects(salvar(I,'contato',{...c,email:'outro@example.com',situacao:'descadastrado'},2),/NEWSLETTER_EMAIL_IMUTAVEL/);
 assert.equal((await db.query('select count(*)::int n from painel_newsletter_revisoes where registro_id=$1',[I])).rows[0].n,2);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from painel_newsletter'),/permission denied/);
  await assert.rejects(salvar(J,'lista',{nome:'Proibido'}),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');await salvar(J,'lista',{nome:'Autorizado no servidor'});await db.exec('reset role');
 }finally{await db.close();}
});
