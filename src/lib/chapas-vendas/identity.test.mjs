import test from 'node:test';import assert from 'node:assert/strict';
import {identifyPlan,saveDraft,readDraft,listDrafts} from './identity.mjs';
import {initialPlan,calculatePlan} from './planner.mjs';import {purchasePDF} from './pdf.mjs';
const storage=()=>{const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('plan identity stays independent of order and survives editing and reopening',()=>{
 const s=storage(),p=identifyPlan(initialPlan(),{requester:'Pessoa exemplo',date:new Date('2026-10-19T12:00:00Z'),uuid:'12345678-1234-4567-8123-123456789abc'});
 p.order={number:'OS-DEMO',client:'Cliente exemplo',company:'Empresa exemplo',id:'demo'};
 saveDraft(s,'user-a',p);const restored=readDraft(s,'user-a');assert.deepEqual(restored,p);assert.equal(readDraft(s,'user-b'),null);assert.deepEqual(listDrafts(s,'user-b'),[]);
 assert.equal(identifyPlan(restored).planNumber,p.planNumber);assert.notEqual(p.planNumber,p.order.number);
 restored.rows[0].width=500;saveDraft(s,'user-a',restored);assert.equal(readDraft(s,'user-a').planNumber,p.planNumber);
 const second=identifyPlan(initialPlan());saveDraft(s,'user-a',second);assert.equal(listDrafts(s,'user-a').length,2);assert.equal(readDraft(s,'user-a',p.planId).requester,'Pessoa exemplo');
 const pdf=Buffer.from(purchasePDF(p,calculatePlan(p))).toString('latin1');for(const v of [p.planNumber,'Solicitado por: Pessoa exemplo','O.S. #OS-DEMO'])assert.ok(pdf.includes(v),v);
});
test('storage failures are surfaced and corrupt saved data is retained',()=>{
 assert.throws(()=>saveDraft({setItem(){throw Error('full');}},'a',identifyPlan(initialPlan())),/full/);
 const s=storage();s.setItem('impresilk.chapas-vendas.v1.a.active','broken');s.setItem('impresilk.chapas-vendas.v1.a.broken','{');assert.throws(()=>readDraft(s,'a'));assert.equal(s.getItem('impresilk.chapas-vendas.v1.a.broken'),'{');
});
