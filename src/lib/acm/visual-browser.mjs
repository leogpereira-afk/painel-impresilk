import { VISUAL_LIMITS, isSafeRasterDataURL, sanitizeSVGSource, faceBounds, pieceArtRect, layerApplies, visualOf } from './visual.mjs';

export function loadVisualImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ''; reject(new Error('Não foi possível decodificar a imagem dentro do limite de tempo.')); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Imagem inválida ou formato não suportado.')); };
    image.src = url;
  });
}
export async function importVisualAsset(file, id) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Escolha PNG/JPG/SVG até 10 MiB.');
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!svg && !['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Use PNG, JPG ou SVG simples.');
  let blob = file;
  if (svg) {
    const source = sanitizeSVGSource(await file.text());
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('O SVG não possui estrutura XML válida.');
    blob = new Blob([new XMLSerializer().serializeToString(parsed.documentElement)], { type: 'image/svg+xml' });
  }
  // The app CSP permits local data images, not blob: URLs. Only the sanitized
  // SVG (or accepted raster file) reaches this decoder; no policy is relaxed.
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem local.'));
    reader.readAsDataURL(blob);
  });
  {
    const image = await loadVisualImage(url);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 64 * 1024 * 1024) throw new Error('Imagem muito grande. Reduza para até 64 megapixels.');
    let longest = Math.min(2048, Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    let dataUrl;
    do {
      const ratio = longest / Math.max(image.naturalWidth, image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL(mime, 0.82);
      longest = Math.floor(longest * 0.75);
    } while (dataUrl.length > VISUAL_LIMITS.assetBytes && longest >= 64);
    if (!isSafeRasterDataURL(dataUrl)) throw new Error('Não foi possível compactar a imagem com segurança. Use uma imagem menor.');
    return { id, name: file.name.slice(0, 180) || 'Imagem', mime, dataUrl, width: canvas.width, height: canvas.height };
  }
}

function drawLayer(ctx, layer, image) {
  ctx.save();
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2); ctx.rotate(layer.rotation * Math.PI / 180);
  ctx.globalAlpha = layer.opacity;
  if (layer.type === 'image' && image) {
    const crop = layer.crop;
    ctx.drawImage(image, crop.x * image.naturalWidth, crop.y * image.naturalHeight, crop.width * image.naturalWidth, crop.height * image.naturalHeight, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else if (layer.type === 'text') {
    const lines = layer.text.split('\n'); const lineHeight = layer.height / lines.length;
    ctx.font = `${layer.fontWeight} ${lineHeight * 0.85}px ${layer.fontFamily}`; ctx.fillStyle = layer.color;
    ctx.textBaseline = 'middle'; ctx.textAlign = layer.align;
    const x = layer.align === 'left' ? -layer.width / 2 : layer.align === 'right' ? layer.width / 2 : 0;
    lines.forEach((line, index) => ctx.fillText(line, x, -layer.height / 2 + lineHeight * (index + 0.5), layer.width));
  }
  ctx.restore();
}
/** Paint in shared face millimetres before clipping per piece: joints never restart the art. */
export async function renderPieceArtwork(project, pieces) {
  const visual = visualOf(project);
  const images = new Map(await Promise.all(visual.assets.map(async asset => [asset.id, await loadVisualImage(asset.dataUrl)])));
  const affected = pieces.filter(piece => visual.layers.some(layer => layerApplies(layer, piece)));
  const area = affected.reduce((sum, piece) => sum + piece.width * piece.height, 0);
  const density = Math.min(2, Math.sqrt(8 * 1024 * 1024 / Math.max(1, area)));
  const bounds = Object.fromEntries([...new Set(pieces.map(piece => piece.surface))].map(surface => [surface, faceBounds(pieces, surface)]));
  const canvases = new Map();
  for (const piece of affected) {
    const rect = pieceArtRect(piece, bounds[piece.surface]);
    const scale = Math.min(density, 2048 / Math.max(piece.width, piece.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(piece.width * scale)); canvas.height = Math.max(1, Math.round(piece.height * scale));
    const ctx = canvas.getContext('2d'); ctx.scale(canvas.width / piece.width, canvas.height / piece.height);
    for (const layer of visual.layers.filter(item => layerApplies(item, piece))) {
      ctx.save();
      if (layer.target.type === 'surface') ctx.translate(-rect.x, -rect.y);
      drawLayer(ctx, layer, images.get(layer.assetId));
      ctx.restore();
    }
    canvases.set(piece.id, canvas);
  }
  return { canvases, images };
}
export function renderPhotoBackground(background, image, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, width); canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = background.color; ctx.fillRect(0, 0, width, height);
  if (image) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * background.scale;
    ctx.translate(width * (0.5 + background.x / 100), height * (0.5 + background.y / 100));
    ctx.rotate(background.rotation * Math.PI / 180); ctx.transform(1, Math.tan(background.skewY * Math.PI / 180), Math.tan(background.skewX * Math.PI / 180), 1, 0, 0);
    ctx.globalAlpha = background.opacity;
    ctx.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale);
  }
  return canvas;
}
