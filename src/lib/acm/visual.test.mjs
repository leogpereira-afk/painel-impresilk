import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, calibrationSignature } from './model.mjs';
import { buildProject } from './engine.mjs';
import { serializeProjectJSON, parseProjectJSON, createProjectStorage } from './storage.mjs';
import { createVisual, validateVisual, VISUAL_LIMITS, isSafeRasterDataURL, faceBounds, pieceArtRect, faceUV, alignLayer, resizedLayer, sanitizeSVGSource, presentationHTML } from './visual.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const asset = (id = 'asset-a', dataUrl = PNG) => ({ id, name: 'Marca', mime: 'image/png', dataUrl, width: 1, height: 1 });
const layer = () => ({ id: 'layer-a', name: 'Arte', type: 'image', target: { type: 'surface', id: 'front' }, assetId: 'asset-a', x: 100, y: 200, width: 1000, height: 200, rotation: 0, opacity: 1, hidden: false, locked: false, keepAspect: true, crop: { x: 0, y: 0, width: 1, height: 1 } });
const configured = () => ({ ...createVisual(), assets: [asset()], layers: [layer()] });
function paddedPNG(size) {
  const original = Buffer.from(PNG.split(',')[1], 'base64');
  const data = Buffer.alloc(size, 65), chunk = Buffer.alloc(size + 12);
  chunk.writeUInt32BE(size); chunk.write('tEXt', 4); data.copy(chunk, 8);
  return 'data:image/png;base64,' + Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]).toString('base64');
}

test('portable visual schema accepts absent legacy section and complete bounded scene', () => {
  assert.deepEqual(validateVisual(undefined), []);
  assert.deepEqual(validateVisual(createVisual()), []);
  assert.deepEqual(validateVisual(configured()), []);
  const visual = configured(); visual.scene.camera = { position: [1, 2, 3], target: [0, 0, 0], fov: 35 };
  visual.savedViews.push({ id: 'view-a', name: 'Vista', camera: visual.scene.camera, lighting: createVisual().scene });
  assert.deepEqual(validateVisual(visual), []);
});

test('raster acceptance validates signatures, geometry, container, base64 and bounded input', () => {
  assert.equal(isSafeRasterDataURL(PNG), true);
  for (const url of ['https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,YWJjZA==', PNG + 'A', PNG.slice(0, -20), 'data:image/png;base64,' + 'A'.repeat(VISUAL_LIMITS.assetBytes)]) assert.equal(isSafeRasterDataURL(url), false, url.slice(0, 60));
  const bytes = Buffer.from(PNG.split(',')[1], 'base64'); bytes.writeUInt32BE(100000, 16);
  assert.equal(isSafeRasterDataURL('data:image/png;base64,' + bytes.toString('base64')), false);
});

test('SVG subset rejects executable and externally resolved content, keeping local gradient references', () => {
  assert.match(sanitizeSVGSource('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>'), /url\(#g\)/);
  const bad = ['<script>alert(1)</script>', '<image href="https://example.com/x.png"/>', '<foreignObject/>', '<rect onclick="alert(1)"/>', '<style>rect{fill:red}</style>', '<rect style="fill:red"/>', '<use href="#x"/>', '<animate attributeName="href"/>', '<rect fill="url(https://example.com/x)"/>', '<rect xmlns:x="x" x:onload="alert(1)"/>', '<rect fill="&#106;avascript:foo"/>', '<rect width=10/>'];
  for (const fragment of bad) assert.throws(() => sanitizeSVGSource(`<svg>${fragment}</svg>`), undefined, fragment);
  assert.throws(() => sanitizeSVGSource('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///x">]><svg/>'));
});

test('face UV and top-left canvas clipping preserve continuous art across unequal panels and rows', () => {
  const pieces = [{ surface: 'front', x: 0, y: 0, width: 900, height: 1000 }, { surface: 'front', x: 910, y: 0, width: 2000, height: 1000 }, { surface: 'front', x: 0, y: 1010, width: 2910, height: 300 }];
  const bounds = faceBounds(pieces, 'front'); assert.deepEqual(bounds, { width: 2910, height: 1310 });
  assert.deepEqual(pieceArtRect(pieces[2], bounds), { x: 0, y: 0, width: 2910, height: 300 });
  const left = faceUV(pieces[0], 900, 500, bounds), right = faceUV(pieces[1], 0, 500, bounds);
  assert.ok(Math.abs((right[0] - left[0]) * bounds.width - 10) < 1e-9);
  assert.equal(left[1], right[1]);
  assert.deepEqual(faceUV(pieces[2], 2910, 300, bounds), [1, 1]);
});

test('aspect preserving resize and alignment operate only on visual coordinates', () => {
  const before = layer(); const resized = resizedLayer(before, 'width', 2000);
  assert.equal(resized.height, 400); assert.equal(before.height, 200);
  assert.deepEqual({ x: alignLayer(before, 'center', { width: 6000 }).x, y: alignLayer(before, 'middle', { height: 1200 }).y }, { x: 2500, y: 500 });
  assert.equal(resizedLayer({ ...before, keepAspect: false }, 'width', 2000).height, 200);
});

test('invalid references, crop, opacity, duplicate ids, camera and limits are rejected', () => {
  const cases = [v => { v.layers[0].assetId = 'missing'; }, v => { v.layers[0].crop.x = 0.5; }, v => { v.layers[0].opacity = 2; }, v => { v.layers.push(layer()); }, v => { v.background.mode = 'photo'; }, v => { v.scene.camera = { position: [0, 0, 0], target: [0, 0, 0], fov: 35 }; }, v => { v.assets[0].width = 200; }, v => { v.layers = Array.from({ length: 81 }, layer); }, v => { v.scene.sun = -1; }];
  for (const mutate of cases) { const visual = configured(); mutate(visual); assert.ok(validateVisual(visual).length); }
  const tooMuch = configured(); tooMuch.assets = Array.from({ length: 5 }, (_, i) => asset(`asset-${i}`, paddedPNG(330000))); tooMuch.layers = [];
  assert.ok(validateVisual(tooMuch).some(error => error.code === 'VISUAL_ASSET_TOTAL'));
});

test('JSON roundtrip carries raster over text limit; oversized strings elsewhere remain rejected', () => {
  const project = createProject(); project.visual = configured(); project.visual.assets[0] = asset('asset-a', paddedPNG(30000));
  assert.deepEqual(parseProjectJSON(serializeProjectJSON(project)), project);
  project.name = paddedPNG(30000);
  assert.throws(() => serializeProjectJSON(project), { code: 'SIZE' });
});

test('visual edits leave manufacturing geometry and calibration signature intact', () => {
  const project = createProject(); const before = buildProject(project), signature = calibrationSignature(project);
  project.visual = configured(); project.visual.layers[0].rotation = 90;
  assert.equal(calibrationSignature(project), signature);
  const after = buildProject(project);
  assert.deepEqual(after.pieces, before.pieces); assert.deepEqual(after.totals, before.totals);
});

test('local revisions preserve exact assets and resist subsequent editor mutation', async () => {
  let envelope;
  const storage = createProjectStorage({ backend: { transact: async (_owner, mode, apply) => { const outcome = apply(structuredClone(envelope)); if (mode === 'readwrite') envelope = structuredClone(outcome.envelope); return outcome.result; } }, uuid: () => 'rev-a', now: () => '2026-10-17T00:00:00Z' });
  const project = createProject(); project.visual = configured();
  await storage.saveDraft('test', project, 0); await storage.saveRevision('test', project);
  project.visual.layers[0].x = 999; project.visual.assets[0].name = 'Changed';
  const restored = await storage.restoreRevision('test', 'rev-a');
  assert.equal(restored.visual.layers[0].x, 100); assert.equal(restored.visual.assets[0].name, 'Marca'); assert.equal(restored.visual.assets[0].dataUrl, PNG);
  assert.equal((await storage.loadDraft('test')).project.visual.assets[0].dataUrl, PNG);
});

test('presentation is self-contained and escapes project identity as text', () => {
  const project = createProject(); project.name = '<script>bad()</script>'; project.visual = configured();
  const html = presentationHTML(project, PNG);
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;')); assert.ok(html.includes(PNG)); assert.ok(html.includes('revisão 1'));
  assert.ok(!html.includes('src="https://')); assert.ok(!html.includes('<script>bad()'));
  assert.throws(() => presentationHTML(project, 'https://example.com/a.png'));
});

test('local file import works when CSP permits data images but rejects blob URLs', async () => {
  const original = { Image: globalThis.Image, FileReader: globalThis.FileReader, document: globalThis.document };
  const usedURLs = [];
  class PolicyImage {
    naturalWidth = 1; naturalHeight = 1;
    set src(value) { usedURLs.push(value); queueMicrotask(() => value.startsWith('data:image/') ? this.onload?.() : this.onerror?.()); }
  }
  class LocalFileReader {
    readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onload?.(); }).catch(() => this.onerror?.()); }
  }
  globalThis.Image = PolicyImage; globalThis.FileReader = LocalFileReader;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => PNG }) };
  try {
    const { importVisualAsset } = await import('./visual-browser.mjs');
    const file = new File([Buffer.from(PNG.split(',')[1], 'base64')], 'marca.png', { type: 'image/png' });
    const result = await importVisualAsset(file, 'imported');
    assert.equal(result.dataUrl, PNG); assert.ok(usedURLs.every(value => value.startsWith('data:image/')));
  } finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
