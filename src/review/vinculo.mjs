// Prévia local do vínculo bem ↔ ficha: as mesmas regras e mensagens das ações
// vincularFicha, desvincularFicha e historicoVinculo do painel-ativos, só em
// memória e com dados fictícios. Recarregar a página restaura os exemplos.
import {familiaVinculo,fichaAceitaBem,fichaBaixada,moduloDoVinculo,ROTULO_FAMILIA_VINCULO,ROTULO_MODULO_VINCULO} from '../lib/calc/vinculo-patrimonio.js';

// Os mesmos textos do servidor (painel-ativos): a prévia nunca diverge da produção.
import {MSG_VINCULO} from '../../supabase/functions/_shared/patrimonio-vinculo.mjs';
export const MSG_VINCULO_PREVIA = MSG_VINCULO;
const M=MSG_VINCULO_PREVIA;
const ID=/^[A-Za-z0-9_-]{1,180}$/;
const falha=(erro,status)=>Object.assign(new Error(erro),{status});
// Recusa do próprio vínculo: a mesma marca recusaVinculo do servidor.
const recusa=(erro,status)=>Object.assign(falha(erro,status),{recusaVinculo:true});
const versaoNova=anterior=>new Date(Math.max(Date.now(),(Date.parse(anterior||'')||0)+1)).toISOString();
const etiqueta=bem=>bem?.codigo||bem?.nomeGenerico||'sem etiqueta';
const semPor=({por:_por,...evento})=>evento;
const comEvento=(lista,evento)=>[...(Array.isArray(lista)?lista:[]),evento].slice(-200);
// A tela nunca recebe o histórico pela listagem nem o login de quem gravou.
export const projetarFicha=ficha=>{const {historicoVinculo:_h,...resto}=structuredClone(ficha);return resto;};

// `fichas()` devolve as fichas vivas; `gravarFicha` troca uma delas; `bens` é o
// mapa do inventário fictício. `lixeiraFichas` e `lixeiraBens` simulam a lixeira.
export function criarVinculoPrevia({fichas,gravarFicha,bens,lixeiraFichas=new Map(),lixeiraBens=new Set()}) {
 const tem=(sessao,modulo)=>!!sessao&&(sessao.master===true||sessao.perms?.includes('*')||sessao.perms?.includes(modulo));
 const podeMexer=(sessao,ficha)=>tem(sessao,'inventario-valores')&&tem(sessao,moduloDoVinculo(ficha));
 const semPermissao=ficha=>falha(M.semPermissaoFamilia(ficha),403);
 const rotulo=(ficha,sessao)=>!ficha?'uma ficha retirada':ficha.tipo==='seguranca'&&!tem(sessao,'seguranca')?'uma ficha de Segurança':`${ROTULO_FAMILIA_VINCULO[familiaVinculo(ficha)]} · ${ficha.nome||'Sem nome'}`;
 const evento=({acao,ficha,bemId,sessao,via,lado,tela,motivo})=>({id:crypto.randomUUID(),acao,bemId,ativoId:ficha.id,familia:familiaVinculo(ficha),nome:String(ficha.nome||'').slice(0,180),bemCodigo:bens[bemId]?.codigo||'',lado,via,...(tela?{tela}:{}),...(motivo?{motivo}:{}),por:sessao.sub,porNome:sessao.nome||sessao.sub,em:new Date().toISOString()});
 function conferirPedido(corpo,sessao){
  if(![corpo.bemId,corpo.ativoId].every(v=>typeof v==='string'&&ID.test(v)))throw falha(M.idInvalido,422);
  if(![corpo.versaoFicha,corpo.versaoBem].every(v=>typeof v==='string'))throw falha(M.versaoInvalida,422);
  if(!tem(sessao,'inventario-valores'))throw falha(M.semInventario,403);
  return ['bem','ficha'].includes(corpo.origem)?corpo.origem:undefined;
 }
 function vincular(corpo,sessao){
  const tela=conferirPedido(corpo,sessao),{bemId,ativoId}=corpo,todas=fichas();
  const ficha=todas.find(f=>f.id===ativoId);
  if(!ficha)throw lixeiraFichas.has(ativoId)?falha(M.fichaRetirada,409):falha(M.fichaNaoEncontrada,404);
  if(!fichaAceitaBem(ficha))throw recusa(M.fichaNaoLiga,422);
  if(!podeMexer(sessao,ficha))throw semPermissao(ficha);
  const bem=bens[bemId];
  if(!bem)throw lixeiraBens.has(bemId)?recusa(M.bemExcluido,409):recusa(M.bemNaoEncontrado,404);
  const outraFicha=todas.find(f=>f.id!==ativoId&&f.bemId===bemId),outroBem=Object.entries(bens).find(([id,b])=>id!==bemId&&b.origemAtivoId===ativoId);
  if((ficha.bemId===bemId||bem.origemAtivoId===ativoId)&&[undefined,'',bemId].includes(ficha.bemId)&&[undefined,'',ativoId].includes(bem.origemAtivoId)&&!outraFicha&&!outroBem)return {jaLigado:true,ficha:projetarFicha(ficha)};
  if(fichaBaixada(ficha))throw recusa(M.fichaBaixada,409);
  if(bem.situacao==='baixado')throw recusa(M.bemBaixado,409);
  if(corpo.versaoFicha!==(ficha.atualizadoEm||''))throw falha(M.fichaMudou,409);
  if(corpo.versaoBem!==(bem.atualizadoEm||''))throw falha(M.bemMudou,409);
  if(ficha.bemId||outroBem)throw recusa(M.fichaJaLigada(etiqueta(ficha.bemId?bens[ficha.bemId]:outroBem[1])),409);
  if(bem.origemAtivoId)throw recusa(M.bemJaLigado(rotulo(todas.find(f=>f.id===bem.origemAtivoId),sessao)),409);
  if(outraFicha)throw recusa(M.bemJaLigado(rotulo(outraFicha,sessao)),409);
  const e=evento({acao:'vinculado',ficha,bemId,sessao,via:'vincularFicha',lado:'ficha',tela});
  const gravada={...ficha,bemId,historicoVinculo:comEvento(ficha.historicoVinculo,e),atualizadoEm:versaoNova(ficha.atualizadoEm),atualizadoPor:sessao.nome||sessao.sub};
  gravarFicha(gravada);
  return {ficha:projetarFicha(gravada),evento:semPor(e)};
 }
 function desvincular(corpo,sessao){
  const tela=conferirPedido(corpo,sessao),{bemId,ativoId}=corpo;
  const ficha=fichas().find(f=>f.id===ativoId)||null,lixo=ficha?null:lixeiraFichas.get(ativoId)||null,bem=bens[bemId]||null;
  if((ficha||lixo)&&!podeMexer(sessao,ficha||lixo))throw semPermissao(ficha||lixo);
  const e1=!!bem&&bem.origemAtivoId===ativoId,e2=!!ficha&&ficha.bemId===bemId,e3=!!lixo&&lixo.bemId===bemId;
  if(!e1&&!e2&&!e3)return {jaDesfeito:true,ficha:ficha?projetarFicha(ficha):null,bem:bem?{id:bemId,...structuredClone(bem)}:null};
  if(e1&&corpo.versaoBem!==(bem.atualizadoEm||''))throw falha(M.bemMudou,409);
  if(ficha&&corpo.versaoFicha!==(ficha.atualizadoEm||''))throw falha(M.fichaMudou,409);
  const outro=e2&&Object.entries(bens).find(([id,b])=>id!==bemId&&b.origemAtivoId===ativoId);
  if(outro)throw recusa(M.outroBemNaFicha(etiqueta(outro[1])),409);
  const e=evento({acao:'desvinculado',ficha:ficha||lixo,bemId,sessao,via:'desvincularFicha',lado:e1&&(e2||e3)?'ambos':e1?'bem':'ficha',tela});
  let bemGravado=null,fichaGravada=null;
  if(e1){const {origemAtivoId:_o,...resto}=bem;bemGravado={...resto,historico:comEvento(bem.historico,e),atualizadoEm:versaoNova(bem.atualizadoEm),atualizadoPor:sessao.sub,atualizadoPorNome:sessao.nome||sessao.sub};bens[bemId]=bemGravado;}
  if(ficha){fichaGravada={...ficha,...(e2?{bemId:''}:{}),historicoVinculo:comEvento(ficha.historicoVinculo,e),atualizadoEm:versaoNova(ficha.atualizadoEm),atualizadoPor:sessao.nome||sessao.sub};gravarFicha(fichaGravada);}
  if(e3)lixeiraFichas.set(ativoId,{...lixo,bemId:'',historicoVinculo:comEvento(lixo.historicoVinculo,e)});
  return {ficha:fichaGravada?projetarFicha(fichaGravada):null,bem:bemGravado?{id:bemId,...structuredClone(bemGravado)}:null,evento:semPor(e)};
 }
 function historico(corpo,sessao){
  if(!tem(sessao,'inventario-valores'))throw falha(M.semInventario,403);
  if(typeof corpo.bemId!=='string'||!ID.test(corpo.bemId))throw falha(M.idInvalido,422);
  const bem=bens[corpo.bemId];if(!bem)throw falha(M.bemNaoEncontrado,404);
  const todos=[...(bem.historico||[]).filter(e=>['vinculado','desvinculado'].includes(e?.acao)),...[...fichas(),...lixeiraFichas.values()].flatMap(f=>f.historicoVinculo||[]).filter(e=>e?.bemId===corpo.bemId)];
  const vistos=new Set(),eventos=[];
  for(const e of todos.sort((a,b)=>String(b.em).localeCompare(String(a.em)))){
   if(!e?.id||vistos.has(e.id))continue;vistos.add(e.id);
   const oculto=e.familia==='seguranca'&&!tem(sessao,'seguranca');
   eventos.push({id:e.id,acao:e.acao,ativoId:oculto?'':e.ativoId,familia:e.familia,nome:oculto?'Ficha de Segurança':e.nome,bemCodigo:e.bemCodigo||'',porNome:e.porNome||'',em:e.em,via:e.via||'',tela:e.tela||'',motivo:e.motivo||''});
   if(eventos.length===100)break;
  }
  return {eventos};
 }
 // Fichas de Segurança que quem não tem Segurança não vê: só o par de IDs.
 const ocultos=sessao=>tem(sessao,'inventario-valores')&&!tem(sessao,'seguranca')?fichas().filter(f=>f.tipo==='seguranca').map(f=>({ativoId:f.id,bemId:String(f.bemId||'')})):[];
 // Formulários das fichas (salvarFisico, salvarTelefonia): bemId só liga.
 function conferirFormulario(it,anterior,sessao,via){
  if(it.bemId===undefined||it.bemId===(anterior?.bemId||''))return {};
  if(anterior?.bemId&&it.bemId)throw recusa(M.trocaPeloFormulario,409);
  const ficha={...(anterior||{}),...it,id:anterior?.id||it.id||it.cadastroId};
  if(!it.bemId)return {historicoVinculo:comEvento(anterior?.historicoVinculo,evento({acao:'desvinculado',ficha,bemId:anterior.bemId,sessao,via,lado:'ficha'}))};
  const bem=bens[it.bemId];if(!bem)throw recusa(M.bemNaoEncontrado,404);
  // Tela antiga: o par legado só pelo bem já existe; a baixa não recusa a gravação.
  const legado=bem.origemAtivoId===ficha.id;
  if(bem.situacao==='baixado'&&!legado)throw recusa(M.bemBaixado,409);
  const outraFicha=fichas().find(f=>f.id!==ficha.id&&f.bemId===it.bemId);
  if((bem.origemAtivoId&&bem.origemAtivoId!==ficha.id)||outraFicha)throw recusa(M.bemJaLigado(rotulo(outraFicha||fichas().find(f=>f.id===bem.origemAtivoId),sessao)),409);
  if(fichaBaixada(ficha)&&!legado)throw recusa(M.fichaBaixada,409);
  return {historicoVinculo:comEvento(anterior?.historicoVinculo,evento({acao:'vinculado',ficha,bemId:it.bemId,sessao,via,lado:'ficha'}))};
 }
 return {vincular,desvincular,historico,ocultos,conferirFormulario};
}
