import {test} from 'node:test';
import assert from 'node:assert/strict';
import {idDemandaReuniao,prepararDemandaReuniao} from '../supabase/functions/_shared/reunioes-demanda.mjs';
import {prepararProcesso} from '../supabase/functions/_shared/processos.mjs';
const s={sub:'ana',perms:['reunioes','demandas']},pessoas=[{id:'rh1',nome:'Pessoa fictícia',area:'Financeiro',cargo:'Analista'}];
const reuniao={id:'r1',versao:'v1',criadoPor:'ana',situacao:'realizado',setor:'financeiro',decisoes:[{id:'d1',texto:'Plano fictício',responsavelRhId:'rh1',prazo:'2026-10-30'}],historico:[]};
test('identidade de demanda é estável, separa pares ambíguos e cabe no ID existente',async()=>{
 const id=await idDemandaReuniao('a_b','c');assert.match(id,/^reuniao_[a-f0-9]{64}$/);assert.notEqual(id,await idDemandaReuniao('a','b_c'));assert.equal(id,await idDemandaReuniao('a_b','c'));await assert.rejects(idDemandaReuniao('a/','c'));
});
test('converter monta registros independentes e carimbados usando dados confirmados',async()=>{
 const antes=structuredClone(reuniao),r=await prepararDemandaReuniao(reuniao,'d1',s,pessoas,'2026-10-26T12:00:00Z');assert.deepEqual(reuniao,antes);assert.equal(r.reuniao.decisoes[0].demandaId,r.demanda.id);assert.equal(r.demanda.criadoEm,'2026-10-26T12:00:00Z');assert.equal(r.demanda.envolvidos[0].nome,'Pessoa fictícia');assert.ok(r.reuniao.versao&&r.demanda.versao);assert.equal(r.reuniao.historico.length,1);
});
test('origem da demanda persiste na edição e não pode ser injetada na criação',async()=>{
 const {demanda}=await prepararDemandaReuniao(reuniao,'d1',s,pessoas);
 const editada=prepararProcesso({...demanda,versaoAnterior:demanda.versao,origemReuniaoId:'forjada',origemDecisaoId:'forjada'},demanda,s,pessoas);assert.equal(editada.origemReuniaoId,'r1');assert.equal(editada.origemDecisaoId,'d1');
 const nova=prepararProcesso({...demanda,id:'nova',versaoAnterior:null,origemReuniaoId:'forjada'},null,s,pessoas);assert.ok(!Object.hasOwn(nova,'origemReuniaoId'));assert.ok(!Object.hasOwn(nova,'origemDecisaoId'));
});
test('converter recusa reunião cancelada, decisão ausente, leitor, módulo ausente e vínculo pendente',async()=>{
 for(const [r,decisao,sessao,ps,status] of [[{...reuniao,situacao:'cancelado'},'d1',s,pessoas,422],[reuniao,'ausente',s,pessoas,404],[reuniao,'d1',{...s,sub:'bia'},pessoas,403],[reuniao,'d1',{...s,perms:['reunioes']},pessoas,403],[reuniao,'d1',s,[],422],[{...reuniao,decisoes:[{...reuniao.decisoes[0],demandaId:'existente'}]},'d1',s,pessoas,409]])await assert.rejects(prepararDemandaReuniao(r,decisao,sessao,ps),e=>e.status===status);
});
