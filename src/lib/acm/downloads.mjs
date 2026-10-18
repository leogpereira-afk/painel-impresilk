/** Decode archived PNGs into binary downloads; textual documents keep their UTF-8 content. */
export function documentBlob(content, mime) {
  if (mime === 'image/png') {
    if (typeof content !== 'string' || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('Imagem PNG inválida para download.');
    const binary = atob(content.slice(content.indexOf(',') + 1));
    return new Blob([Uint8Array.from(binary, character => character.charCodeAt(0))], { type: mime });
  }
  return new Blob([content], { type: mime });
}
