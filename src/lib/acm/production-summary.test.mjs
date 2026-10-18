import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.mjs';
import { buildProject } from './engine.mjs';
import { createStructureFrame, metalStockKey } from './structure.mjs';
import { nestPieces } from './nesting.mjs';
import { metalProductionSummary,acmProductionSummary,productionColor } from './production-summary.mjs';
import { projectReportHTML } from './documents.mjs';
const fixture=()=>{const project=createProject();project.front={width:1800,height:1200};project.structure.frame=createStructureFrame(project);const result=buildProject(project),nesting=nestPieces(result.pieces,project.stock,project.fabrication);assert.ok(result.valid);return {project,result,nesting}};
test('metalon grouping conserves engine pieces and uses allocated bars, not division by stock length',()=>{
 const {result}=fixture(),summary=metalProductionSummary(result);assert.equal(summary.rows.reduce((sum,r)=>sum+r.quantity,0),result.structure.segments.length);assert.equal(summary.consumptionRows.reduce((sum,r)=>sum+Number(r.cells[2]),0),result.structure.bars.filter(b=>b.source!=='remnant').length);for(const r of summary.rows)assert.match(r.cells[3],/cm$/);
 // An added physical offcut allocation changes source counts without changing the piece lengths.
 result.structure.bars[0].source='remnant';const changed=metalProductionSummary(result);assert.equal(changed.consumptionRows.reduce((sum,r)=>sum+Number(r.cells[3]),0),1);assert.equal(changed.consumptionRows.reduce((sum,r)=>sum+Number(r.cells[2]),0),result.structure.bars.length-1);
});
test('different cuts, walls and orientations never coalesce and colors stay stable after reorder',()=>{
 const {result}=fixture(),m=result.structure.segments[0];result.structure.segments=[m,{...m,id:'other',angleA:45},{...m,id:'oriented',profileSpec:{...m.profileSpec,orientation:'depth'}},{...m,id:'wall',wall:1.2,stockKey:metalStockKey({...m.profileSpec,wall:1.2}),profileSpec:{...m.profileSpec,wall:1.2}}];const s=metalProductionSummary(result);assert.equal(s.rows.length,4);assert.ok(s.rows.some(r=>r.cells[5]==='A 45° / B 90°'));assert.equal(s.rows[0].color,s.rows[2].color);const colors=new Map(s.rows.map(row=>[row.key,row.color]));result.structure.segments.reverse();for(const row of metalProductionSummary(result).rows)assert.equal(row.color,colors.get(row.key));assert.equal(s.rows[0].color,productionColor(m.stockKey));
});
test('ACM groups only equal developments and keeps actual nesting sheet utilization',()=>{
 const {project,result,nesting}=fixture();const s=acmProductionSummary(project,result,nesting);assert.equal(s.rows.reduce((sum,r)=>sum+r.quantity,0),result.pieces.length);assert.equal(s.consumptionRows.length,nesting.sheets.length);for(let i=0;i<nesting.sheets.length;i++){assert.equal(Number(s.consumptionRows[i].cells[3]),nesting.sheets[i].placements.length);assert.match(s.consumptionRows[i].cells[5],/%$/)}
 const p=result.pieces[0];const separate=acmProductionSummary(project,{...result,pieces:[p,{...p,id:'different',blank:{...p.blank,grooves:[...(p.blank.grooves??[]),{x1:1,y1:1,x2:2,y2:2}]}}]},nesting);assert.equal(separate.rows.length,2);
});
test('production HTML uses shared summary and existing revision, escaping and calibration gates',()=>{
 const {project,result,nesting}=fixture();project.name='<img src=x onerror=bad>';const metal=projectReportHTML(project,result,null,{discipline:'producao-metalon'});assert.match(metal,/Plano de Corte · Metalon/);assert.match(metal,/Medida \(cm\)/);assert.match(metal,/RASCUNHO/);assert.match(metal,/&lt;img/);assert.doesNotMatch(metal,/<img src=x/);assert.equal((metal.match(/<section data-discipline=/g)||[]).length,1);
 const acm=projectReportHTML(project,result,nesting,{discipline:'producao-acm'});assert.match(acm,/Aproveitamento/);assert.match(acm,/Acabada \/ desenvolvida \(cm\)/);assert.throws(()=>projectReportHTML(project,result,null,{discipline:'producao-acm'}),/Calcule/);result.pieces[0].revision++;assert.throws(()=>projectReportHTML(project,result,nesting,{discipline:'producao-acm'}),/revisão/);
});
test('wall and finish identities are visibly distinct in compact screen data and printable HTML',()=>{
 const {project,result}=fixture(),m=result.structure.segments[0];const a={...m,id:'stock-a',wall:1.2,finish:'Natural',profileSpec:{...m.profileSpec,wall:1.2,finish:'Natural'}},b={...m,id:'stock-b',wall:1.5,finish:'Galvanizado',profileSpec:{...m.profileSpec,wall:1.5,finish:'Galvanizado'}};a.stockKey=metalStockKey(a.profileSpec);b.stockKey=metalStockKey(b.profileSpec);const r={...result,structure:{...result.structure,segments:[a,b],bars:[]}};
 const summary=metalProductionSummary(r);assert.equal(summary.rows.length,2);assert.match(summary.rows[0].cells[0],/parede 1,2 mm · acabamento Natural/);assert.match(summary.rows[1].cells[0],/parede 1,5 mm · acabamento Galvanizado/);assert.match(summary.consumptionRows[1].cells[0],/parede 1,5 mm/);const html=projectReportHTML(project,r,null,{discipline:'producao-metalon'});assert.match(html,/parede 1,2 mm · acabamento Natural/);assert.match(html,/parede 1,5 mm · acabamento Galvanizado/);
});
test('ACM distinguishes defined drill diameters from pending positions in shared screen and HTML output',()=>{
 const {project,result,nesting}=fixture(),piece=result.pieces[0];piece.blank.holes=[{x:40,y:40,diameter:5},{x:50,y:40,drillDiameter:6},{x:60,y:40},{x:70,y:40,radius:2.5}];
 const data=acmProductionSummary(project,result,nesting),cell=data.rows.find(row=>row.ids.includes(piece.id)).cells[7];assert.match(cell,/3 furos com Ø definido/);assert.match(cell,/2 × Ø 5 mm/);assert.match(cell,/1 × Ø 6 mm/);assert.match(cell,/1 posição com Ø a definir/);const html=projectReportHTML(project,result,nesting,{discipline:'producao-acm'});assert.match(html,/3 furos com Ø definido/);assert.match(html,/1 posição com Ø a definir/);
});
