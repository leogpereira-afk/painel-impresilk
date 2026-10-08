import {useState} from 'react';
import {Plus,Search,Target,HeartHandshake,RotateCcw,ArrowUpRight,CalendarDays} from 'lucide-react';
import {TIPOS_ACAO,FASES_ACAO,resumirRelacionamento,situacaoRelacionamento} from '../../../supabase/functions/_shared/relacionamento-comercial.mjs';
const data=d=>d?d.slice(0,10).split('-').reverse().join('/'):'Sem data';
export default function RelacionamentoComercial({dados,abrirAcao}){
 const [busca,setBusca]=useState(''),[tipo,setTipo]=useState(''),[situacao,setSituacao]=useState('abertas'),[limite,setLimite]=useState(12);
 const hoje=dados.relatorio.hoje,resumo=resumirRelacionamento(dados.base.acoes,{busca,tipo,situacao},hoje);
 const tipos=[['prospeccao','Conquistar cliente',Target],['pos_venda','Acompanhar uma venda',HeartHandshake],['relacionamento','Planejar estratégia',ArrowUpRight],['reativacao','Reativar cliente',RotateCcw]];
 const rotulos={hoje:'Hoje',atrasadas:'Atrasada',programadas:'Programada',concluidas:'Concluída'};
 return <section className="com-relationship" aria-label="Prospecção e pós-venda">
  <div className="com-section-head"><div><p className="com-eyebrow">CONQUISTAR · CUIDAR · DESENVOLVER</p><h2>Prospecção e pós-venda</h2><p className="com-muted">Uma ação para cada cliente, venda ou oportunidade. O mês filtra vendas; as ações permanecem aqui até a conclusão.</p></div><button className="btn-primary" onClick={()=>abrirAcao({tipoAcao:'prospeccao'})}><Plus size={17}/>Nova ação</button></div>
  <div className="com-intentions">{tipos.map(([id,nome,Icone])=><button key={id} className={`com-intention ${id}`} onClick={()=>abrirAcao({tipoAcao:id})}><Icone size={19}/><span>{nome}</span><Plus size={15}/></button>)}</div>
  <div className="com-relationship-tools"><label className="com-relationship-search"><Search size={17}/><input type="search" aria-label="Buscar ações por cliente, CNPJ ou estratégia" placeholder="Cliente, CNPJ ou estratégia" value={busca} onChange={e=>{setBusca(e.target.value);setLimite(12);}}/></label><label>Tipo<select value={tipo} onChange={e=>{setTipo(e.target.value);setLimite(12);}}><option value="">Todos os tipos</option>{tipos.map(([id])=><option key={id} value={id}>{TIPOS_ACAO[id]}</option>)}</select></label></div>
  <div className="com-priority-filters" role="group" aria-label="Situação das ações">{[['abertas','Abertas',resumo.abertas],['hoje','Hoje',resumo.hoje],['atrasadas','Atrasadas',resumo.atrasadas],['concluidas','Concluídas',resumo.concluidas],['todas','Todas',resumo.abertas+resumo.concluidas]].map(([id,n,q])=><button key={id} aria-pressed={situacao===id} onClick={()=>{setSituacao(id);setLimite(12);}}>{n}<span>{q}</span></button>)}</div>
  <div className="com-relationship-grid">{resumo.itens.slice(0,limite).map(a=>{const estado=situacaoRelacionamento(a,hoje);return <article className={`com-action-card is-${estado}`} key={a.id}>
   <header><span className="com-action-kind">{TIPOS_ACAO[a.tipoAcao]}</span><span className={`com-status ${estado==='atrasadas'?'danger':estado==='concluidas'?'done':estado==='hoje'?'today':''}`}>{rotulos[estado]}</span></header>
   <h3>{a.cliente}</h3><p className="com-action-objective">{a.objetivo}</p><p className="com-action-next">{a.descricao}</p>
   <div className="com-action-context">{a.ordemNumero&&<span>O.S. #{a.ordemNumero}</span>}{a.prospecto&&<span>Prospecto local</span>}{a.prioridade==='alta'&&<span className="com-status attention">Prioridade alta</span>}{a.status!=='concluida'&&<span>{FASES_ACAO[a.fase]||'Planejada'}</span>}</div>
   <footer><div><span><CalendarDays size={13}/>{data(a.data)}</span><small>{dados.catalogo.vendedores.find(v=>String(v.id)===String(a.vendedorId))?.nome||'Responsável a conferir'}</small></div><button className="com-link" onClick={()=>abrirAcao(a)} aria-label={`Abrir ação ${a.descricao}`}>{a.status==='concluida'?'Ver / reabrir':'Acompanhar'}<ArrowUpRight size={15}/></button></footer>
  </article>;})}</div>
  {!resumo.itens.length&&<div className="com-empty"><Target size={25}/><strong>Nenhuma ação neste filtro.</strong><p>Busque um cliente por CNPJ ou nome para planejar uma abordagem, acompanhar uma venda ou desenvolver a relação.</p><button className="btn-primary" onClick={()=>abrirAcao({tipoAcao:tipo||'prospeccao'})}>Criar ação para um cliente</button></div>}
  {resumo.itens.length>limite&&<button className="btn-outline com-show-more" onClick={()=>setLimite(n=>n+12)}>Mostrar mais ações</button>}
 </section>;
}
