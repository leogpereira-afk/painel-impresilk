import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkshop,buildWorkshop,planWorkshop,moveWorkshopPlacement} from '../../lib/oficina/model.mjs';
import {calculateWorkshopPlan,barCutCSV} from './planning.mjs';
test('worker planning returns plan and preserves locked allocation across recalculation',()=>{
 const project=createWorkshop(),result=buildWorkshop(project,'mdf'),first=planWorkshop(project,result);
 const id=first.sheets[0].placements[0].pieceId;
 const locked=moveWorkshopPlacement(project,result,first,id,{locked:true});assert.equal(locked.valid,true);
 const next=calculateWorkshopPlan(project,'mdf',locked.plan);
 assert.equal(next.validation.valid,true);assert.equal(next.sheets[0].placements[0].locked,true);
 assert.deepEqual(next.sheets[0].placements[0],locked.plan.sheets[0].placements[0]);
});
test('bar cutting document includes all physical cuts and length conservation',()=>{
 const project=createWorkshop(),result=buildWorkshop(project,'metalon'),plan=planWorkshop(project,result);
 const text=barCutCSV(project,plan);assert.match(text,/Comprimento da barra/);assert.match(text,/6000/);assert.match(text,/740/);assert.match(text,/1200/);
 assert.equal(text.split('\n').filter(l=>l.includes('metalon-')).length,plan.bars.flatMap(b=>b.cuts).length);
});
