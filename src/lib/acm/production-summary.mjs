import { materialKey } from './nesting.mjs';
import { metalStockKey } from './structure.mjs';
export const productionNumber = value => typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('pt-BR',{maximumFractionDigits:3}):'Não informado';
const n=productionNumber;
export function productionColor(key) {let hash=0;for(const ch of String(key))hash=(Math.imul(hash,31)+ch.charCodeAt(0))|0;return `hsl(${Math.abs(hash)%360} 55% 91%)`;}
const stockDescription = member => {const profile=member.profileSpec??{};const wall=member.wall??profile.wall;return `parede ${wall==null?'não informada':`${n(wall)} mm`} · acabamento ${member.finish||profile.finish||'não informado'}`;};
export function productionHoleSummary(holes) {
 const diameters=new Map();let pending=0;
 for(const hole of holes){const diameter=hole.drillDiameter??hole.diameter??(hole.radius*2);if(typeof diameter==='number'&&Number.isFinite(diameter)&&diameter>0)diameters.set(diameter,(diameters.get(diameter)??0)+1);else pending++;}
 const defined=[...diameters.values()].reduce((sum,count)=>sum+count,0);
 return `${defined} furos com Ø definido${diameters.size?` (${[...diameters].sort(([a],[b])=>a-b).map(([diameter,count])=>`${count} × Ø ${n(diameter)} mm`).join('; ')})`:''} · ${pending} ${pending===1?'posição':'posições'} com Ø a definir`;
}
const metalKey = member => member.stockKey ?? metalStockKey(member.profileSpec ?? {id:member.profile,width:member.width,depth:member.depth,wall:member.wall,gauge:member.gauge,material:member.material,sku:member.sku,finish:member.finish});
export function metalProductionSummary(result) {
 const groups=new Map(), consumption=new Map(), structure=result.structure;
 for(const m of structure.segments??[]){
  const stock=metalKey(m),p=m.profileSpec??{},length=m.longLength??m.length,a=m.angleA??90,b=m.angleB??90;
  const key=JSON.stringify([stock,p.orientation,length,m.shortLength??length,a,b]);
  if(!groups.has(key))groups.set(key,{key,stock,color:productionColor(stock),quantity:0,ids:[],cells:[`${m.material||'Material não informado'}${m.sku?` · ${m.sku}`:''} · ${stockDescription(m)}`,m.gauge||'Não informada',`${n(p.width??m.width)} × ${n(p.depth??m.depth)} mm · ${p.orientation==='depth'?'face B':'face A'}`,`${n(length/10)} cm`,0,a===b?`${n(a)}°`:`A ${n(a)}° / B ${n(b)}°`]});
  const row=groups.get(key);row.quantity++;row.cells[4]=row.quantity;row.ids.push(m.id);
  if(!consumption.has(stock))consumption.set(stock,{key:stock,color:productionColor(stock),material:`${m.material||'Não informado'} · ${stockDescription(m)}`,profile:`${n(p.width??m.width)} × ${n(p.depth??m.depth)} mm`,gauge:m.gauge||'Não informada',length:0,quantity:0,bars:[]});
  const total=consumption.get(stock);total.length+=length;total.quantity++;
 }
 for(const bar of structure.bars??[]){const first=(structure.segments??[]).find(member=>bar.cuts?.some(c=>c.id===member.id));const stock=bar.stockKey??(first?metalKey(first):metalKey(bar));consumption.get(stock)?.bars.push(bar)}
 return {title:'Plano de Corte · Metalon',headers:['Material','Chapa / bitola informada','DIM','Medida (cm)','QTD','Corte'],rows:[...groups.values()],consumptionHeaders:['Material / DIM / chapa','Comprimento total','Barras comerciais reais','Retalhos usados','Sobras do plano'],consumptionRows:[...consumption.values()].map(t=>({key:t.key,color:t.color,cells:[`${t.material} · ${t.profile} · ${t.gauge}`,`${n(t.length/1000)} m`,String(t.bars.filter(b=>b.source!=='remnant').length),String(t.bars.filter(b=>b.source==='remnant').length),t.bars.map(b=>`${b.id}: ${n(b.waste/10)} cm`).join('; ')||'Sem barras alocadas']})),notes:['Medidas de corte em cm; seção DIM em mm. Ponta longa do motor; confira pontas curtas e orientação no caderno de serralheria.','Quantidades de barras e sobras vêm da alocação real, incluindo kerf e refilos. Suportes não cadastrados não são acrescentados.',...(structure.unplaced?.length?[`Pendentes sem barra: ${structure.unplaced.map(s=>typeof s==='string'?s:s.id).join(', ')}`]:[])]};
}
export function acmProductionSummary(project,result,nesting) {
 const groups=new Map();
 for(const p of result.pieces??[]){const blank=p.blank,m=p.material??{},holes=blank.holes??p.fixings?.screws??[],grooves=blank.grooves??[],format=(blank.profiles&&Object.values(blank.profiles).some(pr=>pr.operations?.length))?'Bandeja / dobras':'Plana';
  const key=JSON.stringify([materialKey(m),p.width,p.height,blank,holes]);
  if(!groups.has(key))groups.set(key,{key,color:productionColor(materialKey(m)),quantity:0,ids:[],cells:[`${m.manufacturer||'Fabricante não informado'} · ${m.sku||'ACM'}`,`${n(m.thickness)} mm`,`${m.colorId||m.color||'Cor não informada'} · ${m.finish||'—'}`,format,`${n(p.width/10)} × ${n(p.height/10)} cm / ${n(blank.width/10)} × ${n(blank.height/10)} cm`,0,`Contorno + ${blank.cutouts?.length??0} recortes / ${grooves.length} eixos de fresa`,productionHoleSummary(holes)]});
  const row=groups.get(key);row.quantity++;row.cells[5]=row.quantity;row.ids.push(p.id);
 }
 const sheets=nesting?.sheets??[];
 return {title:'Plano de Corte · ACM',headers:['Material','Espessura','Cor / acabamento','Formato','Acabada / desenvolvida (cm)','QTD','Corte / fresagem por peça','Furos / posições por peça'],rows:[...groups.values()],consumptionHeaders:['Chapa / material','Formato (cm)','Fonte','Peças alocadas','Área usada / bruta','Aproveitamento'],consumptionRows:sheets.map(s=>({key:s.id,color:productionColor(s.materialKey??materialKey(s.material)),cells:[`${s.id} · ${s.material?.sku||'ACM'} · ${s.material?.colorId||s.material?.color||'Cor pendente'}`,`${n(s.width/10)} × ${n(s.length/10)}`,s.source==='remnant'?'Retalho':'Chapa',String(s.placements.length),`${n(s.usedArea/1e6)} / ${n(s.width*s.length/1e6)} m²`,`${n(s.width*s.length?100*s.usedArea/(s.width*s.length):0)}%`]})),notes:[`Revisão ${project.revision}. Medidas em cm; espessura em mm. Quantidades e operações extraídas das peças calculadas.`,nesting?`${sheets.filter(s=>s.source!=='remnant').length} chapas comerciais e ${sheets.filter(s=>s.source==='remnant').length} retalhos efetivamente alocados. Aproveitamento global: ${n(nesting.utilization)}%. Área restante não equivale a retalho reutilizável.`:'Calcule o plano de chapas para obter consumo e aproveitamento reais.',...(nesting?.unplaced?.length?[`Peças sem chapa: ${nesting.unplaced.map(p=>p.pieceId).join(', ')}`]:[])]};
}
