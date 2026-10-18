import test from 'node:test';
import assert from 'node:assert/strict';
import { facePath, markingRings, markingsFor, pieceOpacity, pieceColor, localBounds } from './viewerGeometry.mjs';

test('face drawing subtracts real cutout rings and through holes, leaving blind bores separate', () => {
  const piece = { width: 300, height: 150, cutouts: [[[20, 20], [30, 20], [30, 30], [20, 30]]], holes: [{ x: 100, y: 75, diameter: 10 }, { x: 200, y: 75, diameter: 8, through: false, depth: 2 }] };
  const path = facePath(piece);
  assert.match(path, /M20 20L30 20L30 30L20 30Z/);
  assert.match(path, /M95 75 a5 5/);
  assert.doesNotMatch(path, /M196 75/);
});

test('markings preserve local target coordinates and nested text counters', () => {
  const marking = { targetPieceId: 'plate:1', contours: [{ outer: [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 60 }], holes: [[{ x: 20, y: 30 }, { x: 25, y: 30 }, { x: 25, y: 35 }]] }] };
  assert.deepEqual(markingRings(marking), [[[10, 20], [50, 20], [50, 60]], [[20, 30], [25, 30], [25, 35]]]);
  assert.deepEqual(markingsFor([marking], 'plate:1'), [marking]);
  assert.deepEqual(markingsFor([marking], 'plate:2'), []);
});

test('physical local extent and material appearance come from each piece', () => {
  assert.equal(pieceColor({ material: { color: '#123456' } }, 'mdf'), '#123456');
  assert.equal(pieceOpacity({ material: { opacity: .2 } }), .2);
  assert.equal(pieceOpacity({ material: { opacity: .55 } }), .55);
  assert.equal(pieceOpacity({}), 1);
  const bounds = localBounds({ width: 300, height: 150 });
  assert.ok(bounds.x < 0 && bounds.y < 0 && bounds.width > 300 && bounds.height > 150);
});

test('hinge rotates about pin axis instead of lid center and preserves nominal transform', async () => {
  const {displayTransform}=await import('./viewerGeometry.mjs');
  const piece={transform:{origin:[0,0,10],u:[1,0,0],v:[0,1,0],normal:[0,0,1]},hinge:{axis:[0,100,11.5],direction:[1,0,0],angle:90}};
  const snapshot=structuredClone(piece),tr=displayTransform(piece);
  assert.ok(Math.abs(tr.origin[1]-98.5)<1e-8);assert.ok(Math.abs(tr.origin[2]-111.5)<1e-8);
  assert.deepEqual(piece,snapshot);
});
