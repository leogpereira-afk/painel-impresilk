import {workshopArtwork} from './vector.mjs';
const n=(x,min=0,max=100000)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const r=x=>Math.round(x*1e9)/1e9;
export const rectangle=(width,height)=>[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
export const transform=(origin=[0,0,0],u=[1,0,0],v=[0,1,0],normal=[0,0,1])=>({origin,u,v,normal});
export function polygonArea(points){return Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.y-q.x*p.y;},0))/2;}
export function slotGeometry(thickness,clearance,kerf=null){
  if(!n(thickness,.01)||!n(clearance,0,10)||(kerf!==null&&!n(kerf,0,10)))throw new Error('Espessura, folga ou kerf inválidos.');
  const nominalWidth=thickness+clearance;
  return {nominalWidth:r(nominalWidth),internalPathWidth:kerf===null?null:r(nominalWidth-kerf),compensationLocation:'CAM',kerf};
}
/** Slot is an open contour interruption; complementary pieces open from opposite sides. */
function slottedContour(width,height,slots){
 const points=[{x:0,y:0}],bottom=slots.filter(x=>x.edge==='bottom').sort((a,b)=>a.center-b.center),top=slots.filter(x=>x.edge==='top').sort((a,b)=>b.center-a.center);
 for(const s of bottom){const a=s.center-s.width/2,b=s.center+s.width/2;points.push({x:a,y:0},{x:a,y:s.depth},{x:b,y:s.depth},{x:b,y:0});}
 points.push({x:width,y:0},{x:width,y:height});
 for(const s of top){const a=s.center-s.width/2,b=s.center+s.width/2;points.push({x:b,y:height},{x:b,y:height-s.depth},{x:a,y:height-s.depth},{x:a,y:height});}
 points.push({x:0,y:height});return points;
}
/** True complementary vertical corner teeth. Base and lid remain butt/glued joints. */
function fingerContour(width,height,thickness,front,clearance,count){
 const intervals=[];
 for(let i=0;i<count;i++){
   const missing=front?i%2===1:i%2===0;
   if(missing)intervals.push([Math.max(0,height*i/count-(front?clearance/2:0)),Math.min(height,height*(i+1)/count+(front?clearance/2:0))]);
 }
 const levels=[...new Set([0,height,...intervals.flat()])].sort((a,b)=>a-b);
 const runs=levels.slice(0,-1).map((lo,i)=>({lo,hi:levels[i+1],inset:intervals.some(([a,b])=>(lo+levels[i+1])/2>a&&(lo+levels[i+1])/2<b)?thickness:0}));
 const points=[{x:runs[0].inset,y:0},{x:width-runs[0].inset,y:0}];
 for(let i=0;i<runs.length;i++){const run=runs[i];points.push({x:width-run.inset,y:run.hi});if(i<runs.length-1&&runs[i+1].inset!==run.inset)points.push({x:width-runs[i+1].inset,y:run.hi});}
 points.push({x:runs.at(-1).inset,y:height});
 for(let i=runs.length-1;i>=0;i--){const run=runs[i];points.push({x:run.inset,y:run.lo});if(i>0&&runs[i-1].inset!==run.inset)points.push({x:runs[i-1].inset,y:run.lo});}
 // A single open ring, with no return over the bottom/top edge of an absent tooth.
 if(points.at(-1).x===points[0].x&&points.at(-1).y===points[0].y)points.pop();
 return points;
}
export function buildPanels(project,materialId){
 const cfg=project.components[materialId],errors=[],warnings=[],pieces=[],assembly=[];
 const W=cfg.width,D=cfg.depth,H=cfg.height,t=cfg.measuredThickness;
 for(const[k,v]of Object.entries({largura:W,profundidade:D,altura:H,espessura:t}))if(!n(v,.01))errors.push(`${k}: informe medida positiva em mm.`);
 if(!n(cfg.thickness,.01)||!n(cfg.clearance,0,10))errors.push('Espessura nominal ou folga inválida.');
 if(!['external','internal'].includes(cfg.dimensionMode))errors.push('Defina dimensão interna ou externa.');
 if(!['butt','finger'].includes(cfg.joint))errors.push('Encontro não implementado.');
 if(!['flat','open-box','closed-box','removable-lid','dividers','organizer','display','imported'].includes(cfg.model))errors.push('Modelo não implementado.');
 if(!['laser','router'].includes(cfg.process))errors.push('Processo de recorte não reconhecido.');
 if(!Number.isInteger(cfg.extraQuantity)||cfg.extraQuantity<0||cfg.extraQuantity>200)errors.push('Reposições por tipo devem ser inteiras entre 0 e 200.');
 if(errors.length)return{pieces,errors,warnings,assembly,dimensions:{width:W,depth:D,height:H}};
 const material={id:materialId,kind:materialId,sku:cfg.sku,finish:cfg.finish,color:cfg.color,thickness:t,nominalThickness:cfg.thickness,process:cfg.process,directional:cfg.rotation===false||cfg.directional===true,subtype:cfg.subtype,source:'manual'};
 const add=(id,label,width,height,face,tr,extra={})=>{pieces.push({id:`${materialId}-${id}`,componentId:materialId,label,width:r(width),height:r(height),thickness:t,face,kind:'sheet',perSet:1,quantity:project.quantity+cfg.extraQuantity,extraQuantity:cfg.extraQuantity,contour:rectangle(r(width),r(height)),holes:[],cutouts:[],slots:[],material:{...material},transform:tr,rotations:material.directional?[0]:[0,90],...extra});};
 const isBox=['open-box','closed-box','removable-lid','organizer'].includes(cfg.model),hasLid=['closed-box','removable-lid'].includes(cfg.model);
 let width=W,depth=D,height=H,inner={width:W,depth:D,height:H};
 if(isBox){
   const verticalLayers=hasLid?2:1;
   if(cfg.dimensionMode==='internal'){width=W+2*t;depth=D+2*t;height=H+verticalLayers*t;}
   inner={width:r(width-2*t),depth:r(depth-2*t),height:r(height-verticalLayers*t)};
   if(Math.min(inner.width,inner.depth,inner.height)<=0)errors.push('A espessura elimina o vão interno; aumente as dimensões.');
   if(cfg.model==='removable-lid'&&cfg.clearance>=Math.min(inner.width,inner.depth))errors.push('A folga elimina a tampa embutida.');
   if(errors.length)return{pieces:[],errors,warnings,assembly,inner,dimensions:{width,depth,height}};
   add('front','Frente',width,height,'front',transform([0,0,0],[1,0,0],[0,0,1],[0,1,0]));
   add('back','Traseira',width,height,'back',transform([0,depth-t,0],[1,0,0],[0,0,1],[0,1,0]));
   const fingers=cfg.joint==='finger',sideDepth=fingers?depth:inner.depth,sideOffset=fingers?0:t;
   add('left','Lateral esquerda',sideDepth,height,'left',transform([0,sideOffset,0],[0,1,0],[0,0,1],[1,0,0]));
   add('right','Lateral direita',sideDepth,height,'right',transform([width-t,sideOffset,0],[0,1,0],[0,0,1],[1,0,0]));
   if(fingers){
     const count=Number.isInteger(cfg.fingerCount)&&cfg.fingerCount>=3&&cfg.fingerCount<=31?cfg.fingerCount:7;
     if(height/count<=cfg.clearance+1e-6)errors.push('Folga maior que o passo dos dedos.');
     pieces.slice(0,4).forEach((p,i)=>{p.contour=fingerContour(p.width,p.height,t,i<2,cfg.clearance,count);p.joint='finger';});
     warnings.push('Dedos complementares somente nos quatro encontros verticais. Base e tampa usam encontro de topo com fixação/colagem a definir.');
   }
   add('bottom','Base embutida',inner.width,inner.depth,'bottom',transform([t,t,0]));
   if(hasLid){const gap=cfg.model==='removable-lid'?cfg.clearance:0;add('lid',cfg.model==='removable-lid'?'Tampa removível embutida':'Tampa embutida',inner.width-gap,inner.depth-gap,'lid',transform([t+gap/2,t+gap/2,height-t]));}
   assembly.push('Posicionar a base embutida alinhada embaixo.','Montar frente e traseira inteiras; laterais entre elas.','Confirmar colagem/fixação da base e cantos antes da fabricação.');
   if(hasLid)assembly.push(cfg.model==='removable-lid'?'Tampa apoiada por suporte interno a detalhar; não há ferragem ou dobradiça presumida.':'Fechar com tampa embutida e colagem/fixação definida.');
 }
 if(cfg.model==='flat')add('flat','Peça plana',W,H,'flat',transform([0,0,0],[1,0,0],[0,0,1],[0,1,0]));
 if(cfg.model==='imported'){
   const imported=workshopArtwork(cfg.artwork);errors.push(...imported.errors);
   for(const p of imported.pieces)add(p.id,p.label,p.width,p.height,'imported',transform([p.x,0,p.y],[1,0,0],[0,0,1],[0,1,0]),{contour:p.contour,cutouts:p.cutouts,sourceId:p.sourceId});
   if(!imported.errors.length){width=cfg.artwork.widthMm;height=cfg.artwork.heightMm;depth=t;inner={width,depth,height};}
   warnings.push('Arte importada: curvas aproximadas pelo importador em segmentos; conferir tolerância antes de fabricar. Encaixe por contornos e uso de vazados permanecem indisponíveis.');
 }
 if(cfg.model==='display'){
   add('base','Base do display',W,D,'base',transform());
   add('back','Painel vertical do display',W,H-t,'back',transform([0,D-t,t],[1,0,0],[0,0,1],[0,1,0]));
   assembly.push('Unir o painel vertical sobre a base por colagem/fixação informada; resistência e estabilidade não dimensionadas.');
   if(H<=t)errors.push('A espessura elimina a altura do display.');
 }
 let cells;
 if(['dividers','organizer'].includes(cfg.model)){
   const cols=cfg.columns,rows=cfg.rows,inside=cfg.model==='organizer'?inner:{width:W,depth:D,height:H},x0=cfg.model==='organizer'?t:0,y0=x0,z0=cfg.model==='organizer'?t:0;
   if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols>30||rows>30)errors.push('Use de 1 a 30 colunas e linhas.');
   else{
     cells={width:r((inside.width-(cols-1)*t)/cols),depth:r((inside.depth-(rows-1)*t)/rows),columns:cols,rows};
     if(Math.min(cells.width,cells.depth)<=cfg.clearance)errors.push('Divisórias/folga eliminam os vãos das células.');
     else{
       const sx=Array.from({length:cols-1},(_,i)=>(i+1)*cells.width+i*t+t/2),sy=Array.from({length:rows-1},(_,i)=>(i+1)*cells.depth+i*t+t/2),sw=t+cfg.clearance;
       sx.forEach((x,i)=>{const slots=sy.map(center=>({center,width:sw,depth:inside.height/2,edge:'top'}));add(`divider-d${i+1}`,`Divisória profundidade ${i+1}`,inside.depth,inside.height,'divider-depth',transform([x0+x-t/2,y0,z0],[0,1,0],[0,0,1],[1,0,0]),{slots,contour:slottedContour(inside.depth,inside.height,slots)});});
       sy.forEach((y,i)=>{const slots=sx.map(center=>({center,width:sw,depth:inside.height/2,edge:'bottom'}));add(`divider-w${i+1}`,`Divisória largura ${i+1}`,inside.width,inside.height,'divider-width',transform([x0,y0+y-t/2,z0],[1,0,0],[0,0,1],[0,1,0]),{slots,contour:slottedContour(inside.width,inside.height,slots)});});
       assembly.push('Unir meios-encaixes: divisórias de profundidade abrem por cima; divisórias de largura abrem por baixo.');
     }
   }
 }
 if(cfg.process==='router'&&pieces.some(p=>p.slots.length||p.joint==='finger'))errors.push('Encaixes com cantos internos vivos exigem alívio/raio validado no router. Use laser ou detalhe o alívio antes do corte.');
 if(cfg.kerf!=null&&!n(cfg.kerf,0,10))errors.push('Kerf informado inválido.');
 warnings.push('Geometria nominal em mm; compensação de corte no CAM, após calibração. Nenhum G-code gerado.');
 if(!cfg.sku)warnings.push('Material manual sem SKU; catálogo/estoque remoto não conectado.');
 return{pieces:errors.length?[]:pieces,errors,warnings,assembly,dimensions:{width:r(width),depth:r(depth),height:r(height)},inner,cells};
}
