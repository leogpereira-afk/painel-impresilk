import {ErroReuniao,dataValida,idValido,prepararReuniao,carimbarReuniao,podeEditarReuniao} from './reunioes.mjs';

const DIA=86400000,MAX_OCORRENCIAS=104;
const falhar=m=>{throw new ErroReuniao(m);};
const dia=s=>new Date(s+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const somarDias=(s,n)=>iso(new Date(dia(s).getTime()+n*DIA));
function horizonte(data){
 const d=dia(data),mes=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+3);
 if(d.getUTCMonth()!==mes)d.setUTCDate(0);
 return iso(d);
}
function normalizarRegra(regra){
 if(!regra||typeof regra!=='object'||Array.isArray(regra))falhar('Informe a repetição do encontro.');
 const {frequencia,termino}=regra,intervalo=regra.intervalo??1;
 if(!['diaria','semanal','mensal'].includes(frequencia)||![1,2].includes(intervalo))falhar('Escolha uma frequência e um intervalo válidos.');
 let diasSemana=[];
 if(frequencia==='semanal'){
  if(!Array.isArray(regra.diasSemana)||!regra.diasSemana.length||regra.diasSemana.some(d=>!Number.isInteger(d)||d<0||d>6))falhar('Escolha ao menos um dia da semana válido.');
  diasSemana=[...new Set(regra.diasSemana)].sort((a,b)=>a-b);
 }
 if(!['quantidade','data'].includes(termino))falhar('Defina o término por quantidade ou data.');
 if(termino==='quantidade'&&(!Number.isInteger(regra.quantidade)||regra.quantidade<1||regra.quantidade>MAX_OCORRENCIAS))falhar('A série deve ter de 1 a 104 encontros.');
 if(termino==='data'&&!dataValida(regra.ate))falhar('Informe uma data de término válida.');
 return {frequencia,intervalo,diasSemana,termino,...(termino==='quantidade'?{quantidade:regra.quantidade}:{ate:regra.ate})};
}

// Datas civis em UTC ao meio-dia: não dependem do fuso do navegador ou horário de verão.
export function gerarDatasRecorrencia(item,regra){
 if(!dataValida(item?.data))falhar('Informe uma data inicial válida.');
 const r=normalizarRegra(regra),inicio=item.data,maximo=horizonte(inicio),limite=r.termino==='data'?r.ate:maximo;
 if(limite<inicio)falhar('O término não pode ser antes do primeiro encontro.');
 if(limite>maximo)falhar('A série pode alcançar no máximo três anos após o início.');
 const datas=[],inicial=dia(inicio),diaMes=inicial.getUTCDate(),mesBase=inicial.getUTCFullYear()*12+inicial.getUTCMonth();
 // Semana civil de segunda a domingo; quinzenas permanecem ancoradas na primeira semana.
 const primeiroDiaSemana=(inicial.getUTCDay()+6)%7;
 for(let data=inicio,offset=0;data<=limite;data=somarDias(data,1),offset++){
  const d=dia(data),mes=d.getUTCFullYear()*12+d.getUTCMonth();
  const inclui=r.frequencia==='diaria'?offset%r.intervalo===0:r.frequencia==='semanal'?Math.floor((offset+primeiroDiaSemana)/7)%r.intervalo===0&&r.diasSemana.includes(d.getUTCDay()):(mes-mesBase)%r.intervalo===0&&d.getUTCDate()===diaMes;
  if(!inclui)continue;
  datas.push(data);
  if(datas.length>MAX_OCORRENCIAS)falhar('A série ultrapassa 104 encontros. Reduza o período ou a quantidade.');
  if(r.termino==='quantidade'&&datas.length===r.quantidade)return datas;
 }
 if(!datas.length)falhar('Não há encontros no período escolhido. Confira os dias e o término.');
 if(r.termino==='quantidade'&&datas.length<r.quantidade)falhar('Essa quantidade ultrapassa o horizonte máximo de três anos.');
 return datas;
}

export function resumoRecorrencia(regra){
 const r=normalizarRegra(regra),dias=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
 const frequencia=r.frequencia==='diaria'?(r.intervalo===1?'Diariamente':'A cada 2 dias'):r.frequencia==='semanal'?`${r.intervalo===1?'Toda semana':'A cada 2 semanas'} · ${r.diasSemana.map(d=>dias[d]).join(', ')}`:`${r.intervalo===1?'Todo mês':'A cada 2 meses'} no mesmo dia · dias inexistentes são pulados`;
 return `${frequencia} · ${r.termino==='quantidade'?r.quantidade+' '+(r.quantidade===1?'encontro':'encontros'):'até '+r.ate.split('-').reverse().join('/')}`;
}

export function criarSerieReunioes(item,regra,s,pessoas=[],agora=new Date().toISOString()){
 if(!idValido(item?.id)||item.id.length>75)falhar('Identificador da série inválido (máximo de 75 caracteres).');
 const r=normalizarRegra(regra),datas=gerarDatasRecorrencia(item,r);
 return datas.map((data,i)=>{
  const id=i===0?item.id:`${item.id}_r${i+1}`;
  const c={...item,id,data,versaoAnterior:null,situacao:'agendado',ata:'',ataSituacao:'rascunho',decisoes:[],participantes:Array.isArray(item.participantes)?item.participantes.map(p=>({...p,presenca:'pendente'})):item.participantes};
  const encontro=prepararReuniao(c,null,s,agora,pessoas);
  return carimbarReuniao({...encontro,serieId:item.id,indice:i+1,total:datas.length,regra:structuredClone(r),dataOriginal:data},s,'Criou encontro da série',agora);
 });
}

function instanteCivil(agora){
 const d=new Date(agora);if(!Number.isFinite(d.getTime()))falhar('Não foi possível conferir o horário atual.');
 const partes=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
 return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}
const futura=(r,agora)=>`${r.data}T${r.inicio}`>agora;
const temAtividade=r=>!!(r.ata||r.ataVersoes?.length||r.ataSituacao==='finalizada'||r.decisoes?.length||r.registros?.length||r.anexos?.length||r.participantes?.some(p=>p.presenca&&p.presenca!=='pendente'));

// A tela pode mostrar o alcance sem validar ou carimbar um formulário ainda incompleto.
export function selecionarAlvosSerie(atual,lista,escopo,agora=new Date().toISOString()){
 if(!atual||!idValido(atual.id))falhar('Encontro da série inválido.');
 if(!['esta','proximas','serie'].includes(escopo))falhar('Escolha o alcance da alteração.');
 if(escopo==='esta')return {alvos:[atual],preservadas:0};
 if(!atual.serieId)falhar('Este encontro não pertence a uma série.');
 const civil=instanteCivil(agora),candidatos=lista.filter(r=>r.serieId===atual.serieId&&(escopo==='serie'||r.indice>=atual.indice));
 if(!candidatos.some(r=>r.id===atual.id))falhar('A série está incompleta. Atualize os encontros antes de continuar.');
 const alvos=candidatos.filter(r=>r.situacao==='agendado'&&futura(r,civil)&&!temAtividade(r));
 return {alvos,preservadas:candidatos.length-alvos.length};
}

export function prepararAlteracaoSerie(atual,lista,item,escopo,s,pessoas=[],agora=new Date().toISOString()){
 if(!atual||!idValido(atual.id)||item?.id!==atual.id)falhar('Encontro da série inválido.');
 if(!['esta','proximas','serie'].includes(escopo))falhar('Escolha o alcance da alteração.');
 if(!podeEditarReuniao(atual,s))throw new ErroReuniao('Somente quem criou ou a direção pode alterar este encontro.',403);
 if((item.versaoAnterior??null)!==(atual.versao??null))throw new ErroReuniao('Este encontro foi atualizado. Reabra a ficha antes de salvar.',409);
 if(escopo==='esta')return {alteracoes:[{antes:atual,item:carimbarReuniao(prepararReuniao(item,atual,s,agora,pessoas),s,'Editou o encontro',agora)}],preservadas:0};
 if(!atual.serieId)falhar('Este encontro não pertence a uma série.');
 if(item.regra&&JSON.stringify(normalizarRegra(item.regra))!==JSON.stringify(normalizarRegra(atual.regra)))falhar('Para mudar a repetição, cancele os encontros futuros e crie uma nova série.');
 if(!['agendado','cancelado'].includes(item.situacao)&&item.situacao!==atual.situacao)falhar('A alteração em grupo permite agendar ou cancelar. Registre a realização em cada encontro.');
 if(!dataValida(item.data))falhar('Informe uma data válida.');
 const civil=instanteCivil(agora),deslocamento=(dia(item.data)-dia(atual.data))/DIA;
 const {alvos,preservadas}=selecionarAlvosSerie(atual,lista,escopo,agora),alteracoes=[];
 const mudou=campo=>Object.hasOwn(item,campo)&&JSON.stringify(item[campo])!==JSON.stringify(atual[campo]);
 for(const antes of alvos){
  if(!podeEditarReuniao(antes,s))throw new ErroReuniao('Você não pode alterar todos os encontros selecionados.',403);
  // Somente programação e convite são comuns. Ata, decisões e presenças nunca se replicam.
  const c={...antes,id:antes.id,versaoAnterior:antes.versao,data:somarDias(antes.data,deslocamento)};
  for(const campo of ['titulo','setor','tipo','inicio','fim','local','responsavel','responsavelRhId','pauta','situacao'])if(mudou(campo))c[campo]=item[campo];
  if(mudou('participantes'))c.participantes=Array.isArray(item.participantes)?item.participantes.map(p=>({...p,presenca:'pendente'})):item.participantes;
  if(!futura(c,civil))falhar('A alteração levaria um encontro para um horário passado. Confira as datas.');
  const preparado=prepararReuniao(c,antes,s,agora,pessoas);
  alteracoes.push({antes,item:carimbarReuniao(preparado,s,c.situacao==='cancelado'?'Cancelou encontro da série':'Editou encontro da série',agora)});
 }
 return {alteracoes,preservadas};
}

// O chamador fornece somente registros autorizados. A projeção nunca inclui atas ou pessoas.
export function conflitosReunioes(candidatos=[],existentes=[]){
 const ids=new Set(candidatos.map(r=>r.id)),resultado=[];
 const rhIds=r=>new Set([r.responsavelRhId,...(r.participantes||[]).map(p=>p.rhId)].filter(Boolean));
 const comparar=(a,b)=>{
  if(a.id===b.id||a.situacao==='cancelado'||b.situacao==='cancelado'||a.data!==b.data||a.inicio>=b.fim||b.inicio>=a.fim)return;
  const bRH=rhIds(b),comuns=[...rhIds(a)].filter(id=>bRH.has(id)).sort();
  if(comuns.length)resultado.push({candidatoId:a.id,reuniaoId:b.id,rhIds:comuns,data:b.data,inicio:b.inicio,fim:b.fim,titulo:b.titulo});
 };
 candidatos.forEach((a,i)=>{for(const b of existentes)if(!ids.has(b.id))comparar(a,b);for(const b of candidatos.slice(i+1))comparar(a,b);});
 return resultado;
}
