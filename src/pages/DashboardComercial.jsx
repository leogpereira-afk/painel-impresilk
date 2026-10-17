import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {useSearchParams,Link} from 'react-router-dom';
import {RefreshCw,BarChart3,Package,Users,Wallet,Target,ArrowUpRight,X,LayoutDashboard,ReceiptText,UserRound,AlarmClock,ChartNoAxesCombined,History,BadgePercent,Lightbulb,Receipt,Percent} from 'lucide-react';
import {consultarDashboard,invalidarDashboard} from '../services/dashboardComercial.js';
import Filtros from '../components/dashboard/FiltrosDashboard.jsx';
import Ranking from '../components/dashboard/RankingDashboard.jsx';
import {MatrizHistorica} from '../components/dashboard/SerieDashboard.jsx';
import Detalhe from '../components/dashboard/DetalheDashboard.jsx';
import Inteligencia,{MetasDashboard,PrioridadesDashboard} from '../components/dashboard/InteligenciaDashboard.jsx';
import {EvolucaoVendas,GraficoDescontos,GraficoMetas,GraficoAtrasos} from '../components/dashboard/GraficosVendas.jsx';
import {GraficoRanking,GraficoVendedores,GraficoPareto} from '../components/dashboard/GraficosRankings.jsx';
import {moeda,numero,porcentagem,dataCurta} from '../components/dashboard/formatos.js';
import {recorteMesDashboard} from '../lib/calc/dashboard-apresentacao.js';
import {recortePonto} from '../lib/calc/graficos-comerciais.js';
import './dashboard-comercial.css';

const Resultados=lazy(()=>import('../components/comercial/ResultadosComerciais.jsx'));
const ABAS=[['resumo','Panorama'],['vendas','Minhas vendas'],['metas','Minhas metas'],['produtos','Produtos'],['vendedores','Vendedores'],['clientes','Clientes'],['atrasos','Atrasos'],['abc','Curva ABC'],['historico','Histórico'],['descontos','Descontos'],['inteligencia','Oportunidades']];
const ICONES_ANALISES={
 resumo:[LayoutDashboard,'roxo'],vendas:[ReceiptText,'roxo'],metas:[Target,'azul'],produtos:[Package,'ciano'],
 vendedores:[UserRound,'azul'],clientes:[Users,'ciano'],atrasos:[AlarmClock,'alerta'],abc:[ChartNoAxesCombined,'azul'],
 historico:[History,'ciano'],descontos:[BadgePercent,'roxo'],inteligencia:[Lightbulb,'azul'],
};
const DIMENSOES={produtos:'produto',vendedores:'vendedor',clientes:'cliente'};
const SELECOES={vendedor:['Vendedor','vendedores'],cliente:['Cliente','clientes'],produto:['Produto','produtos'],categoria:['Categoria','categorias'],campanha:['Campanha','campanhas'],equipe:['Equipe','equipes']};
const hojeSP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const lista=v=>Array.isArray(v)?v:[];
const estado=v=>typeof v==='string'?v:v?.mensagem||v?.motivo||'Informação não disponível para este recorte.';

function Kpi({titulo,valor,nota,icone:Icone=BarChart3,acento='roxo',onClick}) {
 const Conteudo=onClick?'button':'article';
 return <Conteudo className={`dash-kpi ${onClick?'dash-kpi-action':''}`} data-acento={acento} onClick={onClick}>
  <span><span className="dash-kpi-icon" aria-hidden="true"><Icone size={16} aria-hidden="true"/></span>{titulo}{onClick&&<ArrowUpRight size={14} className="dash-kpi-arrow" aria-hidden="true"/>}</span><strong>{valor}</strong><small>{nota}</small>
 </Conteudo>;
}
function Comparacao({titulo,dados}) {
 const pct=dados?.variacaoPct??dados?.percentual;
 return <article className="dash-comparison"><span>{titulo}</span><strong>{!dados?.comparavel?'Não comparável':porcentagem(pct)}</strong><small>{dados?.mensagem||(dados?.periodo?`${dataCurta(dados.periodo.de)} a ${dataCurta(dados.periodo.ate)} · ${dados.comparavel?'Base anterior: '+moeda(dados.centavos):'cobertura parcial'}`:'Período não comparável')}</small></article>;
}
function ComparacoesMensais({dados,abrir}) {
 const [tipo,setTipo]=useState('diasUteis'),d=dados?.[tipo];
 return <section className="dash-card"><div className="dash-section-head"><h2>Comparação das vendas</h2><label>Critério<select aria-label="Critério da comparação mensal" value={tipo} onChange={e=>setTipo(e.target.value)}><option value="diasUteis">Mesmo número de dias úteis</option><option value="mesCompleto">Meses completos</option></select></label></div>
  <p className="dash-note">{d?.criterio}. {d?.diasUteisAtual!=null?`${d.diasUteisAtual} dias úteis em cada janela.`:''} {d?.mensagem}</p>
  <div className="dash-comparisons">{[[d?.periodoAtual,d?.valorAtual,'Janela analisada'],[d?.periodo,d?.centavos,'Janela de comparação']].map(([p,valor,nome])=><article className="dash-comparison" key={nome}><span>{nome}</span><strong>{moeda(valor)}</strong><small>{p?`${dataCurta(p.de)} a ${dataCurta(p.ate)}`:'Período indisponível'}</small>{p&&Number.isFinite(valor)&&<button className="dash-link" onClick={()=>abrir(p,nome)}>Ver registros <ArrowUpRight size={13}/></button>}</article>)}<article className="dash-comparison"><span>Variação entre as janelas</span><strong>{porcentagem(d?.percentual)}</strong><small>{d?.comparavel?`Diferença: ${moeda(d.delta)}${d.centavos===0?' · base anterior zero: percentual indisponível':''}`:'Exige cobertura e critérios equivalentes.'}</small></article></div>
  <p className="dash-note">Meses completos comparam os últimos meses encerrados quando o mês selecionado ainda está em andamento. Cada janela mantém as seleções de vendedor, cliente e produto.</p>
 </section>;
}
function Financeiro({dados,onRegistros}) {
 if(!dados||['indisponivel','sem_permissao','nao_aplicavel','filtro_incompativel'].includes(dados.estado))return <section className="dash-card"><h2>Atrasos financeiros</h2><p className="dash-empty">{estado(dados)}</p>{dados?.estado!=='sem_permissao'&&<Link to="/comercial/contas-atrasadas" className="dash-link">Abrir Contas atrasadas</Link>}</section>;
 return <><div className="dash-kpis"><Kpi titulo="Valor vencido" valor={moeda(dados.vencidoCentavos)} nota={dados.criterio||'Saldo vencido em aberto'} icone={Wallet} acento="critico"/><Kpi titulo="Títulos vencidos" valor={numero(dados.titulosVencidos)} nota="Títulos identificados na fonte" icone={Receipt} acento="alerta"/><Kpi titulo="Clientes com atraso" valor={numero(dados.clientes)} nota="Clientes únicos identificados" icone={Users} acento="alerta"/><Kpi titulo="Índice de atraso" valor={porcentagem(dados.indiceAtraso)} nota={dados.formula||'Consulte a regra na fonte'} icone={Percent} acento="critico"/></div>
  <GraficoAtrasos dados={dados} onRegistros={onRegistros}/>{dados.mensagem&&<p className="dash-note">{dados.mensagem}</p>}
 </>;
}
function ChipsSelecao({filtro,catalogo={},alterar}) {
 const ativos=Object.entries(SELECOES).filter(([id])=>filtro[id]);
 if(!ativos.length)return null;
 return <div className="dash-selection" aria-label="Seleção atual">{ativos.map(([id,[rotulo,colecao]])=>{
  const item=lista(catalogo[colecao]).find(i=>String(i.id??i.nome??i)===String(filtro[id]));
  return <button key={id} className="dash-filter-chip" onClick={()=>alterar({[id]:''})} aria-label={`Remover filtro ${rotulo}`}><span>{rotulo}: {item?.nome||item||filtro[id]}</span><X size={13}/></button>;
 })}<button className="dash-link" onClick={()=>alterar(Object.fromEntries(Object.keys(SELECOES).map(k=>[k,''])))}>Limpar seleção</button></div>;
}
export default function DashboardComercial({sessao}) {
 const sessaoChave=JSON.stringify([sessao?.usuario,sessao?.master,sessao?.permissoes||[],sessao?.vendedorId]);
 return <Dashboard key={sessaoChave} sessao={sessao} sessaoChave={sessaoChave}/>;
}
function Dashboard({sessao,sessaoChave}) {
 const [params,setParams]=useSearchParams(),hoje=hojeSP();
 const filtro=useMemo(()=>({modo:params.get('modo')||'mes',mes:params.get('mes')||hoje.slice(0,7),ano:params.get('ano')||hoje.slice(0,4),de:params.get('de')||hoje.slice(0,7)+'-01',ate:params.get('ate')||hoje,vendedor:params.get('vendedor')||'',cliente:params.get('cliente')||'',produto:params.get('produto')||'',categoria:params.get('categoria')||'',campanha:params.get('campanha')||'',equipe:params.get('equipe')||'',abcA:Number(params.get('abcA')||80),abcB:Number(params.get('abcB')||95)}),[params,hoje]);
 const aba=ABAS.some(([a])=>a===params.get('analise'))?params.get('analise'):'resumo';
 const [carga,setCarga]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true),[revisao,setRevisao]=useState(0),[detalhe,setDetalhe]=useState(null),[densidade,setDensidade]=useState('compacta'),[abcTipo,setAbcTipo]=useState('clientes');
 const chave=JSON.stringify(filtro),dados=carga?.chave===chave?carga.dados:null;
 useEffect(()=>{
  const ctl=new AbortController();setCarregando(true);setErro('');
  const t=setTimeout(()=>consultarDashboard(sessaoChave,JSON.parse(chave),{signal:ctl.signal}).then(d=>{if(!ctl.signal.aborted)setCarga({chave,dados:d});}).catch(e=>{if(!ctl.signal.aborted)setErro(e.message);}).finally(()=>{if(!ctl.signal.aborted)setCarregando(false);}),180);
  return()=>{clearTimeout(t);ctl.abort();};
 },[chave,sessaoChave,revisao]);
 function alterar(patch){const p=new URLSearchParams(params);for(const[k,v]of Object.entries(patch))v!==''&&v!=null?p.set(k,String(v)):p.delete(k);setParams(p);setDetalhe(null);}
 const atualizar=()=>{invalidarDashboard();setRevisao(x=>x+1);};
 const abrir=(dimensao,l)=>{
  const recorte=l.mes?recorteMesDashboard(l.mes,dados?.periodo):null;
  if(l.mes&&!recorte)return;
  setDetalhe({dimensao,id:l.id,nome:l.nome,filtro:l.historico?{...filtro,modo:'todos'}:recorte?{...filtro,...recorte}:filtro});
 };
 const abrirPeriodo=(ponto,vendedor)=>{
  const recorte=recortePonto(ponto,dados?.periodo);
  if(recorte)setDetalhe({...(vendedor?{dimensao:'vendedor',id:vendedor.id}:{}),nome:`${vendedor?vendedor.nome+' · ':''}Vendas de ${dataCurta(recorte.de)} a ${dataCurta(recorte.ate)}`,filtro:{...filtro,...recorte}});
 };
 const abrirMes=mes=>{const recorte=recorteMesDashboard(mes,dados?.periodo);if(recorte)abrirPeriodo(recorte);};
 const abrirTodos=()=>setDetalhe({nome:'Pedidos do recorte',filtro});
 const selecionar=(dimensao,item)=>alterar({[dimensao]:item.id});
 const verCompleto=()=>alterar({...detalhe.filtro,...(detalhe.dimensao?{[detalhe.dimensao]:detalhe.id}:{}),analise:'vendas'});
 const resumo=dados?.resumo||{},rankings=dados?.rankings||{};
 const avisos=lista(dados?.avisos);
 const alertas=avisos.filter(a=>typeof a!=='string'||!(/^(Quantidades|Devoluções)/.test(a)));
 const resultadosProps={sessao,filtroInicial:filtro,periodo:dados?.periodo,dashboardDados:dados,onAtualizado:atualizar};
 const rankingCompleto=(tipo,abc=false)=><details className="dash-card dash-ranking-detail"><summary>Ranking completo e evolução por período</summary><Ranking key={`${chave}-${tipo}`} cobertura={dados.rankingsCobertura?.[tipo]} linhas={rankings[tipo]} dimensao={DIMENSOES[tipo]} abrir={abrir} abc={abc}/></details>;
 return <div className={`commercial-dashboard dash-${densidade}`} aria-busy={carregando}>
  <header className="dash-header"><div><p className="dash-eyebrow">Inteligência comercial</p><h1>Dashboard</h1><p>Impresilk + Universo · Resultados, metas e oportunidades da sua carteira.</p></div><div className="dash-header-actions"><label className="sr-only" htmlFor="dash-densidade">Densidade da tela</label><select id="dash-densidade" value={densidade} onChange={e=>setDensidade(e.target.value)}><option value="compacta">Compacto</option><option value="confortavel">Confortável</option></select><button className="btn-outline" onClick={atualizar} disabled={carregando}><RefreshCw size={16}/>{carregando?'Atualizando…':'Atualizar'}</button></div></header>
  <Filtros filtro={filtro} alterar={alterar} catalogo={dados?.catalogo||carga?.dados?.catalogo} abc={aba==='abc'}/>
  <ChipsSelecao filtro={filtro} catalogo={dados?.catalogo||carga?.dados?.catalogo} alterar={alterar}/>
  <nav className="dash-tabs" aria-label="Análises comerciais">{ABAS.map(([a,n])=>{const[Icone,acento]=ICONES_ANALISES[a];return <button key={a} data-acento={acento} aria-current={aba===a?'page':undefined} onClick={()=>alterar({analise:a})}><Icone size={15} aria-hidden="true"/><span>{n}</span></button>;})}</nav>
  {erro&&<p role="alert" className="dash-alert">{erro} <button className="dash-link" onClick={atualizar}>Tentar novamente</button></p>}
  {carregando&&!dados&&<div className="dash-loading" role="status"><div/><div/><div/><p>Consultando o recorte autorizado…</p></div>}
  {dados&&<>
   <div className="dash-context"><span>{dataCurta(dados.periodo?.de)} a {dataCurta(dados.periodo?.ateEfetivo||dados.periodo?.ate)}{dados.periodo?.parcial?' · período em andamento':''}</span><span>Consultado {dados.consultadoEm?new Date(dados.consultadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</span></div>
   {(alertas.length>0||resumo.empresaNaoIdentificadaPedidos>0)&&<details className="dash-alert"><summary>{resumo.empresaNaoIdentificadaPedidos>0?`${numero(resumo.empresaNaoIdentificadaPedidos)} pedido(s) com origem a conferir, fora dos indicadores`:`${alertas.length} observação(ões) de cobertura`} · ver critérios</summary>{resumo.empresaNaoIdentificadaPedidos>0&&<p>{moeda(resumo.empresaNaoIdentificadaCentavos)} separados por falta de confirmação da empresa.</p>}{alertas.map((a,i)=><p key={i}>{typeof a==='string'?a:a.mensagem||a.descricao}</p>)}</details>}
   {['resumo','vendas','produtos','vendedores','clientes','descontos'].includes(aba)&&<div className="dash-kpis"><Kpi titulo="Vendas registradas" valor={moeda(resumo.centavos)} nota={resumo.completo===false?'Cobertura parcial · confira os critérios':'Venda líquida · abrir pedidos'} icone={Wallet} onClick={()=>alterar({analise:'vendas'})}/><Kpi titulo="Pedidos" valor={numero(resumo.pedidos)} nota="O.S. únicas · abrir detalhamento" icone={Package} acento="azul" onClick={abrirTodos}/><Kpi titulo="Clientes" valor={numero(resumo.clientes)} nota="Compradores · analisar carteira" icone={Users} acento="ciano" onClick={()=>alterar({analise:'clientes'})}/><Kpi titulo="Ticket médio" valor={moeda(resumo.ticketMedio)} nota="Venda líquida ÷ pedidos" icone={Target} acento="azul" onClick={abrirTodos}/></div>}
   {aba==='resumo'&&<>
    <EvolucaoVendas key={chave} dados={dados} modo={filtro.modo} abrirPeriodo={abrirPeriodo} abrirTodos={abrirTodos}/>
    <div className="dash-comparisons"><Comparacao titulo="Período anterior" dados={dados.comparacoes?.anterior}/><Comparacao titulo="Mesmo período do ano anterior" dados={dados.comparacoes?.anoAnterior}/><article className="dash-comparison"><span>Bruto e descontos</span><strong>{moeda(resumo.brutoCentavos)}</strong><small>Descontos: {moeda(resumo.descontoCentavos)}</small></article></div>
    <div className="dash-insights">{['produtos','clientes'].map(tipo=><GraficoRanking key={`${chave}-${tipo}`} compacto linhas={rankings[tipo]} dimensao={DIMENSOES[tipo]} abrir={abrir} selecionar={selecionar} cobertura={dados.rankingsCobertura?.[tipo]}/>)}</div>
    <MetasDashboard dados={dados.metas} onGerenciar={()=>alterar({analise:'metas'})}/>
    <PrioridadesDashboard dados={dados} abrir={abrir} alterar={alterar}/>
   </>}
   {aba==='vendas'&&<><ComparacoesMensais dados={dados.comparacoes} abrir={(p,nome)=>setDetalhe({nome:`${nome} · ${dataCurta(p.de)} a ${dataCurta(p.ate)}`,filtro:{...filtro,modo:'personalizado',de:p.de,ate:p.ate}})}/><Suspense fallback={<p role="status">Abrindo os pedidos…</p>}><Resultados {...resultadosProps} modo="vendas"/></Suspense></>}
   {aba==='metas'&&<><GraficoMetas dados={dados.metas}/><Suspense fallback={<p role="status">Abrindo as metas…</p>}><Resultados {...resultadosProps} modo="metas"/></Suspense></>}
   {['produtos','vendedores','clientes'].includes(aba)&&<>
    <GraficoRanking key={`${chave}-${aba}`} linhas={rankings[aba]} dimensao={DIMENSOES[aba]} abrir={abrir} selecionar={selecionar} cobertura={dados.rankingsCobertura?.[aba]}/>
    {aba==='vendedores'?<GraficoVendedores key={chave} dados={dados} abrir={abrirPeriodo}/>:<EvolucaoVendas key={chave} dados={dados} modo={filtro.modo} abrirPeriodo={abrirPeriodo} abrirTodos={abrirTodos}/>}
    {rankingCompleto(aba)}
   </>}
   {aba==='atrasos'&&<Financeiro dados={dados.financeiro} onRegistros={p=>setDetalhe({dimensao:'atraso',id:p?.id||'todos',nome:p?.nome?`Títulos vencidos · ${p.nome}`:'Títulos vencidos do recorte',filtro})}/>}
   {aba==='abc'&&<><div className="dash-toolbar"><label>Curva de<select value={abcTipo} onChange={e=>setAbcTipo(e.target.value)}><option value="clientes">Clientes</option><option value="produtos">Produtos</option></select></label><p className="dash-note">A: até {filtro.abcA}%; B: até {filtro.abcB}%; C: restante. O item que cruza um limite permanece na classe em que começou.</p></div><GraficoPareto key={`${chave}-${abcTipo}`} linhas={rankings[abcTipo]} dimensao={DIMENSOES[abcTipo]} abrir={abrir} cobertura={dados.rankingsCobertura?.[abcTipo]}/>{rankingCompleto(abcTipo,true)}</>}
   {aba==='historico'&&<MatrizHistorica linhas={dados.series?.mensal} abrir={abrirMes}/>}
   {aba==='descontos'&&<GraficoDescontos key={chave} dados={dados} abrirPeriodo={abrirPeriodo}/>}
   {aba==='inteligencia'&&<Inteligencia dados={dados.inteligencia} ticket={resumo.ticketMedio} abrir={abrir}/>}
   <details className="dash-provenance"><summary>Fonte, critérios e cobertura</summary><p>{typeof dados.criterio==='string'?dados.criterio:dados.criterio?.descricao||'Vendas pela data comercial da O.S., líquidas de descontos.'}</p>{dados.cobertura?.mensagem&&<p>{dados.cobertura.mensagem}</p>}{dados.cobertura?.empresa?.mensagem&&<p>{dados.cobertura.empresa.mensagem}</p>}<ul>{Object.entries(dados.fontes||{}).map(([id,f])=><li key={id}>{f.fonte||id}: {f.atualizadoEm?new Date(f.atualizadoEm).toLocaleString('pt-BR'):'atualização não confirmada'}</li>)}</ul><ul>{avisos.filter(a=>typeof a==='string'&&/^(Quantidades|Devoluções)/.test(a)).map(a=><li key={a}>{a}</li>)}</ul><p>Venda, faturamento, sinal, recebimento e atraso são indicadores distintos. O período e as permissões acompanham cada consulta.</p></details>
  </>}
  {detalhe&&<Detalhe key={JSON.stringify(detalhe)} selecao={detalhe} filtro={detalhe.filtro} fechar={()=>setDetalhe(null)} verCompleto={verCompleto}/>}
 </div>;
}
