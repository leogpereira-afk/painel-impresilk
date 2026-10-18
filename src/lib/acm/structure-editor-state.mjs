/** Derive selection across faces before exposing destructive member controls. */
export function structurePlanSelection(structure, surfaces, face, memberId) {
  const requested = memberId ? structure.segments.find(member => member.id === memberId) : null;
  const surface = surfaces.find(item => item.id === (requested?.surface ?? face)) ?? surfaces[0];
  const items = structure.segments.filter(member => member.surface === surface?.id);
  return { surface, items, selected: memberId ? requested : items[0] };
}
export function restoreFrameMemberProfile(overrides, id) {
  const next = { ...overrides }, override = { ...next[id] };
  delete override.profile;
  if (Object.keys(override).length) next[id] = override;
  else delete next[id];
  return next;
}
export function frameFaceInset(frame, face) {
  return frame.faces?.[face]?.inset ?? frame.inset ?? 0;
}
