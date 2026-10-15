import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Search,RefreshCw,ClipboardCheck,CalendarDays} from 'lucide-react';
import {chamarComercial} from '../../services/comercial.js';
import {ymdLocal} from '../../lib/format.js';
import {carregarEntregasPosVenda,resumirPosVenda,estadoPosVenda,dataReferenciaPosVenda} from '../../lib/calc/posVendaComercial.js';
const data=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Não informada';
const carimbo=d=>d&&Number.isFinite(Date.parse(d))?new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informado';
const filtros=[['pendentes','Pendentes'],['sem_acao','Sem ação'],['atrasados','Atrasados'],['programados','Programados'],['concluidos','Concluídos'],['a_conferir','A conferir'],['todos','Todos']];
const rotulos={sem_acao:'Sem ação definida',atrasados:'Retorno atrasado',programados:'Programado',concluidos:'Concluído',a_conferir:'Conclusão a conferir'};
export default function PosVendaComercial({filtro,abrirPedido,abrirAcao,dados,revisao=0}){
 const [params,setParams]=useSearchParams(),[carga,setCarga]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true),[tentativa,setTentativa]=useState(0),[limite,setLimite]=useState(20);
 const chave=JSON.stringify({vendedor:filtro.vendedor||'',equipe:filtro.equipe||''});
 const d=carga?.chave===chave?carga.d:null;
 const busca=params.get('pos_busca')||'',situacao=filtros.some(([s])=>s===params.get('pos_situacao'))?params.get('pos_situacao'):'pendentes',hoje=ymdLocal(new Date());
 const r=resumirPosVenda(d?.pedidos||[],{busca,situacao},hoje);
 const mudar=(campo,v)=>{setParams(atuais=>{const p=new URLSearchParams(atuais);v?p.set(campo,v):p.delete(campo);return p;},{replace:true});setLimite(20);};
 useEffect(()=>{
  const ctl=new AbortController();setCarregando(true);setErro('');
  carregarEntregasPosVenda(chamarComercial,{filtro:JSON.parse(chave),signal:ctl.signal,aoAtualizar:atual=>{if(!ctl.signal.aborted)setCarga({chave,d:atual});}}).catch(e=>{if(!ctl.signal.aborted)setErro(e.message);}).finally(()=>{if(!ctl.signal.aborted)setCarregando(false);});
  return()=>ctl.abort();
 },[chave,revisao,tentativa]);
 const responsavel=a=>dados?.catalogo?.vendedores.find(v=>String(v.id)===String(a?.vendedorId))?.nome||a?.vendedorNome||'Responsável a conferir';
 function planejar(p,contato=false,concluir=false){
  const existente=p.acaoPosVenda;
  const a=existente||{tipoAcao:'pos_venda',clienteId:p.clienteId,cliente:p.cliente,ordemId:p.id,ordemNumero:p.numero,vendedorId:p.vendedorId,vendedorNome:p.vendedorNome,descricao:'Conferir satisfação após entrega',objetivo:'Conferir satisfação, ajustes e novas necessidades'};
  abrirAcao({...a,...(contato?{registroRapido:true}:{}),...(concluir?{status:'concluida'}:{})});
 }
 return <section className="com-posvenda" aria-label="Pós-venda">
  <div className="com-section-head"><div><h2>Pós-venda</h2><p className="com-muted">Entregou? Combine a próxima ação e registre o que foi feito com o cliente.</p></div><button className="btn-outline" disabled={carregando} onClick={()=>setTentativa(n=>n+1)}><RefreshCw size={15}/>{carregando?'Conferindo entregas…':'Atualizar entregas'}</button></div>
  <p className="com-pos-scope">{dados?.escopo?.gestor?'Controle da direção':'Minha carteira'} · {filtro.vendedor?dados?.catalogo?.vendedores.find(v=>String(v.id)===String(filtro.vendedor))?.nome||'Vendedor selecionado':filtro.equipe?'Equipe selecionada':dados?.escopo?.gestor?'Toda a equipe':'Entregas autorizadas'} · Independente do período das vendas</p>
  <div className="com-relationship-tools"><label className="com-relationship-search"><Search size={17}/><input type="search" aria-label="Buscar O.S., cliente, vendedor ou ação" placeholder="O.S., cliente, vendedor ou ação" value={busca} onChange={e=>mudar('pos_busca',e.target.value)}/></label></div>
  <div className="com-priority-filters" role="group" aria-label="Situação do pós-venda">{filtros.map(([id,nome])=><button key={id} aria-pressed={situacao===id} onClick={()=>mudar('pos_situacao',id)}>{nome}<span>{d?r.contagens[id]:'—'}</span></button>)}</div>
  {carregando&&<p role="status" className="com-source-note">Conferindo o histórico no PCP{d?`: ${d.verificados} de ${d.totalCandidatos} pedidos consultados`:'…'}. As entregas aparecem a cada etapa.</p>}
  {erro&&<p role="alert" className="com-alert">{erro} {d?'As entregas já consultadas foram mantidas; a lista pode estar incompleta.':'Os dados estão indisponíveis; isso não significa ausência de entregas.'} <button className="com-link" onClick={()=>setTentativa(n=>n+1)}>Tentar novamente</button></p>}
  {d&&<><p className="com-pos-coverage">{d.finalizada?'Consulta encerrada':'Contagens parciais'} · {d.pedidos.length} O.S. entregues identificadas em {d.verificados} de {d.totalCandidatos} pedidos consultados. Os filtros contam as O.S. identificadas{busca?' com esta busca':''}.</p>{(!d.coberturaCompleta||!d.finalizada)&&<p className="com-coverage">{carregando?'A conferência continua.':'Cobertura parcial: há histórico ou vínculos de entrega a conferir.'} Ausência de resultado não comprova que todos os pós-vendas foram realizados.</p>}</>}
  {!!r.itens.length&&<div className="com-pos-list" aria-label="O.S. entregues para pós-venda">
   <div className="com-pos-list-head" aria-hidden="true"><span>Cliente / O.S.</span><span>Responsáveis</span><span>Acompanhamento</span><span>Ações</span></div>
   {r.itens.slice(0,limite).map(p=>{
    const a=p.acaoPosVenda,e=estadoPosVenda(p,hoje),u=p.ultimaInteracao||a?.ultimaInteracao;
    return <article className={`com-pos-row is-${e}`} key={p.id} aria-label={`Pós-venda da O.S. ${p.numero}`}>
     <div className="com-pos-order"><button className="com-link" onClick={()=>abrirPedido(p)}>O.S. #{p.numero||p.id}</button><h3>{p.cliente||'Cliente a conferir'}</h3><small>Entrega comprovada: {data(p.entregaRealEm)}</small>{p.trabalho&&<p>{p.trabalho}</p>}</div>
     <div className="com-pos-owner"><span>Venda</span><strong>{p.vendedorNome||'Vendedor a conferir'}</strong><span>Pós-venda</span><strong>{a?responsavel(a):p.vendedorNome||'A definir'}</strong></div>
     <div className="com-pos-follow"><span className={`com-status ${e==='atrasados'?'danger':e==='concluidos'?'done':e==='sem_acao'||e==='a_conferir'?'attention':''}`}>{rotulos[e]}</span>
      {a?<><p>{e==='concluidos'?'Última ação':'Próxima ação'}: <b>{a.descricao}</b></p><small><CalendarDays size={13}/>{e==='concluidos'?'Atendimento confirmado':'Prazo'}: {data(dataReferenciaPosVenda(p))}</small></>:<p>{p.posVendaBloqueado?p.motivoPosVenda||'O vínculo deste pós-venda precisa ser conferido pela direção.':e==='a_conferir'?'Há uma conclusão anterior sem atendimento comprovado. Confira o histórico e registre o resultado.':'Defina o que será feito após a entrega e combine uma data.'}</p>}
      {u?<details className="com-pos-last"><summary>Último atendimento · {data(u.em)}</summary><p><b>O que foi feito:</b> {u.relatoAtendimento||'Relato não informado no registro anterior.'}</p><p><b>Resultado:</b> {u.resultado||'Não informado'}</p>{u.nota&&u.nota!==u.relatoAtendimento&&u.nota!==u.resultado&&<p>{u.nota}</p>}<small>{u.autor||'Autoria não informada'} · {carimbo(u.em)}</small></details>:<small>Atendimento realizado: sem registro confirmado.</small>}
     </div>
     <div className="com-pos-actions">{p.posVendaBloqueado?<small>Peça à direção para conferir o vínculo antes de registrar outro atendimento.</small>:<>{e!=='concluidos'&&<button className="btn-primary com-pos-execute" onClick={()=>planejar(p,true)}><ClipboardCheck size={15}/>Fazer ação</button>}<button className="com-link" onClick={()=>planejar(p)}>{a?e==='concluidos'?'Ver histórico / reabrir':'Planejar / reagendar':'Definir ação'}</button>{e!=='concluidos'&&<button className="com-link" onClick={()=>planejar(p,true,true)}>Registrar e finalizar</button>}</>}</div>
    </article>;
   })}
  </div>}
  {d&&!r.itens.length&&!carregando&&<div className="com-empty"><ClipboardCheck size={23}/><strong>Nenhuma O.S. identificada neste filtro.</strong><p>{d.finalizada&&d.coberturaCompleta?'Consulte outra situação ou ajuste a busca.':'Confira a cobertura da consulta antes de interpretar a lista vazia.'}</p></div>}
  {r.itens.length>limite&&<button className="btn-outline com-show-more" onClick={()=>setLimite(n=>n+20)}>Mostrar mais {Math.min(20,r.itens.length-limite)} O.S.</button>}
  {d&&<small className="com-source-note">Fonte: O.S. sincronizadas do Mubisys, entrega comprovada no PCP e ações do Painel. Consulta: {carimbo(d.consultadoEm)}.</small>}
 </section>;
}
