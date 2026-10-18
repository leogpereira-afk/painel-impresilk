import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject,foldProfile,calibrationSignature,calibrationStatus} from './model.mjs';
import {buildProject,developBlank,polygonArea} from './engine.mjs';
import {documentGeometry,pieceSVG,pieceDXF,routerCSV,structureCSV,projectReportHTML} from './documents.mjs';
import {nestPieces} from './nesting.mjs';
import {unfoldedPanels,foldedPanelTransform} from '../../components/acm/viewportGeometry.mjs';
const chain=(lengths,directions=lengths.map(()=> 'back'),angles=lengths.map(()=>90))=>({type:'fold',height:lengths[0],folds:lengths.map((length,i)=>({id:String(i+1),length,angle:angles[i],direction:directions[i]}))});
function project() {const p=createProject();p.front={width:400,height:300};p.edges={left:0,right:0,top:0,bottom:0};return p;}
function valid(p){const r=buildProject(p);assert.equal(r.valid,true,JSON.stringify(r.errors));return r;}

test('two real asymmetric chains develop every segment and channel in explicit face-outward order',()=>{
 const p=project();p.edges.left=chain([30,20]);p.edges.right=chain([40,15],['back','front']);
 const r=valid(p),b=r.pieces[0].blank;
 assert.equal(b.width,505);assert.equal(b.height,300);assert.equal(b.grooves.length,4);
 assert.deepEqual(b.grooves.map(g=>[g.edge,g.number,g.x1]),[['left',1,50],['left',2,20],['right',1,450],['right',2,490]]);
 assert.deepEqual(b.profiles.left.points,[{x:0,z:0},{x:0,z:-30},{x:-20,z:-30}]);
 assert.deepEqual(b.profiles.right.points,[{x:0,z:0},{x:0,z:-40},{x:15,z:-40}]);
 p.edges.left.folds[1].length=27;const changed=valid(p).pieces[0];
 assert.equal(changed.blank.width,512);assert.deepEqual(changed.blank.grooves.filter(g=>g.edge==='left').map(g=>g.x1),[57,27]);
 assert.notEqual(changed.geometrySignature,r.pieces[0].geometrySignature);
});

test('per-operation compensation deducts once from its following segment and cannot collapse channels',()=>{
 const p=project();p.edges.left=chain([30,20]);p.fabrication.compensation=2;p.edges.left.folds[1].compensation=1;
 const b=valid(p).pieces[0].blank;assert.equal(b.width,447);assert.deepEqual(b.grooves.map(g=>g.x1),[47,19]);
 assert.deepEqual(b.profiles.left.operations.map(o=>[o.compensation,o.developedLength]),[[2,28],[1,19]]);
 p.edges.left.folds[0].compensation=20;p.edges.left.folds[0].length=24;p.edges.left.height=24;
 assert.ok(buildProject(p).errors.some(e=>e.code==='BLANK'));
});

test('numeric and old object single folds preserve identical blank geometry',()=>{
 const p=project();p.edges={left:30,right:40,bottom:20,top:0};const a=valid(p).pieces[0];
 p.edges={left:{type:'fold',height:30},right:chain([40]),bottom:chain([20]),top:{type:'none',height:0}};
 const b=valid(p).pieces[0];assert.deepEqual(b.blank,a.blank);assert.deepEqual(b.edges,a.edges);
});

test('strict schema rejects unsupported geometric parameters, excessive chains and inconsistent values',()=>{
 const cases=[{type:'radius',height:20},{type:'fold',height:20,radius:3},chain([20,20,20,20,20]),{...chain([20,10]),height:21},chain([20],['up']),chain([20],['back'],[180]),chain([0]),{type:'none',height:10},chain([20])];cases.at(-1).folds[0].radius=3;
 for(const edge of cases){const p=project();p.edges.left=edge;assert.ok(validateProject(p).length,JSON.stringify(edge));}
});

test('self-return and opposite-chain collisions fail explicitly instead of fabricating overlapping return',()=>{
 const p=project();p.edges.left=chain([30,20,30,20]);assert.ok(buildProject(p).errors.some(e=>e.code==='BLANK'&&/face|cruza/.test(e.message)));
 p.edges.left=chain([30,250]);p.edges.right=chain([30,250]);assert.ok(buildProject(p).errors.some(e=>/opostos/.test(e.message)));
});

test('adjacent inward returns use declared conservative setbacks and partition the complete cut contour',()=>{
 const p=project();p.edges={left:chain([30,20]),right:chain([30,10]),bottom:chain([30,25]),top:chain([30,15])};
 const piece=valid(p).pieces[0],panels=unfoldedPanels(piece);
 assert.equal(panels.length,9);assert.equal(piece.blank.cornerSetbacks.bottom,26);assert.equal(piece.blank.cornerSetbacks.left,21);
 assert.ok(Math.abs(panels.reduce((sum,panel)=>sum+polygonArea(panel.contour),0)-piece.blank.area)<.001);
});

test('3D second hinge follows the first fold, with nominal endpoint after compensation',()=>{
 const p=project();p.edges.left=chain([30,20]);p.fabrication.compensation=2;
 const piece=valid(p).pieces[0],panels=unfoldedPanels(piece),one=panels.find(p=>p.edge==='left'&&p.index===0),two=panels.find(p=>p.edge==='left'&&p.index===1);
 const flat=foldedPanelTransform(piece,two,0),folded=foldedPanelTransform(piece,two,1),first=foldedPanelTransform(piece,one,1);
 assert.deepEqual(flat.origin,[18,0,0]);assert.ok(Math.abs(folded.origin[0]-46)<1e-6);assert.equal(folded.origin[2],-30);
 assert.ok(Math.abs(first.angle+Math.PI/2)<1e-6);assert.ok(Math.abs(folded.angle+Math.PI)<1e-6);assert.equal(folded.scale,20/18);
});

test('up to four alternating bends retain independent operations at non-right angles',()=>{
 const p=project();p.edges.right=chain([30,20,25,15],['back','front','back','front'],[60,35,45,20]);
 const piece=valid(p).pieces[0];assert.equal(piece.blank.grooves.length,4);assert.equal(piece.blank.width,490);
 assert.equal(unfoldedPanels(piece).length,5);assert.ok(foldProfile(p.edges.right).points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});

test('machining mirror applies once to channels and flange holes already in developed coordinates',()=>{
 const p=project();p.edges.left=chain([30,20]);p.edges.right=chain([40]);p.fixing.type='screws';p.fixing.drillDiameter=5;
 const r=valid(p),piece=r.pieces[0],front=documentGeometry(piece,{back:false}),back=documentGeometry(piece);
 assert.equal(front.drills[0].x,piece.fixings.screws[0].x);assert.equal(back.drills[0].x,piece.blank.width-front.drills[0].x);
 for(let i=0;i<front.grooves.length;i++)assert.equal(back.grooves[i].x1,piece.blank.width-front.grooves[i].x1);
 const svg=pieceSVG(piece,{project:p}),dxf=pieceDXF(piece,{project:p});assert.match(svg,/id="DRILL" stroke="#0000ff"/);assert.match(svg,/left D2 90°/);assert.match(dxf,/left D2 90deg back/);
 const nest=nestPieces(r.pieces,p.stock,p.fabrication);assert.match(routerCSV(p,r,nest),/D2/);assert.match(routerCSV(p,r,nest),/Azul/);
});

test('calibration fingerprint includes every new bend angle and second return length',()=>{
 const p=project();p.edges.left=chain([30,20]);const signature=calibrationSignature(p);p.edges.left.folds[1].length=21;assert.notEqual(calibrationSignature(p),signature);
 const changed=calibrationSignature(p);p.edges.left.folds[1].angle=80;assert.notEqual(calibrationSignature(p),changed);
});

test('technical flat mode preserves polygon, holes and grooves, counts copies and rejects invalid input',()=>{
 const p=project();p.technicalDrawing={version:1,name:'Amostra técnica',unit:'mm',tolerance:.1,parts:[{id:'L',width:100,height:80,contour:[[0,0],[100,0],[100,40],[50,40],[50,80],[0,80]],holes:[{x:20,y:20,diameter:5}],grooves:[{x1:5,y1:30,x2:45,y2:30}],quantity:2}]};
 const r=valid(p);assert.equal(r.pieces.length,2);assert.equal(r.structure.segments.length,0);assert.deepEqual(r.pieces[0].blank.contour,p.technicalDrawing.parts[0].contour);
 assert.equal(r.pieces[0].blank.holes.length,1);assert.equal(r.pieces[0].blank.grooves.length,1);assert.equal(r.pieces[0].blank.folds.length,0);
 assert.equal(unfoldedPanels(r.pieces[0]).length,1);assert.ok(Math.abs(r.totals.developedArea-2*(6000-Math.PI*2.5**2))<.00001);
 const n=nestPieces(r.pieces,p.stock,p.fabrication);const html=projectReportHTML(p,r,n,{discipline:'apresentacao'});assert.match(html,/fill-rule="evenodd"/);assert.match(html,/M 0 0 L 100 0 L 100 40 L 50 40 L 50 80 L 0 80 Z/);
 p.technicalDrawing.parts[0].unknownShape=[];assert.equal(buildProject(p).valid,false);
});

test('serralheria accepts absent ACM nesting, numeric custom DIM and detailed cut sequence',()=>{
 const p=project();p.structure.profile='custom';p.structure.customProfile={width:33,depth:27};const r=valid(p);
 const csv=structureCSV(p,r,null);assert.match(csv,/33 × 27 mm/);assert.match(csv,/Sequência na barra/);assert.match(csv,/Início na barra/);assert.match(csv,/Ângulo A/);
 assert.match(projectReportHTML(p,r,null,{discipline:'serralheria'}),/33 × 27 mm/);
 assert.throws(()=>projectReportHTML(p,r,null,{discipline:'router'}),/plano de corte/);
});


test('legacy one-angle sample cannot release a new multi-bend geometry as calibrated',()=>{
 const p=project();p.edges.left=chain([30,20]);p.fabrication.calibration={approved:true,signature:calibrationSignature(p)};
 const state=calibrationStatus(p);assert.equal(state.valid,false);assert.match(state.reason,/múltiplas dobras/);
});

test('nesting reconciles developed net area with circular holes while reserving the whole rectangular envelope',()=>{
 const p=project();p.technicalDrawing={version:1,name:'Área líquida',unit:'mm',tolerance:.1,parts:[{id:'P',width:100,height:80,contour:[[0,0],[100,0],[100,80],[0,80]],holes:[{x:25,y:25,diameter:20}],grooves:[],quantity:2}]};
 const r=valid(p),nesting=nestPieces(r.pieces,p.stock,p.fabrication);
 assert.ok(Math.abs(nesting.usedArea-r.totals.developedArea)<.00001);
 assert.equal(nesting.sheets.reduce((sum,s)=>sum+s.occupiedArea,0),16000);
 const piece={...r.pieces[0],blank:{...r.pieces[0].blank,holes:[],cutouts:[{x:10,y:10,width:10,height:20}],area:7800}};
 const cutout=nestPieces([piece],p.stock,p.fabrication);assert.equal(cutout.usedArea,7800);
});
