import { createInstallation, validateInstallation, INSTALLATION_LIMITS, INSTALLATION_DECISIONS, validInstallationDate, isSafeInstallationPhoto } from '../../../supabase/functions/_shared/acm-installation.mjs';
export { createInstallation, validateInstallation, INSTALLATION_LIMITS, INSTALLATION_DECISIONS, isSafeInstallationPhoto };
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];
const number = value => typeof value === 'number' && Number.isFinite(value);
const known = value => number(value) ? value : null;
const positive = value => number(value) && value > 0 ? value : null;
const present = value => typeof value === 'string' && value.trim().length > 0;
const round = value => Math.round(value * 1e6) / 1e6;
const sum = (a, b) => a != null && b != null ? round(a + b) : null;
const subtract = (a, b) => a != null && b != null ? round(a - b) : null;
const half = value => value == null ? null : round(value / 2);
const names = { position: 'Posição', access: 'Acesso e execução', fixing: 'Fixação e materiais' };

/** Canonical input snapshots, not a security credential or engineering approval. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value ?? null;
}
function digest(value) {
  const text = JSON.stringify(canonical(value));
  let a = 2166136261, b = 3335557771;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return `install-v1:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function installationDecisionSignature(value, kind) {
  if (!INSTALLATION_DECISIONS.includes(kind)) throw new Error('Tipo de conferência de instalação inválido.');
  const v = record(value), s = record(v.space), p = record(v.plate), pos = record(v.position), env = record(v.environment), order = record(v.order);
  const context = { order: { source: order.source, id: order.id, company: order.company }, location: { label: s.label, address: s.address, reference: s.reference }, photos: list(v.photos).map(photo => ({ id: photo?.id, dataUrl: photo?.dataUrl, note: photo?.note })), notes: v.notes, environmentNotes: env.notes };
  const placement = { space: { width: s.width, height: s.height, baseGround: s.baseGround }, plate: { width: p.width, height: p.height }, position: { mode: pos.mode, ...(pos.mode === 'manual' ? { left: pos.left, bottomGround: pos.bottomGround } : {}) } };
  const inputs = { context, placement };
  if (kind === 'access') Object.assign(inputs, { plate: { thickness: p.thickness, weight: p.weight }, conditions: { terrain: env.terrain, access: env.access, exposure: env.exposure, duration: env.duration, twoHands: env.twoHands }, equipment: list(v.equipment) });
  if (kind === 'fixing') Object.assign(inputs, { plate: { thickness: p.thickness, weight: p.weight }, substrate: s.substrate, exposure: env.exposure, materials: list(v.materials), preparation: v.preparation });
  return digest(inputs);
}

/** Horizontal coordinates start at the space's left edge; vertical marks are heights above ground. */
export function calculateInstallation(value) {
  const v = record(value), errors = validateInstallation(value), s = record(v.space), p = record(v.plate), pos = record(v.position), env = record(v.environment);
  const pending = [], warnings = [], add = (code, message, scope = 'general') => pending.push({ code, message, scope });
  if (errors.length) return { valid: false, errors, pending, warnings, geometry: Object.fromEntries(['left', 'right', 'above', 'below', 'bottomGround', 'centerGround', 'topGround', 'width', 'height', 'spaceWidth', 'spaceHeight', 'baseGround', 'spaceTopGround', 'centerX'].map(key => [key, null])), points: [], decisions: Object.fromEntries(INSTALLATION_DECISIONS.map(kind => [kind, { confirmed: false, current: false, status: 'pending', reason: 'Corrija os dados inválidos antes de conferir.', responsible: '', date: '', signature: '', canConfirm: false }])), geometryComplete: false, planningComplete: false, ready: false, releaseGranted: false, status: 'Planejamento de instalação — dados inválidos' };

  const width = positive(p.width), height = positive(p.height), spaceWidth = positive(s.width), spaceHeight = positive(s.height), baseGround = s.baseGround == null ? null : known(s.baseGround);
  const left = pos.mode === 'centered' ? half(subtract(spaceWidth, width)) : pos.mode === 'manual' ? known(pos.left) : null;
  const right = subtract(subtract(spaceWidth, width), left);
  const below = pos.mode === 'centered' ? half(subtract(spaceHeight, height)) : pos.mode === 'manual' ? subtract(known(pos.bottomGround), baseGround) : null;
  const above = subtract(subtract(spaceHeight, height), below);
  const bottomGround = pos.mode === 'manual' ? known(pos.bottomGround) : pos.mode === 'centered' ? sum(baseGround, below) : null;
  const centerGround = sum(bottomGround, half(height)), topGround = sum(bottomGround, height);
  const geometry = { left, right, above, below, bottomGround, centerGround, topGround, width, height, spaceWidth, spaceHeight, baseGround, spaceTopGround: sum(baseGround, spaceHeight), centerX: sum(left, half(width)) };
  const points = [
    { id: 'bottom-left', label: 'Canto inferior esquerdo', x: left, yGround: bottomGround },
    { id: 'bottom-right', label: 'Canto inferior direito', x: sum(left, width), yGround: bottomGround },
    { id: 'top-left', label: 'Canto superior esquerdo', x: left, yGround: topGround },
    { id: 'top-right', label: 'Canto superior direito', x: sum(left, width), yGround: topGround },
    { id: 'center', label: 'Centro da placa', x: geometry.centerX, yGround: centerGround },
  ].filter(point => number(point.x) && number(point.yGround));
  for (const [key, label] of [['width', 'largura do espaço'], ['height', 'altura do espaço'], ['baseGround', 'altura da base do espaço em relação ao chão']]) if (s[key] == null) add(`SPACE_${key.toUpperCase()}`, `Informe a ${label}.`, 'position');
  for (const [key, label, scope] of [['width', 'largura da placa', 'position'], ['height', 'altura da placa', 'position'], ['thickness', 'espessura da placa', 'fixing'], ['weight', 'peso da placa', 'access']]) if (p[key] == null) add(`PLATE_${key.toUpperCase()}`, `Informe ${key === 'weight' ? 'o' : 'a'} ${label}.`, scope);
  if (!pos.mode) add('POSITION_MODE', 'Escolha posição centralizada ou manual.', 'position');
  if (pos.mode === 'manual') { if (pos.left == null) add('POSITION_LEFT', 'Informe a distância à esquerda da placa.', 'position'); if (pos.bottomGround == null) add('POSITION_BOTTOM', 'Informe a altura da base da placa ao chão.', 'position'); }
  for (const [key, label] of [['left', 'esquerda'], ['right', 'direita'], ['above', 'superior'], ['below', 'inferior']]) if (geometry[key] != null && geometry[key] < -1e-6) warnings.push({ code: 'OUTSIDE_SPACE', scope: 'position', field: key, message: `A placa ultrapassa a borda ${label} do espaço em ${displayMeasure(Math.abs(geometry[key]), v)}. A posição não foi corrigida automaticamente.` });
  if (bottomGround != null && bottomGround < 0) warnings.push({ code: 'BELOW_GROUND', scope: 'position', message: 'A base da placa está abaixo da referência do chão. Confira a medida; não foi aplicada correção automática.' });
  if (!present(v.responsible)) add('RESPONSIBLE', 'Informe o responsável pelo planejamento.');
  if (!present(s.label) && !present(s.address)) add('LOCATION', 'Identifique o local ou endereço da instalação.');
  if (!present(s.substrate)) add('SUBSTRATE', 'Registre o material e a condição do substrato.', 'fixing');
  for (const [key, label] of [['terrain', 'condição do terreno'], ['access', 'condição de acesso'], ['exposure', 'exposição do local'], ['duration', 'duração prevista']]) if (!present(env[key])) add(`ENV_${key.toUpperCase()}`, `Registre a ${label}.`, key === 'exposure' ? 'fixing' : 'access');
  if (env.twoHands == null) add('TWO_HANDS', 'Informe se a atividade exige as duas mãos.', 'access');
  const equipment = list(v.equipment), materials = list(v.materials);
  if (!equipment.length) add('EQUIPMENT', 'Registre os equipamentos/recursos de acesso e apoio ou a justificativa de dispensa nas características de um registro.', 'access');
  for (const [index, item] of equipment.entries()) {
    if (!present(item?.type)) add('EQUIPMENT_TYPE', `Equipamento ${index + 1}: informe o tipo.`, 'access');
    if (!present(item?.characteristics)) add('EQUIPMENT_CHARACTERISTICS', `Equipamento ${index + 1}: informe características e limites a conferir.`, 'access');
    if (!present(item?.availability) || ['pending', 'unknown'].includes(item.availability)) add('EQUIPMENT_AVAILABILITY', `Equipamento ${index + 1}: disponibilidade pendente.`, 'access');
  }
  if (!materials.length) add('MATERIALS', 'Registre materiais, suportes e fixadores previstos.', 'fixing');
  for (const [index, item] of materials.entries()) {
    for (const [key, label] of [['category', 'categoria'], ['product', 'produto ou especificação'], ['unit', 'unidade'], ['position', 'posição de uso'], ['purpose', 'finalidade']]) if (!present(item?.[key])) add(`MATERIAL_${key.toUpperCase()}`, `Material ${index + 1}: informe ${label}.`, 'fixing');
    if (item?.quantity == null) add('MATERIAL_QUANTITY', `Material ${index + 1}: informe a quantidade.`, 'fixing');
    if (item?.category === 'tape') for (const [key, label] of [['width', 'largura'], ['length', 'comprimento']]) if (item[key] == null) add(`TAPE_${key.toUpperCase()}`, `Fita ${index + 1}: informe ${label}.`, 'fixing');
    if (['tape', 'adhesive'].includes(item?.category)) { if (!present(item.preparation)) add('MATERIAL_PREPARATION', `Material ${index + 1}: registre a preparação indicada.`, 'fixing'); if (!present(item.cure)) add('MATERIAL_CURE', `Material ${index + 1}: registre cura/tempo de espera ou a indicação expressa de não aplicabilidade.`, 'fixing'); }
  }
  const prep = record(v.preparation);
  for (const [key, label] of [['surface', 'condição da superfície'], ['cleaning', 'limpeza/preparo']]) if (!present(prep[key])) add('PREPARATION', `Registre ${label} antes da fixação.`, 'fixing');
  const decisionInput = record(v.decisions), decisions = {};
  const geometryComplete = [left, right, above, below, bottomGround, centerGround, topGround].every(number);
  const positionReady = geometryComplete && !warnings.length && !errors.length;
  const accessReady = positionReady && positive(p.weight) != null && positive(p.thickness) != null && !pending.some(item => item.scope === 'access') && present(env.exposure);
  const fixingReady = positionReady && positive(p.weight) != null && !pending.some(item => item.scope === 'fixing');
  const prerequisites = { position: positionReady, access: accessReady, fixing: fixingReady };
  for (const kind of INSTALLATION_DECISIONS) {
    const d = record(decisionInput[kind]), signature = installationDecisionSignature(v, kind), nominal = d.confirmed === true && present(d.responsible) && validInstallationDate(d.date), matches = d.signature === signature;
    const current = nominal && matches && prerequisites[kind];
    const status = current ? 'confirmed' : d.confirmed === true ? 'stale' : 'pending';
    const reason = current ? 'Registro nominal compatível com as entradas atuais; não libera a execução.' : d.confirmed === true && !matches ? 'Entradas relevantes mudaram. Confira novamente e registre nova confirmação.' : !prerequisites[kind] ? 'Há medidas, recursos ou condições pendentes neste escopo.' : 'Aguardando responsável, data e confirmação nominal.';
    decisions[kind] = { confirmed: d.confirmed === true, current, status, reason, responsible: d.responsible || '', date: d.date || '', signature, canConfirm: prerequisites[kind] };
    if (!current) add(`DECISION_${kind.toUpperCase()}`, `${names[kind]}: ${reason}`, kind);
  }
  return { valid: errors.length === 0, errors, pending, warnings, geometry, points, decisions, geometryComplete, planningComplete: errors.length === 0 && pending.length === 0 && warnings.length === 0, ready: false, releaseGranted: false, status: 'Planejamento de instalação — não constitui liberação da obra' };
}

export function confirmInstallationDecision(value, kind, { responsible, date } = {}) {
  if (!INSTALLATION_DECISIONS.includes(kind)) throw new Error('Tipo de conferência inválido.');
  if (!present(responsible) || responsible.length > INSTALLATION_LIMITS.text || !validInstallationDate(date)) throw new Error('Informe responsável e data válida para registrar a conferência.');
  const result = calculateInstallation(value);
  if (!result.valid) throw new Error(result.errors[0].message);
  if (!result.decisions[kind].canConfirm) throw new Error(`Complete as pendências de ${names[kind].toLowerCase()} antes de confirmar.`);
  const copy = structuredClone(value);
  copy.decisions = { ...copy.decisions, [kind]: { confirmed: true, responsible: responsible.trim(), date, signature: installationDecisionSignature(value, kind) } };
  return copy;
}

const escape = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = (value, digits = 2) => number(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : 'Não informado';
const displayUnit = value => value?.displayUnit === 'cm' ? 'cm' : 'm';
const displayMeasure = (amount, value) => number(amount) ? `${format(amount / (displayUnit(value) === 'cm' ? 10 : 1000), 6)} ${displayUnit(value)}` : 'Não informado';
const cell = value => value == null || value === '' ? 'Não informado' : value;
const table = (head, rows) => `<table><thead><tr>${head.map(item => `<th>${escape(item)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(item => `<td>${escape(cell(item))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const coord = n => { if (!number(n)) throw new Error('Coordenada de instalação inválida.'); return Number(n.toFixed(6)); };

/** Diagram uses a uniform scale; out-of-space positions remain visible and dimensioned. */
export function installationSVG(value) {
  const r = calculateInstallation(value), g = r.geometry;
  if (!r.valid || !r.geometryComplete) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 150" role="img" aria-label="Medidas de instalação pendentes"><rect x="1" y="1" width="798" height="148" rx="8" fill="#f8fafc" stroke="#94a3b8"/><text x="30" y="55" font-family="sans-serif" font-size="22" fill="#334155">Desenho proporcional aguardando medidas.</text><text x="30" y="95" font-family="sans-serif" font-size="16" fill="#475569">Preencha espaço, placa e referências de posição; ausência não equivale a zero.</text></svg>`;
  const minX = Math.min(0, g.left), maxX = Math.max(g.spaceWidth, g.left + g.width), minY = Math.min(0, g.baseGround, g.bottomGround), maxY = Math.max(g.spaceTopGround, g.topGround);
  const span = Math.max(maxX - minX, maxY - minY, 1), font = span / 45, pad = font * 4, viewHeight = maxY - minY + 2 * pad, y = ground => maxY - ground + pad;
  const line = (x1, y1, x2, y2, color = '#64748b', dash = '') => `<line x1="${coord(x1)}" y1="${coord(y1)}" x2="${coord(x2)}" y2="${coord(y2)}" stroke="${color}" stroke-width="${coord(font / 18)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const label = (text, x, yy, anchor = 'middle', color = '#334155') => `<text x="${coord(x)}" y="${coord(yy)}" text-anchor="${anchor}" fill="${color}" font-family="sans-serif" font-size="${coord(font)}">${escape(text)}</text>`;
  const plateColor = r.warnings.length ? '#b91c1c' : '#2563eb';
  const markers = r.points.map(point => `<circle cx="${coord(point.x)}" cy="${coord(y(point.yGround))}" r="${coord(font / 5)}" fill="${plateColor}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${coord(minX - pad)} 0 ${coord(maxX - minX + 2 * pad)} ${coord(viewHeight)}" role="img" aria-label="${escape(`Planejamento proporcional da posição, cotas em ${displayUnit(value)}`)}" data-units="mm" data-label-units="${displayUnit(value)}" data-proportional="true"><rect x="${coord(minX - pad)}" width="${coord(maxX - minX + 2 * pad)}" height="${coord(viewHeight)}" fill="white"/><rect data-space="true" x="0" y="${coord(y(g.spaceTopGround))}" width="${coord(g.spaceWidth)}" height="${coord(g.spaceHeight)}" fill="#f1f5f9" stroke="#64748b" stroke-width="${coord(font / 12)}"/><rect data-plate="true" x="${coord(g.left)}" y="${coord(y(g.topGround))}" width="${coord(g.width)}" height="${coord(g.height)}" fill="#dbeafe" stroke="${plateColor}" stroke-width="${coord(font / 9)}"/>${line(minX - pad / 2, y(0), maxX + pad / 2, y(0), '#111827')}${label('CHÃO · cota 0', minX, y(0) + font * 1.6, 'start', '#111827')}${markers}${line(g.centerX, y(g.bottomGround), g.centerX, y(g.topGround), '#60a5fa', `${coord(font / 3)} ${coord(font / 4)}`)}${line(0, y(g.centerGround), g.left, y(g.centerGround))}${line(g.left + g.width, y(g.centerGround), g.spaceWidth, y(g.centerGround))}${label(`Esq. ${displayMeasure(g.left, value)}`, g.left / 2, y(g.centerGround) - font / 2)}${label(`Dir. ${displayMeasure(g.right, value)}`, g.left + g.width + g.right / 2, y(g.centerGround) - font / 2)}${label(`Acima ${displayMeasure(g.above, value)}`, g.centerX, y((g.spaceTopGround + g.topGround) / 2))}${label(`Abaixo ${displayMeasure(g.below, value)}`, g.centerX, y((g.baseGround + g.bottomGround) / 2))}${label(`${displayMeasure(g.width, value)} × ${displayMeasure(g.height, value)}`, g.centerX, y(g.centerGround) + font * .4)}${label(`Espaço ${displayMeasure(g.spaceWidth, value)} × ${displayMeasure(g.spaceHeight, value)}`, g.spaceWidth / 2, y(g.spaceTopGround) - font)}${label(`Topo ao chão ${displayMeasure(g.topGround, value)}`, maxX, y(g.topGround) - font * 1.5, 'end')}${label(`Base ao chão ${displayMeasure(g.bottomGround, value)}`, minX, y(g.bottomGround) + font * 1.6, 'start')}</svg>`;
}

const categoryLabels = { supports: 'Suportes', fasteners: 'Fixadores', tape: 'Fita', adhesive: 'Adesivos', tools: 'Ferramentas', other: 'Outros' };
const equipmentLabels = { ladder: 'Escada', scaffold: 'Andaime', platform: 'Plataforma', other: 'Outro' };
const availabilityLabels = { available: 'Disponível', rent: 'Locação prevista', pending: 'Pendente', unknown: 'Não conferida' };

/** Standalone print/PDF planning sheet. Missing facts remain explicit and confirmations never release work. */
export function installationReportHTML(project) {
  if (!project || typeof project !== 'object') throw new Error('Projeto inválido para a ficha de instalação.');
  if (!project.installation) throw new Error('Crie o planejamento de instalação antes de gerar a ficha.');
  const v = project.installation, r = calculateInstallation(v);
  if (!r.valid) throw new Error(r.errors.map(error => error.message).join(' '));
  if (!Number.isInteger(project.revision) || project.revision < 1) throw new Error('Informe uma revisão válida do projeto.');
  const s = record(v.space), p = record(v.plate), env = record(v.environment), prep = record(v.preparation), order = record(v.order), brief = record(v.briefReference), g = r.geometry, measured = amount => displayMeasure(amount, v);
  const title = `${project.name || 'Projeto'} · Planejamento da instalação · R${project.revision}`;
  const heading = subtitle => `<header><div><strong>IMPRESILK ACM STUDIO</strong><p>${escape(project.name || 'Projeto')} · ${escape(subtitle)}</p></div><div>R${project.revision}<small>PLANEJAMENTO — NÃO LIBERA EXECUÇÃO</small></div></header>`;
  const references = table(['O.S.', 'Cliente', 'Empresa', 'Vínculo'], [[order.number || order.id || 'Sem O.S. vinculada', order.client, order.company, order.linkedAt]]) + (v.briefReference ? `<p>Briefing: ${escape(brief.label || brief.id || 'Referência informada')} · origem ${escape(brief.source || 'não informada')}. Referência de consulta; integração automática com o briefing não confirmada por esta ficha.</p>` : '<p>Briefing: sem referência registrada.</p>');
  const measures = table(['Entrada', 'Medida'], [['Espaço · largura × altura', `${measured(s.width)} × ${measured(s.height)}`], ['Base do espaço ao chão', measured(s.baseGround)], ['Placa · largura × altura', `${measured(p.width)} × ${measured(p.height)}`], ['Espessura da placa', measured(p.thickness)], ['Peso da placa', p.weight == null ? 'Não informado' : `${format(p.weight)} kg`], ['Modo de posição', v.position?.mode === 'centered' ? 'Centralizada no espaço informado' : v.position?.mode === 'manual' ? 'Manual: esquerda e base ao chão' : 'Não informado']]);
  const margins = table(['Cota', 'Valor'], [['À esquerda', measured(g.left)], ['À direita', measured(g.right)], ['Acima da placa', measured(g.above)], ['Abaixo da placa até a base do espaço', measured(g.below)], ['Base da placa ao chão', measured(g.bottomGround)], ['Centro da placa ao chão', measured(g.centerGround)], ['Topo da placa ao chão', measured(g.topGround)]]);
  const pending = [...r.warnings, ...r.pending];
  const decisions = table(['Decisão', 'Registro', 'Responsável / data', 'Situação atual'], INSTALLATION_DECISIONS.map(kind => { const d = r.decisions[kind]; return [names[kind], d.current ? 'Confirmação nominal atual' : d.confirmed ? 'Registro desatualizado/incompleto' : 'Pendente', `${d.responsible || 'Não informado'} / ${d.date || 'Não informada'}`, d.reason]; }));
  const photos = list(v.photos).map(photo => `<figure>${isSafeInstallationPhoto(photo.dataUrl) ? `<img src="${escape(photo.dataUrl)}" alt="${escape(photo.name || 'Foto local cadastrada')}">` : '<p>Foto pendente.</p>'}<figcaption>${escape(photo.name || 'Foto sem nome')} · ${escape(photo.note || 'Sem observação')}</figcaption></figure>`).join('');
  const sections = [
    `<section>${heading('Local e posição')}<h1>Planejamento da instalação</h1>${references}${table(['Local', 'Endereço', 'Referência', 'Substrato'], [[s.label, s.address, s.reference, s.substrate]])}<p>Responsável pelo planejamento: ${escape(v.responsible || 'Não informado')}. Última alteração registrada: ${escape(v.updatedAt || 'Não informada')}.</p><div class="diagram">${installationSVG(v)}</div><p class="caption">Desenho proporcional, cotas em ${displayUnit(v)}, sem escala de impressão garantida. X parte da esquerda do espaço; alturas partem da referência do chão. Valores negativos indicam extrapolação, sem ajuste automático.</p><div class="columns">${measures}${margins}</div><h2>Marcos de conferência</h2>${r.points.length ? table(['Marco', 'X desde a esquerda do espaço', 'Altura ao chão'], r.points.map(point => [point.label, measured(point.x), measured(point.yGround)])) : '<p>Marcos pendentes até preencher as medidas necessárias.</p>'}</section>`,
    `<section>${heading('Condições, acesso e recursos')}<h1>Condições da instalação</h1>${table(['Condição', 'Registro'], [['Terreno', env.terrain], ['Acesso', env.access], ['Exposição', env.exposure], ['Duração prevista', env.duration], ['Uso das duas mãos', env.twoHands == null ? 'Não informado' : env.twoHands ? 'Sim' : 'Não'], ['Observações', env.notes]])}<h2>Equipamentos e recursos planejados</h2>${list(v.equipment).length ? table(['Tipo', 'Características / limites a conferir', 'Disponibilidade', 'Quantidade / unidade', 'Finalidade / observações'], list(v.equipment).map(item => [equipmentLabels[item.type] || item.type, item.characteristics, availabilityLabels[item.availability] || item.availability, `${item.quantity == null ? 'Não informada' : format(item.quantity)} ${item.unit || ''}`, `${item.purpose || 'Não informada'} / ${item.notes || 'Sem observação'}`])) : '<p>Equipamentos não registrados.</p>'}<p class="notice">A lista registra os recursos previstos. Não determina capacidade, altura segura, necessidade legal ou adequação técnica do equipamento. Conferir condições reais, instruções do fabricante, procedimento e responsáveis antes da execução.</p><h2>Fotos do local</h2>${photos ? `<div class="photos">${photos}</div>` : '<p>Fotos do local não cadastradas.</p>'}</section>`,
    `<section>${heading('Fixação, materiais e preparação')}<h1>Materiais e método previstos</h1>${list(v.materials).length ? table(['Categoria / produto', 'Quantidade / unidade', 'Largura / comprimento', 'Posição / finalidade', 'Preparação / cura', 'Observações'], list(v.materials).map(item => [`${categoryLabels[item.category] || item.category || 'Não informada'} / ${item.product || 'Não informado'}`, `${item.quantity == null ? 'Não informada' : format(item.quantity)} ${item.unit || ''}`, `${measured(item.width)} / ${measured(item.length)}`, `${item.position || 'Não informada'} / ${item.purpose || 'Não informada'}`, `${item.preparation || 'Não informada'} / ${item.cure || 'Não informada'}`, item.notes])) : '<p>Materiais não registrados.</p>'}${table(['Preparação geral', 'Registro'], [['Superfície', prep.surface], ['Limpeza / preparo', prep.cleaning], ['Primer', prep.primer], ['Cura / espera', prep.curing], ['Observações', prep.notes]])}<p>Quantidades e produtos foram informados no planejamento. A ficha não calcula capacidade de suportes, fixadores, adesivos ou fitas; não deduz cura nem distância segura de uma fotografia.</p></section>`,
    `<section>${heading('Conferências e pendências')}<h1>Decisões registradas separadamente</h1>${decisions}<p>As confirmações se vinculam às entradas relevantes de cada escopo, à O.S./local e às fotos/observações. Mudanças nesse contexto exigem nova conferência. Unidade de exibição e data da última edição não alteram as medidas nem validam decisões.</p><h2>Pendências atuais</h2>${pending.length ? `<ul>${pending.map(item => `<li>${escape(item.message)}</li>`).join('')}</ul>` : '<p>As informações previstas foram preenchidas e as três conferências nominais estão atuais.</p>'}${v.notes ? `<h2>Observações gerais</h2><p>${escape(v.notes)}</p>` : ''}<p class="notice">Esta ficha é um planejamento local vinculado à revisão. Mesmo com todos os campos e confirmações, não concede liberação automática de execução, certificação, autorização de trabalho ou aprovação estrutural.</p></section>`,
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'"><title>${escape(title)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172033;background:#e8edf3;margin:0}section{background:white;max-width:210mm;margin:12px auto;padding:13mm;break-after:page}header{display:flex;justify-content:space-between;gap:18px;border-bottom:2px solid #334155;padding-bottom:10px}header p{margin:5px 0}header small{display:block;font-size:9px;max-width:160px}h1{font-size:23px;margin:20px 0 12px}h2{font-size:16px;margin:18px 0 8px}p,li{line-height:1.5;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:10px;margin:12px 0}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#f1f5f9}tr,figure{break-inside:avoid}.diagram svg{width:100%;max-height:95mm}.caption{font-size:10px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.notice{background:#fff4da;border-left:3px solid #b97714;padding:10px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos figure{margin:0}.photos img{display:block;width:100%;height:60mm;object-fit:contain}.photos figcaption{font-size:10px;overflow-wrap:anywhere}@media print{body{background:white}section{margin:0;padding:0;max-width:none}section:last-child{break-after:auto}thead{display:table-header-group}}@media(max-width:600px){section{padding:18px}.columns,.photos{grid-template-columns:1fr}}</style></head><body>${sections.join('')}</body></html>`;
}
