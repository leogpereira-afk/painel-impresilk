import { pieceRings } from '../oficina/scene.mjs';

export function pieceColor(piece, materialId) {
  return piece.material?.color || piece.color || (materialId === 'mdf' ? '#c1a477' : '#77dce8');
}
export function pieceOpacity(piece) {
  const value = Number(piece.material?.opacity ?? 1);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
export function contourPath(rings) {
  return rings.filter(ring => ring.length >= 3).map(ring => `M${ring.map(point => point.join(' ')).join('L')}Z`).join(' ');
}
export function facePath(piece) {
  return contourPath(pieceRings(piece)) + (piece.holes || []).filter(hole => hole.through !== false && hole.diameter > 0).map(hole => {
    const r = hole.diameter / 2;
    return ` M${hole.x - r} ${hole.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }).join('');
}
export function markingRings(marking) {
  const rings = marking.contours || marking.rings || (marking.contour ? [marking.contour] : []);
  return rings.flatMap(ring => ring.outer ? [ring.outer, ...(ring.holes || [])] : [Array.isArray(ring) ? ring : ring.contour || ring.points || []]).map(ring => ring.map(point => Array.isArray(point) ? point : [point.x, point.y])).filter(ring => ring.length > 1);
}
export function markingsFor(markings, pieceId) {
  return (markings || []).filter(marking => marking.targetPieceId === pieceId && marking.visible !== false);
}
export function localBounds(piece, padding = .12) {
  const width = Math.max(1, Number(piece?.width) || 1), height = Math.max(1, Number(piece?.height) || 1);
  const margin = Math.max(width, height) * padding;
  return { x: -margin, y: -margin, width: width + margin * 2, height: height + margin * 2 };
}

/** Captures the visible SVG drawings at their actual screen positions, including 2D pan/zoom. */
export async function captureFlatView(container) {
  if (!container) return null;
  const rect = container.getBoundingClientRect(), width = Math.round(rect.width), height = Math.round(rect.height);
  if (!width || !height) return null;
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const drawings = [...container.querySelectorAll('svg')].map(svg => {
    const box = svg.getBoundingClientRect(), clone = svg.cloneNode(true);
    clone.setAttribute('x', box.left - rect.left); clone.setAttribute('y', box.top - rect.top);
    clone.setAttribute('width', box.width); clone.setAttribute('height', box.height);
    return new XMLSerializer().serializeToString(clone);
  }).join('');
  const labels = [...container.querySelectorAll('.opv-detail-title strong,.opv-detail-title span,.opv-overview strong,.opv-overview button>span,.opv-detail-tools span')].map(element => {
    const box = element.getBoundingClientRect();
    return `<text x="${box.left - rect.left}" y="${box.top - rect.top + 11}" font-family="Arial,sans-serif" font-size="11" fill="#c5d8eb">${escape(element.textContent)}</text>`;
  }).join('');
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#131c28"/>${drawings}${labels}</svg>`;
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

/** Rodrigues rotation around the physical pin axis; nominal cut geometry stays unchanged. */
export function displayTransform(piece){
 const t=piece.transform,h=piece.hinge;if(!h)return t;
 const a=-h.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),k=h.direction;
 const rotate=v=>{const dot=v.reduce((n,x,i)=>n+x*k[i],0),cross=[k[1]*v[2]-k[2]*v[1],k[2]*v[0]-k[0]*v[2],k[0]*v[1]-k[1]*v[0]];return v.map((x,i)=>x*c+cross[i]*s+k[i]*dot*(1-c));};
 const offset=rotate(t.origin.map((x,i)=>x-h.axis[i]));
 return {origin:offset.map((x,i)=>x+h.axis[i]),u:rotate(t.u),v:rotate(t.v),normal:rotate(t.normal)};
}
