import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;try{({PGlite}=await import('@electric-sql/pglite'));}catch{if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href));}
const pasta=new URL('../supabase/migrations/',import.meta.url);
test('PostgreSQL local: CAS e retirada preservam ativo, arquivo e lixeira em conflitos',{skip:!PGlite},async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');
  const arquivoNovo=(await readdir(pasta)).find(n=>/documentos_versao_retirada\.sql$/.test(n));assert.ok(arquivoNovo);
  for(const n of ['20260906_proteger_registro_retirado.sql','20260906_equipamento_atomico.sql',arquivoNovo])await db.exec(await readFile(new URL(n,pasta),'utf8'));
  const original={id:'doc',tipo:'garantia',nome:'Exemplo fictício',atualizadoEm:'v1',versoes:[{id:'versao1',arquivo:{chave:'documentos/doc/versao1',nome:'termo.pdf'}}]};
  await db.query('insert into painel_registros(colecao,id,registro) values($1,$2,$3)',['ativo','doc',original]);
  await db.query('insert into painel_registros(colecao,id,registro) values($1,$2,$3)',['arquivo','doc',{mime:'application/pdf',nome:'legado.pdf'}]);
  const atualizado={...original,nome:'Outra edição',atualizadoEm:'v2'};
  await db.query('select painel_registro_gravar($1,$2,$3,$4)',['ativo','doc',atualizado,original]);
  await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['ativo','doc',{...original,nome:'Edição vencida'},original]),e=>e.code==='40001');
  await assert.rejects(db.query('select painel_documento_retirar($1,$2,$3)',['doc',original,'teste']),e=>e.code==='40001');
  assert.equal((await db.query("select count(*)::int n from painel_registros where colecao='ativo_lixeira'")).rows[0].n,0);
  await db.query('select painel_documento_retirar($1,$2,$3)',['doc',atualizado,'teste']);
  assert.equal((await db.query("select count(*)::int n from painel_registros where colecao in ('ativo','arquivo')")).rows[0].n,0);
  const lixo=(await db.query("select registro from painel_registros where colecao='ativo_lixeira'")).rows[0].registro;assert.deepEqual(lixo.versoes,original.versoes);assert.equal(lixo.atualizadoEm,'v2');
  assert.equal((await db.query("select registro->>'nome' nome from painel_registros where colecao='arquivo_lixeira'")).rows[0].nome,'legado.pdf');
  const fisico={tipo:'predial',categoria:'AVCB'};await db.query('insert into painel_registros(colecao,id,registro) values($1,$2,$3)',['ativo','avcb',fisico]);
  await assert.rejects(db.query('select painel_documento_retirar($1,$2,$3)',['avcb',fisico,'teste']),e=>e.code==='23514');
  const priv=(await db.query("select has_function_privilege('anon','painel_documento_retirar(text,jsonb,text)','execute') anon,has_function_privilege('authenticated','painel_documento_retirar(text,jsonb,text)','execute') authenticated,has_function_privilege('service_role','painel_documento_retirar(text,jsonb,text)','execute') service")).rows[0];assert.deepEqual(priv,{anon:false,authenticated:false,service:true});
 }finally{await db.close();}
});
