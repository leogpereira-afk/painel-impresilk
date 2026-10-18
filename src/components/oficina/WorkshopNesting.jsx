import {piecePolygon} from './scene.mjs';
const path=ring=>`M${ring.map(p=>[p.x??p[0],p.y??p[1]].join(' ')).join('L')}Z`;
export default function WorkshopNesting({sheet,instances,selected,onSelect}){
 const scale=Math.max(sheet.width,sheet.height),fontSize=Math.max(10,scale/90);
 return <svg viewBox={`-10 -10 ${sheet.width+20} ${sheet.height+20}`} role="group" aria-label={`Plano de corte ${sheet.id} · origem inferior esquerda`}>
  <rect width={sheet.width} height={sheet.height} fill="#f0e8d7" stroke="#9d8c6c"/>
  <g transform={`translate(0 ${sheet.height}) scale(1 -1)`}>{sheet.placements.map((placement,i)=>{
   const piece=instances.find(p=>p.id===placement.pieceId);if(!piece)return null;
   return <g key={placement.id||i} role="button" tabIndex={0} aria-label={`Selecionar ${piece.label} ${placement.pieceId}`} onClick={()=>onSelect(placement.pieceId)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(placement.pieceId)}}}>
    <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} fill={selected===placement.pieceId?'#f9b64b':'#8babaa'} stroke="#f0e8d7" strokeWidth={scale/700}/>
    <g transform={`translate(${placement.x} ${placement.y}) ${placement.rotated?`translate(${piece.height} 0) rotate(90)`:''}`}>
     <path d={[piecePolygon(piece),...(piece.cutouts||[])].map(path).join(' ')} fill={selected===placement.pieceId?'#f9b64b':'#749ca6'} fillRule="evenodd" stroke="#1c4a58" strokeWidth={scale/1000}/>
     {(piece.cutouts||[]).map((ring,j)=><path key={j} d={path(ring)} fill="#f0e8d7" stroke="#1c4a58" strokeWidth={scale/1000}/>)}
     {(piece.holes||[]).map((hole,j)=><circle key={j} cx={hole.x} cy={hole.y} r={hole.diameter/2} fill={hole.through===false?'#a7bac1':'#f0e8d7'} stroke="#1c4a58" strokeWidth={scale/1000}/>)}
    </g>
    <text transform={`translate(${placement.x+4} ${placement.y+placement.height/2}) scale(1 -1)`} fontSize={Math.min(fontSize,placement.width/9)} fill="#0d2831">{piece.label}{placement.locked?' 🔒':''}</text>
   </g>;
  })}</g>
 </svg>;
}
