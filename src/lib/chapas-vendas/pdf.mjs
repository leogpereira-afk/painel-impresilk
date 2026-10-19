import {formatCM} from './units.mjs';
import {materialLabel,productLabel,contrastInk,salesMaterialKey} from './planner.mjs';
// PDF vetorial A4, following the app's native PDF writer. WinAnsi covers Portuguese.
const CP={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'…':133,'•':149,'→':62};
const win=s=>String(s??'').replace(/[^\x20-\x7e\xa0-\xff]/g,c=>CP[c]?String.fromCharCode(CP[c]):' ');
const esc=s=>win(s).replace(/([\\()])/g,'\\$1');
const rgb=hex=>hex.replace('#','').match(/../g).map(v=>(parseInt(v,16)/255).toFixed(4)).join(' ');
const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n);
function wrap(value,max=112){const words=String(value).split(/\s+/),out=[];let line='';for(let word of words){if(word.length>max){if(line)out.push(line);line='';while(word.length>max){out.push(word.slice(0,max));word=word.slice(max);}}if((line+' '+word).trim().length>max){out.push(line);line=word;}else line=(line+' '+word).trim();}if(line)out.push(line);return out;}
function wrapCell(value,width,size=8.5){
 const weight=c=>/[MW@%]/.test(c)?1:/[mw]/.test(c)?.85:/[ilI.,:;!| ]/.test(c)?.4:.7;
 const measure=s=>[...s].reduce((n,c)=>n+weight(c)*size,0);
 const out=[];let line='';
 for(const word of String(value).split(/\s+/)){
  if(line&&measure(line+' '+word)>width){out.push(line);line='';}
  for(const c of word){if(measure(line+c)>width){out.push(line);line='';}line+=c;}
  line+=' ';
 }
 if(line.trim())out.push(line.trim());return out;
}
export function purchasePDF(input,plan,{logo,date=new Date()}={}){
 if(!plan.valid)throw Error('Resolva as pendências antes de salvar o PDF.');
 const pages=[];let commands=[],y;
 const text=(value,x,top,size=10,bold=false,color='#203647')=>commands.push(`BT /${bold?'FB':'FN'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(595-top).toFixed(2)} Tm (${esc(value)}) Tj ET`);
 const rect=(x,top,w,h,fill,stroke='#71838e')=>commands.push(`q ${rgb(fill)} rg ${rgb(stroke)} RG 0.6 w ${x.toFixed(2)} ${(595-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`);
 function page(subtitle){if(commands.length)pages.push(commands);commands=[];if(logo)commands.push(`q 68 0 0 ${(68*logo.height/logo.width).toFixed(2)} 32 535 cm /Logo Do Q`);else text('IMPRESILK',32,48,14,true);text('PLANO DE CHAPAS · VENDAS',120,39,18,true);text(subtitle,120,58,10);const title=String(input.name||'Novo plano de chapas').slice(0,90);text(title,32,76,Math.min(11,750/Math.max(1,title.length)),true);rect(32,85,778,2,'#188574','#188574');y=102;}
 function lines(value,{size=9,bold=false,gap=12}={}){for(const line of wrap(value,Math.floor(778/size))){if(y>510)page('Continuação');text(line,32,y,size,bold);y+=gap;}}
 const room=height=>{if(y+height>520)page('Continuação');};
 page(date.toLocaleString('pt-BR'));
 lines(`COMPRAR ${plan.total} ${plan.total===1?'CHAPA':'CHAPAS'} · ${plan.pieces.length} peças`,{size:16,bold:true,gap:21});
 lines(`Formato: ${fmt(input.stock.width)} × ${fmt(input.stock.length)} mm · Aproveitamento ${fmt(plan.result.utilization)}% · Área não utilizada ${fmt(plan.result.wasteArea/1e6)} m²`);
 lines(`Margem: ${fmt(input.stock.trim)} mm · Separação: ${fmt(input.stock.kerf)} mm · Giro de 90°: ${input.stock.rotation?'permitido conforme sentido':'desativado'}`);y+=6;
 for(const [i,g] of plan.groups.entries()){
  room(40);rect(798,y-8,9,9,g.material.color);
  lines(`M${i+1} · ${materialLabel(g.material)} · Comprar: ${g.total}`,{bold:true});
  lines(`${productLabel(g.material)} · Calculadas: ${g.calculated} + Reserva extra: ${g.reserve}`);y+=5;
 }
 const columns=[{x:32,w:209,label:'PEÇA / DESCRIÇÃO'},{x:246,w:35,label:'QTD.'},{x:286,w:99,label:'FINAL · cm'},{x:390,w:99,label:'ABERTA · cm'},{x:494,w:154,label:'DOBRAS E/D/S/I · cm'},{x:653,w:157,label:'MATERIAL / SENTIDO'}];
 function tableHeader(){room(38);lines('PEÇAS E DOBRAS · MEDIDAS EM CM',{bold:true});rect(32,y-8,778,18,'#edf3f2','#edf3f2');for(const c of columns)text(c.label,c.x+3,y+4,8,true);y+=23;}
 y+=4;tableHeader();
 for(const r of plan.rows){
  const group=plan.groups.findIndex(g=>g.key===salesMaterialKey(r.material));
  const cells=[`#${r.number} · ${r.description||'Peça'}`,String(r.quantity),`${formatCM(r.width)} × ${formatCM(r.height)}`,`${formatCM(r.blank.width)} × ${formatCM(r.blank.height)}`,['left','right','top','bottom'].map(k=>formatCM(r.folded?r[k]:0)).join(' / '),`Material M${group+1} · ${r.material.directional?'fixo':'livre'}`];
  const wrapped=cells.map((v,i)=>wrapCell(v,columns[i].w-6)),height=Math.max(...wrapped.map(c=>c.length))*11+8;
  if(y+height>510){page('Peças e dobras · continuação');tableHeader();}
  for(const [i,cell] of wrapped.entries())for(const [line,value] of cell.entries())text(value,columns[i].x+3,y+line*11,8.5,i===0);
  y+=height;rect(32,y-10,778,.4,'#dce4e8','#dce4e8');
 }
 const pieceById=new Map(plan.pieces.map(p=>[p.id,p]));
 const sheets=plan.groups.flatMap((g,i)=>g.sheets.map(sheet=>({sheet,material:i+1})));
 y+=8;
 // One horizontal sheet per row, with purchase information alongside.
 if(sheets.length){room(98);lines('Distribuição · números correspondem às peças da lista',{size:9,bold:true});}
 for(const {sheet,material} of sheets){
  const scale=Math.min(500/sheet.length,74/sheet.width),w=sheet.length*scale,h=sheet.width*scale;
  room(h+12);const x=32,top=y;
  rect(x,top,w,h,'#eef1f3');
  for(const p of sheet.placements){const piece=pieceById.get(p.pieceId),px=x+p.y*scale,py=top+p.x*scale,pw=p.height*scale,ph=p.width*scale;rect(px,py,pw,ph,piece.material.color);const label=String(piece.number),size=Math.min(10,pw/(label.length+1),ph/2);if(size>=4)text(label,px+pw/2-label.length*size*.25,py+ph/2+size*.35,size,true,contrastInk(piece.material.color));}
  const infoX=Math.max(410,x+w+22);
  text(`${sheet.id} · Material M${material}`,infoX,top+14,10,true);
  text(`${sheet.placements.length} peças · ${fmt(sheet.width)} × ${fmt(sheet.length)} mm`,infoX,top+30,9);
  text(`Aproveitamento: ${fmt(sheet.usedArea/(sheet.width*sheet.length)*100)}%`,infoX,top+46,9);
  y+=h+12;
 }
 // Short, repeated footnote keeps all pages self-contained without a block of prose.
 for(const body of [...pages,commands])body.push(`BT /FN 7 Tf 0.4 0.45 0.5 rg 1 0 0 1 32 48 Tm (${esc('Estimativa de compra · cores ilustrativas · dobras incluídas · reserva fora do aproveitamento · conferir produto com fornecedor.')}) Tj ET`);
 if(commands.length)pages.push(commands);
 const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const push=s=>(objects.push(s),objects.length);let logoId;
 if(logo){let binary='';for(const b of logo.bytes)binary+=String.fromCharCode(b);logoId=push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binary.length} >>\nstream\n${binary}\nendstream`);}
 const pageIds=pages.map((commands,index)=>{
  commands.push(`BT /FN 8 Tf 0.4 0.45 0.5 rg 1 0 0 1 32 26 Tm (IMPRESILK · Estimativa para compras) Tj ET`,`BT /FN 8 Tf 1 0 0 1 745 26 Tm (${index+1} / ${pages.length}) Tj ET`);
  const stream=commands.join('\n'),content=push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  return push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /FN 3 0 R /FB 4 0 R >> ${logoId?`/XObject << /Logo ${logoId} 0 R >>`:''} >> /Contents ${content} 0 R >>`);
 });
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
 let file='%PDF-1.4\n';const offsets=[];objects.forEach((o,i)=>{offsets.push(file.length);file+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=file.length;
 file+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(p=>`${String(p).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Uint8Array.from(file,c=>c.charCodeAt(0)&255);
}
export async function loadPDFLogo(url){
 const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=360;canvas.height=Math.round(360*image.naturalHeight/image.naturalWidth);const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/jpeg',.92).split(',')[1]),c=>c.charCodeAt(0));return {bytes,width:canvas.width,height:canvas.height};
}
