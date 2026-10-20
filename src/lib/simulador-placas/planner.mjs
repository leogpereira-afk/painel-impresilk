import {nestPieces,validateNesting,materialKey} from '../acm/nesting.mjs';
import {validateCatalogItem,FAMILIES} from '../../../supabase/functions/_shared/placas-catalogo.mjs';
export {FAMILIES};
export const newItem=(kind='sheet',family='acrylic')=>({id:crypto.randomUUID(),kind,family,name:'',width:null,length:null,thickness:3,quantity:kind==='remnant'?1:0,color:family==='mdf'?'#b79160':'#eeeeea',colorName:family==='mdf'?'Natural':'Branco',brand:'',reference:'',location:'',directional:false,active:true,version:0});
export function materialOf(item){return {core:item.family,thickness:item.thickness,colorId:item.colorName.trim().toLowerCase(),colorName:item.colorName,color:item.color,manufacturer:item.brand.trim(),sku:item.reference.trim(),finish:'matte',directional:item.directional};}
export const materialLabel=m=>`${FAMILIES[m.core]} · ${m.colorName} · ${m.thickness} mm`;
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function calculateSheets(rows,catalog,settings={trim:10,kerf:4,rotation:true}){
 const errors=[],pieces=[],groups=[],sheets=[],unplaced=[],usage=new Map();
 const empty=()=>({valid:false,errors,groups,sheets,pieces,total:0,remnantsUsed:0,utilization:0});
 if(!Array.isArray(rows)||!rows.length||rows.length>100){errors.push('Adicione de 1 a 100 medidas.');return empty();}
 if(!finite(settings.trim,0,1000)||!finite(settings.kerf,0,1000)||typeof settings.rotation!=='boolean'){errors.push('Confira margem, separação e rotação.');return empty();}
 if(!Array.isArray(catalog)||new Set(catalog.map(x=>x.id)).size!==catalog.length){errors.push('Catálogo inválido.');return empty();}
 const byId=new Map(catalog.map(x=>[x.id,x]));
 if(new Set(rows.map(r=>r.id)).size!==rows.length)errors.push('Medidas com identificação repetida.');
 for(const [i,row] of rows.entries()){
  const stock=byId.get(row.stockId);
  if(!stock||!stock.active||stock.kind!=='sheet'){errors.push(`Peça ${i+1}: escolha uma chapa ativa do cadastro.`);continue;}
  try{validateCatalogItem(stock);}catch(e){errors.push(e.message);continue;}
  if(!finite(row.width,1,100000)||!finite(row.height,1,100000)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>1200){errors.push(`Peça ${i+1}: confira medidas e quantidade.`);continue;}
  if(pieces.length+row.quantity>1200){errors.push('Limite de 1.200 peças por simulação.');break;}
  const material=materialOf(stock),blank={width:row.width,height:row.height,contour:[[0,0],[row.width,0],[row.width,row.height],[0,row.height]],grooves:[]};
  for(let j=0;j<row.quantity;j++)pieces.push({id:`${row.id}:${j+1}`,rowId:row.id,stockId:stock.id,number:String(i+1).padStart(2,'0'),description:row.description,material,blank});
 }
 if(errors.length)return empty();
 for(const stockId of new Set(pieces.map(p=>p.stockId))){
  const item=byId.get(stockId),batch=pieces.filter(p=>p.stockId===stockId),material=batch[0].material,key=materialKey(material);
  const compatible=[];
  for(const remnant of catalog.filter(x=>x.active&&x.kind==='remnant'&&materialKey(materialOf(x))===key)){
   try{validateCatalogItem(remnant);}catch(e){errors.push(e.message);continue;}
   const used=usage.get(remnant.id)||0;
   for(let n=used;n<remnant.quantity;n++)compatible.push({id:`${remnant.id}:${n}`,catalogId:remnant.id,width:remnant.width,length:remnant.length,material});
  }
  if(compatible.length>100){errors.push('Use no máximo 100 unidades de retalhos compatíveis por material.');continue;}
  const stock={...settings,width:item.width,length:item.length,quantity:null,remnants:[]};
  const fabrication={machineWidth:Math.max(item.width,...compatible.map(x=>x.width)),machineLength:Math.max(item.length,...compatible.map(x=>x.length))};
  let remaining=batch;const stages=[];
  if(compatible.length){const offStock={...stock,quantity:0,remnants:compatible};const packed=nestPieces(batch,offStock,fabrication);errors.push(...(packed.errors||[]).map(e=>e.message),...validateNesting(packed,batch,offStock,fabrication));stages.push(packed);const missing=new Set(packed.unplaced.map(p=>p.pieceId));remaining=batch.filter(p=>missing.has(p.id));}
  if(remaining.length){const packed=nestPieces(remaining,stock,fabrication);errors.push(...(packed.errors||[]).map(e=>e.message),...validateNesting(packed,remaining,stock,fabrication));stages.push(packed);unplaced.push(...packed.unplaced);}
  const allocated=stages.flatMap(s=>s.sheets);
  // Verify all stages together before renaming IDs for display.
  const combined={sheets:allocated,unplaced:stages.at(-1)?.unplaced??[],grossArea:allocated.reduce((n,s)=>n+s.width*s.length,0),usedArea:allocated.reduce((n,s)=>n+s.usedArea,0)};
  combined.wasteArea=combined.grossArea-combined.usedArea;
  errors.push(...validateNesting(combined,batch,{...stock,remnants:compatible},fabrication));
  for(const sheet of allocated){if(sheet.source==='remnant'){const source=compatible.find(x=>x.id===sheet.sourceId);usage.set(source.catalogId,(usage.get(source.catalogId)||0)+1);}sheets.push({...sheet,sourceName:sheet.source==='remnant'?byId.get(compatible.find(x=>x.id===sheet.sourceId).catalogId).name:item.name,location:sheet.source==='remnant'?byId.get(compatible.find(x=>x.id===sheet.sourceId).catalogId).location:'',id:`${sheet.source==='remnant'?'RT':'CH'}${sheets.filter(s=>s.source===sheet.source).length+1}`,stockName:item.name,stockId});}
  groups.push({item,material,total:allocated.filter(s=>s.source==='sheet').length,remnantsUsed:allocated.filter(s=>s.source==='remnant').length});
 }
 for(const p of unplaced)errors.push(`Peça ${pieces.find(x=>x.id===p.pieceId)?.number}: não cabe na chapa escolhida com a margem e orientação atuais.`);
 const gross=sheets.reduce((n,s)=>n+s.width*s.length,0),used=sheets.reduce((n,s)=>n+s.usedArea,0);
 return {valid:!errors.length,errors:[...new Set(errors)],groups,sheets,pieces,total:groups.reduce((n,g)=>n+g.total,0),remnantsUsed:[...usage.values()].reduce((n,v)=>n+v,0),usage:Object.fromEntries(usage),utilization:gross?used/gross*100:0,wasteArea:gross-used};
}
