/** Shared, environment independent contract for confirmed planar machining geometry. */
export const TECHNICAL_LIMITS = Object.freeze({ parts: 100, vertices: 1200, totalVertices: 5000, quantity: 100, instances: 500, dimension: 100000 });
const EPS = 1e-6;
const plain = v => v && typeof v === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const keys = (o, allowed) => plain(o) && Object.keys(o).every(k => allowed.includes(k));
export const pointDistance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
export function segmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1], d=dx*dx+dy*dy;
  const t=d ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)) : 0;
  return pointDistance(p,[a[0]+dx*t,a[1]+dy*t]);
}
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function segmentsIntersect(a,b,c,d) {
  const x=cross(a,b,c), y=cross(a,b,d), u=cross(c,d,a), v=cross(c,d,b);
  if (((x>EPS&&y< -EPS)||(x< -EPS&&y>EPS)) && ((u>EPS&&v< -EPS)||(u< -EPS&&v>EPS))) return true;
  return Math.abs(x)<EPS&&segmentDistance(c,a,b)<EPS || Math.abs(y)<EPS&&segmentDistance(d,a,b)<EPS || Math.abs(u)<EPS&&segmentDistance(a,c,d)<EPS || Math.abs(v)<EPS&&segmentDistance(b,c,d)<EPS;
}
export function pointInContour(p, polygon, boundary = false) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if(segmentDistance(p,a,b)<EPS) return boundary;
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function contourErrors(poly) {
  if(!Array.isArray(poly)||poly.length<3||poly.length>TECHNICAL_LIMITS.vertices||poly.some(p=>!Array.isArray(p)||p.length!==2||!p.every(finite))) return ['CONTOUR'];
  const errors=new Set(); let area=0;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length]; area+=a[0]*b[1]-b[0]*a[1];
    if(pointDistance(a,b)<EPS) errors.add('DUPLICATE_GEOMETRY');
    for(let j=i+1;j<poly.length;j++) {
      if(j===i+1 || i===0&&j===poly.length-1) continue;
      if(segmentsIntersect(a,b,poly[j],poly[(j+1)%poly.length])) errors.add('SELF_INTERSECTION');
    }
  }
  if(Math.abs(area)<EPS) errors.add('DEGENERATE_CONTOUR');
  return [...errors];
}
export function validateTechnicalDrawing(drawing) {
  const errors=[], add=(code,message)=>errors.push({code,message});
  if(!keys(drawing,['version','name','unit','tolerance','parts'])) return [{code:'TECHNICAL_SCHEMA',message:'Desenho técnico contém campos desconhecidos ou dados inválidos.'}];
  if(drawing.version!==1||drawing.unit!=='mm'||typeof drawing.name!=='string'||!drawing.name.trim()||drawing.name.length>200||!finite(drawing.tolerance)||drawing.tolerance<.01||drawing.tolerance>5) add('TECHNICAL_SCHEMA','Versão, nome, unidade ou tolerância do desenho técnico inválidos.');
  if(!Array.isArray(drawing.parts)||!drawing.parts.length||drawing.parts.length>TECHNICAL_LIMITS.parts) return [...errors,{code:'TECHNICAL_PARTS',message:'Desenho deve conter entre 1 e 100 peças.'}];
  const ids=new Set(); let instances=0,vertices=0;
  for(const [index,p] of drawing.parts.entries()) {
    const label=`Peça técnica ${index+1}`;
    if(!keys(p,['id','width','height','contour','holes','grooves','quantity'])) {add('TECHNICAL_PART',`${label}: campos inválidos.`);continue;}
    if(typeof p.id!=='string'||!p.id||p.id.length>200||ids.has(p.id)) add('TECHNICAL_ID',`${label}: identificação inválida ou repetida.`); ids.add(p.id);
    if(!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>TECHNICAL_LIMITS.quantity) add('TECHNICAL_QUANTITY',`${label}: quantidade de 1 a 100.`); else instances+=p.quantity;
    if(!finite(p.width)||!finite(p.height)||p.width<.01||p.height<.01||p.width>TECHNICAL_LIMITS.dimension||p.height>TECHNICAL_LIMITS.dimension) add('TECHNICAL_SIZE',`${label}: tamanho inválido.`);
    const ce=contourErrors(p.contour); for(const code of ce) add(code,`${label}: contorno degenerado, repetido, cruzado ou inválido.`);
    vertices+=Array.isArray(p.contour)?p.contour.length:0;
    if(ce.length) continue;
    const poly=p.contour, xs=poly.map(a=>a[0]),ys=poly.map(a=>a[1]);
    if(Math.abs(Math.min(...xs))>EPS||Math.abs(Math.min(...ys))>EPS||Math.abs(Math.max(...xs)-p.width)>EPS||Math.abs(Math.max(...ys)-p.height)>EPS) add('TECHNICAL_BOUNDS',`${label}: envelope difere do contorno normalizado.`);
    if(!Array.isArray(p.holes)||p.holes.length>200||!Array.isArray(p.grooves)||p.grooves.length>200) {add('TECHNICAL_OPERATIONS',`${label}: operações inválidas ou acima do limite.`);continue;}
    const validHoles=[];
    for(const h of p.holes) {
      if(!keys(h,['x','y','diameter'])||![h.x,h.y,h.diameter].every(finite)||h.diameter<=0) {add('TECHNICAL_HOLE',`${label}: furo inválido.`);continue;}
      const c=[h.x,h.y],r=h.diameter/2;
      if(!pointInContour(c,poly)||poly.some((a,i)=>segmentDistance(c,a,poly[(i+1)%poly.length])<=r+EPS)) add('TECHNICAL_HOLE_BOUNDS',`${label}: furo toca ou ultrapassa o contorno.`);
      if(validHoles.some(other=>pointDistance(c,[other.x,other.y])<=(r+other.diameter/2)+EPS)) add('TECHNICAL_HOLE_OVERLAP',`${label}: furos sobrepostos ou tangentes.`);
      validHoles.push(h);
    }
    const seenGrooves=new Set();
    for(const g of p.grooves) {
      if(!keys(g,['x1','y1','x2','y2'])||![g.x1,g.y1,g.x2,g.y2].every(finite)) {add('TECHNICAL_GROOVE',`${label}: sulco inválido.`);continue;}
      const a=[g.x1,g.y1],b=[g.x2,g.y2],signature=[a.join(','),b.join(',')].sort().join('|');
      if(pointDistance(a,b)<EPS||seenGrooves.has(signature)) add('DUPLICATE_GEOMETRY',`${label}: sulco repetido ou sem comprimento.`); seenGrooves.add(signature);
      if(!pointInContour(a,poly)||!pointInContour(b,poly)||poly.some((c,i)=>segmentsIntersect(a,b,c,poly[(i+1)%poly.length]))) add('TECHNICAL_GROOVE_BOUNDS',`${label}: sulco toca ou ultrapassa o contorno.`);
      if(validHoles.some(h=>segmentDistance([h.x,h.y],a,b)<=h.diameter/2+EPS)) add('TECHNICAL_GROOVE_HOLE',`${label}: sulco cruza um furo.`);
    }
  }
  if(instances>TECHNICAL_LIMITS.instances||vertices>TECHNICAL_LIMITS.totalVertices) add('TECHNICAL_LIMIT','Desenho excede 500 instâncias ou 5.000 vértices.');
  return errors;
}
