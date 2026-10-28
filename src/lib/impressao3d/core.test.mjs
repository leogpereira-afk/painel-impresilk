import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrintProject, validatePrintProject, geometrySignature, PRINTER_PROFILES } from './model.mjs';
import { parsePrintSVG, parsePrintDXF } from './input.mjs';
import { generatePrintProject } from './engine.mjs';
import { partSTL, frontSVG, projectReportJSON } from './exports.mjs';
import { createPrintClient } from './client.mjs';
import { inspectFloat32Mesh } from './mesh-checks.mjs';

const rectSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="120mm" viewBox="0 0 100 120"><path d="M 0 0 L 100 0 L 100 120 L 0 120 Z"/></svg>';
const holedSVG = '<svg width="100mm" height="120mm" viewBox="0 0 100 120"><path fill-rule="evenodd" d="M 0 0 L 100 0 L 100 120 L 0 120 Z M 20 30 L 80 30 L 80 90 L 20 90 Z"/></svg>';
function dxf(unit = 4, extra = []) {
  const scale = { 4: 1, 5: 10, 1: 25.4 }[unit] || 1;
  return [[0, 'SECTION'], [2, 'HEADER'], [9, '$INSUNITS'], [70, unit], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'], [0, 'LWPOLYLINE'], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbPolyline'], [90, 4], [70, 1], ...[[0, 0], [100, 0], [100, 120], [0, 120]].flatMap(([x, y]) => [[10, x / scale], [20, y / scale]]), ...extra, [0, 'ENDSEC'], [0, 'EOF']].flat().join('\n');
}
const throwsCode = (fn, code) => assert.throws(fn, error => error.code === code);
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);
const projectFor = (source, parameters = {}) => createPrintProject({ source, parameters });

for (const [text, font, height, pieces, holes] of [['A', 'helvetiker', 120, 2, 1], ['B', 'helvetiker', 120, 2, 2], ['O', 'helvetiker', 120, 2, 1], ['R', 'helvetiker', 120, 2, 1], ['8', 'helvetiker', 120, 2, 2], ['i', 'helvetiker', 120, 4, 0], ['Ç', 'gentilis', 180, 2, 0], ['AÇÃO', 'gentilis', 210, 10, 3]]) {
  test(`corpus ${text}/${font}/${height}: topologia e STL float32`, async () => {
    const p = projectFor({ kind: 'text', text, font }, { height });
    const result = await generatePrintProject(p);
    assert.equal(result.parts.length, pieces);
    assert.equal(result.metrics.reduce((sum, m) => sum + m.expectedHoles, 0), holes);
    assert.ok(Math.abs(result.dimensionsMm[1] - height) < 0.05);
    for (const part of result.parts) {
      assert.equal(part.checks.closed, true);
      const stl = partSTL(p, result, part.id), view = new DataView(stl);
      assert.equal(stl.byteLength, 84 + 50 * view.getUint32(80, true));
      let minZ = Infinity; for (let i = 0; i < view.getUint32(80, true); i++) for (let j = 0; j < 3; j++) minZ = Math.min(minZ, view.getFloat32(104 + i * 50 + j * 12, true));
      assert.equal(minZ, 0);
    }
    assert.equal(result.validation.physicalQualified, false);
    assert.equal(result.validation.externalAudit, false);
    if (text === 'AÇÃO') { assert.equal(result.bedFit.assemblyFits, false); assert.equal(result.bedFit.allFit, true); }
  });
}
for (const [text, height, code] of [['Ç', 120, 'FRONT_SPLIT'], ['AÇÃO', 120, 'SUPPORT_SPLIT'], ['AÇÃO', 180, 'SUPPORT_SPLIT']]) {
  test(`limite preservado ${text}/${height}`, () => rejectsCode(() => generatePrintProject(projectFor({ kind: 'text', text, font: 'gentilis' }, { height })), code));
}
test('SVG/DXF preservam dimensões físicas; unidades equivalentes', async () => {
  for (const source of [{ kind: 'svg', content: rectSVG, name: 'retangulo.svg' }, ...[4, 5, 1].map(unit => ({ kind: 'dxf', content: dxf(unit), name: 'retangulo.dxf' }))]) {
    const p = projectFor(source, { height: 333 }); const result = await generatePrintProject(p);
    assert.deepEqual(result.dimensionsMm, [100, 120, 40]);
    const body = result.parts.find(p => p.role === 'body');
    const expected = 100 * 120 * 2.4 + (100 * 120 - 95.2 * 115.2) * 37.6 + (95.2 * 115.2 - 92.8 * 112.8) * 1.2;
    assert.ok(Math.abs(body.volumeMm3 - expected) < 0.001);
  }
});
test('curva SVG com matriz conserva limite da aproximação', async () => {
  const source = '<svg width="140mm" height="150mm" viewBox="0 0 140 150"><path transform="matrix(0.5 0 0 0.5 10 15)" d="M 0 0 L 160 0 C 190 0 200 10 200 40 L 200 200 C 200 230 190 240 160 240 L 0 240 Z"/></svg>';
  const result = await generatePrintProject(projectFor({ kind: 'svg', content: source, name: 'curva.svg' }));
  assert.deepEqual(result.dimensionsMm, [100, 120, 40]); assert.ok(result.input.maxCurveBoundMm <= 0.025);
});
test('SVG com vazio conserva genus e orientação de frente assimétrica', async () => {
  const p = projectFor({ kind: 'svg', content: holedSVG, name: 'vazio.svg' }); const result = await generatePrintProject(p);
  assert.equal(result.parts[0].checks.genus, 1);
  const svg = frontSVG(p, result); throwsCode(() => parsePrintSVG(svg), 'SVG_STROKE'); assert.match(svg, /fill-rule="evenodd"/); assert.match(svg, /sem compensação de corte/);
  const filled = svg.replace(/\s+stroke(?:-width)?="[^"]*"/g, '').replace('fill="none"', 'fill="black"');
  assert.equal(parsePrintSVG(filled).paths.length, 2);
});
test('nomes, revisão, material, mesa e parâmetros tornam resultado antigo inexporável', async () => {
  const p = createPrintProject(), result = await generatePrintProject(p);
  for (const change of [{ name: 'Outro' }, { revision: 2 }, { material: 'PETG' }, { bed: { ...p.bed, margin: 6 } }, { parameters: { ...p.parameters, wall: 3 } }]) {
    const altered = { ...p, ...change };
    assert.notEqual(geometrySignature(p), geometrySignature(altered));
    throwsCode(() => partSTL(altered, result, 'body-01'), 'STALE_RESULT');
    throwsCode(() => frontSVG(altered, result), 'STALE_RESULT');
    throwsCode(() => projectReportJSON(altered, result), 'STALE_RESULT');
  }
});
test('limite da mesa bloqueia STL e preserva prévia e relatório', async () => {
  const p = createPrintProject({ parameters: { height: 300 } }), result = await generatePrintProject(p);
  assert.equal(result.bedFit.allFit, false); throwsCode(() => partSTL(p, result, 'body-01'), 'BED_LIMIT');
  assert.equal(JSON.parse(projectReportJSON(p, result)).validation.physicalQualified, false);
  assert.deepEqual(PRINTER_PROFILES.map(p => [p.x, p.y, p.z]), [[220, 220, 250], [300, 300, 300]]);
});
for (const extra of [' transform="scale(2)"', ' opacity="0"', ' style="display:none"', ' preserveAspectRatio="none"', ' onload="x()"']) test(`SVG recusa atributo ${extra}`, () => assert.throws(() => parsePrintSVG(rectSVG.replace('<svg ', `<svg${extra} `)), GeometryErrorLike));
function GeometryErrorLike(e) { return typeof e.code === 'string'; }
test('SVG recusa múltiplos paths, fill não paritário e escala de aspecto implícita', () => {
  throwsCode(() => parsePrintSVG(holedSVG.replace('fill-rule="evenodd"', 'fill-rule="nonzero"')), 'SVG_FILL_RULE');
  throwsCode(() => parsePrintSVG(rectSVG.replace('</svg>', '<path d="M 1 1 L 2 1 L 1 2 Z"/></svg>')), 'SVG_UNSUPPORTED');
  throwsCode(() => parsePrintSVG(rectSVG.replace('width="100mm"', 'width="200mm"')), 'SVG_ASPECT_RATIO');
  throwsCode(() => parsePrintSVG(rectSVG.replace('L 100 0', 'L 100 NaN')), 'SVG_COMMAND');
  throwsCode(() => parsePrintSVG(rectSVG.replace('L 100 0', 'L 100')), 'SVG_PATH');
});
test('DXF recusa OCS, bulge, largura, unidade omitida e contagem incorreta', () => {
  throwsCode(() => parsePrintDXF(dxf(4, [[210, 1], [230, 0]])), 'DXF_OCS');
  throwsCode(() => parsePrintDXF(dxf(4, [[42, 1]])), 'DXF_BULGE');
  throwsCode(() => parsePrintDXF(dxf(4, [[43, 2]])), 'DXF_3D');
  throwsCode(() => parsePrintDXF(dxf(0)), 'DXF_UNIT');
  throwsCode(() => parsePrintDXF(dxf().replace('90\n4', '90\n5')), 'DXF_VERTEX_COUNT');
});
test('SVG fora da página é recusado em vez de ignorar recorte implícito', () => rejectsCode(() => generatePrintProject(projectFor({ kind: 'svg', name: 'fora.svg', content: rectSVG.replace('L 100 0', 'L 140 0') })), 'SVG_CLIPPING'));
test('contornos abertos, cruzados e estreitos são recusados', async () => {
  await rejectsCode(() => generatePrintProject(projectFor({ kind: 'svg', name: 'aberto.svg', content: rectSVG.replace(' Z', '') })), 'OPEN_CONTOUR');
  await rejectsCode(() => generatePrintProject(projectFor({ kind: 'svg', name: 'cruzado.svg', content: rectSVG.replace('L 100 0 L 100 120 L 0 120', 'L 100 120 L 0 120 L 100 0') })), 'SELF_INTERSECTION');
  await rejectsCode(() => generatePrintProject(projectFor({ kind: 'svg', name: 'estreito.svg', content: rectSVG.replaceAll('L 100', 'L 4') })), 'NARROW_FEATURE');
});
test('validação dos parâmetros e tamanho antes do WASM', () => {
  for (const change of [{ wall: NaN }, { depth: Infinity }, { clearancePerSide: 1.2 }, { depth: 10, floor: 5, front: 3, supportHeight: 2 }]) throwsCode(() => createPrintProject({ parameters: change }), 'INVALID_PARAMETER');
  throwsCode(() => createPrintProject({ source: { text: 'A'.repeat(33) } }), 'INVALID_PROJECT');
  throwsCode(() => projectFor({ kind: 'svg', content: 'x'.repeat(256 * 1024 + 1), name: 'muito.svg' }), 'FILE_LIMIT');
  assert.equal(validatePrintProject(createPrintProject()).unit, 'mm');
});
test('auditoria float32 recusa malha aberta e face degenerada', () => {
  throwsCode(() => inspectFloat32Mesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }), 'OPEN_MESH');
  throwsCode(() => inspectFloat32Mesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 0, 2] }), 'DEGENERATE_FACE');
});
class FakeWorker { terminate() { this.terminated = true; } postMessage(data) { this.request = data; } answer(extra = {}) { const r = this.request; this.onmessage({ data: { requestId: r.requestId, signature: r.signature, result: { signature: r.signature }, ...extra } }); } }
test('Worker cancela e descarta resposta antiga sem resolver nova solicitação', async () => {
  const workers = [], client = createPrintClient({ workerFactory: () => { const w = new FakeWorker(); workers.push(w); return w; } });
  const first = client.generate(createPrintProject()); const rejected = rejectsCode(() => first, 'CANCELLED');
  const second = client.generate(createPrintProject()); await rejected; assert.equal(workers[0].terminated, true);
  workers[0].answer(); workers[1].answer(); await second; assert.equal(workers[1].terminated, true);
  client.dispose(); await rejectsCode(() => client.generate(createPrintProject()), 'DISPOSED');
});
test('Worker timeout encerra execução e resultado adulterado é recusado', async () => {
  let worker; const client = createPrintClient({ timeoutMs: 5, workerFactory: () => (worker = new FakeWorker()) });
  await rejectsCode(() => client.generate(createPrintProject()), 'GENERATION_TIMEOUT'); assert.equal(worker.terminated, true);
  const pending = client.generate(createPrintProject()); worker.answer({ result: { signature: 'old' } }); await rejectsCode(() => pending, 'STALE_RESULT'); client.dispose();
});
