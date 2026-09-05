import {useMemo} from 'react';
import {filaComercial,mesesDaDivida,ETAPAS_CRM} from '../lib/calc/inteligencia.js';
import {moeda,rotuloMes} from '../lib/format.js';
import './inteligencia-comercial.css';
export function AceleradorVendas({lista,hoje,aoAbrir,aoEtapa}){
 const fila=useMemo(()=>filaComercial(lista,hoje),[lista,hoje]);
 const abertos=(lista||[]).filter(o=>o.situacao==='aberto');
 return <section className="intel-panel sem-impressao" aria-label="Acelerador de vendas">
 <header><div><span className="intel-kicker">PRÓXIMOS PASSOS</span><h2>Acelerador de vendas</h2><p>{fila.length} clientes com ação sugerida. Retornos combinados vêm primeiro; valor desempata a fila.</p></div><strong>{moeda(fila.reduce((s,g)=>s+g.valor,0))}<small>em propostas desta fila · não é previsão de receita</small></strong></header>
 <div className="intel-etapas">{ETAPAS_CRM.map(e=>{const itens=abertos.filter(o=>(o.etapaCrm||'proposta')===e.id);return <button key={e.id} onClick={()=>aoEtapa(e.id)}><span>{e.nome}</span><b>{itens.length}</b><small>{moeda(itens.reduce((s,o)=>s+o.valor,0))}</small></button>;})}</div>
 <div className="intel-fila">{fila.slice(0,6).map((g,i)=><article key={g.chave}><span className="intel-posicao">{i+1}</span><div><h3>{g.cliente}</h3><p>{g.acao}</p><small>{g.motivo} · {g.itens.length} {g.itens.length === 1 ? "proposta" : "propostas"} · {moeda(g.valor)}</small></div><button className="btn-outline" onClick={()=>aoAbrir(g)}>Preparar ação</button></article>)}</div>
 {!fila.length&&<p className="intel-vazio">Nenhum próximo passo sugerido agora. Os retornos futuros continuam na Agenda.</p>}
 <p className="intel-nota">Sugestões por regras visíveis, baseadas nos registros do painel. Revise o histórico antes de contatar. Sem probabilidade de fechamento estimada.</p>
 </section>;
}
export function VisaoMensalCobranca({titulos,aoMes}){
 const {meses,semData}=useMemo(()=>mesesDaDivida(titulos),[titulos]);const maior=Math.max(1,...meses.map(m=>m.valor));
 return <section className="intel-panel sem-impressao" aria-label="Visão mensal da dívida"><header><div><span className="intel-kicker">MESES EM ABERTO</span><h2>Onde a dívida se concentra</h2><p>Saldo dos títulos vencidos carregados, inclusive anteriores ao corte. Agrupado pelo mês de vencimento.</p></div><select className="input" aria-label="Consultar mês de vencimento" value="" onChange={e=>e.target.value&&aoMes(e.target.value)}><option value="">Escolher qualquer mês</option>{meses.map(m=><option key={m.mes} value={m.mes}>{rotuloMes(m.mes)} · {moeda(m.valor)}</option>)}</select></header>
 <div className="intel-meses">{meses.slice(0,6).map(m=><button key={m.mes} onClick={()=>aoMes(m.mes)}><span>{rotuloMes(m.mes)}</span><strong>{moeda(m.valor)}</strong><small>{m.quantidade} {m.quantidade === 1 ? "título" : "títulos"} · ver detalhes</small><span className="intel-barra"><i style={{width:`${m.valor/maior*100}%`}}/></span></button>)}</div>
 {semData>0&&<p className="intel-nota">{semData} títulos sem mês de vencimento válido não entram nos meses.</p>}
 </section>;
}
