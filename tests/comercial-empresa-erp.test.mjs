import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apurarDashboard,detalharDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';
import {conciliarPedidoResultado} from '../src/lib/calc/resultados-comerciais.mjs';
const empresa='Impresilk C. V. Ltda',hoje='2026-10-17',filtro={modo:'mes',mes:'2026-10'},sessao={master:true};
const pedido=(id,nome=empresa)=>({id,numero:'900'+id,clienteId:'exemplo',cliente:'Cliente fictício',vendedor:'Vendedora Exemplo',tipo:'Normal',empresaNome:nome,data:'2026-10-05',valor:90,bruto:100,desconto:10,itens:[]});
const base={catalogo:{completo:true,vendedores:[{id:'v1',nome:'Vendedora Exemplo'}],produtos:[]},config:{},ordens:[pedido('1'),pedido('2','Universo C. V Ltda'),pedido('3','Impresilk C. V. Ltda Filial Externa')],recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2026-10-01',ate:hoje,concluidaEm:hoje}]}},orcamentos:[],recebiveis:[],metas:[]};
test('Impresilk e Universo consolidam vendas, outras empresas continuam excluídas',()=>{
 const r=apurarDashboard(base,filtro,hoje,sessao);
 assert.equal(r.resumo.pedidos,2);assert.equal(r.resumo.centavos,18000);
 assert.equal(r.resumo.completo,true);assert.equal(r.cobertura.empresa.divergenciasExcluidas,1);
 assert.deepEqual(detalharDashboard(base,filtro,hoje,sessao,{}).vendas.map(v=>v.id).sort(),['1','2']);
});
test('consulta financeira aceita a mesma denominação exata e rejeita empresas divergentes',()=>{
 const v=pedido('1');assert.doesNotThrow(()=>conciliarPedidoResultado(v,{pedido:v},hoje));
 assert.doesNotThrow(()=>conciliarPedidoResultado(v,{pedido:{...v,empresaNome:'Universo C. V Ltda'}},hoje));
 for(const nome of ['Universo Outra Empresa','Impresilk C. V. Ltda Filial Externa'])assert.throws(()=>conciliarPedidoResultado(v,{pedido:{...v,empresaNome:nome}},hoje),/origem da empresa divergiu/);
});

test('consolidado respeita carteira do vendedor e mantém origem ausente pendente',()=>{
 const b={...base,config:{vinculos:{alfa:'v1'}},catalogo:{...base.catalogo,vendedores:[...base.catalogo.vendedores,{id:'v2',nome:'Vendedora Beta'}]},ordens:[...base.ordens,{...pedido('4','Universo C. V Ltda'),vendedor:'Vendedora Beta'},pedido('5',null)]};
 const r=apurarDashboard(b,filtro,hoje,{sub:'alfa',perms:['orcamentos']});
 assert.equal(r.resumo.centavos,18000);assert.equal(r.resumo.pedidos,2);assert.equal(r.resumo.empresaNaoIdentificadaPedidos,1);assert.equal(r.resumo.completo,false);
 assert.deepEqual(detalharDashboard(b,filtro,hoje,{sub:'alfa',perms:['orcamentos']},{}).vendas.map(v=>v.id).sort(),['1','2']);
});
test('séries, rankings e funil usam o consolidado autorizado',()=>{
 const orcamentos=['Impresilk C. V. Ltda','Universo C. V Ltda','Empresa Externa'].map((empresaNome,i)=>({id:'p'+i,empresaNome,dataCadastro:'2026-10-05',situacao:'aberto',vendedor:'Vendedora Exemplo'}));
 const r=apurarDashboard({...base,orcamentos},filtro,hoje,sessao);
 assert.equal(r.series.mensal[0].centavos,18000);assert.equal(r.rankings.clientes[0].centavos,18000);assert.equal(r.inteligencia.funil.total,2);
 assert.match(r.cobertura.empresa.mensagem,/Impresilk e Universo/);
});
