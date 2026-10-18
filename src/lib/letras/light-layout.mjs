import {letterGeometrySignature} from './input.mjs';
import {catalogStatus} from './lighting-catalog.mjs';
const EPS = 1e-7;
const LIMIT = 5000;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const n = v => Math.round(v * 1000) / 1000;
const footprint = model => model.rotationDeg===90?{widthMm:model.heightMm,heightMm:model.widthMm}:{widthMm:model.widthMm,heightMm:model.heightMm};
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const LIGHT_CIRCUIT_COLORS = ['#2563eb','#db2777','#059669','#d97706','#7c3aed','#0891b2'];
export function createLightLayout(overrides = {}) {
 const base = {enabled:true,model:{name:'Módulo fictício DEMO 12 V',demonstration:true,datasheet:'',widthMm:20,heightMm:10,voltageV:12,powerW:0.72,maxPerRun:30,cctK:6500},grid:{pitchXmm:35,pitchYmm:35,clearanceMm:3},supply:{name:'Fonte fictícia DEMO 60 W',demonstration:true,datasheet:'',voltageV:12,powerW:60,loadPercent:80,outputs:4,outputMaxCurrentA:2.5,xMm:-80,yMm:0,zMm:-20,conditionsConfirmed:false},wire:{route:'rear-plane',resistanceOhmPerM:null,maxDropPercent:3,extraPercent:10},excluded:[],manual:[]};
 if (!isObject(overrides)) return base;
 return {...base,...overrides,model:{...base.model,...overrides.model},grid:{...base.grid,...overrides.grid},supply:{...base.supply,...overrides.supply},wire:{...base.wire,...overrides.wire}};
}
export function validateLightLayout(c) {
 const errors=[];
 if (!isObject(c)) return ['Distribuição LED inválida.'];
 if (typeof c.enabled !== 'boolean') errors.push('Ativação dos LEDs inválida.');
 for (const key of ['model','grid','supply','wire']) if (!isObject(c[key])) errors.push(`Configuração LED ${key} inválida.`);
 if (errors.length) return errors;
 const number = (object,key,min,max,label,integer=false) => {const v=object[key];if(!finite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))errors.push(`${label} fora do intervalo permitido (${min}–${max}).`);};
 for(const [key,label] of [['widthMm','Largura do módulo'],['heightMm','Altura do módulo']])number(c.model,key,0.1,1000,label);
 number(c.model,'powerW',0.001,100,'Potência do módulo');number(c.model,'voltageV',1,60,'Tensão do módulo');number(c.model,'maxPerRun',1,1000,'Limite de módulos por ramal',true);number(c.model,'cctK',1000,20000,'Temperatura de cor');
 if(c.model.depthMm!==undefined)number(c.model,'depthMm',0.01,1000,'Profundidade física do módulo');
 if(c.model.maxCurrentA!==undefined)number(c.model,'maxCurrentA',0.001,500,'Corrente máxima do ramal do modelo');
 if(c.model.rotationDeg!==undefined&&![0,90].includes(c.model.rotationDeg))errors.push('Orientação do módulo deve ser 0° ou 90°.');
 if(typeof c.model.name!=='string'||!c.model.name.trim()||c.model.name.length>200)errors.push('Informe um nome de modelo válido.');
 if(typeof c.model.demonstration!=='boolean'||typeof c.model.datasheet!=='string'||c.model.datasheet.length>2000)errors.push('Identificação da ficha do LED inválida.');
 for(const key of ['pitchXmm','pitchYmm'])number(c.grid,key,0.1,5000,'Passo da malha');number(c.grid,'clearanceMm',0,500,'Recuo de borda');
 if(c.grid.pitchXmm<footprint(c.model).widthMm||c.grid.pitchYmm<footprint(c.model).heightMm)errors.push('O passo da malha não pode ser menor que o módulo; haveria sobreposição.');
 number(c.supply,'voltageV',1,60,'Tensão da fonte');number(c.supply,'powerW',0.01,10000,'Potência da fonte');number(c.supply,'loadPercent',1,100,'Carga utilizável da fonte');number(c.supply,'outputs',1,100,'Saídas por fonte',true);number(c.supply,'outputMaxCurrentA',0.001,500,'Corrente máxima por saída/ramal');
 if(c.supply.ratedCurrentA!==undefined)number(c.supply,'ratedCurrentA',0.001,500,'Corrente nominal da fonte');
 if(c.supply.distributionMode!==undefined&&!['external','legacy'].includes(c.supply.distributionMode))errors.push('Modo de distribuição da fonte inválido.');
 if(c.supply.branches!==undefined||c.supply.distributionMode==='external')number(c.supply,'branches',1,100,'Ramais por distribuidor externo',true);
 for(const key of ['xMm','yMm','zMm'])number(c.supply,key,-100000,100000,'Posição da fonte');
 if(typeof c.supply.name!=='string'||!c.supply.name.trim()||c.supply.name.length>200||typeof c.supply.demonstration!=='boolean'||typeof c.supply.datasheet!=='string'||c.supply.datasheet.length>2000||typeof c.supply.conditionsConfirmed!=='boolean')errors.push('Identificação, ficha ou confirmação da fonte inválida.');
 if(c.wire.route==='rear-plane'&&c.supply.zMm>0)errors.push('O plano traseiro externo deve ter Z menor ou igual a zero.');
 if(c.supply.voltageV!==c.model.voltageV)errors.push('Tensão da fonte diferente da tensão nominal dos módulos.');
 if(c.wire.resistanceOhmPerM!==null)number(c.wire,'resistanceOhmPerM',0.000001,100,'Resistência de um condutor (Ω/m)');
 if(c.wire.resistanceTemperatureC!==undefined)number(c.wire,'resistanceTemperatureC',-50,200,'Temperatura de referência da resistência');
 number(c.wire,'maxDropPercent',0.01,20,'Limite de queda de tensão');number(c.wire,'extraPercent',0,100,'Reserva de cabo');
 if(!['rear-plane','internal-straight'].includes(c.wire.route))errors.push('Percurso de cabo desconhecido.');
 if(!Array.isArray(c.excluded)||c.excluded.length>LIMIT||c.excluded.some(id=>typeof id!=='string'||id.length>200))errors.push('Lista de módulos excluídos inválida.');
 if(!Array.isArray(c.manual)||c.manual.length>LIMIT||c.manual.some(m=>!isObject(m)||typeof m.id!=='string'||!m.id||m.id.length>200||typeof m.letterId!=='string'||!finite(m.x)||!finite(m.y)||Math.abs(m.x)>100000||Math.abs(m.y)>100000))errors.push('Posições manuais de LEDs inválidas.');
 if(Array.isArray(c.manual)&&new Set(c.manual.map(m=>m?.id)).size!==c.manual.length)errors.push('IDs de ajustes manuais repetidos.');
 return [...new Set(errors)];
}
const inside = ([x,y],ring) => {let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const onSegment=(a,b,p)=>Math.abs(cross(a,b,p))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
const intersects=(a,b,c,d)=>{const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);return (p*q < -EPS && r*s < -EPS)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);};
const ringInside=(p,ring)=>inside(p,ring)||ring.some((a,i)=>onSegment(a,ring[(i+1)%ring.length],p));
/** Entire axis-aligned footprint plus edge clearance must fit one connected island. */
export function moduleFits(letter,x,y,model,clearanceMm=0) {
 const size=footprint(model),px=x-(letter.x||0),py=y-(letter.y||0),hx=size.widthMm/2+clearanceMm,hy=size.heightMm/2+clearanceMm;
 const rect=[[px-hx,py-hy],[px+hx,py-hy],[px+hx,py+hy],[px-hx,py+hy]];
 return letter.contours.some(c=>{
  if(!rect.every(p=>ringInside(p,c.outer)))return false;
  const rings=[c.outer,...(c.holes||[])];
  // Reject an outer concavity or a complete hole hidden between the four corners.
  for(const ring of rings) {
   if(ring.some(p=>p[0]>px-hx+EPS&&p[0]<px+hx-EPS&&p[1]>py-hy+EPS&&p[1]<py+hy-EPS))return false;
   for(let i=0;i<ring.length;i++)for(let j=0;j<4;j++)if(cross(rect[j],rect[(j+1)%4],ring[i])*cross(rect[j],rect[(j+1)%4],ring[(i+1)%ring.length]) < -EPS && intersects(rect[j],rect[(j+1)%4],ring[i],ring[(i+1)%ring.length]))return false;
  }
  return !(c.holes||[]).some(h=>rect.some(p=>ringInside(p,h)));
 });
}
const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.widthMm+b.widthMm)/2-EPS&&Math.abs(a.y-b.y)<(a.heightMm+b.heightMm)/2-EPS;
const length=points=>points.slice(1).reduce((s,p,i)=>s+Math.hypot(...p.map((v,j)=>v-points[i][j])),0);
const validGeometry=l=>isObject(l)&&typeof l.id==='string'&&finite(l.x)&&finite(l.y)&&finite(l.width)&&finite(l.height)&&l.width>0&&l.height>0&&Array.isArray(l.contours)&&l.contours.length>0&&l.contours.every(c=>isObject(c)&&Array.isArray(c.outer)&&Array.isArray(c.holes)&&[c.outer,...c.holes].every(r=>Array.isArray(r)&&r.length>=3&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite))));
const blank=()=>({modules:[],circuits:[],sources:[],wires:[],perLetter:[],narrowRegions:[],totals:{moduleCount:0,powerW:0,currentA:0,sourceCount:0,circuitCount:0,cableM:0,conductorM:0,nominalCableM:0,installedPowerW:0,usablePowerW:0,availablePowerW:0,minimumSourcesByPower:0,feedCableM:0,interconnectCableM:0,extraCableM:0,maxDropPercent:null},errors:[],warnings:[]});
export function calculateLightLayout(project,result) {
 const r=blank();r.applicable=['galvanized-acrylic','backlit','polymeric'].includes(project?.construction?.family);
 r.config=project?.lighting===undefined?createLightLayout():project.lighting;
 r.projectId=project?.id;r.revision=project?.revision;r.geometrySignature=result?.signature;r.lightingSignature=JSON.stringify(r.config);
 r.errors=validateLightLayout(r.config);if(r.errors.length)return r;
 const c=r.config,size=footprint(c.model);r.demonstration=c.model.demonstration||c.supply.demonstration;
 if(!r.applicable||!c.enabled)return r;
 if(!result||!Array.isArray(result.letters)||result.errors?.length||(result.signature&&result.signature!==letterGeometrySignature(project))){r.errors.push('Geometria válida necessária para distribuir LEDs.');return r;}
 if(result.letters.length>500||result.letters.some(l=>!validGeometry(l))||new Set(result.letters.map(l=>l.id)).size!==result.letters.length){r.errors.push('Contornos, dimensões ou IDs das letras inválidos.');return r;}
 const edges=result.letters.reduce((sum,l)=>sum+l.contours.reduce((s,a)=>s+a.outer.length+a.holes.flat().length,0),0);
 const candidates=result.letters.reduce((sum,l)=>sum+(Math.ceil(l.width/c.grid.pitchXmm)+1)*(Math.ceil(l.height/c.grid.pitchYmm)+1),0);
 if(candidates>60000||(candidates+c.manual.length)*edges>40000000||edges>100000){r.errors.push('Malha muito densa ou contornos muito complexos. Aumente o passo ou simplifique a arte.');return r;}
 if(r.demonstration)r.warnings.push('Modelo e fonte demonstrativos, fictícios: substitua por dados de ficha antes de fabricar.');
 if(!c.model.demonstration&&!c.model.datasheet.trim())r.warnings.push('Ficha técnica/revisão do modelo real ainda não informada.');
 if(!c.supply.demonstration&&!c.supply.datasheet.trim())r.warnings.push('Ficha técnica/revisão da fonte real ainda não informada.');
 if(!c.supply.conditionsConfirmed)r.warnings.push('Capacidade da fonte nas condições reais ainda não conferida.');
 r.warnings.push('Malha geométrica: confirme homogeneidade com a face e a profundidade reais. Não é simulação fotométrica.');
 // The front starts at construction.depthMm and extrudes outwards; its thickness is not inside this cavity.
 const backThickness=project.materials?.back?.thickness,knownBack=finite(backThickness)&&backThickness>0;
 const moduleBaseZmm=knownBack?backThickness:0,frontPlane=project.construction?.depthMm;
 const knownCavity=finite(frontPlane)&&frontPlane>0,knownModuleDepth=finite(c.model.depthMm);
 r.depthCheck={baseZmm:moduleBaseZmm,faceInnerZmm:knownCavity?frontPlane:null,availableDepthMm:knownCavity?frontPlane-moduleBaseZmm:null,moduleDepthMm:knownModuleDepth?c.model.depthMm:null,remainingDepthMm:knownCavity&&knownModuleDepth?n(frontPlane-moduleBaseZmm-c.model.depthMm):null,status:'pending'};
 if(knownCavity&&knownModuleDepth){
  if(moduleBaseZmm+c.model.depthMm>frontPlane+EPS){r.depthCheck.status='interference';r.errors.push(`Módulo LED de ${c.model.depthMm} mm ultrapassa a cavidade de ${n(frontPlane-moduleBaseZmm)} mm entre o topo do fundo e a face. Aumente a profundidade ou use um módulo compatível.`);return r;}
  r.depthCheck.status=knownBack?'fits-nominal-cavity':'pending';
 }
 if(!knownModuleDepth)r.warnings.push('Profundidade física do módulo não informada: espessura visual simbólica e encaixe entre fundo e face pendente.');
 if(!knownCavity)r.warnings.push('Profundidade da caixa ausente: encaixe físico do LED pendente.');
 if(!knownBack)r.warnings.push('Plano de apoio do LED não definido por um fundo: desenho usa Z=0 nominal. Confirmar suporte e espaço interno antes de fabricar.');
 const excluded=new Set(c.excluded),manual=new Map(c.manual.map(m=>[m.id,m]));
 const usedManual=new Set();
 for(const l of result.letters) {
  const per={letterId:l.id,label:l.char||l.label||l.id,count:0,rejectedCandidates:0,islandsWithoutModules:0};
  const hw=size.widthMm/2+c.grid.clearanceMm,hh=size.heightMm/2+c.grid.clearanceMm;
  const nx=Math.max(0,Math.floor((l.width-2*hw)/c.grid.pitchXmm)+1),ny=Math.max(0,Math.floor((l.height-2*hh)/c.grid.pitchYmm)+1);
  const x0=l.x+(l.width-(nx-1)*c.grid.pitchXmm)/2,y0=l.y+(l.height-(ny-1)*c.grid.pitchYmm)/2;
  for(let row=0;row<ny;row++)for(let col=0;col<nx;col++) {
   const id=`${l.id}-led-${row}-${col}`;
   if(excluded.has(id))continue;
   const edit=manual.get(id);if(edit)usedManual.add(id);
   const module={id,letterId:l.id,x:edit?.x??x0+col*c.grid.pitchXmm,y:edit?.y??y0+row*c.grid.pitchYmm,z:moduleBaseZmm,depthMm:c.model.depthMm??null,widthMm:size.widthMm,heightMm:size.heightMm,rotationDeg:c.model.rotationDeg??0,manual:!!edit,row,col};
   if(edit&&edit.letterId!==l.id){r.errors.push(`Ajuste ${id} pertence a outra letra.`);continue;}
   if(moduleFits(l,module.x,module.y,c.model,c.grid.clearanceMm)){r.modules.push(module);per.count++;}else{per.rejectedCandidates++;if(l.contours.some(a=>inside([module.x-l.x,module.y-l.y],a.outer)&&!a.holes.some(h=>ringInside([module.x-l.x,module.y-l.y],h))))r.narrowRegions.push({x:module.x,y:module.y,letterId:l.id});if(edit)r.errors.push(`Ajuste ${id} ultrapassa o contorno, recuo ou vazado.`);}
  }
  for(const edit of c.manual.filter(m=>m.letterId===l.id&&!usedManual.has(m.id)&&!excluded.has(m.id))) {
   usedManual.add(edit.id);const m={...edit,z:moduleBaseZmm,depthMm:c.model.depthMm??null,widthMm:size.widthMm,heightMm:size.heightMm,rotationDeg:c.model.rotationDeg??0,manual:true};
   if(moduleFits(l,m.x,m.y,c.model,c.grid.clearanceMm)){r.modules.push(m);per.count++;}else r.errors.push(`Módulo manual ${m.id} não cabe na área útil.`);
  }
  for(const a of l.contours)if(!r.modules.some(m=>m.letterId===l.id&&inside([m.x-l.x,m.y-l.y],a.outer)))per.islandsWithoutModules++;
  if(!per.count)r.warnings.push(`${per.label}: sem módulos; largura útil ou malha incompatível. Ajuste o modelo, passo ou posições.`);
  else if(per.islandsWithoutModules)r.warnings.push(`${per.label}: ${per.islandsWithoutModules} ilha(s) sem módulo. Confira regiões estreitas.`);
  r.perLetter.push(per);
 }
 if(c.manual.some(m=>!usedManual.has(m.id)&&!excluded.has(m.id)))r.errors.push('Há ajuste manual vinculado a uma letra ausente; regenere a distribuição.');
 if(r.modules.length>LIMIT){r.errors.push(`Limite de ${LIMIT} módulos excedido. Aumente o passo.`);r.modules=[];return r;}
 for(let i=0;i<r.modules.length;i++)for(let j=i+1;j<r.modules.length;j++)if(overlaps(r.modules[i],r.modules[j])){r.errors.push('Há módulos sobrepostos; reveja posições manuais e arte.');i=r.modules.length;break;}
 const ratedPowerW=Math.min(c.supply.powerW,c.supply.ratedCurrentA===undefined?Infinity:c.supply.ratedCurrentA*c.supply.voltageV);
 const sourceCapacity=ratedPowerW*c.supply.loadPercent/100,external=c.supply.distributionMode==='external';
 const branchLimit=external?c.supply.branches:c.supply.outputs;
 const branchCurrentLimit=Math.min(c.supply.outputMaxCurrentA,c.model.maxCurrentA??Infinity);
 const maxPerCircuit=Math.min(c.model.maxPerRun,Math.floor((sourceCapacity+EPS)/c.model.powerW),Math.floor((branchCurrentLimit*c.model.voltageV+EPS)/c.model.powerW));
 r.maxPerCircuit=maxPerCircuit;
 if(maxPerCircuit<1){r.errors.push('Nenhum módulo cabe na capacidade utilizável da fonte ou no limite de corrente do ramal.');return r;}
 const moduleCurrent=c.model.powerW/c.model.voltageV;
 for(const l of result.letters) {
  const ordered=r.modules.filter(m=>m.letterId===l.id).sort((a,b)=>a.y-b.y||((a.row||0)%2?b.x-a.x:a.x-b.x));
  for(let i=0;i<ordered.length;i+=maxPerCircuit) {
   const mods=ordered.slice(i,i+maxPerCircuit),powerW=mods.length*c.model.powerW;
   let source=r.sources.find(s=>s.circuitIds.length<branchLimit&&s.powerW+powerW<=sourceCapacity+EPS);
   if(!source){source={id:`F${r.sources.length+1}`,name:c.supply.name,x:c.supply.xMm+r.sources.length*80,y:c.supply.yMm,z:c.supply.zMm,voltageV:c.supply.voltageV,capacityW:sourceCapacity,nominalPowerW:c.supply.powerW,ratedCurrentA:c.supply.ratedCurrentA??null,usablePowerW:sourceCapacity,currentCapacityA:sourceCapacity/c.supply.voltageV,physicalOutputs:c.supply.outputs,distributionMode:external?'external':'legacy',powerW:0,circuitIds:[]};r.sources.push(source);}
   const circuit={id:`C${r.circuits.length+1}`,letterId:l.id,sourceId:source.id,output:external?1:source.circuitIds.length+1,branch:source.circuitIds.length+1,moduleIds:mods.map(m=>m.id),moduleCount:mods.length,powerW:n(powerW),currentA:n(mods.length*moduleCurrent),color:LIGHT_CIRCUIT_COLORS[r.circuits.length%LIGHT_CIRCUIT_COLORS.length],dropV:c.wire.resistanceOhmPerM===null?null:0,cableM:0};
   source.circuitIds.push(circuit.id);source.powerW+=powerW;
   let previous=[source.x,source.y,source.z];
   mods.forEach((m,index)=>{
    m.circuitId=circuit.id;m.sourceId=source.id;m.color=circuit.color;
    const end=[m.x,m.y,m.z];
    // Each schematic interconnection is a two-conductor constant-voltage pair.
    // Rear-plane paths explicitly descend/ascend; drilling and supports remain pending.
    const points=c.wire.route==='rear-plane'?[previous,[previous[0],previous[1],c.supply.zMm],[m.x,m.y,c.supply.zMm],end]:[previous,end];
    const metres=length(points)/1000,currentA=(mods.length-index)*moduleCurrent;
    const dropV=c.wire.resistanceOhmPerM===null?null:2*metres*c.wire.resistanceOhmPerM*currentA;
    const wire={id:`${circuit.id}-W${index+1}`,kind:index?'interconnect':'feed',circuitId:circuit.id,sourceId:source.id,from:index?mods[index-1].id:source.id,to:m.id,points,route:c.wire.route,location:c.wire.route==='rear-plane'?'Plano traseiro externo + passagens':'Reta no interior / alimentação externa',oneWayM:n(metres),conductorM:n(2*metres),currentA:n(currentA),dropV:dropV===null?null:n(dropV)};
    if(c.wire.route==='internal-straight'&&index>0) {
     const a=[previous[0]-l.x,previous[1]-l.y],b=[m.x-l.x,m.y-l.y];
     const safe=l.contours.some(shape=>inside(a,shape.outer)&&inside(b,shape.outer)&&![shape.outer,...shape.holes].some(ring=>ring.some((p,j)=>intersects(a,b,p,ring[(j+1)%ring.length]))));
     if(!safe){wire.needsExternalPassage=true;r.warnings.push(`${wire.id}: ligação cruza vazio/borda; definir passagem externa antes de fabricar.`);}
    }
    r.wires.push(wire);circuit.cableM+=metres;if(dropV!==null)circuit.dropV+=dropV;previous=end;
   });
   circuit.dropPercent=circuit.dropV===null?null:circuit.dropV/c.model.voltageV*100;
   circuit.dropPassed=circuit.dropPercent===null?null:circuit.dropPercent<=c.wire.maxDropPercent;
   if(circuit.dropPassed===false)r.errors.push(`${circuit.id}: queda calculada ${n(circuit.dropPercent)}% excede o limite configurado ${c.wire.maxDropPercent}%.`);
   circuit.cableM=n(circuit.cableM);circuit.dropV=circuit.dropV===null?null:n(circuit.dropV);circuit.dropPercent=circuit.dropPercent===null?null:n(circuit.dropPercent);r.circuits.push(circuit);
  }
 }
 r.sources.forEach(s=>{s.currentA=n(s.powerW/s.voltageV);s.usedPercent=n(s.powerW/s.nominalPowerW*100);s.availableW=n(sourceCapacity-s.powerW);s.branchCount=s.circuitIds.length;s.powerW=n(s.powerW);s.currentCapacityA=n(s.currentCapacityA);s.usablePowerW=n(s.usablePowerW);});
 const feedCableM=r.wires.filter(w=>w.kind==='feed').reduce((sum,w)=>sum+length(w.points)/1000,0),interconnectCableM=r.wires.filter(w=>w.kind==='interconnect').reduce((sum,w)=>sum+length(w.points)/1000,0);
 const nominalCableM=feedCableM+interconnectCableM,extraCableM=nominalCableM*c.wire.extraPercent/100,cableM=nominalCableM+extraCableM,totalPowerW=r.modules.length*c.model.powerW;
 r.totals={moduleCount:r.modules.length,powerW:n(totalPowerW),currentA:n(r.modules.length*moduleCurrent),sourceCount:r.sources.length,circuitCount:r.circuits.length,nominalCableM:n(nominalCableM),cableM:n(cableM),conductorM:n(cableM*2),installedPowerW:n(r.sources.length*c.supply.powerW),usablePowerW:n(r.sources.length*sourceCapacity),availablePowerW:n(r.sources.length*sourceCapacity-totalPowerW),minimumSourcesByPower:Math.ceil(Math.max(0,totalPowerW-EPS)/sourceCapacity),feedCableM:n(feedCableM),interconnectCableM:n(interconnectCableM),extraCableM:n(extraCableM),maxDropPercent:c.wire.resistanceOhmPerM===null||!r.circuits.length?null:n(Math.max(...r.circuits.map(c=>c.dropPercent)))};
 if(r.modules.length&&external)r.warnings.push('Distribuição externa: os ramais compartilham a saída DC da sua fonte por distribuidor. Definir bornes, capacidade, proteção e conexões adequados; fontes permanecem independentes, sem interligar suas saídas.');
 if(r.modules.length)r.warnings.push('Metragem bruta de cabo DC: inclui alimentação e interligações propostas, sem descontar chicotes pré-instalados. Não inclui rede AC nem confirma a metragem de compra.');
 if(r.modules.length&&c.wire.resistanceOhmPerM!==null)r.warnings.push(c.wire.resistanceTemperatureC===undefined?'Queda calculada com a resistência cadastrada; temperatura de referência não informada. Conferir resistência nas condições reais.':`Queda calculada com resistência de referência a ${c.wire.resistanceTemperatureC} °C, sem correção térmica automática. Conferir temperatura, conexões e condições reais.`);
 if(r.narrowRegions.length)r.warnings.push(`${r.narrowRegions.length} ponto(s) da malha dentro da arte sem espaço para o módulo inteiro/recuo, marcados em laranja. Conferir cobertura dessas regiões.`);
 if(r.modules.length&&c.wire.resistanceOhmPerM===null)r.warnings.push('Queda de tensão pendente: informe resistência de um condutor em Ω/m conforme ficha. Bitola e corrente admissível não são inferidas.');
 if(r.modules.length)r.warnings.push(c.wire.route==='rear-plane'?'Percursos no plano traseiro externo incluem subidas aos módulos. Conferir furos, proteção, reserva, fixação e acesso.':'Retas representam ligações propostas. Alimentação da fonte até a primeira peça exige passagem externa conferida.');
 r.warnings=[...new Set(r.warnings)];r.errors=[...new Set(r.errors)];return r;
}
function assertExport(p,r,layout){if(!r||r.projectId!==p.id||r.revision!==p.revision||layout.projectId!==p.id||layout.revision!==p.revision)throw Error('Recalcule a revisão atual antes de exportar LEDs.');if(r.signature!==letterGeometrySignature(p)||layout.geometrySignature!==r.signature||layout.lightingSignature!==JSON.stringify(p.lighting===undefined?createLightLayout():p.lighting))throw Error('Distribuição ou geometria desatualizada. Recalcule antes de exportar LEDs.');if(layout.errors.length)throw Error(layout.errors.join(' '));if(!layout.applicable||!layout.config.enabled)throw Error('LEDs não aplicáveis ou desativados.');}
const catalogLabel=(group,kind)=>{const status=catalogStatus(group,kind);return status.record?(status.modified?'Catálogo alterado; conferir parâmetros e ficha':'Dados do modelo de catálogo'):(status.modified?'Vínculo de catálogo desconhecido':'Personalizado / sem vínculo de catálogo');};
export function lightLayoutCSV(project,result,layout=calculateLightLayout(project,result)) {
 assertExport(project,result,layout);const model=layout.config.model,supply=layout.config.supply,wire=layout.config.wire;const cell=v=>`"${(typeof v==='string'&&/^[=+@\-\t\r]/.test(v)?"'":'')+String(v??'').replace(/"/g,'""')}"`;
 const rows=[['tipo','projeto','revisao','id','letra','circuito','fonte','x_mm','y_mm','z_mm','potencia_W','corrente_A','cabo_ida_m','condutores_m','observacao']];
 for(const m of layout.modules)rows.push(['modulo',project.id,project.revision,m.id,m.letterId,m.circuitId,m.sourceId,n(m.x),n(m.y),n(m.z),layout.config.model.powerW,n(layout.config.model.powerW/layout.config.model.voltageV),'','',`${model.name}; fabricante ${model.manufacturer||'não informado'}; SKU ${model.sku||'não informado'}; ${model.cctK} K; IP ${model.ip||'não informado'}; ${model.voltageV} V; ${model.widthMm} × ${model.heightMm} × ${model.depthMm??'profundidade pendente'} mm; orientação ${m.rotationDeg}°; ${catalogLabel(model,'model')}; ${layout.demonstration?'DEMONSTRATIVO FICTICIO':'Conferir ficha e prototipo'}; ${model.datasheet}`]);
 for(const w of layout.wires)rows.push(['cabo',project.id,project.revision,w.id,'',w.circuitId,w.sourceId,'','','','',w.currentA,w.oneWayM,w.conductorM,`${w.kind==='feed'?'Alimentação do ramal':'Interligação entre módulos'}; ${w.location}; par DC, metragem bruta sem desconto de chicotes; ${wire.manufacturer||'fabricante não informado'} ${wire.name||'condutor não especificado'}; seção ${wire.sectionMm2??'pendente'} mm²; ${catalogLabel(wire,'wire')}; ${wire.datasheet||'ficha não informada'}`]);
 for(const c of layout.circuits)rows.push(['ramal',project.id,project.revision,c.id,c.letterId,c.id,c.sourceId,'','','',c.powerW,c.currentA,c.cableM,n(c.cableM*2),`Saída ${c.output}; ramal ${c.branch}; ${layout.config.supply.distributionMode==='external'?'distribuidor externo; ':''}${c.moduleCount} LEDs; queda ${c.dropPercent===null?'pendente':c.dropPercent+'%'}`]);
 for(const s of layout.sources)rows.push(['fonte',project.id,project.revision,s.id,'','',s.id,s.x,s.y,s.z,s.powerW,s.currentA,'','',`${s.name}; nominal ${s.nominalPowerW} W; corrente nominal ${s.ratedCurrentA??'não informada'} A; capacidade utilizável ${s.usablePowerW} W; carga ${s.usedPercent}%; livre ${s.availableW} W; ${s.physicalOutputs} saída(s) física(s); ${s.branchCount} ramal(is); ${s.circuitIds.join(', ')}; fabricante ${supply.manufacturer||'não informado'}; SKU ${supply.sku||'não informado'}; IP ${supply.ip||'não informado'}; ${catalogLabel(supply,'supply')}; ${supply.datasheet||'ficha não informada'}`]);
 rows.push(['total',project.id,project.revision,layout.totals.moduleCount,'','','','','','',layout.totals.powerW,layout.totals.currentA,layout.totals.cableM,layout.totals.conductorM,`Estimativa bruta DC: alimentação ${layout.totals.feedCableM} m + interligações ${layout.totals.interconnectCableM} m + reserva ${layout.totals.extraCableM} m (${layout.config.wire.extraPercent}%); sem desconto de chicotes; sem rede AC; fontes independentes; resistência ${layout.config.wire.resistanceOhmPerM??'pendente'} Ω/m a ${layout.config.wire.resistanceTemperatureC??'temperatura não informada'} °C`]);return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
export function lightLayoutSVG(project,result,layout=calculateLightLayout(project,result)) {
 assertExport(project,result,layout);const pts=[...[0,0,result.bounds.width,result.bounds.height].map((v,i)=>i<2?[0,0]:[i===2?v:0,i===3?v:0]),...layout.sources.map(s=>[s.x,s.y])];const minX=Math.min(...pts.map(p=>p[0]))-40,minY=Math.min(...pts.map(p=>p[1]))-40,maxX=Math.max(...pts.map(p=>p[0]))+40,maxY=Math.max(...pts.map(p=>p[1]))+40;
 const shapes=result.letters.map(l=>`<path transform="translate(${l.x} ${l.y})" d="${l.contours.flatMap(c=>[c.outer,...c.holes]).map(ring=>'M'+ring.map(p=>p.join(',')).join('L')+'Z').join(' ')}" fill="#e2e8f0" fill-rule="evenodd" stroke="#475569"/>`).join('');
 const wires=layout.wires.map(w=>`<polyline points="${w.points.map(p=>p.slice(0,2).join(',')).join(' ')}" fill="none" stroke="${layout.circuits.find(c=>c.id===w.circuitId)?.color}" stroke-width="1" stroke-dasharray="3 2"/>`).join('');
 const mods=layout.modules.map(m=>`<rect x="${m.x-m.widthMm/2}" y="${m.y-m.heightMm/2}" width="${m.widthMm}" height="${m.heightMm}" fill="${m.color}"><title>${escape(m.id)} · ${m.circuitId} · ${m.sourceId}</title></rect>`).join('');
 const sources=layout.sources.map(s=>`<g transform="translate(${s.x} ${s.y})"><rect x="-15" y="-10" width="30" height="20" fill="#fff" stroke="#111"/><text transform="scale(1 -1)" text-anchor="middle" y="4" font-size="10">${s.id}</text></g>`).join('');
 const header=`${project.name||project.id} · rev. ${project.revision} · mm · ${layout.totals.moduleCount} módulos · ${layout.totals.powerW} W · ${layout.totals.sourceCount} fontes`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 1122 794"><rect width="1122" height="794" fill="white"/><text x="30" y="32" font-family="sans-serif" font-size="17">${escape(header)}</text><text x="30" y="56" font-family="sans-serif" font-size="12">${layout.demonstration?'DEMONSTRATIVO FICTÍCIO · ':''}Distribuição geométrica e ligação em paralelo; sem aprovação fotométrica/elétrica.</text><svg x="30" y="75" width="1062" height="590" viewBox="${minX} ${minY} ${maxX-minX} ${maxY-minY}"><g transform="translate(0 ${minY+maxY}) scale(1 -1)">${shapes}${wires}${mods}${sources}</g></svg><text x="30" y="705" font-family="sans-serif" font-size="12">${escape(layout.circuits.map(c=>`${c.id} → ${c.sourceId} saída ${c.output}/ramal ${c.branch}: ${c.moduleCount} LEDs`).join(' · ').slice(0,145))}</text><text x="30" y="730" font-family="sans-serif" font-size="12">Par DC bruto: ${layout.totals.cableM} m com reserva · Condutores +/−: ${layout.totals.conductorM} m · fontes nominais: ${layout.totals.installedPowerW} W</text><text x="30" y="755" font-family="sans-serif" font-size="12">Sem rede AC ou desconto de chicotes. Fontes independentes. Saídas, ramais, capacidade e carga no CSV; conferir instalação.</text></svg>`;
}
