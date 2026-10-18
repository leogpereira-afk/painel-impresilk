import test from 'node:test';
import assert from 'node:assert/strict';
import { exportWorkshopSVG, exportWorkshopDXF } from './exports.mjs';
import { cutSignature } from './signature.mjs';
import { createWorkshop, buildWorkshop, planWorkshop } from './model.mjs';
import { importVectorArtwork } from '../letras/importers.mjs';

function fixture() {
  const project = { id: 'project-synthetic', name: 'Caixa de ensaio', revision: 4, unit: 'mm', components: {}, stock: {}, quantity: 1 };
  const result = {
    valid: true, errors: [], revision: 4, materialId: 'acrilico', signature: cutSignature(project, 'acrilico'),
    pieces: [{
      id: 'front', label: 'Frente', width: 120.375, height: 60.125, thickness: 3, quantity: 2, material: 'acrilico', face: 'front',
      contour: [{ x: 0, y: 0 }, { x: 120.375, y: 0 }, { x: 120.375, y: 60.125 }, { x: 0, y: 60.125 }],
      holes: [{ id: 'drill-a', x: 12.5, y: 15.25, diameter: 4.125, operation: 'drill', through: false, depth: 1.5 },
        { id: 'laser-a', x: 70.25, y: 35.125, diameter: 8.25, operation: 'laser', through: true }],
      transform: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
    }],
  };
  return { project, result };
}
function fixturePlan(result) {
  return { id: 'plan-synthetic', signature: result.signature, revision: result.revision, validation: { valid: true, errors: [] }, unplaced: [],
    instances: [{ id: 'front-1', baseId: 'front' }, { id: 'front-2', baseId: 'front' }],
    sheets: [{ id: 'sheet-1', width: 300, height: 200, placements: [
      { id: 'placement-1', pieceId: 'front-1', x: 10, y: 20, width: 60.125, height: 120.375, rotated: true },
      { id: 'placement-2', pieceId: 'front-2', x: 90, y: 20, width: 120.375, height: 60.125, rotated: false },
    ] }],
  };
}
// Independent group-code reader: resolves layer, entity geometry and metadata from the actual DXF bytes.
function readDXF(source) {
  const lines = source.trimEnd().split('\n');
  assert.equal(lines.length % 2, 0);
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
  let active = false, current = null;
  const entities = [];
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 0 && value === 'SECTION') { active = pairs[i + 1]?.[1] === 'ENTITIES'; continue; }
    if (code === 0 && value === 'ENDSEC') { active = false; continue; }
    if (!active) continue;
    if (code === 0) { current = { type: value, pairs: [] }; entities.push(current); }
    else current?.pairs.push([code, value]);
  }
  for (const entity of entities) {
    const value = code => entity.pairs.find(pair => pair[0] === code)?.[1];
    entity.layer = value(8);
    entity.points = [];
    for (const [code, value] of entity.pairs) {
      if (code === 10) entity.points.push({ x: Number(value) });
      if (code === 20) entity.points.at(-1).y = Number(value);
    }
    entity.radius = Number(value(40));
    entity.closed = value(70) === '1';
    entity.details = Object.fromEntries(entity.pairs.filter(([code]) => code === 1000).map(([, item]) => [item.slice(0, item.indexOf('=')), item.slice(item.indexOf('=') + 1)]));
  }
  const rawMetadata = pairs.filter(([code, value]) => code === 999 && value.startsWith('OFICINA_META ')).map(([, value]) => value.replace(/^OFICINA_META \d+\/\d+ /, '')).join('');
  const unitsIndex = pairs.findIndex(([code, value]) => code === 9 && value === '$INSUNITS');
  return { entities, metadata: JSON.parse(rawMetadata), units: Number(pairs[unitsIndex + 1][1]), layers: pairs.filter(([code, value]) => code === 2 && ['CUT', 'DRILL', 'HOLES', 'ENGRAVE', 'NOTES'].includes(value)).map(([, value]) => value) };
}
const bounds = points => ({ width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) });
const decodeXML = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function readSVG(source) {
  const parsePaths = text => [...text.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/>/g)].map(match => {
    const values = match[1].match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
    return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
  });
  const layerPaths = Object.fromEntries(['CUT', 'HOLES', 'ENGRAVE'].map(layer => [layer, parsePaths(new RegExp(`<g id="${layer}"[^>]*>([\\s\\S]*?)<\\/g>`).exec(source)?.[1] ?? '')]));
  return { paths: parsePaths(source), layerPaths, metadata: JSON.parse(decodeXML(/<metadata[^>]*>([\s\S]*?)<\/metadata>/.exec(source)[1])) };
}

test('DXF reimport preserves nominal dimensions, quantity, IDs and circular operations in mm', () => {
  const { project, result } = fixture();
  const reimport = readDXF(exportWorkshopDXF(project, result));
  const cut = reimport.entities.filter(entity => entity.layer === 'CUT');
  assert.equal(reimport.units, 4);
  assert.deepEqual(reimport.layers, ['CUT', 'DRILL', 'HOLES', 'ENGRAVE', 'NOTES']);
  assert.equal(cut.length, 2);
  assert.deepEqual(cut.map(entity => bounds(entity.points)), [{ width: 120.375, height: 60.125 }, { width: 120.375, height: 60.125 }]);
  assert.ok(cut.every(entity => entity.closed && entity.details.pieceId === 'front' && entity.details.quantity === '2'));
  assert.deepEqual(cut.map(entity => entity.details.instanceId), ['front#1', 'front#2']);
  const drill = reimport.entities.filter(entity => entity.layer === 'DRILL');
  const laser = reimport.entities.filter(entity => entity.layer === 'HOLES');
  assert.equal(drill.length, 2);
  assert.equal(laser.length, 2);
  assert.equal(drill[0].radius * 2, 4.125);
  assert.equal(drill[0].details.depth, '1.5');
  assert.equal(laser[0].radius * 2, 8.25);
  assert.equal(reimport.metadata.compensationApplied, false);
  assert.equal(reimport.metadata.pieces[0].thickness, 3);
  assert.deepEqual(reimport.metadata.pieces[0].transform, result.pieces[0].transform);
  assert.equal(reimport.metadata.projectId, project.id);
});

test('SVG numeric reimport matches DXF dimensions, metadata and separated copies', () => {
  const { project, result } = fixture();
  const source = exportWorkshopSVG(project, result);
  const reimport = readSVG(source), dxf = readDXF(exportWorkshopDXF(project, result));
  assert.deepEqual(reimport.paths, dxf.entities.filter(entity => entity.layer === 'CUT').map(entity => entity.points));
  assert.deepEqual(reimport.metadata, dxf.metadata);
  assert.match(source, /width="260\.75mm" height="60\.125mm"/);
  assert.match(source, /translate\(0 60\.125\) scale\(1 -1\)/);
  assert.match(source, /data-depth-mm="1\.5"/);
  assert.match(source, /id="ENGRAVE"/);
});

test('rotated plan preserves exact profile and transforms hole centers to lower-left coordinates', () => {
  const { project, result } = fixture(), plan = fixturePlan(result);
  const source = readDXF(exportWorkshopDXF(project, result, plan));
  const cuts = source.entities.filter(entity => entity.layer === 'CUT');
  assert.deepEqual(cuts[0].points, [{ x: 70.125, y: 20 }, { x: 70.125, y: 140.375 }, { x: 10, y: 140.375 }, { x: 10, y: 20 }]);
  assert.deepEqual(source.entities.find(entity => entity.layer === 'DRILL').points[0], { x: 54.875, y: 32.5 });
  assert.equal(source.metadata.planId, 'plan-synthetic');
  assert.deepEqual(readSVG(exportWorkshopSVG(project, result, plan)).paths, cuts.map(entity => entity.points));
});

test('multiple sheets remain separate and keep sheet IDs and local offsets', () => {
  const { project, result } = fixture(), plan = fixturePlan(result);
  const second = plan.sheets[0].placements.pop();
  plan.sheets.push({ id: 'sheet-2', width: 400, height: 200, placements: [second] });
  const read = readDXF(exportWorkshopDXF(project, result, plan));
  assert.deepEqual(read.metadata.instances.map(instance => [instance.sheetId, instance.x]), [['sheet-1', 10], ['sheet-2', 410]]);
  assert.equal(read.metadata.sheets[1].x, 320);
});

test('SVG escapes labels, IDs and metadata without adding active elements', () => {
  const { project, result } = fixture();
  project.name = '<script>alert("x")</script> & ensaio';
  result.pieces[0].label = 'Peça "A" <img onerror="x">';
  const source = exportWorkshopSVG(project, result);
  assert.doesNotMatch(source, /<script|<img|<foreignObject/);
  assert.match(source, /&lt;script&gt;/);
  assert.equal(readSVG(source).metadata.projectName, project.name);
});

test('DXF metadata supports unicode and entity labels cannot inject group codes', () => {
  const { project, result } = fixture();
  project.name = 'Revisão com ação';
  result.pieces[0].label = 'Tampa\n0\nLINE\\P';
  const parsed = readDXF(exportWorkshopDXF(project, result));
  assert.equal(parsed.metadata.projectName, project.name);
  assert.equal(parsed.entities.some(entity => entity.type === 'LINE'), false);
});

test('nonrectangular contours preserve every nominal vertex without cutter compensation', () => {
  const { project, result } = fixture();
  result.pieces[0].holes = [];
  result.pieces[0].contour.splice(2, 0, { x: 105.125, y: 20.75 });
  const cut = readDXF(exportWorkshopDXF(project, result)).entities.find(entity => entity.layer === 'CUT');
  assert.deepEqual(cut.points, result.pieces[0].contour);
});

test('rejects invalid or outdated result and plan revisions/signatures', () => {
  const { project, result } = fixture();
  for (const change of [r => { r.valid = false; }, r => { r.errors = ['erro']; }, r => { r.signature = 'old'; }, r => { r.revision--; }]) {
    const invalid = structuredClone(result); change(invalid);
    assert.throws(() => exportWorkshopDXF(project, invalid), /Exportação bloqueada/);
  }
  for (const change of [p => { p.revision++; }, p => { p.signature = 'old'; }, p => { p.unplaced = ['front-2']; }, p => { p.validation.valid = false; }]) {
    const plan = fixturePlan(result); change(plan);
    assert.throws(() => exportWorkshopSVG(project, result, plan), /Exportação bloqueada/);
  }
});

test('rejects incomplete, overlapping, repeated, out-of-bounds and dimensionally wrong placements', () => {
  const { project, result } = fixture();
  for (const change of [
    p => { p.sheets[0].placements.pop(); },
    p => { p.sheets[0].placements[1].x = 11; },
    p => { p.sheets[0].placements[1].pieceId = 'front-1'; },
    p => { p.sheets[0].placements[1].x = 250; },
    p => { p.sheets[0].placements[0].width = 60; },
  ]) {
    const plan = fixturePlan(result); change(plan);
    assert.throws(() => exportWorkshopDXF(project, result, plan), /Exportação bloqueada/);
  }
});

test('rejects NaN, self intersections, inconsistent contour bounds and impossible holes', () => {
  const { project, result } = fixture();
  for (const change of [
    p => { p.width = NaN; },
    p => { [p.contour[1], p.contour[2]] = [p.contour[2], p.contour[1]]; },
    p => { p.width++; },
    p => { p.holes[0].x = 0; },
    p => { p.holes[0].depth = 4; },
    p => { p.holes[0].operation = 'unknown'; },
    p => { p.holes.push({ ...p.holes[0], id: 'overlap' }); },
  ]) {
    const invalid = structuredClone(result); change(invalid.pieces[0]);
    assert.throws(() => exportWorkshopSVG(project, invalid), /Exportação bloqueada/);
  }
});

test('requires millimetres and excludes bar envelopes from 2D sheet cutting', () => {
  const { project, result } = fixture();
  assert.throws(() => exportWorkshopDXF({ ...project, unit: 'cm' }, result), /unidade mm/);
  result.pieces[0].kind = 'bar';
  assert.throws(() => exportWorkshopSVG(project, result), /Metalon: emitir plano de barras/);
});

test('plan accepts base pieceId with placement IDs and instance typeId mappings', () => {
  const { project, result } = fixture(), plan = fixturePlan(result);
  plan.instances = [];
  plan.sheets[0].placements.forEach(placement => { placement.pieceId = 'front'; });
  assert.equal(readDXF(exportWorkshopDXF(project, result, plan)).metadata.instances.length, 2);
  const mapped = fixturePlan(result);
  mapped.instances.forEach(instance => { instance.typeId = instance.baseId; delete instance.baseId; });
  assert.equal(readSVG(exportWorkshopSVG(project, result, mapped)).metadata.instances.length, 2);
});

for (const materialId of ['acrylic', 'mdf']) for (const model of ['flat', 'open-box', 'closed-box', 'removable-lid', 'dividers', 'organizer', 'display']) for (const joint of ['butt', 'finger']) {
  test(`real model exports ${materialId} ${model} ${joint}, separate and planned, preserving every vertex`, () => {
    const project = createWorkshop();
    Object.assign(project.components[materialId], { model, joint });
    const result = buildWorkshop(project, materialId);
    assert.equal(result.valid, true, result.errors.join('; '));
    const plan = planWorkshop(project, result);
    assert.equal(plan.validation.valid, true, plan.validation.errors.join('; '));
    assert.equal(plan.unplaced.length, 0);
    for (const currentPlan of [undefined, plan]) {
      const dxf = readDXF(exportWorkshopDXF(project, result, currentPlan));
      const svg = readSVG(exportWorkshopSVG(project, result, currentPlan));
      const cuts = dxf.entities.filter(entity => entity.layer === 'CUT');
      assert.equal(cuts.length, result.pieces.reduce((total, piece) => total + piece.quantity, 0));
      assert.deepEqual(svg.paths, cuts.map(entity => entity.points));
      for (const cut of cuts) {
        const piece = result.pieces.find(piece => piece.id === cut.details.pieceId);
        const instance = dxf.metadata.instances.find(instance => instance.id === cut.details.instanceId);
        const nominal = piece.contour.at(-1).x === piece.contour[0].x && piece.contour.at(-1).y === piece.contour[0].y ? piece.contour.slice(0, -1) : piece.contour;
        const expected = nominal.map(point => ({ x: instance.x + (instance.rotated ? piece.height - point.y : point.x), y: instance.y + (instance.rotated ? point.x : point.y) }));
        assert.deepEqual(cut.points, expected);
      }
    }
  });
}

test('real metalon exports only galvanized sheet and its holes, preserving valid full-plan identity', () => {
  const project = createWorkshop();
  project.components.metalon.sheet.enabled = true;
  project.components.metalon.holes = [{ id: 'sheet-hole', component: 'sheet', purpose: 'anchor', x: 100, y: 100, diameter: 5, through: true, operation: 'drill' }];
  const result = buildWorkshop(project, 'metalon'), plan = planWorkshop(project, result);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(plan.validation.valid, true, plan.validation.errors.join('; '));
  const parsed = readDXF(exportWorkshopDXF(project, result, plan));
  assert.equal(parsed.entities.filter(entity => entity.layer === 'CUT').length, 1);
  assert.equal(parsed.entities.filter(entity => entity.layer === 'DRILL').length, 1);
  assert.deepEqual(parsed.metadata.pieces.map(piece => piece.id), result.pieces.filter(piece => piece.kind === 'sheet').map(piece => piece.id));
});

test('real cost-only revisions require current geometry result and preserve an unchanged older physical plan', () => {
  const project = createWorkshop();
  const result = buildWorkshop(project, 'acrylic'), plan = planWorkshop(project, result);
  project.costs.machineMinutes = 30;
  project.stock.acrylic.price = 99;
  assert.doesNotThrow(() => exportWorkshopDXF(project, result, plan));
  project.revision++;
  assert.throws(() => exportWorkshopDXF(project, result, plan), /geometria desatualizada/);
  const recalculated = buildWorkshop(project, 'acrylic');
  const reusedDXF = readDXF(exportWorkshopDXF(project, recalculated, plan));
  const reusedSVG = readSVG(exportWorkshopSVG(project, recalculated, plan));
  assert.equal(reusedDXF.metadata.revision, project.revision);
  assert.equal(reusedDXF.metadata.planSourceRevision, plan.revision);
  assert.equal(reusedDXF.metadata.planId, plan.id);
  assert.deepEqual(reusedSVG.metadata, reusedDXF.metadata);
  const refreshedPlan = planWorkshop(project, recalculated);
  assert.doesNotThrow(() => exportWorkshopSVG(project, recalculated, refreshedPlan));
  project.components.acrylic.width++;
  assert.throws(() => exportWorkshopSVG(project, recalculated, refreshedPlan), /geometria desatualizada/);
});

test('synthetic results cannot bypass the 1200-instance export limit', () => {
  const { project, result } = fixture();
  result.pieces[0].quantity = 1201;
  assert.throws(() => exportWorkshopSVG(project, result), /Exportação bloqueada/);
});

test('imported irregular polygon cutouts and native circular holes roundtrip on separate HOLES geometry', () => {
  const { project, result } = fixture();
  const piece = result.pieces[0];
  piece.contour = [{ x: 0, y: 0 }, { x: piece.width, y: 0 }, { x: piece.width, y: piece.height }, { x: 85, y: piece.height }, { x: 85, y: 50 }, { x: 25, y: 50 }, { x: 25, y: piece.height }, { x: 0, y: piece.height }];
  piece.cutouts = [[{ x: 20, y: 10 }, { x: 40, y: 10 }, { x: 38, y: 22 }, { x: 29, y: 30 }, { x: 20, y: 21 }, { x: 20, y: 10 }]];
  for (const plan of [undefined, fixturePlan(result)]) {
    const dxf = readDXF(exportWorkshopDXF(project, result, plan));
    const svg = readSVG(exportWorkshopSVG(project, result, plan));
    const outer = dxf.entities.filter(entity => entity.layer === 'CUT');
    const cutouts = dxf.entities.filter(entity => entity.layer === 'HOLES' && entity.type === 'LWPOLYLINE');
    assert.equal(outer.length, 2);
    assert.equal(cutouts.length, 2);
    assert.deepEqual(svg.layerPaths.CUT, outer.map(entity => entity.points));
    assert.deepEqual(svg.layerPaths.HOLES, cutouts.map(entity => entity.points));
    assert.equal(dxf.entities.filter(entity => entity.type === 'CIRCLE').length, 4);
    assert.ok(cutouts.every(entity => entity.closed && entity.details.pieceId === piece.id && entity.details.cutoutIndex === '0'));
    for (const cutout of cutouts) {
      const instance = dxf.metadata.instances.find(instance => instance.id === cutout.details.instanceId);
      assert.deepEqual(cutout.points, piece.cutouts[0].slice(0, -1).map(point => ({ x: instance.x + (instance.rotated ? piece.height - point.y : point.x), y: instance.y + (instance.rotated ? point.x : point.y) })));
    }
    assert.equal(dxf.metadata.pieces[0].outerContourCount, 1);
    assert.equal(dxf.metadata.pieces[0].cutoutCount, 1);
    assert.equal(dxf.metadata.pieces[0].circularHoleCount, 2);
    assert.deepEqual(svg.metadata, dxf.metadata);
  }
});

test('cutout topology rejects self crossings, outside rings, touching outer edges and overlapping or nested holes', () => {
  const { project, result } = fixture();
  const rectangle = (x, y, width, height) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  for (const cutouts of [
    [[{ x: 20, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }, { x: 40, y: 20 }]],
    [rectangle(-2, 20, 10, 10)],
    [rectangle(0, 20, 10, 10)],
    [rectangle(20, 20, 20, 20), rectangle(35, 25, 20, 10)],
    [rectangle(20, 20, 20, 20), rectangle(40, 20, 20, 20)],
    [rectangle(20, 20, 20, 20), rectangle(25, 25, 5, 5)],
    [rectangle(25, 25, 5, 5), rectangle(20, 20, 20, 20)],
    [rectangle(20, 20, 20, 20), rectangle(20, 20, 20, 20)],
    [[{ x: 20, y: 20 }, { x: Infinity, y: 20 }, { x: 20, y: 40 }]],
  ]) {
    const invalid = structuredClone(result); invalid.pieces[0].holes = []; invalid.pieces[0].cutouts = cutouts;
    assert.throws(() => exportWorkshopSVG(project, invalid), /Exportação bloqueada/);
    assert.throws(() => exportWorkshopDXF(project, invalid), /Exportação bloqueada/);
  }
});

test('circular and polygon holes cannot touch, intersect or contain each other', () => {
  const { project, result } = fixture();
  for (const hole of [
    { x: 30, y: 30, diameter: 4 },
    { x: 30, y: 30, diameter: 40 },
    { x: 18, y: 30, diameter: 4 },
    { x: 19, y: 30, diameter: 4 },
  ]) {
    const invalid = structuredClone(result);
    invalid.pieces[0].cutouts = [[{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }]];
    invalid.pieces[0].holes = [{ id: 'round-hole', through: true, operation: 'laser', ...hole }];
    assert.throws(() => exportWorkshopDXF(project, invalid), /Exportação bloqueada/);
  }
});

test('real SVG import, nesting and export roundtrip preserves polygon and sampled circular cutouts', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M0 0 L100 0 L100 100 L80 100 L80 90 L0 90 Z M10 15 L30 15 L25 35 L10 25 Z M75 55 A10 10 0 1 0 55 55 A10 10 0 1 0 75 55 Z"/></svg>';
  const artwork = importVectorArtwork(source, { fileName: 'synthetic-cutouts.svg' });
  assert.deepEqual(artwork.errors, []);
  assert.equal(artwork.scaleConfirmed, true);
  const project = createWorkshop();
  project.quantity = 2;
  Object.assign(project.components.acrylic, { model: 'imported', artwork });
  const result = buildWorkshop(project, 'acrylic');
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.pieces[0].cutouts.length, 2);
  assert.equal(result.pieces[0].cutouts[0].length, 4);
  assert.ok(result.pieces[0].cutouts[1].length > 20);
  const plan = planWorkshop(project, result);
  assert.equal(plan.validation.valid, true, plan.validation.errors.join('; '));
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.completeSets, 2);
  for (const currentPlan of [undefined, plan]) {
    const dxf = readDXF(exportWorkshopDXF(project, result, currentPlan));
    const svg = readSVG(exportWorkshopSVG(project, result, currentPlan));
    const cuts = dxf.entities.filter(entity => entity.layer === 'CUT');
    const cutouts = dxf.entities.filter(entity => entity.layer === 'HOLES');
    assert.equal(cuts.length, 2);
    assert.equal(cutouts.length, 4);
    assert.deepEqual(svg.layerPaths.CUT, cuts.map(entity => entity.points));
    assert.deepEqual(svg.layerPaths.HOLES, cutouts.map(entity => entity.points));
    for (const entity of [...cuts, ...cutouts]) {
      const piece = result.pieces.find(piece => piece.id === entity.details.pieceId);
      const instance = dxf.metadata.instances.find(instance => instance.id === entity.details.instanceId);
      const ring = entity.layer === 'CUT' ? piece.contour : piece.cutouts[Number(entity.details.cutoutIndex)];
      assert.deepEqual(entity.points, ring.map(point => ({ x: instance.x + (instance.rotated ? piece.height - point.y : point.x), y: instance.y + (instance.rotated ? point.x : point.y) })));
    }
  }
});
