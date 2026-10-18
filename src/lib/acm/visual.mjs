import { createVisual, VISUAL_LIMITS, isSafeRasterDataURL, validateVisual } from '../../../supabase/functions/_shared/acm-visual.mjs';
export { createVisual, VISUAL_LIMITS, isSafeRasterDataURL, validateVisual };
export const faceNames = { front: 'Frente', left: 'Lateral esquerda', right: 'Lateral direita', soffit: 'Forro' };
export const visualOf = project => project.visual || createVisual();
export function faceBounds(pieces, surface) {
  const selected = pieces.filter(piece => piece.surface === surface);
  return { width: Math.max(1, ...selected.map(piece => piece.x + piece.width)), height: Math.max(1, ...selected.map(piece => piece.y + piece.height)) };
}
/** Artwork uses face coordinates from top left; production geometry keeps bottom left. */
export function pieceArtRect(piece, bounds) {
  return { x: piece.x, y: bounds.height - piece.y - piece.height, width: piece.width, height: piece.height };
}
/** Identical face positions map to identical UVs, including points at panel joints. */
export function faceUV(piece, x, y, bounds) {
  return [(piece.x + x) / bounds.width, (piece.y + y) / bounds.height];
}
export function layerApplies(layer, piece) {
  return !layer.hidden && ((layer.target.type === 'surface' && layer.target.id === piece.surface) || (layer.target.type === 'piece' && layer.target.id === piece.id));
}
export function alignLayer(layer, alignment, bounds) {
  const updated = { ...layer };
  if (alignment === 'left') updated.x = 0;
  if (alignment === 'center') updated.x = (bounds.width - layer.width) / 2;
  if (alignment === 'right') updated.x = bounds.width - layer.width;
  if (alignment === 'top') updated.y = 0;
  if (alignment === 'middle') updated.y = (bounds.height - layer.height) / 2;
  if (alignment === 'bottom') updated.y = bounds.height - layer.height;
  return updated;
}
export function resizedLayer(layer, axis, value) {
  const next = { ...layer, [axis]: value };
  if (layer.keepAspect) next[axis === 'width' ? 'height' : 'width'] = value * (axis === 'width' ? layer.height / layer.width : layer.width / layer.height);
  return next;
}
export function availableAssetBytes(visual) { return VISUAL_LIMITS.totalAssetBytes - visual.assets.reduce((sum, asset) => sum + asset.dataUrl.length, 0); }

/** Strict subset: no scripts, style, links, foreign objects, embedded resources or entities. */
export function sanitizeSVGSource(source) {
  if (typeof source !== 'string' || source.length > 2 * 1024 * 1024) throw new Error('SVG excede 2 MiB.');
  let text = source.replace(/^\s*<\?xml[^?]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!/^<svg[\s>]/i.test(text) || /<!|<\?|\b(?:href|src|style|on\w+)\s*=|javascript\s*:|@import|&(?:#|[a-z])/i.test(text)) throw new Error('SVG com conteúdo ativo, entidades, estilo ou links não permitido. Exporte como PNG.');
  const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc']);
  const attrs = new Set(['xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'fx', 'fy', 'clip-path', 'clip-rule', 'mask', 'maskUnits', 'maskContentUnits', 'preserveAspectRatio']);
  for (const match of text.matchAll(/<\/?([\w:-]+)([^<>]*)>/g)) {
    if (!tags.has(match[1])) throw new Error(`Elemento SVG não permitido: ${match[1]}. Exporte como PNG.`);
    const contents = match[2].replace(/\/\s*$/, '');
    let consumed = '';
    for (const attr of contents.matchAll(/\s+([\w:-]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
      consumed += attr[0];
      if (!attrs.has(attr[1])) throw new Error(`Atributo SVG não permitido: ${attr[1]}.`);
      const value = attr[2].slice(1, -1);
      if (attr[1] === 'xmlns' && value !== 'http://www.w3.org/2000/svg') throw new Error('Namespace SVG inválido.');
      if (attr[1] !== 'xmlns' && /(?:https?:|data:|\/\/)/i.test(value)) throw new Error('Recursos externos não são aceitos no SVG.');
      if (/url\s*\(/i.test(value) && !/^url\(#[A-Za-z_][\w.-]*\)$/.test(value)) throw new Error('Use somente referências locais no SVG.');
    }
    if (consumed.trim() !== contents.trim()) throw new Error('Atributos SVG inválidos.');
  }
  return text;
}
export function presentationHTML(project, image) {
  if (typeof image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new Error('Captura PNG inválida.');
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const visual = visualOf(project);
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(project.name)} · Layout R${project.revision}</title><style>body{font:15px system-ui;color:#182a3d;margin:32px}h1{font-size:24px}img{display:block;max-width:100%;max-height:75vh;margin:auto}small{color:#52677b}button{padding:10px 16px}@media print{button{display:none}body{margin:8mm}img{max-height:70vh;break-inside:avoid}@page{size:A4 landscape;margin:12mm}}</style><button onclick="window.print()">Imprimir / Salvar PDF</button><h1>${esc(project.name)}</h1><p>Apresentação visual · revisão ${project.revision} · ${esc(project.id)}</p><img alt="Layout 3D da revisão ${project.revision}" src="${image}"><p><small>Simulação de aparência, iluminação e perspectiva; não serve para medir a obra nem liberar fabricação. ${visual.layers.filter(layer => !layer.hidden).length} camadas visíveis; ${visual.assets.length} imagens incorporadas no projeto desta revisão. Exportação sem recursos externos.</small></p></html>`;
}
