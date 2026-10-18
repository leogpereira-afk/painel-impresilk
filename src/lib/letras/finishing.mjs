import {validateElectrical} from './electrical.mjs';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function validatePainting(value){
 const errors=[];
 if(!record(value))return ['Pintura deve ser um objeto.'];
 if(value.surfaces!==undefined&&(!Array.isArray(value.surfaces)||value.surfaces.some(id=>typeof id!=='string')))errors.push('Superfícies devem ser uma lista de IDs.');
 if(value.mode!==undefined&&!['none','pending','specified'].includes(value.mode))errors.push('Modo de pintura inválido.');
 if(value.layers!==undefined&&!Array.isArray(value.layers))return [...errors,'Camadas devem ser uma lista.'];
 for(const [i,l] of (value.layers||[]).entries()){
  if(!record(l)){errors.push(`Camada ${i}: objeto inválido.`);continue;}
  for(const [key,v] of Object.entries(l))if(!['times','mix','surfaces'].includes(key)&&v!==null&&typeof v==='object')errors.push(`Camada ${i}: ${key} deve ser escalar.`);
  if(l.times!==undefined&&!record(l.times))errors.push(`Camada ${i}: tempos inválidos.`);
  if(record(l.times)&&Object.values(l.times).some(v=>v!==null&&typeof v==='object'))errors.push(`Camada ${i}: tempo deve ser escalar.`);
  if(l.mix!==undefined&&!record(l.mix))errors.push(`Camada ${i}: mistura inválida.`);
  if(record(l.mix)&&l.mix.parts!==undefined&&(!Array.isArray(l.mix.parts)||l.mix.parts.some(v=>v!==null&&typeof v==='object')))errors.push(`Camada ${i}: partes inválidas.`);
 }
 return errors;
}
export function validateTechnicalProject(project){
 if(!record(project))return ['Projeto deve ser objeto.'];
 return [...(project.painting===undefined?[]:validatePainting(project.painting)),...(project.electrical===undefined?[]:validateElectrical(project.electrical))];
}
const positive=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;
export function createPainting(){return {mode:'pending',surfaces:[],sampleApproved:false,layers:['preparation','primer','paint','varnish'].map(role=>({id:`painting-${role}`,role,selection:'pending',manufacturer:'',sku:'',datasheet:'',physicalColor:'',gloss:'',coats:null,coverageM2PerL:null,coverageBasis:'coat',lossPercent:null,mix:{basis:'volume',parts:[],mixedAt:'',potLifeHours:null},times:{},applicationEndedAt:'',conditionsConfirmed:false,compatibilityConfirmed:false,releaseConfirmed:false,waiverReason:''}))};}
export function calculatePainting(value=createPainting(),areaMm2,now=Date.now()){
 const shapeErrors=validatePainting(value);if(shapeErrors.length)return {errors:shapeErrors,pending:[],layers:[],areaM2:null,totals:{theoreticalLitres:null},released:false};
 const errors=[],pending=[],areaM2=positive(areaMm2)?Number(areaMm2)/1e6:null;const timestamp=new Date(now).getTime();
 if(value.mode==='none')return {errors,pending,layers:[],areaM2,totals:{theoreticalLitres:0},released:false};
 if(value.mode!=='specified')pending.push('Sistema de pintura a definir.');
 const layers=(value.layers||[]).map(l=>{const errorsBefore=errors.length;const local=[];if(l.selection==='pending')local.push('Seleção a definir.');if(l.selection==='waived'&&(!l.waiverReason||!l.datasheet))local.push('Dispensa exige justificativa e fonte.');
 let theoreticalLitres=null,withLossLitres=null,elapsedHours=null,recoatState='pending';
 if(l.selection==='apply'){
 for(const key of ['coats','coverageM2PerL'])if(l[key]!==null&&l[key]!==undefined&&l[key]!==''&&!positive(l[key]))errors.push(`${l.id}: ${key} deve ser positivo.`);
 if(l.lossPercent!==null&&l.lossPercent!==undefined&&l.lossPercent!==''&&(!Number.isFinite(Number(l.lossPercent))||Number(l.lossPercent)<0))errors.push(`${l.id}: perda inválida.`);
 if(!l.manufacturer||!l.sku||!l.datasheet)local.push('Produto, fabricante e ficha técnica pendentes.');
 if(!l.compatibilityConfirmed)local.push('Compatibilidade entre camadas e substrato pendente.');
 if(areaM2!==null&&positive(l.coverageM2PerL)&&(l.coverageBasis==='system'||positive(l.coats)))theoreticalLitres=areaM2/Number(l.coverageM2PerL)*(l.coverageBasis==='system'?1:Number(l.coats));else local.push('Área, rendimento e base de demãos pendentes.');
 if(l.lossPercent!==null&&l.lossPercent!==''&&Number.isFinite(Number(l.lossPercent))&&Number(l.lossPercent)>=0&&theoreticalLitres!==null)withLossLitres=Number((theoreticalLitres*(1+Number(l.lossPercent)/100)).toPrecision(12));
 for(const [key,v] of Object.entries(l.times||{}))if(v!==null&&v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))errors.push(`${l.id}: tempo ${key} inválido.`);
 if(l.mix?.parts?.length&&!['mass','volume'].includes(l.mix.basis))errors.push(`${l.id}: unidade de mistura inválida.`);
 if(l.mix?.parts?.some(p=>!positive(p)))errors.push(`${l.id}: proporção de mistura inválida.`);
 if(l.mix?.mixedAt&&positive(l.mix.potLifeHours)&&timestamp-new Date(l.mix.mixedAt).getTime()>Number(l.mix.potLifeHours)*3600000)local.push('Mistura fora da vida útil; consultar ficha.');
 if(l.applicationEndedAt){elapsedHours=(timestamp-new Date(l.applicationEndedAt).getTime())/3600000;if(!Number.isFinite(elapsedHours)||elapsedHours<0){errors.push(`${l.id}: registro de aplicação inválido ou futuro.`);elapsedHours=null;}}
 if(!l.conditionsConfirmed)local.push('Condições de aplicação e previsão pendentes.');
 if(elapsedHours!==null&&l.conditionsConfirmed){if(positive(l.times?.recoatMaxHours)&&elapsedHours>l.times.recoatMaxHours){recoatState='expired';local.push('Janela de repintura excedida; consultar sistema.');}else if(positive(l.times?.recoatMinHours))recoatState=elapsedHours>=l.times.recoatMinHours?'within':'early';}
 if(!l.releaseConfirmed)local.push('Conferência real de cura/liberação pendente; tempo decorrido não comprova cura.');
 }
 pending.push(...local.map(x=>`${l.id}: ${x}`));return {...l,theoreticalLitres,withLossLitres,mixtureVolumeLitres:null,elapsedHours,recoatState,pending:local,released:errors.length===errorsBefore&&l.selection==='apply'&&l.releaseConfirmed&&l.conditionsConfirmed&&l.compatibilityConfirmed&&local.length===0};});
 return {areaM2,layers,errors,pending,totals:{theoreticalLitres:layers.filter(l=>l.selection==='apply').every(l=>l.theoreticalLitres!==null)?layers.reduce((s,l)=>s+(l.theoreticalLitres||0),0):null},released:layers.some(l=>l.selection==='apply')&&layers.filter(l=>l.selection==='apply').every(l=>l.released)&&!pending.length&&!errors.length};
}
