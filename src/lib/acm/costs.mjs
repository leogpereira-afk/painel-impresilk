import { COLORS } from './model.mjs';
import { materialKey } from './nesting.mjs';

export function sheetReference(project) {
  return { materialKey: materialKey(project.material), width: project.stock.width, length: project.stock.length };
}
const sameSheet = (a, b) => Boolean(a && b && typeof a.materialKey === 'string' && a.materialKey && Number.isFinite(a.width) && a.width > 0 && Number.isFinite(a.length) && a.length > 0 && a.materialKey === b.materialKey && a.width === b.width && a.length === b.length);
/** Prices apply only to the quoted material/lot and exact commercial format. */
export function sheetUnitPrice(project, sheet) {
  const prices = project.costs ?? {};
  const quote = (prices.sheetQuotes ?? []).find(item => sameSheet(item, sheet));
  if (quote && Number.isFinite(quote.price) && quote.price >= 0) return quote.price;
  const reference = prices.sheetReference;
  return sameSheet(reference, sheet) && Number.isFinite(prices.sheet) && prices.sheet >= 0 ? prices.sheet : null;
}
/** One edit also updates an old main quote; clearing it must never revive its previous price. */
export function updateSheetQuote(costs, reference, price) {
  const sheetQuotes = (costs.sheetQuotes ?? []).filter(quote => !sameSheet(quote, reference));
  if (sameSheet(costs.sheetReference, reference)) return { ...costs, sheet: price, sheetQuotes };
  if (price !== null) sheetQuotes.push({ ...reference, price });
  return { ...costs, sheetQuotes };
}
export function quotationWidths(project) { return [...new Set([project.stock.width, 1220, 1250, 1500])]; }
/** Preserve stock identity and explicit prices; a remnant is not a free commercial bar. */
function frameCostRows(bars) {
  const groups = new Map();
  for (const bar of bars) {
    const key = JSON.stringify([bar.stockKey, bar.source, bar.pricePerM]);
    if (!groups.has(key)) groups.set(key, { bar, length: 0 });
    groups.get(key).length += bar.length;
  }
  return [...groups.values()].map(({bar,length},i) => [
    `Metalon ${bar.source === 'remnant' ? 'reaproveitado' : 'comprado'} ${i+1} · ${bar.sku || bar.profile || 'perfil'}${bar.wall != null ? ` · parede ${bar.wall} mm` : ''}`,
    length/1000, 'm', bar.pricePerM ?? null,
  ]);
}
/** Product-specific quantities come from the actual fixing map, including piece overrides. */
function productCostRows(project, result, kind) {
  const field = kind === 'screws' ? 'screwProduct' : 'tapeProduct';
  const hasProducts = Boolean(project.fixing?.[field]) || result.pieces.some(piece => piece.fixing?.[field]);
  if (!hasProducts) return [[kind === 'screws' ? 'Parafusos' : 'Fita', kind === 'screws' ? result.totals.screws : result.totals.tapeLength/1000, kind === 'screws' ? 'un' : 'm', project.costs?.[kind === 'screws' ? 'screw' : 'tapePerM']]];
  const groups = new Map();
  for (const piece of result.pieces) {
    const product = piece.fixing?.[field] ?? project.fixing?.[field] ?? {};
    const {photoDataUrl, ...identity} = product;
    void photoDataUrl;
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, {product,quantity:0});
    const group = groups.get(key);
    if (kind === 'screws') group.quantity += piece.fixings?.screws?.length ?? 0;
    else for (const tape of piece.fixings?.tape ?? []) group.quantity += Math.hypot(tape.x2-tape.x1,tape.y2-tape.y1)/1000;
  }
  return [...groups.values()].map(({product,quantity},i) => {
    const name = `${kind === 'screws' ? 'Parafusos' : 'Fita'} ${i+1} · ${product.code || product.name || 'produto a definir'}`;
    if (kind === 'screws') return [name,quantity,'un',product.unitPrice ?? null];
    const planned = quantity*(1+(product.wastePercent??0)/100);
    if (product.rollLength > 0) {
      const rolls = Math.ceil(planned/(product.rollLength/1000));
      const price = product.rollPrice ?? (Number.isFinite(product.pricePerM) ? product.pricePerM*product.rollLength/1000 : null);
      return [name,rolls,'rolo',price];
    }
    return [name,planned,'m',product.pricePerM ?? null];
  });
}
/** Budget quantities: whole purchased bars/sheets, actual tapes/screws; missing prices stay unknown. */
export function estimateCosts(project, result, nesting) {
  const prices = project.costs ?? {}, sheets = nesting.sheets ?? [];
  const bars = result.structure?.bars ?? [];
  const purchasedMetal = bars.reduce((sum, bar) => sum + (bar.length ?? project.structure.barLength), 0);
  const groups = new Map();
  for (const sheet of sheets.filter(item => item.source === 'sheet')) {
    const key = JSON.stringify([sheet.materialKey, sheet.width, sheet.length]);
    if (!groups.has(key)) groups.set(key, { sheet, quantity: 0 });
    groups.get(key).quantity++;
  }
  const values = [...groups.values()].map(({ sheet, quantity }, index) => [
    groups.size === 1 ? 'Chapas novas' : `Chapas novas ${index + 1}: ${sheet.material?.sku || sheet.material?.colorId || 'material'} · ${sheet.width} × ${sheet.length} mm`,
    quantity, 'un', sheetUnitPrice(project, sheet),
  ]);
  values.push(
    ['Retalhos consumidos', sheets.filter(sheet => sheet.source === 'remnant').length, 'un', prices.remnant ?? null],
    ...(project.structure.frame?.enabled ? frameCostRows(bars) : [['Metalon em barras', purchasedMetal / 1000, 'm', prices.metalPerM]]),
    ...productCostRows(project,result,'tape'),
    ...productCostRows(project,result,'screws'),
    ['Processo e serviços', 1, 'lote', prices.work],
  );
  const items = values.filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
    .map(([name, quantity, unit, price]) => ({ name, quantity, unit, price: Number.isFinite(price) && price >= 0 ? price : null, total: Number.isFinite(price) && price >= 0 ? quantity * price : null }));
  const notes = ['Metalon inclui o comprimento das barras consumidas, com perdas de corte e sobras. Fita e parafusos usam o mapa de fixação.', 'Preço de chapa vinculado ao material/lote e formato cotados; não é transferido para outro SKU ou largura.'];
  if (project.structure.frame?.enabled) notes.push('Preços separados por perfil, material, parede, SKU e origem. Retalhos de metalon precisam de custo atribuído.');
  if (result.pieces.some(piece => piece.fixing?.tapeProduct?.rollLength)) notes.push('Compra de fita arredondada para rolos inteiros, com a perda cadastrada; não representa apenas a metragem instalada.');
  if (Number.isFinite(prices.sheet) && !prices.sheetReference) notes.push('Preço principal sem material e formato vinculados: confirme novamente o campo Chapa inteira para usá-lo.');
  if (sheets.some(sheet => sheet.source === 'remnant')) notes.push('Retalhos exigem custo atribuído; material reaproveitado não foi presumido gratuito.');
  if (sheets.some(sheet => !['sheet', 'remnant'].includes(sheet.source))) notes.push('Há uma origem de material não identificada.');
  const complete = result.valid === true && result.pieces?.length > 0 && sheets.every(sheet => ['sheet', 'remnant'].includes(sheet.source)) && values.every(([, quantity]) => Number.isFinite(quantity) && quantity >= 0) && items.every(item => item.total !== null) && !(nesting.unplaced?.length) && !(nesting.errors?.length) && !(result.structure?.unplaced?.length);
  return { items, known: items.reduce((sum, item) => sum + (item.total ?? 0), 0), complete: Boolean(complete), notes };
}

const words = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 };
function normalizeText(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa) e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\b/g, (_, tens, unit) => words[tens] + words[unit])
    .replace(new RegExp(`\\b(${Object.keys(words).join('|')})\\b`, 'g'), word => words[word]);
}
function parseMetric(number, unit) {
  const thousands = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(number);
  const value = Number((thousands ? number.replace(/\./g, '') : number).replace(',', '.'));
  return value * (/^(?:m|metro)/.test(unit) && !/^(?:mm|milim)/.test(unit) ? 1000 : /^(?:cm|centim)/.test(unit) ? 10 : 1);
}
/** Bounded local interpretation. Negated, conflicting or unrecognised dimensions are withheld. */
export function parseBrief(text) {
  if (typeof text !== 'string' || text.length > 10000) return { changes: [], notes: ['Informe um texto de até 10.000 caracteres.'] };
  const normalized = normalizeText(text), proposals = new Map(), notes = [];
  const amount = '(?<![\\d.,+\\-])(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)\\s*(mm|milimetros?|cm|centimetros?|m|metros?)\\b(?![²³])';
  const negated = index => /\b(?:nao|sem|nem|evitar|evite|retirar|remover|remova|excluir)\b/.test(normalized.slice(0, index).split(/[;,!?\n]|\.(?=\s|$)/).at(-1));
  function propose(path, label, value) { if (!proposals.has(path)) proposals.set(path, { label, values: new Set() }); proposals.get(path).values.add(value); }
  function measurements(before, after, predicate = () => true) {
    const values = new Set();
    const expressions = [new RegExp(`\\b${before}\\s*(?:de|com|:)?\\s*${amount}`, 'g'), new RegExp(`${amount}\\s*(?:de|na|para)?\\s*${after}\\b`, 'g')];
    for (const expression of expressions) for (const match of normalized.matchAll(expression)) {
      const numericIndex = match.index + match[0].indexOf(match[1]);
      if (negated(match.index) || /[+\-]\s*$/.test(normalized.slice(0, numericIndex)) || !predicate(match)) continue;
      const value = parseMetric(match[1], match[2]); if (Number.isFinite(value) && value > 0 && value <= 100000) values.add(value);
    }
    return [...values];
  }
  const measure = (path, label, before, after = before, predicate) => { const values = measurements(before, after, predicate); for (const value of values) propose(path, label, value); return values; };
  const widthTerm = '(?:frente|largura(?:\\s+frontal)?)(?!\\s+(?:do\\s+)?forro)';
  measure('front.width', 'Largura frontal', widthTerm, widthTerm);
  measure('front.height', 'Altura frontal', '(?:altura\\s+(?:frontal|da\\s+frente)|altura)', '(?:altura\\s+(?:frontal|da\\s+frente)|altura)', match => {
    if (/frontal|frente/.test(match[0])) return true;
    const prior = [...normalized.slice(0, match.index).matchAll(/\b(frente|frontal|laterais|lateral|forro|esquerda|direita)\b/g)].at(-1)?.[1];
    return !prior || ['frente', 'frontal'].includes(prior);
  });
  const commonSides = measurements('laterais', 'laterais');
  const left = measure('left.depth', 'Profundidade esquerda', '(?:lateral\\s+)?esquerda(?:\\s+(?:com\\s+)?profundidade)?', '(?:lateral\\s+)?esquerda');
  const right = measure('right.depth', 'Profundidade direita', '(?:lateral\\s+)?direita(?:\\s+(?:com\\s+)?profundidade)?', '(?:lateral\\s+)?direita');
  for (const [side, explicit] of [['left', left], ['right', right]]) {
    if (!explicit.length) for (const value of commonSides) propose(`${side}.depth`, `Profundidade ${side === 'left' ? 'esquerda' : 'direita'}`, value);
    if (explicit.length || commonSides.length) propose(`${side}.enabled`, `Lateral ${side === 'left' ? 'esquerda' : 'direita'}`, true);
  }
  if (/\blateral\s+(?:de\s+)?\d/.test(normalized) && !commonSides.length && !left.length && !right.length) notes.push('A lateral foi citada sem lado definido; informe esquerda ou direita.');
  for (const value of measurements('abas?', 'abas?').filter(value => value <= 500)) for (const side of ['left', 'right', 'top', 'bottom']) propose(`edges.${side}`, `Aba ${side}`, value);
  for (const value of measurements('acm', 'acm').filter(value => [3, 4].includes(value))) propose('material.thickness', 'Espessura do ACM', value);
  function positiveWords(pattern) { return [...normalized.matchAll(new RegExp(`\\b(?:${pattern})\\b`, 'g'))].filter(match => !negated(match.index)); }
  const colorPatterns = { preto: 'pret[oa]', branco: 'branc[oa]', grafite: 'grafite', cinza: 'cinza', azul: 'azul', vermelho: 'vermelh[oa]', amarelo: 'amarel[oa]', laranja: 'laranja', verde: 'verde', prata: 'prata', bronze: 'bronze', dourado: 'dourad[oa]', champanhe: 'champanhe' };
  const colors = COLORS.filter(color => colorPatterns[color.id] && positiveWords(colorPatterns[color.id]).length);
  if (colors.length === 1) { propose('material.color', colors[0].name, colors[0].hex); propose('material.colorId', 'Cor', colors[0].id); }
  else if (colors.length > 1) notes.push('Há alternativas de cores no pedido; escolha uma para aplicar.');
  const finishes = [['fosc[oa]', 'matte'], ['brilhante', 'glossy'], ['metalic[oa]', 'metallic'], ['escovad[oa]', 'brushed'], ['amadeirad[oa]', 'wood'], ['espelhad[oa]', 'mirror']].filter(([pattern]) => positiveWords(pattern).length);
  if (finishes.length === 1) { propose('material.finish', 'Acabamento', finishes[0][1]); propose('material.directional', 'Sentido do acabamento', ['brushed', 'wood'].includes(finishes[0][1])); }
  else if (finishes.length > 1) notes.push('Há alternativas de acabamentos no pedido; escolha uma para aplicar.');
  const fixing = [['fita', 'tape'], ['parafusos?', 'screws']].filter(([pattern]) => positiveWords(pattern).length);
  if (fixing.length === 1) propose('fixing.type', 'Tipo de fixação', fixing[0][1]);
  else if (fixing.length > 1) notes.push('Há alternativas de fixação; escolha fita ou parafusos.');
  if (positiveWords('forro').length) {
    propose('soffit.enabled', 'Presença de forro', true);
    measure('soffit.width', 'Largura do forro', '(?:largura\\s+(?:do\\s+)?forro|forro\\s+(?:com\\s+)?largura)');
    measure('soffit.depth', 'Profundidade do forro', '(?:profundidade\\s+(?:do\\s+)?forro|forro\\s+(?:com\\s+)?profundidade)');
    notes.push('Confirme largura e profundidade do forro no formulário; medidas não reconhecidas mantêm os valores atuais.');
  }
  const changes = [];
  for (const [path, { label, values }] of proposals) {
    if (values.size === 1) changes.push({ path, label, value: [...values][0] });
    else notes.push(`${label}: medidas conflitantes; nenhuma alternativa foi aplicada.`);
  }
  if (!changes.some(change => change.path === 'front.height')) notes.push('Altura da frente não reconhecida: mantenha ou informe no formulário.');
  notes.push('Interpretação local limitada. Confira as alterações antes de aplicar; trechos não reconhecidos não mudam o projeto.');
  return { changes, notes };
}
