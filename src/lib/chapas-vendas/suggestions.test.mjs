import test from 'node:test';import assert from 'node:assert/strict';
import {initialPlan,calculatePlan,suggestTrays} from './planner.mjs';
test('oversize directional frontage suggests fitting trays without mutating input',()=>{
 const p=initialPlan(),r=p.rows[0];Object.assign(r,{width:13500,height:2500,directional:true,quantity:2});const before=JSON.stringify(p),s=suggestTrays(p,r);
 assert.ok(s);assert.equal(s.count,12);assert.equal(s.patch.panelsX,12);assert.equal(s.patch.panelsY,1);assert.equal(JSON.stringify(p),before);
 const result=calculatePlan({...p,rows:[{...r,...s.patch}]});assert.ok(result.valid);assert.equal(result.pieces.length,24);assert.ok(result.rows.every(x=>x.blank.width<=1200&&x.blank.height<=4980));
});
test('fitting pieces stay whole; rotation, margins and folds are respected',()=>{
 const p=initialPlan(),r=p.rows[0];assert.equal(suggestTrays(p,r),null);
 Object.assign(r,{width:13500,height:2500,left:60,right:60,top:50,bottom:50});let s=suggestTrays(p,r);assert.ok(s);assert.ok(calculatePlan({...p,rows:[{...r,...s.patch}]}).valid);
 p.stock.trim=100;s=suggestTrays(p,r);assert.ok(s);assert.ok(calculatePlan({...p,rows:[{...r,...s.patch}]}).valid);
});
test('invalid data and columns are not silently converted',()=>{
 const p=initialPlan(),r=p.rows[0];r.width=null;assert.equal(suggestTrays(p,r),null);r.width=13500;r.quantity=0;assert.equal(suggestTrays(p,r),null);r.quantity=1;r.kind='column';assert.equal(suggestTrays(p,r),null);
});
