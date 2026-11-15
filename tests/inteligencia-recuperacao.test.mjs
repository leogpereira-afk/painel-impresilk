import test from 'node:test';
import assert from 'node:assert/strict';
import {carregarInteligencia} from '../scripts/carregar-inteligencia.mjs';
import {consultarPagina} from '../supabase/functions/_shared/inteligencia-consulta.mjs';
test('três 404 confirmam lista vazia, erro intermediário nunca confirma',async()=>{
 let n=0;const r=await consultarPagina({buscar:async()=>{n++;return {status:404,ok:false}},pausa:async()=>{}});assert.deepEqual(r,[]);assert.equal(n,3);
 await assert.rejects(consultarPagina({buscar:async()=>({status:429,ok:false}),pausa:async()=>{}}),/429/);
});
test('detalhe inexistente não vira lista vazia',async()=>{await assert.rejects(consultarPagina({buscar:async()=>({status:404,ok:false}),lista:false,pausa:async()=>{}}),/404/)});
test('retoma corte antigo do mesmo período antes de iniciar novo',async()=>{
 const p={desde:'2026-11-01',ate:'2026-11-30',corte:'2026-11-15'};let j={...p,corte:'2026-11-01',fonte:'nfe',situacao:'erro'};const eventos=[];
 const call=async b=>{eventos.push(b.action);if(b.action==='avancar')j={...j,situacao:'concluida'};if(b.action==='iniciar')j={...p,fonte:b.fonte,situacao:'andamento'};return {carga:j}};
 await carregarInteligencia({...p,call,pausa:async()=>{}});assert.equal(eventos.indexOf('avancar')<eventos.indexOf('iniciar'),true);assert.equal(j.fonte,'detalhes');assert.equal(j.corte,p.corte);
});

test('dois 404 seguidos de 429 preservam falha, nunca lista vazia',async()=>{
 const status=[404,404,429];let n=0;
 await assert.rejects(consultarPagina({buscar:async()=>({status:status[n++],ok:false}),pausa:async()=>{}}),/429/);
 assert.equal(n,3);
});
