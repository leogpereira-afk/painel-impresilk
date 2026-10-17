import test from 'node:test';
import assert from 'node:assert/strict';
import {calcularOrcamento as calc,FERRAMENTAS,ORIGEM_CNC} from './ferramentas-ia.mjs';
const exemplo={quantidade:10,material:100,perda:10,minutosMaquina:30,horaMaquina:120,minutosPreparacao:15,minutosAcabamento:45,horaTrabalho:30,terceiros:0,margem:20};
test('custos por lote, minutos convertidos e margem sobre venda',()=>{const r=calc(exemplo); assert.deepEqual(r.erros,{});assert.ok(Math.abs(r.custo-200)<1e-8);assert.ok(Math.abs(r.preco-250)<1e-8);assert.ok(Math.abs(r.unitario-25)<1e-8);assert.ok(Math.abs(r.resultado-50)<1e-8)});
test('zero explícito aceito, falta não vira zero',()=>{assert.ok(calc({...exemplo,material:''}).erros.material);assert.equal(calc({...exemplo,material:0,margem:0}).preco,90)});
test('rejeita quantidade fracionária, negativa e margem impossível',()=>{for(const quantidade of [0,-1,1.5,Infinity]) assert.ok(calc({...exemplo,quantidade}).erros.quantidade);for(const margem of [100,110,-1,NaN]) assert.ok(calc({...exemplo,margem}).erros.margem)});
test('dados incompletos e overflow não geram orçamento',()=>{assert.equal(Object.keys(calc({}).erros).length,10);assert.ok(Object.keys(calc({...exemplo,material:1e308}).erros).length)});
test('sete ferramentas com destinos fixos e guia',()=>{assert.equal(FERRAMENTAS.length,7);assert.equal(new Set(FERRAMENTAS.map(f=>f.id)).size,7);for(const f of FERRAMENTAS){assert.equal(new URL(f.url).origin,ORIGEM_CNC);assert.equal(f.passos.length,3);assert.equal(f.conferir.length,3)}});

test('nova permissão reconhecida, sem conceder acesso por outro módulo',async()=>{const {somenteValidos}=await import('./modulos.js');assert.deepEqual(somenteValidos(['ferramenta-ia','modulo-inexistente']),['ferramenta-ia']);const {readFile}=await import('node:fs/promises');const auth=await readFile(new URL('../../supabase/functions/painel-auth/index.ts',import.meta.url),'utf8');assert.match(auth,/const MODULOS = \["ferramenta-ia"/);const app=await readFile(new URL('../App.jsx',import.meta.url),'utf8');assert.match(app,/<Restrito modulo="ferramenta-ia" sessao=\{sessao\}><FerramentaIA/)});
