/** Shared, bounded validation for the optional independent frame. No engineering defaults. */
export const FRAME_GROUPS = ['externalHorizontal', 'externalVertical', 'internalHorizontal', 'internalVertical', 'reinforcement'];
export const FRAME_FACES = ['front', 'left', 'right', 'soffit'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateStructureFrame(structure) {
  const errors = [], add = (code, message) => errors.push({ code, message });
  const f = structure?.frame;
  if (f === undefined) return errors;
  if (!plain(f)) return [{ code: 'FRAME', message: 'Quadro independente inválido.' }];
  if (typeof f.enabled !== 'boolean') add('FRAME', 'Ativação do quadro deve ser booleana.');
  if (!['butt', 'miter45'].includes(f.joint)) add('FRAME_JOINT', 'Selecione encontro reto ou 45°.');
  if (!['horizontal', 'vertical'].includes(f.continuous)) add('FRAME_JOINT', 'Defina a direção contínua dos encontros retos.');
  for (const [key, min, max] of [['gap', 0, 50], ['spacingX', 50, 100000], ['spacingY', 50, 100000], ['kerf', 0, 30], ['trimStart', 0, 1000], ['trimEnd', 0, 1000], ['inset', 0, 1000]]) if (!number(f[key], min, max)) add('FRAME_DIMENSION', `${key}: medida do quadro inválida.`);
  const profile = (p, where, partial = false) => {
    if (!plain(p)) { add('FRAME_PROFILE', `${where}: perfil inválido.`); return; }
    for (const key of ['width', 'depth']) if ((!partial || p[key] !== undefined) && !number(p[key], 1, 500)) add('FRAME_PROFILE', `${where}: seção ${key} inválida.`);
    if ((!partial || p.orientation !== undefined) && !['width', 'depth'].includes(p.orientation)) add('FRAME_PROFILE', `${where}: orientação de apoio inválida.`);
    if (p.wall != null && !number(p.wall, 0.1, 100)) add('FRAME_WALL', `${where}: parede deve ser espessura em mm.`);
    if (number(p.wall, 0.1, 100) && number(p.width, 1, 500) && number(p.depth, 1, 500) && p.wall * 2 >= Math.min(p.width, p.depth)) add('FRAME_WALL', `${where}: parede elimina o vão interno do tubo.`);
    for (const key of ['id', 'gauge', 'material', 'sku', 'finish']) if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key].length > 160)) add('FRAME_PROFILE', `${where}: ${key} deve ter até 160 caracteres.`);
  };
  const group = (g, where, partial = false) => {
    if (!plain(g)) { add('FRAME_GROUP', `${where}: grupo inválido.`); return; }
    if (!partial || g.profile !== undefined) profile(g.profile, where, partial);
    if ((!partial || g.barLength !== undefined) && !number(g.barLength, 100, 30000)) add('FRAME_STOCK', `${where}: barra comercial entre 100 e 30.000 mm.`);
    if (g.pricePerM != null && !number(g.pricePerM, 0, 1e8)) add('FRAME_PRICE', `${where}: preço por metro inválido.`);
  };
  if (!plain(f.groups)) add('FRAME_GROUP', 'Informe os cinco grupos de perfis.');
  else for (const key of FRAME_GROUPS) group(f.groups[key], key);
  if (!plain(f.faces) || Object.keys(f.faces).some(key => !FRAME_FACES.includes(key))) add('FRAME_FACE', 'Configuração de faces inválida.');
  else for (const [face, cfg] of Object.entries(f.faces)) {
    if (!plain(cfg)) { add('FRAME_FACE', `${face}: configuração inválida.`); continue; }
    for (const key of ['spacingX', 'spacingY', 'inset']) if (cfg[key] !== undefined && !number(cfg[key], key === 'inset' ? 0 : 50, key === 'inset' ? 1000 : 100000)) add('FRAME_FACE', `${face}: ${key} inválido.`);
    if (cfg.groups !== undefined) { if (!plain(cfg.groups)) add('FRAME_GROUP', `${face}: grupos inválidos.`); else for (const [key, g] of Object.entries(cfg.groups)) { if (!FRAME_GROUPS.includes(key)) add('FRAME_GROUP', `${face}: grupo desconhecido.`); else group(g, `${face}.${key}`, true); } }
  }
  if (!plain(f.overrides) || Object.keys(f.overrides).length > 5000) add('FRAME_OVERRIDE', 'Personalizações de elementos inválidas ou acima do limite.');
  else for (const [id, value] of Object.entries(f.overrides)) { if (id.length > 180 || !plain(value)) { add('FRAME_OVERRIDE', 'Personalização de elemento inválida.'); continue; } group(value, id, true); if(value.geometrySignature!==undefined&&(typeof value.geometrySignature!=='string'||value.geometrySignature.length>1000)) add('FRAME_OVERRIDE', `${id}: referência geométrica inválida.`); if (value.removed !== undefined && typeof value.removed !== 'boolean') add('FRAME_OVERRIDE', `${id}: exclusão deve ser booleana.`); if (value.position !== undefined && !number(value.position, 0, 100000)) add('FRAME_OVERRIDE', `${id}: posição inválida.`); if (value.position !== undefined && id.includes('-EXT-')) add('FRAME_OVERRIDE', `${id}: mova o quadro externo pelo recuo da face.`); }
  if (!Array.isArray(f.reinforcements) || f.reinforcements.length > 100) add('FRAME_REINFORCEMENT', 'Limite de 100 reforços explícitos.');
  else {
    const ids = new Set();
    for (const r of f.reinforcements) {
      if (!plain(r) || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.id) || ids.has(r.id)) { add('FRAME_REINFORCEMENT', 'ID de reforço ausente ou repetido.'); continue; }
      ids.add(r.id);
      if (!FRAME_FACES.includes(r.surface) || !['horizontal', 'vertical'].includes(r.axis) || !number(r.position, 0, 100000) || !number(r.start, 0, 100000) || !number(r.end, 0.1, 100000) || r.end <= r.start) add('FRAME_REINFORCEMENT', `${r.id}: posição ou comprimento inválido.`);
      if (r.profile !== undefined) profile(r.profile, r.id, true);
    }
  }
  if (!Array.isArray(f.remnants) || f.remnants.length > 200) add('FRAME_REMNANT', 'Limite de 200 retalhos de metalon.');
  else {
    const ids = new Set();
    for (const r of f.remnants) {
      if (!plain(r) || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.id) || ids.has(r.id)) { add('FRAME_REMNANT', 'ID de retalho ausente ou repetido.'); continue; }
      ids.add(r.id); profile(r.profile, r.id);
      if (!number(r.length, 1, 30000)) add('FRAME_REMNANT', `${r.id}: comprimento inválido.`);
      if (r.pricePerM != null && !number(r.pricePerM, 0, 1e8)) add('FRAME_PRICE', `${r.id}: custo atribuído inválido.`);
    }
  }
  return errors;
}
