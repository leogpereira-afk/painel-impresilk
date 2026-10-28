import { GeometryError } from './errors.mjs';

export const LIMITS = Object.freeze({ fileBytes: 256 * 1024, textCharacters: 32, contours: 128, vertices: 8000, timeoutMs: 20000 });
export const DEFAULT_PARAMETERS = Object.freeze({ height: 120, depth: 40, wall: 2.4, floor: 2.4, front: 3, support: 1.2, supportHeight: 1.2, clearancePerSide: 0.25 });
export const PRINTER_PROFILES = Object.freeze([
  Object.freeze({ id: 'ender-3-v3', name: 'Creality Ender-3 V3', x: 220, y: 220, z: 250, margin: 5, synthetic: false, referenceUrl: 'https://www.creality.com/products/creality-ender-3-v3' }),
  Object.freeze({ id: 'k1-max', name: 'Creality K1 Max', x: 300, y: 300, z: 300, margin: 5, synthetic: false, referenceUrl: 'https://www.creality.com/products/creality-k1-max-3d-printer' }),
]);
export const PARAMETER_RANGES = Object.freeze({ height: [20, 1000], depth: [10, 200], wall: [0.8, 10], floor: [1, 10], front: [1, 10], support: [0.3, 10], supportHeight: [0.5, 10], clearancePerSide: [0, 2] });
const fail = (message, detail = {}) => { throw new GeometryError('INVALID_PROJECT', message, detail); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} inválido.`);
  return value.trim();
};
function number(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new GeometryError('INVALID_PARAMETER', `${label} deve estar entre ${min} e ${max} mm.`, { field: label, min, max });
  return value;
}
export function createPrintProject(overrides = {}) {
  const base = { id: globalThis.crypto.randomUUID(), name: 'Letra caixa 3D', revision: 1, product: 'impressao-3d', schemaVersion: 1, unit: 'mm', units: 'mm', source: { kind: 'text', text: 'A', font: 'helvetiker' }, parameters: { ...DEFAULT_PARAMETERS }, material: 'not-informed', bed: { ...PRINTER_PROFILES[0] } };
  return validatePrintProject({ ...base, ...overrides, source: { ...base.source, ...(overrides.source || {}) }, parameters: { ...base.parameters, ...(overrides.parameters || {}) }, bed: { ...base.bed, ...(overrides.bed || {}) } });
}
export function validatePrintProject(project) {
  if (!object(project)) fail('Projeto ausente.');
  if (project.product !== 'impressao-3d' || project.schemaVersion !== 1 || project.unit !== 'mm' || project.units !== 'mm') fail('Versão, produto ou unidade do projeto incompatível.');
  if (!Number.isInteger(project.revision) || project.revision < 1 || project.revision > Number.MAX_SAFE_INTEGER) fail('Revisão do projeto inválida.');
  const id = text(project.id, 'Identificador', 80);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) fail('Identificador do projeto inválido.');
  const name = text(project.name, 'Nome do projeto', 100);
  if (!object(project.source)) fail('Origem do desenho inválida.');
  const source = project.source.kind === 'text' ? { kind: 'text', text: project.source.text, font: project.source.font } : { kind: project.source.kind, content: project.source.content, name: project.source.name };
  if (source.kind === 'text') {
    if (typeof source.text !== 'string' || !source.text.trim() || Array.from(source.text).length > LIMITS.textCharacters || /[\u0000-\u001f\u007f]/.test(source.text)) fail('Digite de 1 a 32 caracteres em uma linha.');
    if (!['helvetiker', 'gentilis'].includes(source.font)) fail('Fonte geométrica não suportada.');
  } else if (['svg', 'dxf'].includes(source.kind)) {
    if (typeof source.content !== 'string' || !source.content.trim()) fail('Arquivo vazio.');
    if (new TextEncoder().encode(source.content).byteLength > LIMITS.fileBytes) throw new GeometryError('FILE_LIMIT', 'Arquivo excede o limite de 256 KiB.');
    source.name = text(source.name, 'Nome do arquivo', 180);
  } else fail('Use texto, SVG restrito ou DXF restrito.');
  if (!object(project.parameters)) fail('Parâmetros ausentes.');
  const parameters = Object.fromEntries(Object.entries(PARAMETER_RANGES).map(([key, [min, max]]) => [key, number(project.parameters[key], min, max, key)]));
  if (parameters.clearancePerSide >= parameters.support) throw new GeometryError('INVALID_PARAMETER', 'A folga por lado deve ser menor que a largura do apoio.');
  if (parameters.floor + parameters.front + parameters.supportHeight + 1 >= parameters.depth) throw new GeometryError('INVALID_PARAMETER', 'A profundidade precisa acomodar fundo, frente, apoio e a cavidade.');
  if (!['not-informed', 'PLA', 'PETG', 'ASA', 'ABS', 'other'].includes(project.material)) fail('Material inválido.');
  if (!object(project.bed)) fail('Volume de impressão ausente.');
  const bed = { x: number(project.bed.x, 20, 2000, 'Mesa X'), y: number(project.bed.y, 20, 2000, 'Mesa Y'), z: number(project.bed.z, 10, 2000, 'Mesa Z'), margin: number(project.bed.margin, 0, 50, 'Margem XY'), synthetic: project.bed.synthetic === true };
  if (bed.margin * 2 >= Math.min(bed.x, bed.y)) fail('Margem maior que a área útil da mesa.');
  for (const key of ['id', 'name', 'referenceUrl']) if (project.bed[key] !== undefined) bed[key] = text(project.bed[key], `Perfil ${key}`, key === 'referenceUrl' ? 500 : 100);
  if (bed.referenceUrl && !/^https:\/\//.test(bed.referenceUrl)) fail('Referência do perfil deve usar HTTPS.');
  return { id, name, revision: project.revision, product: 'impressao-3d', schemaVersion: 1, unit: 'mm', units: 'mm', source, parameters, material: project.material, bed };
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
// Full canonical input is deliberately retained: no hash collision can make an old result current.
export function geometrySignature(project) { return JSON.stringify(canonical(validatePrintProject(project))); }
