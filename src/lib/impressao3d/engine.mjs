import { validatePrintProject, geometrySignature } from './model.mjs';
import { preparePrintContours } from './input.mjs';
import { generateFromContours, KERNEL } from './kernel.mjs';
import { inspectFloat32Mesh } from './mesh-checks.mjs';
export function fitsBed(dimensions, bed) { return dimensions[0] <= bed.x - 2 * bed.margin + 1e-6 && dimensions[1] <= bed.y - 2 * bed.margin + 1e-6 && dimensions[2] <= bed.z + 1e-6; }
export async function generatePrintProject(input) {
  const start = performance.now(), project = validatePrintProject(input), signature = geometrySignature(project);
  const flat = await preparePrintContours(project);
  const generated = await generateFromContours(flat.contours, { ...project.parameters, curveTolerance: 0.025, exportTolerance: 0.0001, synthetic: project.bed.synthetic });
  const parts = generated.parts.map(part => {
    const metric = generated.metrics.find(m => m.component === part.component);
    return { ...part, label: part.role === 'front' ? `Frente nominal ${part.component}` : `Corpo ${part.component}`, checks: inspectFloat32Mesh(part.mesh, metric.expectedHoles) };
  });
  const bedParts = parts.map(part => ({ id: part.id, fits: fitsBed(part.dimensionsMm, project.bed) }));
  const warnings = ['Validação digital do gerador; impressão, encaixe e acabamento precisam de ensaio físico.', 'Frente nominal para acrílico: STL somente para inspeção; SVG sem compensação de corte.', 'Perfil de mesa usa volume nominal e margem XY escolhida; sem arranjo, rotação ou divisão automática.'];
  if (project.material === 'not-informed') warnings.push('Material ainda não informado.');
  if (bedParts.some(p => !p.fits)) warnings.push('Há componentes maiores que a área útil configurada. O STL dessas peças fica bloqueado.');
  return { schemaVersion: 1, signature, project, kernel: KERNEL, parts, metrics: generated.metrics, dimensionsMm: generated.dimensionsMm, bedFit: { allFit: bedParts.every(p => p.fits), assemblyFits: fitsBed(generated.dimensionsMm, project.bed), parts: bedParts }, input: { convention: flat.convention, contours: flat.contours.length, vertices: flat.contours.reduce((sum, c) => sum + c.length, 0), curveToleranceMm: 0.025, maxCurveBoundMm: flat.maxCurveBound }, validation: { kind: 'generator-digital-checks', physicalQualified: false, externalAudit: false }, warnings, elapsedMs: performance.now() - start };
}
