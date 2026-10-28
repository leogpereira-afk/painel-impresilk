import { GeometryError } from './errors.mjs';
export { GeometryError } from './errors.mjs';

export const KERNEL = Object.freeze({ name: 'manifold-3d', version: '3.5.4', license: 'Apache-2.0' });
export const DEFAULT_PARAMETERS = Object.freeze({ height:120, depth:40, wall:2.4, floor:2.4, front:3, support:1.2, clearancePerSide:0.25, supportHeight:1.2, curveTolerance:0.025, exportTolerance:0.0001, synthetic:true });
let kernelPromise;
export async function init() {
  kernelPromise ??= (async () => {
    const runtimeUrl = new URL('./vendor/manifold/manifold.js', import.meta.url).href;
    const wasmUrl = new URL('./vendor/manifold/manifold.wasm', import.meta.url);
    const { default: createManifold } = await import(/* @vite-ignore */ runtimeUrl);
    let options = { locateFile: () => wasmUrl.href };
    if (wasmUrl.protocol === 'file:') {
      const fsModule = 'node:fs/promises';
      const { readFile } = await import(/* @vite-ignore */ fsModule);
      options = { wasmBinary: new Uint8Array(await readFile(wasmUrl)) };
    }
    const module = await createManifold(options);
    module.setup();
    return module;
  })().catch(error => { kernelPromise = undefined; throw error; });
  return kernelPromise;
}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
export function pointSegmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;
  const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
export function bezierPoint(points,t) {
  let a=points.map(p=>[...p]);
  while(a.length>1) a=a.slice(0,-1).map((p,i)=>[p[0]*(1-t)+a[i+1][0]*t,p[1]*(1-t)+a[i+1][1]*t]);
  return a[0];
}
export function flattenBezier(points,tolerance=0.025) {
  const output=[points[0]],leaves=[];
  function split(ps,t0,t1,depth) {
    const bound=Math.max(...ps.slice(1,-1).map(p=>pointSegmentDistance(p,ps[0],ps.at(-1))),0);
    if (output.length >= 8000) throw new GeometryError('POINT_LIMIT','Curva excede 8.000 pontos.');
    if(bound<=tolerance || ps.length===2) {output.push(ps.at(-1));leaves.push({t0,t1,bound});return;}
    if(depth>=24) throw new GeometryError('CURVE_COMPLEXITY','Curva excedeu o limite de subdivisão.');
    let row=ps,left=[ps[0]],right=[ps.at(-1)];
    while(row.length>1) {row=row.slice(0,-1).map((p,i)=>midpoint(p,row[i+1]));left.push(row[0]);right.unshift(row.at(-1));}
    const tm=(t0+t1)/2;split(left,t0,tm,depth+1);split(right,tm,t1,depth+1);
  }
  split(points,0,1,0);
  return {points:output,leaves,maxBound:Math.max(...leaves.map(x=>x.bound))};
}
export function flattenPaths(paths,tolerance=0.025) {
  const curves=[]; let totalPoints=0;
  if(paths.length>128) throw new GeometryError('CONTOUR_LIMIT','Desenho excede 128 contornos.');
  const contours=paths.map((path,pathIndex)=>{
    if(!path.closed) throw new GeometryError('OPEN_CONTOUR','O desenho contém contorno aberto.',{pathIndex});
    let current=path.start,points=[current];
    for(const segment of path.segments) {
      const controls=[current,...(segment.type==='C'?[segment.p1,segment.p2]:segment.type==='Q'?[segment.p1]:[]),segment.to];
      const f=flattenBezier(controls,tolerance);
      totalPoints+=f.points.length-1;
      if(totalPoints>8000)throw new GeometryError('POINT_LIMIT','Desenho excede 8.000 pontos.');
      points.push(...f.points.slice(1));
      if(controls.length>2) curves.push({controls,points:f.points,leaves:f.leaves,maxBound:f.maxBound,pathIndex});
      current=segment.to;
    }
    if(dist(points[0],points.at(-1))<1e-8) points.pop();
    return points;
  });
  return {contours,curves,maxCurveBound:Math.max(0,...curves.map(c=>c.maxBound))};
}
function onSegment(a,b,p) {return Math.abs(cross(a,b,p))<1e-8 && p[0]>=Math.min(a[0],b[0])-1e-8&&p[0]<=Math.max(a[0],b[0])+1e-8&&p[1]>=Math.min(a[1],b[1])-1e-8&&p[1]<=Math.max(a[1],b[1])+1e-8;}
function intersects(a,b,c,d) {
 const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
 return (x1*x2<0&&x3*x4<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
export function validateContours(contours) {
  if(!Array.isArray(contours)||!contours.length) throw new GeometryError('EMPTY_ART','O desenho não contém contornos.');
  if(contours.reduce((s,c)=>s+c.length,0)>8000) throw new GeometryError('POINT_LIMIT','Desenho excede 8.000 pontos.');
  let vertices=0;
  for(let k=0;k<contours.length;k++) {
    const p=contours[k];vertices+=p.length;
    if(p.length<3||p.some(a=>a.length!==2||!a.every(Number.isFinite))) throw new GeometryError('INVALID_CONTOUR','Contorno inválido.',{contour:k});
    for(let i=0;i<p.length;i++) {
      if(dist(p[i],p[(i+1)%p.length])<1e-8) throw new GeometryError('DUPLICATE_VERTEX','Segmento de comprimento zero.',{contour:k});
      for(let j=i+1;j<p.length;j++) {
        if(j===i+1||(i===0&&j===p.length-1)) continue;
        if(intersects(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length])) throw new GeometryError('SELF_INTERSECTION','O contorno cruza ou toca a si mesmo.',{contour:k,edges:[i,j]});
      }
    }
    if(Math.abs(signedArea(p))<1e-8) throw new GeometryError('ZERO_AREA','Contorno sem área.',{contour:k});
  }
  if(vertices>8000) throw new GeometryError('POINT_LIMIT','Desenho excede 8.000 pontos.');
  for(let k=0;k<contours.length;k++)for(let l=k+1;l<contours.length;l++)for(let i=0;i<contours[k].length;i++)for(let j=0;j<contours[l].length;j++) {
    const a=contours[k],b=contours[l];
    if(intersects(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length])) throw new GeometryError('OVERLAPPING_CONTOURS','Contornos cruzados ou tangentes precisam de revisão.',{contours:[k,l]});
  }
  return {contours:contours.length,vertices};
}
export function boundsOfContours(contours) {
  const b={min:[Infinity,Infinity],max:[-Infinity,-Infinity]};
  for(const p of contours.flat())for(let a=0;a<2;a++){b.min[a]=Math.min(b.min[a],p[a]);b.max[a]=Math.max(b.max[a],p[a]);}
  return b;
}
export function boundsOfMesh(mesh) {
 const b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(let i=0;i<mesh.positions.length;i++) {const a=i%3;b.min[a]=Math.min(b.min[a],mesh.positions[i]);b.max[a]=Math.max(b.max[a],mesh.positions[i]);}
 return {...b,dimensionsMm:b.max.map((n,i)=>n-b.min[i])};
}
function meshOf(solid) {
 const m=solid.getMesh();const positions=[];
 for(let i=0;i<m.vertProperties.length;i+=m.numProp)positions.push(...m.vertProperties.slice(i,i+3));
 return {positions,indices:Array.from(m.triVerts)};
}
export async function generateFromContours(contours,overrides={}) {
 const started=performance.now(),p={...DEFAULT_PARAMETERS,...overrides};
 const validation=validateContours(contours);
 for(const key of ['depth','wall','floor','front','support','supportHeight','curveTolerance'])if(!(p[key]>0&&Number.isFinite(p[key])))throw new GeometryError('INVALID_PARAMETER',`Parâmetro inválido: ${key}`);
 if(!Number.isFinite(p.clearancePerSide)||p.clearancePerSide<0||p.floor+p.front+p.supportHeight>=p.depth)throw new GeometryError('INVALID_PARAMETER','Profundidade/folga incompatível com a construção.');
 const M=await init(),owned=[],hold=x=>(owned.push(x),x),parts=[],metrics=[];
 try {
  const shape=hold(new M.CrossSection(contours,'EvenOdd'));
  const components=shape.decompose();components.forEach(hold);
  for(let i=0;i<components.length;i++) {
   const poly=components[i],cavity=hold(poly.offset(-p.wall,'Miter',2)),front2D=hold(poly.offset(-(p.wall+p.clearancePerSide),'Miter',2));
   const innerLip=hold(poly.offset(-(p.wall+p.support),'Miter',2));
   if(cavity.isEmpty()||front2D.isEmpty()||innerLip.isEmpty())throw new GeometryError('NARROW_FEATURE','Componente estreito demais para parede, frente e apoio escolhidos.',{component:i+1});
   const cavityParts=cavity.decompose();cavityParts.forEach(hold);
   if(cavityParts.length!==1)throw new GeometryError('CAVITY_SPLIT','A cavidade se separou em múltiplas regiões; revisar a largura do traço.',{component:i+1,count:cavityParts.length});
   const frontParts=front2D.decompose();frontParts.forEach(hold);
   if(frontParts.length!==1)throw new GeometryError('FRONT_SPLIT','A frente se separou em múltiplas peças; revisar altura, folga ou desenho.',{component:i+1,count:frontParts.length});
   const lipParts=innerLip.decompose();lipParts.forEach(hold);
   if(lipParts.length!==1)throw new GeometryError('SUPPORT_SPLIT','O apoio fecha o vão em uma região estreita e criaria um túnel adicional; revisar altura ou desenho.',{component:i+1,count:lipParts.length});
   const expectedHoles=poly.numContour()-1;
   const full=hold(poly.extrude(p.depth));
   const ledge2D=hold(cavity.subtract(innerLip));
   const lowZ=p.depth-p.front-p.supportHeight,highZ=p.depth-p.front;
   const emptyLower=hold(hold(cavity.extrude(lowZ-p.floor)).translate([0,0,p.floor]));
   const emptyLedge=hold(hold(innerLip.extrude(p.supportHeight)).translate([0,0,lowZ]));
   const emptyTop=hold(hold(cavity.extrude(p.front)).translate([0,0,highZ]));
   const empty=hold(M.Manifold.union([emptyLower,emptyLedge,emptyTop]));
   const body=hold(full.subtract(empty));
   const front=hold(hold(front2D.extrude(p.front)).translate([0,0,p.depth-p.front]));
   if(body.genus()!==expectedHoles||front.genus()!==expectedHoles)throw new GeometryError('TOPOLOGY_CHANGE','Corpo ou frente mudou a quantidade de vazios do contorno original.',{expectedHoles,bodyGenus:body.genus(),frontGenus:front.genus(),component:i+1});
   const collision=hold(body.intersect(front));
   if(collision.volume()>1e-5)throw new GeometryError('FIT_COLLISION','Frente intercepta o corpo.',{volume:collision.volume()});
   const expectedVolume=poly.area()*p.floor+(poly.area()-cavity.area())*(p.depth-p.floor)+ledge2D.area()*p.supportHeight;
   const volumeDelta=Math.abs(body.volume()-expectedVolume);
   if(volumeDelta>Math.max(1e-4,expectedVolume*1e-8))throw new GeometryError('VOLUME_MISMATCH','Volume do corpo não corresponde à construção.',{volumeDelta});
   for(const [role,solid,label] of [['body',body,'Corpo com fundo e apoio'],['front',front,'Frente acrílica — STL para inspeção']]) {
    const status=solid.status();if(status!=='NoError'||solid.isEmpty())throw new GeometryError('INVALID_SOLID','Motor não produziu sólido válido.',{status,role});
    const prepared=hold(solid.setTolerance(p.exportTolerance));
    const before=solid.boundingBox(),after=prepared.boundingBox();
    const maxBoundDelta=Math.max(...before.min.map((v,a)=>Math.abs(v-after.min[a])),...before.max.map((v,a)=>Math.abs(v-after.max[a])));
    const volumeChange=Math.abs(solid.volume()-prepared.volume());
    if(prepared.status()!=='NoError'||maxBoundDelta>0.001||volumeChange>Math.max(0.01,solid.volume()*1e-5))throw new GeometryError('EXPORT_SIMPLIFICATION','Preparação para float32 excedeu limite de conservação.',{role,maxBoundDelta,volumeChange});
    const mesh=meshOf(prepared),bounds=boundsOfMesh(mesh);
    parts.push({id:`${role}-${String(i+1).padStart(2,'0')}`,label:`${label} ${i+1}`,role,mesh,dimensionsMm:bounds.dimensionsMm,boundsMm:bounds,volumeMm3:prepared.volume(),manifoldStatus:status,component:i+1,exportPreparation:{toleranceMm:p.exportTolerance,maxBoundDeltaMm:maxBoundDelta,volumeChangeMm3:volumeChange},frontContours:role==='front'?front2D.toPolygons():undefined});
   }
   const probeZ=[p.floor/2,p.floor+0.5,p.depth-p.front-p.supportHeight/2,p.depth-p.front+0.5];
   const expectedAreas=[poly.area(),poly.area()-cavity.area(),poly.area()-innerLip.area(),poly.area()-cavity.area()];
   const sliceChecks=probeZ.map((z,j)=>{const section=hold(body.slice(z)),actual=section.area();return{z,actualAreaMm2:actual,expectedAreaMm2:expectedAreas[j],deltaMm2:Math.abs(actual-expectedAreas[j])};});
   if(sliceChecks.some(c=>c.deltaMm2>1e-4))throw new GeometryError('SLICE_MISMATCH','Seção do sólido divergiu do modelo construtivo.',{sliceChecks});
   metrics.push({component:i+1,expectedHoles,bodyGenus:body.genus(),frontGenus:front.genus(),shapeAreaMm2:poly.area(),cavityAreaMm2:cavity.area(),frontAreaMm2:front2D.area(),supportAreaMm2:ledge2D.area(),expectedBodyVolumeMm3:expectedVolume,bodyVolumeDeltaMm3:volumeDelta,frontBodyIntersectionVolumeMm3:collision.volume(),sliceChecks});
  }
  const bounds=boundsOfContours(contours);
  return {parameters:p,parts,metrics,validation,dimensionsMm:[bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1],p.depth],elapsedMs:performance.now()-started};
 } finally {for(const v of owned.reverse())v.delete();}
}

export function binarySTL(mesh) {
 const count=mesh.indices.length/3,buf=new ArrayBuffer(84+50*count),v=new DataView(buf);
 const header=new TextEncoder().encode('Impresilk local pilot; coordinates in mm; physical qualification pending');
 new Uint8Array(buf).set(header.slice(0,80));v.setUint32(80,count,true);
 for(let i=0;i<count;i++) {
  const a=mesh.indices.slice(i*3,i*3+3).map(n=>mesh.positions.slice(n*3,n*3+3));
  const u=a[1].map((n,j)=>n-a[0][j]),w=a[2].map((n,j)=>n-a[0][j]);
  const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n);
  [...n.map(x=>length?x/length:0),...a.flat()].forEach((x,j)=>v.setFloat32(84+i*50+j*4,x,true));
 }
 return buf;
}

export function typefacePaths(text,font) {
 let cursor=0;const paths=[];
 for(const character of Array.from(text)) {
  const glyph=font.glyphs[character];if(!glyph)throw new GeometryError('MISSING_GLYPH',`Fonte sem o caractere ${character}.`);
  if(glyph.o) {
   const tokens=glyph.o.trim().split(/\s+/);let i=0,path=null;
   const point=()=>[Number(tokens[i++])+cursor,Number(tokens[i++])];
   while(i<tokens.length) {
    const type=tokens[i++];
    if(type==='m') {path={start:point(),segments:[],closed:true};paths.push(path);}
    else if(type==='l')path.segments.push({type:'L',to:point()});
    else if(type==='q'){const to=point(),p1=point();path.segments.push({type:'Q',p1,to});}
    else if(type==='b'){const to=point(),p1=point(),p2=point();path.segments.push({type:'C',p1,p2,to});}
    else throw new GeometryError('FONT_COMMAND',`Comando de fonte não suportado: ${type}`);
   }
  }
  cursor+=glyph.ha;
 }
 return paths;
}
export function transformPaths(paths,m=[1,0,0,1,0,0]) {
 const t=p=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
 return paths.map(p=>({...p,start:t(p.start),segments:p.segments.map(s=>({...s,to:t(s.to),...(s.p1?{p1:t(s.p1)}:{}),...(s.p2?{p2:t(s.p2)}:{})}))}));
}
export function scalePathsToHeight(paths,height) {
 // Dense bounds followed by scaling; exact extrema are included below for Béziers.
 const points=[];
 for(const path of paths){let current=path.start;points.push(current);for(const s of path.segments){const controls=[current,...(s.type==='C'?[s.p1,s.p2]:s.type==='Q'?[s.p1]:[]),s.to];points.push(s.to);
  for(let axis=0;axis<2;axis++) {
   const p=controls.map(p=>p[axis]);let roots=[];
   if(p.length===3){const denominator=p[0]-2*p[1]+p[2];if(denominator)roots=[(p[0]-p[1])/denominator];}
   if(p.length===4){const a=-p[0]+3*p[1]-3*p[2]+p[3],b=2*(p[0]-2*p[1]+p[2]),c=p[1]-p[0],disc=b*b-4*a*c;if(Math.abs(a)<1e-12){if(b)roots=[-c/b];}else if(disc>=0)roots=[(-b+Math.sqrt(disc))/(2*a),(-b-Math.sqrt(disc))/(2*a)];}
   for(const t of roots)if(t>0&&t<1)points.push(bezierPoint(controls,t));
  }current=s.to;}}
 const b=boundsOfContours([points]),factor=height/(b.max[1]-b.min[1]);
 return {paths:transformPaths(paths,[factor,0,0,factor,-b.min[0]*factor,-b.min[1]*factor]),scale:factor,sourceBounds:b};
}
