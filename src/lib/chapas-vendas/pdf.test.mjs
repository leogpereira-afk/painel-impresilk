import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPlan,calculatePlan,defaultMaterial} from './planner.mjs';
import {purchasePDF} from './pdf.mjs';

const date=new Date('2026-10-20T12:00:00Z');
const pdfText=(input,options={})=>{
 const plan=calculatePlan(input);
 assert.equal(plan.valid,true,plan.errors.join('; '));
 return Buffer.from(purchasePDF(input,plan,{date,...options})).toString('latin1');
};
const streams=pdf=>[...pdf.matchAll(/\nstream\n([\s\S]*?)\nendstream/g)].map(m=>m[1]).filter(s=>s.includes('BT /'));

test('PDF preserves strip identities in the drawing by rotating labels that do not fit horizontally',()=>{
 const input=initialPlan();
 input.rows=[{...input.rows[0],id:'strip-a',description:'Tira A',width:100,height:1000,quantity:2},{...input.rows[0],id:'strip-b',description:'Tira B',width:120,height:1000,quantity:2}];
 const pdf=pdfText(input),drawing=pdf.slice(pdf.indexOf('(Distribuição'));
 assert.match(drawing,/\(P1\) Tj/);
 assert.match(drawing,/\(P2\) Tj/);
 assert.match(drawing,/0 1 -1 0 [\d.]+ [\d.]+ Tm \(P[12]\) Tj/);
});

test('PDF provides positional identification when a piece is too small for either label orientation',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:10,height:10});
 const pdf=pdfText(input),drawing=pdf.slice(pdf.indexOf('(Distribuição'));
 assert.match(drawing,/Identificação por posição/);
 assert.match(drawing,/P1/);
 assert.match(drawing,/x: 1,00/);
 assert.match(drawing,/y: 1,00/);
});

test('PDF consolidates identical cuts and layouts while retaining original rows, quantities and sheet IDs',()=>{
 const input=initialPlan();
 input.rows=[{...input.rows[0],id:'same-a',description:'Frente A',width:1200,height:4980,quantity:3},{...input.rows[0],id:'same-b',description:'Frente B',width:1200,height:4980,quantity:3}];
 const pdf=pdfText(input);
 assert.equal((pdf.match(/ h B Q/g)||[]).length,1,'One representative contour for six identical layouts');
 for(const value of ['Frente A · 3 peças','Frente B · 3 peças','#1','#2','CH1 a CH6','6 chapas','6 peças no grupo'])assert.ok(pdf.includes(value),value);
});

test('PDF keeps layouts with different fold geometry distinct',()=>{
 const input=initialPlan();
 input.rows=[{...input.rows[0],id:'left',description:'Dobra esquerda',width:1000,height:4800,quantity:1,folded:true,left:100,right:0,top:0,bottom:0},{...input.rows[0],id:'right',description:'Dobra direita',width:1000,height:4800,quantity:1,folded:true,left:0,right:100,top:0,bottom:0}];
 const pdf=pdfText(input);
 assert.equal((pdf.match(/ h B Q/g)||[]).length,2);
 assert.ok(pdf.includes('Dobra esquerda'));assert.ok(pdf.includes('Dobra direita'));
});

test('PDF repeats plan identity, generation time and confirmation on every continuation page',()=>{
 const input=initialPlan();input.name='Plano fictício de revisão';input.planNumber='PC-TESTE-001';
 input.rows=Array.from({length:20},(_,i)=>({...input.rows[0],id:`material-${i}`,description:`Peça ${i+1}`,width:1200,height:4980,sku:`REF-DEMO-${i}`}));
 const pages=streams(pdfText(input,{confirmed:true}));
 assert.ok(pages.length>1);
 for(const page of pages)for(const value of [input.name,input.planNumber,date.toLocaleString('pt-BR'),'Conferido pelo usuário'])assert.ok(page.includes(value),value);
});

test('PDF separates consumed remnants from new purchases and extra reserve',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:500,height:500,quantity:3});
 input.remnants=[{id:'offcut',name:'Retalho demonstrativo',width:520,length:520,quantity:2,material:defaultMaterial()}];
 let plan=calculatePlan(input);input.reserves[plan.groups[0].key]=1;plan=calculatePlan(input);
 assert.equal(plan.total,2);assert.equal(plan.remnantsUsed,2);
 const pdf=pdfText(input);
 for(const value of ['COMPRAR 2 CHAPAS NOVAS','Retalhos usados: 2','Novas calculadas: 1','Reserva extra: 1','RT1, RT2','CH1','Retalho demonstrativo','52,00 cm','2 retalhos','1 chapa nova'])assert.ok(pdf.includes(value),value);
 assert.equal((pdf.match(/ h B Q/g)||[]).length,2,'One remnant template plus one new-sheet template');
});

test('PDF retains distinct remnant origins even when their repeated layouts are consolidated',()=>{
 const input=initialPlan();Object.assign(input.rows[0],{width:500,height:500,quantity:2});
 input.remnants=[{id:'a',name:'Origem A',width:520,length:520,quantity:1,material:defaultMaterial()},{id:'b',name:'Origem B',width:520,length:520,quantity:1,material:defaultMaterial()}];
 const pdf=pdfText(input);
 for(const value of ['COMPRAR 0 CHAPAS NOVAS','Origem RT1: Origem A','Origem RT2: Origem B'])assert.ok(pdf.includes(value),value);
 assert.equal((pdf.match(/ h B Q/g)||[]).length,1);
});

test('PDF fits the short requester/client plan with two repeated remnants and one new sheet on one page',()=>{
 const input=initialPlan(),material={...defaultMaterial(),colorId:'azul',manufacturer:'Marca exemplo',sku:'ACM-EX'};
 input.name='Demonstração · retalhos e aproveitamento';input.requester='Conta de demonstração';input.client='Cliente de demonstração';
 Object.assign(input.rows[0],material,{width:992.8,height:1000,quantity:5});
 input.remnants=[{id:'offcut',name:'Retalho 1',width:1200,length:2200,quantity:2,material}];
 const pdf=pdfText(input);
 assert.equal(streams(pdf).length,1);
 for(const value of ['Conta de demonstração','Cliente de demonstração','RT1, RT2','CH1','Origem RT1, RT2: Retalho 1','1 peça no grupo'])assert.ok(pdf.includes(value),value);
 assert.equal((pdf.match(/ h B Q/g)||[]).length,3,'Two pieces in the repeated remnant template and one on the new sheet');
});

test('PDF uses singular when a layout group contains exactly one piece',()=>{
 const pdf=pdfText(initialPlan());
 assert.ok(pdf.includes('1 peça no grupo'));
 assert.ok(!pdf.includes('1 peças no grupo'));
});

test('PDF paginates a consolidated cut with many long descriptions without dropping its original rows',()=>{
 const input=initialPlan();
 input.rows=Array.from({length:100},(_,i)=>({...input.rows[0],id:`origin-${i}`,description:`Origem ${String(i+1).padStart(3,'0')} `+'Descrição demonstrativa '.repeat(4),width:1000,height:1000}));
 const pdf=pdfText(input),pages=streams(pdf);
 assert.ok(pages.length>2);
 assert.ok(pages.length<=5,'Long origin descriptions should use the page width instead of hundreds of narrow table lines');
 assert.ok(pages[0].includes('Origem 001'),'The first table page must start the long row rather than leave an orphan header');
 for(let i=1;i<=100;i++)assert.ok(pdf.includes(`Origem ${String(i).padStart(3,'0')}`));
 for(const page of pages)for(const match of page.matchAll(/1 0 0 1 [\d.]+ (-?[\d.]+) Tm/g))assert.ok(Number(match[1])>=26,'No text outside the printable page');
});

test('PDF fits two source rows, two remnants and one new sheet without shrinking drawings or text',()=>{
 const input=initialPlan();input.requester='Solicitante de teste';input.client='Cliente de teste';
 input.rows=[{...input.rows[0],id:'front',description:'Frente',width:1000,height:1000,quantity:3},{...input.rows[0],id:'ceiling',description:'Forro',width:1000,height:1000,quantity:2}];
 input.remnants=[{id:'offcut',name:'Retalho 1',width:1200,length:2200,quantity:2,material:defaultMaterial()}];
 const pdf=pdfText(input);
 assert.equal(streams(pdf).length,1);
 for(const value of ['Frente · 3 peças','Forro · 2 peças','RT1, RT2','CH1','COMPRAR 1 CHAPA NOVA'])assert.ok(pdf.includes(value),value);
 assert.match(pdf,/\/FN 8 Tf/);
 assert.match(pdf,/64\.00 re B Q/,'Retain the 64-point remnant drawing height');
});
