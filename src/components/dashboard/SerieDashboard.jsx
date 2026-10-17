import {useRef} from 'react';
import {moeda,nomeMes} from './formatos.js';
import Grafico from './GraficoAnalitico.jsx';
export default function SerieDashboard({linhas=[],abrir}){
 const max=Math.max(1,...linhas.map(l=>l.centavos||0));
 return <section className="dash-card"><header className="dash-section-head"><h2>Evolução das vendas</h2><span>Abra um mês para conferir os pedidos</span></header>{linhas.length?<div className="dash-series">{linhas.slice(-24).map(l=><button key={l.mes} onClick={()=>abrir(l.mes)} aria-label={`${nomeMes(l.mes)}, ${moeda(l.centavos)}${l.completo===false?', cobertura parcial':''}, abrir pedidos`}><span>{nomeMes(l.mes)}</span><span className="dash-bar-track"><i style={{width:`${Math.max(0,(l.centavos||0)/max*100)}%`}}/></span><strong>{moeda(l.centavos)}</strong>{l.completo===false&&<small>Parcial</small>}</button>)}</div>:<p className="dash-empty">Sem série disponível neste recorte.</p>}{linhas.length>24&&<p className="dash-note">Exibidos os últimos 24 meses. O histórico completo está na aba Histórico.</p>}</section>;
}
const NOMES_MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function montarMatrizHistorica(linhas=[]) {
 const porAno=new Map();
 for(const linha of linhas){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(linha?.mes||''))continue;
  const ano=linha.mes.slice(0,4);
  if(!porAno.has(ano))porAno.set(ano,new Map());
  porAno.get(ano).set(linha.mes,linha);
 }
 return [...porAno].sort(([a],[b])=>b.localeCompare(a)).map(([ano,registros])=>{
  const meses=NOMES_MESES.map((nome,i)=>{
   const mes=`${ano}-${String(i+1).padStart(2,'0')}`,linha=registros.get(mes);
   return {...linha,mes,nome,centavos:Number.isFinite(linha?.centavos)?linha.centavos:null};
  });
  const conhecidos=meses.filter(m=>m.centavos!==null);
  return {ano,meses,total:conhecidos.length?conhecidos.reduce((s,m)=>s+m.centavos,0):null};
 });
}

function MapaCalorHistorico({anos,abrir}) {
 const refs=useRef(new Map());
 const todos=anos.flatMap(a=>a.meses),disponiveis=todos.filter(m=>m.centavos!==null);
 const max=Math.max(1,...disponiveis.map(m=>Math.abs(m.centavos)));
 const teclado=(e,mes)=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();
  const indice=todos.findIndex(m=>m.mes===mes),linha=Math.floor(indice/12),coluna=indice%12;
  const inicio=linha*12,fim=inicio+11;
  let proximo=e.key==='Home'?inicio:e.key==='End'?fim:indice+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-12,ArrowDown:12}[e.key]||0);
  const passo=e.key==='Home'?1:e.key==='End'?-1:e.key==='ArrowUp'?-12:e.key==='ArrowDown'?12:e.key==='ArrowLeft'?-1:1;
  while(proximo>=0&&proximo<todos.length){
   if((e.key==='Home'||e.key==='End')&&(proximo<inicio||proximo>fim))break;
   if((e.key==='ArrowUp'||e.key==='ArrowDown')&&proximo%12!==coluna)break;
   if(todos[proximo].centavos!==null){refs.current.get(todos[proximo].mes)?.focus();break;}
   proximo+=passo;
  }
 };
 return <>
  <div className="chart-heatmap-key" aria-label="Legenda do mapa de calor"><span><i/>Maior venda</span><span><i className="heatmap-key-zero"/>Zero confirmado</span><span><i className="heatmap-key-missing"/>Sem informação</span><span>* Cobertura parcial</span></div>
  <div className="chart-heatmap">{anos.map(ano=><article className="chart-heatmap-year" key={ano.ano} aria-label={`Vendas de ${ano.ano}`}>
   <header><h3>{ano.ano}</h3><span>Total disponível<strong>{moeda(ano.total)}</strong></span></header>
   <div className="chart-heatmap-cells">{ano.meses.map(m=>{
    const conhecido=m.centavos!==null,nivel=conhecido&&m.centavos!==0?Math.max(1,Math.ceil(Math.abs(m.centavos)/max*5)):0;
    const label=`${nomeMes(m.mes)}: ${conhecido?moeda(m.centavos):'sem informação disponível'}${m.completo===false?', cobertura parcial':''}${conhecido?', abrir pedidos':''}`;
    return <button type="button" key={m.mes} ref={el=>el?refs.current.set(m.mes,el):refs.current.delete(m.mes)} className="chart-heatmap-cell" data-nivel={nivel} data-negativo={m.centavos<0} disabled={!conhecido} title={label} aria-label={label} onClick={()=>abrir?.(m.mes)} onKeyDown={e=>teclado(e,m.mes)}>
     <span>{m.nome}</span><strong>{conhecido?moeda(m.centavos):'—'}{conhecido&&m.completo===false?' *':''}</strong>
    </button>;
   })}</div>
  </article>)}</div>
 </>;
}

function TabelaHistorica({anos,abrir}) {
 return <div className="dash-table-wrap"><table className="dash-table dash-matrix"><caption className="sr-only">Vendas por ano e mês</caption><thead><tr><th>Ano</th>{NOMES_MESES.map(m=><th key={m}>{m}</th>)}<th>Total disponível</th></tr></thead><tbody>{anos.map(ano=><tr key={ano.ano}><th scope="row">{ano.ano}</th>{ano.meses.map(m=><td key={m.mes}>{m.centavos===null?'—':<button className="dash-link" title={`${nomeMes(m.mes)}${m.completo===false?', cobertura parcial':''}`} onClick={()=>abrir?.(m.mes)}>{moeda(m.centavos)}{m.completo===false?' *':''}</button>}</td>)}<td>{moeda(ano.total)}</td></tr>)}</tbody></table></div>;
}

export function MatrizHistorica({linhas,meses,abrir,onAbrirMes}) {
 const anos=montarMatrizHistorica(linhas||meses||[]),onAbrir=abrir||onAbrirMes;
 return <Grafico titulo="Histórico mês a mês" descricao="Compare os meses e anos no mapa de calor. Cada célula informa o valor e abre os pedidos do recorte."
  renderGrafico={()=>anos.length?<MapaCalorHistorico anos={anos} abrir={onAbrir}/>:<p className="dash-empty">Histórico indisponível.</p>}
  tabela={anos.length?<TabelaHistorica anos={anos} abrir={onAbrir}/>:<p className="dash-empty">Histórico indisponível.</p>}
  nota="A intensidade compara valores confirmados deste recorte. — indica falta de informação; R$ 0,00 é zero confirmado; * indica cobertura parcial. Totais disponíveis não estimam os meses ausentes. Use Tab e as setas para explorar os meses."/>;
}
