import {isPlanCurrent} from './signature.mjs';
import {validateWorkshopPlan} from './plans.mjs';
const known=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function estimateWorkshopCosts(project,result,plan){
 const rows=[],pending=[],stock=project.stock[result.materialId==='metalon'?'galvanized':result.materialId],c=project.costs;
 const add=(id,label,quantity,unit,unitPrice,source,rule,purchase=0)=>{const value=known(unitPrice)?quantity*unitPrice:null;rows.push({id,label,quantity,unit,unitPrice:known(unitPrice)?unitPrice:null,source:source||'Manual',date:stock.priceDate||null,rule,total:value,purchase:known(unitPrice)?purchase*unitPrice:null});if(value===null)pending.push(`${label}: preço não informado.`);return value;};
 if(!plan||!isPlanCurrent(project,plan)||!plan.validation?.valid||result.signature!==plan.signature||result.materialId!==plan.materialId||!validateWorkshopPlan(project,result,plan).valid){return{rows,pending:['Calcule um plano válido para esta geometria e estoque.'],complete:false,assignedCost:null,purchaseCost:null,salePrice:null,machineCost:null};}
 if(plan.sheets.length)add('sheets','Chapas inteiras abertas',plan.sheets.length,'chapa',stock.price,stock.priceSource,'Quantidade de chapas abertas × preço unitário',plan.purchaseSheets);
 if(plan.bars.length)add('bars','Barras inteiras abertas',plan.bars.length,'barra',project.components.metalon.barPrice,'Manual','Quantidade de barras abertas × preço unitário',plan.purchaseBars);
 const machineCost=known(c.machineMinutes)&&known(c.machineHourlyRate)?c.machineMinutes/60*c.machineHourlyRate:null;
 rows.push({id:'machine',label:'Máquina',quantity:known(c.machineMinutes)?c.machineMinutes:null,unit:'min',unitPrice:known(c.machineHourlyRate)?c.machineHourlyRate/60:null,source:'Tempo e valor/hora manuais',rule:'Minutos ÷ 60 × valor/hora',total:machineCost,purchase:0});if(machineCost===null)pending.push('Máquina: informe minutos e valor/hora; zero somente se não aplicável.');
 add('assembly','Montagem/acabamento/serviços',1,'serviço',c.assemblyCost,'Manual','Valor informado para este lote',0);
 const knownSubtotal=rows.reduce((s,r)=>s+(r.total??0),0),priceComplete=pending.length===0;
 if(plan.unplaced.length)pending.push(`${plan.unplaced.length} peça(s) sem material alocado; custo cobre somente o que está planejado.`);
 const rate=c.rate/100;let salePrice=null;
 if(!known(c.rate)||!['markup','margin'].includes(c.pricingMode)||(c.pricingMode==='margin'&&rate>=1))pending.push('Regra comercial inválida; margem bruta deve ser menor que 100%.');
 else if(priceComplete&&!plan.unplaced.length)salePrice=c.pricingMode==='markup'?knownSubtotal*(1+rate):knownSubtotal/(1-rate);
 return{rows,pending,complete:pending.length===0,knownSubtotal,assignedCost:priceComplete?knownSubtotal:null,purchaseCost:priceComplete?rows.reduce((s,r)=>s+(r.purchase??0),0):null,salePrice,machineCost,pricingMode:c.pricingMode,rate:c.rate,policy:'Custeio pelas chapas/barras inteiras abertas; sem crédito de retalhos. Compra adicional separada do custo atribuído.',realizedCost:null};
}
