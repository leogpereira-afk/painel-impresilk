import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkshop,buildWorkshop,planWorkshop,estimateWorkshopCosts,cutSignature,isPlanCurrent,completeSets,slotGeometry,validateWorkshopPlan,validateWorkshop,moveWorkshopPlacement,unallocateWorkshopPlacement,allocateWorkshopPlacement,workshopProposals,reoptimizeWorkshopRemaining} from './model.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
test('open box exact measured thickness, embedded base and real inner dimensions',()=>{
 const p=createWorkshop(),r=buildWorkshop(p,'acrylic'); assert.equal(r.valid,true,r.errors.join(';'));
 assert.deepEqual(r.pieces.map(x=>[x.width,x.height]),[[300,150],[300,150],[193.6,150],[193.6,150],[293.6,193.6]]);
 assert.deepEqual(r.inner,{width:293.6,depth:193.6,height:146.8});
});
test('changing measured thickness preserves externally or internally controlled dimension',()=>{
 const p=createWorkshop();p.components.acrylic.measuredThickness=6;
 let r=buildWorkshop(p,'acrylic');assert.equal(r.dimensions.width,300);assert.equal(r.inner.width,288);
 p.components.acrylic.dimensionMode='internal';r=buildWorkshop(p,'acrylic');assert.equal(r.inner.width,300);assert.equal(r.dimensions.width,312);assert.equal(r.dimensions.height,156);
});
test('slot nominal geometry differs from ideal laser paths and never doubles compensation',()=>{
 const r=slotGeometry(3.2,.15,.2);close(r.nominalWidth,3.35);close(r.internalPathWidth,3.15);assert.equal(r.compensationLocation,'CAM');
});
test('dividers have exact cells and complementary half laps at intersections',()=>{
 const p=createWorkshop();Object.assign(p.components.mdf,{model:'dividers',width:300,depth:200,height:100,measuredThickness:3});
 const r=buildWorkshop(p,'mdf');assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.pieces.length,3);close(r.cells.width,98);close(r.cells.depth,98.5);
 assert.equal(r.pieces.filter(x=>x.face==='divider-depth').length,2);assert.equal(r.pieces.filter(x=>x.face==='divider-width').length,1);
 assert.deepEqual(r.pieces.map(x=>x.slots.length),[1,1,2]);assert.equal(r.pieces[0].slots[0].edge,'top');assert.equal(r.pieces[2].slots[0].edge,'bottom');
 close(r.pieces[0].slots[0].center,100);close(r.pieces[2].slots[0].center,99.5);
});
test('finger corners use complementary real contours and preserve external envelope',()=>{
 const p=createWorkshop();p.components.acrylic.joint='finger';const r=buildWorkshop(p,'acrylic');assert.equal(r.valid,true,r.errors.join(';'));
 assert.ok(r.pieces[0].contour.length>4);assert.ok(r.pieces[2].contour.length>4);assert.equal(r.pieces[2].width,200);assert.equal(r.pieces[4].width,293.6);
 assert.ok(r.assembly.join(' ').includes('base'));
});
test('metalon reuses frame, with horizontal full length and vertically inset members',()=>{
 const p=createWorkshop(),r=buildWorkshop(p,'metalon');assert.equal(r.valid,true,r.errors.join(';'));
 assert.deepEqual(r.structure.segments.map(x=>x.length).sort((a,b)=>b-a),[1200,1200,740,740]);assert.deepEqual(r.inner,{width:1140,depth:30,height:740});
 const plan=planWorkshop(p,r);assert.equal(plan.validation.valid,true,plan.validation.errors.join(';'));assert.equal(plan.bars.length,1);assert.equal(plan.bars[0].waste,2108);assert.equal(plan.bars[0].cuts.reduce((s,c)=>s+c.length+c.kerfBefore+c.kerfAfter,0),3892);
});
test('two 3000 mm parts do not fit a 6000 mm bar with separation loss',()=>{
 const p=createWorkshop();Object.assign(p.components.metalon,{width:3000,height:80});const r=buildWorkshop(p,'metalon');assert.equal(r.valid,true,r.errors.join(';'));
 const plan=planWorkshop(p,r);assert.ok(plan.bars.length>=2);
});
test('galvanized sheet is optional flat rectangle and holes are independently checked for support',()=>{
 const p=createWorkshop();p.components.metalon.sheet.enabled=true;
 p.components.metalon.holes=[{id:'F1',component:'sheet',purpose:'sheet-frame',x:600,y:15,diameter:5,through:true,operation:'drill'},{id:'F2',component:'sheet',purpose:'anchor',x:600,y:400,diameter:5,through:true,operation:'drill'}];
 const r=buildWorkshop(p,'metalon');assert.equal(r.valid,true,r.errors.join(';'));const s=r.pieces.find(x=>x.kind==='sheet');assert.equal(s.width*s.height/1e6,.96);assert.equal(s.contour.length,4);assert.equal(s.holes[0].supported,true);assert.equal(s.holes[1].supported,false);assert.equal(r.pieces.filter(x=>x.kind==='bar').reduce((n,x)=>n+x.holes.length,0),0);
});
test('invalid sheet edge and overlapping holes block fabrication',()=>{
 const p=createWorkshop();p.components.metalon.sheet.enabled=true;p.components.metalon.holes=[{id:'F1',component:'sheet',purpose:'anchor',x:1,y:15,diameter:5,through:true,operation:'drill'}];assert.equal(buildWorkshop(p,'metalon').valid,false);
});
test('four squares fit 213 with exact nominal gap and useful utilization',()=>{
 const p=createWorkshop();Object.assign(p.components.mdf,{model:'flat',width:100,height:100});p.quantity=4;Object.assign(p.stock.mdf,{width:213,height:213,margin:5,gap:3,quantity:1});
 const r=buildWorkshop(p,'mdf'),plan=planWorkshop(p,r);assert.equal(plan.validation.valid,true,plan.validation.errors.join(';'));assert.equal(plan.sheets.length,1);assert.equal(plan.unplaced.length,0);assert.equal(plan.completeSets,4);close(plan.netArea,40000);close(plan.utilization,40000/(213*213)*100);close(plan.usefulUtilization,40000/(203*203)*100);
});
test('finite exhausted and unknown stock stay shortages, extras not multiplied by kits',()=>{
 const p=createWorkshop();Object.assign(p.components.mdf,{model:'flat',width:100,height:100,extraQuantity:2});p.quantity=4;Object.assign(p.stock.mdf,{width:100,height:100,margin:0,gap:0,quantity:2});
 let plan=planWorkshop(p,buildWorkshop(p,'mdf'));assert.equal(plan.instances.length,6);assert.equal(plan.unplaced.length,4);assert.equal(plan.completeSets,2);
 p.stock.mdf.quantity=null;plan=planWorkshop(p,buildWorkshop(p,'mdf'));assert.equal(plan.sheets.length,0);assert.equal(plan.unplaced.length,6);
});
test('complete sets use the limiting type and separate replacements',()=>{
 assert.equal(completeSets([{id:'bottom',perSet:1},{id:'side',perSet:2}],{bottom:10,side:19},10),9);
});
test('pattern prohibits forced rotation and thickness stays material identity',()=>{
 const p=createWorkshop();Object.assign(p.components.mdf,{model:'flat',width:120,height:80,rotation:false});Object.assign(p.stock.mdf,{width:100,height:130,margin:0,gap:0});
 const r=buildWorkshop(p,'mdf'),plan=planWorkshop(p,r);assert.equal(plan.unplaced.length,1);assert.equal(plan.instances[0].material.thickness,p.components.mdf.measuredThickness);
});
test('price changes do not invalidate cut, geometry and stock changes do',()=>{
 const p=createWorkshop(),r=buildWorkshop(p,'acrylic'),plan=planWorkshop(p,r),sig=cutSignature(p,'acrylic');p.stock.acrylic.price=100;p.costs.rate=40;assert.equal(cutSignature(p,'acrylic'),sig);assert.equal(isPlanCurrent(p,plan),true);p.components.acrylic.width=301;assert.equal(isPlanCurrent(p,plan),false);
});
test('cost pending stays unknown; machine minutes and markup/margin are explicit',()=>{
 const p=createWorkshop();p.components.mdf.model='flat';let r=buildWorkshop(p,'mdf'),plan=planWorkshop(p,r);let c=estimateWorkshopCosts(p,r,plan);assert.equal(c.complete,false);assert.equal(c.salePrice,null);
 Object.assign(p.stock.mdf,{price:100});Object.assign(p.costs,{machineMinutes:0,machineHourlyRate:0,assemblyCost:0,rate:30,pricingMode:'markup'});c=estimateWorkshopCosts(p,r,plan);assert.equal(c.complete,true,c.pending.join(';'));assert.equal(c.assignedCost,100);assert.equal(c.salePrice,130);
 p.costs.pricingMode='margin';c=estimateWorkshopCosts(p,r,plan);close(c.salePrice,100/.7);p.costs.machineMinutes=30;p.costs.machineHourlyRate=120;c=estimateWorkshopCosts(p,r,plan);assert.equal(c.machineCost,60);
});
test('independent validator rejects duplicate identity, stock and collision edits',()=>{
 const p=createWorkshop();p.components.mdf.model='flat';p.quantity=2;const r=buildWorkshop(p,'mdf'),plan=planWorkshop(p,r);plan.sheets[0].placements[1]={...plan.sheets[0].placements[0]};const v=validateWorkshopPlan(p,r,plan);assert.equal(v.valid,false);assert.ok(v.errors.some(x=>/repetid|conservação|Conservação/i.test(x)));
});
test('bad dimensions never produce cut geometry',()=>{
 const p=createWorkshop();p.components.acrylic.width=NaN;const r=buildWorkshop(p,'acrylic');assert.equal(r.valid,false);assert.equal(r.pieces.length,0);
});
test('manual locking, collision rejection, removal and reinsertion conserve physical identities',()=>{
 const p=createWorkshop();p.components.mdf.model='flat';p.quantity=2;const r=buildWorkshop(p,'mdf'),initial=planWorkshop(p,r),a=initial.sheets[0].placements[0],b=initial.sheets[0].placements[1];
 const locked=moveWorkshopPlacement(p,r,initial,a.pieceId,{locked:true});assert.equal(locked.valid,true);
 assert.equal(moveWorkshopPlacement(p,r,locked.plan,a.pieceId,{x:a.x+1}).valid,false);
 assert.equal(unallocateWorkshopPlacement(p,r,locked.plan,a.pieceId).valid,false);
 assert.equal(moveWorkshopPlacement(p,r,initial,b.pieceId,{x:a.x,y:a.y}).valid,false);
 const removed=unallocateWorkshopPlacement(p,r,initial,b.pieceId);assert.equal(removed.valid,true);assert.equal(removed.plan.unplaced.length,1);assert.equal(removed.plan.completeSets,1);
 const restored=allocateWorkshopPlacement(p,r,removed.plan,b.pieceId,initial.sheets[0].id,{x:b.x,y:b.y,rotated:b.rotated});assert.equal(restored.valid,true,restored.errors.join(';'));assert.equal(restored.plan.completeSets,2);assert.equal(restored.plan.unplaced.length,0);
});
test('proposals contain independently validated arrangements for the same inputs',()=>{
 const p=createWorkshop(),r=buildWorkshop(p,'acrylic'),choices=workshopProposals(p,r);assert.ok(choices.length>=1);assert.ok(choices.length<=3);for(const plan of choices){assert.equal(plan.signature,cutSignature(p,'acrylic'));assert.equal(validateWorkshopPlan(p,r,plan).valid,true);}
});
test('imported artwork preserves scale, independent piece origins, polygon holes, material and net area',()=>{
 const p=createWorkshop();p.components.acrylic.model='imported';p.components.acrylic.artwork={mode:'vector',format:'svg',fileName:'sintetico.svg',scaleConfirmed:true,widthMm:240,heightMm:100,contours:[{id:'a',outer:[[0,0],[100,0],[100,100],[0,100]],holes:[[[10,10],[30,10],[30,30],[10,30]]]},{id:'b',outer:[[140,0],[240,0],[240,50],[140,50]],holes:[]}]};
 const r=buildWorkshop(p,'acrylic');assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.pieces.length,2);assert.equal(r.pieces[0].cutouts.length,1);assert.deepEqual(r.pieces[1].transform.origin,[140,0,0]);assert.equal(r.pieces[1].width,100);
 const plan=planWorkshop(p,r);assert.equal(plan.validation.valid,true,plan.validation.errors.join(';'));assert.equal(plan.netArea,14600);assert.equal(plan.instances[0].material.kind,'acrylic');
 const copy=JSON.parse(JSON.stringify(p));assert.deepEqual(buildWorkshop(copy,'acrylic'),r);copy.components.acrylic.artwork.scaleConfirmed=false;assert.equal(buildWorkshop(copy,'acrylic').valid,false);
});
test('malformed nested configs fail schema validation without reaching geometry',()=>{
 for(const section of ['profile','sheet']){const p=createWorkshop();p.components.metalon[section]=null;assert.equal(buildWorkshop(p,'metalon').valid,false);}
 const p=createWorkshop();p.stock.mdf=null;assert.equal(buildWorkshop(p,'mdf').valid,false);
});
test('blind tube holes stop at actual wall and blind laser is rejected before export',()=>{
 const p=createWorkshop();p.components.metalon.holes=[{id:'T1',component:'front-EXT-B',purpose:'anchor',x:600,y:15,diameter:5,through:false,depth:5,operation:'drill'}];assert.equal(buildWorkshop(p,'metalon').valid,false);
 p.components.metalon.holes=[];p.components.metalon.sheet.enabled=true;p.components.metalon.holes=[{id:'S1',component:'sheet',purpose:'sheet-frame',x:600,y:15,diameter:5,through:false,depth:.2,operation:'laser'}];assert.equal(buildWorkshop(p,'metalon').valid,false);
 p.components.metalon.holes=[];p.components.metalon.horizontalProfile={depth:80};assert.equal(buildWorkshop(p,'metalon').dimensions.depth,80);
 p.components.metalon.crossbars=null;assert.equal(buildWorkshop(p,'metalon').valid,false);
});
test('reoptimization preserves locked sheet exactly and conserves all remaining instances',()=>{
 const p=createWorkshop();p.components.mdf.model='flat';p.quantity=3;Object.assign(p.stock.mdf,{width:320,height:160,margin:5,gap:3,quantity:3});const r=buildWorkshop(p,'mdf'),initial=planWorkshop(p,r),first=initial.sheets[0].placements[0];
 const locked=moveWorkshopPlacement(p,r,initial,first.pieceId,{locked:true}).plan;
 const missing=unallocateWorkshopPlacement(p,r,locked,locked.sheets[1].placements[0].pieceId).plan;
 const redo=reoptimizeWorkshopRemaining(p,r,missing);assert.equal(redo.valid,true,redo.errors.join(';'));assert.equal(redo.plan.unplaced.length,0);assert.equal(redo.plan.completeSets,3);assert.deepEqual(redo.plan.sheets[0].placements,locked.sheets[0].placements);assert.equal(redo.plan.validation.valid,true);
});
test('invalid stock restrictions are errors rather than merely valid shortages',()=>{
 const p=createWorkshop();p.stock.acrylic.margin=-1;const result=buildWorkshop(p,'acrylic'),plan=planWorkshop(p,result);assert.equal(plan.validation.valid,false);assert.ok(plan.validation.errors.length);
});
test('bar validation binds length, stock cuts and refilos to source configuration even when sums reconcile',()=>{
 const p=createWorkshop(),r=buildWorkshop(p,'metalon'),base=planWorkshop(p,r);
 const length=structuredClone(base);length.bars[0].length+=1000;length.bars[0].waste+=1000;assert.equal(validateWorkshopPlan(p,r,length).valid,false);
 const kerf=structuredClone(base);kerf.bars[0].kerf=0;assert.equal(validateWorkshopPlan(p,r,kerf).valid,false);
 const used=structuredClone(base);used.bars[0].used+=1;assert.equal(validateWorkshopPlan(p,r,used).valid,false);
 const refilo=structuredClone(base),bar=refilo.bars[0];bar.trimStart=10;bar.waste-=10;bar.used+=10;bar.cuts.forEach(c=>{c.start+=10;c.end+=10;c.used+=10;});assert.equal(validateWorkshopPlan(p,r,refilo).valid,false);
 const losses=structuredClone(base),b=losses.bars[0];let cursor=0;for(const c of b.cuts){c.start=cursor;c.end=cursor+c.length;c.kerfAfter=0;c.used=c.end;cursor=c.end;}b.used=cursor;b.waste=b.length-cursor;assert.equal(validateWorkshopPlan(p,r,losses).valid,false);
});
test('unimplemented remnants never inherit full commercial-sheet price or produce complete quotation',()=>{
 const p=createWorkshop();Object.assign(p.components.acrylic,{model:'flat',width:100,height:100});Object.assign(p.stock.acrylic,{price:300,quantity:0});Object.assign(p.costs,{machineMinutes:0,machineHourlyRate:0,assemblyCost:0});
 let r=buildWorkshop(p,'acrylic');p.stock.acrylic.remnants=[{id:'R1',width:200,length:200,material:{...r.pieces[0].material,manufacturer:'acrylic:laser'}}];r=buildWorkshop(p,'acrylic');const plan=planWorkshop(p,r),cost=estimateWorkshopCosts(p,r,plan);
 assert.equal(cost.complete,false);assert.equal(cost.assignedCost,null);assert.equal(plan.validation.valid,false);assert.ok(plan.validation.errors.some(e=>/retalho/i.test(e)));
});
test('a valid imported cut plan with long exact geometry signature remains saveable',()=>{
 const p=createWorkshop();Object.assign(p.components.acrylic,{model:'imported',artwork:{mode:'vector',format:'svg',fileName:'circulo-sintetico.svg',scaleConfirmed:true,widthMm:100,heightMm:100,contours:[{outer:Array.from({length:300},(_,i)=>[50+50*Math.cos(i*2*Math.PI/300),50+50*Math.sin(i*2*Math.PI/300)]),holes:[]}]}});
 const r=buildWorkshop(p,'acrylic'),plan=planWorkshop(p,r);assert.equal(plan.validation.valid,true);assert.ok(plan.signature.length>10000);p.cutPlans={acrylic:plan};assert.deepEqual(validateWorkshop(p),[]);
});
