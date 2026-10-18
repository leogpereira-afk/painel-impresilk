import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../lib/acm/model.mjs';
import { buildProject } from '../../lib/acm/engine.mjs';
import { flangeSection, flangeFixingTransform, structureWallLayers, polygonArea, fixingMarkerSpec } from './viewportGeometry.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require=createRequire(import.meta.url);
const bundled=await build({entryPoints:[fileURLToPath(new URL('./FixingEditor.jsx',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));}}]});
const temp=await mkdtemp(join(tmpdir(),'acm-detail-test-'));let AssemblyDetail,FixingMap;
try{const path=join(temp,'detail.mjs');await writeFile(path,bundled.outputFiles[0].text);({AssemblyDetail,FixingMap}=await import(pathToFileURL(path).href));}finally{await rm(temp,{recursive:true,force:true});}
function fixture(){const project=createProject();project.fixing.type='hybrid';project.fixing.screwProduct={drillDiameter:6};return {project,result:buildProject(project)};}
test('flange section follows actual engine operation lengths and return orientation on every edge',()=>{
 const {project}=fixture();
 for(const count of [1,2]){
  for(const edge of ['left','right','top','bottom'])project.edges[edge]={type:'fold',height:40,folds:Array.from({length:count},(_,i)=>({id:`d${i+1}`,length:i?20:40,angle:90,direction:'back'}))};
  const result=buildProject(project);assert.equal(result.valid,true,JSON.stringify(result.errors));
  const piece=result.pieces[0];
  for(const edge of ['left','right','top','bottom']){
   const section=flangeSection(piece,edge);assert.equal(section.segments.length,count);assert.equal(section.thickness,project.material.thickness);
   section.segments.forEach((s,i)=>{assert.equal(s.length,piece.blank.profiles[edge].operations[i].length);assert.ok(Math.abs(Math.hypot(s.end[0]-s.start[0],s.end[1]-s.start[1])-piece.blank.profiles[edge].operations[i].length)<1e-7);if(i)assert.ok(Math.hypot(s.start[0]-section.segments[i-1].end[0],s.start[1]-section.segments[i-1].end[1])<1e-7);});
   assert.ok(section.segments[0].end[1]<0,'Back fold moves behind the face');
   if(count===2)assert.ok(section.segments[1].end[0]<section.segments[1].start[0],'Second back fold returns inward');
  }
 }
});
test('automatic fixing locations stay on folded flanges and missing flange is not projected onto face',()=>{
 const {result}=fixture(),piece=result.pieces[0];assert.ok(piece.fixings.screws.length);
 for(const hole of piece.fixings.screws){const position=flangeFixingTransform(piece,hole);assert.ok(position?.panel);assert.ok(Math.abs(position.position[2])>0);assert.ok(Math.abs(Math.hypot(...position.normal)-1)<1e-8);}
 assert.equal(flangeFixingTransform(piece,{coordinateSpace:'blank',edge:'unknown',foldNumber:1,x:1,y:1}),null);
});
test('SSR exposes scene-first fixing modes and real detail without mutating project',()=>{
 const {project,result}=fixture(),before=JSON.stringify(project),selectedId=result.pieces[0].id;
 const map=renderToStaticMarkup(createElement(FixingMap,{project,result,selectedId}));assert.match(map,/3D montado/);assert.doesNotMatch(map,/Reduzir mapa de fixação/);assert.match(map,/Enquadrar desenho/);assert.match(map,/Verso 2D/);assert.match(map,/Detalhe do encaixe/);assert.ok(map.indexOf('acm-fixing-scene')<map.indexOf('Quantidades por peça'));
 const detail=renderToStaticMarkup(createElement(AssemblyDetail,{project,result,selectedId}));assert.match(detail,/Encaixe a detalhar/);assert.match(detail,/Seção calculada/);assert.match(detail,/espessura/);assert.match(detail,/Isométrica pelo verso/);assert.match(detail,/D1: [\d,.]+ mm/);assert.equal(JSON.stringify(project),before);
});

test('tube wall layers preserve mitres and specified hollow cross-section without inventing wall',()=>{
 const segment={axis:'horizontal',width:40,depth:30,wall:2,contour:[[0,0],[100,0],[60,40],[40,40]]};
 const layers=structureWallLayers(segment);assert.equal(layers.length,4);
 assert.deepEqual(layers[0].contour,segment.contour);assert.deepEqual(layers.map(l=>[l.depth,l.z]),[[2,-15],[2,13],[26,-13],[26,-13]]);
 assert.ok(polygonArea(layers[2].contour)<polygonArea(segment.contour));
 assert.ok(layers[2].contour.every(p=>p[1]<=2));assert.ok(layers[3].contour.every(p=>p[1]>=38));
 assert.equal(structureWallLayers({...segment,wall:null}),null);
});

test('unknown drill diameter is a coordinate cross and specified diameter preserves actual radius',()=>{
 for(const drillDiameter of [undefined,null,0,-1,NaN])assert.deepEqual(fixingMarkerSpec({drillDiameter}),{kind:'position',radius:null});
 assert.deepEqual(fixingMarkerSpec({drillDiameter:6}),{kind:'diameter',radius:3});
});
