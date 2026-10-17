import {lazy,Suspense} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {BookOpen,Layers3,LockKeyhole,Search,X} from 'lucide-react';
import {podeAbrir} from '../lib/sessao.js';
import {secoesGlossario} from '../lib/calc/navegacao-comercial.js';
import {useFiltroCentral} from '../hooks/useFiltroCentral.js';

const Termos=lazy(()=>import('./Glossario.jsx'));
const Solucoes=lazy(()=>import('../components/comercial/SolucoesComerciais.jsx'));

/** Uma busca para as duas bases; cada conteúdo mantém a permissão original. */
export default function GlossarioComercial({sessao}) {
  const [params]=useSearchParams();
  const [busca,setBusca]=useFiltroCentral('Glossario:busca','');
  const secoes=secoesGlossario(modulo=>podeAbrir(modulo,sessao));
  const selecionada=params.get('secao')||secoes[0]?.id;
  const permitida=secoes.some(secao=>secao.id===selecionada);
  const destino=id=>{
    const proximo=new URLSearchParams(params);
    proximo.set('secao',id);
    return `/comercial/glossario?${proximo.toString()}`;
  };
  return <div className="cc-glossario">
    <header className="cc-glossario__header">
      <div><p className="cc-glossario__eyebrow">CONHECIMENTO COMERCIAL</p><h1>Glossário e soluções</h1><p>Termos, produtos e orientações para conversar com o cliente.</p></div>
      <label className="cc-glossario__busca"><Search size={18} aria-hidden="true"/><span className="sr-only">Buscar no glossário e soluções</span><input type="search" placeholder="Buscar termo, produto ou material…" value={busca} onChange={e=>setBusca(e.target.value)}/>{busca&&<button type="button" onClick={()=>setBusca('')} aria-label="Limpar busca"><X size={16}/></button>}</label>
    </header>
    <nav className="cc-glossario__nav" aria-label="Áreas do Glossário">
      {secoes.map(secao=><Link key={secao.id} to={destino(secao.id)} aria-current={selecionada===secao.id?'page':undefined}>{secao.id==='termos'?<BookOpen size={17} aria-hidden="true"/>:<Layers3 size={17} aria-hidden="true"/>}{secao.nome}</Link>)}
    </nav>
    {!permitida?<section className="cc-empty"><LockKeyhole aria-hidden="true" size={24}/><h2>Conteúdo não liberado</h2><p>Escolha uma das áreas autorizadas acima.</p></section>:<Suspense fallback={<div className="central-comercial__carregando" role="status"><span aria-hidden="true"/>Abrindo {selecionada==='termos'?'termos e conceitos':'soluções comerciais'}…</div>}>
      {selecionada==='termos'?<Termos integrada buscaIntegrada={busca} setBuscaIntegrada={setBusca}/>:<Solucoes sessao={sessao} busca={busca} setBusca={setBusca} buscaIntegrada/>}
    </Suspense>}
  </div>;
}
