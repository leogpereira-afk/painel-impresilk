import test from 'node:test';
import assert from 'node:assert/strict';
import {dominioGrafico,segmentosValidos,corSerie,recortePonto} from './graficos-comerciais.js';

test('escala mantém zero, valores negativos e ausência sem fabricar valor',()=>{
  assert.deepEqual(dominioGrafico([null,undefined,NaN]),{min:0,max:1,vazio:true});
  assert.deepEqual(dominioGrafico([0,0]),{min:0,max:1,vazio:false});
  assert.deepEqual(dominioGrafico([-50,100,null]),{min:-50,max:100,vazio:false});
});
test('linha interrompe em lacunas e preserva pontos zerados',()=>{
  assert.deepEqual(segmentosValidos([10,null,0,12,undefined,9]),[[[0,10]],[[2,0],[3,12]],[[5,9]]]);
});
test('cor por identidade é estável e detalhe intersecta exatamente o recorte',()=>{
  assert.equal(corSerie('vendedor-101'),corSerie('vendedor-101'));
  assert.match(corSerie('vendedor-101'),/^var\(--chart-\d\)$/);
  assert.deepEqual(recortePonto({de:'2026-10-01',ate:'2026-10-31'},{de:'2026-10-10',ateEfetivo:'2026-10-15'}),{modo:'personalizado',de:'2026-10-10',ate:'2026-10-15'});
  assert.equal(recortePonto({de:'2026-11-01',ate:'2026-11-30'},{de:'2026-10-10',ate:'2026-10-15'}),null);
});
