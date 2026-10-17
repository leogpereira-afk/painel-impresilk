import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {CalendarDays,ChevronDown,FileText,Plus,RefreshCw,Target,UserRound} from 'lucide-react';
import {consultarDashboardDetalhe} from '../../services/dashboardComercial.js';
import {chamarComercial} from '../../services/comercial.js';
import {ymdLocal} from '../../lib/format.js';
import {filtroConsultaPedido,conciliarPedidoResultado,metasNoPeriodo} from '../../lib/calc/resultados-comerciais.mjs';
import {moeda,numero,dataCurta,porcentagem} from '../dashboard/formatos.js';
import {ConfigForm,MetaForm} from './FormulariosMetasComerciais.jsx';
import {ClienteComercial,PedidoComercial} from './ConsultasComercial.jsx';
import AcaoForm from './AcaoComercial.jsx';
import Dialogo from './DialogoComercial.jsx';
import useApoioComercial from './useApoioComercial.js';
import '../../pages/comercial.css';
import './comercial-relacionamento.css';
import './resultados-comerciais.css';

const lista=v=>Array.isArray(v)?v:[];
const hora=d=>d?new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informada';
const original=v=>({...v,valor:v.totalOS==null?null:v.totalOS/100,vendedorErpId:v.vendedorId});

function FinanceiroPedido({venda,filtro,abrirPedido,abrirCliente}) {
 const [dados,setDados]=useState(null),[erro,setErro]=useState(''),[revisao,setRevisao]=useState(0);
 const chave=JSON.stringify(filtroConsultaPedido(venda,filtro));
 useEffect(()=>{
  const ctl=new AbortController();setDados(null);setErro('');
  chamarComercial('consultarPedido',{ordemId:String(venda.id),filtro:JSON.parse(chave)},ctl.signal)
   .then(r=>{const conferido=conciliarPedidoResultado(venda,r,ymdLocal(new Date()));if(!ctl.signal.aborted)setDados(conferido);})
   .catch(e=>{if(!ctl.signal.aborted)setErro(e.message);});
  return()=>ctl.abort();
 },[venda,chave,revisao]);
 const p=dados?.pedido||original(venda),sinal=p.sinalPago;
 const sinalCentavos=sinal==null||String(sinal).trim()===''?venda.sinalPagoCentavos:Number.isFinite(Number(sinal))&&Number(sinal)>=0?Math.round(Number(sinal)*100):null;
 return <div className="res-order-detail">
  <dl className="res-financial-grid">
   <div><dt>Líquido completo da O.S.</dt><dd>{moeda(venda.totalOS)}</dd></div>
   <div><dt>Sinal registrado</dt><dd>{sinalCentavos==null?'Não informado':sinalCentavos===0?'Sem sinal':moeda(sinalCentavos)}</dd></div>
   <div><dt>Recebido conciliado</dt><dd>{dados?.financeiro?moeda(Math.round(dados.financeiro.recebido*100)):dados||erro?'A conferir':'Consultando…'}</dd></div>
   <div><dt>Saldo conciliado</dt><dd>{dados?.financeiro?moeda(Math.round(dados.financeiro.saldo*100)):dados||erro?'A conferir':'Consultando…'}</dd></div>
  </dl>
  <p className="com-muted">O sinal pode estar incluído no recebido. Saldo em aberto não significa atraso. Valores financeiros correspondem à O.S. inteira, mesmo quando o gráfico está filtrado por produto.</p>
  {erro&&<p className="com-alert" role="alert">{erro} <button className="com-link" onClick={()=>setRevisao(n=>n+1)}>Tentar novamente</button></p>}
  {dados&&<p className="com-muted">{dados.operacao?.rotuloStatus||'Andamento a conferir'} · consulta em {hora(dados.consultadoEm)}.</p>}
  <details className="res-products"><summary>Produtos deste recorte ({lista(venda.produtos).length})</summary><ul>{lista(venda.produtos).map((p,i)=><li key={`${p.id}-${i}`}><span>{p.nome}<small>{p.categoria} · {Object.entries(p.quantidades||{}).map(([u,q])=>`${numero(q)} ${u}`).join(' · ')||'Quantidade não disponível'}</small></span><b>{moeda(p.centavos)}</b></li>)}</ul></details>
  <div className="com-detail-actions"><button className="btn-primary" onClick={()=>abrirPedido(p)}><FileText size={15}/>Consultar pedido e andamento</button><button className="btn-outline" disabled={!venda.clienteId||venda.clienteId==='__sem_cliente'} onClick={()=>abrirCliente({id:venda.clienteId,nome:venda.cliente})}><UserRound size={15}/>Histórico e próximos passos</button></div>
 </div>;
}

export function ListaResultados({filtro,abrirPedido,abrirCliente}) {
 const chave=JSON.stringify(filtro),[pagina,setPagina]=useState(1),[carga,setCarga]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true),[revisao,setRevisao]=useState(0);
 useEffect(()=>setPagina(1),[chave]);
 const consulta=JSON.stringify({filtro,pagina});
 useEffect(()=>{
  const ctl=new AbortController();setCarregando(true);setErro('');
  consultarDashboardDetalhe(JSON.parse(chave),{pagina,tamanho:25},ctl.signal)
   .then(dados=>{if(!ctl.signal.aborted)setCarga({consulta,dados});})
   .catch(e=>{if(!ctl.signal.aborted)setErro(e.message);})
   .finally(()=>{if(!ctl.signal.aborted)setCarregando(false);});
  return()=>ctl.abort();
 },[chave,consulta,pagina,revisao]);
 const dados=carga?.consulta===consulta?carga.dados:null;
 return <section className="com-card res-orders" aria-busy={carregando}>
  <div className="com-section-head"><div><h2>Pedidos que compõem o resultado</h2><p className="com-muted">Mesmo período, empresa e filtros dos indicadores. Abra uma linha para conferir sinal, recebimento e andamento.</p></div><button className="btn-outline" aria-label="Atualizar pedidos" disabled={carregando} onClick={()=>setRevisao(n=>n+1)}><RefreshCw size={16}/></button></div>
  {carregando&&<p role="status">Consultando os pedidos do recorte…</p>}
  {erro&&<p className="com-alert" role="alert">{erro} <button className="com-link" onClick={()=>setRevisao(n=>n+1)}>Tentar novamente</button></p>}
  {dados&&<><p className="res-count">{numero(dados.paginacao.total)} pedidos · {dataCurta(dados.periodo.de)} a {dataCurta(dados.periodo.ateEfetivo)}{dados.cobertura.completo===false?' · cobertura parcial':''}</p>
   <div className="res-columns" aria-hidden="true"><span>O.S. / cadastro</span><span>Cliente / vendedor</span><span>Líquido do recorte</span><span>Detalhes</span></div>
   <div className="res-order-list">{lista(dados.vendas).map(v=><LinhaPedido key={`${consulta}-${v.id}`} venda={v} filtro={filtro} abrirPedido={abrirPedido} abrirCliente={abrirCliente}/>)}</div>
   {!dados.vendas.length&&<p className="com-empty">Nenhum pedido confirmado neste recorte.</p>}
   {dados.paginacao.paginas>1&&<nav className="com-pagination" aria-label="Páginas dos pedidos"><button className="btn-outline" disabled={pagina<=1||carregando} onClick={()=>setPagina(n=>n-1)}>Anterior</button><span>Página {pagina} de {dados.paginacao.paginas}</span><button className="btn-outline" disabled={!dados.paginacao.temMais||carregando} onClick={()=>setPagina(n=>n+1)}>Próxima</button></nav>}
  </>}
 </section>;
}
function LinhaPedido({venda,filtro,abrirPedido,abrirCliente}) {
 const [aberto,setAberto]=useState(false);
 return <details className="res-order" open={aberto} onToggle={e=>setAberto(e.currentTarget.open)}>
  <summary><span className="res-order-id"><b>O.S. #{venda.numero}</b><small>{dataCurta(venda.data)}</small></span><span className="res-order-client"><strong>{venda.cliente}</strong><small>{venda.vendedor||'Responsável não identificado'}</small></span><span className="res-order-value"><small>Líquido do recorte</small><b>{moeda(venda.centavos)}</b></span><span className="res-order-toggle"><span>{aberto?'Recolher':'Conferir'}</span><ChevronDown size={17}/></span></summary>
  {aberto&&<FinanceiroPedido venda={venda} filtro={filtro} abrirPedido={abrirPedido} abrirCliente={abrirCliente}/>}
 </details>;
}

function MetasCadastro({dados,dashboardDados,periodo,filtro,abrirMeta,configurar,abrirVendas}) {
 const m=dashboardDados?.metas||{},incompativel=m.estado==='filtro_incompativel',metas=metasNoPeriodo(dados.metas,periodo);
 return <><section className="com-card res-metas"><div className="com-section-head"><div><h2><Target size={19}/>Minhas metas</h2><p className="com-muted">Metas mensais por vendedor. O realizado usa as vendas confirmadas no Dashboard.</p></div>{dados.escopo.gestor&&<button className="btn-primary" onClick={()=>abrirMeta({vendedor:filtro.vendedor})}><Plus size={16}/>Cadastrar meta</button>}</div>
  <p className={incompativel?'com-coverage':'com-muted'}>{m.mensagem}</p>
  {!incompativel&&<><dl className="res-financial-grid"><div><dt>Realizado dos participantes</dt><dd>{moeda(m.realizado)}</dd></div><div><dt>Meta cadastrada</dt><dd>{moeda(m.valor)}</dd></div><div><dt>Atingimento</dt><dd>{porcentagem(m.percentual)}</dd></div><div><dt>Falta para a meta</dt><dd>{moeda(m.falta)}</dd></div></dl>
   <p className="com-muted">{m.diasUteis==null?'Ritmo diário depende do calendário conferido e da cobertura da meta.':`${m.diasUteis} dias úteis restantes${m.porDia!=null?` · ${moeda(m.porDia)} por dia para alcançar a meta`:''}`}</p>
   <details className="res-participants" open><summary>Participantes e cobertura</summary>{lista(m.participantes).map(v=><div className="res-meta-person" key={v.id}><span><b>{v.nome}</b><small>{v.metaId?'Meta cadastrada':'Meta não cadastrada'}</small></span><strong>{moeda(v.metaValor==null?null:Math.round(v.metaValor*100))}</strong><button className="com-link" onClick={()=>abrirVendas(v)}>Pedidos</button></div>)}
    {lista(m.faltantes).map(v=><p key={v.id}>{v.nome}: {v.motivo||'Meta não cadastrada'} {dados.escopo.gestor&&<button className="com-link" onClick={()=>abrirMeta({vendedor:v.id})}>Cadastrar meta</button>}</p>)}
    {lista(m.excluidos).length>0&&<details><summary>{m.excluidos.length} pessoas fora da meta</summary>{m.excluidos.map(v=><p key={v.id}>{v.nome} · {v.motivo}</p>)}</details>}
    {(m.cobertura?.completa===false||lista(m.idsAConferir).length>0)&&<p className="com-coverage">Há metas, vínculos ou cobertura de vendas a conferir; o percentual completo permanece indisponível.</p>}
   </details></>}
  {dados.escopo.gestor&&<button className="btn-outline" onClick={configurar}><CalendarDays size={15}/>Participação, calendário e regras</button>}
 </section><section className="com-card"><h2>Metas cadastradas no período</h2><p className="com-muted">Cadastros por vendedor e mês. Filtros de produto, cliente ou campanha não alteram a meta individual cadastrada.</p>
  {!metas.length?<p className="com-empty">Nenhuma meta cadastrada neste período e carteira.</p>:<div className="res-meta-list">{metas.map(m=><article key={m.id||`${m.vendedorId}-${m.mes}`}><span><b>{dados.catalogo.vendedores.find(v=>String(v.id)===String(m.vendedorId))?.nome||'Vendedor autorizado'}</b><small>{m.mes.split('-').reverse().join('/')} · atualizado {hora(m.atualizadoEm)}{m.atualizadoPor?` por ${m.atualizadoPor}`:''}</small></span><strong>{moeda(m.valor==null?null:Math.round(m.valor*100))}</strong>{dados.escopo.gestor?<button className="btn-outline" onClick={()=>abrirMeta({vendedor:m.vendedorId,mes:m.mes})}>Editar</button>:<small>Consulta</small>}</article>)}</div>}
 </section></>;
}

function AnalisesComplementares({filtro,dados,configurar}) {
 const query=new URLSearchParams({vendedor:filtro.vendedor||'',equipe:filtro.equipe||''});
 return <details className="com-card res-complementary"><summary>Análises complementares e critérios</summary>
  <div><h3>Aprovação de orçamentos</h3><p className="com-muted">Aprovação do orçamento e conversão em venda têm bases diferentes. O percentual consolidado exige cobertura, revisões e empresa de origem confirmadas. A consulta de negociações preserva situações, revisões e próximos passos.</p><Link className="com-link" to={`/comercial?${query}&aba=orcamentos&visaoOrc=periodo`}>Consultar negociações deste mês e escolher o período</Link></div>
  <div><h3>Clientes novos, recorrentes e reativados</h3><p className="com-muted">A classificação depende do histórico individual e da cobertura. Consulte os critérios na carteira; esses perfis operacionais não são somados aos indicadores de venda confirmada deste Dashboard.</p><Link className="com-link" to={`/comercial?${query}&aba=clientes&carteira=historico`}>Consultar histórico e perfil dos clientes</Link></div>
  {dados?.escopo.gestor&&<div><h3>Calendário e participação</h3><p className="com-muted">Dias úteis e ritmo da meta usam o calendário cadastrado. Comparações de datas e de dias úteis devem manter seu critério identificado.</p><button className="com-link" onClick={configurar}>Conferir calendário e participação nas metas</button></div>}
 </details>;
}

export default function ResultadosComerciais(props) {
 const chave=JSON.stringify([props.sessao?.usuario,props.sessao?.master,props.sessao?.permissoes,props.sessao?.vendedorId]);
 return <Resultados key={chave} {...props}/>;
}
function Resultados({filtroInicial={},periodo={},dashboardDados,modo='vendas',onAtualizado}) {
 const navegar=useNavigate(),[revisao,setRevisao]=useState(0),apoio=useApoioComercial(filtroInicial,revisao),[modal,setModal]=useState(null);
 const hoje=ymdLocal(new Date()),mes=(periodo.de||hoje).slice(0,7);
 const filtroEdicao=useMemo(()=>({de:hoje.slice(0,7)+'-01',ate:hoje,vendedor:filtroInicial.vendedor||'',equipe:filtroInicial.equipe||''}),[hoje,filtroInicial.vendedor,filtroInicial.equipe]);
 const abrirPedido=p=>setModal({tipo:'pedido',p}),abrirCliente=c=>setModal({tipo:'cliente',c});
 const salvo=()=>{setModal(null);setRevisao(n=>n+1);onAtualizado?.();};
 const abrirAcao=a=>setModal({tipo:'acao',a});
 const filtroModal=modal?.tipo==='pedido'?filtroConsultaPedido(modal.p,filtroInicial):filtroEdicao;
 return <div className="comercial res-commercial">
  {apoio.erro&&<p className="com-alert" role="alert">{apoio.erro} <button className="com-link" onClick={()=>setRevisao(n=>n+1)}>Atualizar cadastros</button></p>}
  {modo==='vendas'&&<><ListaResultados filtro={filtroInicial} abrirPedido={abrirPedido} abrirCliente={abrirCliente}/><AnalisesComplementares filtro={filtroInicial} dados={apoio.dados} configurar={()=>setModal({tipo:'config'})}/></>}
  {modo==='metas'&&apoio.carregando&&<p role="status">Consultando metas e regras autorizadas…</p>}
  {modo==='metas'&&apoio.dados&&<MetasCadastro dados={apoio.dados} dashboardDados={dashboardDados} periodo={periodo} filtro={filtroInicial} abrirMeta={m=>setModal({tipo:'meta',...m})} configurar={()=>setModal({tipo:'config'})} abrirVendas={v=>setModal({tipo:'pedidosMeta',v})}/>}
  {modal?.tipo==='pedido'&&apoio.dados&&<PedidoComercial key={modal.p.id} pedido={modal.p} dados={apoio.dados} filtro={filtroModal} fechar={()=>setModal(null)} abrirAcao={abrirAcao}/>}
  {modal?.tipo==='cliente'&&<ClienteComercial key={modal.c.id} cliente={modal.c} filtro={filtroModal} fechar={()=>setModal(null)} abrirAcao={abrirAcao} abrirPedido={abrirPedido} abrirOrc={o=>navegar(`/comercial?${new URLSearchParams({...filtroEdicao,aba:'orcamentos',orcamento:o.id})}`)}/>}
  {modal?.tipo==='acao'&&apoio.dados&&<AcaoForm inicial={modal.a} dados={apoio.dados} filtro={filtroEdicao} salvo={salvo} fechar={()=>setModal(null)}/>}
  {modal?.tipo==='meta'&&apoio.dados?.escopo.gestor&&<MetaForm dados={apoio.dados} filtro={{...filtroEdicao,vendedor:modal.vendedor||filtroEdicao.vendedor}} mesInicial={modal.mes||mes} salvo={salvo} fechar={()=>setModal(null)}/>}
  {modal?.tipo==='config'&&apoio.dados?.escopo.gestor&&<ConfigForm dados={apoio.dados} filtro={filtroEdicao} salvo={salvo} fechar={()=>setModal(null)}/>}
  {modal?.tipo==='pedidosMeta'&&<Dialogo titulo={`Pedidos de ${modal.v.nome}`} fechar={()=>setModal(null)}><ListaResultados filtro={{...filtroInicial,vendedor:modal.v.id}} abrirPedido={abrirPedido} abrirCliente={abrirCliente}/></Dialogo>}
  {modal&&['pedido','acao'].includes(modal.tipo)&&!apoio.dados&&<Dialogo titulo="Consulta comercial" fechar={()=>setModal(null)}><p role="status">{apoio.erro?'Os cadastros de apoio não estão disponíveis. Atualize antes de abrir o acompanhamento.':'Carregando os cadastros autorizados…'}</p></Dialogo>}
 </div>;
}
