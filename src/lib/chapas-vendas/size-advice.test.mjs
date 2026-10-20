import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPlan,calculatePlan} from './planner.mjs';
import {suggestSizeReduction} from './size-advice.mjs';

test('suggests a small precise reduction without changing the project',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:1000,height:1000,quantity:5});
 const copy=structuredClone(input),advice=suggestSizeReduction(input);
 assert.ok(advice.length);assert.deepEqual(input,copy);
 const a=advice[0];assert.ok(a.reduction>0&&a.reduction<=100);
 const next=calculatePlan({...input,rows:[{...input.rows[0],...a.patch}]});
 assert.ok(next.valid);assert.ok(next.total<calculatePlan(input).total);
 assert.ok(a.newCapacity>a.oldCapacity);
});
test('respects direction and folds, suggests fit for a slightly oversized blank',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:1160,height:800,quantity:1,folded:true,directional:true,left:30,right:30,top:30,bottom:30});
 const a=suggestSizeReduction(input)[0];assert.ok(a);
 assert.equal(a.axis,'width');assert.equal(a.suggested,1140);
 assert.ok(a.fits);assert.equal(calculatePlan({...input,rows:[{...input.rows[0],...a.patch}]}).valid,true);
 assert.equal(input.rows[0].left,30);
});
test('does not offer oversized reductions, invalid dimensions, or columns',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:1400,height:600,directional:true});
 assert.deepEqual(suggestSizeReduction(input),[]);
 input.rows[0].width=null;assert.deepEqual(suggestSizeReduction(input),[]);
 Object.assign(input.rows[0],{width:1000,kind:'column'});assert.deepEqual(suggestSizeReduction(input),[]);
});
test('the 10 cm bound is inclusive and is never exceeded for a slightly larger mismatch',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:1300,height:1000,directional:true});
 const a=suggestSizeReduction(input)[0];
 assert.ok(a);assert.equal(a.reduction,100);assert.equal(a.suggested,1200);assert.equal(a.fits,true);
 input.rows[0].width=1300.1;assert.deepEqual(suggestSizeReduction(input),[]);
});
test('malformed drafts fail closed without throwing or proposing changes',()=>{
 for(const input of [null,undefined,{},[],{rows:[]},{rows:[null]},{rows:[{}]}, {...initialPlan(),stock:null}, {...initialPlan(),stock:{width:1220,length:5000,trim:10,kerf:4,rotation:'yes'}}]){
  assert.doesNotThrow(()=>suggestSizeReduction(input));
  assert.deepEqual(suggestSizeReduction(input),[]);
 }
 for(const patch of [{quantity:0},{quantity:1201},{manufacturer:{}},{coating:'invalid'},{directional:'false'}]){
  const input=initialPlan();Object.assign(input.rows[0],{width:1000,height:1000,quantity:5},patch);
  assert.deepEqual(suggestSizeReduction(input),[]);
 }
});
test('capacity above 100 is verified by the real engine rather than silently capped',()=>{
 const input=initialPlan();input.stock={width:1000,length:1000,trim:0,kerf:0,rotation:false};
 Object.assign(input.rows[0],{width:100,height:100,quantity:1200});
 const before=structuredClone(input),a=suggestSizeReduction(input)[0];
 assert.ok(a);assert.equal(a.oldCapacity,100);assert.ok(a.newCapacity>100);assert.ok(a.savedSheets>0);
 assert.deepEqual(input,before);assert.ok(a.reduction<=100);
 const check=calculatePlan({...input,rows:[{...input.rows[0],...a.patch,quantity:a.newCapacity}],remnants:[],reserves:{}});
 assert.equal(check.valid,true);assert.equal(check.total,1);
 const full=calculatePlan({...input,rows:[{...input.rows[0],...a.patch}]});
 assert.equal(a.savedSheets,calculatePlan(input).total-full.total);
});
test('advice changes only one measured dimension and retains folds, material and reserves',()=>{
 const input=initialPlan();
 Object.assign(input.rows[0],{width:1260,height:1000,quantity:1,folded:true,left:20,right:20,top:40,bottom:50,directional:true,colorId:'vermelho',manufacturer:'Marca fictícia',sku:'REF-FICT',colorName:'Cor fictícia'});
 const before=structuredClone(input),a=suggestSizeReduction(input)[0];
 assert.ok(a);assert.equal(a.suggested,1160);assert.equal(a.reduction,100);assert.deepEqual(Object.keys(a.patch),['width']);
 const next={...input.rows[0],...a.patch},plan=calculatePlan({...input,rows:[next]});
 assert.equal(plan.valid,true);assert.equal(plan.rows[0].blank.width,1200);assert.equal(plan.rows[0].blank.height,1090);
 for(const k of ['left','right','top','bottom','directional','colorId','manufacturer','sku','colorName'])assert.equal(next[k],before.rows[0][k]);
 assert.deepEqual(input,before);
});
test('manual division and invalid other pieces are never bypassed by size advice',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:2000,height:1000,quantity:5,panelsX:2});
 assert.deepEqual(suggestSizeReduction(input),[]);
 input.rows[0].panelsX=1;input.rows[0].width=1000;
 input.rows.push({...input.rows[0],id:'invalid-other',quantity:0});
 assert.deepEqual(suggestSizeReduction(input),[]);
});
test('a demonstrated capacity improvement is allowed without falsely promising purchasing savings',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:1000,height:1000,quantity:1});
 const before=calculatePlan(input),a=suggestSizeReduction(input)[0];assert.ok(a);
 assert.equal(a.savedSheets,0);assert.equal(a.sheets,before.total);assert.ok(a.newCapacity>a.oldCapacity);
 assert.equal(a.fits,false);
});
test('a whole part already supplied by a remnant does not receive a false fit or capacity recommendation',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:1300,height:1000,directional:true,quantity:1});
 input.remnants=[{id:'wide-offcut',name:'Retalho maior',width:1400,length:1100,quantity:1,material:{...input.material,directional:true}}];
 const before=structuredClone(input),plan=calculatePlan(input);
 assert.equal(plan.valid,true);assert.equal(plan.total,0);assert.equal(plan.remnantsUsed,1);
 assert.deepEqual(suggestSizeReduction(input),[]);
 assert.deepEqual(input,before);
 // A separately requested new-sheet reserve does not make the shrink useful.
 input.reserves[plan.groups[0].key]=1;
 assert.equal(calculatePlan(input).total,1);
 assert.deepEqual(suggestSizeReduction(input),[]);
});
test('purchase by another row does not make a remnant-only size reduction useful',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{id:'covered',width:1300,height:1000,directional:true,quantity:1});
 input.remnants=[{id:'wide-offcut',width:1400,length:1100,quantity:1,material:{...input.material,directional:true}}];
 input.rows.push({...input.rows[0],id:'buy',width:1000,height:1000,colorId:'preto',quantity:5});
 assert.equal(calculatePlan(input).valid,true);
 const advice=suggestSizeReduction(input);
 assert.ok(advice.some(a=>a.rowId==='buy'&&a.savedSheets>0));
 assert.ok(advice.every(a=>a.rowId!=='covered'));
});
test('projects above 30 rows retain early suggestions within the bounded search',()=>{
 for(const count of [31,100]){
  const input=initialPlan();Object.assign(input.rows[0],{id:'early',width:1000,height:1000,quantity:5,directional:true});
  input.rows.push(...Array.from({length:count-1},(_,i)=>({...input.rows[0],id:`small-${i}`,width:10,height:10,quantity:1})));
  const copy=structuredClone(input),advice=suggestSizeReduction(input);
  assert.ok(advice.some(a=>a.rowId==='early'&&a.savedSheets>0),`${count} rows`);
  assert.ok(advice.length<=3);assert.deepEqual(input,copy);
 }
 const input=initialPlan();input.rows=Array.from({length:101},(_,i)=>({...input.rows[0],id:`over-${i}`}));
 assert.deepEqual(suggestSizeReduction(input),[]);
});
