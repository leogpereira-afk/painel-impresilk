import {useMemo,useState} from 'react';
import {filaComercial,mesesDaDivida,ETAPAS_CRM} from '../lib/calc/inteligencia.js';
import {moeda,rotuloMes} from '../lib/format.js';
import './inteligencia-comercial.css';
export function AceleradorVendas({lista,hoje,aoAbrir,aoEtapa}){
 const [limite,setLimite]=useState(6);
 const fila=useMemo(()=>filaComercial(lista,hoje),[lista,hoje]);
 const abertos=(lista||[]).filter(o=>o.situacao==='aberto');
 return <section className="intel-panel sem-impressao" aria-label="Acelerador de vendas">
 <header><div><span className="intel-kicker">PRÓXIMOS PASSOS</span><h2>Acelerador de vendas</h2><p>{fila.length} clientes com ação sugerida. Retornos combinados vêm primeiro; valor desempata a fila.</p></div><strong>{moeda(fila.reduce((s,g)=>s+g.valor,0))}<small>em propostas desta fila · não é previsão de receita</small></strong></header>
 <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Ver etapas e valores das propostas</summary><p className="text-xs text-slate-500 mt-3">Etapas locais das propostas sem vínculo. As oportunidades vinculadas seguem as fases na aba CRM Mubisys.</p><div className="intel-etapas">{ETAPAS_CRM.map(e=>{const itens=abertos.filter(o=>!o.crmCardId&&(o.etapaCrm||'proposta')===e.id);return <button key={e.id} onClick={()=>aoEtapa(e.id)}><span>{e.nome}</span><b>{itens.length}</b><small>{moeda(itens.reduce((s,o)=>s+o.valor,0))}</small></button>;})}</div></details>
 <div className="intel-fila">{fila.slice(0,limite).map((g,i)=><article key={g.chave}><span className="intel-posicao">{i+1}</span><div><h3>{g.cliente}</h3><p>{g.acao}</p><small>Responsável: {g.principal.vendedorNome || g.principal.vendedorId || "a definir"} · {g.principal.proximoToque?`Retorno: ${g.principal.proximoToque.split("-").reverse().join("/")}`:"Combinar data do retorno"}</small><small>{g.motivo} · {g.itens.length} {g.itens.length === 1 ? "proposta" : "propostas"} · {moeda(g.valor)}</small></div><button className="btn-outline" onClick={()=>aoAbrir(g)}>Preparar ação</button></article>)}</div>
 {fila.length>limite&&<button className="btn-outline mt-3" onClick={()=>setLimite(n=>n+6)}>Mais clientes ({fila.length-limite})</button>}
 {!fila.length&&<p className="intel-vazio">Nenhum próximo passo sugerido agora. Os retornos futuros continuam na Agenda.</p>}
 <p className="intel-nota">Sugestões por regras visíveis, baseadas nos registros do painel. Revise o histórico antes de contatar. Sem probabilidade de fechamento estimada.</p>
 </section>;
}
export function VisaoMensalCobranca({titulos,aoMes}){
 const {meses,semData}=useMemo(()=>mesesDaDivida(titulos),[titulos]);const maior=Math.max(1,...meses.map(m=>m.valor));
 /* UMA LINHA, NÃO UM PAINEL. Eram título, parágrafo e seis cartões de ~190px em
    duas fileiras: quase 500px antes do primeiro número da cobrança, e a lista de
    títulos, que é onde o trabalho acontece, ficava lá embaixo. Agora os meses são
    pastilhas baixas numa faixa que rola de lado; o seletor dá qualquer outro mês. */
 return <section className="divida-meses sem-impressao" aria-label="Meses em aberto">
  <div className="divida-meses-topo"><span>Meses em aberto</span><select className="input" aria-label="Consultar mês de vencimento" value="" onChange={e=>e.target.value&&aoMes(e.target.value)}><option value="">Outro mês</option>{meses.map(m=><option key={m.mes} value={m.mes}>{rotuloMes(m.mes)} · {moeda(m.valor)}</option>)}</select></div>
  <div className="divida-meses-faixa">{meses.slice(0,12).map(m=><button type="button" key={m.mes} onClick={()=>aoMes(m.mes)} title={`${rotuloMes(m.mes)}: ${m.quantidade} ${m.quantidade === 1 ? "título" : "títulos"}, ver na lista`}><span>{rotuloMes(m.mes)}</span><small>{m.quantidade}</small><strong>{moeda(m.valor)}</strong><i style={{width:`${m.valor/maior*100}%`}}/></button>)}</div>
  {semData>0&&<p className="divida-meses-nota">{semData} títulos sem mês de vencimento válido não entram nos meses.</p>}
 </section>;
}
