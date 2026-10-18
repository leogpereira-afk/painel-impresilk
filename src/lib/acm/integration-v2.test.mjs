import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from './model.mjs';
import {buildProject} from './engine.mjs';
test('piece fixing inherits nested restrictions before validation',()=>{
 const p=createProject();p.fixing.pattern={minEdgeDistance:20,cornerOffset:25};
 p.overrides['front-1-1']={fixing:{pattern:{cornerOffset:5}}};
 assert.ok(validateProject(p).some(e=>e.code==='FIXING_EDGE_CONSTRAINT'));
 assert.equal(buildProject(p).valid,false);
});
test('piece pattern can inherit validation evidence without false rejection',()=>{
 const p=createProject();p.fixing.validated=true;p.fixing.pattern={minEdgeDistance:20,cornerOffset:25,source:'Ficha de teste',responsible:'Responsável fictício',validatedAt:'2026-10-17'};
 p.overrides['front-1-1']={fixing:{pattern:{cornerOffset:30}}};
 assert.deepEqual(validateProject(p),[]);
});
test('malformed partial fixing objects are rejected rather than spread away',()=>{
 for(const fixing of ['bad',{pattern:42},{screwProduct:'bad'},{tapeProduct:[]}]){
  const p=createProject();p.overrides['front-1-1']={fixing};assert.ok(validateProject(p).length);
 }
});
test('manual identifiers cannot become unsafe dotted update paths',()=>{
 for(const id of ['__proto__','constructor','prototype','foo.bar']){
  const p=createProject();p.layout.orientation='manual';p.layout.manual=[{id,surface:'front',x:0,y:0,width:p.front.width,height:p.front.height}];
  assert.ok(validateProject(p).some(e=>e.code==='MANUAL_ID'));
 }
});
