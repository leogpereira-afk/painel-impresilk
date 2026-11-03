import {dataValida} from './calc/documentos.js';

export const SITUACOES_CADASTRO={planejado:'A cadastrar',preparacao:'Preparando',enviado:'Enviado','em-analise':'Em análise',exigencia:'Documentos solicitados',ativo:'Ativo',indeferido:'Indeferido',inativo:'Inativo',arquivado:'Arquivado'};
export const PRIORIDADES_CADASTRO={alta:'Alta',media:'Média',baixa:'Baixa'};
export const CATEGORIAS_CADASTRO={governo:'Órgão público',instituicao:'Instituição',plataforma:'Plataforma de compras'};
export function diaBrasilia(agora=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
}
export function diasCadastro(de,ate) {
  if(!dataValida(de)||!dataValida(ate))return null;
  return Math.round((Date.parse(`${ate}T12:00:00Z`)-Date.parse(`${de}T12:00:00Z`))/86400000);
}
export function situacaoCadastro(item,hoje=diaBrasilia()) {
  if(!['inativo','arquivado'].includes(item.situacao)) {
    const prazo=diasCadastro(hoje,item.prazoAcao);
    if(prazo!==null&&prazo<=0)return {rotulo:prazo===0?'Ação vence hoje':'Prazo de ação vencido',tom:'bad',grupo:'pendente'};
  }
  if(item.situacao==='ativo') {
    if(item.validade&&!dataValida(item.validade))return {rotulo:'Validade a conferir',tom:'warn',grupo:'pendente'};
    const dias=diasCadastro(hoje,item.validade);
    if(dias!==null&&dias<0)return {rotulo:'Cadastro vencido',tom:'bad',grupo:'pendente'};
    if(dias!==null&&dias<=30)return {rotulo:dias===0?'Vence hoje':'Renovar em breve',tom:'warn',grupo:'pendente'};
    if(dias===null&&!item.semVencimento)return {rotulo:'Validade a conferir',tom:'warn',grupo:'pendente'};
    return {rotulo:'Ativo',tom:'ok',grupo:'ativo'};
  }
  const tom=['exigencia','indeferido'].includes(item.situacao)?'bad':['enviado','em-analise'].includes(item.situacao)?'info':'neutral';
  return {rotulo:SITUACOES_CADASTRO[item.situacao]||'A conferir',tom,grupo:['exigencia','indeferido'].includes(item.situacao)?'pendente':['enviado','em-analise'].includes(item.situacao)?'analise':['inativo','arquivado'].includes(item.situacao)?'arquivo':'planejado'};
}
export function urlPortalSegura(valor) {
  try {const u=new URL(valor);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';} catch{return '';}
}
export function conciliarCadastro(base,rascunho,atual,campos) {
  const mudou=(a,b)=>JSON.stringify(a??'')!==JSON.stringify(b??'');
  const locais=campos.filter(k=>mudou(base[k],rascunho[k]));
  return {
    item:{...atual,...Object.fromEntries(locais.map(k=>[k,rascunho[k]]))},
    conflitos:locais.filter(k=>mudou(base[k],atual[k])&&mudou(rascunho[k],atual[k])),
    alterados:campos.filter(k=>mudou(base[k],atual[k])),
  };
}
export function filtrarCadastros(itens,{busca='',grupo='',titularId=''}={},hoje=diaBrasilia()) {
  const q=busca.trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  return itens.filter(i=>!titularId||i.titularId===titularId).map(i=>({...i,sit:situacaoCadastro(i,hoje)})).filter(i=>grupo?i.sit.grupo===grupo:i.sit.grupo!=='arquivo').filter(i=>!q||[i.nome,i.abrangencia,i.servicos,i.protocolo,i.exigencias].join(' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)).sort((a,b)=>{
    const peso={pendente:0,analise:1,planejado:2,ativo:3,arquivo:4};
    return peso[a.sit.grupo]-peso[b.sit.grupo]||String(a.prazoAcao||'9999').localeCompare(b.prazoAcao||'9999')||a.nome.localeCompare(b.nome,'pt-BR');
  });
}
