import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from './model.mjs';
import {workspaceSummaries} from './workspace-summary.mjs';
test('closed block summaries read actual dimensions, choices, stock and pending cost',()=>{
 const p=createProject();p.front={width:2400,height:1250};p.material={name:'Cinza fictício',thickness:4};p.stock={width:1250,length:5000};p.cladding={panelForm:'tray',joint:'dry',exposure:'outdoor',fixingConfirmed:true};p.layout.joint=8;
 const before=structuredClone(p);const summary=workspaceSummaries(p,{pieces:[{},{}]},{nesting:{sheets:[{},{}],unplaced:[{}]},costSummary:{known:120,complete:false},pending:3});
 assert.match(summary.measures,/2\.400 × 1\.250 mm · 2 peças · Bandeja dobrada/);
 assert.match(summary.materials,/Cinza fictício · 4 mm · chapa 1\.250 × 5\.000/);
 assert.match(summary.modulation,/junta 8 mm · 2 chapas/);assert.match(summary.costs,/120 informados · Custos pendentes/);assert.match(summary.review,/4 pendências/);assert.match(summary.finish,/Escolhas registradas/);assert.deepEqual(p,before);
});
test('incomplete data is summarized without invented dimensions or complete cost',()=>{
 const summary=workspaceSummaries({front:{},layout:{},material:{},stock:{}},{pieces:[]});
 assert.match(summary.materials,/Cor a definir · — mm · chapa — × — mm/);assert.match(summary.finish,/Escolhas pendentes/);assert.match(summary.costs,/Aguardando/);
});
