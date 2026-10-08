import {test} from 'node:test';import assert from 'node:assert/strict';import {painelEtapas} from './painelEtapas.js';
test('dashboard separa pronta de validada, calcula progresso e dias inclusivos',()=>{
 const r=painelEtapas([{id:'a',situacao:'validacao',inicioPrevisto:'2026-10-01',inicioReal:'2026-10-01',fimReal:'2026-10-03',prazo:'2026-10-02'},{id:'b',situacao:'execucao',inicioReal:'2026-10-06',prazo:'2026-10-07',progresso:50},{id:'c',situacao:'pendente',prazo:'2026-10-12'}],'2026-10-08');
 assert.equal(r.progresso,50);assert.equal(r.prontas,1);assert.equal(r.concluidas,0);assert.equal(r.atrasadas,1);assert.equal(r.mediaDias,3);assert.equal(r.linhas[0].atraso,1);assert.equal(r.linhas[1].dias,3);assert.equal(r.linhas[2].dias,null);
});
test('datas ausentes não viram duração zero; etapa validada antiga continua pronta',()=>{const r=painelEtapas([{id:'a',situacao:'concluida',prazo:'2026-10-01'}],'2026-10-08');assert.equal(r.mediaDias,null);assert.equal(r.medidas,0);assert.equal(r.progresso,100);assert.equal(r.linhas[0].atraso,null);assert.equal(r.linhas[0].dias,null);assert.equal(painelEtapas([],'2026-10-08').progresso,0);});
test('datas inválidas não derrubam a linha do tempo e marco no fim permanece visível',()=>{const r=painelEtapas([{id:'a',situacao:'pendente',inicioReal:'2026-99-99',prazo:'2026-02-30'},{id:'b',situacao:'pendente',prazo:'2026-11-01'}],'2026-10-08');assert.equal(r.linhas[0].dias,null);assert.equal(r.linhas[0].previsto,null);assert.equal(r.linhas[1].previsto.left,99);assert.equal(r.linhas[1].previsto.width,1);});

test('qualidade considera apenas última nota válida e não inventa zero para não avaliadas',()=>{
 const p=painelEtapas([{id:'1',avaliacoes:[{pontuacao:10},{pontuacao:5}]},{id:'2',avaliacoes:[{pontuacao:9}]},{id:'3'},{id:'4',avaliacoes:[{pontuacao:99}]}],'2026-10-08');
 assert.equal(p.mediaQualidade,7);assert.equal(p.avaliadas,2);assert.equal(p.precisamMelhorar,1);
 assert.equal(painelEtapas([],'2026-10-08').mediaQualidade,null);
});
