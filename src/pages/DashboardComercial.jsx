import {useEffect,useMemo,useState} from 'react';
import {useSearchParams,Link} from 'react-router-dom';
import {RefreshCw,BarChart3,Package,Users,Wallet,Target} from 'lucide-react';
import {consultarDashboard,invalidarDashboard} from '../services/dashboardComercial.js';
import Filtros from '../components/dashboard/FiltrosDashboard.jsx';
import Ranking from '../components/dashboard/RankingDashboard.jsx';
import Serie,{MatrizHistorica} from '../components/dashboard/SerieDashboard.jsx';
import Detalhe from '../components/dashboard/DetalheDashboard.jsx';
import Inteligencia,{MetasDashboard,PrioridadesDashboard} from '../components/dashboard/InteligenciaDashboard.jsx';
import {moeda,numero,porcentagem,dataCurta} from '../components/dashboard/formatos.js';
import {recorteMesDashboard} from '../lib/calc/dashboard-apresentacao.js';
import './dashboard-comercial.css';
const ABAS=[['resumo','Panorama'],['produtos','Produtos'],['vendedores','Vendedores'],['clientes','Clientes'],['atrasos','Atrasos'],['abc','Curva ABC'],['historico','Histórico'],['inteligencia','Oportunidades']];
const hojeSP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const lista=v=>Array.isArray(v)?v:[];
const estado=v=>typeof v==='string'?v:v?.mensagem||v?.motivo||'Informação não disponível para este recorte.';
function Kpi({titulo,valor,nota,icone:Icone=BarChart3}){return <article className="dash-kpi"><span><Icone size={16}/>{titulo}</span><strong>{valor}</strong><small>{nota}</small></article>;}
function Comparacao({titulo,dados}){const pct=dados?.variacaoPct??dados?.percentual;return <article className="dash-comparison"><span>{titulo}</span><strong>{!dados?.completo?'Não comparável':porcentagem(pct)}</strong><small>{dados?.mensagem||(dados?.periodo?`${dataCurta(dados.periodo.de)} a ${dataCurta(dados.periodo.ate)} · ${dados.completo?'Base anterior: '+moeda(dados.centavos):'cobertura parcial'}`:'Período não comparável')}</small></article>;}
function Financeiro({dados}){
 if(!dados||['indisponivel','sem_permissao','nao_aplicavel','filtro_incompativel'].includes(dados.estado))return <section className="dash-card"><h2>Atrasos financeiros</h2><p className="dash-empty">{estado(dados)}</p>{dados?.estado!=='sem_permissao'&&<Link to="/comercial/contas-atrasadas" className="dash-link">Abrir Contas atrasadas</Link>}</section>;
 return <><div className="dash-kpis"><Kpi titulo="Valor vencido" valor={moeda(dados.vencidoCentavos)} nota={dados.criterio||'Saldo vencido em aberto'} icone={Wallet}/><Kpi titulo="Títulos vencidos" valor={numero(dados.titulosVencidos)} nota="Títulos identificados na fonte"/><Kpi titulo="Clientes com atraso" valor={numero(dados.clientes)} nota="Clientes únicos identificados" icone={Users}/><Kpi titulo="Índice de atraso" valor={porcentagem(dados.indiceAtraso)} nota={dados.formula||'Consulte a regra na fonte'}/></div><section className="dash-card"><h2>Faixas de atraso</h2><p className="dash-note">{dados.escopo}</p><p className="dash-note">{dados.mensagem}</p><div className="dash-table-wrap"><table className="dash-table"><thead><tr><th>Faixa</th><th>Títulos</th><th>Saldo vencido</th></tr></thead><tbody>{lista(dados.faixas).map(f=><tr key={f.nome||f.faixa}><td>{f.nome||f.faixa}</td><td>{numero(f.quantidade??f.titulos)}</td><td>{moeda(f.centavos)}</td></tr>)}</tbody></table></div><Link className="dash-link" to="/comercial/contas-atrasadas">Abrir títulos em Contas atrasadas</Link></section></>;
}
export default function DashboardComercial({sessao}){
 const sessaoChave=JSON.stringify([sessao?.usuario,sessao?.master,sessao?.permissoes||[],sessao?.vendedorId]);
 return <Dashboard key={sessaoChave} sessaoChave={sessaoChave}/>;
}
function Dashboard({sessaoChave}){
 const [params,setParams]=useSearchParams(),hoje=hojeSP();
 const filtro=useMemo(()=>({modo:params.get('modo')||'mes',mes:params.get('mes')||hoje.slice(0,7),ano:params.get('ano')||hoje.slice(0,4),de:params.get('de')||hoje.slice(0,7)+'-01',ate:params.get('ate')||hoje,vendedor:params.get('vendedor')||'',cliente:params.get('cliente')||'',produto:params.get('produto')||'',categoria:params.get('categoria')||'',campanha:params.get('campanha')||'',abcA:Number(params.get('abcA')||80),abcB:Number(params.get('abcB')||95)}),[params,hoje]);
 const aba=ABAS.some(([a])=>a===params.get('analise'))?params.get('analise'):'resumo';
 const [carga,setCarga]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true),[revisao,setRevisao]=useState(0),[detalhe,setDetalhe]=useState(null),[densidade,setDensidade]=useState('compacta'),[abcTipo,setAbcTipo]=useState('clientes');
 const chave=JSON.stringify(filtro),dados=carga?.chave===chave?carga.dados:null;
 useEffect(()=>{const ctl=new AbortController();setCarregando(true);setErro('');const t=setTimeout(()=>consultarDashboard(sessaoChave,JSON.parse(chave),{signal:ctl.signal}).then(d=>{if(!ctl.signal.aborted)setCarga({chave,dados:d});}).catch(e=>{if(!ctl.signal.aborted)setErro(e.message);}).finally(()=>{if(!ctl.signal.aborted)setCarregando(false);}),180);return()=>{clearTimeout(t);ctl.abort();};},[chave,sessaoChave,revisao]);
 function alterar(patch){const p=new URLSearchParams(params);for(const[k,v]of Object.entries(patch))v!==''&&v!=null?p.set(k,String(v)):p.delete(k);setParams(p);setDetalhe(null);}
 const atualizar=()=>{invalidarDashboard();setRevisao(x=>x+1);};
 const abrir=(dimensao,l)=>{const recorte=l.mes?recorteMesDashboard(l.mes,dados?.periodo):null;if(l.mes&&!recorte)return;setDetalhe({dimensao,id:l.id,nome:l.nome,filtro:l.historico?{...filtro,modo:'todos'}:recorte?{...filtro,...recorte}:filtro});};
 const abrirMes=mes=>{const recorte=recorteMesDashboard(mes,dados?.periodo);if(recorte)setDetalhe({nome:`Vendas de ${dataCurta(recorte.de)} a ${dataCurta(recorte.ate)}`,filtro:{...filtro,...recorte}});};
 const resumo=dados?.resumo||{},rankings=dados?.rankings||{};
 const avisos=lista(dados?.avisos),alertas=avisos.filter(a=>typeof a!=='string'||!(/^(Quantidades|Devoluções)/.test(a)));
 return <div className={`commercial-dashboard dash-${densidade}`} aria-busy={carregando}>
 <header className="dash-header"><div><p className="dash-eyebrow">Inteligência comercial</p><h1>Dashboard</h1><p>Histórico, resultados e oportunidades da sua carteira autorizada.</p></div><div className="dash-header-actions"><label className="sr-only" htmlFor="dash-densidade">Densidade da tela</label><select id="dash-densidade" value={densidade} onChange={e=>setDensidade(e.target.value)}><option value="compacta">Compacto</option><option value="confortavel">Confortável</option></select><button className="btn-outline" onClick={()=>atualizar()} disabled={carregando}><RefreshCw size={16}/>{carregando?'Atualizando…':'Atualizar'}</button></div></header>
 <Filtros filtro={filtro} alterar={alterar} catalogo={dados?.catalogo||carga?.dados?.catalogo} abc={aba==='abc'}/>
 <nav className="dash-tabs" aria-label="Análises comerciais">{ABAS.map(([a,n])=><button key={a} aria-current={aba===a?'page':undefined} onClick={()=>alterar({analise:a})}>{n}</button>)}</nav>
 {erro&&<p role="alert" className="dash-alert">{erro} <button className="dash-link" onClick={()=>atualizar()}>Tentar novamente</button></p>}
 {carregando&&!dados&&<div className="dash-loading" role="status"><div/><div/><div/><p>Consultando o recorte autorizado…</p></div>}
 {dados&&<>
 <div className="dash-context"><span>{dataCurta(dados.periodo?.de)} a {dataCurta(dados.periodo?.ateEfetivo||dados.periodo?.ate)}{dados.periodo?.parcial?' · período em andamento':''}</span><span>Consultado {dados.consultadoEm?new Date(dados.consultadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</span></div>
 {alertas.length>0&&<div className="dash-alert" role="note">{alertas.map((a,i)=><p key={i}>{typeof a==='string'?a:a.mensagem||a.descricao}</p>)}</div>}
 <details className="dash-provenance"><summary>Fonte, critérios e cobertura</summary><p>{typeof dados.criterio==='string'?dados.criterio:dados.criterio?.descricao||'Vendas pela data comercial da O.S., líquidas de descontos.'}</p>{dados.cobertura?.mensagem&&<p>{dados.cobertura.mensagem}</p>}{dados.cobertura?.empresa?.mensagem&&<p>{dados.cobertura.empresa.mensagem}</p>}<ul>{Object.entries(dados.fontes||{}).map(([id,f])=><li key={id}>{f.fonte||id}: {f.atualizadoEm?new Date(f.atualizadoEm).toLocaleString('pt-BR'):'atualização não confirmada'}</li>)}</ul><ul>{avisos.filter(a=>typeof a==='string'&&/^(Quantidades|Devoluções)/.test(a)).map(a=><li key={a}>{a}</li>)}</ul><p>Venda, faturamento e recebimento são indicadores distintos. O período e as permissões acompanham cada consulta.</p></details>
 {resumo.empresaNaoIdentificadaPedidos>0&&<p className="dash-alert"><strong>Origem a conferir:</strong> {numero(resumo.empresaNaoIdentificadaPedidos)} pedidos ({moeda(resumo.empresaNaoIdentificadaCentavos)}) foram separados e não entram nos indicadores abaixo.</p>}
 {['resumo','produtos','vendedores','clientes'].includes(aba)&&<div className="dash-kpis"><Kpi titulo="Vendas registradas" valor={moeda(resumo.centavos)} nota={resumo.completo===false?'Cobertura parcial · confira os critérios':'Valor líquido no recorte'} icone={Wallet}/><Kpi titulo="Pedidos" valor={numero(resumo.pedidos)} nota="O.S. únicas no recorte" icone={Package}/><Kpi titulo="Clientes" valor={numero(resumo.clientes)} nota="Compradores identificados" icone={Users}/><Kpi titulo="Ticket médio" valor={moeda(resumo.ticketMedio)} nota="Venda líquida ÷ pedidos" icone={Target}/></div>}
 {aba==='resumo'&&<><PrioridadesDashboard dados={dados} abrir={abrir} alterar={alterar}/><div className="dash-comparisons"><Comparacao titulo="Período anterior" dados={dados.comparacoes?.anterior}/><Comparacao titulo="Mesmo período do ano anterior" dados={dados.comparacoes?.anoAnterior}/><article className="dash-comparison"><span>Bruto e descontos</span><strong>{moeda(resumo.brutoCentavos)}</strong><small>Descontos: {moeda(resumo.descontoCentavos)}</small></article></div><Serie linhas={dados.series?.mensal} abrir={abrirMes}/><MetasDashboard dados={dados.metas}/><div className="dash-insights"><section className="dash-card"><h2>Produtos que lideram</h2>{lista(rankings.produtos).slice(0,5).map(l=><button className="dash-summary-row" key={l.id} onClick={()=>abrir('produto',l)}><span>{l.nome}</span><b>{moeda(l.centavos)}</b></button>)}</section><section className="dash-card"><h2>Clientes que lideram</h2>{lista(rankings.clientes).slice(0,5).map(l=><button className="dash-summary-row" key={l.id} onClick={()=>abrir('cliente',l)}><span>{l.nome}</span><b>{moeda(l.centavos)}</b></button>)}</section></div></>}
 {['produtos','vendedores','clientes'].includes(aba)&&<Ranking key={`${chave}-${aba}`} cobertura={dados.rankingsCobertura?.[aba]} linhas={rankings[aba]} dimensao={{produtos:'produto',vendedores:'vendedor',clientes:'cliente'}[aba]} abrir={abrir}/>}
 {aba==='atrasos'&&<Financeiro dados={dados.financeiro}/>}
 {aba==='abc'&&<><div className="dash-toolbar"><label>Curva de<select value={abcTipo} onChange={e=>setAbcTipo(e.target.value)}><option value="clientes">Clientes</option><option value="produtos">Produtos</option></select></label><p className="dash-note">Classificação por participação acumulada na venda líquida. A: até {filtro.abcA}%; B: até {filtro.abcB}%; C: restante. O item que cruza um limite permanece na classe em que começou.</p></div><Ranking key={`${chave}-${abcTipo}`} cobertura={dados.rankingsCobertura?.[abcTipo]} linhas={rankings[abcTipo]} dimensao={abcTipo==='produtos'?'produto':'cliente'} abrir={abrir} abc/></>}
 {aba==='vendedores'&&<MetasDashboard dados={dados.metas}/>}
 {aba==='historico'&&<MatrizHistorica linhas={dados.series?.mensal} abrir={abrirMes}/>}
 {aba==='inteligencia'&&<Inteligencia dados={dados.inteligencia} ticket={resumo.ticketMedio} abrir={abrir}/>}
 </>}
 {detalhe&&<Detalhe key={JSON.stringify(detalhe)} selecao={detalhe} filtro={detalhe.filtro} fechar={()=>setDetalhe(null)}/>}
 </div>;
}
