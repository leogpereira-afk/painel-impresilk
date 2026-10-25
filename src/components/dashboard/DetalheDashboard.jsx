import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import Dialogo from '../comercial/DialogoComercial.jsx';
import {consultarDashboardDetalhe} from '../../services/dashboardComercial.js';
import {moeda,dataCurta} from './formatos.js';

export default function DetalheDashboard({filtro,selecao,fechar,verCompleto}) {
 const [pagina,setPagina]=useState(1),[dados,setDados]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true);
 const financeiro=selecao.dimensao==='atraso';
 const chave=JSON.stringify({filtro,...selecao,pagina});
 useEffect(()=>{
  const ctl=new AbortController();setCarregando(true);setDados(null);setErro('');const p=JSON.parse(chave);
  consultarDashboardDetalhe(p.filtro,{dimensao:p.dimensao,id:p.id,pagina:p.pagina,tamanho:25},ctl.signal).then(d=>{if(!ctl.signal.aborted)setDados(d);}).catch(e=>{if(!ctl.signal.aborted)setErro(e.message);}).finally(()=>{if(!ctl.signal.aborted)setCarregando(false);});
  return()=>ctl.abort();
 },[chave]);
 const periodo=dados?.periodo;
 return <Dialogo className="dash-dialog" titulo={selecao.nome||'Pedidos do recorte'} fechar={fechar}>
  <div className="commercial-dashboard">
   <p className="dash-note">{financeiro?'Títulos vencidos ligados integralmente às O.S. selecionadas. Posição atual da fonte; o período abaixo é o período da venda.':'Registros da base comercial autorizada. Data de aprovação da O.S.; não representa data de faturamento ou recebimento.'}</p>
   {periodo&&<p className="dash-note">Vendas de {dataCurta(periodo.de)} a {dataCurta(periodo.ateEfetivo||periodo.ate)}. Os filtros selecionados foram mantidos.</p>}
   {carregando?<p role="status">Carregando {financeiro?'títulos':'pedidos'}…</p>:erro?<p role="alert" className="dash-alert">{erro}</p>:<>
    {dados?.cobertura?.completo===false&&<p className="dash-alert">Cobertura parcial: esta lista contém somente os registros confirmados.</p>}
    <div className="dash-table-wrap"><table className="dash-table dash-detail-table">
     {financeiro?<><thead><tr><th>Cliente / título</th><th>O.S.</th><th>Vencimento</th><th>Faixa</th><th>Saldo vencido</th></tr></thead><tbody>{(dados?.titulos||[]).map(t=><tr key={t.id}><td>{t.cliente||'Não identificado'}<small>Título {t.id}</small></td><td>{t.os}</td><td>{dataCurta(t.vencimento)}</td><td>{t.faixaNome||{'1_7':'1 a 7 dias','8_30':'8 a 30 dias','31_60':'31 a 60 dias','61_90':'61 a 90 dias','90_mais':'Mais de 90 dias'}[t.faixa]||t.faixa}</td><td className="dash-money">{moeda(t.centavos)}</td></tr>)}</tbody></>:
      <><thead><tr><th>O.S.</th><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Líquido do recorte</th><th>Itens e valores</th></tr></thead><tbody>{(dados?.vendas||[]).map(v=><tr key={v.id}><td>{v.numero||v.id}</td><td>{dataCurta(v.data)}</td><td>{v.cliente}</td><td>{v.vendedor||v.vendedorNome||'Não identificado'}</td><td className="dash-money">{moeda(v.centavos)}</td><td><details><summary>Ver itens</summary><p className="dash-note">O.S. completa: bruto {moeda(v.brutoCentavos)}, desconto {moeda(v.descontoCentavos)}, líquido {moeda(v.totalOS)}.</p><ul className="dash-month-list">{(v.produtos||[]).map((p,i)=><li key={`${p.id}-${i}`}><span>{p.nome}{selecao.dimensao==='produto'&&selecao.id===p.id?' · selecionado':''}</span><b>{moeda(p.centavos)}</b></li>)}</ul></details></td></tr>)}</tbody></>}
    </table></div>
    {!(financeiro?dados?.titulos:dados?.vendas)?.length&&<p className="dash-empty">Nenhum {financeiro?'título':'pedido'} disponível.</p>}
    <footer className="dash-pagination"><span>{dados?.paginacao?.total??'—'} {financeiro?'títulos':'pedidos'} · página {pagina}</span><button disabled={pagina===1} onClick={()=>setPagina(pagina-1)}>Anterior</button><button disabled={!dados?.paginacao?.temMais} onClick={()=>setPagina(pagina+1)}>Próxima</button></footer>
    {!financeiro&&verCompleto&&<button className="btn-primary" onClick={verCompleto}>Abrir pedidos, financeiro e acompanhamento</button>}
    {financeiro&&<p className="dash-note"><Link to="/comercial/contas-atrasadas" className="dash-link" onClick={fechar}>Ir à gestão de cobranças</Link> · abre a carteira de cobranças com seus próprios filtros.</p>}
   </>}
  </div>
 </Dialogo>;
}
