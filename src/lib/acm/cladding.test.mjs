import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProject} from './engine.mjs';
import {createProject} from './model.mjs';
import {applyFlatCladding,claddingState,selectCladdingFixing} from './cladding.mjs';

test('legado pede escolhas sem alterar suas medidas ou abas',()=>{const p=createProject();delete p.cladding;const before=JSON.stringify(p);assert.equal(claddingState(p).incomplete,true);assert.equal(JSON.stringify(p),before)});
test('junta seca e bandeja são escolhas independentes',()=>{const p=createProject();p.cladding={panelForm:'tray',joint:'dry',exposure:'outdoor',fixingConfirmed:true};assert.equal(claddingState(p).incomplete,false);assert.equal(claddingState(p).hasFolds,true);assert.equal(claddingState(p).joint,'dry')});
test('sem junta em área externa e inconsistência plana não são silenciadas',()=>{const p=createProject();p.cladding={panelForm:'flat',joint:'butt',exposure:'outdoor'};assert.equal(claddingState(p).notices.length,2);assert.ok(claddingState(p).hasFolds)});
test('aplicar plana exige comando explícito e preserva overrides não geométricos',()=>{const p=createProject();p.overrides.p1={edges:{left:20},material:{color:'#ffffff'},locked:true};applyFlatCladding(p);assert.equal(claddingState(p).hasFolds,false);assert.deepEqual(p.overrides.p1,{material:{color:'#ffffff'},locked:true});assert.equal(p.cladding.panelForm,'flat')});
test('escolher junta seca não presume automaticamente folga válida',()=>{const p=createProject();p.layout.joint=0;p.cladding={joint:'dry'};assert.match(claddingState(p).notices.join(' '),/espaçamento positivo/);assert.equal(p.layout.joint,0)});

test('mudar fixação invalida conferência anterior sem apagar especificações',()=>{
 const f={type:'tape',validated:true,pattern:{source:'Ficha de teste'}};
 const changed=selectCladdingFixing(f,'screws');
 assert.equal(changed.validated,false);assert.equal(changed.type,'screws');assert.deepEqual(changed.pattern,f.pattern);assert.equal(f.type,'tape');
 assert.equal(selectCladdingFixing(f,'tape').validated,true);
});

test('dobras efetivas consideram todas as substituições planas das peças',()=>{
 const p=createProject();p.cladding.panelForm='flat';
 for(const piece of buildProject(p).pieces)p.overrides[piece.id]={edges:{left:0,right:0,top:0,bottom:0}};
 const state=claddingState(p,buildProject(p).pieces);
 assert.equal(state.hasFolds,false);assert.ok(!state.notices.some(s=>s.includes('ainda tem dobras')));
});
