import test from 'node:test';
import assert from 'node:assert/strict';
import {cumprimentoDecisoes} from './gestao.js';
test('não classifica conclusão sem data como cumprimento de prazo',()=>{
 for(const status of ['aberta','concluida']){
  const r=cumprimentoDecisoes([{id:'d',status,prazo:'2026-09-04'}],[{decisao_id:'d',status:'concluida'}]);
  assert.equal(r.geral.noPrazo,0);assert.equal(r.geral.semData,1);
 }
});
test('conclusão comprovada separa pontual, atrasada e ainda aberta',()=>{
 const ds=['a','b','c'].map(id=>({id,status:'aberta',prazo:'2026-09-04',responsavel:'Pessoa'}));
 const ts=[{decisao_id:'a',status:'concluida',concluido_em:'2026-09-04T12:00:00Z'},{decisao_id:'b',status:'concluida',concluido_em:'2026-09-05T12:00:00Z'}];
 const r=cumprimentoDecisoes(ds,ts);assert.deepEqual(r.geral,{total:3,noPrazo:1,semData:0,pct:33});assert.equal(r.porPessoa[0].pct,33);
});
test('decisão concluída sem tática não recebe data inventada',()=>{
 assert.equal(cumprimentoDecisoes([{id:'a',status:'concluida',prazo:'2026-09-04'}],[]).geral.semData,1);
});
test('mantém regra sem prazo e estado sem decisões',()=>{
 assert.equal(cumprimentoDecisoes([{id:'a',status:'concluida'}],[]).geral.noPrazo,1);
 assert.equal(cumprimentoDecisoes([],[]).geral.pct,null);
});
