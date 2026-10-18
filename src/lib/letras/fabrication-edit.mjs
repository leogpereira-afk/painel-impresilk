// References to contour distance are valid only for the artwork that created them.
const shape = project => JSON.stringify({ text: project.text, artwork: project.artwork, family: project.construction?.family });
const technical = project => JSON.stringify({ construction: project.construction, materials: project.materials });
export function reconcileFabricationEdit(previous, next) {
  if (!next.fabrication) return next;
  if (shape(previous) !== shape(next)) return { ...next, fabrication: {
    ...next.fabrication, seamsByStrip: {}, startOffsetsByStrip: {}, joinConfirmed: false, compensationConfirmed: false,
    resetReason: 'Arte ou medidas alteradas: posições de emenda e início das faixas foram reiniciados. Confira o novo contorno.',
  } };
  if (technical(previous) !== technical(next)) return { ...next, fabrication: {
    ...next.fabrication, joinConfirmed: false, compensationConfirmed: false,
    resetReason: 'Corpo ou material alterado: confira novamente a união e a compensação do desenvolvimento.',
  } };
  return next;
}
