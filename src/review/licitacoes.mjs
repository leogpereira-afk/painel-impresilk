import {gerarRelatorio} from '../../supabase/functions/_shared/licitacoes-controle.mjs';
import {hashPesquisa,projetarPesquisaLicitacoes} from '../../supabase/functions/_shared/licitacoes-pesquisa.mjs';

// Exclusivamente a prévia review: recibos e oportunidades fictícios, sem
// execução de pesquisa, gravação ou validade comercial.
const TOTAL_DEMONSTRACAO=23;
const AGORA_DEMONSTRACAO=new Date();
const idDemonstracao=indice=>indice===0?'pesquisa-demonstracao':`pesquisa-demonstracao-${String(indice+1).padStart(2,'0')}`;
function cenarioAtual(){return new URLSearchParams(globalThis.location?.search||'').get('cenario');}
async function aguardarDemo(signal,cenario) {
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  await new Promise((resolve,reject)=>{
    const cancelar=()=>{clearTimeout(timer);reject(new DOMException('Cancelado','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancelar);resolve();},cenario==='licitacoes-lento'?2200:300);
    signal?.addEventListener('abort',cancelar,{once:true});
  });
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
}
async function registroDemonstracao(indice,cenario) {
  const now=AGORA_DEMONSTRACAO,base=new Date(now.getTime()-((cenario==='licitacoes-antigo'?9:0)+indice*3)*86400000);
  const iso=n=>new Date(base.getTime()+n*86400000).toISOString();
  const periodo={inicio:iso(-6).slice(0,10),fim:iso(0).slice(0,10)};
  const fonte={id:'portal-ficticio',url:'https://example.com/licitacoes',oficial:true,verificadaEm:iso(-1),evidenciaOficial:'Fonte didática da prévia; não corresponde a uma pesquisa real.'};
  const stages=['PNCP','PORTAIS_MUNICIPAIS','DIARIO_OFICIAL','COMPRAS_CENTRALIZADAS'];
  const locais=['Montes Claros','Salinas','Espinosa'];
  const recibo=(etapa,extra={})=>({
    id:`recibo-ficticio-${etapa}`,fonteId:fonte.id,consultadoEm:iso(-0.02),periodo,consulta:'Consulta fictícia de demonstração do painel.',
    municipios:locais,instituicoes:['SAMU 192 / CISRUN / SAMU Macro Norte'],etapa,etapasEquivalentes:etapa==='PNCP'?['PORTAL_PROPRIO']:[],
    escopoEvidencia:'Abrangência fictícia documentada apenas para testar a interface.',resultado:'CONCLUÍDA',conclusao:'COM_CANDIDATOS',
    resumo:'Resultado sintético; sem validade comercial.',itensExaminadosIntegralmente:true,paginacao:{completa:true,total:1,paginasConsultadas:[1]},
    coberturaEntes:{prefeituraUnidades:true,camara:true,entesIndiretos:'ABRANGIDOS',evidencia:'Entes didáticos abrangidos na simulação.'},
    coberturaInstituicoes:{unidades:['Base regional fictícia','Compra central fictícia'],escopoCompleto:true,evidencia:'Unidades didáticas na simulação.'},
    criterioTerritorial:'ENTREGA_EXECUCAO',...extra,
  });
  const validacoes=Object.fromEntries(['tecnica','documental','comercial','logistica'].map(key=>[key,{estado:'CONFIRMADA',confirmadaEm:iso(-0.01),referenciaPublicavel:'Evidência fictícia de demonstração.',resumoPublico:'Somente simulação; não autoriza participação.'}]));
  const candidato=(id,produto,municipio,classificacao,extra={})=>({
    id,processo:`Processo fictício ${id}`,orgao:municipio==='Salinas'?'Instituição pública fictícia':'Órgão público fictício',item:id,lote:'Lote de demonstração',
    familiaPortfolio:'SINALIZACAO',produto:indice?`${produto} · versão ${indice+1}`:produto,evidenciaPortfolio:'Especificação técnica fictícia de comunicação visual.',reciboIds:stages.map(s=>`recibo-ficticio-${s}`),
    oficialUrl:'https://example.com/licitacoes',prazo:iso(4),exigencias:['Conferir as medidas no anexo fictício.','Conferir documentação vigente antes de participar.'],
    proximaAcao:'Abrir o edital e conferir os requisitos com a equipe.',classificacao,justificativa:'Classificação didática para revisar a interface; sem decisão comercial.',
    localExecucao:{municipios:[municipio],apenasSede:false,misto:false,logisticaViavel:true,evidencia:'Destino fictício de entrega demonstrado no recibo.'},validacoes,...extra,
  });
  const inicial=cenario==='licitacoes-inicial';
  const dossie={periodo,geradoEm:base.toISOString(),fontes:inicial?[]:[fonte],recibos:inicial?[]:[
    ...stages.map(s=>recibo(s)),recibo('PNCP',{id:'recibo-ficticio-parcial',municipios:['Bocaiúva','Janaúba'],instituicoes:[],resultado:'PARCIAL',conclusao:'INDETERMINADA',pendencia:'Conferir o portal municipal e completar paginação.'}),
  ],candidatos:inicial?[]:[
    candidato('DEMO-A','Placas e sinalização · demonstração','Montes Claros','GO'),
    candidato('DEMO-B','Totem e letras-caixa · demonstração','Salinas','REVISÃO HUMANA',{validacoes:{}}),
    candidato('DEMO-C','Adesivos · prazo encerrado fictício','Espinosa','NO-GO',{prazo:iso(-1)}),
    candidato('DEMO-PENDENTE','Sinalização pendente · demonstração','Montes Claros','REVISÃO HUMANA',{localExecucao:{municipios:['Montes Claros'],apenasSede:true,misto:false,evidencia:'Somente a sede fictícia do órgão foi identificada.'},validacoes:{}}),
    candidato('DEMO-EVIDENCIA','Adesivos sem recibo · demonstração','Salinas','REVISÃO HUMANA',{reciboIds:[],validacoes:{},proximaAcao:'Localizar recibo público e conferir a execução.'}),
  ]};
  const report=gerarRelatorio(dossie);
  return {id:idDemonstracao(indice),periodo_de:periodo.inicio,periodo_ate:periodo.fim,gerado_em:dossie.geradoEm,recebido_em:new Date(base.getTime()+60000).toISOString(),versao:report.versao,dossie,hash_sha256:await hashPesquisa(dossie)};
}

export async function pesquisaLicitacoesDemo(signal,relatorio='') {
  const cenario=cenarioAtual();await aguardarDemo(signal,cenario);
  if(cenario==='licitacoes-erro')throw new Error('Falha simulada na ligação com o bot. Nenhuma cobertura foi inferida.');
  if(cenario==='licitacoes-sem-relatorio')return {estado:'sem_relatorio'};
  const indice=relatorio?Array.from({length:TOTAL_DEMONSTRACAO},(_,i)=>idDemonstracao(i)).indexOf(relatorio):0;
  if(indice<0)throw new Error('Relatório solicitado não encontrado. Escolha outra pesquisa no histórico.');
  const registro=await registroDemonstracao(indice,cenario);
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  return projetarPesquisaLicitacoes({estado:'disponivel',registro},AGORA_DEMONSTRACAO);
}

export async function historicoLicitacoesDemo(signal,pagina=1) {
  const cenario=cenarioAtual();await aguardarDemo(signal,cenario);
  if(cenario==='licitacoes-historico-erro')throw new Error('Falha simulada ao consultar o histórico.');
  const total=cenario==='licitacoes-sem-relatorio'?0:TOTAL_DEMONSTRACAO;
  const inicio=(pagina-1)*20,registros=[];
  for(let i=inicio;i<Math.min(inicio+20,total);i++){
    const {dossie,...metadados}=await registroDemonstracao(i,cenario);
    void dossie;registros.push(metadados);
  }
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  return {estado:'historico',registros,pagina,temMais:inicio+20<total};
}
