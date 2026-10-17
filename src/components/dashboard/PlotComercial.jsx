import {useId,useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {dominioGrafico,segmentosValidos} from '../../lib/calc/graficos-comerciais.js';

const curta=v=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v);

export default function PlotComercial({pontos=[],series=[],tipo='linha',formatar,unidade='R$',onAbrir,altura=285}) {
  const uid=useId(),refs=useRef(new Map()),[ativo,setAtivo]=useState(null);
  const principais=series.filter(s=>s.eixo!=='percentual');
  const dominio=dominioGrafico(principais.flatMap(s=>s.valores));
  const largura=800,margem={esquerda:68,direita:series.some(s=>s.eixo==='percentual')?54:20,cima:24,baixo:42};
  const w=largura-margem.esquerda-margem.direita,h=altura-margem.cima-margem.baixo;
  const passo=w/Math.max(1,pontos.length),x=i=>margem.esquerda+passo*(i+.5);
  const y=(v,percentual=false)=>margem.cima+h*(1-(v-(percentual?0:dominio.min))/((percentual?100:dominio.max)- (percentual?0:dominio.min)));
  const pos=ativo&&series[ativo.s]?.valores[ativo.i]!=null?ativo:null;
  const ponto=pos?pontos[pos.i]:null,serie=pos?series[pos.s]:null;
  const descricao=pos?serie.pontos?.[pos.i]||ponto:null;
  const ativar=(s,i)=>setAtivo({s,i});
  const teclado=(e,s,i)=>{
    if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){
      e.preventDefault();
      const indices=series[s].valores.map((v,n)=>Number.isFinite(v)?n:null).filter(n=>n!==null);
      const posicao=indices.indexOf(i),proxima=e.key==='Home'?indices[0]:e.key==='End'?indices.at(-1):indices[Math.max(0,Math.min(indices.length-1,posicao+(e.key==='ArrowRight'?1:-1)))];
      if(proxima!=null){ativar(s,proxima);refs.current.get(`${s}-${proxima}`)?.focus();}
    }
    if(e.key==='Enter'||e.key===' '){e.preventDefault();ativar(s,i);}
  };
  if(!pontos.length||dominio.vazio)return <p className="dash-empty">Sem valores confirmados para desenhar este gráfico. Consulte a cobertura do período.</p>;
  return <div className="chart-plot">
    <div className="chart-legend" aria-label="Legenda">{series.map(s=><span key={s.id}><i style={{background:s.cor}}/>{s.nome}{s.eixo==='percentual'?' (%)':''}</span>)}</div>
    <svg viewBox={`0 0 ${largura} ${altura}`} role="group" aria-labelledby={`${uid}-titulo`} className="chart-svg">
      <title id={`${uid}-titulo`}>Gráfico em {unidade}. Use Tab e as setas para explorar os pontos; Enter seleciona. Os mesmos valores estão disponíveis em Tabela.</title>
      {[0,.25,.5,.75,1].map(t=>{
        const v=dominio.min+t*(dominio.max-dominio.min),py=y(v);
        return <g key={t} aria-hidden="true"><line x1={margem.esquerda} y1={py} x2={largura-margem.direita} y2={py} className="chart-gridline"/><text x={margem.esquerda-10} y={py+4} textAnchor="end" className="chart-axis">{unidade==='R$'?curta(v/100):curta(v)}</text>{series.some(s=>s.eixo==='percentual')&&<text x={largura-margem.direita+10} y={margem.cima+h*(1-t)+4} className="chart-axis">{t*100}%</text>}</g>;
      })}
      <text x={margem.esquerda} y={12} className="chart-axis-label" aria-hidden="true">{unidade}</text>
      {series.map((s,si)=>{
        const linha=s.tipo==='linha'||(tipo==='linha'&&s.tipo!=='barras'),pct=s.eixo==='percentual';
        return <g key={s.id}>
          {linha&&segmentosValidos(s.valores).map((segmento,n)=><path key={n} d={segmento.map(([i,v],j)=>`${j?'L':'M'}${x(i)},${y(v,pct)}`).join(' ')} fill="none" stroke={s.cor} strokeWidth={2.8} strokeDasharray={s.referencia?'6 4':undefined} aria-hidden="true"/>)}
          {s.valores.map((v,i)=>{
            if(!Number.isFinite(v))return null;
            const selected=pos?.s===si&&pos?.i===i,barSeries=series.filter(a=>a.tipo!=='linha'&&(tipo==='barras'||a.tipo==='barras'));
            const bi=barSeries.indexOf(s),bw=Math.min(40,passo*.7/Math.max(1,barSeries.length));
            const py=y(v,pct),base=y(0,pct),label=`${s.pontos?.[i]?.nome||pontos[i]?.nome}, ${s.nome}: ${(s.formatar||formatar)(v)}${pontos[i]?.completo===false?', cobertura parcial':''}`;
            return <g key={i} role="button" aria-label={label} aria-pressed={selected} tabIndex={selected||(pos?.s!==si&&i===s.valores.findIndex(Number.isFinite))?0:-1}
              ref={el=>el?refs.current.set(`${si}-${i}`,el):refs.current.delete(`${si}-${i}`)}
              onMouseEnter={()=>ativar(si,i)} onFocus={()=>ativar(si,i)} onClick={()=>ativar(si,i)} onKeyDown={e=>teclado(e,si,i)} className="chart-mark">
              <title>{label}</title>
              {linha?<><circle cx={x(i)} cy={py} r={selected?6:3.8} fill={s.cor} stroke="var(--cc-surface)" strokeWidth={2}/><circle cx={x(i)} cy={py} r={13} fill="transparent"/></>:<rect x={x(i)-barSeries.length*bw/2+Math.max(0,bi)*bw} y={Math.min(py,base)} width={Math.max(1,bw-2)} height={Math.max(2,Math.abs(base-py))} rx={3} fill={s.cor} stroke={selected?'var(--cc-text)':'none'} strokeWidth={selected?1.5:0}/>}
            </g>;
          })}
        </g>;
      })}
      {pontos.map((p,i)=>i%Math.max(1,Math.ceil(pontos.length/7))===0||i===pontos.length-1?<text key={p.id||i} x={x(i)} y={altura-14} textAnchor="middle" className="chart-axis" aria-hidden="true">{p.curto||p.nome}</text>:null)}
    </svg>
    <div className="chart-inspector" aria-live="polite">
      {ponto?<><div><span>{descricao.nome}</span><strong>{serie.nome}: {(serie.formatar||formatar)(serie.valores[pos.i])}</strong>{descricao.completo===false&&<small>Cobertura parcial</small>}</div>{onAbrir&&!serie.referencia&&<button className="chart-action" onClick={()=>onAbrir(ponto,serie)}>Ver registros <ArrowUpRight size={14}/></button>}</>:<p>Toque ou focalize um ponto para ver os valores e abrir os registros.</p>}
    </div>
  </div>;
}
