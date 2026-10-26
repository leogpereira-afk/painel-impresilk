import {useRef,useState} from 'react';
import {filtrarPessoas,identificarPessoa,usePessoasReunioes} from './reunioes/pessoas.js';
import './reunioes/participantes.css';

const presencas={pendente:'A confirmar',presente:'Presente',ausente:'Ausente',justificada:'Ausência justificada'};

export default function ParticipantesReuniao({participantes,aoMudar,catalogo,presencaEditavel=true}){
 const {pessoas,carregando,erro:erroConsulta,carregar}=usePessoasReunioes(catalogo);
 const buscaRef=useRef(null);
 const [erroLocal,setErro]=useState(''),[busca,setBusca]=useState(''),[area,setArea]=useState('');
 const [verTodas,setVerTodas]=useState(false),[detalhesAbertos,setDetalhesAbertos]=useState(false);
 const areas=[...new Set(pessoas.map(p=>p.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const filtroAtivo=!!busca.trim()||!!area,mostrarLista=filtroAtivo||verTodas;
 const ids=new Set(participantes.filter(p=>p.rhId).map(p=>p.rhId));
 const filtradas=filtrarPessoas(pessoas,busca,area),disponiveis=filtradas.filter(p=>!ids.has(p.id));
 const convidados=participantes.filter(p=>!p.rhId),convidadoIncompleto=convidados.some(p=>!p.nome.trim());
 const presentes=participantes.filter(p=>p.presenca==='presente').length;

 function adicionar(lista){
  const novas=lista.filter(p=>!ids.has(p.id));
  if(participantes.length+novas.length>150){setErro('O encontro permite até 150 participantes. Selecione um grupo menor.');return;}
  setErro('');
  aoMudar([...participantes,...novas.map(p=>({id:crypto.randomUUID(),rhId:p.id,...(p.idPessoa?{idPessoa:p.idPessoa}:{}),nome:p.nome,area:p.area,cargo:p.cargo,presenca:'pendente'}))]);
  buscaRef.current?.focus();
 }
 function remover(id){setErro('');aoMudar(participantes.filter(p=>p.id!==id));buscaRef.current?.focus();}
 function alterar(id,campos){aoMudar(participantes.map(p=>p.id===id?{...p,...campos}:p));}
 function vincular(id,rhId){
  const rh=pessoas.find(p=>p.id===rhId);
  if(rh&&!ids.has(rh.id))alterar(id,{rhId:rh.id,idPessoa:rh.idPessoa||'',nome:rh.nome,area:rh.area,cargo:rh.cargo});
 }
 function adicionarConvidado(){
  if(participantes.length>=150){setErro('O encontro permite até 150 participantes.');return;}
  setErro('');setDetalhesAbertos(true);
  aoMudar([...participantes,{id:crypto.randomUUID(),rhId:null,nome:'',presenca:'pendente'}]);
 }

 return <section className="reu-editor-secao reu-participantes-editor">
  <div className="reu-pessoas-cab"><h3>Participantes</h3><span aria-live="polite">{participantes.length} selecionado{participantes.length===1?'':'s'}{presentes>0?` · ${presentes} presente${presentes===1?'':'s'}`:''}</span></div>
  {participantes.length>0&&<div className="reu-pessoas-chips" aria-label="Participantes selecionados">{participantes.map((p,i)=><span className="reu-pessoas-chip" key={p.id}>
   <span>{p.nome||'Convidado sem nome'}<small>{p.rhId?identificarPessoa(p):'Convidado externo'}</small></span>
   <button type="button" aria-label={`Remover ${p.nome||'convidado '+(i+1)}`} title="Remover participante" onClick={()=>remover(p.id)}>×</button>
  </span>)}</div>}
  <div className="reu-pessoas-busca">
   <label>Nome ou ID<input ref={buscaRef} aria-label="Buscar pessoas no RH" placeholder="Buscar no RH…" value={busca} onChange={e=>setBusca(e.target.value)}/></label>
   <label>Setor<select aria-label="Setor das pessoas no RH" value={area} onChange={e=>setArea(e.target.value)}><option value="">Todos os setores</option>{areas.map(a=><option key={a}>{a}</option>)}</select></label>
  </div>
  <div className="reu-pessoas-ferramentas">
   <button type="button" className="btn-ghost" aria-expanded={mostrarLista} onClick={()=>{setBusca('');setArea('');setVerTodas(!mostrarLista);}}>{mostrarLista?'Recolher lista':'Ver todas as pessoas'}</button>
   {mostrarLista&&!carregando&&!erroConsulta&&disponiveis.length>0&&<button type="button" className="btn-outline" onClick={()=>adicionar(disponiveis)}>Adicionar {disponiveis.length} {filtroAtivo?'do filtro':'pessoas'}</button>}
  </div>
  {erroLocal&&<p role="alert" className="reu-erro">{erroLocal}</p>}
  {carregando?<p role="status" className="reu-ajuda">Buscando pessoas no RH…</p>:erroConsulta?<p role="alert" className="reu-erro">{erroConsulta} <button type="button" onClick={carregar}>Tentar novamente</button></p>:mostrarLista?<div className="reu-pessoas-resultados" aria-label="Pessoas disponíveis no RH">
   {disponiveis.map(p=><button type="button" className="reu-pessoas-opcao" key={p.id} aria-label={`Adicionar ${p.nome} · ${identificarPessoa(p)}`} onClick={()=>adicionar([p])}><span><strong>{p.nome}</strong><small>{identificarPessoa(p)} · {p.area}{p.cargo?' · '+p.cargo:''}</small></span><span aria-hidden="true">+</span></button>)}
   {!disponiveis.length&&<p className="reu-ajuda">{filtradas.length?'Todas as pessoas deste filtro já estão selecionadas.':'Nenhuma pessoa encontrada. Tente outro nome, ID ou setor.'}</p>}
  </div>:<p className="reu-ajuda reu-pessoas-dica">Busque por nome, ID oficial ou ficha RH, ou escolha um setor.</p>}
  <div className="reu-pessoas-rodape"><button type="button" className="btn-outline" disabled={participantes.length>=150} onClick={adicionarConvidado}>+ Convidado externo</button><small>Até 150 participantes</small></div>
  {participantes.length>0&&<details className="reu-pessoas-detalhes" open={detalhesAbertos||convidadoIncompleto} onToggle={e=>setDetalhesAbertos(e.currentTarget.open)}>
   <summary onClick={e=>{if(convidadoIncompleto)e.preventDefault();}}>Presença e convidados<span>{convidados.length?`${convidados.length} externo${convidados.length===1?'':'s'}`:'Por encontro'}</span></summary>
   <p className="reu-ajuda">{convidadoIncompleto?'Preencha o nome do convidado ou remova a inclusão para continuar.':presencaEditavel?'Confira a presença neste encontro. Convidados podem ser vinculados a uma ficha do RH.':'A presença é individual de cada encontro e será preservada.'}</p>
   <div className="reu-pessoas-presencas">{participantes.map((p,i)=><div className="reu-pessoas-presenca" key={p.id}>
    <div>{p.rhId?<><strong>{p.nome}</strong><small>{identificarPessoa(p)} · {p.area}</small></>:<>
     <label>Nome do convidado<input aria-label={`Participante ${i+1}`} placeholder="Nome do convidado" required maxLength={180} value={p.nome} onChange={e=>alterar(p.id,{nome:e.target.value})}/></label>
     <select aria-label={`Vincular ${p.nome||'participante '+(i+1)} ao RH`} value="" onChange={e=>vincular(p.id,e.target.value)}><option value="">Convidado externo · vincular ao RH</option>{pessoas.filter(x=>!ids.has(x.id)).map(x=><option key={x.id} value={x.id}>{x.nome} · {identificarPessoa(x)} · {x.area}</option>)}</select>
    </>}</div>
    <select disabled={!presencaEditavel} aria-label={`Presença de ${p.nome||i+1}`} value={p.presenca} onChange={e=>alterar(p.id,{presenca:e.target.value})}>{Object.entries(presencas).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select>
   </div>)}</div>
  </details>}
 </section>;
}
