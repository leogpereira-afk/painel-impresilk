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

const ESTADOS_EXECUCAO=['sem_execucao','solicitada','em_andamento','concluida','falhou'];
let execucaoDemo=null;
async function consultarExecucao(method,signal) {
  if(import.meta.env.MODE==='review'){
    if(signal?.aborted)throw new DOMException('Leitura cancelada','AbortError');
    if(method==='POST')execucaoDemo={estado:'solicitada',execucao:null,solicitadaEm:new Date().toISOString(),mensagem:'Prévia: solicitação simulada; nenhuma pesquisa real foi iniciada.'};
    const estado=new URLSearchParams(window.location.search).get('execucao');
    return {...(execucaoDemo||{estado:ESTADOS_EXECUCAO.includes(estado)?estado:'sem_execucao',execucao:null}),consultadoEm:new Date().toISOString(),podeIniciar:true,demonstracao:true};
  }
  const r=await comCracha(`${API}/painel-dados?modulo=licitacoes-execucao`,{method,signal,cache:'no-store'});
  const b=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(b?.erro||mensagemDoStatus(r.status));
  if(!b||!ESTADOS_EXECUCAO.includes(b.estado))throw new Error('O estado da pesquisa não foi confirmado. Atualize a leitura.');
  return b;
}
export const obterExecucaoLicitacoes=signal=>consultarExecucao('GET',signal);
export const iniciarPesquisaLicitacoes=signal=>consultarExecucao('POST',signal);

// Sem polling: uma consulta por ação. Cancelar descarta a resposta de outra sessão.
export function criarControleExecucaoLicitacoes({consultar,iniciar,receber}) {
  let sequencia=0,controller,ultimo=null,envio=null;
  async function executar(rodar) {
    controller?.abort();controller=new AbortController();const atual=controller,id=++sequencia;
    receber({dados:ultimo,carregando:!rodar,iniciando:rodar,erro:null});
    try {
      const dados=await (rodar?iniciar:consultar)(atual.signal);
      if(id===sequencia&&!atual.signal.aborted){ultimo=dados;receber({dados,carregando:false,iniciando:false,erro:null});}
    }catch(e){
      if(id===sequencia&&!atual.signal.aborted)receber({dados:ultimo,carregando:false,iniciando:false,erro:e?.message||'Não foi possível confirmar a execução da pesquisa.'});
    }
  }
  return {
    atualizar(){return envio||executar(false);},
    rodar(){if(envio)return envio;const atual=executar(true);envio=atual;void atual.finally(()=>{if(envio===atual)envio=null;});return atual;},
    cancelar(){sequencia++;controller?.abort();envio=null;ultimo=null;},
  };
}
