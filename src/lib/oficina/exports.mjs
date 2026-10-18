import { cutSignature } from './signature.mjs';

const EPS = 1e-6;
const GAP = 20;
const MAX_INSTANCES = 1200;
const LAYERS = ['CUT', 'DRILL', 'HOLES', 'ENGRAVE', 'NOTES'];
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9;
const positive = n => finite(n) && n > 0;
const near = (a, b) => Math.abs(a - b) <= EPS;
const number = n => Object.is(n, -0) ? '0' : String(n);
const fail = message => { throw new Error(`Exportação bloqueada: ${message}`); };
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) <= EPS && p.x >= Math.min(a.x, b.x) - EPS
  && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
function intersects(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > EPS && abD < -EPS || abC < -EPS && abD > EPS) && (cdA > EPS && cdB < -EPS || cdA < -EPS && cdB > EPS))
    || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function inside(p, ring) {
  let value = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (onSegment(p, a, b)) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) value = !value;
  }
  return value;
}
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const ringsIntersect = (a, b) => a.some((point, index) => b.some((other, next) => intersects(point, a[(index + 1) % a.length], other, b[(next + 1) % b.length])));
function validateRing(input, id) {
  let contour = input;
  if (!Array.isArray(contour) || contour.length < 3 || contour.length > 2000 || contour.some(p => !finite(p?.x) || !finite(p?.y))) fail(`contorno inválido em ${id}.`);
  if (near(contour[0].x, contour.at(-1).x) && near(contour[0].y, contour.at(-1).y)) contour = contour.slice(0, -1);
  if (contour.length < 3) fail(`contorno degenerado em ${id}.`);
  let area = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if (near(a.x, b.x) && near(a.y, b.y)) fail(`vértice repetido em ${id}.`);
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < contour.length; j++) {
      if (j === i + 1 || i === 0 && j === contour.length - 1) continue;
      if (intersects(a, b, contour[j], contour[(j + 1) % contour.length])) fail(`contorno se cruza em ${id}.`);
    }
  }
  if (Math.abs(area) <= EPS) fail(`contorno sem área em ${id}.`);
  return contour;
}
function validatePiece(piece) {
  if (!piece?.id || !positive(piece.width) || !positive(piece.height) || !positive(piece.thickness)
    || !Number.isSafeInteger(piece.quantity) || piece.quantity < 1 || piece.quantity > MAX_INSTANCES) fail('peça sem identificação, medidas ou quantidade válidas.');
  const contour = validateRing(piece.contour, piece.id);
  const xs = contour.map(p => p.x), ys = contour.map(p => p.y);
  if (!near(Math.min(...xs), 0) || !near(Math.min(...ys), 0) || !near(Math.max(...xs), piece.width) || !near(Math.max(...ys), piece.height)) fail(`contorno e dimensões divergem em ${piece.id}.`);
  if (piece.cutouts != null && (!Array.isArray(piece.cutouts) || piece.cutouts.length > 200)) fail(`vazados inválidos em ${piece.id}.`);
  const cutouts = (piece.cutouts ?? []).map((ring, index) => validateRing(ring, `${piece.id}/vazado-${index + 1}`));
  if (contour.length + cutouts.reduce((total, ring) => total + ring.length, 0) > 8000) fail(`limite de pontos excedido em ${piece.id}.`);
  for (const [index, ring] of cutouts.entries()) {
    if (ring.some(point => !inside(point, contour)) || ringsIntersect(ring, contour)) fail(`vazado fora do contorno ou tocando a borda em ${piece.id}.`);
    if (cutouts.slice(0, index).some(other => ringsIntersect(ring, other) || inside(ring[0], other) || inside(other[0], ring))) fail(`vazados sobrepostos, aninhados ou tocando em ${piece.id}.`);
  }
  const holes = piece.holes ?? [];
  if (!Array.isArray(holes)) fail(`furos inválidos em ${piece.id}.`);
  const ids = new Set();
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    if (!h?.id || ids.has(h.id) || !finite(h.x) || !finite(h.y) || !positive(h.diameter) || !['drill', 'laser'].includes(h.operation)
      || typeof h.through !== 'boolean' || h.depth != null && (!positive(h.depth) || h.depth > piece.thickness + EPS)) fail(`furo inválido em ${piece.id}.`);
    ids.add(h.id);
    if (h.through === false && (!positive(h.depth) || h.depth > piece.thickness + EPS || h.operation === 'laser')) fail(`profundidade inválida em ${piece.id}.`);
    const radius = h.diameter / 2;
    if (!inside(h, contour) || contour.some((a, index) => distanceToSegment(h, a, contour[(index + 1) % contour.length]) < radius - EPS)) fail(`furo fora do contorno em ${piece.id}.`);
    if (holes.slice(0, i).some(other => Math.hypot(other.x - h.x, other.y - h.y) < (other.diameter + h.diameter) / 2 - EPS)) fail(`furos sobrepostos em ${piece.id}.`);
    if (cutouts.some(ring => inside(h, ring) || ring.some((point, index) => distanceToSegment(h, point, ring[(index + 1) % ring.length]) <= radius + EPS))) fail(`furo circular sobrepõe ou toca um vazado em ${piece.id}.`);
  }
  return { ...piece, contour, holes, cutouts };
}
function prepare(project, result, plan) {
  if (!project?.id || !Number.isSafeInteger(project.revision) || project.revision < 0 || project.unit !== 'mm') fail('projeto deve ter identificação, revisão e unidade mm.');
  if (result?.valid !== true || !Array.isArray(result.errors) || result.errors.length || !result.materialId) fail('geometria inválida ou não calculada.');
  if (!result.signature || result.signature !== cutSignature(project, result.materialId)
    || result.revision !== project.revision) fail('geometria desatualizada; recalcule o projeto.');
  if (!Array.isArray(result.pieces) || !result.pieces.length) fail('nenhuma peça para exportar.');
  const flatPieces = result.pieces.filter(piece => piece.kind !== 'bar');
  if (!flatPieces.length) fail('Metalon: emitir plano de barras; sem chapa para corte 2D.');
  const pieces = flatPieces.map(validatePiece);
  if (pieces.reduce((total, piece) => total + piece.quantity, 0) > MAX_INSTANCES) fail('limite de 1200 instâncias excedido.');
  const byId = new Map(pieces.map(piece => [piece.id, piece]));
  if (byId.size !== pieces.length) fail('identificadores de peças duplicados.');
  const items = [], sheets = [];
  let width = 0, height = 0;
  if (plan != null) {
    if (!plan.id || plan.signature !== result.signature || !Number.isSafeInteger(plan.revision)
      || plan.revision < 0 || plan.revision > project.revision) fail('plano desatualizado; gere um novo plano.');
    if (plan.validation?.valid !== true || plan.validation.errors?.length || !Array.isArray(plan.unplaced) || plan.unplaced.length) fail('plano incompleto ou inválido.');
    if (!Array.isArray(plan.sheets) || !plan.sheets.length) fail('plano sem chapas.');
    const instances = new Map((plan.instances ?? []).map(instance => [instance.id, instance]));
    if (instances.size !== (plan.instances ?? []).length) fail('instâncias duplicadas no plano.');
    const seen = new Set(), counts = new Map(), sheetIds = new Set();
    for (const sheet of plan.sheets) {
      const sheetWidth = sheet.width ?? sheet.length;
      if (!sheet.id || sheetIds.has(sheet.id) || !positive(sheetWidth) || !positive(sheet.height) || !Array.isArray(sheet.placements)) fail('chapa inválida no plano.');
      sheetIds.add(sheet.id);
      const offset = width;
      sheets.push({ id: sheet.id, x: offset, y: 0, width: sheetWidth, height: sheet.height });
      const rectangles = [];
      for (const placement of sheet.placements) {
        const instance = instances.get(placement.pieceId) ?? instances.get(placement.id);
        const piece = [instance?.baseId, instance?.typeId, instance?.sourcePieceId, instance?.pieceId, placement.pieceId].map(id => byId.get(id)).find(Boolean);
        const instanceId = instance?.id ?? placement.id;
        if (!piece || !instanceId || seen.has(instanceId)) fail('peça desconhecida ou repetida no plano.');
        seen.add(instanceId);
        const rotated = placement.rotated === true;
        const w = rotated ? piece.height : piece.width, h = rotated ? piece.width : piece.height;
        if (!finite(placement.x) || !finite(placement.y) || !positive(placement.width) || !positive(placement.height)
          || !near(placement.width, w) || !near(placement.height, h) || placement.x < -EPS || placement.y < -EPS
          || placement.x + w > sheetWidth + EPS || placement.y + h > sheet.height + EPS) fail('alocação fora da chapa ou dimensões divergentes.');
        if (rectangles.some(r => placement.x < r.x + r.width - EPS && placement.x + w > r.x + EPS && placement.y < r.y + r.height - EPS && placement.y + h > r.y + EPS)) fail('peças sobrepostas no plano.');
        rectangles.push({ x: placement.x, y: placement.y, width: w, height: h });
        counts.set(piece.id, (counts.get(piece.id) ?? 0) + 1);
        items.push({ piece, instanceId, sheetId: sheet.id, x: offset + placement.x, y: placement.y, rotated, width: w, height: h });
      }
      width += sheetWidth + GAP;
      height = Math.max(height, sheet.height);
    }
    if (pieces.some(piece => counts.get(piece.id) !== piece.quantity)) fail('quantidade de peças do plano diverge do projeto.');
    width -= GAP;
  } else {
    for (const piece of pieces) for (let index = 0; index < piece.quantity; index++) {
      items.push({ piece, instanceId: `${piece.id}#${index + 1}`, sheetId: null, x: width, y: 0, rotated: false, width: piece.width, height: piece.height });
      width += piece.width + GAP;
      height = Math.max(height, piece.height);
    }
    width -= GAP;
  }
  if (!positive(width) || !positive(height) || items.length > MAX_INSTANCES) fail('limites do documento excedidos.');
  const metadata = {
    format: 'oficina-nominal', version: 1, projectId: project.id, projectName: project.name ?? '', revision: project.revision,
    unit: 'mm', origin: 'lower-left', signature: result.signature, materialId: result.materialId, planId: plan?.id ?? null, planSourceRevision: plan?.revision ?? null,
    layout: plan ? 'plan' : 'separated-pieces', compensationApplied: false, layers: LAYERS, sheets,
    pieces: pieces.map(({ id, label, width, height, thickness, quantity, material, face, transform, cutouts, holes }) => ({ id, label, width, height, thickness, quantity, material, face, transform, outerContourCount: 1, cutoutCount: cutouts.length, circularHoleCount: holes.length })),
    instances: items.map(({ piece, instanceId, sheetId, x, y, rotated }) => ({ id: instanceId, pieceId: piece.id, sheetId, x, y, rotated })),
  };
  return { items, sheets, width, height, metadata };
}
const transformPoint = (point, item) => ({ x: item.x + (item.rotated ? item.piece.height - point.y : point.x), y: item.y + (item.rotated ? point.x : point.y) });
const path = points => `${points.map((p, index) => `${index ? 'L' : 'M'}${number(p.x)} ${number(p.y)}`).join(' ')} Z`;
const attrs = item => `data-piece-id="${xml(item.piece.id)}" data-instance-id="${xml(item.instanceId)}" data-quantity="${item.piece.quantity}" data-thickness-mm="${number(item.piece.thickness)}"`;

/** Exports nominal millimetre geometry. Labels and sheet outlines stay on NOTES. */
export function exportWorkshopSVG(project, result, plan) {
  const document = prepare(project, result, plan);
  const { items, sheets, width, height, metadata } = document;
  const cut = items.map((item, index) => `    <path id="cut-${index + 1}" ${attrs(item)} d="${path(item.piece.contour.map(p => transformPoint(p, item)))}"/>`);
  const holes = { DRILL: [], HOLES: [] };
  for (const [index, item] of items.entries()) for (const [holeIndex, hole] of item.piece.holes.entries()) {
    const center = transformPoint(hole, item), layer = hole.operation === 'drill' ? 'DRILL' : 'HOLES';
    holes[layer].push(`    <circle id="hole-${index + 1}-${holeIndex + 1}" ${attrs(item)} data-hole-id="${xml(hole.id)}" data-operation="${hole.operation}" data-through="${hole.through !== false}"${hole.depth != null ? ` data-depth-mm="${number(hole.depth)}"` : ''} cx="${number(center.x)}" cy="${number(center.y)}" r="${number(hole.diameter / 2)}"/>`);
  }
  for (const [index, item] of items.entries()) for (const [cutoutIndex, ring] of item.piece.cutouts.entries()) {
    holes.HOLES.push(`    <path id="cutout-${index + 1}-${cutoutIndex + 1}" ${attrs(item)} data-cutout-index="${cutoutIndex}" data-operation="cutout" data-through="true" d="${path(ring.map(point => transformPoint(point, item)))}"/>`);
  }
  const group = (id, color, content) => `  <g id="${id}" data-layer="${id}" stroke="${color}">\n${content.join('\n')}\n  </g>`;
  const notes = [
    ...sheets.map(sheet => `    <rect data-sheet-id="${xml(sheet.id)}" x="${number(sheet.x)}" y="${number(height - sheet.height)}" width="${number(sheet.width)}" height="${number(sheet.height)}" fill="none" stroke="#888888" stroke-dasharray="3 3"/>`),
    ...items.map(item => `    <text x="${number(item.x + 1)}" y="${number(height - item.y - 1)}" font-size="3">${xml(item.instanceId)} · ${xml(item.piece.label ?? item.piece.id)} · ${number(item.piece.width)} × ${number(item.piece.height)} × ${number(item.piece.thickness)} mm</text>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}mm" height="${number(height)}mm" viewBox="0 0 ${number(width)} ${number(height)}">\n<title>${xml(project.name ?? project.id)} — revisão ${project.revision} — contornos nominais em mm</title>\n<metadata id="oficina-metadata">${xml(JSON.stringify(metadata))}</metadata>\n<g transform="translate(0 ${number(height)}) scale(1 -1)" fill="none" stroke-width="0.1">\n${group('CUT', '#ff0000', cut)}\n${group('DRILL', '#0000ff', holes.DRILL)}\n${group('HOLES', '#00aaaa', holes.HOLES)}\n${group('ENGRAVE', '#cc8800', [])}\n</g>\n<g id="NOTES" data-layer="NOTES" fill="#555555">\n${notes.join('\n')}\n</g>\n</svg>\n`;
}

const dxfText = value => String(value ?? '').replace(/[\r\n\u0000-\u001F]/g, ' ')
  .replace(/[^\x20-\x7E]|\\/g, character => `\\U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

/** ASCII DXF with closed nominal polylines, native circular holes and mm units. */
export function exportWorkshopDXF(project, result, plan) {
  const { items, sheets, width, height, metadata } = prepare(project, result, plan);
  const output = [], pair = (code, value) => output.push(String(code), String(value));
  const entity = (type, layer) => { pair(0, type); pair(100, 'AcDbEntity'); pair(8, layer); };
  const polyline = (points, layer) => {
    entity('LWPOLYLINE', layer); pair(100, 'AcDbPolyline'); pair(90, points.length); pair(70, 1);
    for (const point of points) { pair(10, number(point.x)); pair(20, number(point.y)); }
  };
  const details = (item, hole, cutoutIndex) => {
    pair(1001, 'OFICINA');
    for (const [key, value] of Object.entries({ pieceId: item.piece.id, instanceId: item.instanceId, quantity: item.piece.quantity, thickness: item.piece.thickness,
      ...(hole ? { holeId: hole.id, operation: hole.operation, through: hole.through !== false, depth: hole.depth ?? '' } : {}),
      ...(cutoutIndex != null ? { cutoutIndex, operation: 'cutout', through: true } : {}) })) pair(1000, dxfText(`${key}=${value}`));
  };
  pair(0, 'SECTION'); pair(2, 'HEADER'); pair(9, '$ACADVER'); pair(1, 'AC1015'); pair(9, '$INSUNITS'); pair(70, 4);
  pair(9, '$MEASUREMENT'); pair(70, 1); pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0); pair(30, 0);
  pair(9, '$EXTMAX'); pair(10, number(width)); pair(20, number(height)); pair(30, 0); pair(0, 'ENDSEC');
  const rawMetadata = JSON.stringify(metadata).replace(/[^\x20-\x7E]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const chunks = rawMetadata.match(/.{1,220}/g) ?? [];
  chunks.forEach((chunk, index) => pair(999, `OFICINA_META ${index + 1}/${chunks.length} ${chunk}`));
  pair(0, 'SECTION'); pair(2, 'TABLES'); pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1);
  pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0); pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, LAYERS.length);
  LAYERS.forEach((layer, index) => { pair(0, 'LAYER'); pair(2, layer); pair(70, 0); pair(62, [1, 5, 4, 2, 8][index]); pair(6, 'CONTINUOUS'); });
  pair(0, 'ENDTAB'); pair(0, 'TABLE'); pair(2, 'APPID'); pair(70, 1); pair(0, 'APPID'); pair(2, 'OFICINA'); pair(70, 0); pair(0, 'ENDTAB'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const item of items) {
    polyline(item.piece.contour.map(p => transformPoint(p, item)), 'CUT'); details(item);
    for (const [cutoutIndex, ring] of item.piece.cutouts.entries()) {
      polyline(ring.map(point => transformPoint(point, item)), 'HOLES'); details(item, null, cutoutIndex);
    }
    for (const hole of item.piece.holes) {
      const center = transformPoint(hole, item);
      entity('CIRCLE', hole.operation === 'drill' ? 'DRILL' : 'HOLES'); pair(100, 'AcDbCircle');
      pair(10, number(center.x)); pair(20, number(center.y)); pair(30, 0); pair(40, number(hole.diameter / 2)); details(item, hole);
    }
    entity('TEXT', 'NOTES'); pair(100, 'AcDbText'); pair(10, number(item.x + 1)); pair(20, number(item.y + 1)); pair(30, 0); pair(40, 3);
    pair(1, dxfText(`${item.instanceId} | ${item.piece.label ?? item.piece.id} | ${item.piece.width} x ${item.piece.height} x ${item.piece.thickness} mm`));
  }
  for (const sheet of sheets) polyline([{ x: sheet.x, y: 0 }, { x: sheet.x + sheet.width, y: 0 }, { x: sheet.x + sheet.width, y: sheet.height }, { x: sheet.x, y: sheet.height }], 'NOTES');
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  return `${output.join('\n')}\n`;
}
