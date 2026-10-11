import {test} from 'node:test';
import assert from 'node:assert/strict';
import {montarRelacaoNumeros} from './telefonia-patrimonio.js';

test('relação agrupa por ID de RH e preserva múltiplos números, homônimos e pendências',()=>{
 const pessoas=[{id:'rh-1',nome:'Ana Souza'},{id:'rh-2',nome:'Ana Souza'}];
 const setores=[{id:'s-1',nome:'Vendas'},{id:'s-2',nome:'Financeiro'}];
 const mapa={
  a:{tipo:'celulares',numero:'(38) 9999-0001',pessoaId:'rh-1',setorId:'s-1',status:'ativo'},
  b:{tipo:'ramais',numero:'201',pessoaId:'rh-1',setorId:'s-1',status:'ativo'},
  c:{tipo:'ramais',numero:'202',pessoaId:'rh-2',setorId:'s-2',status:'ativo'},
  d:{tipo:'celulares',numero:'(38) 9999-0002',setorId:'s-1',status:'disponivel'},
  e:{tipo:'ramais',numero:'203',setorId:'s-2',status:'disponivel'},
  f:{tipo:'celulares',numero:'(38) 9999-0003',pessoa:'Ana Souza',status:'ativo'},
  g:{tipo:'armarios',numero:'4'},
 };
 const r=montarRelacaoNumeros(mapa,pessoas,setores);
 assert.equal(r.total,6);
 assert.deepEqual(r.pessoas.map(p=>[p.id,p.linhas.map(l=>l.id)]),[['rh-1',['a','b']],['rh-2',['c']]]);
 assert.deepEqual(r.disponiveis.map(s=>[s.id,s.linhas.map(l=>l.id)]),[['s-2',['e']],['s-1',['d']]]);
 assert.deepEqual(r.pendentes.map(l=>l.id),['f']);
});
