import { isSafeRasterDataURL } from './acm-visual.mjs';

export const INSTALLATION_LIMITS = Object.freeze({ dimension: 1000000, weight: 1000000, items: 80, photos: 3, photoChars: 500000, totalPhotoChars: 1500000, text: 1000, notes: 4000 });
export const INSTALLATION_DECISIONS = Object.freeze(['position', 'access', 'fixing']);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export const validInstallationDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const validInstallationTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
export const isSafeInstallationPhoto = value => typeof value === 'string' && value.length <= INSTALLATION_LIMITS.photoChars && isSafeRasterDataURL(value);

/** Empty means unknown. Construction facts are never copied or assumed by this factory. */
export function createInstallation() {
  return {
    version: 1, displayUnit: 'm', responsible: '', updatedAt: new Date().toISOString(),
    space: { label: '', address: '', reference: '', substrate: '', width: null, height: null, baseGround: null },
    plate: { width: null, height: null, thickness: null, weight: null },
    position: { mode: 'centered', left: null, bottomGround: null },
    environment: { terrain: '', access: '', exposure: '', duration: '', twoHands: null, notes: '' },
    equipment: [], materials: [], preparation: { surface: '', cleaning: '', primer: '', curing: '', notes: '' }, photos: [],
    decisions: Object.fromEntries(INSTALLATION_DECISIONS.map(key => [key, { confirmed: false, responsible: '', date: '', signature: '' }])),
  };
}

/** Absent and incomplete fields are allowed. Malformed values are rejected, never coerced. */
export function validateInstallation(value) {
  if (value == null) return [];
  const errors = [], add = (code, message) => errors.push({ code: `INSTALLATION_${code}`, message });
  if (!plain(value) || value.version !== 1) return [{ code: 'INSTALLATION_SCHEMA', message: 'Versão do planejamento de instalação inválida.' }];
  let nodes = 0;
  const active = new Set();
  const scan = (entry, path = 'installation', depth = 0) => {
    if (++nodes > 6000 || depth > 12) { add('LIMIT', 'Planejamento de instalação excede os limites de tamanho ou profundidade.'); return; }
    if (entry == null || typeof entry === 'boolean') return;
    if (typeof entry === 'number') { if (!Number.isFinite(entry)) add('NUMBER', `${path}: número não finito.`); return; }
    if (typeof entry === 'string') {
      const photo = /^installation\.photos\.\d+\.dataUrl$/.test(path), signature = /^installation\.decisions\.(position|access|fixing)\.signature$/.test(path);
      if (!photo && !signature && entry.length > (path.endsWith('.notes') ? INSTALLATION_LIMITS.notes : INSTALLATION_LIMITS.text)) add('TEXT', `${path}: texto acima do limite.`);
      if (signature && entry.length > 160) add('SIGNATURE', 'Assinatura de conferência inválida.');
      return;
    }
    if ((!Array.isArray(entry) && !plain(entry)) || active.has(entry)) { add('JSON', `${path}: valor não serializável.`); return; }
    if (Array.isArray(entry) && entry.length > INSTALLATION_LIMITS.items) { add('LIMIT', `${path}: lista acima do limite.`); return; }
    active.add(entry);
    for (const key of Object.keys(entry)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) add('KEY', `${path}: chave proibida.`); else scan(entry[key], `${path}.${key}`, depth + 1); if (errors.length > 30) break; }
    active.delete(entry);
  };
  scan(value);
  if (errors.length) return errors;
  const text = (item, keys, label) => { for (const key of keys) if (item[key] != null && typeof item[key] !== 'string') add('TEXT', `${label}.${key}: informe texto.`); };
  const number = (item, keys, min, max, label) => { for (const key of keys) if (item[key] != null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < min || item[key] > max)) add('NUMBER', `${label}.${key}: informe número entre ${min} e ${max}.`); };
  for (const section of ['space', 'plate', 'position', 'environment', 'preparation', 'decisions']) if (value[section] != null && !plain(value[section])) add('SECTION', `${section}: seção inválida.`);
  if (errors.length) return errors;
  if (value.displayUnit != null && !['m', 'cm'].includes(value.displayUnit)) add('UNIT', 'Unidade de exibição deve ser m ou cm.');
  text(value, ['responsible', 'updatedAt', 'notes'], 'installation');
  if (value.updatedAt && !validInstallationTimestamp(value.updatedAt)) add('DATE', 'Data da última alteração deve ser ISO UTC válida.');
  const space = value.space ?? {}, plate = value.plate ?? {}, pos = value.position ?? {}, env = value.environment ?? {};
  number(space, ['width', 'height'], .01, INSTALLATION_LIMITS.dimension, 'Espaço'); number(space, ['baseGround'], 0, INSTALLATION_LIMITS.dimension, 'Espaço');
  text(space, ['label', 'address', 'reference', 'substrate'], 'Espaço');
  number(plate, ['width', 'height', 'thickness'], .01, INSTALLATION_LIMITS.dimension, 'Placa'); number(plate, ['weight'], .000001, INSTALLATION_LIMITS.weight, 'Placa');
  if (pos.mode != null && !['centered', 'manual'].includes(pos.mode)) add('POSITION', 'Modo de posição inválido.');
  number(pos, ['left', 'bottomGround'], -INSTALLATION_LIMITS.dimension, INSTALLATION_LIMITS.dimension * 2, 'Posição');
  text(env, ['terrain', 'access', 'exposure', 'duration', 'notes'], 'Condições');
  if (env.twoHands != null && typeof env.twoHands !== 'boolean') add('BOOLEAN', 'Uso de duas mãos deve ser informado como sim ou não.');
  text(value.preparation ?? {}, ['surface', 'cleaning', 'primer', 'curing', 'notes'], 'Preparação');
  for (const listName of ['equipment', 'materials']) {
    if (value[listName] == null) continue;
    if (!Array.isArray(value[listName]) || value[listName].length > INSTALLATION_LIMITS.items) { add('ITEMS', `Limite de ${INSTALLATION_LIMITS.items} registros em ${listName}.`); continue; }
    const ids = new Set();
    for (const item of value[listName]) {
      if (!plain(item)) { add('ITEM', `Registro inválido em ${listName}.`); continue; }
      text(item, ['id', 'type', 'characteristics', 'availability', 'unit', 'purpose', 'notes', 'category', 'position', 'product', 'preparation', 'cure'], listName);
      number(item, ['quantity'], 0, 1000000000, listName);
      if (listName === 'materials') number(item, ['width', 'length'], .01, INSTALLATION_LIMITS.dimension, 'Material');
      if (typeof item.id !== 'string' || !item.id.trim()) add('ITEM_ID', `Identificação obrigatória em ${listName}.`);
      else { if (ids.has(item.id)) add('ITEM_ID', `Identificação repetida em ${listName}.`); ids.add(item.id); }
      if (listName === 'materials' && item.category && !['supports', 'fasteners', 'tape', 'adhesive', 'tools', 'other'].includes(item.category)) add('CATEGORY', 'Categoria de material inválida.');
    }
  }
  if (value.photos != null) {
    if (!Array.isArray(value.photos) || value.photos.length > INSTALLATION_LIMITS.photos) add('PHOTOS', 'Cadastre no máximo três fotos de instalação.');
    else {
      const ids = new Set(); let total = 0;
      for (const photo of value.photos) {
        if (!plain(photo)) { add('PHOTO', 'Foto de instalação inválida.'); continue; }
        text(photo, ['id', 'name', 'note'], 'Foto');
        if (typeof photo.id !== 'string' || !photo.id.trim()) add('PHOTO_ID', 'Identificação obrigatória em cada foto.');
        else { if (ids.has(photo.id)) add('PHOTO_ID', 'Identificação de foto repetida.'); ids.add(photo.id); }
        if (photo.dataUrl != null && photo.dataUrl !== '' && !isSafeInstallationPhoto(photo.dataUrl)) add('PHOTO', 'Use foto PNG/JPEG incorporada de até 500 kB de texto e 4096 px por lado.');
        total += typeof photo.dataUrl === 'string' ? photo.dataUrl.length : 0;
      }
      if (total > INSTALLATION_LIMITS.totalPhotoChars) add('PHOTOS', 'As fotos de instalação excedem 1,5 MB de texto incorporado.');
    }
  }
  const decisions = value.decisions ?? {};
  for (const key of INSTALLATION_DECISIONS) {
    const decision = decisions[key]; if (decision == null) continue;
    if (!plain(decision)) { add('DECISION', `Conferência ${key} inválida.`); continue; }
    text(decision, ['responsible', 'date', 'signature'], 'Conferência');
    if (decision.confirmed != null && typeof decision.confirmed !== 'boolean') add('DECISION', 'Confirmação deve ser booleana.');
    if (decision.date && !validInstallationDate(decision.date)) add('DATE', 'Data da conferência deve ser uma data ISO válida.');
    if (decision.signature && !/^install-v1:[0-9a-f]{16}$/.test(decision.signature)) add('SIGNATURE', 'Assinatura de conferência inválida.');
  }
  for (const key of ['order', 'briefReference']) {
    const ref = value[key]; if (ref == null) continue;
    if (!plain(ref)) { add('REFERENCE', `Referência ${key} inválida.`); continue; }
    text(ref, ['source', 'number', 'client', 'company', 'label', 'linkedAt'], key);
    if (ref.id != null && (typeof ref.id !== 'string' && !(Number.isInteger(ref.id) && ref.id > 0))) add('REFERENCE', 'Identificação da referência deve ser texto ou inteiro positivo.');
    if (key === 'order' && ref.source != null && ref.source !== 'painel-os') add('REFERENCE', 'Origem da O.S. deve ser painel-os.');
    if (ref.linkedAt && !validInstallationTimestamp(ref.linkedAt)) add('DATE', 'Data do vínculo deve ser ISO UTC válida.');
  }
  return errors;
}
