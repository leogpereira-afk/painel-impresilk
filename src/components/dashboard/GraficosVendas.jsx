import {useState} from 'react';
import {ChartColumn,ChartLine} from 'lucide-react';
import Grafico,{AlternadorGrafico,TabelaGrafico} from './GraficoAnalitico.jsx';
import Plot from './PlotComercial.jsx';
import {moeda,porcentagem,numero,dataCurta,nomeMes} from './formatos.js';
import {alinharComparacaoGrafica} from '../../lib/calc/comparacao-grafica.js';

const CHAVES={dia:'diaria',mes:'mensal',ano:'anual'};
export function pontosTemporais(linhas=[]) {
  return linhas.map(p=>({...p,id:p.data||p.mes||p.ano,nome:p.data?dataCurta(p.data):p.mes?nomeMes(p.mes):String(p.ano),curto:p.data?p.data.slice(8)+'/'+p.data.slice(5,7):p.mes?nomeMes(p.mes):String(p.ano)}));
}
function Periodicidade({valor,onChange,series}) {
  return <AlternadorGrafico rotulo="Agrupar evolução" valor={valor} onChange={onChange} opcoes={[
    {valor:'dia',nome:'Dia',disabled:!series.diariaDisponivel,motivo:series.motivoDiaria},
    {valor:'mes',nome:'Mês'},{valor:'ano',nome:'Ano'},
  ]}/>;
}

export function EvolucaoVendas({dados,modo,abrirPeriodo,abrirTodos}) {
  const base=dados.series||{},[grupo,setGrupo]=useState(base.diariaDisponivel&&base.diaria?.length<=62?'dia':'mes');
  const [tipo,setTipo]=useState('linha'),[comparar,setComparar]=useState('');
  const indisponivel=dados.resumo?.estado==='indisponivel';
  const ausencia=<p className="dash-empty" role="status">Dados de vendas indisponíveis neste período. Confira a cobertura e a empresa de origem dos registros.</p>;
  const agrupamento=grupo==='dia'&&!base.diariaDisponivel?'mes':grupo;
  const pontos=pontosTemporais(base[CHAVES[agrupamento]]),comparativo=dados.comparacoes?.[comparar];
  const alinhamento=comparativo?.comparavel?alinharComparacaoGrafica({atuais:pontos,anteriores:pontosTemporais(comparativo.series?.[CHAVES[agrupamento]]||[]),agrupamento,tipo:comparar,modo}):null;
  const linhas=[{id:'atual',nome:'Vendas do período',cor:'var(--chart-1)',valores:pontos.map(p=>p.centavos)}];
  if(alinhamento?.disponivel){
    const anteriores=alinhamento.pontos;
    linhas.push({id:comparar,nome:comparar==='anterior'?'Período anterior':'Ano anterior',referencia:true,cor:'var(--chart-3)',pontos:anteriores,valores:anteriores.map(p=>p?.centavos??null)});
  }
  return <Grafico titulo="Evolução das vendas" descricao="Valor líquido por data de cadastro da O.S. Selecione um ponto para conferir o período."
    controles={<><Periodicidade valor={agrupamento} onChange={setGrupo} series={base}/><AlternadorGrafico rotulo="Tipo de gráfico de vendas" valor={tipo} onChange={setTipo} opcoes={[
      {valor:'linha',nome:'Linhas',icone:<ChartLine size={14}/>},{valor:'barras',nome:'Colunas',icone:<ChartColumn size={14}/>},
    ]}/><label className="chart-select-label">Comparação<select aria-label="Comparação da evolução" value={comparar} onChange={e=>setComparar(e.target.value)}><option value="">Sem comparação</option><option value="anterior" disabled={!dados.comparacoes?.anterior?.comparavel}>Período anterior</option><option value="anoAnterior" disabled={!dados.comparacoes?.anoAnterior?.comparavel}>Mesmo período do ano anterior</option></select></label></>}
    renderGrafico={()=>indisponivel?ausencia:<Plot pontos={pontos} series={linhas} tipo={tipo} formatar={moeda} onAbrir={p=>abrirPeriodo(p)}/>}
    tabela={indisponivel?ausencia:<TabelaGrafico pontos={pontos} series={linhas} formatar={moeda} abrir={abrirPeriodo}/>}
    onRegistros={abrirTodos} nota={alinhamento?.disponivel?'Períodos alinhados por datas equivalentes. A tabela informa as datas comparadas; dias sem equivalente permanecem sem valor.':alinhamento?.motivo||'Comparações ficam disponíveis quando os dois períodos têm cobertura suficiente. Lacunas não são preenchidas com zero.'}/>
}

export function GraficoDescontos({dados,abrirPeriodo}) {
  const base=dados.series||{},[medida,setMedida]=useState('percentual');
  const periodo=base.diariaDisponivel&&base.diaria?.length<=62?'diaria':'mensal',pontos=pontosTemporais(base[periodo]||[]);
  const percentual=medida==='percentual',formatar=percentual?porcentagem:moeda;
  const series=[{id:'desconto',nome:percentual?'Desconto sobre o bruto':'Valor de descontos',cor:'var(--chart-3)',valores:pontos.map(p=>percentual?p.descontoPercentual:p.descontoCentavos)}];
  return <Grafico titulo="Descontos nas vendas" descricao="Acompanhe quanto do valor bruto foi concedido em descontos."
    controles={<AlternadorGrafico rotulo="Medida dos descontos" valor={medida} onChange={setMedida} opcoes={[{valor:'percentual',nome:'Percentual'},{valor:'valor',nome:'Valor'}]}/>}
    renderGrafico={()=> <Plot pontos={pontos} series={series} tipo="barras" unidade={percentual?'%':'R$'} formatar={formatar} onAbrir={p=>abrirPeriodo(p)}/>}
    tabela={<TabelaGrafico pontos={pontos} series={series} formatar={formatar} abrir={abrirPeriodo}/>}
    nota="Percentual = descontos ÷ valor bruto × 100. Sem bruto válido, o percentual permanece indisponível. Desconto não equivale à margem."/>
}

export function GraficoMetas({dados}) {
  const serie=dados?.serieAcumulada;
  const pontos=pontosTemporais(serie?.pontos||[]),series=[{id:'realizado',nome:'Realizado acumulado',cor:'var(--chart-1)',valores:pontos.map(p=>p.acumuladoCentavos)}];
  if(Number.isFinite(serie?.metaCentavos))series.push({id:'meta',nome:'Meta mensal cadastrada',referencia:true,cor:'var(--chart-2)',valores:pontos.map(()=>serie.metaCentavos)});
  return <Grafico titulo="Evolução da meta" descricao="Vendas acumuladas dos mesmos participantes da meta cadastrada."
    renderGrafico={()=>pontos.length?<Plot pontos={pontos} series={series} formatar={moeda}/>:<p className="dash-empty">Selecione um mês completo de planejamento, sem filtro de produto, categoria, cliente ou campanha, para acompanhar os participantes da meta.</p>}
    tabela={<TabelaGrafico pontos={pontos} series={series} formatar={moeda}/>}
    nota={serie?.criterio||'A meta mensal é uma referência final; não representa uma obrigação diária distribuída artificialmente.'}/>
}

export function GraficoAtrasos({dados,onRegistros}) {
  const [medida,setMedida]=useState('valor'),valor=medida==='valor';
  const confirmado=Number.isFinite(valor?dados.vencidoCentavos:dados.titulosVencidos);
  const pontos=(confirmado?dados.faixas||[]:[]).map(p=>({...p,id:p.id,nome:p.nome,curto:p.nome}));
  const series=[{id:'atraso',nome:valor?'Saldo vencido':'Títulos vencidos',cor:'var(--chart-alert)',valores:pontos.map(p=>valor?p.centavos:p.titulos)}];
  return <Grafico titulo="Distribuição dos atrasos" descricao="Faixas contadas a partir do vencimento, somente nos títulos vinculados ao recorte."
    controles={<AlternadorGrafico rotulo="Medida de atrasos" valor={medida} onChange={setMedida} opcoes={[{valor:'valor',nome:'Valor'},{valor:'titulos',nome:'Títulos'}]}/>}
    renderGrafico={()=> <Plot pontos={pontos} series={series} tipo="barras" formatar={valor?moeda:numero} unidade={valor?'R$':'Títulos'} onAbrir={onRegistros}/>}
    tabela={<TabelaGrafico pontos={pontos} series={series} formatar={valor?moeda:numero}/>}
    onRegistros={()=>onRegistros()} nota={`${dados.escopo||''} ${dados.completo===false?'Cobertura parcial; os valores podem mudar após conciliação.':''}`}/>
}
