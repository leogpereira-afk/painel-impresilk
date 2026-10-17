import {useMemo,useState} from 'react';
import {ArrowUpRight,BookOpen,Check,FileCheck,RefreshCw,Search} from 'lucide-react';
import {Link} from 'react-router-dom';
import {ymdLocal} from '../../lib/format.js';
import ComercialDicas from '../ComercialDicas.jsx';
import {FichaProduto} from './ProdutosComerciais.jsx';
import Dialogo from './DialogoComercial.jsx';
import AcaoForm from './AcaoComercial.jsx';
import useApoioComercial from './useApoioComercial.js';
import '../../pages/comercial.css';
import './comercial-relacionamento.css';
import './resultados-comerciais.css';

const normal=v=>String(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pt-BR').trim();
export default function SolucoesComerciais(props){
 const chave=JSON.stringify([props.sessao?.usuario,props.sessao?.master,props.sessao?.permissoes,props.sessao?.vendedorId]);
 return <Solucoes key={chave} {...props}/>;
}
function Solucoes({busca:buscaControlada,setBusca:setBuscaControlada,buscaIntegrada=false}){
 const [buscaLocal,setBuscaLocal]=useState(''),busca=buscaControlada??buscaLocal,setBusca=setBuscaControlada||setBuscaLocal;
 const [categoria,setCategoria]=useState(''),[limite,setLimite]=useState(30),[revisao,setRevisao]=useState(0),[modal,setModal]=useState(null),[pilha,setPilha]=useState([]);
 const hoje=ymdLocal(new Date()),filtro={de:hoje.slice(0,7)+'-01',ate:hoje},apoio=useApoioComercial({},revisao),dados=apoio.dados;
 const categorias=useMemo(()=>[...new Set((dados?.catalogo.produtos||[]).map(p=>p.categoria||'Sem categoria'))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[dados]);
 const produtos=useMemo(()=>{
  const termos=normal(busca).split(/\s+/).filter(Boolean);
  return (dados?.catalogo.produtos||[]).filter(p=>{
   const ficha=dados.config.fichasProdutos?.[p.id]||{};
   const texto=normal([p.nome,p.categoria,p.descricao,p.unidade,...Object.values(ficha).filter(v=>typeof v==='string')].join(' '));
   return (!categoria||(p.categoria||'Sem categoria')===categoria)&&termos.every(t=>texto.includes(t));
  });
 },[dados,busca,categoria]);
 function abrirProduto(p){setPilha([]);setModal({tipo:'produto',p});}
 function fechar(){if(pilha.length){setModal(pilha.at(-1));setPilha(xs=>xs.slice(0,-1));}else setModal(null);}
 function atualizado(){setRevisao(n=>n+1);setModal(null);setPilha([]);}
 return <div className="comercial res-commercial sol-commercial">
  <section className="com-card"><div className="com-section-head"><div><h2><BookOpen size={19}/>Catálogo de soluções</h2><p className="com-muted">Produtos, materiais, aplicações e fichas técnicas para orientar o atendimento.</p></div><div className="com-header-actions"><button className="btn-outline" onClick={()=>setModal({tipo:'checklist'})}><Check size={16}/>Checklist para orçar</button><button className="btn-outline" aria-label="Atualizar soluções" disabled={apoio.carregando} onClick={()=>setRevisao(n=>n+1)}><RefreshCw size={16}/></button></div></div>
   <div className="sol-filters">{!buscaIntegrada&&<label className="com-search"><Search size={17}/><input type="search" aria-label="Buscar produto, material ou aplicação" value={busca} onChange={e=>{setBusca(e.target.value);setLimite(30);}} placeholder="Produto, material ou aplicação"/></label>}<label>Categoria<select value={categoria} onChange={e=>{setCategoria(e.target.value);setLimite(30);}}><option value="">Todas as categorias</option>{categorias.map(c=><option key={c}>{c}</option>)}</select></label></div>
   {apoio.carregando&&<p role="status">Consultando o catálogo autorizado…</p>}
   {apoio.erro&&<p role="alert" className="com-alert">{apoio.erro}</p>}
   {dados&&<><p className="res-count">{produtos.length} {produtos.length===1?'produto':'produtos'} no recorte · catálogo atualizado {dados.fontes.comercial_catalogo?.atualizadoEm?new Date(dados.fontes.comercial_catalogo.atualizadoEm).toLocaleString('pt-BR'):'sem data confirmada'}</p><div className="sol-list">{produtos.slice(0,limite).map(p=>{const f=dados.config.fichasProdutos?.[p.id]||{};return <details key={p.id} className="sol-product"><summary><span><strong>{p.nome}</strong><small>{p.categoria||'Sem categoria'} · {p.unidade||'Unidade a conferir'}</small></span><span className={`sol-badge ${f.validada?'is-valid':''}`}><FileCheck size={14}/>{f.validada?'Conferida':'A validar'}</span></summary><div className="sol-product-content"><p>{p.descricao||'Descrição do catálogo ainda não cadastrada.'}</p><p className="com-muted">{f.aplicacao||f.aplicacoes||f.uso||'Abra a ficha para conferir materiais, aplicações, limitações e soluções complementares.'}</p><button className="btn-primary" onClick={()=>abrirProduto(p)}>Abrir ficha completa <ArrowUpRight size={15}/></button></div></details>;})}</div>
    {!produtos.length&&<p className="com-empty">Nenhum produto encontrado neste recorte do catálogo.</p>}
    {produtos.length>limite&&<button className="btn-outline com-show-more" onClick={()=>setLimite(n=>n+30)}>Mostrar mais {Math.min(30,produtos.length-limite)} soluções</button>}
   </>}
  </section>
  <details className="com-card sol-guide"><summary>Dicas por linha de solução</summary><ComercialDicas key={busca} buscaInicial={busca} enxuto onAcao={guia=>setModal({tipo:'acao',a:{tipoAcao:'relacionamento',objetivo:`Apresentar soluções de ${guia.toLocaleLowerCase()}`}})}/></details>
  <section className="com-card sol-performance"><h2>Desempenho dos produtos</h2><p className="com-muted">Vendas, quantidades por unidade, categorias, participação e pedidos estão reunidos no Dashboard, com os mesmos critérios de empresa e período.</p><Link className="btn-outline" to={`/comercial/dashboard?${new URLSearchParams({analise:'produtos',...(categoria?{categoria}:{})})}`}>Analisar produtos e categorias <ArrowUpRight size={15}/></Link></section>
  {modal?.tipo==='produto'&&dados&&<FichaProduto key={modal.p.id} produto={modal.p} dados={dados} filtro={filtro} fechar={fechar} atualizado={atualizado} abrirProduto={p=>{setPilha(xs=>[...xs,modal]);setModal({tipo:'produto',p});}}/>}
  {modal?.tipo==='acao'&&dados&&<AcaoForm inicial={modal.a} dados={dados} filtro={filtro} salvo={atualizado} fechar={()=>setModal(null)}/>}
  {modal?.tipo==='checklist'&&<Dialogo titulo="O que confirmar antes de orçar" fechar={()=>setModal(null)}><Checklist/></Dialogo>}
 </div>;
}
function Checklist(){
 const [tipo,setTipo]=useState('visual'),comum=['Medidas e quantidade, com unidade','Material e acabamento','Uso interno ou externo','Arte: pronta ou criação','Local, transporte e prazo desejado'];
 const extras={visual:['Instalação e acesso ao local','Estrutura de fixação','Iluminação e ponto elétrico'],impresso:['Formato, faces e cores','Tiragem e prova de aprovação'],servico:['Escopo e condições do local','Equipe e janela de execução']};
 return <div className="com-form"><p className="com-muted">Roteiro para a conversa. As marcações são locais e não alteram orçamentos.</p><label>Tipo de solução<select value={tipo} onChange={e=>setTipo(e.target.value)}><option value="visual">Comunicação visual / instalação</option><option value="impresso">Material impresso</option><option value="servico">Serviço</option></select></label>{[...comum,...extras[tipo]].map(x=><label className="com-check-row" key={x}><input type="checkbox"/>{x}</label>)}</div>;
}
