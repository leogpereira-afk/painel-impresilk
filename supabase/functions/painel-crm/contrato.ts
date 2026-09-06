export function codigo(v:unknown){const s=String(v??'');if(!/^[1-9]\d{0,12}$/.test(s))throw new Error('Identificador inválido.');return Number(s);}
export function texto(v:unknown,max:number,obrigatorio=true){if(typeof v!=='string'||v.length>max|| (obrigatorio&&!v.trim()))throw new Error('Confira os campos obrigatórios e o tamanho do texto.');return v.trim();}
export function dataHora(d:unknown,h:unknown){const dia=String(d||''),hora=String(h||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(dia)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)||new Date(dia+'T12:00:00Z').toISOString().slice(0,10)!==dia)throw new Error('Data ou horário inválido.');return {dia,hora};}
// Só quatro operações documentadas. Nenhuma rota livre ou baixa financeira.
export function pedidoCrm(action:string,b:any){
 if(action==='mover')return {method:'PATCH',rota:'funil-vendas-card/mover',payload:{id:codigo(b.cardId),grupo:codigo(b.grupoId),fase:codigo(b.faseId)}};
 if(action==='anotar')return {method:'POST',rota:'funil-vendas-card/anotacao',payload:{card:codigo(b.cardId),texto:texto(b.texto,4000)}};
 if(action==='criar'){
  if(typeof b.valor!=='number'||!Number.isFinite(b.valor)||b.valor<0||b.valor>1e9)throw new Error('Valor inválido.');
  return {method:'POST',rota:'funil-vendas-card',payload:{grupo:codigo(b.grupoId),fase:codigo(b.faseId),cliente:codigo(b.clienteId),titulo:texto(b.titulo,200),descricao:texto(b.descricao,4000),responsavel:codigo(b.responsavelId),valor:b.valor,card_vinculado:0}};
 }
 if(action==='tarefa'){
  const inicio=dataHora(b.data,b.hora),fim=dataHora(b.dataFim,b.horaFim);if(inicio.dia+inicio.hora>fim.dia+fim.hora)throw new Error('O término precisa ser depois do início.');
  const tipo=String(b.tipo);if(!['Telefone','Mensagem','Email','Outros'].includes(tipo))throw new Error('Tipo de tarefa inválido.');
  return {method:'POST',rota:'funil-vendas-card/tarefa',payload:{card:codigo(b.cardId),grupo:codigo(b.grupoTarefaId),tipo,titulo:texto(b.titulo,200),descricao:texto(b.descricao||'',4000,false),data_inicial:inicio.dia,hora_inicial:inicio.hora.replace(':','-'),data_final:fim.dia,hora_final:fim.hora.replace(':','-'),prioridade:1}};
 }
 throw new Error('Ação inválida.');
}
