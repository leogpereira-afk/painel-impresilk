import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelsProject,createPanelObject,buildPanelsProject,validatePanelsProject} from './model.mjs';
import {calculatePanelsPlan,editPanelsPlan,exportPanelsDrawing,restorePanelsPlans,getPanelsCosts} from './workflow.mjs';
import {createFabricationStorage} from '../fabrication/storage.mjs';

function fixture(material='acrylic'){
 const p=createPanelsProject(),plate=createPanelObject('plate',material);
 p.id='synthetic-panels';plate.id='synthetic-plate';plate.config.width=120;plate.config.height=80;
 p.materials[material].objects=[plate];p.materials[material].joints=[];
 return p;
}
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const metadata=s=>JSON.parse(decode(/<metadata[^>]*>([\s\S]*?)<\/metadata>/.exec(s)[1]));
for(const material of ['acrylic','mdf']){
 test(`${material}: export validates margins, gaps, stock and outdated signature without trusting stored valid stamp`,()=>{
  const p=fixture(material),plan=calculatePanelsPlan(p,material);
  assert.equal(plan.validation.valid,true);
  const svg=exportPanelsDrawing(p,material,'svg',plan);assert.equal(metadata(svg).layout,'plan');
  const invalid=structuredClone(plan);invalid.sheets[0].placements[0].x=0;
  assert.throws(()=>exportPanelsDrawing(p,material,'svg',invalid),/margem|borda|chapa|trim/i);
  assert.throws(()=>exportPanelsDrawing(p,material,'dxf',invalid));
  const stale=structuredClone(p);stale.materials[material].objects[0].config.width=200;
  assert.throws(()=>exportPanelsDrawing(stale,material,'svg',plan),/desatualizado/);
  const stock=structuredClone(p);stock.stock[material].quantity=0;
  assert.throws(()=>exportPanelsDrawing(stock,material,'svg',plan),/desatualizado|estoque/);
 });
 test(`${material}: removal/reallocation round trip and locked movement are transactional`,()=>{
  const p=fixture(material),plan=calculatePanelsPlan(p,material),sheet=plan.sheets[0],item=sheet.placements[0];
  const locked=editPanelsPlan(p,material,plan,'move',item.pieceId,{locked:true});assert.equal(locked.valid,true);
  const illegal=editPanelsPlan(p,material,locked.plan,'move',item.pieceId,{x:item.x+20});assert.equal(illegal.valid,false);
  assert.deepEqual(locked.plan.sheets[0].placements[0],{...item,locked:true});
  const removed=editPanelsPlan(p,material,plan,'remove',item.pieceId);assert.equal(removed.valid,true);assert.equal(removed.plan.unplaced.length,1);
  assert.throws(()=>exportPanelsDrawing(p,material,'svg',removed.plan),/sem alocação/);
  const saved={...p,revision:p.revision+1,cutPlans:{[material]:removed.plan}};
  assert.equal(restorePanelsPlans(saved).plans[material].unplaced.length,1);
  const restored=editPanelsPlan(saved,material,removed.plan,'allocate',item.pieceId,{sheetId:sheet.id,x:item.x,y:item.y,rotated:item.rotated});
  assert.equal(restored.valid,true,restored.errors.join(' '));assert.equal(restored.plan.unplaced.length,0);
  assert.equal(metadata(exportPanelsDrawing(saved,material,'svg',restored.plan)).instances.length,1);
  const auto=editPanelsPlan(saved,material,removed.plan,'allocate',item.pieceId,{sheetId:sheet.id});
  assert.equal(auto.valid,true,auto.errors.join(' '));assert.equal(auto.plan.unplaced.length,0);
 });
}
test('reopening preserves exact manual positions/locks while reconstructing geometry and dropping corrupt caches',()=>{
 const p=fixture(),plan=calculatePanelsPlan(p,'acrylic'),id=plan.sheets[0].placements[0].pieceId;
 const moved=editPanelsPlan(p,'acrylic',plan,'move',id,{x:50,y:80,locked:true});assert.equal(moved.valid,true);
 p.cutPlans={acrylic:moved.plan};p.revision++;
 const loaded=restorePanelsPlans(JSON.parse(JSON.stringify(p)));assert.deepEqual(loaded.discarded,[]);
 assert.deepEqual(loaded.plans.acrylic.sheets[0].placements,p.cutPlans.acrylic.sheets[0].placements);
 p.cutPlans.acrylic.sheets[0].placements[0].x=0;
 const bad=restorePanelsPlans(p);assert.equal(bad.plans.acrylic,undefined);assert.equal(bad.discarded.length,1);
 assert.equal(p.materials.acrylic.objects.length,1);
});
test('physical dimensions and hole contours reach both SVG and DXF in millimetres',()=>{
 const p=fixture();Object.assign(p.materials.acrylic.objects[0].config,{width:300,height:150,measuredThickness:3.2});
 const svg=exportPanelsDrawing(p,'acrylic','svg'),meta=metadata(svg);
 assert.match(svg,/width="300mm" height="150mm"/);assert.equal(meta.pieces[0].thickness,3.2);
 const dxf=exportPanelsDrawing(p,'acrylic','dxf');assert.match(dxf,/\$INSUNITS\n70\n4/);assert.match(dxf,/LWPOLYLINE/);
});
test('engraved text stays out of CUT and repeats on every target in SVG and DXF',()=>{
 const p=fixture(),target=buildPanelsProject(p,'acrylic').pieces[0],text=createPanelObject('text','acrylic');
 Object.assign(text.config,{text:'B8',heightMm:15,operation:'engrave',targetPieceId:target.id});
 text.position={x:10,y:0,z:10};p.materials.acrylic.objects.push(text);p.quantity=2;
 const r=buildPanelsProject(p,'acrylic');assert.equal(r.valid,true,r.errors.join(' '));assert.equal(r.pieces.length,1);
 const svg=exportPanelsDrawing(p,'acrylic','svg');
 const engrave=/<g id="ENGRAVE"[^>]*>([\s\S]*?)<\/g>/.exec(svg)[1];assert.match(engrave,/<path/);
 assert.ok((engrave.match(/data-instance-id/g)||[]).length>=4);
 const cuts=/<g id="CUT"[^>]*>([\s\S]*?)<\/g>/.exec(svg)[1];assert.equal((cuts.match(/<path/g)||[]).length,2);
 assert.match(exportPanelsDrawing(p,'acrylic','dxf'),/8\nENGRAVE\n100\nAcDbPolyline/);
});
test('costs distinguish missing prices from zero and partial allocation',()=>{
 const p=fixture(),plan=calculatePanelsPlan(p,'acrylic');
 assert.equal(getPanelsCosts(p,'acrylic',undefined).complete,false);
 assert.equal(getPanelsCosts(p,'acrylic',plan).salePrice,null);
 Object.assign(p.stock.acrylic,{price:100});Object.assign(p.costs,{machineMinutes:0,machineHourlyRate:0,assemblyCost:0});
 assert.equal(getPanelsCosts(p,'acrylic',plan).complete,true);
});
function backend(){const data=new Map();return{data,async transact(k,mode,fn){const r=fn(structuredClone(data.get(k)));if(mode==='readwrite')data.set(k,structuredClone(r.envelope));return r.result;}}}
test('backup, revisions and concurrent-save guard preserve manual plan and isolate Metalon namespace',async()=>{
 const b=backend(),storage=createFabricationStorage({backend:b,product:'oficina-placas',validate:validatePanelsProject});
 const p=fixture();p.cutPlans={acrylic:calculatePanelsPlan(p,'acrylic')};
 await storage.save('synthetic-user',p,0);
 await assert.rejects(storage.save('synthetic-user',{...p,name:'conflicting'},0),/Outra aba/);
 const loaded=(await storage.load('synthetic-user')).project;
 assert.equal(restorePanelsPlans(loaded).plans.acrylic.sheets.length,1);
 const backup=storage.parse(storage.serialize(p));assert.deepEqual(backup.cutPlans,p.cutPlans);
 await storage.archive('synthetic-user',p);assert.equal((await storage.revisions('synthetic-user'))[0].project.cutPlans.acrylic.signature,p.cutPlans.acrylic.signature);
 const legacy=createFabricationStorage({backend:b,product:'oficina',validate:()=>[]});assert.equal(await legacy.load('synthetic-user'),null);
});
