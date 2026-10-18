export function worldPoint(piece,x,y,z=0){const t=piece.transform;return t.origin.map((a,i)=>a+t.u[i]*x+t.v[i]*y+t.normal[i]*z)}
export function explodeVector(piece,distance){return piece.transform.normal.map(n=>n*distance)}
export function piecePolygon(piece){return (piece.contour?.length?piece.contour:[[0,0],[piece.width,0],[piece.width,piece.height],[0,piece.height]]).map(p=>Array.isArray(p)?p:[p.x,p.y])}
export function pieceRings(piece){return[piecePolygon(piece),...(piece.cutouts||[]).map(c=>Array.isArray(c)?c:c.contour||c.points||[]).filter(r=>r.length>=3).map(r=>r.map(p=>Array.isArray(p)?p:[p.x,p.y]))]}
/** Slabs retain a floor under blind bores; only through holes cross every slab. */
export function pieceDepthLayers(piece){
 const thickness=Math.max(.05,piece.thickness||.1),holes=(piece.holes||[]).filter(h=>h.diameter>0),limits=[0,thickness];
 const ranges=holes.map(h=>{const blind=h.through===false,depth=blind?Math.max(0,Math.min(thickness,Number(h.depth)||0)):thickness,back=blind&&h.face==='back',start=back?thickness-depth:0,end=back?thickness:depth;if(blind)limits.push(start,end);return{hole:h,start,end}});
 const levels=[...new Set(limits)].sort((a,b)=>a-b);
 return levels.slice(0,-1).map((start,i)=>({start,depth:levels[i+1]-start,holes:ranges.filter(r=>start>=r.start&&levels[i+1]<=r.end).map(r=>r.hole)})).filter(layer=>layer.depth>0);
}
/** Rendering commands are independent from React's pressed-state update. */
export function createAssemblyMotion(exploded=false,duration=1800){
 let amount=exploded?1:0,start=null;
 return{explode(value){start=null;amount=value?1:0},animate(time){start=time;amount=1},reset(){start=null;amount=0},sample(time){if(start!==null){const f=Math.max(0,Math.min(1,(time-start)/duration));amount=1-f*f*(3-2*f);if(f===1)start=null;}return amount}};
}
export function needsCameraRefit(previous,aspect){return !(previous>0)||!(aspect>0)||(previous<1)!==(aspect<1)||Math.abs(Math.log(aspect/previous))>Math.log(1.15)}
/** Fits the actual box corners in both fields of view without changing the viewing direction. */
export function fittedCameraDistance(size,direction,aspect,fov=36,padding=1.16){
 const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),normalize=v=>{const length=Math.hypot(...v)||1;return v.map(n=>n/length)};
 const toward=normalize(direction),right=Math.hypot(toward[0],toward[1])>1e-9?normalize([-toward[1],toward[0],0]):[1,0,0],up=[toward[1]*right[2]-toward[2]*right[1],toward[2]*right[0]-toward[0]*right[2],toward[0]*right[1]-toward[1]*right[0]];
 const tanY=Math.tan(fov*Math.PI/360),tanX=tanY*Math.max(.01,aspect);let distance=.1;
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const p=[x*size[0]/2,y*size[1]/2,z*size[2]/2];distance=Math.max(distance,dot(p,toward)+padding*Math.max(Math.abs(dot(p,right))/tanX,Math.abs(dot(p,up))/tanY));}
 return distance;
}
