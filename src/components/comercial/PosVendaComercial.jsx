import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Search,RefreshCw,ClipboardCheck,CalendarDays} from 'lucide-react';
import {chamarComercial} from '../../services/comercial.js';
import {ymdLocal} from '../../lib/format.js';
import {carregarEntregasPosVenda,resumirPosVenda,estadoPosVenda,dataReferenciaPosVenda,chaveVendedorPosVenda,vendedoresPosVenda,diasDesdeEntrega,VENDAS_DESDE_POS_VENDA} from '../../lib/calc/posVendaComercial.js';
const data=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Não informada';
const carimbo=d=>d&&Number.isFinite(Date.parse(d))?new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informado';
const filtros=[['pendentes','Pendentes'],['sem_acao','Sem ação'],['atrasados','Atrasados'],['programados','Programados'],['concluidos','Concluídos'],['a_conferir','A conferir'],['todos','Todos']];
const rotulos={sem_acao:'Sem ação definida',atrasados:'Retorno atrasado',programados:'Programado',concluidos:'Concluído',a_conferir:'Conclusão a conferir'};
export default function PosVendaComercial({filtro,abrirPedido,abrirAcao,dados,revisao=0}){
 const [params,setParams]=useSearchParams(),[carga,setCarga]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true),[tentativa,setTentativa]=useState(0),[limite,setLimite]=useState(20);
 const chave=JSON.stringify({vendedor:filtro.vendedor||'',equipe:filtro.equipe||''});
 const d=carga?.chave===chave?carga.d:null;
 const busca=params.get('pos_busca')||'',situacao=filtros.some(([s])=>s===params.get('pos_situacao'))?params.get('pos_situacao'):'pendentes',hoje=ymdLocal(new Date());
 const vendedor=params.get('pos_vendedor')||'';
 const geral=resumirPosVenda(d?.pedidos||[],{busca,situacao},hoje);
 const vendedores=vendedoresPosVenda(geral.itens,dados?.catalogo?.vendedores||[]);
 const r=resumirPosVenda((d?.pedidos||[]).filter(p=>!vendedor||chaveVendedorPosVenda(p)===vendedor),{busca,situacao},hoje);
 const mudar=(campo,v)=>{setParams(atuais=>{const p=new URLSearchParams(atuais);v?p.set(campo,v):p.delete(campo);return p;},{replace:true});setLimite(20);};
 useEffect(()=>{
  const ctl=new AbortController();setCarregando(true);setErro('');
  carregarEntregasPosVenda(chamarComercial,{filtro:JSON.parse(chave),vendasDesde:VENDAS_DESDE_POS_VENDA,signal:ctl.signal,aoAtualizar:atual=>{if(!ctl.signal.aborted)setCarga({chave,d:atual});}}).catch(e=>{if(!ctl.signal.aborted)setErro(e.message);}).finally(()=>{if(!ctl.signal.aborted)setCarregando(false);});
  return()=>ctl.abort();
 },[chave,revisao,tentativa]);
 const responsavel=a=>dados?.catalogo?.vendedores.find(v=>String(v.id)===String(a?.vendedorId))?.nome||a?.vendedorNome||'Responsável a conferir';
 function planejar(p,contato=false,concluir=false){
  const existente=p.acaoPosVenda;
  const a=existente||{tipoAcao:'pos_venda',clienteId:p.clienteId,cliente:p.cliente,ordemId:p.id,ordemNumero:p.numero,vendedorId:p.vendedorId,vendedorNome:p.vendedorNome,descricao:'Conferir satisfação após entrega',objetivo:'Conferir satisfação, ajustes e novas necessidades'};
  abrirAcao({...a,...(contato?{registroRapido:true}:{}),...(concluir?{status:'concluida'}:{})});
 }
 return <section className="com-posvenda" aria-label="Pós-venda">
  <div className="com-section-head"><div><h2>Pós-venda</h2><p className="com-muted">Vendedor da O.S. vinculado · ação, prazo e atendimento em um só lugar.</p></div><button className="btn-outline" disabled={carregando} onClick={()=>setTentativa(n=>n+1)}><RefreshCw size={15}/>{carregando?'Conferindo…':'Atualizar'}</button></div>
  <p className="com-pos-scope">{dados?.escopo?.gestor?'Controle da direção':'Minha carteira'} · {filtro.vendedor?dados?.catalogo?.vendedores.find(v=>String(v.id)===String(filtro.vendedor))?.nome||'Vendedor selecionado':filtro.equipe?'Equipe selecionada':dados?.escopo?.gestor?'Toda a equipe':'Entregas autorizadas'} · Vendas desde {data(VENDAS_DESDE_POS_VENDA)}</p>
  <div className="com-relationship-tools"><label className="com-relationship-search"><Search size={17}/><input type="search" aria-label="Buscar O.S., cliente, vendedor ou ação" placeholder="O.S., cliente, vendedor ou ação" value={busca} onChange={e=>mudar('pos_busca',e.target.value)}/></label></div>
  <div className="com-priority-filters" role="group" aria-label="Situação do pós-venda">
   {filtros.filter(([id])=>['pendentes','atrasados','concluidos'].includes(id)).map(([id,nome])=><button key={id} aria-pressed={situacao===id} onClick={()=>mudar('pos_situacao',id)}>{nome}<span>{d?r.contagens[id]:'—'}</span></button>)}
   <details className="com-pos-more-filters"><summary className={!['pendentes','atrasados','concluidos'].includes(situacao)?'is-selected':''}>{['pendentes','atrasados','concluidos'].includes(situacao)?'Mais':filtros.find(([id])=>id===situacao)?.[1]}{!['pendentes','atrasados','concluidos'].includes(situacao)&&<span>{d?r.contagens[situacao]:'—'}</span>}</summary>
    <div>{filtros.filter(([id])=>!['pendentes','atrasados','concluidos'].includes(id)).map(([id,nome])=><button key={id} aria-pressed={situacao===id} onClick={e=>{mudar('pos_situacao',id);const detalhes=e.currentTarget.closest('details');detalhes.open=false;detalhes.querySelector('summary')?.focus();}}>{nome}<span>{d?r.contagens[id]:'—'}</span></button>)}</div>
   </details>
  </div>
  <div className="com-pos-sellers" role="group" aria-label="Filtrar pós-venda por vendedor">
   <span>Vendedor</span><button aria-pressed={!vendedor} onClick={()=>mudar('pos_vendedor','')}>Todos <b>{d?geral.itens.length:'—'}</b></button>
   {vendedores.map(v=><button key={v.id} aria-pressed={vendedor===v.id} onClick={()=>mudar('pos_vendedor',v.id)}>{v.nome}<b>{v.total}</b></button>)}
   {vendedor&&!vendedores.some(v=>v.id===vendedor)&&<button aria-pressed="true" onClick={()=>mudar('pos_vendedor','')}>Sem resultados para o vendedor · limpar</button>}
   <small>Contagem na situação selecionada{d&&!d.finalizada?' · parcial':''}</small>
  </div>
  <div className={`com-pos-health ${erro?'has-error':''}`}>
   <span role={erro?'alert':'status'}>{erro?'Consulta interrompida · lista parcial':carregando?'Conferindo entregas…':d?.finalizada&&d?.coberturaCompleta?'Entregas conferidas':'Cobertura parcial'}{d&&` · ${d.pedidos.length} O.S. identificadas`}</span>
   {erro&&<button className="com-link" onClick={()=>setTentativa(n=>n+1)}>Tentar novamente</button>}
   <details><summary>Detalhes da consulta</summary>
    {erro&&<p>{erro} {d?'As entregas já consultadas foram mantidas; a lista pode estar incompleta.':'Os dados estão indisponíveis; isso não significa ausência de entregas.'}</p>}
    {d&&<p>{d.verificados} de {d.totalCandidatos} pedidos consultados. Os filtros contam as O.S. identificadas{busca?' com esta busca':''}. {(!d.coberturaCompleta||!d.finalizada)&&'Ausência de resultado não comprova que todos os pós-vendas foram realizados.'}</p>}
    {carregando&&<p>As entregas aparecem a cada etapa da consulta ao PCP.</p>}
   </details>
  </div>
  {!!r.itens.length&&<div className="com-pos-list" aria-label="O.S. entregues para pós-venda">
   <div className="com-pos-list-head" aria-hidden="true"><span>Cliente / O.S.</span><span>Vendedor vinculado</span><span>Acompanhamento</span><span>Ações</span></div>
   {r.itens.slice(0,limite).map(p=>{
    const dias=diasDesdeEntrega(p.entregaRealEm,hoje);
    const a=p.acaoPosVenda,e=estadoPosVenda(p,hoje),u=p.ultimaInteracao||a?.ultimaInteracao;
    const nome=p.vendedorNome||'Vendedor a conferir',nomeAcao=a?responsavel(a):nome;
    const divergente=!!a&&(a.vendedorId&&p.vendedorId?String(a.vendedorId)!==String(p.vendedorId):nomeAcao!==nome);
    return <article className={`com-pos-row is-${e}`} key={p.id} aria-label={`Pós-venda da O.S. ${p.numero}`}>
     <div className="com-pos-order"><button className="com-link" onClick={()=>abrirPedido(p)}>O.S. #{p.numero||p.id}</button><h3>{p.cliente||'Cliente a conferir'}</h3><small>Entrega comprovada: {data(p.entregaRealEm)}</small><span className="com-pos-age">{dias===null?'Data da entrega a conferir':dias===0?'Entregue hoje':`${dias} ${dias===1?'dia':'dias'} desde a entrega`}</span></div>
     <div className="com-pos-owner"><strong>{nome}</strong><small>{divergente?<>Pós-venda: {nomeAcao} · conferir vínculo</>:p.vendedorId||p.vendedorNome?'Venda e pós-venda':'Vínculo pendente de conferência'}</small></div>
     <div className="com-pos-follow"><span className={`com-status ${e==='atrasados'?'danger':e==='concluidos'?'done':e==='sem_acao'||e==='a_conferir'?'attention':''}`}>{rotulos[e]}</span>
      {a?<><p>{e==='concluidos'?'Última ação':'Próxima ação'}: <b>{a.descricao}</b></p><small><CalendarDays size={13}/>{e==='concluidos'?'Atendimento confirmado':'Prazo'}: {data(dataReferenciaPosVenda(p))}</small></>:<p>{p.posVendaBloqueado?p.motivoPosVenda||'O vínculo deste pós-venda precisa ser conferido pela direção.':e==='a_conferir'?'Há uma conclusão anterior sem atendimento comprovado. Confira o histórico e registre o resultado.':'Aguardando ação e prazo.'}</p>}
      <details className="com-pos-last"><summary>Detalhes{u?` · atendimento em ${data(u.em)}`:' e histórico'}</summary>{p.trabalho&&<p><b>Trabalho:</b> {p.trabalho}</p>}{u?<><p><b>O que foi feito:</b> {u.relatoAtendimento||'Relato não informado no registro anterior.'}</p><p><b>Resultado:</b> {u.resultado||'Não informado'}</p>{u.nota&&u.nota!==u.relatoAtendimento&&u.nota!==u.resultado&&<p>{u.nota}</p>}<small>{u.autor||'Autoria não informada'} · {carimbo(u.em)}</small></>:<small>Atendimento realizado: sem registro confirmado.</small>}</details>
     </div>
     <div className="com-pos-actions">{p.posVendaBloqueado?<small>Peça à direção para conferir o vínculo antes de registrar outro atendimento.</small>:<>{e!=='concluidos'&&<button className="btn-primary com-pos-execute" onClick={()=>planejar(p,true)}><ClipboardCheck size={15}/>Fazer ação</button>}<details className="com-pos-options"><summary>Mais ações</summary><button className="com-link" onClick={()=>planejar(p)}>{a?e==='concluidos'?'Ver histórico / reabrir':'Planejar / reagendar':'Definir ação'}</button>{e!=='concluidos'&&<button className="com-link" onClick={()=>planejar(p,true,true)}>Registrar e finalizar</button>}</details></>}</div>
    </article>;
   })}
  </div>}
  {d&&!r.itens.length&&!carregando&&<div className="com-empty"><ClipboardCheck size={23}/><strong>Nenhuma O.S. identificada neste filtro.</strong><p>{d.finalizada&&d.coberturaCompleta?'Consulte outra situação ou ajuste a busca.':'Confira a cobertura da consulta antes de interpretar a lista vazia.'}</p></div>}
  {r.itens.length>limite&&<button className="btn-outline com-show-more" onClick={()=>setLimite(n=>n+20)}>Mostrar mais {Math.min(20,r.itens.length-limite)} O.S.</button>}
  {d&&<small className="com-source-note">Fonte: O.S. sincronizadas do Mubisys, entrega comprovada no PCP e ações do Painel. Consulta: {carimbo(d.consultadoEm)}.</small>}
 </section>;
}
