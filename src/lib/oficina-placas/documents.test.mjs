import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelsProject,createPanelObject} from './model.mjs';
import {calculatePanelsPlan,exportPanelsDrawing,editPanelsPlan} from './workflow.mjs';
import {panelsCutReport} from './documents.mjs';
for(const material of ['mdf','acrylic'])test(`${material}: branded report preserves cut geometry and rejects stale or incomplete plans`,()=>{
 const p=createPanelsProject();p.materials[material].objects=[createPanelObject('plate',material)];p.name='<script>unsafe</script>';
 const plan=calculatePanelsPlan(p,material),logo='data:image/png;base64,YQ==';
 const before=exportPanelsDrawing(p,material,'dxf',plan),html=panelsCutReport(p,material,plan,logo);
 assert.ok(html.includes(logo));assert.ok(html.includes('&lt;script&gt;unsafe'));assert.ok(!html.includes('<script>unsafe'));
 assert.ok(html.includes(`Chapa 1 de ${plan.sheets.length}`));assert.ok(html.includes('@media print'));
 assert.equal(exportPanelsDrawing(p,material,'dxf',plan),before);
 const changed=structuredClone(p);changed.stock[material].width+=100;
 assert.throws(()=>panelsCutReport(changed,material,plan,logo),/desatualizado/);
 const removed=editPanelsPlan(p,material,plan,'remove',plan.sheets[0].placements[0].pieceId);
 assert.throws(()=>panelsCutReport(p,material,removed.plan,logo),/sem alocação/);
 assert.throws(()=>panelsCutReport(p,material,plan,'javascript:alert(1)'),/Logo/);
});
test('report numbers match placement order per sheet and multi-sheet viewport uses correct offsets',()=>{
 const p=createPanelsProject(),obj=createPanelObject('plate','mdf');obj.config.width=120;obj.config.height=80;obj.quantity=3;p.materials.mdf.objects=[obj];p.stock.mdf.width=140;p.stock.mdf.height=100;p.stock.mdf.quantity=4;
 const plan=calculatePanelsPlan(p,'mdf');assert.equal(plan.sheets.length,3);
 const html=panelsCutReport(p,'mdf',plan,'data:image/png;base64,YQ==');
 assert.equal((html.match(/data-plan-number="1"/g)||[]).length,3);
 assert.equal((html.match(/<tr><td>1<\/td>/g)||[]).length,3);
 assert.equal((html.match(/<th>Nº<\/th>/g)||[]).length,3);
 assert.ok(html.includes('Chapa 3 de 3'));assert.ok(html.includes('sem escala física'));
 assert.ok(!html.includes('data-plan-number="2"'));
});
