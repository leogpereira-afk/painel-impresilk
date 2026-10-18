import {materialKey} from '../acm/nesting.mjs';
import {polygonArea} from '../oficina/geometry.mjs';
export const panelsMaterialKey=p=>materialKey({...p.material,colorId:p.material.colorId??`spec:${p.material.subtype||''}`,manufacturer:`${p.material.kind}:${p.material.process}`});
export function snapPanelsPosition(sheet,placement,position,{margin=sheet.trim||0,gap=sheet.kerf||0,tolerance=3}={}){
 const others=sheet.placements.filter(p=>p.pieceId!==placement.pieceId),nearest=(value,anchors)=>{const found=anchors.filter(a=>Math.abs(value-a)<=tolerance).sort((a,b)=>Math.abs(value-a)-Math.abs(value-b));return found[0]??value;};
 return{x:nearest(position.x,[margin,sheet.width-margin-placement.width,...others.flatMap(p=>[p.x+p.width+gap,p.x-placement.width-gap])]),y:nearest(position.y,[margin,sheet.height-margin-placement.height,...others.flatMap(p=>[p.y+p.height+gap,p.y-placement.height-gap])])};
}
export function findPanelsSpace(sheet,piece,stock,budget={remaining:20000}){
 if(sheet.materialKey!==panelsMaterialKey(piece))return null;
 const xs=[...new Set([stock.margin,...sheet.placements.map(p=>p.x+p.width+stock.gap)])].sort((a,b)=>a-b),ys=[...new Set([stock.margin,...sheet.placements.map(p=>p.y+p.height+stock.gap)])].sort((a,b)=>a-b);
 for(const rotated of piece.rotations?.includes(90)&&!piece.material.directional&&!['wood','brushed'].includes(piece.material.finish)?[false,true]:[false])for(const y of ys)for(const x of xs){
  if(--budget.remaining<0)return null;
  const width=rotated?piece.height:piece.width,height=rotated?piece.width:piece.height;
  if(x+width>sheet.width-stock.margin+1e-6||y+height>sheet.height-stock.margin+1e-6)continue;
  if(sheet.placements.some(p=>x<p.x+p.width+stock.gap-1e-6&&x+width+stock.gap>p.x+1e-6&&y<p.y+p.height+stock.gap-1e-6&&y+height+stock.gap>p.y+1e-6))continue;
  return{id:piece.id,pieceId:piece.id,x,y,width,height,rotated,locked:false};
 }
 return null;
}
export function refreshPanelsMetrics(plan,result,quantity){
 const counts={};plan.netArea=0;plan.grossArea=0;plan.usefulArea=0;
 for(const s of plan.sheets){s.usedArea=0;s.occupiedArea=0;s.remnants=[];for(const a of s.placements){const p=plan.instances.find(p=>p.id===a.pieceId);s.usedArea+=polygonArea(p.contour)-(p.cutouts||[]).reduce((n,r)=>n+polygonArea(r),0)-(p.holes||[]).reduce((n,h)=>n+Math.PI*(h.diameter/2)**2,0);s.occupiedArea+=a.width*a.height;counts[p.typeId]=(counts[p.typeId]||0)+(!p.extra?1:0);}plan.netArea+=s.usedArea;plan.grossArea+=s.width*s.height;plan.usefulArea+=(s.width-2*s.trim)*(s.height-2*s.trim);}
 Object.assign(plan,{allocated:plan.sheets.reduce((n,s)=>n+s.placements.length,0),requested:plan.instances.length,wasteArea:plan.grossArea-plan.netArea,utilization:plan.grossArea?plan.netArea/plan.grossArea*100:0,usefulUtilization:plan.usefulArea?plan.netArea/plan.usefulArea*100:0,completeSets:Math.min(quantity,...result.pieces.map(p=>Math.floor((counts[p.id]||0)/(p.perSet||1))))});return plan;
}
