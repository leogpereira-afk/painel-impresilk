import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarPendencias } from './inventario.js';
const setores=[{sigla:'IMP'}];
const base={codigo:'1',setorSigla:'IMP',responsavel:'Equipe',nf:'10',valor:100};
test('cadastro essencial precede foto mesmo em bem mais caro e preserva entrada',()=>{
 const bens=[{...base,id:'foto',valor:99999},{...base,id:'setor',setorSigla:''}];
 assert.deepEqual(ordenarPendencias(bens,setores,{setor:1}).map(b=>b.id),['setor','foto']);
 assert.equal(bens[0].id,'foto');
});
test('documentação precede foto; fotos não carregadas não criam prioridade falsa',()=>{
 const bens=[{...base,id:'foto'},{...base,id:'nota',nf:''}];
 assert.equal(ordenarPendencias(bens,setores,{nota:1})[0].id,'nota');
 assert.equal(ordenarPendencias(bens,setores,null)[0].id,'nota');
});
test('vínculo a conferir pesa como documentação, antes de foto',()=>{
 const bens=[{...base,id:'foto'},{...base,id:'vinculo'}];
 assert.equal(ordenarPendencias(bens,setores,{vinculo:1},{vinculo:{estado:'a-conferir'}})[0].id,'vinculo');
});
