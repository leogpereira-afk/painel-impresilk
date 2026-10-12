import {API} from '../lib/api.js';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';

export async function obterPesquisaLicitacoes(signal) {
  if(import.meta.env.MODE==='review'){
    const {pesquisaLicitacoesDemo}=await import('../review/licitacoes.mjs');
    return pesquisaLicitacoesDemo(signal);
  }
  const r=await comCracha(`${API}/painel-dados?modulo=licitacoes`,{method:'GET',signal,cache:'no-store'});
  const b=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(b?.erro||mensagemDoStatus(r.status));
  if(!b||!['disponivel','sem_relatorio'].includes(b.estado))throw new Error('A pesquisa não foi confirmada pelo servidor. Atualize a leitura.');
  return b;
}
