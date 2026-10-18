import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFrame, contourWallVertices, componentPresentation, disposeSceneGroup } from './scene-geometry.mjs';
test('walls preserve outer and counter and nominal depth', () => {
  const contours = [{ outer: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[20, 20], [40, 20], [40, 40], [20, 40]]] }];
  const before = JSON.stringify(contours); const vertices = contourWallVertices(contours, 70);
  assert.equal(vertices.length, 8 * 6 * 3); assert.equal(Math.max(...vertices.filter((_, i) => i % 3 === 2)), 0.07); assert.equal(JSON.stringify(contours), before);
});
test('explosion separates presentation without editing manufacturing', () => {
  const c = Object.freeze({ x: 40, y: 60, z: 80, role: 'front' });
  assert.deepEqual(componentPresentation(c), [0.04, 0.06, 0.08]); assert.deepEqual(componentPresentation(c, true), [0.04, 0.06, 0.2]); assert.equal(c.z, 80);
});
test('portrait top view frames full envelope with finite camera', () => {
  const frame = cameraFrame([0, 0, 0], [10, 1, 2], [0, 1, 0.001], 0.4);
  assert.ok(frame.distance > 30); assert.ok(frame.forward.every(Number.isFinite));
});
test('shared resource cleanup disposes deduplicated resources', () => {
  let count = 0; const texture = { isTexture: true, dispose() { count++; } }; const material = { map: texture, dispose() { count++; } }; const geometry = { dispose() { count++; } }; let cleared = false;
  disposeSceneGroup({ traverse(cb) { cb({ geometry, material }); cb({ geometry, material }); }, clear() { cleared = true; } });
  assert.equal(count, 3); assert.equal(cleared, true);
});

test('layer appearance uses front and component override without changing material', async () => {
  const { componentAppearance } = await import('./scene-geometry.mjs');
  const component = Object.freeze({ id: 'l1', role: 'layer-1', material: 'mdf' });
  assert.deepEqual(componentAppearance({ front: '#ffffff', finish: 'satin' }, component), { color: '#ffffff', finish: 'satin' });
  assert.deepEqual(componentAppearance({ front: '#ffffff', overrides: { l1: { color: '#171717', finish: 'glossy' } } }, component), { color: '#171717', finish: 'glossy' });
  assert.equal(component.material, 'mdf');
});
