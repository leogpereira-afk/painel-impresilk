import { flangeScrews } from './flange-fixings.mjs';
import { foldInterference } from '../../../supabase/functions/_shared/acm-folds.mjs';
import { LIMITS, PROFILES, calibrationStatus, edgeExtent, edgeHeight, foldProfile, validateMaterialProcess, validateProject } from './model.mjs';
import { buildStructureFrame, fixingsOnFrame } from './structure.mjs';
import { resolveFixing } from '../../../supabase/functions/_shared/acm-fixing.mjs';
const EPS = 1e-7;
const round = n => Math.round(n * 1e6) / 1e6;
const vec = (a, b, scale = 1) => a.map((n, i) => round(n + b[i] * scale));
const point3 = (transform, x, y, z = 0) => vec(vec(vec(transform.origin, transform.u, x), transform.v, y), transform.normal, z);
const issue = (code, message) => ({ code, message });
export function polygonArea(points) {
  return Math.abs(points.reduce((sum, [x, y], i) => { const next = points[(i + 1) % points.length]; return sum + x * next[1] - next[0] * y; }, 0)) / 2;
}
export function calculateWrap({ profile, thickness, tapeThickness, clearance }) {
  const p = typeof profile === 'string' ? PROFILES.find(item => item.id === profile) : profile;
  if (!p || [p.width, p.depth, thickness, tapeThickness, clearance].some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0) || p.width <= 0 || p.depth <= 0 || ![3, 4].includes(thickness)) return { valid: false, errors: [issue('WRAP_INPUT', 'Informe perfil, espessura 3/4 mm, fita e folga numéricos válidos.')] };
  const width = p.width + 2 * (thickness + tapeThickness), height = p.depth + thickness + clearance;
  return { valid: true, width, height, blankWidth: width + 2 * height, clearance, calibrated: false, warning: 'Estudo nominal de encapamento; conferir referência externa, compensação, encaixe e corpo de prova.' };
}
export function developBlank(width, height, edges, fabrication) {
  const profiles = Object.fromEntries(['left','right','bottom','top'].map(name => [name, foldProfile(edges[name], fabrication, name)]));
  const d = Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, profile.totalDeveloped]));
  if (Object.values(profiles).some(profile => profile.operations.some((op, index) => op.developedLength <= (index < profile.operations.length - 1 ? fabrication.grooveWidth : fabrication.grooveWidth / 2)))) throw new Error('Compensação deixa um segmento sem largura suficiente entre canais ou até o recorte.');
  const interference = foldInterference(profiles, width, height);
  if (interference.length) throw new Error(interference.join(' '));
  const { left: l, right: r, bottom: b, top: t } = d, w = width, h = height;
  const c = fabrication.cornerRelief;
  // Conservative corner cutbacks prevent adjacent inward returns occupying the same material.
  const cl = l > 0 ? c + profiles.left.inwardExtent : 0, cr = r > 0 ? c + profiles.right.inwardExtent : 0;
  const cb = b > 0 ? c + profiles.bottom.inwardExtent : 0, ct = t > 0 ? c + profiles.top.inwardExtent : 0;
  if ((b || t) && w <= cl + cr || (l || r) && h <= cb + ct) throw new Error('Alívio de canto e retornos eliminam a largura útil da aba.');
  const contour = [
    [l, b], [l + (b ? cl : 0), b], [l + (b ? cl : 0), 0], [l + w - (b ? cr : 0), 0], [l + w - (b ? cr : 0), b], [l + w, b],
    [l + w, b + (r ? cb : 0)], [l + w + r, b + (r ? cb : 0)], [l + w + r, b + h - (r ? ct : 0)], [l + w, b + h - (r ? ct : 0)], [l + w, b + h],
    [l + w - (t ? cr : 0), b + h], [l + w - (t ? cr : 0), b + h + t], [l + (t ? cl : 0), b + h + t], [l + (t ? cl : 0), b + h], [l, b + h],
    [l, b + h - (l ? ct : 0)], [0, b + h - (l ? ct : 0)], [0, b + (l ? cb : 0)], [l, b + (l ? cb : 0)],
  ].filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]).map(p => p.map(round));
  while (contour.length > 1 && contour[0][0] === contour.at(-1)[0] && contour[0][1] === contour.at(-1)[1]) contour.pop();
  // Remove collinear points, including zero-height flanges; this remains one simple polygon.
  let changed = true;
  while (changed && contour.length > 4) {
    changed = false;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[(i + contour.length - 1) % contour.length], p = contour[i], q = contour[(i + 1) % contour.length];
      if (Math.abs((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) < EPS) { contour.splice(i, 1); changed = true; break; }
    }
  }
  const grooves = [];
  for (const [edge, profile] of Object.entries(profiles)) for (const op of profile.operations) {
    const coordinates = edge === 'left' ? [l - op.offset, b + cb, l - op.offset, b + h - ct]
      : edge === 'right' ? [l + w + op.offset, b + cb, l + w + op.offset, b + h - ct]
      : edge === 'bottom' ? [l + cl, b - op.offset, l + w - cr, b - op.offset]
      : [l + cl, b + h + op.offset, l + w - cr, b + h + op.offset];
    const [x1,y1,x2,y2] = coordinates.map(round);
    grooves.push({x1,y1,x2,y2,edge, foldId: op.id, number: op.number, angle: op.angle, direction: op.direction, compensation: op.compensation});
  }
  return { width: round(l + w + r), height: round(b + h + t), contour, grooves, folds: grooves.map(g => ({...g})), profiles, cutouts: [], edges: d, cornerSetbacks: {left:cl,right:cr,bottom:cb,top:ct}, face: { x: l, y: b, width: w, height: h }, area: round(polygonArea(contour)), cornerCuts: [
    { x: 0, y: 0, width: l, height: b }, { x: l + w, y: 0, width: r, height: b },
    { x: 0, y: b + h, width: l, height: t }, { x: l + w, y: b + h, width: r, height: t },
  ].filter(rect => rect.width > 0 && rect.height > 0), grooveWidth: fabrication.grooveWidth, compensation: fabrication.compensation };
}
function surfacesFor(project) {
  const list = [{ id: 'front', label: 'Frente', width: project.front.width, height: project.front.height, transform: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] } }];
  if (project.left.enabled) list.push({ id: 'left', label: 'Lateral esquerda', width: project.left.depth, height: project.left.height, transform: { origin: [0, 0, -project.left.depth], u: [0, 0, 1], v: [0, 1, 0], normal: [-1, 0, 0] } });
  if (project.right.enabled) list.push({ id: 'right', label: 'Lateral direita', width: project.right.depth, height: project.right.height, transform: { origin: [project.front.width, 0, 0], u: [0, 0, -1], v: [0, 1, 0], normal: [1, 0, 0] } });
  if (project.soffit.enabled) list.push({ id: 'soffit', label: 'Forro', width: project.soffit.width, height: project.soffit.depth, transform: { origin: [project.soffit.x ?? 0, project.soffit.y ?? 0, -project.soffit.depth], u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] } });
  return list;
}
function regularBoundaries(length, maximum, joint) {
  const count = Math.ceil((length + joint) / (maximum + joint));
  if (count > LIMITS.pieces) return null;
  const panel = (length - (count - 1) * joint) / count;
  const bounds = [0];
  for (let i = 1; i < count; i++) bounds.push(i * panel + (i - 0.5) * joint);
  bounds.push(length);
  return bounds;
}
function moduleDimensions(surface, project) {
  const l = project.layout, short = Math.min(l.maxWidth, l.maxHeight), long = Math.max(l.maxWidth, l.maxHeight);
  const vertical = { width: short, height: long, orientation: 'vertical' }, horizontal = { width: long, height: short, orientation: 'horizontal' };
  if (l.orientation !== 'mixed') return l.orientation === 'horizontal' ? horizontal : vertical;
  function score(option) {
    const cols = Math.ceil((surface.width + l.joint) / (option.width + l.joint)), rows = Math.ceil((surface.height + l.joint) / (option.height + l.joint));
    const w = (surface.width - (cols - 1) * l.joint) / cols, h = (surface.height - (rows - 1) * l.joint) / rows;
    const e = project.edges, envelope = (w + edgeExtent(e.left) + edgeExtent(e.right)) * (h + edgeExtent(e.top) + edgeExtent(e.bottom)) * cols * rows;
    return [cols * rows, envelope];
  }
  const a = score(vertical), b = score(horizontal);
  return b[0] < a[0] || b[0] === a[0] && b[1] < a[1] ? horizontal : vertical;
}
function manualBoundaries(input, surface, dimension, joint, errors, axis) {
  const values = Array.isArray(input) ? input : input?.[surface.id];
  if (!Array.isArray(values) || !values.length || values.length > LIMITS.pieces || values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
    errors.push(issue('MANUAL_AXIS', `${surface.label}: informe ${axis} manuais positivos.`)); return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0) + joint * (values.length - 1);
  if (Math.abs(total - dimension) > 0.001) { errors.push(issue('MANUAL_CLOSURE', `${surface.label}: ${axis} + juntas somam ${round(total)} mm; esperado ${dimension} mm.`)); return null; }
  let sum = 0; const boundaries = [0];
  for (let i = 0; i < values.length - 1; i++) { sum += values[i]; boundaries.push(sum + joint * i + joint / 2); }
  boundaries.push(dimension); return boundaries;
}
export function pieceGeometrySignature(piece) {
  return JSON.stringify({ surface: piece.surface, x: piece.x, y: piece.y, width: piece.width, height: piece.height, edges: ['left', 'right', 'top', 'bottom'].map(key => piece.edges[key]), material: Object.entries(piece.material).sort(([a], [b]) => a.localeCompare(b)), transform: piece.transform, blank: { width: piece.blank.width, height: piece.blank.height, contour: piece.blank.contour, grooves: piece.blank.grooves, holes: piece.blank.holes, cutouts: piece.blank.cutouts } });
}
function rectsFor(surface, project, errors, warnings) {
  const { layout } = project;
  const openings = project.openings.filter(o => (o.surface ?? 'front') === surface.id);
  for (const o of openings) if (o.x + o.width > surface.width + EPS || o.y + o.height > surface.height + EPS) errors.push(issue('OPENING_BOUNDS', `${surface.label}: abertura ultrapassa a superfície.`));
  if (errors.length) return [];
  if (layout.orientation === 'manual' && Array.isArray(layout.manual) && layout.manual.length) {
    if (layout.manual.length > LIMITS.pieces || layout.manual.some(r => !r || typeof r !== 'object')) { errors.push(issue('MANUAL_LIMIT', 'Lista manual inválida ou excede limite de peças.')); return []; }
    const rects = layout.manual.filter(r => r.surface === surface.id);
    if (rects.some(r => !['x', 'y', 'width', 'height'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k])) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > surface.width + EPS || r.y + r.height > surface.height + EPS)) { errors.push(issue('MANUAL_BOUNDS', 'Modulação manual contém peça inválida ou fora da superfície.')); return []; }
    if (openings.length) { errors.push(issue('MANUAL_OPENING', 'Na modulação manual, desenhe explicitamente as peças ao redor das aberturas; remova a abertura automática.')); return []; }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.x < b.x + b.width - EPS && a.x + a.width > b.x + EPS && a.y < b.y + b.height - EPS && a.y + a.height > b.y + EPS) errors.push(issue('MANUAL_OVERLAP', 'Peças manuais se sobrepõem.'));
    }
    warnings.push(issue('MANUAL_COVERAGE', 'Modulação manual: cobertura e juntas são explícitas e devem ser conferidas.'));
    return rects.map((r, i) => ({ ...r, id: r.id ?? `${surface.id}-M${i + 1}` }));
  }
  const module = moduleDimensions(surface, project);
  const xBounds = layout.orientation === 'manual' ? manualBoundaries(layout.columns, surface, surface.width, layout.joint, errors, 'larguras') : regularBoundaries(surface.width, module.width, layout.joint);
  const yBounds = layout.orientation === 'manual' ? manualBoundaries(layout.rows, surface, surface.height, layout.joint, errors, 'alturas') : regularBoundaries(surface.height, module.height, layout.joint);
  surface.modulation = { orientation: layout.orientation === 'manual' ? 'manual' : module.orientation, moduleWidth: module.width, moduleHeight: module.height };
  if (errors.length) return [];
  if (!xBounds || !yBounds || (xBounds.length - 1) * (yBounds.length - 1) > LIMITS.pieces) { errors.push(issue('PIECE_LIMIT', `Limite de ${LIMITS.pieces} peças excedido. Aumente a dimensão dos módulos.`)); return []; }
  for (const o of openings) { xBounds.push(o.x, o.x + o.width); yBounds.push(o.y, o.y + o.height); }
  const unique = values => [...new Set(values.map(round))].sort((a, b) => a - b);
  const xs = unique(xBounds), ys = unique(yBounds);
  if ((xs.length - 1) * (ys.length - 1) > LIMITS.pieces) { errors.push(issue('PIECE_LIMIT', `Limite de ${LIMITS.pieces} peças excedido. Aumente módulos ou simplifique aberturas.`)); return []; }
  const inside = (x, y) => openings.some(o => x > o.x - EPS && x < o.x + o.width + EPS && y > o.y - EPS && y < o.y + o.height + EPS);
  const out = [];
  for (let yi = 0; yi < ys.length - 1; yi++) for (let xi = 0; xi < xs.length - 1; xi++) {
    const x0 = xs[xi], x1 = xs[xi + 1], y0 = ys[yi], y1 = ys[yi + 1], midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
    if (inside(midX, midY)) continue;
    const joint = layout.joint / 2;
    const left = xi > 0 && !inside((xs[xi - 1] + x0) / 2, midY) ? joint : 0;
    const right = xi < xs.length - 2 && !inside((xs[xi + 2] + x1) / 2, midY) ? joint : 0;
    const bottom = yi > 0 && !inside(midX, (ys[yi - 1] + y0) / 2) ? joint : 0;
    const top = yi < ys.length - 2 && !inside(midX, (ys[yi + 2] + y1) / 2) ? joint : 0;
    const width = round(x1 - x0 - left - right), height = round(y1 - y0 - bottom - top);
    if (width <= EPS || height <= EPS) { errors.push(issue('JOINT', `${surface.label}: junta elimina uma faixa junto à abertura.`)); continue; }
    out.push({ id: `${surface.id}-${yi + 1}-${xi + 1}`, x: round(x0 + left), y: round(y0 + bottom), width, height });
  }
  if (openings.length) warnings.push(issue('OPENING_SPLIT', `${surface.label}: aberturas recortadas por modulação retangular; o desenho inclui as juntas adicionais.`));
  return out;
}
function barPlan(segments, length, kerf) {
  const bars = [], unplaced = [];
  for (const segment of [...segments].sort((a, b) => b.length - a.length || a.id.localeCompare(b.id))) {
    if (segment.length > length + EPS) { unplaced.push(segment.id); continue; }
    let bar = bars.filter(b => b.used + kerf + segment.length <= length + EPS).sort((a, b) => b.used - a.used)[0];
    if (!bar) { bar = { id: `B${bars.length + 1}`, cuts: [], used: 0, waste: length, length, kerf }; bars.push(bar); }
    const start = round(bar.used + (bar.cuts.length ? kerf : 0));
    bar.used = start + segment.length;
    bar.cuts.push({ id: segment.id, length: segment.length, sequence: bar.cuts.length + 1, start, end: round(bar.used), angleA: 90, angleB: 90, longLength: segment.length, shortLength: segment.length, faceWidth: segment.width }); bar.used = round(bar.used); bar.waste = round(length - bar.used);
  }
  return { bars, unplaced };
}
function structureAndFixings(pieces, project, errors, warnings, surfaces) {
  if (project.structure.frame?.enabled) {
    const structure = buildStructureFrame(project, surfaces, errors, warnings, pieces);
    return { structure, fixings: fixingsOnFrame(pieces, project, structure, errors, warnings) };
  }
  const profile = PROFILES.find(p => p.id === project.structure.profile) ?? project.structure.customProfile;
  const segments = [], uniqueSegments = new Map(); let tapeLength = 0, screws = 0;
  for (const piece of pieces) {
    const f = resolveFixing(project, piece), o = f.edgeOffset;
    piece.fixing = f; piece.fixings = { tape: [], screws: [], contact: 'back-face' };
    if (Math.min(piece.width, piece.height) <= 2 * o + EPS) { errors.push(issue('FIXING_MARGIN', `${piece.id}: afastamento da fixação elimina o espaço disponível.`)); continue; }
    if (['tape', 'hybrid'].includes(f.type) && (f.tapeWidth > profile.width || o < f.tapeWidth / 2)) warnings.push(issue('TAPE_SUPPORT', `${piece.id}: conferir largura de fita, apoio e borda disponível.`));
    const wrapping = project.assemblyMode === 'wrap';
    const supportLines = wrapping ? [{ x1: piece.width / 2, y1: o, x2: piece.width / 2, y2: piece.height - o, supportY1: 0, supportY2: piece.height }] : [{ x1: o, y1: o, x2: piece.width - o, y2: o }, { x1: o, y1: piece.height - o, x2: piece.width - o, y2: piece.height - o }];
    const count = wrapping ? 0 : Math.max(1, Math.ceil((piece.width - 2 * o) / project.structure.spacing));
    if (segments.length + count + 3 > LIMITS.segments) { errors.push(issue('SEGMENT_LIMIT', 'Limite de segmentos excedido; reveja espaçamento da estrutura.')); break; }
    for (let i = 0; !wrapping && i <= count; i++) { const x = o + (piece.width - 2 * o) * i / count; supportLines.push({ x1: x, y1: o, x2: x, y2: piece.height - o }); }
    for (const line of supportLines) {
      const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
      const setback = piece.material.thickness + f.thickness + profile.depth / 2;
      const start = point3(piece.transform, piece.x + line.x1, piece.y + (line.supportY1 ?? line.y1), -setback), end = point3(piece.transform, piece.x + line.x2, piece.y + (line.supportY2 ?? line.y2), -setback);
      const key = [start.join(','), end.join(',')].sort().join('|');
      let support = uniqueSegments.get(key);
      if (!support) { support = { id: `MT${segments.length + 1}`, start, end, profile: project.structure.profile, width: profile.width, depth: profile.depth, wall: project.structure.wall, length: round(Math.hypot(...end.map((n, i) => n - start[i]))), surface: piece.surface, normal: piece.transform.normal }; segments.push(support); uniqueSegments.set(key, support); }
      if (['tape', 'hybrid'].includes(f.type)) {
        // Horizontal runs stop at the vertical tapes, avoiding counting their intersections twice.
        const horizontal = Math.abs(line.y2 - line.y1) < EPS;
        if (horizontal) {
          const xs = Array.from({ length: count + 1 }, (_, i) => o + (piece.width - 2 * o) * i / count);
          for (let i = 0; i < xs.length - 1; i++) if (xs[i + 1] - xs[i] > f.tapeWidth) {
            const tape = { x1: round(xs[i] + f.tapeWidth / 2), y1: line.y1, x2: round(xs[i + 1] - f.tapeWidth / 2), y2: line.y2, width: f.tapeWidth, supportId: support.id };
            piece.fixings.tape.push(tape); tapeLength += tape.x2 - tape.x1;
          }
        } else { piece.fixings.tape.push({ ...line, width: f.tapeWidth, supportId: support.id }); tapeLength += length; }
      }

    }
    piece.fixings.screws = flangeScrews(piece,f,project.fabrication,errors,warnings,30000-screws); screws += piece.fixings.screws.length;
  }
  const totalLength = round(segments.reduce((sum, s) => sum + s.length, 0));
  const { bars, unplaced } = barPlan(segments, project.structure.barLength, project.structure.kerf);
  if (unplaced.length) errors.push(issue('BAR_LENGTH', `${unplaced.length} segmento(s) excedem a barra comercial; defina uma emenda explícita.`));
  warnings.push(issue('STRUCTURE_UNVERIFIED', 'Estrutura desenhada e quantificada por eixos; cargas, apoios, substrato, ligações e deduções dos encontros ainda exigem dimensionamento.'));
  if (project.structure.wall == null) warnings.push(issue('PROFILE_WALL', 'Espessura da parede do metalon não informada; peso e resistência indisponíveis.'));
  if (!project.fixing.validated || pieces.some(p => !p.fixing.validated)) warnings.push(issue('FIXING_UNVERIFIED', 'Mapa de fixação é uma prévia geométrica; produto, espaçamento, preparação, movimentação e acesso aguardam validação técnica.'));
  return { structure: { segments, totalLength, bars, unplaced, dimensioned: false }, fixings: { tapeLength: round(tapeLength), screws, validated: false } };
}
export function buildProject(project) {
  const empty = { valid: false, errors: [], warnings: [], pieces: [], surfaces: [], structure: { segments: [], totalLength: 0, bars: [], unplaced: [], dimensioned: false }, fixings: { tapeLength: 0, screws: 0, validated: false }, totals: { visibleArea: 0, developedArea: 0, envelopeArea: 0, metalLength: 0, tapeLength: 0, screws: 0, pieces: 0 }, calibration: { valid: false, reason: 'Projeto inválido.' } };
  const errors = validateProject(project), warnings = [];
  if (errors.length) return { ...empty, errors };
  if (project.technicalDrawing) return buildTechnicalProject(project, empty);
  const surfaces = surfacesFor(project), pieces = [], calibration = calibrationStatus(project);
  for (const opening of project.openings) if (!surfaces.some(s => s.id === (opening.surface ?? 'front'))) errors.push(issue('OPENING_DISABLED', 'Há abertura em uma superfície desativada.'));
  if (project.assemblyMode === 'wrap') {
    warnings.push(issue('WRAP_STUDY', 'Encapamento nominal com perfil central; conferir folgas de encaixe, orientação, fita e corpo de prova.'));
    if (surfaces.length !== 1 || project.openings.length) errors.push(issue('WRAP_SURFACES', 'Estudo de encapamento usa somente uma frente sem aberturas.'));
    const profile = PROFILES.find(item => item.id === project.structure.profile) ?? project.structure.customProfile;
    if (project.front.width < profile.width + 2 * project.material.thickness + 2 * project.fixing.thickness - EPS) errors.push(issue('WRAP_CLEARANCE', 'Face de encapamento insuficiente para perfil, ACM e fita.'));
  }
  if (surfaces.length > 1) warnings.push(issue('SURFACE_JUNCTION', 'Encontros entre frente, laterais e forro precisam de detalhe construtivo: conferir folga, espessura e interferência das abas antes da fabricação.'));
  if (!calibration.valid) warnings.push(issue('CALIBRATION', `${calibration.reason} Desenvolvimento é rascunho para conferência.`));
  if (!project.material.manufacturer || !project.material.sku) warnings.push(issue('MATERIAL_AVAILABILITY', 'Cor é uma simulação; fabricante, SKU, formato e disponibilidade comercial devem ser confirmados.'));
  if (project.fabrication.depth != null) {
    const theoreticalWidth = project.fabrication.toolFlat + 2 * project.fabrication.depth * Math.tan(project.fabrication.toolAngle * Math.PI / 360);
    if (Math.abs(theoreticalWidth - project.fabrication.grooveWidth) > 0.01) warnings.push(issue('TOOL_GROOVE_GEOMETRY', `Canal informado de ${project.fabrication.grooveWidth} mm diverge da abertura idealizada de ${round(theoreticalWidth)} mm da fresa V trapezoidal. Conferir transições, ferramenta real e medição no corpo de prova.`));
  }
  if (project.fabrication.depth == null || project.fabrication.remainingCore == null || project.material.skin == null) warnings.push(issue('MACHINING_PARAMETERS', 'Defina lâminas, profundidade de fresagem e núcleo residual; estes parâmetros não são universais.'));
  for (const surface of surfaces) {
    const rects = rectsFor(surface, project, errors, warnings);
    if (pieces.length + rects.length > LIMITS.pieces) { errors.push(issue('PIECE_LIMIT', `Projeto excede ${LIMITS.pieces} peças.`)); break; }
    for (const rect of rects) {
      const override = project.overrides[rect.id] ?? {};
      const edgeDefinitions = { ...project.edges, ...override.edges };
      const edges = Object.fromEntries(Object.entries(edgeDefinitions).map(([key, value]) => [key, edgeHeight(value)]));
      const material = { ...project.material, ...(project.surfaceMaterials?.[surface.id] ?? {}), ...override.material };
      const processErrors = validateMaterialProcess(material, project.fabrication, rect.id);
      if (processErrors.length) { errors.push(...processErrors); continue; }
      try {
        const blank = developBlank(rect.width, rect.height, edgeDefinitions, project.fabrication);
        const piece = { ...rect, assemblyMode: project.assemblyMode ?? 'tray', surface: surface.id, edges, edgeDefinitions, material, blank, transform: surface.transform, fixings: { tape: [], screws: [] }, projectId: project.id, revision: project.revision, calibrated: calibration.valid && JSON.stringify(material) === JSON.stringify(project.material) };
        piece.geometrySignature = pieceGeometrySignature(piece);
        if (override.locked && override.geometrySignature !== piece.geometrySignature) errors.push(issue('LOCK_CHANGED', `${rect.id}: peça bloqueada mudou. Restaure a geometria aprovada ou desbloqueie conscientemente.`));
        if (rect.width < project.layout.minimumStrip || rect.height < project.layout.minimumStrip) warnings.push(issue('NARROW_STRIP', `${rect.id}: faixa menor que o mínimo de ${project.layout.minimumStrip} mm.`));
        if (!(blank.width <= project.fabrication.machineWidth + EPS && blank.height <= project.fabrication.machineLength + EPS) && !(project.stock.rotation && !material.directional && blank.height <= project.fabrication.machineWidth + EPS && blank.width <= project.fabrication.machineLength + EPS)) warnings.push(issue('MACHINE_SIZE', `${rect.id}: desenvolvimento não cabe na área útil da máquina; divida a peça explicitamente.`));
        if (material.thickness !== project.material.thickness || material.sku !== project.material.sku || material.finish !== project.material.finish) warnings.push(issue('PIECE_CALIBRATION', `${rect.id}: material específico exige calibração compatível.`));
        if (Object.values(blank.profiles).some(p => p.operations.length > 1)) warnings.push(issue('FOLD_CHAIN', `${rect.id}: dobras encadeadas nominais; alívios conservadores consideram retornos internos. Raio, espessura, sequência e encaixe exigem corpo de prova.`));
        pieces.push(piece);
      } catch (error) { errors.push(issue('BLANK', `${rect.id}: ${error.message}`)); }
    }
  }
  if (project.cladding?.panelForm === 'flat' && pieces.some(piece => piece.blank.grooves.some(g => g.edge))) warnings.push(issue('CLADDING_FORM_MISMATCH','Forma plana selecionada, mas existem dobras cadastradas. Confira ou remova-as explicitamente; a geometria foi preservada.'));
  for (const [id, override] of Object.entries(project.overrides)) if (override.locked && !pieces.some(piece => piece.id === id)) errors.push(issue('LOCK_MISSING', `${id}: peça bloqueada deixou de existir após a modulação.`));
  if (new Set(pieces.map(p => p.id)).size !== pieces.length) errors.push(issue('DUPLICATE_ID', 'Identificações de peças repetidas.'));
  if (!pieces.length && !errors.length) warnings.push(issue('EMPTY_FACADE', 'Nenhuma área revestida após as aberturas.'));
  const result = structureAndFixings(pieces, project, errors, warnings, surfaces);
  return { valid: !errors.length, errors, warnings, pieces, surfaces, ...result, calibration, totals: {
    visibleArea: round(pieces.reduce((sum, p) => sum + p.width * p.height, 0)), developedArea: round(pieces.reduce((sum, p) => sum + p.blank.area, 0)), envelopeArea: round(pieces.reduce((sum, p) => sum + p.blank.width * p.blank.height, 0)),
    metalLength: result.structure.totalLength, tapeLength: result.fixings.tapeLength, screws: result.fixings.screws, pieces: pieces.length,
  } };
}

/** Imported technical parts remain flat: machining lines alone do not specify a 3D fold. */
function buildTechnicalProject(project, empty) {
  const drawing = project.technicalDrawing, pieces = [], surfaces = [];
  let cursor = 0;
  for (const part of drawing.parts) for (let copy=0; copy<part.quantity; copy++) {
    const id = `${part.id}-Q${copy+1}`, surface = {id: `technical-${id}`,label: `${drawing.name} · ${id}`,width:part.width,height:part.height, transform:{origin:[cursor,0,0],u:[1,0,0],v:[0,1,0],normal:[0,0,1]}};
    const blank={width:part.width,height:part.height,contour:part.contour.map(p=>[...p]),holes:part.holes.map(h=>({...h})),grooves:part.grooves.map(g=>({...g})),folds:[],cutouts:[],face:{x:0,y:0,width:part.width,height:part.height},edges:{left:0,right:0,top:0,bottom:0},area:round(polygonArea(part.contour)-part.holes.reduce((sum,h)=>sum+Math.PI*(h.diameter/2)**2,0)),grooveWidth:project.fabrication.grooveWidth};
    const piece={id,x:0,y:0,width:part.width,height:part.height,surface:surface.id,technical:true,assemblyMode:'flat',edges:{left:0,right:0,top:0,bottom:0},material:{...project.material},blank,transform:surface.transform,fixings:{tape:[],screws:[]},projectId:project.id,revision:project.revision,calibrated:false};
    piece.geometrySignature=pieceGeometrySignature(piece); pieces.push(piece); surfaces.push(surface); cursor+=part.width+100;
  }
  const area=round(pieces.reduce((sum,p)=>sum+p.blank.area,0));
  return {...empty,valid:true,pieces,surfaces,warnings:[issue('TECHNICAL_PLANAR','Modo técnico separado da fachada: geometria plana em mm, sem estrutura/fixação automática. Canais importados não definem ângulo, sentido ou dobra 3D.'),issue('TECHNICAL_ENVELOPE','Encaixe conservador pelo retângulo envolvente; contorno, furos e canais são preservados na exportação. Não é otimização global nem programa CNC.')],calibration:{valid:false,reason:'Geometria técnica importada exige conferência de escala, primeira peça e processo.'},totals:{...empty.totals,visibleArea:area,developedArea:area,envelopeArea:round(pieces.reduce((sum,p)=>sum+p.blank.width*p.blank.height,0)),pieces:pieces.length}};
}
