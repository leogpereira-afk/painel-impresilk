import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {ehDirecao, podeConfigurar} from '../lib/sessao.js';
import {ArrowRight, ShieldCheck, KeyRound, Database, Users, Search, Building2} from 'lucide-react';
import {lerAcessos} from '../services/acesso.js';
import {ATALHOS_EXTERNOS_CENTRAL, doSistema} from '../lib/sistemas.js';
import {contarAcessos,temPendencia} from '../lib/acesso-state.mjs';
import './central-resumo.css';

export function CentralNavegacao({ativa}) {
  const itens=[['geral','Visão geral','/acessos'],['sistemas','Sistemas e pessoas','/acessos?visao=sistemas'],['conta','Minha conta','/minha-conta'],['backup','Backups','/backups'],['configuracoes','Configurações','/configuracoes']].filter(([id])=>import.meta.env.MODE==='review'||(id==='configuracoes'?podeConfigurar():id==='conta'||ehDirecao()));
  return <nav className="central-nav" aria-label="Áreas da central">{itens.map(([id,nome,url])=><Link key={id} to={url} aria-current={ativa===id?'page':undefined}>{nome}</Link>)}</nav>;
}

export default function CentralResumo() {
  const [dados,setDados]=useState(null),[erro,setErro]=useState(null),[busca,setBusca]=useState('');
  const [tentativa,setTentativa]=useState(0);
  useEffect(()=>{let ativo=true;setErro(null);lerAcessos().then(d=>{if(ativo)setDados(d);}).catch(e=>{if(ativo)setErro(e.message);});return()=>{ativo=false;};},[tentativa]);
  if(erro)return <div className="card p-6" role="alert"><h2>Não foi possível carregar a visão geral</h2><p>{erro}</p><button className="btn-outline mt-4" onClick={()=>setTentativa(n=>n+1)}>Tentar novamente</button></div>;
  if(!dados)return <div className="card p-6" role="status">Carregando a visão geral dos sistemas…</div>;
  const numeros=contarAcessos(dados);
  const sistemas=dados.sistemas.map(doSistema);
  const visiveis=sistemas.filter(s=>(s.nomeCompleto||s.nome).toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  return <div className="central-resumo">
    <section className="central-welcome"><div><span className="central-eyebrow">SEU PONTO DE PARTIDA</span><h2>Todos os acessos, no mesmo lugar.</h2><p>Encontre um sistema, revise quem pode entrar e cuide da sua conta.</p><Link to="/acessos?visao=sistemas" className="btn-primary">Gerenciar acessos <ArrowRight size={16}/></Link></div><div className="central-welcome-icon"><ShieldCheck size={64}/><span>Impresilk</span></div></section>
    <section className="central-metrics" aria-label="Resumo de acessos">
      <div><Building2 size={19}/><strong>{sistemas.length}</strong><span>Sistemas na central</span></div>
      <div><Users size={19}/><strong>{numeros.pessoas}</strong><span>Contas centrais</span></div>
      <div><ShieldCheck size={19}/><strong>{numeros.foraDoLugar}</strong><span>Acessos para revisar</span></div>
      <div><KeyRound size={19}/><strong>{numeros.temporarias}</strong><span>Acessos com senha temporária</span></div>
    </section>
    <div className="central-section-title"><div><h2>Seus sistemas</h2><p>Veja as contas e permissões de cada área.</p></div><label className="central-search"><Search size={17}/><input aria-label="Encontrar sistema" placeholder="Encontrar sistema" value={busca} onChange={e=>setBusca(e.target.value)}/></label></div>
    <section className="central-system-grid" aria-label="Todos os sistemas">{visiveis.map((s,i)=>{
      const papeis=dados.contas.flatMap(c=>c.papeis||[]).filter(p=>p.sistema===s.id);
      const externa=['domo','bosques'].includes(s.id)||dados.fontes?.[s.id]?.estado==='nao_integrado';
      const pendentes=papeis.filter(temPendencia).length;
      const total=papeis.filter(p=>p.real?.existe).length+(dados.soltas?.[s.id]?.length||0);
      return <article className="central-system-card" key={s.id}><div className="central-system-top"><span className={`central-system-icon color-${i%4}`}>{s.nome.slice(0,2).toUpperCase()}</span><span className={externa?'central-status external':pendentes?'central-status warning':'central-status'}>{externa?'Gestão externa':pendentes?'Revisar acesso':'Consultado'}</span></div><h3>{s.nomeCompleto||s.nome}</h3><p>{externa?'Contas administradas no próprio sistema':`${total} ${total===1?'conta encontrada':'contas encontradas'}`}</p><div className="central-card-bottom"><Link to={`/acessos?visao=sistemas&sistema=${s.id}`}>Gerenciar acessos <ArrowRight size={14}/></Link>{s.url && <a href={s.url} target="_blank" rel="noreferrer">Abrir sistema ↗</a>}</div></article>;
    })}</section>
    {!visiveis.length&&<p role="status">Nenhum sistema encontrado.</p>}
    {ATALHOS_EXTERNOS_CENTRAL.map(s=><div className="central-other" key={s.id}><div><h3>{s.nome}</h3><p>{s.descricao}</p></div><a href={s.url} target="_blank" rel="noopener noreferrer">Abrir sistema ↗</a></div>)}
    <section className="central-quick"><Link to="/minha-conta"><KeyRound size={22}/><div><h3>Minha conta e senha</h3><p>Cuide do seu próprio acesso ao Painel.</p></div><ArrowRight size={18}/></Link><Link to="/backups"><Database size={22}/><div><h3>Backups e recuperação</h3><p>Confira cópias, falhas e opções de restauração.</p></div><ArrowRight size={18}/></Link></section>
  </div>;
}
