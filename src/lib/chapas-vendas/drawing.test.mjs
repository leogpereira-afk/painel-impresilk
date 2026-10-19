import test from 'node:test';
import assert from 'node:assert/strict';
import {placedDrawing} from './drawing.mjs';
import {initialPlan,calculatePlan} from './planner.mjs';
test('asymmetric folds follow placement and quarter-turn without changing size',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:400,height:600,folded:true,left:20,right:40,top:50,bottom:30});
 const piece=calculatePlan(input).pieces[0];
 for(const rotated of [false,true]){
  const p={x:10,y:70,rotated},d=placedDrawing(piece,p);
  assert.equal(d.folds.length,4);
  const xs=d.contour.map(v=>v[0]),ys=d.contour.map(v=>v[1]);
  assert.equal(Math.min(...xs),70);assert.equal(Math.min(...ys),10);
  assert.equal(Math.max(...xs)-70,rotated?piece.blank.width:piece.blank.height);
  assert.equal(Math.max(...ys)-10,rotated?piece.blank.height:piece.blank.width);
  const g=piece.blank.grooves[0];
  assert.deepEqual(d.folds[0].a,rotated?[70+g.x1,10+piece.blank.height-g.y1]:[70+g.y1,10+g.x1]);
 }
});
test('flat panels have no fold marks',()=>{const piece=calculatePlan(initialPlan()).pieces[0];assert.equal(placedDrawing(piece,{x:0,y:0,rotated:false}).folds.length,0);});
