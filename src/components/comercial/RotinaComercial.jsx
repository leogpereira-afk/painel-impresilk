import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Plus,ArrowUpRight,AlertCircle,Target} from 'lucide-react';
import {filtrarFilaPrioridades} from '../../lib/calc/apresentacaoComercial.js';
import {getCrm} from '../../services/crm.js';
import {normal,pertence} from '../../../supabase/functions/_shared/comercial.mjs';
import {alertasComerciais,TIPOS_ACAO,FASES_ACAO} from '../../../supabase/functions/_shared/relacionamento-comercial.mjs';
const data=d=>d?d.slice(0,10).split('-').reverse().join('/'):'Combinar data';
const moeda=v=>v==null?'Valor não informado':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function RotinaComercial({r,dados,filtro,abrirAcao,abrirOrc,abrirCliente,grupoInicial='todas',aoGrupo}){
 const [limite,setLimite]=useState(8),[crm,setCrm]=useState(null),[erroCrm,setErroCrm]=useState(''),[consulta,setConsulta]=useState(0);
 const grupo=grupoInicial;
 useEffect(()=>{const ctl=new AbortController();setErroCrm('');getCrm(ctl.signal).then(c=>{if(!ctl.signal.aborted)setCrm(c);}).catch(e=>{if(!ctl.signal.aborted)setErroCrm(e.message);});return()=>ctl.abort();},[consulta]);
 const escopo=useMemo(()=>({...dados.escopo,nomes:dados.catalogo.vendedores.filter(v=>!dados.escopo.ids||dados.escopo.ids.includes(String(v.id))).filter(v=>dados.catalogo.vendedores.filter(x=>normal(x.nome)===normal(v.nome)).length===1).map(v=>normal(v.nome))}),[dados]);
 const funil=(crm?.cards||[]).filter(c=>pertence(c,escopo,'responsavel'));
 const semIds=new Set((r.semProximaAcao||[]).map(o=>String(o.id)));
 const prioridades=[...r.prioridades];
 const temMotivo=(a,tipo)=>a.tipo===tipo||(a.motivos||[]).some(m=>m.tipo===tipo);
 const grupos=[['todas','Minha fila',()=>true],['atrasadas','Atrasados',a=>temMotivo(a,'Retorno atrasado')],['hoje','Hoje',a=>temMotivo(a,'Retorno de hoje')],['programadas','Programados',a=>temMotivo(a,'Retorno programado')],['sem_acao','Sem próximo passo',a=>semIds.has(String(a.orcamentoId))||temMotivo(a,'Sem próxima ação')],['pendencias','Pendências',a=>!!a.pendencias||temMotivo(a,'Negociação com pendência')],['relacionamento','Prospecção e pós-venda',a=>a.tipoAcao&&a.tipoAcao!=='acompanhamento']];
 const escolhido=grupos.find(g=>g[0]===grupo)||grupos[0];
 const itens=filtrarFilaPrioridades(r,escolhido[0]);
 const linkFunil=`/orcamentos/mesa?${new URLSearchParams({...filtro,aba:'crm',vendedoraNome:dados.catalogo.vendedores.find(v=>String(v.id)===String(filtro.vendedor||dados.escopo.vendedorId))?.nome||''}).toString()}`;
 const alertas=alertasComerciais({...dados,fontes:{...dados.fontes,...(crm?{crm:{atualizadoEm:crm.atualizadoEm}}:{})}});
 const semResponsavel=funil.filter(c=>!c.responsavel).length;
 const fases=[...new Set(funil.map(c=>c.fase).filter(Boolean))].map(fase=>({fase,q:funil.filter(c=>c.fase===fase).length}));
 return <section className="com-card com-priorities">
  <div className="com-section-head"><div><p className="com-eyebrow">SEU PRÓXIMO PASSO</p><h2>Por onde começar</h2><p className="com-muted">Atenda os atrasados, os retornos de hoje e as oportunidades prioritárias.</p></div><button className="btn-outline" onClick={()=>abrirAcao()}><Plus size={16}/>Próxima ação</button></div>
  <div className="com-priority-filters" role="group" aria-label="Filtrar prioridades">{grupos.filter(([id])=>['todas','atrasadas','hoje'].includes(id)).map(([id,nome,teste])=><button key={id} aria-pressed={grupo===id} onClick={()=>{aoGrupo(id);setLimite(8);}}>{nome}<span>{prioridades.filter(teste).length}</span></button>)}
   <details className="com-pos-more-filters"><summary className={!['todas','atrasadas','hoje'].includes(grupo)?'is-selected':''}>{['todas','atrasadas','hoje'].includes(grupo)?'Mais':grupo==='funil'?'Funil do ERP':escolhido[1]}</summary><div>
    {grupos.filter(([id])=>!['todas','atrasadas','hoje'].includes(id)).map(([id,nome,teste])=><button key={id} aria-pressed={grupo===id} onClick={e=>{aoGrupo(id);setLimite(8);const menu=e.currentTarget.closest('details');menu.open=false;menu.querySelector('summary')?.focus();}}>{nome}<span>{prioridades.filter(teste).length}</span></button>)}
    <button aria-pressed={grupo==='funil'} onClick={e=>{aoGrupo('funil');setLimite(8);const menu=e.currentTarget.closest('details');menu.open=false;menu.querySelector('summary')?.focus();}}>Funil do ERP<span>{crm?funil.length:'…'}</span></button>
   </div></details>
  </div>
  {grupo==='funil'?<><p className="com-muted">Etapas do ERP são diferentes de retornos agendados. Oportunidades e propostas não são somadas como vendas.</p>{erroCrm?<p role="alert" className="com-alert">{erroCrm} <button onClick={()=>setConsulta(n=>n+1)}>Tentar novamente</button></p>:!crm?<p role="status">Consultando funil…</p>:<><div className="com-funnel-phases">{fases.map(f=><span key={f.fase}>{f.fase} <b>{f.q}</b></span>)}</div>{[...funil].sort((a,b)=>String(a.ultimaInteracao||a.criadoEm||'').localeCompare(String(b.ultimaInteracao||b.criadoEm||''))).slice(0,limite).map(c=><article key={c.id} className="com-priority-item"><div className="com-priority-top"><span className="com-status today">{c.fase}</span><b>{moeda(c.valor)}</b></div><h3>{c.cliente||'Cliente a identificar'}</h3><p>{c.titulo}</p><div className="com-priority-bottom"><small>{c.responsavel||'Responsável não localizado'} · Última interação: {data(c.ultimaInteracao)}</small><Link className="com-link" to={linkFunil}>Conferir no funil <ArrowUpRight size={14}/></Link></div>{c.clienteId&&<button className="com-link" onClick={()=>abrirAcao({clienteId:String(c.clienteId),cliente:c.cliente,tipoAcao:'relacionamento',objetivo:c.titulo,descricao:'Combinar o próximo passo desta oportunidade',vendedorNome:c.responsavel})}>Planejar ação com este cliente</button>}</article>)}{!funil.length&&<p className="com-empty">Nenhuma oportunidade autorizada neste recorte.</p>}{funil.length>limite&&<button className="btn-outline com-show-more" onClick={()=>setLimite(n=>n+8)}>Mostrar mais oportunidades</button>}</>}</>:<><div className="com-priority-list com-compact-queue">{itens.slice(0,limite).map(a=>{
   const o=dados.base.orcamentos.find(o=>String(o.id)===String(a.orcamentoId));
   const originais=dados.base.acoes.filter(x=>x.id===a.id||x.id===a.acaoId||(a.acaoIds||[]).includes(x.id));
   const original=originais.find(x=>x.id===a.id)||originais.filter(x=>x.status!=='concluida').sort((x,y)=>String(x.data).localeCompare(String(y.data))||String(x.id).localeCompare(String(y.id)))[0]||originais[0];
   const alvo=original?{...a,...original}:a;
   const contato=a.ultimoContato||a.ultimaInteracao||alvo.contatoEm||o?.ultimoContatoConfirmado||o?.ultimaAcao?.contatoEm;
   const motivos=a.motivos?.length?a.motivos:[{tipo:a.tipo,descricao:a.tipo}];
   const cliente=(r.clientes||[]).find(c=>String(c.id)===String(a.clienteId))||dados.base.clientes.find(c=>String(c.id)===String(a.clienteId));
   const abrirRegistro=(extra={})=>abrirAcao({...alvo,telefone:o?.celular||cliente?.telefone||cliente?.celular,...extra});
   return <article className={`com-priority-item com-queue-row ${temMotivo(a,'Retorno atrasado')?'is-late':''}`} key={a.id}>
    <div className="com-queue-main"><div className="com-queue-client"><h3>{a.cliente||'Cliente a identificar'}</h3>{a.valor!=null&&<b>{moeda(a.valor)}</b>}</div>
     <div className="com-queue-reasons">{motivos.map((m,i)=><span key={m.codigo||`${m.tipo}-${i}`} title={m.descricao||m.tipo} className={`com-status ${m.tipo==='Retorno atrasado'?'danger':m.tipo==='Retorno de hoje'?'today':'attention'}`}>{m.tipo||m.descricao}</span>)}{alvo.esperaJustificada&&<span className="com-status">Espera justificada</span>}</div>
     <p className="com-priority-action">{alvo.descricao}</p><p className="com-queue-context">{o?`Orçamento #${o.numero} · `:alvo.ordemNumero?`O.S. #${alvo.ordemNumero} · `:TIPOS_ACAO[alvo.tipoAcao]?`${TIPOS_ACAO[alvo.tipoAcao]} · `:''}{alvo.fase&&<span>{FASES_ACAO[alvo.fase]||alvo.fase} · </span>}Retorno: {data(alvo.data)} · Contato confirmado: {contato?data(contato):'Sem registro'}</p>
     <small>{alvo.vendedorNome||dados.catalogo.vendedores.find(v=>String(v.id)===String(alvo.vendedorId))?.nome||'Responsável a conferir'}</small>
     {alvo.esperaJustificada&&<p className="com-queue-wait">{alvo.justificativaEspera} · Revisão: {data(alvo.revisaoEm)}</p>}
     {!!alvo.pendencias&&<p className="com-queue-wait">Pendência: {alvo.pendencias}</p>}
    </div>
    <div className="com-queue-actions"><button className="btn-primary" onClick={()=>abrirRegistro({registroRapido:true,status:'pendente'})}>Registrar contato</button><details className="com-row-options"><summary>Mais opções</summary><div>    {o&&<button className="com-link" onClick={()=>abrirOrc(r.propostasDisponiveis.find(p=>String(p.id)===String(o.id))||o)}>Orçamento</button>}{abrirCliente&&cliente&&<button className="com-link" onClick={()=>abrirCliente(cliente)}>Cliente</button>}<button className="com-link" onClick={()=>abrirRegistro({registroRapido:false,status:'pendente'})}>{original||a.origem==='mesa'?'Reagendar':'Agendar retorno'}</button>{((original&&original.status!=='concluida')||a.origem==='mesa')&&<button className="com-link" onClick={()=>abrirRegistro({registroRapido:true,status:'concluida'})}>Concluir</button>}</div></details></div>
    {originais.length>1&&<details className="com-queue-linked"><summary>{originais.length} ações vinculadas a esta negociação</summary>{originais.map(x=><p key={x.id}><button className="com-link" onClick={()=>abrirAcao(x)}>{x.descricao} · {data(x.data)}</button></p>)}</details>}
   </article>;
  })}</div>{!itens.length&&<div className="com-empty"><Target size={22}/><strong>Nenhuma ação registrada neste filtro.</strong><p>Confira também propostas sem próximo passo e o funil do ERP.</p></div>}{itens.length>limite&&<button className="btn-outline com-show-more" onClick={()=>setLimite(n=>n+8)}>Mostrar mais {Math.min(8,itens.length-limite)} ações</button>}</>}
  <details className={`com-data-health ${alertas.length||semResponsavel?'has-alert':''}`}><summary><AlertCircle size={15}/>Conferência das informações{alertas.length||semResponsavel?` · ${alertas.length+Number(semResponsavel>0)} para conferir`:' · fontes disponíveis'}</summary>{alertas.map(a=><p key={a.id}>{a.texto}</p>)}{!!semResponsavel&&<p>{semResponsavel} oportunidade(s) do funil sem responsável identificado. Conferir o vínculo na origem.</p>}<p>Funil: {crm?.atualizadoEm?new Date(crm.atualizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'ainda não consultado'}. <Link to={linkFunil}>Abrir gestão do funil</Link></p></details>
 </section>;
}
