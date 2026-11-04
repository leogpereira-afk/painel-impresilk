import { comCracha, mensagemDoStatus } from '../lib/sessao.js';
import { API } from '../lib/api.js';
import { lerDocumento, salvarDownload } from './documentos.js';
import { criarZip, nomeArquivoZip, MAX_ZIP_ARQUIVOS, MAX_ZIP_BYTES } from '../lib/zip.mjs';

async function chamar(action, dados = {}, { signal, vigente = () => true } = {}) {
  if (signal?.aborted || !vigente()) throw new Error('A sessão mudou. Abra novamente os documentos.');
  const resposta = await comCracha(`${API}/painel-ativos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...dados }), signal });
  const corpo = await resposta.json().catch(() => null);
  if (signal?.aborted || !vigente()) throw new Error('A sessão mudou. Abra novamente os documentos.');
  if (!resposta.ok || !corpo || corpo.ok === false) throw Object.assign(new Error(corpo?.erro || mensagemDoStatus(resposta.status)), { status: resposta.status });
  return corpo;
}
export const listarKits = opcoes => chamar('listarKitsLicitacoes', {}, opcoes).then(r => r.itens);
export const salvarKit = (item, versao, opcoes) => chamar('salvarKitLicitacoes', { item, versao }, opcoes).then(r => r.item);
export const prepararKit = (id, versao, opcoes) => chamar('prepararDownloadKitLicitacoes', { id, versao }, opcoes);
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, letra => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[letra]));
export function indiceKit(kit, arquivos, pendencias) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${escapar(kit.nome)} — índice documental</title><style>body{font:16px system-ui;max-width:960px;margin:32px auto;padding:16px;color:#182132}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cad1dc;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}small{color:#596577}</style><h1>${escapar(kit.nome)}</h1><p>Edital: ${escapar(kit.licitacaoNome || kit.licitacaoId)} · Titular: ${escapar(kit.titularNome || kit.titularId)}</p><p>Versão do kit: ${escapar(kit.atualizadoEm)}</p><p>Pacote para conferência documental. Não comprova habilitação, protocolo ou envio. Confira as exigências e os prazos do edital.</p><h2>Pendências</h2>${pendencias.length ? `<ul>${pendencias.map(p => `<li>${escapar(p)}</li>`).join('')}</ul>` : '<p>Nenhuma pendência identificada nos vínculos cadastrados. A conferência do edital continua necessária.</p>'}<h2>Requisitos registrados</h2><table><tr><th>Requisito</th><th>Documento / versão</th><th>Emissão / validade</th><th>Conferência</th></tr>${(kit.requisitos || []).map(r => `<tr><td>${escapar(r.categoria)}<br>${escapar(r.descricao)}</td><td>${escapar(r.snapshot?.nome || 'Sem documento')}<br><small>${escapar(r.versaoId || r.snapshot?.atualizadoEm || '')}</small></td><td>${escapar(r.snapshot?.emissao || 'Não informada')}<br>${escapar(r.snapshot?.semVencimento ? 'Sem vencimento declarado' : r.snapshot?.validade || 'Não informada')}</td><td>${escapar(r.dispensado ? `Não se aplica: ${r.justificativa}` : (r.pendencias || []).join('; ') || 'Conferir edital')}</td></tr>`).join('')}</table><h2>Arquivos incluídos</h2><ul>${arquivos.map(a => `<li>${escapar(a.nomePacote || a.nome)} <small>Documento: ${escapar(a.documentoId)} · Versão: ${escapar(a.versaoId || 'referência congelada')}</small></li>`).join('')}</ul></html>`;
}
// Toda leitura usa a mesma autorização do download individual. Nenhum arquivo é
// disponibilizado enquanto todas as leituras e a montagem não forem concluídas.
export async function montarPacoteKit(manifesto, { signal, vigente = () => true, progresso = () => {}, ler = lerDocumento } = {}) {
  const { kit, arquivos, pendencias = [] } = manifesto || {};
  if (!kit || !Array.isArray(arquivos)) throw new Error('Não foi possível conferir o conteúdo do kit. Atualize e tente novamente.');
  if (arquivos.length + 1 > MAX_ZIP_ARQUIVOS) throw new Error(`O pacote comporta até ${MAX_ZIP_ARQUIVOS - 1} documentos mais o índice. Divida os requisitos em kits menores.`);
  const entradas = [], incluidos = [];
  let tamanho = 0;
  for (const [i, referencia] of arquivos.entries()) {
    if (signal?.aborted || !vigente()) throw new Error('A sessão mudou; nenhum pacote foi baixado.');
    progresso(`Preparando arquivo ${i + 1} de ${arquivos.length}…`);
    let arquivo;
    try { arquivo = await ler({ id: referencia.documentoId }, referencia.versaoId, referencia.arquivoId, { signal, podeAbrirArquivo: vigente }); }
    catch (erro) { throw new Error(`O pacote não foi baixado: falha ao ler “${referencia.nome || 'documento'}”. ${erro.message}`); }
    if (signal?.aborted || !vigente()) throw new Error('A sessão mudou; nenhum pacote foi baixado.');
    tamanho += arquivo.bytes.byteLength;
    if (tamanho > MAX_ZIP_BYTES) throw new Error('O kit excede 40 MiB. Divida os requisitos em kits menores. Nenhum pacote foi baixado.');
    const nomePacote = nomeArquivoZip(`${String(i + 1).padStart(2, '0')}-${arquivo.nome || referencia.nome || 'documento'}`);
    entradas.push({ nome: nomePacote, bytes: arquivo.bytes }); incluidos.push({ ...referencia, nomePacote });
  }
  const indice = new TextEncoder().encode(indiceKit(kit, incluidos, pendencias));
  if (tamanho + indice.byteLength > MAX_ZIP_BYTES) throw new Error('O kit e o índice excedem 40 MiB. Nenhum pacote foi baixado.');
  entradas.unshift({ nome: '00-indice.html', bytes: indice });
  if (signal?.aborted || !vigente()) throw new Error('A sessão mudou; nenhum pacote foi baixado.');
  return criarZip(entradas);
}
export async function baixarKit(kit, opcoes = {}) {
  const manifesto = await prepararKit(kit.id, kit.atualizadoEm, opcoes);
  const bytes = await montarPacoteKit(manifesto, opcoes);
  if (opcoes.signal?.aborted || opcoes.vigente && !opcoes.vigente()) throw new Error('A sessão mudou; nenhum pacote foi baixado.');
  salvarDownload(bytes, 'application/zip', `${nomeArquivoZip(kit.nome || 'kit-edital')}.zip`);
  return manifesto;
}
