import {formatCM} from '../chapas-vendas/units.mjs';
import {materialLabel} from './planner.mjs';
import {contrastInk} from '../chapas-vendas/planner.mjs';
const CP={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'…':133,'•':149};
const esc=s=>String(s??'').replace(/[^\x20-\x7e\xa0-\xff]/g,c=>CP[c]?String.fromCharCode(CP[c]):' ').replace(/([\\()])/g,'\\$1');
const rgb=hex=>hex.replace('#','').match(/../g).map(v=>(parseInt(v,16)/255).toFixed(4)).join(' ');
const pct=n=>n.toLocaleString('pt-BR',{maximumFractionDigits:1});
function wrap(s,n){const out=[];for(const line of String(s).split('\n')){let rest=line;while(rest.length>n){const split=rest.lastIndexOf(' ',n);const at=split>n/2?split:n;out.push(rest.slice(0,at));rest=rest.slice(at).trimStart();}out.push(rest);}return out;}
export function sheetsPDF(name,rows,plan,logo){
 if(!plan.valid||!plan.sheets.length)throw Error('Plano inválido.');
 const pages=[];let commands=[],y=30;
 const text=(s,x,top,size=9,bold=false,color='#243646')=>commands.push(`BT /${bold?'FB':'FN'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x} ${595-top-size} Tm (${esc(s)}) Tj ET`);
 const rect=(x,top,w,h,fill,stroke='#aab5bc')=>commands.push(`${rgb(fill)} rg ${rgb(stroke)} RG .5 w ${x} ${595-top-h} ${w} ${h} re B`);
 const page=()=>{if(commands.length)pages.push(commands);commands=[];y=30;if(logo)commands.push(`q 65 0 0 ${65*logo.height/logo.width} 30 ${555-65*logo.height/logo.width} cm /Logo Do Q`);text('SIMULADOR ACRÍLICO, MDF E PVC',110,27,14,true);text('Aproveitamento · Impresilk · estimativa para compras',110,47,9);y=78;};
 const ensure=h=>{if(y+h>550)page();};
 const lines=(s,{x=30,width=775,size=9,bold=false}={})=>{for(const line of wrap(s,Math.floor(width/(size*.65)))){ensure(size+5);text(line,x,y,size,bold);y+=size+5;}};
 page();lines(name||'Simulação',{size:12,bold:true});lines(`COMPRAR: ${plan.total} chapa(s) nova(s) · USAR: ${plan.remnantsUsed} retalho(s) · Aproveitamento: ${pct(plan.utilization)}%`,{bold:true});
 for(const g of plan.groups)lines(`${g.item.name} | ${materialLabel(g.material)} | ${formatCM(g.item.width)} × ${formatCM(g.item.length)} cm | Comprar ${g.total} · Retalhos ${g.remnantsUsed}${g.item.brand?' | '+g.item.brand:''}${g.item.reference?' · '+g.item.reference:''}`);
 for(const sheet of plan.sheets.filter(s=>s.source==='remnant'))lines(`${sheet.id} · ${sheet.sourceName}${sheet.location?' · Local: '+sheet.location:''} · ${formatCM(sheet.width)} × ${formatCM(sheet.length)} cm`);
 y+=6;
 const byId=new Map(plan.pieces.map(p=>[p.id,p]));
 for(let i=0;i<plan.sheets.length;i+=2){
  ensure(142);const top=y;
  for(const [column,sheet] of plan.sheets.slice(i,i+2).entries()){
   const x=30+column*395;rect(x,top,382,135,'#ffffff','#dde5e7');
   text(`${sheet.id} · ${sheet.source==='remnant'?'Retalho':'Chapa nova'} · ${formatCM(sheet.length)} × ${formatCM(sheet.width)} cm`,x+8,top+6,9,true);
   const scale=Math.min(366/sheet.length,82/sheet.width),w=sheet.length*scale,h=sheet.width*scale,dx=x+8+(366-w)/2,dy=top+26+(82-h)/2;
   rect(dx,dy,w,h,'#edf0f2');
   for(const p of sheet.placements){const piece=byId.get(p.pieceId),px=dx+p.y*scale,py=dy+p.x*scale,pw=p.height*scale,ph=p.width*scale;rect(px,py,pw,ph,piece.material.color);if(pw>15&&ph>10)text(piece.number,px+pw/2-5,py+ph/2-5,8,false,contrastInk(piece.material.color));}
   text(materialLabel(sheet.material).length>65?materialLabel(sheet.material).slice(0,62)+'…':materialLabel(sheet.material),x+8,top+111,8);text(`${pct(sheet.usedArea/(sheet.width*sheet.length)*100)}% aproveitado`,x+253,top+123,8);
  }
  y=top+142;
 }
 ensure(36);lines('PEÇAS · MEDIDAS DE CORTE',{bold:true});
 for(const [i,r] of rows.entries())lines(`${String(i+1).padStart(2,'0')} · ${r.description} | ${formatCM(r.width)} × ${formatCM(r.height)} cm | ${r.quantity} un.`);
 y+=5;lines('Retalhos não reservados nem baixados do cadastro. Cores ilustrativas. Margens e separações incluídas. Distribuição de retângulos para estimar compras; não é sequência de serra. Sem garantia de mínimo absoluto.',{size:8});
 if(commands.length)pages.push(commands);
 const objects=['','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];const push=s=>(objects.push(s),objects.length);let logoId;
 if(logo){let binary='';for(const b of logo.bytes)binary+=String.fromCharCode(b);logoId=push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binary.length} >>\nstream\n${binary}\nendstream`);}
 const ids=pages.map((body,i)=>{body.push(`BT /FN 8 Tf 0.3 0.4 0.45 rg 1 0 0 1 30 22 Tm (IMPRESILK · ${i+1}/${pages.length}) Tj ET`);const stream=body.join('\n'),content=push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);return push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /FN 3 0 R /FB 4 0 R >> ${logoId?`/XObject << /Logo ${logoId} 0 R >>`:''} >> /Contents ${content} 0 R >>`);});
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Kids [${ids.map(id=>id+' 0 R').join(' ')}] /Count ${ids.length} >>`;
 let file='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(file.length);file+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=file.length;file+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(p=>String(p).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Uint8Array.from(file,c=>c.charCodeAt(0)&255);
}
