import {panelsMaterialKey,findPanelsSpace,refreshPanelsMetrics} from './nesting.mjs';
import {asWorkshopProject,buildPanelsProject} from './model.mjs';
import {planWorkshop,workshopProposals,expandWorkshopPieces,validateWorkshopPlan,moveWorkshopPlacement,unallocateWorkshopPlacement,allocateWorkshopPlacement} from '../oficina/plans.mjs';
import {exportWorkshopSVG,exportWorkshopDXF} from '../oficina/exports.mjs';
import {estimateWorkshopCosts} from '../oficina/costs.mjs';

const MATERIALS=['acrylic','mdf'];
const clone=value=>structuredClone(value);
const fail=message=>{throw new Error(message)};
function context(project,material){
 if(!MATERIALS.includes(material))fail('Selecione Acrílico ou MDF.');
 const result=buildPanelsProject(project,material),adapter=asWorkshopProject(project,material);
 // ACM material keys have a colorId slot. Namespace the fabrication subtype there
 // so cast/extruded stock is split too, without modifying the shared nesting engine.
 for(const piece of result.pieces)piece.material={...piece.material,colorId:`spec:${piece.material.subtype||project.materials[material].objects.find(o=>o.id===piece.objectId)?.config.subtype||''}`};
 return{result,adapter};
}
/** Saved plans are caches: reconstruct physical instances from source objects before trusting them. */
function checkedPlan(project,material,saved,{complete=false}={}){
 const {result,adapter}=context(project,material);
 if(!result.valid)fail(result.errors.join(' '));
 if(!saved||saved.projectId!==project.id||saved.materialId!==material||saved.signature!==result.signature||!Number.isSafeInteger(saved.revision)||saved.revision<1||saved.revision>project.revision)fail('Plano desatualizado ou de outro projeto. Recalcule o corte.');
 const candidate=clone(saved);
 candidate.instances=expandWorkshopPieces(adapter,result);
 delete candidate.proposals;
 candidate.validation=validateWorkshopPlan(adapter,result,candidate);
 if(!candidate.validation.valid)fail(candidate.validation.errors.join(' '));
 if(complete&&candidate.unplaced.length)fail('Há peças sem alocação. Recoloque todas antes de exportar o plano.');
 return{plan:candidate,result,adapter};
}
export function restorePanelsPlans(project){
 const plans={},discarded=[];
 if(project.cutPlans==null)return{plans,discarded};
 if(typeof project.cutPlans!=='object'||Array.isArray(project.cutPlans))return{plans,discarded:[{materialId:'cutPlans',reason:'Formato de planos inválido.'}]};
 const clean={...project};delete clean.cutPlans;
 for(const[material,saved]of Object.entries(project.cutPlans)){
  try{plans[material]=checkedPlan(clean,material,saved).plan;}
  catch(error){discarded.push({materialId:material,reason:error.message});}
 }
 return{plans,discarded};
}
export function isPanelsPlanCurrent(project,material,plan){
 try{return!!checkedPlan(project,material,plan).plan;}catch{return false;}
}
export function calculatePanelsPlan(project,material,previous){
 const {result,adapter}=context(project,material);
 if(!result.valid)fail(result.errors.join(' '));
 if(!result.pieces.length)fail('Adicione ao menos uma peça física antes de organizar o corte.');
 if(previous&&isPanelsPlanCurrent(project,material,previous)&&previous.sheets.some(s=>s.placements.some(p=>p.locked))){
  const current=checkedPlan(project,material,previous).plan;
  const changed=reorganizePanelsFree(project,material,current);
  if(!changed.valid)fail(changed.errors.join(' '));
  return changed.plan;
 }
 const proposals=workshopProposals(adapter,result),plan=proposals[0]||planWorkshop(adapter,result);
 if(!plan.validation.valid)fail(plan.validation.errors.join(' '));
 // Persist one chosen layout. Alternative search caches are not part of an immutable project revision.
 return plan;
}
export function editPanelsPlan(project,material,plan,action,pieceId,changes={}){
 try{
  const current=checkedPlan(project,material,plan),{adapter,result}=current;
  if(action==='move'){const moved=moveWorkshopPlacement(adapter,result,current.plan,pieceId,changes);return moved.valid?moved:{...moved,plan};}
  if(action==='remove')return unallocateWorkshopPlacement(adapter,result,current.plan,pieceId);
  if(action==='allocate'){
   if(changes.x!=null&&changes.y!=null)return allocateWorkshopPlacement(adapter,result,current.plan,pieceId,changes.sheetId,changes);
   const sheet=current.plan.sheets.find(s=>s.id===changes.sheetId),piece=current.plan.instances.find(p=>p.id===pieceId),stock=project.stock[material];
   if(!sheet||!piece)return{plan,valid:false,errors:['Peça ou chapa de destino indisponível.']};
   // Candidate corners from existing envelopes; bounded search, independently validated before committing.
   const xs=[...new Set([stock.margin,...sheet.placements.map(p=>p.x+p.width+stock.gap)])].sort((a,b)=>a-b);
   const ys=[...new Set([stock.margin,...sheet.placements.map(p=>p.y+p.height+stock.gap)])].sort((a,b)=>a-b);
   let attempts=0;
   for(const rotated of piece.rotations?.includes(90)?[false,true]:[false])for(const y of ys)for(const x of xs){
    if(++attempts>20000)return{plan,valid:false,errors:['Busca de espaço interrompida. Reorganize a chapa ou recalcule o plano.']};
    const width=rotated?piece.height:piece.width,height=rotated?piece.width:piece.height;
    if(x+width>sheet.width-stock.margin||y+height>sheet.height-stock.margin)continue;
    if(sheet.placements.some(p=>x<p.x+p.width+stock.gap-1e-6&&x+width+stock.gap>p.x+1e-6&&y<p.y+p.height+stock.gap-1e-6&&y+height+stock.gap>p.y+1e-6))continue;
    const changed=allocateWorkshopPlacement(adapter,result,current.plan,pieceId,sheet.id,{x,y,rotated});
    if(changed.valid)return changed;
   }
   return{plan,valid:false,errors:['Não foi encontrado espaço compatível nesta chapa. Selecione outra ou recalcule o arranjo.']};
  }
  return{plan,valid:false,errors:['Ação do plano desconhecida.']};
 }catch(error){return{plan,valid:false,errors:[error.message]};}
}
export function getPanelsCosts(project,material,plan){
 try{const current=checkedPlan(project,material,plan);return estimateWorkshopCosts(current.adapter,current.result,current.plan);}
 catch(error){return{rows:[],pending:[error.message],complete:false,assignedCost:null,purchaseCost:null,salePrice:null,machineCost:null};}
}
const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const decodeXML=value=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const asPoint=p=>({x:p.x??p[0],y:p.y??p[1]});
const path=ring=>ring.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')+' Z';
function operationPaths(result,metadata){
 const paths=[];
 for(const mark of result.markings||[]){
  if(!['engrave','annotation'].includes(mark.operation))fail('Operação de marcação inválida.');
  const rings=(mark.contours||[]).flatMap(shape=>[shape.outer,...(shape.holes||[])]).map(r=>r.map(asPoint));
  if(rings.some(r=>r.length<3||r.length>2000||r.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))))fail('Contorno de marcação inválido.');
  const target=result.pieces.find(p=>p.id===mark.targetPieceId);
  if(!target){
   if(mark.operation==='engrave')fail('Gravação sem peça de destino.');
   // Free annotations are assembly notes, not loose cut geometry in the packing document.
   continue;
  }
  const instances=metadata.instances.filter(i=>i.pieceId===target.id);
  for(const instance of instances)for(const ring of rings){
   paths.push({id:mark.id,objectId:mark.objectId,layer:mark.operation==='engrave'?'ENGRAVE':'NOTES',instanceId:instance.id,
    ring:ring.map(p=>({x:instance.x+(instance.rotated?target.height-p.y:p.x),y:instance.y+(instance.rotated?p.x:p.y)}))});
  }
 }
 return paths;
}
/** Always revalidates margins, separation, rotation, material and stock before a plan export. */
export function exportPanelsDrawing(project,material,format,plan){
 if(!['svg','dxf'].includes(String(format).toLowerCase()))fail('Formato disponível: SVG ou DXF.');
 const {result,adapter}=context(project,material);
 if(!result.valid)fail(result.errors.join(' '));
 const candidate=plan==null?undefined:checkedPlan(project,material,plan,{complete:true}).plan;
 // The proven exporter validates complete rings and holes again; its metadata carries exact placement transforms.
 const svg=exportWorkshopSVG(adapter,result,candidate);
 const metadata=JSON.parse(decodeXML(/<metadata[^>]*>([\s\S]*?)<\/metadata>/.exec(svg)[1]));
 const operations=operationPaths(result,metadata);
 if(String(format).toLowerCase()==='svg'){
  const height=Number(/height="([^"]+)mm"/.exec(svg)[1]);
  let output=svg;
  const engrave=operations.filter(p=>p.layer==='ENGRAVE').map(p=>`<path data-marking-id="${xml(p.id)}" data-instance-id="${xml(p.instanceId)}" d="${path(p.ring)}"/>`).join('\n');
  output=output.replace(/(<g id="ENGRAVE"[^>]*>)[\s\S]*?(<\/g>)/,`$1\n${engrave}\n$2`);
  const notes=operations.filter(p=>p.layer==='NOTES').map(p=>`<path data-marking-id="${xml(p.id)}" transform="translate(0 ${height}) scale(1 -1)" fill="none" stroke="#555555" stroke-width="0.1" d="${path(p.ring)}"/>`).join('\n');
  const freeNotes=(result.markings||[]).filter(m=>m.operation==='annotation'&&!m.targetPieceId).map((m,i)=>`<text data-annotation-id="${xml(m.id)}" x="1" y="${6+i*5}" font-size="3">${xml(m.text||'Anotação técnica')}</text>`).join('\n');
  output=output.replace(/(<g id="NOTES"[^>]*>)/,`$1\n${notes}\n${freeNotes}`);
  return output;
 }
 const dxf=exportWorkshopDXF(adapter,result,candidate),extra=[];
 const pair=(code,value)=>extra.push(String(code),String(value));
 for(const operation of operations){
  pair(0,'LWPOLYLINE');pair(100,'AcDbEntity');pair(8,operation.layer);pair(100,'AcDbPolyline');pair(90,operation.ring.length);pair(70,1);
  for(const point of operation.ring){pair(10,point.x);pair(20,point.y);}
 }
 for(const[ i,mark]of(result.markings||[]).filter(m=>m.operation==='annotation'&&!m.targetPieceId).entries()){
  pair(0,'TEXT');pair(100,'AcDbEntity');pair(8,'NOTES');pair(100,'AcDbText');pair(10,1);pair(20,6+i*5);pair(30,0);pair(40,3);
  pair(1,String(mark.text||'Anotacao tecnica').replace(/[\r\n\u0000-\u001F]/g,' ').replace(/[^\x20-\x7E]|\\/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')));
 }
 return dxf.replace(/0\nENDSEC\n0\nEOF\n$/,`${extra.length?extra.join('\n')+'\n':''}0\nENDSEC\n0\nEOF\n`);
}

export function panelsPartsCSV(project,material){
 const result=buildPanelsProject(project,material);if(!result.valid)fail(result.errors.join(' '));
 const q=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
 const rows=[['Revisão','Objeto','Peça','Material','Acabamento','Largura mm','Altura mm','Espessura mm','Quantidade','Operação'],...result.pieces.map(p=>[project.revision,p.objectId,p.label,p.material.kind,p.material.finish,p.width,p.height,p.thickness,p.quantity,p.operation||'cut'])];
 return'\uFEFF'+rows.map(row=>row.map(q).join(';')).join('\n');
}

/** Moving across sheets is one validated transaction, including material identity. */
export function transferPanelsPlacement(project,material,plan,pieceId,targetSheetId,position){
 try{
  const {plan:next,result,adapter}=checkedPlan(project,material,plan),source=next.sheets.find(s=>s.placements.some(p=>p.pieceId===pieceId)),target=next.sheets.find(s=>s.id===targetSheetId),item=source?.placements.find(p=>p.pieceId===pieceId),piece=next.instances.find(p=>p.id===pieceId);
  if(!item||!target)fail('Peça ou chapa indisponível.');if(item.locked)fail('Desbloqueie a peça antes de transferir.');
  if(target.materialKey!==panelsMaterialKey(piece))fail('Chapa incompatível: confira material, espessura, cor, acabamento, SKU e processo.');
  source.placements=source.placements.filter(p=>p.pieceId!==pieceId);
  const placement=position?{...item,...position}:findPanelsSpace(target,piece,project.stock[material]);
  if(!placement)fail('Não há espaço disponível na chapa de destino.');
  if(position){placement.width=placement.rotated?piece.height:piece.width;placement.height=placement.rotated?piece.width:piece.height;}
  target.placements.push(placement);refreshPanelsMetrics(next,result,project.quantity);next.validation=validateWorkshopPlan(adapter,result,next);
  return next.validation.valid?{valid:true,errors:[],plan:next}:{valid:false,errors:next.validation.errors,plan};
 }catch(error){return{valid:false,errors:[error.message],plan};}
}
/** Bounded simulation. Copies are complete type/object sets; no new sheet can be opened. */
export function simulatePanelsFill(project,material,plan,{mode='piece',targetId}={}){
 try{
  const current=checkedPlan(project,material,plan);if(current.plan.unplaced.length)fail('Aloque todas as peças antes de preencher sobras.');
  if(!['piece','object','set'].includes(mode))fail('Modo de cópia inválido.');
  if(mode==='set'&&MATERIALS.some(id=>id!==material&&buildPanelsProject(project,id).pieces.length))fail('O conjunto contém outro material. Preencha cada objeto por material para não criar conjuntos incompletos.');
  const selected=current.result.pieces.filter(p=>mode==='set'||(mode==='object'?p.objectId===targetId:p.id===targetId||current.plan.instances.find(i=>i.id===targetId)?.pieceId===p.id));
  if(!selected.length)fail('Selecione uma peça ou objeto físico.');
  let acceptedProject=clone(project),acceptedPlan=clone(current.plan),copies=0,addedPieces=0;const budget={remaining:60000};
  for(let round=0;round<200&&budget.remaining>0;round++){
   const nextProject=clone(acceptedProject);nextProject.revision=project.revision+1;
   if(mode==='set')nextProject.quantity++;
   else{nextProject.pieceExtras??={};for(const p of selected)nextProject.pieceExtras[p.id]=(nextProject.pieceExtras[p.id]||0)+(mode==='object'?(p.perSet||1):1);}
   const {result,adapter}=context(nextProject,material);if(!result.valid)break;
   const next=clone(acceptedPlan),oldIds=new Set(next.instances.map(p=>p.id));next.instances=expandWorkshopPieces(adapter,result);const added=next.instances.filter(p=>!oldIds.has(p.id));
   if(!added.length)break;
   let fits=true;for(const piece of added.sort((a,b)=>b.width*b.height-a.width*a.height)){let placed=false;for(const sheet of next.sheets){const placement=findPanelsSpace(sheet,piece,project.stock[material],budget);if(placement){sheet.placements.push(placement);placed=true;break;}}if(!placed){fits=false;break;}}
   if(!fits)break;
   Object.assign(next,{revision:nextProject.revision,signature:result.signature,method:'Preenchimento limitado por envelopes nas chapas abertas'});refreshPanelsMetrics(next,result,nextProject.quantity);next.validation=validateWorkshopPlan(adapter,result,next);if(!next.validation.valid)break;
   acceptedProject=nextProject;acceptedPlan=next;copies++;addedPieces+=added.length;
  }
  const before=getPanelsCosts(project,material,plan),after=getPanelsCosts(acceptedProject,material,acceptedPlan);
  return{valid:true,errors:[],mode,targetId,copies,addedPieces,utilization:acceptedPlan.utilization,additionalCost:before.assignedCost!=null&&after.assignedCost!=null?after.assignedCost-before.assignedCost:null,baseSignature:current.result.signature,baseLayout:JSON.stringify(current.plan.sheets.map(s=>[s.id,s.placements])),baseRevision:project.revision,project:acceptedProject,plan:acceptedPlan,limited:copies===200||budget.remaining<=0};
 }catch(error){return{valid:false,errors:[error.message],copies:0,addedPieces:0};}
}
export function applyPanelsFill(project,material,plan,simulation){
 try{
  const current=checkedPlan(project,material,plan);if(!simulation?.valid||!simulation.copies||simulation.baseRevision!==project.revision||simulation.baseSignature!==current.result.signature||simulation.baseLayout!==JSON.stringify(current.plan.sheets.map(s=>[s.id,s.placements])))fail('Simulação vazia ou desatualizada. Simule novamente.');
  // Re-run rather than trusting the caller's editable preview payload.
  const fresh=simulatePanelsFill(project,material,plan,{mode:simulation.mode,targetId:simulation.targetId});if(!fresh.valid||fresh.copies!==simulation.copies)fail('A simulação mudou. Confira novamente antes de aplicar.');
  return{valid:true,errors:[],project:fresh.project,plan:fresh.plan};
 }catch(error){return{valid:false,errors:[error.message],project,plan};}
}

export function reorganizePanelsFree(project,material,plan){
 try{
  const current=checkedPlan(project,material,plan),next=clone(current.plan),free=next.instances.filter(p=>!next.sheets.some(s=>s.placements.some(a=>a.pieceId===p.id&&a.locked)));
  for(const sheet of next.sheets)sheet.placements=sheet.placements.filter(p=>p.locked);
  const budget={remaining:100000};next.unplaced=[];
  for(const piece of free.sort((a,b)=>b.width*b.height-a.width*a.height)){let found=false;for(const sheet of next.sheets){const position=findPanelsSpace(sheet,piece,project.stock[material],budget);if(position){sheet.placements.push(position);found=true;break;}}if(!found)next.unplaced.push({pieceId:piece.id,reason:'Sem espaço livre nas chapas abertas.'});}
  // Reorganization may not worsen the requested layout: preserve original if bounded search fails.
  if(next.unplaced.length>current.plan.unplaced.length)return{valid:true,errors:[],plan:current.plan};
  refreshPanelsMetrics(next,current.result,project.quantity);next.method='Peças livres por envelopes; posições bloqueadas preservadas';next.validation=validateWorkshopPlan(current.adapter,current.result,next);
  return next.validation.valid?{valid:true,errors:[],plan:next}:{valid:false,errors:next.validation.errors,plan};
 }catch(error){return{valid:false,errors:[error.message],plan};}
}
