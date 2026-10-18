// Display conversions only. The project and every fabrication calculation remain in mm.
export function fromMillimeters(value, unit = 'cm') {
  if (value == null) return null;
  if (!['mm', 'cm'].includes(unit)) throw new TypeError('Unidade desconhecida.');
  return value / (unit === 'cm' ? 10 : 1);
}
export function toMillimeters(value, unit = 'cm') {
  if (value == null) return null;
  if (!['mm', 'cm'].includes(unit)) throw new TypeError('Unidade desconhecida.');
  return Number((value * (unit === 'cm' ? 10 : 1)).toPrecision(14));
}
