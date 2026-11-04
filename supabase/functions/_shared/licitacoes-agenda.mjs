// O calendário projeta a ficha de acompanhamento; não duplica o evento no RH.
const ID_RELATORIO=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const CAMPOS_ORIGEM=['relatorioId','itemId','orgao','processo','item','lote','pendente'];
const falha=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
const objeto=v=>v&&typeof v==='object'&&!Array.isArray(v);
const texto=(v,max=1000)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export const dataAgendaValida=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export const horaAgendaValida=v=>v===''||(typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v));
export function validarOrigemPesquisa(v){
  if(!objeto(v)||Object.keys(v).some(k=>!CAMPOS_ORIGEM.includes(k))||typeof v.relatorioId!=='string'||!ID_RELATORIO.test(v.relatorioId)||!texto(v.itemId,300)||!v.itemId.trim()||typeof v.pendente!=='boolean')falha('Origem da pesquisa inválida.');
  for(const k of ['orgao','processo','item','lote'])if(!texto(v[k]))falha('Identificação da pesquisa inválida.');
  if(!v.pendente&&(!v.orgao.trim()||!v.processo.trim()||(!v.item.trim()&&!v.lote.trim())))falha('Identificação da oportunidade incompleta.');
  return Object.fromEntries(CAMPOS_ORIGEM.map(k=>[k,v[k]]));
}
export function origemDaPesquisa(item,relatorio,pendente=false){
  return validarOrigemPesquisa({relatorioId:relatorio?.id,itemId:item?.id,orgao:item?.orgao||'',processo:item?.processo||'',item:item?.item||'',lote:item?.lote||'',pendente});
}
export async function idAgendamentoLicitacao(origem){
  const o=validarOrigemPesquisa(origem),normalizar=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  const partes=o.orgao.trim()&&o.processo.trim()&&(o.item.trim()||o.lote.trim())?['oportunidade',...['orgao','processo','item','lote'].map(k=>normalizar(o[k]))]:['conferencia',o.relatorioId,o.itemId];
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(partes)));
  return 'lic-pesq-'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function dataHoraPrazoBrasilia(prazo,pendente=false){
  if(pendente||typeof prazo!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(prazo)||!dataAgendaValida(prazo.slice(0,10))||!Number.isFinite(Date.parse(prazo)))return {data:'',hora:''};
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(prazo)).map(x=>[x.type,x.value]));
  return {data:`${p.year}-${p.month}-${p.day}`,hora:`${p.hour}:${p.minute}`};
}
export function validarAgendamentoLicitacao(ficha){
  const origem=validarOrigemPesquisa(ficha?.origemPesquisa);
  if(ficha.tipo!=='licitacao'||!texto(ficha.nome,500)||!ficha.nome.trim())falha('Informe um título de até 500 caracteres.');
  if(origem.pendente&&ficha.validade)falha('Uma conferência pendente não define data de sessão. Use a data da próxima ação.');
  const data=origem.pendente?ficha.acompanhamento?.prazoAcao:ficha.validade;
  if(!dataAgendaValida(data))falha(origem.pendente?'Escolha uma data válida para a conferência.':'Confirme uma data válida para o calendário.');
  if(!horaAgendaValida(ficha.hora??''))falha('Horário inválido. Use HH:MM ou deixe o evento sem horário.');
  return {data,hora:ficha.hora||'',origem};
}
export function caminhoPesquisaAgendada(origem){
  const o=validarOrigemPesquisa(origem);
  return '/licitacoes?'+new URLSearchParams({relatorio:o.relatorioId,item:o.itemId}).toString();
}
export function projetarLicitacoesAgenda(itens,mes){
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(mes||''))falha('Mês inválido.');
  const eventos=[],ids=new Set();
  for(const item of itens||[]){
    if(item?.tipo!=='licitacao'||!item.origemPesquisa||!['avaliar','participar','enviada'].includes(item.status))continue;
    let agenda;try{agenda=validarAgendamentoLicitacao(item);}catch{continue;}
    if(!agenda.data.startsWith(mes)||typeof item.id!=='string'||!/^lic-pesq-[a-f0-9]{64}$/.test(item.id)||ids.has(item.id))continue;
    ids.add(item.id);
    const descricao=agenda.origem.pendente?'Conferência de evidências; o prazo da licitação ainda precisa ser confirmado.':
      item.preparacaoBot?.prazoImportado===true&&item.preparacaoBot?.conferidoPorPessoa!==true?'Prazo importado da pesquisa; confira edital e retificações.':'Prazo confirmado no acompanhamento. Confira atualizações na fonte oficial.';
    eventos.push({id:'licitacao:'+item.id,origem:'licitacoes',titulo:item.nome,data:agenda.data,hora:agenda.hora,tipo:agenda.origem.pendente?'Conferência de licitação':'Licitação',cor:'#7c3aed',descricao,href:caminhoPesquisaAgendada(agenda.origem)});
  }
  return eventos.sort((a,b)=>a.data.localeCompare(b.data)||a.hora.localeCompare(b.hora)||a.id.localeCompare(b.id));
}
