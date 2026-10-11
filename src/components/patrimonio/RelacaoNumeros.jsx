import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {RefreshCw,Search} from 'lucide-react';
import {lerControles} from '../../services/patrimonio.js';
import {montarRelacaoNumeros} from '../../lib/calc/telefonia-patrimonio.js';
import {usePessoasRH} from './PessoasRH.jsx';
import './telefonia.css';

const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const nomeTipo=linha=>linha.tipo==='celulares'?'Celular':'Ramal';
const rotuloStatus={ativo:'Em uso',disponivel:'Disponível',inativo:'Inativo'};
function Linhas({itens,destino}) {return <ul className="tel-lines">{itens.map(l=><li key={l.id}><span className={`tel-type ${l.tipo==='celulares'?'is-mobile':'is-extension'}`}>{nomeTipo(l)}</span><strong>{l.numero}</strong><span>{l.nomeSetor}</span>{l.pessoa&&!l.pessoaId&&<span className="tel-muted">Nome antigo: {l.pessoa}</span>}<span className="tel-muted">{rotuloStatus[l.status]||'Situação pendente'}</span><Link to={destino(l.tipo)} aria-label={`Abrir ${nomeTipo(l).toLowerCase()} ${l.numero}`}>Abrir ficha</Link></li>)}</ul>;}

export default function RelacaoNumeros({setores=[]}) {
 const {pessoas,carregando:carregandoRH,erro:erroRH}=usePessoasRH();
 const local=useLocation();
 const [controles,setControles]=useState(null),[busca,setBusca]=useState(''),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false);
 const carregar=useCallback(async()=>{setCarregando(true);setErro('');try{setControles(await lerControles());}catch(e){setErro(e.message);}finally{setCarregando(false);}},[]);
 useEffect(()=>{carregar();},[carregar]);
 const resumo=useMemo(()=>montarRelacaoNumeros(controles||{},pessoas,setores),[controles,pessoas,setores]);
 const url=tipo=>{const q=new URLSearchParams(local.search);q.set('telefonia',tipo);return `${local.pathname}?${q}`;};
 const corresponde=linha=>normal([linha.numero,linha.nomePessoa,linha.nomeSetor,linha.local,nomeTipo(linha),rotuloStatus[linha.status]||linha.status].join(' ')).includes(normal(busca));
 const gruposPessoas=resumo.pessoas.map(grupo=>({...grupo,linhas:grupo.linhas.filter(corresponde)})).filter(g=>g.linhas.length);
 const gruposDisponiveis=resumo.disponiveis.map(grupo=>({...grupo,linhas:grupo.linhas.filter(corresponde)})).filter(g=>g.linhas.length);
 const pendentes=resumo.pendentes.filter(corresponde);
 return <section className="tel-section" aria-label="Relação de números">
  <header className="info-head"><div><h2>Relação de números</h2><p>Celulares e ramais por colaborador do RH. Números disponíveis aparecem por setor.</p></div><button className="btn-ghost" aria-label="Atualizar relação de números" onClick={carregar} disabled={carregando}><RefreshCw size={16}/></button></header>
  {erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}{erroRH&&<p role="alert" className="pat-notice is-error">Pessoas do RH indisponíveis: {erroRH}</p>}
  <div className="tel-toolbar"><label className="pat-search"><Search size={16}/><input className="input" aria-label="Buscar números" placeholder="Pessoa, número ou setor" value={busca} onChange={e=>setBusca(e.target.value)}/></label><span>{resumo.total} {resumo.total===1?'número':'números'}</span></div>
  {controles===null?<p role="status">{carregando?'Carregando números…':'Números indisponíveis. Atualize para tentar novamente.'}</p>:<>
   {carregandoRH&&<p role="status">Consultando pessoas do RH…</p>}
   <div className="tel-groups">{gruposPessoas.map(g=><article className="tel-group" key={g.id}><header><h3>{g.nome}</h3><span>{g.linhas.length} {g.linhas.length===1?'número':'números'}</span></header><Linhas itens={g.linhas} destino={url}/></article>)}</div>
   {gruposDisponiveis.length>0&&<section className="tel-subsection"><h3>Disponíveis</h3><div className="tel-groups">{gruposDisponiveis.map(g=><article className="tel-group" key={g.id}><header><h4>{g.nome}</h4><span>{g.linhas.length} {g.linhas.length===1?'número':'números'}</span></header><Linhas itens={g.linhas} destino={url}/></article>)}</div></section>}
   {pendentes.length>0&&<section className="tel-subsection"><h3>Vínculo com RH pendente</h3><p className="tel-muted">O nome antigo permanece para conferência; confirme o colaborador pelo cadastro do RH.</p><div className="tel-groups"><article className="tel-group"><Linhas itens={pendentes} destino={url}/></article></div></section>}
   {!gruposPessoas.length&&!gruposDisponiveis.length&&!pendentes.length&&<p className="pat-empty">Nenhum número neste filtro.</p>}
  </>}
 </section>;
}
