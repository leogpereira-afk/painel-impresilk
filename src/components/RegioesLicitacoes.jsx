import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,MapPin,RefreshCw,Search} from 'lucide-react';
import {podeAbrir} from '../lib/sessao.js';
import {diaBrasilia} from '../lib/licitacoes-cadastros.mjs';
import {construirRegioes,filtrarCidades,MUNICIPIOS,formatarDataRegiao} from '../lib/licitacoes-regioes.mjs';
import {listarEntidadesLicitacoes,salvarEntidadeLicitacoes} from '../services/licitacoes-entidades.js';
import {listarCadastrosLicitacoes} from '../services/licitacoes-cadastros.js';
import EntidadesLicitacoes from './EntidadesLicitacoes.jsx';
import RotaCidadeLicitacoes from './RotaCidadeLicitacoes.jsx';
import {listarRotasLicitacoes,salvarRotaLicitacoes} from '../services/licitacoes-rotas.js';
import {ORIGEM_IMPRESILK} from '../../supabase/functions/_shared/licitacoes-rotas.mjs';
import './licitacoes-regioes.css';
import ParticiparLicitacao from './ParticiparLicitacao.jsx';

const data=formatarDataRegiao;
const linkRota=cidade=>`https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin:ORIGEM_IMPRESILK,destination:`${cidade}, MG, Brasil`,travelmode:'driving'})}`;
const resumoRota=r=>r?`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(r.distanciaKm)} km · ${Math.floor(r.tempoMinutos/60)} h ${r.tempoMinutos%60} min`:'Distância a conferir';
function OportunidadesCidade({cidade,aoOportunidade,pesquisa,carregando,erro,aoParticipar,estadoParticipacao,aoAbrirParticipacao}){
  const linha=(item,pendente=false)=><article className="lr-opportunity" key={item.id}><div><span className="lr-kicker">{pendente?'Local / evidência a confirmar':item.classificacao||'A conferir'}</span><h3>{item.produto||item.processo||'Item da pesquisa'}</h3><p>{item.orgao||'Órgão a conferir'}</p><small>{item.processo} · Prazo: {data(item.prazo)}</small>{pendente&&<p>{item.localExecucaoRegistrado?.apenasSede?'A cidade foi identificada como sede; a execução ainda precisa ser confirmada.':'A evidência deste item ainda precisa ser conferida.'}</p>}</div><div className="lr-opportunity-actions"><button className="btn-outline" onClick={()=>aoOportunidade(item.id)}>Ver ficha completa<ArrowUpRight size={15}/></button>{!pendente&&<ParticiparLicitacao item={item} estado={estadoParticipacao?.(item,pesquisa)} aoParticipar={aoParticipar?i=>aoParticipar(i,pesquisa):undefined} aoAbrir={aoAbrirParticipacao}/>}</div></article>;
  if(carregando)return <p className="lr-empty" role="status">Consultando a pesquisa selecionada…</p>;
  if(erro)return <p className="lw-notice" role="alert">A pesquisa não pôde ser carregada. Abra “Pesquisar oportunidades” para tentar novamente. {erro}</p>;
  return <div className="lr-opportunities"><p className="lr-source">{pesquisa?.id?`Pesquisa de ${data(pesquisa.geradoEm)}${pesquisa.antigo?' · relatório antigo':''}. `:'Sem pesquisa disponível. '}O local de entrega ou execução define as oportunidades da cidade. Os prazos são comparados por dia; confira o horário no edital antes de participar.</p>{cidade.oportunidades.length?cidade.oportunidades.map(i=>linha(i)):<p className="lr-empty">Nenhuma oportunidade com prazo informado a partir de hoje e execução confirmada nesta cidade, na pesquisa selecionada. Isso não significa ausência de oportunidades.</p>}{cidade.pendentesTerritoriais.length>0&&<details className="lr-disclosure"><summary>Menções à cidade que precisam de conferência <b>{cidade.pendentesTerritoriais.length}</b></summary>{cidade.pendentesTerritoriais.map(i=>linha(i,true))}</details>}{cidade.encerradas.length>0&&<details className="lr-disclosure"><summary>Outros resultados e prazos a conferir <b>{cidade.encerradas.length}</b></summary>{cidade.encerradas.map(i=>linha(i))}</details>}</div>;
}

export default function RegioesLicitacoes({sessao,pesquisa,carregandoPesquisa,erroPesquisa,municipio='',aoMunicipio,aoOportunidade,aoVerCadastro,aoParticipar,estadoParticipacao,aoAbrirParticipacao}){
  const permitido=podeAbrir('licitacoes',sessao);
  const [dados,setDados]=useState(null),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[mensagem,setMensagem]=useState('');
  const [busca,setBusca]=useState(''),[filtro,setFiltro]=useState('todas'),[pagina,setPagina]=useState(1),[aba,setAba]=useState('oportunidades'),[selecionada,setSelecionada]=useState(''),[hoje,setHoje]=useState(diaBrasilia);
  const geracao=useRef(0),abort=useRef(null);
  const carregar=useCallback(async()=>{
    if(!permitido)return;
    const g=++geracao.current;abort.current?.abort();const controle=new AbortController();abort.current=controle;setCarregando(true);setErro('');
    try{const [entidades,cadastros,rotas]=await Promise.all([listarEntidadesLicitacoes(controle.signal),listarCadastrosLicitacoes(controle.signal),listarRotasLicitacoes(controle.signal)]);if(g===geracao.current)setDados({entidades:entidades.itens,cadastros:cadastros.itens,titulares:cadastros.titulares,rotas:rotas.itens});}
    catch(e){if(g===geracao.current&&e.name!=='AbortError'){setDados(null);setErro(e.message);}}
    finally{if(g===geracao.current)setCarregando(false);}
  },[permitido]);
  useEffect(()=>{const controle=geracao,leitura=abort;setDados(null);setMensagem('');void carregar();return()=>{controle.current++;leitura.current?.abort();};},[carregar,sessao]);
  useEffect(()=>{setAba('oportunidades');setSelecionada('');setMensagem('');},[municipio]);
  useEffect(()=>{const atualizar=()=>setHoje(diaBrasilia());window.addEventListener('focus',atualizar);const t=setInterval(atualizar,60000);return()=>{window.removeEventListener('focus',atualizar);clearInterval(t);};},[]);
  const cidades=useMemo(()=>construirRegioes({pesquisa,entidades:dados?.entidades||[],cadastros:dados?.cadastros||[],hoje}),[pesquisa,dados,hoje]);
  const cidade=cidades.find(c=>c.nome===municipio);
  const recorte=filtrarCidades(cidades,{busca,filtro});
  const paginaAtual=Math.min(pagina,Math.max(1,Math.ceil(recorte.length/18)));
  const visiveis=recorte.slice((paginaAtual-1)*18,paginaAtual*18);
  const mudarFiltro=f=>{setFiltro(f);setBusca('');setPagina(1);};
  const abrirEntidade=id=>{setAba('entidades');setSelecionada(id);};
  const salvar=async(item,versao)=>{
    const g=geracao.current;setOcupado(true);setErro('');setMensagem('');
    try{const r=await salvarEntidadeLicitacoes(item,versao);if(g===geracao.current){setDados(d=>({...d,entidades:[...(d?.entidades||[]).filter(e=>e.id!==r.item.id),r.item]}));setMensagem('Ficha salva. Vínculos e acompanhamento atualizados.');}}
    catch(e){if(g===geracao.current){setErro(e.message);if(e.status===409){try{const r=await listarEntidadesLicitacoes(abort.current?.signal);if(g===geracao.current)setDados(d=>({...d,entidades:r.itens}));}catch{/* A ficha aberta conserva o rascunho se a releitura falhar. */}}}throw e;}
    finally{if(g===geracao.current)setOcupado(false);}
  };
  const salvarRota=async(item,versao)=>{
    const g=geracao.current;setOcupado(true);setErro('');
    try{const r=await salvarRotaLicitacoes(item,versao);if(g===geracao.current)setDados(d=>({...d,rotas:[...(d?.rotas||[]).filter(x=>x.municipio!==r.item.municipio),r.item]}));}
    catch(e){if(g===geracao.current){setErro(e.message);if(e.status===409){try{const r=await listarRotasLicitacoes(abort.current?.signal);if(g===geracao.current)setDados(d=>({...d,rotas:r.itens}));}catch{/* A comparação aguardará a próxima leitura válida. */}}}throw e;}
    finally{if(g===geracao.current)setOcupado(false);}
  };
  const relerEntidades=async()=>{
    const g=geracao.current;
    const r=await listarEntidadesLicitacoes(abort.current?.signal);
    if(g===geracao.current){setDados(d=>({...d,entidades:r.itens}));setErro('');}
  };
  const relerRotas=async()=>{
    const g=geracao.current;
    const r=await listarRotasLicitacoes(abort.current?.signal);
    if(g===geracao.current){setDados(d=>({...d,rotas:r.itens}));setErro('');}
  };
  const rotasPorCidade=new Map((dados?.rotas||[]).map(r=>[r.municipio,r]));
  if(!permitido)return <p className="lw-notice">Este acesso não possui permissão para Licitações.</p>;
  return <section className="lr-workspace">
    <header className="lr-region"><div className="lr-region-title"><MapPin size={23}/><div><span className="lr-kicker">REGIÕES ATENDIDAS</span><h2>Norte de Minas <small>89 municípios</small></h2><p>Oportunidades locais e relacionamento com órgãos e empresas.</p><small className="lr-origin">Saída das rotas: sede da Impresilk em Montes Claros.</small></div></div><button className="btn-outline" onClick={carregar} disabled={carregando||ocupado}><RefreshCw size={15}/>Atualizar fichas</button></header>
    {mensagem&&<p className="lw-notice" role="status">{mensagem}</p>}
    {erro&&!ocupado&&<p className="lw-notice" role="alert">{erro}{!dados&&<button className="btn-outline" onClick={carregar}>Tentar novamente</button>}</p>}
    {!cidade?<>
      {municipio&&<p className="lw-notice">Cidade não encontrada na região. Escolha um dos municípios abaixo.</p>}
      <div className="lw-metrics lr-metrics">
        {[['todas','Cidades atendidas',MUNICIPIOS.length,'Base territorial definida'],['oportunidades','Com oportunidades',carregandoPesquisa||erroPesquisa?'—':cidades.filter(c=>c.oportunidades.length).length,'Prazo a partir de hoje na pesquisa'],['acompanhamento','Com relacionamento',dados?cidades.filter(c=>c.entidades.length).length:'—','Órgãos e empresas acompanhados'],['pendencias','Com pendências',dados?cidades.filter(c=>c.pendencias.length).length:'—','Cadastros, responsáveis e próximos passos']].map(([id,titulo,total,detalhe])=><button className="lw-metric" key={id} aria-pressed={filtro===id} onClick={()=>mudarFiltro(id)}><small>{titulo}</small><strong>{total}</strong><span>{detalhe}</span></button>)}
      </div>
      <div className="lw-toolbar"><label>Buscar cidade<span><Search size={16}/><input type="search" placeholder="Nome do município" value={busca} onChange={e=>{setBusca(e.target.value);setPagina(1);}}/></span></label><label>Mostrar cidades<select value={filtro} onChange={e=>{setFiltro(e.target.value);setPagina(1);}}><option value="todas">Todas as 89 cidades</option><option value="oportunidades">Com oportunidades</option><option value="acompanhamento">Com órgãos ou empresas</option><option value="pendencias">Com pendências</option></select></label><span className="lr-total">{recorte.length} cidades</span></div>
      <p className="lr-source">{carregandoPesquisa?'Carregando pesquisa…':erroPesquisa?'Pesquisa indisponível; os números de oportunidades não foram confirmados.':pesquisa?.id?`Pesquisa de ${data(pesquisa.geradoEm)} · oportunidades com execução confirmada. Cobertura detalhada dentro da cidade.`:'Sem relatório de pesquisa disponível.'} {carregando?'Consultando fichas…':''}</p>
      <div className="lr-cities" role="list" aria-label="Cidades atendidas">
        <div className="lr-city-table-head" aria-hidden="true"><span>Cidade</span><span>Oportunidades</span><span>Órgãos / empresas</span><span>Acompanhamento</span><span>Distância / trajeto</span><span>Abrir</span></div>
        {visiveis.map(c=>{const temOportunidades=!carregandoPesquisa&&!erroPesquisa&&c.oportunidades.length>0;return <article key={c.nome} role="listitem" aria-label={c.nome} className={`lr-city${temOportunidades?' is-opportunity':''}`}>
          <div className="lr-city-heading"><strong>{c.nome}</strong>{temOportunidades&&<span className="lr-opportunity-flag">Com oportunidades</span>}</div>
          <div className="lr-city-cell lr-city-opportunities"><span className="lr-cell-label">Oportunidades</span><strong>{carregandoPesquisa||erroPesquisa?'—':c.oportunidades.length}</strong><small>{carregandoPesquisa?'Consultando pesquisa':erroPesquisa?'Pesquisa indisponível':temOportunidades?'no prazo informado':'na pesquisa'}</small></div>
          <div className="lr-city-cell lr-city-entities"><span className="lr-cell-label">Órgãos / empresas</span><strong>{dados?c.entidades.length:'—'}</strong></div>
          <div className="lr-city-cell lr-city-followup"><span className="lr-cell-label">Acompanhamento</span><span className={dados&&c.pendencias.length?'lr-pending':'lr-city-note'}>{dados?(c.pendencias.length?`${c.pendencias.length} ficha(s) com pendências`:c.entidades.length?'Sem pendências nas fichas':'Sem acompanhamento'):'Fichas não carregadas'}</span></div>
          <div className="lr-city-route"><span className="lr-cell-label">Distância / trajeto</span><span>{resumoRota(rotasPorCidade.get(c.nome))}</span><a href={linkRota(c.nome)} aria-label={`Ver rota para ${c.nome}`} target="_blank" rel="noopener noreferrer">Ver rota<ArrowUpRight size={13}/></a></div>
          <div className="lr-city-actions"><button type="button" className="btn-outline lr-city-open" aria-label={`Abrir cidade ${c.nome}`} onClick={()=>aoMunicipio(c.nome)}>Abrir<ArrowUpRight size={14}/></button></div>
        </article>;})}
      </div>
      {!visiveis.length&&<p className="lr-empty">Nenhuma cidade neste filtro. Altere a busca ou selecione todas as cidades.</p>}
      <footer className="lr-pagination"><span>Página {paginaAtual} de {Math.max(1,Math.ceil(recorte.length/18))}</span><button className="btn-outline" disabled={paginaAtual===1} onClick={()=>setPagina(p=>p-1)}>Anterior</button><button className="btn-outline" disabled={paginaAtual*18>=recorte.length} onClick={()=>setPagina(p=>p+1)}>Próxima</button></footer>
    </>:<>
      <div className="lr-city-toolbar"><button className="btn-ghost" onClick={()=>aoMunicipio('')}><ArrowLeft size={16}/>Todas as cidades</button><label>Trocar cidade<select className="input" value={cidade.nome} onChange={e=>aoMunicipio(e.target.value)}>{MUNICIPIOS.map(n=><option key={n}>{n}</option>)}</select></label></div>
      <div className="lr-city-title"><div><span className="lr-kicker">NORTE DE MINAS · MG</span><h2>{cidade.nome}</h2></div><span className="lr-coverage">Pesquisa: {cidade.cobertura?.resultado||'sem cobertura confirmada'}</span></div>
      {cidade.cobertura?.pendencia&&<details className="lr-disclosure lr-coverage-detail"><summary>O que falta conferir na pesquisa da cidade</summary><p className="lr-source">{cidade.cobertura.pendencia}</p></details>}
      <RotaCidadeLicitacoes key={cidade.nome} municipio={cidade.nome} rota={rotasPorCidade.get(cidade.nome)} origemRota={ORIGEM_IMPRESILK} aoSalvar={salvarRota} aoRecarregar={relerRotas} ocupado={ocupado||carregando||!dados} erro={erro}/>
      <nav className="lr-tabs" aria-label="Informações da cidade">{[['oportunidades','Oportunidades',carregandoPesquisa||erroPesquisa?'—':cidade.oportunidades.length],['entidades','Órgãos e empresas',dados?cidade.entidades.length:'—'],['pendencias','Pendências',dados?cidade.pendencias.length:'—']].map(([id,n,total])=><button key={id} aria-current={aba===id?'page':undefined} onClick={()=>setAba(id)}>{n}<b>{total}</b></button>)}</nav>
      {aba==='oportunidades'&&<OportunidadesCidade cidade={cidade} pesquisa={pesquisa} carregando={carregandoPesquisa} erro={erroPesquisa} aoOportunidade={aoOportunidade} aoParticipar={aoParticipar} estadoParticipacao={estadoParticipacao} aoAbrirParticipacao={aoAbrirParticipacao}/>}
      {aba==='entidades'&&(dados?<EntidadesLicitacoes municipio={cidade.nome} entidadesAtuais={dados.entidades||[]} entidades={(dados.entidades||[]).filter(e=>e.municipios?.includes(cidade.nome))} cadastros={dados.cadastros||[]} titulares={dados.titulares||[]} aoSalvar={salvar} aoRecarregar={relerEntidades} origemRota={ORIGEM_IMPRESILK} aoVerCadastro={aoVerCadastro} ocupado={ocupado} erro={erro} carregando={carregando} entidadeSelecionada={selecionada} aoSelecaoConsumida={()=>setSelecionada('')}/>:<p className="lr-empty" role="status">{carregando?'Carregando fichas…':'Atualize as fichas para consultar e cadastrar.'}</p>)}
      {aba==='pendencias'&&<div className="lr-pending-list">{!dados?<p className="lr-empty">{carregando?'Carregando pendências…':'Fichas indisponíveis. Tente atualizar.'}</p>:cidade.pendencias.length?cidade.pendencias.map(p=><article key={p.entidadeId}><div><h3>{p.nome}</h3><ul>{p.motivos.map(m=><li key={m}>{m}</li>)}</ul></div><button className="btn-outline" onClick={()=>abrirEntidade(p.entidadeId)}>Resolver na ficha<ArrowUpRight size={15}/></button></article>):<div className="lr-empty"><p>Nenhuma pendência identificada nas fichas desta cidade.</p><button className="btn-outline" onClick={()=>setAba('entidades')}>Ver órgãos e empresas</button></div>}</div>}
    </>}
  </section>;
}
