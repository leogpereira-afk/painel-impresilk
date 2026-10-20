import {placedDrawing,FOLD_COLOR} from './drawing.mjs';
import {formatCM} from './units.mjs';
import {materialLabel,productLabel,contrastInk,salesMaterialKey} from './planner.mjs';
// Vector A4 landscape. The built-in fonts use WinAnsi for Portuguese text.
const CP={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'…':133,'•':149,'→':62};
const win=s=>String(s??'').replace(/[^\x20-\x7e\xa0-\xff]/g,c=>CP[c]?String.fromCharCode(CP[c]):' ');
const esc=s=>win(s).replace(/([\\()])/g,'\\$1');
const rgb=hex=>hex.replace('#','').match(/../g).map(v=>(parseInt(v,16)/255).toFixed(4)).join(' ');
const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n);
const weight=c=>/[MW@%]/.test(c)?1:/[mw]/.test(c)?.85:/[ilI.,:;!| ]/.test(c)?.4:.7;
const measure=(s,size)=>[...String(s)].reduce((n,c)=>n+weight(c)*size,0);
function wrapCell(value,width,size=8.5){
 const out=[];
 for(const paragraph of String(value).split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(line&&measure(line+' '+word,size)>width){out.push(line);line='';}
   for(const c of word){if(measure(line+c,size)>width&&line){out.push(line);line='';}line+=c;}
   line+=' ';
  }
  if(line.trim())out.push(line.trim());
 }
 return out;
}
// Only collapse a complete, consecutive sequence; nonconsecutive IDs stay explicit.
function idList(values){
 const ids=[...new Set(values.map(String))],out=[];
 for(let i=0;i<ids.length;){
  const first=/^(.*?)(\d+)$/.exec(ids[i]);let end=i;
  if(first)while(end+1<ids.length){const next=/^(.*?)(\d+)$/.exec(ids[end+1]);if(!next||next[1]!==first[1]||Number(next[2])!==Number(first[2])+end+1-i)break;end++;}
  if(end-i>=2){out.push(`${ids[i]} a ${ids[end]}`);i=end+1;}else{out.push(ids[i]);i++;}
 }
 return out.join(', ');
}
function groupedCuts(rows){
 const groups=[],byKey=new Map(),byRow=new Map();
 for(const row of rows){
  const edges=['left','right','top','bottom'].map(k=>row.folded?row[k]:0);
  const key=JSON.stringify([row.width,row.height,row.folded,edges,salesMaterialKey(row.material),row.blank.contour,row.blank.grooves]);
  let group=byKey.get(key);
  if(!group){group={code:`P${groups.length+1}`,row,quantity:0,origins:new Map()};groups.push(group);byKey.set(key,group);}
  group.quantity+=row.quantity;byRow.set(row.id,group.code);
  // Expanded panels have the original description plus a generated panel ordinal.
  const panel=/ · painel (\d+\/\d+)$/.exec(row.description||'');
  const description=(row.description||'Peça').replace(/ · painel \d+\/\d+$/,' · painéis');
  const originKey=JSON.stringify([description,row.quantity]);
  if(!group.origins.has(originKey))group.origins.set(originKey,{description,quantity:row.quantity,ids:[],panels:[]});
  const origin=group.origins.get(originKey);origin.ids.push(`#${row.number}`);if(panel)origin.panels.push(panel[1]);
 }
 return {groups,byRow};
}
function groupedLayouts(plan,byRow,pieceById){
 const layouts=[],byKey=new Map();
 for(const [index,group] of plan.groups.entries())for(const sheet of group.sheets){
  const geometry=sheet.placements.map(p=>{const piece=pieceById.get(p.pieceId),drawing=placedDrawing(piece,p);return [p.x,p.y,p.width,p.height,byRow.get(piece.rowId),drawing];}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3]-b[3]);
  const source=sheet.source==='remnant'?'remnant':'sheet';
  const key=JSON.stringify([index,source,sheet.width,sheet.length,geometry]);
  let layout=byKey.get(key);
  if(!layout){layout={sheet,material:index+1,source,members:[]};layouts.push(layout);byKey.set(key,layout);}
  layout.members.push(sheet);
 }
 return layouts;
}
export function purchasePDF(input,plan,{logo,date=new Date(),confirmed=false}={}){
 if(!plan.valid)throw Error('Resolva as pendências antes de salvar o PDF.');
 const pages=[];let commands=[],y;
 const stamp=date.toLocaleString('pt-BR'),status=confirmed?'Conferido pelo usuário':'Conferência pendente';
 // Keep 15 points clear above the footer baseline (547), without scaling content.
 const ink='#203647',muted='#60717e',accent='#188574',bottom=532;
 const text=(value,x,top,size=9,bold=false,color=ink)=>commands.push(`BT /${bold?'FB':'FN'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(595-top).toFixed(2)} Tm (${esc(value)}) Tj ET`);
 const verticalText=(value,x,top,size=8,bold=false,color=ink)=>commands.push(`BT /${bold?'FB':'FN'} ${size} Tf ${rgb(color)} rg 0 1 -1 0 ${x.toFixed(2)} ${(595-top).toFixed(2)} Tm (${esc(value)}) Tj ET`);
 const rect=(x,top,w,h,fill,stroke=fill)=>commands.push(`q ${rgb(fill)} rg ${rgb(stroke)} RG 0.6 w ${x.toFixed(2)} ${(595-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`);
 function page(){
  if(commands.length)pages.push(commands);commands=[];
  if(logo){const w=Math.min(78,40*logo.width/logo.height),h=w*logo.height/logo.width;commands.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 32 ${(595-24-h).toFixed(2)} cm /Logo Do Q`);}else text('IMPRESILK',32,43,13,true);
  text('PLANO DE CHAPAS · VENDAS',128,36,17,true);
  text(input.planNumber||'Estimativa de compra',128,52,8.5,false,muted);
  text(stamp,580,36,8,false,muted);
  text(status,580,52,9,true,confirmed?accent:ink);
  const title=String(input.name||'Novo plano de chapas').slice(0,90);
  text(title,32,77,Math.min(10,760/Math.max(1,measure(title,1))),true);
  rect(32,86,778,2,accent);y=103;
 }
 function room(height){if(y+height>bottom)page();}
 function lines(value,{size=8.5,bold=false,gap=11,color=ink,x=32,width=778}={}){
  for(const line of wrapCell(value,width,size)){room(gap);text(line,x,y,size,bold,color);y+=gap;}
 }
 function section(title,height=25){room(height);text(title,32,y,9,true,accent);y+=15;}
 page();
 const identities=[input.requester&&`Solicitado por: ${input.requester}`,(input.order?.client||input.client)&&`Cliente: ${input.order?.client||input.client}`].filter(Boolean);
 if(measure(identities.join(' · '),8.5)<=778)lines(identities.join(' · '),{bold:true});
 else for(const identity of identities)lines(identity,{bold:true});
 if(input.order)lines(`O.S. #${input.order.number} · ${input.order.company}`);
 if(input.requester||input.client||input.order)y+=5;
 const calculated=plan.groups.reduce((n,g)=>n+g.calculated,0),reserve=plan.groups.reduce((n,g)=>n+g.reserve,0),remnantsUsed=plan.remnantsUsed??0;
 room(61);rect(32,y-9,778,48,'#edf6f3');
 text(`COMPRAR ${plan.total} ${plan.total===1?'CHAPA NOVA':'CHAPAS NOVAS'}`,44,y+8,15,true,accent);
 text(`Novas calculadas: ${calculated} · Reserva extra: ${reserve}`,44,y+25,8.5);
 text(`Retalhos usados: ${remnantsUsed}`,520,y+6,12,true);
 text(`${plan.pieces.length} ${plan.pieces.length===1?'peça':'peças'} · ${fmt(plan.result.utilization)}% aproveitado`,520,y+24,9);
 y+=51;
 lines(`Formato das chapas novas: ${fmt(input.stock.width)} × ${fmt(input.stock.length)} mm · Área não utilizada: ${fmt(plan.result.wasteArea/1e6)} m²`);
 lines(`Margem: ${fmt(input.stock.trim)} mm · Separação: ${fmt(input.stock.kerf)} mm · Giro de 90°: ${input.stock.rotation?'permitido conforme sentido':'desativado'}`,{color:muted});
 y+=5;
 for(const [i,g] of plan.groups.entries()){
  const label=wrapCell(`M${i+1} · ${materialLabel(g.material)}`,754,8.5),product=wrapCell(productLabel(g.material),754,8);
  room(Math.min(360,(label.length+product.length)*11+24));
  rect(32,y-7,9,9,g.material.color,'#9eabb3');
  for(const line of label)lines(line,{x:48,width:762,bold:true});
  for(const line of product)lines(line,{x:48,width:762,size:8,color:muted});
  // A single material already has this exact breakdown in the purchase summary.
  if(plan.groups.length>1)lines(`Retalhos usados: ${g.remnantsUsed??0} · Novas calculadas: ${g.calculated} · Reserva extra: ${g.reserve} · Comprar: ${g.total}`,{x:48,width:762,size:8,bold:true});
  y+=5;
 }
 const divided=input.rows.filter(r=>(r.panelsX??1)*(r.panelsY??1)>1);
 for(const r of divided)lines(`${r.description}: ${formatCM(r.width)} × ${formatCM(r.height)} cm · divisão ${r.panelsX??1} × ${r.panelsY??1} · sem vão/sobreposição; dobras por painel.`,{size:8,color:muted});
 const {groups:cuts,byRow}=groupedCuts(plan.rows);
 const columns=[{x:32,w:209,label:'CORTE / ORIGEM'},{x:246,w:35,label:'QTD.'},{x:286,w:99,label:'FINAL · cm'},{x:390,w:99,label:'ABERTA · cm'},{x:494,w:154,label:'DOBRAS E/D/S/I · cm'},{x:653,w:157,label:'MATERIAL / SENTIDO'}];
 function tableHeader(){
  section('PEÇAS E DOBRAS · MEDIDAS EM CM',49);
  rect(32,y-8,778,17,'#edf3f2');for(const c of columns)text(c.label,c.x+3,y+3,7.5,true);y+=21;
 }
 y+=4;let tableStarted=false;
 for(const group of cuts){
  const r=group.row,material=plan.groups.findIndex(g=>g.key===salesMaterialKey(r.material))+1;
  const origins=[...group.origins.values()].map(o=>`${idList(o.ids)} · ${o.panels.length?o.description.replace(/ · painéis$/,` · painel ${idList(o.panels)}`):o.description} · ${o.quantity} ${o.ids.length>1?'cada':o.quantity===1?'peça':'peças'}`);
  const description=[`${group.code}${r.folded?' · Bandeja':''}`,...origins].join('\n');
  const separateOrigins=wrapCell(description,columns[0].w-6).length>10;
  const cells=[separateOrigins?`${group.code}${r.folded?' · Bandeja':''}\nOrigens listadas abaixo`:description,String(group.quantity),`${formatCM(r.width)} × ${formatCM(r.height)}`,`${formatCM(r.blank.width)} × ${formatCM(r.blank.height)}`,['left','right','top','bottom'].map(k=>formatCM(r.folded?r[k]:0)).join(' / '),`Material M${material} · ${r.material.directional?'fixo':'livre'}`];
  const wrapped=cells.map((v,i)=>wrapCell(v,columns[i].w-6)),count=Math.max(...wrapped.map(c=>c.length));
  if(!tableStarted){room(36+(count<=12?count*10+7:27));tableHeader();tableStarted=true;}
  let offset=0;
  while(offset<count){
   const wanted=(count-offset<=12?count-offset:2)*10+7;
   if((y+wanted>bottom&&offset===0)||y+17>bottom){page();tableHeader();}
   if(offset){text(`${group.code} · continuação`,35,y,8,true,accent);y+=11;}
   const take=Math.max(1,Math.min(count-offset,Math.floor((bottom-y-7)/10)));
   for(const [i,cell] of wrapped.entries())for(let j=0;j<take;j++)if(cell[offset+j])text(cell[offset+j],columns[i].x+3,y+j*10,8.5,i===0&&offset+j===0);
   y+=take*10+6;rect(32,y-8,778,.4,'#dce4e8');offset+=take;
  }
  if(separateOrigins){
   section(`Origens de ${group.code} · descrições e quantidades preservadas`,27);
   for(const origin of origins)for(const line of wrapCell(origin,778,8)){
    if(y+11>bottom){page();section(`Origens de ${group.code} · continuação`,27);}
    text(line,32,y,8);y+=11;
   }
   y+=5;tableStarted=false;
  }
 }
 lines('P identifica o corte agrupado. # identifica a linha ou painel original; as quantidades foram somadas.',{size:7.5,color:muted});
 const pieceById=new Map(plan.pieces.map(p=>[p.id,p])),layouts=groupedLayouts(plan,byRow,pieceById);
 y+=6;if(layouts.length)section('Distribuição · códigos P correspondem aos cortes da lista',132);
 for(const layout of layouts){
  const {sheet,material,source,members}=layout,isRemnant=source==='remnant',count=members.length;
  const diagramHeight=layouts.length>1?64:82;
  const scale=Math.min(450/sheet.length,diagramHeight/sheet.width),w=sheet.length*scale,h=sheet.width*scale,x=52,infoX=Math.max(440,x+w+22);
  const ids=idList(members.map(s=>s.id));
  const kind=isRemnant?'retalho':'chapa nova',plural=isRemnant?'retalhos':'chapas novas';
  const origins=new Map();
  if(isRemnant)for(const member of members){const name=member.sourceName||input.remnants?.find(r=>r.id===member.remnantId)?.name||'Retalho';if(!origins.has(name))origins.set(name,[]);origins.get(name).push(member.id);}
  const groupPieces=sheet.placements.length*count;
  const info=[`${ids} · Material M${material}`,`${count} ${count===1?kind:plural} · ${groupPieces} ${groupPieces===1?'peça':'peças'} no grupo`,`${sheet.placements.length} ${sheet.placements.length===1?'peça':'peças'} por ${isRemnant?'retalho':'chapa'} · Aproveitamento: ${fmt(sheet.usedArea/(sheet.width*sheet.length)*100)}%`,`${fmt(sheet.width)} × ${fmt(sheet.length)} mm`,materialLabel(sheet.material),productLabel(sheet.material),...[...origins].map(([name,sourceIds])=>`Origem ${idList(sourceIds)}: ${name}`)].flatMap(v=>wrapCell(v,810-infoX,8));
  const beside=info.slice(0,9),below=info.slice(9),blockHeight=Math.max(h+34,beside.length*10+22);
  room(blockHeight);const top=y+17;
  text(`Comprimento: ${formatCM(sheet.length)} cm`,x,top-7,8);
  // Keep the vertical dimension within the diagram's height, including short remnants.
  const heightLabel=`Altura: ${formatCM(sheet.width)} cm`;
  if(h>=measure(heightLabel,7))verticalText(heightLabel,x-8,top+h,7);
  else text(heightLabel,x,top+h+11,7);
  rect(x,top,w,h,'#edf0f2','#71838e');
  const positional=[];
  for(const p of sheet.placements){
   const piece=pieceById.get(p.pieceId),drawing=placedDrawing(piece,p),px=x+p.y*scale,py=top+p.x*scale,pw=p.height*scale,ph=p.width*scale;
   const points=drawing.contour.map(([a,b])=>`${(x+a*scale).toFixed(2)} ${(595-top-b*scale).toFixed(2)}`);
   commands.push(`q ${rgb(piece.material.color)} rg ${rgb(contrastInk(piece.material.color))} RG 0.4 w ${points.map((pt,i)=>pt+(i?' l':' m')).join(' ')} h B Q`);
   for(const g of drawing.folds){const path=`${x+g.a[0]*scale} ${595-top-g.a[1]*scale} m ${x+g.b[0]*scale} ${595-top-g.b[1]*scale} l S`;commands.push(`q 1 1 1 RG 1.8 w ${path} ${rgb(FOLD_COLOR)} RG .8 w [3 2] 0 d ${path} Q`);}
   const label=byRow.get(piece.rowId),units=measure(label,1),horizontal=Math.min(8.5,(pw-.5)/units,(ph-.5)/1.1),vertical=Math.min(8.5,(ph-.5)/units,(pw-.5)/1.1),color=contrastInk(piece.material.color);
   if(horizontal>=5.5)text(label,px+pw/2-measure(label,horizontal)/2,py+ph/2+horizontal*.35,horizontal,true,color);
   else if(vertical>=5.5)verticalText(label,px+pw/2+vertical*.35,py+ph/2+measure(label,vertical)/2,vertical,true,color);
   else positional.push(`${label} · x: ${formatCM(p.y)} · y: ${formatCM(p.x)} · corte no desenho: ${formatCM(p.height)} × ${formatCM(p.width)} cm`);
  }
  beside.forEach((line,i)=>text(line,infoX,top+8+i*10,8,i===0));
  if(h>=measure(heightLabel,7))text('Dobras: azul tracejado',x,top+h+12,7,false,FOLD_COLOR);
  else text('Dobras: azul tracejado',x+150,top+h+11,7,false,FOLD_COLOR);
  y+=blockHeight;
  for(const line of below)lines(line,{size:8,color:muted});
  if(positional.length){
   lines(`Identificação por posição · ${ids} · origem no canto superior esquerdo; x/y em cm.`,{size:8,bold:true});
   for(const line of positional)lines(line,{size:8});
  }
  y+=2;
 }
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
