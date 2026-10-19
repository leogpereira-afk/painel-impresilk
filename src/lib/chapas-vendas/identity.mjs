// Local draft references are independent of ERP order numbers; no shared sequence is implied.
export function identifyPlan(input,{requester='',date=new Date(),uuid=crypto.randomUUID()}={}){
 if(input.planNumber)return input;
 const stamp=date.toISOString().slice(0,10).replaceAll('-','');
 return {...input,planId:uuid,planNumber:`PC-${stamp}-${uuid.replaceAll('-','').slice(-12).toUpperCase()}`,createdAt:date.toISOString(),requester};
}
export const draftPrefix=owner=>`impresilk.chapas-vendas.v1.${encodeURIComponent(owner)}.`;
export function saveDraft(storage,owner,input){
 if(!owner||!input.planId||!input.planNumber)throw Error('Plano sem identificação.');
 const prefix=draftPrefix(owner);
 storage.setItem(prefix+input.planId,JSON.stringify(input));
 storage.setItem(prefix+'active',input.planId);
}
export function readDraft(storage,owner,id){
 if(!owner)return null;
 const prefix=draftPrefix(owner),key=id||storage.getItem(prefix+'active');
 if(!key)return null;
 const raw=storage.getItem(prefix+key);if(!raw)return null;
 const p=JSON.parse(raw);
 if(!p||p.planId!==key||typeof p.planNumber!=='string'||!Array.isArray(p.rows)||!p.rows.length||p.rows.length>100||!p.stock||!p.material||p.rows.some(r=>!r||typeof r.id!=='string'))throw Error('Rascunho inválido.');
 return p;
}
export function listDrafts(storage,owner){
 const prefix=draftPrefix(owner),out=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i);if(!key?.startsWith(prefix)||key===prefix+'active')continue;
  try{const p=readDraft(storage,owner,key.slice(prefix.length));if(p)out.push({id:p.planId,number:p.planNumber,name:p.name,createdAt:p.createdAt});}catch{ /* Keep unreadable data untouched. */ }
 }
 return out.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
