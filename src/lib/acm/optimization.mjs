import { buildProject } from './engine.mjs';
import { nestPieces, materialKey } from './nesting.mjs';
import { estimateCosts } from './costs.mjs';

const EPS = 1e-5;
export const OPTIMIZATION_PRIORITIES = Object.freeze({
  sheets: { label: 'Menos chapas', criterion: 'Menos chapas e retalhos consumidos; desempate por chapas novas e área bruta.' },
  seams: { label: 'Menos emendas', criterion: 'Menor comprimento de juntas entre peças da mesma face; desempate por quantidade de trechos e chapas.' },
  cost: { label: 'Menor custo', criterion: 'Menor orçamento completo, somente se todas as alternativas viáveis tiverem preços. Serviços usam o valor por lote informado.' },
  visual: { label: 'Composição visual', criterion: 'Menos tiras abaixo do mínimo; depois menos juntas horizontais desalinhadas entre frente e laterais; depois menor variação proporcional dos módulos por face.' },
});
const compare = (a, b) => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return a[i] - b[i]; return 0; };
const rounded = value => Math.round(value * 1e5) / 1e5;
const variation = values => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return mean ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) / mean : 0;
};
/** Adjacent face rectangles define measurable seam segments; no exterior perimeter is counted. */
export function layoutMetrics(result, project) {
  let seamLength = 0, seamCount = 0, moduleVariation = 0;
  const facePieces = new Map(), levels = new Map();
  for (const piece of result.pieces) {
    if (!facePieces.has(piece.surface)) facePieces.set(piece.surface, []);
    facePieces.get(piece.surface).push(piece);
  }
  for (const [surface, pieces] of facePieces) {
    levels.set(surface, new Set());
    moduleVariation += variation(pieces.map(piece => piece.width)) + variation(pieces.map(piece => piece.height));
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j], gap = project.layout.joint;
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (overlapY > EPS && (Math.abs(a.x + a.width + gap - b.x) < EPS || Math.abs(b.x + b.width + gap - a.x) < EPS)) { seamLength += overlapY; seamCount++; }
      if (overlapX > EPS && (Math.abs(a.y + a.height + gap - b.y) < EPS || Math.abs(b.y + b.height + gap - a.y) < EPS)) {
        seamLength += overlapX; seamCount++;
        levels.get(surface).add(rounded(Math.min(a.y + a.height, b.y + b.height) + gap / 2));
      }
    }
  }
  let misalignedJoints = 0;
  const front = levels.get('front') ?? new Set();
  for (const side of ['left', 'right']) if (levels.has(side)) {
    const sideLevels = levels.get(side), commonHeight = Math.min(project.front.height, project[side].height);
    for (const level of new Set([...front, ...sideLevels])) if (level < commonHeight - EPS && front.has(level) !== sideLevels.has(level)) misalignedJoints++;
  }
  return { seamLength: rounded(seamLength), seamCount, visual: { narrowStrips: result.pieces.filter(piece => Math.min(piece.width, piece.height) < project.layout.minimumStrip - EPS).length, misalignedJoints, moduleVariation: rounded(moduleVariation) } };
}
function score(alternative, priority) {
  if (priority === 'seams') return [alternative.seamLength, alternative.seamCount, alternative.sheets, alternative.grossArea];
  if (priority === 'cost') return [alternative.cost.total, alternative.sheets, alternative.seamLength];
  if (priority === 'visual') return [alternative.visual.narrowStrips, alternative.visual.misalignedJoints, alternative.visual.moduleVariation, alternative.seamLength, alternative.sheets];
  return [alternative.sheets, alternative.newSheets, alternative.grossArea, alternative.seamLength];
}
/** Never crown a cheapest candidate while another feasible candidate has an unknown price. */
export function rankAlternatives(alternatives, priority = 'sheets') {
  if (!OPTIMIZATION_PRIORITIES[priority]) priority = 'sheets';
  const feasible = alternatives.filter(alternative => alternative.feasible);
  const rankingAvailable = priority !== 'cost' || feasible.length > 0 && feasible.every(alternative => alternative.cost?.complete === true && Number.isFinite(alternative.cost.total));
  const sorted = [...alternatives].sort((a, b) => Number(b.feasible) - Number(a.feasible) || (a.feasible && rankingAvailable ? compare(score(a, priority), score(b, priority)) : 0));
  let rank = 0;
  return sorted.map(alternative => ({ ...alternative, priority, rankingAvailable, rank: alternative.feasible && rankingAvailable ? ++rank : null,
    rankingNote: !rankingAvailable ? 'Faltam cotações completas em uma ou mais alternativas viáveis; não foi indicado menor custo.' : OPTIMIZATION_PRIORITIES[priority].criterion }));
}
/** Mutation intended for the parent's single history transaction. */
export function applyOptimizationAlternative(project, alternative) {
  if (!['vertical', 'horizontal', 'mixed'].includes(alternative.orientation) || ![1220, 1250, 1500].includes(alternative.width) || alternative.feasible !== true) throw new Error('Alternativa inválida ou sem encaixe confirmado.');
  project.layout.orientation = alternative.orientation;
  if (project.stock.width !== alternative.width) project.stock.quantity = null;
  project.stock.width = alternative.width;
}
function commercialStatus(pieces, width, length) {
  const materials = new Map(pieces.map(piece => [materialKey(piece.material), piece.material]));
  let unknown = false;
  const unavailable = [];
  for (const material of materials.values()) {
    if (!material.formats?.length) unknown = true;
    else if (!material.formats.some(format => format.width === width && format.length === length)) unavailable.push(material.sku || material.colorId || 'material');
  }
  return { status: unavailable.length ? 'unlisted' : unknown ? 'unconfirmed' : 'listed', unavailable };
}
export function compareAlternatives(project) {
  const alternatives = [];
  for (const orientation of ['vertical', 'horizontal', 'mixed']) for (const width of [1220, 1250, 1500]) {
    const purchaseScenario = width !== project.stock.width;
    const candidate = { ...project, layout: { ...project.layout, orientation }, stock: { ...project.stock, width, quantity: purchaseScenario ? null : project.stock.quantity } };
    const geometry = buildProject(candidate);
    const cut = geometry.valid ? nestPieces(geometry.pieces, candidate.stock, candidate.fabrication) : null;
    const commercial = commercialStatus(geometry.pieces, width, candidate.stock.length);
    const reasons = [...geometry.errors.map(error => error.message), ...(cut?.errors ?? []).map(error => error.message)];
    if (cut?.unplaced.length) reasons.push(`${cut.unplaced.length} peça(s) sem encaixe.`);
    if (commercial.status === 'unlisted') reasons.push(`Formato ausente no cadastro comercial de: ${commercial.unavailable.join(', ')}.`);
    const cost = cut ? estimateCosts(candidate, geometry, cut) : null;
    const metrics = layoutMetrics(geometry, candidate);
    alternatives.push({ orientation, width, length: candidate.stock.length, purchaseScenario, commercial: commercial.status,
      pieces: geometry.pieces.length, sheets: cut?.sheets.length ?? 0, newSheets: cut?.sheets.filter(sheet => sheet.source === 'sheet').length ?? 0,
      unplaced: cut?.unplaced.length ?? geometry.pieces.length, utilization: cut?.utilization ?? 0, grossArea: cut?.grossArea ?? 0,
      feasible: geometry.valid && !cut.errors.length && !cut.unplaced.length && commercial.status !== 'unlisted', reasons, ...metrics,
      cost: { complete: cost?.complete === true, total: cost?.complete ? cost.known : null, subtotal: cost?.known ?? 0, missing: cost?.items.filter(item => item.total === null).map(item => item.name) ?? ['Geometria inválida'] },
    });
  }
  return rankAlternatives(alternatives, project.layout.optimizationPriority ?? 'sheets');
}
export function optimizeProject(project, { compare: compareOptions = false } = {}) {
  const result = buildProject(project);
  if (!result.valid) return { error: result.errors.map(error => error.message).join(' '), alternatives: [] };
  return { nesting: nestPieces(result.pieces, project.stock, project.fabrication), alternatives: compareOptions ? compareAlternatives(project) : [] };
}
