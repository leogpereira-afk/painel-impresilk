import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createProject, validateProject, calibrationStatus, calibrationSignature, COLORS, PROFILES, SHEETS, LIMITS } from './model.mjs';
import { buildProject, developBlank, calculateWrap, polygonArea } from './engine.mjs';
import { nestPieces, validateNesting, materialKey } from './nesting.mjs';
const near = (actual, expected, tol = 0.01) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} != ${expected}`);
const piece = (id, width, height, material = {}) => ({ id, blank: { width, height }, material: { thickness: 3, color: '#000000', finish: 'matte', ...material } });
const stock = (overrides = {}) => ({ width: 1000, length: 1000, trim: 0, kerf: 0, rotation: true, quantity: null, remnants: [], ...overrides });
const clone = o => structuredClone(o);
function assertFinite(value) { if (typeof value === 'number') assert.ok(Number.isFinite(value)); else if (value && typeof value === 'object') for (const child of Object.values(value)) assertFinite(child); }
function packCheck(pieces, options, fabrication = {}) { const n = nestPieces(pieces, options, fabrication); assert.deepEqual(validateNesting(n, pieces, options, fabrication), []); return n; }

test('default catalogue and project are serializable and independent', () => {
  assert.equal(COLORS.length, 17); assert.equal(PROFILES.length, 3); assert.deepEqual(SHEETS.map(s => s.width), [1220, 1250, 1500]);
  const a = createProject(), b = createProject(); a.edges.left = 0; assert.equal(b.edges.left, 30); assert.deepEqual(validateProject(JSON.parse(JSON.stringify(b))), []);
});
test('default geometry closes facade with exactly five joints and consistent areas', () => {
  const p = createProject(), r = buildProject(p);
  assert.ok(r.valid, JSON.stringify(r.errors)); assert.equal(r.pieces.length, 6);
  near(r.pieces.reduce((sum, item) => sum + item.width, 0) + 5 * p.layout.joint, p.front.width);
  near(r.totals.visibleArea, (p.front.width - 5 * p.layout.joint) * p.front.height);
  near(r.totals.developedArea, r.pieces.reduce((sum, item) => sum + polygonArea(item.blank.contour), 0));
  assert.ok(r.totals.envelopeArea > r.totals.developedArea); assertFinite(r);
  const n = packCheck(r.pieces, p.stock, p.fabrication); assert.equal(n.unplaced.length, 0); assert.equal(n.sheets.length, 2);
});
test('different left/right and soffit transforms preserve dimensions and orientation', () => {
  const p = createProject(); p.left = { enabled: true, depth: 420, height: 1400 }; p.right = { enabled: true, depth: 870, height: 900 }; p.soffit = { enabled: true, width: 5000, depth: 760, y: 300, x: 200 };
  const r = buildProject(p); assert.ok(r.valid); const [f, l, rr, s] = r.surfaces;
  assert.equal(f.width, 6000); assert.equal(l.width, 420); assert.equal(rr.width, 870); assert.equal(s.height, 760);
  assert.deepEqual(l.transform.origin, [0, 0, -420]); assert.deepEqual(rr.transform.u, [0, 0, -1]); assert.deepEqual(s.transform.origin, [200, 300, -760]);
  for (const surface of r.surfaces) { const { u, v, normal } = surface.transform; assert.deepEqual([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]].map(n => n || 0), normal); }
});
test('asymmetric finished edges and compensation are each applied once along correct axis', () => {
  const p = createProject(); p.overrides['front-1-1'] = { edges: { left: 20, right: 30, top: 0, bottom: 20 }, material: { thickness: 4 } }; p.fabrication.compensation = { left: 1, right: 2, top: 3, bottom: 0.5 };
  const r = buildProject(p), a = r.pieces[0]; assert.ok(r.valid); near(a.blank.width, a.width + 19 + 28); near(a.blank.height, a.height + 19.5); near(a.blank.face.x, 19); near(a.blank.face.y, 19.5);
  assert.deepEqual(a.blank.grooves.map(g => g.edge).sort(), ['bottom', 'left', 'right']); assert.equal(a.material.thickness, 4); assert.equal(a.calibrated, false);
});
test('all two, three, four and zero flange combinations have a valid contour and grooves', () => {
  const f = createProject().fabrication;
  for (let mask = 0; mask < 16; mask++) {
    const edges = Object.fromEntries(['left', 'right', 'top', 'bottom'].map((key, i) => [key, mask & (1 << i) ? (i % 2 ? 30 : 20) : 0]));
    const b = developBlank(380, 220, edges, f); assert.equal(b.grooves.length, Object.values(edges).filter(Boolean).length);
    near(b.area, 380 * 220 + (edges.left + edges.right) * (220 - (edges.top ? 1 : 0) - (edges.bottom ? 1 : 0)) + (edges.top + edges.bottom) * (380 - (edges.left ? 1 : 0) - (edges.right ? 1 : 0)));
    for (const [x, y] of b.contour) { assert.ok(x >= 0 && x <= b.width); assert.ok(y >= 0 && y <= b.height); }
    assert.ok(b.area <= b.width * b.height);
  }
});
test('compensation cannot silently remove a folded edge', () => { const p = createProject(); p.fabrication.compensation = 20; p.edges.left = 20; const r = buildProject(p); assert.ok(!r.valid); assert.ok(r.errors.some(e => e.code === 'BLANK')); });
test('rectangular openings preserve exact visible area when joints are zero', () => {
  const p = createProject(); p.front = { width: 2000, height: 1000 }; p.layout.joint = 0; p.openings = [{ id: 'O1', surface: 'front', x: 500, y: 200, width: 500, height: 400 }];
  const r = buildProject(p); assert.ok(r.valid); near(r.totals.visibleArea, 1800000);
  for (const a of r.pieces) assert.ok(a.x + a.width <= 500 || a.x >= 1000 || a.y + a.height <= 200 || a.y >= 600);
  assert.ok(r.warnings.some(w => w.code === 'OPENING_SPLIT'));
});
test('overlapping openings subtract their union, not double their intersection', () => { const p = createProject(); p.front = { width: 2000, height: 1000 }; p.layout.joint = 0; p.fixing.edgeOffset = 5; p.openings = [{ x: 500, y: 200, width: 500, height: 400 }, { x: 700, y: 300, width: 500, height: 400 }]; const r = buildProject(p); assert.ok(r.valid); near(r.totals.visibleArea, 2000000 - 400000 + 90000); });
test('opening bounds and disabled surfaces reject input', () => { for (const opening of [{ surface: 'left', x: 0, y: 0, width: 100, height: 100 }, { x: 5950, y: 0, width: 100, height: 100 }]) { const p = createProject(); p.openings = [opening]; assert.equal(buildProject(p).valid, false); } });
test('manual layout detects overlap and keeps explicit IDs', () => {
  const p = createProject(); p.layout.orientation = 'manual'; p.layout.manual = [{ surface: 'front', id: 'custom-a', x: 0, y: 0, width: 1000, height: 1000 }, { surface: 'front', id: 'custom-b', x: 1010, y: 0, width: 1000, height: 1000 }];
  assert.deepEqual(buildProject(p).pieces.map(q => q.id), ['custom-a', 'custom-b']); p.layout.manual[1].x = 900; assert.ok(buildProject(p).errors.some(e => e.code === 'MANUAL_OVERLAP'));
});
test('malformed imported numeric, string and prototype values are rejected without throwing', () => {
  for (const value of [null, undefined, [], 5, {}, { schemaVersion: 99 }, JSON.parse('{"__proto__":{"polluted":true}}')]) assert.equal(buildProject(value).valid, false);
  for (const value of [NaN, Infinity, -1, '6000', null, 0, 100001]) { const p = createProject(); p.front.width = value; assert.equal(buildProject(p).valid, false); }
  const p = createProject(); p.fabrication.calibration = { approved: true, responsible: 5, date: 123, signature: calibrationSignature(p) }; assert.equal(buildProject(p).calibration.valid, false);
  const cycle = createProject(); cycle.extra = cycle; assert.equal(buildProject(cycle).valid, false); assert.equal({}.polluted, undefined);
});
test('piece cap prevents tiny-grid denial of service before allocation', () => {
  const p = createProject(); p.front.width = 100000; p.front.height = 100000; p.layout.maxWidth = 0.01; p.layout.maxHeight = 0.01; p.layout.joint = 0;
  const start = performance.now(); const r = buildProject(p); assert.equal(r.valid, false); assert.ok(r.errors.some(e => e.code === 'PIECE_LIMIT')); assert.ok(performance.now() - start < 500);
});
test('uncalibrated is always draft; compatible measured sample is accepted and changes invalidate it', () => {
  const p = createProject(); assert.equal(calibrationStatus(p).valid, false); p.material.skin = 0.3; p.fabrication.depth = 2.5; p.fabrication.remainingCore = 0.2;
  p.fabrication.calibration = { approved: true, signature: calibrationSignature(p), responsible: 'Operador fictício', date: '2026-10-17', targetWidth: 400, targetHeight: 300, measuredWidth: 400.2, measuredHeight: 300, tolerance: 0.5, angle: 90, visualApproved: true, fitApproved: true };
  assert.equal(calibrationStatus(p).valid, true); assert.equal(buildProject(p).calibration.valid, true);
  for (const mutate of [q => q.material.thickness = 4, q => q.material.sku = 'different', q => q.fabrication.toolAngle = 120, q => q.fabrication.compensation = 0.1]) { const q = clone(p); mutate(q); assert.equal(calibrationStatus(q).valid, false); }
  p.fabrication.calibration.measuredWidth = 405; assert.equal(calibrationStatus(p).valid, false);
});
test('core residual is distinct from total remaining thickness', () => { const p = createProject(); p.material.skin = 0.3; p.fabrication.depth = 2.5; p.fabrication.remainingCore = 0.2; assert.ok(buildProject(p).valid); p.fabrication.remainingCore = 0.5; assert.ok(buildProject(p).errors.some(e => e.code === 'RESIDUAL')); p.fabrication.depth = 2.8; assert.ok(buildProject(p).errors.some(e => e.code === 'SKIN')); });
test('structure bars conserve cut lengths and kerf; fixings reference real segments', () => {
  const p = createProject(), r = buildProject(p), supports = new Set(r.structure.segments.map(s => s.id));
  near(r.totals.metalLength, r.structure.segments.reduce((n, s) => n + s.length, 0));
  assert.deepEqual(new Set(r.structure.bars.flatMap(b => b.cuts.map(c => c.id))), supports);
  for (const bar of r.structure.bars) { near(bar.used, bar.cuts.reduce((n, c) => n + c.length, 0) + (bar.cuts.length - 1) * p.structure.kerf); near(bar.used + bar.waste, p.structure.barLength); }
  near(r.totals.tapeLength, r.pieces.flatMap(piece => piece.fixings.tape).reduce((n, t) => n + Math.hypot(t.x2 - t.x1, t.y2 - t.y1), 0));
  for (const tape of r.pieces.flatMap(piece => piece.fixings.tape)) assert.ok(supports.has(tape.supportId));
  assert.equal(r.structure.dimensioned, false);
});
test('screws map has no duplicate corners and all points lie on their supporting profiles', () => {
  const p = createProject(); p.fixing.type = 'screws'; const r = buildProject(p); assert.ok(r.valid); assert.ok(r.totals.screws > 0); assert.equal(r.totals.tapeLength, 0);
  assert.equal(r.totals.screws, r.pieces.reduce((n, item) => n + item.fixings.screws.length, 0));
  for (const item of r.pieces) { assert.equal(new Set(item.fixings.screws.map(s => `${s.x},${s.y}`)).size, item.fixings.screws.length); for (const screw of item.fixings.screws) { const support = r.structure.segments.find(s => s.id === screw.supportId); assert.ok(support); assert.ok(screw.x >= p.fixing.edgeOffset && screw.x <= item.width - p.fixing.edgeOffset + 1e-5); } }
});
test('nominal wrapping calculation reproduces explicit dimensional study', () => { const r = calculateWrap({ profile: '50x30', thickness: 3, tapeThickness: 1, clearance: 2 }); assert.equal(r.width, 58); assert.equal(r.height, 35); assert.equal(r.blankWidth, 128); assert.equal(r.calibrated, false); assert.equal(calculateWrap({ profile: '50x30', thickness: 3, tapeThickness: NaN, clearance: 2 }).valid, false); });
test('nesting exact fit, physical trim and kerf have no phantom last-cut margin', () => {
  let n = packCheck([piece('A', 1000, 1000)], stock()); assert.equal(n.sheets.length, 1); near(n.utilization, 100);
  n = packCheck([piece('A', 480, 980), piece('B', 496, 980)], stock({ trim: 10, kerf: 4, quantity: 1 })); assert.equal(n.unplaced.length, 0); assert.equal(n.sheets.length, 1);
  n = packCheck([piece('A', 500, 1000), piece('B', 500, 1000)], stock({ kerf: 4, quantity: 1, rotation: false })); assert.equal(n.unplaced.length, 1);
});
test('rotation obeys directional finish, grain flag and stock prohibition', () => {
  for (const [material, rotation, expected] of [[{}, true, 0], [{ directional: true }, true, 1], [{ finish: 'brushed' }, true, 1], [{ finish: 'wood' }, true, 1], [{}, false, 1]]) { const pieces = [piece('A', 1200, 800, material)]; const n = packCheck(pieces, stock({ width: 900, length: 1500, rotation })); assert.equal(n.unplaced.length, expected); }
});
test('stock quantity counts globally while colors, thickness and lots never share sheets', () => {
  const pieces = [piece('A', 400, 400, { color: '#111111', lot: 'x' }), piece('B', 400, 400, { color: '#222222', lot: 'x' }), piece('C', 400, 400, { color: '#111111', lot: 'y' }), piece('D', 400, 400, { color: '#111111', lot: 'x', thickness: 4 })];
  let n = packCheck(pieces, stock()); assert.equal(n.sheets.length, 4); assert.equal(n.unplaced.length, 0);
  n = packCheck(pieces, stock({ quantity: 2 })); assert.equal(n.sheets.length, 2); assert.equal(n.unplaced.length, 2);
});
test('verified remnants consumed once and mismatched/unknown material not fabricated', () => {
  const pieces = [piece('A', 300, 300), piece('B', 300, 300)];
  const options = stock({ quantity: 0, remnants: [{ id: 'R1', width: 400, length: 400, material: pieces[0].material }, { id: 'R2', width: 400, length: 400 }, { id: 'R3', width: 400, length: 400, material: { ...pieces[0].material, thickness: 4 } }] });
  const n = packCheck(pieces, options); assert.equal(n.sheets.length, 1); assert.equal(n.sheets[0].sourceId, 'R1'); assert.equal(n.unplaced.length, 1); assert.ok(n.warnings.length);
});
test('machine working envelope and finite stock errors remain explicit', () => {
  const pieces = [piece('A', 900, 900)]; let n = packCheck(pieces, stock(), { machineWidth: 800, machineLength: 1000 }); assert.equal(n.unplaced.length, 1);
  for (const value of [NaN, Infinity, '1000', -1, 0]) { n = nestPieces(pieces, stock({ width: value })); assert.equal(n.sheets.length, 0); assert.equal(n.unplaced.length, 1); assert.ok(n.errors.length); }
  assert.ok(nestPieces([piece('X', 100, 100), piece('X', 200, 200)], stock()).errors.length);
});
test('independent checker detects overlap, tampered dimensions, area and missing IDs', () => {
  const pieces = [piece('A', 400, 400), piece('B', 400, 400)]; const opts = stock({ kerf: 4 }); const n = packCheck(pieces, opts);
  const bad = clone(n); bad.sheets[0].placements[1].x = bad.sheets[0].placements[0].x; bad.sheets[0].placements[1].y = bad.sheets[0].placements[0].y; assert.ok(validateNesting(bad, pieces, opts).some(e => e.includes('Sobreposição')));
  const missing = clone(n); missing.sheets[0].placements.pop(); assert.ok(validateNesting(missing, pieces, opts).length);
});
test('seeded varied facade and nesting cases conserve pieces, materials, bounds and areas', () => {
  let seed = 75831; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 50; i++) {
    const p = createProject(); p.front.width = 1500 + random() * 15000; p.front.height = 700 + random() * 5000; p.layout.maxWidth = 400 + random() * 1100; p.layout.maxHeight = 400 + random() * 1500; p.layout.joint = random() * 20; p.edges.left = i % 2 ? 20 : 0; p.edges.right = 30; p.edges.top = i % 3 ? 20 : 0; p.edges.bottom = 30;
    p.stock.width = [1220, 1250, 1500][i % 3]; p.stock.kerf = random() * 6; p.stock.trim = random() * 15;
    const r = buildProject(p); assert.ok(r.valid, JSON.stringify(r.errors)); assertFinite(r); const n = packCheck(r.pieces, p.stock, p.fabrication); assertFinite(n); near(n.usedArea + n.wasteArea, n.grossArea);
    assert.equal(n.sheets.flatMap(s => s.placements).length + n.unplaced.length, r.pieces.length);
  }
});
test('representative 500-piece facade completes within bounded local computation', () => {
  const p = createProject(); p.front = { width: 25000, height: 20000 }; p.layout.maxWidth = 1000; p.layout.maxHeight = 1000;
  const start = performance.now(); const r = buildProject(p), n = packCheck(r.pieces, p.stock, p.fabrication), elapsed = performance.now() - start;
  assert.ok(r.valid); assert.equal(r.pieces.length, 500); assert.equal(n.unplaced.length, 0); assert.ok(elapsed < 5000, `500 pieces took ${elapsed}ms`); console.log(`ACM benchmark: 500 peças, ${n.sheets.length} chapas, ${Math.round(elapsed)} ms`);
});
test('vertical and horizontal rotate preferred module dimensions; mixed selects by surface', () => {
  const p = createProject(); p.front = { width: 5000, height: 1700 }; p.layout.maxWidth = 800; p.layout.maxHeight = 1300;
  const vertical = buildProject(p); p.layout.orientation = 'horizontal'; const horizontal = buildProject(p); p.layout.orientation = 'mixed'; const mixed = buildProject(p);
  assert.ok(vertical.valid && horizontal.valid && mixed.valid); assert.notEqual(vertical.pieces.length, horizontal.pieces.length);
  assert.equal(vertical.surfaces[0].modulation.moduleWidth, 800); assert.equal(horizontal.surfaces[0].modulation.moduleWidth, 1300);
  assert.equal(mixed.pieces.length, Math.min(vertical.pieces.length, horizontal.pieces.length));
  const comparisons = [];
  for (const orientation of ['vertical', 'horizontal', 'mixed']) for (const sheet of SHEETS) { const q = createProject(); q.front = p.front; q.layout = { ...p.layout, orientation }; q.stock = { ...q.stock, ...sheet }; const r = buildProject(q), n = packCheck(r.pieces, q.stock, q.fabrication); comparisons.push({ orientation, width: sheet.width, pieces: r.pieces.length, sheets: n.sheets.length, unplaced: n.unplaced.length }); }
  assert.equal(comparisons.length, 9); assert.ok(new Set(comparisons.map(c => c.pieces)).size > 1); assert.ok(new Set(comparisons.map(c => `${c.sheets}:${c.unplaced}`)).size > 1);
});
test('manual column and row sizes close exactly with joints and reject changed facade', () => {
  const p = createProject(); p.front = { width: 2020, height: 1010 }; p.layout.orientation = 'manual'; p.layout.columns = { front: [600, 700, 700] }; p.layout.rows = { front: [400, 600] };
  const r = buildProject(p); assert.ok(r.valid, JSON.stringify(r.errors)); assert.equal(r.pieces.length, 6); assert.deepEqual(r.pieces.slice(0, 3).map(p => p.width), [600, 700, 700]); assert.deepEqual(r.pieces.map(p => p.height), [400, 400, 400, 600, 600, 600]);
  p.front.width += 1; assert.ok(buildProject(p).errors.some(e => e.code === 'MANUAL_CLOSURE'));
});
test('locked geometry requires snapshot, survives unchanged rebuild and fails closed on modification', () => {
  const p = createProject(), initial = buildProject(p), a = initial.pieces[0];
  p.overrides[a.id] = { locked: true, geometrySignature: a.geometrySignature }; assert.ok(buildProject(p).valid);
  p.front.width += 100; assert.ok(buildProject(p).errors.some(e => e.code === 'LOCK_CHANGED'));
  p.front.width = 6000; p.overrides[a.id].edges = { left: 20 }; assert.ok(buildProject(p).errors.some(e => e.code === 'LOCK_CHANGED'));
  p.overrides = { 'missing-piece': { locked: true, geometrySignature: 'x' } }; assert.ok(buildProject(p).errors.some(e => e.code === 'LOCK_MISSING'));
});
test('effective surface and piece material layers reject a tool deeper than that ACM', () => {
  const p = createProject(); p.material.thickness = 4; p.material.skin = 0.3; p.fabrication.depth = 3.5; p.fabrication.remainingCore = 0.2; p.overrides['front-1-1'] = { material: { thickness: 3 } };
  assert.equal(buildProject(p).valid, false); assert.ok(validateProject(p).some(e => e.code === 'MACHINING_THICKNESS'));
  p.fabrication.depth = null; p.fabrication.remainingCore = null; p.surfaceMaterials = { front: { thickness: 3 } }; p.overrides['front-1-1'] = { material: { skin: 1.7 } };
  assert.equal(buildProject(p).valid, false); assert.ok(validateProject(p).some(e => e.code === 'SKIN_LAYERS'));
});
test('manual imports reject non-text IDs and unknown or disabled surfaces', () => {
  for (const invalid of [{ id: 42, surface: 'front' }, { id: '', surface: 'front' }, { id: 'bad', surface: 'unknown' }, { id: 'bad', surface: 'left' }]) {
    const p = createProject(); p.layout.orientation = 'manual'; p.layout.manual = [{ id: 'good', surface: 'front', x: 0, y: 0, width: 500, height: 500 }, { ...invalid, x: 1000, y: 0, width: 500, height: 500 }];
    assert.equal(buildProject(p).valid, false); assert.ok(validateProject(p).length);
  }
});
test('independent checker rejects doubled remnants and invented stock quantities', () => {
  const pieces = [piece('A', 400, 400), piece('B', 400, 400)]; const options = stock({ quantity: 0, remnants: [{ id: 'R1', width: 400, length: 400, material: pieces[0].material }] });
  const n = packCheck(pieces, options), duplicated = clone(n), extra = clone(n.sheets[0]); extra.id = 'FAKE'; extra.placements[0].pieceId = n.unplaced[0].pieceId; duplicated.sheets.push(extra); duplicated.unplaced = []; duplicated.grossArea *= 2; duplicated.usedArea *= 2;
  assert.ok(validateNesting(duplicated, pieces, options).some(e => e.includes('mais de uma vez')));
  extra.source = 'sheet'; extra.sourceId = null; extra.width = 1000; extra.length = 1000;
  assert.ok(validateNesting(duplicated, pieces, options).some(e => e.includes('Quantidade')));
});
test('wrapping study uses one central profile with real cut length and back-face fixings', () => {
  const p = createProject(); p.assemblyMode = 'wrap'; p.structure.profile = '50x30'; p.front = { width: 58, height: 1000 }; p.edges = { left: 35, right: 35, top: 0, bottom: 0 };
  const r = buildProject(p); assert.ok(r.valid, JSON.stringify(r.errors)); assert.equal(r.pieces.length, 1); assert.equal(r.pieces[0].blank.width, 128); assert.equal(r.structure.segments.length, 1); near(r.structure.totalLength, 1000); near(r.structure.segments[0].start[0], 29); assert.equal(r.pieces[0].fixings.contact, 'back-face');
  p.front.width = 57; assert.ok(buildProject(p).errors.some(e => e.code === 'WRAP_CLEARANCE'));
});
test('ideal tool V opening discrepancy is reported without replacing measured process data', () => {
  const p = createProject(); p.material.skin = 0.3; p.fabrication.depth = 2.5; p.fabrication.remainingCore = 0.2;
  const r = buildProject(p); assert.ok(r.valid); assert.ok(r.warnings.some(w => w.code === 'TOOL_GROOVE_GEOMETRY' && w.message.includes('7 mm')));
  p.fabrication.grooveWidth = 7; assert.equal(buildProject(p).warnings.some(w => w.code === 'TOOL_GROOVE_GEOMETRY'), false);
});
test('global calibration cannot release material variants on a surface or individual piece', () => {
  const p = createProject(); p.material.skin = 0.3; p.material.sku = 'SAMPLE'; p.material.lot = 'CALIBRATED'; p.fabrication.depth = 2.5; p.fabrication.remainingCore = 0.2;
  p.fabrication.calibration = { approved: true, signature: calibrationSignature(p), responsible: 'Operador fictício', date: '2026-10-17', targetWidth: 400, targetHeight: 300, measuredWidth: 400, measuredHeight: 300, tolerance: 0.5, angle: 90, visualApproved: true, fitApproved: true };
  let r = buildProject(p); assert.ok(r.pieces.every(piece => piece.calibrated));
  p.overrides['front-1-1'] = { material: { lot: 'OTHER-LOT' } }; r = buildProject(p); assert.ok(r.valid); assert.ok(r.calibration.valid); assert.equal(r.pieces[0].calibrated, false); assert.equal(r.pieces.every(piece => piece.calibrated), false);
  p.overrides = {}; p.surfaceMaterials = { front: { sku: 'OTHER-SKU' } }; r = buildProject(p); assert.ok(r.valid); assert.ok(r.pieces.every(piece => !piece.calibrated));
});
