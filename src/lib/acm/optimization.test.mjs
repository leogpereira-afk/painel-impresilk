import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject } from './model.mjs';
import { buildProject } from './engine.mjs';
import { nestPieces, validateNesting } from './nesting.mjs';
import { sheetReference } from './costs.mjs';
import { compareAlternatives, layoutMetrics, rankAlternatives, applyOptimizationAlternative, optimizeProject } from './optimization.mjs';

function fullCosts(project) {
  project.costs = { sheet: 800, sheetReference: sheetReference(project), sheetQuotes: [1220, 1250].map(width => ({ ...sheetReference(project), width, price: width === 1220 ? 600 : 700 })), metalPerM: 1, tapePerM: 1, screw: 1, work: 100, remnant: 0 };
}
test('all nine comparison rows are deterministic, preserve project and carry explicit complete format costs', () => {
  const p = createProject(); fullCosts(p); const original = JSON.stringify(p);
  const alternatives = compareAlternatives(p);
  assert.equal(alternatives.length, 9); assert.equal(new Set(alternatives.map(a => `${a.orientation}-${a.width}`)).size, 9);
  assert.equal(alternatives.filter(a => a.feasible).length, 9);
  assert.ok(alternatives.every(a => a.cost.complete && a.cost.total > 0));
  assert.deepEqual(compareAlternatives(p), alternatives); assert.equal(JSON.stringify(p), original);
  assert.ok(new Set(alternatives.map(a => `${a.pieces}/${a.seamLength}/${a.grossArea}`)).size >= 3);
});
test('each explicit priority selects its distinct winner using published measurable criteria', () => {
  const base = { feasible: true, sheets: 2, newSheets: 2, grossArea: 200, seamLength: 200, seamCount: 2, cost: { complete: true, total: 200 }, visual: { narrowStrips: 1, misalignedJoints: 1, moduleVariation: 1 } };
  const candidates = [
    { ...base, id: 'sheets', sheets: 1 },
    { ...base, id: 'seams', seamLength: 100 },
    { ...base, id: 'cost', cost: { complete: true, total: 100 } },
    { ...base, id: 'visual', visual: { narrowStrips: 0, misalignedJoints: 0, moduleVariation: 0 } },
  ];
  for (const priority of ['sheets', 'seams', 'cost', 'visual']) assert.equal(rankAlternatives(candidates, priority)[0].id, priority);
});
test('cost priority does not crown a partial quote or silently discard unknown options', () => {
  const p = createProject(); fullCosts(p); p.layout.optimizationPriority = 'cost'; p.costs.sheetQuotes = [];
  const alternatives = compareAlternatives(p); assert.equal(alternatives.length, 9);
  assert.ok(alternatives.some(a => a.cost.complete)); assert.ok(alternatives.some(a => !a.cost.complete));
  assert.ok(alternatives.every(a => a.rank === null && a.rankingAvailable === false));
  fullCosts(p); const complete = compareAlternatives(p); assert.equal(complete[0].rank, 1);
  assert.equal(complete[0].cost.total, Math.min(...complete.map(a => a.cost.total)));
});
test('seams measure internal shared lengths and visual criterion exposes side mismatch', () => {
  const p = createProject(); p.front = { width: 2010, height: 1000 };
  let r = { pieces: [{ surface: 'front', x: 0, y: 0, width: 1000, height: 1000 }, { surface: 'front', x: 1010, y: 0, width: 1000, height: 1000 }] };
  assert.deepEqual(layoutMetrics(r, p), { seamLength: 1000, seamCount: 1, visual: { narrowStrips: 0, misalignedJoints: 0, moduleVariation: 0 } });
  p.left.enabled = true; p.left.height = 1000;
  r = { pieces: [...r.pieces, { surface: 'left', x: 0, y: 0, width: 500, height: 495 }, { surface: 'left', x: 0, y: 505, width: 500, height: 495 }] };
  assert.equal(layoutMetrics(r, p).seamLength, 1500); assert.equal(layoutMetrics(r, p).visual.misalignedJoints, 1);
});
test('other format is purchase scenario and never inherits stock count; applying is atomic and preserves quoted price identity', () => {
  const p = createProject(); fullCosts(p); p.stock.quantity = 0;
  const alternatives = compareAlternatives(p);
  assert.ok(alternatives.filter(a => a.width === 1500).every(a => !a.feasible && !a.purchaseScenario));
  const candidate = alternatives.find(a => a.width === 1250 && a.feasible);
  assert.ok(candidate.purchaseScenario); const ref = structuredClone(p.costs.sheetReference);
  applyOptimizationAlternative(p, candidate);
  assert.equal(p.stock.width, 1250); assert.equal(p.stock.quantity, null); assert.deepEqual(p.costs.sheetReference, ref);
  assert.throws(() => applyOptimizationAlternative(p, { ...candidate, feasible: false }));
});
test('commercial exclusions and invalid locks remain visible as rows with reasons', () => {
  const p = createProject(); p.material.formats = [{ width: 1500, length: 5000 }];
  const alternatives = compareAlternatives(p);
  assert.equal(alternatives.length, 9); assert.ok(alternatives.filter(a => a.width !== 1500).every(a => !a.feasible && a.commercial === 'unlisted' && a.reasons.length));
  p.overrides['front-1-1'] = { locked: true, geometrySignature: 'obsolete' };
  assert.ok(compareAlternatives(p).every(a => !a.feasible && a.reasons.length));
});
test('saw mode fails closed instead of claiming a guillotine production sequence', () => {
  const p = createProject(); p.fabrication.cutMode = 'saw'; assert.deepEqual(validateProject(p), []);
  const r = buildProject(p), n = nestPieces(r.pieces, p.stock, p.fabrication);
  assert.equal(n.sheets.length, 0); assert.equal(n.unplaced.length, r.pieces.length); assert.equal(n.errors[0].code, 'SAW_UNSUPPORTED');
  assert.ok(compareAlternatives(p).every(a => !a.feasible));
  p.fabrication.cutMode = 'router'; const output = optimizeProject(p, { compare: true });
  assert.deepEqual(validateNesting(output.nesting, r.pieces, p.stock, p.fabrication), []); assert.equal(output.alternatives.length, 9);
  assert.ok(validateNesting(output.nesting, r.pieces, p.stock, { ...p.fabrication, cutMode: 'saw' }).some(error => /serra/.test(error)));
});
test('shared importer validates new process, priority, material metadata and quote limits', () => {
  for (const mutate of [p => { p.fabrication.cutMode = 'laser'; }, p => { p.layout.optimizationPriority = 'cheapest'; }, p => { p.material.formats = [{ width: -1, length: 5000 }]; }, p => { p.material.formats = [null]; }, p => { p.material.formats = [{ width: 1500, length: 5000 }, { width: 1500, length: 5000 }]; }, p => { p.material.application = 100; }, p => { p.material.updatedAt = '2026-02-30'; }, p => { p.costs.sheetReference = { width: 1500 }; }, p => { p.costs.sheetQuotes = [{ ...sheetReference(p), price: -1 }]; }, p => { p.costs.sheetQuotes = [{ ...sheetReference(p), price: 2 }, { ...sheetReference(p), price: 3 }]; }]) {
    const p = createProject(); mutate(p); assert.ok(validateProject(p).length);
  }
  const p = createProject(); p.material.formats = [{ width: 1220, length: 5000 }]; p.material.application = 'Fachada'; p.material.updatedAt = '2026-10-17'; fullCosts(p); assert.deepEqual(validateProject(p), []);
});
