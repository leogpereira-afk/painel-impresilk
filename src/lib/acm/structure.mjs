import { FRAME_GROUPS, validateStructureFrame } from '../../../supabase/functions/_shared/acm-structure.mjs';
import { resolveFixing } from '../../../supabase/functions/_shared/acm-fixing.mjs';
export { FRAME_GROUPS, validateStructureFrame };
const EPS = 1e-6, LIMIT = 5000;
const round = value => Math.round(value * 1e6) / 1e6;
const issue = (code, message) => ({ code, message });
const point = (t, x, y, z) => t.origin.map((v, i) => round(v + t.u[i] * x + t.v[i] * y + t.normal[i] * z));
export const frameFaceWidth = p => p.orientation === 'depth' ? p.depth : p.width;
export const frameDepth = p => p.orientation === 'depth' ? p.width : p.depth;
const confirmedMetal = p => p.wall > 0 && ['material', 'sku', 'finish'].every(key => typeof p[key] === 'string' && p[key].trim());
export function metalStockKey(p) { return JSON.stringify([p.width, p.depth, p.wall ?? null, p.gauge ?? '', p.material ?? '', p.sku ?? '', p.finish ?? '']); }
export function createStructureFrame(project) {
  const legacy = project?.structure ?? {}, dimensions = /^([\d.]+)x([\d.]+)$/.exec(legacy.profile ?? '30x20');
  const p = legacy.customProfile && legacy.profile === 'custom' ? legacy.customProfile : { id: legacy.profile ?? '30x20', width: Number(dimensions?.[1] ?? 30), depth: Number(dimensions?.[2] ?? 20) };
  const profile = { id: p.id ?? 'custom', width: p.width, depth: p.depth, orientation: 'width', wall: legacy.wall ?? null, gauge: '', material: '', sku: '', finish: '' };
  return { enabled: true, joint: 'butt', continuous: 'horizontal', gap: 0, spacingX: legacy.spacing ?? 600, spacingY: legacy.spacing ?? 600, inset: 0, kerf: legacy.kerf ?? 3, trimStart: 0, trimEnd: 0, groups: Object.fromEntries(FRAME_GROUPS.map(key => [key, { profile: { ...profile }, barLength: legacy.barLength ?? 6000, pricePerM: null }])), faces: {}, overrides: {}, reinforcements: [], remnants: [] };
}
export function resolveFrameGroup(frame, face, group, id, explicit) {
  const base = frame.groups[group], regional = frame.faces?.[face]?.groups?.[group] ?? {}, override = frame.overrides?.[id] ?? {};
  return { ...base, ...regional, ...override, profile: { ...base.profile, ...regional.profile, ...explicit, ...override.profile } };
}
/** Editing the project defaults must not display values inherited from a particular face. */
export function frameEditorValues(frame, scope, group) {
  if (scope === 'all') return { group: frame.groups[group], geometry: frame };
  return { group: resolveFrameGroup(frame, scope, group), geometry: { ...frame, ...frame.faces?.[scope] } };
}
function rectangle(axis, q, lo, hi, width) { return axis === 'horizontal' ? { x: lo, y: q - width / 2, width: hi - lo, height: width } : { x: q - width / 2, y: lo, width, height: hi - lo }; }
const overlaps = (a, b) => a.x < b.x + b.width - EPS && a.x + a.width > b.x + EPS && a.y < b.y + b.height - EPS && a.y + a.height > b.y + EPS;
function subtract(intervals, start, end) { return intervals.flatMap(([a, b]) => end <= a + EPS || start >= b - EPS ? [[a, b]] : [[a, Math.min(b, start)], [Math.max(a, end), b]].filter(([x, y]) => y - x > EPS)); }
function localContour(raw) {
  const { axis, lo, hi, q, faceWidth: w, miterEdge } = raw;
  const points = miterEdge === 'low' ? [[lo, q - w / 2], [hi, q - w / 2], [hi - w, q + w / 2], [lo + w, q + w / 2]] : miterEdge === 'high' ? [[lo + w, q - w / 2], [hi - w, q - w / 2], [hi, q + w / 2], [lo, q + w / 2]] : [[lo, q - w / 2], [hi, q - w / 2], [hi, q + w / 2], [lo, q + w / 2]];
  return points.map(([a, b]) => (axis === 'horizontal' ? [a, b] : [b, a]).map(round));
}
/** Plane frames have actual profile envelopes; no member derives from panel pagination. */
export function buildStructureFrame(project, surfaces, errors, warnings, pieces = []) {
  const f = project.structure.frame, segments = [];
  const invalid = validateStructureFrame(project.structure);
  if (invalid.length) { errors.push(...invalid); return { segments, totalLength: 0, bars: [], unplaced: [], dimensioned: false, frame: true }; }
  if (project.assemblyMode === 'wrap') { errors.push(issue('FRAME_WRAP', 'Encapamento exige detalhe específico: desative o quadro independente para usar o estudo legado.')); return { segments, totalLength: 0, bars: [], unplaced: [], dimensioned: false, frame: true }; }
  for (const surface of surfaces) {
    const face = surface.id, cfg = { ...f, ...f.faces[face] }, gap = f.gap, inset = cfg.inset, W = surface.width, H = surface.height, placed = [];
    const facePieces = pieces.filter(piece => piece.surface === face);
    const contactStacks = (facePieces.length ? facePieces : [{ id: '', material: { ...project.material, ...project.surfaceMaterials?.[face] } }]).map(piece => {
      const fixing = resolveFixing(project, piece), interfaceThickness = ['tape', 'hybrid'].includes(fixing.type) ? fixing.thickness : 0;
      return { id: piece.id, thickness: piece.material.thickness + interfaceThickness };
    });
    const contactOffset = contactStacks[0].thickness;
    if (contactStacks.some(stack => Math.abs(stack.thickness - contactOffset) > EPS)) {
      errors.push(issue('FRAME_CONTACT_PLANE', `${surface.label}: espessuras de ACM e fixação exigem planos de apoio diferentes (${contactStacks.slice(0, 8).map(stack => `${stack.id}: ${round(stack.thickness)} mm`).join('; ')}). Uniformize a composição ou detalhe apoios separados; este quadro não foi gerado.`));
      continue;
    }
    const profileFor = (group, id, explicit) => resolveFrameGroup(f, face, group, id, explicit);
    const make = (id, group, axis, q, lo, hi, priority, explicit) => { const g = profileFor(group, id, explicit); return { id, group, axis, q, lo, hi, priority, ...g, faceWidth: frameFaceWidth(g.profile) }; };
    const external = ['B', 'T', 'L', 'R'].map(side => { const axis = ['B', 'T'].includes(side) ? 'horizontal' : 'vertical'; return make(`${face}-EXT-${side}`, axis === 'horizontal' ? 'externalHorizontal' : 'externalVertical', axis, 0, 0, 0, 100); });
    const [bottom, top, left, right] = external, b = bottom.faceWidth, t = top.faceWidth, l = left.faceWidth, r = right.faceWidth;
    const inner = { x: inset + l, y: inset + b, width: W - 2 * inset - l - r, height: H - 2 * inset - b - t };
    if (inner.width <= 2 * gap || inner.height <= 2 * gap) { errors.push(issue('FRAME_CLEARANCE', `${surface.label}: perfis/folgas eliminam o vão interno.`)); continue; }
    const isMiter = f.joint === 'miter45';
    if (isMiter && external.some(member => Math.abs(member.faceWidth - b) > EPS)) { errors.push(issue('FRAME_MITER_WIDTH', `${surface.label}: cantos a 45° requerem faces de apoio iguais nos quatro perfis; use encontro reto para larguras diferentes.`)); continue; }
    Object.assign(bottom, { q: inset + b / 2, lo: inset, hi: W - inset }); Object.assign(top, { q: H - inset - t / 2, lo: inset, hi: W - inset });
    Object.assign(left, { q: inset + l / 2, lo: inset, hi: H - inset }); Object.assign(right, { q: W - inset - r / 2, lo: inset, hi: H - inset });
    if (isMiter) for (const [i, item] of external.entries()) { item.lo += gap; item.hi -= gap; item.miterEdge = ['low', 'high', 'low', 'high'][i]; }
    else if (f.continuous === 'horizontal') for (const member of [left, right]) { member.lo = inner.y + gap; member.hi = inner.y + inner.height - gap; }
    else for (const member of [bottom, top]) { member.lo = inner.x + gap; member.hi = inner.x + inner.width - gap; }
    placed.push(...external);
    const openings = project.openings.filter(o => (o.surface ?? 'front') === face), rings = [];
    for (const [index, opening] of openings.entries()) {
      const ring = ['B', 'T', 'L', 'R'].map(side => make(`${face}-OP${index + 1}-${side}`, 'reinforcement', ['B', 'T'].includes(side) ? 'horizontal' : 'vertical', 0, 0, 0, 90));
      const [ob, ot, ol, or] = ring, rb = ob.faceWidth, rt = ot.faceWidth, rl = ol.faceWidth, rr = or.faceWidth;
      Object.assign(ob, { q: opening.y - rb / 2, lo: opening.x - rl, hi: opening.x + opening.width + rr });
      Object.assign(ot, { q: opening.y + opening.height + rt / 2, lo: opening.x - rl, hi: opening.x + opening.width + rr });
      Object.assign(ol, { q: opening.x - rl / 2, lo: opening.y + gap, hi: opening.y + opening.height - gap });
      Object.assign(or, { q: opening.x + opening.width + rr / 2, lo: opening.y + gap, hi: opening.y + opening.height - gap });
      if (f.continuous === 'vertical') {
        for (const member of [ol, or]) { member.lo = opening.y - rb; member.hi = opening.y + opening.height + rt; }
        for (const member of [ob, ot]) { member.lo = opening.x + gap; member.hi = opening.x + opening.width - gap; }
      }
      const envelope = { x: opening.x - rl, y: opening.y - rb, width: opening.width + rl + rr, height: opening.height + rb + rt };
      if (envelope.x < inner.x + gap - EPS || envelope.y < inner.y + gap - EPS || envelope.x + envelope.width > inner.x + inner.width - gap + EPS || envelope.y + envelope.height > inner.y + inner.height - gap + EPS || rings.some(other => overlaps(envelope, other))) { errors.push(issue('FRAME_OPENING_CLEARANCE', `${surface.label}: abertura ${index + 1} não comporta seu reforço sem colisão. Afaste a abertura ou detalhe a estrutura explicitamente.`)); continue; }
      rings.push(envelope); placed.push(...ring);
    }
    const candidates = [];
    const nx = Math.ceil(inner.width / cfg.spacingX), ny = Math.ceil(inner.height / cfg.spacingY);
    if (nx + ny + segments.length + placed.length > LIMIT) { errors.push(issue('SEGMENT_LIMIT', 'Limite de 5.000 elementos da estrutura excedido.')); break; }
    for (let i = 1; i < nx; i++) candidates.push(make(`${face}-IV-${i}`, 'internalVertical', 'vertical', inner.x + inner.width * i / nx, inner.y + gap, inner.y + inner.height - gap, f.continuous === 'vertical' ? 60 : 50));
    for (let i = 1; i < ny; i++) candidates.push(make(`${face}-IH-${i}`, 'internalHorizontal', 'horizontal', inner.y + inner.height * i / ny, inner.x + gap, inner.x + inner.width - gap, f.continuous === 'horizontal' ? 60 : 50));
    for (const reinforcement of f.reinforcements.filter(item => item.surface === face)) candidates.push(make(`${face}-R-${reinforcement.id}`, 'reinforcement', reinforcement.axis, reinforcement.position, reinforcement.start, reinforcement.end, 80, reinforcement.profile));
    for (const raw of candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
      const bounds = rectangle(raw.axis, raw.q, raw.lo, raw.hi, raw.faceWidth);
      if (bounds.x < inner.x - EPS || bounds.y < inner.y - EPS || bounds.x + bounds.width > inner.x + inner.width + EPS || bounds.y + bounds.height > inner.y + inner.height + EPS) { errors.push(issue('FRAME_MEMBER_BOUNDS', `${raw.id}: o elemento ultrapassa o vão do quadro.`)); continue; }
      let intervals = [[raw.lo, raw.hi]], parallelCollision = false;
      for (const opening of openings) if (overlaps(bounds, opening)) intervals = subtract(intervals, raw.axis === 'horizontal' ? opening.x : opening.y, raw.axis === 'horizontal' ? opening.x + opening.width : opening.y + opening.height);
      for (const prior of placed) {
        const blocker = rectangle(prior.axis, prior.q, prior.lo, prior.hi, prior.faceWidth);
        if (!overlaps(bounds, blocker)) continue;
        if (raw.axis === prior.axis) { parallelCollision = true; break; }
        intervals = subtract(intervals, (raw.axis === 'horizontal' ? blocker.x : blocker.y) - gap, (raw.axis === 'horizontal' ? blocker.x + blocker.width : blocker.y + blocker.height) + gap);
      }
      if (parallelCollision) { errors.push(issue('FRAME_PARALLEL_COLLISION', `${raw.id}: perfis paralelos se sobrepõem. Ajuste o espaçamento, seção ou reforço.`)); continue; }
      if (placed.length + segments.length + intervals.length > LIMIT) { errors.push(issue('SEGMENT_LIMIT', 'Limite de 5.000 elementos após subdividir encontros. Aumente espaçamento ou simplifique reforços.')); break; }
      for (const [index, [lo, hi]] of intervals.entries()) if (hi - lo > EPS) placed.push({ ...raw, lo, hi, baseId: raw.id, id: intervals.length > 1 ? `${raw.id}-S${index + 1}` : raw.id });
    }
    for (const raw of placed) {
      const longLength = round(raw.hi - raw.lo), shortLength = round(longLength - (raw.miterEdge ? 2 * raw.faceWidth : 0));
      if (shortLength <= EPS) { errors.push(issue('FRAME_MEMBER_LENGTH', `${raw.id}: comprimento insuficiente para o encontro.`)); continue; }
      if (raw.profile.wall != null && 2 * raw.profile.wall >= Math.min(raw.profile.width, raw.profile.depth)) { errors.push(issue('FRAME_WALL', `${raw.id}: parede personalizada elimina o vão interno do tubo.`)); continue; }
      const depth = frameDepth(raw.profile), setback = contactOffset + depth / 2;
      const axisStart = raw.lo + (raw.miterEdge ? raw.faceWidth / 2 : 0), axisEnd = raw.hi - (raw.miterEdge ? raw.faceWidth / 2 : 0);
      const local = raw.axis === 'horizontal' ? { x1: axisStart, y1: raw.q, x2: axisEnd, y2: raw.q } : { x1: raw.q, y1: axisStart, x2: raw.q, y2: axisEnd };
      const p = raw.profile;
      segments.push({ id: raw.id, baseId: raw.baseId ?? raw.id, surface: face, group: raw.group, axis: raw.axis, profile: p.id, profileSpec: { ...p }, width: raw.faceWidth, faceWidth: raw.faceWidth, depth, wall: p.wall, gauge: p.gauge, material: p.material, sku: p.sku, finish: p.finish, stockKey: metalStockKey(p), barLength: raw.barLength, pricePerM: raw.pricePerM, length: longLength, longLength, shortLength, angleA: raw.miterEdge ? 45 : 90, angleB: raw.miterEdge ? 45 : 90, joint: raw.miterEdge ? 'miter45' : 'butt', gap, contactOffset, local, contour: localContour(raw), bounds: Object.fromEntries(Object.entries(rectangle(raw.axis, raw.q, raw.lo, raw.hi, raw.faceWidth)).map(([k, v]) => [k, round(v)])), start: point(surface.transform, local.x1, local.y1, -setback), end: point(surface.transform, local.x2, local.y2, -setback), normal: surface.transform.normal });
      if (segments.length > LIMIT) { errors.push(issue('SEGMENT_LIMIT', 'Limite de 5.000 elementos da estrutura excedido.')); break; }
    }
  }
  const collisions = frameInterferences(segments, surfaces);
  if (collisions.length) errors.push(issue('FRAME_FACE_INTERFERENCE', `${collisions.length} interferência(s) entre quadros de faces distintas: ${collisions.slice(0, 8).map(pair => pair.join(' × ')).join('; ')}. Ajuste recuos/perfis ou detalhe o encontro; nenhuma união foi presumida.`));
  const plan = planMetalBars(segments, f);
  if (f.remnants.some(r => !confirmedMetal(r.profile))) warnings.push(issue('FRAME_REMNANT_IDENTITY', 'Retalhos sem material, SKU, acabamento ou parede confirmados não são consumidos. Complete sua identificação.'));
  if (plan.unplaced.length) errors.push(issue('BAR_LENGTH', `${plan.unplaced.length} elemento(s) não cabem na barra com cortes e refilos. Nenhuma emenda foi criada.`));
  warnings.push(issue('STRUCTURE_UNVERIFIED', 'Comprimentos de oficina calculados com seções, encontros e folgas informados. Cargas, ligações, solda, ancoragem e resistência aguardam avaliação técnica.'));
  if (segments.some(s => s.wall == null)) warnings.push(issue('PROFILE_WALL', 'Há perfil sem parede em mm; bitola nominal não determina espessura, peso ou resistência.'));
  if (segments.some(s => !s.sku || !s.material)) warnings.push(issue('PROFILE_CATALOG', 'Complete material e SKU para confirmar identidade comercial dos perfis.'));
  return { segments, ...plan, totalLength: round(segments.reduce((sum, member) => sum + member.length, 0)), dimensioned: false, frame: true };
}
/** Conservative long-point envelopes. Miter starts get an individual cut; end kerf includes the last cut when there is a remainder. */
export function planMetalBars(segments, frame) {
  const bars = [], unplaced = [], available = frame.remnants.map(r => ({ ...r, stockKey: metalStockKey(r.profile) })), kerf = frame.kerf;
  const allocation = (bar, s) => {
    const before = s.angleA === 45 ? kerf / Math.sin(Math.PI / 4) : 0;
    const start = bar.used + before, end = start + s.length, rest = bar.length - frame.trimEnd - bar.trimKerfEnd - end;
    const after = s.angleB === 45 ? kerf / Math.sin(Math.PI / 4) : rest > EPS ? kerf : 0;
    return rest >= after - EPS ? { start: round(start), end: round(end), kerfBefore: round(before), kerfAfter: round(after), used: round(end + after) } : null;
  };
  const newBar = (length, s, source, remnant) => ({ id: `B${bars.length + 1}`, source, remnantId: remnant?.id, stockKey: s.stockKey, profile: s.profile, profileSpec: s.profileSpec, material: s.material, sku: s.sku, finish: s.finish, wall: s.wall, gauge: s.gauge, pricePerM: source === 'remnant' ? remnant.pricePerM ?? null : s.pricePerM ?? null, length, trimStart: frame.trimStart, trimEnd: frame.trimEnd, trimKerfStart: frame.trimStart > 0 ? kerf : 0, trimKerfEnd: frame.trimEnd > 0 ? kerf : 0, kerf, cuts: [], used: frame.trimStart + (frame.trimStart > 0 ? kerf : 0), waste: length - frame.trimStart - frame.trimEnd - (frame.trimStart > 0 ? kerf : 0) - (frame.trimEnd > 0 ? kerf : 0) });
  for (const s of [...segments].sort((a, b) => b.length - a.length || a.id.localeCompare(b.id))) {
    let bar = bars.filter(b => b.stockKey === s.stockKey && allocation(b, s)).sort((a, b) => a.waste - b.waste)[0];
    if (!bar) {
      const remnant = available.filter(r => confirmedMetal(r.profile) && r.stockKey === s.stockKey && allocation(newBar(r.length, s, 'remnant', r), s)).sort((a, b) => a.length - b.length)[0];
      if (remnant) { bar = newBar(remnant.length, s, 'remnant', remnant); available.splice(available.indexOf(remnant), 1); }
      else { bar = newBar(s.barLength, s, 'commercial'); if (!allocation(bar, s)) { unplaced.push(s.id); continue; } }
      bars.push(bar);
    }
    const cut = allocation(bar, s);
    bar.cuts.push({ id: s.id, sequence: bar.cuts.length + 1, length: s.length, longLength: s.longLength, shortLength: s.shortLength, angleA: s.angleA, angleB: s.angleB, ...cut });
    bar.used = cut.used; bar.waste = round(bar.length - frame.trimEnd - bar.trimKerfEnd - bar.used);
  }
  const purchases = new Map();
  for (const bar of bars.filter(b => b.source === 'commercial')) { const key = JSON.stringify([bar.stockKey, bar.length]); if (!purchases.has(key)) purchases.set(key, { stockKey: bar.stockKey, profile: bar.profile, profileSpec: bar.profileSpec, material: bar.material, sku: bar.sku, finish: bar.finish, wall: bar.wall, length: bar.length, quantity: 0 }); purchases.get(key).quantity++; }
  return { bars, unplaced, purchases: [...purchases.values()], unusedRemnants: available.map(r => r.id) };
}
function axialBoundsAt(s, across) {
  const polygon = s.contour.map(([x, y]) => s.axis === 'horizontal' ? [x, y] : [y, x]), intersections = [];
  for (let i = 0; i < polygon.length; i++) {
    const [u1, v1] = polygon[i], [u2, v2] = polygon[(i + 1) % polygon.length];
    if (Math.abs(v1 - v2) < EPS) { if (Math.abs(across - v1) < EPS) intersections.push(u1, u2); }
    else if (across >= Math.min(v1, v2) - EPS && across <= Math.max(v1, v2) + EPS) intersections.push(u1 + (u2 - u1) * (across - v1) / (v2 - v1));
  }
  return intersections.length ? [Math.min(...intersections), Math.max(...intersections)] : null;
}
/** Intersect a longitudinal line with a convex profile eroded by a circular hole radius. */
function circularBoundsAt(s, across, radius) {
  const polygon = s.contour.map(([x, y]) => s.axis === 'horizontal' ? [x, y] : [y, x]);
  const sign = Math.sign(polygon.reduce((sum, [x, y], i) => { const next = polygon[(i + 1) % polygon.length]; return sum + x * next[1] - next[0] * y; }, 0));
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [u, v] = polygon[i], next = polygon[(i + 1) % polygon.length], du = next[0] - u, dv = next[1] - v;
    const coefficient = -dv * sign, constant = sign * (du * (across - v) + dv * u), required = radius * Math.hypot(du, dv);
    if (Math.abs(coefficient) < EPS) { if (constant < required - EPS) return null; }
    else if (coefficient > 0) lo = Math.max(lo, (required - constant) / coefficient);
    else hi = Math.min(hi, (required - constant) / coefficient);
  }
  return hi >= lo - EPS ? [lo, hi] : null;
}
function lineOnPiece(s, piece, inset, width, circular = false) {
  const b = s.bounds, horizontal = s.axis === 'horizontal', half = width / 2;
  if (s.faceWidth < width - EPS) return null;
  const lowAcross = Math.max((horizontal ? piece.y : piece.x) + inset, (horizontal ? b.y : b.x) + half);
  const highAcross = Math.min((horizontal ? piece.y + piece.height : piece.x + piece.width) - inset, (horizontal ? b.y + b.height : b.x + b.width) - half);
  if (highAcross < lowAcross - EPS) return null;
  const across = Math.max(lowAcross, Math.min(highAcross, horizontal ? s.local.y1 : s.local.x1));
  const bottom = circular ? circularBoundsAt(s, across, half) : axialBoundsAt(s, across - half), top = circular ? bottom : axialBoundsAt(s, across + half);
  if (!bottom || !top) return null;
  const lo = Math.max(bottom[0], top[0], (horizontal ? piece.x : piece.y) + inset), hi = Math.min(bottom[1], top[1], (horizontal ? piece.x + piece.width : piece.y + piece.height) - inset);
  if (hi <= lo + EPS) return null;
  return horizontal ? { x1: round(lo - piece.x), x2: round(hi - piece.x), y1: round(across - piece.y), y2: round(across - piece.y), supportId: s.id } : { x1: round(across - piece.x), x2: round(across - piece.x), y1: round(lo - piece.y), y2: round(hi - piece.y), supportId: s.id };
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
/** Convex-prism separating-axis test catches actual inter-face member overlap, including 45° ends. */
export function frameInterferences(segments, surfaces) {
  if (new Set(segments.map(s => s.surface)).size < 2) return [];
  const solid = s => {
    const t = surfaces.find(face => face.id === s.surface).transform;
    const midpoint = s.start.map((value, i) => (value + s.end[i]) / 2), planePoint = point(t, (s.local.x1 + s.local.x2) / 2, (s.local.y1 + s.local.y2) / 2, 0);
    const setback = dot(midpoint.map((value, i) => value - planePoint[i]), t.normal);
    const front = s.contour.map(([x, y]) => point(t, x, y, setback + s.depth / 2)), back = s.contour.map(([x, y]) => point(t, x, y, setback - s.depth / 2));
    const edges = front.map((p, i) => front[(i + 1) % front.length].map((value, j) => value - p[j])); edges.push(t.normal);
    const vertices = [...front, ...back], normals = [t.normal, ...edges.map(edge => cross(edge, t.normal))];
    return { s, vertices, edges, normals, min: [0, 1, 2].map(i => Math.min(...vertices.map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...vertices.map(p => p[i]))) };
  };
  const solids = segments.map(solid), collisions = [];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if (a.s.surface === b.s.surface || [0, 1, 2].some(k => a.max[k] <= b.min[k] + EPS || b.max[k] <= a.min[k] + EPS)) continue;
    const axes = [...a.normals, ...b.normals, ...a.edges.flatMap(ea => b.edges.map(eb => cross(ea, eb)))];
    const separated = axes.some(axis => {
      const magnitude = Math.hypot(...axis); if (magnitude < EPS) return false;
      const normal = axis.map(value => value / magnitude), ap = a.vertices.map(v => dot(v, normal)), bp = b.vertices.map(v => dot(v, normal));
      return Math.max(...ap) <= Math.min(...bp) + EPS || Math.max(...bp) <= Math.min(...ap) + EPS;
    });
    if (!separated) collisions.push([a.s.id, b.s.id]);
  }
  return collisions;
}
/** Fixings are intersections of actual support faces and finished ACM, never new panel-specific metal. */
export function fixingsOnFrame(pieces, project, structure, errors, warnings) {
  let tapeLength = 0, screws = 0;
  for (const piece of pieces) {
    const f = resolveFixing(project, piece), tape = ['tape', 'hybrid'].includes(f.type), screw = ['screws', 'hybrid'].includes(f.type), screwMap = new Map(), supports = structure.segments.filter(s => s.surface === piece.surface);
    piece.fixing = f; piece.fixings = { tape: [], screws: [], contact: 'back-face' };
    if (Math.min(piece.width, piece.height) <= f.edgeOffset * 2) { warnings.push(issue('FIXING_MARGIN', `${piece.id}: afastamento elimina a área de fixação; reveja o detalhe.`)); continue; }
    let contactCount = 0;
    for (const support of supports) {
      const line = lineOnPiece(support, piece, f.edgeOffset, 0);
      if (!line) continue;
      contactCount++;
      if (tape) {
        const strip = lineOnPiece(support, piece, Math.max(f.edgeOffset, f.tapeWidth / 2), f.tapeWidth);
        if (strip) { piece.fixings.tape.push({ ...strip, width: f.tapeWidth }); tapeLength += Math.hypot(strip.x2 - strip.x1, strip.y2 - strip.y1); }
        else warnings.push(issue('TAPE_SUPPORT', `${piece.id}/${support.id}: fita não cabe integralmente no apoio com o afastamento informado.`));
      }
      if (screw) {
        const drillDiameter = f.drillDiameter ?? null, radius = (drillDiameter ?? 0) / 2;
        const screwLine = drillDiameter === null ? line : lineOnPiece(support, piece, Math.max(f.edgeOffset, radius), drillDiameter, true);
        if (!screwLine) { warnings.push(issue('FIXING_DRILL_SUPPORT', `${piece.id}/${support.id}: furo de ${drillDiameter} mm não cabe integralmente no apoio e na peça. Reveja o detalhe; nenhum furo foi gerado nesse apoio.`)); continue; }
        const length = Math.hypot(screwLine.x2 - screwLine.x1, screwLine.y2 - screwLine.y1), count = Math.max(1, Math.ceil(length / f.screwPitch));
        if (screws + screwMap.size + count + 1 > 30000) { errors.push(issue('FIXING_LIMIT', 'Limite de 30.000 parafusos excedido.')); break; }
        for (let i = 0; i <= count; i++) { const x = round(screwLine.x1 + (screwLine.x2 - screwLine.x1) * i / count), y = round(screwLine.y1 + (screwLine.y2 - screwLine.y1) * i / count); screwMap.set(`${x}:${y}`, { x, y, supportId: support.id, ...(drillDiameter !== null ? { drillDiameter } : {}), role: f.screwProduct?.function || 'ACM → estrutura' }); }
      }
    }
    piece.fixings.screws = [...screwMap.values()].map((s, i) => ({ ...s, number: i + 1 })); screws += piece.fixings.screws.length;
    if (contactCount < 2 || tape && !piece.fixings.tape.length || screw && !piece.fixings.screws.length) warnings.push(issue('FIXING_SUPPORT_INSUFFICIENT', `${piece.id}: apoios disponíveis insuficientes para o padrão informado; ajuste o quadro ou detalhe a fixação. Quantidades não comprovam capacidade.`));
  }
  warnings.push(issue('FIXING_UNVERIFIED', 'Mapa geométrico sobre apoios reais. Produtos, espaçamentos, furação, preparação, dilatação e capacidade aguardam validação técnica.'));
  return { tapeLength: round(tapeLength), screws, validated: false };
}
