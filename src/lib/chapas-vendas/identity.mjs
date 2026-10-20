// Local draft references are independent of ERP order numbers; no shared sequence is implied.
export function identifyPlan(input,{requester='',date=new Date(),uuid=crypto.randomUUID()}={}){
 if(input.planNumber)return input;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const stamp=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('');
 return {...input,planId:uuid,planNumber:`PC-${stamp}-${uuid.replaceAll('-','').slice(-12).toUpperCase()}`,createdAt:date.toISOString(),requester};
}
export const draftPrefix=owner=>`impresilk.chapas-vendas.v1.${encodeURIComponent(owner)}.`;
const revision=plan=>plan.draftRevision??0;
const validRevision=plan=>Number.isSafeInteger(revision(plan))&&revision(plan)>=0;
const content=plan=>JSON.stringify(Object.fromEntries(Object.entries(plan).filter(([key])=>!['draftRevision','draftUpdatedAt'].includes(key))));
function parseDraft(raw,key){
 const p=JSON.parse(raw);
 if(!p||p.planId!==key||typeof p.planNumber!=='string'||!Array.isArray(p.rows)||!p.rows.length||p.rows.length>100||!p.stock||!p.material||p.rows.some(r=>!r||typeof r.id!=='string')||!validRevision(p))throw Error('Rascunho inválido.');
 return p;
}
// The caller must retain result.plan (including draftRevision) after a save.
// Saving it again is a no-op. A stale edit becomes a separate, identified plan;
// the previously saved version remains available under its original number.
export function saveDraft(storage,owner,input){
 if(!owner||!input.planId||!input.planNumber||!validRevision(input))throw Error('Plano sem identificação ou revisão válida.');
 const prefix=draftPrefix(owner),raw=storage.getItem(prefix+input.planId);
 let current=null,reason=null;
 if(raw!==null){
  try{current=parseDraft(raw,input.planId);}catch{reason='unreadable-draft';}
 }
 if(current&&content(current)===content(input)){
  storage.setItem(prefix+'active',current.planId);
  return {plan:current,saved:false,conflict:false,reason:null};
 }
 if(current&&revision(current)!==revision(input))reason='revision-conflict';
 const now=new Date();let plan;
 if(reason){
  plan=identifyPlan({...input,planId:null,planNumber:null},{requester:input.requester||'',date:now});
  if(storage.getItem(prefix+plan.planId)!==null)throw Error('Não foi possível criar uma cópia do rascunho. Tente novamente.');
  plan={...plan,draftRevision:1,draftUpdatedAt:now.toISOString(),draftForkOf:{planId:input.planId,planNumber:input.planNumber,revision:revision(input)}};
 }else{
  plan={...input,draftRevision:(current?revision(current):0)+1,draftUpdatedAt:now.toISOString()};
 }
 storage.setItem(prefix+plan.planId,JSON.stringify(plan));
 storage.setItem(prefix+'active',plan.planId);
 return {plan,saved:true,conflict:!!reason,reason,...(reason?{originalPlanId:input.planId,originalPlanNumber:input.planNumber}:{})};
}
export function readDraft(storage,owner,id){
 if(!owner)return null;
 const prefix=draftPrefix(owner),key=id||storage.getItem(prefix+'active');
 if(!key)return null;
 const raw=storage.getItem(prefix+key);if(!raw)return null;
 return parseDraft(raw,key);
}
export function listDrafts(storage,owner){
 const prefix=draftPrefix(owner),out=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i);if(!key?.startsWith(prefix)||key===prefix+'active')continue;
  try{const p=readDraft(storage,owner,key.slice(prefix.length));if(p)out.push({id:p.planId,number:p.planNumber,name:p.name,createdAt:p.createdAt});}catch{ /* Keep unreadable data untouched. */ }
 }
 return out.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
