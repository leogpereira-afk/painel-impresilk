const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function validateElectrical(value){
 const errors=[];
 if(!record(value))return ['Elétrica deve ser um objeto.'];
 for(const key of ['models','modules','supplies','circuits','segments']){
  if(value[key]===undefined)continue;
  if(!Array.isArray(value[key])){errors.push(`${key}: lista inválida.`);continue;}
  value[key].forEach((item,i)=>{if(!record(item)){errors.push(`${key}[${i}]: objeto inválido.`);return;}for(const [field,v] of Object.entries(item))if(v!==null&&typeof v==='object')errors.push(`${key}[${i}].${field}: valor escalar esperado.`);});
 }
 return errors;
}
const pos=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;
export function createElectrical(){return {models:[],modules:[],supplies:[],circuits:[],segments:[]};}
export function calculateElectrical(value=createElectrical()){
 const shapeErrors=validateElectrical(value);if(shapeErrors.length)return {errors:shapeErrors,pending:[],circuits:[],segments:[],totals:{moduleCount:null,powerW:null,cableM:null,conductorM:null},approved:false};
 const errors=[],pending=[];const models=value.models||[],modules=value.modules||[],supplies=value.supplies||[];
 for(const group of [models,modules,supplies,value.circuits||[],value.segments||[]]){const ids=new Set();for(const x of group){if(!x.id||ids.has(x.id))errors.push('Identidade ausente ou duplicada.');ids.add(x.id);}}
 for(const m of modules)if(!(value.circuits||[]).some(c=>c.id===m.circuitId))errors.push(`${m.id}: módulo sem circuito único alimentado.`);
 const circuits=(value.circuits||[]).map(c=>{const assigned=modules.filter(m=>m.circuitId===c.id);const supply=supplies.find(s=>s.id===c.supplyId);let powerW=0,complete=true;
 for(const m of assigned){const model=models.find(x=>x.id===m.modelId);if(!model||!pos(model.powerW)||!pos(model.voltageV)){pending.push(`${m.id}: modelo, tensão ou potência pendente.`);complete=false;continue;}powerW+=Number(model.powerW);if(!model.datasheet||!model.manufacturer||!model.sku)pending.push(`${m.id}: ficha/fabricante/SKU pendentes.`);if(Number(model.voltageV)!==Number(c.voltageV))errors.push(`${m.id}: tensão incompatível com circuito.`);if(pos(model.maxModulesPerCircuit)&&assigned.filter(x=>x.modelId===model.id).length>model.maxModulesPerCircuit)errors.push(`${c.id}: limite por ramal excedido.`);}
 if(c.mode&&c.mode!=='constantVoltage')pending.push(`${c.id}: corrente constante não implementada.`);
 if(!supply)pending.push(`${c.id}: fonte a definir.`);else {if(Number(supply.voltageV)!==Number(c.voltageV))errors.push(`${c.id}: tensão da fonte incompatível.`);if(!supply.datasheet||!supply.conditionsConfirmed)pending.push(`${c.id}: capacidade nas condições reais pendente.`);}
 const currentA=complete&&pos(c.voltageV)?powerW/Number(c.voltageV):null;if(currentA===null)pending.push(`${c.id}: corrente pendente.`);
 return {...c,powerW:complete?powerW:null,currentA,moduleCount:assigned.length};});
 for(const supply of supplies){const load=circuits.filter(c=>c.supplyId===supply.id);const watts=load.reduce((s,c)=>s+(c.powerW||0),0),amps=load.reduce((s,c)=>s+(c.currentA||0),0);if(!pos(supply.usablePowerW)||!pos(supply.usableCurrentA))pending.push(`${supply.id}: potência e corrente utilizáveis exigem fonte documentada.`);if((pos(supply.usablePowerW)&&watts>supply.usablePowerW)||(pos(supply.usableCurrentA)&&amps>supply.usableCurrentA))errors.push(`${supply.id}: capacidade utilizável excedida.`);}
 const segments=(value.segments||[]).map(s=>{let dropV=null;const circuit=circuits.find(c=>c.id===s.circuitId);if(!circuit)errors.push(`${s.id}: trecho sem circuito.`);if(!pos(s.lengthM)||!pos(s.conductors)||!['oneWay','loop'].includes(s.lengthBasis))errors.push(`${s.id}: comprimento/vias/base inválidos.`);
 const loopLengthM=s.lengthBasis==='loop'?Number(s.lengthM):Number(s.lengthM)*2;
 if(pos(s.resistanceOhmPerM)&&pos(s.currentA)&&pos(s.lengthM))dropV=loopLengthM*Number(s.resistanceOhmPerM)*Number(s.currentA);else pending.push(`${s.id}: resistência documentada e corrente do trecho pendentes.`);
 if(!s.resistanceSource)pending.push(`${s.id}: origem da resistência pendente.`);
 return {...s,loopLengthM,dropV};});
 const cableM=segments.reduce((sum,s)=>sum+(pos(s.lengthM)?Number(s.lengthM)*(s.lengthBasis==='loop'?.5:1):0),0);const conductorM=segments.reduce((sum,s)=>sum+(pos(s.lengthM)&&pos(s.conductors)?Number(s.lengthM)*(s.lengthBasis==='loop'?.5:1)*Number(s.conductors):0),0);
 pending.push('Distribuição/posição óptica, caminhos completos até cargas, proteção e revisão elétrica exigem validação própria.');
 return {errors,pending,circuits,segments,totals:{moduleCount:modules.length,powerW:modules.every(m=>(value.circuits||[]).some(c=>c.id===m.circuitId))&&circuits.every(c=>c.powerW!==null)?circuits.reduce((sum,c)=>sum+c.powerW,0):null,cableM,conductorM},approved:false};
}
