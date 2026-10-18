import { isSafeRasterDataURL } from './acm-visual.mjs';
/** Product details describe a user-registered item; they never certify capacity. All dimensions are mm. */
export const MAX_FIXING_PHOTO_CHARS = 500000;
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const finite = v => typeof v === 'number' && Number.isFinite(v);
const numerical = (v, low, high) => finite(v) && v >= low && v <= high;

/** Bounded raster only. Remote resources and SVG cannot enter fabrication exports. */
export function isSafeFixingPhoto(value) {
  return typeof value === 'string' && value.length <= MAX_FIXING_PHOTO_CHARS && isSafeRasterDataURL(value);
}

export function validateFixingDetails(fixing) {
  const errors = [], add = (code, message) => errors.push({ code, message });
  if (!plain(fixing)) return [{ code: 'FIXING_DETAILS', message: 'Cadastro de fixação inválido.' }];
  const text = (obj, keys, prefix) => { for (const key of keys) if (obj[key] != null && (typeof obj[key] !== 'string' || obj[key].length > 2000)) add('FIXING_TEXT', `${prefix}: ${key} inválido ou muito longo.`); };
  const number = (obj, key, low, high, prefix) => { if (obj[key] != null && !numerical(obj[key], low, high)) add('FIXING_DIMENSION', `${prefix}: ${key} deve estar entre ${low} e ${high} mm.`); };
  if (fixing.pattern != null) {
    const p = fixing.pattern;
    if (!plain(p)) add('FIXING_PATTERN', 'Padrão de fixação inválido.');
    else {
      if(p.surface!=null&&p.surface!=='flange')add('FIXING_PATTERN_SURFACE','Furação automática deve ocorrer somente nas abas.');
      number(p,'flangeOffset',0,500,'Aba');
      if(p.flangeFoldByEdge!=null){if(!plain(p.flangeFoldByEdge))add('FIXING_PATTERN','Seleção de abas inválida.');else for(const [edge,value]of Object.entries(p.flangeFoldByEdge))if(!['left','right','bottom','top'].includes(edge)||!Number.isInteger(value)||value<0||value>4)add('FIXING_PATTERN','Operação de aba deve ser 0 (desativada) ou 1 a 4.');}
      number(p, 'maxPitch', .1, 10000, 'Padrão'); number(p, 'cornerOffset', 0, 500, 'Padrão'); number(p, 'minEdgeDistance', 0, 500, 'Padrão');
      text(p, ['source', 'responsible', 'validatedAt', 'constraints', 'validationNotes'], 'Padrão');
      if (p.validatedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(p.validatedAt) || !Number.isFinite(Date.parse(p.validatedAt)) || new Date(p.validatedAt).toISOString().slice(0, 10) !== p.validatedAt)) add('FIXING_DATE', 'Data de conferência da fixação inválida.');
      if (finite(p.minEdgeDistance) && finite(p.cornerOffset ?? fixing.edgeOffset) && (p.cornerOffset ?? fixing.edgeOffset) < p.minEdgeDistance) add('FIXING_EDGE_CONSTRAINT', 'Afastamento configurado menor que a restrição de borda cadastrada.');
      if (fixing.validated === true && (!p.source?.trim() || !p.responsible?.trim() || !p.validatedAt)) add('FIXING_VALIDATION', 'Registre fonte técnica, responsável e data para marcar a conferência do padrão.');
    }
  }
  for (const key of ['screwProduct', 'tapeProduct']) {
    const p = fixing[key]; if (p == null) continue;
    if (!plain(p)) { add('FIXING_PRODUCT', `${key}: produto inválido.`); continue; }
    text(p, ['code', 'manufacturer', 'name', 'photoSource', 'head', 'material', 'coating', 'washer', 'function', 'preparation', 'surface', 'application', 'notes'], key);
    if (p.photoDataUrl && !isSafeFixingPhoto(p.photoDataUrl)) add('FIXING_PHOTO', 'Foto de produto deve ser PNG ou JPEG incorporado, com até 500 kB de texto.');
    for (const numeric of key === 'screwProduct' ? ['nominalDiameter', 'length', 'drillDiameter'] : ['width', 'thickness', 'rollLength']) number(p, numeric, .01, numeric === 'rollLength' ? 1000000 : 10000, key);
    for (const price of key === 'screwProduct' ? ['unitPrice'] : ['pricePerM', 'rollPrice']) if (p[price] != null && !numerical(p[price], 0, 100000000)) add('FIXING_PRICE', `${key}: preço inválido.`);
    if (p.wastePercent != null && !numerical(p.wastePercent, 0, 100)) add('FIXING_WASTE', 'Perda da fita deve estar entre 0 e 100%.');
  }
  return errors;
}

/** Merge nested details while preserving the longstanding partial per-piece override contract. */
export function resolveFixing(project, piece) {
  const base = project.fixing ?? {}, override = project.overrides?.[piece?.id]?.fixing ?? {};
  const f = { ...base, ...override };
  for (const key of ['pattern', 'screwProduct', 'tapeProduct']) if (base[key] || override[key]) f[key] = { ...base[key], ...override[key] };
  // A legacy face pattern's sign-off cannot approve a new flange distribution.
  if (['screws', 'hybrid'].includes(f.type) && f.pattern?.surface !== 'flange') f.validated = false;
  f.pattern = {...f.pattern,surface:f.pattern?.surface??'flange'};
  if(base.pattern?.flangeFoldByEdge||override.pattern?.flangeFoldByEdge)f.pattern.flangeFoldByEdge={...base.pattern?.flangeFoldByEdge,...override.pattern?.flangeFoldByEdge};
  f.screwPitch = f.pattern?.maxPitch ?? f.screwPitch;
  f.edgeOffset = f.pattern?.cornerOffset ?? f.edgeOffset;
  f.tapeWidth = f.tapeProduct?.width ?? f.tapeWidth;
  f.thickness = f.tapeProduct?.thickness ?? f.thickness;
  f.drillDiameter = f.screwProduct?.drillDiameter ?? f.drillDiameter ?? null;
  return f;
}

/** Counts the actual generated marks and bands, grouped by support and application function. */
export function fixingQuantities(result) {
  const groups = new Map();
  for (const piece of result?.pieces ?? []) for (const kind of ['screws', 'tape']) for (const item of piece.fixings?.[kind] ?? []) {
    const product = piece.fixing?.[kind === 'screws' ? 'screwProduct' : 'tapeProduct'] ?? {};
    const role = item.role || item.function || product.function || 'ACM → estrutura';
    const supportId = item.supportId || 'Apoio não informado', key = `${piece.id}\u0000${supportId}\u0000${role}`;
    if (!groups.has(key)) groups.set(key, { pieceId: piece.id, surface: piece.surface, supportId, role, screws: 0, tapeBands: 0, tapeLength: 0 });
    const group = groups.get(key);
    if (kind === 'screws') group.screws++;
    else { group.tapeBands++; group.tapeLength += Math.hypot(item.x2 - item.x1, item.y2 - item.y1); }
  }
  return [...groups.values()];
}

/** Old face-local saved marks remain readable; new generated flange marks already use blank coordinates. */
export function fixingPointOnBlank(piece,hole) {
  const face=piece.blank.face??{x:0,y:0};
  return {x:hole.x+(hole.coordinateSpace==='blank'?0:face.x),y:hole.y+(hole.coordinateSpace==='blank'?0:face.y)};
}
