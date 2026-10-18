import {nestPieces,validateNesting} from '../acm/nesting.mjs';
import {planWorkshopBars as planMetalBars} from './bar-planner.mjs';
import {cutSignature,isPlanCurrent} from './signature.mjs';
import {polygonArea} from './geometry.mjs';
const EPS=1e-6;
const finite=(x,min=0)=>typeof x==='number'&&Number.isFinite(x)&&x>=min;
export function completeSets(types,allocated,requested){
 return types.length?Math.min(requested,...types.map(p=>Math.floor((allocated[p.id]||0)/(p.perSet||1)))):0;
}
export function expandWorkshopPieces(project,result){
 return result.pieces.flatMap(p=>Array.from({length:p.quantity},(_,i)=>({...p,id:`${p.id}-${String(i+1).padStart(2,'0')}`,pieceId:p.id,typeId:p.id,extra:i>=project.quantity*(p.perSet||1),quantity:1})));
}
function nestingPiece(p){
 return{id:p.id,material:{...p.material,manufacturer:`${p.material.kind}:${p.material.process}`},blank:{width:p.width,height:p.height,contour:p.contour.map(q=>[q.x,q.y]),cutouts:(p.cutouts||[]).map(r=>r.map(q=>[q.x,q.y])),holes:p.holes}};
}
function stockFor(project,result){
 const s=project.stock[result.materialId==='metalon'?'galvanized':result.materialId],known=Number.isInteger(s.quantity)&&s.quantity>=0;
 return{width:s.width,length:s.height,trim:s.margin,kerf:s.gap,rotation:true,quantity:known?(s.allowPurchase?2000:s.quantity):0,remnants:s.remnants||[],known,selectedQuantity:known?s.quantity:0};
}
export function planWorkshop(project,result,options={}){
 const signature=cutSignature(project,result.materialId),stock=stockFor(project,result),instances=expandWorkshopPieces(project,result),sheetInstances=instances.filter(p=>p.kind!=='bar'),barInstances=instances.filter(p=>p.kind==='bar');
 const base={id:`${project.id}-R${project.revision}-${result.materialId}`,revision:project.revision,projectId:project.id,signature,materialId:result.materialId,engine:'ACM envelopes + ACM bars / oficina-1',method:'Rápido por envelopes conservadores',instances,sheets:[],bars:[],unplaced:[],completeSets:0,netArea:0,grossArea:0,usefulArea:0,utilization:0,usefulUtilization:0,stockQuantity:stock.selectedQuantity,validation:{valid:false,errors:[]},warnings:[],alternatives:[]};
 if(!result.valid||result.signature!==signature||instances.length>1200){base.validation.errors=['Geometria inválida/desatualizada ou lote acima de 1.200 peças.'];base.unplaced=instances.map(p=>({pieceId:p.id,reason:base.validation.errors[0]}));return base;}
 if(!Array.isArray(stock.remnants)||stock.remnants.length){base.validation.errors=['Retalhos não estão habilitados nesta etapa; use chapas comerciais e mantenha o retalho fora deste plano.'];base.unplaced=instances.map(p=>({pieceId:p.id,reason:base.validation.errors[0]}));return base;}
 const raw=nestPieces(sheetInstances.map(nestingPiece),{...stock,rotation:options.rotation!==false});
 base.sheets=raw.sheets.map(s=>({...s,height:s.length,placements:s.placements.map(a=>({...a,id:a.pieceId})),purchase:s.source==='sheet'&&Number(s.id.slice(2))>stock.selectedQuantity}));
 base.unplaced=[...raw.unplaced];base.alternatives=raw.alternatives.slice(0,3);base.warnings=raw.warnings?.map(x=>x.message)||[];
 if(!stock.known&&sheetInstances.length)base.warnings.push('Quantidade de chapas desconhecida: nenhuma chapa comercial considerada disponível.');
 if(result.materialId==='metalon'&&barInstances.length){
   const cfg=project.components.metalon,segments=barInstances.map(p=>({...p.segment,id:p.id})),barPlan=planMetalBars(segments,result.frame);
   const known=Number.isInteger(cfg.barQuantity)&&cfg.barQuantity>=0,limit=known?(cfg.allowPurchase?2000:cfg.barQuantity):0;
   base.bars=barPlan.bars.slice(0,limit).map((b,i)=>({...b,purchase:i>=(cfg.barQuantity??0)}));
   base.unplaced.push(...barPlan.unplaced.map(pieceId=>({pieceId,reason:'Peça excede a barra disponível com cortes e refilos.'})),...barPlan.bars.slice(limit).flatMap(b=>b.cuts.map(c=>({pieceId:c.id,reason:known?'Quantidade de barras esgotada.':'Quantidade de barras desconhecida.'}))));
   if(!known)base.warnings.push('Quantidade de barras desconhecida: nenhuma barra comercial considerada disponível.');
 }
 Object.assign(base,{netArea:raw.usedArea,grossArea:raw.grossArea,usefulArea:base.sheets.reduce((n,s)=>n+(s.width-2*s.trim)*(s.height-2*s.trim),0),utilization:raw.utilization,wasteArea:raw.wasteArea});
 base.usefulUtilization=base.usefulArea?base.netArea/base.usefulArea*100:0;
 const allocated=new Set([...base.sheets.flatMap(s=>s.placements.map(p=>p.pieceId)),...base.bars.flatMap(b=>b.cuts.map(c=>c.id))]),counts={};
 for(const p of instances)if(allocated.has(p.id)&&!p.extra)counts[p.typeId]=(counts[p.typeId]||0)+1;
 base.completeSets=completeSets(result.pieces,counts,project.quantity);base.allocated=allocated.size;base.requested=instances.length;
 base.purchaseSheets=base.sheets.filter(s=>s.purchase).length;base.purchaseBars=base.bars.filter(s=>s.purchase).length;
 base.locks={};base.validation=validateWorkshopPlan(project,result,base);
 if(raw.errors?.length){base.validation.errors.push(...raw.errors.map(e=>e.message));base.validation.valid=false;}
 return base;
}
/** Independent of either packing heuristic; also validates worker/manual results. */
export function validateWorkshopPlan(project,result,plan){
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(!object(plan)||!Array.isArray(plan.sheets)||!Array.isArray(plan.bars)||!Array.isArray(plan.unplaced)||!Array.isArray(plan.instances)||plan.sheets.length>2000||plan.bars.length>2000||plan.instances.length>1200||plan.sheets.some(s=>!object(s)||!Array.isArray(s.placements)||s.placements.some(p=>!object(p)))||plan.bars.some(b=>!object(b)||!Array.isArray(b.cuts)||b.cuts.some(c=>!object(c)))||plan.unplaced.some(p=>!object(p)||typeof p.pieceId!=='string'))return{valid:false,errors:['Estrutura do plano de corte inválida ou acima dos limites.']};
 const errors=[],instances=expandWorkshopPieces(project,result),sheets=instances.filter(p=>p.kind!=='bar'),bars=instances.filter(p=>p.kind==='bar'),stock=stockFor(project,result);
 if(!Array.isArray(stock.remnants)||stock.remnants.length||plan.sheets.some(s=>s.source==='remnant'))errors.push('Retalhos não estão habilitados nesta etapa; custo próprio e conferência física pendentes.');
 if(!finite(plan.netArea)||!finite(plan.grossArea))errors.push('Métricas de área inválidas.');
 if(sheets.length&&(!finite(stock.width,.01)||!finite(stock.length,.01)||!finite(stock.trim)||!finite(stock.kerf)||stock.trim*2>=Math.min(stock.width,stock.length)))errors.push('Formato, margem ou separação de chapa inválidos.');
 if(!isPlanCurrent(project,plan)||result.signature!==plan.signature)errors.push('Plano desatualizado em relação à geometria e ao estoque.');
 const raw={...plan,sheets:plan.sheets.map(s=>({...s,length:s.height??s.length})),unplaced:plan.unplaced.filter(p=>sheets.some(s=>s.id===p.pieceId)),usedArea:plan.netArea,wasteArea:plan.grossArea-plan.netArea};
 errors.push(...validateNesting(raw,sheets.map(nestingPiece),stock));
 const expected=new Map(bars.map(p=>[p.id,p])),seen=new Set(),barIds=new Set(),cfg=project.components.metalon;
 for(const bar of plan.bars){
   if(barIds.has(bar.id))errors.push(`Barra repetida: ${bar.id}.`);barIds.add(bar.id);
   if(!finite(bar.length,.01)||!finite(bar.waste)||!finite(bar.trimStart)||!finite(bar.trimEnd))errors.push(`Dimensões inválidas na barra ${bar.id}.`);
   const source={length:cfg.barLength,trimStart:cfg.trimStart??0,trimEnd:cfg.trimEnd??0,kerf:cfg.sawKerf,trimKerfStart:(cfg.trimStart??0)>0?cfg.sawKerf:0,trimKerfEnd:(cfg.trimEnd??0)>0?cfg.sawKerf:0};
   if(bar.source!=='commercial'||Object.entries(source).some(([key,value])=>!finite(bar[key])||Math.abs(bar[key]-value)>EPS))errors.push(`Barra ${bar.id}: comprimento comercial, origem, refilos ou kerf divergem do estoque informado.`);
   let cursor=bar.trimStart+(bar.trimKerfStart||0);
   for(const c of bar.cuts){
     const p=expected.get(c.id);
     if(!p||seen.has(c.id)){errors.push(`Identidade de barra desconhecida/repetida: ${c.id}.`);continue;}seen.add(c.id);
     if(p.segment.stockKey!==bar.stockKey)errors.push(`Perfil incompatível: ${c.id}.`);
     const remaining=source.length-source.trimEnd-source.trimKerfEnd-c.end,requiredAfter=p.segment.angleB<90?cfg.sawKerf/Math.sin(p.segment.angleB*Math.PI/180):remaining>EPS?cfg.sawKerf:0,requiredBefore=p.segment.angleA<90?cfg.sawKerf/Math.sin(p.segment.angleA*Math.PI/180):0;
     if(c.angleA!==p.segment.angleA||c.angleB!==p.segment.angleB||Math.abs(c.kerfBefore-requiredBefore)>EPS||Math.abs(c.kerfAfter-requiredAfter)>EPS||Math.abs(c.used-c.end-c.kerfAfter)>EPS)errors.push(`Perdas/ângulos de serra divergem da configuração: ${c.id}.`);
     if(!finite(c.length,.01)||!finite(c.used)||Math.abs(p.segment.length-c.length)>EPS||!finite(c.start)||!finite(c.end)||!finite(c.kerfAfter)||!finite(c.kerfBefore))errors.push(`Comprimento/posição inválido: ${c.id}.`);
     if(Math.abs(c.start-cursor-c.kerfBefore)>EPS||Math.abs(c.end-c.start-c.length)>EPS)errors.push(`Sequência de serra inválida: ${c.id}.`);
     if(c.end>bar.length-bar.trimEnd-(bar.trimKerfEnd||0)+EPS)errors.push(`Peça fora da barra: ${c.id}.`);
     cursor=c.end+c.kerfAfter;
   }
   if(Math.abs(cursor+(bar.trimEnd||0)+(bar.trimKerfEnd||0)+bar.waste-bar.length)>EPS)errors.push(`Conservação de comprimento inválida: ${bar.id}.`);
   if(!finite(bar.used)||Math.abs(bar.used-cursor)>EPS)errors.push(`Consumo informado diverge da sequência: ${bar.id}.`);
 }
 for(const p of plan.unplaced.filter(u=>expected.has(u.pieceId))){if(seen.has(p.pieceId))errors.push(`Instância repetida: ${p.pieceId}.`);seen.add(p.pieceId);}
 if(seen.size!==expected.size)errors.push('Conservação de peças de barras violada.');
 if(plan.bars.length&&!cfg.allowPurchase&&plan.bars.length>(cfg.barQuantity??0))errors.push('Consumo de barras excede o estoque.');
 const all=new Set(instances.map(p=>p.id));for(const u of plan.unplaced)if(!all.has(u.pieceId))errors.push(`Falta sem peça de origem: ${u.pieceId}.`);
 for(const[id,lock]of Object.entries(plan.locks||{})){const sheet=plan.sheets.find(s=>s.id===lock.sheetId),actual=sheet?.placements.find(p=>p.pieceId===id);if(!actual||!actual.locked||Math.abs(actual.x-lock.x)>EPS||Math.abs(actual.y-lock.y)>EPS||actual.rotated!==lock.rotated)errors.push(`Peça bloqueada alterada: ${id}.`);}
 return{valid:errors.length===0,errors};
}
/** Transactional edit: preserve original plan on collision, never silently relocate another piece. */
export function moveWorkshopPlacement(project,result,plan,instanceId,changes){
 const next=structuredClone(plan);let found;
 for(const s of next.sheets){const p=s.placements.find(a=>a.pieceId===instanceId);if(p){
   if(p.locked&&Object.keys(changes).some(k=>k!=='locked'))return{plan,valid:false,errors:['Desbloqueie a peça antes de mover ou girar.']};
   found=p;for(const key of ['x','y','rotated','locked'])if(Object.hasOwn(changes,key))p[key]=changes[key];
   if(changes.rotated!==undefined){const original=next.instances.find(i=>i.id===instanceId);p.width=p.rotated?original.height:original.width;p.height=p.rotated?original.width:original.height;}
   next.locks??={};if(p.locked)next.locks[instanceId]={sheetId:s.id,x:p.x,y:p.y,rotated:p.rotated};else delete next.locks[instanceId];break;
 }}
 if(!found)return{plan,valid:false,errors:['Peça não alocada nesta revisão.']};
 next.validation=validateWorkshopPlan(project,result,next);return next.validation.valid?{plan:next,valid:true,errors:[]}:{plan,valid:false,errors:next.validation.errors};
}
export function pieceNetArea(piece){return polygonArea(piece.contour)-(piece.cutouts||[]).reduce((s,ring)=>s+polygonArea(ring),0)-piece.holes.reduce((s,h)=>s+Math.PI*(h.diameter/2)**2,0);}
function refreshManualMetrics(project,result,plan){
 plan.netArea=0;plan.grossArea=0;plan.usefulArea=0;
 for(const s of plan.sheets){s.usedArea=0;s.occupiedArea=0;for(const a of s.placements){const p=plan.instances.find(p=>p.id===a.pieceId);s.usedArea+=pieceNetArea(p);s.occupiedArea+=p.width*p.height;}plan.netArea+=s.usedArea;plan.grossArea+=s.width*s.height;plan.usefulArea+=(s.width-2*s.trim)*(s.height-2*s.trim);s.remnants=[];}
 plan.wasteArea=plan.grossArea-plan.netArea;plan.utilization=plan.grossArea?plan.netArea/plan.grossArea*100:0;plan.usefulUtilization=plan.usefulArea?plan.netArea/plan.usefulArea*100:0;
 const allocated=new Set([...plan.sheets.flatMap(s=>s.placements.map(p=>p.pieceId)),...plan.bars.flatMap(b=>b.cuts.map(c=>c.id))]),counts={};for(const p of plan.instances)if(!p.extra&&allocated.has(p.id))counts[p.typeId]=(counts[p.typeId]||0)+1;
 plan.allocated=allocated.size;plan.completeSets=completeSets(result.pieces,counts,project.quantity);plan.method='Arranjo com edição manual validada';plan.validation=validateWorkshopPlan(project,result,plan);return plan;
}
export function unallocateWorkshopPlacement(project,result,plan,instanceId){
 const next=structuredClone(plan),sheet=next.sheets.find(s=>s.placements.some(p=>p.pieceId===instanceId)),found=sheet?.placements.find(p=>p.pieceId===instanceId);
 if(!found)return{plan,valid:false,errors:['Peça não alocada.']};if(found.locked)return{plan,valid:false,errors:['Desbloqueie a peça antes de desalocar.']};
 sheet.placements=sheet.placements.filter(p=>p.pieceId!==instanceId);next.unplaced.push({pieceId:instanceId,reason:'Desalocada manualmente.'});refreshManualMetrics(project,result,next);
 return next.validation.valid?{plan:next,valid:true,errors:[]}:{plan,valid:false,errors:next.validation.errors};
}
export function allocateWorkshopPlacement(project,result,plan,instanceId,sheetId,position){
 const next=structuredClone(plan),sheet=next.sheets.find(s=>s.id===sheetId),instance=next.instances.find(p=>p.id===instanceId),missing=next.unplaced.some(p=>p.pieceId===instanceId);
 if(!sheet||!instance||!missing||instance.kind==='bar')return{plan,valid:false,errors:['Peça ou chapa de destino indisponível.']};
 const rotated=position.rotated===true;sheet.placements.push({id:instanceId,pieceId:instanceId,x:position.x,y:position.y,width:rotated?instance.height:instance.width,height:rotated?instance.width:instance.height,rotated,locked:false});next.unplaced=next.unplaced.filter(p=>p.pieceId!==instanceId);refreshManualMetrics(project,result,next);
 return next.validation.valid?{plan:next,valid:true,errors:[]}:{plan,valid:false,errors:next.validation.errors};
}
/** Two concrete conservative searches under the same allowed input constraints. */
export function workshopProposals(project,result){
 const best=planWorkshop(project,result),fixed=planWorkshop(project,result,{rotation:false});best.proposalLabel='Melhor arranjo encontrado';fixed.proposalLabel='Alternativa sem giro';fixed.id+='-sem-giro';
 const physical=p=>JSON.stringify([p.sheets.map(s=>s.placements),p.bars]);
 return best.validation.valid&&fixed.validation.valid&&physical(best)!==physical(fixed)?[best,fixed]:[best];
}
/** Conservatively reserves each whole sheet containing a lock; repacks all other flat instances. */
export function reoptimizeWorkshopRemaining(project,result,plan){
 const before=validateWorkshopPlan(project,result,plan);if(!before.valid)return{plan,valid:false,errors:before.errors};
 const next=structuredClone(plan),fixed=next.sheets.filter(s=>s.placements.some(p=>p.locked)),held=new Set(fixed.flatMap(s=>s.placements.map(p=>p.pieceId))),remaining=next.instances.filter(p=>p.kind!=='bar'&&!held.has(p.id)),stock=stockFor(project,result);
 const regularHeld=fixed.filter(s=>s.source==='sheet').length,usedRemnants=new Set(fixed.filter(s=>s.source==='remnant').map(s=>s.sourceId));
 const packed=nestPieces(remaining.map(nestingPiece),{...stock,quantity:Math.max(0,stock.quantity-regularHeld),remnants:stock.remnants.filter(r=>!usedRemnants.has(r.id))});
 if(packed.errors?.length)return{plan,valid:false,errors:packed.errors.map(e=>e.message)};
 const names=new Set(fixed.map(s=>s.id));let serial=1;
 const fresh=packed.sheets.map(s=>{let id=s.id;if(s.source==='sheet'){while(names.has(`CH${serial}`))serial++;id=`CH${serial++}`;}names.add(id);return{...s,id,height:s.length,placements:s.placements.map(a=>({...a,id:a.pieceId})),purchase:s.source==='sheet'&&Number(id.slice(2))>stock.selectedQuantity};});
 next.sheets=[...fixed,...fresh];next.unplaced=[...next.unplaced.filter(u=>next.instances.find(p=>p.id===u.pieceId)?.kind==='bar'),...packed.unplaced];next.alternatives=[];next.warnings=[...next.warnings,'Reotimização conservadora: chapas com bloqueios preservadas inteiras; somente as demais peças foram reorganizadas.'];next.purchaseSheets=next.sheets.filter(s=>s.purchase).length;refreshManualMetrics(project,result,next);next.method='Reotimização dos restantes com chapas bloqueadas preservadas';
 return next.validation.valid?{plan:next,valid:true,errors:[]}:{plan,valid:false,errors:next.validation.errors};
}
