import {useEffect,useRef,useState} from 'react';
import {Search,UserRound,ClipboardList,ChevronRight} from 'lucide-react';
import Dialogo from './DialogoComercial.jsx';
import {chamarComercial} from '../../services/comercial.js';
import {ymdLocal} from '../../lib/format.js';
import {TIPOS_ACAO,CANAIS,FASES_ACAO,BRIEFING_CAMPOS} from '../../../supabase/functions/_shared/relacionamento-comercial.mjs';
import {clienteCorresponde} from '../../../supabase/functions/_shared/consulta-clientes.mjs';
import ComercialDicas from '../ComercialDicas.jsx';
const dia=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Sem data';
const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function responsavel(inicial,dados,filtro){
 if(inicial?.vendedorId)return inicial.vendedorId;
 if(dados.escopo.vendedorId)return dados.escopo.vendedorId;
 const o=dados.base.orcamentos.find(o=>String(o.id)===String(inicial?.orcamentoId));
 const id=o?.vendedorErpId||o?.responsavelId;
 const encontrados=dados.catalogo.vendedores.filter(v=>id?String(v.id)===String(id):normal(v.nome)===normal(o?.vendedorNome||inicial?.vendedorNome));
 return encontrados.length===1?String(encontrados[0].id):filtro.vendedor||'';
}
export default function AcaoComercial({inicial,dados,filtro,salvo,fechar}){
 const [a,setA]=useState(()=>({clienteId:'',orcamentoId:'',ordemId:'',tipoAcao:'acompanhamento',descricao:'',data:ymdLocal(new Date()),nota:'',pendencias:'',decisao:'',status:'pendente',objetivo:'',estrategia:'',resultado:'',canal:'outro',fase:'planejada',prioridade:'normal',briefing:{},...inicial,vendedorId:responsavel(inicial,dados,filtro),id:inicial?.versao?inicial.id:crypto.randomUUID()}));
 const [busca,setBusca]=useState(''),[encontrados,setEncontrados]=useState(null),[buscando,setBuscando]=useState(false),[erroBusca,setErroBusca]=useState('');
 const [ctx,setCtx]=useState(null),[carregando,setCarregando]=useState(false),[erroContexto,setErroContexto]=useState(''),[tentativa,setTentativa]=useState(0);
 const [erro,setErro]=useState(''),[salvando,setSalvando]=useState(false),[mostrarGuias,setMostrarGuias]=useState(false);
 const buscaControle=useRef(null),filtroChave=JSON.stringify(filtro);
 const set=(k,v)=>setA(x=>({...x,[k]:v}));
 useEffect(()=>()=>buscaControle.current?.abort(),[]);
 useEffect(()=>{
  setCtx(null);setErroContexto('');if(!a.clienteId||a.prospecto){setCarregando(false);return;}
  const ctl=new AbortController();setCarregando(true);
  chamarComercial('contextoRelacionamento',{clienteId:a.clienteId,filtro:JSON.parse(filtroChave)},ctl.signal).then(r=>{if(!ctl.signal.aborted)setCtx(r);}).catch(e=>{if(!ctl.signal.aborted)setErroContexto(e.message);}).finally(()=>{if(!ctl.signal.aborted)setCarregando(false);});
  return()=>ctl.abort();
 },[a.clienteId,a.prospecto,filtroChave,tentativa]);
 const selecionado=ctx?.cliente||dados.base.clientes.find(c=>String(c.id)===String(a.clienteId))||(a.clienteId?{nome:a.cliente,documento:a.clienteDocumento,responsavel:a.responsavelCarteira}:null);
 const locais=[...new Map(dados.base.acoes.filter(x=>x.prospecto).map(x=>[x.prospecto.id,x.prospecto])).values()].filter(p=>clienteCorresponde(p,busca));
 function buscarValor(v){buscaControle.current?.abort();setBusca(v);setEncontrados(null);setErroBusca('');setBuscando(false);}
 async function buscar(){
  buscaControle.current?.abort();const ctl=new AbortController();buscaControle.current=ctl;setBuscando(true);setErroBusca('');setEncontrados(null);
  try{const r=await chamarComercial('consultarClientes',{busca:busca.trim(),filtro},ctl.signal);if(!ctl.signal.aborted)setEncontrados(r);}catch(e){if(!ctl.signal.aborted)setErroBusca(e.message);}finally{if(!ctl.signal.aborted)setBuscando(false);}
 }
 function escolher(c){setA(x=>({...x,clienteId:String(c.id),cliente:c.nome,clienteDocumento:c.documento,prospecto:null,orcamentoId:'',ordemId:''}));setEncontrados(null);setBusca('');}
 function prospecto(p={id:crypto.randomUUID(),nome:busca,documento:''}){setA(x=>({...x,clienteId:`prospecto:${p.id}`,cliente:p.nome,prospecto:p,orcamentoId:'',ordemId:'',tipoAcao:'prospeccao'}));setEncontrados(null);}
 async function enviar(e){
  e.preventDefault();if(salvando)return;setErro('');setSalvando(true);
  try{await chamarComercial('salvarAcao',{acao:a,versao:inicial?.versao??null,filtro});salvo();}catch(e){setErro(e.message);}finally{setSalvando(false);}
 }
 const historicoCliente=ctx?.acoes||dados.base.acoes.filter(x=>String(x.clienteId)===String(a.clienteId));
 return <Dialogo titulo={inicial?.versao?'Ação e histórico do cliente':a.tipoAcao==='acompanhamento'?'Combinar o próximo passo':'Nova ação comercial'} fechar={()=>{if(!salvando)fechar();}}><form className="com-form com-action-form" onSubmit={enviar}>
  <p className="com-muted">Organize o objetivo e o próximo passo. Nenhuma mensagem é enviada automaticamente.</p>
  <fieldset disabled={salvando}>
  <div className="com-form-grid"><label>Tipo de ação<select value={a.tipoAcao} onChange={e=>set('tipoAcao',e.target.value)}>{Object.entries(TIPOS_ACAO).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Responsável<select value={a.vendedorId} required disabled={!dados.escopo.gestor} onChange={e=>set('vendedorId',e.target.value)}><option value="">Selecione</option>{dados.catalogo.vendedores.map(v=><option key={v.id} value={v.id}>{v.nome}</option>)}</select></label></div>
  <section className="com-client-choice" aria-label="Cliente da ação">
   {a.clienteId&&!a.prospecto?<><div className="com-section-head"><div><small>CLIENTE SELECIONADO</small><strong>{selecionado?.nome||'Consultando cliente…'}</strong><span>{selecionado?.documento||'Documento não informado'}{selecionado?.responsavel?` · Carteira: ${selecionado.responsavel}`:''}</span></div>{!inicial?.versao&&<button type="button" className="com-link" onClick={()=>setA(x=>({...x,clienteId:'',orcamentoId:'',ordemId:'',cliente:''}))}>Trocar cliente</button>}</div>{ctx&&!ctx.autorizado&&<p className="com-muted">A ação será sua. O responsável pela carteira permanece o mesmo e o histórico de outras consultoras não é liberado.</p>}</>:a.prospecto?<><div className="com-section-head"><strong>Prospecto local</strong><button type="button" className="com-link" onClick={()=>setA(x=>({...x,clienteId:'',prospecto:null}))}>{inicial?.versao?'Vincular ao cadastro do ERP':'Buscar cadastro existente'}</button></div><label>Nome da empresa<input required minLength={3} maxLength={180} value={a.prospecto.nome} onChange={e=>set('prospecto',{...a.prospecto,nome:e.target.value})}/></label><label>CNPJ do prospecto (opcional)<input autoCapitalize="characters" maxLength={18} value={a.prospecto.documento} onChange={e=>set('prospecto',{...a.prospecto,documento:e.target.value})}/></label><small>Este prospecto fica no Painel. Não cria nem altera um cadastro no ERP.</small></>:<><label>Buscar cliente por CNPJ ou nome<div className="com-picker-search"><input autoFocus value={busca} maxLength={160} onChange={e=>buscarValor(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();buscar();}}} placeholder="Nome da empresa ou CNPJ"/><button type="button" className="btn-primary" disabled={buscando||busca.trim().length<3} onClick={buscar}><Search size={16}/>{buscando?'Buscando…':'Buscar cliente'}</button></div></label>{erroBusca&&<p role="alert" className="com-alert">{erroBusca}</p>}
    {encontrados&&<div aria-live="polite" className="com-picker-results"><small>{encontrados.total} cadastro(s) encontrado(s){encontrados.total>encontrados.clientes.length?' · refine a busca para localizar a empresa':''}</small>{encontrados.clientes.map(c=><button type="button" key={c.id} onClick={()=>escolher(c)}><UserRound size={17}/><span><strong>{c.nome}</strong><small>{c.documento||'Sem documento'} · {c.responsavel||'Responsável a conferir'}</small></span><ChevronRight size={16}/></button>)}{encontrados.total===0&&<p>Não encontramos na base sincronizada. Confira o nome ou o CNPJ antes de criar um prospecto local.</p>}</div>}
    {busca.trim().length>=3&&locais.length>0&&<div className="com-picker-results"><small>Prospectos locais com ações autorizadas</small>{locais.slice(0,8).map(p=><button type="button" key={p.id} onClick={()=>prospecto(p)}>{p.nome} · {p.documento||'Sem CNPJ'}</button>)}</div>}
    {encontrados?.total===0&&<button type="button" className="btn-outline" onClick={()=>prospecto()}>Criar prospecto local</button>}
   </>}
  </section>
  {carregando&&<p role="status">Consultando vendas e histórico autorizados…</p>}
  {erroContexto&&<p role="alert" className="com-alert">{erroContexto} <button type="button" onClick={()=>setTentativa(n=>n+1)}>Tentar novamente</button></p>}
  {ctx&&<><div className="com-form-grid"><label>Orçamento relacionado (opcional)<select value={a.orcamentoId} onChange={e=>set('orcamentoId',e.target.value)}><option value="">Sem orçamento</option>{ctx.orcamentos.map(o=><option key={o.id} value={o.id}>#{o.numero} · {o.trabalho||'Orçamento'}</option>)}</select></label><label>Venda / O.S. {a.tipoAcao==='pos_venda'?'(obrigatória)':'(opcional)'}<select required={a.tipoAcao==='pos_venda'} value={a.ordemId} onChange={e=>set('ordemId',e.target.value)}><option value="">Selecione uma venda</option>{ctx.vendas.map(o=><option key={o.id} value={o.id}>O.S. #{o.numero} · {dia(o.data)}{o.trabalho?` · ${o.trabalho}`:''}</option>)}</select></label></div><small className="com-muted">Vendas do histórico autorizado, independentemente do mês da tela.{ctx.coberturaHistorica?.completo===false?' O histórico disponível ainda está em conferência.':''}</small></>}
  {a.tipoAcao!=='acompanhamento'&&<label>Objetivo com este cliente<input required maxLength={500} value={a.objetivo} onChange={e=>set('objetivo',e.target.value)} placeholder="Ex.: conquistar a comunicação visual da nova unidade"/></label>}
  <label>Próxima ação<input required maxLength={500} value={a.descricao} onChange={e=>set('descricao',e.target.value)} placeholder="Ex.: apresentar referências de fachada ao responsável"/></label>
  <div className="com-form-grid"><label>Data do retorno<input type="date" required value={a.data} onChange={e=>set('data',e.target.value)}/></label><label>Canal<select value={a.canal} onChange={e=>set('canal',e.target.value)}>{Object.entries(CANAIS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
  <div className="com-form-grid"><label>Andamento<select value={a.fase} onChange={e=>set('fase',e.target.value)}>{Object.entries(FASES_ACAO).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Prioridade<select value={a.prioridade} onChange={e=>set('prioridade',e.target.value)}><option value="normal">Normal</option><option value="alta">Alta</option></select></label></div>
  <details open={a.tipoAcao==='prospeccao'||a.tipoAcao==='relacionamento'} className="com-form-details"><summary>Estratégia e registro do atendimento</summary><label>Estratégia para o cliente<textarea maxLength={3000} value={a.estrategia} onChange={e=>set('estrategia',e.target.value)} placeholder="Oportunidade, pessoas a envolver, solução proposta e abordagem"/></label><label>O que foi conversado<textarea maxLength={3000} value={a.nota} onChange={e=>set('nota',e.target.value)}/></label><label>O que falta resolver<textarea maxLength={1000} value={a.pendencias} onChange={e=>set('pendencias',e.target.value)}/></label><label>Previsão de decisão<input type="date" value={a.decisao||''} onChange={e=>set('decisao',e.target.value)}/></label></details>
  <details className="com-form-details" open={inicial?.abrirBriefing||undefined}><summary><ClipboardList size={16}/> Briefing e informações do trabalho</summary><p className="com-muted">Salvo com esta ação e vinculado ao orçamento selecionado. Prazo confirmado somente após validação da operação.</p>{Object.entries(BRIEFING_CAMPOS).map(([k,l])=><label key={k}>{l}<textarea rows={2} maxLength={1500} value={a.briefing?.[k]||''} onChange={e=>set('briefing',{...a.briefing,[k]:e.target.value})}/></label>)}</details>
  <div className="com-form-grid"><label>Situação<select value={a.status} onChange={e=>set('status',e.target.value)}><option value="pendente">Aberta</option><option value="concluida">Concluída</option></select></label><label>Resultado {a.status==='concluida'&&a.tipoAcao!=='acompanhamento'?'(obrigatório)':'do contato'}<textarea required={a.status==='concluida'&&a.tipoAcao!=='acompanhamento'} maxLength={3000} value={a.resultado} onChange={e=>set('resultado',e.target.value)} placeholder="Registre a resposta e o que foi combinado"/></label></div>
  <p className="com-muted">Para continuar a estratégia, mantenha a ação aberta, registre o resultado e combine a próxima data. Cada atualização fica no histórico.</p>
  </fieldset>
  {erro&&<p role="alert" className="com-alert">{erro} Seus campos foram mantidos para conferência.</p>}
  <footer><button type="button" className="btn-outline" disabled={salvando} onClick={fechar}>Cancelar</button><button className="btn-primary" disabled={salvando||carregando||!!erroContexto||!a.clienteId}>{salvando?'Salvando…':a.status==='concluida'?'Salvar conclusão':'Salvar ação'}</button></footer>
  <details className="com-form-details"><summary>Histórico deste cliente ({historicoCliente.length} ações)</summary>{historicoCliente.length?historicoCliente.map(x=><article key={x.id} className="com-history"><b>{x.descricao}</b><p>{TIPOS_ACAO[x.tipoAcao]||'Acompanhamento'} · {dia(x.data)} · {x.status==='concluida'?'Concluída':'Aberta'}</p>{x.resultado&&<p>Resultado: {x.resultado}</p>}{x.nota&&<p>{x.nota}</p>}<small>{x.atualizadoPor} · {dia(x.atualizadoEm)}</small></article>):<p>Ainda não há ações registradas neste acesso.</p>}</details>
  {!!inicial?.historico?.length&&<details className="com-form-details"><summary>Alterações desta ação ({inicial.historico.length})</summary>{[...inicial.historico].reverse().map((h,i)=><article className="com-history" key={`${h.em}-${i}`}><b>{h.descricao||h.anterior?.descricao}</b><p>{dia(h.em)} · {h.autor}</p><p>{h.anterior?.resultado||h.anterior?.nota||'Criação / atualização da ação'}</p></article>)}</details>}
  <button type="button" className="com-link" onClick={()=>setMostrarGuias(v=>!v)}>{mostrarGuias?'Recolher orientações':'Consultar orientações para esta venda'}</button>{mostrarGuias&&<ComercialDicas buscaInicial={ctx?.orcamentos.find(o=>String(o.id)===String(a.orcamentoId))?.trabalho||''}/>}
 </form></Dialogo>;
}
