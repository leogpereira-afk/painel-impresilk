import {dataValida,idValido,validarArquivoReuniao} from './reunioes.mjs';

export const COLECAO='planejamento_anual';
export const SITUACOES={aberta:'Em aberto',preparacao:'Em preparação',execucao:'Em execução',concluida:'Concluída',cancelada:'Cancelada'};
export const CATEGORIAS={colaboradores:'Colaboradores',saude:'Campanhas de saúde',comercial:'Datas comerciais',outro:'Outro'};
export class ErroPlanejamento extends Error {constructor(message,status=422){super(message);this.name='ErroPlanejamento';this.status=status;}}
const falhar=(m,s=422)=>{throw new ErroPlanejamento(m,s);};
const igual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const objeto=v=>v&&typeof v==='object'&&!Array.isArray(v);
const texto=(v,max=8000)=>{if(v===null||v===undefined)return '';if(typeof v!=='string'||v.length>max)falhar('Texto inválido ou longo demais.');return v.trim();};
const lista=(v,max=100)=>{if(!Array.isArray(v)||v.length>max)falhar('Lista inválida ou acima do limite.');return v;};
const data=v=>{if(v===undefined||v===null||v==='')return '';if(!dataValida(v))falhar('Informe uma data válida.');return v;};
const valor=v=>{if(v===undefined||v===null||v==='')return null;if(!Number.isSafeInteger(v)||v<0||v>999999999999)falhar('Informe um valor válido em centavos, maior ou igual a zero.');return v;};
const identidade=ator=>{if(!ator?.usuario)falhar('Entre novamente para continuar.',401);};
const participa=(responsaveis,ator)=>!!ator?.rhId&&(responsaveis||[]).some(p=>p.rhId===ator.rhId);
const idsResponsaveis=lista=>(lista||[]).map(p=>[p.rhId,p.idPessoa]).sort((a,b)=>a[0].localeCompare(b[0]));
export function autorizarModulo(s){if(!s?.sub)falhar('Entre novamente.',401);if(!(s.master===true||s.perms?.includes('*')||s.perms?.includes('calendario-empresa')))falhar('Sem acesso ao Calendário da empresa.',403);}
export function podeEditarAcao(item,ator){return !!ator?.gestor||participa(item?.responsaveis,ator)||(item?.etapas||[]).some(e=>participa(e.responsaveis,ator));}
export function exigirVersao(antes,versao){if(!antes)falhar('Ação não encontrada.',404);if(!Number.isInteger(versao)||versao!==antes.versao)falhar('Esta ação mudou. Atualize antes de continuar; seu preenchimento foi mantido.',409);}

// Compartilhado pela porta real e pela prévia: tamanho, MIME, extensão e
// assinatura são conferidos antes de guardar qualquer byte ou metadado.
export function lerArquivoPlanejamento(b){
 if(typeof b.base64!=='string'||!b.base64.length||b.base64.length>Math.ceil(5*1024*1024/3)*4||b.base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64))falhar('Arquivo inválido ou acima de 5 MiB.');
 let bin='';try{bin=atob(b.base64);}catch{falhar('Arquivo inválido.');}
 let meta;try{meta=validarArquivoReuniao(b.nome,b.mime,bin.length);}catch(e){falhar(e.message,e.status||422);}
 const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
 const inicio=bin.slice(0,12);
 const valido=meta.ext==='pdf'?inicio.startsWith('%PDF-'):['jpg','jpeg'].includes(meta.ext)?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:meta.ext==='png'?inicio.startsWith('\x89PNG\r\n\x1a\n'):meta.ext==='webp'?inicio.startsWith('RIFF')&&inicio.slice(8,12)==='WEBP':inicio.startsWith('PK\x03\x04');
 if(!valido)falhar('O conteúdo não corresponde ao tipo de arquivo informado.');
 return {bytes,meta};
}

function vinculos(entrada,anteriores,pessoas){
 const ids=new Set();
 return lista(entrada||[],50).map(v=>{
  if(!objeto(v)||!idValido(v.rhId)||!/^\d{6}$/.test(v.idPessoa||''))falhar('Escolha uma pessoa com ID oficial válido no RH.');
  if(ids.has(v.rhId))falhar('Uma pessoa está repetida nos responsáveis.');ids.add(v.rhId);
  const antiga=(anteriores||[]).find(a=>a.rhId===v.rhId&&a.idPessoa===v.idPessoa);
  const candidatas=pessoas.filter(p=>p.rhId===v.rhId);
  const oficiais=pessoas.filter(p=>p.idPessoa===v.idPessoa&&p.disponivel!==false);
  if(candidatas.length>1||oficiais.length>1)falhar('O ID do RH está ambíguo. Confira o cadastro antes de vincular.');
  const p=candidatas[0];
  if(p?.disponivel!==false&&p?.idPessoa===v.idPessoa)return {rhId:p.rhId,idPessoa:p.idPessoa,nome:texto(p.nome,200),setor:texto(p.setor,160)};
  if(antiga&&(!p||p.disponivel===false))return {...antiga};
  falhar('Pessoa indisponível ou ID divergente no RH. Atualize o diretório.');
 });
}
function origemValida(v){
 if(v===null||v===undefined)return null;
 if(!objeto(v)||!texto(v.chave,250))falhar('Origem da importação inválida.');
 if(JSON.stringify(v).length>50000)falhar('Origem da importação acima do limite.');
 return JSON.parse(JSON.stringify(v));
}
function carimbar(novo,antes,ator,motivo,agora,extras={}){
 identidade(ator);const alteracoes={};
 for(const campo of Object.keys(novo))if(!['historico','versao','atualizadoEm'].includes(campo)&&!igual(antes?.[campo],novo[campo]))alteracoes[campo]={antes:antes?.[campo]??null,depois:novo[campo]};
 const historico=antes?.historico||[];
 if(historico.length>=10000)falhar('O histórico atingiu o limite desta ficha. Solicite suporte para preservá-lo.');
 return {...novo,versao:(antes?.versao||0)+1,atualizadoEm:agora,historico:[...historico,{id:globalThis.crypto.randomUUID(),em:agora,por:ator.usuario,nomeAutor:ator.nome||ator.usuario,motivo,alteracoes,...extras}]};
}
export function validarAcao(entrada,antes,ator,pessoas=[],agora=new Date().toISOString()){
 identidade(ator);if(!objeto(entrada))falhar('Informe a ação.');
 if(antes)exigirVersao(antes,entrada.versao);else if(!ator.gestor)falhar('Somente a gestão pode criar ações.',403);
 if(antes&&!podeEditarAcao(antes,ator))falhar('Você tem acesso somente de leitura a esta ação.',403);
 if(!idValido(entrada.id)||antes&&entrada.id!==antes.id)falhar('Identificador da ação inválido.');
 const ano=entrada.ano,mes=entrada.mes;
 if(!Number.isInteger(ano)||ano<2000||ano>2100||!Number.isInteger(mes)||mes<1||mes>12)falhar('Informe ano e mês válidos.');
 const titulo=texto(entrada.titulo,240);if(!titulo)falhar('Informe o título da ação.');
 const categoria=entrada.categoria||'outro',periodo=entrada.periodo||'a_definir',situacao=entrada.situacao||'aberta';
 if(!Object.hasOwn(CATEGORIAS,categoria)||!Object.hasOwn(SITUACOES,situacao)||!['mes','data','a_definir'].includes(periodo))falhar('Confira categoria, período e situação.');
 let dataInicio=data(entrada.dataInicio),dataFim=data(entrada.dataFim);const preparacaoInicio=data(entrada.preparacaoInicio),implantarAte=data(entrada.implantarAte);
 if(periodo==='data'&&!dataInicio)falhar('Informe a data do evento ou escolha Data a definir.');
 if(periodo==='a_definir'&&(dataInicio||dataFim))falhar('Uma ação com data a definir não deve conter datas exatas.');
 if(periodo==='mes'&&(dataInicio||dataFim)){
  const primeiro=`${ano}-${String(mes).padStart(2,'0')}-01`,ultimo=new Date(Date.UTC(ano,mes,0)).toISOString().slice(0,10);
  if(dataInicio!==primeiro||dataFim!==ultimo)falhar('Campanha de mês inteiro deve abranger o primeiro e o último dia do mês.');
  dataInicio='';dataFim='';
 }
 if(dataFim&&dataFim<dataInicio)falhar('O término não pode ser anterior ao início.');
 if(dataInicio&&!dataInicio.startsWith(`${ano}-${String(mes).padStart(2,'0')}`))falhar('O mês previsto deve coincidir com o início do evento.');
 const etapas=lista(entrada.etapas||[]).map(e=>{
  if(!objeto(e)||!idValido(e.id)||!texto(e.titulo,240)||!['aberta','execucao','concluida'].includes(e.situacao||'aberta'))falhar('Confira título, ID e situação das etapas.');
  const antiga=antes?.etapas?.find(a=>a.id===e.id);
  return {id:e.id,titulo:texto(e.titulo,240),prazo:data(e.prazo),responsaveis:vinculos(e.responsaveis,antiga?.responsaveis,pessoas),situacao:e.situacao||'aberta'};
 });
 if(new Set(etapas.map(e=>e.id)).size!==etapas.length)falhar('Há etapas repetidas.');
 const novo={id:entrada.id,ano,mes,titulo,categoria,descricao:texto(entrada.descricao),observacoes:texto(entrada.observacoes),setores:[...new Set(lista(entrada.setores||[],20).map(v=>texto(v,160)).filter(Boolean))],periodo,dataInicio,dataFim,preparacaoInicio,implantarAte,preparacaoRegra:texto(entrada.preparacaoRegra,1000),responsaveis:vinculos(entrada.responsaveis,antes?.responsaveis,pessoas),previstoCentavos:valor(entrada.previstoCentavos),realizadoCentavos:valor(entrada.realizadoCentavos),situacao,etapas,origem:origemValida(entrada.origem??antes?.origem),anexos:antes?.anexos||[],comentarios:antes?.comentarios||[],criadoEm:antes?.criadoEm||agora,criadoPor:antes?.criadoPor||ator.usuario};
 if(antes&&!ator.gestor){
  for(const campo of Object.keys(novo))if(!['situacao','etapas','responsaveis'].includes(campo)&&!igual(novo[campo],antes[campo]))falhar('Somente a gestão pode alterar o cadastro, o orçamento e os responsáveis.',403);
  if(!igual(idsResponsaveis(novo.responsaveis),idsResponsaveis(antes.responsaveis)))falhar('Somente a gestão pode alterar os responsáveis.',403);
  if(novo.situacao!==antes.situacao&&!participa(antes.responsaveis,ator))falhar('Somente um responsável da ação pode atualizar sua situação.',403);
  if(etapas.length!==antes.etapas.length)falhar('Somente a gestão pode organizar etapas.',403);
  for(const e of etapas){const antiga=antes.etapas.find(a=>a.id===e.id);if(!antiga||!igual({...e,situacao:antiga.situacao,responsaveis:idsResponsaveis(e.responsaveis)},{...antiga,responsaveis:idsResponsaveis(antiga.responsaveis)}))falhar('Somente a gestão pode organizar etapas.',403);if(e.situacao!==antiga.situacao&&!participa(antiga.responsaveis,ator))falhar('Você pode atualizar somente as etapas das quais é responsável.',403);}
 }
 return carimbar(novo,antes,ator,antes?'Atualizou a ação':'Criou a ação',agora);
}

export function registrarComentario(antes,textoRecebido,ator,agora=new Date().toISOString()){
 if(!podeEditarAcao(antes,ator))falhar('Você tem acesso somente de leitura a esta ação.',403);
 const textoComentario=texto(textoRecebido);if(!textoComentario)falhar('Escreva o andamento.');
 const comentarios=lista(antes.comentarios||[],9999);
 return carimbar({...antes,comentarios:[...comentarios,{id:globalThis.crypto.randomUUID(),texto:textoComentario,por:ator.usuario,nomeAutor:ator.nome||ator.usuario,em:agora}]},antes,ator,'Registrou andamento',agora);
}
function autorizarArquivo(antes,ator,etapaId){
 if(!podeEditarAcao(antes,ator))falhar('Você tem acesso somente de leitura a esta ação.',403);
 if(etapaId){const etapa=antes.etapas.find(e=>e.id===etapaId);if(!etapa)falhar('Etapa não encontrada.',404);if(!ator.gestor&&!participa(etapa.responsaveis,ator))falhar('Você pode anexar somente às suas etapas.',403);}
 else if(!ator.gestor&&!participa(antes.responsaveis,ator))falhar('Escolha uma etapa da qual você é responsável.',403);
}
export function anexarMetadados(antes,meta,ator,agora=new Date().toISOString()){
 autorizarArquivo(antes,ator,meta.etapaId);
 let validado;try{validado=validarArquivoReuniao(meta.nome,meta.mime,meta.tamanho);}catch(e){falhar(e.message,e.status||422);}
 if(!idValido(meta.id)||typeof meta.chave!=='string'||!meta.chave.startsWith(`planejamento/${antes.id}/`)||meta.chave.includes('..'))falhar('Identificador do arquivo inválido.');
 if(antes.anexos.some(a=>a.id===meta.id))falhar('Arquivo já registrado.',409);
 const substituido=meta.substituiId?antes.anexos.find(a=>a.id===meta.substituiId&&!a.removidoEm):null;
 if(meta.substituiId&&!substituido)falhar('Arquivo a substituir não encontrado.',404);
 if(substituido)autorizarArquivo(antes,ator,substituido.etapaId);
 if(antes.anexos.filter(a=>!a.removidoEm).length-(substituido?1:0)>=20)falhar('Limite de 20 arquivos ativos por ação.');
 const anexos=antes.anexos.map(a=>a.id===substituido?.id?{...a,removidoEm:agora,removidoPor:ator.usuario,substituidoPor:meta.id}:a);
 anexos.push({...validado,id:meta.id,chave:meta.chave,descricao:texto(meta.descricao,1000),etapaId:meta.etapaId||null,substituiId:meta.substituiId||null,por:ator.usuario,nomeAutor:ator.nome||ator.usuario,em:agora});
 return carimbar({...antes,anexos},antes,ator,substituido?'Substituiu arquivo preservando a versão anterior':'Anexou arquivo',agora);
}
export function removerAnexo(antes,arquivoId,ator,agora=new Date().toISOString()){
 const arquivo=antes.anexos.find(a=>a.id===arquivoId&&!a.removidoEm);if(!arquivo)falhar('Arquivo não encontrado.',404);autorizarArquivo(antes,ator,arquivo.etapaId);
 return carimbar({...antes,anexos:antes.anexos.map(a=>a.id===arquivoId?{...a,removidoEm:agora,removidoPor:ator.usuario}:a)},antes,ator,'Removeu arquivo da lista ativa; versão preservada',agora);
}

export const CAMPOS_ORIGEM=['ano','mes','titulo','categoria','descricao','observacoes','setores','periodo','dataInicio','dataFim','preparacaoInicio','implantarAte','preparacaoRegra'];
export function prepararImportacao(entradas,existentes,ator,pessoas,agora=new Date().toISOString()){
 if(!ator?.gestor)falhar('Somente a gestão pode importar o planejamento.',403);
 lista(entradas,200);if(!entradas.length)falhar('Selecione ao menos uma ação.');
 const chaves=new Set(),ids=new Set();
 return entradas.map(e=>{
  if(!objeto(e)||!objeto(e.item))falhar('Ação importada inválida.');const origem=origemValida(e.item.origem);if(!origem)falhar('Ação sem origem da planilha.');
  if(chaves.has(origem.chave))falhar('A planilha contém a mesma ação mais de uma vez.');chaves.add(origem.chave);
  const candidatos=existentes.filter(a=>a.origem?.chave===origem.chave);if(candidatos.length>1)falhar('A origem tem mais de um registro; confira antes de importar.',409);
  const antes=candidatos[0]||null;
  if(antes)exigirVersao(antes,e.versao);else if(e.versao!==0&&e.versao!==undefined)falhar('A ação da importação não foi encontrada. Confira novamente.',409);
  let candidato={...e.item,origem};
  if(antes){
   candidato={...antes,origem,versao:antes.versao};
   for(const campo of CAMPOS_ORIGEM){const original=antes.origem?.campos;if(original&&Object.hasOwn(original,campo)&&igual(antes[campo],original[campo])&&Object.hasOwn(e.item,campo))candidato[campo]=e.item[campo];}
  }
  const registro=validarAcao(candidato,antes,ator,pessoas,agora);
  if(ids.has(registro.id))falhar('A importação contém identificadores repetidos.');ids.add(registro.id);
  return {id:registro.id,registro,anterior:antes};
 });
}

export function resumoAcoes(itens,hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())){
 const unicos=[...new Map(itens.map(a=>[a.id,a])).values()];const ativas=unicos.filter(a=>a.situacao!=='cancelada');
 const atrasada=a=>!['concluida','cancelada'].includes(a.situacao)&&[a.implantarAte,...(a.etapas||[]).filter(e=>e.situacao!=='concluida').map(e=>e.prazo)].some(d=>dataValida(d)&&d<hoje);
 return {total:unicos.length,ativas:ativas.length,concluidas:ativas.filter(a=>a.situacao==='concluida').length,atrasadas:ativas.filter(atrasada).length,semResponsavel:ativas.filter(a=>!a.responsaveis?.length).length,semOrcamento:ativas.filter(a=>a.previstoCentavos===null||a.previstoCentavos===undefined).length,semData:ativas.filter(a=>a.periodo==='a_definir').length,previstoCentavos:ativas.reduce((n,a)=>n+(a.previstoCentavos??0),0),realizadoCentavos:unicos.reduce((n,a)=>n+(a.realizadoCentavos??0),0),semRealizado:ativas.filter(a=>a.realizadoCentavos===null||a.realizadoCentavos===undefined).length};
}
export function projetarAgenda(itens,mes){
 if(typeof mes!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))falhar('Informe um mês válido.');
 const inicio=mes+'-01',fim=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10),eventos=[];
 const adicionar=(a,marco,dataEvento,dataFim='',periodo='data',sufixo='')=>eventos.push({id:`planejamento:${a.id}:${marco}`,acaoId:a.id,marco,data:dataEvento,dataFim,periodo,tipo:'Planejamento',origem:'planejamento',titulo:a.titulo+sufixo,descricao:periodo==='mes'?'Campanha durante o mês inteiro':a.descricao||'',cor:'#4f46e5',href:`/calendario-empresa?planejamento=1&ano=${a.ano}&acao=${encodeURIComponent(a.id)}`});
 for(const a of [...new Map(itens.map(x=>[x.id,x])).values()]){
  if(a.situacao==='cancelada')continue;
  if(a.periodo==='mes'&&`${a.ano}-${String(a.mes).padStart(2,'0')}`===mes)adicionar(a,'evento',inicio,fim,'mes');
  if(a.periodo==='data'&&dataValida(a.dataInicio)){const ate=a.dataFim||a.dataInicio;if(a.dataInicio<=fim&&ate>=inicio)adicionar(a,'evento',a.dataInicio<inicio?inicio:a.dataInicio,ate>fim?fim:ate,'data');}
  for(const [campo,marco,sufixo]of [['preparacaoInicio','preparacao',' · preparar'],['implantarAte','implantacao',' · implantar até']])if(dataValida(a[campo])&&a[campo].startsWith(mes))adicionar(a,marco,a[campo],'','data',sufixo);
  for(const e of a.etapas||[])if(e.situacao!=='concluida'&&dataValida(e.prazo)&&e.prazo.startsWith(mes))adicionar(a,'etapa:'+e.id,e.prazo,'','data',' · '+e.titulo);
 }
 return eventos.sort((a,b)=>a.data.localeCompare(b.data)||a.titulo.localeCompare(b.titulo,'pt-BR'));
}
