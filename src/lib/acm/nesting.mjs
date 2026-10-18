import { LIMITS } from './model.mjs';
const EPS = 1e-7;
const finite = (value, min = 0, max = LIMITS.dimension) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const round = n => Math.round(n * 1e6) / 1e6;
export function materialKey(material = {}) {
  material = material ?? {};
  return JSON.stringify(['manufacturer', 'sku', 'colorId', 'color', 'finish', 'thickness', 'skin', 'core', 'lot', 'directional'].map(key => material[key] ?? null));
}
function polygonNetArea(points) {
  if (!Array.isArray(points) || points.length < 3) return NaN;
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}
function areaOf(piece) {
  const blank = piece.blank;
  if (blank.cutouts != null && !Array.isArray(blank.cutouts) || blank.holes != null && !Array.isArray(blank.holes)) return NaN;
  const outer = Array.isArray(blank.contour) && blank.contour.length >= 3 ? polygonNetArea(blank.contour) : blank.width * blank.height;
  const cutouts = (blank.cutouts ?? []).reduce((sum, cutout) => {
    if (!cutout || typeof cutout !== 'object') return NaN;
    const points = Array.isArray(cutout) ? cutout : cutout.contour ?? cutout.points;
    const area = points ? polygonNetArea(points) : finite(cutout.width) && finite(cutout.height) ? cutout.width * cutout.height : NaN;
    return sum + area;
  }, 0);
  const holes = (blank.holes ?? []).reduce((sum, hole) => {
    if (!hole || typeof hole !== 'object') return NaN;
    const diameter = hole.diameter ?? hole.drillDiameter ?? hole.radius * 2;
    return sum + (finite(diameter, Number.EPSILON) ? Math.PI * (diameter / 2) ** 2 : NaN);
  }, 0);
  return outer - cutouts - holes;
}

function orientations(piece, stock) {
  const { width, height } = piece.blank;
  const out = [{ width, height, rotated: false }];
  if (stock.rotation && !piece.material?.directional && !['wood', 'brushed'].includes(piece.material?.finish) && Math.abs(width - height) > EPS) out.push({ width: height, height: width, rotated: true });
  return out;
}
function stockMaterialMatches(stock, key) { return !stock.material && !stock.materialKey || (stock.materialKey ?? materialKey(stock.material)) === key; }
function createSheet(source, key, material, fabrication, index, regular) {
  const trim = source.trim ?? 0;
  const usefulWidth = Math.min(source.width, fabrication.machineWidth ?? source.width) - 2 * trim;
  const usefulHeight = Math.min(source.length, fabrication.machineLength ?? source.length) - 2 * trim;
  return { id: regular ? `CH${index}` : `RET-${source.id}`, width: source.width, length: source.length, trim, kerf: source.kerf, materialKey: key, material, source: regular ? 'sheet' : 'remnant', sourceId: regular ? null : source.id, placements: [], usedArea: 0, occupiedArea: 0, free: usefulWidth > 0 && usefulHeight > 0 ? [{ x: trim, y: trim, width: usefulWidth, height: usefulHeight }] : [] };
}
function insert(sheet, piece, freeIndex, orientation, splitMode) {
  const free = sheet.free.splice(freeIndex, 1)[0], w = orientation.width, h = orientation.height, kerf = sheet.kerf;
  const rightWidth = free.width - w - kerf, upperHeight = free.height - h - kerf;
  const verticalFirst = splitMode === 'vertical' || splitMode === 'shorter' && rightWidth < upperHeight || splitMode === 'longer' && rightWidth >= upperHeight;
  if (verticalFirst) {
    if (rightWidth > EPS) sheet.free.push({ x: free.x + w + kerf, y: free.y, width: rightWidth, height: free.height });
    if (upperHeight > EPS) sheet.free.push({ x: free.x, y: free.y + h + kerf, width: w, height: upperHeight });
  } else {
    if (rightWidth > EPS) sheet.free.push({ x: free.x + w + kerf, y: free.y, width: rightWidth, height: h });
    if (upperHeight > EPS) sheet.free.push({ x: free.x, y: free.y + h + kerf, width: free.width, height: upperHeight });
  }
  sheet.placements.push({ pieceId: piece.id, x: free.x, y: free.y, width: w, height: h, rotated: orientation.rotated });
  sheet.usedArea += areaOf(piece); sheet.occupiedArea += w * h;
}
function locate(sheets, piece, stock, key) {
  let best = null;
  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si]; if (sheet.materialKey !== key) continue;
    for (let fi = 0; fi < sheet.free.length; fi++) for (const orientation of orientations(piece, stock)) {
      const free = sheet.free[fi];
      if (orientation.width > free.width + EPS || orientation.height > free.height + EPS) continue;
      const dw = free.width - orientation.width, dh = free.height - orientation.height;
      const score = [Math.min(dw, dh), free.width * free.height - orientation.width * orientation.height, si, fi, orientation.rotated ? 1 : 0];
      if (!best || compareScore(score, best.score) < 0) best = { si, fi, orientation, score };
    }
  }
  return best;
}
function compareScore(a, b) { for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return a[i] - b[i]; return 0; }
const SORTS = {
  area: p => p.blank.width * p.blank.height,
  side: p => Math.max(p.blank.width, p.blank.height),
  height: p => p.blank.height,
  width: p => p.blank.width,
};
function pack(pieces, stock, fabrication, variant) {
  const sheets = [], unplaced = [], remainingRemnants = [...(stock.remnants ?? [])]; let regularCount = 0;
  const ordered = [...pieces].sort((a, b) => SORTS[variant.sort](b) - SORTS[variant.sort](a) || a.id.localeCompare(b.id));
  for (const piece of ordered) {
    const key = materialKey(piece.material);
    let position = locate(sheets, piece, stock, key);
    if (!position) {
      const candidates = [];
      for (let ri = 0; ri < remainingRemnants.length; ri++) {
        const remnant = remainingRemnants[ri];
        if (!(remnant.material || remnant.materialKey) || !stockMaterialMatches(remnant, key)) continue;
        const candidate = createSheet({ ...remnant, trim: remnant.trim ?? stock.trim, kerf: stock.kerf }, key, piece.material, fabrication, sheets.length + 1, false);
        const fits = locate([candidate], piece, stock, key);
        if (fits) candidates.push({ candidate, ri, fits });
      }
      candidates.sort((a, b) => a.candidate.width * a.candidate.length - b.candidate.width * b.candidate.length || a.ri - b.ri);
      if (candidates.length) {
        const { candidate, ri, fits } = candidates[0]; remainingRemnants.splice(ri, 1); sheets.push(candidate); position = { ...fits, si: sheets.length - 1 };
      }
    }
    if (!position && stockMaterialMatches(stock, key)) {
      const candidate = createSheet(stock, key, piece.material, fabrication, regularCount + 1, true);
      const fits = locate([candidate], piece, stock, key);
      if (fits && (stock.quantity == null || regularCount < stock.quantity)) { regularCount++; sheets.push(candidate); position = { ...fits, si: sheets.length - 1 }; }
      else if (fits) { unplaced.push({ pieceId: piece.id, reason: 'Quantidade de chapas em estoque esgotada.' }); continue; }
    }
    if (!position) { unplaced.push({ pieceId: piece.id, reason: stockMaterialMatches(stock, key) ? 'Envelope não cabe na chapa/área útil da máquina com refilo e sentido do acabamento. Divida explicitamente a peça.' : 'Não há chapa ou retalho compatível com material, cor, espessura e lote.' }); continue; }
    insert(sheets[position.si], piece, position.fi, position.orientation, variant.split);
  }
  const grossArea = sheets.reduce((sum, sheet) => sum + sheet.width * sheet.length, 0), usedArea = sheets.reduce((sum, sheet) => sum + sheet.usedArea, 0), occupiedArea = sheets.reduce((sum, sheet) => sum + sheet.occupiedArea, 0);
  return { sheets: sheets.map(({ free, ...sheet }) => ({ ...sheet, usedArea: round(sheet.usedArea), occupiedArea: round(sheet.occupiedArea), remnants: free.map(r => ({ x: r.x, y: r.y, width: r.width, length: r.height })) })), unplaced, grossArea: round(grossArea), usedArea: round(usedArea), occupiedArea: round(occupiedArea), utilization: grossArea ? usedArea / grossArea * 100 : 0, wasteArea: round(grossArea - usedArea), method: `Envelopes conservadores / guilhotina / ${variant.sort}-${variant.split}`, variant };
}
/** Multiple deterministic guillotine packings; no optimality or CNC-path claim. */
export function nestPieces(pieces, stock, fabrication = {}) {
  const empty = { sheets: [], unplaced: [], grossArea: 0, usedArea: 0, occupiedArea: 0, utilization: 0, wasteArea: 0, method: 'Envelopes conservadores / guilhotina', alternatives: [] };
  const reject = (reason, code = 'NESTING_INPUT') => ({ ...empty, unplaced: Array.isArray(pieces) ? pieces.map((p, i) => ({ pieceId: typeof p?.id === 'string' ? p.id : `invalid-${i}`, reason })) : [], errors: [{ code, message: reason }] });
  if (fabrication?.cutMode === 'saw') return reject('Corte por serra bloqueado: ainda não há sequência de cortes de guilhotina e recortes de canto validada para o equipamento. O encaixe por envelopes não constitui um plano de serra.', 'SAW_UNSUPPORTED');
  if (fabrication?.cutMode != null && fabrication.cutMode !== 'router') return reject('Modo de corte não reconhecido.');
  if (!Array.isArray(pieces) || pieces.length > LIMITS.pieces) return reject(`Limite de ${LIMITS.pieces} peças excedido ou lista inválida.`);
  if (!stock || !finite(stock.width, 0.01) || !finite(stock.length, 0.01) || !finite(stock.trim, 0, 1000) || !finite(stock.kerf, 0, 1000) || typeof stock.rotation !== 'boolean' || stock.trim * 2 >= Math.min(stock.width, stock.length) || stock.quantity != null && (!Number.isInteger(stock.quantity) || stock.quantity < 0 || stock.quantity > LIMITS.stock)) return reject('Dimensões, refilo, corte ou quantidade de estoque inválidos.');
  if (!fabrication || ['machineWidth', 'machineLength'].some(k => fabrication[k] != null && !finite(fabrication[k], 0.01))) return reject('Área útil da máquina inválida.');
  if (stock.remnants != null && (!Array.isArray(stock.remnants) || stock.remnants.length > 100 || stock.remnants.some(r => !r || typeof r.id !== 'string' || !finite(r.width, 0.01) || !finite(r.length, 0.01) || r.trim != null && !finite(r.trim, 0, 1000)))) return reject('Retalhos inválidos.');
  if (new Set((stock.remnants ?? []).map(r => r.id)).size !== (stock.remnants ?? []).length) return reject('Retalhos com IDs repetidos.');
  if (new Set(pieces.map(p => p?.id)).size !== pieces.length) return reject('IDs de peças repetidos.');
  for (const piece of pieces) {
    if (!piece || typeof piece.id !== 'string' || !piece.id || !piece.blank || !finite(piece.blank.width, 0.01) || !finite(piece.blank.height, 0.01)) return reject('Peça sem ID ou desenvolvimento numérico válido.');
    if (piece.material != null && (typeof piece.material !== 'object' || Array.isArray(piece.material))) return reject('Material da peça inválido.');
    if (piece.blank.contour != null && (!Array.isArray(piece.blank.contour) || piece.blank.contour.length < 3 || piece.blank.contour.length > 1000 || piece.blank.contour.some(p => !Array.isArray(p) || p.length !== 2 || !finite(p[0], 0, piece.blank.width + EPS) || !finite(p[1], 0, piece.blank.height + EPS)))) return reject('Contorno de peça inválido ou fora de seu envelope.');
    if (!finite(areaOf(piece), 0.00001, piece.blank.width * piece.blank.height + 1)) return reject('Área desenvolvida inconsistente.');
  }
  const variants = [{ sort: 'area', split: 'shorter' }, { sort: 'side', split: 'longer' }, { sort: 'height', split: 'horizontal' }, { sort: 'width', split: 'vertical' }];
  const attempts = variants.map(variant => pack(pieces, stock, fabrication, variant));
  attempts.sort((a, b) => compareScore([a.unplaced.length, a.sheets.length, a.grossArea, -a.usedArea], [b.unplaced.length, b.sheets.length, b.grossArea, -b.usedArea]));
  const best = attempts[0];
  return { ...best, cutMode: 'router', alternatives: attempts.map(a => ({ method: a.method, sheets: a.sheets.length, unplaced: a.unplaced.length, utilization: a.utilization, grossArea: a.grossArea })), errors: [], warnings: (stock.remnants ?? []).some(r => !r.material && !r.materialKey) ? [{ code: 'REMNANT_MATERIAL', message: 'Retalhos sem identificação de material/lote foram ignorados.' }] : [], utilizationBasis: 'Área real dos contornos desenvolvidos / área bruta das chapas e retalhos consumidos.', executableBasis: 'Envelopes retangulares separados por corte; recortes de canto e fresagem são operações posteriores.' };
}
/** Independent invariant checker, also suitable for external worker results. */
export function validateNesting(result, pieces, stock, fabrication = {}) {
  const errors = [], seen = new Set(), expected = new Map(pieces.map(p => [p.id, p]));
  if (fabrication.cutMode === 'saw' && result.sheets.length) errors.push('Plano por serra sem sequência validada.');
  let gross = 0, used = 0, regularCount = 0;
  const sheetIds = new Set(), remnantIds = new Set();
  for (const sheet of result.sheets) {
    if (sheetIds.has(sheet.id)) errors.push(`Chapa repetida: ${sheet.id}`);
    sheetIds.add(sheet.id);
    let original;
    if (sheet.source === 'remnant') {
      if (remnantIds.has(sheet.sourceId)) errors.push(`Retalho consumido mais de uma vez: ${sheet.sourceId}`);
      remnantIds.add(sheet.sourceId);
      original = (stock.remnants ?? []).find(remnant => remnant.id === sheet.sourceId);
      if (!original) errors.push(`Retalho desconhecido: ${sheet.sourceId}`);
      else if (!(original.material || original.materialKey) || !stockMaterialMatches(original, sheet.materialKey)) errors.push(`Material do retalho incompatível: ${sheet.sourceId}`);
    } else if (sheet.source === 'sheet') {
      regularCount++; original = stock;
      if (!stockMaterialMatches(stock, sheet.materialKey)) errors.push(`Material da chapa incompatível: ${sheet.id}`);
    } else errors.push(`Origem do estoque inválida: ${sheet.id}`);
    if (original && (Math.abs(sheet.width - original.width) > EPS || Math.abs(sheet.length - original.length) > EPS || Math.abs(sheet.trim - (original.trim ?? stock.trim)) > EPS || Math.abs(sheet.kerf - stock.kerf) > EPS)) errors.push(`Dimensões ou margens do estoque alteradas: ${sheet.id}`);

    gross += sheet.width * sheet.length; let sheetUsed = 0;
    for (let i = 0; i < sheet.placements.length; i++) {
      const a = sheet.placements[i], piece = expected.get(a.pieceId), trim = sheet.trim ?? stock.trim;
      if (!piece || seen.has(a.pieceId)) { errors.push(`ID desconhecido ou repetido: ${a.pieceId}`); continue; }
      seen.add(a.pieceId); used += areaOf(piece); sheetUsed += areaOf(piece);
      if ([a.x, a.y, a.width, a.height].some(n => !finite(n, 0))) errors.push(`Coordenada inválida: ${a.pieceId}`);
      if (a.x < trim - EPS || a.y < trim - EPS || a.x + a.width > Math.min(sheet.width, fabrication.machineWidth ?? sheet.width) - trim + EPS || a.y + a.height > Math.min(sheet.length, fabrication.machineLength ?? sheet.length) - trim + EPS) errors.push(`Fora da chapa/máquina: ${a.pieceId}`);
      const width = a.rotated ? piece.blank.height : piece.blank.width, height = a.rotated ? piece.blank.width : piece.blank.height;
      if (Math.abs(a.width - width) > EPS || Math.abs(a.height - height) > EPS) errors.push(`Dimensão alterada: ${a.pieceId}`);
      if (a.rotated && (!stock.rotation || piece.material?.directional || ['wood', 'brushed'].includes(piece.material?.finish))) errors.push(`Rotação proibida: ${a.pieceId}`);
      if (sheet.materialKey !== materialKey(piece.material)) errors.push(`Material incompatível: ${a.pieceId}`);
      for (let j = i + 1; j < sheet.placements.length; j++) {
        const b = sheet.placements[j], k = stock.kerf;
        if (!(a.x + a.width + k <= b.x + EPS || b.x + b.width + k <= a.x + EPS || a.y + a.height + k <= b.y + EPS || b.y + b.height + k <= a.y + EPS)) errors.push(`Sobreposição ou corte insuficiente: ${a.pieceId}/${b.pieceId}`);
      }
    }
    if (Math.abs(sheetUsed - sheet.usedArea) > 0.01) errors.push(`Área divergente: ${sheet.id}`);
  }
  if (stock.quantity != null && regularCount > stock.quantity) errors.push('Quantidade de chapas em estoque excedida.');
  for (const p of result.unplaced) { if (!expected.has(p.pieceId) || seen.has(p.pieceId)) errors.push(`ID não alocado inválido: ${p.pieceId}`); seen.add(p.pieceId); }
  if (seen.size !== expected.size) errors.push('Conservação de peças violada.');
  if (Math.abs(gross - result.grossArea) > 0.01 || Math.abs(used - result.usedArea) > 0.01 || Math.abs(result.grossArea - result.usedArea - result.wasteArea) > 0.01) errors.push('Conservação de área violada.');
  return errors;
}
