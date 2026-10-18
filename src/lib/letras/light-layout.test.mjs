import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightLayout,calculateLightLayout,validateLightLayout,moduleFits,lightLayoutCSV,lightLayoutSVG} from './light-layout.mjs';
import {createLetterProject} from './model.mjs';
import {calculateLetters} from './engine.mjs';
import {LED_CATALOG,SUPPLY_CATALOG,WIRE_CATALOG,applyLedCatalog,applySupplyCatalog,applyWireCatalog} from './lighting-catalog.mjs';
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const letter=(holes=[])=>({id:'L1',char:'A',x:100,y:200,width:100,height:100,contours:[{outer:rect(0,0,100,100),holes}]});
const geometry=(letters=[letter()])=>({projectId:'demo',revision:1,letters,errors:[],bounds:{width:200,height:300}});
const project=(lighting=createLightLayout())=>({id:'demo',revision:1,name:'Fictício',construction:{family:'galvanized-acrylic'},lighting});
test('centred modules preserve whole footprint and counts are deterministic',()=>{const p=project(),g=geometry(),r=calculateLightLayout(p,g);assert.deepEqual(r.errors,[]);assert.equal(r.totals.moduleCount,9);assert.ok(r.modules.every(m=>m.x>=113&&m.x<=187&&m.y>=208&&m.y<=292));assert.deepEqual(r,calculateLightLayout(p,g));assert.equal(r.totals.powerW,6.48);assert.equal(r.totals.currentA,0.54);assert.equal(r.perLetter[0].count,9);});
test('hole smaller than footprint is detected even when all corners lie outside hole',()=>{const l=letter([rect(45,45,10,10)]);assert.equal(moduleFits(l,150,250,{widthMm:30,heightMm:30}),false);const r=calculateLightLayout(project(),geometry([l]));assert.equal(r.totals.moduleCount,8);assert.ok(r.modules.every(m=>moduleFits(l,m.x,m.y,r.config.model,r.config.grid.clearanceMm)));});
test('concave notch cannot hide between module corners',()=>{const l=letter();l.contours[0].outer=[[0,0],[100,0],[100,100],[55,100],[55,45],[45,45],[45,100],[0,100]];assert.equal(moduleFits(l,150,250,{widthMm:30,heightMm:30}),false);});
test('clearance includes module body and rejects large or narrow islands',()=>{const c=createLightLayout({grid:{clearanceMm:50}}),r=calculateLightLayout(project(c),geometry());assert.equal(r.modules.length,0);assert.ok(r.warnings.some(w=>w.includes('sem módulos')));assert.equal(moduleFits(letter(),110,250,{widthMm:20,heightMm:10},3),false);});
test('letters O and B keep all modules outside holes',()=>{const p=createLetterProject({text:{value:'OB',heightMm:300},construction:{family:'galvanized-acrylic'},lighting:createLightLayout({model:{widthMm:12,heightMm:8},grid:{pitchXmm:20,pitchYmm:25,clearanceMm:2}})}),g=calculateLetters(p),r=calculateLightLayout(p,g);assert.deepEqual(r.errors,[]);assert.ok(r.modules.length>0);assert.ok(r.modules.every(m=>moduleFits(g.letters.find(l=>l.id===m.letterId),m.x,m.y,r.config.model,2)));});
test('mismatching supply voltage does not allocate modules',()=>{const r=calculateLightLayout(project(createLightLayout({supply:{voltageV:24}})),geometry());assert.equal(r.modules.length,0);assert.ok(r.errors.some(e=>e.includes('Tensão')));});
test('circuits obey run limit, output current and usable source capacity',()=>{const c=createLightLayout({model:{maxPerRun:4,powerW:2},supply:{powerW:10,loadPercent:80,outputs:2,outputMaxCurrentA:0.5}}),r=calculateLightLayout(project(c),geometry());assert.deepEqual(r.errors,[]);assert.deepEqual(r.circuits.map(c=>c.moduleCount),[3,3,3]);assert.equal(r.sources.length,3);assert.ok(r.sources.every(s=>s.powerW<=s.capacityW));assert.ok(r.circuits.every(c=>c.currentA<=0.5));assert.equal(new Set(r.modules.map(m=>m.id)).size,r.modules.length);});
test('all modules are assigned once and power values reconcile across sources',()=>{const c=createLightLayout({model:{maxPerRun:2}}),r=calculateLightLayout(project(c),geometry());assert.equal(r.circuits.length,5);assert.equal(r.sources.length,2);assert.equal(r.circuits.flatMap(c=>c.moduleIds).length,r.modules.length);assert.ok(Math.abs(r.sources.reduce((s,f)=>s+f.powerW,0)-r.totals.powerW)<0.001);});
test('wire lengths distinguish cable pair and conductors and reserve',()=>{const r=calculateLightLayout(project(),geometry());assert.equal(r.wires.length,r.modules.length);assert.ok(Math.abs(r.totals.conductorM-r.totals.cableM*2)<0.002);assert.ok(Math.abs(r.totals.cableM-r.totals.nominalCableM*1.1)<0.002);assert.ok(r.wires.every(w=>w.points.length===4&&w.dropV===null));assert.ok(r.circuits.every(c=>c.dropPassed===null));});
test('known resistance calculates downstream drop; over-limit cannot export',()=>{const p=project(createLightLayout({wire:{resistanceOhmPerM:10,maxDropPercent:3}})),g=geometry(),r=calculateLightLayout(p,g);assert.ok(r.circuits[0].dropPercent>3);assert.ok(r.errors.some(e=>e.includes('queda')));assert.throws(()=>lightLayoutCSV(p,g,r));});
test('moving source alters routing lengths without changing module count',()=>{const r1=calculateLightLayout(project(),geometry()),r2=calculateLightLayout(project(createLightLayout({supply:{xMm:-1000}})),geometry());assert.equal(r1.modules.length,r2.modules.length);assert.ok(r2.totals.cableM>r1.totals.cableM);});
test('delete, manual edit and regenerate control the same modules and quantities',()=>{const p=project(),g=geometry(),first=calculateLightLayout(p,g).modules[0];p.lighting.excluded=[first.id];assert.equal(calculateLightLayout(p,g).modules.length,8);p.lighting=createLightLayout({manual:[{id:first.id,letterId:first.letterId,x:first.x+1,y:first.y}]});const edit=calculateLightLayout(p,g);assert.equal(edit.modules[0].x,first.x+1);assert.equal(edit.modules.length,9);p.lighting.manual[0].x=0;assert.ok(calculateLightLayout(p,g).errors.some(e=>e.includes('ultrapassa')));p.lighting=createLightLayout();assert.equal(calculateLightLayout(p,g).modules.length,9);});
test('manual overlap and orphan adjustments are errors',()=>{const p=project(),g=geometry(),first=calculateLightLayout(p,g).modules[0];p.lighting.manual=[{id:'manual-1',letterId:first.letterId,x:first.x,y:first.y}];assert.ok(calculateLightLayout(p,g).errors.some(e=>e.includes('sobrepostos')));p.lighting.manual[0].letterId='missing';assert.ok(calculateLightLayout(p,g).errors.some(e=>e.includes('ausente')));});
test('nonluminous families and disabled lighting receive no modules',()=>{const p=project();p.construction.family='flat-mdf';assert.equal(calculateLightLayout(p,geometry()).applicable,false);p.construction.family='galvanized-acrylic';p.lighting.enabled=false;assert.equal(calculateLightLayout(p,geometry()).modules.length,0);});
test('malformed settings, nonfinite geometry and oversized grids fail closed',()=>{for(const value of [null,[],{},createLightLayout({model:{widthMm:NaN}}),createLightLayout({manual:[null]}),createLightLayout({grid:{pitchXmm:0}})])assert.ok(validateLightLayout(value).length);assert.doesNotThrow(()=>calculateLightLayout(project(null),geometry()));const g=geometry();g.letters[0].contours[0].outer[0][0]=NaN;assert.ok(calculateLightLayout(project(),g).errors.length);const huge=geometry();huge.letters[0].width=100000;huge.letters[0].height=100000;assert.ok(calculateLightLayout(project(),huge).errors.some(e=>e.includes('densa')));});
test('CSV quantities and SVG derive from actual current modules; stale revision blocked',()=>{const p=createLetterProject({construction:{family:'galvanized-acrylic'},lighting:createLightLayout()}),g=calculateLetters(p),r=calculateLightLayout(p,g),csv=lightLayoutCSV(p,g,r),svg=lightLayoutSVG(p,g,r);assert.equal(csv.split('\r\n').filter(row=>row.startsWith('"modulo";')).length,r.modules.length);assert.ok(svg.includes(`${r.modules.length} módulos`));assert.ok(svg.includes('DEMONSTRATIVO'));assert.throws(()=>lightLayoutSVG({...p,revision:2},g,r),/revisão/);});

test('same revision with changed geometry or LED configuration rejects old export',()=>{const p=createLetterProject({construction:{family:'galvanized-acrylic'},lighting:createLightLayout()}),g=calculateLetters(p),r=calculateLightLayout(p,g);const p2={...p,lighting:createLightLayout({grid:{pitchXmm:50}})};assert.throws(()=>lightLayoutCSV(p2,g,r),/desatualizada/);assert.throws(()=>lightLayoutSVG({...p,text:{...p.text,heightMm:400}},g,r),/desatualizada/);});
test('real LED does not conceal a demonstrative source',()=>{const p=project(createLightLayout({model:{demonstration:false,datasheet:'ficha'}}));assert.equal(calculateLightLayout(p,geometry()).demonstration,true);p.lighting.supply.demonstration=false;p.lighting.supply.datasheet='ficha fonte';assert.equal(calculateLightLayout(p,geometry()).demonstration,false);});
test('internal routing flags a crossing through a void',()=>{const c=createLightLayout({wire:{route:'internal-straight'}}),g=geometry([letter([rect(45,5,10,90)])]),r=calculateLightLayout(project(c),g);assert.ok(r.wires.some(w=>w.needsExternalPassage));assert.ok(r.warnings.some(w=>w.includes('cruza vazio')));});

test('one physical DC output can feed separate parallel branches through an external distributor',()=>{
 const lighting=createLightLayout({model:{maxPerRun:2},supply:{outputs:1,distributionMode:'external',branches:8,ratedCurrentA:5}});
 const r=calculateLightLayout(project(lighting),geometry());
 assert.deepEqual(r.errors,[]);assert.equal(r.circuits.length,5);assert.equal(r.sources.length,1);
 assert.deepEqual(r.circuits.map(c=>c.output),[1,1,1,1,1]);assert.deepEqual(r.circuits.map(c=>c.branch),[1,2,3,4,5]);
 assert.equal(r.sources[0].physicalOutputs,1);assert.equal(r.sources[0].branchCount,5);assert.equal(r.sources[0].distributionMode,'external');
 assert.equal(r.sources[0].nominalPowerW,60);assert.equal(r.sources[0].usablePowerW,48);assert.equal(r.sources[0].currentCapacityA,4);
 assert.equal(r.sources[0].usedPercent,10.8);assert.equal(r.sources[0].availableW,41.52);
 assert.ok(r.warnings.some(w=>w.includes('Definir bornes')));
 assert.ok(r.wires.every(w=>w.sourceId==='F1'));
});
test('rated 12 V 5 A 60 W and 12 V 8.5 A 102 W sources allocate by usable power',()=>{
 const letters=Array.from({length:6},(_,i)=>({...letter(),id:`L${i+1}`,x:100+i*120}));
 const common={model:{powerW:1.5,maxPerRun:3},supply:{outputs:1,distributionMode:'external',branches:100,loadPercent:80}};
 const small=calculateLightLayout(project(createLightLayout({...common,supply:{...common.supply,powerW:60,ratedCurrentA:5}})),geometry(letters));
 const large=calculateLightLayout(project(createLightLayout({...common,supply:{...common.supply,powerW:102,ratedCurrentA:8.5}})),geometry(letters));
 assert.equal(small.totals.powerW,81);assert.equal(small.sources.length,2);assert.equal(small.totals.installedPowerW,120);assert.equal(small.totals.usablePowerW,96);assert.equal(small.totals.availablePowerW,15);assert.equal(small.totals.minimumSourcesByPower,2);
 assert.equal(large.sources.length,1);assert.equal(large.totals.installedPowerW,102);assert.equal(large.totals.usablePowerW,81.6);assert.equal(large.totals.availablePowerW,0.6);assert.equal(large.sources[0].ratedCurrentA,8.5);assert.equal(large.sources[0].currentCapacityA,6.8);
 assert.ok(small.circuits.every(c=>small.sources.find(s=>s.id===c.sourceId).circuitIds.includes(c.id)));
 for(const source of small.sources){assert.ok(source.powerW<=source.usablePowerW);assert.ok(small.wires.filter(w=>w.sourceId===source.id).every(w=>small.circuits.find(c=>c.id===w.circuitId).sourceId===source.id));}
});
test('nominal current constrains power even when supplied nameplate W is larger',()=>{
 const lighting=createLightLayout({model:{powerW:2},supply:{powerW:102,ratedCurrentA:0.5,loadPercent:100,outputs:1,distributionMode:'external',branches:10}});
 const r=calculateLightLayout(project(lighting),geometry());
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.circuits.map(c=>c.moduleCount),[3,3,3]);assert.equal(r.sources.length,3);
 assert.ok(r.sources.every(s=>s.usablePowerW===6&&s.currentCapacityA===0.5&&s.powerW<=6));
});
test('40, 30 and 24 module run limits split branches independently of source quantity',()=>{
 const l={...letter(),width:500,height:100,contours:[{outer:rect(0,0,500,100),holes:[]}]};
 for(const maxPerRun of [40,30,24]){
  const lighting=createLightLayout({model:{maxPerRun},supply:{outputs:1,distributionMode:'external',branches:10,powerW:102,ratedCurrentA:8.5,outputMaxCurrentA:8.5}});
  const r=calculateLightLayout(project(lighting),geometry([l]));
  assert.equal(r.totals.moduleCount,42);assert.equal(r.sources.length,1);assert.equal(r.circuits.length,2);assert.equal(r.circuits[0].moduleCount,maxPerRun);assert.equal(r.circuits[1].moduleCount,42-maxPerRun);
 }
});
test('manufacturer branch current is a separate limit from power supply current',()=>{
 const lighting=createLightLayout({model:{powerW:1.2,maxCurrentA:0.3,maxPerRun:30},supply:{outputMaxCurrentA:5,ratedCurrentA:5,outputs:1,distributionMode:'external',branches:20}});
 const r=calculateLightLayout(project(lighting),geometry());assert.deepEqual(r.errors,[]);assert.deepEqual(r.circuits.map(c=>c.moduleCount),[3,3,3]);assert.equal(r.sources.length,1);
});
test('external branch count limits allocation without treating it as additional physical outputs',()=>{
 const lighting=createLightLayout({model:{maxPerRun:2},supply:{outputs:1,distributionMode:'external',branches:2,ratedCurrentA:5}});
 const r=calculateLightLayout(project(lighting),geometry());assert.equal(r.sources.length,3);assert.deepEqual(r.sources.map(s=>s.branchCount),[2,2,1]);assert.equal(r.totals.minimumSourcesByPower,1);assert.ok(r.circuits.every(c=>c.output===1));
});
test('DC voltage drop uses both conductors and remaining downstream module current per segment',()=>{
 const l={...letter(),x:0,y:0,width:100,height:30,contours:[{outer:rect(0,0,100,30),holes:[]}]};
 const lighting=createLightLayout({model:{powerW:1.2},supply:{xMm:0,yMm:15,zMm:1},wire:{route:'internal-straight',resistanceOhmPerM:0.1,resistanceTemperatureC:20}});
 const p=project(lighting);p.materials={back:{thickness:1}};const r=calculateLightLayout(p,geometry([l]));assert.deepEqual(r.errors,[]);assert.equal(r.modules.length,3);
 assert.deepEqual(r.wires.map(w=>w.kind),['feed','interconnect','interconnect']);assert.deepEqual(r.wires.map(w=>w.currentA),[0.3,0.2,0.1]);
 // 15 mm feed carries 0.3 A; two 35 mm interconnections carry 0.2 A and 0.1 A.
 const expectedDrop=2*0.1*(0.015*0.3+0.035*0.2+0.035*0.1);
 assert.equal(r.circuits[0].dropV,Math.round(expectedDrop*1000)/1000);assert.equal(r.totals.maxDropPercent,0.025);
 assert.equal(r.totals.feedCableM,0.015);assert.equal(r.totals.interconnectCableM,0.07);assert.equal(r.totals.nominalCableM,0.085);assert.equal(r.totals.extraCableM,0.009);assert.equal(r.totals.cableM,0.094);assert.equal(r.totals.conductorM,0.187);
 assert.ok(r.warnings.some(w=>w.includes('20 °C')));assert.ok(r.warnings.some(w=>w.includes('sem descontar chicotes')));
});
test('optional electrical limits reject malformed data instead of silently bypassing constraints',()=>{
 const bad=[{supply:{ratedCurrentA:null}},{supply:{ratedCurrentA:0}},{supply:{ratedCurrentA:NaN}},{supply:{distributionMode:'parallel-sources'}},{supply:{distributionMode:'external'}},{supply:{distributionMode:'external',branches:0}},{supply:{branches:2.5}},{model:{maxCurrentA:0}},{model:{maxCurrentA:Infinity}},{wire:{resistanceTemperatureC:'20'}},{wire:{resistanceTemperatureC:Infinity}},{model:{rotationDeg:45}}];
 for(const fields of bad){const config=createLightLayout(fields);assert.ok(validateLightLayout(config).length,JSON.stringify(fields));assert.equal(calculateLightLayout(project(config),geometry()).modules.length,0);}
});
test('module orientation changes footprint and grid checks while preserving nominal catalog dimensions',()=>{
 const l={...letter(),x:0,y:0,width:30,height:100,contours:[{outer:rect(0,0,30,100),holes:[]}]};
 const lighting=createLightLayout({model:{widthMm:53.848,heightMm:16.002,rotationDeg:90},grid:{pitchXmm:30,pitchYmm:60,clearanceMm:3}});
 assert.deepEqual(validateLightLayout(lighting),[]);const r=calculateLightLayout(project(lighting),geometry([l]));assert.equal(r.modules.length,1);assert.equal(r.modules[0].widthMm,16.002);assert.equal(r.modules[0].heightMm,53.848);assert.equal(r.modules[0].rotationDeg,90);assert.equal(r.config.model.widthMm,53.848);
 assert.ok(moduleFits(l,15,50,lighting.model,3));assert.equal(moduleFits(l,15,50,{...lighting.model,rotationDeg:0},3),false);
 assert.ok(validateLightLayout({...lighting,grid:{...lighting.grid,pitchYmm:40}}).some(e=>e.includes('sobreposição')));
 assert.ok(validateLightLayout({...lighting,model:{...lighting.model,rotationDeg:0}}).some(e=>e.includes('sobreposição')));
});

test('CSV and SVG distinguish source nameplate, used power, external branches and gross DC conductors',()=>{
 const p=createLetterProject({text:{value:'OB',heightMm:300},construction:{family:'galvanized-acrylic'},lighting:createLightLayout({model:{maxPerRun:2,widthMm:12,heightMm:8},grid:{pitchXmm:20,pitchYmm:25,clearanceMm:2},supply:{outputs:1,distributionMode:'external',branches:10,ratedCurrentA:5}})}),g=calculateLetters(p),r=calculateLightLayout(p,g);
 assert.deepEqual(r.errors,[]);const csv=lightLayoutCSV(p,g,r),svg=lightLayoutSVG(p,g,r);
 assert.ok(csv.includes('Saída 1; ramal 1; distribuidor externo'));assert.ok(csv.includes('nominal 60 W; corrente nominal 5 A; capacidade utilizável 48 W'));
 assert.ok(csv.includes('Alimentação do ramal'));assert.ok(csv.includes('Interligação entre módulos'));assert.ok(csv.includes('sem desconto de chicotes; sem rede AC; fontes independentes'));
 assert.ok(svg.includes('Par DC bruto:'));assert.ok(svg.includes('Condutores +/−:'));assert.ok(svg.includes(`fontes nominais: ${r.totals.installedPowerW} W`));
 assert.equal(csv.split('\r\n').filter(row=>row.startsWith('"fonte";')).length,r.sources.length);
});

test('known LED depth must fit from the top of the back to the inner face plane',()=>{
 const p=project(createLightLayout({model:{depthMm:11.938}}));p.construction.depthMm=14.938;p.materials={back:{thickness:3},front:{thickness:10}};
 const r=calculateLightLayout(p,geometry());assert.deepEqual(r.errors,[]);assert.equal(r.modules.length,9);assert.equal(r.depthCheck.status,'fits-nominal-cavity');assert.equal(r.depthCheck.remainingDepthMm,0);
 assert.ok(r.modules.every(m=>m.z===3&&m.depthMm===11.938));
 // The face starts at depthMm and its thickness extrudes outwards, not into the cavity.
 assert.equal(r.depthCheck.faceInnerZmm,14.938);
 p.construction.depthMm=14.9;const blocked=calculateLightLayout(p,geometry());assert.equal(blocked.depthCheck.status,'interference');assert.ok(blocked.errors.some(e=>e.includes('ultrapassa a cavidade')));assert.equal(blocked.modules.length,0);
});
test('physical depth is validated and missing data remains visibly pending without fabricating LED thickness',()=>{
 for(const depthMm of [null,0,-1,NaN,Infinity,'12',1001])assert.ok(validateLightLayout(createLightLayout({model:{depthMm}})).some(e=>e.includes('Profundidade física')));
 const unknown=project();unknown.construction.depthMm=75;unknown.materials={back:{thickness:3}};const r=calculateLightLayout(unknown,geometry());
 assert.equal(r.depthCheck.status,'pending');assert.ok(r.modules.every(m=>m.depthMm===null&&m.z===3));assert.ok(r.warnings.some(w=>w.includes('espessura visual simbólica')));
 const noSupport=project(createLightLayout({model:{depthMm:12}}));noSupport.construction.depthMm=75;const pending=calculateLightLayout(noSupport,geometry());assert.equal(pending.depthCheck.status,'pending');assert.ok(pending.modules.every(m=>m.z===0));assert.ok(pending.warnings.some(w=>w.includes('Plano de apoio')));
 noSupport.construction.depthMm=10;assert.ok(calculateLightLayout(noSupport,geometry()).errors.some(e=>e.includes('ultrapassa')));
});
test('CSV preserves exact manufacturer SKU, CCT, IP and edited catalog provenance for LEDs, supply and wire',()=>{
 let lighting=createLightLayout({model:{rotationDeg:90},grid:{pitchXmm:40,pitchYmm:70}});
 lighting=applyLedCatalog(lighting,LED_CATALOG[0].id);lighting=applySupplyCatalog(lighting,SUPPLY_CATALOG[0].id);lighting=applyWireCatalog(lighting,WIRE_CATALOG[1].id);
 const p=createLetterProject({text:{value:'M',heightMm:500},construction:{family:'galvanized-acrylic',depthMm:75},materials:{back:{material:'pvc',operation:'router',thickness:3}},lighting}),g=calculateLetters(p),r=calculateLightLayout(p,g);
 assert.deepEqual(r.errors,[]);assert.ok(r.modules.length>0);const csv=lightLayoutCSV(p,g,r);
 for(const fragment of ['Principal Sloan','M-QMG2S-12-65','6500 K','IP IP67','MEAN WELL','SKU LPV-60-12','Corfio','seção 1.5 mm²','Dados do modelo de catálogo'])assert.ok(csv.includes(fragment),fragment);
 p.lighting.model.powerW=0.73;p.lighting.supply.powerW=59;p.lighting.wire.resistanceOhmPerM=0.0134;const edited=calculateLightLayout(p,g);assert.deepEqual(edited.errors,[]);const editedCsv=lightLayoutCSV(p,g,edited);
 for(const type of ['modulo','fonte','cabo'])assert.ok(editedCsv.split('\r\n').filter(row=>row.startsWith(`"${type}";`)).every(row=>row.includes('Catálogo alterado; conferir parâmetros e ficha')));
});
