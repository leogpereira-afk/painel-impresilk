import {validateContours,ringsIntersect,pointInRing} from '../letras/vectors.mjs';
/** Reuses letter topology primitives. Only bounded numeric geometry reaches the viewport. */
export function workshopArtwork(artwork){
 const errors=[],pieces=[];
 if(!artwork||artwork.mode!=='vector'||artwork.scaleConfirmed!==true||!['svg','dxf'].includes(artwork.format)||typeof artwork.fileName!=='string'||artwork.fileName.length>300||![artwork.widthMm,artwork.heightMm].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))return{pieces,errors:['Arte inválida ou escala física em mm não confirmada.']};
 if(!Array.isArray(artwork.contours)||artwork.contours.length<1||artwork.contours.length>200)return{pieces,errors:['A arte deve ter de 1 a 200 formas.']};
 let count=0;const parsed=[];
 for(const c of artwork.contours){
   if(!c||!Array.isArray(c.outer)||!Array.isArray(c.holes)||c.holes.length>100)return{pieces,errors:['Estrutura de contorno/vazado inválida.']};
   const rings=[];
   for(const ring of[c.outer,...c.holes]){
     if(!Array.isArray(ring)||ring.length<3||ring.length>1000||(count+=ring.length)>8000)return{pieces,errors:['Arte excede 1.000 vértices por contorno ou 8.000 no total. Simplifique antes de cortar.']};
     if(ring.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000)))return{pieces,errors:['Coordenada vetorial inválida.']};
     const points=ring.map(([x,y])=>({x,y}));
     if(points.some((p,i)=>p.x===points[(i+1)%points.length].x&&p.y===points[(i+1)%points.length].y))errors.push('Contorno com vértices consecutivos duplicados.');
     rings.push(points);
   }
   parsed.push({id:c.id,label:c.label,outer:rings[0],holes:rings.slice(1)});
 }
 errors.push(...validateContours(parsed));
 for(const c of parsed)for(let i=0;i<c.holes.length;i++){
   if(ringsIntersect(c.outer,c.holes[i]))errors.push('Vazado toca ou cruza a borda externa.');
   for(let j=i+1;j<c.holes.length;j++)if(ringsIntersect(c.holes[i],c.holes[j])||pointInRing(c.holes[i][0],c.holes[j])||pointInRing(c.holes[j][0],c.holes[i]))errors.push('Vazados sobrepostos.');
 }
 const contains=(p,c)=>pointInRing(p,c.outer)&&!c.holes.some(h=>pointInRing(p,h));
 for(let i=0;i<parsed.length;i++)for(let j=i+1;j<parsed.length;j++){const a=parsed[i],b=parsed[j];if([a.outer,...a.holes].some(x=>[b.outer,...b.holes].some(y=>ringsIntersect(x,y)))||contains(a.outer[0],b)||contains(b.outer[0],a))errors.push('Formas vetoriais sobrepostas.');}
 const points=parsed.flatMap(c=>c.outer),minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),width=Math.max(...points.map(p=>p.x))-minX,height=Math.max(...points.map(p=>p.y))-minY;
 if(width<=0||height<=0||Math.abs(artwork.widthMm/artwork.heightMm-width/height)>1e-6*Math.max(1,width/height))errors.push('Escala física não preserva a proporção da arte.');
 if(errors.length)return{pieces,errors:[...new Set(errors)]};
 const scale=artwork.widthMm/width;
 parsed.forEach((c,i)=>{const left=Math.min(...c.outer.map(p=>p.x)),bottom=Math.min(...c.outer.map(p=>p.y)),right=Math.max(...c.outer.map(p=>p.x)),top=Math.max(...c.outer.map(p=>p.y));const ring=a=>a.map(p=>({x:(p.x-left)*scale,y:(p.y-bottom)*scale}));pieces.push({id:`imported-${i+1}`,sourceId:c.id||`shape-${i+1}`,label:c.label||`Forma ${i+1}`,width:(right-left)*scale,height:(top-bottom)*scale,x:(left-minX)*scale,y:(bottom-minY)*scale,contour:ring(c.outer),cutouts:c.holes.map(ring)});});
 return{pieces,errors};
}
