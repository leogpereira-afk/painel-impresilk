import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkshop, buildWorkshop, planWorkshop } from './model.mjs';
import { validateWorkshopSavedPlans } from './savedplans.mjs';

function fixture(materialId = 'acrylic') {
  const project = createWorkshop();
  const result = buildWorkshop(project, materialId), plan = planWorkshop(project, result);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(plan.validation.valid, true, plan.validation.errors.join('; '));
  project.cutPlans = { [materialId]: plan };
  return { project, plan };
}

test('preserves a current independently valid plan without mutating the saved draft', () => {
  const { project, plan } = fixture(), before = structuredClone(project);
  const restored = validateWorkshopSavedPlans(project);
  assert.deepEqual(restored.discarded, []);
  assert.deepEqual(restored.plans.acrylic, plan);
  assert.notEqual(restored.plans.acrylic, plan);
  assert.deepEqual(project, before);
});

test('drops stale geometry only for its material and preserves the other saved plan', () => {
  const { project } = fixture();
  const mdfResult = buildWorkshop(project, 'mdf');
  project.cutPlans.mdf = planWorkshop(project, mdfResult);
  project.components.acrylic.width++;
  const restored = validateWorkshopSavedPlans(project);
  assert.deepEqual(Object.keys(restored.plans), ['mdf']);
  assert.equal(restored.discarded.length, 1);
  assert.equal(restored.discarded[0].materialId, 'acrylic');
  assert.match(restored.discarded[0].reason, /desatualizado/);
  assert.equal(project.cutPlans.acrylic.materialId, 'acrylic');
});

test('ignores saved validation.valid and independently checks edited placements', () => {
  const { project, plan } = fixture();
  plan.validation = { valid: false, errors: ['resultado antigo'] };
  assert.deepEqual(validateWorkshopSavedPlans(project).plans.acrylic.validation, { valid: true, errors: [] });
  plan.validation = { valid: true, errors: [] };
  plan.sheets[0].placements[1] = { ...plan.sheets[0].placements[0] };
  const restored = validateWorkshopSavedPlans(project);
  assert.deepEqual(restored.plans, {});
  assert.match(restored.discarded[0].reason, /inválido/);
});

test('forged 7000 mm bar plus matching waste is rejected against actual 6000 mm stock', () => {
  const { project, plan } = fixture('metalon');
  assert.equal(plan.bars[0].length, 6000);
  plan.bars[0].length += 1000;
  plan.bars[0].waste += 1000;
  plan.validation = { valid: true, errors: [] };
  const restored = validateWorkshopSavedPlans(project);
  assert.deepEqual(restored.plans, {});
  assert.equal(restored.discarded[0].materialId, 'metalon');
});

test('malformed saved plans and nested arrays are discarded without throwing', () => {
  const { project, plan } = fixture();
  for (const malformed of [null, [], {},
    { ...plan, sheets: null }, { ...plan, sheets: [null] }, { ...plan, sheets: [{ id: 'sheet', placements: null }] },
    { ...plan, bars: [null] }, { ...plan, bars: [{ id: 'bar', cuts: null }] },
    { ...plan, unplaced: [null] }, { ...plan, instances: null }, { ...plan, locks: { invalid: null } },
  ]) {
    project.cutPlans = { acrylic: malformed };
    let restored;
    assert.doesNotThrow(() => { restored = validateWorkshopSavedPlans(project); });
    assert.deepEqual(restored.plans, {});
    assert.equal(restored.discarded[0].materialId, 'acrylic');
    assert.ok(restored.discarded[0].reason);
  }
});

test('missing cache is harmless and malformed cache containers do not throw', () => {
  const project = createWorkshop();
  assert.deepEqual(validateWorkshopSavedPlans(project), { plans: {}, discarded: [] });
  assert.deepEqual(validateWorkshopSavedPlans(null), { plans: {}, discarded: [] });
  for (const value of [[], 'invalid', 1]) {
    project.cutPlans = value;
    assert.doesNotThrow(() => validateWorkshopSavedPlans(project));
    assert.deepEqual(validateWorkshopSavedPlans(project).plans, {});
  }
});

test('a malformed cache cannot poison independent geometry validation of another material', () => {
  const { project, plan } = fixture('mdf');
  project.cutPlans.acrylic = { invalid: Infinity };
  project.cutPlans.metalon = null;
  const restored = validateWorkshopSavedPlans(project);
  assert.deepEqual(restored.plans.mdf, plan);
  assert.deepEqual(restored.discarded.map(item => item.materialId), ['acrylic', 'metalon']);
});

test('retains physically current old plan after a price-only revision and drops a future or foreign plan', () => {
  const { project, plan } = fixture();
  project.revision++;
  project.stock.acrylic.price = 100;
  assert.equal(validateWorkshopSavedPlans(project).plans.acrylic.revision, plan.revision);
  for (const patch of [{ revision: project.revision + 1 }, { projectId: 'different-project' }, { materialId: 'mdf' }]) {
    project.cutPlans.acrylic = { ...plan, ...patch };
    assert.deepEqual(validateWorkshopSavedPlans(project).plans, {});
  }
});

test('rebuilds instance geometry and discards unchecked proposals from a valid restored arrangement', () => {
  const { project, plan } = fixture();
  const actualWidth = plan.instances[0].width;
  plan.instances[0].width = 99999;
  plan.proposals = [{ validation: { valid: true }, sheets: ['unchecked'] }];
  const restored = validateWorkshopSavedPlans(project);
  assert.equal(restored.plans.acrylic.instances[0].width, actualWidth);
  assert.equal(Object.hasOwn(restored.plans.acrylic, 'proposals'), false);
  assert.equal(plan.instances[0].width, 99999);
});

test('invalid current draft geometry drops saved plan without discarding or changing the draft', () => {
  const { project } = fixture();
  project.components.acrylic.width = 0;
  const restored = validateWorkshopSavedPlans(project);
  assert.deepEqual(restored.plans, {});
  assert.match(restored.discarded[0].reason, /Geometria atual inválida/);
  assert.equal(project.components.acrylic.width, 0);
  assert.ok(project.cutPlans.acrylic);
});
