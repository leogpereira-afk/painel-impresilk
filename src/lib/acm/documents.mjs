import { metalProductionSummary, acmProductionSummary } from './production-summary.mjs';
import { calibrationStatus } from './model.mjs';
import { estimateCosts } from './costs.mjs';
import { fixingQuantities, isSafeFixingPhoto, fixingPointOnBlank } from '../../../supabase/functions/_shared/acm-fixing.mjs';

export const escapeHTML = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const n = value => {
  if (!finite(value)) throw new Error('Documento contém uma coordenada inválida.');
  return Number(value.toFixed(5));
};
const fmt = (value, digits = 2) => finite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : 'Não informado';
const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#d8dde3';
const text = escapeHTML;
const row = values => `<tr>${values.map(value => `<td>${text(value)}</td>`).join('')}</tr>`;
const table = (headers, rows) => `<table><thead><tr>${headers.map(header => `<th>${text(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row).join('')}</tbody></table>`;

function metadata(piece, options = {}) {
  const project = options.project;
  const revision = options.revision ?? project?.revision ?? piece.revision;
  if (!Number.isInteger(revision) || revision < 1) throw new Error('Informe a revisão da peça antes de exportar.');
  if (!Number.isInteger(piece.revision) || piece.revision !== revision) throw new Error('A peça pertence a outra revisão ou não tem revisão. Recalcule o projeto.');
  if (project && piece.projectId != null && project.id !== piece.projectId) throw new Error('A peça pertence a outro projeto.');
  const wrapping = piece.assemblyMode === 'wrap' || project?.assemblyMode === 'wrap';
  const calibrated = !wrapping && piece.calibrated === true && (!project || calibrationStatus(project).valid);
  const f = project?.fabrication;
  const process = f ? { material: { manufacturer: piece.material?.manufacturer, sku: piece.material?.sku, thickness: piece.material?.thickness, skin: piece.material?.skin, core: piece.material?.core }, compensation: f.compensation, cornerRelief: f.cornerRelief, grooveWidth: f.grooveWidth, toolAngle: f.toolAngle, toolFlat: f.toolFlat, depth: f.depth, remainingCore: f.remainingCore } : null;
  return { revision, projectId: project?.id ?? piece.projectId ?? '', projectName: project?.name ?? '', side: options.back === false ? 'FRENTE — CONFERÊNCIA VISUAL, NÃO USINAR' : 'VERSO — USINAGEM', status: wrapping ? 'ESTUDO NOMINAL DE ENCAPAMENTO · RASCUNHO' : calibrated ? 'CALIBRAÇÃO REGISTRADA · REVISÃO A CONFERIR' : 'RASCUNHO · FABRICAÇÃO NÃO CALIBRADA', fabricationProfile: options.fabricationProfile ?? f?.profileName ?? f?.machine ?? 'Perfil sem identificação comercial; parâmetros vinculados ao projeto', process, calibrated };
}

/** Engine blank coordinates follow the exterior/front face. Flip x exactly once for the machining back view. */
export function documentGeometry(piece, { back = true } = {}) {
  const blank = piece?.blank;
  if (!blank || !finite(blank.width) || !finite(blank.height) || blank.width <= 0 || blank.height <= 0 || !Array.isArray(blank.contour) || blank.contour.length < 3) throw new Error('Peça sem desenvolvimento válido para exportar.');
  const point = (x, y) => [n(back ? blank.width - x : x), n(y)];
  const line = item => {
    const a = point(item.x1, item.y1), b = point(item.x2, item.y2);
    return { ...item, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  };
  const polygon = item => {
    const points = Array.isArray(item) ? item : item.contour ?? item.points ?? (finite(item.x) && finite(item.y) && finite(item.width) && finite(item.height) ? [[item.x, item.y], [item.x + item.width, item.y], [item.x + item.width, item.y + item.height], [item.x, item.y + item.height]] : null);
    if (!Array.isArray(points) || points.length < 3) throw new Error('Recorte inválido na peça.');
    return points.map(([x, y]) => point(x, y));
  };
  const face = blank.face ?? { x: typeof piece.edges?.left === 'number' ? piece.edges.left : piece.edges?.left?.height ?? 0, y: typeof piece.edges?.bottom === 'number' ? piece.edges.bottom : piece.edges?.bottom?.height ?? 0 };
  const drills = (blank.holes ?? piece.fixings?.screws ?? []).map((hole, i) => {
    // Explicit blank.holes already use developed coordinates. Fixings use face-local coordinates.
    const location = blank.holes ? hole : fixingPointOnBlank(piece,hole);
    const [x, y] = point(location.x,location.y);
    const diameter = hole.drillDiameter ?? hole.diameter ?? hole.radius * 2;
    return { ...hole, x, y, diameter: finite(diameter) && diameter > 0 ? n(diameter) : null, number: i + 1 };
  });
  const tape = (piece.fixings?.tape ?? []).map(item => line({ ...item, x1: item.x1 + face.x, y1: item.y1 + face.y, x2: item.x2 + face.x, y2: item.y2 + face.y }));
  return { width: blank.width, height: blank.height, contour: polygon(blank.contour), cutouts: (blank.cutouts ?? []).map(polygon), grooves: (blank.grooves ?? []).map(line), folds: (blank.folds ?? []).map(line), drills, tape, directional: piece.material?.directional === true, direction: back ? -1 : 1 };
}

const pathData = points => `${points.map(([x, y], i) => `${i ? 'L' : 'M'} ${n(x)} ${n(y)}`).join(' ')} Z`;
const svgLines = lines => lines.map(line => `<line x1="${n(line.x1)}" y1="${n(line.y1)}" x2="${n(line.x2)}" y2="${n(line.y2)}"/>`).join('');

export function pieceSVG(piece, options = {}) {
  const g = documentGeometry(piece, options), meta = metadata(piece, options);
  const font = Math.max(8, Math.min(g.width, g.height) * 0.027);
  const title = `${piece.id} · R${meta.revision} · ${meta.side}`;
  const info = `${meta.status}; unidade mm; escala geométrica 1:1; ${meta.fabricationProfile}; origem inferior esquerda; canais representam eixos; pontos de furação sem diâmetro devem ser definidos; não é G-code.`;
  const pointMarkers = g.drills.map(hole => hole.diameter ? `<circle cx="${hole.x}" cy="${hole.y}" r="${n(hole.diameter / 2)}"/>` : `<path d="M ${n(hole.x - 3)} ${hole.y} L ${n(hole.x + 3)} ${hole.y} M ${hole.x} ${n(hole.y - 3)} L ${hole.x} ${n(hole.y + 3)}" data-diameter="unspecified"/>`).join('');
  const arrows = g.directional ? `<path d="M ${n(g.width * (g.direction > 0 ? 0.2 : 0.8))} ${n(g.height / 2)} L ${n(g.width * (g.direction > 0 ? 0.8 : 0.2))} ${n(g.height / 2)} l ${-g.direction * font} ${font / 2} m ${g.direction * font} ${-font / 2} l ${-g.direction * font} ${-font / 2}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(g.width)}mm" height="${n(g.height)}mm" viewBox="0 0 ${n(g.width)} ${n(g.height)}" role="img" aria-label="${text(title)}" data-revision="${meta.revision}" data-side="${options.back === false ? 'front' : 'back'}" data-units="mm">
<title>${text(title)}</title><desc>${text(info)}</desc><metadata>${text(JSON.stringify({ pieceId: piece.id, ...meta, units: 'mm', scale: '1:1' }))}</metadata>
<g transform="translate(0 ${n(g.height)}) scale(1 -1)" fill="none" stroke-width="0.5">
<g id="CUT" stroke="#000000" data-operation="cut"><path d="${pathData(g.contour)}"/>${g.cutouts.map(points => `<path d="${pathData(points)}"/>`).join('')}</g>
<g id="GROOVE" stroke="#ff0000" data-label="FRESA" data-operation="groove-center">${svgLines(g.grooves)}</g>
<g id="FOLD" stroke="#0000ff" stroke-dasharray="5 3" data-operation="information-only">${svgLines(g.folds)}</g>
<g id="DRILL" stroke="#0000ff" data-operation="drill-location">${pointMarkers}</g>
<g id="FIXING" stroke="#15803d" data-operation="information-only">${g.tape.map(item => `<line x1="${n(item.x1)}" y1="${n(item.y1)}" x2="${n(item.x2)}" y2="${n(item.y2)}" stroke-width="${n(item.width ?? 1)}" opacity="0.3"/>`).join('')}</g>
<g id="ORIGIN" stroke="#64748b" data-operation="information-only"><path d="M 0 0 H 20 M 0 0 V 20"/></g>
<g id="DIRECTION" stroke="#475569" stroke-width="1" data-operation="information-only">${arrows}</g></g>
<g id="DIMENSIONS" fill="#334155" font-family="sans-serif" font-size="${font}" data-operation="information-only"><text x="${n(g.width / 2)}" y="${n(g.height - font / 2)}" text-anchor="middle">${n(g.width)} × ${n(g.height)} mm</text></g>
<g id="AXIS_LABELS" fill="#475569" font-family="sans-serif" font-size="6" data-operation="information-only"><text x="1" y="${n(g.height - 2)}">0,0</text><text x="21" y="${n(g.height - 2)}">+X</text><text x="1" y="${n(g.height - 21)}">+Y</text></g>
<g id="TEXT" fill="#111827" font-family="sans-serif" font-size="${font}" data-operation="information-only"><text x="${font}" y="${font * 1.4}">${text(title)}</text><text x="${font}" y="${font * 2.7}" font-size="${font * 0.7}">${text(meta.status)}</text>${g.grooves.filter(line=>line.number).map(line=>`<text x="${n((line.x1+line.x2)/2+3)}" y="${n(g.height-(line.y1+line.y2)/2-3)}" font-size="${font*0.7}">${text(line.edge)} D${line.number} ${line.angle}°</text>`).join('')}${g.drills.map(hole => `<text x="${n(hole.x + 5)}" y="${n(g.height - hole.y - 5)}" font-size="${font * 0.7}">F${hole.number}</text>`).join('')}</g></svg>`;
}

// ASCII-safe DXF TEXT, with escaped Unicode. Newlines and backslashes cannot introduce records.
function dxfText(value) {
  return String(value ?? '').replace(/[\r\n\u0000-\u001f]/g, ' ').replace(/\\/g, '/').replace(/[^\x20-\x7e]/g, ch => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

export function pieceDXF(piece, options = {}) {
  const g = documentGeometry(piece, options), meta = metadata(piece, options);
  const out = [], pairs = (...values) => out.push(...values.map(String));
  let handle = 256;
  const next = () => (++handle).toString(16).toUpperCase();
  const entity = (type, layer, subclass) => pairs(0, type, 5, next(), 100, 'AcDbEntity', 8, layer, 100, subclass);
  const line = (item, layer) => { entity('LINE', layer, 'AcDbLine'); pairs(10, n(item.x1), 20, n(item.y1), 30, 0, 11, n(item.x2), 21, n(item.y2), 31, 0); };
  const label = (value, x, y, layer = 'TEXT', height = 8) => { entity('TEXT', layer, 'AcDbText'); pairs(10, n(x), 20, n(y), 30, 0, 40, height, 1, dxfText(value), 100, 'AcDbText'); };
  const polygon = points => { entity('LWPOLYLINE', 'CUT', 'AcDbPolyline'); pairs(90, points.length, 70, 1); for (const [x, y] of points) pairs(10, n(x), 20, n(y)); };
  pairs(999, `Impresilk ACM Studio | ${dxfText(piece.id)} | revision ${meta.revision} | mm | 1:1`, 999, dxfText(`${meta.side} | ${meta.status} | ${meta.fabricationProfile}`), 999, 'CUT=black contour; GROOVE=red FRESA tool center; DRILL=specified holes or POINT without diameter; FOLD/DIMENSIONS/TEXT/FIXING=information, not cutting');
  if (meta.process) for (const [key, value] of Object.entries(meta.process)) pairs(999, dxfText(`PARAM ${key}=${JSON.stringify(value)}`));
  pairs(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 9, '$LUNITS', 70, 2, 9, '$LUPREC', 70, 5, 0, 'ENDSEC');
  pairs(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 5, next(), 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  const layers = [['0', 7], ['CUT', 7], ['GROOVE', 1], ['DRILL', 5], ['FOLD', 5], ['DIMENSIONS', 8], ['TEXT', 7], ['FIXING', 3]];
  pairs(0, 'TABLE', 2, 'LAYER', 70, layers.length);
  for (const [name, aci] of layers) pairs(0, 'LAYER', 5, next(), 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, name, 70, 0, 62, aci, ...(name === 'CUT' ? [420, 0] : name === 'GROOVE' ? [420, 16711680] : name === 'DRILL' || name === 'FOLD' ? [420, 255] : []), 6, 'CONTINUOUS');
  pairs(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  polygon(g.contour); g.cutouts.forEach(polygon);
  g.grooves.forEach(item => line(item, 'GROOVE')); g.folds.forEach(item => line(item, 'FOLD')); g.tape.forEach(item => line(item, 'FIXING'));
  for (const hole of g.drills) {
    entity(hole.diameter ? 'CIRCLE' : 'POINT', 'DRILL', hole.diameter ? 'AcDbCircle' : 'AcDbPoint');
    pairs(10, hole.x, 20, hole.y, 30, 0);
    if (hole.diameter) pairs(40, n(hole.diameter / 2));
    label(`F${hole.number}${hole.diameter ? ` D${hole.diameter}` : ' D?'}`, hole.x + 5, hole.y + 5);
  }
  for (const gLine of g.grooves.filter(l=>l.number)) label(`${gLine.edge} D${gLine.number} ${gLine.angle}deg ${gLine.direction}`, (gLine.x1+gLine.x2)/2+3, (gLine.y1+gLine.y2)/2+3, 'TEXT', 5);
  const title = `${piece.id} R${meta.revision} ${meta.side}`;
  line({x1:0,y1:0,x2:20,y2:0}, 'DIMENSIONS'); line({x1:0,y1:0,x2:0,y2:20}, 'DIMENSIONS'); label('0,0', 1, -6, 'DIMENSIONS', 4); label('+X', 21, 0, 'DIMENSIONS', 4); label('+Y', 0, 21, 'DIMENSIONS', 4);
  label(title, 0, g.height + 25); label(meta.status, 0, g.height + 12, 'TEXT', 6);
  label(`${g.width} x ${g.height} mm | scale 1:1 | ${meta.fabricationProfile}`, 0, -15, 'DIMENSIONS');
  if (g.directional) {
    const from = g.width * (g.direction > 0 ? .2 : .8), to = g.width * (g.direction > 0 ? .8 : .2), y = g.height / 2;
    line({ x1: from, y1: y, x2: to, y2: y }, 'TEXT');
    line({ x1: to, y1: y, x2: to - 12 * g.direction, y2: y + 6 }, 'TEXT');
    line({ x1: to, y1: y, x2: to - 12 * g.direction, y2: y - 6 }, 'TEXT');
    label('SENTIDO DO ACABAMENTO', Math.min(from, to), y + 12);
  }
  pairs(0, 'ENDSEC', 0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

function assertRevision(project, result, nesting, allowNoNesting = false) {
  if (!result?.valid || !Array.isArray(result.pieces)) throw new Error('Corrija as inconsistências do projeto antes de gerar documentos.');
  for (const piece of result.pieces) metadata(piece, { project });
  if (nesting == null && allowNoNesting) return;
  if (!nesting || !Array.isArray(nesting.sheets) || !Array.isArray(nesting.unplaced)) throw new Error('Calcule o plano de corte antes de gerar documentos.');
  const pieces = new Map(result.pieces.map(piece => [piece.id, piece])), located = new Set();
  for (const sheet of nesting.sheets) for (const p of sheet.placements) {
    const piece = pieces.get(p.pieceId);
    if (!piece || located.has(p.pieceId)) throw new Error('Plano de corte incompatível com as peças desta revisão.');
    const width = p.rotated ? piece.blank.height : piece.blank.width, height = p.rotated ? piece.blank.width : piece.blank.height;
    if (![p.x, p.y, p.width, p.height, sheet.width, sheet.length].every(finite) || Math.abs(p.width - width) > .001 || Math.abs(p.height - height) > .001) throw new Error('Plano de corte desatualizado. Recalcule esta revisão.');
    located.add(p.pieceId);
  }
  for (const p of nesting.unplaced) {
    if (!pieces.has(p.pieceId) || located.has(p.pieceId)) throw new Error('Plano de corte incompatível com esta revisão.');
    located.add(p.pieceId);
  }
  if (located.size !== pieces.size) throw new Error('O plano de corte não contém todas as peças.');
}
const safeCSV = value => {
  let valueText = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(valueText) || /^[\t\r\n]/.test(valueText)) valueText = `'${valueText}`;
  return `"${valueText.replace(/"/g, '""')}"`;
};
function materialRows(project, result, nesting) {
  const t = result.totals;
  const quantities = [
    ['Peças ACM', result.pieces.length, 'un'],
    ['Área visível instalada', t.visibleArea / 1e6, 'm²'],
    ['Área desenvolvida', t.developedArea / 1e6, 'm²'],
    ['Área bruta consumida', nesting.grossArea / 1e6, 'm²'],
    [`Metalon instalado ${project.structure.profile}`, t.metalLength / 1000, 'm'],
    ['Barras de metalon', result.structure.bars.length, 'un'],
  ].map(([item, quantity, unit]) => ({ item, quantity, unit, unitCost: null, total: null, informational: true }));
  return [...estimateCosts(project, result, nesting).items.map(item => ({ item: item.name, quantity: item.quantity, unit: item.unit, unitCost: item.price, total: item.total })), ...quantities];
}
export function materialsCSV(project, result, nesting) {
  assertRevision(project, result, nesting);
  const rows = [['Projeto', 'Revisão', 'Item', 'Quantidade', 'Unidade', 'Custo unitário BRL', 'Custo parcial BRL', 'Situação']];
  const budget = estimateCosts(project, result, nesting);
  for (const r of materialRows(project, result, nesting)) rows.push([project.name, project.revision, r.item, n(r.quantity), r.unit, r.unitCost ?? '', r.total == null ? '' : n(r.total), r.informational ? 'Quantidade técnica' : r.unitCost == null ? 'Preço não informado' : 'Estimativa']);
  rows.push([project.name, project.revision, 'Soma dos custos disponíveis', '', 'BRL', '', n(budget.known), budget.complete ? 'Estimativa pelos preços informados' : 'Estimativa incompleta']);
  for (const note of budget.notes ?? []) rows.push([project.name, project.revision, note, '', '', '', '', 'Critério de custo']);
  for (const warning of [...(result.errors ?? []), ...(result.warnings ?? [])]) rows.push([project.name, project.revision, `Pendência: ${warning.message}`, '', '', '', '', warning.code]);
  for (const p of nesting.unplaced) rows.push([project.name, project.revision, `Peça sem chapa: ${p.pieceId}`, '', '', '', '', p.reason]);
  return '\uFEFF' + rows.map(r => r.map(safeCSV).join(';')).join('\r\n') + '\r\n';
}

function nestingSVG(sheet, pieces) {
  const labels = [], shapes = [];
  for (const p of sheet.placements) {
    const piece = pieces.get(p.pieceId), g = documentGeometry(piece);
    // A 90-degree rotation maps (x,y) -> (height-y,x), keeping the lower-left envelope.
    const transform = p.rotated ? `translate(${n(p.x + g.height)} ${n(p.y)}) rotate(90)` : `translate(${n(p.x)} ${n(p.y)})`;
    shapes.push(`<g transform="${transform}"><path d="${pathData(g.contour)}" fill="${color(piece.material.color)}" fill-opacity="0.3" stroke="#000000" stroke-width="2"/>${g.cutouts.map(points => `<path d="${pathData(points)}" fill="white" stroke="#000000" stroke-width="2"/>`).join('')}<g stroke="#ff0000" stroke-width="2">${svgLines(g.grooves)}</g><g stroke="#0000ff" stroke-width="2">${g.drills.map(h=>h.diameter?`<circle cx="${n(h.x)}" cy="${n(h.y)}" r="${n(h.diameter/2)}" fill="white"/>`:`<path d="M ${n(h.x-3)} ${n(h.y)} h 6 M ${n(h.x)} ${n(h.y-3)} v 6" fill="none" data-diameter="unspecified"/>`).join('')}</g></g>`);
    labels.push(`<text x="${n(p.x + p.width / 2)}" y="${n(sheet.length - p.y - p.height / 2)}" font-size="35" text-anchor="middle">${text(piece.id)}${p.rotated ? ' ↻' : ''}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(sheet.width)} ${n(sheet.length)}" role="img" aria-label="${text(`Plano ${sheet.id}`)}"><rect width="${n(sheet.width)}" height="${n(sheet.length)}" fill="#fafafa" stroke="#475569" stroke-width="4"/><g transform="translate(0 ${n(sheet.length)}) scale(1 -1)">${shapes.join('')}</g><g fill="#111827" font-family="sans-serif">${labels.join('')}</g></svg>`;
}
function technicalFacePath(piece) {
  return pathData(piece.blank.contour.map(([x,y])=>[x+piece.x,y+piece.y])) + (piece.blank.holes??[]).map(h=>{
    const x=h.x+piece.x,y=h.y+piece.y,r=h.diameter/2;
    return ` M ${n(x-r)} ${n(y)} a ${n(r)} ${n(r)} 0 1 0 ${n(2*r)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-2*r)} 0 Z`;
  }).join('');
}
function surfaceSVG(surface, pieces) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -15 ${n(surface.width + 30)} ${n(surface.height + 30)}" role="img" aria-label="${text(surface.label)}"><g transform="translate(0 ${n(surface.height)}) scale(1 -1)">${pieces.filter(p => p.surface === surface.id).map(p => p.technical ? `<path d="${technicalFacePath(p)}" fill-rule="evenodd" fill="${color(p.material.color)}" stroke="#fff" stroke-width="2"/>` : `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.width)}" height="${n(p.height)}" fill="${color(p.material.color)}" stroke="#fff" stroke-width="2"/>`).join('')}</g>${pieces.filter(p => p.surface === surface.id).map(p => `<text x="${n(p.x + p.width / 2)}" y="${n(surface.height - p.y - p.height / 2)}" text-anchor="middle" fill="#111827" stroke="white" stroke-width="1" paint-order="stroke" font-family="sans-serif" font-size="${Math.max(15, surface.width / 110)}">${text(p.id)}</text>`).join('')}</svg>`;
}

export const MAX_REPORT_PREVIEW_BYTES = 10 * 1024 * 1024;
/** Only a bounded PNG payload captured from the same project/revision can enter the document. */
function reportPreview(preview, project) {
  if (preview == null) return '';
  if (typeof preview !== 'object' || Array.isArray(preview) || preview.projectId !== project.id || preview.revision !== project.revision) throw new Error('A imagem comercial pertence a outro projeto ou revisão. Capture novamente.');
  const url = preview.dataUrl, prefix = 'data:image/png;base64,';
  if (typeof url !== 'string' || !url.startsWith(prefix)) throw new Error('A apresentação aceita somente uma imagem PNG incorporada, sem endereço externo.');
  if (url.length > MAX_REPORT_PREVIEW_BYTES) throw new Error('A imagem comercial excede 10 MiB.');
  const encoded = url.slice(prefix.length);
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Conteúdo PNG inválido.');
  let binary;
  try { binary = atob(encoded); } catch { throw new Error('Conteúdo PNG inválido.'); }
  const bytes = [...'\x89PNG\r\n\x1a\n'].map(character => character.charCodeAt(0));
  if (binary.length < 45 || bytes.some((byte, i) => binary.charCodeAt(i) !== byte)) throw new Error('Assinatura PNG inválida.');
  const uint32 = offset => binary.charCodeAt(offset) * 16777216 + binary.charCodeAt(offset + 1) * 65536 + binary.charCodeAt(offset + 2) * 256 + binary.charCodeAt(offset + 3);
  let offset = 8, header = false, pixels = false, ended = false;
  while (offset + 12 <= binary.length) {
    const size = uint32(offset), type = binary.slice(offset + 4, offset + 8);
    if (size > binary.length - offset - 12 || !/^[A-Za-z]{4}$/.test(type)) throw new Error('Estrutura PNG inválida.');
    if (!header) {
      if (type !== 'IHDR' || size !== 13) throw new Error('Cabeçalho PNG inválido.');
      const width = uint32(offset + 8), height = uint32(offset + 12);
      if (!width || !height || width > 12000 || height > 12000 || width * height > 36000000) throw new Error('Dimensões da imagem PNG excedem o limite permitido.');
      header = true;
    } else if (type === 'IHDR') throw new Error('Cabeçalho PNG duplicado.');
    if (type === 'IDAT') pixels = true;
    offset += size + 12;
    if (type === 'IEND') { if (size || offset !== binary.length) throw new Error('Final PNG inválido.'); ended = true; break; }
  }
  if (!header || !pixels || !ended) throw new Error('Imagem PNG incompleta.');
  return `<figure class="commercial-preview" data-project-id="${text(project.id)}" data-revision="${project.revision}"><img src="${text(url)}" alt="${text(`Simulação 3D de ${project.name}, revisão ${project.revision}`)}"><figcaption>Vista 3D do estudo · R${project.revision}. Representa a vista capturada, que pode ser montada, explodida ou aberta. Cores e reflexos dependem da tela; confira a amostra comercial.</figcaption></figure>`;
}

const vector = value => Array.isArray(value) && value.length === 3 && value.every(finite);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
/** Project world-space supports onto each engine surface; fixing coordinates are already face-local. */
export function assemblyFaceGeometry(surface, result) {
  if (!surface?.transform) return null;
  const { origin, u, v } = surface.transform;
  if (![origin, u, v].every(vector) || Math.abs(dot(u, u) - 1) > .00001 || Math.abs(dot(v, v) - 1) > .00001 || Math.abs(dot(u, v)) > .00001 || !finite(surface.width) || !finite(surface.height) || surface.width <= 0 || surface.height <= 0) throw new Error('Referência de montagem da face inválida.');
  const local = point => {
    if (!vector(point)) throw new Error('Coordenada de estrutura inválida no mapa de montagem.');
    const delta = point.map((value, i) => value - origin[i]);
    return [n(dot(delta, u)), n(dot(delta, v))];
  };
  const pieces = result.pieces.filter(piece => piece.surface === surface.id), referenced = new Set();
  const tape = [], screws = [];
  for (const piece of pieces) {
    [piece.x, piece.y, piece.width, piece.height].forEach(n);
    for (const item of piece.fixings?.tape ?? []) {
      if (!finite(item.width) || item.width <= 0) throw new Error('Largura da fita inválida no mapa de montagem.');
      if (item.supportId) referenced.add(item.supportId);
      tape.push({ pieceId: piece.id, supportId: item.supportId ?? null, width: n(item.width), x1: n(piece.x + item.x1), y1: n(piece.y + item.y1), x2: n(piece.x + item.x2), y2: n(piece.y + item.y2) });
    }
    for (const [i, item] of (piece.fixings?.screws ?? []).entries()) {
      if(item.coordinateSpace==='blank') continue;
      if (item.supportId) referenced.add(item.supportId);
      screws.push({ pieceId: piece.id, supportId: item.supportId ?? null, number: item.number ?? i + 1, x: n(piece.x + item.x), y: n(piece.y + item.y) });
    }
  }
  const supports = (result.structure?.segments ?? []).filter(segment => segment.surface === surface.id || !segment.surface && referenced.has(segment.id)).map(segment => {
    const [x1, y1] = local(segment.start), [x2, y2] = local(segment.end);
    const contour = Array.isArray(segment.contour) ? segment.contour.map(point => { if (!Array.isArray(point) || point.length !== 2) throw new Error('Contorno de estrutura inválido.'); return point.map(n); }) : null;
    return { id: segment.id, profile: segment.profile, width: finite(segment.width) && segment.width > 0 ? segment.width : null, contour, x1, y1, x2, y2 };
  });
  const available = new Set(supports.map(support => support.id));
  return { surfaceId: surface.id, width: surface.width, height: surface.height, pieces, supports, tape, screws, unprojectedScrews: pieces.reduce((sum,p)=>sum+(p.fixings?.screws??[]).filter(h=>h.coordinateSpace==='blank').length,0), missingSupports: [...referenced].filter(id => !available.has(id)) };
}

export function assemblyFaceSVG(surface, geometry) {
  const g = geometry, font = Math.max(12, Math.min(g.width, g.height) / 25), margin = font * 2;
  const labels = [], rectangles = g.pieces.map(piece => {
    labels.push(`<text x="${n(piece.x + piece.width / 2)}" y="${n(g.height - piece.y - piece.height / 2)}" text-anchor="middle">${text(piece.id)}</text>`);
    if (piece.technical) return `<path data-piece-id="${text(piece.id)}" d="${technicalFacePath(piece)}" fill-rule="evenodd" fill="${color(piece.material.color)}" fill-opacity="0.12" stroke="#94a3b8" stroke-width="2"/>`;
    return `<rect data-piece-id="${text(piece.id)}" x="${n(piece.x)}" y="${n(piece.y)}" width="${n(piece.width)}" height="${n(piece.height)}" fill="${color(piece.material.color)}" fill-opacity="0.12" stroke="#94a3b8" stroke-width="2"/>`;
  });
  const supports = g.supports.map(line => {
    labels.push(`<text x="${n((line.x1 + line.x2) / 2 + font / 3)}" y="${n(g.height - (line.y1 + line.y2) / 2 - font / 3)}" fill="#334155">${text(line.id)}</text>`);
    return line.contour ? `<path data-support-id="${text(line.id)}" d="${pathData(line.contour)}" fill="#cbd5e1" stroke="#000000" stroke-width="1"/>` : `<line data-support-id="${text(line.id)}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="#64748b" stroke-width="${n(line.width ?? 2)}" opacity="0.65"/>`;
  });
  const tape = g.tape.map(line => `<line data-piece-id="${text(line.pieceId)}" data-fixing-support="${text(line.supportId)}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="#15803d" stroke-width="${line.width}"/>`);
  const screws = g.screws.map(point => {
    labels.push(`<text x="${n(point.x + font / 3)}" y="${n(g.height - point.y - font / 3)}" font-size="${n(font * .7)}" fill="#1d4ed8">${text(`${point.pieceId}/F${point.number}`)}</text>`);
    return `<circle data-piece-id="${text(point.pieceId)}" data-fixing-support="${text(point.supportId)}" cx="${point.x}" cy="${point.y}" r="${n(font / 6)}" fill="#0000ff"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${n(g.width + margin * 2)} ${n(g.height + margin * 2)}" role="img" aria-label="${text(`Mapa de montagem de ${surface.label}`)}" data-surface="${text(surface.id)}" data-units="mm"><g transform="translate(0 ${n(g.height)}) scale(1 -1)">${rectangles.join('')}<g data-layer="supports">${supports.join('')}</g><g data-layer="tape">${tape.join('')}</g><g data-layer="screws">${screws.join('')}</g></g><g font-family="sans-serif" font-size="${n(font)}" fill="#111827" stroke="white" stroke-width="1" paint-order="stroke">${labels.join('')}</g></svg>`;
}


export function claddingDescription(project) {
 const c=project.cladding??{},forms={tray:'Bandeja dobrada',flat:'Painel plano',wrap:'Encapamento'},joints={dry:'Junta seca',sealed:'Junta selada',butt:'Junta de topo'},exposure={indoor:'Interno',outdoor:'Externo'};
 return `${forms[c.panelForm]??'Forma não informada'} · ${joints[c.joint]??'Junta não informada'} · ${exposure[c.exposure]??'Exposição não informada'} · ${c.fixingConfirmed?'Fixação escolhida':'Escolha da fixação pendente'}`;
}
function titleBlock(project) {
  const b = project.titleBlock ?? {};
  return `<p>${text(claddingDescription(project))}</p>` + table(['Desenho', 'Cliente / obra', 'Elaborado / conferido', 'Data / revisão'], [[b.drawingNumber || 'Não informado', `${b.client || 'Não informado'} / ${b.site || 'Não informado'}`, `${b.designedBy || 'Não informado'} / ${b.checkedBy || 'Não informado'}`, `${b.date || 'Não informada'} / R${project.revision}`]]) + (b.revisionNotes ? `<p>Revisão: ${text(b.revisionNotes)}</p>` : '');
}
function structureLine(segment, bars) {
  const bar = bars.find(b => b.cuts.some(c => c.id === segment.id));
  return [segment.id, segment.material || 'Não informado', segment.gauge || 'Não informada', `${fmt(segment.profileSpec?.width ?? segment.width)} × ${fmt(segment.profileSpec?.depth ?? segment.depth)} mm`, segment.wall == null ? 'Parede não informada' : `${fmt(segment.wall)} mm`, `${fmt(segment.faceWidth ?? segment.width)} mm apoio × ${fmt(segment.depth)} mm profundidade`, fmt(segment.longLength ?? segment.length), 1, `${segment.angleA ?? 90}° / ${segment.angleB ?? 90}°`, segment.joint || 'Não detalhada', segment.sku || 'Sem código', bar?.id || 'Sem barra'];
}
const STRUCTURE_HEADERS = ['Peça', 'Material', 'Chapa / bitola', 'DIM (mm)', 'Parede', 'Orientação', 'Medida ponta longa (mm)', 'QTD', 'Corte A / B', 'União', 'SKU', 'Barra'];
export function structureCSV(project, result, nesting) {
  assertRevision(project, result, nesting, true);
  const rows = [['Projeto', 'Revisão', ...STRUCTURE_HEADERS, 'Ponta curta (mm)', 'Estoque (mm)', 'Refilo início / fim (mm)', 'Perda de serra (mm)', 'Sobra (mm)', 'Sequência na barra', 'Início na barra (mm)', 'Fim na barra (mm)', 'Ângulo A (graus)', 'Ângulo B (graus)', 'Início X,Y,Z (mm)', 'Fim X,Y,Z (mm)']];
  for (const segment of result.structure.segments ?? []) {
    const bar = result.structure.bars.find(b => b.cuts.some(c => c.id === segment.id));
    const index = bar?.cuts.findIndex(c => c.id === segment.id) ?? -1, cut = bar?.cuts[index];
    const start = cut?.start ?? (bar ? (bar.trimStart ?? 0) + bar.cuts.slice(0,index).reduce((sum,c)=>sum+c.length,0) + Math.max(0,index)*(bar.kerf??0) : null);
    rows.push([project.name, project.revision, ...structureLine(segment, result.structure.bars), n(segment.shortLength ?? segment.length), bar?.length ?? '', bar ? `${bar.trimStart ?? 0} / ${bar.trimEnd ?? 0}` : '', bar ? n(bar.cuts.some(c => c.kerfAfter != null) ? bar.cuts.reduce((sum, c) => sum + (c.kerfBefore ?? 0) + (c.kerfAfter ?? 0), 0) + (bar.trimKerfStart ?? 0) + (bar.trimKerfEnd ?? 0) : Math.max(0, bar.used - bar.cuts.reduce((sum, cut) => sum + cut.length, 0) - (bar.trimStart ?? 0))) : '', bar?.waste ?? '', cut?.sequence ?? (index >= 0 ? index + 1 : ''), start ?? '', cut?.end ?? (start != null ? start + cut.length : ''), segment.angleA ?? 90, segment.angleB ?? 90, segment.start.join(', '), segment.end.join(', ')]);
  }
  return '\uFEFF' + rows.map(r => r.map(safeCSV).join(';')).join('\r\n') + '\r\n';
}
export function routerCSV(project, result, nesting) {
  assertRevision(project, result, nesting);
  const rows = [['Projeto', 'Revisão', 'Peça', 'Face de usinagem', 'Operação', 'Cor', 'Início X mm', 'Início Y mm', 'Fim X mm', 'Fim Y mm', 'Diâmetro mm', 'Referência']];
  rows.push([project.name,project.revision,'','', 'SISTEMA INFORMADO','','','','','','',claddingDescription(project)]);
  for (const piece of result.pieces) {
    const g = documentGeometry(piece, { back: true }), prefix = [project.name, project.revision, piece.id, 'VERSO'];
    for (const [index, polygon] of [g.contour, ...g.cutouts].entries()) for (const [i, a] of polygon.entries()) { const b = polygon[(i + 1) % polygon.length]; rows.push([...prefix, 'CUT', 'Preto', ...a, ...b, '', index ? `Recorte ${index}` : 'Contorno']); }
    for (const line of g.grooves) rows.push([...prefix, 'GROOVE / FRESA', 'Vermelho', line.x1, line.y1, line.x2, line.y2, '', `${line.edge || 'Importado'}${line.number ? ` · D${line.number} · ${line.angle}° · ${line.direction} · compensação ${line.compensation} mm` : ''}`]);
    for (const hole of g.drills) rows.push([...prefix, hole.diameter ? 'DRILL' : 'MARCADOR INFORMATIVO', 'Azul', hole.x, hole.y, '', '', hole.diameter ?? '', `F${hole.number}${hole.edge ? ` · aba ${hole.edge} D${hole.foldNumber} · cantoneira/apoio não definido` : ''}`]);
  }
  return '\uFEFF' + rows.map(r => r.map(safeCSV).join(';')).join('\r\n') + '\r\n';
}

/** True end-cut profile: no invented wall/gauge conversion. Detail views retain the stated cut angles. */
export function structureCutSVG(segment) {
  const length = segment.longLength ?? segment.length, width = segment.faceWidth ?? segment.width;
  if (![length, width].every(finite) || length <= 0 || width <= 0) return '<p>Geometria do perfil não informada.</p>';
  const angleA = segment.angleA ?? 90, angleB = segment.angleB ?? 90;
  if (![angleA, angleB].every(angle => finite(angle) && angle > 0 && angle <= 90)) throw new Error('Ângulo de corte inválido no caderno de serralheria.');
  const reduction = angle => angle === 90 ? 0 : width / Math.tan(angle * Math.PI / 180);
  const a = reduction(angleA), b = reduction(angleB), short = segment.shortLength ?? length - a - b;
  const font = Math.max(10, length / 55), margin = font * 2, height = width + font * 6;
  const profile = `<path d="M 0 0 H ${n(length)} L ${n(length - b)} ${n(width)} H ${n(a)} Z" fill="#e2e8f0" stroke="#000000" stroke-width="${n(font / 12)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${text(`Cortes reais ${segment.id}`)}" viewBox="${-margin} ${-margin} ${n(length + margin * 2)} ${n(height + margin)}" data-segment="${text(segment.id)}" data-angle-a="${n(angleA)}" data-angle-b="${n(angleB)}">${profile}<g fill="#111827" font-family="sans-serif" font-size="${n(font)}"><text x="0" y="${n(-font / 2)}">A · ${n(angleA)}°</text><text x="${n(length)}" y="${n(-font / 2)}" text-anchor="end">B · ${n(angleB)}°</text><text x="${n(length / 2)}" y="${n(width + font * 1.5)}" text-anchor="middle">Longa ${n(length)} / curta ${n(short)} mm · apoio ${n(width)} mm</text><text x="${n(length / 2)}" y="${n(width + font * 3)}" text-anchor="middle">${text(segment.id)} · ${text(segment.joint || 'União não detalhada')}</text></g></svg>`;
}
function barStockSVG(bar) {
  const length = bar.length, knownWidth = bar.cuts.find(c=>finite(c.faceWidth)&&c.faceWidth>0)?.faceWidth;
  const h = knownWidth ?? Math.max(30,length/35), font = Math.max(10,length/160);
  if (!finite(length) || length <= 0) throw new Error('Comprimento da barra inválido.');
  let cursor = bar.trimStart ?? 0;
  const shapes = [], labels = [];
  for (const [i, cut] of bar.cuts.entries()) {
    const start = finite(cut.start) ? cut.start : cursor + (i ? bar.kerf ?? 0 : 0), end = start + cut.length;
    if (start < 0 || end > length + .01) throw new Error('Plano de barras fora do estoque disponível.');
    const width = cut.faceWidth, detailed = finite(width) && width > 0 && finite(cut.angleA) && finite(cut.angleB);
    if (detailed) {
      const a = cut.angleA === 90 ? 0 : width / Math.tan(cut.angleA*Math.PI/180), b = cut.angleB === 90 ? 0 : width / Math.tan(cut.angleB*Math.PI/180);
      shapes.push(`<path d="M ${n(start)} 0 H ${n(end)} L ${n(end-b)} ${n(width)} H ${n(start+a)} Z" fill="#dbeafe" stroke="#111827" stroke-width="2" data-angle-a="${cut.angleA}" data-angle-b="${cut.angleB}"/>`);
    } else shapes.push(`<rect x="${n(start)}" y="0" width="${n(cut.length)}" height="${n(h)}" fill="#dbeafe" stroke="#111827" stroke-width="2"/>`);
    labels.push(`<text x="${n((start + end) / 2)}" y="${n(h + font * 1.2)}" text-anchor="middle">${text(cut.id)}</text>`); cursor = end;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${text(`Plano de corte ${bar.id}`)}" viewBox="0 -5 ${n(length)} ${n(h+font*4)}"><rect width="${n(length)}" height="${n(h)}" fill="#fef3c7" stroke="#111827" stroke-width="2"/>${shapes.join('')}<g font-family="sans-serif" fill="#111827" font-size="${n(font)}">${labels.join('')}<text x="0" y="${n(h+font*3)}">${text(bar.id)} · ${bar.source === 'remnant' ? 'retalho' : 'barra comercial'} · ${n(length)} mm · sobra ${n(bar.waste)} mm</text></g></svg>`;
}

/** Nominal finished section, independently shown for each edge. Radius and skins are not inferred. */
export function foldSectionSVG(piece) {
  return Object.entries(piece.blank.profiles ?? {}).filter(([,p])=>p.operations.length).map(([edge,profile])=>{
    const points=profile.points.map(p=>[p.x,-p.z]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(0,...xs),minY=Math.min(0,...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY,pad=10;
    const line=points.map(([x,y],i)=>`${i?'L':'M'} ${n(x)} ${n(y)}`).join(' ');
    return `<figure class="fold-section"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${text(`Seção nominal ${edge}`)}" viewBox="${n(minX-pad)} ${n(minY-pad)} ${n(width+pad*2)} ${n(height+pad*2)}"><path d="M -8 0 H 0" stroke="#000000" fill="none" stroke-width="1"/><path d="${line}" stroke="#2563eb" fill="none" stroke-width="1"/>${points.slice(0,-1).map(([x,y],i)=>`<circle cx="${n(x)}" cy="${n(y)}" r="1" fill="#dc2626"/><text x="${n(x+2)}" y="${n(y-2)}" font-size="4">D${i+1}</text>`).join('')}</svg><figcaption>${text(edge)} · seção nominal; x positivo para fora, verso para baixo.</figcaption></figure>`;
  }).join('');
}

function productCards(result, project) {
  const catalog = new Map();
  for (const piece of result.pieces) {
    const fixing = piece.fixing ?? project.fixing;
    for (const key of ['screwProduct', 'tapeProduct']) {
      if (key === 'screwProduct' && fixing.type === 'tape' || key === 'tapeProduct' && fixing.type === 'screws') continue;
      const p = key === 'tapeProduct' ? { width: fixing.tapeWidth, thickness: fixing.thickness, ...fixing[key] } : fixing[key] ?? {}, fingerprint = JSON.stringify([key, p, fixing.product]);
      if (!catalog.has(fingerprint)) catalog.set(fingerprint, { kind: key, product: p, pieces: [], legacyName: fixing.product });
      catalog.get(fingerprint).pieces.push(piece.id);
    }
  }
  return [...catalog.values()].map(({ kind, product: p, pieces, legacyName }) => {
    const screw = kind === 'screwProduct';
    const image = isSafeFixingPhoto(p.photoDataUrl) ? `<img src="${text(p.photoDataUrl)}" alt="${text(`Foto cadastrada ${p.manufacturer || ''} ${p.code || p.name || ''}`)}"><p>Foto enviada pelo usuário · ${text(p.photoSource || 'origem não informada')}</p>` : '<p class="notice">Foto real do produto não cadastrada.</p>';
    const fields = screw ? [['Cabeça', p.head], ['Diâmetro nominal', p.nominalDiameter == null ? null : `${fmt(p.nominalDiameter)} mm`], ['Comprimento', p.length == null ? null : `${fmt(p.length)} mm`], ['Material / proteção', `${p.material || 'Não informado'} / ${p.coating || 'Não informado'}`], ['Arruela', p.washer], ['Furo especificado', p.drillDiameter == null ? 'Não informado; somente marcador' : `${fmt(p.drillDiameter)} mm`]] : [['Largura / espessura', `${fmt(p.width)} / ${fmt(p.thickness)} mm`], ['Rolo', p.rollLength == null ? null : `${fmt(p.rollLength / 1000)} m`], ['Perda de compra', p.wastePercent == null ? 'Não informada' : `${fmt(p.wastePercent)}%`], ['Preparação', p.preparation], ['Substrato', p.surface]];
    return `<article class="product-card"><h2>${screw ? 'Parafuso' : 'Fita'} · ${text(p.manufacturer || 'Fabricante não informado')} / ${text(p.code || 'Código não informado')}</h2><p>${text(p.name || legacyName || 'Nome não informado')} · função: ${text(p.function || 'ACM → estrutura')}</p>${image}${table(['Característica', 'Cadastro'], fields.map(([label, value]) => [label, value || 'Não informado']))}<p>Peças: ${text(pieces.join(', '))}.</p><p>Foto e cadastro não comprovam dimensões, capacidade ou compatibilidade. Conferir ficha do produto e validação técnica.</p></article>`;
  }).join('');
}

/** Standalone printable HTML. No script, external fetch, remote fonts, or unescaped user markup. */
export function projectReportHTML(project, result, nesting, { previewImage, discipline = 'all' } = {}) {
  assertRevision(project, result, nesting, ['serralheria', 'producao-metalon'].includes(discipline));
  const noNesting = nesting == null;
  nesting ??= {sheets:[],unplaced:[],errors:[],grossArea:0,usedArea:0,wasteArea:0,utilization:0,method:'Plano de chapas não calculado; caderno exclusivo de serralheria.'};
  if (!['all', 'serralheria', 'router', 'montagem', 'apresentacao', 'producao-metalon', 'producao-acm'].includes(discipline)) throw new Error('Caderno solicitado inválido.');
  const preview = reportPreview(previewImage, project);
  const pieces = new Map(result.pieces.map(piece => [piece.id, piece]));
  const status = project.assemblyMode === 'wrap' ? 'ESTUDO NOMINAL DE ENCAPAMENTO · RASCUNHO' : result.calibration?.valid === true && result.pieces.every(piece => piece.calibrated === true) ? 'CALIBRAÇÃO REGISTRADA · REVISÃO A CONFERIR' : 'RASCUNHO · FABRICAÇÃO NÃO CALIBRADA';
  const heading = subtitle => `<header><div><strong>IMPRESILK ACM STUDIO</strong><p>${text(project.name)} · ${text(subtitle)}</p></div><div class="stamp">R${project.revision}<small>${text(status)}</small></div></header>${titleBlock(project)}`;
  const warningList = [...(result.warnings ?? []).map(w => w.message), ...nesting.unplaced.map(p => `${p.pieceId}: ${p.reason}`)];
  const materials = materialRows(project, result, nesting);
  const budget = estimateCosts(project, result, nesting);
  const knownCost = budget.known;
  const sections = [];
  const add = (kind, html) => { if (discipline === 'all' || discipline === kind) sections.push(html.replace('<section>', `<section data-discipline="${kind}">`)); };
  if (discipline.startsWith('producao-')) {
    const summary=discipline==='producao-metalon'?metalProductionSummary(result):acmProductionSummary(project,result,noNesting?null:nesting);
    const productionTable=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${text(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr style="background:${r.color}">${r.cells.map(cell=>`<td>${text(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    add(discipline,`<section>${heading(summary.title)}<h1>${text(summary.title)}</h1>${productionTable(summary.headers,summary.rows)}<h2>Resumo de consumo</h2>${productionTable(summary.consumptionHeaders,summary.consumptionRows)}${summary.notes.map(note=>`<p>${text(note)}</p>`).join('')}<p class="notice">${text(status)}. Resumo vinculado à revisão calculada. Conferir documentos detalhados, medidas de obra e liberação técnica.</p></section>`);
  }
  add('apresentacao', `<section>${heading('Apresentação e conferência')}<h1>Estudo de revestimento em ACM</h1>${preview}<p>Simulação visual. Medidas internas em mm; áreas em m². Cores e disponibilidade comercial devem ser conferidas na amostra e na ficha do fabricante.</p><div class="metrics"><b>${fmt(result.totals.visibleArea / 1e6)} m² instalados</b><b>${result.pieces.length} peças</b><b>${nesting.sheets.length} chapas/retalhos</b><b>${fmt(nesting.utilization)}% aproveitamento</b></div>${(result.surfaces ?? []).map(surface => `<figure class="facade">${surfaceSVG(surface, result.pieces)}<figcaption>${text(surface.label)} · ${fmt(surface.width)} × ${fmt(surface.height)} mm</figcaption></figure>`).join('')}<h2>Material e processo</h2>${table(['Fabricante / código', 'Cor / acabamento', 'Espessura', 'Perfil de fabricação'], [[`${project.material.manufacturer || 'Não informado'} / ${project.material.sku || 'Não informado'}`, `${project.material.colorId || project.material.color} / ${project.material.finish}`, `${project.material.thickness} mm`, project.fabrication.profileName || 'Configuração do projeto']])}<p class="notice">${text(status)}. Estrutura e fixações desenhadas e quantificadas; dimensionamento estrutural, ancoragem e validação de fabricação exigem conferência técnica.</p><h2>Pendências</h2><ul>${warningList.length ? warningList.map(w => `<li>${text(w)}</li>`).join('') : '<li>Revisar a primeira peça, montagem e documentos antes da fabricação.</li>'}</ul></section>`);
  if (!noNesting && !discipline.startsWith('producao-')) add(discipline === 'all' ? 'montagem' : discipline, `<section>${heading('Lista de materiais')}<h1>Quantitativos e custos informados</h1>${table(['Item', 'Quantidade', 'Unidade', 'Unitário (R$)', 'Parcial (R$)'], materials.map(r => [r.item, fmt(r.quantity, 3), r.unit, fmt(r.unitCost), fmt(r.total)]))}<p><strong>Soma dos custos disponíveis: R$ ${fmt(knownCost)}.</strong> ${!budget.complete ? 'Estimativa incompleta: há preços ou verificações pendentes.' : 'Estimativa pelos preços informados.'}</p><p>Aproveitamento = área desenvolvida / área bruta consumida. Área bruta: ${fmt(nesting.grossArea / 1e6)} m²; área desenvolvida: ${fmt(nesting.usedArea / 1e6)} m²; diferença: ${fmt(nesting.wasteArea / 1e6)} m². Não presume que toda diferença seja retalho reutilizável.</p><p>Estratégia de encaixe: ${text(nesting.method)}.</p>${(budget.notes ?? []).map(note => `<p>${text(note)}</p>`).join('')}</section>`);
  for (const piece of result.pieces) {
    const g = documentGeometry(piece), meta = metadata(piece, { project });
    add('router', `<section>${heading(`Router · Ficha de fabricação · ${piece.id}`)}<h1>${text(piece.id)} · ${text(piece.surface)}</h1><div class="piece-drawing">${pieceSVG(piece, { project, back: true })}</div><p class="legend">Corte preto (CUT) · Fresa vermelha (GROOVE) · Dobra azul tracejada · Furação azul · Fita verde. Linhas de dobra, cotas e identificação são informativas.</p>${table(['Acabada', 'Desenvolvimento', 'Material', 'Posição na face'], [[`${fmt(piece.width)} × ${fmt(piece.height)} mm`, `${fmt(g.width)} × ${fmt(g.height)} mm`, `${piece.material.colorId || piece.material.color} / ${piece.material.finish} / ${piece.material.thickness} mm`, `x ${fmt(piece.x)}; y ${fmt(piece.y)} mm`]])}<p>${text(meta.status)} · ${text(meta.fabricationProfile)}. VERSO — USINAGEM; escala geométrica 1:1 no SVG/DXF, impressão ajustada à página. Origem inferior esquerda.</p><h2>Seções e sequência nominal</h2><div class="fold-sections">${foldSectionSVG(piece)}</div>${table(['Borda / operação','Segmento nominal','Ângulo / sentido','Compensação','Segmento desenvolvido'], Object.entries(piece.blank.profiles ?? {}).flatMap(([edge,profile])=>profile.operations.map(op=>[`${edge} D${op.number}`,`${fmt(op.length)} mm`,`${fmt(op.angle)}° / ${op.direction}`,`${fmt(op.compensation)} mm`,`${fmt(op.developedLength)} mm`])))}<p>Compensação descontada uma vez do segmento após cada eixo, no sentido da face para o recorte. Sentido back = verso; front = frente. Raios e interferências por espessura precisam de prova física.</p><h2>Eixos de usinagem e dobra</h2>${table(['Borda', 'Início x, y (mm)', 'Fim x, y (mm)'], g.grooves.map(l => [`${l.edge || 'Importado'}${l.number ? ` · D${l.number} · ${l.angle}° ${l.direction}` : ''}`, `${fmt(l.x1)}, ${fmt(l.y1)}`, `${fmt(l.x2)}, ${fmt(l.y2)}`]))}<p>Fresa: ${fmt(project.fabrication.toolAngle)}°; fundo ${fmt(project.fabrication.toolFlat)} mm; largura do canal ${fmt(project.fabrication.grooveWidth)} mm; profundidade ${fmt(project.fabrication.depth)} mm; núcleo residual ${fmt(project.fabrication.remainingCore)} mm. Núcleo residual é diferente da espessura total restante.</p><h2>Fixação · coordenadas no desenvolvimento</h2>${table(['Elemento', 'Posição / extensão (mm)', 'Parâmetro'], [...g.drills.map(h => [`F${h.number}${h.edge ? ` · aba ${h.edge} D${h.foldNumber}` : ''}`, `x ${fmt(h.x)}; y ${fmt(h.y)}`, h.diameter ? `Ø ${fmt(h.diameter)} mm` : 'Diâmetro a definir; ponto informativo']), ...g.tape.map((l, i) => [`Fita ${i + 1}`, `${fmt(l.x1)},${fmt(l.y1)} → ${fmt(l.x2)},${fmt(l.y2)}`, `Largura ${fmt(l.width)} mm`])])}<p>Furos automáticos estão nas abas. Cantoneira e conexão à estrutura são pendentes; a frente permanece íntegra. Fixações mostradas são a distribuição do modelo. Apoios, produto e critérios de instalação devem estar validados.</p></section>`);
  }
  for (const sheet of nesting.sheets) add('router', `<section>${heading(`Plano de corte · ${sheet.id}`)}<h1>${text(sheet.id)} · ${fmt(sheet.width)} × ${fmt(sheet.length)} mm</h1><div class="sheet-drawing">${nestingSVG(sheet, pieces)}</div><p>VERSO — USINAGEM · origem inferior esquerda; seta/rotação vinculada à peça. Refilo do estoque: ${fmt(sheet.trim ?? project.stock.trim)} mm; separação de corte ${fmt(project.stock.kerf)} mm. Não é programa CNC.</p>${table(['Peça', 'x (mm)', 'y (mm)', 'Largura × altura', 'Rotação'], sheet.placements.map(p => [p.pieceId, fmt(p.x), fmt(p.y), `${fmt(p.width)} × ${fmt(p.height)} mm`, p.rotated ? '90°' : '0°']))}</section>`);
  for (const surface of result.surfaces ?? []) {
    const geometry = assemblyFaceGeometry(surface, result);
    if (!geometry) continue;
    const supportRows = geometry.pieces.map(piece => {
      const tape = geometry.tape.filter(item => item.pieceId === piece.id), screws = geometry.screws.filter(item => item.pieceId === piece.id);
      const ids = [...new Set([...tape, ...screws].map(item => item.supportId).filter(Boolean))];
      return [piece.id, ids.join(', ') || 'Sem apoio informado', tape.length, screws.length, (piece.fixings?.screws ?? []).filter(h => h.coordinateSpace === 'blank').length];
    });
    add('montagem', `<section>${heading(`Mapa de montagem · ${surface.label}`)}<h1>${text(surface.label)} · estrutura e fixações</h1><p>Projeção na referência da face: x para a direita e y para cima, origem inferior esquerda, medidas em mm. Apoios e fixações no verso aparecem por transparência; a projeção não representa seus afastamentos em profundidade.</p><div class="assembly-map">${assemblyFaceSVG(surface, geometry)}</div><p class="legend">Cinza: perfis projetados com a largura informada, ou eixo quando ausente · verde: faixas de fita · azul: locais numerados de parafusos, com símbolo sem escala de diâmetro. Códigos MT identificam os segmentos da lista de estrutura.</p>${table(['Peça', 'Apoios do motor', 'Faixas de fita', 'Parafusos projetados', 'Parafusos nas abas (não projetados)'], supportRows)}${geometry.unprojectedScrews ? `<p class="notice">${geometry.unprojectedScrews} posição(ões) nas abas, omitidas desta projeção frontal. Consulte o desenvolvimento e a seção; ligação por cantoneiras não definida.</p>` : ''}${geometry.missingSupports.length ? `<p class="notice">Apoios referenciados sem geometria disponível: ${text(geometry.missingSupports.join(', '))}.</p>` : ''}<p>Arranjo geométrico para conferência. Preparação, produto, espaçamentos, ancoragens, interferências e sequência executiva exigem validação técnica da obra.</p></section>`);
  }
  add('serralheria', `<section>${heading('Serralheria')}<h1>Estrutura · lista de peças</h1><p>Medidas em mm. Ponta longa e ponta curta indicam as referências do corte. DIM e orientação informam o perfil e a face voltada ao ACM. Chapa / bitola é o cadastro informado, sem conversão presumida.</p>${table(STRUCTURE_HEADERS, (result.structure.segments ?? []).map(segment => structureLine(segment, result.structure.bars)))}<p class="notice">Estrutura geométrica; cargas, uniões, solda e ancoragens exigem dimensionamento e liberação técnica. Conferir as medidas na obra.</p></section>`);
  for (const surface of result.surfaces ?? []) {
    const face = assemblyFaceGeometry(surface, result);
    if (!face) continue;
    const frame = { ...face, pieces: [], tape: [], screws: [] }, drawing = assemblyFaceSVG(surface, frame);
    const span = Math.min(surface.width, surface.height, Math.max(120, Math.max(...frame.supports.map(s => s.width ?? 20)) * 5));
    const corners = [[0, surface.height - span, 'Inferior esquerdo'], [surface.width - span, surface.height - span, 'Inferior direito'], [0, 0, 'Superior esquerdo'], [surface.width - span, 0, 'Superior direito']];
    const closes = corners.map(([x, y, label]) => `<figure>${drawing.replace(/viewBox="[^"]+"/, `viewBox="${n(x)} ${n(y)} ${n(span)} ${n(span)}"`)}<figcaption>${label} · janela ${fmt(span)} × ${fmt(span)} mm</figcaption></figure>`).join('');
    add('serralheria', `<section>${heading(`Serralheria · quadro ${surface.label}`)}<h1>Quadro e encontros · ${text(surface.label)}</h1><div class="assembly-map">${drawing}</div><p>Projeção frontal dos perfis reais, com contorno das pontas quando definido no motor. As janelas abaixo ampliam a mesma geometria; cotas e comprimentos constam na lista de peças.</p><div class="joint-closes">${closes}</div><p>Confirme orientação dos perfis, folga, união e acesso à solda/ancoragem antes da fabricação.</p></section>`);
  }
  for (const segment of result.structure.segments ?? []) add('serralheria', `<section>${heading(`Serralheria · ${segment.id}`)}<h1>${text(segment.id)} · ${text(segment.profile)}</h1><div class="structure-cut">${structureCutSVG(segment)}</div>${table(['Grupo / face', 'Material / SKU', 'Parede / bitola', 'Orientação do apoio', 'União / folga'], [[`${segment.group || 'Apoio'} / ${segment.surface}`, `${segment.material || 'Não informado'} / ${segment.sku || 'Não informado'}`, `${fmt(segment.wall)} mm / ${segment.gauge || 'Não informada'}`, `${fmt(segment.faceWidth ?? segment.width)} × ${fmt(segment.depth)} mm`, `${segment.joint || 'Não detalhada'} / ${fmt(segment.gap)} mm`]])}<p>As extremidades A e B correspondem ao início e fim do segmento. Corte A: ${fmt(segment.angleA ?? 90)}°; corte B: ${fmt(segment.angleB ?? 90)}°. Longa: ${fmt(segment.longLength ?? segment.length)} mm; curta: ${fmt(segment.shortLength ?? segment.length)} mm.</p><p>Início: ${text(segment.start.map(v => fmt(v)).join(', '))}; fim: ${text(segment.end.map(v => fmt(v)).join(', '))} (x, y, z mm).</p><p>Medidas dos cortes vinculadas à geometria; posição da face longa, ajuste da serra e união devem ser conferidos na primeira peça.</p></section>`);
  for (const bar of result.structure.bars) add('serralheria', `<section>${heading(`Serralheria · barra ${bar.id}`)}<h1>Plano executável de barras · ${text(bar.id)}</h1><div class="bar-stock">${barStockSVG({...bar,cuts:bar.cuts.map(c=>({...c,faceWidth:result.structure.segments.find(s=>s.id===c.id)?.faceWidth??result.structure.segments.find(s=>s.id===c.id)?.width}))})}</div>${table(['Fonte', 'Material / perfil / SKU', 'Comprimento', 'Refilo início / fim', 'Usado', 'Sobra'], [[bar.source === 'remnant' ? 'Retalho' : 'Barra comercial', `${bar.material || 'Não informado'} / ${bar.profile || project.structure.profile} / ${bar.sku || bar.stockKey || 'Não informado'}`, `${fmt(bar.length)} mm`, `${fmt(bar.trimStart ?? 0)} / ${fmt(bar.trimEnd ?? 0)} mm`, `${fmt(bar.used)} mm`, `${fmt(bar.waste)} mm`]])}${table(['Ordem', 'Peça', 'Início', 'Fim', 'Ponta longa', 'Ponta curta', 'A / B', 'Serra antes / depois'], bar.cuts.map((cut, index) => [index + 1, cut.id, fmt(cut.start), fmt(cut.end), fmt(cut.longLength ?? cut.length), fmt(cut.shortLength ?? cut.length), `${cut.angleA ?? 90}° / ${cut.angleB ?? 90}°`, `${fmt(cut.kerfBefore ?? (index ? bar.kerf : 0))} / ${fmt(cut.kerfAfter ?? 0)} mm`]))}<p>Faixas azuis: peças; faixas livres: refilos, cortes de serra e sobra. A sobra só é reutilizável após conferir dimensão, identificação e qualidade. Nunca misturar material, parede ou SKU de estoques incompatíveis.</p></section>`);
  if (result.structure.unplaced?.length) add('serralheria', `<section>${heading('Serralheria · pendências')}<h1>Peças sem barra</h1><p class="notice">${text(result.structure.unplaced.map(item => typeof item === 'string' ? item : item.id || item.reason).join(', '))}</p><p>O plano de barras não atende todas as peças.</p></section>`);
  add('montagem', `<section>${heading('Montagem · produtos de fixação')}<h1>Catálogo cadastrado e quantidades</h1>${productCards(result, project)}${table(['Peça', 'Apoio', 'Função', 'Parafusos', 'Faixas de fita', 'Fita (m)'], fixingQuantities(result).map(item => [item.pieceId, item.supportId, item.role, item.screws, item.tapeBands, fmt(item.tapeLength / 1000)]))}<h2>Critérios por peça</h2>${table(['Peça', 'Tipo', 'Passo / borda (mm)', 'Fonte técnica', 'Responsável / data', 'Restrições', 'Conferência'], result.pieces.map(piece => { const f = piece.fixing ?? project.fixing, p = f.pattern ?? {}; return [piece.id, f.type, `${fmt(p.maxPitch ?? f.screwPitch)} / ${fmt(p.cornerOffset ?? f.edgeOffset)}`, p.source || 'Não informada', `${p.responsible || 'Não informado'} / ${p.validatedAt || 'Não informada'}`, `${p.constraints || 'Não informadas'}; borda mínima: ${fmt(p.minEdgeDistance)} mm`, f.validated ? 'Registro do padrão; não certifica estrutura' : 'Pendente']; }))}</section>`);
  add('montagem', `<section>${heading('Montagem e estrutura')}<h1>Localização, segmentos e barras</h1>${table(['Peça', 'Superfície', 'Posição x / y (mm)', 'Acabada (mm)'], result.pieces.map(p => [p.id, p.surface, `${fmt(p.x)} / ${fmt(p.y)}`, `${fmt(p.width)} × ${fmt(p.height)}`]))}<h2>Estrutura desenhada e quantificada</h2>${table(['Segmento', 'Perfil', 'Comprimento (mm)', 'Início → fim (x, y, z mm)'], (result.structure.segments ?? []).map(s => [s.id, s.profile, fmt(s.length), `${s.start.map(v => fmt(v)).join(', ')} → ${s.end.map(v => fmt(v)).join(', ')}`]))}<h2>Plano das barras</h2>${table(['Barra', 'Segmentos / comprimentos (mm)', 'Usado (mm)', 'Sobra (mm)'], result.structure.bars.map(b => [b.id, b.cuts.map(c => `${c.id}: ${fmt(c.length)}`).join('; '), fmt(b.used), fmt(b.waste)]))}<p>A ordem de instalação, as uniões, as ancoragens e o acesso às fixações precisam de detalhamento específico da obra. Este mapa apresenta a geometria calculada e não define uma sequência executiva.</p></section>`);
  add('montagem', `<section>${heading('Etiquetas')}<h1>Identificação das peças</h1><div class="labels">${result.pieces.map(piece => `<article class="label"><strong>${text(piece.id)}</strong><p>${text(project.name)} · R${project.revision}</p><p>${text(piece.surface)} · x ${fmt(piece.x)} / y ${fmt(piece.y)} mm</p><p>${fmt(piece.width)} × ${fmt(piece.height)} mm · ${text(piece.material.colorId || piece.material.color)} · ${piece.material.thickness} mm</p><p>${piece.material.directional ? '→ Sentido do acabamento na peça aberta (verso)' : 'Sem sentido de acabamento definido'}</p><small>${text(status)}</small></article>`).join('')}</div></section>`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'"><title>${text(project.name)} — ACM Studio — R${project.revision}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#152238;background:#e9edf2;margin:0}section{background:white;max-width:210mm;margin:12px auto;padding:15mm;break-after:page}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #253c55;padding-bottom:10px}header p{margin:5px 0}.stamp{text-align:right;font-size:22px;font-weight:bold}.stamp small{display:block;font-size:9px;max-width:220px}h1{font-size:23px;margin:22px 0 12px}h2{font-size:15px;margin-top:20px}p,li{line-height:1.45}table{width:100%;border-collapse:collapse;font-size:10px;margin:12px 0}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#edf2f6}tr{break-inside:avoid}.metrics{display:flex;gap:8px;flex-wrap:wrap}.metrics b{background:#eef3f7;padding:12px}.notice{padding:10px;background:#fff4da;border-left:3px solid #b97714}.joint-closes{display:grid;grid-template-columns:1fr 1fr;gap:14px}.joint-closes figure{margin:0}.joint-closes svg{width:100%;height:45mm;border:1px solid #cbd5e1}.joint-closes figcaption{font-size:10px}.fold-sections{display:flex;gap:12px;flex-wrap:wrap}.fold-section{width:40%;margin:5px}.fold-section svg{height:35mm;width:100%}.fold-section figcaption{font-size:9px}.structure-cut svg,.bar-stock svg{display:block;width:100%;max-height:100mm}.product-card{break-inside:avoid;border-top:1px solid #cbd5e1;padding-top:12px}.product-card img{display:block;max-width:100%;width:70mm;height:45mm;object-fit:contain}.commercial-preview{margin:18px 0;break-inside:avoid}.commercial-preview img{display:block;width:100%;height:auto;max-height:120mm;object-fit:contain}.commercial-preview figcaption{font-size:10px;line-height:1.4;margin-top:8px}.assembly-map svg{width:100%;height:auto;max-height:140mm}.facade{margin:20px 0}.facade svg{width:100%;max-height:220px}.piece-drawing svg{width:100%;height:auto;max-height:340px}.sheet-drawing svg{width:100%;height:420px}.legend{font-size:10px}.labels{display:grid;grid-template-columns:1fr 1fr;gap:10px}.label{border:1px dashed #68788b;padding:12px;break-inside:avoid}.label strong{font-size:22px}.label p{margin:6px 0}small{font-size:9px}@media print{body{background:white}section{margin:0;padding:0;max-width:none}section:last-child{break-after:auto}thead{display:table-header-group}}</style></head><body>${sections.join('')}</body></html>`;
}
