/** Automatic screw positions live on developed flange strips, never on the visible face.
 * No angle bracket, anchor or load capacity is inferred from these geometric marks. */
const EPS=1e-6,round=n=>Math.round(n*1e6)/1e6;
const pointInside=(p,polygon)=>{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function intervalsAt(polygon,vertical,across){
 const axis=vertical?0:1,along=1-axis,hits=[];
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if(Math.abs(a[axis]-b[axis])<EPS){if(Math.abs(a[axis]-across)<EPS)hits.push(a[along],b[along]);continue;}const t=(across-a[axis])/(b[axis]-a[axis]);if(t>=-EPS&&t<=1+EPS)hits.push(a[along]+t*(b[along]-a[along]));}
 const values=[...new Set(hits.map(round))].sort((a,b)=>a-b),intervals=[];
 for(let i=0;i<values.length-1;i++){const middle=(values[i]+values[i+1])/2;if(pointInside(vertical?[across,middle]:[middle,across],polygon))intervals.push([values[i],values[i+1]]);}
 return intervals;
}
export function flangeScrews(piece,fixing,fabrication,errors,warnings,budget=30000){
 if(!['screws','hybrid'].includes(fixing.type))return[];
 const result=[],seen=new Set(),diameter=fixing.drillDiameter??null,radius=(diameter??0)/2,minimum=fixing.pattern?.minEdgeDistance??0;
 const warn=(code,message)=>warnings.push({code,message:`${piece.id}: ${message}`});
 for(const edge of ['left','right','bottom','top']){
  const number=fixing.pattern?.flangeFoldByEdge?.[edge]??1;if(number===0)continue;
  const profile=piece.blank.profiles?.[edge],op=profile?.operations[number-1];
  if(!op){warn('FLANGE_MISSING',`${edge}: aba/operação ${number} inexistente; nenhum furo criado nessa borda.`);continue;}
  const groove=piece.blank.grooves.find(g=>g.edge===edge&&g.number===number),vertical=['left','right'].includes(edge),outward=['left','bottom'].includes(edge)?-1:1;
  const offset=fixing.pattern?.flangeOffset??op.developedLength/2;
  const innerClearance=Math.max(radius+(fabrication.grooveWidth??0)/2,minimum);
  const outerClearance=Math.max(radius+(number<profile.operations.length?(fabrication.grooveWidth??0)/2:0),minimum);
  if(offset<innerClearance-EPS||offset>op.developedLength-outerClearance+EPS){warn('FLANGE_HOLE_CLEARANCE',`${edge} D${number}: posição/diâmetro não cabe entre canal e borda da aba; nenhum furo gerado.`);continue;}
  const across=(vertical?groove.x1:groove.y1)+outward*offset;
  const spans=intervalsAt(piece.blank.contour,vertical,across),endInset=Math.max(fixing.edgeOffset,radius,minimum);
  let countAdded=0;
  for(const [start,end]of spans){const lo=start+endInset,hi=end-endInset;if(hi<lo-EPS)continue;const count=Math.max(1,Math.ceil((hi-lo)/fixing.screwPitch));
   if(result.length+count+1>budget){errors.push({code:'FIXING_LIMIT',message:'Limite de 30.000 parafusos excedido.'});return result;}
   for(let i=0;i<=count;i++){
    const along=lo+(hi-lo)*i/count,p=vertical?[across,along]:[along,across];
    const cutClearance=Math.max(radius,minimum),valid=pointInside(p,piece.blank.contour)&&piece.blank.contour.every((a,j)=>distance(p,a,piece.blank.contour[(j+1)%piece.blank.contour.length])>=cutClearance-EPS)&&piece.blank.grooves.every(g=>distance(p,[g.x1,g.y1],[g.x2,g.y2])>=radius+(fabrication.grooveWidth??0)/2-EPS);
    if(!valid)continue;
    const key=`${round(p[0])},${round(p[1])}`;if(seen.has(key))continue;seen.add(key);
    result.push({x:round(p[0]),y:round(p[1]),coordinateSpace:'blank',edge,foldId:op.id,foldNumber:number,flangeOffset:offset,...(diameter!=null?{drillDiameter:diameter}:{}),supportStatus:'unverified',role:fixing.screwProduct?.function||'Aba → cantoneira a detalhar'});countAdded++;
   }
  }
  if(!countAdded)warn('FLANGE_HOLE_CLEARANCE',`${edge} D${number}: recorte, canto ou canal elimina a área disponível; nenhum furo gerado.`);
 }
 warn('FLANGE_CONNECTION_UNVERIFIED','Posições nas abas para estudo. Cantoneiras, vínculo à estrutura, acesso, ancoragem e capacidade não estão definidos nem dimensionados.');
 return result.map((h,i)=>({...h,number:i+1}));
}
