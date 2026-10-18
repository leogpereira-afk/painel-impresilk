import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileFabricationEdit } from './fabrication-edit.mjs';
const project = () => ({ revision: 2, text: { value: 'B', heightMm: 200 }, artwork: { mode: 'vector', fileName: 'demo.svg', contours: [{ id: 'shape-1', outer: [[0, 0], [50, 0], [0, 50]] }] }, construction: { family: 'galvanized-acrylic', depthMm: 75 }, materials: { side: { thickness: 0.6 } }, fabrication: { seamsByStrip: { 'shape-1': [25] }, startOffsetsByStrip: { 'shape-1': 10 }, joinConfirmed: true, compensationConfirmed: true } });
test('replacement imported contour with same ordinal cannot reuse seam map', () => {
  const old = project(), next = structuredClone(old); next.artwork.contours[0].outer[1][0] = 90;
  const updated = reconcileFabricationEdit(old, next);
  assert.deepEqual(updated.fabrication.seamsByStrip, {}); assert.deepEqual(updated.fabrication.startOffsetsByStrip, {});
  assert.equal(updated.fabrication.joinConfirmed, false); assert.ok(updated.fabrication.resetReason);
  assert.deepEqual(old.fabrication.seamsByStrip['shape-1'], [25]);
});
test('scale and font text changes reset distances; depth only resets technical confirmation', () => {
  const old = project(), scaled = structuredClone(old); scaled.text.heightMm = 400;
  assert.deepEqual(reconcileFabricationEdit(old, scaled).fabrication.seamsByStrip, {});
  const deep = structuredClone(old); deep.construction.depthMm = 100;
  const edited = reconcileFabricationEdit(old, deep);
  assert.deepEqual(edited.fabrication.seamsByStrip, old.fabrication.seamsByStrip);
  assert.equal(edited.fabrication.compensationConfirmed, false);
});
test('revision, stock, paint and appearance edits preserve contour references', () => {
  const old = project(), next = { ...old, revision: 3, stock: { width: 2000 }, appearance: { front: '#FFFF00' } };
  assert.equal(reconcileFabricationEdit(old, next), next);
});
