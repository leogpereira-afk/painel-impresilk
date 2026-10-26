import {ArrowRight,ClipboardList,Search,RefreshCw} from 'lucide-react';
import {SITUACOES,SETORES,PRIORIDADES} from '../../../supabase/functions/_shared/processos.mjs';
import {selecionarProcessos,sinalProcesso} from '../../lib/calc/processos-lista.js';
import './demandas-central.css';

const FILAS=[['abertos','Em aberto'],['atrasados','Atrasadas'],['validacao','Para validar'],['concluida','Concluídas']];
const OUTRAS=[['todos','Todas as demandas'],['bloqueados','Com etapas bloqueadas'],...Object.entries(SITUACOES).filter(([k])=>!['validacao','concluida'].includes(k))];
const data=v=>v?v.split('-').reverse().join('/'):'Sem prazo';

export default function CentralDemandas({itens,base,visiveis,hoje,filtros,aoFiltro,aoLimpar,aoAbrir,aoAtualizar,carregando}){
 const responsaveis=[...new Map(itens.flatMap(x=>(x.envolvidos||[]).filter(p=>p.rhId===x.responsavelRhId).map(p=>[p.rhId,p]))).values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
 const ativos=[filtros.setor!=='todos'&&['setor',SETORES[filtros.setor],'todos'],filtros.responsavel!=='todos'&&['responsavel',responsaveis.find(p=>p.rhId===filtros.responsavel)?.nome||'Responsável selecionado','todos'],filtros.prioridade!=='todas'&&['prioridade','Prioridade '+PRIORIDADES[filtros.prioridade],'todas']].filter(Boolean);
 const nomeFila=[...FILAS,...OUTRAS].find(([k])=>k===filtros.fila)?.[1]||'Demandas';
 return <div className="demandas-central">
  <section className="demandas-controles" aria-label="Busca e filtros de demandas">
   <div className="demandas-busca-linha"><label className="demandas-busca"><Search size={18}/><input type="search" aria-label="Buscar demandas" placeholder="Buscar assunto ou pessoa…" value={filtros.busca} onChange={e=>aoFiltro('busca',e.target.value)}/></label><button type="button" className="btn-outline" disabled={carregando} onClick={aoAtualizar}><RefreshCw size={15}/>Atualizar</button></div>
   <details className="demandas-filtros"><summary>Filtros{ativos.length>0&&<span>{ativos.length} aplicado{ativos.length===1?'':'s'}</span>}</summary><div className="demandas-seletores">
    <label>Setor<select value={filtros.setor} onChange={e=>aoFiltro('setor',e.target.value)}><option value="todos">Todos os setores</option>{Object.entries(SETORES).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
    <label>Responsável<select value={filtros.responsavel} onChange={e=>aoFiltro('responsavel',e.target.value)}><option value="todos">Todos os responsáveis</option>{responsaveis.map(p=><option key={p.rhId} value={p.rhId}>{p.nome}</option>)}</select></label>
    <label>Prioridade<select value={filtros.prioridade} onChange={e=>aoFiltro('prioridade',e.target.value)}><option value="todas">Todas as prioridades</option>{Object.entries(PRIORIDADES).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
   </div></details>
   {ativos.length>0&&<div className="demandas-filtros-ativos" aria-label="Filtros aplicados">{ativos.map(([k,n,limpo])=><button key={k} type="button" onClick={e=>{e?.currentTarget.closest('section')?.querySelector('summary')?.focus();aoFiltro(k,limpo);}} aria-label={'Remover filtro: '+n}>{n}<span aria-hidden="true">×</span></button>)}</div>}
  </section>
  <nav className="demandas-filas" aria-label="Filtrar demandas por situação">{FILAS.map(([k,n])=><button type="button" key={k} aria-pressed={filtros.fila===k} onClick={()=>aoFiltro('fila',k)}><span>{n}</span><strong>{selecionarProcessos(base,k,hoje).length}</strong></button>)}</nav>
  <div className="demandas-lista-topo"><p role="status"><strong>{visiveis.length}</strong> demanda{visiveis.length===1?'':'s'} · {nomeFila} · contagens respeitam os filtros</p><label><span className="sr-only">Mais situações</span><select aria-label="Mais situações" value={OUTRAS.some(([k])=>k===filtros.fila)?filtros.fila:''} onChange={e=>e.target.value&&aoFiltro('fila',e.target.value)}><option value="">Mais situações</option>{OUTRAS.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>{(ativos.length>0||filtros.busca||filtros.fila!=='abertos')&&<button type="button" className="btn-ghost" onClick={aoLimpar}>Limpar filtros</button>}</div>
  {!carregando&&!visiveis.length&&<div className="demandas-vazio"><ClipboardList size={28}/><h2>{!itens.length?'Organize sua primeira demanda':'Nenhuma demanda nesta seleção'}</h2><p>{!itens.length?'Use Nova demanda para definir o objetivo, o responsável e o prazo.':'Ajuste a busca e os filtros para encontrar outra demanda.'}</p>{itens.length>0&&<button type="button" className="btn-outline" onClick={aoLimpar}>Ver demandas em aberto</button>}</div>}
  <div className="demandas-catalogo">{visiveis.map(item=>{
   const r=sinalProcesso(item,hoje),responsavel=item.envolvidos.find(p=>p.rhId===item.responsavelRhId)?.nome||'Responsável não informado';
   return <article className={'demanda-cartao'+(r.atrasado?' demanda-atrasada':'')} key={item.id}>
    <div className="demanda-cartao-tags"><span>{SETORES[item.setor]}</span><span className={'demanda-estado estado-'+item.situacao}>{SITUACOES[item.situacao]}</span>{['alta','urgente'].includes(item.prioridade)&&<span className={'demanda-prioridade prioridade-'+item.prioridade}>{PRIORIDADES[item.prioridade]}</span>}</div>
    <h2>{item.titulo}</h2>
    <dl><div><dt>Responsável</dt><dd>{responsavel}</dd></div><div><dt>{r.encerrado?'Prazo da demanda':'Próximo prazo'}</dt><dd>{data(r.encerrado?item.prazo:r.proximoPrazo)}{r.atrasado&&<small>Prazo vencido</small>}</dd></div></dl>
    {item.etapas.length>0&&<div className="demanda-progresso"><span>{r.concluidas}/{item.etapas.length} etapas concluídas</span>{r.validar.length>0&&<b>{r.validar.length} para validar</b>}{r.bloqueadas.length>0&&<b>{r.bloqueadas.length} bloqueada{r.bloqueadas.length===1?'':'s'}</b>}</div>}
    <button type="button" className="btn-outline demanda-abrir" aria-label={'Abrir demanda: '+item.titulo} onClick={()=>aoAbrir(item.id)}>Abrir demanda<ArrowRight size={16}/></button>
   </article>;
  })}</div>
 </div>;
}
