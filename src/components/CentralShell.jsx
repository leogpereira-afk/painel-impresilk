import {useEffect,useRef,useState} from 'react';
import {Link,NavLink,useLocation} from 'react-router-dom';
import {Menu,X,LogOut,ChevronRight,ArrowUpRight} from 'lucide-react';
import {podeAbrir,ehDirecao} from '../lib/sessao.js';
import {SISTEMAS} from '../lib/sistemas.js';
import {MODULOS} from '../lib/modulos.js';
import logo from '../assets/brand/logo-color.png';
import logoWhite from '../assets/brand/logo-white.png';
import './central-shell.css';

const EMOJIS_MODULOS = {compromissos:'📅','contas-atrasadas':'💰',orcamentos:'📋',bancos:'🏦',marketing:'📣',licitacoes:'⚖️',glossario:'📖',manutencoes:'🛠️',patrimonio:'🏠',permutas:'🤝',campanhas:'🎯',documentos:'📁'};
const EMOJIS_SISTEMAS = {rh:'👥',pcp:'🏭',brief:'📏',dre:'📊',compras:'🛒',pops:'📚',domo:'🏗️',bosques:'🌳',central:'👤',diamond:'💎'};

export default function CentralShell({children,sessao,aoSair,controles}) {
  const review = import.meta.env.MODE === 'review';
  const location = useLocation();
  const [menu,setMenu] = useState(false);
  const abrirRef = useRef(null);
  const lateralRef = useRef(null);
  const conteudoRef = useRef(null);
  const naCentral = ['/acessos','/minha-conta','/backups','/configuracoes'].includes(location.pathname);
  const modulos = [...MODULOS.filter(m=>m.id!=='configuracoes' && podeAbrir(m.id,sessao)),{id:'documentos',nome:'Documentos e ativos'}];
  const gruposAcesso = [
    {nome:'IMPRESILK', links:SISTEMAS.filter(s=>s.id!=='painel' && !s.pessoal && s.url)},
    {nome:'LÉO E PORTAL DOS BOSQUES', links:SISTEMAS.filter(s=>['central','bosques'].includes(s.id))},
    {nome:'DOMO', links:[...SISTEMAS.filter(s=>s.id==='domo'),{id:'diamond',nome:'Diamond Vendas',url:'https://leogpereira-afk.github.io/diamond/'}]},
  ].filter((g,i)=>i===0 || ehDirecao(sessao) || review);
  const titulo = naCentral ? 'Sistemas e configurações' : modulos.find(m=>`/${m.id}`===location.pathname)?.nome || 'Início';
  useEffect(()=>setMenu(false),[location.pathname,location.search]);
  useEffect(()=>{
    if(!menu)return;
    const painel = lateralRef.current;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const conteudo = conteudoRef.current;
    conteudo.inert = true;
    const alvos = () => [...painel.querySelectorAll('a[href],button,summary')].filter(el=>el.getClientRects().length);
    alvos()[0]?.focus();
    const teclado = e => {
      if(e.key==='Escape'){e.preventDefault();setMenu(false);}
      if(e.key==='Tab'){
        const itens=alvos(), primeiro=itens[0], ultimo=itens.at(-1);
        if(e.shiftKey && document.activeElement===primeiro){e.preventDefault();ultimo?.focus();}
        else if(!e.shiftKey && document.activeElement===ultimo){e.preventDefault();primeiro?.focus();}
      }
    };
    document.addEventListener('keydown',teclado);
    return ()=>{document.removeEventListener('keydown',teclado);document.body.style.overflow=overflow;conteudo.inert=false;anterior?.focus();};
  },[menu]);
  return <div className="review-shell">
    <a className="painel-skip" href="#conteudo-painel" onClick={e=>{e.preventDefault();document.getElementById("conteudo-painel")?.focus();}}>Ir para o conteúdo</a>
    {menu&&<button aria-label="Fechar menu" className="review-scrim sem-impressao" onClick={()=>setMenu(false)}/>}
    <aside ref={lateralRef} id="menu-painel" className={`review-sidebar sem-impressao ${menu?'open':''}`}>
      {menu && <button className="btn-ghost" onClick={()=>setMenu(false)} aria-label="Fechar navegação"><X size={22}/></button>}
      <Link to="/" className="review-brand"><img src={logo} alt="Impresilk" className="dark:hidden"/><img src={logoWhite} alt="Impresilk" className="hidden dark:block"/><span>PAINEL DE GESTÃO</span></Link>
      <nav aria-label="Navegação principal">
        <NavLink end to="/" className={({isActive})=>isActive?'selected':''}><span className="review-link-emoji" aria-hidden="true">🏠</span>Início</NavLink>
        <Link className={naCentral?'selected':''} to="/acessos" aria-current={naCentral?'page':undefined}><span className="review-link-emoji" aria-hidden="true">⚙️</span>Sistemas e configurações</Link>
      </nav>
      <div className="review-sidebar-scroll">
        <details key={`modulos-${location.pathname}`} open><summary>MÓDULOS DO PAINEL <ChevronRight size={15}/></summary>
          <nav aria-label="Módulos do painel">{modulos.map(m=>{return <NavLink key={m.id} to={`/${m.id}`} className={({isActive})=>isActive?'selected':''}><span className="review-link-emoji" aria-hidden="true">{EMOJIS_MODULOS[m.id]||"📁"}</span><span>{m.nome}</span></NavLink>;})}</nav>
        </details>
        {gruposAcesso.map(g=><details key={`${g.nome}-${location.pathname}`} open><summary>{g.nome}<ChevronRight size={15}/></summary><nav aria-label={`Acessos ${g.nome}`}>{g.links.map(s=>{return <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"><span className="review-link-emoji" aria-hidden="true">{EMOJIS_SISTEMAS[s.id]||"💻"}</span><span>{s.nomeCompleto || s.nome}</span><ArrowUpRight size={15} aria-hidden="true"/></a>;})}</nav></details>)}
      </div>
      <Link to="/minha-conta" className="review-user"><span className="review-avatar">{(sessao?.nome || 'DE').slice(0,2).toUpperCase()}</span><div>{sessao?.nome || 'Conta de demonstração'}<small>{ehDirecao(sessao)?'Direção':'Acesso da equipe'}</small></div></Link>
      {review ? <Link className="review-logout" to="/entrada"><LogOut size={17}/>Ver tela de entrada</Link> : <button className="review-logout" onClick={aoSair}><LogOut size={17}/>Sair do Painel</button>}
    </aside>
    <div ref={conteudoRef} className="review-main">
      <header className="review-top sem-impressao"><div><button ref={abrirRef} className="review-menu-toggle" aria-expanded={menu} aria-controls="menu-painel" aria-label={menu?'Fechar navegação':'Abrir navegação'} onClick={()=>setMenu(!menu)}>{menu?<X size={22}/>:<Menu size={22}/>}</button><Link to="/">Painel de Gestão</Link><ChevronRight size={12}/><span>{titulo}</span></div><div className="review-controls">{review && <b>Prévia local · dados fictícios</b>}{controles}</div></header>
      <main id="conteudo-painel" tabIndex={-1} className="review-content">
        {children}
        {review && <footer className="review-footer sem-impressao">Prévia com dados fictícios. Alterações não são enviadas aos sistemas.</footer>}
      </main>
    </div>
  </div>;
}
