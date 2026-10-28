import { GeometryError } from './errors.mjs';
export function inspectFloat32Mesh(mesh, expectedGenus) {
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) || mesh.positions.length % 3 || mesh.indices.length % 3 || !mesh.indices.length) throw new GeometryError('INVALID_MESH', 'Malha ausente ou incompleta.');
  const vertices = [], byPosition = new Map(), remap = [], edges = new Map(), faces = new Set();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = mesh.positions.slice(i, i + 3).map(Math.fround);
    if (!p.every(Number.isFinite)) throw new GeometryError('INVALID_MESH', 'Coordenada de malha inválida.');
    const key = p.join(','); if (!byPosition.has(key)) { byPosition.set(key, vertices.length); vertices.push(p); } remap.push(byPosition.get(key));
  }
  let volume = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const original = mesh.indices.slice(i, i + 3);
    if (original.some(n => !Number.isInteger(n) || n < 0 || n >= remap.length)) throw new GeometryError('INVALID_MESH', 'Índice de triângulo inválido.');
    const ids = original.map(n => remap[n]), [a, b, c] = ids.map(n => vertices[n]);
    const u = b.map((n, j) => n - a[j]), v = c.map((n, j) => n - a[j]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (new Set(ids).size !== 3 || Math.hypot(...normal) <= 1e-12) throw new GeometryError('DEGENERATE_FACE', 'Triângulo colapsado na representação STL.');
    const face = [...ids].sort((x, y) => x - y).join(','); if (faces.has(face)) throw new GeometryError('DUPLICATE_FACE', 'Malha com face duplicada.'); faces.add(face);
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (let j = 0; j < 3; j++) { const start = ids[j], end = ids[(j + 1) % 3], key = `${Math.min(start, end)},${Math.max(start, end)}`; const e = edges.get(key) || { count: 0, winding: 0 }; e.count++; e.winding += start < end ? 1 : -1; edges.set(key, e); }
  }
  if ([...edges.values()].some(e => e.count !== 2 || e.winding !== 0)) throw new GeometryError('OPEN_MESH', 'A malha STL tem borda aberta ou orientação inconsistente.');
  if (!(volume > 0)) throw new GeometryError('INVALID_VOLUME', 'A malha STL não tem volume positivo.');
  const euler = vertices.length - edges.size + faces.size, genus = (2 - euler) / 2;
  if (expectedGenus !== undefined && genus !== expectedGenus) throw new GeometryError('EXPORT_TOPOLOGY', 'A malha STL alterou os vazados esperados.', { genus, expectedGenus });
  return { closed: true, orientation: true, nondegenerate: true, positiveVolume: true, vertices: vertices.length, triangles: faces.size, genus, volumeMm3: volume };
}
