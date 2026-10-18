import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelsProject,buildPanelsProject} from './model.mjs';
import {buildPanels} from '../oficina/geometry.mjs';
import {displayTransform} from '../../components/oficina-placas/viewerGeometry.mjs';
const setup=(model,material='acrylic')=>{const p=createPanelsProject(),o=p.materials[material].objects[0];o.config.model=model;return [p,o];};
for(const material of ['acrylic','mdf'])test(`${material}: removable lid has actual skirt panels, per-side fit and inner dimensions`,()=>{
 const [p,o]=setup('removable-lid',material);Object.assign(o.config,{width:120,depth:90,height:60,measuredThickness:3,lidClearance:.4,lidHeight:15});
 const r=buildPanelsProject(p,material);assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.pieces.length,10);assert.deepEqual(r.objects[0].inner,{width:114,depth:84,height:57});
 const lid=r.pieces.find(p=>p.face==='lid');assert.equal(lid.width,126.8);assert.equal(lid.height,96.8);assert.equal(r.pieces.find(p=>p.face==='lid-skirt-left').width,90.8);
 o.config.dimensionMode='internal';const internal=buildPanelsProject(p,material);assert.deepEqual(internal.objects[0].inner,{width:120,depth:90,height:60});
});
test('old removable projects preserve original inset lid cuts until explicitly converted',()=>{
 const [p,o]=setup('removable-lid');delete o.config.lidHeight;delete o.config.lidClearance;
 const old=buildPanels({quantity:1,components:{acrylic:o.config}},'acrylic'),r=buildPanelsProject(p);assert.equal(r.pieces.length,6);assert.deepEqual(r.pieces.map(p=>p.contour),old.pieces.map(p=>p.contour));assert.match(r.warnings.join(' '),/antigo/);
});
for(const material of ['acrylic','mdf'])test(`${material}: hinge pins, round sockets and front stop are physical and angle changes only assembly`,()=>{
 const [p,o]=setup('hinged-lid',material);const closed=buildPanelsProject(p,material);assert.equal(closed.valid,true,closed.errors.join(';'));assert.equal(closed.pieces.length,9);
 const supports=closed.pieces.filter(p=>p.face.startsWith('hinge-support'));assert.equal(supports.length,2);assert.equal(supports[0].cutouts[0].length,96);
 const lid=closed.pieces.find(p=>p.face==='lid');assert.equal(lid.contour.length,8);assert.ok(lid.hinge.holeRadius>lid.hinge.pinRadius);
 const signature=closed.signature;for(let a=0;a<=100;a+=5){o.config.lidAngle=a;const r=buildPanelsProject(p,material),l=r.pieces.find(p=>p.face==='lid'),tr=displayTransform(l);assert.equal(r.signature,signature);assert.deepEqual(r.pieces.map(p=>[p.contour,p.cutouts,p.transform]),closed.pieces.map(p=>[p.contour,p.cutouts,p.transform]));
  // Body of lid (away from pins) remains above body for entire permitted sweep.
  for(const v of l.contour.filter(v=>v.x>0&&v.x<l.width)){const z=tr.origin[2]+tr.u[2]*v.x+tr.v[2]*v.y;assert.ok(z>=o.config.height-1e-7,`sweep ${a}: ${z}`);}
 }
 o.rotation=37;o.position={x:12,y:23,z:34};const rotated=buildPanelsProject(p,material).pieces.find(p=>p.face==='lid');assert.ok(Math.abs(rotated.hinge.direction[0]-Math.cos(37*Math.PI/180))<1e-8);
});
test('organizer optional lids retain complementary divider contours and coupons are real cut geometry',()=>{
 for(const lid of ['none','removable','hinged']){const [p,o]=setup('organizer');o.config.organizerLid=lid;const r=buildPanelsProject(p);assert.equal(r.valid,true,r.errors.join(';'));assert.ok(r.jointPairs.length>0);assert.equal(r.pieces.filter(p=>p.face==='lid').length,lid==='none'?0:1);}
 const [p,o]=setup('hinged-lid');o.config.calibrationCoupon=true;const r=buildPanelsProject(p);assert.equal(r.valid,true);assert.equal(r.pieces.filter(p=>p.face.startsWith('calibration')).length,2);
});
test('invalid finite values, unsupported router, undersized pivots and excessive angles block cuts',()=>{
 for(const changes of [{lidClearance:NaN},{pivotClearance:Infinity},{pivotClearance:0},{lidAngle:101},{width:20},{height:1},{process:'router'}]){const [p,o]=setup('hinged-lid');Object.assign(o.config,changes);const r=buildPanelsProject(p);assert.equal(r.valid,false,JSON.stringify(changes));assert.equal(r.pieces.length,0);}
 const [p,o]=setup('removable-lid');o.config.lidHeight=Infinity;assert.equal(buildPanelsProject(p).valid,false);
});
test('extra physical pieces are counted atomically and fabrication color changes the signature',()=>{
 const [p,o]=setup('hinged-lid');const r=buildPanelsProject(p),id=r.pieces[0].id;p.pieceExtras[id]=3;const extras=buildPanelsProject(p);assert.equal(extras.pieces[0].quantity,4);assert.notEqual(extras.signature,r.signature);o.config.color='#ffffff';assert.notEqual(buildPanelsProject(p).signature,extras.signature);p.pieceExtras[id]=2.5;assert.equal(buildPanelsProject(p).valid,false);
});
test('divider height recalculates matching half laps and blocks overflow',()=>{
 const [p,o]=setup('organizer');o.config.dividerHeight=40;o.config.organizerLid='hinged';let r=buildPanelsProject(p);assert.equal(r.valid,true,r.errors.join(';'));assert.ok(r.pieces.filter(p=>p.face.startsWith('divider-')).every(p=>p.height===40));assert.ok(r.jointPairs.every(j=>j.depthA===20&&j.depthB===20));o.config.dividerHeight=1000;r=buildPanelsProject(p);assert.equal(r.valid,false);
});
test('hinge SVG and DXF are identical at open/closed angles, including physical sockets',async()=>{
 const {exportPanelsDrawing}=await import('./workflow.mjs');const [p,o]=setup('hinged-lid');
 for(const format of ['svg','dxf']){const closed=exportPanelsDrawing(p,'acrylic',format);o.config.lidAngle=100;assert.equal(exportPanelsDrawing(p,'acrylic',format),closed);o.config.lidAngle=0;}
});
test('hinged organizer front stop clears all divider solids and supports the extended exported lid',async()=>{
 const {bounds3D}=await import('./geometry.mjs');
 const {exportPanelsDrawing}=await import('./workflow.mjs');
 for(const material of ['acrylic','mdf'])for(const height of [null,40]){
  const [p,o]=setup('organizer',material);o.config.organizerLid='hinged';o.config.dividerHeight=height;
  const r=buildPanelsProject(p,material);assert.equal(r.valid,true,r.errors.join(';'));
  const stop=r.pieces.find(p=>p.face==='lid-front-stop'),lid=r.pieces.find(p=>p.face==='lid'),sb=bounds3D([stop]),lb=bounds3D([lid]);
  for(const divider of r.pieces.filter(p=>p.face.startsWith('divider-'))){const db=bounds3D([divider]);const overlap=[0,1,2].every(i=>Math.min(db.max[i],sb.max[i])-Math.max(db.min[i],sb.min[i])>1e-6);assert.equal(overlap,false,`${material} ${height}: ${divider.face} intersects stop`);}
  assert.ok(sb.max[1]<=0,'stop attaches outside front wall');
  assert.ok(lb.min[1]<=sb.min[1],'lid extends over complete stop depth');assert.ok(Math.abs(lb.min[2]-sb.max[2])<1e-7,'closed lid physically rests on stop');
  assert.ok(Math.abs(lid.height-(o.config.depth+4.5*o.config.measuredThickness))<1e-7,'cut contour includes front overhang');
  for(const format of ['svg','dxf']){const closed=exportPanelsDrawing(p,material,format);assert.ok(closed.length>100);o.config.lidAngle=100;assert.equal(exportPanelsDrawing(p,material,format),closed);o.config.lidAngle=0;}
 }
});

test('invalid saved finger counts never silently fall back to seven teeth',()=>{
 for(const count of [null,undefined,1,2,32,3.5,NaN,Infinity]){const [p,o]=setup('open-box');o.config.joint='finger';o.config.fingerCount=count;const r=buildPanelsProject(p);assert.equal(r.valid,false,String(count));assert.equal(r.pieces.length,0);assert.match(r.errors.join(' '),/3 a 31|Número inválido/);}
 for(const count of [3,7,31]){const [p,o]=setup('open-box');o.config.joint='finger';o.config.fingerCount=count;const r=buildPanelsProject(p);assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.pieces.filter(p=>p.joint==='finger').length,4);}
});
for(const model of ['organizer','dividers'])test(`${model}: custom divider centers drive physical placement, complementary slots and exported contours`,async()=>{
 const {exportPanelsDrawing}=await import('./workflow.mjs');
 const [p,o]=setup(model);Object.assign(o.config,{columns:3,rows:3,dividerPositionsX:[40,160],dividerPositionsY:[35,120],dividerHeight:40,clearance:.2});
 const uniformProject=structuredClone(p);uniformProject.materials.acrylic.objects[0].config.dividerPositionsX=[];uniformProject.materials.acrylic.objects[0].config.dividerPositionsY=[];
 const r=buildPanelsProject(p),t=o.config.measuredThickness,offset=model==='organizer'?t:0;assert.equal(r.valid,true,r.errors.join(';'));
 assert.deepEqual(r.objects[0].cells.positionsX,[40,160]);assert.deepEqual(r.objects[0].cells.positionsY,[35,120]);assert.equal(r.objects[0].cells.nonUniform,true);
 const ds=r.pieces.filter(p=>p.face==='divider-depth'),ws=r.pieces.filter(p=>p.face==='divider-width');assert.ok(Math.abs(ds[0].transform.origin[0]-(offset+40-t/2))<1e-8);assert.ok(Math.abs(ws[1].transform.origin[1]-(offset+120-t/2))<1e-8);
 assert.deepEqual(ds[0].slots.map(s=>s.center),[35,120]);assert.deepEqual(ws[0].slots.map(s=>s.center),[40,160]);assert.ok(r.jointPairs.every(j=>j.depthA===20&&j.depthB===20));
 for(const format of ['svg','dxf'])assert.notEqual(exportPanelsDrawing(p,'acrylic',format),exportPanelsDrawing(uniformProject,'acrylic',format));
 const restored=buildPanelsProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored.pieces.map(p=>[p.contour,p.transform]),r.pieces.map(p=>[p.contour,p.transform]));
});
test('custom divider lists reject wrong count, unordered centers, edge invasions, overlapping thickness and malformed values',()=>{
 for(const values of [[50],[150,30],[1,150],[50,1000],[50,51],[50,Infinity],[50,'120'],'50,120']){const [p,o]=setup('organizer');o.config.dividerPositionsX=values;const r=buildPanelsProject(p);assert.equal(r.valid,false,JSON.stringify(values));assert.equal(r.pieces.length,0);}
 const [p,o]=setup('organizer');o.config.dividerPositionsX=[];o.config.dividerPositionsY=[];const r=buildPanelsProject(p);assert.equal(r.valid,true);assert.equal(r.objects[0].cells.positionsX.length,2);assert.equal(r.objects[0].cells.nonUniform,false);
});
