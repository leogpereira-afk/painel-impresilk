import {materialLabel,productLabel,contrastInk,salesMaterialKey} from './planner.mjs';
// PDF vetorial A4, following the app's native PDF writer. WinAnsi covers Portuguese.
const CP={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'…':133,'•':149,'→':62};
const win=s=>String(s??'').replace(/[^\x20-\x7e\xa0-\xff]/g,c=>CP[c]?String.fromCharCode(CP[c]):' ');
const esc=s=>win(s).replace(/([\\()])/g,'\\$1');
const rgb=hex=>hex.replace('#','').match(/../g).map(v=>(parseInt(v,16)/255).toFixed(4)).join(' ');
const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n);
function wrap(value,max=112){const words=String(value).split(/\s+/),out=[];let line='';for(let word of words){if(word.length>max){if(line)out.push(line);line='';while(word.length>max){out.push(word.slice(0,max));word=word.slice(max);}}if((line+' '+word).trim().length>max){out.push(line);line=word;}else line=(line+' '+word).trim();}if(line)out.push(line);return out;}
export function purchasePDF(input,plan,{logo,date=new Date()}={}){
 if(!plan.valid)throw Error('Resolva as pendências antes de salvar o PDF.');
 const pages=[];let commands=[],y;
 const text=(value,x,top,size=10,bold=false,color='#203647')=>commands.push(`BT /${bold?'FB':'FN'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(595-top).toFixed(2)} Tm (${esc(value)}) Tj ET`);
 const rect=(x,top,w,h,fill,stroke='#71838e')=>commands.push(`q ${rgb(fill)} rg ${rgb(stroke)} RG 0.6 w ${x.toFixed(2)} ${(595-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`);
 function page(subtitle){if(commands.length)pages.push(commands);commands=[];if(logo)commands.push(`q 68 0 0 ${(68*logo.height/logo.width).toFixed(2)} 32 535 cm /Logo Do Q`);else text('IMPRESILK',32,48,14,true);text('PLANO DE CHAPAS · VENDAS',120,39,18,true);text(subtitle,120,58,10);const title=String(input.name||'Novo plano de chapas').slice(0,90);text(title,32,85,Math.min(11,750/Math.max(1,title.length)),true);rect(32,96,778,2,'#188574','#188574');y=118;}
 function lines(value,{size=10,bold=false,color='#203647',gap=14}={}){for(const line of wrap(value,Math.floor(750/size))){if(y>514)page('Resumo de compra · continuação');text(line,32,y,size,bold,color);y+=gap;}}
 page(date.toLocaleString('pt-BR'));
 lines(`COMPRAR ${plan.total} ${plan.total===1?'CHAPA':'CHAPAS'}`,{size:20,bold:true,gap:28});
 lines(`${plan.pieces.length} peças · Aproveitamento ${fmt(plan.result.utilization)}% · Sobra ${fmt(plan.result.wasteArea/1e6)} m²`);
 lines(`Formato: ${fmt(input.stock.width)} × ${fmt(input.stock.length)} mm · Margem: ${fmt(input.stock.trim)} mm · Separação: ${fmt(input.stock.kerf)} mm`,{size:9});
 lines(`Giro de 90°: ${input.stock.rotation?'permitido, respeitando o sentido do material':'desativado'}`,{size:9});y+=14;
 for(const [i,g] of plan.groups.entries()){
  if(y>434)page('Materiais para compra');
  rect(794,y-10,11,11,g.material.color);lines(`M${i+1} · ACM ${materialLabel(g.material)}`,{size:11,bold:true});y+=5;
  lines(productLabel(g.material));
  lines(`Calculadas: ${g.calculated}  +  Reserva extra: ${g.reserve}  =  Comprar: ${g.total} chapas`,{bold:true});y+=13;
 }
 y+=8;lines('Cores ilustrativas. Confirmar marca, referência, medidas e disponibilidade com o fornecedor.',{size:9});
 lines('Estimativa nominal para compras; não é arquivo de fabricação. Reserva extra não integra o aproveitamento.',{size:9});
 if(y>380)page('Peças e dobras · medidas em mm');else {y+=20;lines('PEÇAS E DOBRAS · MEDIDAS EM MM',{bold:true});y+=8;}
 for(const r of plan.rows){
  if(y>444)page('Peças e dobras · continuação');
  const group=plan.groups.findIndex(g=>g.key===salesMaterialKey(r.material));
  lines(`#${r.number} · ${r.description||'Peça'} · Material M${group+1}`,{bold:true});
  lines(`Quantidade: ${r.quantity} · Final: ${fmt(r.width)} × ${fmt(r.height)} · Desenvolvida: ${fmt(r.blank.width)} × ${fmt(r.blank.height)}`);
  lines(`Dobras E / D / S / I: ${['left','right','top','bottom'].map(k=>fmt(r.folded?r[k]:0)).join(' / ')} mm · Sentido: ${r.material.directional?'fixo':'livre'}`,{size:9});y+=10;
 }
 const pieceById=new Map(plan.pieces.map(p=>[p.id,p]));
 for(const [groupIndex,g] of plan.groups.entries())for(let start=0;start<g.sheets.length;start+=4){
  page(`Distribuição · Material M${groupIndex+1}`);
  lines(materialLabel(g.material),{size:11,bold:true});
  lines(productLabel(g.material),{size:9});
  for(const [index,sheet] of g.sheets.slice(start,start+4).entries()){
   const boxX=32+index*196,boxY=Math.max(158,y+28),scale=Math.min(178/sheet.width,Math.min(326,480-boxY)/sheet.length),w=sheet.width*scale,h=sheet.length*scale,x=boxX+(178-w)/2;
   text(`${sheet.id} · ${sheet.placements.length} peças`,boxX,boxY-13,10,true);
   rect(x,boxY,w,h,'#eef1f3');
   for(const p of sheet.placements){const piece=pieceById.get(p.pieceId),px=x+p.x*scale,py=boxY+p.y*scale,pw=p.width*scale,ph=p.height*scale;rect(px,py,pw,ph,piece.material.color);const size=Math.min(10,pw/3,ph/2);if(size>=3)text(String(piece.number),px+pw/2-String(piece.number).length*size*.25,py+ph/2+size*.35,size,true,contrastInk(piece.material.color));}
   text(`${fmt(sheet.width)} × ${fmt(sheet.length)} mm`,boxX,boxY+h+18,9);
  }
  text('Números correspondem às peças da lista. Distribuição por envelopes; dobras já incluídas.',32,525,9);
 }
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
