import {useEffect,useRef,useState} from 'react';
import {acmRequest} from '../../lib/acm/cloud.js';
import {getToken} from '../../lib/sessao.js';
import {validateProject} from '../../lib/acm/storage.mjs';
import {nextCloudRevision,preserveBeforeReplacing,projectStamp,requireUnchangedProject} from '../../lib/acm/cloud-concurrency.mjs';

export function CloudProjects({project,onLoad,onFreeze,capabilities,setCapabilities,versions}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[projects,setProjects]=useState([]),[revisions,setRevisions]=useState([]);
 const fallbackVersions=useRef({}),latest=useRef(project),alive=useRef(true),running=useRef(false);
 const knownVersions=versions||fallbackVersions;
 latest.current=project;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const show=text=>{if(alive.current)setMessage(text)};
 async function run(fn){if(running.current)return;running.current=true;setBusy(true);setMessage('');const token=getToken();const check=()=>{if(!alive.current)throw new Error('Operação encerrada ao sair dos projetos na nuvem.');if(getToken()!==token)throw new Error('A sessão mudou. Abra novamente os projetos da conta atual.');};try{await fn(check)}catch(e){show(e.message)}finally{running.current=false;if(alive.current)setBusy(false)}}
 async function connect(check){const c=await acmRequest('capabilities');check();setCapabilities(c);if(c.persistence){const r=await acmRequest('list');check();setProjects(r.projects);show('Servidor conectado. Os projetos são privados da sua conta.')}else show(c.assistant.reason)}
 async function save(check){
  const snapshot=validateProject(latest.current);
  if(knownVersions.current[snapshot.id]===undefined){const list=await acmRequest('list');check();const existing=list.projects.find(p=>p.id===snapshot.id);if(existing)throw new Error('Este projeto já existe na nuvem. Abra a versão salva antes de atualizá-lo, ou crie um novo projeto.');knownVersions.current[snapshot.id]=0}
  const frozen=validateProject(await onFreeze(snapshot));check();
  const r=await acmRequest('saveRevision',{project:frozen,expectedVersion:knownVersions.current[frozen.id]});
  // Acknowledged writes retain their CAS version even when refresh later fails.
  knownVersions.current[frozen.id]=r.version;
  check();show(`Revisão ${r.project.revision} de “${r.project.name}” salva na nuvem.`);
  try{const [list,history]=await Promise.all([acmRequest('list'),acmRequest('revisions',{id:frozen.id})]);check();setProjects(list.projects);setRevisions(history.revisions.map(x=>({...x,projectId:frozen.id})))}catch{show(`Revisão ${r.project.revision} salva na nuvem. A lista não pôde ser atualizada; confira a conexão.`)}
 }
 async function open(id,check){
  const [record,history]=await Promise.all([acmRequest('get',{id}),acmRequest('revisions',{id})]);check();
  const incoming=validateProject(record.project),items=history.revisions.map(x=>({...x,projectId:id}));
  const previous=await preserveBeforeReplacing(()=>latest.current,onFreeze);check();
  incoming.revision=nextCloudRevision(incoming,previous,items);
  knownVersions.current[id]=record.version;setRevisions(items);onLoad(incoming);
  show(`Projeto da nuvem aberto como rascunho R${incoming.revision}. A revisão salva permanece preservada.`);
 }
 async function restore(revision,check){
  const data=await acmRequest('getRevision',{id:revision.projectId,revisionId:revision.id});check();
  const incoming=validateProject(data.project);
  const previous=await preserveBeforeReplacing(()=>latest.current,onFreeze);check();
  incoming.revision=nextCloudRevision(incoming,previous,revisions);onLoad(incoming);
  show(`Revisão histórica aberta como novo rascunho R${incoming.revision}.`);
 }
 const visibleRevisions=revisions.filter(item=>item.projectId===project.id);
 return <section className="acm-cloud"><h3>☁️ Projetos na nuvem</h3><p className="acm-help">O salvamento local é automático. A nuvem preserva versões privadas entre computadores, quando o servidor estiver disponível.</p><button disabled={busy} onClick={()=>run(connect)}>{busy?'Conferindo…':capabilities?.persistence?'Atualizar projetos':'Conferir conexão'}</button>{capabilities?.persistence&&<button disabled={busy} onClick={()=>run(save)}>Salvar revisão na nuvem</button>}{message&&<p role="status" className="acm-notice">{message}</p>}{projects.map(p=><div className="acm-revision" key={p.id}><span><strong>{p.name}</strong><small>R{p.revision} · {new Date(p.updatedAt).toLocaleString('pt-BR')}</small></span><button disabled={busy} onClick={()=>run(check=>open(p.id,check))}>Abrir</button></div>)}{!!visibleRevisions.length&&<details className="acm-details"><summary>Revisões na nuvem · {project.name}</summary>{visibleRevisions.map(r=><div className="acm-revision" key={r.id}><span>R{r.revision} · {new Date(r.createdAt).toLocaleString('pt-BR')}</span><button disabled={busy} onClick={()=>run(check=>restore(r,check))}>Restaurar</button></div>)}</details>}</section>;
}

export function AIAssistant({project,onApply,capabilities,setCapabilities}){
 const [prompt,setPrompt]=useState(''),[proposal,setProposal]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[usage,setUsage]=useState(null);
 const latest=useRef(project),alive=useRef(true),running=useRef(false);latest.current=project;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function request(){
  if(running.current)return;running.current=true;setBusy(true);setMessage('');setProposal(null);
  const snapshot=structuredClone(latest.current),stamp=projectStamp(snapshot),token=getToken();
  try{const r=await acmRequest('assistant',{prompt,project:snapshot});if(!alive.current)return;if(getToken()!==token)throw new Error('A sessão mudou; solicite uma nova proposta na conta atual.');setUsage(r.usage);requireUnchangedProject(latest.current,stamp);setProposal({...r.proposal,baseStamp:stamp})}catch(e){if(alive.current)setMessage(e.message)}finally{running.current=false;if(alive.current)setBusy(false)}
 }
 async function check(){if(running.current)return;running.current=true;setBusy(true);setMessage('');try{const c=await acmRequest('capabilities');if(alive.current)setCapabilities(c)}catch(e){if(alive.current)setMessage(e.message)}finally{running.current=false;if(alive.current)setBusy(false)}}
 function apply(){try{requireUnchangedProject(latest.current,proposal.baseStamp);onApply(proposal.edits);setProposal(null)}catch(e){setProposal(null);setMessage(e.message)}}
 const ai=capabilities?.assistant;
 return <details className="acm-details"><summary>✨ Assistente com IA</summary>{!ai?<button disabled={busy} onClick={check}>Conferir disponibilidade da IA</button>:!ai.available?<p className="acm-notice">{ai.reason}</p>:<><p className="acm-help">Modelo: {ai.model}. Limite por pedido: US$ {ai.maxCostUSD}; diário: US$ {ai.dailyBudgetUSD}. Ao analisar, a descrição e as medidas do projeto serão enviadas ao provedor.</p><textarea aria-label="Pedido ao assistente com IA" value={prompt} maxLength={4000} rows="4" onChange={e=>setPrompt(e.target.value)} placeholder="Descreva a fachada e peça alternativas…"/><button disabled={busy||!prompt.trim()} onClick={request}>{busy?'Analisando…':'Analisar com IA'}</button></>}{message&&<p role="status" className="acm-error">{message}</p>}{proposal&&<div className="acm-proposal"><h4>{proposal.summary}</h4><ul>{proposal.edits.map((e,i)=><li key={i}>{e.path}: {String(e.value)}</li>)}</ul>{proposal.questions.map(q=><p key={q}>{q}</p>)}<button disabled={!proposal.edits.length||busy} onClick={apply}>Aplicar estas alterações</button></div>}{usage&&<p className="acm-help">Uso deste pedido: {usage.inputTokens??'—'} tokens de entrada; {usage.outputTokens??'—'} de saída. Custo estimado: {typeof usage.costEstimateUSD==='number'?`US$ ${usage.costEstimateUSD.toFixed(5)}`:'não informado'}.</p>}</details>;
}
