import { GeometryError } from './errors.mjs';
import { LIMITS } from './model.mjs';
import { flattenPaths, typefacePaths, scalePathsToHeight, transformPaths } from './kernel.mjs';
const NUM = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
const decimal = new RegExp(`^${NUM}$`);
const number = (value, code = 'INVALID_NUMBER') => { if (typeof value !== 'string' || !decimal.test(value.trim()) || !Number.isFinite(Number(value))) throw new GeometryError(code, 'Número inválido no desenho.'); return Number(value); };
const fail = (code, message) => { throw new GeometryError(code, message); };
function attrs(raw, allowed) {
  const result = {}; let position = 0;
  const attribute = /\s+([\w:-]+)\s*=\s*(["'])([^"'<>]*)\2/gy;
  while (position < raw.length) {
    if (!raw.slice(position).trim()) break;
    attribute.lastIndex = position; const match = attribute.exec(raw);
    if (!match || !allowed.includes(match[1]) || result[match[1]] !== undefined || /&/.test(match[3])) fail('SVG_ATTRIBUTE', 'Atributo SVG não suportado, repetido ou malformado.');
    result[match[1]] = match[3]; position = attribute.lastIndex;
  }
  return result;
}
function pathCommands(d) {
  const token = new RegExp(`\\s*,?\\s*([MLQCZ]|${NUM})`, 'gy');
  const tokens = []; let pos = 0;
  while (pos < d.length) {
    if (!d.slice(pos).trim()) break;
    token.lastIndex = pos; const match = token.exec(d);
    if (!match) fail('SVG_COMMAND', 'Use somente comandos absolutos M, L, Q, C e Z, com coordenadas explícitas.');
    tokens.push(match[1]); pos = token.lastIndex;
    if (tokens.length > LIMITS.vertices * 7) fail('POINT_LIMIT', 'Arquivo excede a complexidade permitida.');
  }
  const paths = []; let path, index = 0;
  const point = () => [number(tokens[index++], 'SVG_PATH'), number(tokens[index++], 'SVG_PATH')];
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M') { if (path && !path.closed) fail('OPEN_CONTOUR', 'O desenho contém contorno aberto.'); path = { start: point(), segments: [], closed: false }; paths.push(path); }
    else if (!path || path.closed) fail('SVG_PATH', 'Cada contorno deve iniciar com M e terminar com Z.');
    else if (command === 'L') path.segments.push({ type: 'L', to: point() });
    else if (command === 'Q') { const p1 = point(), to = point(); path.segments.push({ type: 'Q', p1, to }); }
    else if (command === 'C') { const p1 = point(), p2 = point(), to = point(); path.segments.push({ type: 'C', p1, p2, to }); }
    else if (command === 'Z') path.closed = true;
    else fail('SVG_COMMAND', 'Cada segmento precisa declarar seu comando SVG.');
  }
  if (!paths.length || paths.some(p => !p.closed)) fail('OPEN_CONTOUR', 'O desenho contém contorno aberto ou vazio.');
  return paths;
}
export function parsePrintSVG(content) {
  if (/\sstroke(?:-[\w-]+)?\s*=/.test(content)) fail('SVG_STROKE', 'SVG de corte ou traços não é aceito como arte. Converta em contornos preenchidos antes de importar.');
  if (/<!|&|\bon\w+\s*=/i.test(content.replace(/<!--[\s\S]*?-->/g, ''))) fail('SVG_UNSUPPORTED', 'SVG com entidades, scripts ou recursos externos não é aceito.');
  const input = content.replace(/^\s*<\?xml\s+[^?]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const root = input.match(/^<svg\b([^<>]*)>([\s\S]*)<\/svg\s*>$/);
  if (!root) fail('SVG_INVALID', 'Use um SVG completo com raiz svg.');
  const a = attrs(root[1], ['xmlns', 'width', 'height', 'viewBox', 'version', 'fill-rule']);
  if (a.xmlns && a.xmlns !== 'http://www.w3.org/2000/svg') fail('SVG_INVALID', 'Namespace SVG inválido.');
  const mm = new RegExp(`^(${NUM})mm$`);
  if (!mm.test(a.width || '') || !mm.test(a.height || '')) fail('SVG_UNIT', 'SVG deve declarar width e height explicitamente em mm.');
  const width = Number(a.width.slice(0, -2)), height = Number(a.height.slice(0, -2));
  if (!(width > 0 && height > 0 && width <= 5000 && height <= 5000)) fail('SVG_UNIT', 'Dimensões físicas SVG inválidas ou superiores a 5.000 mm.');
  const view = a.viewBox ? a.viewBox.trim().split(/[ ,]+/).map(v => number(v, 'SVG_VIEWBOX')) : [0, 0, width, height];
  if (view.length !== 4 || view[2] <= 0 || view[3] <= 0) fail('SVG_VIEWBOX', 'viewBox inválido.');
  if (Math.abs(width / view[2] - height / view[3]) > 1e-9 * Math.max(width / view[2], height / view[3])) fail('SVG_ASPECT_RATIO', 'A proporção do viewBox deve corresponder às dimensões físicas.');
  let body = root[2].replace(/<(title|desc)>[^<>]*<\/\1>/g, '').trim();
  const pathTag = body.match(/^<path\b([^<>]*?)(?:\/\s*>|>\s*<\/path\s*>)$/);
  if (!pathTag) fail('SVG_UNSUPPORTED', 'Use um único path composto, sem grupos, strokes, estilos ou outras formas.');
  const p = attrs(pathTag[1], ['d', 'transform', 'fill', 'fill-rule', 'id']);
  if (!p.d) fail('SVG_PATH', 'Path sem desenho.');
  if (p.fill && !/^(?:black|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/.test(p.fill)) fail('SVG_FILL', 'Use preenchimento preto explícito ou o preenchimento padrão.');
  let paths = pathCommands(p.d);
  const fillRule = p['fill-rule'] || a['fill-rule'] || 'nonzero';
  if (!['evenodd', 'nonzero'].includes(fillRule) || (paths.length > 1 && fillRule !== 'evenodd')) fail('SVG_FILL_RULE', 'Path com vários contornos exige fill-rule="evenodd" explícito.');
  if (p.transform) {
    const matrix = p.transform.match(/^matrix\(([^)]+)\)$/);
    if (!matrix) fail('SVG_TRANSFORM', 'Somente transform matrix é aceito.');
    const m = matrix[1].trim().split(/[ ,]+/).map(v => number(v, 'SVG_TRANSFORM'));
    if (m.length !== 6 || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12) fail('SVG_TRANSFORM', 'Matriz SVG inválida ou singular.');
    paths = transformPaths(paths, m);
  }
  return { paths: transformPaths(paths, [width / view[2], 0, 0, -height / view[3], -view[0] * width / view[2], height + view[1] * height / view[3]]), unit: 'mm', viewport: [width, height], convention: 'SVG Y para baixo convertido em XY cartesiano; medidas físicas preservadas.' };
}
export function parsePrintDXF(content) {
  const lines = content.trim().split(/\r?\n/).map(line => line.trim());
  if (lines.length % 2) fail('DXF_INVALID', 'DXF ASCII com pares incompletos.');
  const pairs = []; for (let i = 0; i < lines.length; i += 2) { const code = number(lines[i], 'DXF_INVALID'); if (!Number.isInteger(code)) fail('DXF_INVALID', 'Código DXF inválido.'); pairs.push([code, lines[i + 1]]); }
  let section = null, unit = null, ended = false, sawEntities = false; const entities = [];
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (ended) fail('DXF_INVALID', 'Dados após EOF.');
    if (code === 0 && value === 'SECTION') { if (section || pairs[i + 1]?.[0] !== 2) fail('DXF_INVALID', 'Seção DXF inválida.'); section = pairs[++i][1]; if (!['HEADER', 'ENTITIES'].includes(section)) fail('DXF_UNSUPPORTED', 'O piloto aceita apenas HEADER e ENTITIES, sem blocos ou tabelas.'); if (section === 'ENTITIES') { if (sawEntities) fail('DXF_INVALID', 'Seção ENTITIES repetida.'); sawEntities = true; } continue; }
    if (code === 0 && value === 'ENDSEC') { if (!section) fail('DXF_INVALID', 'ENDSEC sem seção.'); section = null; continue; }
    if (code === 0 && value === 'EOF') { if (section) fail('DXF_INVALID', 'Seção DXF não encerrada.'); ended = true; continue; }
    if (!section) fail('DXF_INVALID', 'Dados fora de uma seção DXF.');
    if (section === 'HEADER') { if (code === 9 && value === '$INSUNITS') { if (unit !== null || pairs[i + 1]?.[0] !== 70) fail('DXF_UNIT', 'INSUNITS inválido ou repetido.'); unit = number(pairs[++i][1], 'DXF_UNIT'); } continue; }
    if (code !== 0 || value !== 'LWPOLYLINE') fail('DXF_UNSUPPORTED', 'Somente entidades LWPOLYLINE fechadas são aceitas.');
    const entity = []; while (i + 1 < pairs.length && pairs[i + 1][0] !== 0) entity.push(pairs[++i]); entities.push(entity);
  }
  if (!ended || !sawEntities || section) fail('DXF_INVALID', 'Estrutura DXF incompleta.');
  const scale = { 1: 25.4, 4: 1, 5: 10 }[unit]; if (!scale) fail('DXF_UNIT', 'Declare INSUNITS em mm, cm ou polegadas.');
  const paths = entities.map(entity => {
    const points = []; let current, flags, count;
    const singleton = new Set();
    for (const [code, value] of entity) {
      if ([5, 8, 100].includes(code)) continue;
      if (![90, 70, 10, 20, 38, 39, 40, 41, 42, 43, 210, 220, 230].includes(code)) fail('DXF_UNSUPPORTED', `Código DXF ${code} não suportado.`);
      const n = number(value, 'DXF_INVALID');
      if (![10, 20, 40, 41, 42].includes(code)) { if (singleton.has(code)) fail('DXF_INVALID', 'Campo DXF repetido.'); singleton.add(code); }
      if (code === 90) count = n;
      else if (code === 70) flags = n;
      else if (code === 10) { if (current && !Number.isFinite(current[1])) fail('DXF_INVALID', 'Vértice DXF sem Y.'); current = [n * scale, NaN]; points.push(current); }
      else if (code === 20) { if (!current || Number.isFinite(current[1])) fail('DXF_INVALID', 'Coordenada Y sem X ou repetida.'); current[1] = n * scale; }
      else if ([38, 39, 40, 41, 42, 43].includes(code) && n !== 0) fail(code === 42 ? 'DXF_BULGE' : 'DXF_3D', 'Bulge, largura, elevação e espessura devem ser zero.');
      else if ([210, 220, 230].includes(code) && n !== (code === 230 ? 1 : 0)) fail('DXF_OCS', 'Plano de extrusão DXF diferente do plano XY não é aceito.');
    }
    if (flags !== 1 && flags !== 129) fail('OPEN_CONTOUR', 'LWPOLYLINE deve estar fechada.');
    if (!Number.isInteger(count) || count !== points.length || count < 3 || points.some(p => !p.every(Number.isFinite))) fail('DXF_VERTEX_COUNT', 'Contagem ou coordenadas dos vértices DXF inválidas.');
    return { start: points[0], segments: points.slice(1).map(to => ({ type: 'L', to })), closed: true };
  });
  if (!paths.length) fail('DXF_EMPTY', 'DXF sem LWPOLYLINE.');
  return { paths, unit: 'mm', sourceUnitCode: unit, convention: 'Polilinhas fechadas interpretadas por paridade como contornos e vazados.' };
}
async function readFont(font) {
  const url = font === 'gentilis' ? new URL('../letras/fonts/gentilis_regular.typeface.json', import.meta.url) : new URL('../letras/fonts/helvetiker_regular.typeface.json', import.meta.url);
  if (url.protocol === 'file:') { const moduleName = 'node:fs/promises'; const { readFile } = await import(/* @vite-ignore */ moduleName); return JSON.parse(await readFile(url, 'utf8')); }
  const response = await fetch(url); if (!response.ok) fail('FONT_LOAD', 'Não foi possível carregar a fonte geométrica.'); return response.json();
}
export async function preparePrintContours(project) {
  let imported;
  if (project.source.kind === 'text') imported = { paths: scalePathsToHeight(typefacePaths(project.source.text, await readFont(project.source.font)), project.parameters.height).paths, convention: 'Altura total do texto em mm; acentos incluídos.' };
  else imported = project.source.kind === 'svg' ? parsePrintSVG(project.source.content) : parsePrintDXF(project.source.content);
  if (imported.paths.length > LIMITS.contours) fail('CONTOUR_LIMIT', 'Desenho excede 128 contornos.');
  for (const path of imported.paths) for (const point of [path.start, ...path.segments.flatMap(s => [s.to, s.p1, s.p2].filter(Boolean))]) if (!point.every(n => Number.isFinite(n) && Math.abs(n) <= 100000)) fail('COORDINATE_LIMIT', 'Coordenadas fora do limite do piloto.');
  const flat = flattenPaths(imported.paths, 0.025);
  if (imported.viewport && flat.contours.flat().some(point => point.some((n, axis) => n < -0.025 || n > imported.viewport[axis] + 0.025))) fail('SVG_CLIPPING', 'O contorno ultrapassa o viewport SVG; ajuste a página ao desenho para evitar recorte implícito.');
  if (flat.contours.reduce((sum, c) => sum + c.length, 0) > LIMITS.vertices) fail('POINT_LIMIT', 'Desenho excede 8.000 vértices.');
  return { ...flat, convention: imported.convention };
}
