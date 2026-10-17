import {lazy,Suspense,useEffect,useRef} from 'react';
import {Link,Navigate,useLocation} from 'react-router-dom';
import {LayoutDashboard,CalendarCheck,Landmark,BookOpen,Clock3,ClipboardList,ChartNoAxesCombined,LockKeyhole} from 'lucide-react';
import {podeAbrir} from '../lib/sessao.js';
import {secoesComerciais,secaoComercialAtual,destinoSecaoComercial,destinoComercialLegado} from '../lib/calc/navegacao-comercial.js';
import GuardaDeRota from '../components/GuardaDeRota.jsx';
import {FiltrosCentralContext} from '../hooks/useFiltroCentral.js';
import './central-comercial.css';
import './comercial-acentos.css';

const Comercial=lazy(()=>import('./Comercial.jsx'));
const Compromissos=lazy(()=>import('./Compromissos.jsx'));
const Bancos=lazy(()=>import('./Bancos.jsx'));
const GlossarioComercial=lazy(()=>import('./GlossarioComercial.jsx'));
const ContasAtrasadas=lazy(()=>import('./ContasAtrasadas.jsx'));
const FerramentaBrief=lazy(()=>import('./FerramentaBrief.jsx'));
const DashboardComercial=lazy(()=>import('./DashboardComercial.jsx'));
const ACENTOS={visao:'roxo',compromissos:'azul',bancos:'ciano',glossario:'azul',contas:'alerta',brief:'ciano',dashboard:'roxo'};
const ICONES={visao:LayoutDashboard,compromissos:CalendarCheck,bancos:Landmark,glossario:BookOpen,contas:Clock3,brief:ClipboardList,dashboard:ChartNoAxesCombined};

function TelaAtiva({secao,sessao}) {
  switch(secao.id){
    case 'visao-geral':return <Comercial sessao={sessao} integrada/>;
    case 'compromissos':return <Compromissos/>;
    case 'bancos':return <Bancos/>;
    case 'glossario':return <GlossarioComercial sessao={sessao}/>;
    case 'contas-atrasadas':return <ContasAtrasadas/>;
    case 'brief':return <FerramentaBrief tipo="brief" integrada/>;
    case 'dashboard':return <DashboardComercial sessao={sessao}/>;
    default:return null;
  }
}

export default function CentralComercial({sessao}) {
  // Ao trocar pessoa, carteira ou acesso, descarta os filtros da sessão anterior.
  const chave=JSON.stringify([sessao?.usuario,sessao?.master,sessao?.vendedorId,sessao?.permissoes||[]]);
  return <CentralComercialTela key={chave} sessao={sessao}/>;
}

function CentralComercialTela({sessao}) {
  const location=useLocation();
  const secoes=secoesComerciais(m=>podeAbrir(m,sessao));
  const secao=secaoComercialAtual(location.pathname);
  const permitida=secao&&secoes.some(s=>s.id===secao.id);
  const memoria=useRef({});
  const filtros=useRef(new Map());
  const foco=useRef(null);
  const ultimaSecao=useRef(secao?.id);
  const destinoLegado=destinoComercialLegado(location.pathname,location.search,location.hash);
  useEffect(()=>{
    if(!permitida||destinoLegado)return;
    memoria.current[secao.id]={search:location.search,hash:location.hash};
    if(ultimaSecao.current!==secao.id)foco.current?.focus({preventScroll:true});
    ultimaSecao.current=secao.id;
  },[secao,permitida,destinoLegado,location.search,location.hash]);

  if(destinoLegado)return <Navigate to={destinoLegado} state={location.state} replace/>;
  // Uma pessoa só com Bancos entra diretamente em Bancos; não ganha Orçamentos.
  if(secao?.id==='visao-geral'&&!permitida)return <Navigate to={secoes[0]?.caminho||'/'} replace/>;
  return <div className="central-comercial">
    <nav className="central-comercial__nav sem-impressao" aria-label="Central Comercial">
      {secoes.map(s=>{const Icone=ICONES[s.icone];return <Link key={s.id} to={s.id===secao?.id?`${s.caminho}${location.search}${location.hash}`:destinoSecaoComercial(s,memoria.current)}
        className={`central-comercial__link ${s.id==='dashboard'?'central-comercial__link--dashboard':''}`}
        data-acento={ACENTOS[s.icone]} aria-current={secao?.id===s.id?'page':undefined}><span className="central-comercial__icone" aria-hidden="true"><Icone size={17} aria-hidden="true"/></span><span>{s.nome}</span></Link>;})}
    </nav>
    <section ref={foco} tabIndex={-1} aria-label={secao?.nome||'Área não encontrada'}
      className={`central-comercial__conteudo ${secao?.id==='brief'?'central-comercial__conteudo--brief':''}`}>
      {!secao?<div className="cc-empty"><h1>Área não encontrada</h1><p>Escolha uma das áreas da Central Comercial acima.</p></div>
        :!permitida?<div className="cc-empty"><LockKeyhole size={24} aria-hidden="true"/><h1>Acesso não liberado</h1><p>Sua conta não tem acesso a {secao.nome}. As outras áreas autorizadas continuam disponíveis acima.</p></div>
        :<FiltrosCentralContext.Provider value={filtros.current}><GuardaDeRota chave={secao.id}><Suspense fallback={<div className="central-comercial__carregando" role="status"><span aria-hidden="true"/><p>Abrindo {secao.nome}…</p></div>}><TelaAtiva secao={secao} sessao={sessao}/></Suspense></GuardaDeRota></FiltrosCentralContext.Provider>}
    </section>
  </div>;
}
