import { buildWorkshop } from './model.mjs';
import { expandWorkshopPieces, validateWorkshopPlan } from './plans.mjs';

const MATERIALS = new Set(['acrylic', 'mdf', 'metalon']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identified = (value, key = 'id') => object(value) && typeof value[key] === 'string' && value[key].length > 0;
const list = value => Array.isArray(value) && value.length <= 1200;

function malformed(plan) {
  if (!identified(plan) || !list(plan.instances) || plan.instances.some(item => !identified(item))
    || !list(plan.sheets) || !list(plan.bars) || !list(plan.unplaced)) return true;
  if (plan.sheets.some(sheet => !identified(sheet) || !list(sheet.placements) || sheet.placements.some(item => !identified(item, 'pieceId')))) return true;
  if (plan.bars.some(bar => !identified(bar) || !list(bar.cuts) || bar.cuts.some(item => !identified(item)))) return true;
  if (plan.unplaced.some(item => !identified(item, 'pieceId'))) return true;
  if (plan.locks != null && (!object(plan.locks) || Object.values(plan.locks).some(lock => !object(lock)))) return true;
  return plan.sheets.reduce((total, sheet) => total + sheet.placements.length, 0)
    + plan.bars.reduce((total, bar) => total + bar.cuts.length, 0) + plan.unplaced.length > 1200;
}

/** A damaged or stale plan is disposable cache; the editable project remains intact. */
export function validateWorkshopSavedPlans(project) {
  const plans = {}, discarded = [];
  if (!object(project) || project.cutPlans == null) return { plans, discarded };
  if (!object(project.cutPlans)) return { plans, discarded: [{ materialId: 'cutPlans', reason: 'Mapa de planos salvos inválido.' }] };
  // Exclude all saved caches from draft validation so one damaged cache cannot invalidate another material.
  const draft = { ...project };
  delete draft.cutPlans;
  for (const [materialId, saved] of Object.entries(project.cutPlans)) {
    const discard = reason => discarded.push({ materialId, reason });
    try {
      if (!MATERIALS.has(materialId)) { discard('Material do plano salvo não reconhecido.'); continue; }
      if (malformed(saved)) { discard('Estrutura do plano salvo inválida.'); continue; }
      if (saved.materialId !== materialId || saved.projectId !== draft.id || !Number.isSafeInteger(saved.revision)
        || saved.revision < 1 || saved.revision > draft.revision) { discard('Identidade ou revisão do plano salvo incompatível.'); continue; }
      const result = buildWorkshop(draft, materialId);
      if (!result.valid) { discard(`Geometria atual inválida: ${result.errors.join(' ')}`); continue; }
      if (saved.signature !== result.signature) { discard('Plano desatualizado em relação à geometria ou ao estoque.'); continue; }
      const candidate = structuredClone(saved);
      // Instance geometry and selectable alternatives must never be accepted from an unchecked cache.
      candidate.instances = expandWorkshopPieces(draft, result);
      delete candidate.proposals;
      const validation = validateWorkshopPlan(draft, result, candidate);
      if (!validation.valid || validation.errors.length) { discard(`Plano salvo inválido: ${validation.errors.join(' ')}`); continue; }
      candidate.validation = validation;
      plans[materialId] = candidate;
    } catch {
      discard('Plano salvo malformado ou impossível de validar; recalcule o arranjo.');
    }
  }
  return { plans, discarded };
}
