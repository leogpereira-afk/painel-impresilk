export const signedArea = pts => pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p.x*q.y-q.x*p.y;},0)/2;
export const perimeter = pts => pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+Math.hypot(p.x-q.x,p.y-q.y);},0);
export function cleanRing(points){const out=[];for(const p of points){if(!out.length||Math.hypot(p.x-out.at(-1).x,p.y-out.at(-1).y)>1e-8)out.push({x:p.x,y:p.y});}if(out.length>1&&Math.hypot(out[0].x-out.at(-1).x,out[0].y-out.at(-1).y)<1e-8)out.pop();return out;}
export function contourMetrics(contours){return contours.reduce((r,c)=>({areaMm2:r.areaMm2+Math.abs(signedArea(c.outer))-c.holes.reduce((s,h)=>s+Math.abs(signedArea(h)),0),perimeterMm:r.perimeterMm+perimeter(c.outer)+c.holes.reduce((s,h)=>s+perimeter(h),0)}),{areaMm2:0,perimeterMm:0});}
export function pointInRing(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
function crossing(a,b,c,d){const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return cross(a,b,c)*cross(a,b,d)<-1e-12&&cross(c,d,a)*cross(c,d,b)<-1e-12;}
export function validateContours(contours){const errors=[];for(const c of contours){for(const ring of [c.outer,...c.holes]){if(ring.length<3||ring.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||Math.abs(signedArea(ring))<1e-8)errors.push('Contorno degenerado ou não finito.');for(let i=0;i<ring.length;i++)for(let j=i+2;j<ring.length;j++){if(i===0&&j===ring.length-1)continue;if(segmentsIntersect(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length]))errors.push('Contorno com autointerseção.');}}for(const h of c.holes)if(h.some(p=>!pointInRing(p,c.outer)))errors.push('Vazado fora do contorno externo.');}return [...new Set(errors)];}
function segmentsIntersect(p,q,r,s){
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-8&&c.x>=Math.min(a.x,b.x)-1e-8&&c.x<=Math.max(a.x,b.x)+1e-8&&c.y>=Math.min(a.y,b.y)-1e-8&&c.y<=Math.max(a.y,b.y)+1e-8;
 return crossing(p,q,r,s)||on(p,q,r)||on(p,q,s)||on(r,s,p)||on(r,s,q);
}
export function ringsIntersect(a,b){for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(segmentsIntersect(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;return false;}
export {importLetterSVG,importLetterDXF,importVectorArtwork} from './importers.mjs';
// Remove only microscopic reversed loops introduced where a sampled curve turns.
// Splits and substantial loops remain errors: no component may disappear silently.
function cleanOffsetLoops(input,distance){
 let ring=input;
 for(let pass=0;pass<30;pass++){
  let changed=false;
  outer:for(let i=0;i<ring.length;i++)for(let j=i+2;j<ring.length;j++){
   if(i===0&&j===ring.length-1)continue;
   const a=ring[i],b=ring[(i+1)%ring.length],c=ring[j],d=ring[(j+1)%ring.length];if(!crossing(a,b,c,d))continue;
   const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,den=ux*vy-uy*vx,t=((c.x-a.x)*vy-(c.y-a.y)*vx)/den,p={x:a.x+t*ux,y:a.y+t*uy};
   const first=[p,...ring.slice(i+1,j+1)],second=[p,...ring.slice(j+1),...ring.slice(0,i+1)],orientation=Math.sign(signedArea(ring));
   const discarded=Math.sign(signedArea(first))!==orientation?first:Math.sign(signedArea(second))!==orientation?second:null;
   if(!discarded||Math.abs(signedArea(discarded))>distance*distance*.01)throw Error('Folga divide ou altera substancialmente o contorno. Reduza a folga.');
   ring=discarded===first?second:first;changed=true;break outer;
  }
  if(!changed)return cleanRing(ring);
 }
 throw Error('Folga produz excesso de interseções. Simplifique o contorno.');
}
// Parallel-line offset, validated before a face is emitted; rejects topology changes.
export function insetContours(contours,distance){
 if(distance===0)return contours.map(c=>({outer:c.outer.map(p=>({...p})),holes:c.holes.map(r=>r.map(p=>({...p})))}));
 if(!Number.isFinite(distance)||distance<0)throw Error('Folga da face inválida.');
 const offset=(ring,inward)=>{const orientation=Math.sign(signedArea(ring)),out=[];for(let i=0;i<ring.length;i++){const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length],ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y,ul=Math.hypot(ux,uy),vl=Math.hypot(vx,vy);if(ul<1e-8||vl<1e-8)throw Error('A folga exige contorno sem vértices repetidos.');const sign=orientation*inward,d=distance*sign,p={x:b.x-uy/ul*d,y:b.y+ux/ul*d},q={x:b.x-vy/vl*d,y:b.y+vx/vl*d},den=ux*vy-uy*vx;let vertex;if(Math.abs(den)<1e-10)vertex=p;else {const t=((q.x-p.x)*vy-(q.y-p.y)*vx)/den;vertex={x:p.x+t*ux,y:p.y+t*uy};}if(Math.hypot(vertex.x-b.x,vertex.y-b.y)>distance*20)throw Error('Folga cria canto excessivo. Simplifique o canto ou reduza a folga.');out.push(vertex);}if(Math.sign(signedArea(out))!==orientation)throw Error('Folga elimina ou inverte um contorno.');if(inward===1&&out.some(p=>!pointInRing(p,ring)))throw Error('Folga atravessa o contorno. Reduza a folga.');return cleanOffsetLoops(out,distance);};
 const result=contours.map(c=>({outer:offset(c.outer,1),holes:c.holes.map(h=>offset(h,-1))}));const errors=validateContours(result);for(const c of result){for(const h of c.holes)if(ringsIntersect(c.outer,h))errors.push('Folga faz o vazado atingir a borda.');for(let i=0;i<c.holes.length;i++)for(let j=i+1;j<c.holes.length;j++)if(ringsIntersect(c.holes[i],c.holes[j])||pointInRing(c.holes[i][0],c.holes[j])||pointInRing(c.holes[j][0],c.holes[i]))errors.push('Folga une dois vazados.');}if(errors.length)throw Error(`Folga não aplicável: ${errors.join(' ')}`);return result;
}
