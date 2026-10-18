/** Portable presentation data. No fabrication geometry or remote resource URLs. */
export const VISUAL_LIMITS = Object.freeze({ assetBytes: 512 * 1024, totalAssetBytes: 2 * 1024 * 1024, assets: 12, layers: 80, views: 12, pixels: 4096 * 4096 });
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const color = v => /^#[0-9a-f]{6}$/i.test(v);
export function rasterInfo(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > VISUAL_LIMITS.assetBytes || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) return null;
  try {
    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (payload.length % 4 !== 0) return null;
    const bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    if (dataUrl.startsWith('data:image/png;')) {
      if (bytes.length < 45 || bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10' || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
      let offset = 8, hasImage = false, ended = false;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset), type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
        if (length > bytes.length - offset - 12) return null;
        if (type === 'IDAT') hasImage = true;
        if (type === 'IEND') { ended = length === 0 && offset + 12 === bytes.length; break; }
        offset += length + 12;
      }
      if (!hasImage || !ended) return null;
      return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) return null;
      const marker = bytes[offset + 1];
      if (marker === 255) { offset += 1; continue; }
      if (marker === 218 || marker === 217) break;
      const size = view.getUint16(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) return null;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return { mime: 'image/jpeg', width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      offset += 2 + size;
    }
  } catch { return null; }
  return null;
}
export function isSafeRasterDataURL(value) {
  const info = rasterInfo(value);
  return Boolean(info && info.width >= 1 && info.height >= 1 && info.width <= 4096 && info.height <= 4096 && info.width * info.height <= VISUAL_LIMITS.pixels);
}
export function createVisual() {
  return { version: 1, assets: [], layers: [], background: { mode: 'neutral', color: '#eff3f7', assetId: '', x: 0, y: 0, scale: 1, rotation: 0, skewX: 0, skewY: 0, opacity: 1 }, scene: { ambient: 2.1, sun: 3.8, exposure: 1.2, azimuth: 15, elevation: 55, fov: 35 }, savedViews: [], guides: false };
}
export function validateVisual(visual) {
  if (visual == null) return [];
  const errors = [], add = (code, message) => errors.push({ code: `VISUAL_${code}`, message });
  if (!plain(visual) || visual.version !== 1) return [{ code: 'VISUAL_SCHEMA', message: 'Versão do Layout 3D inválida.' }];
  if (!Array.isArray(visual.assets) || visual.assets.length > VISUAL_LIMITS.assets || !Array.isArray(visual.layers) || visual.layers.length > VISUAL_LIMITS.layers || !Array.isArray(visual.savedViews) || visual.savedViews.length > VISUAL_LIMITS.views) return [{ code: 'VISUAL_LIMIT', message: 'Limite do layout: 12 imagens, 80 camadas e 12 vistas.' }];
  const ids = new Set(); let total = 0;
  for (const asset of visual.assets) {
    if (!plain(asset)) { add('ASSET', 'Imagem inválida.'); continue; }
    if (!str(asset.id) || ids.has(asset.id) || !str(asset.name)) add('ASSET_ID', 'Identificação de imagem inválida ou duplicada.');
    ids.add(asset.id);
    const info = rasterInfo(asset.dataUrl);
    if (!isSafeRasterDataURL(asset.dataUrl) || asset.mime !== info?.mime || asset.width !== info?.width || asset.height !== info?.height) add('ASSET', 'Use somente PNG/JPG incorporado e conferido, até 512 KiB e 4096 px por lado.');
    total += typeof asset.dataUrl === 'string' ? asset.dataUrl.length : VISUAL_LIMITS.totalAssetBytes;
  }
  if (total > VISUAL_LIMITS.totalAssetBytes) add('ASSET_TOTAL', 'As imagens incorporadas excedem 2 MiB.');
  const layerIds = new Set();
  for (const layer of visual.layers) {
    if (!plain(layer)) { add('LAYER', 'Camada inválida.'); continue; }
    if (!str(layer.id) || layerIds.has(layer.id) || !str(layer.name)) add('LAYER_ID', 'Identificação de camada inválida ou duplicada.');
    layerIds.add(layer.id);
    if (!['image', 'text'].includes(layer.type)) add('LAYER_TYPE', 'Tipo de camada inválido.');
    if (!plain(layer.target) || !['surface', 'piece'].includes(layer.target.type) || !str(layer.target.id)) add('TARGET', 'Destino da arte inválido.');
    if (layer.target?.type === 'surface' && !['front', 'left', 'right', 'soffit'].includes(layer.target.id)) add('TARGET', 'Face da arte inválida.');
    for (const key of ['x', 'y']) if (!num(layer[key], -100000, 100000)) add('POSITION', 'Posição da arte fora dos limites.');
    for (const key of ['width', 'height']) if (!num(layer[key], 0.01, 200000)) add('SIZE', 'Dimensão da arte inválida.');
    if (!num(layer.rotation, -360, 360) || !num(layer.opacity, 0, 1)) add('TRANSFORM', 'Rotação ou opacidade inválida.');
    for (const key of ['hidden', 'locked', 'keepAspect']) if (typeof layer[key] !== 'boolean') add('BOOLEAN', 'Estado da camada inválido.');
    if (layer.type === 'image') {
      if (!ids.has(layer.assetId)) add('ASSET_REF', 'A imagem da camada está ausente.');
      const crop = layer.crop;
      if (!plain(crop) || !num(crop.x, 0, 1) || !num(crop.y, 0, 1) || !num(crop.width, 0.001, 1) || !num(crop.height, 0.001, 1) || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) add('CROP', 'Recorte da imagem inválido.');
    } else if (layer.type === 'text') {
      if (!str(layer.text, 1000) || !['sans-serif', 'serif', 'monospace'].includes(layer.fontFamily) || ![400, 700].includes(layer.fontWeight) || !color(layer.color) || !['left', 'center', 'right'].includes(layer.align)) add('TEXT', 'Texto, fonte, alinhamento ou cor inválidos.');
    }
  }
  const bg = visual.background;
  if (!plain(bg) || !['neutral', 'color', 'transparent', 'photo'].includes(bg.mode) || !color(bg.color)) add('BACKGROUND', 'Fundo inválido.');
  else {
    if (bg.mode === 'photo' && !ids.has(bg.assetId)) add('BACKGROUND_IMAGE', 'A foto do ambiente está ausente.');
    if (!num(bg.x, -200, 200) || !num(bg.y, -200, 200) || !num(bg.scale, 0.1, 5) || !num(bg.rotation, -180, 180) || !num(bg.skewX, -60, 60) || !num(bg.skewY, -60, 60) || !num(bg.opacity, 0, 1)) add('BACKGROUND_TRANSFORM', 'Ajuste do fundo inválido.');
  }
  const camera = value => plain(value) && ['position', 'target'].every(key => Array.isArray(value[key]) && value[key].length === 3 && value[key].every(v => num(v, -500, 500))) && num(value.fov, 10, 100) && Math.hypot(...value.position.map((v, i) => v - value.target[i])) > 0.001;
  const validLighting = scene => plain(scene) && num(scene.ambient, 0, 8) && num(scene.sun, 0, 12) && num(scene.exposure, 0.2, 3) && num(scene.azimuth, -180, 180) && num(scene.elevation, 5, 85) && num(scene.fov, 10, 100);
  const scene = visual.scene;
  if (!validLighting(scene) || (scene.camera != null && !camera(scene.camera))) add('SCENE', 'Câmera ou iluminação inválidas.');
  const viewIds = new Set();
  for (const saved of visual.savedViews) {
    if (!plain(saved) || !str(saved.id) || viewIds.has(saved.id) || !str(saved.name) || !camera(saved.camera)) add('VIEW', 'Vista salva inválida.');
    viewIds.add(saved?.id);
    if (!validLighting(saved?.lighting)) add('VIEW_LIGHT', 'Iluminação salva inválida.');
  }
  if (typeof visual.guides !== 'boolean') add('GUIDES', 'Guias do layout inválidas.');
  return errors;
}
