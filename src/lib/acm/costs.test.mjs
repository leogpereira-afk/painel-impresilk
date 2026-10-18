import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.mjs';
import { buildProject } from './engine.mjs';
import { nestPieces } from './nesting.mjs';
import { estimateCosts, parseBrief, sheetReference, sheetUnitPrice, updateSheetQuote, quotationWidths } from './costs.mjs';
import { materialKey } from './nesting.mjs';
const changes = text => Object.fromEntries(parseBrief(text).changes.map(change => [change.path, change.value]));
test('costs distinguish reused remnants and count purchased full metal bars', () => {
  const p = createProject(); p.costs = { sheet: 1000, metalPerM: 10, tapePerM: 2, screw: 1, work: 500 };
  const result = { valid: true, pieces: [{ id: 'P1' }], structure: { bars: [{ length: 6000 }, { length: 6000 }], unplaced: [] }, totals: { metalLength: 10500, tapeLength: 2000, screws: 0 } };
  p.costs.sheetReference = sheetReference(p);
  const nesting = { sheets: [{ source: 'sheet', ...sheetReference(p) }, { source: 'remnant' }], unplaced: [] };
  const costs = estimateCosts(p, result, nesting);
  assert.equal(costs.items.find(item => item.name === 'Chapas novas').quantity, 1);
  assert.equal(costs.items.find(item => item.name.startsWith('Metalon')).quantity, 12);
  assert.equal(costs.items.find(item => item.name.startsWith('Retalhos')).total, null); assert.equal(costs.complete, false);
});
test('invalid geometry or missing placement cannot produce complete costs', () => {
  const p = createProject(); p.costs = { sheet: 0, metalPerM: 0, tapePerM: 0, screw: 0, work: 0 }; p.costs.sheetReference = sheetReference(p); const r = buildProject(p), n = nestPieces(r.pieces, p.stock, p.fabrication);
  assert.equal(estimateCosts(p, r, n).complete, true); assert.equal(estimateCosts(p, { ...r, valid: false }, n).complete, false);
  assert.equal(estimateCosts(p, r, { ...n, unplaced: [{ pieceId: 'x' }] }).complete, false);
});
test('local parser fills explicit sample in Portuguese without inventing dimensions', () => {
  const c = changes('Monte uma fachada com oito metros de frente, duas laterais de sessenta centímetros, ACM preto fosco e abas de trinta milímetros.');
  assert.equal(c['front.width'], 8000); assert.equal(c['left.depth'], 600); assert.equal(c['right.depth'], 600); assert.equal(c['material.colorId'], 'preto'); assert.equal(c['material.finish'], 'matte'); assert.equal(c['edges.left'], 30); assert.equal(c['front.height'], undefined);
});
test('parser respects side names, asymmetry and singular requests', () => {
  let c = changes('Lateral esquerda de 60 cm'); assert.equal(c['left.depth'], 600); assert.equal(c['right.enabled'], undefined);
  c = changes('Lateral esquerda de 60 cm e lateral direita de 80 cm'); assert.equal(c['left.depth'], 600); assert.equal(c['right.depth'], 800);
});
test('negated colors and fixing types never become proposed changes', () => {
  const c = changes('Não usar preto nem parafusos; quero ACM branco e fita.'); assert.equal(c['material.colorId'], 'branco'); assert.equal(c['fixing.type'], 'tape');
  const n = changes('Não quero ACM preto nem parafusos.'); assert.equal(n['material.colorId'], undefined); assert.equal(n['fixing.type'], undefined);
});
test('metric numbers handle comma decimals and Portuguese thousands, reject negatives', () => {
  const c = changes('Frente 8.000 mm e altura 1,2 m'); assert.equal(c['front.width'], 8000); assert.equal(c['front.height'], 1200);
  assert.equal(changes('Frente -8 m')['front.width'], undefined); assert.equal(changes('-8 metros de frente')['front.width'], undefined);
  assert.equal(changes('Laterais sessenta e cinco centímetros')['left.depth'], 650);
});
test('conflicting measurements are withheld and lateral height is not assigned to front', () => {
  const result = parseBrief('Frente 8 m ou 9 m de frente'); assert.equal(result.changes.some(c => c.path === 'front.width'), false); assert.ok(result.notes.some(n => /conflit|alternativ/i.test(n)));
  assert.equal(changes('Lateral esquerda profundidade 60 cm e altura 90 cm')['front.height'], undefined);
});

test('sheet prices never migrate to another SKU, lot, width or unbound import', () => {
  const p = createProject(); p.costs.sheet = 700;
  assert.equal(sheetUnitPrice(p, sheetReference(p)), null);
  assert.equal(sheetUnitPrice(p, {}), null); assert.equal(sheetUnitPrice(p, undefined), null);
  p.costs.sheetReference = sheetReference(p);
  assert.equal(sheetUnitPrice(p, sheetReference(p)), 700);
  assert.equal(sheetUnitPrice(p, { ...sheetReference(p), width: 1220 }), null);
  assert.equal(sheetUnitPrice(p, { ...sheetReference(p), materialKey: materialKey({ ...p.material, sku: 'other' }) }), null);
  assert.equal(sheetUnitPrice(p, { ...sheetReference(p), materialKey: materialKey({ ...p.material, lot: 'other' }) }), null);
  p.costs.sheetQuotes = [{ ...sheetReference(p), width: 1220, price: 550 }];
  assert.equal(sheetUnitPrice(p, { ...sheetReference(p), width: 1220 }), 550);
  p.stock.width = 1220; assert.equal(sheetUnitPrice(p, sheetReference(p)), 550);
  p.material.sku = 'other'; assert.equal(sheetUnitPrice(p, sheetReference(p)), null);
});
test('mixed material costs keep missing SKU quote unknown', () => {
  const p = createProject(); p.costs = { sheet: 700, sheetReference: sheetReference(p), metalPerM: 0, tapePerM: 0, screw: 0, work: 0 };
  p.overrides['front-1-1'] = { material: { sku: 'OTHER' } };
  const r = buildProject(p), n = nestPieces(r.pieces, p.stock, p.fabrication), c = estimateCosts(p, r, n);
  assert.equal(c.complete, false); assert.equal(c.items.filter(item => item.name.startsWith('Chapas novas')).length, 2);
  p.costs.sheetQuotes = [{ materialKey: materialKey(r.pieces[0].material), width: p.stock.width, length: p.stock.length, price: 900 }];
  assert.equal(estimateCosts(p, r, n).complete, true);
});

test('editing and clearing a former main quote never revives a stale price', () => {
  const p = createProject(); p.costs.sheet = 700; p.costs.sheetReference = sheetReference(p);
  const originalReference = { ...p.costs.sheetReference }; p.stock.width = 1250;
  p.costs = updateSheetQuote(p.costs, originalReference, null);
  assert.equal(sheetUnitPrice(p, originalReference), null); assert.equal(p.costs.sheet, null);
  p.costs = updateSheetQuote(p.costs, originalReference, 650);
  assert.equal(sheetUnitPrice(p, originalReference), 650);
  p.costs = updateSheetQuote(p.costs, sheetReference(p), 550);
  assert.equal(sheetUnitPrice(p, sheetReference(p)), 550); assert.equal(sheetUnitPrice(p, originalReference), 650);
  p.costs = updateSheetQuote(p.costs, sheetReference(p), null); assert.equal(sheetUnitPrice(p, sheetReference(p)), null);
});
test('every material can be quoted in the current custom width and all three comparison widths', () => {
  const p = createProject(); assert.deepEqual(quotationWidths(p), [1500, 1220, 1250]);
  p.stock.width = 1400; assert.deepEqual(quotationWidths(p), [1400, 1220, 1250, 1500]);
});

test('independent frame prices stay bound to stock and remnant source', () => {
  const p=createProject();p.structure.frame={enabled:true};p.costs.metalPerM=999;
  const r={valid:true,pieces:[{id:'P'}],structure:{bars:[
    {stockKey:'a',profile:'20x20',source:'commercial',length:6000,pricePerM:10},
    {stockKey:'b',profile:'50x30',source:'commercial',length:6000,pricePerM:20},
    {stockKey:'a',profile:'20x20',source:'remnant',length:1000,pricePerM:null}],unplaced:[]},totals:{screws:0,tapeLength:0}};
  const rows=estimateCosts(p,r,{sheets:[],unplaced:[]}).items.filter(i=>i.name.startsWith('Metalon'));
  assert.deepEqual(rows.map(i=>i.total),[60,120,null]);
  assert.match(rows[2].name,/reaproveitado/);
});
test('fixing costs count per-piece products and whole tape rolls with waste', () => {
  const p=createProject();p.fixing.screwProduct={code:'A',unitPrice:2};p.fixing.tapeProduct={code:'T',rollLength:5000,wastePercent:10,rollPrice:30};
  const pieces=[{id:'P1',fixing:p.fixing,fixings:{screws:[{},{}],tape:[{x1:0,y1:0,x2:4900,y2:0}]}},
    {id:'P2',fixing:{screwProduct:{code:'B',unitPrice:5}},fixings:{screws:[{}],tape:[]}}];
  const r={valid:true,pieces,structure:{bars:[],unplaced:[]},totals:{screws:3,tapeLength:4900}};
  const rows=estimateCosts(p,r,{sheets:[],unplaced:[]}).items;
  assert.equal(rows.find(i=>i.name.includes('· A')).total,4);
  assert.equal(rows.find(i=>i.name.includes('· B')).total,5);
  const tape=rows.find(i=>i.name.includes('· T'));assert.equal(tape.quantity,2);assert.equal(tape.unit,'rolo');assert.equal(tape.total,60);
});
test('product without a quote never inherits the legacy general fixing price', () => {
  const p=createProject();p.costs.screw=10;p.fixing.screwProduct={code:'A'};
  const r={valid:true,pieces:[{id:'P',fixing:p.fixing,fixings:{screws:[{}]}}],structure:{bars:[]},totals:{screws:1,tapeLength:0}};
  assert.equal(estimateCosts(p,r,{sheets:[]}).items.find(i=>i.name.startsWith('Parafusos')).total,null);
});
