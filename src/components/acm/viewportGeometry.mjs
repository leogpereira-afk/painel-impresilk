// View-only transforms. Manufacturing dimensions and contours come from the engine.
export const MM_TO_SCENE = 0.001;
// Keep a tiny Z offset at the poles so OrbitControls retains a stable roll.
export const CAMERA_VIEWS = Object.freeze({
  iso: [1, 0.62, 1.45], backIso: [1, 0.62, -1.45], front: [0, 0, 1], back: [0, 0, -1],
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
  if (Number.isFinite(cutout?.diameter) && cutout.diameter > 0) return Array.from({length:64},(_,i)=>[cutout.x+cutout.diameter/2*Math.cos(i*Math.PI/32),cutout.y+cutout.diameter/2*Math.sin(i*Math.PI/32)]);
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
  const grooves = {};
  for (const groove of blank.grooves) if (groove.edge) (grooves[groove.edge] ??= []).push(groove);
  for (const list of Object.values(grooves)) list.sort((a,b)=>(a.number??1)-(b.number??1));
  const left = blank.face?.x ?? grooves.left?.[0]?.x1 ?? 0;
  const right = blank.face ? left + blank.face.width : grooves.right?.[0]?.x1 ?? blank.width;
  const bottom = blank.face?.y ?? grooves.bottom?.[0]?.y1 ?? 0;
  const top = blank.face ? bottom + blank.face.height : grooves.top?.[0]?.y1 ?? blank.height;
  let center = clipPolygon(blank.contour, 0, left, true);
  center = clipPolygon(center, 0, right, false);
  center = clipPolygon(center, 1, bottom, true);
  center = clipPolygon(center, 1, top, false);
  const panels = [{ edge: 'center', contour: center, pivot: [0, 0], axis: null, direction: 0 }];
  const edges = [['left',0,false,'y',-1],['right',0,true,'y',1],['bottom',1,false,'x',1],['top',1,true,'x',-1]];
  for (const [edge,axis,higher,rotationAxis,sign] of edges) {
    const list=grooves[edge] ?? [];
    for(const [index,g] of list.entries()) {
      const boundary=axis===0?g.x1:g.y1, next=list[index+1], outer=next ? (axis===0?next.x1:next.y1) : higher ? (axis===0?blank.width:blank.height) : 0;
      let contour=clipPolygon(blank.contour,axis,boundary,higher);
      contour=clipPolygon(contour,axis,outer,!higher);
      if(axis===1) { contour=clipPolygon(contour,0,left,true);contour=clipPolygon(contour,0,right,false); }
      const pivot=axis===0?[boundary,0]:[0,boundary];
      if(polygonArea(contour)>0.001) panels.push({edge, index, contour, pivot, axis:rotationAxis, direction:sign*(g.direction==='front'?-1:1), angle:g.angle??90, number:g.number??index+1});
    }
  }
  return panels;
}

/** Independent rigid transforms evaluated from the complete ordered chain, including intermediate hinges. */
export function foldedPanelTransform(piece, panel, progress = 1) {
  if(panel.edge==='center') return {origin:[0,0,0],angle:0,scale:1};
  const profile=piece.blank.profiles?.[panel.edge], vertical=['left','right'].includes(panel.edge), outward=['left','bottom'].includes(panel.edge)?-1:1;
  if(!profile) return {origin:[...panel.pivot,0],angle:panel.direction*(panel.angle??90)*Math.PI/180*progress,scale:1};
  const first=piece.blank.grooves.find(g=>g.edge===panel.edge), origin=vertical?[first.x1,0,0]:[0,first.y1,0];
  let heading=0;
  for(let i=0;i<=panel.index;i++) {
    const op=profile.operations[i];
    heading+=(op.direction==='back'?-1:1)*op.angle*Math.PI/180*progress;
    if(i<panel.index) {
      const length=op.developedLength+(op.length-op.developedLength)*progress;
      origin[vertical?0:1]+=outward*length*Math.cos(heading); origin[2]+=length*Math.sin(heading);
    }
  }
  const op=profile.operations[panel.index];
  return {origin,angle:(vertical?-outward:outward)*heading,scale:1+(op.length/op.developedLength-1)*progress};
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

/** Locate a developed flange hole on its actual folded panel, in piece-local face coordinates. */
export function flangeFixingTransform(piece,hole,progress=1) {
  if(hole.coordinateSpace!=='blank')return {position:[hole.x,hole.y,0],normal:[0,0,1],panel:null};
  const panel=unfoldedPanels(piece).find(p=>p.edge===hole.edge&&p.number===hole.foldNumber);
  if(!panel)return null;
  const t=foldedPanelTransform(piece,panel,progress),vertical=panel.axis==='y',face=piece.blank.face??{x:0,y:0};
  let x=hole.x-panel.pivot[0],y=hole.y-panel.pivot[1];if(vertical)x*=t.scale;else y*=t.scale;
  const c=Math.cos(t.angle),s=Math.sin(t.angle),rotated=vertical?[c*x,y,-s*x]:[x,c*y,s*y];
  return {position:[t.origin[0]+rotated[0]-face.x,t.origin[1]+rotated[1]-face.y,t.origin[2]+rotated[2]],normal:vertical?[s,0,c]:[0,-s,c],panel};
}

/** Section through a real engine flange chain, in mm; no invented attachment hardware. */
export function flangeSection(piece, edge) {
  const panels = unfoldedPanels(piece).filter(panel => panel.edge === edge);
  const vertical = ['left', 'right'].includes(edge);
  const face = piece.blank.face ?? { x: 0, y: 0 };
  const origin = vertical ? face.x + (edge === 'right' ? piece.width : 0) : face.y + (edge === 'top' ? piece.height : 0);
  const outward = ['left', 'bottom'].includes(edge) ? -1 : 1;
  const segments = panels.map(panel => {
    const transform = foldedPanelTransform(piece, panel);
    const axis = vertical ? 0 : 1;
    const values = panel.contour.map(point => point[axis] - panel.pivot[axis]);
    const a = Math.min(...values) * transform.scale, b = Math.max(...values) * transform.scale;
    const point = value => [(transform.origin[axis] + Math.cos(transform.angle) * value - origin) * outward, transform.origin[2] + (vertical ? -1 : 1) * Math.sin(transform.angle) * value];
    const start=point(outward < 0 ? b : a), end=point(outward < 0 ? a : b);
    return { number: panel.number, start, end, length:Math.hypot(end[0]-start[0],end[1]-start[1]), angle: panel.angle, direction: piece.blank.profiles?.[edge]?.operations?.[panel.index]?.direction };
  });
  return { thickness: piece.material.thickness, segments };
}

/** Hollow tube walls only when wall thickness is specified; preserves engine mitres. */
export function structureWallLayers(segment) {
  const { contour, depth, wall } = segment;
  if (!contour?.length || !(wall > 0) || wall * 2 >= Math.min(segment.width, depth)) return null;
  const axis = segment.axis === 'horizontal' ? 1 : 0;
  const low = Math.min(...contour.map(p=>p[axis])), high = Math.max(...contour.map(p=>p[axis]));
  return [
    { contour, depth: wall, z: -depth/2 },
    { contour, depth: wall, z: depth/2-wall },
    { contour: clipPolygon(contour,axis,low+wall,false), depth:depth-2*wall,z:-depth/2+wall },
    { contour: clipPolygon(contour,axis,high-wall,true), depth:depth-2*wall,z:-depth/2+wall },
  ];
}

/** A position without specified diameter is a cross, never a measured circular hole. */
export function fixingMarkerSpec(hole) {
  return Number.isFinite(hole.drillDiameter) && hole.drillDiameter > 0
    ? { kind: 'diameter', radius: hole.drillDiameter / 2 }
    : { kind: 'position', radius: null };
}
