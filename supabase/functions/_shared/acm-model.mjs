import {validateFoldEdge,edgeFolds} from './acm-folds.mjs';
import {validateTechnicalDrawing} from './acm-technical.mjs';
export {edgeFolds, edgeExtent, foldProfile} from './acm-folds.mjs';
import {validateStructureFrame} from './acm-structure.mjs';
import {validateVisual,isSafeRasterDataURL} from './acm-visual.mjs';
import {validateFixingDetails,isSafeFixingPhoto,resolveFixing} from './acm-fixing.mjs';
import {validateInstallation,isSafeInstallationPhoto} from './acm-installation.mjs';
/** Versioned, serializable ACM input. All lengths are millimetres. */
export const SCHEMA_VERSION = 1;
export const LIMITS = Object.freeze({ dimension: 100000, pieces: 1200, openings: 50, segments: 12000, stock: 2000 });
export const COLORS = Object.freeze([
  ['branco', 'Branco', '#f5f4ef', 'Neutros'], ['preto', 'Preto', '#202124', 'Neutros'],
  ['cinza', 'Cinza', '#87919b', 'Neutros'], ['grafite', 'Grafite', '#364152', 'Neutros'],
  ['azul', 'Azul', '#24578f', 'Cores'], ['vermelho', 'Vermelho', '#b52b36', 'Cores'],
  ['amarelo', 'Amarelo', '#e4b72a', 'Cores'], ['laranja', 'Laranja', '#d96927', 'Cores'],
  ['verde', 'Verde', '#387659', 'Cores'], ['prata', 'Prata', '#c5c9ca', 'Metálicos'],
  ['bronze', 'Bronze', '#9c7957', 'Metálicos'], ['dourado', 'Dourado', '#b89c57', 'Metálicos'],
  ['champanhe', 'Champanhe', '#c8baa0', 'Metálicos'], ['madeira-clara', 'Madeira clara', '#b98954', 'Amadeirados'],
  ['madeira-escura', 'Madeira escura', '#684937', 'Amadeirados'], ['escovado', 'Alumínio escovado', '#aeb6ba', 'Escovados'],
  ['espelho', 'Prata espelhado', '#d5e1e5', 'Espelhados'],
].map(([id, name, hex, family]) => Object.freeze({ id, name, label: name, hex, color: hex, family, finish: family === 'Amadeirados' ? 'wood' : family === 'Escovados' ? 'brushed' : family === 'Espelhados' ? 'mirror' : family === 'Metálicos' ? 'metallic' : 'matte', directional: ['Amadeirados', 'Escovados'].includes(family), commercialConfirmed: false })));
export const PROFILES = Object.freeze([[20, 20], [30, 20], [50, 30]].map(([width, depth]) => Object.freeze({ id: `${width}x${depth}`, name: `${width} × ${depth} mm`, label: `${width} × ${depth} mm`, width, depth })));
export const SHEETS = Object.freeze([1220, 1250, 1500].map(width => Object.freeze({ id: `${width}x5000`, name: `${width} × 5000 mm`, label: `${width} × 5000 mm`, width, length: 5000 })));
export function createProject() {
  return {
    id: 'acm-estudo', name: 'Estudo de fachada', revision: 1, schemaVersion: SCHEMA_VERSION, units: 'mm',
    assemblyMode: 'tray',
    cladding: {panelForm:'unspecified',joint:'unspecified',exposure:'unspecified',fixingConfirmed:false},
    front: { width: 6000, height: 1200 }, left: { enabled: false, depth: 600, height: 1200 }, right: { enabled: false, depth: 600, height: 1200 },
    soffit: { enabled: false, width: 6000, depth: 600 }, openings: [],
    material: { colorId: 'grafite', color: '#364152', finish: 'matte', thickness: 3, skin: null, core: 'PE', manufacturer: '', sku: '', directional: false },
    layout: { orientation: 'vertical', optimizationPriority: 'sheets', maxWidth: 1000, maxHeight: 1400, joint: 10, minimumStrip: 100 },
    edges: { left: 30, right: 30, top: 30, bottom: 30 }, overrides: {},
    fabrication: { cutMode: 'router', compensation: 0, cornerRelief: 1, grooveWidth: 6, toolAngle: 90, toolFlat: 2, depth: null, remainingCore: null, calibration: null, machineWidth: 1500, machineLength: 5000 },
    stock: { width: 1500, length: 5000, trim: 10, kerf: 4, rotation: true, quantity: null, remnants: [] },
    structure: { profile: '30x20', wall: null, spacing: 600, barLength: 6000, kerf: 3 },
    fixing: { type: 'tape', tapeWidth: 19, thickness: 1, screwPitch: 300, edgeOffset: 15, validated: false },
    costs: { sheetReference: null, sheetQuotes: [], sheet: null, metalPerM: null, tapePerM: null, screw: null, work: null },
  };
}
const plain = value => value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const num = (value, min = 0, max = LIMITS.dimension) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const EDGE_NAMES = ['left', 'right', 'top', 'bottom'];
export function edgeHeight(edge) { return typeof edge === 'object' && edge ? (edge.type === 'none' ? 0 : edge.height) : edge; }
/** A machining profile must be valid for the effective material of every piece. */
export function validateMaterialProcess(material, fabrication, prefix = 'material') {
  const errors = [], add = (code, message) => errors.push({ code, message: `${prefix}: ${message}` });
  const { thickness, skin } = material, { depth, remainingCore } = fabrication;
  if (![3, 4].includes(thickness)) return errors;
  if (skin != null && (!num(skin, 0.01, thickness / 2 - 0.001))) add('SKIN_LAYERS', 'as lâminas de alumínio não cabem na espessura total.');
  if (depth != null && num(depth) && depth >= thickness) add('MACHINING_THICKNESS', 'a profundidade de fresagem atravessa a espessura do ACM.');
  if (depth != null && num(depth) && skin != null && num(skin) && depth >= thickness - skin) add('SKIN', 'a usinagem atingiria a lâmina frontal de acabamento.');
  if (remainingCore != null && num(remainingCore) && remainingCore > thickness - (num(skin) ? 2 * skin : 0)) add('CORE', 'núcleo residual maior que o núcleo disponível.');
  if (depth != null && num(depth) && remainingCore != null && num(remainingCore) && skin != null && num(skin) && Math.abs(depth + remainingCore + skin - thickness) > 0.01) add('RESIDUAL', 'profundidade, núcleo residual e lâmina frontal não fecham a espessura do ACM.');
  return errors;
}
/** Strictly rejects invalid input; does not coerce NaN, strings or negative dimensions. */
export function validateProject(project) {
  const errors = [];
  const add = (code, message) => errors.push({ code, message });
  if (!plain(project)) return [{ code: 'PROJECT', message: 'Projeto deve ser um objeto JSON.' }];
  let nodes = 0;
  const active = new Set();
  function safe(value, path = 'project', depth = 0) {
    if (++nodes > 50000 || depth > 15) { add('INPUT_LIMIT', 'Projeto excede o limite de dados ou profundidade.'); return; }
    if (value == null || ['string', 'boolean'].includes(typeof value)) {
      const assetPath = /^project\.visual\.assets\.\d+\.dataUrl$/.test(path);
      const photoPath = /^project\.(?:fixing|overrides\.[^.]+\.fixing)\.(?:screwProduct|tapeProduct)\.photoDataUrl$/.test(path);
      const installationPhotoPath = /^project\.installation\.photos\.\d+\.dataUrl$/.test(path);
      if (typeof value === 'string' && value.length > 10000 && !((assetPath && isSafeRasterDataURL(value)) || (photoPath && isSafeFixingPhoto(value)) || (installationPhotoPath && isSafeInstallationPhoto(value)))) add('TEXT_LIMIT', `${path}: texto muito longo ou imagem inválida.`);
      return;
    }
    if (typeof value === 'number') { if (!Number.isFinite(value)) add('FINITE', `${path}: número não finito.`); return; }
    if ((!Array.isArray(value) && !plain(value)) || active.has(value)) { add('JSON', `${path}: valor não serializável.`); return; }
    if (Array.isArray(value) && value.length > 5000) { add('INPUT_LIMIT', `${path}: lista muito grande.`); return; }
    active.add(value);
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) { add('UNSAFE_KEY', `${path}: chave proibida.`); continue; }
      safe(value[key], `${path}.${key}`, depth + 1);
      if (errors.length > 30) break;
    }
    active.delete(value);
  }
  safe(project);
  if (errors.length) return errors;
  if (project.cladding != null) {
    const c=project.cladding;
    if(!plain(c)) add('CLADDING','Sistema de revestimento inválido.');
    else {
      const enums={panelForm:['unspecified','tray','flat','wrap'],joint:['unspecified','dry','sealed','butt'],exposure:['unspecified','indoor','outdoor']};
      for(const [key,values] of Object.entries(enums)) if(c[key]!=null&&!values.includes(c[key])) add('CLADDING',`${key}: opção de revestimento inválida.`);
      if(c.fixingConfirmed!=null&&typeof c.fixingConfirmed!=='boolean')add('CLADDING','Confirmação da fixação deve ser booleana.');
      for(const key of Object.keys(c))if(!Object.hasOwn(enums,key)&&key!=='fixingConfirmed')add('CLADDING',`Parâmetro de revestimento desconhecido: ${key}.`);
    }
  }
  if (project.assemblyMode != null && !['tray', 'wrap'].includes(project.assemblyMode)) add('ASSEMBLY_MODE', 'Modo de montagem inválido.');
  if (project.schemaVersion !== 1 || project.units !== 'mm') add('SCHEMA', 'Versão do projeto ou unidade não suportada.');
  if (!Number.isInteger(project.revision) || project.revision < 1) add('REVISION', 'Revisão deve ser um inteiro positivo.');
  for (const key of ['id', 'name']) if (typeof project[key] !== 'string' || !project[key].trim() || project[key].length > 200) add('IDENTITY', `${key}: identificação inválida.`);
  for (const key of ['front', 'left', 'right', 'soffit', 'material', 'layout', 'edges', 'overrides', 'fabrication', 'stock', 'structure', 'fixing', 'costs']) if (!plain(project[key])) add('SECTION', `Seção ${key} ausente ou inválida.`);
  if (errors.length) return errors;
  const dimension = (value, field, min = 0.01, max = LIMITS.dimension) => { if (!num(value, min, max)) add('DIMENSION', `${field}: valor deve ser numérico entre ${min} e ${max} mm.`); };
  dimension(project.front.width, 'Largura frontal'); dimension(project.front.height, 'Altura frontal');
  for (const key of ['left', 'right', 'soffit']) {
    if (typeof project[key].enabled !== 'boolean') add('BOOLEAN', `${key}.enabled deve ser booleano.`);
    dimension(project[key].depth, `${key}.depth`);
    dimension(project[key][key === 'soffit' ? 'width' : 'height'], `${key}.dimensão`);
  }
  for (const key of ['x', 'y']) if (project.soffit[key] != null) dimension(project.soffit[key], `soffit.${key}`, 0);
  if (project.layout.optimizationPriority != null && !['sheets', 'seams', 'cost', 'visual'].includes(project.layout.optimizationPriority)) add('OPTIMIZATION_PRIORITY', 'Prioridade de aproveitamento inválida.');
  if (!['vertical', 'horizontal', 'mixed', 'manual'].includes(project.layout.orientation)) add('LAYOUT', 'Orientação de modulação inválida.');
  for (const key of ['maxWidth', 'maxHeight', 'minimumStrip']) dimension(project.layout[key], `layout.${key}`);
  dimension(project.layout.joint, 'Junta', 0, 500);
  const checkEdges = (edges, prefix, partial = false) => {
    if (!plain(edges)) { add('EDGES', `${prefix}: abas inválidas.`); return; }
    for (const key of Object.keys(edges)) if (!EDGE_NAMES.includes(key)) add('EDGES', `${prefix}: borda desconhecida ${key}.`);
    for (const key of EDGE_NAMES) {
      if (partial && !Object.hasOwn(edges, key)) continue;
      const edge = edges[key];
      errors.push(...validateFoldEdge(edge, `${prefix}.${key}`));
      if (plain(edge) && !['fold', 'none'].includes(edge.type)) add('EDGE_TYPE', `${prefix}.${key}: tipo inválido.`);
      dimension(edgeHeight(edge), `${prefix}.${key}`, 0, 500);
    }
  };
  const checkMaterial = (material, prefix) => {
    if (!plain(material)) { add('MATERIAL', `${prefix}: material inválido.`); return; }
    if (![3, 4].includes(material.thickness)) add('THICKNESS', `${prefix}: espessura de ACM deve ser 3 ou 4 mm.`);
    if (typeof material.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(material.color)) add('COLOR', `${prefix}: cor deve usar #RRGGBB.`);
    if (!['matte', 'glossy', 'metallic', 'brushed', 'wood', 'mirror'].includes(material.finish)) add('FINISH', `${prefix}: acabamento inválido.`);
    if (typeof material.directional !== 'boolean') add('DIRECTION', `${prefix}: sentido do acabamento deve ser booleano.`);
    if (material.skin != null) dimension(material.skin, `${prefix}.skin`, 0.01, material.thickness / 2 - 0.001);
    if (material.formats != null) {
      if (!Array.isArray(material.formats) || material.formats.length > 100) add('MATERIAL_FORMATS', `${prefix}: formatos comerciais inválidos.`);
      else { const formatIds = new Set(); for (const [index, format] of material.formats.entries()) {
        if (!plain(format)) { add('MATERIAL_FORMATS', `${prefix}: formato ${index + 1} inválido.`); continue; }
        dimension(format.width, `${prefix}: largura comercial`); dimension(format.length, `${prefix}: comprimento comercial`);
        const key = `${format.width}/${format.length}`;
        if (formatIds.has(key)) add('MATERIAL_FORMATS', `${prefix}: formato comercial duplicado.`);
        formatIds.add(key);
      } }
    }
    if (material.application != null && (typeof material.application !== 'string' || material.application.length > 2000)) add('MATERIAL_APPLICATION', `${prefix}: aplicação indicada inválida.`);
    if (material.updatedAt != null && material.updatedAt !== '' && (typeof material.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(material.updatedAt) || !Number.isFinite(Date.parse(material.updatedAt)) || new Date(material.updatedAt).toISOString().slice(0, 10) !== material.updatedAt)) add('MATERIAL_DATE', `${prefix}: data comercial inválida.`);
    errors.push(...validateMaterialProcess(material, project.fabrication, prefix));
  };
  const checkFixing = (fixing, prefix) => {
    if (!plain(fixing)) { add('FIXING', `${prefix}: fixação inválida.`); return; }
    if (!['tape', 'screws', 'hybrid'].includes(fixing.type)) add('FIXING', `${prefix}: tipo de fixação inválido.`);
    for (const key of ['tapeWidth', 'screwPitch']) dimension(fixing[key], `${prefix}.${key}`, 0.1, 10000);
    for (const key of ['thickness', 'edgeOffset']) dimension(fixing[key], `${prefix}.${key}`, 0, 500);
    if (typeof fixing.validated !== 'boolean') add('FIXING_VALIDATED', `${prefix}: validação deve ser booleana.`);
    errors.push(...validateFixingDetails(fixing).map(error => ({...error,message:`${prefix}: ${error.message}`})));
  };
  checkEdges(project.edges, 'edges'); checkMaterial(project.material, 'material'); checkFixing(project.fixing, 'fixing');
  for (const [id, override] of Object.entries(project.overrides)) {
    if (!plain(override)) { add('OVERRIDE', `${id}: configuração de peça inválida.`); continue; }
    if (override.edges) checkEdges(override.edges, `${id}.edges`, true);
    const surfaceId = (Array.isArray(project.layout.manual) ? project.layout.manual.find(item => item?.id === id)?.surface : null) ?? /^(front|left|right|soffit)-/.exec(id)?.[1];
    if (override.material) checkMaterial({ ...project.material, ...(project.surfaceMaterials?.[surfaceId] ?? {}), ...override.material }, `${id}.material`);
    if (override.fixing != null) {
      if (!plain(override.fixing) || Array.isArray(override.fixing)) add('FIXING', `${id}: configuração de fixação inválida.`);
      else {
        for (const key of ['pattern','screwProduct','tapeProduct']) if (override.fixing[key] != null && (!plain(override.fixing[key]) || Array.isArray(override.fixing[key]))) add('FIXING_DETAILS', `${id}.${key}: deve ser um objeto.`);
        checkFixing(resolveFixing(project,{id}), `${id}.fixing`);
      }
    }
    if (override.locked != null && typeof override.locked !== 'boolean') add('LOCK', `${id}: bloqueio inválido.`);
  }
  if (project.surfaceMaterials != null) {
    if (!plain(project.surfaceMaterials)) add('MATERIAL', 'Materiais das superfícies inválidos.');
    else for (const [id, material] of Object.entries(project.surfaceMaterials)) checkMaterial({ ...project.material, ...material }, `${id}.material`);
  }
  if (project.layout.manual != null) {
    if (!Array.isArray(project.layout.manual) || project.layout.manual.length > LIMITS.pieces) add('MANUAL', 'Lista de peças manuais inválida.');
    else for (const item of project.layout.manual) {
      if (!plain(item)) { add('MANUAL', 'Peça manual deve ser objeto.'); continue; }
      if (item.id != null && (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 || /[.\u0000-\u001f]/.test(item.id) || ['__proto__','prototype','constructor'].includes(item.id))) add('MANUAL_ID', 'Identificação de peça manual deve ser texto sem ponto, controle ou palavra reservada.');
      if (!['front', 'left', 'right', 'soffit'].includes(item.surface) || item.surface !== 'front' && !project[item.surface]?.enabled) add('MANUAL_SURFACE', 'Peça manual aponta para superfície desconhecida ou desativada.');
    }
  }
  const f = project.fabrication;
  if (f.cutMode != null && !['router', 'saw'].includes(f.cutMode)) add('CUT_MODE', 'Modo de corte inválido.');
  for (const key of ['cornerRelief', 'grooveWidth', 'toolFlat']) dimension(f[key], `fabrication.${key}`, 0, 100);
  dimension(f.toolAngle, 'Ângulo da fresa', 1, 179);
  for (const key of ['machineWidth', 'machineLength']) dimension(f[key], `fabrication.${key}`);
  if (plain(f.compensation)) for (const key of EDGE_NAMES) dimension(f.compensation[key] ?? 0, `compensation.${key}`, -20, 20);
  else dimension(f.compensation, 'Compensação', -20, 20);
  if (f.depth != null) dimension(f.depth, 'Profundidade de fresagem', 0, project.material.thickness);
  if (f.remainingCore != null) dimension(f.remainingCore, 'Núcleo residual', 0, project.material.thickness);
  if (f.toolFlat > f.grooveWidth) add('TOOL', 'O fundo da fresa excede a largura do canal.');
  const stock = project.stock;
  for (const key of ['width', 'length']) dimension(stock[key], `stock.${key}`);
  for (const key of ['trim', 'kerf']) dimension(stock[key], `stock.${key}`, 0, 1000);
  if (stock.trim * 2 >= Math.min(stock.width, stock.length)) add('TRIM', 'Refilo elimina toda a área útil da chapa.');
  if (typeof stock.rotation !== 'boolean') add('ROTATION', 'Permissão de rotação inválida.');
  if (stock.quantity != null && (!Number.isInteger(stock.quantity) || stock.quantity < 0 || stock.quantity > LIMITS.stock)) add('QUANTITY', 'Quantidade de chapas inválida.');
  if (!Array.isArray(stock.remnants) || stock.remnants.length > 100) add('REMNANTS', 'Lista de retalhos inválida (limite 100).');
  else for (const [i, remnant] of stock.remnants.entries()) {
    if (!plain(remnant)) { add('REMNANT', `Retalho ${i + 1} inválido.`); continue; }
    dimension(remnant.width, `Retalho ${i + 1}: largura`); dimension(remnant.length, `Retalho ${i + 1}: comprimento`);
    if (remnant.trim != null) dimension(remnant.trim, `Retalho ${i + 1}: refilo`, 0, 1000);
    if (typeof remnant.id !== 'string' || !remnant.id) add('REMNANT_ID', 'Retalhos precisam de identificação.');
  }
  if (project.technicalDrawing != null) errors.push(...validateTechnicalDrawing(project.technicalDrawing));
  errors.push(...validateStructureFrame(project.structure), ...validateVisual(project.visual), ...validateInstallation(project.installation));
  if (project.titleBlock != null) {
    if (!plain(project.titleBlock)) add('TITLE_BLOCK','Identificação da prancha inválida.');
    else for (const [key,value] of Object.entries(project.titleBlock)) if (typeof value !== 'string' || value.length > 1000) add('TITLE_BLOCK', `${key}: identificação deve ser texto de até 1000 caracteres.`);
  }
  const st = project.structure;
  const profile = PROFILES.find(p => p.id === st.profile) ?? st.customProfile;
  if (!plain(profile) || !num(profile.width, 1, 1000) || !num(profile.depth, 1, 1000)) add('PROFILE', 'Perfil metálico inválido; cadastre largura e profundidade.');
  if (st.wall != null) dimension(st.wall, 'Parede do metalon', 0.1, profile ? Math.min(profile.width, profile.depth) / 2 - 0.01 : 500);
  dimension(st.spacing, 'Espaçamento de montantes', 1); dimension(st.barLength, 'Barra comercial', 1); dimension(st.kerf, 'Corte da barra', 0, 100);
  if (!Array.isArray(project.openings) || project.openings.length > LIMITS.openings) add('OPENINGS', `Limite de ${LIMITS.openings} aberturas.`);
  else for (const [i, opening] of project.openings.entries()) {
    if (!plain(opening)) { add('OPENING', `Abertura ${i + 1} inválida.`); continue; }
    if (!['front', 'left', 'right', 'soffit'].includes(opening.surface ?? 'front')) add('OPENING_SURFACE', 'Superfície de abertura inválida.');
    for (const key of ['x', 'y']) dimension(opening[key], `Abertura ${i + 1}: ${key}`, 0);
    for (const key of ['width', 'height']) dimension(opening[key], `Abertura ${i + 1}: ${key}`);
  }
  for (const [key, value] of Object.entries(project.costs)) if (!['sheetReference', 'sheetQuotes'].includes(key) && value != null && !num(value, 0, 1e9)) add('COST', `${key}: custo inválido.`);
  const quoteReference = (reference, label, withPrice = false) => {
    if (!plain(reference) || typeof reference.materialKey !== 'string' || !reference.materialKey || reference.materialKey.length > 10000 || !num(reference.width, 0.01) || !num(reference.length, 0.01) || withPrice && !num(reference.price, 0, 1e9)) add('SHEET_QUOTE', `${label}: cotação precisa identificar material, formato e preço válido.`);
  };
  if (project.costs.sheetReference != null) quoteReference(project.costs.sheetReference, 'Preço principal');
  if (project.costs.sheetQuotes != null) {
    if (!Array.isArray(project.costs.sheetQuotes) || project.costs.sheetQuotes.length > 100) add('SHEET_QUOTE', 'Limite de 100 cotações de chapas.');
    else { const quoteIds = new Set(); for (const quote of project.costs.sheetQuotes) {
      quoteReference(quote, 'Cotação de chapa', true);
      if (plain(quote)) { const key = JSON.stringify([quote.materialKey, quote.width, quote.length]); if (quoteIds.has(key)) add('SHEET_QUOTE', 'Há cotações duplicadas para o mesmo material e formato.'); quoteIds.add(key); }
    } }
  }
  return errors;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function calibrationSignature(project) {
  const { calibration: _calibration, ...process } = project.fabrication;
  return JSON.stringify(canonical({ material: project.material, process, edges: project.edges, overrides: Object.fromEntries(Object.entries(project.overrides).filter(([,value])=>value.edges).map(([id,value])=>[id,value.edges])), geometry: { front: project.front, left: project.left, right: project.right, soffit: project.soffit, layout: project.layout, openings: project.openings, technicalDrawing: project.technicalDrawing } }));
}
export function calibrationStatus(project) {
  const calibration = project.fabrication?.calibration;
  if (!plain(calibration) || calibration.approved !== true) return { valid: false, reason: 'Corpo de prova ainda não aprovado.' };
  if (calibration.signature !== calibrationSignature(project)) return { valid: false, reason: 'Configuração alterada após a calibração.' };
  const edges = [...Object.values(project.edges ?? {}), ...Object.values(project.overrides ?? {}).flatMap(override => Object.values(override.edges ?? {}))];
  if (edges.some(edge => { const folds = edgeFolds(edge); return folds.length > 1 || folds.some(fold => fold.angle !== 90); })) return { valid: false, reason: 'Registro legado de prova a 90° não valida múltiplas dobras ou outros ângulos; conferir cada operação em corpo de prova específico.' };
  if (typeof calibration.responsible !== 'string' || !calibration.responsible.trim() || typeof calibration.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(calibration.date) || !Number.isFinite(Date.parse(calibration.date))) return { valid: false, reason: 'Informe responsável e data válida da calibração.' };
  if (project.material.skin == null || project.fabrication.depth == null || project.fabrication.remainingCore == null) return { valid: false, reason: 'Defina lâmina, profundidade e núcleo residual do processo testado.' };
  for (const key of ['targetWidth', 'targetHeight', 'measuredWidth', 'measuredHeight']) if (!num(calibration[key], 0.01)) return { valid: false, reason: 'Registre dimensões alvo e medidas do corpo de prova.' };
  if (!num(calibration.tolerance, 0, 10) || !num(calibration.angle, 1, 179)) return { valid: false, reason: 'Registre tolerância e ângulo medido válidos.' };
  const angleTolerance = calibration.angleTolerance ?? 1;
  if (!num(angleTolerance, 0, 5) || Math.abs(calibration.angle - 90) > angleTolerance || Math.abs(calibration.measuredWidth - calibration.targetWidth) > calibration.tolerance || Math.abs(calibration.measuredHeight - calibration.targetHeight) > calibration.tolerance) return { valid: false, reason: 'Corpo de prova fora da tolerância registrada.' };
  if (calibration.visualApproved !== true || calibration.fitApproved !== true) return { valid: false, reason: 'Confirme qualidade visual da dobra e encaixe do corpo de prova.' };
  return { valid: true, reason: 'Configuração vinculada ao corpo de prova registrado.' };
}
