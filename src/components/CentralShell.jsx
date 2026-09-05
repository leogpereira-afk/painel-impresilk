import {useEffect,useRef,useState} from 'react';
import {Link,NavLink,useLocation} from 'react-router-dom';
import {LayoutDashboard,ShieldCheck,Menu,X,LogOut,ChevronRight} from 'lucide-react';
import {MODULOS} from '../lib/modulos.js';
import logo from '../assets/brand/logo-color.png';
import logoWhite from '../assets/brand/logo-white.png';
import './central-shell.css';

export default function CentralShell({children,sessao,aoSair,controles}) {
  const review = import.meta.env.MODE === 'review';
  const location = useLocation();
  const [menu,setMenu] = useState(false);
  const abrirRef = useRef(null);
  const naCentral = ['/acessos','/minha-conta','/backups'].includes(location.pathname);
  const modulos = [...MODULOS,{id:'documentos',nome:'Documentos e ativos'}];
  const titulo = naCentral ? 'Sistemas' : modulos.find(m=>`/${m.id}`===location.pathname)?.nome || 'Início';
  useEffect(()=>setMenu(false),[location.pathname,location.search]);
  useEffect(()=>{
    if(!menu)return;
    const fechar = e=>{if(e.key==='Escape'){setMenu(false);abrirRef.current?.focus();}};
    document.addEventListener('keydown',fechar);
    return ()=>document.removeEventListener('keydown',fechar);
  },[menu]);
  return <div className="review-shell">
    <a className="painel-skip" href="#conteudo-painel" onClick={e=>{e.preventDefault();document.getElementById("conteudo-painel")?.focus();}}>Ir para o conteúdo</a>
    {menu&&<button aria-label="Fechar menu" className="review-scrim sem-impressao" onClick={()=>setMenu(false)}/>}
    <aside id="menu-painel" className={`review-sidebar sem-impressao ${menu?'open':''}`}>
      <Link to="/" className="review-brand"><img src={logo} alt="Impresilk" className="dark:hidden"/><img src={logoWhite} alt="Impresilk" className="hidden dark:block"/><span>PAINEL DE GESTÃO</span></Link>
      <nav aria-label="Navegação principal">
        <NavLink end to="/" className={({isActive})=>isActive?'selected':''}><LayoutDashboard size={20}/>Início</NavLink>
        <Link className={naCentral?'selected':''} to="/acessos" aria-current={naCentral?'page':undefined}><ShieldCheck size={20}/>Sistemas</Link>
      </nav>
      <div className="review-sidebar-scroll">
        <details open><summary>MÓDULOS DO PAINEL <ChevronRight size={15}/></summary>
          <nav aria-label="Módulos do painel">{modulos.map(m=><NavLink key={m.id} to={`/${m.id}`} className={({isActive})=>isActive?'selected':''}>{m.nome}</NavLink>)}</nav>
        </details>
      </div>
      <Link to="/minha-conta" className="review-user"><span className="review-avatar">{(sessao?.nome || 'DE').slice(0,2).toUpperCase()}</span><div>{sessao?.nome || 'Conta de demonstração'}<small>Direção</small></div></Link>
      {review ? <Link className="review-logout" to="/entrada"><LogOut size={17}/>Ver tela de entrada</Link> : <button className="review-logout" onClick={aoSair}><LogOut size={17}/>Sair do Painel</button>}
    </aside>
    <div className="review-main">
      <header className="review-top sem-impressao"><div><button ref={abrirRef} className="review-menu-toggle" aria-expanded={menu} aria-controls="menu-painel" aria-label={menu?'Fechar navegação':'Abrir navegação'} onClick={()=>setMenu(!menu)}>{menu?<X size={22}/>:<Menu size={22}/>}</button><Link to="/">Painel de Gestão</Link><ChevronRight size={12}/><span>{titulo}</span></div><div className="review-controls">{review && <b>Prévia local · dados fictícios</b>}{controles}</div></header>
      <main id="conteudo-painel" tabIndex={-1} className="review-content">
        {children}
        {review && <footer className="review-footer sem-impressao">Prévia com dados fictícios. Alterações não são enviadas aos sistemas.</footer>}
      </main>
    </div>
  </div>;
}
