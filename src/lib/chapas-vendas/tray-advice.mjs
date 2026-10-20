import {suggestTrays} from './planner.mjs';

const materialFields=['colorId','colorName','finish','thickness','directional','manufacturer','sku','coating'];
const rowFields=['kind','width','height','quantity','folded','left','right','top','bottom','panelsX','panelsY','columnMode','sideLeft','sideRight',...materialFields];
const stockFields=['width','length','trim','kerf','rotation','materialKey'];
const stockMaterialFields=['manufacturer','sku','colorId','color','finish','thickness','skin','core','lot','directional'];
const pick=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)
 ? Object.fromEntries(fields.map(key=>[key,value[key]])):value;

// Type tags keep invalid input distinct from valid input: NaN is not null,
// and a malformed material field cannot impersonate an undefined value.
function canonical(value,seen=new Set()){
 if(value===null)return ['null'];
 const type=typeof value;
 if(type==='number')return ['number',String(value)];
 if(type==='string'||type==='boolean')return [type,value];
 if(type==='undefined')return [type];
 if(type!=='object'||seen.has(value))throw Error('Uncacheable value');
 seen.add(value);
 const out=Array.isArray(value)
  ? ['array',value.map(item=>canonical(item,seen))]
  : ['object',Object.keys(value).sort().map(key=>[key,canonical(value[key],seen)])];
 seen.delete(value);return out;
}
function adviceKey(input,row){
 if(!input||typeof input!=='object'||!row||typeof row!=='object'||row.id!=null&&typeof row.id!=='string')return null;
 const stock=pick(input.stock,stockFields);
 if(stock&&typeof stock==='object'&&!Array.isArray(stock))stock.material=pick(input.stock.material,stockMaterialFields);
 const remnants=Array.isArray(input.remnants)?input.remnants.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return item;
  return {
   ...pick(item,['id','width','length','quantity']),
   // The label is absent from the advisory output, but its validity still
   // matters to prepareRemnants. Keep that check without retaining the label.
   nameValid:item.name==null||typeof item.name==='string'&&item.name.length<=120,
   material:pick(item.material,materialFields),
  };
 }):input.remnants??[];
 return JSON.stringify(canonical({row:pick(row,rowFields),stock,remnants}));
}

/**
 * Bounded, per-screen memoization of tray alternatives. The planner evaluates
 * one row and resets reserves, stock quantity and legacy stock.remnants;
 * those values and unrelated rows therefore do not belong to this key.
 * compute is injectable for deterministic cache tests; UI uses the defaults.
 */
export function createTrayAdvisor({maxEntries=100,compute=suggestTrays}={}){
 if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>100)throw Error('Cache must contain 1 to 100 entries.');
 const cache=new Map();
 return (input,row)=>{
  let key;
  try{key=adviceKey(input,row);}catch{key=null;}
  if(key===null)return compute(input,row);
  if(cache.has(key)){
   const value=cache.get(key);cache.delete(key);cache.set(key,value);
   return structuredClone(value);
  }
  const result=compute(input,row),value=structuredClone(result);
  cache.set(key,value);
  if(cache.size>maxEntries)cache.delete(cache.keys().next().value);
  return structuredClone(value);
 };
}
