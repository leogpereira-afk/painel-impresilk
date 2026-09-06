import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proximoBackup, executarBackupsSequenciais} from '../supabase/functions/_shared/fila-backup.mjs';

test('backup diário retoma o próximo sistema e não repete os já concluídos',()=>{
 const dia='2026-09-06';
 const estado={painel:{ok:true,em:'2026-09-06T08:00:00Z'},pops:{ok:false,em:'2026-09-06T09:00:00Z'}};
 assert.equal(proximoBackup(['painel','pops','domo'],estado,dia),'domo');
 assert.equal(proximoBackup(['painel','pops'],estado,dia),'pops');
 assert.equal(proximoBackup(['painel'],estado,dia),null);
 assert.equal(proximoBackup(['painel'],estado,'2026-09-07'),'painel');
});
test('uma falha não impede tentar sistemas restantes; dia considera Brasília',()=>{
 const estado={a:{ok:false,em:'2026-09-06T08:00:00Z'},b:{ok:false,em:'2026-09-06T09:00:00Z'},c:{ok:true,em:'2026-09-06T01:00:00Z'}};
 assert.equal(proximoBackup(['a','b','c'],estado,'2026-09-06'),'c');
 assert.equal(proximoBackup(['a','b'],estado,'2026-09-06'),'a');
});
test('rodada manual usa uma requisição por sistema, aguarda cada resultado e informa falhas',async()=>{
 const chamadas=[],progresso=[];let ativas=0;
 const r=await executarBackupsSequenciais(['a','b','c'],async k=>{
  chamadas.push(k);assert.equal(++ativas,1);await Promise.resolve();ativas--;
  if(k==='b')throw new Error('Conexão interrompida');
  return {sistemas:{[k]:{ok:true,registros:2},antigo:{ok:true}}};
 },p=>progresso.push(p));
 assert.deepEqual(chamadas,['a','b','c']);assert.deepEqual(Object.keys(r.sistemas),['a','b','c']);
 assert.equal(r.sistemas.b.ok,false);assert.equal(r.sistemas.c.ok,true);assert.equal(progresso.length,3);
});
test('não trata ausência de confirmação como sucesso',async()=>{
 const r=await executarBackupsSequenciais(['a'],async()=>({sistemas:{a:{ok:true,em:'velho'}}}));
 assert.equal(r.sistemas.a.ok,true);
 const sem=await executarBackupsSequenciais(['a'],async()=>({sistemas:{}}));
 assert.equal(sem.sistemas.a.ok,false);
 await assert.rejects(executarBackupsSequenciais([],async()=>{}),/Nenhum sistema/);
});

test('rodada manual continua as partes até a confirmação final',async()=>{
 let chamadas=0;const eventos=[];
 const r=await executarBackupsSequenciais(['grande'],async()=>{chamadas++;return {sistemas:{grande:{ok:chamadas===3,emAndamento:chamadas<3,partes:chamadas}}};},p=>eventos.push(p));
 assert.equal(chamadas,3);assert.equal(r.sistemas.grande.ok,true);assert.equal(eventos.at(-1).parte,2);
});
