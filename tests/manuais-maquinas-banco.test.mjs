import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migrations=new URL('../supabase/migrations/',import.meta.url);
const ler=n=>readFileSync(new URL(n,migrations),'utf8');
async function banco(){
 const db=new PGlite();
 await db.exec('create role anon;create role authenticated;create role service_role;');
 const init=ler('0001_init.sql');await db.exec(init.slice(init.indexOf('create table if not exists public.painel_registros'),init.indexOf('create table if not exists public.painel_config_global')));
 await db.exec(ler('20260906_proteger_registro_retirado.sql'));
 const acl=ler('20260906_auditoria_integridade.sql');
 // Aplicamos as permissões da função vigente isoladamente, sem inventar uma
 // policy de teste. A tabela mantém RLS e ausência de políticas de cliente.
 for(const linha of acl.split('\n').filter(l=>/^(revoke all|grant execute)/.test(l)&&l.includes('painel_registro_gravar')))await db.exec(linha.replace(/public\.painel_config_mesclar\(jsonb,jsonb\),|,public\.painel_restaurar_atomico\(jsonb\)/g,''));
 return db;
}
const gravar=(db,novo,anterior,id='ativo:maquina-teste')=>db.query('select painel_registro_gravar($1,$2,$3,$4) as manual',['manuais_maquinas',id,novo,anterior]);
test('CAS PostgreSQL real compara JSON completo, cria uma vez e conserva história concorrente',async()=>{
 const db=await banco();try{
  const primeiro={estado:'rascunho',atualizadoEm:'v1',conteudo:{modelo:'Teste'},historico:[]};await gravar(db,primeiro,null);
  await assert.rejects(gravar(db,{...primeiro,conteudo:{modelo:'Outra criação'}},null),e=>e.code==='40001');
  const segundo={...primeiro,atualizadoEm:'v2',historico:[primeiro],conteudo:{modelo:'Revisado'}};await gravar(db,segundo,primeiro);
  const concorrente={...segundo,atualizadoEm:'v3',historico:[primeiro,segundo]};await gravar(db,concorrente,segundo);
  await assert.rejects(gravar(db,{...segundo,atualizadoEm:'v4'},segundo),e=>e.code==='40001');
  assert.deepEqual((await db.query("select registro from painel_registros where colecao='manuais_maquinas'")).rows[0].registro,concorrente);
 }finally{await db.close();}
});
test('RLS e ACL vigentes bloqueiam leitura, escrita e RPC direta de anon/authenticated',async()=>{
 const db=await banco();try{
  await gravar(db,{conteudo:{seguranca:'restrito'},historico:[{conteudo:{operacao:'anterior'}}]},null);
  await db.exec('grant select,insert,update,delete on painel_registros to anon,authenticated;');
  for(const papel of ['anon','authenticated']){
   await db.exec(`set role ${papel}`);
   assert.equal((await db.query("select count(*)::int n from painel_registros where colecao='manuais_maquinas'")).rows[0].n,0);
   assert.equal((await db.query("update painel_registros set registro='{}' where colecao='manuais_maquinas' returning id")).rows.length,0);
   await assert.rejects(db.query("insert into painel_registros(colecao,id,registro) values('manuais_maquinas','novo','{}')"),e=>e.code==='42501');
   await assert.rejects(gravar(db,{conteudo:{}},null,'forjado'),e=>e.code==='42501');
   await db.exec('reset role');
  }
  assert.equal((await db.query('select count(*)::int n from painel_registros')).rows[0].n,1);
  await db.exec('set role service_role');assert.equal((await gravar(db,{conteudo:{modelo:'Servidor'}},null,'servidor')).rows[0].manual.conteudo.modelo,'Servidor');await db.exec('reset role');
 }finally{await db.close();}
});
