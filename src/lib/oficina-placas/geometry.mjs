import {rectangle} from '../oficina/geometry.mjs';
import {validateContours, ringsIntersect, pointInRing} from '../letras/vectors.mjs';
export const EPS = 1e-6;
export const finite = (n,min=-100000,max=100000)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export const round = n=>Math.round(n*1e9)/1e9;
export const dot = (a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const worldPoint = (tr,x,y,z=0)=>tr.origin.map((v,i)=>v+tr.u[i]*x+tr.v[i]*y+tr.normal[i]*z);
export function composeTransform(tr,object){
 const angle=object.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const rotate=([x,y,z])=>[c*x-s*y,s*x+c*y,z];
 return {origin:rotate(tr.origin).map((n,i)=>n+object.position[['x','y','z'][i]]),u:rotate(tr.u),v:rotate(tr.v),normal:rotate(tr.normal)};
}
export function bounds3D(pieces){
 if(!pieces.length)return {width:0,depth:0,height:0,min:[0,0,0],max:[0,0,0]};
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const piece of pieces)for(const z of [0,piece.thickness])for(const q of piece.contour){
  const p=worldPoint(piece.transform,q.x,q.y,z);for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 }
 return {width:round(max[0]-min[0]),depth:round(max[1]-min[1]),height:round(max[2]-min[2]),min,max};
}
export function circleRing(x,y,rx,ry=rx){return Array.from({length:96},(_,i)=>({x:round(x+rx*Math.cos(i*Math.PI/48)),y:round(y+ry*Math.sin(i*Math.PI/48))}));}
export function cutoutsErrors(piece,additional=[]){
 const cuts=[...(piece.cutouts||[]),...additional],errors=validateContours([{outer:piece.contour,holes:cuts}]);
 for(let i=0;i<cuts.length;i++){
  if(ringsIntersect(piece.contour,cuts[i])||cuts[i].some(p=>!pointInRing(p,piece.contour)))errors.push('Vazado toca a borda ou fica fora da peça.');
  for(let j=0;j<i;j++)if(ringsIntersect(cuts[i],cuts[j])||pointInRing(cuts[i][0],cuts[j])||pointInRing(cuts[j][0],cuts[i]))errors.push('Vazados sobrepostos ou aninhados.');
 }
 return [...new Set(errors)];
}
export function slottedContour(width,height,slots){
 const points=[{x:0,y:0}];
 for(const s of slots.filter(s=>s.edge==='bottom').sort((a,b)=>a.center-b.center)){
  const a=s.center-s.width/2,b=s.center+s.width/2;points.push({x:a,y:0},{x:a,y:s.depth},{x:b,y:s.depth},{x:b,y:0});
 }
 points.push({x:width,y:0},{x:width,y:height});
 for(const s of slots.filter(s=>s.edge==='top').sort((a,b)=>b.center-a.center)){
  const a=s.center-s.width/2,b=s.center+s.width/2;points.push({x:b,y:height},{x:b,y:height-s.depth},{x:a,y:height-s.depth},{x:a,y:height});
 }
 points.push({x:0,y:height});return points;
}
export function crossingPositions(a,b){
 const ta=a.transform,tb=b.transform;
 if(Math.abs(dot(ta.u,tb.u))>EPS||Math.abs(ta.v[2]-1)>EPS||Math.abs(tb.v[2]-1)>EPS||Math.abs(ta.u[2])+Math.abs(tb.u[2])>EPS)throw Error('Meio-encaixe exige painéis verticais perpendiculares.');
 const ca=worldPoint(ta,0,0,a.thickness/2),cb=worldPoint(tb,0,0,b.thickness/2),delta=cb.map((v,i)=>v-ca[i]);
 if(Math.abs(ca[2]-cb[2])>EPS||Math.abs(a.height-b.height)>EPS)throw Error('Meio-encaixe exige bases alinhadas e alturas iguais nesta versão.');
 return {positionA:dot(delta,ta.u),positionB:-dot(delta,tb.u)};
}
/** Auto pairs describe actual center-plane crossings, not arbitrary adjacent slots. */
export function dividerPairs(pieces,object){
 const ds=pieces.filter(p=>p.face==='divider-depth'),ws=pieces.filter(p=>p.face==='divider-width'),pairs=[];
 for(const a of ds)for(const b of ws){const positions=crossingPositions(a,b);pairs.push({id:`${object.id}:joint:${a.id.split(':').at(-1)}:${b.id.split(':').at(-1)}`,a:a.id,b:b.id,...positions,depthA:a.height/2,depthB:b.height/2,entryA:'top',entryB:'bottom',clearance:object.config.clearance,minWeb:1,enabled:true,automatic:true});}
 return pairs;
}
const rectangularProfile=(ring,width,height)=>Array.isArray(ring)&&ring.length===4&&new Set(ring.map(q=>`${q.x},${q.y}`)).size===4&&ring.every(q=>(Math.abs(q.x)<EPS||Math.abs(q.x-width)<EPS)&&(Math.abs(q.y)<EPS||Math.abs(q.y-height)<EPS));
export function applyJoints(pieces,joints,{preserveExisting=false}={}){
 const errors=[],out=[],byId=new Map(pieces.map(p=>[p.id,p])),slots=new Map(),provenRectangles=new Set();
 for(const p of pieces){
  if(!preserveExisting){
   // Legacy automatic slots are reconstructed from all editable pairs in a fresh build.
   if(p.face?.startsWith('divider-')){p.slots=[];p.contour=rectangle(p.width,p.height);}
   continue;
  }
  if(!p.slots?.length)continue;
  // A tag alone is insufficient: both the canonical blank and every point of the
  // emitted slotted contour must match, so custom nonrectangular artwork is never replaced.
  const validSlots=p.slots.every(slot=>finite(slot.center)&&finite(slot.width,.01)&&finite(slot.depth,.01,p.height)&&['top','bottom'].includes(slot.edge)&&finite(slot.minWeb??1,.01,1000)&&slot.center-slot.width/2>=(slot.minWeb??1)-EPS&&slot.center+slot.width/2<=p.width-(slot.minWeb??1)+EPS&&slot.depth<=p.height-(slot.minWeb??1)+EPS);
  const expected=validSlots?slottedContour(p.width,p.height,p.slots):[];
  const matching=rectangularProfile(p.jointBaseContour,p.width,p.height)&&expected.length===p.contour.length&&expected.every((q,i)=>Math.abs(q.x-p.contour[i].x)<EPS&&Math.abs(q.y-p.contour[i].y)<EPS);
  const overlap=p.slots.some((slot,i)=>p.slots.slice(0,i).some(other=>Math.abs(slot.center-other.center)<(slot.width+other.width)/2+Math.max(slot.minWeb??1,other.minWeb??1)-EPS));
  if(!matching||!validSlots||overlap){errors.push(`${p.label}: contorno ou rasgos existentes não correspondem à peça retangular original.`);continue;}
  provenRectangles.add(p.id);slots.set(p.id,p.slots.map(slot=>({...slot})));
 }

 for(const joint of joints){
  if(joint.enabled===false){out.push({...joint});continue;}
  const a=byId.get(joint.a),b=byId.get(joint.b);
  try{
   if(!a||!b||a===b)throw Error('Par de peças ausente ou repetido.');
   if(!finite(joint.clearance,0,10)||!finite(joint.minWeb,.01,1000))throw Error('Folga ou material mínimo de borda inválido.');
   if(!['top','bottom'].includes(joint.entryA)||!['top','bottom'].includes(joint.entryB)||joint.entryA===joint.entryB)throw Error('Entradas dos meios-encaixes devem ser opostas.');
   const expected=crossingPositions(a,b);
   if(!finite(joint.positionA)||!finite(joint.positionB)||Math.abs(expected.positionA-joint.positionA)>EPS||Math.abs(expected.positionB-joint.positionB)>EPS)throw Error('Posição do rasgo não coincide com a interseção real das peças.');
   if(!finite(joint.depthA,.01,a.height-joint.minWeb)||!finite(joint.depthB,.01,b.height-joint.minWeb)||Math.abs(joint.depthA+joint.depthB-a.height)>EPS)throw Error('Profundidades devem se complementar na altura e preservar material na raiz.');
   const widths={widthA:round(b.thickness+joint.clearance),widthB:round(a.thickness+joint.clearance)};
   for(const [p,center,width,depth,edge] of [[a,joint.positionA,widths.widthA,joint.depthA,joint.entryA],[b,joint.positionB,widths.widthB,joint.depthB,joint.entryB]]){
    if(center-width/2<joint.minWeb-EPS||center+width/2>p.width-joint.minWeb+EPS)throw Error('Rasgo fora da peça ou sem material mínimo nas bordas.');
    const rectangular=rectangularProfile(p.contour,p.width,p.height)||provenRectangles.has(p.id);
    if(p.joint==='finger'||!rectangular)throw Error('Meio-encaixe manual exige peça retangular sem dentes.');
    if(p.material.process==='router')throw Error('Router exige alívio de canto validado antes do meio-encaixe.');
    const list=slots.get(p.id)||[];
    if(list.some(s=>Math.abs(s.center-center)<(s.width+width)/2+Math.max(joint.minWeb,s.minWeb??1)-EPS))throw Error('Rasgos sobrepostos ou sem material mínimo entre eles.');
    slots.set(p.id,[...list,{center:round(center),width,depth,edge,jointId:joint.id,minWeb:joint.minWeb}]);
   }
   out.push({...joint,...widths});
  }catch(error){errors.push(`Encaixe ${joint.id}: ${error.message}`);out.push({...joint,error:error.message});}
 }
 for(const [id,list] of slots){const p=byId.get(id);p.jointBaseContour=rectangle(p.width,p.height);p.slots=list;p.contour=slottedContour(p.width,p.height,list);errors.push(...cutoutsErrors(p).map(e=>`${p.label}: ${e}`));}
 return {errors,jointPairs:out};
}
