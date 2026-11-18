import {API} from '../lib/api.js';
import {comCracha, mensagemDoStatus} from '../lib/sessao.js';
import {validarArquivoReuniao} from '../../supabase/functions/_shared/reunioes.mjs';

const MUTACOES = new Set(['salvar','importar','comentar','anexar','removerAnexo']);
export async function chamarPlanejamento(action, dados = {}) {
  const corpo = {action, ...dados};
  const resposta = import.meta.env.MODE === 'review'
    ? await (await import('../review/planejamento.mjs')).respostaPlanejamento(corpo)
    : await comCracha(`${API}/painel-planejamento`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(corpo)});
  const resultado = await resposta.json().catch(() => null);
  if (!resposta.ok || resultado?.ok !== true) {
    const erro = new Error(resultado?.erro || mensagemDoStatus(resposta.status));
    erro.status = resposta.status;
    throw erro;
  }
  if (MUTACOES.has(action)) window.dispatchEvent(new Event('planejamento-atualizado'));
  return resultado;
}
export const lerAgendaPlanejamento = mes => chamarPlanejamento('agenda',{mes}).then(r => {
  if (!Array.isArray(r.eventos)) throw new Error('Não foi possível conferir as ações do planejamento.');
  return r.eventos;
});
export const abrirArquivoPlanejamento = (id, arquivoId) => chamarPlanejamento('arquivo',{id,arquivoId}).then(r => r.url);
export async function anexarPlanejamento(item, arquivo, detalhes = {}) {
  validarArquivoReuniao(arquivo.name, arquivo.type, arquivo.size);
  const base64 = await new Promise((resolve,reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo. Tente novamente.'));
    leitor.readAsDataURL(arquivo);
  });
  return chamarPlanejamento('anexar',{id:item.id,versao:item.versao,nome:arquivo.name,mime:arquivo.type,base64,...detalhes});
}
