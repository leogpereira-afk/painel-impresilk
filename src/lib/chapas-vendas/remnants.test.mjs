import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPlan,calculatePlan,suggestTrays,defaultMaterial} from './planner.mjs';
const setup=()=>{
 const p=initialPlan();p.stock={width:1000,length:1000,trim:10,kerf:4,rotation:true};
 Object.assign(p.rows[0],{width:500,height:500});
 return p;
};
const remnant=(patch={})=>({id:'offcut',name:'Retalho de teste',width:520,length:520,quantity:1,material:defaultMaterial(),...patch});
function checkConservation(p,plan){
 assert.equal(plan.valid,true,plan.errors.join('; '));
 const ids=[],usedSources=new Set();
 for(const sheet of plan.result.sheets){
  if(sheet.source==='remnant'){assert.equal(usedSources.has(sheet.sourceId),false);usedSources.add(sheet.sourceId);}
  for(const [i,a] of sheet.placements.entries()){
   ids.push(a.pieceId);
   assert.ok(a.x>=sheet.trim&&a.y>=sheet.trim);
   assert.ok(a.x+a.width<=sheet.width-sheet.trim+1e-6&&a.y+a.height<=sheet.length-sheet.trim+1e-6);
   for(const b of sheet.placements.slice(i+1)){const k=p.stock.kerf;assert.ok(a.x+a.width+k<=b.x+1e-6||b.x+b.width+k<=a.x+1e-6||a.y+a.height+k<=b.y+1e-6||b.y+b.height+k<=a.y+1e-6);}
  }
 }
 assert.equal(ids.length,plan.pieces.length);assert.equal(new Set(ids).size,ids.length);
 assert.ok(Math.abs(plan.result.grossArea-plan.result.usedArea-plan.result.wasteArea)<.01);
 assert.equal(plan.total,plan.groups.reduce((n,g)=>n+g.calculated+g.reserve,0));
 assert.equal(plan.remnantsUsed,usedSources.size);
}
test('absent or empty remnants preserve legacy purchasing results',()=>{
 const p=setup();delete p.remnants;const absent=calculatePlan(p);p.remnants=[];const empty=calculatePlan(p);
 assert.deepEqual(empty,absent);assert.equal(empty.total,1);assert.equal(empty.remnantsUsed,0);
 assert.deepEqual(empty.result.sheets.map(s=>s.id),['CH1']);checkConservation(p,empty);
});
test('existing remnants alone satisfy pieces without purchasing or consuming twice',()=>{
 const p=setup();p.rows[0].quantity=2;p.remnants=[remnant({quantity:2})];const before=JSON.stringify(p),r=calculatePlan(p);
 checkConservation(p,r);assert.equal(JSON.stringify(p),before);assert.equal(r.total,0);assert.equal(r.remnantsUsed,2);
 assert.equal(r.groups[0].calculated,0);assert.equal(r.groups[0].remnantsUsed,2);
 assert.deepEqual(r.result.sheets.map(s=>s.id),['RT1','RT2']);
 assert.ok(r.result.sheets.every(s=>s.remnantId==='offcut'&&s.sourceName==='Retalho de teste'));
 assert.equal(r.remnantUsage[0].used,2);assert.equal(r.remnantUsage[0].remaining,0);
});
test('partial remnant inventory reduces only new sheets and keeps explicit reserves',()=>{
 const p=setup();p.rows[0].quantity=3;p.remnants=[remnant({quantity:2})];let r=calculatePlan(p);checkConservation(p,r);
 assert.equal(r.total,1);assert.equal(r.remnantsUsed,2);assert.equal(r.groups[0].sheets.length,3);
 p.reserves[r.groups[0].key]=2;r=calculatePlan(p);checkConservation(p,r);assert.equal(r.total,3);assert.equal(r.groups[0].calculated,1);
 assert.equal(r.remnantUsage[0].available,2);assert.equal(r.remnantUsage[0].remaining,0);
});
test('retalhos take priority even if a large piece must first open a new sheet',()=>{
 const p=setup();p.rows[0].width=900;p.rows[0].height=400;
 p.rows.push({...p.rows[0],id:'small',width:200,height:200});p.remnants=[remnant({width:220,length:220})];
 const r=calculatePlan(p);checkConservation(p,r);assert.equal(r.total,1);assert.equal(r.remnantsUsed,1);
 assert.equal(r.result.sheets.find(s=>s.source==='remnant').placements[0].pieceId,'small:1');
});
test('matching uses all sales material properties, not just visual palette color',()=>{
 for(const patch of [{manufacturer:'Outra marca'},{sku:'Outra referência'},{colorId:'preto'},{colorName:'Branco diferente'},{coating:'pvdf'},{thickness:4},{finish:'gloss'},{directional:true}]){
  const p=setup();p.remnants=[remnant({material:{...defaultMaterial(),...patch}})];const r=calculatePlan(p);
  checkConservation(p,r);assert.equal(r.total,1,JSON.stringify(patch));assert.equal(r.remnantsUsed,0);
  assert.equal(r.remnantUsage[0].remaining,1);
 }
 const p=setup();p.rows[0].manufacturer=' Marca ';p.remnants=[remnant({material:{...defaultMaterial(),manufacturer:'Marca'}})];
 assert.equal(calculatePlan(p).remnantsUsed,1);
});
test('one remnant stock is consumed only in its compatible material group',()=>{
 const p=setup();p.rows.push({...p.rows[0],id:'blue',colorId:'azul'});p.remnants=[remnant()];
 const r=calculatePlan(p);checkConservation(p,r);assert.equal(r.groups.length,2);assert.equal(r.total,1);assert.equal(r.remnantsUsed,1);
 assert.equal(r.groups.find(g=>g.material.colorId==='azul').remnantsUsed,0);
});
test('rotation, direction and trim constrain remnant allocation',()=>{
 const p=setup();Object.assign(p.rows[0],{width:700,height:300});p.remnants=[remnant({width:320,length:720})];
 assert.equal(calculatePlan(p).remnantsUsed,1);
 p.stock.rotation=false;assert.equal(calculatePlan(p).remnantsUsed,0);
 p.stock.rotation=true;p.rows[0].directional=true;p.remnants[0].material.directional=true;assert.equal(calculatePlan(p).remnantsUsed,0);
 p.rows[0].directional=false;p.remnants[0].material.directional=false;p.remnants[0].width=319.99;
 assert.equal(calculatePlan(p).remnantsUsed,0);
});
test('remnant dimensions are independent of the format chosen for new purchasing',()=>{
 const p=setup();Object.assign(p.rows[0],{width:1200,height:500,directional:true});
 p.remnants=[remnant({width:1220,length:520,material:{...defaultMaterial(),directional:true}})];
 const r=calculatePlan(p);checkConservation(p,r);assert.equal(r.total,0);assert.equal(r.remnantsUsed,1);
});
test('a folded piece must fit its developed blank, with real net area',()=>{
 const p=setup();Object.assign(p.rows[0],{width:460,height:460,folded:true});p.remnants=[remnant()];
 assert.equal(calculatePlan(p).remnantsUsed,0);
 p.remnants[0].width=540;p.remnants[0].length=540;const r=calculatePlan(p);checkConservation(p,r);
 assert.equal(r.remnantsUsed,1);assert.equal(r.total,0);assert.equal(r.rows[0].blank.width,520);
 assert.equal(r.result.usedArea,r.rows[0].blank.area);assert.ok(r.result.usedArea<520*520);
});
test('unused and incompatible stock stays available and does not affect utilization',()=>{
 const p=setup();p.remnants=[remnant({quantity:3}),remnant({id:'unused',material:{...defaultMaterial(),sku:'other'}})];
 const r=calculatePlan(p);checkConservation(p,r);assert.equal(r.remnantUsage[0].remaining,2);assert.equal(r.remnantUsage[1].remaining,1);
 assert.equal(r.result.grossArea,520*520);assert.equal(r.total,0);
});
test('invalid remnant metadata, duplicate identities and quantities fail explicitly',()=>{
 for(const patch of [{id:''},{width:null},{length:-1},{quantity:0},{quantity:1.5},{quantity:101},{material:null},{material:{...defaultMaterial(),manufacturer:{}}},{material:{...defaultMaterial(),coating:'unknown'}},{name:'x'.repeat(121)},{width:20}]){
  const p=setup();p.remnants=[remnant(patch)];const r=calculatePlan(p);assert.equal(r.valid,false,JSON.stringify(patch));assert.ok(r.errors.some(e=>/Retalho|retalho/.test(e)));
 }
 const p=setup();p.remnants=[remnant(),remnant()];assert.equal(calculatePlan(p).valid,false);
 p.remnants=[remnant({quantity:51}),remnant({id:'two',quantity:50})];assert.equal(calculatePlan(p).valid,false);
 p.remnants={};assert.equal(calculatePlan(p).valid,false);
});
test('panel expansion preserves the source number in validation errors',()=>{
 const p=setup();p.rows[0].panelsX=3;p.rows.push({...p.rows[0],id:'second',panelsX:1,quantity:0});
 const r=calculatePlan(p);assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.startsWith('Peça 2:')));assert.ok(!r.errors.some(e=>e.startsWith('Peça 4:')));
});
test('tray alternatives show seam versus new-sheet tradeoff without silently changing flat parts',()=>{
 const p=initialPlan(),row=p.rows[0];Object.assign(row,{width:13500,height:2500,directional:true,folded:true});
 const before=JSON.stringify(p),suggestion=suggestTrays(p,row);assert.equal(JSON.stringify(p),before);
 assert.equal(suggestion.alternatives[0].sheets,12);
 const fewer=suggestion.alternatives.find(a=>a.label.startsWith('Menos chapas'));
 assert.ok(fewer);assert.equal(fewer.count,48);assert.equal(fewer.sheets,7);
 for(const alternative of suggestion.alternatives){const r=calculatePlan({...p,rows:[{...row,...alternative.patch}]});checkConservation(p,r);assert.equal(r.total,alternative.sheets);assert.equal(r.result.utilization,alternative.utilization);}
 row.folded=false;const flat=suggestTrays(p,row);assert.equal(flat.mode,'flat');assert.equal(flat.patch.folded,false);
 assert.ok(flat.alternatives.some(a=>a.mode==='tray'&&a.patch.folded===true));assert.equal(row.folded,false);
});
