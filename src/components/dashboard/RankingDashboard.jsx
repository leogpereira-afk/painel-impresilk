import {useMemo,useState} from 'react';
import {moeda,numero,porcentagem,nomeMes,dataCurta} from './formatos.js';

export default function RankingDashboard({linhas=[],dimensao,abrir,abc=false,cobertura}) {
  const [busca,setBusca]=useState(''),[pagina,setPagina]=useState(1),[ordem,setOrdem]=useState('valor');
  const unidades=useMemo(()=>[...new Set(linhas.flatMap(l=>Object.keys(l.quantidades||{})))].sort(),[linhas]);
  const filtradas=useMemo(()=>linhas.filter(l=>String(l.nome||'').toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))
    .filter(l=>!ordem.startsWith('q:')||Number.isFinite(l.quantidades?.[ordem.slice(2)]))
    .sort((a,b)=>ordem==='pedidos'?(b.pedidos||0)-(a.pedidos||0):ordem.startsWith('q:')?(b.quantidades[ordem.slice(2)]-a.quantidades[ordem.slice(2)]):(b.centavos||0)-(a.centavos||0)),[linhas,busca,ordem]);
  const paginas=Math.max(1,Math.ceil(filtradas.length/25)),atual=Math.min(pagina,paginas),visiveis=filtradas.slice((atual-1)*25,atual*25);
  const rotulo=dimensao==='produto'?'Produto':dimensao==='vendedor'?'Vendedor':'Cliente';
  return <section className="dash-card">
    {cobertura?.completo===false&&<p className="dash-alert">Exibidos os {cobertura.exibidos} maiores de {numero(cobertura.total)} registros. A busca e as ordenações abaixo abrangem esta seleção. Use os filtros superiores para consultar um registro específico; os totais e a ABC são calculados sobre a base inteira autorizada.</p>}
    <div className="dash-table-tools"><label>Pesquisar no ranking<input type="search" value={busca} onChange={e=>{setBusca(e.target.value);setPagina(1);}} placeholder="Digite o nome"/></label><label>Ordenação<select value={ordem} onChange={e=>{setOrdem(e.target.value);setPagina(1);}}><option value="valor">Maior valor vendido</option><option value="pedidos">Mais pedidos</option>{dimensao==='produto'&&unidades.map(u=><option key={u} value={`q:${u}`}>Quantidade · {u}</option>)}</select></label><span>{numero(filtradas.length)} registros</span></div>
    {dimensao==='produto'&&<p className="dash-note">Quantidades comparadas apenas na mesma unidade informada. Itens sem unidade confirmada não entram no ranking de quantidade.</p>}
    <div className="dash-table-wrap"><table className="dash-table"><caption className="sr-only">Ranking de {rotulo}; valores líquidos de vendas</caption><thead><tr><th>#</th><th>{rotulo}</th><th>Venda líquida</th><th>Pedidos</th><th>Ticket médio</th><th>Participação</th>{abc?<><th>Acumulado</th><th>ABC</th></>:<th>Variação anterior</th>}<th>Evolução</th></tr></thead><tbody>{visiveis.map((l,i)=><tr key={l.id}>
      <td>{ordem==='valor'?l.posicao:(atual-1)*25+i+1}</td>
      <td><button className="dash-link" onClick={()=>abrir(dimensao,l)}>{l.nome||'Não identificado'}</button>
        {dimensao==='produto'&&<small>{Object.entries(l.quantidades||{}).map(([u,q])=>`${numero(q)} ${u}`).join(' · ')||'Unidade não confirmada'}</small>}
        {dimensao==='cliente'&&<><small>Última compra: {dataCurta(l.ultimaCompra)}</small><small>{numero(l.diasCompra)} dias com compra{l.intervaloMedianoDias!=null?` · intervalo mediano ${numero(l.intervaloMedianoDias)} dias`:''}</small></>}
      </td><td>{moeda(l.centavos)}</td><td>{numero(l.pedidos)}</td><td>{moeda(l.ticketMedio)}</td><td>{porcentagem(l.participacao)}</td>
      {abc?<><td>{porcentagem(l.acumuladoPercentual)}</td><td><span className={`dash-badge dash-abc-${l.abc||'C'}`}>{l.abc||'Sem classe'}</span></td></>:<td>{l.comparacaoPeriodo?.completo?porcentagem(l.comparacaoPeriodo.percentual):'Não comparável'}</td>}
      <td><details><summary>Meses e anos</summary><p className="dash-note">Posição por valor vendido no período, antes da busca e ordenação desta tabela.</p><ul className="dash-month-list">{(l.anos||[]).map(a=><li key={a.ano}><strong>{a.ano} · #{a.posicao}</strong><b>{moeda(a.centavos)}</b></li>)}</ul><ul className="dash-month-list">{(l.meses||[]).map(m=><li key={m.mes}><span>{nomeMes(m.mes)} · #{m.posicao}</span><button className="dash-link" onClick={()=>abrir(dimensao,{...l,mes:m.mes})}>{moeda(m.centavos)}</button></li>)}</ul></details></td>
    </tr>)}</tbody></table></div>
    {!visiveis.length&&<p className="dash-empty">Nenhum registro disponível para este recorte.</p>}
    <footer className="dash-pagination"><span>Página {atual} de {paginas}</span><button disabled={atual===1} onClick={()=>setPagina(atual-1)}>Anterior</button><button disabled={atual===paginas} onClick={()=>setPagina(atual+1)}>Próxima</button></footer>
  </section>;
}
