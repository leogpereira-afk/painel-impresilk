import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_VIEWS, boundsFrameKey, cameraFrame, localToWorld, pieceWorldCorners, polygonArea, unfoldedPanels, unfoldedPlacement } from './viewportGeometry.mjs';
import { createProject } from '../../lib/acm/model.mjs';
import { buildProject } from '../../lib/acm/engine.mjs';

const piece = {
  id: 'F-001', width: 1000, height: 700,
  transform: { origin: [1200, 200, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
  blank: {
    width: 1050, height: 750,
    contour: [[20, 0], [1020, 0], [1020, 30], [1050, 30], [1050, 730], [1020, 730], [1020, 750], [20, 750], [20, 730], [0, 730], [0, 30], [20, 30]],
    grooves: [
      { edge: 'left', x1: 20, y1: 30, x2: 20, y2: 730 },
      { edge: 'right', x1: 1020, y1: 30, x2: 1020, y2: 730 },
      { edge: 'bottom', x1: 20, y1: 30, x2: 1020, y2: 30 },
      { edge: 'top', x1: 20, y1: 730, x2: 1020, y2: 730 },
    ],
  },
};

test('world transforms preserve engine origins and side/soffit normals', () => {
  assert.deepEqual(localToWorld(piece, 10, 30, -20), [1210, 230, -20]);
  const left = { ...piece, transform: { origin: [0, 0, -600], u: [0, 0, 1], v: [0, 1, 0], normal: [-1, 0, 0] } };
  assert.deepEqual(localToWorld(left, 200, 30, -20), [20, 30, -400]);
  const soffit = { ...piece, transform: { origin: [0, 0, -600], u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] } };
  assert.deepEqual(localToWorld(soffit, 20, 30, -20), [20, 20, -570]);
  assert.deepEqual(pieceWorldCorners(piece), [[1200, 200, 0], [2200, 200, 0], [2200, 900, 0], [1200, 900, 0]]);
});

test('unfolded animation partitions exact asymmetric blank without adding or dropping area', () => {
  const panels = unfoldedPanels(piece);
  assert.equal(panels.length, 5);
  assert.equal(panels.reduce((total, panel) => total + polygonArea(panel.contour), 0), polygonArea(piece.blank.contour));
  assert.equal(polygonArea(panels.find(panel => panel.edge === 'center').contour), 700000);
  assert.deepEqual(panels.find(panel => panel.edge === 'left').pivot, [20, 0]);
  assert.deepEqual(panels.find(panel => panel.edge === 'right').pivot, [1020, 0]);
});

test('zero and two fold cases still conserve material', () => {
  const flat = { ...piece, blank: { ...piece.blank, contour: [[0, 0], [1000, 0], [1000, 700], [0, 700]], width: 1000, height: 700, grooves: [] } };
  assert.equal(unfoldedPanels(flat).length, 1);
  assert.equal(polygonArea(unfoldedPanels(flat)[0].contour), 700000);
  const two = { ...piece, blank: { ...piece.blank, grooves: piece.blank.grooves.filter(groove => ['left', 'right'].includes(groove.edge)) } };
  assert.equal(unfoldedPanels(two).reduce((sum, panel) => sum + polygonArea(panel.contour), 0), polygonArea(piece.blank.contour));
});

test('display arrangement preserves all piece IDs and has no overlapping envelopes', () => {
  const pieces = Array.from({ length: 17 }, (_, index) => ({ ...piece, id: `F-${index}`, blank: { ...piece.blank, width: 350 + index * 33, height: 460 + index * 17 } }));
  const placements = unfoldedPlacement(pieces);
  assert.deepEqual(placements.map(item => item.id), pieces.map(item => item.id));
  for (let i = 0; i < placements.length; i += 1) for (let j = i + 1; j < placements.length; j += 1) {
    const a = placements[i]; const b = placements[j];
    assert.ok(a.x + pieces[i].blank.width <= b.x || b.x + pieces[j].blank.width <= a.x || a.y + pieces[i].blank.height <= b.y || b.y + pieces[j].blank.height <= a.y);
  }
});

test('engine pieces have separate positions and closed development using the same IDs', () => {
  const project = createProject(); project.left.enabled = true; project.right.enabled = true; project.soffit.enabled = true;
  const result = buildProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const front = result.pieces.filter(item => item.surface === 'front');
  assert.ok(front.length > 1);
  assert.notDeepEqual(localToWorld(front[0], 0, 0), localToWorld(front[1], 0, 0));
  for (const item of result.pieces) {
    const area = unfoldedPanels(item).reduce((total, panel) => total + polygonArea(panel.contour), 0);
    assert.ok(Math.abs(area - item.blank.area) < 0.01, item.id);
    assert.ok(pieceWorldCorners(item).flat().every(Number.isFinite));
  }
  const left = result.pieces.find(item => item.surface === 'left');
  assert.ok(pieceWorldCorners(left).every(point => point[0] === 0));
  const right = result.pieces.find(item => item.surface === 'right');
  assert.ok(pieceWorldCorners(right).every(point => point[0] === project.front.width));
  const soffit = result.pieces.find(item => item.surface === 'soffit');
  assert.ok(pieceWorldCorners(soffit).every(point => point[1] === 0));
});

test('camera framing contains every corner at landscape and mobile aspect ratios', () => {
  const min = [0, 0, -0.6]; const max = [6, 1.2, 0.22];
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  for (const aspect of [0.65, 1, 1.9, 3]) for (const direction of Object.values(CAMERA_VIEWS)) {
    const frame = cameraFrame(min, max, direction, aspect);
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const offset = [x - frame.center[0], y - frame.center[1], z - frame.center[2]];
      const depth = frame.distance - dot(offset, frame.forward);
      const normalizedX = dot(offset, frame.right) / (depth * Math.tan(35 * Math.PI / 360) * aspect);
      const normalizedY = dot(offset, frame.up) / (depth * Math.tan(35 * Math.PI / 360));
      assert.ok(Math.abs(normalizedX) < 1 && Math.abs(normalizedY) < 1, `${aspect}: ${direction}`);
    }
  }
});

test('side and bottom cameras face the corresponding engine surface normals', () => {
  const project = createProject(); project.left.enabled = true; project.right.enabled = true; project.soffit.enabled = true;
  const result = buildProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const corners = result.pieces.flatMap(pieceWorldCorners);
  const min = [0, 1, 2].map(axis => Math.min(...corners.map(point => point[axis])) / 1000);
  const max = [0, 1, 2].map(axis => Math.max(...corners.map(point => point[axis])) / 1000);
  for (const [view, surface] of [['left', 'left'], ['right', 'right'], ['bottom', 'soffit']]) {
    const frame = cameraFrame(min, max, CAMERA_VIEWS[view], 0.65);
    const normal = result.pieces.find(item => item.surface === surface).transform.normal;
    assert.ok(normal.reduce((sum, value, axis) => sum + value * frame.forward[axis], 0) > 0.999, view);
    assert.ok(frame.right[0] >= 0, 'The underside retains the left-to-right X orientation.');
    assert.ok([...frame.forward, ...frame.right, ...frame.up, frame.distance].every(Number.isFinite));
  }
  const bottom = cameraFrame(min, max, CAMERA_VIEWS.bottom, 1.9);
  assert.ok(bottom.center[1] + bottom.forward[1] * bottom.distance < min[1]);
});

test('reframing follows side and soffit extents without resetting selection-only changes', () => {
  const original = boundsFrameKey('assembled', 'front-1', [0, 0, -0.6], [6, 1.2, 0], 8);
  assert.equal(original, boundsFrameKey('assembled', 'left-1', [0, 0, -0.6], [6, 1.2, 0], 8));
  assert.notEqual(original, boundsFrameKey('assembled', 'front-1', [0, 0, -1.6], [6, 1.2, 0], 8));
  assert.notEqual(original, boundsFrameKey('assembled', 'front-1', [0, -0.3, -0.6], [6, 1.2, 0], 8));
});

// Miter contour stays in face coordinates; only the plane and profile depth change.
test('frame prism derives the exact world plane from the segment without approximating miter ends', async () => {
  const { structurePrismTransform } = await import('./viewportGeometry.mjs');
  const surface = { transform: { origin: [500, 0, 0], u: [0, 0, -1], v: [0, 1, 0], normal: [1, 0, 0] } };
  const segment = { local: { x1: 100, y1: 200, x2: 100, y2: 900 }, start: [450, 200, -100], depth: 30, contour: [[85,185],[115,215],[115,885],[85,915]] };
  const transform = structurePrismTransform(segment, surface);
  assert.deepEqual(transform.origin, [450, 0, 0]);
  assert.deepEqual(transform.u, [0, 0, -1]);
  const corners = segment.contour.map(([x,y]) => transform.origin.map((v,i) => v + transform.u[i] * x + transform.v[i] * y + transform.normal[i] * segment.depth / 2));
  assert.deepEqual(corners[0], [465,185,-85]);
  assert.deepEqual(corners[1], [465,215,-115]);
});

test('export hides selection overlays only, restores editor state even when capture throws', async () => {
  const { withoutEditorOverlays } = await import('./viewportGeometry.mjs');
  const artwork = { userData: { layoutArtwork: true }, visible: true };
  const selectedPiece = { userData: { editorOverlay: true }, visible: true };
  const hiddenGizmo = { userData: { editorOverlay: true }, visible: false };
  const dimensions = { userData: {}, visible: true };
  const scene = { traverse: visit => [artwork, selectedPiece, hiddenGizmo, dimensions].forEach(visit) };
  const capture = () => {
    assert.equal(selectedPiece.visible, false); assert.equal(hiddenGizmo.visible, false);
    assert.equal(artwork.visible, true); assert.equal(dimensions.visible, true);
    return 'PNG';
  };
  assert.equal(withoutEditorOverlays(scene, capture), 'PNG');
  assert.equal(selectedPiece.visible, true); assert.equal(hiddenGizmo.visible, false);
  assert.throws(() => withoutEditorOverlays(scene, () => { capture(); throw new Error('capture failed'); }), /capture failed/);
  assert.equal(selectedPiece.visible, true); assert.equal(hiddenGizmo.visible, false);
});
