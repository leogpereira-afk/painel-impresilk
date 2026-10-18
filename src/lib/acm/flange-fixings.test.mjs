import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from './model.mjs';
import {nestPieces} from './nesting.mjs';
import {resolveFixing} from '../../../supabase/functions/_shared/acm-fixing.mjs';
import {buildProject} from './engine.mjs';
import {createStructureFrame} from './structure.mjs';
import {documentGeometry,assemblyFaceGeometry,pieceSVG,projectReportHTML} from './documents.mjs';
const make=(frame=false)=>{const p=createProject();p.front={width:1000,height:1000};p.layout.maxWidth=p.layout.maxHeight=1000;p.fixing.type='hybrid';p.fixing.screwProduct={drillDiameter:5};p.structure.spacing=300;if(frame){p.structure.frame=createStructureFrame(p);p.structure.frame.spacingX=p.structure.frame.spacingY=300;}return p;};
const valid=p=>{const r=buildProject(p);assert.equal(r.valid,true,JSON.stringify(r.errors));return r;};
const insideFace=(piece,p)=>p.x>piece.blank.face.x&&p.x<piece.blank.face.x+piece.width&&p.y>piece.blank.face.y&&p.y<piece.blank.face.y+piece.height;
test('both engines drill only flange strips, leave front intact, preserve internal tape and never claim anchor support',()=>{
 for(const frame of [false,true]){const p=make(frame),r=valid(p),piece=r.pieces[0];assert.ok(piece.fixings.screws.length);assert.ok(piece.fixings.tape.length);assert.ok(piece.fixings.tape.some(t=>t.x1>p.fixing.edgeOffset&&t.x1<piece.width-p.fixing.edgeOffset));
 for(const screw of piece.fixings.screws){assert.equal(screw.coordinateSpace,'blank');assert.equal(screw.supportStatus,'unverified');assert.equal(screw.supportId,undefined);assert.equal(insideFace(piece,screw),false);assert.equal(screw.foldNumber,1);}
 assert.ok(r.warnings.some(w=>w.code==='FLANGE_CONNECTION_UNVERIFIED'));
 const g=documentGeometry(piece,{back:false});assert.deepEqual(g.drills.map(h=>[h.x,h.y]),piece.fixings.screws.map(h=>[h.x,h.y]));assert.equal(assemblyFaceGeometry(r.surfaces[0],r).screws.length,0);
 }
});
test('flat pieces produce no invented flange hole and imported explicit holes are unchanged',()=>{
 const p=make();p.edges={left:0,right:0,top:0,bottom:0};const r=valid(p);assert.equal(r.totals.screws,0);assert.ok(r.warnings.some(w=>w.code==='FLANGE_MISSING'));
 p.technicalDrawing={version:1,name:'Explícito',unit:'mm',tolerance:.1,parts:[{id:'P',width:100,height:80,contour:[[0,0],[100,0],[100,80],[0,80]],holes:[{x:50,y:40,diameter:10}],grooves:[],quantity:1}]};const imported=valid(p).pieces[0];assert.equal(documentGeometry(imported,{back:false}).drills[0].x,50);
});
test('selected return operation and disabled edge locate holes on that exact strip after compensation',()=>{
 const p=make();p.edges.left={type:'fold',height:30,folds:[{id:'a',length:30,angle:90,direction:'back'},{id:'b',length:20,angle:90,direction:'back'}]};p.fixing.pattern={surface:'flange',flangeFoldByEdge:{left:2,right:0,top:0,bottom:0},flangeOffset:8};p.fabrication.compensation=2;
 const piece=valid(p).pieces[0];assert.ok(piece.fixings.screws.length);for(const h of piece.fixings.screws){assert.equal(h.edge,'left');assert.equal(h.foldNumber,2);assert.equal(h.foldId,'b');assert.equal(h.x,10);}
});
test('unknown surface, impossible flange offset and circle overlapping channel do not manufacture face holes',()=>{
 const p=make();p.fixing.pattern={surface:'face'};assert.ok(validateProject(p).some(e=>e.code==='FIXING_PATTERN_SURFACE'));
 p.fixing.pattern={surface:'flange',flangeOffset:2};const r=valid(p);assert.equal(r.totals.screws,0);assert.ok(r.warnings.some(w=>w.code==='FLANGE_HOLE_CLEARANCE'));
});
test('new cladding fields are optional for old JSON and validate independently of fixing geometry',()=>{
 const p=make();delete p.cladding;assert.deepEqual(validateProject(p),[]);p.cladding={panelForm:'flat',joint:'dry',exposure:'outdoor'};const r=valid(p);assert.ok(r.warnings.some(w=>w.code==='CLADDING_FORM_MISMATCH'));p.cladding.joint='unknown';assert.ok(validateProject(p).length);
});
test('back export mirrors actual flange x once and produces explicit numbered circles',()=>{
 const p=make(),piece=valid(p).pieces[0],front=documentGeometry(piece,{back:false}),back=documentGeometry(piece);assert.ok(front.drills.length);
 for(let i=0;i<front.drills.length;i++){assert.equal(back.drills[i].x,piece.blank.width-front.drills[i].x);assert.equal(insideFace(piece,front.drills[i]),false);}
 assert.match(pieceSVG(piece,{project:p}),/id="DRILL"/);
});

test('flange holes follow the selected second return in 3D and never occupy the face plane',async()=>{
 const {flangeFixingTransform}=await import('../../components/acm/viewportGeometry.mjs');const p=make();p.edges.left={type:'fold',height:30,folds:[{id:'a',length:30,angle:90,direction:'back'},{id:'b',length:20,angle:90,direction:'back'}]};p.fabrication.compensation=2;p.fixing.pattern={flangeFoldByEdge:{left:2,right:0,top:0,bottom:0},flangeOffset:9};const piece=valid(p).pieces[0],hole=piece.fixings.screws[0],located=flangeFixingTransform(piece,hole);
 assert.ok(Math.abs(located.position[0]-10)<1e-6);assert.ok(Math.abs(located.position[2]+30)<1e-6);assert.ok(Math.abs(located.normal[2]+1)<1e-6);
 const first=make();first.fixing.pattern={flangeFoldByEdge:{left:1,right:0,top:0,bottom:0}};const one=valid(first).pieces[0],point=flangeFixingTransform(one,one.fixings.screws[0]);assert.ok(Math.abs(point.position[0])<1e-6);assert.ok(Math.abs(point.position[2]+15)<1e-6);
});

test('mounting report counts flange screws even though they are not projected onto the front',()=>{
 const p=make(),r=valid(p),piece=r.pieces[0],html=projectReportHTML(p,r,nestPieces(r.pieces,p.stock,p.fabrication),{discipline:'montagem'});
 assert.match(html,/<th>Parafusos nas abas \(não projetados\)<\/th>/);
 assert.ok(html.includes(`<td>${piece.fixings.tape.length}</td><td>0</td><td>${piece.fixings.screws.length}</td>`));
});

test('legacy front-pattern validation is not reused for flange geometry, and source record is preserved',()=>{
 const p=make();p.fixing.validated=true;p.fixing.pattern={source:'Ficha',responsible:'Técnico',validatedAt:'2026-10-17'};
 const resolved=resolveFixing(p,{id:'F-01'});assert.equal(resolved.validated,false);assert.equal(resolved.pattern.source,'Ficha');assert.equal(p.fixing.validated,true);
 p.fixing.pattern.surface='flange';assert.equal(resolveFixing(p,{id:'F-01'}).validated,true);
});

test('global screw budget spans all pieces in either engine',()=>{
 for(const frame of [false,true]){const p=make(frame);p.front={width:5000,height:2000};p.fixing.type='screws';p.fixing.pattern={maxPitch:1};if(frame)p.structure.frame=createStructureFrame(p);const r=buildProject(p);assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.code==='FIXING_LIMIT'));assert.ok(r.pieces.reduce((n,p)=>n+p.fixings.screws.length,0)<=30000);}
});

test('flat-form warning follows effective piece folds, including flat overrides',()=>{
 const p=make();p.cladding.panelForm='flat';const initial=valid(p);for(const piece of initial.pieces)p.overrides[piece.id]={edges:{left:0,right:0,top:0,bottom:0}};const result=valid(p);assert.equal(result.warnings.some(w=>w.code==='CLADDING_FORM_MISMATCH'),false);
});
