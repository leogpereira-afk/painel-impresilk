import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;try{({PGlite}=await import('@electric-sql/pglite'));}catch{if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href));}
const pasta=new URL('../supabase/migrations/',import.meta.url);
const pacote=(await readdir(pasta)).filter(n=>/^20261011\d*_(ramais_vinculos|celulares_vinculos|equipamentos_familias|fisicos_numeracao|fisicos_integridade|ativo_restaurar|infra_referencias)\.sql$/.test(n)).sort();
async function banco(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');for(const n of ['20260906_equipamento_atomico.sql','20260906_lixeira_registros.sql',...pacote])await db.exec(await readFile(new URL(n,pasta),'utf8'));return db;}
const put=async(db,c,id,r)=>db.query('insert into painel_registros(colecao,id,registro) values($1,$2,$3)',[c,id,r]);
const fail=async(db,sql,code='23503')=>{await assert.rejects(db.exec(sql),e=>e.code===code,sql);await db.exec('rollback');};
test('pacote usa versões Supabase únicas e timestamps numéricos',()=>{assert.equal(new Set(pacote.map(n=>n.split('_')[0])).size,pacote.length);for(const n of pacote)assert.match(n,/^\d{14}_/);});
test('ordem real protege Celular vinculado contra retirada, tipo, categoria e baixa',{skip:!PGlite},async()=>{const db=await banco();try{
 await put(db,'ativo','cel',{tipo:'informatica',categoria:'Celular'});await put(db,'patrimonio_controles','linha',{tipo:'celulares',aparelhoId:'cel'});
 await fail(db,"delete from painel_registros where id='cel'");
 for(const patch of [{tipo:'predial'},{categoria:'Telefone'},{especificacao:{situacao:'baixado'}}])await fail(db,`update painel_registros set registro=registro||'${JSON.stringify(patch)}' where id='cel'`);
}finally{await db.close();}});
test('transação protege origem inversa do inventário direta e legada',{skip:!PGlite},async()=>{const db=await banco();try{
 await put(db,'patrimonio','A',{origemAtivoId:'pc'});await put(db,'patrimonio','B',{});await put(db,'ativo','pc',{tipo:'informatica',categoria:'Computador',bemId:'A'});
 for(const destino of ['B',''])await fail(db,`update painel_registros set registro=jsonb_set(registro,'{bemId}','"${destino}"') where id='pc'`);
 await db.exec("alter table painel_registros disable trigger user;update painel_registros set registro=registro-'bemId' where id='pc';alter table painel_registros enable trigger user;");
 for(const destino of ['B',''])await fail(db,`update painel_registros set registro=jsonb_set(registro,'{bemId}','"${destino}"') where id='pc'`);
 await db.exec(`update painel_registros set registro=registro||'{"nome":"Edição legado"}' where id='pc'`);
}finally{await db.close();}});
test('setor e gravador referenciados não podem sumir; legado estável pode editar e desvincular',{skip:!PGlite},async()=>{const db=await banco();try{
 await put(db,'setores','s',{});await put(db,'ativo','pc',{tipo:'informatica',categoria:'Computador',especificacao:{setorId:'s'}});await put(db,'ativo','dvr',{tipo:'seguranca',categoria:'DVR/NVR'});await put(db,'ativo','cam',{tipo:'seguranca',categoria:'Câmera',especificacao:{gravadorId:'dvr'}});
 await fail(db,"select painel_registro_retirar('setores','s','teste')");assert.equal((await db.query("select count(*)::int n from painel_registros where colecao='registro_lixeira'")).rows[0].n,0);
 await fail(db,"select painel_ativo_retirar('dvr',null,'teste')");assert.equal((await db.query("select count(*)::int n from painel_registros where colecao='ativo_lixeira'")).rows[0].n,0);
 await fail(db,"delete from painel_registros where id='s'");await fail(db,"update painel_registros set id='s2' where id='s'");await fail(db,"delete from painel_registros where id='dvr'");
 for(const patch of [{tipo:'informatica'},{categoria:'Chave'},{especificacao:{situacao:'baixado'}}])await fail(db,`update painel_registros set registro=registro||'${JSON.stringify(patch)}' where id='dvr'`);
 await fail(db,`insert into painel_registros(colecao,id,registro) values('ativo','ruim','{"tipo":"predial","categoria":"Extintor","especificacao":{"setorId":"ausente"}}')`);
 await db.exec("alter table painel_registros disable trigger user;delete from painel_registros where id='s';alter table painel_registros enable trigger user;update painel_registros set registro=registro||'{\"nome\":\"Legado\"}' where id='pc';");
 await db.exec("update painel_registros set registro=jsonb_set(registro,'{especificacao,gravadorId}','\"\"') where id='cam';delete from painel_registros where id='dvr';");
}finally{await db.close();}});
test('restauração atômica preserva lixeira e metadados em número/canal, ID ou arquivo conflitante',{skip:!PGlite},async()=>{const db=await banco();try{
 await put(db,'ativo','dvr',{tipo:'seguranca',categoria:'DVR/NVR'});
 await put(db,'ativo','outra',{tipo:'seguranca',categoria:'Câmera',especificacao:{numero:'1',gravadorId:'dvr',canal:'1'}});
 const lixo={id:'cam',tipo:'seguranca',categoria:'Câmera',especificacao:{numero:'1'},_apagadoEm:'ontem'};
 await put(db,'ativo_lixeira','cam',lixo);await put(db,'arquivo_lixeira','cam',{nome:'anexo.pdf'});
 const restaurar="select painel_ativo_restaurar('cam',null)";
 const snapshot=async()=>JSON.stringify((await db.query('select * from painel_registros order by colecao,id')).rows);
 for(const patch of [{numero:'1'},{numero:'2',gravadorId:'dvr',canal:'1'}]){await db.query("update painel_registros set registro=jsonb_set(registro,'{especificacao}',$1) where colecao='ativo_lixeira'",[patch]);const antes=await snapshot();await fail(db,restaurar,'23505');assert.equal(await snapshot(),antes);}
 await db.exec("update painel_registros set registro=jsonb_set(registro,'{especificacao}','{}') where colecao='ativo_lixeira'");
 await put(db,'ativo','cam',{tipo:'seguranca',categoria:'Chave',nome:'Outro registro'});let antes=await snapshot();await fail(db,restaurar,'23505');assert.equal(await snapshot(),antes);await db.exec("delete from painel_registros where colecao='ativo' and id='cam'");
 await put(db,'arquivo','cam',{nome:'outro.pdf'});antes=await snapshot();await fail(db,restaurar,'23505');assert.equal(await snapshot(),antes);await db.exec("delete from painel_registros where colecao='arquivo' and id='cam'");
 await db.exec("update painel_registros set registro=jsonb_set(registro,'{especificacao}','{\"setorId\":\"ausente\"}') where colecao='ativo_lixeira'");antes=await snapshot();await fail(db,restaurar);assert.equal(await snapshot(),antes);
 await db.exec("update painel_registros set registro=jsonb_set(registro,'{especificacao}','{\"gravadorId\":\"ausente\"}') where colecao='ativo_lixeira'");antes=await snapshot();await fail(db,restaurar);assert.equal(await snapshot(),antes);
 await db.exec("update painel_registros set registro=jsonb_set(registro,'{especificacao}','{}') where colecao='ativo_lixeira'");
 await db.exec(restaurar);assert.equal((await db.query("select count(*)::int n from painel_registros where colecao like '%lixeira' and id='cam'")).rows[0].n,0);assert.equal((await db.query("select registro->>'nome' nome from painel_registros where colecao='arquivo' and id='cam'")).rows[0].nome,'anexo.pdf');
}finally{await db.close();}});
test('restauração de legado só inverso conserva ausente, vazio e null; novos conflitos são recusados',{skip:!PGlite},async()=>{
 for(const formato of [{},{bemId:''},{bemId:null}]){const db=await banco();try{
  const legado={id:'pc',tipo:'informatica',categoria:'Computador',nome:'Legado',especificacao:{},...formato,_apagadoEm:'ontem'};
  const esperado={...legado};delete esperado._apagadoEm;
  await put(db,'patrimonio','A',{origemAtivoId:'pc'});
  // Nova inserção sem contexto da ficha retirada não ganha exceção.
  await fail(db,`insert into painel_registros(colecao,id,registro) values('ativo','pc','${JSON.stringify(esperado)}')`);
  await put(db,'ativo_lixeira','pc',legado);await put(db,'arquivo_lixeira','pc',{nome:'histórico.pdf'});
  await fail(db,`insert into painel_registros(colecao,id,registro) values('ativo','pc','${JSON.stringify({...esperado,nome:'Outro conteúdo'})}')`);
  const snapshot=async()=>JSON.stringify((await db.query('select * from painel_registros order by colecao,id')).rows);
  const restaurar="select painel_ativo_restaurar('pc',null)";
  await put(db,'patrimonio','B',{origemAtivoId:'pc'});let antes=await snapshot();await fail(db,restaurar);assert.equal(await snapshot(),antes);await db.exec("delete from painel_registros where colecao='patrimonio' and id='B'");
  // Conflito legado anterior às guardas, sem reconciliar automaticamente.
  await db.exec("alter table painel_registros disable trigger user;insert into painel_registros(colecao,id,registro) values('ativo','outro','{\"tipo\":\"informatica\",\"bemId\":\"A\"}');alter table painel_registros enable trigger user;");
  antes=await snapshot();await fail(db,restaurar);assert.equal(await snapshot(),antes);await db.exec("delete from painel_registros where colecao='ativo' and id='outro'");
  await db.exec(restaurar);
  let salvo=(await db.query("select registro from painel_registros where colecao='ativo' and id='pc'")).rows[0].registro;assert.deepEqual(salvo,esperado);
  assert.equal((await db.query("select registro->>'origemAtivoId' origem from painel_registros where colecao='patrimonio' and id='A'")).rows[0].origem,'pc');
  assert.equal((await db.query("select registro->>'nome' nome from painel_registros where colecao='arquivo' and id='pc'")).rows[0].nome,'histórico.pdf');
  await db.exec("update painel_registros set registro=registro||'{\"nome\":\"Legado editado\"}' where colecao='ativo' and id='pc'");
  salvo=(await db.query("select registro from painel_registros where colecao='ativo' and id='pc'")).rows[0].registro;assert.deepEqual(salvo,{...esperado,nome:'Legado editado'});
  await put(db,'patrimonio','B',{});
  await fail(db,`update painel_registros set registro=jsonb_set(registro,'{bemId}','"B"') where colecao='ativo' and id='pc'`);
  // Vínculo direto válido pode ser explicitado; limpar depois continua proibido.
  await db.exec(`update painel_registros set registro=jsonb_set(registro,'{bemId}','"A"') where colecao='ativo' and id='pc'`);
  for(const valor of ['""','null'])await fail(db,`update painel_registros set registro=jsonb_set(registro,'{bemId}','${valor}') where colecao='ativo' and id='pc'`);
  await fail(db,"update painel_registros set registro=registro-'bemId' where colecao='ativo' and id='pc'");
 }finally{await db.close();}}
});
