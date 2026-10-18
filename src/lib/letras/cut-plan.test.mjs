import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLetterProject, setLetterFamily } from './model.mjs';
import { calculateLetters } from './engine.mjs';
import { calculateFabrication, createFabricationConfig } from './fabrication.mjs';
import { importVectorArtwork } from './importers.mjs';
import { nestLetters } from './nesting.mjs';
import { buildLetterCutPlan, letterCutSheetSVG, cutPointOnSheet } from './cut-plan.mjs';

const sample = readFileSync(new URL('../../../public/examples/letras-fabricacao-v5.svg', import.meta.url), 'utf8');
function project(overrides = {}) {
  const { errors, ...artwork } = importVectorArtwork(sample, { fileName: 'letras-fabricacao-v5.svg' });
  assert.deepEqual(errors, []);
  return { ...setLetterFamily(createLetterProject({ id: 'fabricacao-importada-ficticia', name: 'Corte fictício', artwork }), 'galvanized-acrylic'), fabrication: createFabricationConfig({ overlapMm: 8, compensationMm: 0, maxStripLengthMm: 260 }), stock: { width: 500, length: 600, trim: 10, kerf: 3, rotation: true, remnants: [] }, ...overrides };
}
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const ringArea = ring => Math.abs(ring.reduce((sum, point, index) => { const next = ring[(index + 1) % ring.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0)) / 2;
const shapeArea = contours => contours.reduce((sum, contour) => sum + ringArea(contour.outer) - contour.holes.reduce((n, hole) => n + ringArea(hole), 0), 0);

test('SVG importado com vazado e ilha gera peças, bordas segmentadas e corte com identidade conservada', () => {
  const p = project(), r = calculateLetters(p), f = calculateFabrication(p, r), n = nestLetters(p, r, f), plan = buildLetterCutPlan(p, r, { nesting: n });
  assert.deepEqual(r.errors, []); assert.deepEqual(f.errors, []); assert.deepEqual(plan.errors, []);
  assert.equal(r.letters.length, 3); assert.equal(f.strips.length, 4); assert.ok(f.totals.segmentCount > 4);
  assert.equal(plan.totals.unplaced, 0); assert.equal(plan.totals.placed, r.components.filter(piece => piece.role !== 'side').length + f.totals.segmentCount);
  assert.equal(plan.source.widthMm, 340); assert.equal(plan.source.heightMm, 200);
  const ids = new Set(plan.sheets.flatMap(sheet => sheet.parts.map(part => part.id)));
  for (const strip of f.strips) for (const segment of strip.segments) {
    assert.ok(ids.has(segment.id)); const part = plan.pieces.find(piece => piece.id === segment.id);
    assert.equal(part.width, segment.grossLengthMm); assert.equal(part.height, segment.widthMm);
  }
  assert.ok(plan.sheets.flatMap(sheet => sheet.parts).some(part => part.sheetContours.some(contour => contour.holes.length)));
  assert.equal(new Set(plan.groups.map(group => group.operation)).size, 3);
});
test('contornos reais orientados conservam área, vazados e limites de cada envelope', () => {
  const p = project(), plan = buildLetterCutPlan(p, calculateLetters(p));
  for (const sheet of plan.sheets) for (const part of sheet.parts) {
    near(shapeArea(part.sheetContours), part.areaMm2);
    for (const contour of part.sheetContours) for (const point of [contour.outer, ...contour.holes].flat()) {
      assert.ok(point[0] >= part.placement.x - 1e-7 && point[0] <= part.placement.x + part.placement.width + 1e-7);
      assert.ok(point[1] >= part.placement.y - 1e-7 && point[1] <= part.placement.y + part.placement.height + 1e-7);
    }
  }
  near(plan.totals.grossAreaMm2, plan.totals.physicalAreaMm2 + plan.totals.gapsAndHolesMm2 + plan.totals.outsideEnvelopesMm2);
  assert.ok(plan.totals.physicalAreaMm2 < plan.totals.envelopeAreaMm2);
});
test('giro de 90 graus troca dimensões sem espelhar ou mudar medidas', () => {
  const part = { width: 80, height: 30 }, placement = { x: 7, y: 11, width: 30, height: 80, rotated: true };
  assert.deepEqual(cutPointOnSheet([0, 0], part, placement), [37, 91]);
  assert.deepEqual(cutPointOnSheet([80, 0], part, placement), [37, 11]);
  assert.deepEqual(cutPointOnSheet([80, 30], part, placement), [7, 11]);
  assert.deepEqual(cutPointOnSheet([0, 30], part, placement), [7, 91]);
  const p = project(); p.stock = { ...p.stock, width: 220, length: 500 }; p.fabrication.maxStripLengthMm = 300;
  const plan = buildLetterCutPlan(p, calculateLetters(p)); assert.deepEqual(plan.errors, []);
  assert.ok(plan.sheets.some(sheet => sheet.parts.some(part => part.placement.rotated)));
});
test('quantidade insuficiente declara peças não alocadas sem perdê-las', () => {
  const p = project(); p.stock.quantity = 1; const plan = buildLetterCutPlan(p, calculateLetters(p));
  assert.deepEqual(plan.errors, []); assert.equal(plan.sheets.length, 1); assert.ok(plan.unplaced.length > 0);
  const ids = [...plan.sheets.flatMap(sheet => sheet.parts.map(part => part.id)), ...plan.unplaced.map(item => item.pieceId)];
  assert.equal(ids.length, plan.pieces.length); assert.equal(new Set(ids).size, ids.length);
  assert.match(plan.pending.join(' '), /não contém todo o conjunto/);
});
test('nominal e desenvolvido diferem e referências da emenda/aba não são cortes', () => {
  const p = project(); p.fabrication.flangeMode = 'manual'; p.fabrication.joinFlangeMm = 5;
  const r = calculateLetters(p), full = buildLetterCutPlan(p, r), strip = full.sheets.flatMap(sheet => sheet.parts).find(part => part.kind === 'strip');
  assert.equal(strip.dimensionStatus, 'developed'); assert.equal(strip.height, p.construction.depthMm + 5);
  assert.deepEqual(strip.references.map(line => line.kind), ['overlap', 'flange']);
  p.fabrication.compensationMm = null; const nominal = buildLetterCutPlan(p, r);
  assert.ok(nominal.sheets.some(sheet => sheet.status === 'nominal'));
  assert.ok(nominal.sheets.flatMap(sheet => sheet.parts).filter(part => part.kind === 'strip').every(part => part.dimensionStatus === 'nominal' && part.references.every(line => line.kind !== 'overlap')));
});
test('exportação por chapa separa caminho de recorte, envelopes, referências e texto', () => {
  const p = project(), r = calculateLetters(p), plan = buildLetterCutPlan(p, r), sheet = plan.sheets.find(item => item.operation === 'laser-fiber');
  const svg = letterCutSheetSVG(p, r, sheet.id);
  assert.match(svg, /width="500mm" height="600mm"/);
  assert.match(svg, /id="CORTE_NOMINAL"/); assert.match(svg, /id="ENVELOPES_NAO_CORTAR"/); assert.match(svg, /id="REFERENCIAS_NAO_CORTAR"/); assert.match(svg, /id="ANOTACOES_NAO_CORTAR"/);
  const cuts = svg.split('<g id="CORTE_NOMINAL"')[1].split('</g>')[0];
  assert.equal((cuts.match(/<path /g) || []).length, sheet.parts.length); assert.equal(cuts.includes('<text'), false); assert.equal(cuts.includes('<rect'), false);
  for (const part of sheet.parts) assert.ok(svg.includes(part.id));
  assert.match(svg, /Não liberado para produção/); assert.match(svg, /&quot;released&quot;:false/);
  assert.throws(() => letterCutSheetSVG(p, r, 'chapa-ausente'), /não encontrada/);
});
test('escala não confirmada e geometria de outra revisão impedem exportação', () => {
  const p = project(), r = calculateLetters(p); p.revision++;
  assert.match(buildLetterCutPlan(p, r).errors.join(' '), /outra revisão/); assert.throws(() => letterCutSheetSVG(p, r, 'CH1'));
  p.artwork.scaleConfirmed = false; const invalid = calculateLetters(p); assert.ok(invalid.errors.length); assert.ok(buildLetterCutPlan(p, invalid).errors.length);
});
test('mudança da fabricação descarta plano em cache anterior mesmo sem mudar geometria', () => {
  const p = project(), r = calculateLetters(p), before = nestLetters(p, r, calculateFabrication(p, r));
  p.fabrication.overlapMm = 19; const plan = buildLetterCutPlan(p, r, { nesting: before });
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.pieces.filter(part => part.kind === 'strip').every(part => part.overlapMm === 19 && Math.abs(part.width - part.nominalLengthMm - 19) < 1e-6));
});
test('plano legado sem desenvolvimento não é reutilizado como faixas finais e cache de fabricação divergente é recusado', () => {
  const p = project(), r = calculateLetters(p), f = calculateFabrication(p, r), nominal = nestLetters(p, r);
  const plan = buildLetterCutPlan(p, r, { nesting: nominal }); assert.deepEqual(plan.errors, []);
  assert.equal(plan.totals.strips, f.totals.segmentCount);
  assert.ok(plan.pieces.filter(part => part.kind === 'strip').every(part => part.id.endsWith(`F${part.index}`)));
  p.fabrication.overlapMm = 11;
  assert.match(nestLetters(p, r, f).error, /outra revisão ou configuração/);
});
test('mudança de escala importada conserva IDs e multiplica perímetros antes do desenvolvimento', () => {
  const p = project(), r = calculateLetters(p), a = buildLetterCutPlan(p, r); p.artwork.widthMm *= 2; p.artwork.heightMm *= 2; p.revision++;
  const r2 = calculateLetters(p), b = buildLetterCutPlan(p, r2); assert.deepEqual(b.errors, []);
  assert.deepEqual(r.letters.map(letter => letter.id), r2.letters.map(letter => letter.id));
  near(r2.totals.stripLengthMm, 2 * r.totals.stripLengthMm); assert.equal(b.source.widthMm, 680);
  assert.ok(b.totals.strips > a.totals.strips);
});
test('SKU, fabricante, acabamento, lote e direção das laterais chegam ao corte', () => {
  const p = project(); Object.assign(p.materials.side, { sku: 'CHAPA-FICTICIA', manufacturer: 'Fabricante fictício', lot: 'Lote-teste', directional: true, finish: 'brushed', color: '#ffffff', colorId: 'demo-branco' });
  const r = calculateLetters(p), plan = buildLetterCutPlan(p, r);
  assert.deepEqual(plan.errors, []); assert.ok(r.strips.every(strip => strip.sku === 'CHAPA-FICTICIA' && strip.directional));
  const sheets = plan.sheets.filter(sheet => sheet.operation === 'laser-fiber');
  for (const sheet of sheets) {
    assert.equal(sheet.material.sku, 'CHAPA-FICTICIA'); assert.equal(sheet.material.manufacturer, 'Fabricante fictício'); assert.equal(sheet.material.lot, 'Lote-teste'); assert.equal(sheet.material.finish, 'brushed'); assert.equal(sheet.material.colorId, 'demo-branco');
    assert.ok(sheet.parts.every(part => !part.placement.rotated));
  }
});
test('lateral polimérica é perfil linear, não chapa de metal', () => {
  const p = setLetterFamily(project(), 'polymeric'), plan = buildLetterCutPlan(p, calculateLetters(p));
  assert.deepEqual(plan.errors, []); assert.ok(plan.linearStock.length); assert.ok(plan.totals.linearLengthMm > 0);
  assert.ok(plan.sheets.every(sheet => sheet.material.core !== 'polymeric')); assert.equal(plan.totals.strips, 0);
});
test('arte DXF segue o mesmo plano e mantém furos no SVG da chapa', () => {
  const input = readFileSync(new URL('../../../public/examples/letras-demo.dxf', import.meta.url), 'utf8');
  const { errors, ...artwork } = importVectorArtwork(input, { fileName: 'arte-ficticia.dxf' }); assert.deepEqual(errors, []);
  const p = project({ artwork }), r = calculateLetters(p), plan = buildLetterCutPlan(p, r); assert.deepEqual(plan.errors, []);
  assert.equal(plan.source.format, 'dxf'); assert.ok(plan.sheets.flatMap(sheet => sheet.parts).some(part => part.sheetContours.some(contour => contour.holes.length)));
  const sheet = plan.sheets.find(sheet => sheet.operation === 'laser-co2'); assert.ok(letterCutSheetSVG(p, r, sheet.id).includes('fill-rule="evenodd"'));
});
