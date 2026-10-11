import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {prepararFisico} from '../supabase/functions/_shared/patrimonio-fisico.mjs';
let PGlite;try{({PGlite}=await import('@electric-sql/pglite'));}catch{if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href));}
const C='be26ec80-27ce-42b2-b927-8f3a0ce51c70',I='78a671f9-7fe9-4372-b7ad-9f9e949ff600',P='8cb02b69-0da0-4f36-b3e6-a490bb17e9fb',P2='6d8863bd-23f5-4f28-b3d2-37c50f40f202';
test('banco impede plano duplo, vínculo órfão e padrão de energia retirado',{skip:!PGlite},async()=>{
 const db=new PGlite();
 const sql=(s)=>db.exec(s);
 const falha=async(s,code)=>{await assert.rejects(sql(s),e=>e.code===code);await sql('rollback');};
 try{
  await sql('create role anon; create role authenticated; create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz,primary key(colecao,id));');
  await sql(`insert into painel_registros values ('patrimonio_controles','ramal-legado','{"tipo":"ramais","setorId":"setor-antigo","numero":"200"}'),('ativo','pv-legado','{"tipo":"predial","categoria":"Usina fotovoltaica","especificacao":{"unidadesConsumidoras":["pad-antigo"]}}'),('ativo','pc-legado','{"tipo":"informatica","categoria":"Computador","nome":"PC"}');`);
  await sql(`insert into painel_registros values ('ativo','pv-ordem','{"tipo":"predial","categoria":"Usina fotovoltaica","nome":"Usina","especificacao":{"unidadesConsumidoras":["${P}","${P2}"]}}');`);
  await sql(await readFile(new URL('../supabase/migrations/20261011120600_infra_referencias.sql',import.meta.url),'utf8'));
  await sql(`update painel_registros set registro=jsonb_set(registro,'{numero}','"201"') where colecao='patrimonio_controles' and id='ramal-legado';`);
  await sql(`update painel_registros set registro=jsonb_set(registro,'{nome}','"PC editado"') where colecao='ativo' and id='pc-legado';`);
  await sql(`update painel_registros set registro=jsonb_set(registro,'{nome}','"Usina antiga"') where colecao='ativo' and id='pv-legado';`);
  const anterior=(await db.query("select registro from painel_registros where colecao='ativo' and id='pv-ordem'")).rows[0].registro;
  const formulario=prepararFisico({nome:'Usina reordenada',especificacao:{unidadesConsumidoras:[P2,P]}},anterior,{});
  assert.deepEqual(formulario.especificacao.unidadesConsumidoras,[P,P2]);
  await db.query("update painel_registros set registro=$1::jsonb where colecao='ativo' and id='pv-ordem'",[JSON.stringify(formulario)]);
  await falha(`update painel_registros set registro=jsonb_set(registro,'{especificacao,unidadesConsumidoras}','["${P2}","${P}"]') where colecao='ativo' and id='pv-ordem';`,'23503');
  await falha(`update painel_registros set registro=jsonb_set(registro,'{setorId}','"setor-inexistente"') where colecao='patrimonio_controles' and id='ramal-legado';`,'23503');
  await falha(`insert into painel_registros values ('patrimonio_infra','nome','{"tipo":"contato"}');`,'23514');
  await falha(`insert into painel_registros values ('patrimonio_infra','${I}','{"tipo":"internet","tecnicoId":"${C}"}');`,'23503');
  await sql(`insert into painel_registros values ('patrimonio_infra','${C}','{"tipo":"contato","nome":"Suporte"}');`);
  await sql(`insert into painel_registros values ('patrimonio_infra','${I}','{"tipo":"internet","tecnicoId":"${C}"}');`);
  await sql(`insert into painel_registros values ('patrimonio_infra','${P}','{"tipo":"plano-corporativo","contatoId":"${C}"}');`);
  await falha(`insert into painel_registros values ('patrimonio_infra','${P2}','{"tipo":"plano-corporativo"}');`,'23505');
  await sql(`insert into painel_registros values ('setores','set1','{}'),('patrimonio_controles','line1','{"tipo":"celulares","setorId":"set1","planoId":"${P}"}');`);
  await falha(`delete from painel_registros where colecao='patrimonio_infra' and id='${P}';`,'23503');
  await falha(`delete from painel_registros where colecao='patrimonio_infra' and id='${C}';`,'23503');
  await falha(`delete from painel_registros where colecao='setores' and id='set1';`,'23503');
  await falha(`insert into painel_registros values ('ativo','pv1','{"tipo":"predial","categoria":"Usina fotovoltaica","especificacao":{"unidadesConsumidoras":["pad1"]}}');`,'23503');
  await sql(`insert into painel_registros values ('ativo','pad1','{"tipo":"predial","categoria":"Padrão de energia"}');`);
  await sql(`insert into painel_registros values ('ativo','pv1','{"tipo":"predial","categoria":"Usina fotovoltaica","especificacao":{"unidadesConsumidoras":["pad1"],"tecnicoId":"${C}"}}');`);
  await falha(`delete from painel_registros where colecao='ativo' and id='pad1';`,'23503');
  await falha(`update painel_registros set registro='{"tipo":"predial","categoria":"Transformador"}' where colecao='ativo' and id='pad1';`,'23503');
  assert.equal((await db.query(`select count(*)::int n from painel_registros where colecao='ativo'`)).rows[0].n,5);
 }finally{await db.close();}
});
