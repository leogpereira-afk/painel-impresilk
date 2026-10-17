import SilkHeader from '../components/SilkHeader.jsx';
import AreaDoBem, {BensDaArea} from '../components/patrimonio/AreaDoBem.jsx';
import Telefonia from '../components/patrimonio/Telefonia.jsx';
import SegurancaPatrimonio from '../components/patrimonio/Seguranca.jsx';
import Incendio from '../components/patrimonio/Incendio.jsx';
import {PessoasRHProvider,usePessoasRH,comNomeRH} from '../components/patrimonio/PessoasRH.jsx';
import {podeAbrir} from '../lib/sessao.js';
import {abasPatrimonio,abaPatrimonioAtual,secaoEstruturaInicial} from '../lib/calc/navegacao-patrimonio.js';
import HistoricoBem from "../components/patrimonio/HistoricoBem.jsx";
import VinculoDoBem from "../components/patrimonio/VinculoDoBem.jsx";
import {lerFichasDoPatrimonio} from "../services/vinculo-patrimonio.js";
import {vinculosDosBens,rotuloLigadoA,rotuloVinculoServidor} from "../lib/calc/vinculo-patrimonio.js";
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Plus, Search, Printer, Building2, Boxes, Wallet, AlertTriangle, Camera, LayoutGrid, List, ArrowUpRight, Pencil, Trash2, RefreshCw, Tag, ChevronLeft, ChevronRight, X, Phone, Archive, Wrench, BedDouble, Car, Cog, Shield, FireExtinguisher, Link2} from 'lucide-react';
import {lerBens, lerSetores, salvarBem, removerBem, salvarSetor, removerSetor, semearSetores} from '../services/patrimonio.js';
import {resumoFotos, listarFotos} from '../services/fotos.js';
import {calcPatrimonio, SETORES_PADRAO, SITUACOES, idadeEmAnos} from '../lib/calc/patrimonio.js';
import {FILTROS_INICIAIS, filtrarInventario, pendenciasBem, bensParaImpressao, ordenarPendencias} from '../lib/calc/inventario.js';
import {moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo} from '../lib/format.js';
import {CarregandoModulo, ErroModulo, AvisoAtualizacao} from '../components/ui.jsx';
import JanelaFormulario from '../components/JanelaFormulario.jsx';
import FotosPatrimonio from '../components/FotosPatrimonio.jsx';
import {FormBem, FormSetor} from '../components/patrimonio/Formularios.jsx';
import ControlesPatrimonio, {AtualizacaoPatrimonio} from '../components/patrimonio/Controles.jsx';
import VinculosSetor from '../components/patrimonio/VinculosSetor.jsx';
import EquipamentosPatrimonio from '../components/patrimonio/Equipamentos.jsx';
import EstruturaPatrimonio from '../components/patrimonio/Estrutura.jsx';
import {useParamNavegavel} from '../hooks/useParamNavegavel.js';
import {CONTROLES} from '../lib/calc/controles-patrimonio.js';
import './patrimonio.css';

const VAZIO = {id:'', codigo:'', setorSigla:'', areaPatrimonio:'', nomeGenerico:'', descricaoTecnica:'', nf:'', dataAquisicao:'', valor:'', situacao:'uso', observacao:'', responsavel:'', motivoSemNota:''};
const SETOR_VAZIO = {id:'', numero:'', sigla:'', nome:'', area:''};
const POR_PAGINA = 12;
const ABAS = [['estrutura','Estrutura',Building2],['telefonia','Celulares e Ramais',Phone],['seguranca','Segurança',Shield],['incendio','Prevenção contra incêndio',FireExtinguisher],['armarios','Armários',Archive],['ferramentas','Caixas de ferramentas',Wrench],['camas','Camas',BedDouble],['carros','Carros',Car],['maquinas','Máquinas',Cog],['outros','Ferramentas & Outros',Wrench],['setores','Setores',Building2],['inventario','Inventário',Boxes]];
const rotuloSituacao = b => (SITUACOES[b.situacao] || SITUACOES.uso).rotulo;
const nomeSetor = (b, setores) => setores.find(s => s.sigla === b.setorSigla)?.nome || 'Setor a definir';

function CapaBem({bem, quantidade, revisao, pequena = false}) {
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
  // Na lista: a mesma foto (buscada só quando a linha aparece), em miniatura.
  if (pequena) return <div ref={ref} className="pat-thumb">{url && !falhou ? <img src={url} alt="" loading="lazy" onError={()=>setFalhou(true)}/> : <Camera size={16} aria-hidden="true"/>}</div>;
  return <div ref={ref} className="pat-cover">
    {url && !falhou ? <img src={url} alt={bem.nomeGenerico} loading="lazy" onError={()=>setFalhou(true)}/> : <div className="pat-cover-empty"><Camera size={28}/><span>{falhou ? 'Abra a ficha para rever as fotos' : quantidade ? 'Foto do equipamento' : quantidade === undefined ? 'Fotos não conferidas' : 'Adicione uma foto'}</span></div>}
    {quantidade > 0 && <span className="pat-photo-count"><Camera size={13}/>{quantidade}</span>}
  </div>;
}
// Uma linha só, com reticências: o cartão do inventário tem 160 px no celular.
function LinhaVinculo({vinculo}) {
  if(!vinculo||vinculo.estado==='sem-ficha')return null;
  const conferir=vinculo.estado==='a-conferir',texto=conferir?'Vínculo a conferir':`Ligado a ${rotuloLigadoA(vinculo)}`;
  return <p className={`pat-linked ${conferir?'is-alert':''}`} title={texto}>{conferir?<AlertTriangle size={14} aria-hidden="true"/>:<Link2 size={14} aria-hidden="true"/>}<span>{texto}</span></p>;
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
      <div className="pat-table-wrap"><table className="pat-table pat-report-table"><thead><tr><th>Etiqueta / bem</th><th>Setor / situação</th><th>Compra / nota fiscal</th><th>Valor pago</th><th>Conferência</th></tr></thead><tbody>{bens.map(b=><tr key={b.id}><td><strong>{b.codigo || 'Sem etiqueta'} · {b.nomeGenerico}</strong><small>{b.descricaoTecnica}</small><AtualizacaoPatrimonio registro={b}/></td><td>{nomeSetor(b,setores)}<small>{rotuloSituacao(b)}</small></td><td>{b.dataAquisicao?dataLonga(b.dataAquisicao):'Data não informada'}<small>{b.nf?`NF ${b.nf}`:b.motivoSemNota || 'Nota não informada'}</small></td><td>{b.valor>0?moedaCheia(b.valor):'Não informado'}</td><td><span className="pat-check-print">□ Conferido</span></td></tr>)}</tbody></table></div>
      <p className="pat-report-sign">Conferido por: __________________________________ Data: ____ / ____ / ______</p>
    </>}
  </div>;
}

export default function Patrimonio(){return <PessoasRHProvider><PatrimonioConteudo/></PessoasRHProvider>;}
function PatrimonioConteudo() {
  const {pessoas}=usePessoasRH();
  const veInventario=podeAbrir('inventario-valores');
  const permitidas=abasPatrimonio(podeAbrir);
  const abasVisiveis=ABAS.filter(([id])=>permitidas.includes(id));
  const [bens,setBens]=useState(null), [setoresMapa,setSetoresMapa]=useState(null), [erro,setErro]=useState(null);
  const [atualizando,setAtualizando]=useState(false), [msg,setMsg]=useState(null), [salvando,setSalvando]=useState(false);
  const [filtros,setFiltros]=useState(FILTROS_INICIAIS), [modo,setModo]=useState('cards');
  const legadas=[...(permitidas.includes('telefonia')?['ramais','celulares']:[]),...(permitidas.includes('estrutura')?['computadores']:[])];
  // Trocar de aba tira o ?item= do "Abrir ficha": a aba nova abre com a lista inteira.
  const [abaEscolhida,setAba]=useParamNavegavel('aba',permitidas[0]||'',veInventario?[...permitidas,...legadas,'pendencias']:[...permitidas,...legadas],{limpar:['item']});
  const aba=abaPatrimonioAtual(abaEscolhida);
  const [pendenciaAberta,setPendenciaAberta]=useState(null);
  const [pagina,setPagina]=useState(1), [selecionados,setSelecionados]=useState([]), [janela,setJanela]=useState(null), [impressao,setImpressao]=useState(null);
  const [fotos,setFotos]=useState(null), [erroFotos,setErroFotos]=useState(''), [revisaoFotos,setRevisaoFotos]=useState(0);
  const [fotoOcupada,setFotoOcupada]=useState(false);
  // Fichas de cima (Carros, Máquinas, Estrutura...) para o bloco Ligado a. Erro
  // próprio, como as fotos: os bens continuam consultáveis sem elas.
  const [fichas,setFichas]=useState(null), [erroFichas,setErroFichas]=useState('');
  // Ligar ou desfazer pelo bloco Ligado a muda a ficha que a aba de trás guarda
  // na própria lista: a revisão remonta a aba, que relê a lista e as versões.
  const [revisaoAbas,setRevisaoAbas]=useState(0);
  const pedido=useRef(0), idNovo=useRef(null), pedidoFichas=useRef(0), avisoJanela=useRef(null);
  const hoje=ymdLocal(new Date());
  const carregarFotos=useCallback(async()=>{
    if(!veInventario)return;
    try {const resultado=await resumoFotos();setFotos(resultado);setErroFotos('');setRevisaoFotos(n=>n+1);}
    catch(e){setFotos(null);setErroFotos(e.message);}
  },[veInventario]);
  const carregarFichas=useCallback(async()=>{
    if(!veInventario)return;
    const n=++pedidoFichas.current;
    try {const r=await lerFichasDoPatrimonio();if(n===pedidoFichas.current){setFichas(r);setErroFichas('');}}
    catch(e){if(n===pedidoFichas.current){setFichas(null);setErroFichas(e.message);}}
  },[veInventario]);
  const carregar=useCallback(async()=>{
    const atual=++pedido.current;setAtualizando(true);
    try {const [b,s]=await Promise.all([lerBens(),lerSetores()]);if(atual!==pedido.current)return;setBens(b);setSetoresMapa(s);setErro(null);}
    catch(e){if(atual===pedido.current)setErro(e.message);}
    finally{if(atual===pedido.current)setAtualizando(false);}
  },[]);
  useEffect(()=>{carregar();carregarFotos();carregarFichas();const controle=pedido,controleFichas=pedidoFichas;return()=>{controle.current++;controleFichas.current++;};},[carregar,carregarFotos,carregarFichas]);
  const vm=useMemo(()=>calcPatrimonio(Object.fromEntries(Object.entries(bens||{}).map(([id,b])=>[id,comNomeRH(b,pessoas)])),setoresMapa||{},hoje),[bens,setoresMapa,hoje,pessoas]);
  const vinculos=useMemo(()=>fichas?vinculosDosBens(vm.bens,fichas.itens,fichas.vinculosOcultos):null,[vm,fichas]);
  const pendentes=useMemo(()=>vm.ativos.filter(b=>pendenciasBem(b,vm.setores,fotos,vinculos).length),[vm,fotos,vinculos]);
  const visiveis=useMemo(()=>filtrarInventario(vm.bens,vm.setores,fotos,filtros,vinculos),[vm,fotos,filtros,vinculos]);
  const semFicha=vinculos?vm.ativos.filter(b=>vinculos[b.id]?.estado==='sem-ficha').length:null;
  const paginas=Math.max(1,Math.ceil(visiveis.length/POR_PAGINA)), atual=Math.min(pagina,paginas);
  const nestaPagina=visiveis.slice((atual-1)*POR_PAGINA,atual*POR_PAGINA);
  const selecionadosVisiveis=visiveis.filter(b=>selecionados.includes(b.id));
  const mudouFiltro=Object.keys(FILTROS_INICIAIS).some(k=>k!=='ordem'&&filtros[k]!==FILTROS_INICIAIS[k]);
  const detalhe=veInventario&&janela?.tipo==='detalhe'?vm.bens.find(b=>b.id===janela.bem.id):null;
  const filtrar=(patch)=>{setFiltros(f=>({...f,...patch}));setPagina(1);setSelecionados([]);};
  const recortar=(patch)=>{setFiltros({...FILTROS_INICIAIS,...patch});setPagina(1);setSelecionados([]);setAba('inventario');};
  const selecionar=id=>setSelecionados(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
  const abrirBem=(b=null)=>{setMsg(null);idNovo.current=b?.id||crypto.randomUUID();setJanela({tipo:'bem',bem:b?{...VAZIO,...b,valor:paraCampo(b.valor)}:{...VAZIO,areaPatrimonio:aba==='outros'?'outros':'',setorSigla:vm.setores.some(s=>s.sigla===filtros.setor)?filtros.setor:'',dataAquisicao:''}});};
  const abrirSetor=(s=null)=>{setMsg(null);setJanela({tipo:'setor',setor:s?{...SETOR_VAZIO,...s}:SETOR_VAZIO});};
  const fechar=()=>{if(!salvando&&!fotoOcupada){setJanela(null);setMsg(null);}};
  const verDetalhe=b=>{if(!veInventario)return;setMsg(null);setJanela({tipo:'detalhe',bem:b});};
  const recarregarVinculos=()=>Promise.all([carregar(),carregarFichas()]);
  const atualizarFichaDoBem=async()=>{await recarregarVinculos();setRevisaoAbas(n=>n+1);};
  // A resposta do vínculo já traz a ficha e o bem gravados: troca só os dois.
  const aoMudouVinculo=({ficha,bem})=>{
    if(ficha)setFichas(f=>f?{...f,itens:[...f.itens.filter(i=>i.id!==ficha.id),ficha]}:f);
    if(bem?.id){const {id,...registro}=bem;setBens(m=>m?{...m,[id]:registro}:m);}
    setRevisaoAbas(n=>n+1);
  };
  // Histórico de manutenção pela ficha ligada; sem as fichas, o legado do bem.
  // Ficha retirada: os serviços da origem gravada, como antes. Segurança oculta
  // ou vínculo em conflito: nulo, a ficha existe mas não aparece aqui.
  const fichaDoHistorico=b=>{
    if(!vinculos)return erroFichas?(b.origemAtivoId||''):undefined;
    const v=vinculos[b.id];
    if(v?.estado==='ligado')return v.oculta?null:v.ficha.id;
    if(v?.estado==='a-conferir'&&v.motivo==='ficha-retirada')return b.origemAtivoId||null;
    return v?.estado==='a-conferir'?null:'';
  };

  async function gravarBem(f) {
    if(!f.setorSigla||!f.nomeGenerico.trim())return setMsg({erro:true,texto:'Informe o tipo do bem e o setor.'});
    if(paraNumero(f.valor)<0)return setMsg({erro:true,texto:'O valor pago não pode ser negativo.'});
    if(f.dataAquisicao>hoje)return setMsg({erro:true,texto:'A aquisição não pode estar no futuro.'});
    setSalvando(true);setMsg(null);
    try {
      const id=f.id||idNovo.current;
      const dados={...(f.codigo?{codigo:f.codigo}:{}),setorSigla:f.setorSigla,areaPatrimonio:f.areaPatrimonio||'',nomeGenerico:f.nomeGenerico.trim(),descricaoTecnica:f.descricaoTecnica.trim(),nf:f.nf.trim(),motivoSemNota:String(f.motivoSemNota||'').trim(),responsavel:String(f.responsavel||'').trim(),responsavelId:f.responsavelId||'',dataAquisicao:f.dataAquisicao,valor:paraNumero(f.valor),situacao:f.situacao,observacao:f.observacao.trim()};
      const novo=await salvarBem(id,dados);setBens(novo);setJanela({tipo:'detalhe',bem:{...novo[id],id}});
      setMsg({texto:f.id?'Alterações salvas.':`Bem cadastrado. A etiqueta é ${novo[id]?.codigo||'gerada pelo servidor'}. Você já pode adicionar as fotos.`});
    }catch(e){setMsg({erro:true,texto:e.message});}finally{setSalvando(false);}
  }
  // O botão Excluir fica no fim da janela; no celular a mensagem do topo ficaria
  // fora da vista. Leva a recusa até onde a pessoa está olhando.
  const recusarNaJanela=texto=>{setMsg({erro:true,texto});requestAnimationFrame(()=>avisoJanela.current?.scrollIntoView({block:'center'}));};
  async function apagarBem(b) {
    // O servidor confere de novo; aqui só evita o pedido que ele recusaria.
    const vinculo=vinculos?.[b.id];
    if(vinculo&&vinculo.estado!=='sem-ficha')return recusarNaJanela(`Este bem está ligado a ${rotuloVinculoServidor(vinculo.ligacoes[0])}. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.`);
    if(!window.confirm(`Excluir o cadastro ${b.codigo||b.nomeGenerico}?\n\nPara um bem vendido ou descartado, edite a situação para “Baixado” e preserve o histórico.`))return;
    setSalvando(true);setMsg(null);
    try{await removerBem(b.id);setBens(m=>{const n={...m};delete n[b.id];return n;});setJanela(null);setSelecionados(ids=>ids.filter(id=>id!==b.id));setMsg({texto:'Cadastro removido.'});}
    catch(e){recusarNaJanela(e.message);}finally{setSalvando(false);}
  }
  async function gravarSetor(f) {
    if(!f.sigla||!f.nome.trim())return setMsg({erro:true,texto:'Informe a sigla e o nome do setor.'});
    if(vm.setores.some(s=>s.sigla===f.sigla&&s.id!==f.id))return setMsg({erro:true,texto:'Essa sigla já está em uso.'});
    setSalvando(true);setMsg(null);
    try{setSetoresMapa(await salvarSetor(f.id||`set-${f.sigla.toLowerCase()}`,{numero:(f.numero||'').trim(),sigla:f.sigla,nome:f.nome.trim(),area:f.area.trim()}));setJanela(null);setMsg({texto:'Setor salvo.'});}
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
    const contexto=[selecionadosVisiveis.length?'Bens selecionados':'Recorte do inventário',filtros.busca&&`Busca: ${filtros.busca}`,filtros.setor&&(vm.setores.find(s=>s.sigla===filtros.setor)?.nome||'Sem setor'),filtros.tipo,filtros.situacao==='ativos'?'Bens ativos':filtros.situacao==='todos'?'Inclui baixados':SITUACOES[filtros.situacao]?.rotulo,filtros.pendencia&&`Pendência: ${filtros.pendencia}`,filtros.vinculo==='sem-ficha'&&'Bens sem ficha ligada'].filter(Boolean).join(' · ');
    setImpressao({tipo,bens:lista,contexto});
  };
  async function salvarAreaBem(bem,areaPatrimonio) {
    setSalvando(true);setMsg(null);
    try {
      const novo=await salvarBem(bem.id,{areaPatrimonio});
      if(novo[bem.id]?.areaPatrimonio!==areaPatrimonio)throw new Error('O servidor não confirmou a área. Atualize e tente novamente.');
      setBens(novo);setMsg({texto:'Área do patrimônio salva.'});
    } catch(e) {setMsg({erro:true,texto:e.message});}
    finally {setSalvando(false);}
  }
  async function vincularBem(bem,setor) {
    if(!bem)return false;setSalvando(true);setMsg(null);
    try{setBens(await salvarBem(bem.id,{setorSigla:setor.sigla}));setMsg({texto:'Bem vinculado ao setor.'});return true;}
    catch(e){setMsg({erro:true,texto:e.message});return false;}finally{setSalvando(false);}
  }
  if(erro&&bens===null)return <ErroModulo mensagem={erro} aoTentar={carregar}/>;
  if(bens===null||setoresMapa===null)return <CarregandoModulo/>;
  if(impressao?.tipo==='setores')return <div className="pat-print"><div className="sem-impressao pat-print-toolbar"><button className="btn-ghost" onClick={()=>setImpressao(null)}>Voltar aos setores</button><button className="btn-primary" onClick={()=>window.print()}><Printer size={18}/>Imprimir / salvar PDF</button></div><header className="pat-report-title"><span>IMPRESILK · PATRIMÔNIO</span><h1>Setores e bens vinculados</h1><p>Emitido em {new Date().toLocaleString('pt-BR')}</p></header>{vm.setores.map(s=><section className="pat-sector-report" key={s.id}><h2>{s.numero?`${s.numero} · `:''}{s.sigla} — {s.nome}</h2><AtualizacaoPatrimonio registro={s}/><ul>{vm.bens.filter(b=>b.setorSigla===s.sigla).map(b=><li key={b.id}><strong>{b.codigo} · {b.nomeGenerico}</strong> · {rotuloSituacao(b)}<AtualizacaoPatrimonio registro={b}/></li>)}</ul>{!vm.bens.some(b=>b.setorSigla===s.sigla)&&<p>Sem bens vinculados.</p>}</section>)}</div>;
  if(impressao)return <Impressao {...impressao} setores={vm.setores} aoVoltar={()=>setImpressao(null)}/>;

  return <div className="patrimonio-page">
    <AvisoAtualizacao erro={erro} aoTentar={carregar}/>
    <SilkHeader titulo="Patrimônio" descricao="Saiba o que temos, onde está e o que precisa de atenção." contexto="EQUIPAMENTOS E BENS DA EMPRESA" tom="petroleo" acao={<div className="pat-actions"><button className="btn-ghost" disabled={atualizando||salvando} onClick={()=>{carregar();carregarFotos();carregarFichas();}} aria-label="Atualizar patrimônio"><RefreshCw size={18} className={atualizando?'animate-spin':''}/></button>{['inventario','pendencias','outros'].includes(aba)&&<button className="btn-primary" disabled={!vm.setores.length} onClick={()=>abrirBem()}><Plus size={18}/>Novo bem</button>}</div>}/>
    {['inventario','pendencias'].includes(aba)&&<div className="pat-metrics">
      <Indicador titulo="Bens ativos" valor={numero(vm.kpis.quantos)} descricao={`${vm.kpis.baixados} no histórico de baixas`} icone={Boxes} aoClicar={()=>recortar({})}/>
      <Indicador titulo="Investido em bens" valor={moedaCheia(vm.kpis.valor)} descricao={`${moedaCheia(vm.kpis.noAno)} adquiridos em ${hoje.slice(0,4)}`} icone={Wallet} aoClicar={()=>recortar({ordem:'valor'})}/>
      <Indicador titulo="Em manutenção" valor={vm.ativos.filter(b=>b.situacao==='manutencao').length} descricao="Ver equipamentos indisponíveis" icone={Building2} ativo={filtros.situacao==='manutencao'} aoClicar={()=>recortar({situacao:'manutencao'})}/>
      <Indicador titulo="Cadastros a completar" valor={pendentes.length} descricao={fotos===null?'Conferência parcial: fotos pendentes':'Fotos, localização e documentação'} icone={AlertTriangle} ativo={aba==='pendencias'} aoClicar={()=>{setAba('pendencias');setMsg(null);}}/>
    </div>}
    {msg&&!janela&&<p className={`pat-notice ${msg.erro?'is-error':''}`} role={msg.erro?'alert':'status'}>{msg.texto}</p>}
    {erroFotos&&<div className="pat-notice is-error" role="alert">Não foi possível conferir as fotos. A consulta dos bens continua disponível. <button onClick={carregarFotos} className="btn-ghost">Tentar novamente</button></div>}
    {erroFichas&&['inventario','pendencias'].includes(aba)&&<div className="pat-notice is-error" role="alert">Não foi possível conferir as fichas ligadas. A consulta dos bens continua disponível. <button onClick={carregarFichas} className="btn-ghost">Tentar novamente</button></div>}
    {podeAbrir('patrimonio')&&!vm.setores.length&&<div className="pat-empty"><Building2 size={30}/><h2>Organize os primeiros setores</h2><p>O setor identifica a localização e gera a etiqueta de cada bem.</p><div className="pat-actions"><button className="btn-primary" disabled={salvando} onClick={semear}>Usar os setores da Impresilk</button><button className="btn-outline" onClick={()=>abrirSetor()}>Criar setor</button></div></div>}
    <nav className="pat-tabs" aria-label="Visões do patrimônio">{abasVisiveis.map(([id,nome,Icone])=><button key={id} aria-current={(aba===id||(id==='inventario'&&aba==='pendencias'))?'page':undefined} onClick={()=>{setAba(id);setMsg(null);}}><Icone size={16} aria-hidden="true"/>{nome}{id==='pendencias'&&<span>{pendentes.length}</span>}</button>)}</nav>

    {veInventario&&['inventario','pendencias'].includes(aba)&&<nav className="pat-tabs" aria-label="Visões do inventário"><button aria-current={aba==='inventario'?'page':undefined} onClick={()=>setAba('inventario')}>Bens</button><button aria-current={aba==='pendencias'?'page':undefined} onClick={()=>setAba('pendencias')}>Pendências · {pendentes.length}</button></nav>}
    {veInventario&&['estrutura','outros'].includes(aba)&&<BensDaArea key={aba} area={aba} bens={vm.bens} setores={vm.setores} vinculos={vinculos} erro={erroFichas} aoTentar={carregarFichas} aoVerBem={verDetalhe}/>}
    {aba==='telefonia'&&<Telefonia key={`${aba}-${revisaoAbas}`} bens={vm.bens} setores={vm.setores} secaoInicial={abaEscolhida==='celulares'?'celulares':'ramais'} aoVerBem={veInventario?verDetalhe:undefined} aoMudarVinculo={recarregarVinculos}/>}
    {aba==='seguranca'&&<SegurancaPatrimonio key={`${aba}-${revisaoAbas}`} bens={vm.bens} setores={vm.setores} aoVerBem={veInventario?verDetalhe:undefined} aoMudarVinculo={recarregarVinculos}/>}
    {aba==='incendio'&&<Incendio key={`${aba}-${revisaoAbas}`} bens={vm.bens} setores={vm.setores} aoVerBem={veInventario?verDetalhe:undefined} aoMudarVinculo={recarregarVinculos}/>}
    {CONTROLES[aba]&&<ControlesPatrimonio key={aba} tipo={aba}/>}
    {aba==='estrutura'&&<EstruturaPatrimonio key={`${aba}-${revisaoAbas}`} bens={vm.bens} setores={vm.setores} aoVerBem={veInventario?verDetalhe:undefined} aoMudarVinculo={recarregarVinculos} secaoInicial={secaoEstruturaInicial(abaEscolhida)}/>}
    {['carros','maquinas'].includes(aba)&&<EquipamentosPatrimonio key={`${aba}-${revisaoAbas}`} tipo={aba==='carros'?'veiculo':'maquina'} vinculos={veInventario?vinculos:null} erroVinculos={erroFichas} aoTentarVinculos={carregarFichas} bens={vm.bens} setores={vm.setores} aoVerBem={veInventario?verDetalhe:undefined} aoMudarVinculo={recarregarVinculos}/>}
    {aba==='inventario'&&<>
      <div className="pat-toolbar">
        <div className="pat-search"><Search size={19}/><input className="input" aria-label="Buscar bens" placeholder="Etiqueta, equipamento, série, nota ou responsável…" value={filtros.busca} onChange={e=>filtrar({busca:e.target.value})}/>{filtros.busca&&<button onClick={()=>filtrar({busca:''})} aria-label="Limpar busca"><X size={17}/></button>}</div>
        <div className="pat-filters">
          <label>Setor<select className="input" value={filtros.setor} onChange={e=>filtrar({setor:e.target.value})}><option value="">Todos os setores</option>{vm.setores.map(s=><option key={s.id} value={s.sigla}>{s.nome}</option>)}<option value="__sem_setor">Sem setor válido</option></select></label>
          <label>Tipo<select className="input" value={filtros.tipo} onChange={e=>filtrar({tipo:e.target.value})}><option value="">Todos os tipos</option>{[...new Set(vm.bens.map(b=>b.nomeGenerico).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(n=><option key={n}>{n}</option>)}</select></label>
          <label>Situação<select className="input" value={filtros.situacao} onChange={e=>filtrar({situacao:e.target.value})}><option value="ativos">Ativos (sem baixados)</option>{Object.entries(SITUACOES).map(([id,s])=><option key={id} value={id}>{s.rotulo}</option>)}<option value="todos">Todas, incluindo baixados</option></select></label>
          <label>Ordenar por<select className="input" value={filtros.ordem} onChange={e=>filtrar({ordem:e.target.value})}><option value="codigo">Etiqueta</option><option value="nome">Nome do equipamento</option><option value="valor">Maior valor</option><option value="recentes">Compra mais recente</option></select></label>
        </div>
        {mudouFiltro&&<div className="pat-active-filters"><span>{filtros.vinculo==='sem-ficha'?'Bens sem ficha ligada':filtros.pendencia?`Cadastros a completar${filtros.pendencia==='foto'?' · sem foto':filtros.pendencia==='valor'?' · sem valor':''}`:'Filtros aplicados'}</span><button onClick={()=>recortar({})}>Limpar filtros <X size={14}/></button></div>}
      </div>
      <div className="pat-list-heading"><div><h2>Seu inventário <span>{visiveis.length}</span></h2><p>{moedaCheia(visiveis.reduce((s,b)=>s+b.valor,0))} em valores informados neste recorte</p></div><div className="pat-actions"><div className="pat-view-switch" aria-label="Apresentação do inventário"><button aria-label="Ver em cartões" aria-pressed={modo==='cards'} onClick={()=>setModo('cards')}><LayoutGrid size={18}/></button><button aria-label="Ver em lista" aria-pressed={modo==='lista'} onClick={()=>setModo('lista')}><List size={18}/></button></div><button className="btn-outline" disabled={!visiveis.length} onClick={()=>imprimir('inventario')}><Printer size={16}/>Relatório / PDF</button></div></div>
      {!!visiveis.length&&<div className="pat-selection"><label><input type="checkbox" checked={nestaPagina.every(b=>selecionados.includes(b.id))} onChange={e=>setSelecionados(ids=>e.target.checked?[...new Set([...ids,...nestaPagina.map(b=>b.id)])]:ids.filter(id=>!nestaPagina.some(b=>b.id===id)))}/>Selecionar esta página</label><span>{selecionadosVisiveis.length?`${selecionadosVisiveis.length} selecionados`:'Selecione bens para imprimir só as etiquetas desejadas'}</span><button className="btn-ghost" onClick={()=>imprimir('etiquetas')}><Tag size={16}/>{selecionadosVisiveis.length?`Etiquetas (${selecionadosVisiveis.length})`:'Etiquetas do recorte'}</button>{!!selecionadosVisiveis.length&&<button className="btn-ghost" onClick={()=>setSelecionados([])}>Limpar seleção</button>}</div>}
      {!visiveis.length?<div className="pat-empty"><Boxes size={36}/><h2>{vm.bens.length?'Nenhum bem neste recorte':'Vamos montar seu inventário'}</h2><p>{vm.bens.length?'Experimente outro setor, situação ou termo de busca.':'Cadastre um equipamento, identifique o setor e adicione suas fotos.'}</p><button className="btn-outline" disabled={!vm.bens.length&&!vm.setores.length} onClick={()=>vm.bens.length?recortar({}):abrirBem()}>{vm.bens.length?'Limpar filtros':'Cadastrar primeiro bem'}</button></div>:modo==='cards'?<div className="pat-grid">{nestaPagina.map(b=><article key={b.id} className={`pat-asset ${selecionados.includes(b.id)?'is-selected':''}`}>
        <label className="pat-select-asset"><input type="checkbox" aria-label={`Selecionar ${b.codigo||b.nomeGenerico}`} checked={selecionados.includes(b.id)} onChange={()=>selecionar(b.id)}/></label>
        <button className="pat-open-cover" onClick={()=>verDetalhe(b)} aria-label={`Abrir fotos e ficha de ${b.codigo||b.nomeGenerico}`}><CapaBem bem={b} quantidade={fotos===null?undefined:(fotos[b.id]||0)} revisao={revisaoFotos}/></button>
        <div className="pat-asset-body"><div className="pat-asset-meta"><span>{b.codigo||'Sem etiqueta'}</span><Situacao bem={b}/></div><button className="pat-asset-name" onClick={()=>verDetalhe(b)}>{b.nomeGenerico||'Bem sem nome'}<ArrowUpRight size={17}/></button><p className="pat-asset-description">{b.descricaoTecnica||'Adicione marca, modelo e número de série.'}</p><p className="pat-location"><Building2 size={15}/>{nomeSetor(b,vm.setores)}</p><LinhaVinculo vinculo={vinculos?.[b.id]}/><AtualizacaoPatrimonio registro={b}/><footer><div><small>Valor de aquisição</small><strong>{b.valor>0?moedaCheia(b.valor):'A informar'}</strong></div><button className="btn-ghost" onClick={()=>verDetalhe(b)}>Ver ficha</button></footer></div>
      </article>)}</div>:<div className="pat-table-wrap"><table className="pat-table"><thead><tr><th>Seleção</th><th>Bem / etiqueta</th><th>Setor</th><th>Situação</th><th>Valor de aquisição</th><th>Ficha</th></tr></thead><tbody>{nestaPagina.map(b=><tr key={b.id}><td><input type="checkbox" aria-label={`Selecionar ${b.codigo||b.nomeGenerico}`} checked={selecionados.includes(b.id)} onChange={()=>selecionar(b.id)}/></td><td><div className="pat-table-bem"><button className="pat-thumb-btn" onClick={()=>verDetalhe(b)} aria-label={`Abrir fotos e ficha de ${b.codigo||b.nomeGenerico}`}><CapaBem bem={b} quantidade={fotos===null?undefined:(fotos[b.id]||0)} revisao={revisaoFotos} pequena/></button><div><button className="pat-table-name" onClick={()=>verDetalhe(b)}>{b.nomeGenerico}</button><small>{b.codigo||'Sem etiqueta'} · {b.descricaoTecnica||'Sem descrição'}</small><LinhaVinculo vinculo={vinculos?.[b.id]}/><AtualizacaoPatrimonio registro={b}/></div></div></td><td>{nomeSetor(b,vm.setores)}</td><td><Situacao bem={b}/></td><td>{b.valor>0?moedaCheia(b.valor):'A informar'}</td><td><button className="btn-ghost" aria-label={`Ver ficha de ${b.codigo||b.nomeGenerico}`} onClick={()=>verDetalhe(b)}><ArrowUpRight size={18}/></button></td></tr>)}</tbody></table></div>}
      {!!visiveis.length&&<div className="pat-pagination"><span>{(atual-1)*POR_PAGINA+1}–{Math.min(atual*POR_PAGINA,visiveis.length)} de {visiveis.length} bens</span><div><button className="btn-outline" disabled={atual===1} aria-label="Página anterior" onClick={()=>setPagina(atual-1)}><ChevronLeft size={18}/></button><span>{atual} / {paginas}</span><button className="btn-outline" disabled={atual===paginas} aria-label="Próxima página" onClick={()=>setPagina(atual+1)}><ChevronRight size={18}/></button></div></div>}
    </>}
    {aba==='setores'&&<><div className="pat-list-heading"><div><h2>Setores e seus bens</h2><p>Cadastre os setores e vincule os bens que ficam em cada local.</p></div><div className="pat-actions"><button className="btn-outline" disabled={!vm.setores.length} onClick={()=>setImpressao({tipo:'setores'})}><Printer size={17}/>Relatório / PDF</button><button className="btn-primary" onClick={()=>abrirSetor()}><Plus size={17}/>Novo setor</button></div></div><div className="pat-sector-grid">{vm.porSetor.map(s=><article className="pat-sector" key={s.id}><div className="pat-sector-top"><span className="pat-sector-code">{s.sigla}</span><div className="pat-actions"><button className="btn-ghost" onClick={()=>abrirSetor(s)} aria-label={`Editar setor ${s.nome}`}><Pencil size={16}/></button><button className="btn-ghost" disabled={salvando} onClick={()=>apagarSetor(s)} aria-label={`Remover setor ${s.nome}`}><Trash2 size={16}/></button></div></div><h3>{s.numero?`${s.numero} · `:''}{s.nome}</h3><AtualizacaoPatrimonio registro={s}/><p>{s.area||'Área não informada'}</p><div className="pat-sector-value">{veInventario&&<strong>{moedaCheia(s.valor)}</strong>}<span>{s.quantos} {s.quantos===1?"bem ativo":"bens ativos"}</span></div>{veInventario&&<><div className="pat-actions"><button className="btn-outline" onClick={()=>{setMsg(null);setJanela({tipo:'vinculos',setor:s});}}>Vincular bens</button><button className="btn-ghost" onClick={()=>setImpressao({tipo:'inventario',bens:vm.bens.filter(b=>b.setorSigla===s.sigla),contexto:`Setor ${s.nome} · Inclui baixados`})}><Printer size={16}/>PDF do setor</button></div><button className="pat-sector-open" onClick={()=>recortar({setor:s.sigla})}>Ver bens do setor <ArrowUpRight size={17}/></button></>}</article>)}</div>{veInventario&&vm.semSetor.length>0&&<div className="pat-notice"><span>{vm.semSetor.length} {vm.semSetor.length===1?'bem precisa':'bens precisam'} de um setor válido.</span><button className="btn-ghost" onClick={()=>recortar({setor:'__sem_setor'})}>Ver e corrigir</button></div>}</>}
    {aba==='pendencias'&&<><div className="pat-list-heading"><div><h2>Complete o inventário</h2><p>Primeiro etiqueta, setor e responsável; depois documentação, valor e foto. Pendência de cadastro não significa defeito.</p></div><button className="btn-outline" onClick={()=>recortar({pendencia:'todas',ordem:'valor'})}>Ver no inventário</button></div><div className="pat-pending-shortcuts"><button className="btn-outline" disabled={fotos===null} onClick={()=>recortar({pendencia:'foto'})}><Camera size={17}/>Sem foto</button><button className="btn-outline" onClick={()=>recortar({pendencia:'valor'})}><Wallet size={17}/>Sem valor de aquisição</button>{veInventario&&<button className="btn-outline" disabled={!vinculos} onClick={()=>recortar({vinculo:'sem-ficha'})}><Link2 size={17}/>{semFicha===null?'Sem ficha ligada':`Sem ficha ligada · ${semFicha}`}</button>}</div>{!pendentes.length?<div className="pat-empty"><h3>{fotos===null?'Cadastro conferido; fotos ainda não verificadas':'Cadastros completos'}</h3><p>{fotos===null?'Tente atualizar a conferência das fotos.':'Os bens ativos têm etiqueta, setor, responsável, documentação, valor e foto.'}</p></div>:<div className="pat-pending-list">{ordenarPendencias(pendentes,vm.setores,fotos,vinculos).map(b=><article key={b.id} className={pendenciaAberta===b.id?"is-editing-pending":""}><div><span className="pat-eyebrow">{b.codigo||'Sem etiqueta'} · {nomeSetor(b,vm.setores)}</span><h3>{b.nomeGenerico}</h3><LinhaVinculo vinculo={vinculos?.[b.id]}/><div className="pat-missing">{pendenciasBem(b,vm.setores,fotos,vinculos).map(p=><span key={p.id}>{p.nome}{["etiqueta","setor","responsavel"].includes(p.id)?" · essencial":p.id==="foto"?" · identificação visual":""}</span>)}</div></div><div><strong>{b.valor>0?moedaCheia(b.valor):'Valor a informar'}</strong><button className="btn-outline" onClick={()=>{setPendenciaAberta(b.id);verDetalhe(b);}}>Completar cadastro</button></div></article>)}</div>}</>}
    {janela&&<JanelaFormulario titulo={janela.tipo==='bem'?(janela.bem.id?'Editar bem':'Novo bem'):janela.tipo==='setor'?(janela.setor.id?'Editar setor':'Novo setor'):janela.tipo==='vinculos'?`Bens do setor · ${janela.setor.nome}`:(detalhe?.nomeGenerico||'Ficha do bem')} ocupado={salvando||fotoOcupada} aoFechar={fechar}>
      {msg&&<p ref={avisoJanela} className={`pat-notice ${msg.erro?'is-error':''}`} role={msg.erro?'alert':'status'}>{msg.texto}</p>}
      {janela.tipo==='vinculos'&&<VinculosSetor setor={janela.setor} bens={vm.bens} setores={vm.setores} salvando={salvando} aoVincular={vincularBem}/>}
      {janela.tipo==='bem'&&<FormBem destacarPendencias={!!janela.bem.id} key={janela.bem.id||'novo'} inicial={janela.bem} setores={vm.setores} salvando={salvando} aoSalvar={gravarBem} aoFechar={fechar}/>}
      {janela.tipo==='setor'&&<FormSetor key={janela.setor.id||'novo'} inicial={janela.setor} salvando={salvando} aoSalvar={gravarSetor} aoFechar={fechar}/>}
      {detalhe&&<div className="pat-detail"><div className="pat-detail-heading"><div><span className="pat-detail-code"><Tag size={17}/>{detalhe.codigo||'Etiqueta não informada'}</span><Situacao bem={detalhe}/></div><button className="btn-primary" disabled={fotoOcupada} onClick={()=>abrirBem(detalhe)}><Pencil size={16}/>Editar ficha</button></div>{pendenciasBem(detalhe,vm.setores,fotos,vinculos).length>0&&<div className="pat-notice"><strong>Falta completar:</strong> {pendenciasBem(detalhe,vm.setores,fotos,vinculos).map(p=>p.nome).join(" · ")}<button className="btn-outline" disabled={fotoOcupada} onClick={()=>abrirBem(detalhe)}>Preencher campos destacados</button></div>}<p className="pat-detail-description">{detalhe.descricaoTecnica||'Descrição técnica não informada.'}</p><dl className="pat-facts">{[['Setor',nomeSetor(detalhe,vm.setores)],['Valor de aquisição',detalhe.valor>0?moedaCheia(detalhe.valor):'Não informado'],['Aquisição',detalhe.dataAquisicao?`${dataLonga(detalhe.dataAquisicao)}${idadeEmAnos(detalhe.dataAquisicao,hoje)!==null?` · ${idadeEmAnos(detalhe.dataAquisicao,hoje)} ano(s)`:''}`:'Data não informada'],['Nota fiscal',detalhe.nf||detalhe.motivoSemNota||'Não informada'],['Responsável pelo cadastro',detalhe.responsavel||'Não informado'],['Observações',detalhe.observacao||'Nenhuma observação']].map(([t,v])=><div key={t} className={pendenciasBem(detalhe,vm.setores,fotos,vinculos).some(p=>p.id===({Setor:"setor","Valor de aquisição":"valor","Nota fiscal":"documento","Responsável pelo cadastro":"responsavel"}[t]))?"pat-field-pending":""}><dt>{t}</dt><dd>{v}</dd></div>)}</dl><AreaDoBem key={`area-${detalhe.id}-${detalhe.areaPatrimonio||''}`} bem={detalhe} salvando={salvando||fotoOcupada} aoSalvar={salvarAreaBem}/><VinculoDoBem key={`vinculo-${detalhe.id}`} bem={detalhe} vinculo={vinculos?.[detalhe.id]} fichas={fichas?.itens||[]} bens={vm.bens} setores={vm.setores} abasPermitidas={permitidas} carregando={fichas===null&&!erroFichas} erro={erroFichas} aoTentar={carregarFichas} aoAtualizar={atualizarFichaDoBem} aoMudou={aoMudouVinculo} aoAbrirFicha={()=>{setJanela(null);setMsg(null);}}/><HistoricoBem key={detalhe.id} bem={detalhe} fichaId={fichaDoHistorico(detalhe)}/><FotosPatrimonio bemId={detalhe.id} nome={detalhe.nomeGenerico} aoAlterar={carregarFotos} aoOcupado={setFotoOcupada}/><div className="pat-detail-footer"><button className="btn-outline" disabled={salvando||fotoOcupada} onClick={()=>{setJanela(null);setImpressao({tipo:'etiquetas',bens:[detalhe]});}}><Printer size={16}/>Imprimir etiqueta</button><button className="btn-ghost" disabled={salvando||fotoOcupada} onClick={()=>apagarBem(detalhe)}><Trash2 size={16}/>Excluir cadastro</button></div><p className="pat-footnote">Vendeu ou descartou? Em “Editar ficha”, altere a situação para “Baixado” e registre o motivo nas observações.</p></div>}
    </JanelaFormulario>}
  </div>;
}
