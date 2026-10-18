import {metalStockKey} from '../acm/structure.mjs';
const EPS=1e-6,round=n=>Math.round(n*1e6)/1e6;
const confirmedMetal=p=>p.wall>0&&['material','sku','finish'].every(k=>typeof p[k]==='string'&&p[k].trim());
export function planWorkshopBars(segments, frame) {
  const bars = [], unplaced = [], available = frame.remnants.map(r => ({ ...r, stockKey: metalStockKey(r.profile) })), kerf = frame.kerf;
  const allocation = (bar, s) => {
    const before = round(s.angleA < 90 ? kerf / Math.sin(s.angleA*Math.PI/180) : 0);
    const start = round(bar.used + before), end = round(start + s.length), rest = bar.length - frame.trimEnd - bar.trimKerfEnd - end;
    const after = round(s.angleB < 90 ? kerf / Math.sin(s.angleB*Math.PI/180) : rest > EPS ? kerf : 0);
    return rest >= after - EPS ? { start: round(start), end: round(end), kerfBefore: round(before), kerfAfter: round(after), used: round(end + after) } : null;
  };
  const newBar = (length, s, source, remnant) => ({ id: `B${bars.length + 1}`, source, remnantId: remnant?.id, stockKey: s.stockKey, profile: s.profile, profileSpec: s.profileSpec, material: s.material, sku: s.sku, finish: s.finish, wall: s.wall, gauge: s.gauge, pricePerM: source === 'remnant' ? remnant.pricePerM ?? null : s.pricePerM ?? null, length, trimStart: frame.trimStart, trimEnd: frame.trimEnd, trimKerfStart: frame.trimStart > 0 ? kerf : 0, trimKerfEnd: frame.trimEnd > 0 ? kerf : 0, kerf, cuts: [], used: frame.trimStart + (frame.trimStart > 0 ? kerf : 0), waste: length - frame.trimStart - frame.trimEnd - (frame.trimStart > 0 ? kerf : 0) - (frame.trimEnd > 0 ? kerf : 0) });
  for (const s of [...segments].sort((a, b) => b.length - a.length || a.id.localeCompare(b.id))) {
    let bar = bars.filter(b => b.stockKey === s.stockKey && allocation(b, s)).sort((a, b) => a.waste - b.waste)[0];
    if (!bar) {
      const remnant = available.filter(r => confirmedMetal(r.profile) && r.stockKey === s.stockKey && allocation(newBar(r.length, s, 'remnant', r), s)).sort((a, b) => a.length - b.length)[0];
      if (remnant) { bar = newBar(remnant.length, s, 'remnant', remnant); available.splice(available.indexOf(remnant), 1); }
      else { bar = newBar(s.barLength, s, 'commercial'); if (!allocation(bar, s)) { unplaced.push(s.id); continue; } }
      bars.push(bar);
    }
    const cut = allocation(bar, s);
    bar.cuts.push({ id: s.id, sequence: bar.cuts.length + 1, length: s.length, longLength: s.longLength, shortLength: s.shortLength, angleA: s.angleA, angleB: s.angleB, ...cut });
    bar.used = cut.used; bar.waste = round(bar.length - frame.trimEnd - bar.trimKerfEnd - bar.used);
  }
  const purchases = new Map();
  for (const bar of bars.filter(b => b.source === 'commercial')) { const key = JSON.stringify([bar.stockKey, bar.length]); if (!purchases.has(key)) purchases.set(key, { stockKey: bar.stockKey, profile: bar.profile, profileSpec: bar.profileSpec, material: bar.material, sku: bar.sku, finish: bar.finish, wall: bar.wall, length: bar.length, quantity: 0 }); purchases.get(key).quantity++; }
  return { bars, unplaced, purchases: [...purchases.values()], unusedRemnants: available.map(r => r.id) };
}