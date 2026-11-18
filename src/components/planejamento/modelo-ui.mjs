export const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const CATEGORIAS_UI={colaboradores:'Colaboradores',saude:'Saúde e bem-estar',comercial:'Datas comerciais',outro:'Outras ações'};
export const SITUACOES_UI={aberta:'Em aberto',preparacao:'Em preparação',execucao:'Em execução',concluida:'Concluída',cancelada:'Cancelada'};
export const ETAPAS_UI={aberta:'Em aberto',execucao:'Em execução',concluida:'Concluída'};
export const moeda=valor=>valor==null?'A definir':valor===0?'Sem custo':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(valor/100);
export function anoPlanejamento(valor,atual=new Date().getFullYear()){const ano=Number(valor);return Number.isInteger(ano)&&ano>=2000&&ano<=2100?ano:atual;}
export const anosPlanejamento=ano=>Array.from(new Set([ano-1,ano,ano+1,2027])).filter(a=>a>=2000&&a<=2100).sort((a,b)=>a-b);
export const dataCurta=data=>/^\d{4}-\d{2}-\d{2}$/.test(data||'')?data.split('-').reverse().join('/'):'A definir';
export const hojeSP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const normalizar=valor=>String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export function periodoRotulo(item){if(item.periodo==='mes')return `${MESES[item.mes-1]} inteiro`;if(item.periodo==='a_definir'||!item.dataInicio)return `${MESES[item.mes-1]} · data a definir`;return item.dataFim&&item.dataFim!==item.dataInicio?`${dataCurta(item.dataInicio)} a ${dataCurta(item.dataFim)}`:dataCurta(item.dataInicio);}
export const vinculado=(pessoas,ator)=>!!ator?.rhId&&(pessoas||[]).some(p=>p.rhId===ator.rhId);
export const participa=(item,ator)=>vinculado(item.responsaveis,ator)||(item.etapas||[]).some(e=>vinculado(e.responsaveis,ator));
export function pendencias(item,hoje=hojeSP()){
 const encerrada=['concluida','cancelada'].includes(item.situacao);
 return {responsavel:!(item.responsaveis||[]).length,orcamento:item.previstoCentavos==null,data:item.periodo==='a_definir'||item.periodo==='data'&&!item.dataInicio,atrasada:!encerrada&&!!((item.implantarAte&&item.implantarAte<hoje)||(item.etapas||[]).some(e=>e.situacao!=='concluida'&&e.prazo&&e.prazo<hoje))};
}
export function filtrarAcoes(itens,filtros={},ator={},hoje=hojeSP()){
 const busca=normalizar(filtros.busca);
 return itens.filter(item=>{
  const pend=pendencias(item,hoje);
  return (!busca||normalizar([item.titulo,item.descricao,item.observacoes,...[...(item.responsaveis||[]),...(item.etapas||[]).flatMap(e=>e.responsaveis||[])].flatMap(p=>[p.nome,p.idPessoa])].join(' ')).includes(busca))&&(!filtros.mes||item.mes===Number(filtros.mes))&&(!filtros.categoria||item.categoria===filtros.categoria)&&(!filtros.situacao||item.situacao===filtros.situacao)&&(!filtros.responsavel||(item.responsaveis||[]).some(p=>p.rhId===filtros.responsavel)||(item.etapas||[]).some(e=>(e.responsaveis||[]).some(p=>p.rhId===filtros.responsavel)))&&(!filtros.setor||(item.setores||[]).includes(filtros.setor))&&(!filtros.minhas||participa(item,ator))&&(!filtros.pendencia||!!pend[filtros.pendencia]);
 }).sort((a,b)=>a.mes-b.mes||(a.dataInicio||'9999').localeCompare(b.dataInicio||'9999')||a.titulo.localeCompare(b.titulo,'pt-BR'));
}
export function indicadores(itens,hoje=hojeSP()){
 const unicas=[...new Map(itens.map(item=>[item.id,item])).values()],ativas=unicas.filter(i=>i.situacao!=='cancelada');
 return {total:unicas.length,concluidas:unicas.filter(i=>i.situacao==='concluida').length,canceladas:unicas.filter(i=>i.situacao==='cancelada').length,atrasadas:ativas.filter(i=>pendencias(i,hoje).atrasada).length,semResponsavel:ativas.filter(i=>pendencias(i,hoje).responsavel).length,semOrcamento:ativas.filter(i=>pendencias(i,hoje).orcamento).length,semData:ativas.filter(i=>pendencias(i,hoje).data).length,previsto:ativas.reduce((total,i)=>total+(i.previstoCentavos??0),0),realizado:unicas.reduce((total,i)=>total+(i.realizadoCentavos??0),0),realizadoInformado:unicas.filter(i=>i.realizadoCentavos!=null).length};
}
export function novoFormulario(ano,mes=1){return {id:crypto.randomUUID(),versao:0,ano:Number(ano),mes:Number(mes)||1,titulo:'',categoria:'outro',descricao:'',observacoes:'',setores:[],periodo:'a_definir',dataInicio:'',dataFim:'',preparacaoInicio:'',implantarAte:'',preparacaoRegra:'',responsaveis:[],previstoCentavos:null,realizadoCentavos:null,situacao:'aberta',etapas:[],anexos:[],comentarios:[],historico:[]};}
export function textoCentavos(texto){
 const valor=String(texto??'').trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(valor))throw new Error('Informe um valor válido com até duas casas decimais.');
 const [inteiro,decimal='']=valor.replace(',','.').split('.'),centavos=Number(inteiro)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(centavos)||centavos>100000000000)throw new Error('Valor acima do limite permitido.');
 return centavos;
}
