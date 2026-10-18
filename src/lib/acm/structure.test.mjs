import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.mjs';
import { buildProject } from './engine.mjs';
import { createStructureFrame, validateStructureFrame, planMetalBars, metalStockKey, frameEditorValues } from './structure.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);
const overlap = (a, b) => a.x < b.x + b.width - .00001 && a.x + a.width > b.x + .00001 && a.y < b.y + b.height - .00001 && a.y + a.height > b.y + .00001;
function project() { const p = createProject(); p.front = { width: 1800, height: 1200 }; p.structure.frame = createStructureFrame(p); p.structure.frame.spacingX = 100000; p.structure.frame.spacingY = 100000; return p; }
function valid(p) { const r = buildProject(p); assert.equal(r.valid, true, JSON.stringify(r.errors)); return r; }
function stockSegment(id, length, profile = {}, angles = {}) { const p = { id: '30x20', width: 30, depth: 20, orientation: 'width', wall: 1.2, material: 'aço', sku: 'ficticio', finish: 'natural', gauge: '', ...profile }; return { id, length, longLength: length, shortLength: length, profile: p.id, profileSpec: p, stockKey: metalStockKey(p), barLength: 1000, angleA: 90, angleB: 90, ...angles }; }

test('optional frame preserves legacy projects and activation does not alias group profiles', () => {
  const p = createProject(), before = buildProject(p); assert.equal(before.structure.frame, undefined); assert.deepEqual(validateStructureFrame(p.structure), []);
  const f = createStructureFrame(p); f.groups.internalVertical.profile.width = 55; assert.equal(f.groups.externalVertical.profile.width, 30);
});
test('independent frame remains identical when ACM pagination changes', () => {
  const p = project(); p.structure.frame.spacingX = 450; p.structure.frame.spacingY = 400;
  const before = valid(p); p.layout.maxWidth = 650; p.layout.maxHeight = 700; p.layout.orientation = 'horizontal'; const after = valid(p);
  assert.notEqual(before.pieces.length, after.pieces.length); assert.deepEqual(before.structure, after.structure);
});
test('butt deductions use asymmetric real support faces and individual overrides', () => {
  const p = project(), f = p.structure.frame; f.gap = 2;
  f.groups.externalHorizontal.profile = { ...f.groups.externalHorizontal.profile, width: 50, depth: 30, orientation: 'depth' };
  f.overrides['front-EXT-T'] = { profile: { width: 50, depth: 40, orientation: 'depth', gauge: 'N12', wall: 1.5, sku: 'top-ficticio' } };
  const r = valid(p), left = r.structure.segments.find(s => s.id === 'front-EXT-L');
  near(left.longLength, 1200 - 30 - 40 - 4); near(left.local.y1, 32); near(left.local.y2, 1158);
  const top = r.structure.segments.find(s => s.id === 'front-EXT-T'); near(top.width, 40); near(top.depth, 50); assert.equal(top.gauge, 'N12'); assert.equal(top.wall, 1.5);
  assert.notEqual(top.stockKey, left.stockKey);
});
test('vertical continuity deducts left and right independently', () => {
  const p = project(), f = p.structure.frame; f.continuous = 'vertical'; f.gap = 1.5;
  f.overrides['front-EXT-L'] = { profile: { width: 20 } }; f.overrides['front-EXT-R'] = { profile: { width: 50 } };
  const r = valid(p), bottom = r.structure.segments.find(s => s.id === 'front-EXT-B');
  near(bottom.length, 1800 - 20 - 50 - 3); near(bottom.local.x1, 21.5); near(bottom.local.x2, 1748.5);
  near(r.structure.segments.find(s => s.id === 'front-EXT-L').length, 1200);
});
test('45 degree frames expose long/short points, real contours and explicit gap convention', () => {
  const p = project(); p.structure.frame.joint = 'miter45'; p.structure.frame.gap = 1;
  const r = valid(p), s = r.structure.segments.find(s => s.id === 'front-EXT-B');
  near(s.longLength, 1798); near(s.shortLength, 1738); near(s.local.x2 - s.local.x1, 1768); assert.deepEqual([s.angleA, s.angleB], [45, 45]);
  assert.deepEqual(s.contour, [[1, 0], [1799, 0], [1769, 30], [31, 30]]);
  p.structure.frame.groups.externalVertical.profile.orientation = 'depth';
  assert.ok(buildProject(p).errors.some(e => e.code === 'FRAME_MITER_WIDTH'));
});
test('internal intersections use butt joints without overlapping metal volume', () => {
  const p = project(); p.structure.frame.spacingX = 420; p.structure.frame.spacingY = 300; p.structure.frame.gap = 1;
  const r = valid(p); assert.ok(r.structure.segments.some(s => s.id.includes('-S')));
  for (const [i, a] of r.structure.segments.entries()) for (const b of r.structure.segments.slice(i + 1)) assert.equal(overlap(a.bounds, b.bounds), false, `${a.id} overlaps ${b.id}`);
});
test('opening gets real jambs/headers and every member avoids the void', () => {
  const p = project(); p.structure.frame.spacingX = 600; p.structure.frame.spacingY = 100000;
  p.openings = [{ id: 'ficticia', surface: 'front', x: 700, y: 300, width: 380, height: 400 }];
  const r = valid(p); assert.equal(r.structure.segments.filter(s => s.id.includes('-OP')).length, 4);
  for (const s of r.structure.segments) assert.equal(overlap(s.bounds, p.openings[0]), false, s.id);
  p.openings[0].x = 20; assert.ok(buildProject(p).errors.some(e => e.code === 'FRAME_OPENING_CLEARANCE'));
});
test('crossing an opening splits a continuous internal member at the reinforcement faces', () => {
  const p = project(); p.structure.frame.spacingX = 900; p.structure.frame.spacingY = 100000;
  p.openings = [{ id: 'o', surface: 'front', x: 700, y: 300, width: 380, height: 400 }];
  const r = valid(p), split = r.structure.segments.filter(s => s.baseId === 'front-IV-1');
  assert.equal(split.length, 2); near(split[0].bounds.y + split[0].bounds.height, 270); near(split[1].bounds.y, 730);
});
test('parallel custom reinforcement collision explicitly blocks instead of duplicating stock', () => {
  const p = project(); p.structure.frame.spacingX = 900;
  p.structure.frame.reinforcements = [{ id: 'r1', surface: 'front', axis: 'vertical', position: 900, start: 30, end: 1170 }];
  assert.ok(buildProject(p).errors.some(e => e.code === 'FRAME_PARALLEL_COLLISION'));
});
test('each side keeps its own width, height, profiles and world transform', () => {
  const p = project(); p.left = { enabled: true, depth: 450, height: 1100 }; p.right = { enabled: true, depth: 850, height: 900 };
  p.structure.frame.faces.left = { groups: { externalHorizontal: { profile: { width: 50, orientation: 'depth' } } } };
  const r = buildProject(p), l = r.structure.segments.find(s => s.id === 'left-EXT-B'), right = r.structure.segments.find(s => s.id === 'right-EXT-B');
  near(l.length, 450); near(right.length, 850); near(l.width, 20); assert.equal(l.start[0], 29); assert.equal(right.start[0], 1786); assert.ok(r.errors.some(e => e.code === 'FRAME_FACE_INTERFERENCE'));
  p.structure.frame.inset = 60; const separated = valid(p); assert.ok(!separated.errors.some(e => e.code === 'FRAME_FACE_INTERFERENCE'));
});
test('bar plan counts the last kerf when a remainder exists and rejects a too-small residual', () => {
  const f = createStructureFrame(); f.kerf = 3;
  const a = planMetalBars([stockSegment('a', 998)], f); assert.deepEqual(a.unplaced, ['a']);
  const exact = planMetalBars([stockSegment('a', 1000)], f); assert.equal(exact.bars[0].waste, 0); assert.equal(exact.bars[0].cuts[0].kerfAfter, 0);
  const split = planMetalBars([stockSegment('a', 500), stockSegment('b', 494)], f); assert.equal(split.bars.length, 1); assert.equal(split.bars[0].used, 1000); assert.equal(split.bars[0].cuts[1].kerfAfter, 3);
});
test('bar cuts conserve length with trims and never create an automatic splice', () => {
  const f = createStructureFrame(); f.kerf = 3; f.trimStart = 10; f.trimEnd = 20;
  const r = planMetalBars([stockSegment('a', 400), stockSegment('b', 500), stockSegment('long', 1001)], f), bar = r.bars[0];
  assert.deepEqual(r.unplaced, ['long']); near(bar.used + bar.trimEnd + bar.trimKerfEnd + bar.waste, bar.length); near(bar.cuts[0].start, 13); assert.equal(bar.cuts[0].id, 'b');
});
test('miter kerf is projected along bar and both angled ends are cut', () => {
  const f = createStructureFrame(), r = planMetalBars([stockSegment('m', 500, {}, { angleA: 45, angleB: 45, shortLength: 440 })], f), c = r.bars[0].cuts[0];
  near(c.kerfBefore, 3 * Math.sqrt(2)); near(c.kerfAfter, 3 * Math.sqrt(2)); near(r.bars[0].used + r.bars[0].waste, 1000);
});
test('remnants require physical SKU/material/wall/finish match and stay out of purchases', () => {
  const f = createStructureFrame(), a = stockSegment('a', 600), b = stockSegment('b', 600, { sku: 'outro' });
  f.remnants = [{ id: 'retalho-incompativel', length: 700, profile: { ...a.profileSpec, wall: 2 } }, { id: 'retalho-certo', length: 700, profile: a.profileSpec, pricePerM: 12 }];
  const r = planMetalBars([a, b], f); assert.equal(r.bars.length, 2); assert.equal(r.bars[0].source, 'remnant'); assert.equal(r.bars[0].pricePerM, 12); assert.equal(r.bars[1].source, 'commercial'); assert.equal(r.purchases.length, 1); assert.deepEqual(r.unusedRemnants, ['retalho-incompativel']);
});
test('hybrid retains tape on frame supports and flange marks never fabricate anchor or hole diameter', () => {
  const p = project(); p.fixing.type = 'hybrid'; p.fixing.edgeOffset = 15; p.fixing.screwProduct = { code: 'ficticio', function: 'fixacao teste' };
  const r = valid(p); assert.ok(r.totals.tapeLength > 0); assert.ok(r.totals.screws > 0);
  for (const piece of r.pieces) for (const fix of piece.fixings.screws) { assert.equal(fix.supportId,undefined);assert.equal(fix.supportStatus,'unverified');assert.equal(fix.coordinateSpace,'blank'); assert.equal(fix.drillDiameter, undefined); assert.equal(fix.role, 'fixacao teste'); }
  p.fixing.screwProduct.drillDiameter = 4.8; const drilled = valid(p); assert.ok(drilled.pieces.flatMap(p => p.fixings.screws).every(s => s.drillDiameter === 4.8));
});
test('lack of support is visible instead of generating duplicate panel-specific members', () => {
  const p = project(); p.structure.frame.inset = 200; p.layout.maxWidth = 300; p.layout.maxHeight = 400;
  const r = valid(p); assert.equal(r.structure.segments.length, 4); assert.ok(r.warnings.some(w => w.code === 'FIXING_SUPPORT_INSUFFICIENT'));
});
test('validator rejects unbounded, nonfinite, ambiguous and malformed frame inputs', () => {
  for (const mutate of [f => { f.kerf = NaN; }, f => { f.spacingX = 0; }, f => { f.groups.externalHorizontal.profile.wall = 20; }, f => { f.faces.invalid = {}; }, f => { f.remnants = [{ id: 'r', length: Infinity, profile: {} }]; }, f => { f.overrides = []; }]) { const p = project(); mutate(p.structure.frame); assert.ok(validateStructureFrame(p.structure).length); assert.equal(buildProject(p).valid, false); }
});
test('a remnant with unknown commercial identity is never silently treated as compatible', () => {
  const f = createStructureFrame(), s = stockSegment('u', 600, { sku: '', material: '', finish: '', wall: null });
  f.remnants = [{ id: 'unknown', length: 900, profile: s.profileSpec }];
  const r = planMetalBars([s], f); assert.equal(r.bars[0].source, 'commercial'); assert.deepEqual(r.unusedRemnants, ['unknown']);
});
test('every full tape rectangle stays on the real miter polygon, including off-center contact', () => {
  const p = project(); p.structure.frame.joint = 'miter45'; p.fixing.edgeOffset = 20;
  const r = valid(p);
  function inside(point, polygon) { const signs = polygon.map((a, i) => { const b = polygon[(i + 1) % polygon.length]; return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]); }); return signs.every(v => v >= -.0001) || signs.every(v => v <= .0001); }
  for (const piece of r.pieces) for (const strip of piece.fixings.tape) {
    const s = r.structure.segments.find(s => s.id === strip.supportId), horizontal = strip.y1 === strip.y2, half = strip.width / 2;
    const corners = horizontal ? [[strip.x1, strip.y1 - half], [strip.x1, strip.y1 + half], [strip.x2, strip.y2 - half], [strip.x2, strip.y2 + half]] : [[strip.x1 - half, strip.y1], [strip.x1 + half, strip.y1], [strip.x2 - half, strip.y2], [strip.x2 + half, strip.y2]];
    for (const corner of corners) assert.ok(inside([corner[0] + piece.x, corner[1] + piece.y], s.contour), `${s.id} / ${corner}`);
  }
});
test('partial element override cannot hide a physically impossible wall', () => {
  const p = project(); p.structure.frame.overrides['front-EXT-B'] = { profile: { wall: 12 } };
  assert.ok(buildProject(p).errors.some(e => e.code === 'FRAME_WALL'));
});
test('subdivided grid is bounded before allocating a potentially quadratic number of members', () => {
  const p = project(); p.front = { width: 10000, height: 10000 }; p.structure.frame.spacingX = 50; p.structure.frame.spacingY = 50; p.layout.maxWidth = 2500; p.layout.maxHeight = 2500;
  const r = buildProject(p); assert.ok(r.errors.some(e => e.code === 'SEGMENT_LIMIT')); assert.ok(r.structure.segments.length <= 5000);
});

test('editing global frame defaults cannot copy a frontal face override into all other faces', () => {
  const p = project(), f = p.structure.frame;
  f.faces.front = { spacingX: 200, inset: 40, groups: { externalHorizontal: { profile: { width: 50, sku: 'front-only' }, barLength: 9000, pricePerM: 42 } } };
  const global = frameEditorValues(f, 'all', 'externalHorizontal');
  assert.equal(global.group.profile.width, 30); assert.equal(global.group.profile.sku, ''); assert.equal(global.group.barLength, 6000); assert.equal(global.group.pricePerM, null); assert.equal(global.geometry.spacingX, 100000); assert.equal(global.geometry.inset, 0);
  // This is the full profile object the editor writes when changing one field.
  f.groups.externalHorizontal.profile = { ...global.group.profile, wall: 1.2 };
  const front = frameEditorValues(f, 'front', 'externalHorizontal'), left = frameEditorValues(f, 'left', 'externalHorizontal');
  assert.equal(front.group.profile.width, 50); assert.equal(front.group.profile.wall, 1.2); assert.equal(front.group.barLength, 9000); assert.equal(front.group.pricePerM, 42); assert.equal(front.geometry.spacingX, 200); assert.equal(front.geometry.inset, 40);
  assert.equal(left.group.profile.width, 30); assert.equal(left.group.profile.sku, ''); assert.equal(left.group.barLength, 6000); assert.equal(left.group.pricePerM, null); assert.equal(left.geometry.spacingX, 100000); assert.equal(left.geometry.inset, 0);
});
test('frame metal contact plane uses the effective tape product thickness', () => {
  const p = project(); p.fixing.tapeProduct = { thickness: 5 };
  const r = valid(p);
  for (const segment of r.structure.segments) near(segment.start[2] + segment.depth / 2, -8);
  assert.ok(r.pieces.every(piece => piece.fixing.thickness === 5));
});
test('a face with incompatible ACM and fixing stacks blocks its frame instead of intersecting pieces', () => {
  const p = project(), id = valid(p).pieces[0].id;
  p.overrides[id] = { fixing: { tapeProduct: { thickness: 5 } } };
  const mixedTape = buildProject(p); assert.ok(mixedTape.errors.some(e => e.code === 'FRAME_CONTACT_PLANE')); assert.equal(mixedTape.structure.segments.length, 0);
  p.overrides[id] = { material: { thickness: 4 } };
  assert.ok(buildProject(p).errors.some(e => e.code === 'FRAME_CONTACT_PLANE'));
});
test('equal total contact stack can use different ACM/tape thicknesses; screws do not invent a tape layer', () => {
  const p = project(); p.fixing.tapeProduct = { thickness: 5 }; const id = valid(p).pieces[0].id;
  p.overrides[id] = { material: { thickness: 4 }, fixing: { tapeProduct: { thickness: 4 } } };
  const r = valid(p); for (const s of r.structure.segments) near(s.start[2] + s.depth / 2, -8);
  p.overrides = {}; p.fixing.type = 'screws'; const screws = valid(p); for (const s of screws.structure.segments) near(s.start[2] + s.depth / 2, -3);
});
test('explicit flange drill circles stay inside the blank and clear of the visible face and grooves', () => {
  const inside=(x,y,polygon)=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
  for (const joint of ['butt', 'miter45']) {
    const p = project(); p.structure.frame.joint = joint; p.structure.frame.spacingX = 600; p.structure.frame.spacingY = 600; p.fixing.type = 'screws'; p.fixing.screwProduct = { drillDiameter: 6 };
    const r = valid(p); assert.ok(r.totals.screws > 0);
    for (const piece of r.pieces) for (const hole of piece.fixings.screws) {
      const radius=hole.drillDiameter/2,f=piece.blank.face;
      for(let i=0;i<72;i++){const x=hole.x+radius*Math.cos(i*Math.PI/36),y=hole.y+radius*Math.sin(i*Math.PI/36);assert.ok(inside(x,y,piece.blank.contour));assert.ok(!(x>f.x&&x<f.x+piece.width&&y>f.y&&y<f.y+piece.height));}
      assert.equal(hole.supportId,undefined);
    }
  }
});
test('drill too large for a flange emits a geometric warning and creates no invalid circles', () => {
  const p = project(); p.fixing.type = 'screws'; p.fixing.screwProduct = { drillDiameter: 32 };
  const r = valid(p); assert.equal(r.totals.screws, 0); assert.ok(r.warnings.some(w => w.code === 'FLANGE_HOLE_CLEARANCE'));
  delete p.fixing.screwProduct.drillDiameter; const markers = valid(p); assert.ok(markers.totals.screws > 0); assert.ok(markers.pieces.flatMap(piece => piece.fixings.screws).every(mark => mark.drillDiameter === undefined));
});
