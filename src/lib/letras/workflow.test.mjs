import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLetterProject,setLetterFamily} from './model.mjs';
import {importVectorArtwork} from './importers.mjs';
import {calculateLetters} from './engine.mjs';
import {createFabricationConfig,calculateFabrication} from './fabrication.mjs';
import {createLightLayout,calculateLightLayout,lightLayoutCSV,moduleFits} from './light-layout.mjs';
import {nestLetters,costLetters} from './nesting.mjs';
import {letterReportHTML} from './documents.mjs';
import {createPainting} from './finishing.mjs';
import {createElectrical} from './electrical.mjs';
import {createInstallation} from '../acm/installation.mjs';
import {validateStudioProject} from './project.mjs';
import {createFabricationStorage} from '../fabrication/storage.mjs';
function make(format='svg'){
 const input=readFileSync(new URL(`../../../public/examples/letras-demo.${format}`,import.meta.url),'utf8');
 const {errors,needsScale,...artwork}=importVectorArtwork(input,{fileName:`ficticio.${format}`});assert.deepEqual(errors,[]);assert.equal(needsScale,false);
 return {...setLetterFamily(createLetterProject({id:'fluxo-ficticio',name:'Projeto fictício',artwork:{...artwork,scaleConfirmed:true}}),'galvanized-acrylic'),painting:createPainting(),electrical:createElectrical(),lighting:createLightLayout(),fabrication:createFabricationConfig({overlapMm:5,compensationMm:0,maxStripLengthMm:1000}),fixing:{},installation:createInstallation(),stock:{width:1220,length:2440,trim:10,kerf:3,rotation:true,remnants:[]},prices:{},appearance:{front:'#FFFFFF',side:'#0057B8',back:'#808080',wall:'#e8edf4',finish:'matte',overrides:{}}};
}
for(const format of ['svg','dxf'])test(`${format} pronto percorre geometria, fabricação, LEDs, chapa e caderno com mesmos IDs`,()=>{
 const p=make(format);validateStudioProject(p);const g=calculateLetters(p),f=calculateFabrication(p,g),l=calculateLightLayout(p,g),nest=nestLetters(p,g,f);
 assert.deepEqual(g.errors,[]);assert.deepEqual(f.errors,[]);assert.deepEqual(l.errors,[]);assert.equal(g.letters.length,2);assert.ok(l.totals.moduleCount>0);assert.equal(l.modules.length,l.perLetter.reduce((s,x)=>s+x.count,0));
 assert.ok(l.modules.every(m=>moduleFits(g.letters.find(x=>x.id===m.letterId),m.x,m.y,l.config.model,l.config.grid.clearanceMm)));
 assert.equal(lightLayoutCSV(p,g,l).split('\r\n').filter(s=>s.startsWith('"modulo";')).length,l.modules.length);
 const strips=f.strips.flatMap(s=>s.segments);for(const strip of strips){const piece=nest.pieces.find(x=>x.id===strip.id);assert.ok(piece);assert.equal(piece.width,strip.grossLengthMm);assert.equal(piece.height,strip.widthMm);}
 const html=letterReportHTML(p,g,nest);assert.ok(html.includes(`${l.modules.length} módulos`));assert.ok(html.includes(g.components[0].id));assert.ok(html.includes('5'));assert.ok(!html.includes('<pre>'));assert.ok(html.includes('Fundo / primer'));
});
test('borda e aba mudam desenvolvimento e chapa; compensação ausente mantém orçamento incompleto',()=>{
 const p=make(),g=calculateLetters(p),f=calculateFabrication(p,g);p.revision++;p.construction.depthMm=150;p.fabrication.flangeMode='manual';p.fabrication.joinFlangeMm=8;const g2=calculateLetters(p),f2=calculateFabrication(p,g2),n2=nestLetters(p,g2,f2);
 assert.equal(f2.strips[0].widthMm,158);assert.notEqual(g.bounds.depth,g2.bounds.depth);assert.equal(f.strips[0].nominalLengthMm,f2.strips[0].nominalLengthMm);assert.ok(n2.pieces.filter(x=>x.parentId).every(x=>x.height===158));
 p.fabrication.compensationMm=null;const n3=nestLetters(p,g2,calculateFabrication(p,g2));assert.equal(n3.developmentPending,true);assert.equal(costLetters(p,g2,n3).complete,false);
});
test('lateral polimérica fica no perfil linear sem fingir compra em chapa',()=>{
 const p=setLetterFamily(make(),'polymeric'),g=calculateLetters(p),f=calculateFabrication(p,g),nest=nestLetters(p,g,f);assert.ok(nest.linearStock.length>0);assert.ok(nest.linearLengthM>0);assert.equal(nest.sheets.some(s=>s.material.core==='polymeric'),false);assert.equal(calculateLightLayout(p,g).applicable,true);assert.equal(costLetters(p,g,nest).complete,false);
});
test('salvar, reabrir e importar preserva arte, módulos e plano da revisão',async()=>{
 let store;const backend={async transact(key,mode,fn){const r=fn(structuredClone(store));if(mode==='readwrite')store=structuredClone(r.envelope);return r.result;}};
 const storage=createFabricationStorage({product:'letra-caixa',validate:validateStudioProject,backend}),p=make();await storage.save('usuario-ficticio',p,0);const copy=(await storage.load('usuario-ficticio')).project;assert.deepEqual(copy,p);const imported=storage.parse(storage.serialize(copy));assert.deepEqual(calculateLightLayout(imported,calculateLetters(imported)),calculateLightLayout(p,calculateLetters(p)));
 const invalid=structuredClone(p);invalid.lighting.model.powerW=-1;assert.throws(()=>storage.serialize(invalid),/Potência/);assert.deepEqual((await storage.load('usuario-ficticio')).project,p);
});
