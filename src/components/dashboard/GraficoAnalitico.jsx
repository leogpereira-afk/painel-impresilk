import {useId,useState} from 'react';
import {ChartNoAxesCombined,Table2,Maximize2,ArrowUpRight} from 'lucide-react';
import Dialogo from '../comercial/DialogoComercial.jsx';
import './graficos-comerciais.css';

export function AlternadorGrafico({rotulo,valor,opcoes,onChange}) {
  return <div className="chart-segmented" role="group" aria-label={rotulo}>
    {opcoes.map(o=><button type="button" key={o.valor} aria-pressed={valor===o.valor} disabled={o.disabled} title={o.motivo} onClick={()=>onChange(o.valor)}>{o.icone}{o.nome}</button>)}
  </div>;
}

export default function GraficoAnalitico({titulo,descricao,controles,renderGrafico,tabela,nota,onRegistros,rodape,classe=''}) {
  const id=useId(),[vista,setVista]=useState('grafico'),[ampliado,setAmpliado]=useState(false);
  const corpo=grande=><>
    {descricao&&<p className="dash-note chart-description">{descricao}</p>}
    <div className="chart-toolbar">
      <div className="chart-toolbar-options">{controles}</div>
      <div className="chart-toolbar-actions">
        <AlternadorGrafico rotulo={`Visualização de ${titulo}`} valor={vista} onChange={setVista} opcoes={[
          {valor:'grafico',nome:'Gráfico',icone:<ChartNoAxesCombined size={14}/>},
          {valor:'tabela',nome:'Tabela',icone:<Table2 size={14}/>},
        ]}/>
        {!grande&&<button type="button" className="chart-icon-button" aria-label={`Ampliar ${titulo}`} title="Ampliar gráfico" onClick={()=>setAmpliado(true)}><Maximize2 size={16}/></button>}
        {onRegistros&&<button type="button" className="chart-action" onClick={onRegistros}>Ver registros <ArrowUpRight size={14}/></button>}
      </div>
    </div>
    {vista==='grafico'?renderGrafico({ampliado:grande}):tabela}
    {rodape}
    {nota&&<p className="dash-note chart-footnote">{nota}</p>}
  </>;
  return <section className={`dash-card analytic-chart ${classe}`} aria-labelledby={id}>
    <h2 id={id}>{titulo}</h2>
    {corpo(false)}
    {ampliado&&<Dialogo titulo={titulo} className="dash-dialog chart-dialog" fechar={()=>setAmpliado(false)}>
      <div className="commercial-dashboard chart-expanded">{corpo(true)}</div>
    </Dialogo>}
  </section>;
}

export function TabelaGrafico({pontos,series,formatar,abrir}) {
  return <div className="dash-table-wrap"><table className="dash-table chart-data-table">
    <caption className="sr-only">Dados do gráfico</caption>
    <thead><tr><th>Período ou categoria</th>{series.map(s=><th key={s.id}>{s.nome}</th>)}</tr></thead>
    <tbody>{pontos.map((p,i)=><tr key={p.id||i}>
      <th scope="row">{abrir?<button className="dash-link" onClick={()=>abrir(p)}>{p.nome}</button>:p.nome}{p.completo===false&&<small>Parcial</small>}</th>
      {series.map(s=><td key={s.id}>{(s.formatar||formatar)(s.valores[i])}{s.pontos?.[i]?.nome&&<small>{s.pontos[i].nome}</small>}</td>)}
    </tr>)}</tbody>
  </table></div>;
}
