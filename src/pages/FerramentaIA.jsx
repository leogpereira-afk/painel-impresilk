import {lazy,Suspense,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {getSessao} from '../lib/sessao.js';
const OficinaMateriais=lazy(()=>import('./OficinaMateriais.jsx'));
const OficinaPlacas=lazy(()=>import('./OficinaPlacas.jsx'));
const ACMStudio=lazy(()=>import('./ACMStudio.jsx'));
const LetraCaixa=lazy(()=>import('./LetraCaixa.jsx'));
import {ArrowLeft,ArrowUpRight,Maximize2,Minimize2,BookOpen} from 'lucide-react';
import SilkHeader from '../components/SilkHeader.jsx';
import {FERRAMENTAS} from '../lib/ferramentas-ia.mjs';
import './FerramentaIA.css';
const PlanoChapasVendas=lazy(()=>import('./PlanoChapasVendas.jsx'));
export default function FerramentaIA(){
 const [focoId,setFocoId]=useState(null);const [abertaId,setAbertaId]=useState(null);const [checks,setChecks]=useState({});
 const [params,setParams]=useSearchParams();
 const aba=['acrylic','mdf','metalon'].includes(params.get('ferramenta'))?params.get('ferramenta'):params.get('ferramenta')==='letra-caixa'?'letra-caixa':params.get('ferramenta')==='acm'?'acm':['orcamento','chapas-vendas'].includes(params.get('ferramenta'))?'chapas-vendas':'sistema-cortes';
 const ativa=aba==='sistema-cortes'?FERRAMENTAS.find(f=>f.id===params.get('corte')):null;
 const foco=!!ativa&&focoId===ativa.id,abrir=!!ativa&&abertaId===ativa.id;
 function setFoco(value){setFocoId(value?ativa?.id:null)}
 function setAbrir(value){setAbertaId(value?ativa?.id:null)}
 function setAba(value){setAbrir(false);setFoco(false);setParams({ferramenta:value==='ferramentas'?'sistema-cortes':value})}
 function escolher(f){if(ativa?.id===f.id)return;setAbrir(false);setFoco(false);setParams({ferramenta:'sistema-cortes',corte:f.id})}
 if(['acrylic','mdf'].includes(aba))return <Suspense fallback={<p>Preparando Acrílico e MDF…</p>}><OficinaPlacas key={getSessao()?.usuario} initialMaterial={aba} onBack={()=>setAba('ferramentas')} onTool={setAba}/></Suspense>;
 if(aba==='metalon')return <Suspense fallback={<p>Preparando oficina…</p>}><OficinaMateriais key={getSessao()?.usuario} initialMaterial={aba} onBack={()=>setAba('ferramentas')} onTool={setAba}/></Suspense>;
 if(aba==='letra-caixa')return <Suspense fallback={<p>Preparando Letra Caixa…</p>}><LetraCaixa key={getSessao()?.usuario} onBack={()=>setAba('ferramentas')}/></Suspense>;
 if(aba==='acm')return <Suspense fallback={<p>Preparando ACM Studio…</p>}><ACMStudio key={getSessao()?.usuario} onBack={()=>setAba('ferramentas')}/></Suspense>;
 return <div className={`fia ${foco?'fia-focus':''}`}>
 {!foco&&<><SilkHeader titulo="Ferramenta I.A" contexto="CRIAÇÃO · PRODUÇÃO · IMPRESILK" descricao="Da criação ao plano de corte, prepare cada etapa da produção."/>
 <nav className="fia-tabs" aria-label="Ferramenta I.A"><button onClick={()=>setAba('acrylic')}>💎 Acrílico</button><button onClick={()=>setAba('mdf')}>🪵 MDF</button><button onClick={()=>setAba('metalon')}>🔩 Metalon</button><button onClick={()=>setAba('acm')}>🏢 ACM Studio · 3D</button><button onClick={()=>setAba('letra-caixa')}>🔤 Letra Caixa · 3D</button><button aria-pressed={aba==='sistema-cortes'} onClick={()=>setAba('sistema-cortes')}>✂️ Sistema Cortes</button><button aria-pressed={aba==='chapas-vendas'} onClick={()=>setAba('chapas-vendas')}>📐 Plano de chapas · Vendas</button></nav></>}
 {aba==='sistema-cortes'&&!foco&&<section className="fia-cortes" aria-labelledby="sistema-cortes-titulo"><div className="fia-cortes-heading"><div><h2 id="sistema-cortes-titulo">✂️ Sistema Cortes</h2><p>Prepare arquivos, crie peças, confira a montagem em 3D e calcule o aproveitamento dos materiais para o corte.</p></div><span className="fia-badge">7 ferramentas</span></div><nav className="fia-cortes-tools" aria-label="Ferramentas do Sistema Cortes">{FERRAMENTAS.map(f=><button type="button" key={f.id} aria-pressed={ativa?.id===f.id} onClick={()=>escolher(f)}><span aria-hidden="true">{f.emoji}</span><span>{f.nome}</span></button>)}</nav></section>}
 {aba==='chapas-vendas'?<Suspense fallback={<p>Preparando plano de chapas…</p>}><PlanoChapasVendas/></Suspense>:ativa?<section className="fia-panel fia-workspace"><div className="fia-workbar"><button onClick={()=>setAba('sistema-cortes')}><ArrowLeft size={16}/> Sistema Cortes</button><h2>{ativa.emoji} {ativa.nome}</h2><button aria-pressed={foco} onClick={()=>setFoco(!foco)}>{foco?<Minimize2 size={16}/>:<Maximize2 size={16}/>} {foco?'Sair do foco':'Ampliar área'}</button><a href={ativa.url} target="_blank" rel="noopener noreferrer">Abrir no site <ArrowUpRight size={16}/></a></div>
 {!foco&&<details className="fia-details" open={!abrir}><summary><BookOpen size={16}/> Guia Impresilk · preparar e conferir</summary><div className="fia-guide"><div><h3>Como usar</h3><ol>{ativa.passos.map(p=><li key={p}>{p}</li>)}</ol></div><div><h3>Conferência do projeto</h3>{ativa.conferir.map((p,i)=><label className="fia-check" key={p}><input type="checkbox" checked={!!checks[`${ativa.id}-${i}`]} onChange={e=>setChecks({...checks,[`${ativa.id}-${i}`]:e.target.checked})}/>{p}</label>)}</div></div><p className="fia-note">{ativa.limite}</p></details>}
 <p className="fia-external">Ferramenta externa: <a href={ativa.url} target="_blank" rel="noopener noreferrer">Porto Designer</a>. Arquivos inseridos aqui são tratados pelo serviço externo. O Painel não salva os projetos nem acompanha suas exportações.</p>
 {!abrir?<div className="fia-launch"><span aria-hidden="true">{ativa.emoji}</span><h3>Pronto para trabalhar?</h3><p>{ativa.resumo}</p>{ativa.acessoExterno?<><p>Na conferência, esta ferramenta solicitou login dentro do Painel. Abra no site original para usar sua sessão do fornecedor.</p><a className="fia-primary fia-external-action" href={ativa.url} target="_blank" rel="noopener noreferrer">Abrir {ativa.nome} no site ↗</a><button onClick={()=>setAbrir(true)}>Tentar abrir no Painel</button></>:<button className="fia-primary" onClick={()=>setAbrir(true)}>Abrir {ativa.nome}</button>}</div>:<><iframe key={ativa.id} className="fia-frame" title={`${ativa.nome} — Porto Designer`} src={ativa.url} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"/><p className="fia-external">Se a ferramenta não aparecer ou a exportação for bloqueada, use “Abrir no site”. Salve seus arquivos antes de trocar de ferramenta.</p></>}
 </section>:<section className="fia-panel fia-cortes-start" aria-label="Entrada do Sistema Cortes"><span className="fia-cortes-start-icon" aria-hidden="true">✂️</span><div><h3>Escolha uma das sete ferramentas acima</h3><p>Consulte as etapas e a conferência de cada ferramenta antes de abrir o editor.</p><p className="fia-external">Ferramentas Porto Designer com guias da Impresilk. Os editores são abertos somente quando você escolher usar.</p></div></section>}
 </div>;
}
