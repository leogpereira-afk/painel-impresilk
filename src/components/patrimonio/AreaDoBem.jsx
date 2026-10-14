import {useState} from 'react';
import {AREAS_BEM, bensDaArea} from '../../lib/calc/area-bem.js';
import {SITUACOES} from '../../lib/calc/patrimonio.js';

export function CampoAreaBem({valor, aoMudar, disabled=false, id='b-area'}) {
  return <div><label className="label" htmlFor={id}>Área do patrimônio</label>
    <select id={id} className="input" value={valor || ''} disabled={disabled} onChange={e=>aoMudar(e.target.value)}>
      <option value="">Somente no inventário</option>
      {Object.entries(AREAS_BEM).map(([v,n])=><option key={v} value={v}>{n}</option>)}
    </select>
    <p className="pat-footnote">Mostra o mesmo bem na área escolhida, sem criar outra ficha. O setor de trabalho permanece igual. Se já houver ficha técnica ligada, ela continua sendo a entrada na sua própria aba.</p>
  </div>;
}

export default function AreaDoBem({bem, salvando, aoSalvar}) {
  const [area,setArea]=useState(bem.areaPatrimonio || '');
  return <section className="pat-vinculo" aria-label="Área do patrimônio">
    <h3>Onde este bem aparece</h3>
    <CampoAreaBem id="detalhe-area-bem" valor={area} aoMudar={setArea} disabled={salvando}/>
    <button className="btn-primary" disabled={salvando || area===(bem.areaPatrimonio || '')} onClick={()=>aoSalvar(bem,area)}>{salvando?'Salvando…':'Salvar área'}</button>
    {bem.situacao==='baixado'&&<p className="pat-footnote">Bem baixado: continua no inventário e no histórico, fora das listas de bens ativos.</p>}
  </section>;
}

export function BensDaArea({area,bens,setores,vinculos,erro,aoTentar,aoVerBem}) {
  const [busca,setBusca]=useState(''),[pagina,setPagina]=useState(1);
  const lista=bensDaArea(bens,area,vinculos,busca,setores);
  const total=bensDaArea(bens,area,vinculos).length;
  const paginas=Math.max(1,Math.ceil(lista.length/10)),atual=Math.min(pagina,paginas);
  return <section className="pat-area-bens" aria-label={`Bens do inventário em ${AREAS_BEM[area]}`}>
    <div className="pat-list-heading"><div><h2>Bens do inventário{vinculos?` · ${total}`:''}</h2><p>Na ficha do bem, escolha “Área do patrimônio”. Não é necessário cadastrar uma ficha técnica.</p></div></div>
    {erro?<div className="pat-notice is-error" role="alert">Não foi possível conferir os vínculos dos bens. <button className="btn-ghost" onClick={aoTentar}>Tentar novamente</button></div>:!vinculos?<p role="status">Conferindo os bens desta área…</p>:<>
      {!!total&&<input className="input" aria-label="Buscar bens desta área" placeholder="Buscar bem, etiqueta ou setor…" value={busca} onChange={e=>{setBusca(e.target.value);setPagina(1);}}/>}
      {!lista.length?<p className="pat-footnote">{busca?'Nenhum bem corresponde à busca.':'Nenhum bem sem ficha técnica classificado nesta área.'}</p>:<ul className="pat-area-lista">{lista.slice((atual-1)*10,atual*10).map(b=><li key={b.id}><div><strong>{b.nomeGenerico}</strong><span>{b.codigo || 'Sem etiqueta'} · {setores.find(s=>s.sigla===b.setorSigla)?.nome || b.setorSigla || 'Setor a definir'}</span><small>{SITUACOES[b.situacao]?.rotulo || 'Em uso'}</small></div><button className="btn-outline" onClick={()=>aoVerBem(b)}>Ver bem</button></li>)}</ul>}
      {paginas>1&&<div className="pat-pagination"><span>{atual} / {paginas}</span><button className="btn-ghost" disabled={atual===1} onClick={()=>setPagina(atual-1)}>Anterior</button><button className="btn-ghost" disabled={atual===paginas} onClick={()=>setPagina(atual+1)}>Próxima</button></div>}
    </>}
  </section>;
}
