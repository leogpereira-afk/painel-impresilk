import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {FileCheck2,Car,ShieldCheck,Wrench,Plus,Printer,RefreshCw,Search,Users,Trash2,ClipboardList,ArrowLeft} from 'lucide-react';
import {useAbaNavegavel} from '../hooks/useAbaNavegavel.js';
import {getSessao,podeAbrir} from '../lib/sessao.js';
import {PessoasRHProvider,usePessoasRH} from '../components/patrimonio/PessoasRH.jsx';
import JanelaFormulario from '../components/JanelaFormulario.jsx';
import {PageTitle,CarregandoModulo,ErroModulo,AvisoAtualizacao,Empty} from '../components/ui.jsx';
import * as api from '../services/documentos.js';
import {ABAS_DOCUMENTOS,calcDocumentos,controlesDoBem,ehVeiculo,filtrarDocumentos,nomeTitular,situacaoRequisito} from '../lib/calc/documentos.js';
import {dataLonga,moeda,ymdLocal} from '../lib/format.js';
import FormControle,{novoControle} from '../components/documentos/FormControle.jsx';
import {FormTitular,FormRequisito} from '../components/documentos/FormCadastros.jsx';
import ListaDocumentos,{ListaVeiculos,ChipPrazo} from '../components/documentos/ListaDocumentos.jsx';
import '../components/documentos/documentos.css';

const ICONES={documento:FileCheck2,veiculo:Car,garantia:Wrench,seguro:ShieldCheck};
const STATUS={vencido:'Vencidos',urgente:'A vencer',futuro:'A iniciar',ok:'Em dia',sem:'Prazo não informado',semVencimento:'Sem vencimento',encerrado:'Encerrados / cancelados'};
const LISTA_VAZIA=[];
const INICIAL={busca:'',titularId:'',status:'',categoria:'',rh:''};
const texto=valor=>Array.isArray(valor)?valor.join(' · '):typeof valor==='object'&&valor?JSON.stringify(valor):String(valor??'');

export default function Ativos({sessao=getSessao()}={}) {
  const chaveSessao=JSON.stringify([sessao?.usuario,sessao?.master,sessao?.permissoes||[]]);
  const temDocumentos=podeAbrir('documentos',sessao);
  const [dadosLidos,setDadosLidos]=useState({chave:'',conteudo:null}),[falha,setFalha]=useState({chave:'',mensagem:''}),[consulta,setConsulta]=useState({chave:'',atualizando:false});
  const leitura=useRef(0);
  const sessaoAtual=useRef(chaveSessao);sessaoAtual.current=chaveSessao;
  const dados=temDocumentos&&dadosLidos.chave===chaveSessao?dadosLidos.conteudo:null;
  const erro=falha.chave===chaveSessao?falha.mensagem:'';
  const atualizando=consulta.chave===chaveSessao&&consulta.atualizando;
  const carregar=useCallback(async()=>{
    // Um formulário desmontado pode concluir uma operação depois da troca
    // de acesso; nem o recarregamento dele pertence à sessão atual.
    if(!temDocumentos||sessaoAtual.current!==chaveSessao)return;
    const pedido=++leitura.current,atual=()=>pedido===leitura.current&&sessaoAtual.current===chaveSessao;
    setConsulta({chave:chaveSessao,atualizando:true});
    try {
      const resposta=await api.listarDocumentos();if(!atual())return;
      if(!['itens','bens','titulares','requisitos','pessoas'].every(chave=>Array.isArray(resposta?.[chave])))throw new Error('Não foi possível conferir a lista completa de documentos. Atualize para tentar novamente.');
      setDadosLidos({chave:chaveSessao,conteudo:resposta});setFalha({chave:chaveSessao,mensagem:''});return resposta;
    } catch(e) {if(atual())setFalha({chave:chaveSessao,mensagem:e.message});}
    finally {if(atual())setConsulta({chave:chaveSessao,atualizando:false});}
  },[chaveSessao,temDocumentos]);
  const setDados=useCallback(valor=>{
    if(sessaoAtual.current!==chaveSessao)return;
    setDadosLidos(atual=>atual.chave===chaveSessao?{chave:chaveSessao,conteudo:typeof valor==='function'?valor(atual.conteudo):valor}:atual);
  },[chaveSessao]);
  useEffect(()=>{const contador=leitura;setDadosLidos({chave:chaveSessao,conteudo:null});void carregar();return()=>{contador.current++;};},[carregar,chaveSessao]);
  if(!dados)return erro?<ErroModulo mensagem={erro} aoTentar={carregar}/>:<CarregandoModulo/>;
  return <PessoasRHProvider key={chaveSessao} pessoasFornecidas={dados.pessoas||[]}><DocumentosConteudo key={chaveSessao} dados={dados} setDados={setDados} carregar={carregar} erroLeitura={erro} atualizando={atualizando}/></PessoasRHProvider>;
}

function DocumentosConteudo({dados,setDados,carregar,erroLeitura,atualizando}) {
  const {pessoas}=usePessoasRH();
  const [params,setParams]=useSearchParams();
  const alvo=params.get('item')||'';
  const alvoAplicado=useRef('');
  const [aba,setAba]=useAbaNavegavel('documento',['documento','veiculo','garantia','seguro','maquina']);
  const tipo=aba==='maquina'?'documento':aba;
  const [filtros,setFiltros]=useState(INICIAL),[janela,setJanela]=useState(null),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[relatorio,setRelatorio]=useState(null),[cadastros,setCadastros]=useState(false);
  const titulares=dados.titulares||LISTA_VAZIA,bens=dados.bens||LISTA_VAZIA,requisitos=dados.requisitos||LISTA_VAZIA;
  const bemAlvo=bens.find(b=>b.id===(params.get('bem')||alvo));
  const hoje=ymdLocal(new Date());
  const vm=useMemo(()=>calcDocumentos(dados.itens||[],hoje),[dados.itens,hoje]);
  useEffect(()=>{
    if(!alvo || alvoAplicado.current===alvo)return;
    const registro=vm.lista.find(i=>i.id===alvo);
    if(!registro){if(bemAlvo&&ehVeiculo(bemAlvo)){alvoAplicado.current=alvo;setFiltros(INICIAL);setAba('veiculo');}return;}
    alvoAplicado.current=alvo;setFiltros(INICIAL);if(registro.tipo!==tipo)setAba(registro.tipo);
  },[alvo,vm.lista,tipo,setAba,bemAlvo]);
  const veiculos=useMemo(()=>bens.filter(ehVeiculo),[bens]);
  const lente=useMemo(()=>tipo==='veiculo'?vm.lista.filter(i=>veiculos.some(b=>i.ativoIds?.includes(b.id))):vm.lista.filter(i=>i.tipo===tipo),[vm.lista,tipo,veiculos]);
  const recorte=useMemo(()=>{
    const lista=filtrarDocumentos(lente,filtros,titulares,pessoas);
    if(tipo!=='veiculo'||!filtros.busca.trim())return lista;
    const q=filtros.busca.trim().toLocaleLowerCase('pt-BR');
    const ids=veiculos.filter(b=>[b.nome,b.identificacao,b.especificacao?.placa,b.especificacao?.marcaModelo].join(' ').toLocaleLowerCase('pt-BR').includes(q)).map(b=>b.id);
    const associados=filtrarDocumentos(lente,{...filtros,busca:''},titulares,pessoas).filter(i=>i.ativoIds?.some(id=>ids.includes(id)));
    return lente.filter(i=>lista.some(x=>x.id===i.id)||associados.some(x=>x.id===i.id));
  },[lente,filtros,titulares,pessoas,tipo,veiculos]);
  const bensVisiveis=useMemo(()=>{
    const filtroControle=!!(filtros.titularId||filtros.status||filtros.categoria||filtros.rh);
    const q=filtros.busca.trim().toLocaleLowerCase('pt-BR');
    return veiculos.filter(b=>{
      const vinculados=controlesDoBem(recorte,b.id).length>0;
      if(filtroControle&&!vinculados)return false;
      return !q||vinculados||[b.nome,b.identificacao,b.especificacao?.placa,b.especificacao?.marcaModelo].join(' ').toLocaleLowerCase('pt-BR').includes(q);
    });
  },[recorte,filtros,veiculos]);
  const kpis=useMemo(()=>calcDocumentos(recorte,hoje).kpis,[recorte,hoje]);
  const categorias=[...new Set(lente.map(i=>i.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const requisitosRecorte=requisitos.filter(r=>{
    const t=titulares.find(t=>t.id===r.titularId);
    if(filtros.titularId==='__pendente__')return false;
    if(filtros.titularId&&r.titularId!==filtros.titularId)return false;
    if(filtros.categoria&&r.categoria!==filtros.categoria)return false;
    const situacao=situacaoRequisito(r,vm.lista);
    const responsavelId=situacao.item?.responsavelId;
    if(filtros.rh==='__com__'&&!t?.pessoaId&&!responsavelId)return false;
    if(filtros.rh==='__sem__'&&(t?.pessoaId||responsavelId))return false;
    if(filtros.rh&&!filtros.rh.startsWith('__')&&t?.pessoaId!==filtros.rh&&responsavelId!==filtros.rh)return false;
    if(filtros.status&&situacao.nivel!==filtros.status)return false;
    const q=filtros.busca.trim().toLocaleLowerCase('pt-BR');
    return !q||[r.categoria,r.estabelecimento,nomeTitular(t,pessoas),situacao.item?.nome].join(' ').toLocaleLowerCase('pt-BR').includes(q);
  });
  const carteira=recorte.filter(i=>i.tipo==='seguro'&&!['vencido','sem','encerrado','semVencimento','futuro'].includes(i.sit.nivel)&&(!i.emissao||i.emissao<=hoje));
  const totalSeguro=chave=>{const informados=carteira.filter(i=>i[chave]!=null&&i[chave]!=='');return informados.length?`${moeda(informados.reduce((s,i)=>s+Number(i[chave]),0))}${informados.length<carteira.length?' · parcial':''}`:'Não informado';};
  const setFiltro=chave=>e=>setFiltros(f=>({...f,[chave]:e.target.value}));
  function abrir(proxima) {setErro('');setMensagem('');setJanela(proxima);}
  function fechar() {if(!ocupado){setJanela(null);setErro('');}}
  const novo=(tipoNovo,ativoIds=[])=>abrir({tipo:'controle',item:novoControle(tipoNovo||'documento',ativoIds)});
  function atualizarLista(chave,item) {setDados(atual=>({...atual,[chave]:[...(atual[chave]||[]).filter(i=>i.id!==item.id),item]}));}
  async function gravar(operacao,rotulo) {
    setOcupado(true);setErro('');setMensagem('');
    try {await operacao();setJanela(null);setMensagem(rotulo);await carregar();}
    catch(e) {setErro(e.status===409?`${e.message} Seu preenchimento permanece neste formulário. Feche e atualize a lista para conferir a ficha mais recente antes de salvar novamente.`:e.message);}
    finally {setOcupado(false);}
  }
  const salvar=(item,arquivos)=>gravar(async()=>{
    const anexos=[];for(const arquivo of arquivos)anexos.push(await api.prepararArquivo(arquivo));
    const payload={...item};if(janela.item.id){payload.id=janela.item.id;delete payload.cadastroId;}
    let salvo=janela.renovacao?await api.renovarControle(payload,janela.item.atualizadoEm??null,anexos[0]):await api.salvarControle(payload,janela.item.atualizadoEm??null,anexos[0]);
    atualizarLista('itens',salvo);
    for(const anexo of anexos.slice(1)){try{salvo=await api.salvarControle({...payload,id:salvo.id,cadastroId:undefined},salvo.atualizadoEm??null,anexo);atualizarLista('itens',salvo);}catch(e){setJanela(j=>({...j,item:salvo,renovacao:false}));throw new Error(`Os dados e alguns arquivos foram salvos. Um anexo não foi concluído: ${e.message}. Confira os anexos antes de enviar novamente.`);}}
  },janela.renovacao?'Renovação salva. As versões anteriores foram preservadas.':'Controle salvo.');
  async function baixar(item,versaoId,arquivoId) {setOcupado(true);setErro('');try{await api.baixarDocumento(item,versaoId,arquivoId);}catch(e){setErro(e.message);}finally{setOcupado(false);}}
  async function abrirConsulta(tipoConsulta) {
    abrir({tipo:tipoConsulta,itens:null});setOcupado(true);
    try {const resposta=tipoConsulta==='lixeira'?await api.lixeiraDocumentos():await api.previaDocumentos();setJanela({tipo:tipoConsulta,itens:tipoConsulta==='lixeira'?resposta:resposta.itens||[],somenteLeitura:resposta.somenteLeitura});}
    catch(e){setErro(e.message);}finally{setOcupado(false);}
  }
  const acoesLista={titulares,pessoas,bens,ocupado,aoEditar:item=>abrir({tipo:'controle',item}),aoRenovar:item=>abrir({tipo:'controle',item,renovacao:true}),aoExcluir:item=>abrir({tipo:'excluir',item}),aoBaixar:baixar,aoBaixarLegado:async bem=>{setOcupado(true);setErro('');try{await api.baixarLegadoBem(bem);}catch(e){setErro(e.message);}finally{setOcupado(false);}},alvo};
  const descricaoRecorte=[ABAS_DOCUMENTOS[tipo],filtros.titularId?nomeTitular(titulares.find(t=>t.id===filtros.titularId),pessoas):'Todos os titulares autorizados',STATUS[filtros.status],filtros.categoria,filtros.busca&&`Busca: ${filtros.busca}`,filtros.rh&&(filtros.rh==='__com__'?'Com vínculo ao RH':filtros.rh==='__sem__'?'Sem vínculo ao RH':`RH: ${pessoas.find(p=>p.id===filtros.rh)?.nome||'ID '+filtros.rh}`)].filter(Boolean).join(' · ');
  if(relatorio)return <section className="documentos doc-print"><div className="doc-actions sem-impressao"><button className="btn-ghost" onClick={()=>setRelatorio(null)}><ArrowLeft size={16}/>Voltar à lista</button><button className="btn-primary" onClick={()=>window.print()}><Printer size={17}/>Imprimir / salvar PDF</button><p className="doc-note">Escolha “Salvar como PDF” na impressão.</p></div><header className="doc-report-heading"><small>IMPRESILK · DOCUMENTOS E VENCIMENTOS</small><h1>{ABAS_DOCUMENTOS[relatorio.tipo]}</h1><p>{relatorio.recorte}</p><p>{relatorio.itens.length} controles{relatorio.tipo==='veiculo'?` · ${relatorio.bens.length} veículos`:''} · Gerado em {relatorio.em}</p></header>{relatorio.tipo==='veiculo'?<ListaVeiculos bens={relatorio.bens} itens={relatorio.itens} titulares={relatorio.titulares} pessoas={relatorio.pessoas} bensRelacionados={relatorio.bensRelacionados} impressao/>:<ListaDocumentos itens={relatorio.itens} titulares={relatorio.titulares} pessoas={relatorio.pessoas} bens={relatorio.bens} impressao/>}{relatorio.tipo==='documento'&&!!relatorio.requisitos.length&&<section className="doc-requisitos"><h2>Aplicabilidade e pendências do recorte</h2>{relatorio.requisitos.map(r=><div className="doc-requisito" key={r.id}><strong>{r.categoria}</strong><span>{nomeTitular(relatorio.titulares.find(t=>t.id===r.titularId),relatorio.pessoas)}{r.estabelecimento&&` · ${r.estabelecimento}`}</span><ChipPrazo sit={situacaoRequisito(r,relatorio.controles)}/></div>)}</section>}</section>;
  return <section className="documentos">
    <PageTitle titulo="Documentos e vencimentos" descricao="Documentos, garantias e apólices dos titulares cadastrados, com vencimentos e histórico." acao={<div className="doc-actions sem-impressao"><button className="btn-ghost" disabled={ocupado||atualizando} onClick={carregar} aria-label="Atualizar documentos"><RefreshCw size={17}/></button><button className="btn-outline" disabled={ocupado} onClick={()=>setCadastros(v=>!v)} aria-expanded={cadastros}><Users size={16}/>Titulares</button><button className="btn-outline" disabled={ocupado} onClick={()=>setRelatorio(structuredClone({tipo,recorte:descricaoRecorte,itens:recorte,bens:tipo==='veiculo'?bensVisiveis:bens,bensRelacionados:bens,titulares,pessoas,requisitos:requisitosRecorte,controles:vm.lista,em:new Date().toLocaleString('pt-BR')}))}><Printer size={16}/>Exportar recorte</button><button className="btn-primary" disabled={ocupado} onClick={()=>novo(tipo==='veiculo'?'documento':tipo)}><Plus size={17}/>{tipo==='garantia'?'Nova garantia':tipo==='seguro'?'Nova apólice':'Novo documento'}</button></div>}/>
    <AvisoAtualizacao erro={erroLeitura} aoTentar={carregar}/>
    {mensagem&&<p className="doc-notice is-ok" role="status">{mensagem}</p>}{erro&&!janela&&<p className="doc-notice is-error" role="alert">{erro}</p>}
    {aba==='maquina'&&<p className="doc-notice">As fichas físicas e as manutenções de máquinas estão no <Link to="/patrimonio?aba=maquinas">Patrimônio · Máquinas</Link>. Os controles continuam ligados aos bens pelo ID.</p>}
    {aba==='maquina'&&bemAlvo?.documentoLegado&&<div className="doc-notice"><strong>Documento antigo · {bemAlvo.nome||bemAlvo.identificacao||'Máquina cadastrada'}</strong><p>ID {bemAlvo.id} · Validade: {bemAlvo.validade?dataLonga(bemAlvo.validade):'não informada'}.</p><p>A origem foi preservada na ficha física; sua classificação documental depende de conferência.</p></div>}
    <nav className="doc-tabs sem-impressao" aria-label="Áreas de documentos">{Object.entries(ABAS_DOCUMENTOS).map(([id,nome])=>{const Icone=ICONES[id];return <button key={id} type="button" aria-current={tipo===id?'page':undefined} onClick={()=>{setFiltros(INICIAL);setParams(atuais=>{const copia=new URLSearchParams(atuais);copia.set('aba',id);copia.delete('item');return copia;});}}><Icone size={17}/>{nome}<span>{id==='veiculo'?veiculos.length:vm.lista.filter(i=>i.tipo===id).length}</span></button>;})}</nav>
    {alvo && !bemAlvo && !vm.lista.some(i=>i.id===alvo) && <p className="doc-notice" role="status">O controle solicitado não está disponível neste acesso. Atualize a lista para conferir.</p>}
    {alvo && vm.lista.some(i=>i.id===alvo) && !recorte.some(i=>i.id===alvo) && <p className="doc-notice sem-impressao">O controle solicitado está fora do recorte atual. <button className="btn-outline" onClick={()=>{setFiltros(INICIAL);setAba(vm.lista.find(i=>i.id===alvo).tipo);}}>Mostrar controle solicitado</button></p>}
    <div className="doc-kpis sem-impressao">{[{rotulo:tipo==='veiculo'?'Controles dos veículos':'Controles',valor:kpis.total,status:''},{rotulo:'Vencidos',valor:kpis.vencidos,status:'vencido'},{rotulo:'A vencer',valor:kpis.urgentes,status:'urgente'},{rotulo:'Prazo não informado',valor:kpis.semPrazo,status:'sem'},{rotulo:'Em dia',valor:recorte.filter(i=>i.sit.nivel==='ok').length,status:'ok'}].map(k=><button className={`doc-kpi ${k.status==='vencido'?'is-bad':k.status==='urgente'||k.status==='sem'?'is-warn':''}`} type="button" key={k.rotulo} aria-pressed={filtros.status===k.status} onClick={()=>setFiltros(f=>({...f,status:f.status===k.status?'':k.status}))}><span>{k.rotulo}</span><strong>{k.valor}</strong></button>)}</div>
    <div className="doc-filters sem-impressao">
      <label className="label doc-search"><span><Search size={15}/>Buscar</span><input className="input" type="search" value={filtros.busca} onChange={setFiltro('busca')} placeholder={tipo==='veiculo'?'Veículo, placa ou controle':'Nome, número, titular ou contato'}/></label>
      <label className="label">Titular<select className="input" value={filtros.titularId} onChange={setFiltro('titularId')}><option value="">Todos os titulares autorizados</option>{titulares.map(t=><option key={t.id} value={t.id}>{nomeTitular(t,pessoas)} · {t.tipo==='pessoa'?'Pessoa':'Empresa'}{titulares.filter(o=>nomeTitular(o,pessoas)===nomeTitular(t,pessoas)).length>1?` · ID ${t.id}`:''}</option>)}<option value="__pendente__">Titular pendente</option></select></label>
      <label className="label">Status<select className="input" value={filtros.status} onChange={setFiltro('status')}><option value="">Todos os status</option>{Object.entries(STATUS).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label>
      <label className="label">Categoria<select className="input" value={filtros.categoria} onChange={setFiltro('categoria')}><option value="">Todas as categorias</option>{categorias.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <label className="label">Responsável / RH<select className="input" value={filtros.rh} onChange={setFiltro('rh')}><option value="">Todas</option><option value="__com__">Com vínculo ao RH</option><option value="__sem__">Sem vínculo ao RH</option>{pessoas.map(p=><option key={p.id} value={p.id}>{p.nome}{pessoas.filter(o=>o.nome===p.nome).length>1?` · ID ${p.id}`:''}</option>)}</select></label>
      {Object.values(filtros).some(Boolean)&&<button type="button" className="btn-ghost" onClick={()=>setFiltros(INICIAL)}>Limpar filtros</button>}
    </div>
    {cadastros&&<section className="doc-cadastros sem-impressao"><header><h2>Titulares cadastrados</h2><button className="btn-outline" disabled={ocupado} onClick={()=>abrir({tipo:'titular'})}><Plus size={16}/>Novo titular</button></header>{!titulares.length?<p className="doc-note">Cadastre a empresa ou pessoa confirmada antes de criar os controles.</p>:<div className="doc-holder-list">{titulares.map(t=><div key={t.id}><strong>{nomeTitular(t,pessoas)}</strong><span className="chip">{t.tipo==='pessoa'?'Pessoa':'Empresa'}</span><small>{t.pessoaId?`RH · ID ${t.pessoaId}`:`Titular · ID ${t.id}`}</small><button className="btn-ghost" disabled={ocupado} onClick={()=>abrir({tipo:'titular',item:t})}>Editar</button></div>)}</div>}</section>}
    {tipo==='documento'&&<details className="doc-requisitos sem-impressao"><summary>Aplicabilidade dos documentos <span className="chip">{requisitosRecorte.length} requisitos</span><span className="doc-pending">{requisitosRecorte.filter(r=>situacaoRequisito(r,vm.lista).nivel==='faltante').length} faltantes</span></summary><p className="doc-note">Defina quais documentos cada titular precisa. Categorias sugeridas ajudam o cadastro; a exigência e o vínculo são confirmados pelo usuário.</p><button className="btn-outline" disabled={ocupado||!titulares.length} onClick={()=>abrir({tipo:'requisito'})}><Plus size={16}/>Novo requisito</button>{requisitosRecorte.map(r=><div className="doc-requisito" key={r.id}><div><strong>{r.categoria}</strong><small>{nomeTitular(titulares.find(t=>t.id===r.titularId),pessoas)}{r.estabelecimento&&` · ${r.estabelecimento}`}</small>{r.observacao&&<small>{r.observacao}</small>}</div><ChipPrazo sit={situacaoRequisito(r,vm.lista)}/><button className="btn-ghost" disabled={ocupado} onClick={()=>abrir({tipo:'requisito',item:r})}>Editar vínculo</button></div>)}</details>}
    {tipo==='seguro'&&<div className="doc-insurance-summary"><span><strong>{carteira.length}</strong> apólices com vigência atual neste recorte</span>{carteira.length>0&&<><span>Prêmio: <strong>{totalSeguro('valor')}</strong></span><span>Importância segurada: <strong>{totalSeguro('valorSegurado')}</strong></span></>}</div>}
    <div className="doc-list-heading"><h2>{ABAS_DOCUMENTOS[tipo]}</h2><p>{recorte.length} controles{tipo==='veiculo'?` · ${bensVisiveis.length} veículos`:''} no recorte</p></div>
    {tipo==='veiculo'?bensVisiveis.length?<ListaVeiculos {...acoesLista} bens={bensVisiveis} bensRelacionados={bens} itens={recorte} aoNovo={novo}/>:<Empty>Nenhum veículo neste recorte. As fichas vêm do Patrimônio.</Empty>:recorte.length?<ListaDocumentos itens={recorte} {...acoesLista}/>:<Empty>Nenhum controle neste recorte.{!titulares.length&&<button className="btn-outline mt-3" onClick={()=>abrir({tipo:'titular'})}>Cadastrar primeiro titular</button>}</Empty>}
    <div className="doc-actions doc-utilities sem-impressao"><button className="btn-ghost" disabled={ocupado} onClick={()=>abrirConsulta('lixeira')}><Trash2 size={15}/>Lixeira de documentos</button><button className="btn-ghost" disabled={ocupado} onClick={()=>abrirConsulta('previa')}><ClipboardList size={15}/>Prévia da organização</button></div>
    {janela&&<JanelaFormulario titulo={janela.tipo==='controle'?(janela.renovacao?'Renovar controle':janela.item.id?'Editar controle':'Novo controle'):janela.tipo==='titular'?(janela.item?'Editar titular':'Novo titular'):janela.tipo==='requisito'?'Aplicabilidade do documento':janela.tipo==='excluir'?'Mover controle para a lixeira':janela.tipo==='lixeira'?'Lixeira de documentos':'Prévia da organização'} ocupado={ocupado} aoFechar={fechar} classe="doc-modal">
      {janela.tipo==='controle'&&<FormControle inicial={janela.item} titulares={titulares} pessoas={pessoas} bens={bens} renovacao={janela.renovacao} ocupado={ocupado} erro={erro} aoSalvar={salvar} aoFechar={fechar}/>}
      {janela.tipo==='titular'&&<FormTitular inicial={janela.item} pessoalPermitido={podeAbrir('documentos-pessoais')} ocupado={ocupado} erro={erro} aoFechar={fechar} aoSalvar={item=>gravar(async()=>atualizarLista('titulares',await api.salvarTitular(item,janela.item?.atualizadoEm??null)),'Titular salvo.')}/>}
      {janela.tipo==='requisito'&&<FormRequisito inicial={janela.item} titulares={titulares} itens={vm.lista} pessoas={pessoas} ocupado={ocupado} erro={erro} aoFechar={fechar} aoSalvar={item=>gravar(async()=>atualizarLista('requisitos',await api.salvarRequisito(item,janela.item?.atualizadoEm??null)),'Aplicabilidade salva.')}/>}
      {janela.tipo==='excluir'&&<div className="doc-form">{erro&&<p className="doc-notice is-error" role="alert">{erro}</p>}<p>Mover <strong>{janela.item.nome}</strong> para a lixeira de documentos? O controle sai da lista e pode ser recuperado. O bem patrimonial vinculado será preservado.</p><div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado} onClick={()=>gravar(async()=>{await api.removerControle(janela.item.id,janela.item.atualizadoEm??null);setDados(d=>({...d,itens:(d.itens||[]).filter(i=>i.id!==janela.item.id)}));},'Controle movido para a lixeira.')}>Mover para lixeira</button><button className="btn-ghost" disabled={ocupado} onClick={fechar}>Cancelar</button></div></div>}
      {['lixeira','previa'].includes(janela.tipo)&&<div className="doc-form">{erro&&<p className="doc-notice is-error" role="alert">{erro}</p>}{janela.itens===null?<p role="status">Consultando…</p>:janela.tipo==='lixeira'?janela.itens.length?<ul className="doc-versions">{janela.itens.map(i=><li key={i.id}><div><strong>{i.nome||i.categoria}</strong><small>{i.arquivoNome||'Arquivo não informado'}</small></div><button className="btn-outline" disabled={ocupado} onClick={()=>gravar(()=>api.restaurarControle(i.id),'Controle restaurado.')}>Restaurar</button></li>)}</ul>:<p>Nenhum documento na lixeira autorizada.</p>:<><p className="doc-note">Somente leitura. Esta prévia mostra o destino proposto e as pendências. Nenhum registro é migrado por esta tela.</p><ul className="doc-versions">{janela.itens.map((i,index)=><li key={i.id||index}><div><strong>ID {i.id}</strong><small>{texto(i.origem)} → {texto(i.destino)}</small><small>{texto(i.pendencias)||'Sem pendências informadas'}</small></div></li>)}</ul>{!janela.itens.length&&<p>Nenhum registro na prévia autorizada.</p>}</>}</div>}
    </JanelaFormulario>}
  </section>;
}
