import {buildPanels} from './geometry.mjs';
import {buildMetalon} from './metalon.mjs';
import {cutSignature} from './signature.mjs';
export {cutSignature,isPlanCurrent} from './signature.mjs';
export {slotGeometry,polygonArea} from './geometry.mjs';
export {frameGeometrySignature} from './metalon.mjs';
export {planWorkshop,validateWorkshopPlan,completeSets,expandWorkshopPieces,moveWorkshopPlacement,unallocateWorkshopPlacement,allocateWorkshopPlacement,workshopProposals,reoptimizeWorkshopRemaining,pieceNetArea} from './plans.mjs';
export {estimateWorkshopCosts} from './costs.mjs';
export {exportWorkshopSVG,exportWorkshopDXF} from './exports.mjs';
export {validateWorkshopSavedPlans} from './savedplans.mjs';
export function createWorkshop(){
 const panel=(kind)=>({model:kind==='mdf'?'closed-box':'open-box',width:300,depth:200,height:150,dimensionMode:'external',thickness:3,measuredThickness:kind==='mdf'?3:3.2,clearance:0,kerf:null,joint:'butt',fingerCount:7,columns:3,rows:2,finish:kind==='mdf'?'cru':'polido',color:kind==='mdf'?'#b38855':'#60c8e9',subtype:kind==='mdf'?'cru':'fundido',sku:'',process:'laser',rotation:true,extraQuantity:0});
 const stock=()=>({width:1220,height:2440,quantity:10,margin:5,gap:3,price:null,priceSource:'Manual',priceDate:null,allowPurchase:false,remnants:[]});
 return{id:globalThis.crypto?.randomUUID?.()||`oficina-${Date.now()}`,product:'oficina',name:'Novo projeto da Oficina',responsible:'',revision:1,formatVersion:1,schemaVersion:1,unit:'mm',units:'mm',quantity:1,links:{order:null,briefing:{id:null,status:'unlinked',source:null}},components:{acrylic:panel('acrylic'),mdf:panel('mdf'),metalon:{width:1200,height:800,depth:30,joint:'butt',profile:{width:30,depth:30,wall:1.2,orientation:'width',finish:'',sku:'',material:'steel'},horizontalProfile:null,verticalProfile:null,crossProfile:null,barLength:6000,barQuantity:10,sawKerf:3,barPrice:null,allowPurchase:false,trimStart:0,trimEnd:0,gap:0,crossbars:[],sheet:{enabled:false,followFrame:true,width:1200,height:800,thickness:.8,offsetX:0,offsetY:0,sku:'',finish:'galvanizado',process:'laser'},holes:[]}},stock:{acrylic:stock(),mdf:stock(),galvanized:stock()},costs:{machineMinutes:null,machineHourlyRate:null,assemblyCost:null,pricingMode:'markup',rate:30}};
}
/** Saveable drafts may have unfinished dimensions; unsafe/malformed documents are rejected. */
export function validateWorkshop(project){
 const errors=[];
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 if(!project||typeof project!=='object'||Array.isArray(project))return['Projeto inválido.'];
 if(project.product!=='oficina'||project.formatVersion!==1||project.unit!=='mm')errors.push('Formato ou unidade de projeto incompatível.');
 if(typeof project.id!=='string'||!project.id||project.id.length>160||typeof project.name!=='string'||project.name.length>200)errors.push('Identificação inválida.');
 if(!Number.isSafeInteger(project.revision)||project.revision<1)errors.push('Revisão inválida.');
 if(!object(project.components)||!['acrylic','mdf','metalon'].every(k=>object(project.components[k]))||!object(project.stock)||!['acrylic','mdf','galvanized'].every(k=>object(project.stock[k]))||!object(project.costs)||!object(project.links))errors.push('Seções do projeto ausentes.');
 if(object(project.components?.metalon)){const m=project.components.metalon;if(!object(m.profile)||!object(m.sheet)||!Array.isArray(m.crossbars)||!Array.isArray(m.holes))errors.push('Perfil, chapa, travessas ou furos ausentes/inválidos.');for(const key of ['horizontalProfile','verticalProfile','crossProfile'])if(m[key]!=null&&!object(m[key]))errors.push('Perfil de grupo inválido.');if(Array.isArray(m.crossbars)&&m.crossbars.some(x=>!object(x))||Array.isArray(m.holes)&&m.holes.some(x=>!object(x)))errors.push('Travessa ou furo malformado.');}
 let count=0;const seen=new Set();
 const walk=(value,depth=0,path='project')=>{if(++count>400000||depth>16){errors.push('Projeto acima do limite de tamanho.');return;}if(typeof value==='number'&&!Number.isFinite(value)){errors.push('Número inválido no projeto.');return;}const textLimit=path.startsWith('project.cutPlans.')&&path.endsWith('.signature')?2000000:10000;if(typeof value==='string'&&value.length>textLimit)errors.push('Texto acima do limite.');if(value&&typeof value==='object'){if(seen.has(value)){errors.push('Projeto com referência circular.');return;}seen.add(value);for(const k of Object.keys(value)){if(['__proto__','prototype','constructor'].includes(k)){errors.push('Chave insegura no projeto.');continue;}walk(value[k],depth+1,`${path}.${k}`);if(errors.length>10)break;}seen.delete(value);}};
 walk(project);return [...new Set(errors)];
}
export function buildWorkshop(project,materialId='acrylic'){
 const errors=validateWorkshop(project),empty={materialId,revision:project?.revision,signature:cutSignature(project,materialId),pieces:[],warnings:[],assembly:[],valid:false,errors};
 if(!['acrylic','mdf','metalon'].includes(materialId))errors.push('Material desconhecido.');
 if(!Number.isInteger(project?.quantity)||project.quantity<1||project.quantity>200)errors.push('Use de 1 a 200 conjuntos por lote.');
 if(errors.length)return empty;
 const out=materialId==='metalon'?buildMetalon(project):buildPanels(project,materialId);
 const count=out.pieces.reduce((n,p)=>n+p.quantity,0);if(count>1200){out.errors.push('O lote excede o limite de 1.200 peças. Reduza conjuntos ou divisórias.');out.pieces=[];}
 return{...out,materialId,revision:project.revision,signature:cutSignature(project,materialId),valid:out.errors.length===0};
}
