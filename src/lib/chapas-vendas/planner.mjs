import {createProject,COLORS,LIMITS} from '../acm/model.mjs';
import {developBlank} from '../acm/engine.mjs';
import {nestPieces,validateNesting,materialKey} from '../acm/nesting.mjs';
export const FINISHES=[['matte','Fosco'],['gloss','Brilhante'],['wood','Amadeirado'],['brushed','Escovado'],['metallic','Metálico'],['mirror','Espelhado']];
export const COATINGS=[['polyester','Poliéster'],['pvdf','PVDF'],['unspecified','A confirmar']];
export const defaultMaterial=()=>({colorId:'branco',colorName:'',finish:'matte',thickness:3,directional:false,manufacturer:'',sku:'',coating:'polyester'});
export const newRow=(material=defaultMaterial())=>({id:crypto.randomUUID(),description:'Frente',kind:'front',columnMode:'folded',sideLeft:300,sideRight:300,width:1000,height:1000,quantity:1,folded:false,left:30,right:30,top:30,bottom:30,...material,materialOverride:false});
export const initialPlan=()=>({name:'Novo plano de chapas',material:defaultMaterial(),rows:[newRow()],stock:{...createProject().stock,width:1220,length:5000},reserves:{}});
export function updateDefaultMaterial(input,patch){const material={...input.material,...patch};return {...input,material,rows:input.rows.map(r=>r.materialOverride?r:{...r,...material})};}
export const salesMaterialKey=m=>JSON.stringify([materialKey(m),m.coating??'polyester',(m.colorName??'').trim()]);
export const colorLabel=m=>(m.colorName??'').trim()||COLORS.find(c=>c.id===m.colorId)?.name;
export const materialLabel=m=>[colorLabel(m),COATINGS.find(c=>c[0]===(m.coating??'polyester'))?.[1],FINISHES.find(f=>f[0]===m.finish)?.[1],`${m.thickness} mm`].join(' · ');
export const productLabel=m=>[m.manufacturer||'Marca a confirmar',m.sku?`Ref. ${m.sku}`:'Referência a confirmar'].join(' · ');
export function contrastInk(hex){const rgb=hex.replace('#','').match(/../g).map(n=>{const v=parseInt(n,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#182c3c':'#ffffff';}
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function calculatePlan(input){
 const errors=[],rows=[],pieces=[],groups=[];
 if(!input||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100)return {valid:false,errors:['Informe de 1 a 100 linhas.'],rows,groups};
 if(new Set(input.rows.map(r=>r.id)).size!==input.rows.length)errors.push('Linhas com identificadores repetidos.');
 const expanded=[];
 for(const [index,row] of input.rows.entries()){
  const kind=row.kind??'front';
  if(!['front','side','column'].includes(kind)){errors.push(`Linha ${index+1}: tipo de peça inválido.`);continue;}
  if(kind!=='column'){expanded.push({...row,number:index+1});continue;}
  if(!['folded','separate'].includes(row.columnMode)||!number(row.sideLeft,.01,1000)||!number(row.sideRight,.01,1000)){
   errors.push(`Linha ${index+1}: informe laterais da coluna entre 0,01 e 100 cm e o tipo de montagem.`);continue;
  }
  const base={...row,sourceId:row.id};
  if(row.columnMode==='folded')expanded.push({...base,number:index+1,description:`${row.description||'Coluna'} · U dobrado (frente + laterais)`,folded:true,left:row.sideLeft,right:row.sideRight,top:0,bottom:0});
  else for(const [suffix,name,width] of [['F','Frente',row.width],['E','Lateral esquerda',row.sideLeft],['D','Lateral direita',row.sideRight]])expanded.push({...base,id:`${row.id}/${suffix}`,number:`${index+1}${suffix}`,description:`${row.description||'Coluna'} · ${name}`,width});
 }
 if(errors.length)return {valid:false,errors,rows,groups};
 const fabrication={...createProject().fabrication,machineWidth:input.stock?.width,machineLength:input.stock?.length};
 for(const [index,row] of expanded.entries()){
  const label=`Linha ${index+1}`;
  if(!number(row.width,.01,LIMITS.dimension)||!number(row.height,.01,LIMITS.dimension)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>LIMITS.pieces||![3,4].includes(row.thickness)||!COLORS.some(c=>c.id===row.colorId)||!['matte','gloss','wood','brushed','metallic','mirror'].includes(row.finish)||typeof row.folded!=='boolean'){errors.push(`${label}: confira medidas, quantidade e material.`);continue;}
  if(!COATINGS.some(c=>c[0]===(row.coating??'polyester'))||['manufacturer','sku','colorName'].some(k=>row[k]!=null&&(typeof row[k]!=='string'||row[k].length>120))){errors.push(`${label}: confira revestimento, marca, referência e nome da cor (até 120 caracteres).`);continue;}
  const edges=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,row.folded?row[k]:0]));
  if(Object.values(edges).some(v=>!number(v,0,1000))){errors.push(`${label}: abas devem ser de 0 a 1.000 mm.`);continue;}
  try{
   const blank=developBlank(row.width,row.height,edges,fabrication),color=COLORS.find(c=>c.id===row.colorId);
   const material={...createProject().material,colorId:color.id,color:color.hex,colorName:(row.colorName??'').trim(),finish:row.finish,thickness:row.thickness,directional:!!row.directional||color.directional||['wood','brushed'].includes(row.finish),manufacturer:(row.manufacturer??'').trim(),sku:(row.sku??'').trim(),coating:row.coating??'polyester'};
   rows.push({...row,number:row.number??index+1,blank,material});
   if(pieces.length+row.quantity>LIMITS.pieces){errors.push(`Máximo de ${LIMITS.pieces} peças por cálculo.`);break;}
   for(let i=0;i<row.quantity;i++)pieces.push({id:`${row.id}:${i+1}`,rowId:row.id,number:row.number??index+1,blank,material});
  }catch(error){errors.push(`${label}: ${error.message}`);}
 }
 if(errors.length)return {valid:false,errors,rows,groups};
 const stock={...input.stock,quantity:null,remnants:[]};
 // Preserve the ACM engine; custom color names and coatings also separate purchases.
 const result={sheets:[],unplaced:[],grossArea:0,usedArea:0,wasteArea:0};
 for(const key of new Set(pieces.map(p=>salesMaterialKey(p.material)))){
  const batch=pieces.filter(p=>salesMaterialKey(p.material)===key),packed=nestPieces(batch,stock,fabrication);
  errors.push(...(packed.errors||[]).map(e=>e.message));
  if(!packed.errors?.length)errors.push(...validateNesting(packed,batch,stock,fabrication));
  for(const sheet of packed.sheets)result.sheets.push({...sheet,id:`CH${result.sheets.length+1}`,purchaseKey:salesMaterialKey(sheet.material)});
  result.unplaced.push(...packed.unplaced);
  for(const k of ['grossArea','usedArea','wasteArea'])result[k]+=packed[k]||0;
 }
 result.utilization=result.grossArea?100*result.usedArea/result.grossArea:0;
 for(const item of result.unplaced){const p=pieces.find(p=>p.id===item.pieceId);errors.push(`Peça ${p?.number}: ${item.reason}`);}
 const keys=[...new Set(pieces.map(p=>salesMaterialKey(p.material)))];
 for(const key of keys){
  const material=pieces.find(p=>salesMaterialKey(p.material)===key).material,sheets=result.sheets.filter(s=>s.purchaseKey===key),reserve=input.reserves?.[key]??0;
  if(!Number.isInteger(reserve)||reserve<0||reserve>2000)errors.push('Reserva deve ser um número inteiro de 0 a 2.000 chapas.');
  groups.push({key,material,sheets,reserve,calculated:sheets.length,total:sheets.length+reserve});
 }
 return {valid:errors.length===0,errors:[...new Set(errors)],rows,groups,pieces,result,total:groups.reduce((n,g)=>n+g.total,0)};
}
