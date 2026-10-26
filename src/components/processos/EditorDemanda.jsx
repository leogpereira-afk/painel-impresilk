import {useState} from 'react';
import {SITUACOES,SETORES,PRIORIDADES,ESTADOS_ETAPA,etapaTemAtividade} from '../../../supabase/functions/_shared/processos.mjs';
import './demanda-editor.css';

const normalizar=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
const identificar=p=>/^\d{6}$/.test(String(p?.idPessoa??''))?`ID ${p.idPessoa}`:`Ficha RH ${p?.rhId||p?.id}`;
const dataCurta=v=>v?v.split('-').reverse().join('/'):'Sem prazo';
const valorTempo=(e,k)=>k==='progresso'?(e?.progresso??(['validacao','concluida'].includes(e?.situacao)?100:0)):(e?.[k]||'');
function pendenciasEtapa(e,item,f){
 const anterior=item?.etapas?.find(x=>x.id===e.id);
 const mudou=!anterior||e.situacao!==anterior.situacao||['inicioPrevisto','prazo','inicioReal','fimReal','progresso'].some(k=>valorTempo(e,k)!==valorTempo(anterior,k))||f.situacao==='concluida'&&item?.situacao!=='concluida';
 const inicio=mudou&&(['execucao','validacao','concluida'].includes(e.situacao)||Number(e.progresso)>0),fim=mudou&&['validacao','concluida'].includes(e.situacao),nota=e.situacao==='bloqueada';
 const avancada=!!(inicio&&!e.inicioReal||fim&&!e.fimReal||nota&&!e.nota?.trim());
 return {inicio,fim,nota,avancada,incompleta:!e.titulo?.trim()||!f.envolvidos.some(p=>p.rhId===e.responsavelRhId)||avancada};
}
function Campo({nome,children,amplo=false}){return <label className={amplo?'demanda-campo demanda-amplo':'demanda-campo'}><span>{nome}</span>{children}</label>;}
function Opcoes({mapa}){return Object.entries(mapa).map(([id,nome])=><option key={id} value={id}>{nome}</option>);}

export default function EditorDemanda({item,pessoas=[],aoSalvar,aoCancelar,ocupado}){
 const [f,setF]=useState(()=>item?{...structuredClone(item),versaoAnterior:item.versao}:{id:crypto.randomUUID(),tipo:'demanda',titulo:'',objetivo:'',analise:'',solucao:'',empresa:'',especialidade:'',setor:'empresa',situacao:'nova',prioridade:'normal',prazo:'',responsavelRhId:'',envolvidos:[],etapas:[],versaoAnterior:null});
 const [busca,setBusca]=useState(''),[listaAberta,setListaAberta]=useState(false),[aviso,setAviso]=useState(''),[abertas,setAbertas]=useState({}),[avancadas,setAvancadas]=useState({});
 const mudar=(k,v)=>setF(x=>({...x,[k]:v}));
 const campo=(k,rotulo)=>({'aria-label':rotulo,value:f[k]||'',onChange:e=>mudar(k,e.target.value),...(k==='prazo'?{onInput:e=>mudar(k,e.currentTarget.value)}:{})});
 const mudarEtapa=(id,k,v)=>setF(x=>({...x,etapas:x.etapas.map(e=>e.id===id?{...e,[k]:v,...(k==='situacao'?{progresso:['validacao','concluida'].includes(v)?100:v==='pendente'||e.progresso===100?0:e.progresso??0}:{})}:e)}));
 const campoEtapa=(e,k,rotulo)=>({'aria-label':rotulo,value:e[k]||'',onChange:v=>mudarEtapa(e.id,k,v.target.value),...(['prazo','inicioPrevisto','inicioReal','fimReal'].includes(k)?{onInput:v=>mudarEtapa(e.id,k,v.currentTarget.value)}:{})});
 const catalogo=[...pessoas],idsCatalogo=new Set(pessoas.map(p=>p.id));
 for(const p of [...(item?.envolvidos||[]),...f.envolvidos])if(!idsCatalogo.has(p.rhId)){catalogo.push({...p,id:p.rhId,vinculoAnterior:true});idsCatalogo.add(p.rhId);}
 const termo=normalizar(busca),mostrarLista=listaAberta||!!termo;
 const resultados=mostrarLista?catalogo.filter(p=>!f.envolvidos.some(x=>x.rhId===p.id)&&normalizar([p.nome,p.idPessoa,p.id,p.area,p.cargo].join(' ')).includes(termo)):[];
 const pessoaDoCatalogo=p=>catalogo.find(x=>x.id===p.rhId)||p;
 function adicionar(p){
  if(f.envolvidos.some(x=>x.rhId===p.id))return;
  if(f.envolvidos.length>=150){setAviso('A demanda permite até 150 pessoas envolvidas.');return;}
  setAviso('');mudar('envolvidos',[...f.envolvidos,{rhId:p.id,nome:p.nome,area:p.area||'',cargo:p.cargo||'',...(p.idPessoa?{idPessoa:p.idPessoa}:{})}]);
 }
 function remover(p){
  const etapas=f.etapas.filter(e=>e.responsavelRhId===p.rhId);
  if(etapas.length){setAviso(`Antes de remover ${p.nome}, troque o responsável ${etapas.length===1?'da etapa':'das etapas'}: ${etapas.map(e=>e.titulo||'Nova etapa').join(', ')}.`);setAbertas(x=>({...x,...Object.fromEntries(etapas.map(e=>[e.id,true]))}));return;}
  if(f.responsavelRhId===p.rhId){setAviso(`Escolha outro responsável pela demanda antes de remover ${p.nome}.`);return;}
  setAviso('');mudar('envolvidos',f.envolvidos.filter(x=>x.rhId!==p.rhId));
 }
 function adicionarEtapa(){
  if(!f.envolvidos.length||f.etapas.length>=100)return;
  const id=crypto.randomUUID();mudar('etapas',[...f.etapas,{id,titulo:'',descricao:'',responsavelRhId:f.responsavelRhId||f.envolvidos[0].rhId,prazo:'',situacao:'pendente',dependeDe:[],nota:'',inicioPrevisto:'',inicioReal:'',fimReal:'',progresso:0}]);setAbertas(x=>({...x,[id]:true}));
 }
 function revelarInvalido(event){
  let details=event.target.closest('details');
  while(details){details.open=true;details=details.parentElement?.closest('details');}
 }
 return <form className="demanda-editor" onInvalidCapture={revelarInvalido} onSubmit={e=>{e.preventDefault();setAviso('');aoSalvar(f);}}>
  <header className="demanda-editor-topo"><div><h2>{item?'Editar demanda':'Nova demanda'}</h2><p>Defina a entrega, o responsável e o prazo.</p></div><button type="button" className="btn-outline" disabled={ocupado} onClick={aoCancelar}>Voltar</button></header>
  <fieldset disabled={ocupado} className="demanda-editor-corpo">
   <section className="demanda-editor-secao demanda-editor-essencial" aria-label="O que precisa ser entregue">
    <div className="demanda-campos">
     <Campo nome="Título *" amplo><input required maxLength={180} placeholder="Ex.: Organizar o fluxo de atendimento" {...campo('titulo','Título da demanda')}/></Campo>
     <Campo nome="Objetivo e resultado esperado *" amplo><textarea required rows={3} maxLength={10000} placeholder="O que precisa estar pronto ao final?" {...campo('objetivo','Objetivo e resultado esperado')}/></Campo>
     <Campo nome="Prazo geral"><input type="date" {...campo('prazo','Prazo geral')}/></Campo>
     <Campo nome="Prioridade"><select {...campo('prioridade','Prioridade')}><Opcoes mapa={PRIORIDADES}/></select></Campo>
    </div>
   </section>
   <section className="demanda-editor-secao" aria-labelledby="demanda-pessoas-titulo">
    <div className="demanda-secao-cab"><h3 id="demanda-pessoas-titulo">Quem participa</h3><span>{f.envolvidos.length}/150 pessoas</span></div>
    {!!f.envolvidos.length&&<div className="demanda-pessoas-chips">{f.envolvidos.map(p=><div className="demanda-pessoa-chip" key={p.rhId}><span>{p.nome}<small>{identificar(pessoaDoCatalogo(p))}{pessoaDoCatalogo(p).vinculoAnterior?' · vínculo anterior':''}</small></span><button type="button" aria-label={`Remover ${p.nome} · ${identificar(pessoaDoCatalogo(p))}`} onClick={()=>remover(p)}>×</button></div>)}</div>}
    <div className="demanda-pessoas-busca"><Campo nome="Adicionar pessoas do RH"><input type="search" aria-label="Buscar pessoas no RH" placeholder="Nome, ID RH, ficha ou setor…" value={busca} onChange={e=>setBusca(e.target.value)}/></Campo><button type="button" className="btn-outline" aria-expanded={mostrarLista} onClick={()=>{setListaAberta(!mostrarLista);if(mostrarLista)setBusca('');}}>{mostrarLista?'Recolher lista':'Ver todas'}</button></div>
    {mostrarLista?<div className="demanda-pessoas-resultados" aria-label="Pessoas encontradas">{resultados.map(p=><button type="button" className="demanda-pessoa-opcao" key={p.id} disabled={f.envolvidos.length>=150} onClick={()=>adicionar(p)}><span>{p.nome}<small>{[identificar(p),p.area,p.vinculoAnterior?'vínculo anterior':''].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">+</span></button>)}{!resultados.length&&<p>{catalogo.some(p=>normalizar([p.nome,p.idPessoa,p.id,p.area,p.cargo].join(' ')).includes(termo))?'As pessoas encontradas já estão selecionadas.':'Nenhuma pessoa encontrada.'}</p>}</div>:<p className="demanda-editor-ajuda">Busque uma pessoa para adicioná-la à demanda.</p>}
    {!catalogo.length&&<p className="demanda-editor-aviso" role="alert">Nenhuma pessoa disponível. Confira os cadastros do RH.</p>}
    {aviso&&<p className="demanda-editor-aviso" role="alert">{aviso}</p>}
    <Campo nome="Responsável pela demanda *"><select required {...campo('responsavelRhId','Responsável pela demanda')}><option value="">Selecione entre as pessoas adicionadas</option>{f.envolvidos.map(p=><option key={p.rhId} value={p.rhId}>{p.nome} · {identificar(pessoaDoCatalogo(p))}</option>)}</select></Campo>
   </section>
   <details className="demanda-editor-secao demanda-opcoes"><summary><strong>Setor, situação e análise</strong><span>{SETORES[f.setor]} · {SITUACOES[f.situacao]}</span></summary><div className="demanda-campos demanda-detalhes-corpo">
    <Campo nome="Setor"><select {...campo('setor','Setor da demanda')}><Opcoes mapa={SETORES}/></select></Campo><Campo nome="Situação"><select {...campo('situacao','Situação da demanda')}><Opcoes mapa={SITUACOES}/></select></Campo>
    <Campo nome="Análise interna" amplo><textarea rows={3} maxLength={20000} {...campo('analise','Análise interna')}/></Campo><Campo nome="Solução e decisões" amplo><textarea rows={3} maxLength={20000} {...campo('solucao','Solução e decisões')}/></Campo>
   </div></details>
   <section className="demanda-editor-secao" aria-labelledby="demanda-etapas-titulo"><div className="demanda-secao-cab"><h3 id="demanda-etapas-titulo">Etapas e prazos <small>{f.etapas.length}</small></h3><button type="button" className="btn-outline" disabled={!f.envolvidos.length||f.etapas.length>=100} onClick={adicionarEtapa}>+ Adicionar etapa</button></div>
    <p className="demanda-editor-ajuda">{!f.envolvidos.length?'Adicione uma pessoa para dividir a entrega em etapas.':f.etapas.length>=100?'Limite de 100 etapas atingido.':'Divida a entrega quando precisar. Os prazos aparecem no calendário.'}</p>
    <div className="demanda-etapas">{f.etapas.map((e,i)=>{
     const pendencias=pendenciasEtapa(e,item,f),aberta=!!abertas[e.id]||pendencias.incompleta,avancada=!!avancadas[e.id]||pendencias.avancada;
     return <details key={e.id} className="demanda-etapa" open={aberta} onToggle={v=>{const open=v.currentTarget.open;if(open!==aberta)setAbertas(x=>({...x,[e.id]:open}));}}>
      <summary onClick={v=>{if(pendencias.incompleta)v.preventDefault();}}><span><strong>{i+1}. {e.titulo||'Nova etapa'}</strong><small>{ESTADOS_ETAPA[e.situacao]} · {dataCurta(e.prazo)}</small></span>{pendencias.incompleta&&<em>Completar</em>}</summary>
      <div className="demanda-detalhes-corpo"><div className="demanda-campos">
       <Campo nome="Nome da etapa *" amplo><input required maxLength={180} {...campoEtapa(e,'titulo',`Nome da etapa ${i+1}`)}/></Campo>
       <Campo nome="Responsável da etapa *"><select required {...campoEtapa(e,'responsavelRhId',`Responsável da etapa ${i+1}`)}><option value="">Selecione</option>{f.envolvidos.map(p=><option key={p.rhId} value={p.rhId}>{p.nome} · {identificar(pessoaDoCatalogo(p))}</option>)}</select></Campo>
       <Campo nome="Prazo da etapa"><input type="date" {...campoEtapa(e,'prazo',`Prazo da etapa ${i+1}`)}/></Campo>
       <Campo nome="Situação da etapa" amplo><select {...campoEtapa(e,'situacao',`Situação da etapa ${i+1}`)}><Opcoes mapa={ESTADOS_ETAPA}/></select></Campo>
      </div>
      <details className="demanda-etapa-opcoes" open={avancada} onToggle={v=>{const open=v.currentTarget.open;if(open!==avancada)setAvancadas(x=>({...x,[e.id]:open}));}}><summary onClick={v=>{if(pendencias.avancada)v.preventDefault();}}>Detalhes, dependências e datas reais</summary><div className="demanda-campos demanda-detalhes-corpo">
       <Campo nome="O que precisa ser feito" amplo><textarea rows={3} maxLength={5000} {...campoEtapa(e,'descricao',`Descrição da etapa ${i+1}`)}/></Campo>
       <Campo nome={pendencias.nota?'Motivo do bloqueio *':'Andamento e observações'} amplo><textarea rows={2} required={pendencias.nota} maxLength={5000} {...campoEtapa(e,'nota',`Andamento da etapa ${i+1}`)}/></Campo>
       <Campo nome="Início previsto"><input type="date" {...campoEtapa(e,'inicioPrevisto',`Início previsto da etapa ${i+1}`)}/></Campo>
       <Campo nome={pendencias.inicio?'Início real *':'Início real'}><input type="date" required={pendencias.inicio} {...campoEtapa(e,'inicioReal',`Início real da etapa ${i+1}`)}/></Campo>
       <Campo nome={pendencias.fim?'Término real *':'Término real'}><input type="date" required={pendencias.fim} {...campoEtapa(e,'fimReal',`Término real da etapa ${i+1}`)}/></Campo>
       <Campo nome="Progresso (%)"><input type="number" min={0} max={100} step={1} aria-label={`Progresso da etapa ${i+1}`} value={e.progresso??(['validacao','concluida'].includes(e.situacao)?100:0)} disabled={['pendente','validacao','concluida'].includes(e.situacao)} onChange={v=>mudarEtapa(e.id,'progresso',Number(v.target.value))}/></Campo>
       <p className="demanda-editor-ajuda demanda-amplo">Ao alterar o andamento, informe as datas reais. Datas antigas ausentes permanecem sem informação ao editar outros campos.</p>
       {f.etapas.length>1&&<fieldset className="demanda-dependencias demanda-amplo"><legend>Só iniciar após concluir</legend>{f.etapas.filter(x=>x.id!==e.id).map(x=><label key={x.id}><input type="checkbox" checked={(e.dependeDe||[]).includes(x.id)} onChange={v=>mudarEtapa(e.id,'dependeDe',v.target.checked?[...(e.dependeDe||[]),x.id]:(e.dependeDe||[]).filter(id=>id!==x.id))}/>{x.titulo||'Etapa sem título'}</label>)}</fieldset>}
      </div></details>
      {etapaTemAtividade(item,item?.etapas?.find(x=>x.id===e.id))?<p className="demanda-editor-ajuda">Etapa com atividade registrada. Seu histórico será preservado.</p>:<button type="button" className="demanda-retirar" onClick={()=>mudar('etapas',f.etapas.filter(x=>x.id!==e.id).map(x=>({...x,dependeDe:(x.dependeDe||[]).filter(id=>id!==e.id)})))}>Retirar etapa</button>}
      </div>
     </details>;
    })}</div>
   </section>
   <footer className="demanda-editor-acoes"><span>* Campos obrigatórios</span><div><button className="btn-outline" type="button" onClick={aoCancelar}>Cancelar</button><button className="btn-primary" type="submit">{ocupado?'Salvando…':'Salvar demanda'}</button></div></footer>
  </fieldset>
 </form>;
}
