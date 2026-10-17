import test from 'node:test';
import assert from 'node:assert/strict';
import {alinharComparacaoGrafica} from './comparacao-grafica.js';

const dia=data=>({data,de:data,ate:data,centavos:1});
const mes=(data,de,ate)=>({mes:data,de,ate,centavos:1});
const ano=(data,de,ate)=>({ano:data,de,ate,centavos:1});
const intervalo=(de,ate)=>{const xs=[];for(let d=de;d<=ate;d=new Date(Date.parse(d+'T12:00:00Z')+864e5).toISOString().slice(0,10))xs.push(dia(d));return xs;};
const alinhar=(atuais,anteriores,extra={})=>alinharComparacaoGrafica({atuais,anteriores,agrupamento:'dia',tipo:'anoAnterior',modo:'ano',...extra});

test('ano anterior diário mantém calendário após 29/02, sem deslocar março',()=>{
 const r=alinhar(intervalo('2024-02-28','2024-03-02'),intervalo('2023-02-28','2023-03-02'));
 assert.equal(r.disponivel,true);assert.deepEqual(r.pontos.map(p=>p?.data??null),['2023-02-28',null,'2023-03-01','2023-03-02']);
});
test('anterior em modo ano usa o mesmo alinhamento de calendário bissexto',()=>{
 const r=alinhar(intervalo('2024-02-28','2024-03-01'),intervalo('2023-02-28','2023-03-01'),{tipo:'anterior'});
 assert.equal(r.disponivel,true);assert.deepEqual(r.pontos.map(p=>p?.data??null),['2023-02-28',null,'2023-03-01']);
});
test('comparação mês a mês diário alinha dias do mês, preservando zero e lacuna conhecidos',()=>{
 const antigos=intervalo('2026-09-01','2026-09-17');antigos[3].centavos=0;antigos[8].centavos=null;
 const r=alinhar(intervalo('2026-10-01','2026-10-17'),antigos,{tipo:'anterior',modo:'mes'});
 assert.equal(r.disponivel,true);assert.equal(r.pontos[0].data,'2026-09-01');assert.equal(r.pontos[16].data,'2026-09-17');assert.equal(r.pontos[3].centavos,0);assert.equal(r.pontos[8].centavos,null);
});
test('31 de mês não herda valor do mês seguinte quando anterior termina em 30',()=>{
 const r=alinhar(intervalo('2026-10-01','2026-10-31'),intervalo('2026-09-01','2026-09-30'),{tipo:'anterior',modo:'mes'});
 assert.equal(r.disponivel,true);assert.equal(r.pontos[30],null);
});
test('janeiro compara dezembro anterior por dia do mês',()=>{
 const r=alinhar(intervalo('2026-01-01','2026-01-17'),intervalo('2025-12-01','2025-12-17'),{tipo:'anterior',modo:'mes'});
 assert.equal(r.disponivel,true);assert.equal(r.pontos[0].data,'2025-12-01');
});
test('custom mensal não sobrepõe blocos com durações diferentes',()=>{
 const r=alinhar([mes('2026-09','2026-09-20','2026-09-30'),mes('2026-10','2026-10-01','2026-10-10')],[mes('2026-08','2026-08-30','2026-08-31'),mes('2026-09','2026-09-01','2026-09-19')],{tipo:'anterior',modo:'personalizado',agrupamento:'mes'});
 assert.equal(r.disponivel,false);assert.equal(r.pontos,null);assert.match(r.motivo,/Dia/);
});
test('custom diário alinha offsets exatos entre intervalos',()=>{
 const r=alinhar(intervalo('2026-09-20','2026-10-10'),intervalo('2026-08-30','2026-09-19'),{tipo:'anterior',modo:'personalizado'});
 assert.equal(r.disponivel,true);assert.equal(r.pontos[0].data,'2026-08-30');assert.equal(r.pontos[20].data,'2026-09-19');
});
test('custom anual só permite blocos com mesma duração e offset',()=>{
 const r=alinhar([ano('2025','2025-12-20','2025-12-31'),ano('2026','2026-01-01','2026-01-10')],[ano('2025','2025-11-28','2025-12-19')],{tipo:'anterior',modo:'personalizado',agrupamento:'ano'});
 assert.equal(r.disponivel,false);assert.match(r.motivo,/Dia/);
 const ok=alinhar([ano('2026','2026-10-01','2026-10-10')],[ano('2025','2025-10-01','2025-10-10')],{modo:'personalizado',agrupamento:'ano'});assert.equal(ok.disponivel,true);
});
test('custom mensal equivalente conserva o objeto e todas as informações de origem',()=>{
 const anteriores=[mes('2025-09','2025-09-20','2025-09-30'),mes('2025-10','2025-10-01','2025-10-10')];anteriores[0].completo=false;
 const r=alinhar([mes('2026-09','2026-09-20','2026-09-30'),mes('2026-10','2026-10-01','2026-10-10')],anteriores,{modo:'personalizado',agrupamento:'mes'});
 assert.equal(r.disponivel,true);assert.equal(r.pontos[0],anteriores[0]);assert.equal(r.pontos[0].completo,false);
});
test('meses e anos mapeiam as próprias chaves no ano anterior',()=>{
 const r=alinhar([mes('2026-01','2026-01-01','2026-01-31'),mes('2026-02','2026-02-01','2026-02-28')],[mes('2025-01','2025-01-01','2025-01-31'),mes('2025-02','2025-02-01','2025-02-28')],{agrupamento:'mes'});
 assert.equal(r.disponivel,true);assert.deepEqual(r.pontos.map(p=>p.mes),['2025-01','2025-02']);
 const anual=alinhar([ano('2026','2026-01-01','2026-10-17')],[ano('2025','2025-01-01','2025-10-17')],{agrupamento:'ano'});assert.equal(anual.pontos[0].ano,'2025');
});
test('modo mês agrupado por ano compara os meses contidos, não inventa ano completo',()=>{
 const r=alinhar([ano('2026','2026-10-01','2026-10-17')],[ano('2026','2026-09-01','2026-09-17')],{tipo:'anterior',modo:'mes',agrupamento:'ano'});
 assert.equal(r.disponivel,true);assert.equal(r.pontos[0].de,'2026-09-01');assert.equal(r.pontos[0].ate,'2026-09-17');
});
test('todos os anos não compara e entrada vazia/ambígua não fabrica pontos',()=>{
 assert.equal(alinhar([dia('2026-01-01')],[dia('2025-01-01')],{modo:'todos'}).disponivel,false);
 assert.equal(alinhar([],[]).disponivel,false);
 assert.equal(alinhar([dia('2026-01-01')],[dia('2025-01-01'),dia('2025-01-01')]).disponivel,false);
 assert.equal(alinhar([dia('2026-01-01')],[dia('2025-02-01')]).disponivel,false);
});
