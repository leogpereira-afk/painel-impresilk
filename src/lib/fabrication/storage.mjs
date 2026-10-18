import {createIndexedDBBackend} from './indexeddb.mjs';
const copy=value=>structuredClone(value);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function fingerprint(value){const s=JSON.stringify(value);let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return (n>>>0).toString(16)}
export function createFabricationStorage({product,validate,backend=createIndexedDBBackend(),maxBytes=24*1024*1024,now=()=>new Date().toISOString()}={}){
 if(!product||typeof validate!=='function')throw Error('Contrato de produto ausente.');
 const check=p=>{const result=validate(p);if(Array.isArray(result)&&result.length)throw Error(result.map(v=>v.message||v).join(' '));if(!p?.id||!Number.isSafeInteger(p.revision)||p.revision<1||p.product!==product)throw Error('Projeto incompatível.');if(bytes(p)>4*1024*1024)throw Error('Projeto excede o limite de 4 MiB.');return copy(p)};
 const key=owner=>{if(typeof owner!=='string'||!owner.trim()||owner.length>200)throw Error('Identidade ausente.');return JSON.stringify([product,owner])};
 function envelope(raw){if(raw===undefined)return {version:1,draft:null,revisions:[],documents:[]};if(raw?.version!==1||!Array.isArray(raw.revisions)||!Array.isArray(raw.documents))throw Error('Arquivo local inválido; cópia preservada.');for(const r of [raw.draft,...raw.revisions].filter(Boolean)){check(r.project);if(r.hash!==fingerprint(r.project))throw Error('Falha de integridade; arquivo preservado.');}for(const d of raw.documents)if(d.hash!==fingerprint(d.content))throw Error('Falha de integridade do documento.');return raw}
 async function tx(owner,mode,fn){return backend.transact(key(owner),mode,raw=>{const e=envelope(raw),r=fn(e);if(mode==='readwrite'&&bytes(e)>maxBytes)throw Error('Arquivo excede o limite local; conteúdo anterior preservado.');return {envelope:e,result:copy(r)}})}
 function archive(e,p){const old=e.revisions.find(r=>r.project.id===p.id&&r.project.revision===p.revision);if(old){if(JSON.stringify(old.project)!==JSON.stringify(p))throw Error('Revisão imutável: gere uma nova revisão.');return old}if(e.revisions.length>=50)throw Error('Limite de 50 revisões; exporte e abra um novo projeto.');const r={project:copy(p),hash:fingerprint(p),createdAt:now()};e.revisions.push(r);return r}
 return {
  load:owner=>tx(owner,'readonly',e=>e.draft),
  save:(owner,project,expectedVersion)=>{const p=check(project);return tx(owner,'readwrite',e=>{if((e.draft?.version||0)!==expectedVersion)throw Object.assign(Error('Outra aba alterou este rascunho. Exporte sua cópia antes de recarregar.'),{code:'CONFLICT'});return e.draft={project:p,version:expectedVersion+1,hash:fingerprint(p),updatedAt:now()}})},
  revisions:owner=>tx(owner,'readonly',e=>e.revisions.slice().reverse()),
  archive:(owner,project)=>{const p=check(project);return tx(owner,'readwrite',e=>archive(e,p))},
  putDocument:(owner,project,document)=>{const p=check(project);if(!document?.name||typeof document.content!=='string'||!document.content||document.content.length>12*1024*1024)throw Error('Documento inválido ou acima do limite.');return tx(owner,'readwrite',e=>{archive(e,p);const id=JSON.stringify([p.id,p.revision,document.name]),old=e.documents.find(d=>d.id===id);if(old){if(old.content!==document.content||old.mime!==document.mime)throw Error('Documento imutável; use nova revisão ou nome.');return old}if(e.documents.length>=100)throw Error('Limite de documentos locais atingido.');const d={id,projectId:p.id,revision:p.revision,name:document.name,mime:document.mime,content:document.content,hash:fingerprint(document.content),createdAt:now()};e.documents.push(d);return d})},
  documents:(owner,projectId)=>tx(owner,'readonly',e=>e.documents.filter(d=>d.projectId===projectId).slice().reverse()),
  parse:text=>{if(typeof text!=='string'||text.length>8*1024*1024)throw Error('Backup acima do limite.');const raw=JSON.parse(text);if(raw.format!=='impresilk-fabrication'||raw.product!==product||raw.version!==1)throw Error('Formato de backup incompatível.');return check(raw.project)},
  serialize:project=>JSON.stringify({format:'impresilk-fabrication',product,version:1,project:check(project)},null,2),
 };
}
