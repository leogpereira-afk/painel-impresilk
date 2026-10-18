import {buildPanels,rectangle,transform} from '../oficina/geometry.mjs';
import {circleRing} from './geometry.mjs';
export function normalizeBoxConfig(c){return {...c,lidHeight:c.lidHeight??20,lidClearance:c.lidClearance??.3,pivotClearance:c.pivotClearance??.2,lidAngle:c.lidAngle??0,organizerLid:c.organizerLid??'none'};}
/** All manufacturing contours stay in local XY; articulation changes only displayTransform. */
export function buildBoxPanels(project,materialId){
 const original=project.components[materialId];
 if(original.joint==='finger'&&(!Number.isInteger(original.fingerCount)||original.fingerCount<3||original.fingerCount>31))return {pieces:[],errors:['Encaixe nos cantos exige de 3 a 31 dedos inteiros.'],warnings:[],assembly:[],dimensions:{width:original.width,depth:original.depth,height:original.height}};
 if(original.model==='removable-lid'&&original.lidHeight==null&&original.lidClearance==null){const old=buildPanels(project,materialId);old.warnings.push('Projeto antigo: tampa embutida preservada. Defina altura da saia e folga para converter em tampa de sobrepor.');return old;}
 const c=normalizeBoxConfig(project.components[materialId]),lid=c.model==='organizer'?c.organizerLid:c.model==='removable-lid'?'removable':c.model==='hinged-lid'?'hinged':'none';
 const custom=lid!=='none',base=buildPanels({...project,components:{[materialId]:{...c,model:custom&&c.model!=='organizer'?'open-box':c.model}}},materialId);
 if(!base.errors.length&&c.dividerHeight!=null&&['organizer','dividers'].includes(c.model)){
  if(!Number.isFinite(c.dividerHeight)||c.dividerHeight<=0||c.dividerHeight>base.inner.height){base.errors.push('Altura das divisórias deve ser positiva e caber no vão interno.');base.pieces=[];}
  else for(const p of base.pieces.filter(p=>p.face.startsWith('divider-'))){p.height=c.dividerHeight;p.contour=rectangle(p.width,p.height);p.slots=[];}
 }
 if(!base.errors.length&&['organizer','dividers'].includes(c.model)){
  const t=c.measuredThickness,offset=c.model==='organizer'?t:0,inside=base.inner;
  const positions=(input,count,span,label)=>{
   if(input!=null&&!Array.isArray(input))throw Error(`Posições ${label}: informe uma lista de centros em mm.`);
   const custom=Array.isArray(input)&&input.length>0;
   if(custom&&input.length!==count-1)throw Error(`Posições ${label}: informe ${count-1} centros para as divisórias.`);
   const cell=(span-(count-1)*t)/count,values=custom?[...input]:Array.from({length:count-1},(_,i)=>(i+1)*cell+i*t+t/2);
   if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error(`Posições ${label}: centros devem ser números finitos em mm.`);
   let edge=0;const gaps=[];
   for(const center of values){const gap=center-t/2-edge;if(gap<=c.clearance)throw Error(`Posições ${label}: ordenar centros e preservar vão maior que a folga entre bordas das peças.`);gaps.push(gap);edge=center+t/2;}
   const last=span-edge;if(last<=c.clearance)throw Error(`Posições ${label}: última divisória invade a borda ou elimina o vão.`);gaps.push(last);
   return {values,gaps,custom};
  };
  try{
   const x=positions(c.dividerPositionsX,c.columns,inside.width,'X'),y=positions(c.dividerPositionsY,c.rows,inside.depth,'Y');
   base.pieces.filter(p=>p.face==='divider-depth').forEach((p,i)=>{p.transform.origin[0]=offset+x.values[i]-t/2;p.contour=rectangle(p.width,p.height);p.slots=[];});
   base.pieces.filter(p=>p.face==='divider-width').forEach((p,i)=>{p.transform.origin[1]=offset+y.values[i]-t/2;p.contour=rectangle(p.width,p.height);p.slots=[];});
   Object.assign(base.cells,{positionsX:x.values,positionsY:y.values,widths:x.gaps,depths:y.gaps,nonUniform:x.custom||y.custom,width:Math.min(...x.gaps),depth:Math.min(...y.gaps)});
  }catch(error){base.errors.push(error.message);base.pieces=[];}
 }
 if(!custom||base.errors.length)return base;
 const t=c.measuredThickness,g=c.lidClearance,{width:W,depth:D,height:H}=base.dimensions;
 const fail=message=>{base.errors.push(message);base.pieces=[];return base;};
 if(!['removable','hinged'].includes(lid))return fail('Tampa do organizador desconhecida.');
 if(!Number.isFinite(g)||g<0||g>10)return fail('Folga da tampa deve ser finita, de 0 a 10 mm por lado.');
 const template=base.pieces[0];
 const add=(id,label,w,h,tr,contour=rectangle(w,h),cutouts=[])=>{const p={...template,id:`${materialId}-${id}`,label,face:id,width:w,height:h,contour,cutouts,slots:[],holes:[],transform:tr};delete p.joint;base.pieces.push(p);return p;};
 if(lid==='removable'){
  const s=c.lidHeight;if(!Number.isFinite(s)||s<=0||s>H)return fail('Altura da saia deve ser positiva e não ultrapassar a altura do corpo.');
  const w=W+2*(g+t),d=D+2*(g+t),x=-g-t,y=-g-t;
  add('lid','Tampa de sobrepor',w,d,transform([x,y,H]));
  add('lid-skirt-front','Saia frontal',w,s,transform([x,y,H-s],[1,0,0],[0,0,1],[0,1,0]));
  add('lid-skirt-back','Saia traseira',w,s,transform([x,D+g,H-s],[1,0,0],[0,0,1],[0,1,0]));
  add('lid-skirt-left','Saia esquerda',D+2*g,s,transform([x,-g,H-s],[0,1,0],[0,0,1],[1,0,0]));
  add('lid-skirt-right','Saia direita',D+2*g,s,transform([W+g,-g,H-s],[0,1,0],[0,0,1],[1,0,0]));
  base.envelope={width:w,depth:d,height:H+t};
  base.assembly.push('Colar as quatro saias sob o tampo: frente e traseira inteiras, laterais entre elas. A folga é por lado; montar e calibrar em corpo de prova antes de colar.');
 }else{
  const pc=c.pivotClearance,angle=c.lidAngle;
  if(!Number.isFinite(pc)||pc<.05||pc>t/2)return fail('Folga radial do pivô deve estar entre 0,05 mm e metade da espessura.');
  if(g<.05||g>t/2)return fail('Tampa articulada exige folga por lado entre 0,05 mm e metade da espessura.');
  if(!Number.isFinite(angle)||angle<0||angle>100)return fail('A abertura permitida é de 0 a 100 graus.');
  if(W<12*t||D<12*t||H<4*t)return fail('Pivô sem espaço: corpo exige largura/profundidade de 12 espessuras e altura de 4 espessuras.');
  if(c.process==='router')return fail('Pivôs integrados exigem laser; alívios de ferramenta do router ainda não validados.');
  const axisY=D+3*t,axisZ=H+g+t/2,R=t/Math.SQRT2+pc,supportY=D-4*t,sh=axisZ+R+2*t,sw=10*t;
  for(const [id,x] of [['left',-t],['right',W]])add(`hinge-support-${id}`,`Apoio do pivô ${id==='left'?'esquerdo':'direito'}`,sw,sh,transform([x,supportY,0],[0,1,0],[0,0,1],[1,0,0]),rectangle(sw,sh),[circleRing(axisY-supportY,axisZ,R,R,96)]);
  // Rectangular sheet pins have a circular swept radius sqrt(2)*t/2.
  const pinY=axisY+t,w=W+2*t,d=pinY+t/2,contour=[{x:t+g,y:0},{x:W+t-g,y:0},{x:W+t-g,y:pinY-t/2},{x:w,y:pinY-t/2},{x:w,y:d},{x:0,y:d},{x:0,y:pinY-t/2},{x:t+g,y:pinY-t/2}];
  const p=add('lid','Tampa com pivôs integrados',w,d,transform([-t,-t,H+g]),contour);
  p.hinge={axis:[0,axisY,axisZ],direction:[1,0,0],angle,maxAngle:100,pinRadius:t/Math.SQRT2,holeRadius:R,radialClearance:pc};
  add('lid-front-stop','Apoio frontal de fechamento',W-2*t,3*t+g,transform([t,-t,H-3*t],[1,0,0],[0,0,1],[0,1,0]));
  base.envelope={width:W+2*t,depth:D+7*t,height:sh};
  base.hinge={...p.hinge,validatedSweep:[0,100],validation:'Eixo atrás do corpo; varredura circular do pino inscrita no furo. Tampa entre apoios; batente abaixo do plano fechado. Sem avaliação de resistência.'};
  base.assembly.push('Colar um apoio externo à lateral e o batente na face externa frontal, sob o avanço da tampa. Inserir o primeiro pivô; encaixar o segundo apoio no outro pivô antes de colá-lo à lateral. Não colar os pivôs.','Calibrar folgas no corpo de prova e testar abertura de 0 a 100°. Eixo atrás do corpo e apoios externos aumentam o envelope.');
  base.warnings.push('Articulação sem validação física: pinos retangulares em alojamentos circulares (folga radial); verificar desgaste, retenção e colagem. Não certifica resistência ou durabilidade.');
 }
 if(c.calibrationCoupon){
  const radius=t/Math.SQRT2+c.pivotClearance,size=8*t;
  if(!Number.isFinite(radius)||radius<=0||radius>=size/2)return fail('Folga inválida para corpo de prova.');
  add('calibration-hole','Corpo de prova · alojamento',size,size,transform([W+12*t,0,0]),rectangle(size,size),[circleRing(size/2,size/2,radius)]);
  add('calibration-pin','Corpo de prova · pino',6*t,4*t,transform([W+22*t,0,0]),[{x:0,y:0},{x:4*t,y:0},{x:4*t,y:1.5*t},{x:6*t,y:1.5*t},{x:6*t,y:2.5*t},{x:4*t,y:2.5*t},{x:4*t,y:4*t},{x:0,y:4*t}]);
  base.assembly.push('Cortar o corpo de prova na mesma chapa/processo; inserir o pino no alojamento, girar e ajustar a folga radial antes do lote.');
 }
 base.body={...base.dimensions};return base;
}
