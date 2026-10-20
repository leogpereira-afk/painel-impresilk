import test from 'node:test';import assert from 'node:assert/strict';import {calculateSheets,newItem} from './planner.mjs';import {sheetsPDF} from './pdf.mjs';
const sheet={...newItem(),id:'s',name:'Chapa exemplo',width:1220,length:2440,brand:'Marca exemplo'};
const rows=[{id:'r',stockId:'s',description:'Peça exemplo',width:500,height:500,quantity:3}];
const pdf=(r=rows)=>new TextDecoder('latin1').decode(sheetsPDF('Projeto exemplo',r,calculateSheets(r,[sheet])));
test('PDF includes purchase total, material, drawing, dimensions and cuts on one page when small',()=>{const s=pdf();assert.ok(s.startsWith('%PDF-1.4'));for(const text of ['COMPRAR: 1','USAR: 0','Marca exemplo','CH1','50,00','244,00','3 un.','/Count 1'])assert.ok(s.includes(text),text);});
test('PDF paginates large plans instead of shrinking text',()=>{const s=pdf([{...rows[0],quantity:150}]);assert.ok(!s.includes('/Count 1 >>'));assert.ok(s.includes('/FN 9 Tf'));});
test('PDF refuses an invalid plan',()=>assert.throws(()=>sheetsPDF('x',[],{valid:false}),/inválido/));
