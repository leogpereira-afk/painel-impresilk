import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listarControles,resumirControles,temResponsavel,textoAtualizacao} from './controles-patrimonio.js';
import {prepararControle,carimbarPatrimonio} from '../../../supabase/functions/_shared/patrimonio-controles.mjs';
const sessao={sub:'ana',nome:'Ana Exemplo'},agora='2026-10-05T13:00:00.000Z';
const base={tipo:'armarios',numero:'001',pessoa:'João',observacao:'',versaoAnterior:null};
test('abas são independentes, ordenadas por número e pesquisáveis sem acentos',()=>{
 const mapa={a:{...base,numero:'10'},b:{...base,numero:'2'},c:{...base,tipo:'camas',numero:'1'}};
 assert.deepEqual(listarControles(mapa,'armarios','joao').map(x=>x.id),['b','a']);
 assert.equal(listarControles(mapa,'camas').length,1);
});
test('autoria vem da sessão e apenas campos permitidos são persistidos',()=>{
 const r=prepararControle({...base,atualizadoPor:'falso',atualizadoEm:'2000',criadoPor:'outro',extra:'descartar'},null,sessao,agora);
 assert.equal(r.atualizadoPor,'ana');assert.equal(r.atualizadoPorNome,'Ana Exemplo');assert.equal(r.atualizadoEm,agora);assert.equal(r.criadoPor,'ana');assert.equal(r.numeroChave,'1');assert.equal(r.extra,undefined);assert.equal(r.versaoAnterior,undefined);
});
test('edição mantém criação e permite corrigir número, dono e telefone',()=>{
 const antes=prepararControle(base,null,sessao,agora),depois='2026-10-06T13:00:00.000Z';
 const r=prepararControle({...base,numero:'003',pessoa:'Maria',versaoAnterior:agora},antes,{sub:'leo',nome:'Leonardo'},depois);
 assert.equal(r.criadoEm,agora);assert.equal(r.criadoPor,'ana');assert.equal(r.atualizadoPor,'leo');assert.equal(r.numeroChave,'3');assert.equal(r.pessoa,'Maria');
});
test('edição atrasada e alteração de tipo são recusadas',()=>{
 const antes=prepararControle(base,null,sessao,agora);
 assert.throws(()=>prepararControle(base,antes,sessao,agora),e=>e.status===409);
 assert.throws(()=>prepararControle({...base,tipo:'camas',versaoAnterior:agora},antes,sessao,agora),/Tipo/);
});
test('número e telefone inválidos são recusados sem restringir cadastros ainda disponíveis',()=>{
 for(const numero of ['', 'abc','1.5','-1','1234567890123'])assert.throws(()=>prepararControle({...base,numero},null,sessao,agora),/número/);
 for(const telefone of ['abc','---','1'.repeat(41)])assert.throws(()=>prepararControle({...base,tipo:'ramais',telefone},null,sessao,agora),/telefone/);
 const r=prepararControle({...base,tipo:'ramais',telefone:'(38) 3000-1234',pessoa:''},null,sessao,agora);assert.equal(r.telefone,'(38) 3000-1234');
});
test('carimbo preserva campos existentes e não inventa data de criação antiga',()=>{
 const r=carimbarPatrimonio({codigo:'PRO-001',valor:100,atualizadoPor:'falso'},{codigo:'PRO-001'},sessao,agora);
 assert.equal(r.codigo,'PRO-001');assert.equal(r.valor,100);assert.equal(r.criadoEm,null);assert.equal(r.atualizadoPor,'ana');
 assert.equal(textoAtualizacao({}),'Sem registro de atualização');assert.match(textoAtualizacao(r),/05\/10\/2026.*Ana Exemplo/);
});

test('celulares exigem modelo, preservam número formatado e buscam pelo aparelho',()=>{
 const campos={...base,tipo:'celulares',numero:'(38) 99999-0000',modelo:'Samsung Galaxy A15',pessoa:'Maria'};
 const r=prepararControle(campos,null,sessao,agora);
 assert.equal(r.numero,'(38) 99999-0000');assert.equal(r.numeroChave,'38999990000');assert.equal(r.modelo,'Samsung Galaxy A15');
 assert.equal(listarControles({cel:r},'celulares','galaxy maria').length,1);
 assert.throws(()=>prepararControle({...campos,modelo:''},null,sessao,agora),/modelo/);
 assert.throws(()=>prepararControle({...campos,numero:'letras'},null,sessao,agora),/número/);
 const equivalente=prepararControle({...campos,numero:'38 99999 0000'},null,sessao,agora);
 assert.equal(equivalente.numeroChave,r.numeroChave);
});


test('resumo separa responsáveis e disponíveis somente na aba selecionada',()=>{
 const mapa={a:{...base,pessoa:'Ana'},b:{...base,pessoa:'  '},c:{...base,pessoa:null},d:{...base,tipo:'camas',pessoa:'João'}};
 assert.deepEqual(resumirControles(mapa,'armarios'),{total:3,atribuidos:1,disponiveis:2});
 assert.deepEqual(resumirControles(null,'celulares'),{total:0,atribuidos:0,disponiveis:0});
 assert.equal(temResponsavel(mapa.b),false);
});

test('filtro de responsável combina com busca e preserva todos os resultados para PDF',()=>{
 const mapa=Object.fromEntries(Array.from({length:20},(_,i)=>[String(i),{...base,numero:String(i),pessoa:i%2?'João':'',observacao:'Disponível na recepção'}]));
 assert.equal(listarControles(mapa,'armarios','recepcao','todos').length,20);
 assert.equal(listarControles(mapa,'armarios','recepcao','disponiveis').length,10);
 assert.equal(listarControles(mapa,'armarios','joao','atribuidos').length,10);
 assert.equal(listarControles(mapa,'armarios','joao','disponiveis').length,0);
});

 test('ramal permite telefone omitido, vazio e espaços, inclusive ao remover telefone existente',()=>{
 for(const telefone of [undefined,null,'','   ']){
  const criado=prepararControle({...base,tipo:'ramais',telefone},null,sessao,agora);
  assert.equal(criado.telefone,'');assert.equal(criado.numero,'001');
 }
 const antes=prepararControle({...base,tipo:'ramais',telefone:'(38) 3000-1234'},null,sessao,agora);
 const depois=prepararControle({...base,tipo:'ramais',telefone:'',versaoAnterior:antes.atualizadoEm},antes,sessao,'2026-10-08T18:00:00.000Z');
 assert.equal(depois.telefone,'');assert.equal(depois.pessoa,antes.pessoa);assert.equal(depois.criadoEm,antes.criadoEm);
 });
