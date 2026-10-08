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
 const etapas=c.etapas.map(e=>{if(!e||!idValido(e.id)||!ids.has(e.responsavelRhId)||!Object.hasOwn(ESTADOS_ETAPA,e.situacao)||!Array.isArray(e.dependeDe)||e.dependeDe.length>100)falhar('Confira os responsáveis e dados das etapas.');const anterior=antes?.etapas?.find(x=>x.id===e.id);return {...(anterior?{inicioPrevisto:anterior.inicioPrevisto||'',inicioReal:anterior.inicioReal||'',fimReal:anterior.fimReal||'',progresso:anterior.progresso||0,consultorId:anterior.consultorId||null,planejadaPor:anterior.planejadaPor||'',avaliacoes:anterior.avaliacoes||[]}:{}),id:e.id,titulo:txt(e.titulo,180,'o título da etapa',true),descricao:txt(e.descricao||'',5000,'a descrição da etapa'),responsavelRhId:e.responsavelRhId,prazo:data(e.prazo,'prazo da etapa'),situacao:e.situacao,dependeDe:[...new Set(e.dependeDe)],nota:txt(e.nota||'',5000,'o andamento'),concluidaEm:e.situacao==='concluida'?(antes?.etapas?.find(x=>x.id===e.id&&x.situacao==='concluida')?.concluidaEm||agora):null};});
 if(new Set(etapas.map(e=>e.id)).size!==etapas.length)falhar('Etapas repetidas.');
 const porId=new Map(etapas.map(e=>[e.id,e])),feitas=new Set(),caminho=new Set();
 function visitar(id){if(caminho.has(id))falhar('As dependências das etapas formam um ciclo.');if(feitas.has(id))return;const e=porId.get(id);if(!e)falhar('Dependência não encontrada.');caminho.add(id);for(const d of e.dependeDe)visitar(d);caminho.delete(id);feitas.add(id);}
 for(const e of etapas){visitar(e.id);if(['execucao','validacao','concluida'].includes(e.situacao)&&e.dependeDe.some(id=>porId.get(id).situacao!=='concluida'))falhar('Conclua as etapas anteriores primeiro.');if(e.situacao==='bloqueada'&&!e.nota)falhar('Registre o motivo do bloqueio.');}
 if(c.situacao==='concluida'&&(!etapas.length||etapas.some(e=>e.situacao!=='concluida')))falhar('Conclua e valide todas as etapas antes de encerrar.');
 const item={id:c.id,tipo:c.tipo,titulo:txt(c.titulo,180,'o título',true),setor:c.setor,prioridade:c.prioridade,situacao:c.situacao,prazo:data(c.prazo,'prazo geral'),objetivo:txt(c.objetivo||'',10000,'o objetivo',true),analise:txt(c.analise||'',20000,'a análise'),solucao:txt(c.solucao||'',20000,'a solução'),empresa:txt(c.empresa||'',180,'a consultoria',c.tipo==='consultoria'),especialidade:txt(c.especialidade||'',180,'a especialidade'),responsavelRhId:c.responsavelRhId,envolvidos,etapas,criadoPor:antes?.criadoPor||s.sub,criadoPorNome:antes?.criadoPorNome||s.nome||s.sub,criadoEm:antes?.criadoEm||agora,anexos:antes?.anexos||[],registros:antes?.registros||[],historico:antes?.historico||[],convites:antes?.convites||[],consultores:antes?.consultores||[]};
 if(JSON.stringify(item).length>600000)falhar('Ficha muito extensa. Arquive este processo e abra outro.');return item;
}
export function carimbarProcesso(r,s,acao,agora=new Date().toISOString()){
 if((r.historico||[]).length>=2000)falhar('Limite de histórico atingido.');
 return {...r,versao:crypto.randomUUID(),atualizadoEm:agora,historico:[...(r.historico||[]),{id:crypto.randomUUID(),em:agora,por:s.sub,nome:s.nome||s.sub,acao}]};
}
export const IMPLANTACOES={nao_iniciada:'Não iniciada',em_implantacao:'Em implantação',implantada:'Implantada',nao_se_aplica:'Não se aplica'};
export function validarImplantacao(b={}){
 const situacao=b.situacao||'nao_iniciada';if(!Object.hasOwn(IMPLANTACOES,situacao))falhar('Confira a situação da implantação.');
 const como=txt(b.como||'',5000,'como foi implantado',situacao==='implantada');
 const dataImplantacao=data(b.data,'implantação');if(situacao==='implantada'&&!dataImplantacao)falhar('Informe a data da implantação.');
 return {situacao,como,data:dataImplantacao,resultado:txt(b.resultado||'',5000,'o resultado da implantação')};
}
export function cadastrarConsultor(r,b,s){
 if(r.tipo!=='consultoria'||!podeGerir(r,s))falhar('Somente o gestor pode cadastrar consultores.',403);
 const lista=r.consultores||[],id=b.consultorId||crypto.randomUUID();
 if(!idValido(id)||b.consultorId&&!lista.some(c=>c.id===id))falhar('Consultor não encontrado.',404);
 if(!b.consultorId&&lista.length>=50)falhar('Limite de 50 consultores atingido.');
 const c={id,nome:txt(b.nome,180,'o nome do consultor',true),funcao:txt(b.funcao||'',180,'a função do consultor'),contato:txt(b.contato||'',240,'o contato do consultor')};
 return {...r,consultores:lista.some(x=>x.id===id)?lista.map(x=>x.id===id?c:x):[...lista,c]};
}
const podeAtualizarRegistro=(r,x,s)=>podeGerir(r,s)||x.por===s.sub||!!s.externo&&!!s.consultorId&&x.consultorId===s.consultorId;
export function atualizarImplantacao(r,b,s){
 const x=r.registros.find(x=>x.id===b.registroId);if(!x||s.externo&&!x.compartilhado)falhar('Ação não encontrada.',404);
 if(x.tipo!=='acao'||!podeAtualizarRegistro(r,x,s))falhar('Você não pode atualizar a implantação desta ação.',403);
 if((x.implantacoes||[]).length>=100)falhar('Limite de atualizações desta ação atingido.');
 const implantacao=validarImplantacao(b.implantacao),marca={...implantacao,nome:s.nome||s.sub,em:new Date().toISOString()};
 return {...r,registros:r.registros.map(a=>a.id===x.id?{...a,implantacao,implantacoes:[...(a.implantacoes||[]),marca]}:a)};
}
export const TIPOS_REGISTRO={acao:'Ação realizada',atualizacao:'Andamento',decisao:'Decisão',pendencia:'Pendência'};
export function registrarProcesso(r,b,s){
 if((r.registros||[]).length>=500)falhar('Limite de registros atingido.');
 const tipo=b.tipo||'atualizacao';if(!Object.hasOwn(TIPOS_REGISTRO,tipo))falhar('Escolha o tipo de registro.');
 const etapaId=b.etapaId||'';if(etapaId&&!r.etapas.some(e=>e.id===etapaId))falhar('Etapa não encontrada.');
 const detalhes={tipo,...(tipo==='acao'?{implantacao:validarImplantacao(b.implantacao)}:{}),titulo:txt(b.titulo||'',180,'o título da ação',tipo==='acao'),dataAcao:data(b.dataAcao,'ação'),resultado:txt(b.resultado||'',5000,'o resultado'),proximoPasso:txt(b.proximoPasso||'',2000,'o próximo passo'),etapaId};
 if(tipo==='acao'&&!detalhes.dataAcao)falhar('Informe a data da ação realizada.');
 return {...r,registros:[...(r.registros||[]),{id:crypto.randomUUID(),...detalhes,...(tipo==='acao'?{implantacoes:[{...detalhes.implantacao,nome:s.nome||s.sub,em:new Date().toISOString()}]}:{}),consultorId:s.externo?s.consultorId||null:null,texto:txt(b.texto,5000,'o registro',true),em:new Date().toISOString(),por:s.sub,nome:s.nome||s.sub,compartilhado:s.externo===true||b.compartilhado===true}]};
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
export function planejarEtapa(r,b,s){
 if(['cancelada','concluida'].includes(r.situacao))falhar('Reabra o processo antes de planejar etapas.');
 const anterior=b.etapaId?r.etapas.find(e=>e.id===b.etapaId):null;
 if(b.etapaId&&!anterior)falhar('Etapa não encontrada.',404);
 if(!s.externo&&!podeGerir(r,s)){if(!anterior||!s.rhId||anterior.responsavelRhId!==s.rhId)falhar('Somente o responsável pode atualizar esta etapa.',403);b={...b,titulo:anterior.titulo,descricao:anterior.descricao,prazo:anterior.prazo,inicioPrevisto:anterior.inicioPrevisto||'',dependeDe:anterior.dependeDe};}
 if(anterior?.situacao==='concluida'&&!podeGerir(r,s))falhar('Uma etapa validada só pode ser reaberta pela equipe interna.',403);
 if(!anterior&&r.etapas.length>=100)falhar('Limite de 100 etapas atingido.');
 const situacao=b.situacao||'pendente';if(!Object.hasOwn(ESTADOS_ETAPA,situacao)||s.externo&&situacao==='concluida')falhar('Marque como pronta para conferência. A conclusão é validada pela equipe interna.');
 const inicioPrevisto=data(b.inicioPrevisto,'início previsto'),prazo=data(b.prazo,'prazo previsto'),inicioReal=data(b.inicioReal,'início real'),fimReal=data(b.fimReal,'término real');
 if(!prazo)falhar('Informe o prazo previsto da etapa.');
 if(inicioPrevisto&&inicioPrevisto>prazo||fimReal&&(!inicioReal||fimReal<inicioReal))falhar('O término não pode ser anterior ao início.');
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 if(inicioReal>hoje||fimReal>hoje)falhar('Datas reais não podem estar no futuro. Use as datas previstas.');
 if(['execucao','validacao','concluida'].includes(situacao)&&!inicioReal)falhar('Informe quando a etapa começou.');
 if(['validacao','concluida'].includes(situacao)&&!fimReal)falhar('Informe quando a etapa ficou pronta.');
 if(fimReal&&!['validacao','concluida'].includes(situacao))falhar('Uma etapa com término real deve estar pronta para conferência ou concluída.');
 if(situacao==='pendente'&&inicioReal)falhar('Se a etapa já começou, use Em execução ou Bloqueada.');
 const valor=b.progresso??0;if(typeof valor!=='number'||!Number.isFinite(valor)||valor<0||valor>100)falhar('Informe um progresso entre 0 e 100.');
 if(valor===100&&!['validacao','concluida'].includes(situacao))falhar('Para 100%, registre o término e marque pronta para conferência.');
 if(situacao==='pendente'&&valor!==0)falhar('Etapa pendente deve ter progresso zero.');
 const progresso=['validacao','concluida'].includes(situacao)?100:valor;
 const id=anterior?.id||crypto.randomUUID(),deps=b.dependeDe||[];
 if(!Array.isArray(deps)||deps.length>100||deps.some(x=>x===id||!r.etapas.some(e=>e.id===x)))falhar('Confira as dependências da etapa.');
 const e={avaliacoes:anterior?.avaliacoes||[],id,titulo:txt(b.titulo,180,'o título da etapa',true),descricao:txt(b.descricao||'',5000,'a descrição da etapa'),responsavelRhId:anterior?.responsavelRhId||r.responsavelRhId,inicioPrevisto,prazo,inicioReal,fimReal,progresso,situacao,dependeDe:[...new Set(deps)],nota:txt(b.nota||'',5000,'o andamento'),consultorId:anterior?.consultorId||s.consultorId||null,planejadaPor:anterior?.planejadaPor||s.nome||s.sub,concluidaEm:situacao==='concluida'?(anterior?.concluidaEm||new Date().toISOString()):null};
 if(situacao==='bloqueada'&&!e.nota)falhar('Informe o motivo do bloqueio.');
 const etapas=anterior?r.etapas.map(x=>x.id===id?e:x):[...r.etapas,e],porId=new Map(etapas.map(x=>[x.id,x])),visitadas=new Set(),caminho=new Set();
 function visitar(id){if(caminho.has(id))falhar('As dependências formam um ciclo.');if(visitadas.has(id))return;caminho.add(id);for(const d of porId.get(id).dependeDe)visitar(d);caminho.delete(id);visitadas.add(id);}
 for(const x of etapas){visitar(x.id);if(['execucao','validacao','concluida'].includes(x.situacao)&&x.dependeDe.some(d=>porId.get(d)?.situacao!=='concluida'))falhar('Conclua as etapas anteriores primeiro.');}
 return {...r,etapas};
}
export function avaliarEtapa(r,b,s){
 if(!podeGerir(r,s))falhar('Somente o gestor interno pode avaliar a qualidade.',403);
 const etapa=r.etapas.find(e=>e.id===b.etapaId);if(!etapa)falhar('Etapa não encontrada.',404);
 if(typeof b.pontuacao!=='number'||!Number.isFinite(b.pontuacao)||b.pontuacao<0||b.pontuacao>10)falhar('Informe uma nota de 0 a 10.');
 if((etapa.avaliacoes||[]).length>=100)falhar('Limite de avaliações atingido.');
 const avaliacao={pontuacao:Math.round(b.pontuacao*10)/10,comentario:txt(b.comentario,3000,'o comentário da avaliação',true),nome:s.nome||s.sub,em:new Date().toISOString()};
 return {...r,etapas:r.etapas.map(e=>e.id===etapa.id?{...e,avaliacoes:[...(e.avaliacoes||[]),avaliacao]}:e)};
}
export const validarConvite=(c,agora=new Date().toISOString())=>!!c&&!c.revogadoEm&&Number.isFinite(Date.parse(c.expiraEm))&&Date.parse(c.expiraEm)>Date.parse(agora);
export function projetarConvidado(r,c){
 const nome=id=>r.envolvidos.find(p=>p.rhId===id)?.nome||'Responsável';
 return {id:r.id,tipo:r.tipo,titulo:r.titulo,empresa:r.empresa,especialidade:r.especialidade,objetivo:r.objetivo,solucao:r.solucao,prazo:r.prazo,situacao:r.situacao,versao:r.versao,convidado:{id:c.id,nome:c.nome},etapas:r.etapas.map(({responsavelRhId,consultorId,...e})=>({...e,responsavel:nome(responsavelRhId)})),anexos:r.anexos.filter(a=>a.compartilhado).map(({chave,por,...a})=>a),registros:r.registros.filter(x=>x.compartilhado).map(({por,consultorId,...x})=>({...x,podeAtualizar:por==='convite:'+c.id||!!c.consultorId&&consultorId===c.consultorId}))};
}
export function projetarInterno(r,s){const gerir=podeGerir(r,s);return {...r,registros:r.registros.map(x=>({...x,podeAtualizar:podeAtualizarRegistro(r,x,s)})),consultores:gerir?(r.consultores||[]):(r.consultores||[]).map(({contato,...c})=>c),convites:gerir?(r.convites||[]).map(({hash,...c})=>c):[],anexos:r.anexos.map(({chave,...a})=>a),podeGerir:gerir,meuRhId:s.rhId||''};}
export function agendaProcessos(itens,mes){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes||''))falhar('Informe um mês válido.');
 return itens.filter(r=>r.situacao!=='cancelada').flatMap(r=>[{id:'processo:'+r.id,processoId:r.id,tipoProcesso:r.tipo,titulo:r.titulo,data:r.prazo,concluido:r.situacao==='concluida'},...r.etapas.map(e=>({id:'etapa:'+r.id+':'+e.id,processoId:r.id,tipoProcesso:r.tipo,etapaId:e.id,titulo:e.titulo+' · '+r.titulo,data:e.prazo,concluido:e.situacao==='concluida'}))].filter(e=>e.data?.startsWith(mes)).map(e=>({...e,tipo:r.tipo==='consultoria'?'Consultoria':'Demanda',cor:r.tipo==='consultoria'?'#0f766e':'#7c3aed',descricao:e.concluido?'Concluída':'Prazo previsto',recorrenteAnual:false})));
}
