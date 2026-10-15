import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('RPC real serializa duas criações no mesmo ID e preserva contato, versão e carteira do vencedor',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table painel_ordens(id text);create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');
  await db.exec(await readFile(new URL('../supabase/migrations/20261007_comercial.sql',import.meta.url),'utf8'));
  const sql='select public.painel_comercial_salvar_acao($1,$2,$3::jsonb,$4,$5,$6::text[]) as acao';
  const registro=relato=>({id:'pv-id-canonico-ficticio',tipoAcao:'pos_venda',ordemId:'pedido-ficticio',vendedorId:'v1',status:'pendente',descricao:'Conferir retorno',data:'2026-10-15',contatos:[{em:'2026-10-15T12:00:00Z',relatoAtendimento:relato}]});
  const resultados=await Promise.allSettled(['Primeiro atendimento fictício','Segundo atendimento fictício'].map(relato=>db.query(sql,['pv-id-canonico-ficticio','v1',JSON.stringify(registro(relato)),null,'autoria-ficticia',['v1']])));
  assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.filter(r=>r.status==='rejected').length,1);assert.match(resultados.find(r=>r.status==='rejected').reason.message,/Conflito de versão/);
  const antes=(await db.query("select registro from painel_registros where colecao='comercial_acoes'")).rows;assert.equal(antes.length,1);assert.equal(antes[0].registro.versao,1);assert.equal(antes[0].registro.contatos.length,1);assert.equal(antes[0].registro.historico.length,1);
  await assert.rejects(db.query(sql,['pv-id-canonico-ficticio','v2',JSON.stringify(registro('Não pode alterar o vencedor')),1,'outra-autoria',['v2']]),/Responsável fora do acesso/);
  assert.deepEqual((await db.query("select registro from painel_registros where colecao='comercial_acoes'")).rows,antes);
 }finally{await db.close();}
});
