// Display-only helpers. They never modify coordinates used by STL/SVG exports.
export function inspectPreviewParts(parts = []) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const positions = part?.mesh?.positions;
    const indices = part?.mesh?.indices;
    if ((!Array.isArray(positions) && !ArrayBuffer.isView(positions)) || positions.length < 9 || positions.length % 3 ||
        (!Array.isArray(indices) && !ArrayBuffer.isView(indices)) || indices.length < 3 || indices.length % 3) {
      throw new Error(`A peça ${part?.label || part?.id || 'sem identificação'} não tem uma malha de triângulos válida para a prévia.`);
    }
    for (let i = 0; i < positions.length; i += 1) {
      if (!Number.isFinite(positions[i])) throw new Error('A malha contém uma coordenada inválida. Gere o modelo novamente.');
      min[i % 3] = Math.min(min[i % 3], positions[i]);
      max[i % 3] = Math.max(max[i % 3], positions[i]);
    }
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= positions.length / 3) {
        throw new Error('A malha contém um triângulo inválido. Gere o modelo novamente.');
      }
    }
  }
  return parts.length ? { min, max, dimensions: max.map((value, axis) => value - min[axis]) } : null;
}

export function previewOffset(role, exploded, depth = 40) {
  if (!exploded) return 0;
  const gap = Math.max(Number.isFinite(depth) ? depth * 0.8 : 0, 24);
  return role === 'front' ? gap : role === 'back' ? -gap * 0.6 : 0;
}

export function visiblePreviewBounds(parts, hidden = {}, exploded = false, depth = 40) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  for (const part of parts) {
    if (hidden[part.role]) continue;
    const offset = previewOffset(part.role, exploded, depth);
    const positions = part.mesh.positions;
    for (let i = 0; i < positions.length; i += 3) {
      count += 1;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[i + axis] + (axis === 2 ? offset : 0);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  return count ? { min, max } : null;
}
