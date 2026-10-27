import {prepararProcesso,editarRegistro,dadosConvite,renovarConvite,substituirConvite,revogarConvite,editarTrabalho,permiteAcaoConsultoria,validarAcessoConvite,avaliarEtapa,planejarEtapa,cadastrarConsultor,atualizarImplantacao,carimbarProcesso,registrarProcesso,atualizarEtapa,agendaProcessos,projetarInterno,projetarConvidado,validarArquivoProcesso} from '../../supabase/functions/_shared/processos.mjs';
import {pessoasReuniaoDemo as pessoas} from './pessoas-reunioes.mjs';
const s={sub:'demo',nome:'Conta de demonstração',master:true,rhId:'rh-ana'},itens=new Map(),arquivos=new Map(),tokens=new Map();
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
for(const tipo of ['demanda','consultoria']){
 const b={id:tipo+'-demo',tipo,titulo:tipo==='demanda'?'Melhorar a conferência antes da saída':'Organização financeira · exemplo',empresa:tipo==='consultoria'?'Consultoria Exemplo':'',especialidade:'Gestão',objetivo:'Exemplo fictício para testar pessoas, etapas e calendário.',analise:'Análise interna, não compartilhada no portal.',solucao:'Definir as ações e acompanhar com a equipe.',setor:tipo==='demanda'?'producao':'financeiro',prioridade:'normal',situacao:'analise',prazo:hoje,responsavelRhId:'rh-ana',envolvidos:[{rhId:'rh-ana'},{rhId:'rh-bruno'}],etapas:[{id:'levantamento',titulo:'Levantar as necessidades',descricao:'Reunir informações e documentos.',responsavelRhId:'rh-ana',prazo:hoje,situacao:'pendente',dependeDe:[],nota:''}],versaoAnterior:null};
 itens.set(b.id,carimbarProcesso(prepararProcesso(b,null,s,pessoas),s,'Criou o processo'));
}
const conviteDemo={id:'convite-demo',nome:'Consultor de demonstração',processoId:'consultoria-demo',expiraEm:new Date(Date.now()+86400000).toISOString()};
// Cenários fictícios de Demandas: prazos, bloqueios, conferência e histórico.
const dia=deslocamento=>{const d=new Date(hoje+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+deslocamento);return d.toISOString().slice(0,10);};
for(const c of [
 {id:'demanda-prazo-demo',titulo:'Padronizar a conferência de materiais',setor:'producao',prioridade:'alta',situacao:'execucao',prazo:dia(-2),etapa:'Revisar o checklist com a equipe',estado:'execucao',inicioReal:dia(-4),progresso:40},
 {id:'demanda-validacao-demo',titulo:'Validar o novo fluxo de atendimento',setor:'comercial',prioridade:'normal',situacao:'validacao',prazo:dia(2),etapa:'Conferir a proposta de fluxo',estado:'validacao',inicioReal:dia(-3),fimReal:dia(-1),progresso:100},
 {id:'demanda-bloqueada-demo',titulo:'Organizar os documentos da equipe',setor:'rh',prioridade:'normal',situacao:'planejada',prazo:dia(5),etapa:'Conferir os modelos de documentos',estado:'bloqueada',nota:'Aguardando a definição do modelo de exemplo.'},
 {id:'demanda-concluida-demo',titulo:'Revisar o roteiro de entrega',setor:'producao',prioridade:'normal',situacao:'concluida',prazo:dia(-3),etapa:'Aprovar o roteiro de exemplo',estado:'concluida',inicioReal:dia(-5),fimReal:dia(-3),progresso:100}
]){
 const b={id:c.id,tipo:'demanda',titulo:c.titulo,objetivo:'Exemplo fictício de acompanhamento de demanda, sem registros da empresa.',setor:c.setor,prioridade:c.prioridade,situacao:c.situacao,prazo:c.prazo,responsavelRhId:'rh-bruno',envolvidos:[{rhId:'rh-ana'},{rhId:'rh-bruno'}],etapas:[{id:c.id+'-etapa',titulo:c.etapa,responsavelRhId:'rh-bruno',prazo:c.prazo,situacao:c.estado,dependeDe:[],nota:c.nota||'',inicioReal:c.inicioReal||'',fimReal:c.fimReal||'',progresso:c.progresso||0}],versaoAnterior:null};
 itens.set(b.id,carimbarProcesso(prepararProcesso(b,null,s,pessoas),s,'Criou a demanda de exemplo'));
}
tokens.set('consultoria-demo.'+'a'.repeat(64),conviteDemo);
for(const [letra,nivel] of [['b','administrador'],['c','leitura']]){
 const c={...conviteDemo,id:'convite-'+nivel,nome:'Consultor '+nivel,nivel};tokens.set('consultoria-demo.'+letra.repeat(64),c);itens.get('consultoria-demo').convites.push(c);
}
// Somente dados fictícios, isolados por aba de prévia.
const armazenamento='consultorias-review-20261027-v2';
const consultoria=itens.get('consultoria-demo');
consultoria.consultores=[{id:'consultor-admin-demo',nome:'Marina Exemplo',funcao:'Coordenação',contato:'marina@example.invalid'},{id:'consultor-leitor-demo',nome:'Rafael Exemplo',funcao:'Acompanhamento',contato:''},{id:'consultor-novo-demo',nome:'Paula Exemplo',funcao:'Processos',contato:''}];
consultoria.convites=consultoria.convites.map(c=>({...c,consultorId:c.nivel==='administrador'?'consultor-admin-demo':'consultor-leitor-demo',criadoEm:new Date().toISOString()}));
consultoria.convites.push({...conviteDemo,id:'convite-expirado-demo',consultorId:'consultor-novo-demo',nome:'Paula Exemplo',nivel:'colaborador',expiraEm:new Date(Date.now()-86400000).toISOString(),criadoEm:new Date(Date.now()-15*86400000).toISOString()});
consultoria.convites.push({...conviteDemo,nivel:'colaborador'});
// Registros e acessos fictícios para conferir edição cruzada, privacidade e retomada.
consultoria.convites=consultoria.convites.map(c=>c.id==='convite-administrador'||c.id==='convite-demo'?{...c,semValidade:true,expiraEm:null}:c);
consultoria.registros=[
 {id:'acao-equipe-demo',tipo:'acao',titulo:'Revisar o fluxo de fechamento mensal',dataAcao:hoje,texto:'A equipe reuniu os documentos e desenhou o fluxo de conferência. Este registro foi criado por outra pessoa para demonstrar a edição compartilhada.',resultado:'Etapas de conferência identificadas.',proximoPasso:'Validar responsáveis e sequência na próxima reunião.',etapaId:'levantamento',implantacao:{situacao:'nao_iniciada',progresso:0},implantacoes:[],em:new Date().toISOString(),por:'demo',nome:'Equipe interna · exemplo',compartilhado:true},
 {id:'acao-consultor-demo',tipo:'acao',titulo:'Organizar os indicadores de acompanhamento',dataAcao:hoje,texto:'Separar indicadores de andamento e de resultado para a reunião de acompanhamento.',resultado:'Modelo de indicadores em revisão.',proximoPasso:'Apresentar o modelo à equipe.',etapaId:'levantamento',implantacao:{situacao:'em_implantacao',como:'Modelo em elaboração.'},implantacoes:[],em:new Date().toISOString(),por:'convite:convite-administrador',consultorId:'consultor-admin-demo',nome:'Marina Exemplo',compartilhado:true},
 {id:'decisao-demo',tipo:'decisao',titulo:'Reunião de acompanhamento semanal',dataAcao:hoje,texto:'Exemplo de decisão compartilhada: reunir a equipe para revisar as entregas.',resultado:'Roteiro da reunião definido.',proximoPasso:'Confirmar participantes.',etapaId:'',em:new Date().toISOString(),por:'demo',nome:'Equipe interna · exemplo',compartilhado:true},
 {id:'nota-interna-demo',tipo:'atualizacao',titulo:'Análise interna restrita · exemplo',dataAcao:hoje,texto:'Informação interna fictícia que não deve aparecer no portal do consultor.',resultado:'',proximoPasso:'',etapaId:'',em:new Date().toISOString(),por:'demo',nome:'Equipe interna · exemplo',compartilhado:false}
];
for(const v of tokens.values())Object.assign(v,consultoria.convites.find(c=>c.id===v.id));
try{const salvo=JSON.parse(sessionStorage.getItem(armazenamento)||'null');if(salvo?.itens&&salvo?.tokens){itens.clear();tokens.clear();for(const [k,v] of salvo.itens)itens.set(k,v);for(const [k,v] of salvo.tokens)tokens.set(k,v);}}catch{/* prévia começa limpa se armazenamento não estiver disponível */}
function persistir(){try{sessionStorage.setItem(armazenamento,JSON.stringify({itens:[...itens],tokens:[...tokens]}));}catch{/* a prévia continua nesta página */}}
// Reunião e demanda compartilham a mesma instância fictícia, sem chamada produtiva.
export function obterDemandaReuniaoDemo(id){return itens.get(id);}
export function inserirDemandaReuniaoDemo(registro){
 if(registro.tipo!=='demanda')throw new Error('Somente demanda pode ser criada por uma reunião.');
 if(itens.has(registro.id))throw new Error('A demanda já existe. Atualize o encontro.');
 itens.set(registro.id,registro);persistir();
}
export function respostaProcessos(b,token=''){
 try{
 const c=token?tokens.get(token):null;if(token&&(!validarAcessoConvite(itens.get(c?.processoId),c)||itens.get(c?.processoId)?.situacao==='cancelada'))throw new Error('Convite inválido ou encerrado.');
 const r=itens.get(c?.processoId||b.id||b.item?.id),ator=c?{sub:'convite:'+c.id,nome:c.nome,externo:true,consultorId:c.consultorId||null,nivel:c.nivel??'colaborador',conviteId:c.id}:s;
 if(c&&(!permiteAcaoConsultoria(c,b.action)||b.id&&b.id!==c.processoId))throw new Error('Este acesso não permite essa ação.');
 const proj=x=>c?projetarConvidado(x,c):projetarInterno(x,s);
 let dados;
 if(!c&&b.action==='pessoas')dados={pessoas};
 else if(!c&&b.action==='listar')dados={itens:[...itens.values()].map(proj)};
 else if(!c&&b.action==='agenda')dados={eventos:agendaProcessos([...itens.values()],b.mes)};
 else if(!c&&b.action==='salvar'){const n=carimbarProcesso(prepararProcesso(b.item,r,s,pessoas),s,'Atualizou a ficha');itens.set(n.id,n);dados={item:proj(n)};}
 else if(!r)throw new Error('Processo não encontrado.');
 else if(b.action==='obter')dados={item:proj(r)};
 else if(b.action==='arquivo'){const url=arquivos.get(b.arquivoId);if(!url)throw new Error('Arquivo de demonstração sem conteúdo.');dados={url};}
 else{
 if(b.versao!==r.versao)throw new Error('A ficha mudou. Atualize antes de continuar.');let n,convite;
 if(b.action==='trabalho')n=editarTrabalho(r,b,ator);
 else if(b.action==='avaliarEtapa')n=avaliarEtapa(r,b,ator);
 else if(b.action==='planejarEtapa')n=planejarEtapa(r,b,ator);
 else if(b.action==='consultor')n=cadastrarConsultor(r,b,ator);
 else if(b.action==='implantacao')n=atualizarImplantacao(r,b,ator);
 else if(b.action==='registro')n=registrarProcesso(r,b,ator);
 else if(b.action==='editarRegistro')n=editarRegistro(r,b,ator);
 else if(b.action==='etapa')n=atualizarEtapa(r,b,ator);
 else if(b.action==='anexar'){const bytes=Uint8Array.from(atob(b.base64),x=>x.charCodeAt(0)),a=validarArquivoProcesso(b.nome,b.mime,bytes.length),id=crypto.randomUUID();arquivos.set(id,URL.createObjectURL(new Blob([bytes],{type:a.mime})));n={...r,anexos:[...r.anexos,{...a,id,compartilhado:!!c,em:new Date().toISOString(),nomeAutor:ator.nome}]};}
 else if(!c&&b.action==='compartilhar')n={...r,anexos:r.anexos.map(a=>a.id===b.arquivoId?{...a,compartilhado:b.compartilhado}:a)};
 else if(b.action==='convidar'){const convidado={id:crypto.randomUUID(),...dadosConvite(r,b,ator)};convite=r.id+'.'+crypto.randomUUID().replaceAll('-','').repeat(2);tokens.set(convite,{...convidado,processoId:r.id});n={...r,convites:[...r.convites,convidado]};}
 else if(b.action==='renovarConvite')n=renovarConvite(r,b,ator);
 else if(b.action==='substituirConvite'){const segredo=crypto.randomUUID().replaceAll('-','').repeat(2);n=substituirConvite(r,b,ator,segredo);for(const [k,v] of tokens)if(v.id===b.conviteId)tokens.delete(k);convite=r.id+'.'+segredo;tokens.set(convite,{...n.convites.find(c=>c.id===b.conviteId),processoId:r.id});}
 else if(b.action==='revogar')n=revogarConvite(r,b,ator);
 else throw new Error('Ação não permitida.');if(b.action!=='revogar'&&n!==r)n=carimbarProcesso(n,ator,'Atualizou '+b.action);for(const v of tokens.values()){const atual=n.convites.find(c=>c.id===v.id);if(atual)Object.assign(v,atual);}itens.set(n.id,n);dados={item:proj(n),...(convite?{convite}:{})};
 }
 persistir();return new Response(JSON.stringify({ok:true,...dados}),{headers:{'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({erro:e.message}),{status:e.status||422});}
}
