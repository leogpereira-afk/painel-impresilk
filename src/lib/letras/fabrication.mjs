import { letterGeometrySignature } from './input.mjs';
import { escapeHTML } from '../acm/documents.mjs';

const esc = value => escapeHTML(String(value ?? ''));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round(value * 1000) / 1000;
const fmt = value => finite(value) ? round(value).toLocaleString('pt-BR') : 'a definir';
const machineNames = { 'laser-fiber': 'Laser de fibra · metal', 'laser-co2': 'Laser CO₂ · acrílico / MDF', router: 'Router · usinagem', 'manual-cut': 'Corte manual · lateral polimérica' };
const materialNames = { galvanized: 'Aço galvanizado', acrylic: 'Acrílico', mdf: 'MDF', pvc: 'PVC', acm: 'ACM', polymeric: 'Lateral polimérica' };
export const FABRICATION_JOIN_METHODS = [['pending', 'A definir'], ['weld', 'Soldagem conforme procedimento'], ['solder', 'Solda branda conforme procedimento'], ['mechanical', 'União mecânica'], ['adhesive', 'União adesiva']];
export function createFabricationConfig(value = {}) {
  const config = { joinMethod: 'pending', joinConfirmed: false, overlapMm: null, compensationMm: null, compensationConfirmed: false, flangeMode: 'none', joinFlangeMm: null, maxStripLengthMm: null, segmentsPerContour: 1, seamsByStrip: {}, startOffsetsByStrip: {}, reference: '', ...value };
  for (const key of ['overlapMm', 'compensationMm', 'joinFlangeMm', 'maxStripLengthMm']) config[key] ??= null;
  return config;
}

export function fabricationSignature(project) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const input = JSON.stringify(canonical(createFabricationConfig(project?.fabrication)));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `${letterGeometrySignature(project)}:fabrication-3:${input.length}:${(hash >>> 0).toString(16)}`;
}

function configErrors(config) {
  if (!record(config)) return ['Configuração de fabricação inválida.'];
  const errors = [];
  for (const [key, title, min, max] of [['overlapMm', 'Sobreposição', 0, 1000], ['compensationMm', 'Compensação por contorno', -10000, 10000], ['joinFlangeMm', 'Aba de união', 0, 1000], ['maxStripLengthMm', 'Comprimento máximo', 1, 100000]]) {
    const value = config[key];
    if (value != null && (!finite(value) || value < min || value > max)) errors.push(`${title}: informe valor entre ${min} e ${max} mm.`);
  }
  if (!FABRICATION_JOIN_METHODS.some(([key]) => key === config.joinMethod)) errors.push('Processo de união inválido.');
  if (!['none', 'manual'].includes(config.flangeMode)) errors.push('Modo de aba inválido.');
  if (!Number.isInteger(config.segmentsPerContour) || config.segmentsPerContour < 1 || config.segmentsPerContour > 100) errors.push('Divisão deve ter entre 1 e 100 faixas por contorno.');
  if (!record(config.seamsByStrip)) errors.push('Posições de emenda inválidas.');
  else for (const [id, values] of Object.entries(config.seamsByStrip)) if (!Array.isArray(values) || values.length > 99 || values.some(x => !finite(x) || x <= 0)) errors.push(`${id}: emendas exigem distâncias positivas em mm.`);
  if (!record(config.startOffsetsByStrip)) errors.push('Origens de faixa inválidas.');
  else for (const [id, value] of Object.entries(config.startOffsetsByStrip)) if (!finite(value) || value < 0) errors.push(`${id}: origem exige distância não negativa em mm.`);
  for (const key of ['joinConfirmed', 'compensationConfirmed']) if (typeof config[key] !== 'boolean') errors.push(`Confirmação ${key} inválida.`);
  if (typeof config.reference !== 'string' || config.reference.length > 1000) errors.push('Referência de procedimento inválida.');
  return errors;
}
export function validateFabricationConfig(value) {
  return record(value) ? configErrors(createFabricationConfig(value)) : ['Configuração de fabricação inválida.'];
}
function geometryErrors(project, result) {
  if (!record(project) || !record(result)) return ['Projeto e geometria obrigatórios.'];
  if (project.id !== result.projectId || project.revision !== result.revision) return ['Geometria de outra revisão. Recalcule.'];
  if (result.signature !== letterGeometrySignature(project)) return ['Assinatura dos parâmetros diverge da geometria. Recalcule.'];
  if (result.errors?.length) return ['Geometria inválida; fabricação bloqueada.', ...result.errors];
  if (!Array.isArray(result.components) || !Array.isArray(result.strips) || !Array.isArray(result.letters)) return ['Componentes de fabricação inválidos.'];
  return [];
}
const unique = values => [...new Set(values)];
// Distances follow the stored contour order, in local piece coordinates (Y up).
// These are geometric references; they are never bending instructions or toolpaths.
function ringGeometry(points) {
  const lengths = points.map((a, index) => { const b = points[(index + 1) % points.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
  const stations = []; let length = 0, signedArea = 0;
  for (let index = 0; index < points.length; index++) {
    stations.push(length); length += lengths[index];
    const a = points[index], b = points[(index + 1) % points.length]; signedArea += a[0] * b[1] - b[0] * a[1];
  }
  const references = points.map((point, index) => {
    const prev = points[(index + points.length - 1) % points.length], next = points[(index + 1) % points.length];
    const ax = point[0] - prev[0], ay = point[1] - prev[1], bx = next[0] - point[0], by = next[1] - point[1];
    const turnAngleDeg = Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180 / Math.PI;
    return { vertexIndex: index, contourOffsetMm: stations[index], point: [...point], turnAngleDeg, kind: Math.abs(turnAngleDeg) >= 20 - 1e-7 ? 'direction-change' : 'curve-sample' };
  });
  return { points, lengths, stations, length, winding: signedArea > 0 ? 'counterclockwise' : 'clockwise', references };
}
const modulo = (value, length) => ((value % length) + length) % length;
function pointAt(ring, distance) {
  const offset = modulo(distance, ring.length);
  for (let index = 0; index < ring.points.length; index++) {
    if (offset <= ring.stations[index] + ring.lengths[index] + 1e-9 || index === ring.points.length - 1) {
      const a = ring.points[index], b = ring.points[(index + 1) % ring.points.length];
      const t = ring.lengths[index] ? Math.max(0, Math.min(1, (offset - ring.stations[index]) / ring.lengths[index])) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return [...ring.points[0]];
}
function pathBetween(ring, start, end) {
  const points = [pointAt(ring, start)];
  for (let cycle = Math.floor(start / ring.length); cycle <= Math.floor(end / ring.length); cycle++) {
    for (let index = 0; index < ring.points.length; index++) {
      const position = cycle * ring.length + ring.stations[index];
      if (position > start + 1e-8 && position < end - 1e-8) points.push([...ring.points[index]]);
    }
  }
  points.push(pointAt(ring, end));
  return points;
}
function developStrip(strip, config, errors, pending) {
  const length = strip.nominalLengthMm;
  if (!finite(length) || length <= 0 || !finite(strip.width) || strip.width <= 0 || !Array.isArray(strip.points) || strip.points.length < 3 || strip.points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !finite(value)))) { errors.push(`${strip.id}: contorno ou largura inválidos.`); return null; }
  const ring = ringGeometry(strip.points);
  if (Math.abs(ring.length - length) > Math.max(1e-6, length * 1e-9) || ring.lengths.some(value => value <= 1e-9)) { errors.push(`${strip.id}: perímetro e pontos do contorno divergem ou contêm aresta nula. Recalcule.`); return null; }
  const startOffsetMm = config.startOffsetsByStrip[strip.id] ?? 0;
  if (startOffsetMm >= length) { errors.push(`${strip.id}: origem deve ser menor que o comprimento do contorno; confira após redimensionar a arte.`); return null; }
  const explicit = config.seamsByStrip[strip.id] || [];
  if (explicit.some(value => value >= length) || new Set(explicit).size !== explicit.length) { errors.push(`${strip.id}: emendas devem ser únicas e menores que o comprimento nominal.`); return null; }
  const known = config.compensationMm !== null && config.overlapMm !== null;
  const adjusted = length + (config.compensationMm ?? 0);
  if (adjusted <= 0) { errors.push(`${strip.id}: compensação elimina o comprimento da faixa.`); return null; }
  let count = explicit.length ? explicit.length + 1 : config.segmentsPerContour;
  if (!explicit.length && config.maxStripLengthMm !== null) {
    const available = config.maxStripLengthMm - (config.overlapMm ?? 0);
    if (available <= 0) { errors.push(`${strip.id}: limite de faixa deve exceder a sobreposição.`); return null; }
    count = Math.max(count, Math.ceil(adjusted / available));
  }
  if (count > 100) { errors.push(`${strip.id}: divisão excede 100 faixas; reveja comprimento máximo.`); return null; }
  const breaks = [0, ...(explicit.length ? [...explicit].sort((a, b) => a - b) : Array.from({ length: count - 1 }, (_, i) => length * (i + 1) / count)), length];
  const widthKnown = config.flangeMode === 'none' || config.joinFlangeMm !== null;
  const flangeMm = config.flangeMode === 'none' ? 0 : config.joinFlangeMm;
  const widthMm = widthKnown ? strip.width + flangeMm : null;
  const references = ring.references.map(reference => ({ ...reference, offsetMm: modulo(reference.contourOffsetMm - startOffsetMm, length) })).sort((a, b) => a.offsetMm - b.offsetMm);
  const segments = breaks.slice(0, -1).map((start, i) => {
    const end = breaks[i + 1], nominalLengthMm = end - start;
    const compensationMm = config.compensationMm === null ? null : config.compensationMm * nominalLengthMm / length;
    const bodyDevelopedLengthMm = compensationMm === null ? null : nominalLengthMm + compensationMm;
    const grossLengthMm = known ? bodyDevelopedLengthMm + config.overlapMm : null;
    const withinLimit = config.maxStripLengthMm === null ? null : grossLengthMm === null ? null : grossLengthMm <= config.maxStripLengthMm + 1e-7;
    if (withinLimit === false) errors.push(`${strip.id}-F${i + 1}: excede o comprimento máximo; ajuste as emendas.`);
    const pathPoints = pathBetween(ring, startOffsetMm + start, startOffsetMm + end);
    // Reference positions are nominal stations. Nonzero compensation does not
    // specify how real bends/curves absorb it, so it cannot imply mark coordinates.
    const referenceMarks = references.filter(reference => reference.offsetMm > start + 1e-8 && reference.offsetMm < end - 1e-8).map(reference => ({ ...reference, stripOffsetMm: reference.offsetMm, offsetMm: reference.offsetMm - start, developedOffsetMm: config.compensationMm === 0 ? reference.offsetMm - start : null }));
    return { id: `${strip.id}-F${i + 1}`, parentId: strip.id, letterId: strip.letterId, index: i + 1, startMm: start, endMm: end, nominalLengthMm, compensationMm, overlapMm: config.overlapMm, bodyDevelopedLengthMm, grossLengthMm, depthMm: strip.width, flangeMm, widthMm, withinLimit, contourStartMm: modulo(startOffsetMm + start, length), contourEndMm: modulo(startOffsetMm + end, length), pathPoints, referenceMarks, startPoint: pathPoints[0], endPoint: pathPoints[pathPoints.length - 1], status: known && widthKnown && config.compensationConfirmed && config.joinConfirmed && config.joinMethod !== 'pending' && config.reference.trim() ? 'ready-for-review' : 'planned' };
  });
  const seams = segments.map((segment, index) => ({ id: `${strip.id}-E${index + 1}`, index: index + 1, offsetMm: segment.startMm, contourOffsetMm: segment.contourStartMm, point: [...segment.startPoint], kind: index === 0 ? 'closure' : 'between-segments', joins: [segments[(index + segments.length - 1) % segments.length].id, segment.id] }));
  const sum = key => segments.reduce((total, item) => total + item[key], 0);
  const grossLengthMm = known ? sum('grossLengthMm') : null;
  const audit = { sourceLengthMm: length, sumNominalMm: sum('nominalLengthMm'), nominalDifferenceMm: sum('nominalLengthMm') - length, sumCompensationMm: config.compensationMm === null ? null : sum('compensationMm'), sumOverlapMm: config.overlapMm === null ? null : segments.length * config.overlapMm, sumDevelopedMm: grossLengthMm, pathLengthMm: segments.reduce((total, segment) => total + segment.pathPoints.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - segment.pathPoints[index][0], point[1] - segment.pathPoints[index][1]), 0), 0) };
  if (Math.abs(audit.pathLengthMm - length) > Math.max(1e-6, length * 1e-9)) errors.push(`${strip.id}: percursos das faixas não reconciliam com o contorno.`);
  if (explicit.length || startOffsetMm) pending.push(`${strip.id}: conferir posição das emendas e origem no contorno antes de cortar.`);
  return { ...strip, startOffsetMm, start: pointAt(ring, startOffsetMm), winding: ring.winding, depthMm: strip.width, flangeMm, widthMm, compensationMm: config.compensationMm, overlapMm: config.overlapMm, grossLengthMm, references, segments, seams, audit, seamCount: segments.length, status: segments.every(item => item.status === 'ready-for-review') ? 'ready-for-review' : 'planned' };
}
function route(project, result, strips, cutGroups, pending) {
  const family = project.construction?.family || '', flat = family.startsWith('flat-'), luminous = ['galvanized-acrylic', 'backlit', 'polymeric'].includes(family);
  const steps = [];
  const add = (id, title, sector, operations, componentIds, issues = [], drawing = 'assembly') => {
    steps.push({ id, order: steps.length + 1, title, sector, operations, componentIds, dependsOn: [], pending: issues, status: issues.length ? 'planned' : 'ready-for-review', drawing });
  };
  const ids = result.components.map(item => item.id);
  add('artwork', 'Conferir arte, escala e vazados', 'Projeto / pré-impressão', ['Conferir revisão, medidas externas, unidades em mm e contornos internos.', 'Relacionar cada letra aos IDs das peças e conferir sentido / origem das laterais.'], ids, ['Aprovação dimensional e tolerância de fabricação na oficina.'], 'artwork');
  for (const operation of ['laser-fiber', 'laser-co2', 'router', 'manual-cut']) {
    const groups = cutGroups.filter(group => group.operation === operation);
    if (groups.length) add(`cut-${operation}`, machineNames[operation], 'Corte', groups.map(group => `${materialNames[group.material] || group.material} · ${fmt(group.thickness)} mm: ${group.items.length} peça(s). Conferir parâmetros e espessura na máquina.`), groups.flatMap(group => group.items.map(item => item.id)), groups.some(group => group.items.some(item => item.kind === 'strip' && (item.grossLengthMm === null || item.widthMm === null))) ? ['Faixas nominais: informar compensação, sobreposição e aba quando aplicável antes do desenvolvimento.'] : ['Validar parâmetros de máquina e arquivo no CAD/CAM.'], 'cut');
  }
  if (!flat && strips.length) {
    add('forming', 'Conformar laterais externas e vazados', 'Fabricação / bancada', ['Separar laterais externas e internas pelos IDs.', 'Partir da marca REF 0 e conferir o sentido contra o contorno.', 'Conformar cada trecho e conferir encaixe na face/fundo. Referências não são linhas de vinco.', ...(family === 'acm' ? ['Face ACM plana com laterais separadas; nenhum friso V ou dobra de ACM calculado.'] : [])], strips.flatMap(strip => strip.segments.map(item => item.id)), ['Ferramental, raios e compensações exigem procedimento do material e prova de encaixe.'], 'strips');
    add('joining', 'Unir laterais e remover rebarbas', 'Fabricação / bancada', [`União selecionada: ${FABRICATION_JOIN_METHODS.find(([key]) => key === project.fabrication?.joinMethod)?.[1] || 'A definir'}.`, 'Conferir sobreposição das emendas, aba se prevista e conexão ao corpo conforme procedimento.', 'Remover rebarbas e conferir arestas, esquadro e encaixe antes do acabamento.'], ids, pending.filter(item => /união|sobreposição|aba|procedimento/i.test(item)), 'assembly');
  } else if (flat) {
    add('finishing-edges', 'Acabar bordas e conferir camadas', 'Acabamento', ['Retirar rebarbas/resíduos de corte conforme o material.', 'Conferir vazados e registrar a sequência e alinhamento das camadas.'], ids, ['Processo de acabamento compatível com o substrato.'], 'assembly');
    if ((project.construction?.layers || []).length > 1) add('layers', 'Montar e alinhar camadas', 'Montagem', ['Conferir ordem, espessura total e registro entre as camadas.', 'Selecionar adesivo ou fixação compatível e conferir o conjunto.'], ids, ['Método e procedimento de união entre camadas a confirmar.']);
  }
  if (project.painting?.mode !== 'none') add('painting', 'Preparo → primer → pintura → verniz / cura', 'Pintura', ['Selecionar as superfícies efetivamente pintadas.', 'Executar somente camadas aplicáveis, conforme ficha e sistema compatível com o substrato.', 'Registrar preparo, demãos e condições. Confirmar cura real antes de montar ou embalar.'], ids.filter(id => project.painting?.surfaces?.includes(id)), ['Cor física, sistema e liberação de cura devem ser conferidos no painel Pintura. Tempo decorrido não confirma cura.']);
  if (luminous) add('lighting', family === 'backlit' ? 'Montar LEDs e testar halo / afastamento' : 'Montar LEDs e testar com a face', 'Elétrica / montagem', ['Posicionar módulos conforme distribuição desta revisão, respeitando vazados e folgas.', 'Executar ramais e fontes segundo ficha; conferir polaridade, tensão e conexões.', family === 'backlit' ? 'Testar halo com o fundo e afastamento real do suporte; registrar antes de fechar.' : 'Testar uniformidade com a face acrílica e registrar o resultado antes de fechar.'], ids, ['Revisar distribuição e dimensionamento elétrico; teste físico do conjunto obrigatório.']);
  if (!flat) add('closing', 'Fechar corpo e conferir fixações', 'Montagem', ['Conferir face, fundo quando previsto, encaixes e método de fechamento.', 'Conferir fixações letra–suporte e acesso de manutenção conforme o projeto.'], ids, ['Folga da face, fechamento e capacidade das fixações exigem conferência.']);
  else add('fixing', 'Preparar fixações', 'Montagem', ['Conferir os pontos e método de fixação das letras planas ao suporte.'], ids, ['Fixação e substrato devem ser definidos para o local.']);
  add('template', 'Molde, identificação e embalagem', 'Expedição', ['Conferir posição das letras no molde da revisão atual.', 'Identificar peças e acessórios pelos IDs, proteger o acabamento após liberação de cura e conferir volumes.'], ids, ['Molde de posição não contém furos ou capacidade de fixação presumidos.'], 'artwork');
  add('installation', 'Instalar e conferir o conjunto', 'Instalação', ['Conferir medidas reais, acesso, base e plano de instalação.', 'Transferir o molde, instalar as fixações aprovadas e conferir alinhamento.', ...(luminous ? ['Conferir alimentação e teste final da iluminação com profissional responsável.'] : [])], ids, ['Planejamento não substitui avaliação estrutural ou elétrica do local.'], 'artwork');
  // Display order is not a production dependency: independent machines can cut in parallel.
  const stepIds = new Set(steps.map(step => step.id));
  const cutIds = steps.filter(step => step.id.startsWith('cut-')).map(step => step.id);
  const sideCutIds = unique(cutGroups.filter(group => group.items.some(item => item.kind === 'strip')).map(group => `cut-${group.operation}`));
  const preparation = flat ? (stepIds.has('layers') ? 'layers' : 'finishing-edges') : 'joining';
  const present = ids => unique(ids.filter(id => stepIds.has(id)));
  const dependencies = {
    artwork: [], forming: sideCutIds, joining: ['forming', ...cutIds],
    'finishing-edges': cutIds, layers: ['finishing-edges'], painting: [preparation],
    lighting: [...cutIds, preparation, 'painting'],
    closing: [...cutIds, preparation, 'painting', 'lighting'],
    fixing: [...cutIds, preparation, 'painting'],
    template: [flat ? 'fixing' : 'closing'], installation: ['template'],
  };
  for (const step of steps) step.dependsOn = present(step.id.startsWith('cut-') ? ['artwork'] : dependencies[step.id] || []);
  for (const step of steps) {
    const groups = step.id.startsWith('cut-') ? cutGroups.filter(group => `cut-${group.operation}` === step.id) : cutGroups;
    const materialSet = new Set(groups.map(group => group.material));
    const source = project.artwork?.mode === 'vector' ? `Arquivo importado ${project.artwork.fileName || '(sem nome)'} · escala física ${project.artwork.scaleConfirmed ? 'confirmada no cadastro' : 'pendente'}` : 'Texto convertido em contornos pelo motor';
    const details = {
      artwork: {
        inputs: [source, `${result.letters.length} forma(s), ${result.components.length} componente(s), revisão ${project.revision}.`],
        outputs: ['Contornos externos e vazados identificados, com origem, orientação e dimensões físicas.', 'Face, fundo e laterais vinculados à mesma arte.'],
        checks: ['Conferir largura e altura totais contra o briefing / O.S.; não medir pela imagem.', 'Conferir ilhas soltas, vazados e peças duplicadas.', 'Validar se a folga da face pertence a este processo; não escalar cada material independentemente.'],
      },
      forming: {
        inputs: [`${strips.length} contorno(s) de lateral, ${strips.reduce((sum, strip) => sum + strip.segments.length, 0)} faixa(s) identificada(s).`, 'Profundidade da letra, espessura da chapa e aba cadastradas separadamente.'],
        outputs: ['Laterais externas e de vazados conformadas e apresentadas contra a geometria da face/fundo.', 'Origem REF 0, sequência e emendas preservadas por faixa.'],
        checks: ['Conferir largura de cada faixa antes de conformar.', 'Percorrer as marcas no sentido indicado; cantos e amostras de curva são referências geométricas, não ângulos de dobra.', 'Ensaiar o encaixe; os offsets da face não alteram silenciosamente o perímetro da lateral.', 'Registrar correções de processo na revisão; não arredondar comprimentos acumulados a cada canto.'],
      },
      joining: {
        inputs: ['Faixas conformadas com sequência e extremidades identificadas.', 'Método de união, sobreposição, aba e procedimento de oficina.'],
        outputs: ['Corpo fechado com emendas identificadas e face/fundo compatíveis.', 'Registro de inspeção e tratamento de arestas / pontos de união.'],
        checks: ['Cada faixa recebe uma sobreposição de fechamento quando informada; conferir se o método selecionado realmente a exige.', 'Conferir emendas junto a cantos, vazados e pontos de fixação; posição geométrica não comprova viabilidade.', 'Conferir alinhamento, rebarbas e tratamento compatível da superfície antes da pintura.', 'Confirmar como face e fundo serão presos e acessados para manutenção.'],
      },
      'finishing-edges': { inputs: ['Peças planas separadas por material, espessura e revisão.'], outputs: ['Bordas, vazados e superfícies conferidos para o acabamento seguinte.'], checks: ['Conferir resíduos, lascas, lascamentos e medidas após corte.', 'Acabamento de MDF, acrílico e PVC exige procedimentos próprios; não aplicar o mesmo método automaticamente.'] },
      layers: { inputs: ['Camadas na ordem e orientação do projeto.', 'União compatível com os materiais informada.'], outputs: ['Conjunto de camadas alinhado e identificado.'], checks: ['Conferir registro dos vazados, espessura total e sentido frente / verso.', 'Conferir prazo e condição de cura antes de movimentar ou fixar.'] },
      painting: { inputs: ['Corpo / superfícies liberadas para acabamento.', 'Ficha de cor, preparo, primer, tinta, verniz e condições de cura.'], outputs: ['Superfícies acabadas e identificação de cor / acabamento.', 'Liberação de cura registrada pelo responsável.'], checks: ['Diferenciar seco ao toque, intervalo de repintura, manuseio e cura final.', 'Conferir substrato, produtos e compatibilidade entre camadas.', 'Não pintar áreas de união adesiva, conexão ou contato sem previsão no procedimento.'] },
      lighting: { inputs: ['Mapa de módulos, ramais, fontes e fios da mesma revisão.', 'Face translúcida ou conjunto retroiluminado previsto no projeto.'], outputs: ['Iluminação montada e testada em bancada.', 'Ramais, polaridade e pontos de manutenção identificados.'], checks: ['Conferir modelo real, quantidade e potência com a lista elétrica.', 'Conferir passagens de fios e afastamento das arestas.', 'Testar uniformidade com a face real ou halo no afastamento real; o desenho não é ensaio fotométrico.'] },
      closing: { inputs: ['Corpo, face e fundo conferidos; pintura e iluminação quando aplicáveis.'], outputs: ['Letra montada com fechamento e fixações identificados.'], checks: ['Conferir retenção da face e acesso de manutenção.', 'Conferir passagens, vedação e drenagem conforme o procedimento aplicável.', 'Conferir dimensões externas finais e orientação do conjunto.'] },
      fixing: { inputs: ['Letra plana ou conjunto de camadas.', 'Método e pontos de fixação aprovados para o substrato.'], outputs: ['Peças preparadas e fixadores separados por identificação.'], checks: ['Conferir posição, espessura disponível e interferências antes de furar.', 'Não deduzir capacidade de fixação pela quantidade de pontos desenhados.'] },
      template: { inputs: ['Composição aprovada e peças identificadas.', 'Pontos de fixação informados e revisados, quando existirem.'], outputs: ['Molde da revisão com referências, cotas e identificação.', 'Lista de volumes e acessórios para expedição.'], checks: ['Conferir escala de impressão por uma distância conhecida.', 'Conferir lado de leitura e posição dos vazados; não espelhar o molde sem indicação.', 'Relacionar cada volume à letra e à posição de instalação.'] },
      installation: { inputs: ['Ficha de instalação, foto e medidas conferidas.', 'Equipamento de acesso e fixação definidos pelo responsável.'], outputs: ['Conjunto instalado e inspeção registrada após execução real.'], checks: ['Conferir terreno, obstáculos e substrato na chegada.', 'Conferir cotas de marcação e nível antes de fixar.', 'Registrar execução e teste final; planejamento sozinho não conclui a etapa.'] },
    };
    if (step.id.startsWith('cut-')) details[step.id] = {
      inputs: groups.map(group => `${materialNames[group.material] || group.material} · ${fmt(group.thickness)} mm · ${group.items.length} peça(s) na mesma revisão.`),
      outputs: ['Peças e faixas separadas, identificadas e preservadas com o ID do plano de corte.', 'Sobras identificadas por material e espessura quando aproveitáveis.'],
      checks: ['Conferir formato da chapa, espessura, material e orientação do acabamento.', 'Conferir plano de corte da revisão; referências e textos devem ficar fora da camada de corte.', 'Conferir medidas no CAD/CAM e compensação de ferramenta; o SVG contém geometria nominal.', 'Conferir uma peça e o encaixe antes de repetir o lote.'],
    };
    const materialNotes = [];
    if (materialSet.has('galvanized') && ['cut-laser-fiber', 'forming', 'joining', 'painting'].includes(step.id)) materialNotes.push('Aço galvanizado: espessura em mm; número de chapa não é espessura em mm. Conferir procedimento de corte / união e proteção das áreas afetadas.');
    if (materialSet.has('acrylic') && ['cut-laser-co2', 'cut-router', 'closing'].includes(step.id)) materialNotes.push('Acrílico: conferir tipo, espessura, cor e proteção das faces; validar folga de encaixe e acabamento em amostra.');
    if (materialSet.has('mdf') && ['cut-laser-co2', 'cut-router', 'finishing-edges', 'painting'].includes(step.id)) materialNotes.push('MDF: corte, resíduos e selagem de bordas pertencem ao procedimento específico do material.');
    if (materialSet.has('pvc') && ['cut-router', 'finishing-edges'].includes(step.id)) materialNotes.push('PVC: este roteiro permite router; não encaminha PVC ao laser CO₂.');
    if (materialSet.has('acm') && ['cut-router', 'forming'].includes(step.id)) materialNotes.push('ACM: esta família usa face plana e laterais separadas. Frisos, alívios e desenvolvimento de ACM dobrado permanecem pendentes.');
    if (materialSet.has('polymeric') && ['cut-manual-cut', 'forming', 'joining'].includes(step.id)) materialNotes.push('Lateral polimérica: seguir o produto e método de união cadastrados; não usar soldagem metálica.');
    Object.assign(step, details[step.id] || { inputs: [], outputs: [], checks: [] }, { materialNotes });
  }
  return steps;
}

export function calculateFabrication(project, result) {
  const errors = geometryErrors(project, result), pending = [];
  const empty = { projectId: project?.id, revision: project?.revision, signature: fabricationSignature(project), units: 'mm', steps: [], strips: [], cutGroups: [], pending, errors, released: false, totals: { stripCount: 0, segmentCount: 0, nominalLengthMm: 0, developedLengthMm: null, developedAreaMm2: null } };
  if (errors.length) return empty;
  pending.push(...(result.pending || []).filter(message => !String(message).startsWith('Faixas em comprimento nominal:')));
  if (project.fabrication !== undefined && !record(project.fabrication)) { errors.push('Configuração de fabricação inválida.'); return empty; }
  const config = createFabricationConfig(project.fabrication);
  errors.push(...configErrors(config));
  if (errors.length) return empty;
  const supported = ['flat-mdf', 'flat-acrylic', 'flat-pvc', 'galvanized-acrylic', 'galvanized-blind', 'backlit', 'acm', 'polymeric'].includes(project.construction?.family);
  if (!supported || !result.components.length) { pending.push('Família sem roteiro completo de fabricação implementado.'); return empty; }
  if (result.strips.length) {
    if (result.strips.some(strip => strip.material !== 'galvanized') && ['weld', 'solder'].includes(config.joinMethod)) errors.push('Laterais não metálicas: processo de soldagem metálica incompatível. Selecione união compatível com o material.');
    if (config.joinMethod === 'pending') pending.push('Processo de união a definir.');
    if (!config.joinConfirmed || !config.reference.trim()) pending.push('Compatibilidade da união e procedimento de oficina pendentes.');
    if (config.overlapMm === null) pending.push('Sobreposição por emenda não informada; zero deve ser informado explicitamente quando aplicável.');
    if (config.compensationMm === null) pending.push('Compensação de comprimento por contorno não informada; não se assume zero.');
    else if (!config.compensationConfirmed || !config.reference.trim()) pending.push(`Compensação ${fmt(config.compensationMm)} mm informada, ainda não validada por procedimento.`);
    if (config.flangeMode === 'manual' && config.joinFlangeMm === null) pending.push('Largura adicional da aba de união não informada.');
    if (config.flangeMode === 'manual') pending.push('Aba adicionada à largura informada; raio, alívio e desenvolvimento da dobra exigem conferência. Nenhum vinco foi calculado.');
    if (config.maxStripLengthMm !== null && (config.compensationMm === null || config.overlapMm === null)) pending.push('Limite de comprimento considera divisão preliminar; comprimento final depende das compensações e sobreposições.');
  }
  const strips = result.strips.map(strip => developStrip(strip, config, errors, pending)).filter(Boolean);
  const currentIds = new Set(result.strips.map(strip => strip.id));
  for (const id of unique([...Object.keys(config.seamsByStrip), ...Object.keys(config.startOffsetsByStrip)])) if (!currentIds.has(id)) pending.push(`Emendas ou origem de ${id} não aplicadas: contorno ausente nesta revisão.`);
  const items = [...result.components.filter(item => item.role !== 'side').map(item => ({ ...item, kind: 'contour' })), ...strips.flatMap(strip => strip.segments.map(segment => ({ ...segment, kind: 'strip', label: strip.label, material: strip.material, thickness: strip.thickness, operation: strip.operation })))];
  const cutGroups = [];
  for (const item of items) {
    if ((item.material === 'pvc' && item.operation !== 'router') || (item.operation === 'laser-fiber' && item.material !== 'galvanized') || (item.operation === 'laser-co2' && !['mdf', 'acrylic'].includes(item.material))) { errors.push(`${item.id}: corte incompatível com material.`); continue; }
    const key = `${item.material}|${item.thickness}|${item.operation}`;
    let group = cutGroups.find(candidate => candidate.id === key);
    if (!group) { group = { id: key, material: item.material, thickness: item.thickness, operation: item.operation, machine: machineNames[item.operation] || item.operation, items: [] }; cutGroups.push(group); }
    group.items.push(item);
  }
  if (items.length > 3000) { errors.push('Limite de 3000 peças de fabricação excedido.'); return empty; }
  const allKnown = strips.every(strip => strip.grossLengthMm !== null && strip.widthMm !== null);
  const totals = { stripCount: strips.length, segmentCount: strips.reduce((sum, strip) => sum + strip.segments.length, 0), nominalLengthMm: strips.reduce((sum, strip) => sum + strip.nominalLengthMm, 0), developedLengthMm: allKnown ? strips.reduce((sum, strip) => sum + strip.grossLengthMm, 0) : null, developedAreaMm2: allKnown ? strips.reduce((sum, strip) => sum + strip.grossLengthMm * strip.widthMm, 0) : null };
  return { ...empty, config, strips, cutGroups, totals, errors: unique(errors), pending: unique(pending), steps: route(project, result, strips, cutGroups, pending) };
}

function assertExport(project, result) {
  const fabrication = calculateFabrication(project, result);
  if (fabrication.errors.length) throw Error(fabrication.errors.join(' '));
  if (!fabrication.steps.length) throw Error('Família sem componentes ou roteiro de fabricação.');
  return fabrication;
}
const pathRing = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ') + ' Z';
const contoursPath = contours => contours.map(contour => [contour.outer, ...contour.holes].map(pathRing).join(' ')).join(' ');
function drawingItems(result, fabrication, options) {
  const step = options.stepId ? fabrication.steps.find(item => item.id === options.stepId) : null;
  if (options.stepId && !step) throw Error('Etapa de fabricação inexistente.');
  const kind = options.kind || step?.drawing || 'cut';
  const assembly = { id: `${fabrication.projectId}-layout`, kind: 'assembly', label: 'Conjunto na posição de projeto / referências de emenda', material: 'arte', width: result.bounds.width, height: result.bounds.height, letters: result.letters };
  if (kind === 'strips') return [assembly, ...fabrication.cutGroups.flatMap(group => group.items).filter(item => item.kind === 'strip')];
  if (kind === 'artwork' || kind === 'assembly') return [assembly];
  return fabrication.cutGroups.flatMap(group => group.items).filter(item => !step || step.componentIds.includes(item.id));
}
export function fabricationSVG(project, result, options = {}) {
  const fabrication = assertExport(project, result), items = drawingItems(result, fabrication, options);
  const step = fabrication.steps.find(item => item.id === options.stepId);
  const rows = [], cuts = [], refs = [], routes = [], notes = [];
  const colors = ['#0369a1', '#a21caf', '#15803d', '#c2410c', '#4338ca', '#0f766e'];
  const margin = 24, fontSize = 10;
  let y = 56, width = 450;
  for (const item of items) {
    const w = item.kind === 'strip' ? item.grossLengthMm ?? item.nominalLengthMm : item.width;
    const h = item.kind === 'strip' ? item.widthMm ?? item.depthMm : item.height;
    width = Math.max(width, w + margin * 2);
    rows.push({ item, x: margin, y: y + 31, w, h });
    y += h + 94;
  }
  for (const { item, x, y: top, w, h } of rows) {
    notes.push(`<text x="${x}" y="${round(top - 20)}">${esc(item.id)}</text><text x="${x}" y="${round(top - 7)}">${esc(item.label)} · ${esc(materialNames[item.material] || item.material)}${item.thickness ? ` · ${fmt(item.thickness)} mm` : ''} · ${fmt(w)} × ${fmt(h)} mm${item.kind === 'strip' && (item.grossLengthMm === null || item.widthMm === null) ? ' · NOMINAL' : ''}</text>`);
    if (item.kind === 'strip') {
      cuts.push(`<path data-part-id="${esc(item.id)}" d="M${x} ${round(top)}h${round(w)}v${round(h)}h-${round(w)}Z"/>`);
      refs.push(`<path d="M${x} ${round(top - 2)}v${round(h + 4)}"/><circle cx="${x}" cy="${round(top + h / 2)}" r="2"/><text x="${x}" y="${round(top + h + 15)}">REF ${fmt(item.startMm)} → ${fmt(item.endMm)} mm do contorno · ${item.grossLengthMm === null ? 'compensações pendentes' : `nominal ${fmt(item.nominalLengthMm)} + comp. ${fmt(item.compensationMm)} + emenda ${fmt(item.overlapMm)} mm`}</text>`);
      if (item.overlapMm > 0 && item.grossLengthMm !== null) refs.push(`<path d="M${round(x + w - item.overlapMm)} ${round(top)}v${round(h)}"/>`);
      if (item.widthMm !== null && item.widthMm > item.depthMm) refs.push(`<path d="M${x} ${round(top + item.depthMm)}h${round(w)}"/>`);
      notes.push(`<text x="${x}" y="${round(top + h + 29)}">Borda ${fmt(item.depthMm)} mm · aba ${fmt(item.flangeMm)} mm · sobreposição no comprimento ${fmt(item.overlapMm)} mm</text>`);
      if (item.compensationMm !== 0) notes.push(`<text x="${x}" y="${round(top + h + 42)}">Marcas de cantos somente no percurso nominal; posição no desenvolvido depende do procedimento.</text>`);
      for (const mark of item.referenceMarks.filter(mark => mark.kind === 'direction-change' && mark.developedOffsetMm !== null)) refs.push(`<path d="M${round(x + mark.developedOffsetMm)} ${round(top)}v${round(Math.min(8, h))}"/><text x="${round(x + mark.developedOffsetMm + 2)}" y="${round(top + 13)}">${fmt(mark.offsetMm)}</text>`);
    } else {
      if (item.kind === 'assembly') notes.push(`<text x="${x}" y="${round(top + h + 15)}">Percursos coloridos = faixas · círculos = emendas · REF medido desde a origem escolhida de cada contorno</text>`);
      for (const part of item.kind === 'assembly' ? item.letters : [item]) {
        const px = x + (item.kind === 'assembly' ? part.x : 0), py = top + h - (item.kind === 'assembly' ? part.y : 0);
        cuts.push(`<path data-part-id="${esc(part.id)}" transform="translate(${round(px)} ${round(py)}) scale(1 -1)" d="${contoursPath(part.contours)}"/>`);
        // Assembly coordinates are the lateral source. A face may be inset and
        // have a different local origin; do not place lateral seams on that face.
        const source = item.kind === 'assembly' ? fabrication.strips.filter(strip => strip.letterId === part.id) : [];
        for (const strip of source) for (const segment of strip.segments) {
          const color = colors[(segment.index - 1) % colors.length];
          routes.push(`<path data-segment-id="${esc(segment.id)}" stroke="${color}" d="${segment.pathPoints.map((point, index) => `${index ? 'L' : 'M'}${round(px + point[0])} ${round(py - point[1])}`).join(' ')}"/>`);
          refs.push(`<circle cx="${round(px + segment.startPoint[0])}" cy="${round(py - segment.startPoint[1])}" r="2"/><text x="${round(px + segment.startPoint[0] + 3)}" y="${round(py - segment.startPoint[1] - 3)}">${strip.role === 'inner-side' ? 'INT' : 'EXT'} · F${segment.index} · REF ${fmt(segment.startMm)} · E${segment.index}${segment.index === 1 && strip.startOffsetMm ? ` · origem ${fmt(strip.startOffsetMm)} mm` : ''}</text>`);
        }
      }
    }
  }
  const height = Math.max(160, y + 32);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}mm" height="${round(height)}mm" viewBox="0 0 ${round(width)} ${round(height)}" role="img"><title>${esc(project.name)} · R${project.revision} · ${esc(step?.title || 'Prancha de fabricação')}</title><desc>Unidades mm. Peças separadas para conferência, sem nesting. Corte nominal sem kerf. Referências e anotações separadas do corte; não são comandos de máquina. Não liberado para fabricar.</desc><g id="CORTE_NOMINAL" fill="none" fill-rule="evenodd" stroke="#172b40" stroke-width="0.35">${cuts.join('')}</g><g id="PERCURSOS_NAO_CORTAR" fill="none" stroke-width="1.1">${routes.join('')}</g><g id="REFERENCIAS_NAO_CORTAR" stroke="#0369a1" stroke-width="0.3" stroke-dasharray="2 2" fill="none">${refs.join('')}</g><g id="ANOTACOES_NAO_CORTAR" fill="#172b40" font-family="Arial,sans-serif" font-size="${fontSize}"><text x="${margin}" y="18">${esc(project.name)} · R${project.revision} · mm · ${esc(step?.title || 'Prancha de fabricação')}</text><text x="${margin}" y="33">ESTUDO PARA CONFERÊNCIA · sem liberação · azul tracejado = referência, não cortar</text>${notes.join('')}<path fill="none" stroke="#172b40" stroke-width="0.4" d="M${margin} ${round(height - 27)}v8 M${margin} ${round(height - 23)}h100 M${margin + 100} ${round(height - 27)}v8"/><text x="${margin + 110}" y="${round(height - 19)}">Referência de 100 mm · conferir escala ao imprimir</text></g><style>#REFERENCIAS_NAO_CORTAR text{fill:#0369a1;stroke:none;stroke-dasharray:none;font:9px Arial,sans-serif}</style></svg>`;
}
const htmlTable = (headers, rows) => `<table><thead><tr>${headers.map(value => `<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function fabricationHTML(project, result, options = {}) {
  const f = assertExport(project, result), steps = options.stepId ? f.steps.filter(step => step.id === options.stepId) : f.steps;
  if (!steps.length) throw Error('Etapa de fabricação inexistente.');
  const list = (title, values) => values?.length ? `<h3>${esc(title)}</h3><ul>${values.map(value => `<li>${esc(value)}</li>`).join('')}</ul>` : '';
  const traceability = f.strips.length ? `<h2>Origens, emendas e reconciliação</h2><p>REF 0 é medido desde o primeiro ponto do vetor, no sentido do contorno. As demais emendas são distâncias a partir desse REF 0. EXT e INT possuem origens e perímetros próprios. X/Y abaixo são locais à letra, com Y para cima.</p>${htmlTable(['Contorno', 'Origem mm', 'Sentido frontal', 'Perímetro mm', 'Soma trechos mm', 'Percurso mm', 'Diferença mm'], f.strips.map(strip => [strip.id, fmt(strip.startOffsetMm), strip.winding === 'clockwise' ? 'horário' : 'anti-horário', fmt(strip.nominalLengthMm), fmt(strip.audit.sumNominalMm), fmt(strip.audit.pathLengthMm), fmt(strip.audit.nominalDifferenceMm)]))}${htmlTable(['Emenda', 'Posição desde REF 0 mm', 'Posição original mm', 'X / Y mm', 'Une os trechos'], f.strips.flatMap(strip => strip.seams.map(seam => [seam.id, fmt(seam.offsetMm), fmt(seam.contourOffsetMm), `${fmt(seam.point[0])} / ${fmt(seam.point[1])}`, seam.joins.join(' → ')])))}<p>As marcas de mudança de direção usam a polilinha calculada e um limiar geométrico de 20°. Pontos suaves podem ser amostras de curvas; nenhum deles certifica raio, vinco, ângulo de máquina ou posição de conformação após compensação.</p>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${esc(project.name)} · fabricação R${project.revision}</title><style>@page{size:A4;margin:12mm}body{font:13px Arial,sans-serif;color:#172b40;max-width:1000px;margin:24px auto;padding:16px}h1{font-size:25px}h2{font-size:19px}p,li{line-height:1.5}table{border-collapse:collapse;width:100%;font-size:11px;margin:12px 0}th,td{padding:7px;border:1px solid #bdcad5;text-align:left;overflow-wrap:anywhere}svg{width:100%;height:auto}.notice{padding:14px;background:#fff0c9;border:1px solid #d9ad48}.sheet{break-before:page}section{margin:24px 0}thead{display:table-header-group}tr{break-inside:avoid}@media print{body{margin:0;padding:0}}</style></head><body><h1>IMPRESILK · roteiro de fabricação</h1><p>${esc(project.name)} · projeto ${esc(project.id)} · revisão ${project.revision} · unidade mm</p><p class="notice">ESTUDO PARA CONFERÊNCIA. Etapas descrevem o planejamento; nenhuma operação é declarada executada. Sem liberação de fabricação. Pranchas ajustadas à página não são moldes 1:1.</p><p>Largura da borda / profundidade: ${fmt(project.construction.depthMm)} mm. Espessura da chapa, aba e profundidade são medidas distintas. ${f.strips.length ? `União: ${esc(FABRICATION_JOIN_METHODS.find(([key]) => key === f.config.joinMethod)?.[1])}. Procedimento: ${esc(f.config.reference || 'a definir')}. Compensação por contorno: ${fmt(f.config.compensationMm)} mm (${f.config.compensationConfirmed && f.config.reference.trim() ? 'conferida pelo usuário' : 'não validada'}).` : 'Camadas planas: sem faixas ou conformação metálica.'}</p>${htmlTable(['Ordem', 'Etapa / setor', 'Depende de', 'Estado do plano'], f.steps.map(step => [step.order, `${step.title} · ${step.sector}`, step.dependsOn.map(id => f.steps.find(candidate => candidate.id === id)?.title || id).join(' · ') || 'Início', step.status === 'ready-for-review' ? 'Pronto para conferência' : 'Planejado / pendências']))}<h2>Faixas e emendas</h2><p>Cada trecho recebe uma sobreposição de fechamento; a compensação de cada contorno é distribuída proporcionalmente entre os trechos. Corte mantém dimensão informada, sem compensação automática de kerf ou dobra. Marcas azuis não devem ir para a camada de corte.</p>${htmlTable(['ID', 'Borda mm', 'Aba mm', 'Largura corte mm', 'Contorno mm', 'Comp. mm', 'Emenda mm', 'Desenvolvido mm'], f.strips.flatMap(strip => strip.segments.map(segment => [segment.id, fmt(segment.depthMm), f.config.flangeMode === 'none' ? 'sem aba selecionada' : fmt(f.config.joinFlangeMm), fmt(segment.widthMm), fmt(segment.nominalLengthMm), fmt(segment.compensationMm), fmt(segment.overlapMm), fmt(segment.grossLengthMm)])))}${traceability}<h2>Pendências de desenvolvimento</h2><ul>${f.pending.map(item => `<li>${esc(item)}</li>`).join('')}</ul>${steps.map(step => `<section class="sheet"><h2>${step.order}. ${esc(step.title)}</h2><p>${esc(step.sector)} · ${step.status === 'ready-for-review' ? 'Pronto para conferência' : 'Planejado / pendências'}</p><ol>${step.operations.map(item => `<li>${esc(item)}</li>`).join('')}</ol>${list('Entradas', step.inputs)}${list('Saídas previstas', step.outputs)}${list('Conferências antes de avançar', step.checks)}${list('Cuidados do material', step.materialNotes)}${fabricationSVG(project, result, { stepId: step.id })}<ul>${step.pending.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>`).join('')}</body></html>`;
}
