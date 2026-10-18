export function parseDecimalDraft(raw) {
  const text = String(raw).trim().replace(',', '.');
  if (text === '') return { valid: true, complete: true, value: null };
  if (!/^-?\d*\.?\d*$/.test(text)) return { valid: false, complete: false };
  if (!/\d/.test(text) || /\.$/.test(text)) return { valid: true, complete: false };
  const value = Number(text);
  return { valid: Number.isFinite(value), complete: Number.isFinite(value), value };
}
