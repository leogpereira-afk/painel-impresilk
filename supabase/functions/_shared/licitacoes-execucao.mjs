// Transporte e armazenamento injetados: nenhum segredo, Deno ou banco global.
export const CHAVE_DISPARO_LICITACOES='pesquisa_licitacoes_disparo';
const ATIVOS=['in_progress','queued','waiting','pending','requested'];
const COOLDOWN_MS=10*60*1000;
const falha=(message,status=503)=>Object.assign(new Error(message),{status});
const instante=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;

function projetarRun(run,repo) {
  if(!run||!Number.isSafeInteger(run.id)||run.id<=0||run.head_branch!=='main'||!['completed',...ATIVOS].includes(run.status)||!instante(run.created_at)||!instante(run.updated_at))throw falha('O GitHub não confirmou os dados da execução de pesquisa.');
  return {id:run.id,url:`https://github.com/${repo}/actions/runs/${run.id}`,status:run.status,conclusao:typeof run.conclusion==='string'?run.conclusion:null,iniciadaEm:run.created_at,atualizadaEm:run.updated_at};
}
function resposta({run,registro,repo,em}) {
  const execucao=run?projetarRun(run,repo):null;
  const solicitadaEm=instante(registro?.em);
  let estado='sem_execucao',erro=null,mensagem='Nenhuma execução de pesquisa identificada.';
  if(execucao){
    estado=execucao.status==='completed'?(execucao.conclusao==='success'?'concluida':'falhou'):(execucao.status==='in_progress'?'em_andamento':'solicitada');
    mensagem=estado==='concluida'?'Etapa automática concluída. A cobertura permanece a registrada no relatório.':estado==='em_andamento'?'Varredura pública automática em andamento.':estado==='solicitada'?'Execução aguardando início no GitHub.':'A etapa automática não foi concluída com sucesso.';
    if(estado==='falhou')erro=`Resultado da execução: ${execucao.conclusao||'não informado'}. Confira o registro da execução.`;
  }else if(solicitadaEm){
    estado=registro.estado==='falhou'?'falhou':'solicitada';
    erro=estado==='falhou'?(registro.erro||'O disparo da pesquisa não foi confirmado.'):null;
    mensagem=registro.estado==='reservada'?'Solicitação em preparação; o disparo ainda não foi confirmado.':estado==='falhou'?'Não foi possível confirmar o início da pesquisa.':'Solicitação aceita; aguardando identificação da execução no GitHub.';
  }
  return {estado,execucao,solicitadaEm,consultadoEm:em,mensagem,erro,podeRepetir:!execucao&&!!solicitadaEm&&Date.parse(em)-Date.parse(solicitadaEm)>=COOLDOWN_MS,cooldownAte:solicitadaEm?new Date(Date.parse(solicitadaEm)+COOLDOWN_MS).toISOString():null};
}

export async function processarExecucaoLicitacoes({method='GET',token,repo='leogpereira-afk/painel-impresilk',fetcher=fetch,meta,confirmarAcesso,agora=()=>new Date(),novoId=()=>crypto.randomUUID(),timeoutMs=15000}) {
  if(!['GET','POST'].includes(method))throw falha('Esta operação aceita somente GET ou POST.',405);
  await confirmarAcesso();
  if(typeof token!=='string'||!token.trim())throw falha('O token de execução da pesquisa não está configurado no servidor.');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw falha('O repositório de pesquisa não está configurado corretamente.');
  const em=agora().toISOString(),base=`https://api.github.com/repos/${repo}/actions/workflows/pesquisa-licitacoes.yml`;
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'impresilk-painel','Content-Type':'application/json'};
  async function buscar(url,options={}) {
    const controller=new AbortController();let timer;
    try {
      const transporte=(async()=>{const response=await fetcher(url,{...options,headers,redirect:'error',signal:controller.signal});if(options.method==='POST')return response;const body=await response.json().catch(()=>null);return {ok:response.ok,status:response.status,json:async()=>body};})();
      return await Promise.race([transporte,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(falha('O GitHub não respondeu a tempo. O início da pesquisa não foi confirmado.'));},timeoutMs);})]);
    }catch(e){if(e?.status)throw e;throw falha('Não foi possível consultar a execução de pesquisa no GitHub.');}
    finally{clearTimeout(timer);controller.abort();}
  }
  async function listar(status='') {
    const r=await buscar(`${base}/runs?branch=main&per_page=${status?'1':'100'}${status?`&status=${status}`:''}`);
    if(r.status===404)throw falha('O workflow de pesquisa ainda não está disponível no repositório configurado.');
    if(!r.ok)throw falha(`O GitHub recusou a consulta de execução (${r.status}). Confira a configuração do servidor.`);
    const body=await r.json().catch(()=>null);
    if(!Array.isArray(body?.workflow_runs))throw falha('O GitHub não confirmou a lista de execuções da pesquisa.');
    return body.workflow_runs;
  }
  const [ultimas,...ativas]=await Promise.all([listar(),...ATIVOS.map(listar)]);
  let anterior=await meta.ler();
  await confirmarAcesso();
  const ativa=ativas.flat().find(run=>ATIVOS.includes(run.status));
  const registro=anterior?.valor;
  // Um sucesso anterior nunca comprova conclusão de um dispatch mais recente.
  const correspondente=registro?.solicitacaoId?ultimas.find(run=>typeof run.display_title==='string'&&run.display_title.includes(registro.solicitacaoId)&&Date.parse(run.created_at)>=Date.parse(registro.em)-60000):ultimas[0];
  if(method==='GET'||ativa)return resposta({run:ativa||correspondente,registro,repo,em});
  const decorrido=Date.parse(em)-Date.parse(registro?.em);
  if(Number.isFinite(decorrido)&&decorrido<COOLDOWN_MS)return resposta({run:correspondente,registro,repo,em});
  const reserva={estado:'reservada',em,solicitacaoId:novoId()};
  if(!await meta.reservar(anterior,reserva)){
    anterior=await meta.ler();await confirmarAcesso();
    if(!anterior?.valor)throw falha('Outra solicitação está sendo preparada. Atualize a leitura antes de tentar novamente.',409);
    return resposta({registro:anterior.valor,repo,em});
  }
  // Revogação após a reserva não chega ao GitHub. A reserva expira no cooldown.
  await confirmarAcesso();
  let r;
  try {r=await buscar(`${base}/dispatches`,{method:'POST',body:JSON.stringify({ref:'main',inputs:{solicitacao_id:reserva.solicitacaoId}})});}
  catch(e){await confirmarAcesso();await meta.registrar(reserva,{...reserva,estado:'falhou',erro:e.message});throw e;}
  await confirmarAcesso();
  if(r.status!==204){
    const erro=`O GitHub recusou o disparo da pesquisa (${r.status}). O início não foi confirmado.`;
    await meta.registrar(reserva,{...reserva,estado:'falhou',erro});throw falha(erro);
  }
  const confirmado={...reserva,estado:'solicitada'};
  if(!await meta.registrar(reserva,confirmado))throw falha('O GitHub aceitou o disparo, mas o registro local não foi confirmado. Atualize a leitura antes de tentar novamente.');
  await confirmarAcesso();
  return resposta({registro:confirmado,repo,em});
}
