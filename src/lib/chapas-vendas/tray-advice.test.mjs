import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPlan,suggestTrays} from './planner.mjs';
import {createTrayAdvisor} from './tray-advice.mjs';

function fixture(){
 const p=initialPlan();
 Object.assign(p.rows[0],{id:'first',width:13500,height:2500,quantity:1,directional:true,folded:true});
 return p;
}
function counted(maxEntries=100){
 let calls=0;
 const advise=createTrayAdvisor({maxEntries,compute:(_input,row)=>({call:++calls,patch:{width:row.width},alternatives:[{count:12}]})});
 return {advise,get calls(){return calls;}};
}
test('identical rows share work despite different IDs and descriptive plan metadata',()=>{
 const p=fixture(),c=counted(),first=c.advise(p,p.rows[0]);
 for(let i=1;i<=30;i++){
  const input={...p,name:`Projeto ${i}`,planId:`plan-${i}`,planNumber:`PC-${i}`,client:`Cliente ${i}`,requester:`Pessoa ${i}`,draftRevision:i,draftUpdatedAt:String(i),reserves:{irrelevant:i}};
  assert.deepEqual(c.advise(input,{...p.rows[0],id:`row-${i}`,description:`Descrição ${i}`}),first);
 }
 assert.equal(c.calls,1);
});
test('geometry, material, stock and remnant inventory invalidate cached alternatives',()=>{
 const p=fixture(),c=counted();c.advise(p,p.rows[0]);
 const cases=[
  [{...p}, {...p.rows[0],width:13400}],
  [{...p}, {...p.rows[0],quantity:2}],
  [{...p}, {...p.rows[0],left:40}],
  [{...p}, {...p.rows[0],folded:false}],
  [{...p}, {...p.rows[0],panelsX:12}],
  [{...p}, {...p.rows[0],directional:false}],
  [{...p}, {...p.rows[0],manufacturer:'Outra marca'}],
  [{...p}, {...p.rows[0],sku:'Outra referência'}],
  [{...p}, {...p.rows[0],coating:'pvdf'}],
  [{...p}, {...p.rows[0],colorName:'Outra cor'}],
  [{...p,stock:{...p.stock,width:1500}},p.rows[0]],
  [{...p,stock:{...p.stock,trim:20}},p.rows[0]],
  [{...p,stock:{...p.stock,kerf:8}},p.rows[0]],
  [{...p,stock:{...p.stock,rotation:false}},p.rows[0]],
  [{...p,stock:{...p.stock,materialKey:'incompatible'}},p.rows[0]],
  [{...p,remnants:[{id:'rt',width:1200,length:2600,quantity:1,material:p.material}]},p.rows[0]],
 ];
 for(const [input,row] of cases)c.advise(input,row);
 assert.equal(c.calls,cases.length+1);
});
test('renaming a remnant reuses work, but invalid labels and changed inventory do not',()=>{
 const p=fixture(),c=counted(),r={id:'rt',name:'Retalho A',width:1200,length:2600,quantity:1,material:p.material};
 const use=patch=>c.advise({...p,remnants:[{...r,...patch}]},p.rows[0]);
 use({});use({name:'Retalho B'});assert.equal(c.calls,1);
 use({name:'x'.repeat(121)});assert.equal(c.calls,2);
 use({quantity:2});use({width:1220});use({length:3000});use({material:{...p.material,coating:'pvdf'}});
 assert.equal(c.calls,6);
 // Duplicate inventory identities must still reach the planner's validation.
 c.advise({...p,remnants:[r,{...r}]},p.rows[0]);
 assert.equal(c.calls,7);
});
test('cache copies cannot be mutated by a caller and recently used entries survive eviction',()=>{
 const p=fixture(),c=counted(2),row=p.rows[0];
 const first=c.advise(p,row);
 first.patch.width=1;first.alternatives[0].count=999;
 assert.equal(c.advise(p,row).patch.width,13500);
 assert.equal(c.advise(p,row).alternatives[0].count,12);
 c.advise(p,{...row,width:13400});
 c.advise(p,row);
 c.advise(p,{...row,width:13300});
 assert.equal(c.calls,3);
 c.advise(p,row);assert.equal(c.calls,3);
 c.advise(p,{...row,width:13400});assert.equal(c.calls,4);
 assert.throws(()=>createTrayAdvisor({maxEntries:101}));
 assert.throws(()=>createTrayAdvisor({maxEntries:0}));
});
test('undefined, null and invalid numbers do not collide in the cache',()=>{
 const p=fixture(),c=counted();
 for(const directional of [undefined,null,NaN,Infinity,['undefined']])c.advise(p,{...p.rows[0],directional});
 assert.equal(c.calls,5);
});
test('real alternatives match the planner and retain invalid-input validation',()=>{
 const p=fixture(),advise=createTrayAdvisor();
 assert.deepEqual(advise(p,p.rows[0]),suggestTrays(p,p.rows[0]));
 const identical={...p.rows[0],id:'second',description:'Outra descrição'};
 assert.deepEqual(advise(p,identical),suggestTrays(p,identical));
 const invalid={...p.rows[0],directional:NaN};
 assert.equal(advise(p,invalid),suggestTrays(p,invalid));
 const partial={...p.rows[0],width:null};
 assert.equal(advise(p,partial),null);
 assert.equal(advise(p,partial),null);
});
