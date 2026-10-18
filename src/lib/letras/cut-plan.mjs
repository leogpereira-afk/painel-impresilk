import { calculateFabrication } from './fabrication.mjs';
import { letterNestingSignature, nestLetters } from './nesting.mjs';
import { escapeHTML } from '../acm/documents.mjs';

const esc = value => escapeHTML(String(value ?? ''));
const round = value => Math.round(value * 1000000) / 1000000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const unique = values => [...new Set(values.filter(Boolean))];
const rect = (width, height) => [{ outer: [[0, 0], [width, 0], [width, height], [0, height]], holes: [] }];
export const CUT_MACHINE_NAMES = { 'laser-fiber': 'Laser de fibra', 'laser-co2': 'Laser CO₂', router: 'Router', 'manual-cut': 'Corte manual / perfil' };
export const CUT_MATERIAL_NAMES = { galvanized: 'Aço galvanizado', acrylic: 'Acrílico', pvc: 'PVC expandido', mdf: 'MDF', acm: 'ACM', polymeric: 'Lateral polimérica' };
export const CUT_PLAN_LIMIT = 'Distribuição por envelopes retangulares. Curvas e vazados são desenhados, mas não utilizados para encaixar outras peças. Sem compensação de ferramenta, ordem de usinagem ou pós-processador CNC.';

/** Physical XY (Y up) -> sheet SVG coordinates (Y down). Rotation preserves chirality. */
export function cutPointOnSheet(point, part, placement) {
  const [x, y] = point;
  return placement.rotated
    ? [placement.x + part.height - y, placement.y + part.width - x]
    : [placement.x + x, placement.y + part.height - y];
}
export function cutContoursPath(contours) {
  return contours.map(contour => [contour.outer, ...contour.holes].map(ring => ring.map(([x, y], index) => `${index ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ') + ' Z').join(' ')).join(' ');
}
const transformContours = (contours, part, placement) => contours.map(contour => ({ outer: contour.outer.map(point => cutPointOnSheet(point, part, placement)), holes: contour.holes.map(ring => ring.map(point => cutPointOnSheet(point, part, placement))) }));
function referenceLines(part, placement) {
  if (part.kind !== 'strip') return [];
  const lines = [];
  if (part.dimensionStatus === 'developed' && part.overlapMm > 0) lines.push({ kind: 'overlap', label: 'Início da sobreposição; referência, não cortar', from: [part.width - part.overlapMm, 0], to: [part.width - part.overlapMm, part.height] });
  if (finite(part.widthMm) && part.widthMm > part.depthMm) lines.push({ kind: 'flange', label: 'Limite nominal da aba; referência, não é vinco', from: [0, part.depthMm], to: [part.width, part.depthMm] });
  return lines.map(line => ({ ...line, from: cutPointOnSheet(line.from, part, placement), to: cutPointOnSheet(line.to, part, placement) }));
}
function emptyPlan(project, errors = []) {
  return { projectId: project?.id, revision: project?.revision, sheets: [], groups: [], pieces: [], linearStock: [], unplaced: [], pending: [], errors, released: false, totals: { sheets: 0, placed: 0, contours: 0, strips: 0, unplaced: 0, linearLengthMm: 0, grossAreaMm2: 0, envelopeAreaMm2: 0, physicalAreaMm2: 0, outsideEnvelopesMm2: 0, gapsAndHolesMm2: 0, reusableRectanglesMm2: 0 }, limit: CUT_PLAN_LIMIT };
}

/** Read-only presentation model; fabrication is recalculated before accepting cached packing. */
export function buildLetterCutPlan(project, result, options = {}) {
  const plan = emptyPlan(project);
  if (!project || !result) return { ...plan, errors: ['Aguarde a geometria da revisão atual.'] };
  const fabrication = calculateFabrication(project, result);
  if (fabrication.errors.length) return { ...plan, errors: fabrication.errors };
  const nesting = options.nesting?.signature === letterNestingSignature(project, result) ? options.nesting : nestLetters(project, result, fabrication);
  const errors = unique([nesting.error, ...(nesting.errors || []).map(error => typeof error === 'string' ? error : error.message)]);
  if (errors.length) return { ...plan, errors, unplaced: nesting.unplaced || [] };
  const segments = new Map(fabrication.strips.flatMap(strip => strip.segments.map(segment => [segment.id, { ...segment, stripId: strip.id, sideRole: strip.role }])));
  const makePart = piece => {
    const segment = segments.get(piece.id);
    const kind = segment ? 'strip' : 'contour';
    const contours = kind === 'strip' ? rect(piece.width, piece.height) : piece.contours;
    return { ...piece, ...segment, kind, contours, dimensionStatus: kind === 'strip' && (!finite(segment.grossLengthMm) || !finite(segment.widthMm)) ? 'nominal' : 'developed' };
  };
  const pieces = (nesting.pieces || []).map(makePart), byId = new Map(pieces.map(piece => [piece.id, piece]));
  const seen = new Set();
  const sheets = (nesting.sheets || []).map(sheet => {
    const parts = sheet.placements.map((placement, index) => {
      const piece = byId.get(placement.pieceId);
      if (!piece || seen.has(piece.id)) { errors.push(`Peça desconhecida ou repetida na chapa: ${placement.pieceId}.`); return null; }
      seen.add(piece.id);
      const contours = transformContours(piece.contours, piece, placement);
      const points = contours.flatMap(contour => [contour.outer, ...contour.holes].flat());
      if (points.some(([x, y]) => !finite(x) || !finite(y) || x < placement.x - 1e-5 || y < placement.y - 1e-5 || x > placement.x + placement.width + 1e-5 || y > placement.y + placement.height + 1e-5)) errors.push(`${piece.id}: contorno fora do envelope da chapa.`);
      return { ...piece, number: index + 1, placement, sheetContours: contours, path: cutContoursPath(contours), references: referenceLines(piece, placement), envelopeAreaMm2: placement.width * placement.height };
    }).filter(Boolean);
    const physicalAreaMm2 = parts.reduce((sum, part) => sum + part.areaMm2, 0), envelopeAreaMm2 = parts.reduce((sum, part) => sum + part.envelopeAreaMm2, 0), grossAreaMm2 = sheet.width * sheet.length;
    return { ...sheet, parts, physicalAreaMm2, envelopeAreaMm2, grossAreaMm2, outsideEnvelopesMm2: Math.max(0, grossAreaMm2 - envelopeAreaMm2), gapsAndHolesMm2: Math.max(0, envelopeAreaMm2 - physicalAreaMm2), reusableRectanglesMm2: (sheet.remnants || []).reduce((sum, area) => sum + area.width * area.length, 0), status: parts.some(part => part.dimensionStatus === 'nominal') ? 'nominal' : 'developed', utilization: grossAreaMm2 ? 100 * physicalAreaMm2 / grossAreaMm2 : 0 };
  });
  const unplaced = (nesting.unplaced || []).map(item => typeof item === 'string' ? { pieceId: item, reason: 'Não alocado.' } : item);
  for (const item of unplaced) {
    if (!byId.has(item.pieceId) || seen.has(item.pieceId)) errors.push(`Peça não alocada inválida ou repetida: ${item.pieceId}.`);
    seen.add(item.pieceId);
  }
  if (seen.size !== pieces.length) errors.push('Há peças ausentes do plano de corte. Recalcule a revisão.');
  const linearStock = (nesting.linearStock || []).map(piece => ({ ...piece, ...segments.get(piece.id), kind: 'strip', dimensionStatus: finite(piece.grossLengthMm) && finite(piece.widthMm) ? 'developed' : 'nominal' }));
  const groups = [];
  for (const sheet of sheets) {
    const id = `${sheet.operation}:${sheet.materialKey}`;
    let group = groups.find(item => item.id === id);
    if (!group) { group = { id, material: sheet.material, operation: sheet.operation, sheets: [], pieceIds: [], physicalAreaMm2: 0, grossAreaMm2: 0 }; groups.push(group); }
    group.sheets.push(sheet.id); group.pieceIds.push(...sheet.parts.map(part => part.id)); group.physicalAreaMm2 += sheet.physicalAreaMm2; group.grossAreaMm2 += sheet.grossAreaMm2;
  }
  const pending = unique([
    ...fabrication.pending,
    ...(nesting.warnings || []).map(warning => typeof warning === 'string' ? warning : warning.message),
    nesting.developmentPending && 'Faixas com dimensões NOMINAIS: faltam compensação, sobreposição ou largura adicional. O desenho usa o nominal apenas para estudo de ocupação.',
    unplaced.length && `${unplaced.length} peça(s) sem alocação. O plano não contém todo o conjunto.`,
    'Formato de chapa comum aos materiais: confirmar disponibilidade e formato real de cada lote.',
    'Sobras fora dos envelopes incluem refilo e separações; áreas de vazados e recortes não estão cadastradas como retalhos recuperáveis.',
    project.artwork?.mode === 'vector' && `Arte ${project.artwork.fileName || 'importada'}: escala ${result.bounds.width.toFixed(2)} × ${result.bounds.height.toFixed(2)} mm; conferir tolerância dos contornos aproximados no CAD/CAM.`,
  ]);
  const sum = key => sheets.reduce((total, sheet) => total + sheet[key], 0);
  return { ...plan, sheets, pieces, groups, linearStock, unplaced, errors: unique(errors), pending, source: project.artwork?.mode === 'vector' ? { mode: 'vector', fileName: project.artwork.fileName, format: project.artwork.format, widthMm: result.bounds.width, heightMm: result.bounds.height } : { mode: 'text', value: project.text.value }, totals: { sheets: sheets.length, placed: sheets.reduce((total, sheet) => total + sheet.parts.length, 0), contours: pieces.filter(piece => piece.kind === 'contour').length, strips: pieces.filter(piece => piece.kind === 'strip').length, unplaced: unplaced.length, linearLengthMm: linearStock.reduce((total, piece) => total + piece.width, 0), grossAreaMm2: sum('grossAreaMm2'), envelopeAreaMm2: sum('envelopeAreaMm2'), physicalAreaMm2: sum('physicalAreaMm2'), outsideEnvelopesMm2: sum('outsideEnvelopesMm2'), gapsAndHolesMm2: sum('gapsAndHolesMm2'), reusableRectanglesMm2: sum('reusableRectanglesMm2') } };
}

export function letterCutSheetSVG(project, result, sheetId, options = {}) {
  const plan = buildLetterCutPlan(project, result, options);
  if (plan.errors.length) throw Error(plan.errors.join(' '));
  const sheet = plan.sheets.find(item => item.id === sheetId);
  if (!sheet) throw Error('Chapa não encontrada na revisão atual.');
  const fontSize = Math.min(8, Math.max(2, Math.min(sheet.width, sheet.length) / 120));
  const cuts = sheet.parts.map(part => `<path data-part-id="${esc(part.id)}" data-kind="${part.kind}" data-dimensions="${part.dimensionStatus}" d="${part.path}"/>`).join('');
  const references = sheet.parts.flatMap(part => part.references.map(line => `<path data-part-id="${esc(part.id)}" data-reference="${line.kind}" d="M${line.from.map(round).join(' ')} L${line.to.map(round).join(' ')}"><title>${esc(line.label)}</title></path>`)).join('');
  const envelopes = sheet.parts.map(part => `<rect data-part-id="${esc(part.id)}" x="${round(part.placement.x)}" y="${round(part.placement.y)}" width="${round(part.placement.width)}" height="${round(part.placement.height)}"/>`).join('');
  const notes = sheet.parts.map(part => `<text data-part-id="${esc(part.id)}" x="${round(part.placement.x + 2)}" y="${round(part.placement.y + fontSize + 1)}">${part.number} · ${esc(part.id)}${part.dimensionStatus === 'nominal' ? ' · NOMINAL' : ''}</text>`).join('');
  const metadata = { projectId: project.id, revision: project.revision, sheetId: sheet.id, units: 'mm', status: 'estudo-para-conferencia', released: false, material: sheet.material, operation: sheet.operation, source: plan.source, limits: CUT_PLAN_LIMIT, pieces: sheet.parts.map(part => ({ id: part.id, kind: part.kind, dimensions: part.dimensionStatus, widthMm: part.width, heightMm: part.height, rotated: part.placement.rotated, letterId: part.letterId, stripId: part.stripId, nominalLengthMm: part.nominalLengthMm, compensationMm: part.compensationMm, overlapMm: part.overlapMm })) };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(sheet.width)}mm" height="${round(sheet.length)}mm" viewBox="0 0 ${round(sheet.width)} ${round(sheet.length)}"><title>${esc(project.name)} · R${project.revision} · ${esc(sheet.id)} · ESTUDO DE CORTE</title><desc>Dimensões em mm. Contornos físicos e vazados orientados na chapa. Apenas CORTE_NOMINAL contém contornos de peças; todas as outras camadas são referências que NÃO devem virar corte. ${esc(CUT_PLAN_LIMIT)} Não liberado para produção.</desc><metadata>${esc(JSON.stringify(metadata))}</metadata><g id="CHAPA_NAO_CORTAR" fill="none" stroke="#94a3b8" stroke-width="0.4"><rect x="0" y="0" width="${round(sheet.width)}" height="${round(sheet.length)}"/><rect x="${sheet.trim}" y="${sheet.trim}" width="${round(sheet.width - 2 * sheet.trim)}" height="${round(sheet.length - 2 * sheet.trim)}" stroke-dasharray="4 3"/></g><g id="ENVELOPES_NAO_CORTAR" fill="none" stroke="#c58624" stroke-width="0.25" stroke-dasharray="3 2">${envelopes}</g><g id="CORTE_NOMINAL" fill="none" fill-rule="evenodd" stroke="#173e68" stroke-width="0.3">${cuts}</g><g id="REFERENCIAS_NAO_CORTAR" fill="none" stroke="#168455" stroke-width="0.25" stroke-dasharray="2 2">${references}</g><g id="ANOTACOES_NAO_CORTAR" fill="#172b40" font-family="Arial,sans-serif" font-size="${round(fontSize)}">${notes}<text x="2" y="${round(Math.max(fontSize, sheet.trim - 1))}">${esc(sheet.id)} · R${project.revision} · ${esc(CUT_MACHINE_NAMES[sheet.operation] || sheet.operation)} · ESTUDO ${sheet.status === 'nominal' ? 'COM FAIXAS NOMINAIS' : 'COM MEDIDAS INFORMADAS'}</text></g></svg>`;
}
