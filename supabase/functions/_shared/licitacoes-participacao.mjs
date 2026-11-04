import {origemDaPesquisa,idAgendamentoLicitacao,dataAgendaValida,dataHoraPrazoBrasilia} from './licitacoes-agenda.mjs';

export const MODO_PREPARACAO_LICITACAO='preparacao_interna_acervo_bot';
const ID_RELATORIO=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
export const falhaParticipacao=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
export function selecionarParticipacao(corpo){
 if(!corpo||typeof corpo!=='object'||Array.isArray(corpo)||Object.keys(corpo).some(k=>!['action','relatorioId','itemId'].includes(k)))falhaParticipacao('Informe somente o relatório e o item para preparar o acompanhamento.');
 if(typeof corpo.relatorioId!=='string'||!ID_RELATORIO.test(corpo.relatorioId)||typeof corpo.itemId!=='string'||!corpo.itemId.trim()||corpo.itemId.length>300||/[\u0000-\u001f\u007f]/.test(corpo.itemId))falhaParticipacao('Relatório ou item inválido.');
 return {relatorioId:corpo.relatorioId,itemId:corpo.itemId};
}
const MODELO_CHECKLIST=[
 'Ler o edital, anexos e retificações na fonte oficial.',
 'Conferir documentos de habilitação e cadastros de fornecedor.',
 'Validar custos, capacidade de entrega e logística.',
 'Revisar proposta técnica e comercial antes de qualquer envio.',
];
export function prazoParticipacao(prazo,agora=new Date()){
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
 if(dataAgendaValida(prazo)){
  if(prazo<hoje)falhaParticipacao('O prazo do relatório já terminou. Confira uma versão atualizada antes de preparar a participação.',409);
  return {data:prazo,hora:''};
 }
 const horario=dataHoraPrazoBrasilia(prazo,false);
 if(!horario.data||!Number.isFinite(Date.parse(prazo)))falhaParticipacao('O prazo deste item precisa ser confirmado em uma pesquisa atualizada.',409);
 if(Date.parse(prazo)<=agora.getTime())falhaParticipacao('O prazo do relatório já terminou. Confira uma versão atualizada antes de preparar a participação.',409);
 return horario;
}
export async function resolverParticipacao(pesquisa,selecao){
 if(pesquisa?.estado!=='disponivel'||pesquisa?.id!==selecao.relatorioId||pesquisa?.origem!=='relatorio_publico_licitacoes'||pesquisa?.somenteLeitura!==true||typeof pesquisa.hash!=='string'||!/^[a-f0-9]{64}$/.test(pesquisa.hash)||!Number.isFinite(Date.parse(pesquisa.geradoEm||'')))falhaParticipacao('A pesquisa do BotImpresilk não foi confirmada. Nenhum acompanhamento foi criado.',503);
 const encontrados=(Array.isArray(pesquisa.oportunidades)?pesquisa.oportunidades:[]).filter(i=>i.id===selecao.itemId);
 if(encontrados.length!==1)falhaParticipacao('Item não encontrado entre as oportunidades validadas deste relatório.',409);
 const item=encontrados[0];
 if(!['GO','REVISÃO HUMANA'].includes(item.classificacao))falhaParticipacao('Este item não está liberado para preparação interna. Consulte a classificação registrada.',409);
 const origem=origemDaPesquisa(item,pesquisa,false),id=await idAgendamentoLicitacao(origem);
 return {item,origem,id};
}
export async function montarParticipacao(pesquisa,selecao,{agora=new Date(),quem=''}={}){
 const {item,origem,id}=await resolverParticipacao(pesquisa,selecao),prazo=prazoParticipacao(item.prazo,agora);
 const exigencias=Array.isArray(item.exigencias)?item.exigencias:[];
 if(exigencias.some(x=>typeof x!=='string'))falhaParticipacao('As exigências do relatório não foram confirmadas.',503);
 let fonte;try{fonte=new URL(item.oficialUrl);}catch{falhaParticipacao('A fonte oficial deste item precisa ser conferida.',409);}
 if(!['http:','https:'].includes(fonte.protocol)||fonte.username||fonte.password)falhaParticipacao('A fonte oficial deste item precisa ser conferida.',409);
 const requisitos=[...new Set(exigencias.map(x=>x.trim()).filter(Boolean))],resumir=x=>x.length>300?x.slice(0,297)+'…':x;
 const checklist=[...MODELO_CHECKLIST,...requisitos.slice(0,26)].map((texto,i)=>({id:`preparo-${i}`,texto:resumir(texto),feito:false}));
 const consultadoEm=agora.toISOString(),avisos=[
  'Preparação interna baseada no relatório do BotImpresilk; não executa nova pesquisa nem envia proposta ao órgão.',
  'Data e horário importados do relatório. Confira o edital, os anexos e as retificações antes de participar.',
 ];
 if(item.classificacao==='REVISÃO HUMANA')avisos.push('A oportunidade permanece classificada como REVISÃO HUMANA. A preparação não a transforma em GO.');
 if(pesquisa.antigo===true)avisos.push('O relatório está antigo. Confira as informações atuais na fonte oficial.');
 if(requisitos.length>26||requisitos.some(x=>x.length>300))avisos.push('O checklist contém resumos. Todas as exigências originais estão preservadas nos detalhes da preparação.');
 const preparacaoBot={modo:MODO_PREPARACAO_LICITACAO,relatorioId:pesquisa.id,itemId:item.id,hash:pesquisa.hash,geradoEm:pesquisa.geradoEm,consultadoEm,exigencias:[...exigencias],classificacao:item.classificacao,prazoOriginal:item.prazo,prazoImportado:true,conferidoPorPessoa:false,produto:item.produto||'',oficialUrl:fonte.href,proximaAcaoOriginal:item.proximaAcao||'',avisos};
 const ficha={id,tipo:'licitacao',nome:['Licitação',item.orgao,item.produto].filter(Boolean).join(' · ').slice(0,500),identificacao:item.orgao,edital:item.processo,categoria:'',status:'participar',responsavel:'',validade:prazo.data,hora:prazo.hora,url:fonte.href,origemPesquisa:origem,preparacaoBot,observacao:'Preparação interna criada a partir do acervo do BotImpresilk. Prazo importado do relatório; exige conferência na fonte oficial.',acompanhamento:{proximaAcao:'Conferir edital, anexos e retificações na fonte oficial; revisar exigências e definir o responsável.',prazoAcao:'',checklist,decisao:'',resultado:'',valorContratado:0},temArquivo:false,criadoEm:consultadoEm,atualizadoEm:consultadoEm,atualizadoPor:quem};
 if(new TextEncoder().encode(JSON.stringify(ficha)).byteLength>512*1024)falhaParticipacao('A preparação excede o tamanho permitido. Nenhuma exigência foi descartada; confira o relatório completo.',413);
 return {ficha,avisos};
}
export async function mesmaParticipacao(item,id){
 if(item?.id!==id||item?.tipo!=='licitacao'||!item.origemPesquisa)return false;
 try{return await idAgendamentoLicitacao(item.origemPesquisa)===id;}catch{return false;}
}
