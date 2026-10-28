import { geometrySignature, validatePrintProject } from './model.mjs';
import { GeometryError } from './errors.mjs';
import { binarySTL, boundsOfMesh } from './kernel.mjs';
import { fitsBed } from './engine.mjs';
import { inspectFloat32Mesh } from './mesh-checks.mjs';
export function assertCurrentResult(project, result) {
  if (!result || result.signature !== geometrySignature(project) || !Array.isArray(result.parts) || !result.parts.length) throw new GeometryError('STALE_RESULT', 'Gere novamente: o resultado não corresponde ao projeto atual.');
  return validatePrintProject(project);
}
export function partSTL(project, result, partId) {
  const current = assertCurrentResult(project, result), part = result.parts.find(p => p.id === partId);
  if (!part) throw new GeometryError('PART_NOT_FOUND', 'Peça não encontrada.');
  const bounds = boundsOfMesh(part.mesh);
  if (!fitsBed(bounds.dimensionsMm, current.bed)) throw new GeometryError('BED_LIMIT', 'A peça excede o volume útil configurado, na orientação atual.');
  const mesh = { indices: part.mesh.indices, positions: part.mesh.positions.map((n, i) => n - bounds.min[i % 3]) };
  inspectFloat32Mesh(mesh, part.checks.genus);
  const stl = binarySTL(mesh), view = new DataView(stl), points = [];
  for (let i = 0; i < view.getUint32(80, true); i++) for (let j = 0; j < 9; j++) points.push(view.getFloat32(96 + i * 50 + j * 4, true));
  const actual = boundsOfMesh({ positions: points });
  if (bounds.dimensionsMm.some((n, i) => Math.abs(n - actual.dimensionsMm[i]) > 0.01)) throw new GeometryError('EXPORT_DIMENSION', 'STL excedeu a tolerância dimensional digital de 0,01 mm.');
  return stl;
}
export function frontSVG(project, result, partId) {
  assertCurrentResult(project, result);
  const parts = result.parts.filter(p => p.role === 'front' && (!partId || p.id === partId));
  if (!parts.length) throw new GeometryError('PART_NOT_FOUND', 'Frente não encontrada.');
  const contours = parts.flatMap(p => p.frontContours), all = contours.flat();
  const minX = Math.min(...all.map(p => p[0])), minY = Math.min(...all.map(p => p[1])), maxX = Math.max(...all.map(p => p[0])), maxY = Math.max(...all.map(p => p[1]));
  const w = maxX - minX, h = maxY - minY;
  const d = contours.map(c => `M ${c.map((p, i) => `${i ? 'L ' : ''}${p[0] - minX} ${maxY - p[1]}`).join(' ')} Z`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><title>Frente nominal em mm; sem compensação de corte; ensaio físico pendente</title><path fill="none" stroke="black" stroke-width="0.01" fill-rule="evenodd" d="${d}"/></svg>\n`;
}
export function projectReportJSON(project, result) {
  const current = assertCurrentResult(project, result);
  return JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), project: current, kernel: result.kernel, dimensionsMm: result.dimensionsMm, parts: result.parts.map(({ mesh, frontContours, ...part }) => part), bedFit: result.bedFit, input: result.input, metrics: result.metrics, validation: result.validation, warnings: result.warnings, elapsedMs: result.elapsedMs, exportConventions: { stl: 'mm; cada peça transladada a XYZ mínimo 0; orientação original preservada', front: 'acrílico nominal; STL inspeção; SVG sem compensação de corte' } }, null, 2);
}
