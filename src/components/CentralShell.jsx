import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {LayoutDashboard,ShieldCheck,ArrowUpRight,Menu,X,LogOut,ChevronRight} from 'lucide-react';
import {MODULOS} from '../lib/modulos.js';
import logo from '../assets/brand/logo-color.png';
import './central-shell.css';
export default function CentralShell({children,sessao,aoSair}) {
  const review = import.meta.env.MODE === "review";
  const location=useLocation();const [menu,setMenu]=useState(false);
  useEffect(()=>setMenu(false),[location.pathname,location.search]);
  return <div className="review-shell">
    {menu&&<button aria-label="Fechar menu" className="review-scrim" onClick={()=>setMenu(false)}/>}
    <aside className={`review-sidebar ${menu?'open':''}`}>
      <Link to="/acessos" className="review-brand"><img src={logo} alt="Impresilk"/><span>PAINEL DE GESTÃO</span></Link>
      <nav aria-label="Navegação principal">{review ? <a href="https://leogpereira-afk.github.io/painel-impresilk/" target="_blank" rel="noreferrer"><LayoutDashboard size={18}/>Início <ArrowUpRight size={13}/></a> : <Link to="/"><LayoutDashboard size={18}/>Início</Link>}<Link className="selected" to="/acessos"><ShieldCheck size={18}/>Sistemas</Link></nav>
      <div className="review-sidebar-scroll">
      <details open><summary>MÓDULOS DO PAINEL <ChevronRight size={13}/></summary>{review && <p className="review-menu-note">Abrem a versão atual em outra aba.</p>}<nav aria-label="Módulos existentes">{[...MODULOS.filter(m=>m.id!=='configuracoes'),{id:'documentos',nome:'Documentos e ativos'}].map(m=><a key={m.id} href={review ? `https://leogpereira-afk.github.io/painel-impresilk/${m.id}` : `${import.meta.env.BASE_URL}${m.id}`} target={review ? '_blank' : undefined} rel={review ? 'noreferrer' : undefined}>{m.nome}<ArrowUpRight size={13}/></a>)}</nav></details>
      </div>
      <div className="review-user"><span className="review-avatar">{(sessao?.nome || "DE").slice(0,2).toUpperCase()}</span><div>{sessao?.nome || "Conta de demonstração"}<small>Direção</small></div></div>
      {review ? <Link className="review-logout" to="/entrada"><LogOut size={15}/>Ver tela de entrada</Link> : <button className="review-logout" onClick={aoSair}><LogOut size={15}/>Sair do Painel</button>}
    </aside>
    <main><header className="review-top"><div><button className="review-menu-toggle" aria-label={menu?'Fechar navegação':'Abrir navegação'} onClick={()=>setMenu(!menu)}>{menu?<X size={20}/>:<Menu size={20}/>}</button><Link to="/acessos">Painel de Gestão</Link><ChevronRight size={12}/><span>Central de acessos</span></div>{review && <b>Prévia local · dados fictícios</b>}</header><div className="review-content">
      {children}
      {review && <footer className="review-footer"><span>Revisão local do Painel Impresilk. Nenhuma alteração é enviada aos sistemas.</span><Link to="/entrada">Conferir entrada <ArrowUpRight size={13}/></Link></footer>}
    </div></main>
  </div>;
}
