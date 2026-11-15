// Extensão do backup do Painel: somente a tabela e o bucket de A Virada.
import { idValido, MAX_FOTO } from './virada.mjs';
export function conferirCopiaVirada(mapa, arquivos = []) {
  if (mapa === undefined) return []; // Cópias anteriores não tinham o programa.
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) throw new Error('Cópia de A Virada inválida.');
  const linhas = Object.values(mapa);
  if (linhas.length > 1000) throw new Error('A cópia excedeu o limite de ciclos.');
  const fotos = new Map(arquivos.filter(a => a?.bucket === 'virada-evidencias').map(a => [a.caminho, a]));
  for (const [key, row] of Object.entries(mapa)) {
    const c = row?.registro;
    if (!idValido(key) || row?.id !== key || typeof row.ativo !== 'boolean' || !Number.isSafeInteger(row.versao) || row.versao < 1 || c?.id !== key || c.versao !== row.versao || c.dias !== 90 || !Array.isArray(c.participantes) || !Array.isArray(c.missoes) || !Array.isArray(c.mural) || !Array.isArray(c.historico)) throw new Error('Ciclo inválido na cópia de A Virada.');
    const referencias = [...c.missoes.flatMap(m => (m.evidencias || []).flatMap(e => e.fotos || [])), ...c.mural.flatMap(p => p.fotos || []), ...c.participantes.flatMap(p => p.documentos || [])];
    for (const f of referencias) {
      if (!f || typeof f.chave !== 'string' || !f.chave.startsWith(`virada/${key}/`)) throw new Error('Referência de foto inválida em A Virada.');
      const a = fotos.get(f.chave);
      if (!a || a.bytes !== f.tamanho || a.tipo !== f.mime || a.bytes < 1 || a.bytes > MAX_FOTO || f.sha256 && a.sha256 !== f.sha256) throw new Error('A cópia de A Virada não contém todas as fotos referenciadas.');
    }
  }
  return linhas;
}
