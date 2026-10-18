import {nestPieces} from '../acm/nesting.mjs';
import {letterGeometrySignature} from './input.mjs';
import {fabricationSignature} from './fabrication.mjs';
export function letterNestingSignature(project,result){return JSON.stringify([letterGeometrySignature(project),result?.signature,fabricationSignature(project)]);}
export function nestLetters(project,result,fabrication){return {...nestLetterPieces(project,result,fabrication),signature:fabrication?.signature===fabricationSignature(project)?letterNestingSignature(project,result):null,projectId:project.id,revision:project.revision};}
function nestLetterPieces(project,result,fabrication){
 if(result.errors.length)return {sheets:[],unplaced:[],error:'Corrija a geometria antes do plano de estudo.'};
 if(fabrication&&fabrication.signature!==fabricationSignature(project))return {sheets:[],unplaced:[],error:'Desenvolvimento de outra revisão ou configuração. Recalcule as faixas.'};
 if(fabrication?.errors?.length)return {sheets:[],unplaced:[],error:fabrication.errors.join(' ')};
 const developed=fabrication?.strips.flatMap(strip=>strip.segments.map(segment=>({...result.components.find(c=>c.letterId===strip.letterId&&c.role==='side'),...segment,kind:'strip',label:strip.label,material:strip.material,thickness:strip.thickness,operation:strip.operation,width:segment.grossLengthMm??segment.nominalLengthMm,height:segment.widthMm??segment.depthMm,areaMm2:(segment.grossLengthMm??segment.nominalLengthMm)*(segment.widthMm??segment.depthMm)})));
 const strips=developed||result.strips.map(strip=>({...strip,width:strip.nominalLengthMm,height:strip.depth}));
 const linearStock=strips.filter(s=>s.operation==='manual-cut');
 const developmentPending=!!fabrication?.strips.some(s=>s.grossLengthMm===null||s.widthMm===null);
 const pieces=[...result.components.filter(c=>c.role!=='side'),...strips.filter(s=>s.operation!=='manual-cut')].map(c=>({...c,blank:{width:c.width,height:c.height,contour:[[0,0],[c.width,0],[c.width,c.height],[0,c.height]]},material:{core:c.material,sku:c.sku||`material:${c.material}`,manufacturer:c.manufacturer||'',thickness:c.thickness,colorId:c.colorId??null,color:c.color??null,finish:c.finish??null,lot:c.lot||'',directional:!!c.directional}}));
 if(pieces.length>500)return {sheets:[],unplaced:pieces.map(p=>p.id),error:'O estudo aceita até 500 componentes. Divida o conjunto.'};
 const stock=project.stock||{width:1220,length:2440,trim:10,kerf:3,rotation:true,remnants:[]};
 if(![stock.width,stock.length].every(n=>Number.isFinite(n)&&n>0)||![stock.trim,stock.kerf].every(n=>Number.isFinite(n)&&n>=0))return {sheets:[],unplaced:[],error:'Confira formato, refilo e separação.'};
 const operations=[...new Set(pieces.map(p=>p.operation))].sort(),consumedRemnants=new Set();
 const batches=[];let count=0;
 for(const operation of operations){
  const available={...stock,remnants:(stock.remnants||[]).filter(r=>!consumedRemnants.has(r.id))};
  if(stock.quantity!=null)available.quantity=Math.max(0,stock.quantity-count);
  const batch=nestPieces(pieces.filter(p=>p.operation===operation),available);
  batch.sheets=batch.sheets.map(sheet=>{if(sheet.source==='remnant')consumedRemnants.add(sheet.sourceId);return {...sheet,id:sheet.source==='sheet'?`CH${++count}`:sheet.id,operation}});batches.push(batch);
 }
 const n={sheets:batches.flatMap(b=>b.sheets),unplaced:batches.flatMap(b=>b.unplaced),errors:batches.flatMap(b=>b.errors||[]),warnings:batches.flatMap(b=>b.warnings||[]),grossArea:batches.reduce((sum,b)=>sum+b.grossArea,0),usedArea:batches.reduce((sum,b)=>sum+b.usedArea,0),occupiedArea:batches.reduce((sum,b)=>sum+b.occupiedArea,0),wasteArea:batches.reduce((sum,b)=>sum+b.wasteArea,0)};
 n.utilization=n.grossArea?n.usedArea/n.grossArea*100:0;
 const byId=new Map(pieces.map(p=>[p.id,p]));
 const sheets=n.sheets.map(sheet=>({...sheet,actualAreaMm2:sheet.placements.reduce((sum,p)=>sum+(byId.get(p.pieceId)?.areaMm2||0),0)}));
 const actualAreaMm2=sheets.reduce((sum,s)=>sum+s.actualAreaMm2,0);
 return {...n,sheets,pieces,linearStock,developmentPending,linearLengthM:linearStock.reduce((sum,s)=>sum+s.width/1000,0),label:'Envelopes retangulares conservadores · estudo nominal',envelopeAreaMm2:n.usedArea,actualAreaMm2,projectActualAreaMm2:result.totals.areaMm2,actualUtilization:n.grossArea?actualAreaMm2/n.grossArea*100:0,utilizationBasis:'Ocupação pelos envelopes retangulares / área bruta das chapas e retalhos consumidos.',actualUtilizationBasis:'Área física nominal das peças alocadas / área bruta das chapas e retalhos consumidos.'};
}
export function letterStockPriceKey(sheet){return JSON.stringify([sheet.materialKey,sheet.width,sheet.length,sheet.source,sheet.sourceId??null]);}
export function costLetters(project,result,nesting){
 const rows=(nesting?.sheets||[]).map(sheet=>{const key=letterStockPriceKey(sheet),price=project.prices?.[key];return {id:sheet.id,material:sheet.material.core,materialKey:sheet.materialKey,source:sheet.source,sourceId:sheet.sourceId??null,quantity:1,unit:sheet.source==='remnant'?'retalho':'chapa',width:sheet.width,length:sheet.length,price:Number.isFinite(price)&&price>=0?price:null,key}});
 const known=rows.filter(r=>r.price!==null).reduce((s,r)=>s+r.price,0);
 const complete=rows.length>0&&!rows.some(r=>r.price===null)&&!(nesting?.unplaced?.length)&&!nesting?.error&&!(nesting?.errors?.length)&&!nesting?.developmentPending&&!(nesting?.linearStock?.length);
 return {rows,known,complete,total:complete?known:null,appliedM2:result.totals.areaMm2/1e6,purchasedM2:rows.filter(r=>r.source==='sheet').reduce((s,r)=>s+r.width*r.length/1e6,0),consumedStockM2:rows.reduce((s,r)=>s+r.width*r.length/1e6,0),remnantM2:rows.filter(r=>r.source==='remnant').reduce((s,r)=>s+r.width*r.length/1e6,0)};
}
