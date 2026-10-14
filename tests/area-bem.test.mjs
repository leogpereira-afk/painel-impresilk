import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bensDaArea} from '../src/lib/calc/area-bem.js';
import {vinculosDosBens} from '../src/lib/calc/vinculo-patrimonio.js';
const bem={id:'bem-teste',areaPatrimonio:'maquinas',nomeGenerico:'Impressora fictícia',setorSigla:'PRO',codigo:'PRO-900',situacao:'uso'};
test('bem aparece em Máquinas sem criar ou possuir ficha; mudar área usa o mesmo ID',()=>{
 for(const area of ['maquinas','carros','estrutura']){
  const b={...bem,areaPatrimonio:area},v=vinculosDosBens([b],[]);
  assert.deepEqual(bensDaArea([b],area,v),[b]);
  assert.equal(bensDaArea([b],area==='maquinas'?'carros':'maquinas',v).length,0);
 }
 assert.equal(bem.setorSigla,'PRO');
});
test('não duplica fichas ligadas nem revela vínculo oculto ou conflitante',()=>{
 for(const fichas of [[{id:'f',tipo:'maquina',bemId:bem.id}],[{id:'f',tipo:'maquina',bemId:bem.id},{id:'g',tipo:'veiculo',bemId:bem.id}]]){
  assert.deepEqual(bensDaArea([bem],'maquinas',vinculosDosBens([bem],fichas)),[]);
 }
 assert.deepEqual(bensDaArea([bem],'maquinas',vinculosDosBens([bem],[],[{ativoId:'oculta',bemId:bem.id}])),[]);
 assert.deepEqual(bensDaArea([bem],'maquinas',null),[]);
});
test('baixado fica no inventário, busca inclui setor com e sem acentos, nenhuma área por inferência',()=>{
 const v=vinculosDosBens([bem],[]);
 assert.equal(bensDaArea([bem],'maquinas',v,'producao',[{sigla:'PRO',nome:'Produção'}]).length,1);
 assert.equal(bensDaArea([bem],'maquinas',v,'inexistente').length,0);
 assert.equal(bensDaArea([{...bem,situacao:'baixado'}],'maquinas',v).length,0);
 assert.equal(bensDaArea([{...bem,areaPatrimonio:''}],'maquinas',v).length,0);
 assert.equal(bensDaArea([bem],'__proto__',v).length,0);
});
