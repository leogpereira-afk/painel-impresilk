import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPlan,calculatePlan} from './planner.mjs';
import {formatCM,parseCM} from './units.mjs';
import {purchasePDF} from './pdf.mjs';
test('centimetres accept comma or dot, format two decimals and reject ambiguous input',()=>{
 for(const [s,mm] of [['100,00',1000],['12,34',123.4],['0,01',.1],['2.55',25.5],['100',1000]])assert.equal(parseCM(s),mm);
 for(const s of ['',',','1.000,00','1e3','-1','12,345','NaN'])assert.equal(parseCM(s),null);
 assert.equal(formatCM(123.4),'12,34');assert.equal(formatCM(1000),'100,00');assert.equal(formatCM(null),'');
 for(let n=1;n<10000;n+=17)assert.equal(parseCM(formatCM(n/10)),n/10);
});
test('manual fold boundary: 120 cm fits the usable width, adding 3 cm each side blocks it',()=>{
 const p=initialPlan();Object.assign(p.rows[0],{width:1200,height:4980});
 assert.equal(calculatePlan(p).total,1);p.rows[0].folded=true;
 assert.equal(calculatePlan(p).valid,false);
 Object.assign(p.rows[0],{width:1140,height:4920});const r=calculatePlan(p);
 assert.equal(r.valid,true);assert.equal(r.rows[0].blank.width,1200);assert.equal(r.rows[0].blank.height,4980);assert.equal(r.total,1);
});
test('manual known counts for six folded 100cm squares and reserve',()=>{
 const p=initialPlan();Object.assign(p.rows[0],{quantity:6,folded:true});const r=calculatePlan(p);
 assert.equal(r.total,2);assert.deepEqual(r.result.sheets.map(s=>s.placements.length),[4,2]);
 assert.equal(r.rows[0].blank.width,1060);assert.equal(r.rows[0].blank.height,1060);
 const area=r.rows[0].blank.area*6;assert.equal(r.result.usedArea,area);
 assert.ok(Math.abs(r.result.utilization-area/(1220*5000*2)*100)<1e-9);
 p.reserves[r.groups[0].key]=1;const reserved=calculatePlan(p);assert.equal(reserved.total,3);assert.equal(reserved.result.utilization,r.result.utilization);
});
test('all asymmetric edge combinations have independently expected nominal extents',()=>{
 for(const left of [0,20,30])for(const right of [0,20,40])for(const top of [0,30])for(const bottom of [0,50]){
  const p=initialPlan();Object.assign(p.rows[0],{width:300,height:450,folded:true,left,right,top,bottom});const r=calculatePlan(p);
  assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.rows[0].blank.width,300+left+right);assert.equal(r.rows[0].blank.height,450+top+bottom);
 }
});
test('deterministic varied projects conserve every piece, material, margin and gap',()=>{
 let seed=149;const random=()=>((seed=(seed*16807)%2147483647)/2147483647);
 for(let trial=0;trial<35;trial++){
  const p=initialPlan();p.rows=Array.from({length:5},(_,i)=>({...p.rows[0],id:`row-${i}`,width:100+Math.floor(random()*800),height:100+Math.floor(random()*1200),quantity:1+Math.floor(random()*5),folded:random()>.5,colorId:i%2?'preto':'branco'}));
  const r=calculatePlan(p);assert.equal(r.valid,true);const ids=[];
  for(const s of r.result.sheets)for(const [i,a] of s.placements.entries()){
   ids.push(a.pieceId);assert.ok(a.x>=p.stock.trim&&a.y>=p.stock.trim);assert.ok(a.x+a.width<=s.width-p.stock.trim+.000001&&a.y+a.height<=s.length-p.stock.trim+.000001);
   for(const b of s.placements.slice(i+1)){const k=p.stock.kerf;assert.ok(a.x+a.width+k<=b.x+.000001||b.x+b.width+k<=a.x+.000001||a.y+a.height+k<=b.y+.000001||b.y+b.height+k<=a.y+.000001);}
  }
  assert.equal(ids.length,p.rows.reduce((n,r)=>n+r.quantity,0));assert.equal(new Set(ids).size,ids.length);assert.equal(r.total,r.result.sheets.length);
  assert.ok(Math.abs(r.result.grossArea-r.result.usedArea-r.result.wasteArea)<.01);
 }
});
test('PDF includes units, all rows, material identities, fold edges, reserve and purchase total',()=>{
 const p=initialPlan();p.name='Auditoria demonstrativa';Object.assign(p.rows[0],{width:parseCM('100,25'),height:parseCM('80,50'),folded:true,left:20,right:30,top:40,bottom:50,manufacturer:'Marca teste',sku:'ABC-123',colorName:'Cor personalizada'});
 p.rows.push({...p.rows[0],id:'second',colorId:'preto',manufacturer:'Outra marca',quantity:3});let r=calculatePlan(p);p.reserves[r.groups[0].key]=2;r=calculatePlan(p);
 const pdf=Buffer.from(purchasePDF(p,r)).toString('latin1');
 for(const value of ['Auditoria demonstrativa','100,25','80,50','105,25','89,50','2,00 / 3,00 /','4,00 / 5,00','Marca teste','Outra marca','ABC-123','Cor personalizada','COMPRAR 4 CHAPAS','Reserva extra: 2','Separação','Giro de 90','Material M2'])assert.ok(pdf.includes(value),value);assert.ok(pdf.toLowerCase().includes('medidas em cm'));
});
test('column U includes both sides once; separate mode produces three panels per column',()=>{
 const p=initialPlan();Object.assign(p.rows[0],{kind:'column',description:'Coluna exemplo',width:400,height:2000,sideLeft:300,sideRight:200,quantity:2,columnMode:'folded'});
 let r=calculatePlan(p);assert.equal(r.valid,true);assert.equal(r.pieces.length,2);assert.equal(r.rows[0].blank.width,900);assert.equal(r.rows[0].blank.height,2000);assert.equal(r.total,1);
 p.rows[0].columnMode='separate';r=calculatePlan(p);assert.equal(r.valid,true);assert.equal(r.pieces.length,6);assert.deepEqual(r.rows.map(x=>x.blank.width),[400,300,200]);assert.deepEqual(r.rows.map(x=>x.number),['1F','1E','1D']);assert.equal(r.total,1);
 p.rows[0].folded=true;r=calculatePlan(p);assert.deepEqual(r.rows.map(x=>x.blank.width),[460,360,260]);assert.equal(r.rows[0].blank.height,2060);
 const pdf=Buffer.from(purchasePDF(p,r)).toString('latin1');for(const v of ['1F','1E','1D','esquerda','direita','QTD.'])assert.ok(pdf.includes(v));
});
test('column side and mode validation blocks impossible or unfinished columns',()=>{
 for(const patch of [{sideLeft:null},{sideRight:-1},{sideLeft:1001},{columnMode:'unknown'}]){const p=initialPlan();Object.assign(p.rows[0],{kind:'column'},patch);const r=calculatePlan(p);assert.equal(r.valid,false);assert.throws(()=>purchasePDF(p,r));}
});
test('900cm front requires explicit division and preserves area and quantities',()=>{
 const p=initialPlan();Object.assign(p.rows[0],{width:9000,height:1000,quantity:2});
 assert.equal(calculatePlan(p).valid,false);
 p.rows[0].panelsX=2;const r=calculatePlan(p);
 assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.pieces.length,4);assert.equal(r.total,4);
 assert.equal(r.rows.reduce((n,x)=>n+x.width*x.height*x.quantity,0),18000000);
 p.rows[0].folded=true;const folded=calculatePlan(p);assert.equal(folded.valid,true);assert.equal(folded.rows[0].blank.width,4560);assert.equal(folded.rows[0].blank.height,1060);
 for(const n of [0,1.5,101,null]){p.rows[0].panelsX=n;if(n!==null)assert.equal(calculatePlan(p).valid,false);}
});
test('forro and teto keep independent materials and customer/order identity in PDF',()=>{
 const p=initialPlan();p.client='Cliente exemplo';p.order={client:'Cliente vinculado',number:'DEMO',company:'Empresa exemplo'};
 p.rows=[{...p.rows[0],id:'a',kind:'ceiling',description:'Forro',width:9000,height:1000,panelsX:2},{...p.rows[0],id:'b',kind:'roof',description:'Teto',colorId:'azul'}];
 const r=calculatePlan(p);assert.equal(r.valid,true,r.errors.join(';'));assert.equal(r.groups.length,2);assert.equal(r.pieces.length,3);
 const pdf=Buffer.from(purchasePDF(p,r)).toString('latin1');
 for(const text of ['Cliente vinculado','O.S. #DEMO','Empresa exemplo','900,00','painel 1/2','Forro','Teto'])assert.ok(pdf.includes(text),text);
});
test('tray stays whole when it fits and confirmation is explicit in PDF',()=>{
 const p=initialPlan();Object.assign(p.rows[0],{folded:true,colorId:'vermelho',manufacturer:'Marca exemplo',sku:'REF-TESTE'});
 let r=calculatePlan(p);assert.equal(r.valid,true);assert.equal(r.pieces.length,1);assert.equal(r.rows[0].blank.width,1060);
 let pdf=Buffer.from(purchasePDF(p,r,{confirmed:true})).toString('latin1');
 for(const value of ['Bandeja','Conferido pelo','Marca exemplo','REF-TESTE'])assert.ok(pdf.includes(value),value);
 assert.ok(Buffer.from(purchasePDF(p,r)).toString('latin1').includes('Conferência pendente'));
 p.rows[0].width=9000;assert.equal(calculatePlan(p).valid,false);
 p.rows[0].panelsX=2;r=calculatePlan(p);assert.equal(r.valid,true);assert.equal(r.pieces.length,2);
 assert.equal(r.rows[0].blank.width,4560);assert.equal(r.total,2);
});
