import {confirmarPresenca,minhaPresenca,avisosReunioes} from '../../supabase/functions/_shared/reunioes-presenca.mjs';
import {prepararReuniao,carimbarReuniao,novoRegistro,validarArquivoReuniao,agendaReunioes,podeEditarReuniao,ErroReuniao} from '../../supabase/functions/_shared/reunioes.mjs';
import {criarSerieReunioes,prepararAlteracaoSerie} from '../../supabase/functions/_shared/reunioes-recorrencia.mjs';
import {prepararDemandaReuniao,podeCriarDemandaReuniao} from '../../supabase/functions/_shared/reunioes-demanda.mjs';
import {inserirDemandaReuniaoDemo,obterDemandaReuniaoDemo} from './processos.mjs';
import {pessoasReuniaoDemo} from './pessoas-reunioes.mjs';
export {pessoasReuniaoDemo} from './pessoas-reunioes.mjs';
const convidado=new URLSearchParams(window.location.search).get('perfil')==='reuniao-convidado';
const s=convidado?{sub:'ana-demo',nome:'Ana Exemplo',master:false}:{sub:'demo',nome:'Conta de demonstração',master:true},identidade={rhId:'rh-ana',motivo:''},itens=new Map(),arquivos=new Map();
const dia=deslocamento=>{const d=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+deslocamento);return d.toISOString().slice(0,10);};
const base={id:'encontro-demo',titulo:'Treinamento de instalação · exemplo',tipo:'treinamento',setor:'producao',situacao:'agendado',data:dia(1),inicio:'09:00',fim:'10:00',local:'Sala de treinamento',responsavel:'Ana Exemplo',pauta:'Conferência do material antes da saída e registro da entrega.',ata:'',participantes:[{id:'p1',rhId:'rh-ana',nome:'Ana Exemplo',presenca:'pendente'},{id:'p2',rhId:'rh-bruno',nome:'Bruno Exemplo',presenca:'pendente'}],decisoes:[],versaoAnterior:null};
itens.set(base.id,carimbarReuniao(prepararReuniao(base,null,{sub:'demo',nome:'Organizador',master:true},new Date().toISOString(),pessoasReuniaoDemo),{sub:'demo',nome:'Organizador',master:true},'Criou o encontro'));
for(const extra of [
 {id:'encontro-encerramento-demo',titulo:'Revisão da rotina financeira · exemplo',tipo:'reuniao',setor:'financeiro',data:dia(-1),local:'Sala de reuniões',pauta:'Conferir os combinados da semana e registrar os responsáveis.',decisoes:[{id:'decisao-exemplo',texto:'Revisar o roteiro de conferência',responsavel:'Ana Exemplo',prazo:dia(-1),concluida:false}]},
 {id:'encontro-historico-demo',titulo:'Planejamento comercial · exemplo',tipo:'reuniao',setor:'comercial',situacao:'realizado',data:dia(-7),responsavel:'Carla Exemplo',participantes:[{id:'p3',rhId:'rh-carla',nome:'Carla Exemplo',presenca:'presente'}],ata:'Exemplo fictício: pauta revisada e roteiro de acompanhamento definido.',decisoes:[{id:'decisao-historica',texto:'Organizar a pauta do próximo encontro',responsavel:'Carla Exemplo',prazo:dia(2),concluida:false}]},
 {id:'encontro-cancelado-demo',titulo:'Alinhamento da produção · exemplo',tipo:'reuniao',situacao:'cancelado',data:dia(-2),participantes:[],ata:'Exemplo fictício: encontro cancelado antes da realização.'},
]){const item={...base,...extra};itens.set(item.id,carimbarReuniao(prepararReuniao(item,null,{sub:'demo',nome:'Organizador',master:true},new Date().toISOString(),pessoasReuniaoDemo),{sub:'demo',nome:'Organizador',master:true},'Criou o encontro'));}
const serie={...base,id:'pcp-serie-demo',titulo:'Alinhamento do PCP · exemplo',tipo:'reuniao',data:dia(2),inicio:'08:15',fim:'08:45',responsavel:'Bruno Exemplo',responsavelRhId:'rh-bruno',pauta:'Prioridades da produção, impedimentos e próximos passos.',participantes:[{id:'pcp-bruno',rhId:'rh-bruno',presenca:'pendente'},{id:'pcp-davi',rhId:'rh-davi',presenca:'pendente'}]};
const regra={frequencia:'semanal',intervalo:1,diasSemana:[new Date(serie.data+'T12:00:00Z').getUTCDay()],termino:'quantidade',quantidade:6};
for(const item of criarSerieReunioes(serie,regra,{sub:'demo',nome:'Organizador',master:true},pessoasReuniaoDemo))itens.set(item.id,item);
const armazenamento='reunioes-review-20261026-v1';
try{const salvo=JSON.parse(sessionStorage.getItem(armazenamento)||'null');if(Array.isArray(salvo)){itens.clear();for(const [k,v] of salvo)itens.set(k,v);}}catch{/* Diretório fictício inicial se não houver armazenamento. */}
function persistir(){try{sessionStorage.setItem(armazenamento,JSON.stringify([...itens]));}catch{/* Mantém a sessão da prévia quando armazenamento não está disponível. */}}
const apresentar=r=>({...r,anexos:r.anexos.map(a=>({...a,expiradoNaPrevia:!arquivos.has(a.id)})),podeEditar:podeEditarReuniao(r,s),minhaPresenca:minhaPresenca(r,identidade)});
function gravarLote(alteracoes){
 // Valida tudo antes de escrever; mesma semântica atômica da RPC em produção.
 for(const {antes,item} of alteracoes){const atual=itens.get(item.id);if((atual?.versao??null)!==(antes?.versao??null))throw new ErroReuniao('A série mudou. Atualize antes de salvar.',409);}
 for(const {item} of alteracoes)itens.set(item.id,item);
}
export async function respostaReunioes(b){
 let dados;try{
 const r=itens.get(b.id||b.item?.id);
 if(b.action==='avisos')dados={avisos:avisosReunioes([...itens.values()],identidade)};
 else if(b.action==='pessoas')dados={pessoas:pessoasReuniaoDemo};
 else if(b.action==='agenda')dados={eventos:agendaReunioes([...itens.values()],b.mes)};
 else if(b.action==='listar')dados={itens:[...itens.values()].map(apresentar)};
 else if(b.action==='salvarSerie'){
  if(b.recorrencia){
   if(r){if(r.serieId!==r.id||!podeEditarReuniao(r,s))throw new ErroReuniao('Identificador já utilizado.',409);const serie=[...itens.values()].filter(x=>x.serieId===r.serieId);dados={item:apresentar(r),itens:serie.map(apresentar),preservadas:0};}
   else{const novos=criarSerieReunioes(b.item,b.recorrencia,s,pessoasReuniaoDemo);gravarLote(novos.map(item=>({antes:null,item})));dados={item:apresentar(novos[0]),itens:novos.map(apresentar),preservadas:0};}
  }else{
   if(!r)throw new ErroReuniao('Encontro não encontrado.',404);
   const lote=prepararAlteracaoSerie(r,[...itens.values()],b.item,b.escopo,s,pessoasReuniaoDemo);
   for(const {antes} of lote.alteracoes)if(b.versoesAnteriores?.[antes.id]!==antes.versao)throw new ErroReuniao('Um encontro da série mudou. Atualize antes de salvar.',409);
   gravarLote(lote.alteracoes);dados={item:apresentar(itens.get(r.id)),itens:lote.alteracoes.map(x=>apresentar(x.item)),preservadas:lote.preservadas};
  }
 }
 else if(b.action==='salvar'){const n=carimbarReuniao(prepararReuniao(b.item,r,s,new Date().toISOString(),pessoasReuniaoDemo),s,r?'Editou o encontro':'Criou o encontro');itens.set(n.id,n);dados={item:apresentar(n)};}
 else if(!r)throw new Error('Encontro não encontrado.');
 else if(b.action==='demanda'){
  if(!podeCriarDemandaReuniao(s)||!podeEditarReuniao(r,s))throw new ErroReuniao('Sem permissão para criar demanda deste encontro.',403);
  const decisao=r.decisoes.find(d=>d.id===b.decisaoId);
  if(decisao?.demandaId){if(!obterDemandaReuniaoDemo(decisao.demandaId))throw new ErroReuniao('Demanda vinculada indisponível.',409);dados={item:apresentar(r),demandaId:decisao.demandaId};}
  else{
   if(r.versao!==b.versao)throw new ErroReuniao('O encontro mudou. Atualize antes de continuar.',409);
   const novo=await prepararDemandaReuniao(r,b.decisaoId,s,pessoasReuniaoDemo);
   if(itens.get(r.id)?.versao!==r.versao)throw new ErroReuniao('O encontro mudou. Atualize antes de continuar.',409);
   inserirDemandaReuniaoDemo(novo.demanda);itens.set(r.id,novo.reuniao);dados={item:apresentar(novo.reuniao),demandaId:novo.demanda.id};
  }
 }
 else if(b.action==='presenca'){const n=confirmarPresenca(r,s,identidade,b);itens.set(n.id,n);dados={item:apresentar(n)};}
 else if(b.action==='arquivo'){const url=arquivos.get(b.arquivoId);if(!url)throw new ErroReuniao('O conteúdo do anexo de teste expirou ao atualizar a prévia. Anexe novamente para abrir.',410);dados={url};}
 else{
 if(!podeEditarReuniao(r,s))throw new ErroReuniao('Você não pode alterar este encontro.',403);
 if(r.versao!==b.versao)throw new Error('Encontro atualizado. Reabra a ficha.');
 let n;
 if(b.action==='registro')n=novoRegistro(r,b.texto,s);
 else if(b.action==='anexar'){
 if(r.anexos.length>=20)throw new Error('Limite de 20 arquivos.');
 const bytes=Uint8Array.from(atob(b.base64),c=>c.charCodeAt(0)),a=validarArquivoReuniao(b.nome,b.mime,bytes.length),id=crypto.randomUUID();
 arquivos.set(id,URL.createObjectURL(new Blob([bytes],{type:a.mime})));n={...r,anexos:[...r.anexos,{...a,id,em:new Date().toISOString(),nomeAutor:s.nome}]};
 }else throw new Error('Ação inválida.');
 n=carimbarReuniao(n,s,b.action==='registro'?'Acrescentou um registro':'Anexou arquivo');itens.set(n.id,n);dados={item:apresentar(n)};
 }
 persistir();return new Response(JSON.stringify({ok:true,...dados}),{headers:{'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({erro:e.message}),{status:e.status||422});}
}
