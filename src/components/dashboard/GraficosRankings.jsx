import {useState} from 'react';
import {Filter,ArrowUpRight} from 'lucide-react';
import Grafico,{AlternadorGrafico,TabelaGrafico} from './GraficoAnalitico.jsx';
import Plot from './PlotComercial.jsx';
import {corSerie} from '../../lib/calc/graficos-comerciais.js';
import {pontosTemporais} from './GraficosVendas.jsx';
import {moeda,numero,porcentagem} from './formatos.js';

const plurais={produto:'produtos',cliente:'clientes',vendedor:'vendedores'};
function ControleTop({valor,onChange}) {
  return <AlternadorGrafico rotulo="Quantidade no gráfico" valor={valor} onChange={onChange} opcoes={[{valor:'5',nome:'Top 5'},{valor:'10',nome:'Top 10'},{valor:'todos',nome:'Todos'}]}/>;
}
function PaginaGrafico({pagina,paginas,total,onChange}) {
  return paginas>1?<div className="dash-pagination"><span>{total} registros, página {pagina} de {paginas}</span><button disabled={pagina===1} onClick={()=>onChange(pagina-1)}>Anterior</button><button disabled={pagina===paginas} onClick={()=>onChange(pagina+1)}>Próxima</button></div>:null;
}

export function GraficoRanking({linhas=[],dimensao,abrir,selecionar,cobertura,compacto=false}) {
  const [top,setTop]=useState('5'),[medida,setMedida]=useState('valor'),[pagina,setPagina]=useState(1),[idSelecionado,setSelecionado]=useState(null);
  const unidades=[...new Set(linhas.flatMap(l=>Object.keys(l.quantidades||{})))].sort();
  const quantidade=medida.startsWith('q:'),campo=medida==='pedidos'?'pedidos':medida==='recorrencia'?'diasCompra':'centavos';
  const valor=l=>quantidade?l.quantidades?.[medida.slice(2)]:l[campo];
  const formatar=medida==='valor'?moeda:numero,unidade=quantidade?medida.slice(2):medida==='valor'?'R$':medida==='recorrencia'?'dias com compra':'pedidos';
  const ordenadas=linhas.filter(l=>Number.isFinite(valor(l))).slice().sort((a,b)=>valor(b)-valor(a));
  const tamanho=top==='todos'?25:Number(top),paginas=top==='todos'?Math.max(1,Math.ceil(ordenadas.length/tamanho)):1,atual=Math.min(pagina,paginas);
  const recorte=ordenadas.slice((atual-1)*tamanho,atual*tamanho),max=Math.max(1,...ordenadas.map(valor));
  const selecionado=linhas.find(l=>l.id===idSelecionado);
  const pontos=recorte.map(l=>({...l,valor:valor(l)})),series=[{id:'valor',nome:medida==='valor'?'Venda líquida':unidade,valores:pontos.map(p=>p.valor)}];
  const mudarTop=v=>{setTop(v);setPagina(1);};
  return <Grafico titulo={`${compacto?'Destaques':'Ranking'} de ${plurais[dimensao]}`} descricao={compacto?'Selecione uma barra para abrir os pedidos ou filtrar o Dashboard.':'Compare valor, pedidos e medidas disponíveis na mesma unidade.'}
    controles={<><ControleTop valor={top} onChange={mudarTop}/>{!compacto&&<label className="chart-select-label">Medida<select aria-label={`Medida de ${plurais[dimensao]}`} value={medida} onChange={e=>{setMedida(e.target.value);setPagina(1);}}><option value="valor">Valor vendido</option><option value="pedidos">Quantidade de pedidos</option>{dimensao==='cliente'&&<option value="recorrencia">Dias distintos com compra</option>}{dimensao==='produto'&&unidades.map(u=><option key={u} value={`q:${u}`}>Quantidade ({u})</option>)}</select></label>}</>}
    renderGrafico={()=>pontos.length?<><div className="chart-horizontal-scale"><span>0</span><span>{formatar(max)} {medida==='valor'?'':unidade}</span></div><div className="chart-horizontal-bars">{pontos.map(p=><button key={p.id} type="button" className="chart-horizontal-row" aria-pressed={idSelecionado===p.id} onClick={()=>setSelecionado(p.id)} title={`${p.nome}: ${formatar(p.valor)} ${unidade}. Participação: ${porcentagem(p.participacao)}.`}>
      <span className="chart-row-name">{p.nome}</span><span className="chart-row-track"><i style={{width:`${Math.max(0,p.valor/max*100)}%`,background:corSerie(`${dimensao}:${p.id}`)}}/></span><strong>{formatar(p.valor)}</strong>
    </button>)}</div></>:<p className="dash-empty">Nenhum registro com esta medida confirmada no recorte.</p>}
    tabela={<TabelaGrafico pontos={pontos} series={series} formatar={formatar} abrir={p=>abrir(dimensao,p)}/>}
    rodape={<><PaginaGrafico pagina={atual} paginas={paginas} total={ordenadas.length} onChange={setPagina}/>{selecionado&&<div className="chart-inspector"><div><span>Seleção</span><strong>{selecionado.nome}</strong><small>{porcentagem(selecionado.participacao)} das vendas do recorte</small></div><div className="chart-toolbar-actions"><button className="chart-action" onClick={()=>selecionar(dimensao,selecionado)}><Filter size={14}/>Filtrar {dimensao}</button><button className="chart-action" onClick={()=>abrir(dimensao,selecionado)}>Ver registros <ArrowUpRight size={14}/></button><button className="chart-action" onClick={()=>setSelecionado(null)}>Limpar seleção</button></div></div>}</>}
    nota={cobertura?.completo===false?`Ranking limitado aos ${cobertura.exibidos} maiores de ${numero(cobertura.total)} grupos. Filtros superiores permitem consultar um registro específico.`:quantidade?'Quantidades comparadas apenas dentro da unidade informada.':dimensao==='cliente'?'Frequência representa dias com compras registradas; não é uma previsão de recompra.':'As cores identificam as categorias ou pessoas e permanecem estáveis.'}/>
}

export function GraficoVendedores({dados,abrir}) {
  const linhas=dados.rankings?.vendedores||[],[escolhidos,setEscolhidos]=useState(null),[grupo,setGrupo]=useState('mes');
  const ids=escolhidos||linhas.slice(0,Math.min(3,linhas.length)).map(l=>l.id);
  const selecionados=linhas.filter(l=>ids.includes(l.id)),pontos=pontosTemporais(dados.series?.[grupo==='mes'?'mensal':'anual']||[]);
  const series=selecionados.map(l=>({id:l.id,nome:l.nome,cor:corSerie(`vendedor:${l.id}`),valores:pontos.map(p=>{
    const registro=(grupo==='mes'?l.meses:l.anos)?.find(x=>(x.mes||x.ano)===(p.mes||p.ano));
    return registro?.centavos??(p.completo?0:null);
  })}));
  const alternar=id=>setEscolhidos(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
  return <Grafico titulo="Vendedores mês a mês" descricao="Compare até cinco vendedores da carteira autorizada."
    controles={<><AlternadorGrafico rotulo="Período por vendedor" valor={grupo} onChange={setGrupo} opcoes={[{valor:'mes',nome:'Mês'},{valor:'ano',nome:'Ano'}]}/><details className="chart-seller-selector"><summary>Vendedores ({ids.length})</summary><div>{linhas.map(l=><label key={l.id}><input type="checkbox" checked={ids.includes(l.id)} disabled={!ids.includes(l.id)&&ids.length>=5} onChange={()=>alternar(l.id)}/><i style={{background:corSerie(`vendedor:${l.id}`)}}/>{l.nome}</label>)}</div></details></>}
    renderGrafico={()=> <Plot pontos={pontos} series={series} formatar={moeda} onAbrir={(p,s)=>abrir(p,selecionados.find(v=>v.id===s.id))}/>}
    tabela={<TabelaGrafico pontos={pontos} series={series} formatar={moeda}/>}
    nota="Períodos sem cobertura ficam interrompidos. Zero só aparece quando o período é conhecido e não há venda do vendedor."/>
}

export function GraficoPareto({linhas=[],dimensao,abrir,cobertura}) {
  const [top,setTop]=useState('10'),[pagina,setPagina]=useState(1),tamanho=top==='todos'?25:Number(top);
  const paginas=top==='todos'?Math.max(1,Math.ceil(linhas.length/tamanho)):1,atual=Math.min(pagina,paginas);
  const pontos=linhas.slice((atual-1)*tamanho,atual*tamanho).map(p=>({...p,curto:`#${p.posicao}`}));
  const series=[{id:'valor',nome:'Venda líquida',tipo:'barras',cor:'var(--chart-1)',valores:pontos.map(p=>p.centavos)},{id:'acumulado',nome:'Participação acumulada',tipo:'linha',eixo:'percentual',cor:'var(--chart-3)',valores:pontos.map(p=>p.acumuladoPercentual),formatar:porcentagem}];
  return <Grafico titulo={`Pareto de ${plurais[dimensao]}`} descricao="Barras mostram vendas; a linha mostra a participação acumulada na base autorizada."
    controles={<ControleTop valor={top} onChange={v=>{setTop(v);setPagina(1);}}/>}
    renderGrafico={()=> <Plot pontos={pontos} series={series} tipo="barras" formatar={moeda} onAbrir={p=>abrir(dimensao,p)}/>}
    tabela={<TabelaGrafico pontos={pontos} series={series} formatar={moeda} abrir={p=>abrir(dimensao,p)}/>}
    rodape={<PaginaGrafico pagina={atual} paginas={paginas} total={linhas.length} onChange={setPagina}/>}
    nota={`A participação acumulada não é recalculada ao mudar Top ou página. ${cobertura?.completo===false?'A lista contém apenas os maiores grupos informados na cobertura.':''}`}/>
}
