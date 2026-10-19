import {test} from 'node:test';
import assert from 'node:assert/strict';
import {periodoAvisos,avisosReunioes} from '../../../supabase/functions/_shared/reunioes-presenca.mjs';
const agora=new Date('2026-10-19T11:00:00Z');
const identidade={rhId:'rh-1'};
const encontro=(extra={})=>({id:'r1',titulo:'Reunião de exemplo',tipo:'reuniao',data:'2026-10-19',inicio:'09:00',fim:'10:00',situacao:'agendado',local:'Sala',ata:'SIGILO',participantes:[{id:'p1',rhId:'rh-1',nome:'SIGILO',presenca:'pendente'}],...extra});
test('aviso usa dia de São Paulo e horizonte de sete dias, inclusive na virada UTC',()=>{
 assert.deepEqual(periodoAvisos(new Date('2026-11-01T01:30:00Z')),{hoje:'2026-10-31',ate:'2026-11-07',hora:'22:30'});
});
test('aviso inclui apenas convites da pessoa, próximos e não cancelados, sem ata ou nomes',()=>{
 const rows=[encontro(),encontro({id:'outro',participantes:[{rhId:'rh-2',presenca:'pendente'}]}),encontro({id:'cancelado',situacao:'cancelado'}),encontro({id:'longe',data:'2026-10-27'}),encontro({id:'ontem',data:'2026-10-18'}),encontro({id:'realizado',situacao:'realizado'})];
 const result=avisosReunioes(rows,identidade,agora);assert.equal(result.length,1);assert.equal(result[0].id,'r1');assert.equal(result[0].quando,'Hoje');assert.equal(result[0].pendente,true);assert.ok(!JSON.stringify(result).includes('SIGILO'));assert.equal(avisosReunioes(rows,{rhId:null},agora).length,0);
});
test('aviso permanece até o fim para presentes; depois só lembra presença pendente de hoje',()=>{
 const presente=encontro({participantes:[{id:'p1',rhId:'rh-1',presenca:'presente'}]});
 assert.equal(avisosReunioes([presente],identidade,agora).length,1);
 const durante=new Date('2026-10-19T12:30:00Z');assert.equal(avisosReunioes([presente],identidade,durante)[0].quando,'Em andamento');
 const depois=new Date('2026-10-19T14:00:00Z');assert.equal(avisosReunioes([presente],identidade,depois).length,0);assert.equal(avisosReunioes([encontro()],identidade,depois)[0].quando,'Presença pendente de hoje');
});
