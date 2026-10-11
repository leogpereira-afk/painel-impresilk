import {Target} from 'lucide-react';
const brl=c=>c==null?'Não disponível':(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function MetaComercial({r,dados,abrirVendas,detalhada=false,cadastrar,configurar}){
 const m=r.meta,base=dados.base.meta||{},participantes=m.participantes||base.participantes||[],faltantes=m.faltantes||base.faltantes||[],excluidos=m.excluidos||base.excluidos||[];
 return <div className="com-meta-content"><h3>{m.mensagem}</h3>
 <div className="com-meta-numbers"><button className="com-number-action" onClick={()=>abrirVendas?.(m.vendas||r.vendas.filter(v=>(m.idsVendas||[]).includes(v.id)))}><span>Vendas consideradas para a meta</span><strong>{brl(m.realizado??r.valor)}</strong><small>Consultar os pedidos deste cálculo</small></button><div><span>Meta cadastrada</span><strong>{brl(m.valor)}</strong><small>{participantes.length} participante(s) · {faltantes.length} sem meta</small></div></div>
 {m.percentual!=null?<><progress max="100" value={Math.min(100,m.percentual)} aria-label="Percentual da meta atingido"/><p><b>{m.percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})}% atingido</b> · faltam {brl(m.falta)}</p></>:<p className="com-muted">{m.cobertura?.completa===false?'Cobertura incompleta: o atingimento consolidado fica indisponível.':m.estado==='zero'?'Meta de zero: não há percentual ou ritmo a calcular.':'O percentual depende de meta e vendas verificáveis.'}</p>}
 <p className="com-muted">{m.diasUteis!=null?`${m.diasUteis} dias úteis restantes${m.porDia!=null?` · ${brl(m.porDia)} por dia para alcançar a meta`:''}`:dados.config.calendario?.configurado?'Ritmo diário indisponível até completar e conferir a meta deste recorte.':'Dias úteis dependem do calendário de trabalho conferido pela direção.'}</p>
 <small className="com-source-note">Origem da meta: {base.origem==='painel'||m.origem==='painel'?'cadastro mensal da direção no Painel':'consultar estado da fonte'}. Realizado: líquido de O.S. normais, por cadastro; faturamento e recebimento têm apuração própria.</small>
 {(faltantes.length>0||detalhada)&&<details open={detalhada||undefined} className="com-form-details"><summary>Participantes e cobertura da meta</summary>
 {faltantes.length>0&&<div className="com-coverage"><div><b>{faltantes.length} meta(s) faltante(s)</b>{faltantes.map(v=><p key={v.id}>{v.nome} · {v.motivo||'Não cadastrada'} {cadastrar&&<button className="com-link" onClick={()=>cadastrar(v.id)}>Cadastrar meta</button>}</p>)}</div></div>}
 {participantes.map(v=><div className="com-meta-person" key={v.id}><span>{v.nome}</span><b>{brl(v.metaValor==null?null:Math.round(v.metaValor*100))}</b><small>{v.metaId?'Meta cadastrada no Painel':v.motivo||'Meta não cadastrada'}</small></div>)}
 {excluidos.length>0&&<details><summary>{excluidos.length} pessoa(s) fora do cálculo</summary>{excluidos.map(v=><p key={v.id}>{v.nome} · {v.motivo}</p>)}</details>}
 {(m.idsAConferir||[]).length>0&&<p className="com-alert">Há vínculos de vendedores a conferir. O percentual não representa a equipe completa.</p>}
 {!participantes.length&&!faltantes.length&&<p className="com-muted">Participação ainda não apurada para este recorte.</p>}
 </details>}
 {(m.vendasExcluidas||[]).length>0&&<button className="com-link" onClick={()=>abrirVendas(m.vendasExcluidas)}>{m.vendasExcluidas.length} pedido(s) fora da participação da meta · consultar</button>}
 {(m.idsVendasAConferir||[]).length>0&&<p className="com-alert">{m.idsVendasAConferir.length} pedido(s) com vínculo de vendedora a conferir; não formam um realizado completo.</p>}
 {configurar&&<button className="com-link" onClick={configurar}><Target size={14}/>Conferir participação e calendário</button>}
 </div>;
}
