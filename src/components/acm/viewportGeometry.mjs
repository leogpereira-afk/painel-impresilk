// View-only transforms. Manufacturing dimensions and contours come from the engine.
export const MM_TO_SCENE = 0.001;
// Keep a tiny Z offset at the poles so OrbitControls retains a stable roll.
export const CAMERA_VIEWS = Object.freeze({
  iso: [1, 0.62, 1.45], front: [0, 0, 1], back: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.001], bottom: [0, -1, 0.001],
});

export function boundsFrameKey(mode, selectedId, min, max, pieceCount) {
  return `${mode}:${mode === 'unfolded' ? selectedId : ''}:${min.join(',')}:${max.join(',')}:${pieceCount}`;
}

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

export function localToWorld(piece, x, y, z = 0) {
  const { origin, u, v, normal } = piece.transform;
  return origin.map((value, axis) => value + u[axis] * (x + (piece.x || 0)) + v[axis] * (y + (piece.y || 0)) + normal[axis] * z);
}

export function pieceWorldCorners(piece) {
  return [[0, 0], [piece.width, 0], [piece.width, piece.height], [0, piece.height]]
    .map(([x, y]) => localToWorld(piece, x, y));
}

export function cutoutContour(cutout) {
  if (Array.isArray(cutout)) return cutout;
  if (Array.isArray(cutout?.contour)) return cutout.contour;
  if (Number.isFinite(cutout?.width) && Number.isFinite(cutout?.height)) {
    const { x = 0, y = 0, width, height } = cutout;
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  }
  return [];
}

export function clipPolygon(polygon, axis, boundary, keepHigher) {
  if (!polygon.length) return [];
  const inside = (point) => keepHigher ? point[axis] >= boundary - 1e-8 : point[axis] <= boundary + 1e-8;
  const result = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const aInside = inside(a);
    const bInside = inside(b);
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const fraction = (boundary - a[axis]) / (b[axis] - a[axis]);
      result.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
    }
  }
  return result;
}

export function polygonArea(polygon) {
  return Math.abs(polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0)) / 2;
}

export function unfoldedPanels(piece) {
  const { blank } = piece;
  const grooves = Object.fromEntries(blank.grooves.map(groove => [groove.edge, groove]));
  const left = grooves.left?.x1 ?? 0;
  const right = grooves.right?.x1 ?? blank.width;
  const bottom = grooves.bottom?.y1 ?? 0;
  const top = grooves.top?.y1 ?? blank.height;
  let center = clipPolygon(blank.contour, 0, left, true);
  center = clipPolygon(center, 0, right, false);
  center = clipPolygon(center, 1, bottom, true);
  center = clipPolygon(center, 1, top, false);
  const panels = [{ edge: 'center', contour: center, pivot: [0, 0], axis: null, direction: 0 }];
  const edges = [
    ['left', 0, left, false, [left, 0], 'y', -1],
    ['right', 0, right, true, [right, 0], 'y', 1],
    ['bottom', 1, bottom, false, [0, bottom], 'x', 1],
    ['top', 1, top, true, [0, top], 'x', -1],
  ];
  for (const [edge, axis, boundary, higher, pivot, rotationAxis, direction] of edges) {
    if (!grooves[edge]) continue;
    let contour = clipPolygon(blank.contour, axis, boundary, higher);
    // Assign corners to vertical flaps only. This partitions any supported contour
    // without adding material, even when asymmetric reliefs cross a channel.
    if (axis === 1) {
      contour = clipPolygon(contour, 0, left, true);
      contour = clipPolygon(contour, 0, right, false);
    }
    if (polygonArea(contour) > 0.001) panels.push({ edge, contour, pivot, axis: rotationAxis, direction });
  }
  return panels;
}

export function unfoldedPlacement(pieces) {
  const totalArea = pieces.reduce((sum, piece) => sum + piece.blank.width * piece.blank.height, 0);
  const targetWidth = Math.max(...pieces.map(piece => piece.blank.width), Math.sqrt(totalArea * 1.6), 1);
  const gap = Math.max(100, targetWidth * 0.025);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return pieces.map(piece => {
    if (x > 0 && x + piece.blank.width > targetWidth) { x = 0; y += rowHeight + gap; rowHeight = 0; }
    const position = { id: piece.id, x, y };
    x += piece.blank.width + gap;
    rowHeight = Math.max(rowHeight, piece.blank.height);
    return position;
  });
}

/** Exact frame envelope, including mitred ends; derive plane offset from engine start. */
export function structurePrismTransform(segment, surface) {
  const { u, v, normal } = surface.transform;
  const origin = segment.start.map((value, axis) => value - u[axis] * segment.local.x1 - v[axis] * segment.local.y1);
  return { origin, u: [...u], v: [...v], normal: [...normal] };
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
