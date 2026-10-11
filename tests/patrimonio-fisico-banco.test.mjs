import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;try{({PGlite}=await import('@electric-sql/pglite'));}catch{if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href));}
test('banco impede duplicar número físico e vincular celular duas vezes',{skip:!PGlite},async()=>{
 const db=new PGlite();const fail=async(sql,code)=>{await assert.rejects(db.exec(sql),e=>e.code===code);await db.exec('rollback');};
 try{
  await db.exec(`create role anon;create role authenticated;create table painel_registros(colecao text,id text,registro jsonb,primary key(colecao,id));`);
  for(const nome of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>/^20261011\d{6}_(ramais_vinculos|celulares_vinculos|fisicos_numeracao)\.sql$/.test(n)).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+nome,import.meta.url),'utf8'));
  await db.exec(`insert into painel_registros values ('ativo','cel1','{"tipo":"informatica","categoria":"Celular"}'),('ativo','cel2','{"tipo":"informatica","categoria":"Celular"}'),('ativo','cam1','{"tipo":"seguranca","categoria":"Câmera","especificacao":{"numero":"01"}}'),('ativo','ext1','{"tipo":"predial","categoria":"Extintor","especificacao":{"numero":"01"}}');`);
  await db.exec(`insert into painel_registros values ('patrimonio_controles','linha1','{"tipo":"celulares","aparelhoId":"cel1"}');`);
  await fail(`insert into painel_registros values ('patrimonio_controles','linha2','{"tipo":"celulares","aparelhoId":"cel1"}');`,'23505');
  await fail(`insert into painel_registros values ('patrimonio_controles','ramal','{"tipo":"ramais","aparelhoId":"cel1"}');`,'23505');
  await fail(`insert into painel_registros values ('ativo','cam2','{"tipo":"seguranca","categoria":"Câmera","especificacao":{"numero":"01"}}');`,'23505');
  await fail(`insert into painel_registros values ('ativo','camLegado','{"tipo":"seguranca","categoria":"Câmeras / CFTV","especificacao":{"numero":"01"}}');`,'23505');
  await fail(`insert into painel_registros values ('ativo','ext2','{"tipo":"predial","categoria":"Extintor","especificacao":{"numero":"01"}}');`,'23505');
  await db.exec(`insert into painel_registros values ('ativo','dvr','{"tipo":"seguranca","categoria":"DVR/NVR"}');update painel_registros set registro=registro||'{"especificacao":{"numero":"01","gravadorId":"dvr","canal":"1"}}' where id='cam1';`);
  await fail(`insert into painel_registros values ('ativo','camCanal','{"tipo":"seguranca","categoria":"Câmera","especificacao":{"numero":"02","gravadorId":"dvr","canal":"1"}}');`,'23505');
  await fail(`delete from painel_registros where colecao='ativo' and id='cel1';`,'23503');
  await db.exec(`update painel_registros set registro=registro||'{"especificacao":{"numero":"01","situacao":"baixado"}}' where id='cam1';insert into painel_registros values ('ativo','cam2','{"tipo":"seguranca","categoria":"Câmera","especificacao":{"numero":"01"}}');`);
  assert.equal((await db.query(`select count(*)::int n from painel_registros where id='cam2'`)).rows[0].n,1);
 }finally{await db.close();}
});
