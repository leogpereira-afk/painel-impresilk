import {calculatePlan} from './planner.mjs';
import {LIMITS} from '../acm/model.mjs';

// Advisory only: the caller applies one patch after an explicit user action.
// These are verified improvements from a bounded search, not an optimum claim.
export const MAX_SIZE_REDUCTION_MM=100;
const safePlan=input=>{try{return calculatePlan(input);}catch{return {valid:false,rows:[]};}};
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
export function suggestSizeReduction(input) {
 if(!input||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100||input.rows.some(r=>!r||typeof r!=='object'))return [];
 const stock=input.stock;
 if(!stock||![stock.width,stock.length,stock.trim,stock.kerf].every(numeric)||stock.trim<0||stock.kerf<0||typeof stock.rotation!=='boolean')return [];
 const usable=[stock.width-2*stock.trim,stock.length-2*stock.trim],gap=stock.kerf;
 if(!usable.every(v=>v>0))return [];
 const baseline=safePlan(input),out=[];
 let evaluated=0,probePieces=0;
 for(const row of input.rows){
  if(out.length===3||evaluated>=48)break;
  if(row.kind==='column'||(row.panelsX??1)*(row.panelsY??1)>1)continue;
  if(!numeric(row.width)||!numeric(row.height)||row.width<=0||row.height<=0||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>LIMITS.pieces)continue;
  const solo={...input,rows:[row],reserves:{},remnants:[]};
  const before=safePlan(solo),piece=before.rows?.[0];
  if(!piece?.blank)continue;
  const rowPieceIds=new Set((baseline.pieces??[]).filter(p=>p.rowId===row.id).map(p=>p.id));
  const rowUsesNewStock=baseline.valid&&baseline.result.sheets.some(s=>s.source==='sheet'&&s.placements.some(p=>rowPieceIds.has(p.pieceId)));
  const rotated=stock.rotation&&!piece.material.directional,cache=new Map();
  const capacity=r=>{
   const key=`${r.width}/${r.height}`;
   if(cache.has(key))return cache.get(key);
   const single=safePlan({...solo,rows:[{...r,quantity:1}]}),b=single.rows?.[0]?.blank;
   if(!single.valid||!b){cache.set(key,0);return 0;}
   // Probe beyond the area upper bound whenever possible. At the engine limit
   // the value is a proven fitting quantity; it is never advertised as optimal.
   const probe=Math.max(1,Math.min(LIMITS.pieces,Math.floor(usable[0]*usable[1]/(b.width*b.height))+1));
   if(probePieces+probe>12000)return null;
   probePieces+=probe;
   const packed=safePlan({...solo,rows:[{...r,quantity:probe}]});
   const count=packed.valid?Math.max(0,...packed.result.sheets.map(s=>s.placements.length)):0;
   cache.set(key,count);return count;
  };
  const options=[],candidates=[];
  for(const axis of ['width','height']){
   const original=row[axis],limit=Math.min(MAX_SIZE_REDUCTION_MM,original-.1);
   if(limit<=0)continue;
   const blankDimension=axis==='width'?piece.blank.width:piece.blank.height,extra=blankDimension-original,values=new Set();
   // Grid thresholds are rounded down to the UI's 0.01 cm precision.
   for(const span of rotated?usable:[usable[axis==='width'?0:1]]){
    const from=Math.max(1,Math.floor((span+gap)/(blankDimension+gap)));
    const to=Math.min(LIMITS.pieces,Math.floor((span+gap)/(blankDimension-limit+gap))+1);
    for(let count=from;count<=to;count++){
     const next=Math.floor(((span+gap)/count-gap-extra+1e-7)*10)/10,reduction=original-next;
     if(next>=.1&&reduction>=.05&&reduction<=limit)values.add(next);
    }
   }
   // The closest thresholds are the least intrusive size adjustments.
   for(const next of [...values].sort((a,b)=>b-a).slice(0,8))candidates.push({axis,original,next,limit,reduction:original-next});
  }
  candidates.sort((a,b)=>a.reduction-b.reduction);
  let oldCapacity;
  for(const {axis,original,next,limit,reduction} of candidates){
   if(evaluated++>=48)break;
   const changed={...row,[axis]:next},patch={[axis]:next};
   const full=safePlan({...input,rows:input.rows.map(r=>r.id===row.id?changed:r)});
   if(!full.valid)continue;
   const savedSheets=baseline.valid?baseline.total-full.total:0;
   // A capacity improvement alone must never increase the actual purchase.
   if(baseline.valid&&savedSheets<0)continue;
   // Capacity on hypothetical new stock is not a benefit for a row already
   // supplied by remnants. Only real savings elsewhere justify shrinking it.
   if(baseline.valid&&!rowUsesNewStock&&savedSheets<=0)continue;
   const fits=!baseline.valid&&!before.valid&&safePlan({...solo,rows:[changed]}).valid;
   oldCapacity??=capacity(row);
   const newCapacity=capacity(changed);
   if(oldCapacity==null||newCapacity==null)continue;
   if(savedSheets<=0&&newCapacity<=oldCapacity&&!fits)continue;
   if(newCapacity>oldCapacity){
    const check=safePlan({...solo,rows:[{...changed,quantity:newCapacity}]});
    if(!check.valid||check.total!==1)continue;
   }
   options.push({rowId:row.id,axis,original,suggested:next,reduction,patch,
    oldCapacity,newCapacity,savedSheets:Math.max(0,savedSheets),
    sheets:full.total,fits,scope:'one-dimension',maxReduction:limit});
  }
  options.sort((a,b)=>b.savedSheets-a.savedSheets||Number(b.fits)-Number(a.fits)||b.newCapacity-a.newCapacity||a.reduction-b.reduction);
  if(options[0])out.push(options[0]);
 }
 return out;
}
