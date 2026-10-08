import {dataValida,idValido,ErroReuniao,validarArquivoReuniao} from './reunioes.mjs';
export {validarArquivoReuniao as validarArquivoProcesso};
export const COLECAO_PROCESSOS='processos_empresa';
export const SITUACOES={nova:'Nova',analise:'Em análise',planejada:'Planejada',execucao:'Em execução',validacao:'Em validação',concluida:'Concluída',cancelada:'Cancelada'};
export const ESTADOS_ETAPA={pendente:'Pendente',execucao:'Em execução',bloqueada:'Bloqueada',validacao:'Em validação',concluida:'Concluída'};
export const SETORES={empresa:'Empresa toda',financeiro:'Financeiro',comercial:'Comercial',producao:'Produção',rh:'RH',outros:'Outros'};
export const PRIORIDADES={baixa:'Baixa',normal:'Normal',alta:'Alta',urgente:'Urgente'};
export const falhar=(texto,status=422)=>{throw new ErroReuniao(texto,status);};
const txt=(v,max,rotulo,obrigatorio=false)=>{if(typeof v!=='string'||v.length>max||(obrigatorio&&!v.trim()))falhar('Confira '+rotulo+'.');return v.trim();};
const data=(v,rotulo)=>{if(v&&!dataValida(v))falhar('Confira a data de '+rotulo+'.');return v||'';};
export const podeGerir=(r,s)=>!!s&&!s.externo&&(s.master===true||r?.criadoPor===s.sub||!!s.rhId&&r?.responsavelRhId===s.rhId);
export const podeLer=(r,s)=>podeGerir(r,s)||!!s?.rhId&&r?.envolvidos?.some(p=>p.rhId===s.rhId);
export function prepararProcesso(c,antes,s,pessoasRH=[],agora=new Date().toISOString()){
 if(!c||!idValido(c.id)||!['demanda','consultoria'].includes(c.tipo))falhar('Identificação do processo inválida.');
 if(antes&&(!podeGerir(antes,s)||antes.tipo!==c.tipo))falhar('Você não pode alterar esta ficha.',403);
 if((c.versaoAnterior??null)!==(antes?.versao??null))falhar('A ficha mudou. Reabra antes de salvar.',409);
 if(!Object.hasOwn(SITUACOES,c.situacao)||!Object.hasOwn(SETORES,c.setor)||!Object.hasOwn(PRIORIDADES,c.prioridade))falhar('Confira situação, setor e prioridade.');
 if(!Array.isArray(c.envolvidos)||!c.envolvidos.length||c.envolvidos.length>150)falhar('Selecione de 1 a 150 pessoas do RH.');
 const envolvidos=c.envolvidos.map(p=>{if(!idValido(p?.rhId))falhar('Pessoa sem ID do RH.');const rh=pessoasRH.find(x=>x.id===p.rhId)||antes?.envolvidos?.find(x=>x.rhId===p.rhId);if(!rh)falhar('Pessoa não disponível no RH. Atualize a lista.');return {rhId:p.rhId,nome:rh.nome,area:rh.area||'',cargo:rh.cargo||''};});
 const ids=new Set(envolvidos.map(p=>p.rhId));if(ids.size!==envolvidos.length)falhar('Pessoa repetida na lista.');if(!ids.has(c.responsavelRhId))falhar('Selecione o responsável entre os envolvidos.');
 if(!Array.isArray(c.etapas)||c.etapas.length>100)falhar('Informe até 100 etapas.');
 const etapas=c.etapas.map(e=>{if(!e||!idValido(e.id)||!ids.has(e.responsavelRhId)||!Object.hasOwn(ESTADOS_ETAPA,e.situacao)||!Array.isArray(e.dependeDe)||e.dependeDe.length>100)falhar('Confira os responsáveis e dados das etapas.');return {id:e.id,titulo:txt(e.titulo,180,'o título da etapa',true),descricao:txt(e.descricao||'',5000,'a descrição da etapa'),responsavelRhId:e.responsavelRhId,prazo:data(e.prazo,'prazo da etapa'),situacao:e.situacao,dependeDe:[...new Set(e.dependeDe)],nota:txt(e.nota||'',5000,'o andamento'),concluidaEm:e.situacao==='concluida'?(antes?.etapas?.find(x=>x.id===e.id&&x.situacao==='concluida')?.concluidaEm||agora):null};});
 if(new Set(etapas.map(e=>e.id)).size!==etapas.length)falhar('Etapas repetidas.');
 const porId=new Map(etapas.map(e=>[e.id,e])),feitas=new Set(),caminho=new Set();
 function visitar(id){if(caminho.has(id))falhar('As dependências das etapas formam um ciclo.');if(feitas.has(id))return;const e=porId.get(id);if(!e)falhar('Dependência não encontrada.');caminho.add(id);for(const d of e.dependeDe)visitar(d);caminho.delete(id);feitas.add(id);}
 for(const e of etapas){visitar(e.id);if(['execucao','validacao','concluida'].includes(e.situacao)&&e.dependeDe.some(id=>porId.get(id).situacao!=='concluida'))falhar('Conclua as etapas anteriores primeiro.');if(e.situacao==='bloqueada'&&!e.nota)falhar('Registre o motivo do bloqueio.');}
 if(c.situacao==='concluida'&&(!etapas.length||etapas.some(e=>e.situacao!=='concluida')))falhar('Conclua e valide todas as etapas antes de encerrar.');
 const item={id:c.id,tipo:c.tipo,titulo:txt(c.titulo,180,'o título',true),setor:c.setor,prioridade:c.prioridade,situacao:c.situacao,prazo:data(c.prazo,'prazo geral'),objetivo:txt(c.objetivo||'',10000,'o objetivo',true),analise:txt(c.analise||'',20000,'a análise'),solucao:txt(c.solucao||'',20000,'a solução'),empresa:txt(c.empresa||'',180,'a consultoria',c.tipo==='consultoria'),especialidade:txt(c.especialidade||'',180,'a especialidade'),responsavelRhId:c.responsavelRhId,envolvidos,etapas,criadoPor:antes?.criadoPor||s.sub,criadoPorNome:antes?.criadoPorNome||s.nome||s.sub,criadoEm:antes?.criadoEm||agora,anexos:antes?.anexos||[],registros:antes?.registros||[],historico:antes?.historico||[],convites:antes?.convites||[]};
 if(JSON.stringify(item).length>600000)falhar('Ficha muito extensa. Arquive este processo e abra outro.');return item;
}
export function carimbarProcesso(r,s,acao,agora=new Date().toISOString()){
 if((r.historico||[]).length>=2000)falhar('Limite de histórico atingido.');
 return {...r,versao:crypto.randomUUID(),atualizadoEm:agora,historico:[...(r.historico||[]),{id:crypto.randomUUID(),em:agora,por:s.sub,nome:s.nome||s.sub,acao}]};
}
export function registrarProcesso(r,b,s){
 if((r.registros||[]).length>=500)falhar('Limite de registros atingido.');
 return {...r,registros:[...(r.registros||[]),{id:crypto.randomUUID(),texto:txt(b.texto,5000,'o registro',true),em:new Date().toISOString(),por:s.sub,nome:s.nome||s.sub,compartilhado:s.externo===true||b.compartilhado===true}]};
}
export function atualizarEtapa(r,b,s){
 if(['cancelada','concluida'].includes(r.situacao))falhar('Reabra o processo antes de alterar etapas.');
 const e=r.etapas.find(x=>x.id===b.etapaId);if(!e)falhar('Etapa não encontrada.',404);
 if(!s.externo&&!podeGerir(r,s)&&(!s.rhId||s.rhId!==e.responsavelRhId))falhar('Somente o responsável pode atualizar esta etapa.',403);
 if(!Object.hasOwn(ESTADOS_ETAPA,b.situacao)||s.externo&&b.situacao==='concluida')falhar('A conclusão precisa ser validada pelo responsável interno.');
 if(e.situacao==='concluida'&&!podeGerir(r,s))falhar('Somente o gestor pode reabrir uma etapa concluída.',403);
 const nota=txt(b.nota||'',5000,'o andamento');if(b.situacao==='bloqueada'&&!nota)falhar('Informe o motivo do bloqueio.');
 if(['execucao','validacao','concluida'].includes(b.situacao)&&e.dependeDe.some(id=>r.etapas.find(x=>x.id===id)?.situacao!=='concluida'))falhar('Conclua as etapas anteriores primeiro.');
 return {...r,etapas:r.etapas.map(x=>x.id===e.id?{...x,situacao:b.situacao,nota,concluidaEm:b.situacao==='concluida'?new Date().toISOString():null}:x)};
}
export const validarConvite=(c,agora=new Date().toISOString())=>!!c&&!c.revogadoEm&&Number.isFinite(Date.parse(c.expiraEm))&&Date.parse(c.expiraEm)>Date.parse(agora);
export function projetarConvidado(r,c){
 const nome=id=>r.envolvidos.find(p=>p.rhId===id)?.nome||'Responsável';
 return {id:r.id,tipo:r.tipo,titulo:r.titulo,empresa:r.empresa,especialidade:r.especialidade,objetivo:r.objetivo,solucao:r.solucao,prazo:r.prazo,situacao:r.situacao,versao:r.versao,convidado:{id:c.id,nome:c.nome},etapas:r.etapas.map(({responsavelRhId,...e})=>({...e,responsavel:nome(responsavelRhId)})),anexos:r.anexos.filter(a=>a.compartilhado).map(({chave,por,...a})=>a),registros:r.registros.filter(x=>x.compartilhado).map(({por,...x})=>x)};
}
export function projetarInterno(r,s){const gerir=podeGerir(r,s);return {...r,convites:gerir?(r.convites||[]).map(({hash,...c})=>c):[],anexos:r.anexos.map(({chave,...a})=>a),podeGerir:gerir,meuRhId:s.rhId||''};}
export function agendaProcessos(itens,mes){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes||''))falhar('Informe um mês válido.');
 return itens.filter(r=>r.situacao!=='cancelada').flatMap(r=>[{id:'processo:'+r.id,processoId:r.id,tipoProcesso:r.tipo,titulo:r.titulo,data:r.prazo,concluido:r.situacao==='concluida'},...r.etapas.map(e=>({id:'etapa:'+r.id+':'+e.id,processoId:r.id,tipoProcesso:r.tipo,etapaId:e.id,titulo:e.titulo+' · '+r.titulo,data:e.prazo,concluido:e.situacao==='concluida'}))].filter(e=>e.data?.startsWith(mes)).map(e=>({...e,tipo:r.tipo==='consultoria'?'Consultoria':'Demanda',cor:r.tipo==='consultoria'?'#0f766e':'#7c3aed',descricao:e.concluido?'Concluída':'Prazo previsto',recorrenteAnual:false})));
}
