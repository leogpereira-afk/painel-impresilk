import test from 'node:test';
import assert from 'node:assert/strict';
import {LED_CATALOG,SUPPLY_CATALOG,WIRE_CATALOG,applyLedCatalog,applySupplyCatalog,applyWireCatalog,catalogStatus} from './lighting-catalog.mjs';

const config=()=>({enabled:true,model:{name:'Manual',voltageV:12,powerW:1,rotationDeg:90},grid:{pitchXmm:35,pitchYmm:35,clearanceMm:3},supply:{voltageV:12,powerW:60,loadPercent:72,xMm:-90,yMm:12,zMm:-30,conditionsConfirmed:true,outputs:4},wire:{route:'rear-plane',extraPercent:15,maxDropPercent:2.5},manual:[{id:'custom',x:12}],excluded:['excluded']});

test('LED catalogue preserves exact SKU, revision F dimensions and the Large power correction',()=>{
 assert.deepEqual(LED_CATALOG.map(x=>[x.sku,x.powerW,x.widthMm,x.heightMm,x.depthMm,x.maxPerRun,x.referenceMaxModules60W]),[
  ['M-QMG2S-12-65',0.74,53.848,16.002,11.938,40,80],['M-QMG2M-12-65',0.9,53.848,16.002,11.938,30,60],['M-QMG2L-12-65',1.25,77.9018,16.002,11.938,24,48]
 ]);
 assert.ok(LED_CATALOG.every(x=>x.voltageV===12&&x.cctK===6500&&x.ip==='IP67'&&x.revision==='F · 2026-10-12'&&!x.demonstration));
});
test('optical guides retain exact depths, separate stroke and row spacing, and no fabricated interpolation',()=>{
 const small=LED_CATALOG[0];
 assert.deepEqual(small.opticalGuides.map(x=>[x.depthMm,x.pitchMm,x.rowPitchMm,x.strokeMm]),[[50.8,76.2,76.2,127],[76.2,152.4,152.4,203.2],[101.6,203.2,254,304.8],[127,203.2,304.8,355.6]]);
 assert.equal(small.opticalGuides.find(x=>x.depthMm===75),undefined);
 assert.equal(LED_CATALOG[1].opticalGuides[1].maximumBrightnessRowPitchMm,304.8);
 assert.ok(Math.abs(LED_CATALOG[2].harnessPitchMm-225.77777777777777)<1e-8);
});
test('LPV-100-12 has nominal 102 W and each supply has one actual DC output',()=>{
 assert.deepEqual(SUPPLY_CATALOG.map(x=>[x.sku,x.powerW,x.ratedCurrentA,x.outputs]),[['LPV-60-12',60,5,1],['LPV-100-12',102,8.5,1]]);
 for(const s of SUPPLY_CATALOG)assert.equal(s.powerW,s.voltageV*s.ratedCurrentA);
});
test('Corfio reference converts resistance per km to per conductor metre without inventing ampacity',()=>{
 assert.deepEqual(WIRE_CATALOG.map(x=>[x.sectionMm2,x.resistanceOhmPerM,x.resistanceTemperatureC,x.unit]),[[0.75,0.026,20,'conductor-m'],[1.5,0.0133,20,'conductor-m'],[2.5,0.00798,20,'conductor-m']]);
 for(const w of WIRE_CATALOG)assert.equal(w.ampacityA,undefined);
});
test('applying LED preserves rotation, geometry, manual positions, source and wire without mutating input',()=>{
 const original=config(),before=structuredClone(original),next=applyLedCatalog(original,LED_CATALOG[0].id);
 assert.deepEqual(original,before);assert.equal(next.model.rotationDeg,90);
 for(const key of ['grid','supply','wire','manual','excluded'])assert.deepEqual(next[key],before[key]);
 next.grid.pitchXmm=100;assert.equal(original.grid.pitchXmm,35);
 assert.equal(catalogStatus(next.model,'led').modified,false);
});
test('applying LED only preserves quarter-turn supported rotations',()=>{
 for(const rotationDeg of [undefined,0,45,180]) {const c=config();c.model.rotationDeg=rotationDeg;assert.equal(applyLedCatalog(c,LED_CATALOG[1].id).model.rotationDeg,0);}
});
test('supply selection retains placement/utilisation but resets technical confirmation and separates external branches',()=>{
 const original=config(),before=structuredClone(original),next=applySupplyCatalog(original,SUPPLY_CATALOG[1].id);
 assert.deepEqual(original,before);assert.deepEqual(next.model,before.model);assert.deepEqual(next.wire,before.wire);assert.deepEqual(next.grid,before.grid);
 assert.deepEqual([next.supply.xMm,next.supply.yMm,next.supply.zMm,next.supply.loadPercent],[-90,12,-30,72]);
 assert.deepEqual([next.supply.conditionsConfirmed,next.supply.outputs,next.supply.branches,next.supply.distributionMode,next.supply.outputMaxCurrentA],[false,1,8,'external',8.5]);
 assert.equal(catalogStatus(next.supply,'supply').modified,false);
});
test('wire selection preserves route, reserve and project loss criterion',()=>{
 const original=config(),next=applyWireCatalog(original,WIRE_CATALOG[1].id);
 assert.deepEqual([next.wire.route,next.wire.extraPercent,next.wire.maxDropPercent],['rear-plane',15,2.5]);
 assert.deepEqual(next.model,original.model);assert.deepEqual(next.supply,original.supply);assert.equal(original.wire.resistanceOhmPerM,undefined);
 assert.equal(catalogStatus(next.wire,'wire').modified,false);
});
test('unknown IDs and mismatched voltage reject atomically, without automatically switching other components',()=>{
 for(const apply of [applyLedCatalog,applySupplyCatalog,applyWireCatalog]) {const original=config(),before=structuredClone(original);assert.throws(()=>apply(original,'unknown'),/desconhecido/);assert.deepEqual(original,before);}
 const ledConfig=config();ledConfig.supply.voltageV=24;const beforeLed=structuredClone(ledConfig);assert.throws(()=>applyLedCatalog(ledConfig,LED_CATALOG[0].id),/tensão/);assert.deepEqual(ledConfig,beforeLed);
 const supplyConfig=config();supplyConfig.model.voltageV=24;const beforeSupply=structuredClone(supplyConfig);assert.throws(()=>applySupplyCatalog(supplyConfig,SUPPLY_CATALOG[0].id),/tensão/);assert.deepEqual(supplyConfig,beforeSupply);
});
test('catalog identity detects nominal edits while ignoring rotation and supply operating settings',()=>{
 const selected=applyLedCatalog(config(),LED_CATALOG[0].id);selected.model.rotationDeg=0;assert.equal(catalogStatus(selected.model,'model').modified,false);
 selected.model.powerW=0.75;assert.equal(catalogStatus(selected.model,'model').modified,true);
 const source=applySupplyCatalog(config(),SUPPLY_CATALOG[0].id);Object.assign(source.supply,{xMm:25,loadPercent:80,conditionsConfirmed:true,branches:3,outputMaxCurrentA:2});assert.equal(catalogStatus(source.supply,'supply').modified,false);
 source.supply.outputs=2;assert.equal(catalogStatus(source.supply,'supply').modified,true);
 const wired=applyWireCatalog(config(),WIRE_CATALOG[0].id);wired.wire.resistanceOhmPerM=26;assert.equal(catalogStatus(wired.wire,'wire').modified,true);
});
test('unknown provenance is distinct from manual components and catalogue records are immutable',()=>{
 assert.deepEqual(catalogStatus({},'wire'),{record:null,modified:false});assert.deepEqual(catalogStatus({catalogId:'missing'},'wire'),{record:null,modified:true});
 assert.throws(()=>catalogStatus({},'other'),/Tipo/);assert.throws(()=>applyLedCatalog(null,LED_CATALOG[0].id),/inválida/);
 assert.throws(()=>{LED_CATALOG[0].opticalGuides[0].depthMm=3;},TypeError);
 const selected=applyLedCatalog(config(),LED_CATALOG[0].id);selected.model.opticalGuides[0].depthMm=3;assert.equal(LED_CATALOG[0].opticalGuides[0].depthMm,50.8);
});
