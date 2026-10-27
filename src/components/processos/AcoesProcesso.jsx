import {useEffect,useRef,useState} from 'react';
import {Search,SlidersHorizontal,Pencil,Plus,Paperclip,History,ArrowRight,ChevronDown,CalendarDays,UserRound} from 'lucide-react';
import './consultoria-acoes.css';
import {TIPOS_REGISTRO,IMPLANTACOES} from '../../../supabase/functions/_shared/processos.mjs';
import ImplantacaoProcesso,{CamposImplantacao} from './ImplantacaoProcesso.jsx';
import {Campo,Opcoes} from './EditorProcesso.jsx';
const dia=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const data=v=>v?.split('-').reverse().join('/');
const textoBusca=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const dataHora=v=>v?new Date(v).toLocaleString('pt-BR'):'Data não informada';
const camposRevisao={tipo:'Tipo de registro',titulo:'Título',dataAcao:'Data da ação',texto:'O que foi feito',resultado:'Resultado / evidência',proximoPasso:'Próximo passo',etapaId:'Etapa vinculada'};

export default function AcoesProcesso(props){
 return props.item.tipo==='consultoria'?<AcoesConsultoria {...props}/>:<AcoesDemanda {...props}/>;
}

export function filtrarAcoes(registros,etapas,{busca='',tipo='todos',etapa='todas',situacao='todas'}={}){
 const termo=textoBusca(busca).trim();
 return [...(registros||[])].reverse().filter(r=>{
  const tituloEtapa=(etapas||[]).find(e=>e.id===r.etapaId)?.titulo||'';
  return (tipo==='todos'||(r.tipo||'atualizacao')===tipo)
   &&(etapa==='todas'||(etapa==='geral'?!r.etapaId:r.etapaId===etapa))
   &&(situacao==='todas'||(r.tipo==='acao'&&(r.implantacao?.situacao||'sem_informacao')===situacao))
   &&(!termo||textoBusca([r.titulo,r.texto,r.nome,r.resultado,r.proximoPasso,tituloEtapa].join(' ')).includes(termo));
 });
}

function valoresRegistro(r){
 return {tipo:r?r.tipo||'atualizacao':'acao',titulo:r?.titulo||'',dataAcao:r?r.dataAcao||'':dia(),texto:r?.texto||'',resultado:r?.resultado||'',proximoPasso:r?.proximoPasso||'',etapaId:r?.etapaId||''};
}

export function compararRegistro(original,rascunho,atual){
 const servidor=valoresRegistro(atual),valor={...rascunho},conflitos=[];
 for(const campo of Object.keys(camposRevisao)){
  if(servidor[campo]===original[campo])continue;
  if(rascunho[campo]===original[campo])valor[campo]=servidor[campo];
  else if(rascunho[campo]!==servidor[campo])conflitos.push(campo);
 }
 return {servidor,valor,conflitos};
}

export function CamposRegistro({valor,mudar,item,ocupado}){
 const campo=(k,v)=>mudar({...valor,[k]:v});
 const etapas=item.etapas||[];
 return <>
  <div className="processo-campos"><Campo nome="Tipo de registro"><select className="input" value={valor.tipo} disabled={ocupado} onChange={e=>campo('tipo',e.target.value)}><Opcoes mapa={TIPOS_REGISTRO}/></select></Campo><Campo nome="Data da ação"><input className="input" type="date" required={valor.tipo==='acao'} value={valor.dataAcao} disabled={ocupado} onInput={e=>campo('dataAcao',e.currentTarget.value)} onChange={e=>campo('dataAcao',e.target.value)}/></Campo></div>
  <Campo nome="Título da ação"><input className="input" value={valor.titulo} required={valor.tipo==='acao'} maxLength={180} disabled={ocupado} onChange={e=>campo('titulo',e.target.value)} placeholder="Ex.: Mapeamento do processo de compras"/></Campo>
  <Campo nome="O que foi feito ou está acontecendo"><textarea className="input" rows={3} value={valor.texto} required maxLength={5000} disabled={ocupado} onChange={e=>campo('texto',e.target.value)}/></Campo>
  <div className="processo-campos"><Campo nome="Resultado / evidência"><textarea className="input" rows={2} value={valor.resultado} maxLength={5000} disabled={ocupado} onChange={e=>campo('resultado',e.target.value)} placeholder="O que mudou ou foi entregue?"/></Campo><Campo nome="Próximo passo combinado"><textarea className="input" rows={2} value={valor.proximoPasso} maxLength={2000} disabled={ocupado} onChange={e=>campo('proximoPasso',e.target.value)} placeholder="O que faremos a seguir?"/></Campo></div>
  <Campo nome="Vincular a uma etapa"><select className="input" value={valor.etapaId} disabled={ocupado} onChange={e=>campo('etapaId',e.target.value)}><option value="">Registro geral da consultoria</option>{valor.etapaId&&!etapas.some(e=>e.id===valor.etapaId)&&<option value={valor.etapaId}>Etapa anterior não disponível</option>}{etapas.map(e=><option key={e.id} value={e.id}>{e.titulo}</option>)}</select></Campo>
 </>;
}

function valorRevisao(campo,v,etapas){
 if(!v)return 'Não informado';
 if(campo==='tipo')return TIPOS_REGISTRO[v]||v;
 if(campo==='dataAcao')return data(v);
 if(campo==='etapaId')return etapas.find(e=>e.id===v)?.titulo||'Etapa anterior não disponível';
 return String(v);
}

export function HistoricoRegistro({registro,etapas=[]}){
 if(!registro.revisoes?.length)return null;
 return <details className="consultoria-revisoes"><summary><History size={14} aria-hidden="true"/> Histórico de alterações ({registro.revisoes.length})</summary>
  {[...registro.revisoes].reverse().map((r,i)=><section key={r.em+'-'+i}><h4>{r.nome||'Responsável não informado'} <span>· {dataHora(r.em)}</span></h4>
   {Object.entries(camposRevisao).filter(([k])=>JSON.stringify(r.antes?.[k]??'')!==JSON.stringify(r.depois?.[k]??'')).map(([k,rotulo])=><div className="consultoria-revisao-campo" key={k}><strong>{rotulo}</strong><div><p><small>Antes</small>{valorRevisao(k,r.antes?.[k],etapas)}</p><p><small>Depois</small>{valorRevisao(k,r.depois?.[k],etapas)}</p></div></div>)}
  </section>)}
 </details>;
}

export function AcoesConsultoria({item,externo,ocupado,executar,irArquivos}){
 const [editor,setEditor]=useState(null),[busca,setBusca]=useState(''),[tipo,setTipo]=useState('todos'),[etapa,setEtapa]=useState('todas'),[situacao,setSituacao]=useState('todas'),[falha,setFalha]=useState('');
 const formulario=useRef(null),editorAberto=editor?editor.registroId||'novo':'';
 useEffect(()=>{if(editorAberto){formulario.current?.scrollIntoView({block:'start'});formulario.current?.querySelector('input,select,textarea')?.focus({preventScroll:true});}},[editorAberto]);
 const registros=item.registros||[],etapas=item.etapas||[];
 const lista=filtrarAcoes(registros,etapas,{busca,tipo,etapa,situacao});
 const filtrosAtivos=(tipo!=='todos'?1:0)+(etapa!=='todas'?1:0)+(situacao!=='todas'?1:0);
 function limpar(){setBusca('');setTipo('todos');setEtapa('todas');setSituacao('todas');}
 function editar(r){setFalha('');setEditor({registroId:r.id,valor:valoresRegistro(r),original:valoresRegistro(r),versao:item.versao});}
 function novo(){setFalha('');setEditor({registroId:null,valor:valoresRegistro(),compartilhado:false,implantacao:{situacao:'nao_iniciada',como:'',data:''}});}
 async function salvar(e){
  e.preventDefault();if(ocupado||!permissaoEditor||versaoMudou)return;setFalha('');
  const alteracao=!!editor.registroId;
  const payload=alteracao?{registroId:editor.registroId,...editor.valor}:{...editor.valor,compartilhado:editor.compartilhado,implantacao:editor.implantacao};
  try{
   const ok=alteracao?await executar('editarRegistro',payload,{versao:editor.versao}):await executar('registro',payload);
   if(ok)setEditor(null);else setFalha('Seu texto foi mantido. Confira o aviso de salvamento e tente novamente.');
  }catch{setFalha('Não foi possível salvar. Seu texto foi mantido; tente novamente.');}
 }
 const permissaoEditor=editor&&(editor.registroId?registros.some(r=>r.id===editor.registroId&&r.podeEditar===true):item.podeContribuir!==false);
 const registroAtual=editor?.registroId?registros.find(r=>r.id===editor.registroId):null;
 const versaoMudou=!!(registroAtual&&item.versao!==editor.versao);
 const comparacao=versaoMudou?compararRegistro(editor.original,editor.valor,registroAtual):null;
 const escolhas=editor?.revisaoVersao===item.versao?editor.resolucoes||{}:{};
 const revisaoCompleta=comparacao?.conflitos.every(k=>['servidor','rascunho'].includes(escolhas[k]));
 function reconciliar(){
  if(!revisaoCompleta)return;
  const valor={...comparacao.valor};for(const campo of comparacao.conflitos)if(escolhas[campo]==='servidor')valor[campo]=comparacao.servidor[campo];
  setEditor(x=>({...x,valor,original:comparacao.servidor,versao:item.versao,resolucoes:{}}));setFalha('');
 }
 return <section className="processo-painel consultoria-acoes" aria-label="Ações e registros">
  <div className="consultoria-acoes-topo"><div><h2>Ações e registros <span>{registros.length}</span></h2><p className="processo-ajuda">Entregas, resultados e próximos passos em um só lugar.</p></div><div className="consultoria-acoes-botoes"><button className="btn-outline" disabled={ocupado} onClick={irArquivos}><Paperclip size={15} aria-hidden="true"/>{item.podeContribuir===false?'Ver materiais':'Materiais'}</button>{item.podeContribuir!==false&&<button className="btn-primary" disabled={ocupado||!!editor} onClick={novo}><Plus size={16} aria-hidden="true"/> Registrar ação</button>}</div></div>
  {editor&&<form ref={formulario} className="processo-form consultoria-acao-editor" onSubmit={salvar} aria-label={editor.registroId?'Editar ação':'Registrar ação'}><div className="consultoria-acoes-topo"><h3>{editor.registroId?'Editar ação':'Novo registro'}</h3><button type="button" className="btn-outline" disabled={ocupado} onClick={()=>{setEditor(null);setFalha('');}}>Cancelar</button></div>
   {!permissaoEditor&&<p className="consultoria-acao-erro" role="alert">Seu acesso a este registro mudou. A edição permanece abaixo para consulta, mas não pode ser salva.</p>}
   {versaoMudou&&<section className="consultoria-acao-concorrencia" aria-label="Conferir alterações recebidas"><h3>A ficha foi atualizada enquanto você editava</h3><p>Seu rascunho está preservado. Campos alterados somente na versão atual serão incorporados. Confira os conflitos abaixo antes de continuar.</p>{comparacao.conflitos.map(campo=><fieldset key={campo}><legend>{camposRevisao[campo]}</legend>{[['servidor','Versão atual',comparacao.servidor[campo]],['rascunho','Minha edição',editor.valor[campo]]].map(([opcao,rotulo,v])=><label key={opcao}><input type="radio" name={'conciliar-'+campo} checked={escolhas[campo]===opcao} disabled={ocupado} onChange={()=>setEditor(x=>({...x,revisaoVersao:item.versao,resolucoes:{...(x.revisaoVersao===item.versao?x.resolucoes:{}),[campo]:opcao}}))}/><span><strong>{rotulo}</strong>{valorRevisao(campo,v,etapas)}</span></label>)}</fieldset>)}{!comparacao.conflitos.length&&<p>Nenhum campo foi alterado simultaneamente. Você pode incorporar a atualização e manter sua edição.</p>}<button type="button" className="btn-outline" disabled={ocupado||!revisaoCompleta||!permissaoEditor} onClick={reconciliar}>Aplicar revisão ao rascunho</button></section>}
   <CamposRegistro valor={editor.valor} mudar={valor=>setEditor(x=>({...x,valor}))} item={item} ocupado={ocupado||!permissaoEditor||versaoMudou}/>
   {!editor.registroId&&editor.valor.tipo==='acao'&&<CamposImplantacao valor={editor.implantacao} mudar={implantacao=>setEditor(x=>({...x,implantacao}))} ocupado={ocupado}/>}
   {!editor.registroId&&!externo&&<label className="consultoria-acao-compartilhar"><input type="checkbox" checked={editor.compartilhado} disabled={ocupado} onChange={e=>setEditor(x=>({...x,compartilhado:e.target.checked}))}/>Visível para a consultoria</label>}
   <p className="processo-ajuda">{editor.registroId?'A autoria original permanece. A alteração será identificada no histórico. O registro não conclui etapas nem altera seus prazos ou a implantação.':'O registro não altera prazos nem conclui etapas. Anexe materiais após salvar.'}</p>
   {falha&&<p className="consultoria-acao-erro" role="alert">{falha}</p>}
   <div className="consultoria-acoes-botoes"><button className="btn-primary" disabled={ocupado||!permissaoEditor||versaoMudou}>{ocupado?'Salvando…':editor.registroId?'Salvar alterações':'Salvar registro'}</button><button type="button" className="btn-outline" disabled={ocupado} onClick={()=>{setEditor(null);setFalha('');}}>Cancelar</button></div>
  </form>}
  <div className="consultoria-acoes-pesquisa"><label><Search size={17} aria-hidden="true"/><input type="search" aria-label="Buscar ações" placeholder="Buscar ação, pessoa, resultado ou próximo passo" value={busca} onChange={e=>setBusca(e.target.value)}/></label><details className="consultoria-acoes-filtros"><summary><SlidersHorizontal size={15} aria-hidden="true"/>Filtros{filtrosAtivos>0&&<span>{filtrosAtivos}</span>}<ChevronDown size={14} aria-hidden="true"/></summary><div className="consultoria-acoes-filtro-campos"><Campo nome="Tipo de registro"><select className="input" aria-label="Filtrar registros" value={tipo} onChange={e=>setTipo(e.target.value)}><option value="todos">Todos os registros</option><Opcoes mapa={TIPOS_REGISTRO}/></select></Campo><Campo nome="Etapa"><select className="input" aria-label="Filtrar por etapa" value={etapa} onChange={e=>setEtapa(e.target.value)}><option value="todas">Todas as etapas</option><option value="geral">Registros gerais</option>{etapas.map(e=><option key={e.id} value={e.id}>{e.titulo}</option>)}</select></Campo><Campo nome="Implantação das ações"><select className="input" aria-label="Filtrar por implantação" value={situacao} onChange={e=>setSituacao(e.target.value)}><option value="todas">Todas as situações</option><Opcoes mapa={IMPLANTACOES}/><option value="sem_informacao">Não informada</option></select></Campo></div></details></div>
  <div className="consultoria-acoes-contagem"><p role="status">{lista.length} de {registros.length} {registros.length===1?'registro':'registros'}</p>{(busca||filtrosAtivos>0)&&<button type="button" onClick={limpar}>Limpar busca e filtros</button>}</div>
  {!lista.length&&<div className="consultoria-acoes-vazio"><Search size={24} aria-hidden="true"/><h3>{registros.length?'Nenhum registro encontrado':'Acompanhe as primeiras entregas'}</h3><p>{registros.length?'Tente outro termo ou limpe os filtros.':item.podeContribuir===false?'Os registros compartilhados aparecerão aqui.':'Registre uma ação, decisão ou pendência para começar.'}</p></div>}
  <ol className="consultoria-acoes-lista">{lista.map(r=>{
   const titulo=r.titulo||r.texto?.slice(0,100)||'Registro sem título',vinculo=etapas.find(e=>e.id===r.etapaId)?.titulo;
   return <li key={r.id} className="consultoria-acao" data-registro={r.id}>
    <details><summary className={r.podeEditar===true?'com-edicao':''}><div className="consultoria-acao-cabecalho"><span className={'consultoria-acao-tipo tipo-'+(r.tipo||'atualizacao')}>{TIPOS_REGISTRO[r.tipo]||'Andamento'}</span><strong>{titulo}</strong><ChevronDown size={16} aria-hidden="true" className="consultoria-acao-seta"/></div><div className="consultoria-acao-meta"><span><CalendarDays size={12} aria-hidden="true"/>{data(r.dataAcao)|| (r.em?new Date(r.em).toLocaleDateString('pt-BR'):'Data não informada')}</span><span><UserRound size={12} aria-hidden="true"/>{r.nome||'Autoria não informada'}</span>{r.tipo==='acao'&&<span className={'consultoria-acao-estado estado-'+(r.implantacao?.situacao||'sem_informacao')}>{IMPLANTACOES[r.implantacao?.situacao]||'Implantação não informada'}</span>}{!externo&&!r.compartilhado&&<span className="consultoria-acao-interna">Interno</span>}{vinculo&&<span className="consultoria-acao-etapa">{vinculo}</span>}{!!r.revisoes?.length&&<span><History size={12} aria-hidden="true"/>{r.revisoes.length} {r.revisoes.length===1?'alteração':'alterações'}</span>}</div>{r.proximoPasso&&<p className="consultoria-acao-proximo"><ArrowRight size={13} aria-hidden="true"/><span><b>Próximo passo:</b> {r.proximoPasso}</span></p>}</summary>
    <div className="processo-detalhes consultoria-acao-detalhes"><div><h3>O que foi feito</h3><p>{r.texto}</p></div>{r.resultado&&<div><h3>Resultado / evidência</h3><p>{r.resultado}</p></div>}{r.proximoPasso&&<div><h3>Próximo passo</h3><p>{r.proximoPasso}</p></div>}{r.etapaId&&<p className="processo-ajuda">Etapa: {vinculo||'Etapa anterior não disponível'}</p>}{r.tipo==='acao'&&<ImplantacaoProcesso registro={r} ocupado={ocupado} executar={executar}/>}<HistoricoRegistro registro={r} etapas={etapas}/><p className="processo-ajuda">Registro original: {dataHora(r.em)} · {r.nome||'Autoria não informada'}{!externo?' · '+(r.compartilhado?'Compartilhado':'Interno'):''}</p></div>
    </details>
    {r.podeEditar===true&&<button className="btn-outline consultoria-acao-editar" disabled={ocupado||!!editor} aria-label={'Editar ação: '+titulo} onClick={()=>editar(r)}><Pencil size={14} aria-hidden="true"/> Editar ação</button>}
   </li>;
  })}</ol>
 </section>;
}

function AcoesDemanda({item,externo,ocupado,executar,irArquivos}){
 const [novo,setNovo]=useState(false),[tipo,setTipo]=useState('acao'),[titulo,setTitulo]=useState(''),[dataAcao,setData]=useState(dia),[texto,setTexto]=useState(''),[resultado,setResultado]=useState(''),[proximoPasso,setProximo]=useState(''),[etapaId,setEtapa]=useState(''),[compartilhado,setCompartilhado]=useState(false),[filtro,setFiltro]=useState('todos'),[implantacao,setImplantacao]=useState({situacao:'nao_iniciada',como:'',data:''});
 const lista=[...(item.registros||[])].reverse().filter(r=>filtro==='todos'||(r.tipo||'atualizacao')===filtro);
 async function salvar(e){e.preventDefault();const ok=await executar('registro',{tipo,titulo,dataAcao,texto,resultado,proximoPasso,etapaId,compartilhado,implantacao});if(ok){setNovo(false);setTitulo('');setTexto('');setResultado('');setProximo('');setEtapa('');setImplantacao({situacao:'nao_iniciada',como:'',data:''});}}
 return <section className="processo-painel" aria-label="Ações e registros"><div className="processo-linha"><div><h2>Ações e registros</h2><p className="processo-ajuda">O que foi feito, o resultado e o que vem depois. Cada registro fica identificado.</p></div>{item.podeContribuir!==false&&<button className="btn-primary" disabled={ocupado||novo} onClick={()=>setNovo(true)}>+ Registrar ação</button>}</div>
 {novo&&item.podeContribuir!==false&&<form onSubmit={salvar} className="processo-form"><div className="processo-campos"><Campo nome="Tipo de registro"><select className="input" value={tipo} disabled={ocupado} onChange={e=>setTipo(e.target.value)}><Opcoes mapa={TIPOS_REGISTRO}/></select></Campo><Campo nome="Data da ação"><input className="input" type="date" required={tipo==='acao'} value={dataAcao} disabled={ocupado} onChange={e=>setData(e.target.value)}/></Campo></div><Campo nome="Título da ação"><input className="input" value={titulo} required={tipo==='acao'} maxLength={180} disabled={ocupado} onChange={e=>setTitulo(e.target.value)} placeholder="Ex.: Mapeamento do processo de compras"/></Campo><Campo nome="O que foi feito ou está acontecendo"><textarea className="input" value={texto} required maxLength={5000} disabled={ocupado} onChange={e=>setTexto(e.target.value)}/></Campo><div className="processo-campos"><Campo nome="Resultado / evidência"><textarea className="input" value={resultado} maxLength={5000} disabled={ocupado} onChange={e=>setResultado(e.target.value)} placeholder="O que mudou ou foi entregue?"/></Campo><Campo nome="Próximo passo combinado"><textarea className="input" value={proximoPasso} maxLength={2000} disabled={ocupado} onChange={e=>setProximo(e.target.value)} placeholder="O que faremos a seguir?"/></Campo></div><Campo nome="Vincular a uma etapa"><select className="input" value={etapaId} disabled={ocupado} onChange={e=>setEtapa(e.target.value)}><option value="">{item.tipo==='consultoria'?'Registro geral da consultoria':'Registro geral da demanda'}</option>{item.etapas.map(e=><option key={e.id} value={e.id}>{e.titulo}</option>)}</select></Campo>{tipo==='acao'&&<CamposImplantacao valor={implantacao} mudar={setImplantacao} ocupado={ocupado}/>}<p className="processo-ajuda">Este registro não muda prazos nem conclui etapas. Materiais podem ser anexados em Arquivos após salvar.</p>{!externo&&item.tipo==='consultoria'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={compartilhado} disabled={ocupado} onChange={e=>setCompartilhado(e.target.checked)}/>Visível para a consultoria</label>}<div className="processo-linha"><button className="btn-primary" disabled={ocupado}>{ocupado?'Salvando…':'Salvar registro'}</button><button type="button" className="btn-outline" disabled={ocupado} onClick={()=>setNovo(false)}>Cancelar registro</button></div></form>}
 <div className="processo-linha"><label className="text-sm">Mostrar <select aria-label="Filtrar registros" className="input" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todos os registros</option><Opcoes mapa={TIPOS_REGISTRO}/></select></label><button className="btn-outline" disabled={ocupado} onClick={irArquivos}>{item.podeContribuir===false?'Ver materiais':'Anexar materiais'}</button></div>
 {!lista.length&&<p className="processo-vazio">{item.podeContribuir===false?'Nenhum registro disponível neste filtro.':'Nenhum registro neste filtro. Comece pelo diagnóstico ou pela primeira ação realizada.'}</p>}
 <ol className="processo-registros">{lista.map(r=><li key={r.id}><details><summary><span className="processo-chip">{TIPOS_REGISTRO[r.tipo]||'Andamento'}</span><strong>{r.titulo||r.texto.slice(0,100)}</strong><small>{data(r.dataAcao)||new Date(r.em).toLocaleDateString('pt-BR')} · {r.nome}</small></summary><div className="processo-detalhes"><p>{r.texto}</p>{r.resultado&&<div><h3>Resultado</h3><p>{r.resultado}</p></div>}{r.proximoPasso&&<div><h3>Próximo passo</h3><p>{r.proximoPasso}</p></div>}{r.etapaId&&<p className="processo-ajuda">Etapa: {item.etapas.find(e=>e.id===r.etapaId)?.titulo||'Etapa não disponível'}</p>}{r.tipo==='acao'&&<ImplantacaoProcesso registro={r} ocupado={ocupado} executar={executar}/>}<p className="processo-ajuda">Salvo em {new Date(r.em).toLocaleString('pt-BR')}{!externo?' · '+(r.compartilhado?'Compartilhado':'Interno'):''}</p></div></details></li>)}</ol></section>;
}
