import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Plus, Search, Printer, Building2, Boxes, Wallet, AlertTriangle, Camera, LayoutGrid, List, ArrowUpRight, Pencil, Trash2, RefreshCw, Tag, ChevronLeft, ChevronRight, X} from 'lucide-react';
import {lerBens, lerSetores, salvarBem, removerBem, salvarSetor, removerSetor, semearSetores} from '../services/patrimonio.js';
import {resumoFotos, listarFotos} from '../services/fotos.js';
import {calcPatrimonio, SETORES_PADRAO, SITUACOES, idadeEmAnos} from '../lib/calc/patrimonio.js';
import {FILTROS_INICIAIS, filtrarInventario, pendenciasBem, bensParaImpressao, ordenarPendencias} from '../lib/calc/inventario.js';
import {moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo} from '../lib/format.js';
import {CarregandoModulo, ErroModulo, AvisoAtualizacao} from '../components/ui.jsx';
import JanelaFormulario from '../components/JanelaFormulario.jsx';
import FotosPatrimonio from '../components/FotosPatrimonio.jsx';
import {FormBem, FormSetor} from '../components/patrimonio/Formularios.jsx';
import './patrimonio.css';

const VAZIO = {id:'', codigo:'', setorSigla:'', nomeGenerico:'', descricaoTecnica:'', nf:'', dataAquisicao:'', valor:'', situacao:'uso', observacao:'', responsavel:'', motivoSemNota:''};
const SETOR_VAZIO = {id:'', sigla:'', nome:'', area:''};
const POR_PAGINA = 12;
const rotuloSituacao = b => (SITUACOES[b.situacao] || SITUACOES.uso).rotulo;
const nomeSetor = (b, setores) => setores.find(s => s.sigla === b.setorSigla)?.nome || 'Setor a definir';

function CapaBem({bem, quantidade, revisao}) {
  const [url, setUrl] = useState('');
  const [falhou, setFalhou] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    let vivo = true;
    setUrl(''); setFalhou(false);
    if (!quantidade) return;
    // Só busca imagens das fichas visíveis, nunca baixa todo o acervo.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      listarFotos(bem.id).then(f => {if(vivo) setUrl(f[0]?.url || '');}).catch(() => {if(vivo) setFalhou(true);});
    }, {rootMargin:'100px'});
    observer.observe(ref.current);
    return () => {vivo=false; observer.disconnect();};
  }, [bem.id, quantidade, revisao]);
  return <div ref={ref} className="pat-cover">
    {url && !falhou ? <img src={url} alt={bem.nomeGenerico} loading="lazy" onError={()=>setFalhou(true)}/> : <div className="pat-cover-empty"><Camera size={28}/><span>{falhou ? 'Abra a ficha para rever as fotos' : quantidade ? 'Foto do equipamento' : quantidade === undefined ? 'Fotos não conferidas' : 'Adicione uma foto'}</span></div>}
    {quantidade > 0 && <span className="pat-photo-count"><Camera size={13}/>{quantidade}</span>}
  </div>;
}
function Situacao({bem}) {return <span className={`pat-status pat-status-${bem.situacao || 'uso'}`}>{rotuloSituacao(bem)}</span>;}
function Indicador({titulo,valor,descricao,icone:Icone,aoClicar,ativo}) {
  return <button className={`pat-metric ${ativo?'is-active':''}`} onClick={aoClicar}><span className="pat-metric-top">{titulo}<Icone size={19}/></span><strong>{valor}</strong><span>{descricao}</span></button>;
}
function Impressao({tipo,bens,setores,contexto,aoVoltar}) {
  return <div className="pat-print">
    <div className="sem-impressao pat-print-toolbar"><button className="btn-ghost" onClick={aoVoltar}><ChevronLeft size={18}/>Voltar ao inventário</button><button className="btn-primary" onClick={()=>window.print()}><Printer size={18}/>Imprimir / salvar PDF</button><p>Confira a prévia abaixo. Na impressão, escolha “Salvar como PDF” para guardar o relatório.</p></div>
    {tipo==='etiquetas' ? <div className="pat-labels">{bens.map(b=><div className="pat-label" key={b.id}><small>IMPRESILK · PATRIMÔNIO</small><strong>{b.codigo || 'Sem etiqueta'}</strong><span>{b.nomeGenerico}</span><small>{b.descricaoTecnica || nomeSetor(b,setores)}</small></div>)}</div> : <>
      <header className="pat-report-title"><span>IMPRESILK · CONTROLE PATRIMONIAL</span><h1>Inventário de bens</h1><p>{contexto}</p><p>Emitido em {dataLonga(ymdLocal(new Date()))} · {bens.length} {bens.length===1?"bem":"bens"} · Valor de aquisição informado: {moedaCheia(bens.reduce((s,b)=>s+b.valor,0))}</p><small>Valores de aquisição, sem depreciação ou avaliação de mercado. {bens.filter(b=>!(b.valor>0)).length} {bens.filter(b=>!(b.valor>0)).length===1?'bem sem valor informado':'bens sem valor informado'}.</small></header>
      <div className="pat-table-wrap"><table className="pat-table pat-report-table"><thead><tr><th>Etiqueta / bem</th><th>Setor / situação</th><th>Compra / nota fiscal</th><th>Valor pago</th><th>Conferência</th></tr></thead><tbody>{bens.map(b=><tr key={b.id}><td><strong>{b.codigo || 'Sem etiqueta'} · {b.nomeGenerico}</strong><small>{b.descricaoTecnica}</small></td><td>{nomeSetor(b,setores)}<small>{rotuloSituacao(b)}</small></td><td>{b.dataAquisicao?dataLonga(b.dataAquisicao):'Data não informada'}<small>{b.nf?`NF ${b.nf}`:b.motivoSemNota || 'Nota não informada'}</small></td><td>{b.valor>0?moedaCheia(b.valor):'Não informado'}</td><td><span className="pat-check-print">□ Conferido</span></td></tr>)}</tbody></table></div>
      <p className="pat-report-sign">Conferido por: __________________________________ Data: ____ / ____ / ______</p>
    </>}
  </div>;
}

export default function Patrimonio() {
  const [bens,setBens]=useState(null), [setoresMapa,setSetoresMapa]=useState(null), [erro,setErro]=useState(null);
  const [atualizando,setAtualizando]=useState(false), [msg,setMsg]=useState(null), [salvando,setSalvando]=useState(false);
  const [filtros,setFiltros]=useState(FILTROS_INICIAIS), [aba,setAba]=useState('inventario'), [modo,setModo]=useState('cards');
  const [pagina,setPagina]=useState(1), [selecionados,setSelecionados]=useState([]), [janela,setJanela]=useState(null), [impressao,setImpressao]=useState(null);
  const [fotos,setFotos]=useState(null), [erroFotos,setErroFotos]=useState(''), [revisaoFotos,setRevisaoFotos]=useState(0);
  const [fotoOcupada,setFotoOcupada]=useState(false);
  const pedido=useRef(0), idNovo=useRef(null);
  const hoje=ymdLocal(new Date());
  const carregarFotos=useCallback(async()=>{
    try {const resultado=await resumoFotos();setFotos(resultado);setErroFotos('');setRevisaoFotos(n=>n+1);}
    catch(e){setFotos(null);setErroFotos(e.message);}
  },[]);
  const carregar=useCallback(async()=>{
    const atual=++pedido.current;setAtualizando(true);
    try {const [b,s]=await Promise.all([lerBens(),lerSetores()]);if(atual!==pedido.current)return;setBens(b);setSetoresMapa(s);setErro(null);}
    catch(e){if(atual===pedido.current)setErro(e.message);}
    finally{if(atual===pedido.current)setAtualizando(false);}
  },[]);
  useEffect(()=>{carregar();carregarFotos();const controle=pedido;return()=>{controle.current++;};},[carregar,carregarFotos]);
  const vm=useMemo(()=>calcPatrimonio(bens||{},setoresMapa||{},hoje),[bens,setoresMapa,hoje]);
  const pendentes=useMemo(()=>vm.ativos.filter(b=>pendenciasBem(b,vm.setores,fotos).length),[vm,fotos]);
  const visiveis=useMemo(()=>filtrarInventario(vm.bens,vm.setores,fotos,filtros),[vm,fotos,filtros]);
  const paginas=Math.max(1,Math.ceil(visiveis.length/POR_PAGINA)), atual=Math.min(pagina,paginas);
  const nestaPagina=visiveis.slice((atual-1)*POR_PAGINA,atual*POR_PAGINA);
  const selecionadosVisiveis=visiveis.filter(b=>selecionados.includes(b.id));
  const mudouFiltro=Object.keys(FILTROS_INICIAIS).some(k=>k!=='ordem'&&filtros[k]!==FILTROS_INICIAIS[k]);
  const detalhe=janela?.tipo==='detalhe'?vm.bens.find(b=>b.id===janela.bem.id):null;
  const filtrar=(patch)=>{setFiltros(f=>({...f,...patch}));setPagina(1);setSelecionados([]);};
  const recortar=(patch)=>{setFiltros({...FILTROS_INICIAIS,...patch});setPagina(1);setSelecionados([]);setAba('inventario');};
  const selecionar=id=>setSelecionados(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
  const abrirBem=(b=null)=>{setMsg(null);idNovo.current=b?.id||`pat-${crypto.randomUUID()}`;setJanela({tipo:'bem',bem:b?{...VAZIO,...b,valor:paraCampo(b.valor)}:{...VAZIO,setorSigla:vm.setores.some(s=>s.sigla===filtros.setor)?filtros.setor:'',dataAquisicao:''}});};
  const abrirSetor=(s=null)=>{setMsg(null);setJanela({tipo:'setor',setor:s?{...SETOR_VAZIO,...s}:SETOR_VAZIO});};
  const fechar=()=>{if(!salvando&&!fotoOcupada){setJanela(null);setMsg(null);}};
  const verDetalhe=b=>{setMsg(null);setJanela({tipo:'detalhe',bem:b});};

  async function gravarBem(f) {
    if(!f.setorSigla||!f.nomeGenerico.trim())return setMsg({erro:true,texto:'Informe o tipo do bem e o setor.'});
    if(paraNumero(f.valor)<0)return setMsg({erro:true,texto:'O valor pago não pode ser negativo.'});
    if(f.dataAquisicao>hoje)return setMsg({erro:true,texto:'A aquisição não pode estar no futuro.'});
    setSalvando(true);setMsg(null);
    try {
      const id=f.id||idNovo.current;
      const dados={...(f.codigo?{codigo:f.codigo}:{}),setorSigla:f.setorSigla,nomeGenerico:f.nomeGenerico.trim(),descricaoTecnica:f.descricaoTecnica.trim(),nf:f.nf.trim(),motivoSemNota:String(f.motivoSemNota||'').trim(),responsavel:String(f.responsavel||'').trim(),dataAquisicao:f.dataAquisicao,valor:paraNumero(f.valor),situacao:f.situacao,observacao:f.observacao.trim()};
      const novo=await salvarBem(id,dados);setBens(novo);setJanela({tipo:'detalhe',bem:{...novo[id],id}});
      setMsg({texto:f.id?'Alterações salvas.':`Bem cadastrado. A etiqueta é ${novo[id]?.codigo||'gerada pelo servidor'}. Você já pode adicionar as fotos.`});
    }catch(e){setMsg({erro:true,texto:e.message});}finally{setSalvando(false);}
  }
  async function apagarBem(b) {
    if(!window.confirm(`Excluir o cadastro ${b.codigo||b.nomeGenerico}?\n\nPara um bem vendido ou descartado, edite a situação para “Baixado” e preserve o histórico.`))return;
    setSalvando(true);setMsg(null);
    try{await removerBem(b.id);setBens(m=>{const n={...m};delete n[b.id];return n;});setJanela(null);setSelecionados(ids=>ids.filter(id=>id!==b.id));setMsg({texto:'Cadastro removido.'});}
    catch(e){setMsg({erro:true,texto:e.message});}finally{setSalvando(false);}
  }
  async function gravarSetor(f) {
    if(!f.sigla||!f.nome.trim())return setMsg({erro:true,texto:'Informe a sigla e o nome do setor.'});
    if(vm.setores.some(s=>s.sigla===f.sigla&&s.id!==f.id))return setMsg({erro:true,texto:'Essa sigla já está em uso.'});
    setSalvando(true);setMsg(null);
    try{setSetoresMapa(await salvarSetor(f.id||`set-${f.sigla.toLowerCase()}`,{sigla:f.sigla,nome:f.nome.trim(),area:f.area.trim()}));setJanela(null);setMsg({texto:'Setor salvo.'});}
    catch(e){setMsg({erro:true,texto:e.message});}finally{setSalvando(false);}
  }
  async function apagarSetor(s) {
    // Também protege o setor dos bens baixados: o histórico continua vinculado.
    if(vm.bens.some(b=>b.setorSigla===s.sigla))return setMsg({erro:true,texto:'Este setor possui bens, inclusive no histórico. Transfira os bens antes de remover o setor.'});
    if(!window.confirm(`Remover o setor ${s.sigla} — ${s.nome}?`))return;
    setSalvando(true);
    try{await removerSetor(s.id);setSetoresMapa(m=>{const n={...m};delete n[s.id];return n;});setMsg({texto:'Setor removido.'});}
    catch(e){setMsg({erro:true,texto:e.message});}finally{setSalvando(false);}
  }
  async function semear() {
    if(!window.confirm(`Cadastrar os ${SETORES_PADRAO.length} setores da Impresilk?`))return;
    setSalvando(true);
    try{setSetoresMapa(await semearSetores(SETORES_PADRAO));setAba('setores');setMsg({texto:'Setores cadastrados.'});}
    catch(e){setMsg({erro:true,texto:e.message});}finally{setSalvando(false);}
  }
  const imprimir=tipo=>{
    const lista=bensParaImpressao(visiveis,selecionados);
    const contexto=[selecionadosVisiveis.length?'Bens selecionados':'Recorte do inventário',filtros.busca&&`Busca: ${filtros.busca}`,filtros.setor&&(vm.setores.find(s=>s.sigla===filtros.setor)?.nome||'Sem setor'),filtros.tipo,filtros.situacao==='ativos'?'Bens ativos':filtros.situacao==='todos'?'Inclui baixados':SITUACOES[filtros.situacao]?.rotulo,filtros.pendencia&&`Pendência: ${filtros.pendencia}`].filter(Boolean).join(' · ');
    setImpressao({tipo,bens:lista,contexto});
  };
  if(erro&&bens===null)return <ErroModulo mensagem={erro} aoTentar={carregar}/>;
  if(bens===null||setoresMapa===null)return <CarregandoModulo/>;
  if(impressao)return <Impressao {...impressao} setores={vm.setores} aoVoltar={()=>setImpressao(null)}/>;

  return <div className="patrimonio-page">
    <AvisoAtualizacao erro={erro} aoTentar={carregar}/>
    <header className="pat-heading"><div><span className="pat-eyebrow">EQUIPAMENTOS E BENS DA EMPRESA</span><h1>Patrimônio</h1><p>Saiba o que temos, onde está e o que precisa de atenção.</p></div><div className="pat-actions"><button className="btn-ghost" disabled={atualizando||salvando} onClick={()=>{carregar();carregarFotos();}} aria-label="Atualizar patrimônio"><RefreshCw size={18} className={atualizando?'animate-spin':''}/></button><button className="btn-primary" disabled={!vm.setores.length} onClick={()=>abrirBem()}><Plus size={18}/>Novo bem</button></div></header>
    <div className="pat-metrics">
      <Indicador titulo="Bens ativos" valor={numero(vm.kpis.quantos)} descricao={`${vm.kpis.baixados} no histórico de baixas`} icone={Boxes} aoClicar={()=>recortar({})}/>
      <Indicador titulo="Investido em bens" valor={moedaCheia(vm.kpis.valor)} descricao={`${moedaCheia(vm.kpis.noAno)} adquiridos em ${hoje.slice(0,4)}`} icone={Wallet} aoClicar={()=>recortar({ordem:'valor'})}/>
      <Indicador titulo="Em manutenção" valor={vm.ativos.filter(b=>b.situacao==='manutencao').length} descricao="Ver equipamentos indisponíveis" icone={Building2} ativo={filtros.situacao==='manutencao'} aoClicar={()=>recortar({situacao:'manutencao'})}/>
      <Indicador titulo="Cadastros a completar" valor={pendentes.length} descricao={fotos===null?'Conferência parcial: fotos pendentes':'Fotos, localização e documentação'} icone={AlertTriangle} ativo={aba==='pendencias'} aoClicar={()=>{setAba('pendencias');setMsg(null);}}/>
    </div>
    {msg&&!janela&&<p className={`pat-notice ${msg.erro?'is-error':''}`} role={msg.erro?'alert':'status'}>{msg.texto}</p>}
    {erroFotos&&<div className="pat-notice is-error" role="alert">Não foi possível conferir as fotos. A consulta dos bens continua disponível. <button onClick={carregarFotos} className="btn-ghost">Tentar novamente</button></div>}
    {!vm.setores.length&&<div className="pat-empty"><Building2 size={30}/><h2>Organize os primeiros setores</h2><p>O setor identifica a localização e gera a etiqueta de cada bem.</p><div className="pat-actions"><button className="btn-primary" disabled={salvando} onClick={semear}>Usar os setores da Impresilk</button><button className="btn-outline" onClick={()=>abrirSetor()}>Criar setor</button></div></div>}
    <nav className="pat-tabs" aria-label="Visões do patrimônio">{[['inventario','Inventário'],['setores','Por setor'],['pendencias','Pendências']].map(([id,nome])=><button key={id} aria-current={aba===id?'page':undefined} onClick={()=>{setAba(id);setMsg(null);}}>{nome}{id==='pendencias'&&<span>{pendentes.length}</span>}</button>)}</nav>

    {aba==='inventario'&&<>
      <div className="pat-toolbar">
        <div className="pat-search"><Search size={19}/><input className="input" aria-label="Buscar bens" placeholder="Etiqueta, equipamento, série, nota ou responsável…" value={filtros.busca} onChange={e=>filtrar({busca:e.target.value})}/>{filtros.busca&&<button onClick={()=>filtrar({busca:''})} aria-label="Limpar busca"><X size={17}/></button>}</div>
        <div className="pat-filters">
          <label>Setor<select className="input" value={filtros.setor} onChange={e=>filtrar({setor:e.target.value})}><option value="">Todos os setores</option>{vm.setores.map(s=><option key={s.id} value={s.sigla}>{s.nome}</option>)}<option value="__sem_setor">Sem setor válido</option></select></label>
          <label>Tipo<select className="input" value={filtros.tipo} onChange={e=>filtrar({tipo:e.target.value})}><option value="">Todos os tipos</option>{[...new Set(vm.bens.map(b=>b.nomeGenerico).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(n=><option key={n}>{n}</option>)}</select></label>
          <label>Situação<select className="input" value={filtros.situacao} onChange={e=>filtrar({situacao:e.target.value})}><option value="ativos">Ativos (sem baixados)</option>{Object.entries(SITUACOES).map(([id,s])=><option key={id} value={id}>{s.rotulo}</option>)}<option value="todos">Todas, incluindo baixados</option></select></label>
          <label>Ordenar por<select className="input" value={filtros.ordem} onChange={e=>filtrar({ordem:e.target.value})}><option value="codigo">Etiqueta</option><option value="nome">Nome do equipamento</option><option value="valor">Maior valor</option><option value="recentes">Compra mais recente</option></select></label>
        </div>
        {mudouFiltro&&<div className="pat-active-filters"><span>{filtros.pendencia?`Cadastros a completar${filtros.pendencia==='foto'?' · sem foto':filtros.pendencia==='valor'?' · sem valor':''}`:'Filtros aplicados'}</span><button onClick={()=>recortar({})}>Limpar filtros <X size={14}/></button></div>}
      </div>
      <div className="pat-list-heading"><div><h2>Seu inventário <span>{visiveis.length}</span></h2><p>{moedaCheia(visiveis.reduce((s,b)=>s+b.valor,0))} em valores informados neste recorte</p></div><div className="pat-actions"><div className="pat-view-switch" aria-label="Apresentação do inventário"><button aria-label="Ver em cartões" aria-pressed={modo==='cards'} onClick={()=>setModo('cards')}><LayoutGrid size={18}/></button><button aria-label="Ver em lista" aria-pressed={modo==='lista'} onClick={()=>setModo('lista')}><List size={18}/></button></div><button className="btn-outline" disabled={!visiveis.length} onClick={()=>imprimir('inventario')}><Printer size={16}/>Relatório / PDF</button></div></div>
      {!!visiveis.length&&<div className="pat-selection"><label><input type="checkbox" checked={nestaPagina.every(b=>selecionados.includes(b.id))} onChange={e=>setSelecionados(ids=>e.target.checked?[...new Set([...ids,...nestaPagina.map(b=>b.id)])]:ids.filter(id=>!nestaPagina.some(b=>b.id===id)))}/>Selecionar esta página</label><span>{selecionadosVisiveis.length?`${selecionadosVisiveis.length} selecionados`:'Selecione bens para imprimir só as etiquetas desejadas'}</span><button className="btn-ghost" onClick={()=>imprimir('etiquetas')}><Tag size={16}/>{selecionadosVisiveis.length?`Etiquetas (${selecionadosVisiveis.length})`:'Etiquetas do recorte'}</button>{!!selecionadosVisiveis.length&&<button className="btn-ghost" onClick={()=>setSelecionados([])}>Limpar seleção</button>}</div>}
      {!visiveis.length?<div className="pat-empty"><Boxes size={36}/><h2>{vm.bens.length?'Nenhum bem neste recorte':'Vamos montar seu inventário'}</h2><p>{vm.bens.length?'Experimente outro setor, situação ou termo de busca.':'Cadastre um equipamento, identifique o setor e adicione suas fotos.'}</p><button className="btn-outline" disabled={!vm.bens.length&&!vm.setores.length} onClick={()=>vm.bens.length?recortar({}):abrirBem()}>{vm.bens.length?'Limpar filtros':'Cadastrar primeiro bem'}</button></div>:modo==='cards'?<div className="pat-grid">{nestaPagina.map(b=><article key={b.id} className={`pat-asset ${selecionados.includes(b.id)?'is-selected':''}`}>
        <label className="pat-select-asset"><input type="checkbox" aria-label={`Selecionar ${b.codigo||b.nomeGenerico}`} checked={selecionados.includes(b.id)} onChange={()=>selecionar(b.id)}/></label>
        <button className="pat-open-cover" onClick={()=>verDetalhe(b)} aria-label={`Abrir fotos e ficha de ${b.codigo||b.nomeGenerico}`}><CapaBem bem={b} quantidade={fotos===null?undefined:(fotos[b.id]||0)} revisao={revisaoFotos}/></button>
        <div className="pat-asset-body"><div className="pat-asset-meta"><span>{b.codigo||'Sem etiqueta'}</span><Situacao bem={b}/></div><button className="pat-asset-name" onClick={()=>verDetalhe(b)}>{b.nomeGenerico||'Bem sem nome'}<ArrowUpRight size={17}/></button><p className="pat-asset-description">{b.descricaoTecnica||'Adicione marca, modelo e número de série.'}</p><p className="pat-location"><Building2 size={15}/>{nomeSetor(b,vm.setores)}</p><footer><div><small>Valor de aquisição</small><strong>{b.valor>0?moedaCheia(b.valor):'A informar'}</strong></div><button className="btn-ghost" onClick={()=>verDetalhe(b)}>Ver ficha</button></footer></div>
      </article>)}</div>:<div className="pat-table-wrap"><table className="pat-table"><thead><tr><th>Seleção</th><th>Bem / etiqueta</th><th>Setor</th><th>Situação</th><th>Valor de aquisição</th><th>Ficha</th></tr></thead><tbody>{nestaPagina.map(b=><tr key={b.id}><td><input type="checkbox" aria-label={`Selecionar ${b.codigo||b.nomeGenerico}`} checked={selecionados.includes(b.id)} onChange={()=>selecionar(b.id)}/></td><td><button className="pat-table-name" onClick={()=>verDetalhe(b)}>{b.nomeGenerico}</button><small>{b.codigo||'Sem etiqueta'} · {b.descricaoTecnica||'Sem descrição'}</small></td><td>{nomeSetor(b,vm.setores)}</td><td><Situacao bem={b}/></td><td>{b.valor>0?moedaCheia(b.valor):'A informar'}</td><td><button className="btn-ghost" aria-label={`Ver ficha de ${b.codigo||b.nomeGenerico}`} onClick={()=>verDetalhe(b)}><ArrowUpRight size={18}/></button></td></tr>)}</tbody></table></div>}
      {!!visiveis.length&&<div className="pat-pagination"><span>{(atual-1)*POR_PAGINA+1}–{Math.min(atual*POR_PAGINA,visiveis.length)} de {visiveis.length} bens</span><div><button className="btn-outline" disabled={atual===1} aria-label="Página anterior" onClick={()=>setPagina(atual-1)}><ChevronLeft size={18}/></button><span>{atual} / {paginas}</span><button className="btn-outline" disabled={atual===paginas} aria-label="Próxima página" onClick={()=>setPagina(atual+1)}><ChevronRight size={18}/></button></div></div>}
    </>}
    {aba==='setores'&&<><div className="pat-list-heading"><div><h2>Onde estão os bens</h2><p>Veja a distribuição do patrimônio e abra o inventário de cada setor.</p></div><button className="btn-primary" onClick={()=>abrirSetor()}><Plus size={17}/>Novo setor</button></div><div className="pat-sector-grid">{vm.porSetor.map(s=><article className="pat-sector" key={s.id}><div className="pat-sector-top"><span className="pat-sector-code">{s.sigla}</span><div className="pat-actions"><button className="btn-ghost" onClick={()=>abrirSetor(s)} aria-label={`Editar setor ${s.nome}`}><Pencil size={16}/></button><button className="btn-ghost" disabled={salvando} onClick={()=>apagarSetor(s)} aria-label={`Remover setor ${s.nome}`}><Trash2 size={16}/></button></div></div><h3>{s.nome}</h3><p>{s.area||'Área não informada'}</p><div className="pat-sector-value"><strong>{moedaCheia(s.valor)}</strong><span>{s.quantos} {s.quantos===1?"bem ativo":"bens ativos"}</span></div><button className="pat-sector-open" onClick={()=>recortar({setor:s.sigla})}>Ver bens do setor <ArrowUpRight size={17}/></button></article>)}</div>{vm.semSetor.length>0&&<div className="pat-notice"><span>{vm.semSetor.length} {vm.semSetor.length===1?'bem precisa':'bens precisam'} de um setor válido.</span><button className="btn-ghost" onClick={()=>recortar({setor:'__sem_setor'})}>Ver e corrigir</button></div>}</>}
    {aba==='pendencias'&&<><div className="pat-list-heading"><div><h2>Complete o inventário</h2><p>Primeiro etiqueta, setor e responsável; depois documentação, valor e foto. Pendência de cadastro não significa defeito.</p></div><button className="btn-outline" onClick={()=>recortar({pendencia:'todas',ordem:'valor'})}>Ver no inventário</button></div><div className="pat-pending-shortcuts"><button className="btn-outline" disabled={fotos===null} onClick={()=>recortar({pendencia:'foto'})}><Camera size={17}/>Sem foto</button><button className="btn-outline" onClick={()=>recortar({pendencia:'valor'})}><Wallet size={17}/>Sem valor de aquisição</button></div>{!pendentes.length?<div className="pat-empty"><h3>{fotos===null?'Cadastro conferido; fotos ainda não verificadas':'Cadastros completos'}</h3><p>{fotos===null?'Tente atualizar a conferência das fotos.':'Os bens ativos têm etiqueta, setor, responsável, documentação, valor e foto.'}</p></div>:<div className="pat-pending-list">{ordenarPendencias(pendentes,vm.setores,fotos).map(b=><article key={b.id}><div><span className="pat-eyebrow">{b.codigo||'Sem etiqueta'} · {nomeSetor(b,vm.setores)}</span><h3>{b.nomeGenerico}</h3><div className="pat-missing">{pendenciasBem(b,vm.setores,fotos).map(p=><span key={p.id}>{p.nome}{["etiqueta","setor","responsavel"].includes(p.id)?" · essencial":p.id==="foto"?" · identificação visual":""}</span>)}</div></div><div><strong>{b.valor>0?moedaCheia(b.valor):'Valor a informar'}</strong><button className="btn-outline" onClick={()=>verDetalhe(b)}>Completar ficha</button></div></article>)}</div>}</>}
    {janela&&<JanelaFormulario titulo={janela.tipo==='bem'?(janela.bem.id?'Editar bem':'Novo bem'):janela.tipo==='setor'?(janela.setor.id?'Editar setor':'Novo setor'):(detalhe?.nomeGenerico||'Ficha do bem')} ocupado={salvando||fotoOcupada} aoFechar={fechar}>
      {msg&&<p className={`pat-notice ${msg.erro?'is-error':''}`} role={msg.erro?'alert':'status'}>{msg.texto}</p>}
      {janela.tipo==='bem'&&<FormBem key={janela.bem.id||'novo'} inicial={janela.bem} setores={vm.setores} salvando={salvando} aoSalvar={gravarBem} aoFechar={fechar}/>}
      {janela.tipo==='setor'&&<FormSetor key={janela.setor.id||'novo'} inicial={janela.setor} salvando={salvando} aoSalvar={gravarSetor} aoFechar={fechar}/>}
      {detalhe&&<div className="pat-detail"><div className="pat-detail-heading"><div><span className="pat-detail-code"><Tag size={17}/>{detalhe.codigo||'Etiqueta não informada'}</span><Situacao bem={detalhe}/></div><button className="btn-primary" disabled={fotoOcupada} onClick={()=>abrirBem(detalhe)}><Pencil size={16}/>Editar ficha</button></div><p className="pat-detail-description">{detalhe.descricaoTecnica||'Descrição técnica não informada.'}</p><dl className="pat-facts">{[['Setor',nomeSetor(detalhe,vm.setores)],['Valor de aquisição',detalhe.valor>0?moedaCheia(detalhe.valor):'Não informado'],['Aquisição',detalhe.dataAquisicao?`${dataLonga(detalhe.dataAquisicao)}${idadeEmAnos(detalhe.dataAquisicao,hoje)!==null?` · ${idadeEmAnos(detalhe.dataAquisicao,hoje)} ano(s)`:''}`:'Data não informada'],['Nota fiscal',detalhe.nf||detalhe.motivoSemNota||'Não informada'],['Responsável pelo cadastro',detalhe.responsavel||'Não informado'],['Observações',detalhe.observacao||'Nenhuma observação']].map(([t,v])=><div key={t}><dt>{t}</dt><dd>{v}</dd></div>)}</dl><FotosPatrimonio bemId={detalhe.id} nome={detalhe.nomeGenerico} aoAlterar={carregarFotos} aoOcupado={setFotoOcupada}/><div className="pat-detail-footer"><button className="btn-outline" disabled={salvando||fotoOcupada} onClick={()=>{setJanela(null);setImpressao({tipo:'etiquetas',bens:[detalhe]});}}><Printer size={16}/>Imprimir etiqueta</button><button className="btn-ghost" disabled={salvando||fotoOcupada} onClick={()=>apagarBem(detalhe)}><Trash2 size={16}/>Excluir cadastro</button></div><p className="pat-footnote">Vendeu ou descartou? Em “Editar ficha”, altere a situação para “Baixado” e registre o motivo nas observações.</p></div>}
    </JanelaFormulario>}
  </div>;
}
