import test from 'node:test';
import assert from 'node:assert/strict';
import {filaComercial,sugestaoVenda,mesesDaDivida,sugestaoCobranca} from './inteligencia.js';
import {carteiraDeCobranca,ordenarCarteira,filtrarCarteira,resumoDaCarteira} from './cobrancas.js';
const hoje='2026-09-05';
const o=(id,campos={})=>({id,cliente:'Cliente',situacao:'aberto',valor:100,...campos});
test('fila respeita retorno futuro, exclui encerrados e prioriza combinado vencido sobre valor',()=>{
 const r=filaComercial([o('grande',{valor:10000}),o('promessa',{proximoToque:'2026-09-04'}),o('futuro',{proximoToque:'2026-09-06',vencido:true}),o('ganho',{situacao:'ganho'})],hoje);
 assert.deepEqual(r.map(g=>g.principal.id),['promessa','grande']);
});
test('agrupar cliente mantém orçamento mais urgente como alvo e não funde anônimos',()=>{
 const r=filaComercial([o('a',{cliente:'Alfa'}),o('b',{cliente:'ALFA',proximoToque:hoje}),o('c'),o('d')],hoje);
 assert.equal(r.length,3);assert.equal(r[0].principal.id,'b');assert.equal(r[0].valor,200);
});
test('identidades distintas prevalecem sobre o mesmo nome',()=>{
 assert.equal(filaComercial([o('a',{cliente:'Alfa',clienteId:'1'}),o('b',{cliente:'Alfa',clienteId:'2'})],hoje).length,2);
});
test('contato feito hoje sugere registrar combinado sem repetir ligação',()=>{
 assert.match(sugestaoVenda(o('a',{chamadoEm:hoje}),hoje).acao,/evitar novo contato/);
});
test('recall encerrado só entra se exige ação e venda encerrada não entra',()=>{
 assert.ok(sugestaoVenda(o('a',{situacao:'perdido',recall:true}),hoje));
 assert.equal(sugestaoVenda(o('b',{situacao:'perdido'}),hoje),null);
});
test('visão mensal soma saldo dos títulos, inclui meses antigos e separa datas ausentes',()=>{
 const r=mesesDaDivida([{vencimento:'2026-09-01',valor:40},{vencimento:'2026-09-02',valor:60},{vencimento:'2022-01-01',valor:15},{valor:20},{vencimento:'2026-13-01',valor:1}]);
 assert.deepEqual(r.meses,[{mes:'2026-09',valor:100,quantidade:2},{mes:'2022-01',valor:15,quantidade:1}]);assert.equal(r.semData,2);
});
test('prioridade usa cadastro persistido e pode ordenar acima do maior valor',()=>{
 const r=carteiraDeCobranca([{cliente:'Alfa',valor:10},{cliente:'Beta',valor:100}],{ALFA:{prioridade:'alta',chamados:{}}},hoje);
 assert.equal(ordenarCarteira(r,'prioridade')[0].cliente,'Alfa');assert.equal(ordenarCarteira(r,'valor')[0].cliente,'Beta');
 assert.equal(filtrarCarteira(r,{termo:'Alfa'})[0].prioridade,'alta');
});
test('disse que pagou e contestação exigem conferência antes de cobrança',()=>{
 for(const situacao of ['pagou','contestou'])assert.match(sugestaoCobranca({chamados:[{situacao}],promessaVencida:true},hoje),/antes/);
});
test('anotação sem desfecho não apaga promessa futura e sua sugestão',()=>{
 const c=carteiraDeCobranca([{cliente:'Alfa',valor:10}],{ALFA:{chamados:{novo:{data:hoje,resumo:'Anotação'},antigo:{data:'2026-09-01',situacao:'prometeu',promessa:'2026-09-09'}}}},hoje)[0];
 assert.match(sugestaoCobranca(c,hoje),/09\/09\/2026/);assert.equal(c.desfecho.promessa,'2026-09-09');assert.equal(resumoDaCarteira([c]).aguardando,1);
});
