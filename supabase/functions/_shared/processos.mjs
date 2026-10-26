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
export const NIVEIS_CONSULTORIA={administrador:'Administrador da consultoria',colaborador:'Colaborador',leitura:'Somente leitura'};
export const nivelConsultoria=c=>c?.nivel??'colaborador';
export const podeAdministrarConsultoria=(r,s)=>podeGerir(r,s)||r?.tipo==='consultoria'&&s?.externo===true&&s.nivel==='administrador';
export const podeContribuirConsultoria=s=>!s?.externo||['administrador','colaborador'].includes(nivelConsultoria(s));
export function permiteAcaoConsultoria(c,acao){
 const nivel=nivelConsultoria(c);if(!Object.hasOwn(NIVEIS_CONSULTORIA,nivel))return false;
 return ['obter','arquivo'].includes(acao)||nivel!=='leitura'&&['registro','anexar','etapa','implantacao','planejarEtapa'].includes(acao)||nivel==='administrador'&&['consultor','convidar','revogar','renovarConvite','substituirConvite','trabalho'].includes(acao);
}
export function editarTrabalho(r,b,s){
 if(!podeAdministrarConsultoria(r,s))falhar('Somente a gestão pode organizar o trabalho.',403);
 return {...r,titulo:txt(b.titulo,180,'o título do trabalho',true),objetivo:txt(b.objetivo,10000,'o objetivo',true),especialidade:txt(b.especialidade||'',180,'a especialidade'),solucao:txt(b.solucao||'',20000,'o plano de trabalho'),prazo:data(b.prazo,'prazo geral')};
}
export function dadosConvite(r,b,s,agora=new Date().toISOString()){
 if(!podeAdministrarConsultoria(r,s)||r.tipo!=='consultoria'||r.situacao==='cancelada')falhar('Você não pode criar acessos nesta consultoria.',403);
 const nivel=b.nivel??'colaborador';if(!Object.hasOwn(NIVEIS_CONSULTORIA,nivel))falhar('Escolha um nível de acesso válido.');
 if(s.externo&&(nivel==='administrador'||b.rhId||!b.consultorId))falhar('O administrador da consultoria só pode convidar colaboradores ou leitores cadastrados aqui.',403);
 const consultor=b.consultorId?(r.consultores||[]).find(c=>c.id===b.consultorId):null,rh=b.rhId?r.envolvidos.find(p=>p.rhId===b.rhId):null;
 if(b.consultorId&&!consultor||b.rhId&&!rh||b.consultorId&&b.rhId)falhar('Escolha uma pessoa desta consultoria.');
 if(nivel==='administrador'&&!consultor)falhar('Cadastre o consultor antes de conceder administração.');
 const dias=Number(b.dias);if(!Number.isInteger(dias)||dias<1||dias>30)falhar('Escolha de 1 a 30 dias.');
 const pai=s.externo?r.convites.find(c=>c.id===s.conviteId):null;
 if(s.externo&&(!validarAcessoConvite(r,pai,agora)||nivelConsultoria(pai)!=='administrador'))falhar('O acesso do administrador foi encerrado.',403);
 const limite=Date.parse(agora)+dias*86400000,expiraEm=new Date(pai?Math.min(limite,Date.parse(pai.expiraEm)):limite).toISOString();
 return {nome:txt(consultor?.nome||rh?.nome||b.nome,180,'o nome do convidado',true),consultorId:consultor?.id||null,rhId:rh?.rhId||null,nivel,paiId:pai?.id||null,expiraEm};
}
function conviteParaGerir(r,b,s){
 const c=r.convites.find(x=>x.id===b.conviteId);if(!c)falhar('Convite não encontrado.',404);
 if(!podeGerir(r,s)&&!(podeAdministrarConsultoria(r,s)&&c.paiId===s.conviteId))falhar('Você só pode administrar acessos que emitiu.',403);
 return c;
}
export function renovarConvite(r,b,s,agora=new Date().toISOString()){
 const c=conviteParaGerir(r,b,s),estado=statusConvite(r,c,agora);
 if(!['ativo','expirado'].includes(estado))falhar(estado==='administrador_encerrado'?'Renove primeiro o acesso do administrador que emitiu este convite.':'Este acesso não pode ser renovado. Convites revogados precisam de uma nova concessão.');
 const dias=Number(b.dias);if(!Number.isInteger(dias)||dias<1||dias>30)falhar('Escolha de 1 a 30 dias.');
 const pai=c.paiId?r.convites.find(x=>x.id===c.paiId):null;
 const expiraEm=new Date(pai?Math.min(Date.parse(agora)+dias*86400000,Date.parse(pai.expiraEm)):Date.parse(agora)+dias*86400000).toISOString();
 // Prorrogar o administrador não reativa nem prorroga a equipe. O teto antigo
 // também corrige convites legados que ultrapassavam a validade do emissor.
 const limiteFilhos=Math.min(Date.parse(c.expiraEm),Date.parse(expiraEm));
 return {...r,convites:r.convites.map(x=>x.id===c.id?{...x,expiraEm,renovadoEm:agora}:nivelConsultoria(c)==='administrador'&&x.paiId===c.id&&!x.revogadoEm&&Date.parse(x.expiraEm)>limiteFilhos?{...x,expiraEm:new Date(limiteFilhos).toISOString()}:x)};
}
export function substituirConvite(r,b,s,novoHash,agora=new Date().toISOString()){
 const c=conviteParaGerir(r,b,s);
 if(statusConvite(r,c,agora)!=='ativo')falhar('Renove um acesso expirado antes de substituir o link. Acessos encerrados não podem receber outro link.');
 if(typeof novoHash!=='string'||!/^[a-f0-9]{64}$/.test(novoHash)||novoHash===c.hash)falhar('Não foi possível gerar outro link. Tente novamente.');
 return {...r,convites:r.convites.map(x=>x.id===c.id?{...x,hash:novoHash,substituidoEm:agora}:x)};
}
export function revogarAcesso(r,b,s,agora=new Date().toISOString()){
 const c=conviteParaGerir(r,b,s),alvos=x=>x.id===c.id||x.paiId===c.id;
 if(!r.convites.some(x=>alvos(x)&&!x.revogadoEm))return r;
 return {...r,convites:r.convites.map(x=>alvos(x)?{...x,revogadoEm:x.revogadoEm||agora}:x)};
}
export function revogarConvite(r,b,s,agora=new Date().toISOString()){
 const novo=revogarAcesso(r,b,s,agora);if(novo===r)return r;
 // Encerrar credenciais deve continuar possível no limite do histórico.
 // Cada convite só transita para revogado uma vez; repetições não acrescentam eventos.
 return {...novo,versao:crypto.randomUUID(),atualizadoEm:agora,historico:[...(r.historico||[]),{id:crypto.randomUUID(),em:agora,por:s.sub,nome:s.nome||s.sub,acao:'Revogou convite',conviteId:b.conviteId}]};
}
export const etapaTemAtividade=(r,e)=>!!e&&(e.atividadeRegistrada===true||(e.avaliacoes||[]).length>0||(r?.registros||[]).some(x=>x.etapaId===e.id)||e.situacao!=='pendente'||!!e.inicioReal||!!e.fimReal||!!e.concluidaEm||Number(e.progresso)>0||!!e.nota?.trim());
const CAMPOS_TEMPO_ETAPA=['inicioPrevisto','prazo','inicioReal','fimReal','progresso'];
const valorEtapa=(e,k)=>k==='progresso'?(e?.progresso??(['validacao','concluida'].includes(e?.situacao)?100:0)):(e?.[k]||'');
function andamentoEtapa(e,anterior,agora=new Date().toISOString(),forcar=false){
 // Etapas anteriores sem datas continuam históricas: editar a descrição não inventa uma execução.
 const igual=anterior&&e.situacao===anterior.situacao&&CAMPOS_TEMPO_ETAPA.every(k=>valorEtapa(e,k)===valorEtapa(anterior,k));
 if(igual&&!forcar){const mantida={...e};for(const k of CAMPOS_TEMPO_ETAPA){if(Object.hasOwn(anterior,k))mantida[k]=anterior[k];else delete mantida[k];}if(e.nota!==anterior.nota&&(etapaTemAtividade(null,e)||etapaTemAtividade(null,anterior)))mantida.atividadeRegistrada=true;return mantida;}
 const inicioPrevisto=data(e.inicioPrevisto,'início previsto'),prazo=data(e.prazo,'prazo previsto'),inicioReal=data(e.inicioReal,'início real'),fimReal=data(e.fimReal,'término real');
 if(inicioPrevisto&&prazo&&inicioPrevisto>prazo||fimReal&&(!inicioReal||fimReal<inicioReal))falhar('O término não pode ser anterior ao início.');
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(agora));
 if(inicioReal>hoje||fimReal>hoje)falhar('Datas reais não podem estar no futuro. Use as datas previstas.');
 if(['execucao','validacao','concluida'].includes(e.situacao)&&!inicioReal)falhar('Informe quando a etapa começou.');
 if(['validacao','concluida'].includes(e.situacao)&&!fimReal)falhar('Informe quando a etapa ficou pronta.');
 if(fimReal&&!['validacao','concluida'].includes(e.situacao))falhar('Uma etapa com término real deve estar pronta para conferência ou concluída.');
 if(e.situacao==='pendente'&&inicioReal)falhar('Se a etapa já começou, use Em execução ou Bloqueada.');
 const valor=e.progresso??0;if(typeof valor!=='number'||!Number.isFinite(valor)||valor<0||valor>100)falhar('Informe um progresso entre 0 e 100.');
 if(valor>0&&!inicioReal)falhar('Informe quando a etapa começou antes de registrar progresso.');
 if(valor===100&&!['validacao','concluida'].includes(e.situacao))falhar('Para 100%, registre o término e marque pronta para conferência.');
 if(e.situacao==='pendente'&&valor!==0)falhar('Etapa pendente deve ter progresso zero.');
 return {...e,inicioPrevisto,prazo,inicioReal,fimReal,progresso:['validacao','concluida'].includes(e.situacao)?100:valor,...(etapaTemAtividade(null,e)||etapaTemAtividade(null,anterior)?{atividadeRegistrada:true}:{})};
}
function validarDependenciasEtapas(etapas){
 const porId=new Map(etapas.map(e=>[e.id,e])),feitas=new Set(),caminho=new Set();
 function visitar(id){if(caminho.has(id))falhar('As dependências das etapas formam um ciclo.');if(feitas.has(id))return;const e=porId.get(id);if(!e)falhar('Dependência não encontrada.');caminho.add(id);for(const d of e.dependeDe)visitar(d);caminho.delete(id);feitas.add(id);}
 for(const e of etapas){visitar(e.id);if(['execucao','validacao','concluida'].includes(e.situacao)&&e.dependeDe.some(id=>porId.get(id).situacao!=='concluida'))falhar('Conclua as etapas anteriores primeiro.');if(e.situacao==='bloqueada'&&!e.nota)falhar('Registre o motivo do bloqueio.');}
}
export function prepararProcesso(c,antes,s,pessoasRH=[],agora=new Date().toISOString()){
 if(!c||!idValido(c.id)||!['demanda','consultoria'].includes(c.tipo))falhar('Identificação do processo inválida.');
 if(antes&&(!podeGerir(antes,s)||antes.tipo!==c.tipo))falhar('Você não pode alterar esta ficha.',403);
 if((c.versaoAnterior??null)!==(antes?.versao??null))falhar('A ficha mudou. Reabra antes de salvar.',409);
 if(!Object.hasOwn(SITUACOES,c.situacao)||!Object.hasOwn(SETORES,c.setor)||!Object.hasOwn(PRIORIDADES,c.prioridade))falhar('Confira situação, setor e prioridade.');
 if(!Array.isArray(c.envolvidos)||!c.envolvidos.length||c.envolvidos.length>150)falhar('Selecione de 1 a 150 pessoas do RH.');
 const envolvidos=c.envolvidos.map(p=>{if(!idValido(p?.rhId))falhar('Pessoa sem ID do RH.');const rh=pessoasRH.find(x=>x.id===p.rhId)||antes?.envolvidos?.find(x=>x.rhId===p.rhId);if(!rh)falhar('Pessoa não disponível no RH. Atualize a lista.');return {rhId:p.rhId,nome:rh.nome,area:rh.area||'',cargo:rh.cargo||''};});
 const ids=new Set(envolvidos.map(p=>p.rhId));if(ids.size!==envolvidos.length)falhar('Pessoa repetida na lista.');if(!ids.has(c.responsavelRhId))falhar('Selecione o responsável entre os envolvidos.');
 if(!Array.isArray(c.etapas)||c.etapas.length>100)falhar('Informe até 100 etapas.');
 if(antes?.etapas?.some(e=>!c.etapas.some(x=>x?.id===e.id)&&etapaTemAtividade(antes,e)))falhar('Etapas com atividade, registros ou avaliações não podem ser retiradas. Preserve a etapa e seu histórico.');
 const etapas=c.etapas.map(e=>{
  if(!e||!idValido(e.id)||!ids.has(e.responsavelRhId)||!Object.hasOwn(ESTADOS_ETAPA,e.situacao)||!Array.isArray(e.dependeDe)||e.dependeDe.length>100)falhar('Confira os responsáveis e dados das etapas.');
  const anterior=antes?.etapas?.find(x=>x.id===e.id),tempos=Object.fromEntries(CAMPOS_TEMPO_ETAPA.filter(k=>Object.hasOwn(e,k)).map(k=>[k,e[k]]));
  const proxima={...anterior,...tempos,id:e.id,titulo:txt(e.titulo,180,'o título da etapa',true),descricao:txt(e.descricao||'',5000,'a descrição da etapa'),responsavelRhId:e.responsavelRhId,prazo:data(e.prazo,'prazo da etapa'),situacao:e.situacao,dependeDe:[...new Set(e.dependeDe)],nota:txt(e.nota||'',5000,'o andamento'),concluidaEm:e.situacao==='concluida'?(anterior?.situacao==='concluida'?anterior.concluidaEm:agora):null};
  return andamentoEtapa(proxima,anterior,agora,c.situacao==='concluida'&&antes?.situacao!=='concluida');
 });
 if(new Set(etapas.map(e=>e.id)).size!==etapas.length)falhar('Etapas repetidas.');
 validarDependenciasEtapas(etapas);
 if(c.situacao==='concluida'&&(!etapas.length||etapas.some(e=>e.situacao!=='concluida')))falhar('Conclua e valide todas as etapas antes de encerrar.');
 const item={id:c.id,tipo:c.tipo,titulo:txt(c.titulo,180,'o título',true),setor:c.setor,prioridade:c.prioridade,situacao:c.situacao,prazo:data(c.prazo,'prazo geral'),objetivo:txt(c.objetivo||'',10000,'o objetivo',true),analise:txt(c.analise||'',20000,'a análise'),solucao:txt(c.solucao||'',20000,'a solução'),empresa:txt(c.empresa||'',180,'a consultoria',c.tipo==='consultoria'),especialidade:txt(c.especialidade||'',180,'a especialidade'),responsavelRhId:c.responsavelRhId,envolvidos,etapas,criadoPor:antes?.criadoPor||s.sub,criadoPorNome:antes?.criadoPorNome||s.nome||s.sub,criadoEm:antes?.criadoEm||agora,anexos:antes?.anexos||[],registros:antes?.registros||[],historico:antes?.historico||[],convites:antes?.convites||[],consultores:antes?.consultores||[]};
 // Vínculo estabelecido apenas pela conversão atômica da reunião; o cliente
 // não pode criá-lo, trocá-lo ou apagá-lo ao editar a demanda depois.
 for(const campo of ['origemReuniaoId','origemDecisaoId'])if(antes&&Object.hasOwn(antes,campo))item[campo]=antes[campo];
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
 if(r.tipo!=='consultoria'||!podeAdministrarConsultoria(r,s))falhar('Somente o gestor pode cadastrar consultores.',403);
 const lista=r.consultores||[],id=b.consultorId||crypto.randomUUID();
 if(!idValido(id)||b.consultorId&&!lista.some(c=>c.id===id))falhar('Consultor não encontrado.',404);
 if(!b.consultorId&&lista.length>=50)falhar('Limite de 50 consultores atingido.');
 const c={id,nome:txt(b.nome,180,'o nome do consultor',true),funcao:txt(b.funcao||'',180,'a função do consultor'),contato:txt(b.contato||'',240,'o contato do consultor')};
 return {...r,consultores:lista.some(x=>x.id===id)?lista.map(x=>x.id===id?c:x):[...lista,c]};
}
const podeAtualizarRegistro=(r,x,s)=>podeGerir(r,s)||x.por===s.sub||!!s.externo&&!!s.consultorId&&x.consultorId===s.consultorId;
export function atualizarImplantacao(r,b,s){
 if(!podeContribuirConsultoria(s))falhar('Este acesso é somente de leitura.',403);
 const x=r.registros.find(x=>x.id===b.registroId);if(!x||s.externo&&!x.compartilhado)falhar('Ação não encontrada.',404);
 if(x.tipo!=='acao'||!podeAtualizarRegistro(r,x,s))falhar('Você não pode atualizar a implantação desta ação.',403);
 if((x.implantacoes||[]).length>=100)falhar('Limite de atualizações desta ação atingido.');
 const implantacao=validarImplantacao(b.implantacao),marca={...implantacao,nome:s.nome||s.sub,em:new Date().toISOString()};
 return {...r,registros:r.registros.map(a=>a.id===x.id?{...a,implantacao,implantacoes:[...(a.implantacoes||[]),marca]}:a)};
}
export const TIPOS_REGISTRO={acao:'Ação realizada',atualizacao:'Andamento',decisao:'Decisão',pendencia:'Pendência'};
export function registrarProcesso(r,b,s){
 if(!podeContribuirConsultoria(s))falhar('Este acesso é somente de leitura.',403);
 if((r.registros||[]).length>=500)falhar('Limite de registros atingido.');
 const tipo=b.tipo||'atualizacao';if(!Object.hasOwn(TIPOS_REGISTRO,tipo))falhar('Escolha o tipo de registro.');
 const etapaId=b.etapaId||'';if(etapaId&&!r.etapas.some(e=>e.id===etapaId))falhar('Etapa não encontrada.');
 const detalhes={tipo,...(tipo==='acao'?{implantacao:validarImplantacao(b.implantacao)}:{}),titulo:txt(b.titulo||'',180,'o título da ação',tipo==='acao'),dataAcao:data(b.dataAcao,'ação'),resultado:txt(b.resultado||'',5000,'o resultado'),proximoPasso:txt(b.proximoPasso||'',2000,'o próximo passo'),etapaId};
 if(tipo==='acao'&&!detalhes.dataAcao)falhar('Informe a data da ação realizada.');
 return {...r,registros:[...(r.registros||[]),{id:crypto.randomUUID(),...detalhes,...(tipo==='acao'?{implantacoes:[{...detalhes.implantacao,nome:s.nome||s.sub,em:new Date().toISOString()}]}:{}),consultorId:s.externo?s.consultorId||null:null,texto:txt(b.texto,5000,'o registro',true),em:new Date().toISOString(),por:s.sub,nome:s.nome||s.sub,compartilhado:s.externo===true||b.compartilhado===true}]};
}
export function atualizarEtapa(r,b,s){
 if(!podeContribuirConsultoria(s))falhar('Este acesso é somente de leitura.',403);
 if(['cancelada','concluida'].includes(r.situacao))falhar('Reabra o processo antes de alterar etapas.');
 const e=r.etapas.find(x=>x.id===b.etapaId);if(!e)falhar('Etapa não encontrada.',404);
 if(!s.externo&&!podeGerir(r,s)&&(!s.rhId||s.rhId!==e.responsavelRhId))falhar('Somente o responsável pode atualizar esta etapa.',403);
 if(!Object.hasOwn(ESTADOS_ETAPA,b.situacao)||s.externo&&b.situacao==='concluida')falhar('A conclusão precisa ser validada pelo responsável interno.');
 if(e.situacao==='concluida'&&!podeGerir(r,s))falhar('Somente o gestor pode reabrir uma etapa concluída.',403);
 const nota=txt(b.nota||'',5000,'o andamento');if(b.situacao==='bloqueada'&&!nota)falhar('Informe o motivo do bloqueio.');
 const tempos=Object.fromEntries(['inicioReal','fimReal','progresso'].filter(k=>Object.hasOwn(b,k)).map(k=>[k,b[k]]));
 const proxima=andamentoEtapa({...e,...tempos,situacao:b.situacao,nota,concluidaEm:b.situacao==='concluida'?(e.situacao==='concluida'?e.concluidaEm:new Date().toISOString()):null},e);
 const etapas=r.etapas.map(x=>x.id===e.id?proxima:x);validarDependenciasEtapas(etapas);
 return {...r,etapas};
}
export function planejarEtapa(r,b,s){
 if(!podeContribuirConsultoria(s))falhar('Este acesso é somente de leitura.',403);
 if(['cancelada','concluida'].includes(r.situacao))falhar('Reabra o processo antes de planejar etapas.');
 const anterior=b.etapaId?r.etapas.find(e=>e.id===b.etapaId):null;
 if(b.etapaId&&!anterior)falhar('Etapa não encontrada.',404);
 if(!s.externo&&!podeGerir(r,s)){if(!anterior||!s.rhId||anterior.responsavelRhId!==s.rhId)falhar('Somente o responsável pode atualizar esta etapa.',403);b={...b,titulo:anterior.titulo,descricao:anterior.descricao,prazo:anterior.prazo,inicioPrevisto:anterior.inicioPrevisto||'',dependeDe:anterior.dependeDe};}
 if(anterior?.situacao==='concluida'&&!podeGerir(r,s))falhar('Uma etapa validada só pode ser reaberta pela equipe interna.',403);
 if(!anterior&&r.etapas.length>=100)falhar('Limite de 100 etapas atingido.');
 const situacao=b.situacao||'pendente';if(!Object.hasOwn(ESTADOS_ETAPA,situacao)||s.externo&&situacao==='concluida')falhar('Marque como pronta para conferência. A conclusão é validada pela equipe interna.');
 const prazo=data(b.prazo,'prazo previsto');
 if(!prazo&&(!anterior||anterior.prazo))falhar('Informe o prazo previsto da etapa.');
 const id=anterior?.id||crypto.randomUUID(),deps=b.dependeDe||[];
 if(!Array.isArray(deps)||deps.length>100||deps.some(x=>x===id||!r.etapas.some(e=>e.id===x)))falhar('Confira as dependências da etapa.');
 const tempos=Object.fromEntries(CAMPOS_TEMPO_ETAPA.filter(k=>Object.hasOwn(b,k)).map(k=>[k,b[k]]));
 const e=andamentoEtapa({...anterior,...tempos,avaliacoes:anterior?.avaliacoes||[],id,titulo:txt(b.titulo,180,'o título da etapa',true),descricao:txt(b.descricao||'',5000,'a descrição da etapa'),responsavelRhId:anterior?.responsavelRhId||r.responsavelRhId,prazo,situacao,dependeDe:[...new Set(deps)],nota:txt(b.nota||'',5000,'o andamento'),consultorId:anterior?.consultorId||s.consultorId||null,planejadaPor:anterior?.planejadaPor||s.nome||s.sub,concluidaEm:situacao==='concluida'?(anterior?.situacao==='concluida'?anterior.concluidaEm:new Date().toISOString()):null},anterior);
 const etapas=anterior?r.etapas.map(x=>x.id===id?e:x):[...r.etapas,e];validarDependenciasEtapas(etapas);
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
export function validarAcessoConvite(r,c,agora=new Date().toISOString()){
 if(!validarConvite(c,agora)||!Object.hasOwn(NIVEIS_CONSULTORIA,nivelConsultoria(c)))return false;
 if(!c.paiId)return true;
 const pai=r?.convites?.find(x=>x.id===c.paiId);
 return !!pai&&!pai.paiId&&nivelConsultoria(pai)==='administrador'&&validarConvite(pai,agora);
}
export function statusConvite(r,c,agora=new Date().toISOString()){
 if(!c||!Object.hasOwn(NIVEIS_CONSULTORIA,nivelConsultoria(c))||!Number.isFinite(Date.parse(c.expiraEm)))return 'invalido';
 if(c.revogadoEm)return 'revogado';
 if(r?.situacao==='cancelada')return 'consultoria_cancelada';
 if(c.paiId){const pai=r?.convites?.find(x=>x.id===c.paiId);if(!pai||pai.paiId||nivelConsultoria(pai)!=='administrador'||!validarConvite(pai,agora))return 'administrador_encerrado';}
 return validarConvite(c,agora)?'ativo':'expirado';
}
function projetarAcesso(r,c,agora){
 const {hash,...publico}=c;
 return {...publico,estadoAcesso:statusConvite(r,c,agora),limiteExpiraEm:c.paiId?r.convites.find(x=>x.id===c.paiId)?.expiraEm||null:null};
}
export function projetarConvidado(r,c){
 const nome=id=>r.envolvidos.find(p=>p.rhId===id)?.nome||'Responsável',admin=nivelConsultoria(c)==='administrador',contribui=nivelConsultoria(c)!=='leitura',agora=new Date().toISOString();
 return {id:r.id,tipo:r.tipo,titulo:r.titulo,empresa:r.empresa,especialidade:r.especialidade,objetivo:r.objetivo,solucao:r.solucao,prazo:r.prazo,situacao:r.situacao,versao:r.versao,convidado:{id:c.id,nome:c.nome,nivel:nivelConsultoria(c),expiraEm:c.expiraEm},podeAdministrarConsultoria:admin,podeContribuir:contribui,...(admin?{consultores:r.consultores||[],convites:r.convites.filter(x=>x.paiId===c.id).map(x=>{const {criadoPor,rhId,...publico}=projetarAcesso(r,x,agora);return publico;})}:{}),etapas:r.etapas.map(({responsavelRhId,consultorId,...e})=>({...e,responsavel:nome(responsavelRhId)})),anexos:r.anexos.filter(a=>a.compartilhado).map(({chave,por,...a})=>a),registros:r.registros.filter(x=>x.compartilhado).map(({por,consultorId,...x})=>({...x,podeAtualizar:contribui&&(por==='convite:'+c.id||!!c.consultorId&&consultorId===c.consultorId)}))};
}
export function projetarInterno(r,s){const gerir=podeGerir(r,s),agora=new Date().toISOString();return {...r,registros:r.registros.map(x=>({...x,podeAtualizar:podeAtualizarRegistro(r,x,s)})),consultores:gerir?(r.consultores||[]):(r.consultores||[]).map(({contato,...c})=>c),convites:gerir?(r.convites||[]).map(c=>projetarAcesso(r,c,agora)):[],anexos:r.anexos.map(({chave,...a})=>a),podeGerir:gerir,podeAdministrarConsultoria:gerir,podeContribuir:true,meuRhId:s.rhId||''};}
export function agendaProcessos(itens,mes){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes||''))falhar('Informe um mês válido.');
 return itens.filter(r=>r.situacao!=='cancelada').flatMap(r=>[{id:'processo:'+r.id,processoId:r.id,tipoProcesso:r.tipo,titulo:r.titulo,data:r.prazo,concluido:r.situacao==='concluida'},...r.etapas.map(e=>({id:'etapa:'+r.id+':'+e.id,processoId:r.id,tipoProcesso:r.tipo,etapaId:e.id,titulo:e.titulo+' · '+r.titulo,data:e.prazo,concluido:e.situacao==='concluida'}))].filter(e=>e.data?.startsWith(mes)).map(e=>({...e,tipo:r.tipo==='consultoria'?'Consultoria':'Demanda',cor:r.tipo==='consultoria'?'#0f766e':'#7c3aed',descricao:e.concluido?'Concluída':'Prazo previsto',recorrenteAnual:false})));
}
