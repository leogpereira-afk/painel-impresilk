import { comCracha, mensagemDoStatus } from '../lib/sessao.js';
import { API } from '../lib/api.js';
import { arquivoParaBase64, abrirBase64, lerArquivo } from './ativos.js';

async function chamar(action, dados = {}, { signal } = {}) {
  const resp = await comCracha(`${API}/painel-ativos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...dados }), signal,
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok || corpo?.ok === false || !corpo) {
    throw Object.assign(new Error(corpo?.erro || mensagemDoStatus(resp.status)), { status: resp.status });
  }
  return corpo;
}

export const listarDocumentos = opcoes => chamar('listarDocumentos', {}, opcoes);
export const salvarControle = (item, versao, arquivo, opcoes) => chamar('salvarControle', { item, versao, ...(arquivo ? { arquivo } : {}) }, opcoes).then(r => r.item);
export const renovarControle = (item, versao, arquivo, opcoes) => chamar('renovarControle', { item, versao, arquivo }, opcoes).then(r => r.item);
export const removerControle = (id, versao) => chamar('removerControle', { id, versao });
export const lixeiraDocumentos = () => chamar('lixeiraDocumentos').then(r => r.itens || []);
export const restaurarControle = id => chamar('restaurarControle', { id });
export const salvarTitular = (item, versao, opcoes) => chamar('salvarTitular', { item, versao }, opcoes).then(r => r.item);
export const salvarRequisito = (item, versao) => chamar('salvarRequisito', { item, versao }).then(r => r.item);
export const previaDocumentos = () => chamar('previaDocumentos');
export async function baixarDocumento(item, versaoId, arquivoId, { signal, podeAbrirArquivo = () => true } = {}) {
  const arquivo = await chamar('lerVersaoDocumento', { id: item.id, ...(versaoId ? { versaoId } : {}), ...(arquivoId ? { arquivoId } : {}) }, { signal });
  if (signal?.aborted || !podeAbrirArquivo()) return;
  abrirBase64(arquivo.base64, arquivo.mime, arquivo.nome || item.arquivoNome);
}
export async function prepararArquivo(arquivo) {
  if (!arquivo) return undefined;
  if (arquivo.size > 3 * 1024 * 1024) throw new Error('O arquivo deve ter até 3 MB. Reduza a imagem ou envie um PDF menor.');
  return { base64: await arquivoParaBase64(arquivo), nome: arquivo.name, mime: arquivo.type || 'application/octet-stream' };
}

// O arquivo físico legado mantém a porta e a autorização de origem.
export async function baixarLegadoBem(bem) {
  const arquivo = await lerArquivo(bem.id);
  abrirBase64(arquivo.base64, arquivo.mime, arquivo.nome || bem.arquivoNome);
}
