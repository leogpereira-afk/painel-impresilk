import {buildBoxPanels} from './boxes.mjs';
import {createWorkshop,validateWorkshop} from '../oficina/model.mjs';
import {transform} from '../oficina/geometry.mjs';
import {cutSignature} from '../oficina/signature.mjs';
import {createLetterProject} from '../letras/model.mjs';
import {calculateLetters,validateArtwork} from '../letras/engine.mjs';
import {ringsIntersect,pointInRing} from '../letras/vectors.mjs';
import {finite,composeTransform,bounds3D,circleRing,cutoutsErrors,dividerPairs,applyJoints,crossingPositions} from './geometry.mjs';
const MATERIALS=['acrylic','mdf'],TYPES=['box','text','plate','dividers','vector'];
let sequence=0;
const uid=()=>globalThis.crypto?.randomUUID?.()||`panels-${Date.now()}-${++sequence}`;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function createPanelObject(type='box',materialId='acrylic'){
 if(!TYPES.includes(type)||!MATERIALS.includes(materialId))throw Error('Tipo de objeto ou material desconhecido.');
 const config={...createWorkshop().components[materialId],model:type==='box'?'open-box':type==='plate'?'flat':type==='dividers'?'dividers':type==='vector'?'imported':'flat',opacity:materialId==='mdf'?1:.55,joints:[],lidHeight:20,lidClearance:.3,pivotClearance:.2,lidAngle:0,organizerLid:'none'};
 if(type==='plate')Object.assign(config,{shape:'rectangle',holes:[],cutouts:[]});
 if(type==='text')Object.assign(config,{text:'Ação',font:'gentilis_regular',heightMm:80,widthMm:null,letterSpacingMm:3,lineSpacing:1.3,align:'left',operation:'cut',targetPieceId:null,layerCount:3});
 if(type==='vector')config.artwork=null;
 const names={box:'Caixa aberta',plate:'Placa',text:'Texto',dividers:'Divisórias',vector:'Vetor importado'};
 return {id:uid(),type,name:names[type],visible:true,locked:false,position:{x:0,y:0,z:0},rotation:0,quantity:1,config};
}
export function createPanelsProject(){
 const base=createWorkshop();delete base.components;
 return {...base,id:uid(),product:'oficina-placas',pieceExtras:{},name:'Projeto Acrílico e MDF',materials:Object.fromEntries(MATERIALS.map(id=>[id,{objects:[createPanelObject('box',id)],joints:[]}]))};
}
/** Adapter signature contains physical/commercial input only; no recursive cut plans or view state. */
export function asWorkshopProject(project,materialId='acrylic'){
 const clean=value=>Array.isArray(value)?value.map(clean):record(value)?Object.fromEntries(Object.entries(value).filter(([k])=>!['name','visible','locked','opacity','lidAngle','selected','view','cutPlans'].includes(k)).map(([k,v])=>[k,clean(v)])):value;
 const base=createWorkshop(),ids=(project?.materials?.[materialId]?.objects||[]).map(o=>o.id+':'),pieceExtras=Object.fromEntries(Object.entries(project?.pieceExtras||{}).filter(([id])=>ids.some(prefix=>id.startsWith(prefix))));
 return {...base,...project,product:'oficina',components:{...base.components,[materialId]:clean({...project?.materials?.[materialId],pieceExtras})},materials:undefined,cutPlans:undefined};
}
export function validatePanelsProject(project){
 if(!record(project))return ['Projeto inválido.'];
 const errors=[];
 if(project.product!=='oficina-placas'||project.schemaVersion!==1||project.units!=='mm')errors.push('Formato de composição incompatível.');
 const base=createWorkshop(),legacy={...base,...project,product:'oficina',components:base.components};
 errors.push(...validateWorkshop(legacy));
 if(!record(project.materials)||!MATERIALS.every(id=>record(project.materials[id])&&Array.isArray(project.materials[id].objects)&&Array.isArray(project.materials[id].joints)))return [...errors,'Materiais, objetos ou encaixes ausentes.'];
 if(project.pieceExtras!=null&&(!record(project.pieceExtras)||Object.values(project.pieceExtras).some(n=>!Number.isInteger(n)||n<0||n>200)))errors.push('Reposições por peça devem ser inteiras entre 0 e 200.');
 const ids=new Set();
 for(const materialId of MATERIALS){
  const group=project.materials[materialId];
  if(group.objects.length>100||group.joints.length>1000)errors.push('Limite de 100 objetos ou 1.000 encaixes excedido.');
  for(const object of group.objects){
   if(!record(object)||typeof object.id!=='string'||!object.id||object.id.length>160||ids.has(object.id)){errors.push('Objeto sem ID único.');continue;}ids.add(object.id);
   if(!TYPES.includes(object.type)||typeof object.name!=='string'||object.name.length>200||!record(object.config)||!record(object.position)||typeof object.visible!=='boolean'||typeof object.locked!=='boolean')errors.push('Estrutura de objeto inválida.');
  }
  for(const joint of group.joints)if(!record(joint)||typeof joint.id!=='string'||!joint.id)errors.push('Estrutura de encaixe inválida.');
 }
 return [...new Set(errors)];
}
function pieceFromRing(object,materialId,ring,holes,id,label,x=0,y=0){
 const cfg=object.config,minX=Math.min(...ring.map(p=>p.x)),minY=Math.min(...ring.map(p=>p.y)),maxX=Math.max(...ring.map(p=>p.x)),maxY=Math.max(...ring.map(p=>p.y));
 const shift=points=>points.map(p=>({x:p.x-minX,y:p.y-minY}));
 return {id:`${object.id}:${id}`,componentId:materialId,objectId:object.id,label,kind:'sheet',face:'text',width:maxX-minX,height:maxY-minY,thickness:cfg.measuredThickness,perSet:object.quantity,quantity:object.quantity,extraQuantity:cfg.extraQuantity||0,contour:shift(ring),cutouts:holes.map(shift),holes:[],slots:[],visible:object.visible,operation:'cut',material:{id:materialId,kind:materialId,sku:cfg.sku,finish:cfg.finish,color:cfg.color,opacity:cfg.opacity,thickness:cfg.measuredThickness,nominalThickness:cfg.thickness,process:cfg.process,subtype:cfg.subtype,directional:cfg.rotation===false,source:'manual'},rotations:cfg.rotation===false?[0]:[0,90],transform:composeTransform(transform([x+minX,0,y+minY],[1,0,0],[0,0,1],[0,1,0]),object)};
}
function textContours(object,materialId){
 const c=object.config,p=createLetterProject({id:object.id,text:{value:c.text,font:c.font,heightMm:c.heightMm,widthMm:c.widthMm,letterSpacingMm:c.letterSpacingMm,lineSpacing:c.lineSpacing,align:c.align},construction:{family:`flat-${materialId}`,layers:[{material:materialId,thickness:c.measuredThickness,operation:c.process==='router'?'router':'laser-co2'}]}}),result=calculateLetters(p);
 const contours=result.letters.flatMap(letter=>letter.contours.map((shape,i)=>({id:`glyph-${letter.index}-${i}`,label:`${object.name} · ${letter.char}`,outer:shape.outer.map(([x,y])=>({x:x+letter.x,y:y+letter.y})),holes:shape.holes.map(ring=>ring.map(([x,y])=>({x:x+letter.x,y:y+letter.y})))})));
 return {contours,errors:result.errors,warnings:result.pending,bounds:result.bounds};
}
function textPlacement(contours,object){
 const c=Math.cos(object.rotation*Math.PI/180),s=Math.sin(object.rotation*Math.PI/180),map=ring=>ring.map(({x,y})=>({x:object.position.x+c*x-s*y,y:object.position.z+s*x+c*y}));
 return contours.map(shape=>({...shape,outer:map(shape.outer),holes:shape.holes.map(map)}));
}
function markingErrors(target,contours){
 const errors=[];
 for(const shape of contours)for(const ring of [shape.outer,...shape.holes]){
  if(ring.some(p=>!pointInRing(p,target.contour))||ringsIntersect(ring,target.contour))errors.push('Texto toca a borda ou fica fora da peça alvo.');
  if(target.cutouts.some(c=>ringsIntersect(ring,c)||pointInRing(ring[0],c)||pointInRing(c[0],ring)))errors.push('Texto cruza um vazado da peça alvo.');
 }
 return errors;
}
export function buildPanelsProject(project,materialId='acrylic'){
 const errors=validatePanelsProject(project),warnings=[],pieces=[],objects=[],assembly=[],markings=[],jointPairs=[];
 const result={valid:false,errors,warnings,pieces,displayPieces:[],dimensions:{width:0,height:0,depth:0},assembly,markings,materialId,revision:project?.revision,signature:'',objects,jointPairs};
 if(!MATERIALS.includes(materialId))errors.push('Material desconhecido.');
 if(!Number.isInteger(project?.quantity)||project.quantity<1||project.quantity>200)errors.push('Use de 1 a 200 conjuntos por lote.');
 if(errors.length)return result;
 result.signature=cutSignature(asWorkshopProject(project,materialId),materialId);
 const pending=[],automatic=[];
 for(const object of project.materials[materialId].objects){
  const cfg=object.config,before=pieces.length,objectErrors=[];
  if(!['x','y','z'].every(k=>finite(object.position[k]))||!finite(object.rotation,-36000,36000))objectErrors.push('Posição/rotação inválida.');
  if(!Number.isInteger(object.quantity)||object.quantity<1||object.quantity>200)objectErrors.push('Quantidade do objeto deve estar entre 1 e 200.');
  if(!finite(cfg.opacity,0,1)||!finite(cfg.measuredThickness,.01,1000)||!finite(cfg.thickness,.01,1000))objectErrors.push('Espessura/opacidade inválida.');
  if(!Number.isInteger(cfg.extraQuantity)||cfg.extraQuantity<0||cfg.extraQuantity>200)objectErrors.push('Reposições inválidas.');
  if(!['laser','router'].includes(cfg.process))objectErrors.push('Processo desconhecido.');
  if(objectErrors.length){errors.push(...objectErrors.map(e=>`${object.name}: ${e}`));continue;}
  if(object.type==='text'){
   if(!['cut','engrave','annotation','cutout','volume'].includes(cfg.operation)){errors.push(`${object.name}: operação de texto desconhecida.`);continue;}
   const layers=cfg.operation==='volume'?cfg.layerCount:1;
   if(cfg.operation==='volume'&&(!Number.isInteger(layers)||layers<2||layers>50)){errors.push(`${object.name}: volume em camadas exige de 2 a 50 camadas inteiras.`);continue;}
   if(cfg.operation==='volume'&&cfg.volumeDepthMm!=null&&(!finite(cfg.volumeDepthMm,.01)||Math.abs(cfg.volumeDepthMm-layers*cfg.measuredThickness)>1e-6)){errors.push(`${object.name}: profundidade deve corresponder exatamente ao número de camadas × espessura medida.`);continue;}
   const text=textContours(object,materialId);errors.push(...text.errors.map(e=>`${object.name}: ${e}`));warnings.push(...text.warnings);
   if(!text.errors.length){
    if(cfg.operation==='cut'||cfg.operation==='volume'){
     if(pieces.reduce((sum,p)=>sum+p.quantity,0)+text.contours.length*layers*(project.quantity*object.quantity+cfg.extraQuantity)>1200){errors.push(`${object.name}: o volume/lote excede 1.200 peças físicas; reduza texto, camadas ou quantidade.`);continue;}
     for(let layer=0;layer<layers;layer++)for(const c of text.contours){
      const id=cfg.operation==='volume'?`${c.id}:layer-${layer+1}`:c.id,label=cfg.operation==='volume'?`${c.label} · camada ${layer+1}/${layers}`:c.label;
      const p=pieceFromRing(object,materialId,c.outer,c.holes,id,label);p.quantity=project.quantity*object.quantity+cfg.extraQuantity;
      p.transform.origin=p.transform.origin.map((v,i)=>v+p.transform.normal[i]*layer*cfg.measuredThickness);
      if(cfg.operation==='volume')Object.assign(p,{construction:'laminated',layerIndex:layer+1,layerCount:layers,sourceContourId:c.id});
      pieces.push(p);
     }
     if(cfg.operation==='volume')assembly.push(`${object.name}: alinhar e colar ${layers} camadas de ${cfg.measuredThickness} mm; profundidade nominal ${(layers*cfg.measuredThickness).toFixed(3).replace(/\.?0+$/, '')} mm, sem incluir filme de adesivo. Validar adesivo, alinhamento e fixação; não há lateral curva nem cavidade interna.`);
    }
    else pending.push({object,contours:text.contours});
   }
   objects.push({id:object.id,name:object.name,pieceIds:pieces.slice(before).map(p=>p.id),width:text.bounds.width,height:text.bounds.height,depth:text.bounds.depth*layers});
   continue;
  }
  if(object.type==='vector'){
   const artwork=cfg.artwork,issues=artwork?.mode==='vector'?validateArtwork(artwork):['Importe uma arte e confirme sua escala em mm.'];
   if(issues.length){errors.push(...issues.map(e=>`${object.name}: ${e}`));continue;}
   const points=artwork.contours.flatMap(c=>c.outer),minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxX=Math.max(...points.map(p=>p[0])),scale=artwork.widthMm/(maxX-minX);
   const convert=ring=>ring.map(([x,y])=>({x:(x-minX)*scale,y:(y-minY)*scale}));
   for(const [i,c] of artwork.contours.entries()){
    const piece=pieceFromRing(object,materialId,convert(c.outer),c.holes.map(convert),`imported-${i+1}`,c.label||`${object.name} · Forma ${i+1}`);
    piece.face='imported';piece.sourceId=c.id||`shape-${i+1}`;piece.quantity=project.quantity*object.quantity+cfg.extraQuantity;pieces.push(piece);
   }
   objects.push({id:object.id,name:object.name,pieceIds:pieces.slice(before).map(p=>p.id),width:artwork.widthMm,height:artwork.heightMm,depth:cfg.measuredThickness});
   warnings.push('Arte vetorial: curvas aproximadas pelo importador; conferir tolerância de fabricação.');
   continue;
  }
  const model=object.type==='plate'?'flat':object.type==='dividers'?'dividers':object.type==='vector'?'imported':cfg.model;
  const legacy=buildBoxPanels({quantity:project.quantity*object.quantity,components:{[materialId]:{...cfg,model}}},materialId);
  errors.push(...legacy.errors.map(e=>`${object.name}: ${e}`));warnings.push(...legacy.warnings);assembly.push(...legacy.assembly);
  for(const item of legacy.pieces){
   const p={...item,id:`${object.id}:${item.id}`,objectId:object.id,visible:object.visible,operation:'cut',perSet:object.quantity,label:`${object.name} · ${item.label}`,material:{...item.material,opacity:cfg.opacity},transform:composeTransform(item.transform,object)};
   if(item.hinge){const h=composeTransform({origin:item.hinge.axis,u:item.hinge.direction,v:[0,1,0],normal:[0,0,1]},object);p.hinge={...item.hinge,axis:h.origin,direction:h.u};}
   if(object.type==='plate'){
    if(!['rectangle','ellipse'].includes(cfg.shape)){errors.push(`${object.name}: forma de placa desconhecida.`);continue;}
    if(cfg.shape==='ellipse')p.contour=circleRing(p.width/2,p.height/2,p.width/2,p.height/2);
    if(!Array.isArray(cfg.holes)||!Array.isArray(cfg.cutouts)||cfg.holes.length>100||cfg.cutouts.length>200){errors.push(`${object.name}: furos/vazados inválidos.`);continue;}
    p.cutouts=cfg.cutouts.map(ring=>Array.isArray(ring)?ring.map(q=>Array.isArray(q)?{x:q[0],y:q[1]}:q):[]);
    for(const h of cfg.holes){if(!finite(h?.x)||!finite(h?.y)||!finite(h?.diameter,.01,100000)||h.through===false){errors.push(`${object.name}: furo inválido; somente furos passantes suportados.`);continue;}p.cutouts.push(circleRing(h.x,h.y,h.diameter/2));}
    if(p.cutouts.some(ring=>ring.length<3||ring.length>2000||ring.some(q=>!finite(q?.x)||!finite(q?.y)))||p.cutouts.reduce((sum,r)=>sum+r.length,0)>8000){errors.push(`${object.name}: coordenadas ou limite de pontos dos vazados inválidos.`);continue;}
    errors.push(...cutoutsErrors(p).map(e=>`${object.name}: ${e}`));
   }
   pieces.push(p);
  }
  const own=pieces.slice(before);
  if(own.some(p=>p.face.startsWith('divider-')))automatic.push(...dividerPairs(own,object));
  objects.push({id:object.id,name:object.name,pieceIds:own.map(p=>p.id),...legacy.dimensions,inner:legacy.inner,cells:legacy.cells,body:legacy.body||legacy.dimensions,envelope:legacy.envelope||legacy.dimensions,hinge:legacy.hinge});
 }
 const overrides=[...project.materials[materialId].objects.flatMap(o=>Array.isArray(o.config.joints)?o.config.joints:[]),...project.materials[materialId].joints],byJoint=new Map(automatic.map(j=>[j.id,j]));
 for(const j of overrides){if(!record(j)||typeof j.id!=='string'){errors.push('Encaixe malformado.');continue;}byJoint.set(j.id,{...byJoint.get(j.id),...j});}
 const joints=applyJoints(pieces,[...byJoint.values()]);errors.push(...joints.errors);jointPairs.push(...joints.jointPairs);
 for(const {object,contours:source} of pending){
  const cfg=object.config,target=pieces.find(p=>p.id===cfg.targetPieceId),contours=textPlacement(source,object);
  if(cfg.operation!=='annotation'&&!target){errors.push(`${object.name}: selecione uma peça alvo física para ${cfg.operation}.`);continue;}
  if(cfg.targetPieceId&&!target){errors.push(`${object.name}: peça alvo não encontrada.`);continue;}
  if(target){const issues=markingErrors(target,contours);if(issues.length){errors.push(...issues.map(e=>`${object.name}: ${e}`));continue;}}
  if(cfg.operation==='cutout'){
   if(contours.some(c=>c.holes.length)){errors.push(`${object.name}: texto vazado cria ilhas sem pontes; importe um vetor com pontes explícitas.`);continue;}
   const cuts=contours.map(c=>c.outer),issues=cutoutsErrors(target,cuts);if(issues.length){errors.push(...issues.map(e=>`${object.name}: ${e}`));continue;}target.cutouts.push(...cuts);
  }else markings.push({id:`${object.id}:marking`,objectId:object.id,operation:cfg.operation,targetPieceId:target?.id||null,contours:target?contours:source,visible:object.visible&&target?.visible!==false,transform:target?.transform||composeTransform(transform([0,0,0],[1,0,0],[0,0,1],[0,1,0]),object),text:cfg.text,color:cfg.color});
 }
 // Recheck after all subtractive objects: object ordering cannot permit engraving over a later aperture.
 for(const mark of markings){const target=pieces.find(p=>p.id===mark.targetPieceId);if(target)errors.push(...markingErrors(target,mark.contours).map(e=>`${mark.text}: ${e}`));}
 for(const p of pieces){const extra=project.pieceExtras?.[p.id]||0;p.quantity+=extra;p.extraQuantity+=extra;}
 for(const id of Object.keys(project.pieceExtras||{}))if(!pieces.some(p=>p.id===id)&&!MATERIALS.filter(m=>m!==materialId).some(m=>project.materials[m].objects.some(o=>id.startsWith(o.id+':'))))warnings.push('Reposição de peça antiga ignorada: a geometria do objeto mudou.');
 if(pieces.reduce((n,p)=>n+p.quantity,0)>1200)errors.push('O lote excede 1.200 peças físicas.');
 result.displayPieces=pieces.filter(p=>p.visible);result.dimensions=bounds3D(pieces);result.valid=errors.length===0;result.errors=[...new Set(errors)];result.warnings=[...new Set(warnings)];
 return result;
}

/** Returns a fabrication-valid half-lap for a real perpendicular crossing, without mutating pieces. */
export function createJointForPieces(a,b,clearance=0,minWeb=1){
 if(!a||!b||a.id===b.id)throw Error('Selecione duas peças físicas diferentes.');
 if(a.material?.kind!==b.material?.kind)throw Error('O par deve pertencer ao mesmo material.');
 const positions=crossingPositions(a,b),joint={id:uid(),a:a.id,b:b.id,...positions,depthA:a.height/2,depthB:b.height/2,entryA:'top',entryB:'bottom',clearance,minWeb,enabled:true};
 const checked=applyJoints(structuredClone([a,b]),[joint],{preserveExisting:true});
 if(checked.errors.length)throw Error(checked.errors.join(' '));
 return checked.jointPairs[0];
}
