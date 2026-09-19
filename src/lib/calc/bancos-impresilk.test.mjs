import test from 'node:test';
import assert from 'node:assert/strict';
import { bancosDaImpresilk, contaDaImpresilk } from './bancos-impresilk.js';
test('mantém Impresilk e Universo e exclui contas pessoais e outras empresas', () => {
 const a = {titular:'Impresilk', grupo:'Impresilk e Universo'};
 const b = {titular:'Universo', grupo:'Impresilk e Universo'};
 assert.deepEqual(bancosDaImpresilk({a,b,c:{titular:'Leonardo'},d:{grupo:'Impresilk'}}), {a,b});
 assert.equal(b.grupo, 'Impresilk e Universo');
});
test('aceita razão social e ignora nome parcial ou titular ausente', () => {
 assert.equal(contaDaImpresilk({titular:' IMPRESILK LTDA '}), true);
 for (const titular of ['', 'Não Impresilk', 'ImpresilkOutra', 'UniversoOutra', 'Domo']) assert.equal(contaDaImpresilk({titular}), false);
});
