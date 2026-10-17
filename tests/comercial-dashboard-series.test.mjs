import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apurarDashboard,detalharDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';

const hoje='2026-10-17',filtro={modo:'mes',mes:'2026-10'},sessao={sub:'direcao',master:true};
const venda=(id,extra={})=>({id,numero:'900'+id,clienteId:'cliente-1',cliente:'Cliente fictício',vendedor:'Vendedora Alfa',vendedorErpId:'1',empresaNome:'Impresilk',tipo:'Normal',data:'2026-10-05',valor:90,bruto:100,desconto:10,itens:[{produto:'Produto fictício',valorTotal:100,quantidade:1,unidade:'un'}],...extra});
const base=(extra={})=>({catalogo:{completo:true,vendedores:[{id:'1',nome:'Vendedora Alfa'},{id:'2',nome:'Vendedora Beta'}],produtos:[{id:'p',nome:'Produto fictício'}]},config:{vinculos:{alfa:'1'},participantesMetas:['1']},ordens:[venda('1')],recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2018-01-01',ate:hoje,concluidaEm:hoje}]}},metas:[{id:'1_2026-10',vendedorId:'1',mes:'2026-10',valor:500}],recebiveis:[],orcamentos:[],...extra});
const run=(b=base(),f=filtro,s=sessao)=>apurarDashboard(b,f,hoje,s);

test('séries diária, mensal e anual conciliam a mesma janela e os centavos dos indicadores',()=>{
 const r=run(base({ordens:[venda('1'),venda('2',{data:'2026-10-17',valor:45,bruto:50,desconto:5})]}));
 assert.equal(r.series.diaria.length,17);assert.equal(r.series.diariaDisponivel,true);
 for(const tipo of ['diaria','mensal','anual']){const pontos=r.series[tipo];assert.equal(pontos.reduce((s,p)=>s+p.centavos,0),r.resumo.centavos);assert.equal(pontos.reduce((s,p)=>s+p.pedidos,0),2);assert.equal(pontos.at(-1).acumuladoCentavos,13500);assert.equal(pontos[0].de,'2026-10-01');assert.equal(pontos.at(-1).ate,hoje);}
 const dia=r.series.diaria.find(p=>p.data==='2026-10-05');assert.equal(dia.brutoCentavos,10000);assert.equal(dia.descontoCentavos,1000);assert.equal(dia.descontoPercentual,10);assert.equal(dia.centavos,9000);assert.equal(r.resumo.descontoPercentual,10);
});
test('recorte personalizado não expande mês ou ano nos pontos e nos acumulados',()=>{
 const r=run(base({ordens:[venda('fora',{data:'2026-10-01'}),venda('dentro',{data:'2026-10-12'})]}),{modo:'personalizado',de:'2026-10-10',ate:'2026-10-15'});
 for(const tipo of ['diaria','mensal','anual']){assert.equal(r.series[tipo][0].de,'2026-10-10');assert.equal(r.series[tipo].at(-1).ate,'2026-10-15');assert.equal(r.series[tipo].at(-1).acumuladoCentavos,9000);}
});
test('dias sem cobertura ficam null, e acumulado não atravessa lacuna como total comprovado',()=>{
 const r=run(base({ordens:[venda('1'),venda('2',{data:'2026-10-15'})],cargaStatus:{janelas:{ordens:[{desde:'2026-10-01',ate:'2026-10-05',concluidaEm:hoje},{desde:'2026-10-15',ate:hoje,concluidaEm:hoje}]}}}));
 const primeiro=r.series.diaria[0],lacuna=r.series.diaria[5],ultimo=r.series.diaria.at(-1);
 assert.equal(primeiro.centavos,0);assert.equal(primeiro.completo,true);assert.equal(lacuna.centavos,null);assert.equal(lacuna.estado,'indisponivel');assert.equal(ultimo.centavos,0);assert.equal(ultimo.completo,true);assert.equal(ultimo.acumuladoCentavos,null);assert.equal(r.series.mensal[0].descontoPercentual,null);
});
test('empresa pendente afeta somente os pontos correspondentes e nunca entra nas séries',()=>{
 const r=run(base({ordens:[venda('1'),venda('sem',{empresaNome:null,data:'2026-10-12',valor:1000000}),venda('alheia',{empresaNome:'Outra empresa',data:'2026-10-13',valor:2000000})]}));
 assert.equal(r.series.diaria[11].centavos,null);assert.equal(r.series.diaria[11].completo,false);assert.equal(r.series.diaria[12].centavos,0);assert.equal(r.series.mensal[0].centavos,9000);assert.equal(r.series.mensal[0].acumuladoCentavos,null);
});
test('séries comparativas mantêm suas datas equivalentes e não prometem comparação com lacuna',()=>{
 const r=run(base({ordens:[venda('1'),venda('p',{data:'2026-09-05',valor:40,bruto:50,desconto:10}),venda('a',{data:'2025-10-06',valor:60,bruto:60,desconto:0})]}));
 assert.equal(r.comparacoes.anterior.series.diaria.length,17);assert.equal(r.comparacoes.anterior.series.diaria[0].de,'2026-09-01');assert.equal(r.comparacoes.anterior.series.diaria.at(-1).ate,'2026-09-17');assert.equal(r.comparacoes.anterior.series.mensal[0].centavos,4000);assert.equal(r.comparacoes.anterior.comparavel,true);assert.equal(r.comparacoes.anoAnterior.series.diaria[0].de,'2025-10-01');
 const parcial=run(base({cargaStatus:{janelas:{ordens:[{desde:'2026-10-01',ate:hoje,concluidaEm:hoje}]}}}));assert.equal(parcial.comparacoes.anterior.comparavel,false);assert.equal(parcial.comparacoes.anterior.series.diaria[0].centavos,null);
});
test('todos os anos não gera milhares de pontos diários e mantém meses/anos completos',()=>{
 const r=run(base({ordens:[venda('antiga',{data:'2018-01-05'}),venda('nova')]}),{modo:'todos'});
 assert.equal(r.series.diaria,null);assert.equal(r.series.diariaDisponivel,false);assert.equal(r.series.limiteDias,366);assert.match(r.series.motivoDiaria,/366/);assert.equal(r.series.anual.length,9);assert.equal(r.comparacoes.anterior.series,null);assert.equal(r.comparacoes.anterior.comparavel,false);
});
test('ano bissexto é diário dentro do limite e comparações não fabricam 29/02',()=>{
 const r=apurarDashboard(base({ordens:[],cargaStatus:{janelas:{ordens:[{desde:'2023-01-01',ate:'2024-12-31',concluidaEm:hoje}]}}}),{modo:'ano',ano:'2024'},'2024-12-31',sessao);
 assert.equal(r.series.diaria.length,366);assert.equal(r.comparacoes.anoAnterior.series.diaria.length,365);assert.equal(r.comparacoes.anoAnterior.series.diaria.some(p=>p.data==='2023-02-29'),false);
});
test('bruto e desconto não são inventados para filtro por produto nem bruto zero',()=>{
 const r=run(base(),{...filtro,produto:'p'});assert.equal(r.series.diaria[4].brutoCentavos,null);assert.equal(r.series.diaria[4].descontoPercentual,null);
 const z=run(base({ordens:[venda('zero',{valor:0,bruto:0,desconto:0})]}));assert.equal(z.series.diaria[4].descontoPercentual,null);
});
test('metas usam acumulado real dos participantes e nunca distribuem meta diária artificial',()=>{
 const r=run(base({ordens:[venda('1'),venda('2',{data:'2026-10-07'}),venda('fora',{vendedor:'Vendedora Beta',vendedorErpId:'2',valor:10000})]}));
 assert.equal(r.metas.serieAcumulada.metaCentavos,50000);assert.equal(r.metas.serieAcumulada.pontos.length,17);assert.equal(r.metas.serieAcumulada.pontos[4].acumuladoCentavos,9000);assert.equal(r.metas.serieAcumulada.pontos[6].acumuladoCentavos,18000);assert.equal(r.metas.serieAcumulada.pontos.at(-1).acumuladoCentavos,r.metas.realizado);assert.equal(r.metas.serieAcumulada.estado,'disponivel');assert.match(r.metas.serieAcumulada.criterio,/sem rateio diário/);
});
test('meta ausente/parcial não vira linha de zero ou meta integral falsa',()=>{
 for(const metas of [[],null]){const r=run(base({metas}));assert.equal(r.metas.serieAcumulada.metaCentavos,null);assert.notEqual(r.metas.serieAcumulada.estado,'disponivel');}
 const r=run(base(),{modo:'personalizado',de:'2026-10-02',ate:'2026-10-12'});assert.equal(r.metas.serieAcumulada.pontos.length,0);assert.equal(r.metas.serieAcumulada.metaCentavos,null);
 const sem=run(base({config:{participantesMetas:[]}}));assert.equal(sem.metas.serieAcumulada.pontos.length,0);assert.equal(sem.metas.serieAcumulada.estado,'sem_participantes');
});
test('data inválida mantém a incerteza em todos os pontos; bruto incompatível não vira desconto zero',()=>{
 const r=run(base({ordens:[venda('1',{bruto:105}),venda('invalida',{data:'não informada'})]}));
 assert.equal(r.series.diaria.every(p=>p.completo===false),true);assert.equal(r.series.diaria.every(p=>p.acumuladoCentavos===null),true);assert.equal(r.series.diaria[4].brutoCentavos,null);assert.equal(r.series.diaria[4].descontoCentavos,null);assert.equal(r.series.diaria[4].descontoPercentual,null);
});
test('séries e metas respeitam carteira e sinal continua separado de recebimento',()=>{
 const b=base({ordens:[venda('1',{sinalPago:25}),venda('2',{vendedor:'Vendedora Beta',vendedorErpId:'2',valor:90000,sinalPago:80000})]}),s={sub:'alfa',perms:['orcamentos']},r=run(b,filtro,s),detalhe=detalharDashboard(b,filtro,hoje,s);
 assert.equal(r.series.diaria[4].centavos,9000);assert.equal(r.metas.serieAcumulada.pontos.at(-1).acumuladoCentavos,9000);assert.equal(detalhe.vendas[0].sinalPagoCentavos,2500);assert.equal(JSON.stringify(r).includes('Vendedora Beta'),false);assert.equal(detalhe.vendas[0].recebidoCentavos,undefined);
 for(const [valor,esperado] of [[null,null],['',null],[-5,null],[0,0]])assert.equal(detalharDashboard(base({ordens:[venda('1',{sinalPago:valor})]}),filtro,hoje,sessao).vendas[0].sinalPagoCentavos,esperado);
});
