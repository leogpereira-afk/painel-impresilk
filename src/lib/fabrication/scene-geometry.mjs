// View-only transforms. Manufacturing dimensions and contours come from the engine.
export const MM_TO_SCENE = 0.001;
// Keep a tiny Z offset at the poles so OrbitControls retains a stable roll.
export const CAMERA_VIEWS = Object.freeze({
  iso: [1, 0.62, 1.45], front: [0, 0, 1], back: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.001], bottom: [0, -1, 0.001],
});

export function cameraFrame(min, max, direction, aspect, verticalFov = 35, margin = 1.25) {
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = vector => { const length = Math.hypot(...vector); return vector.map(value => value / length); };
  const forward = normalize(direction);
  let right = cross([0, 1, 0], forward);
  right = Math.hypot(...right) < 1e-7 ? [1, 0, 0] : normalize(right);
  const up = cross(forward, right);
  const center = min.map((value, index) => (value + max[index]) / 2);
  const tangent = Math.tan(verticalFov * Math.PI / 360);
  let distance = 0;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const offset = [x - center[0], y - center[1], z - center[2]];
    distance = Math.max(distance, dot(offset, forward) + Math.max(Math.abs(dot(offset, right)) / (tangent * aspect), Math.abs(dot(offset, up)) / tangent));
  }
  return { distance: Math.max(0.2, distance * margin), center, forward, right, up };
}

/** Export-only visibility transaction; editor selection remains unchanged after capture. */
export function withoutEditorOverlays(scene, capture) {
  const previous = [];
  scene.traverse(object => {
    if (object.userData?.editorOverlay) { previous.push([object, object.visible]); object.visible = false; }
  });
  try { return capture(); }
  finally { for (const [object, visible] of previous) object.visible = visible; }
}

/** Nominal contour walls, including counters. No CAM or bend compensation. */
export function contourWallVertices(contours, depth, scale = MM_TO_SCENE) {
  const vertices = [];
  for (const contour of contours || []) for (const ring of [contour.outer, ...(contour.holes || [])]) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]; const b = ring[(i + 1) % ring.length];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      for (const point of [[...a, 0], [...b, 0], [...b, depth], [...a, 0], [...b, depth], [...a, depth]]) vertices.push(...point.map(value => value * scale));
    }
  }
  return vertices;
}

export function componentPresentation(component, exploded = false) {
  const separation = exploded ? ({ front: 120, back: -120, side: 0 }[component.role] ?? 60) : 0;
  return [(component.x || 0) * MM_TO_SCENE, (component.y || 0) * MM_TO_SCENE, ((component.z || 0) + separation) * MM_TO_SCENE];
}

/** Shared resource ownership: dispose each geometry/material/texture exactly once. */
export function disposeSceneGroup(group) {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  group.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of (Array.isArray(child.material) ? child.material : child.material ? [child.material] : [])) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  group.clear();
}

export function componentAppearance(appearance = {}, component = {}) {
  const role = component.role?.startsWith('layer') ? 'front' : component.role;
  const override = appearance.overrides?.[component.id] || {};
  return { color: override.color || appearance[role] || '#c0c0c0', finish: override.finish || appearance.finish || 'matte' };
}
