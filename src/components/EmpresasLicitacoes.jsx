import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Building2,ChevronDown,ClipboardCheck,Clock3,Plus,RefreshCw,Search,ShieldCheck,UserRound} from 'lucide-react';
import {podeAbrir} from '../lib/sessao.js';
import {diaBrasilia,situacaoCadastro,urlPortalSegura} from '../lib/licitacoes-cadastros.mjs';
import {GRUPOS_EMPRESAS,construirCarteiraEmpresas,filtrarCarteiraEmpresas,metricasCarteiraEmpresas} from '../lib/licitacoes-empresas.mjs';
import {formatarDataRegiao} from '../lib/licitacoes-regioes.mjs';
import {listarEntidadesLicitacoes,salvarEntidadeLicitacoes} from '../services/licitacoes-entidades.js';
import {listarCadastrosLicitacoes} from '../services/licitacoes-cadastros.js';
import {FormEntidade,novaFicha} from './EntidadesLicitacoes.jsx';
import CadastroEmpresaLicitacoes from './CadastroEmpresaLicitacoes.jsx';
import NrsIndustrias from './NrsIndustrias.jsx';
import JanelaFormulario from './JanelaFormulario.jsx';
import './licitacoes-empresas.css';

const data=formatarDataRegiao;
const PRIORIDADES={alta:'Alta',media:'Média',baixa:'Baixa'};
const vazio={busca:'',grupo:'todas',municipio:'',prioridade:''};

function EmpresaLinha({ficha,titulares,hoje,aberta,aoAbrir,aoEditar,aoCadastro,aoCidade,ocupado}) {
  const e=ficha.entidade,url=urlPortalSegura(e.site);
  return <details className={`lem-row ${ficha.grupo==='ativas'?'is-ready':''}`} open={aberta}>
    <summary onClick={ev=>{ev.preventDefault();aoAbrir(aberta?'':e.id);}} aria-expanded={aberta}>
      <span className="lem-name"><strong>{e.nome}</strong><small>{e.municipios?.join(' · ')||'Cidade não informada'}</small></span>
      <span className="lem-stage"><small>Cadastro de fornecedor</small><b className={`lem-badge is-${ficha.etapa.tom}`}>{ficha.etapa.rotulo}</b>{ficha.cadastrosVinculados.length>0&&<small>{ficha.cadastrosVinculados.length} cadastro(s) vinculado(s)</small>}</span>
      <span className="lem-owner"><small>Responsável</small><strong>{e.responsavel||'Definir responsável'}</strong><small>Prioridade {PRIORIDADES[e.prioridade]?.toLowerCase()||'a definir'}</small></span>
      <span className="lem-next"><small>Próxima ação</small><strong>{e.proximaAcao||'Definir próximo passo'}</strong><small className={ficha.acaoVencida?'lem-late':''}>{e.prazoAcao?`Até ${data(e.prazoAcao)}`:'Sem prazo definido'}</small></span>
      <span className="lem-open">{ficha.pendencias.length>0&&<b className="lem-attention">{ficha.pendencias.length} pend.</b>}<ChevronDown size={18}/></span>
    </summary>
    {aberta&&<div className="lem-detail">
      <div className="lem-detail-head"><div><h3>Plano de relacionamento</h3><p>Organize o cadastro e mantenha o retorno comercial em dia.</p></div><div className="lem-actions"><button className="btn-outline" disabled={ocupado} onClick={()=>aoEditar(e)}>Editar empresa</button><button className="btn-primary" disabled={ocupado||e.situacao==='arquivado'} onClick={()=>aoCadastro(e)}><Plus size={15}/>Preparar cadastro</button></div></div>
      <div className="lem-detail-grid">
        <section className="lem-panel"><h4><ShieldCheck size={17}/>Nossos cadastros nesta empresa</h4>
          {ficha.cadastrosVinculados.map(c=>{const sit=situacaoCadastro(c,hoje);return <button key={c.id} className="lem-registration" onClick={()=>aoCadastro(e,c.id)} disabled={ocupado}>
            <span><strong>{c.nome}</strong><small>{titulares.find(t=>t.id===c.titularId)?.nome||'Nossa empresa'} · {c.protocolo?`Protocolo ${c.protocolo}`:'Sem protocolo'}</small><small>{c.semVencimento?'Sem vencimento':`Validade: ${data(c.validade)}`}</small>{c.exigencias&&<small className="lem-requirement">{c.exigencias}</small>}</span><span><b className={`lem-badge is-${sit.tom}`}>{sit.rotulo}</b><ArrowUpRight size={15}/></span>
          </button>;})}
          {!ficha.cadastrosVinculados.length&&<p>{e.cadastroExigido==='nao'?'A ficha informa que cadastro não é exigido. Continue acompanhando o contato comercial.':'Ainda não há cadastro vinculado. Prepare um novo ou vincule um cadastro existente na ficha da empresa.'}</p>}
          {ficha.cadastrosIndisponiveis&&<p className="lem-late">Há vínculos indisponíveis para esta consulta. Eles permanecem preservados.</p>}
          <button className="btn-ghost" disabled={ocupado} onClick={()=>aoEditar(e)}><ClipboardCheck size={15}/>Vincular cadastro existente</button>
        </section>
        <section className="lem-panel"><h4><UserRound size={17}/>Contato e próximos passos</h4><dl className="lem-contact"><div><dt>Contato na empresa</dt><dd>{e.contato||'Não informado'}</dd></div><div><dt>Telefone</dt><dd>{e.telefone||'Não informado'}</dd></div><div><dt>E-mail</dt><dd>{e.email||'Não informado'}</dd></div><div><dt>Endereço</dt><dd>{e.endereco||'Não informado'}</dd></div></dl>
          {url&&<a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost">Abrir site / portal<ArrowUpRight size={15}/></a>}
          {ficha.pendencias.length>0&&<details className="lem-pending"><summary>O que precisa de atenção · {ficha.pendencias.length}</summary><ul>{ficha.pendencias.map(p=><li key={p}>{p}</li>)}</ul></details>}
        </section>
      </div>
      <details className="lem-history"><summary>Observações, cidades e histórico</summary>{e.observacao&&<p>{e.observacao}</p>}<div className="lem-actions">{e.municipios?.map(c=><button key={c} className="btn-ghost" onClick={()=>aoCidade(c)}>Ver {c}<ArrowUpRight size={14}/></button>)}</div>{e.historico?.length>0?<ol>{[...e.historico].reverse().map((h,i)=><li key={h.id||i}><strong>{h.acao==='criar'?'Empresa adicionada':h.acao==='arquivar'?'Ficha arquivada':'Acompanhamento atualizado'}</strong><span>{data(h.em)}{h.por?` · ${h.por}`:''}</span>{h.depois?.proximaAcao&&<p>{h.depois.proximaAcao}</p>}</li>)}</ol>:<p>O histórico aparece após salvar a ficha.</p>}</details>
    </div>}
  </details>;
}

export default function EmpresasLicitacoes({sessao,empresaSelecionada='',aoEmpresa,aoCidade}) {
  const permitido=podeAbrir('licitacoes',sessao);
  const [dados,setDados]=useState(null),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState('');
  const [filtros,setFiltros]=useState(vazio),[form,setForm]=useState(null),[cadastro,setCadastro]=useState(null),[ocupado,setOcupado]=useState(false),[hoje,setHoje]=useState(diaBrasilia),[pagina,setPagina]=useState(1);
  const geracao=useRef(0),leitura=useRef(0),abort=useRef(null);
  const carregar=useCallback(async()=>{
    if(!permitido)return;
    const g=geracao.current,l=++leitura.current;abort.current?.abort();const ac=new AbortController();abort.current=ac;setCarregando(true);setErro('');
    try{const [entidades,cadastros]=await Promise.all([listarEntidadesLicitacoes(ac.signal),listarCadastrosLicitacoes(ac.signal)]);if(g===geracao.current&&l===leitura.current)setDados({entidades:entidades.itens,cadastros:cadastros.itens,titulares:cadastros.titulares});}
    catch(e){if(g===geracao.current&&l===leitura.current&&e.name!=='AbortError'){setErro(e.message);throw e;}}
    finally{if(g===geracao.current&&l===leitura.current)setCarregando(false);}
  },[permitido]);
  useEffect(()=>{const controle=geracao;controle.current++;setDados(null);setForm(null);setCadastro(null);setOcupado(false);setMensagem('');void carregar().catch(()=>{});return()=>{controle.current++;abort.current?.abort();};},[carregar,sessao]);
  useEffect(()=>{const atualizar=()=>setHoje(diaBrasilia());window.addEventListener('focus',atualizar);const t=setInterval(atualizar,60000);return()=>{clearInterval(t);window.removeEventListener('focus',atualizar);};},[]);
  const carteira=useMemo(()=>construirCarteiraEmpresas({entidades:dados?.entidades||[],cadastros:dados?.cadastros||[],hoje}),[dados,hoje]);
  const metricas=metricasCarteiraEmpresas(carteira),recorte=useMemo(()=>filtrarCarteiraEmpresas(carteira,filtros),[carteira,filtros]);
  useEffect(()=>{const indice=recorte.findIndex(f=>f.id===empresaSelecionada);if(indice>=0)setPagina(Math.floor(indice/15)+1);},[empresaSelecionada,recorte]);
  const cidades=[...new Set(carteira.flatMap(f=>f.entidade.municipios||[]))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const paginaAtual=Math.min(pagina,Math.max(1,Math.ceil(recorte.length/15))),visiveis=recorte.slice((paginaAtual-1)*15,paginaAtual*15);
  const filtrar=(campo,valor)=>{setFiltros(f=>({...f,[campo]:valor}));setPagina(1);};
  const abrirFicha=e=>{setErro('');setForm(e);};
  const salvar=async(item,versao)=>{
    const g=geracao.current;setOcupado(true);setErro('');setMensagem('');
    try{const r=await salvarEntidadeLicitacoes(item,versao);if(g!==geracao.current)throw new DOMException('Sessão alterada.','AbortError');if(g===geracao.current){setDados(d=>({...d,entidades:[...(d?.entidades||[]).filter(e=>e.id!==r.item.id),r.item]}));setMensagem('Empresa salva. Esta mesma ficha também está disponível em Regiões.');aoEmpresa(r.item.id);setFiltros(vazio);setPagina(1);}}
    catch(e){if(g===geracao.current){setErro(e.message);if(e.status===409){try{await carregar();}catch{/* Formulário mantém o rascunho até uma leitura válida. */}}}throw e;}
    finally{if(g===geracao.current)setOcupado(false);}
  };
  const terminouCadastro=async()=>{const g=geracao.current;await carregar();if(g===geracao.current)setMensagem('Cadastro e vínculo com a empresa conferidos.');};
  const abrirCadastro=(empresa,cadastroId='')=>{setErro('');setCadastro({empresa,cadastroId});};
  if(!permitido)return <p className="lw-notice">Este acesso não possui permissão para Licitações.</p>;
  return <section className="lem-workspace">
    <header className="lem-heading"><div><span className="lem-kicker"><Building2 size={15}/>RELACIONAMENTO COM EMPRESAS</span><h2>Uma carteira para abrir novas portas.</h2><p>Prepare os cadastros de fornecedor, acompanhe exigências e organize cada retorno.</p></div><div className="lem-actions"><button className="btn-outline" disabled={ocupado||carregando||!!form||!!cadastro} onClick={()=>void carregar().catch(()=>{})}><RefreshCw size={15}/>Atualizar</button><button className="btn-primary" disabled={ocupado||carregando||!dados} onClick={()=>abrirFicha(novaFicha('empresa',filtros.municipio))}><Plus size={16}/>Nova empresa</button></div></header>
    <NrsIndustrias/>
    {mensagem&&<p className="le-message is-ok" role="status">{mensagem}</p>}{erro&&!form&&<p className="le-message is-bad" role="alert">{erro} <button className="btn-ghost" onClick={()=>void carregar().catch(()=>{})}>Tentar novamente</button></p>}
    <nav className="lem-metrics" aria-label="Carteira de empresas">{[['todas','Em carteira','total',Building2],['a-cadastrar','A cadastrar','acadastrar',Plus],['preparacao','Em preparação','preparacao',ClipboardCheck],['ativas','Empresas em dia','ativas',ShieldCheck],['pendencias','Prioridade de ação','pendencias',Clock3]].map(([grupo,rotulo,chave,Icon])=><button key={grupo} aria-pressed={filtros.grupo===grupo} onClick={()=>{setFiltros({...vazio,grupo});setPagina(1);}}><Icon size={17}/><span>{rotulo}</span><strong>{dados?metricas[chave]:'—'}</strong></button>)}</nav>
    <div className="lem-toolbar"><label><span><Search size={15}/>Buscar empresa</span><input type="search" placeholder="Empresa, contato, responsável ou serviço" value={filtros.busca} onChange={e=>filtrar('busca',e.target.value)}/></label><label>Cidade<select value={filtros.municipio} onChange={e=>filtrar('municipio',e.target.value)}><option value="">Todas as cidades</option>{cidades.map(c=><option key={c}>{c}</option>)}</select></label><label>Etapa<select value={filtros.grupo} onChange={e=>filtrar('grupo',e.target.value)}><option value="todas">Em acompanhamento</option>{Object.entries(GRUPOS_EMPRESAS).map(([v,n])=><option key={v} value={v}>{n}</option>)}<option value="com-pendencias">Qualquer pendência</option></select></label><label>Prioridade<select value={filtros.prioridade} onChange={e=>filtrar('prioridade',e.target.value)}><option value="">Todas</option>{Object.entries(PRIORIDADES).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></div>
    <p className="lem-count">{carregando?'Carregando carteira…':`${recorte.length} empresa(s) no recorte · abra uma linha para acompanhar.`}</p>
    {carregando?<p className="lem-empty" role="status">Consultando empresas e cadastros…</p>:dados&&visiveis.length?<div className="lem-list">{visiveis.map(f=><EmpresaLinha key={f.id} ficha={f} titulares={dados.titulares||[]} hoje={hoje} aberta={empresaSelecionada===f.id} aoAbrir={aoEmpresa} aoEditar={abrirFicha} aoCadastro={abrirCadastro} aoCidade={aoCidade} ocupado={ocupado}/>)}</div>:dados?<div className="lem-empty"><Building2 size={26}/><h3>{carteira.length?'Nenhuma empresa neste filtro':'Comece pela próxima empresa que queremos atender'}</h3><p>{carteira.length?'Altere a busca ou a etapa para consultar as outras empresas.':'Registre o comprador, a cidade e a próxima ação. O cadastro de fornecedor pode ser preparado em seguida.'}</p><button className="btn-outline" onClick={()=>carteira.length?setFiltros(vazio):abrirFicha(novaFicha('empresa'))}>{carteira.length?'Limpar filtros':'Adicionar empresa'}</button></div>:null}
    {recorte.length>15&&<footer className="lem-pagination"><span>Página {paginaAtual} de {Math.ceil(recorte.length/15)}</span><button className="btn-outline" disabled={paginaAtual===1} onClick={()=>setPagina(p=>p-1)}>Anterior</button><button className="btn-outline" disabled={paginaAtual*15>=recorte.length} onClick={()=>setPagina(p=>p+1)}>Próxima</button></footer>}
    <p className="lem-footnote">Esta é a nossa carteira de relacionamento. O cadastro só fica ativo após a liberação ser conferida no portal da empresa. Salvar aqui não envia uma inscrição externa.</p>
    {form&&<JanelaFormulario titulo={form.id?'Atualizar empresa':'Nova empresa a atender'} ocupado={ocupado} aoFechar={()=>!ocupado&&setForm(null)} classe="le-dialog"><FormEntidade key={form.id||form.novoId} tipoFixo="empresa" inicial={form} atual={dados?.entidades.find(e=>e.id===(form.id||form.novoId))} cadastros={dados?.cadastros||[]} titulares={dados?.titulares||[]} ocupado={ocupado} erroExterno={erro} aoSalvar={salvar} aoRecarregar={carregar} aoFechar={()=>setForm(null)}/></JanelaFormulario>}
    {cadastro&&<CadastroEmpresaLicitacoes sessao={sessao} {...cadastro} aoSalvo={terminouCadastro} aoFechar={()=>{setCadastro(null);void carregar().catch(()=>{});}}/>}
  </section>;
}
