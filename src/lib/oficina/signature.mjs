/** Deterministic input identity; prices and view state do not affect physical allocation. */
export function cutSignature(project, materialId) {
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => !['price','barPrice','pricePerM','priceSource','priceDate','view','selected','updatedAt'].includes(k)).map(k => [k,clean(value[k])]));
    return value;
  };
  return JSON.stringify(clean({engine:'oficina-1',projectId:project?.id,unit:project?.unit,materialId,quantity:project?.quantity,component:project?.components?.[materialId],stock:project?.stock?.[materialId === 'metalon' ? 'galvanized' : materialId]}));
}
export const isPlanCurrent = (project,plan) => !!plan && plan.signature === cutSignature(project,plan.materialId);
