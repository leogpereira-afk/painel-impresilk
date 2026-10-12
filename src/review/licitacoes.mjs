import {gerarRelatorio} from '../../supabase/functions/_shared/licitacoes-controle.mjs';
import {hashPesquisa,projetarPesquisaLicitacoes} from '../../supabase/functions/_shared/licitacoes-pesquisa.mjs';

// Exclusivamente a prévia review: recibos e oportunidades fictícios, sem
// execução de pesquisa, gravação ou validade comercial.
export async function pesquisaLicitacoesDemo(signal) {
  const cenario=new URLSearchParams(location.search).get('cenario');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(resolve,cenario==='licitacoes-lento'?2200:300);
    signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelado','AbortError'));},{once:true});
  });
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  if(cenario==='licitacoes-erro')throw new Error('Falha simulada na ligação com o bot. Nenhuma cobertura foi inferida.');
  if(cenario==='licitacoes-sem-relatorio')return {estado:'sem_relatorio'};
  const now=new Date(),base=new Date(now.getTime()-(cenario==='licitacoes-antigo'?9:0)*86400000);
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
    familiaPortfolio:'SINALIZACAO',produto,evidenciaPortfolio:'Especificação técnica fictícia de comunicação visual.',reciboIds:stages.map(s=>`recibo-ficticio-${s}`),
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
  ]};
  const report=gerarRelatorio(dossie);
  return projetarPesquisaLicitacoes({estado:'disponivel',registro:{id:'pesquisa-demonstracao',periodo_de:periodo.inicio,periodo_ate:periodo.fim,gerado_em:dossie.geradoEm,recebido_em:now.toISOString(),versao:report.versao,dossie,hash_sha256:await hashPesquisa(dossie)}},now);
}
