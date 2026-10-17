import test from 'node:test';
import assert from 'node:assert/strict';
import {recorteMesDashboard} from './dashboard-apresentacao.js';

test('detalhar um mês respeita o recorte personalizado que compõe seu valor',()=>{
  assert.deepEqual(recorteMesDashboard('2026-10',{de:'2026-10-10',ateEfetivo:'2026-10-15'}),{modo:'personalizado',de:'2026-10-10',ate:'2026-10-15'});
});
test('limites de meses e mês corrente não ampliam cobertura no detalhe',()=>{
  const periodo={de:'2024-02-15',ateEfetivo:'2024-03-12'};
  assert.deepEqual(recorteMesDashboard('2024-02',periodo),{modo:'personalizado',de:'2024-02-15',ate:'2024-02-29'});
  assert.deepEqual(recorteMesDashboard('2024-03',periodo),{modo:'personalizado',de:'2024-03-01',ate:'2024-03-12'});
  assert.equal(recorteMesDashboard('2024-04',periodo),null);
});
