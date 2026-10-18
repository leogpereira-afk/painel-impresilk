/** Diagonals are fitted inside free rectangular cells, with two parallel vertical end cuts. */
export function diagonalMembers(cfg,structure){
 const mode=cfg.diagonals||'none';if(mode==='none')return[];
 if(!['rising','falling','alternating'].includes(mode))throw new Error('Sentido das diagonais inválido.');
 const frame=structure.segments,template=frame.find(s=>s.group==='externalHorizontal');if(!template||['B','T','L','R'].some(side=>!frame.some(s=>s.id===`front-EXT-${side}`)))throw new Error('Reponha o contorno externo antes de gerar diagonais.');
 const x=[...new Set([0,cfg.width,...frame.flatMap(s=>[s.bounds.x,s.bounds.x+s.bounds.width])])].sort((a,b)=>a-b),y=[...new Set([0,cfg.height,...frame.flatMap(s=>[s.bounds.y,s.bounds.y+s.bounds.height])])].sort((a,b)=>a-b),out=[];
 for(let i=0;i<x.length-1;i++)for(let j=0;j<y.length-1;j++){
  const cx=(x[i]+x[i+1])/2,cy=(y[j]+y[j+1])/2;if(frame.some(s=>cx>s.bounds.x-1e-6&&cx<s.bounds.x+s.bounds.width+1e-6&&cy>s.bounds.y-1e-6&&cy<s.bounds.y+s.bounds.height+1e-6))continue;
  const left=x[i]+(cfg.gap??0),bottom=y[j]+(cfg.gap??0),W=x[i+1]-x[i]-2*(cfg.gap??0),H=y[j+1]-y[j]-2*(cfg.gap??0),w=template.faceWidth;
  if(!(W>w&&H>w))throw new Error('Há um vão estreito demais para a diagonal. Reduza as travas ou a seção do perfil.');
  let lo=0,hi=Math.atan2(H,W);for(let k=0;k<60;k++){const mid=(lo+hi)/2;if(W*Math.tan(mid)+w/Math.cos(mid)>H)hi=mid;else lo=mid}const theta=(lo+hi)/2,edge=w/(2*Math.cos(theta)),fall=mode==='falling'||mode==='alternating'&&out.length%2===1;
  const points=[[0,0],[W,H-2*edge],[W,H],[0,2*edge]].map(([a,b])=>[left+a,bottom+(fall?H-b:b)]),centerLength=W/Math.cos(theta),longLength=centerLength+w*Math.tan(theta),shortLength=centerLength-w*Math.tan(theta),id=`front-DIAG-${out.length+1}`;
  out.push({...template,id,baseId:id,group:'reinforcement',axis:'diagonal',length:longLength,longLength,shortLength,angleA:90-theta*180/Math.PI,angleB:90-theta*180/Math.PI,diagonal:true,contour:points,bounds:{x:left,y:bottom,width:W,height:H},local:{x1:left,y1:bottom+(fall?H-edge:edge),x2:left+W,y2:bottom+(fall?edge:H-edge)}});
  if(out.length>100)throw new Error('Limite de 100 diagonais. Reduza a quantidade de travas.');
 }
 return out;
}
