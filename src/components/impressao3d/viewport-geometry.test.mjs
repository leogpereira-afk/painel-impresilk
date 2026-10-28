import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFrame } from '../../lib/fabrication/scene-geometry.mjs';
import { inspectPreviewParts, previewOffset, visiblePreviewBounds } from './viewport-geometry.mjs';

const part = (id, role, min, max) => ({ id, role, mesh: { positions: [min[0], min[1], min[2], max[0], min[1], max[2], max[0], max[1], max[2]], indices: [0, 1, 2] } });

test('bounds reflect actual millimeter coordinates, including offsets and typed arrays', () => {
  const body = part('body', 'body', [-12, 25, 0], [198, 145, 40]);
  body.mesh.positions = new Float32Array(body.mesh.positions);
  const front = part('front', 'front', [-9, 28, 37], [195, 142, 40]);
  assert.deepEqual(inspectPreviewParts([body, front]), { min: [-12, 25, 0], max: [198, 145, 40], dimensions: [210, 120, 40] });
  assert.equal(inspectPreviewParts([]), null);
});

test('invalid triangles and nonfinite coordinates reject the whole preview', () => {
  assert.throws(() => inspectPreviewParts([{ id: 'empty' }]), /malha/);
  const broken = part('broken', 'body', [0, 0, 0], [1, 1, 1]);
  broken.mesh.indices[0] = 3;
  assert.throws(() => inspectPreviewParts([broken]), /triângulo/);
  broken.mesh.indices[0] = 0;
  broken.mesh.positions[0] = Infinity;
  assert.throws(() => inspectPreviewParts([broken]), /coordenada/);
});

test('separation changes only presentation bounds and leaves export coordinates untouched', () => {
  const parts = [part('body', 'body', [10, 20, 0], [110, 140, 40]), part('front', 'front', [13, 23, 37], [107, 137, 40])];
  const original = structuredClone(parts);
  assert.deepEqual(visiblePreviewBounds(parts, {}, true, 40), { min: [10, 20, 0], max: [110, 140, 72] });
  assert.deepEqual(visiblePreviewBounds(parts, { body: true }, false, 40), { min: [13, 23, 37], max: [107, 137, 40] });
  assert.equal(visiblePreviewBounds(parts, { body: true, front: true }), null);
  assert.equal(previewOffset('body', true), 0);
  assert.equal(previewOffset('front', false), 0);
  assert.deepEqual(parts, original);
});

test('frontal and perspective cameras contain an exploded wide word at mobile and desktop sizes', () => {
  const min = [-10, 5, 0]; const max = [750, 125, 72];
  const dot = (a, b) => a.reduce((total, value, axis) => total + value * b[axis], 0);
  for (const aspect of [0.55, 1, 2.3]) for (const direction of [[0, 0, 1], [0.55, -0.5, 1.5]]) {
    const frame = cameraFrame(min, max, direction, aspect, 35, 1.2);
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const point = [x, y, z].map((value, axis) => value - frame.center[axis]);
      const depth = frame.distance - dot(point, frame.forward);
      assert.ok(Math.abs(dot(point, frame.right) / (depth * Math.tan(35 * Math.PI / 360) * aspect)) < 1);
      assert.ok(Math.abs(dot(point, frame.up) / (depth * Math.tan(35 * Math.PI / 360))) < 1);
    }
  }
});
