import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apurarDashboard,detalharDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';
import {conciliarPedidoResultado} from '../src/lib/calc/resultados-comerciais.mjs';
const empresa='Impresilk C. V. Ltda',hoje='2026-10-17',filtro={modo:'mes',mes:'2026-10'},sessao={master:true};
const pedido=(id,nome=empresa)=>({id,numero:'900'+id,clienteId:'exemplo',cliente:'Cliente fictício',vendedor:'Vendedora Exemplo',tipo:'Normal',empresaNome:nome,data:'2026-10-05',valor:90,bruto:100,desconto:10,itens:[]});
const base={catalogo:{completo:true,vendedores:[{id:'v1',nome:'Vendedora Exemplo'}],produtos:[]},config:{},ordens:[pedido('1'),pedido('2','Universo C. V Ltda'),pedido('3','Impresilk C. V. Ltda Filial Externa')],recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2026-10-01',ate:hoje,concluidaEm:hoje}]}},orcamentos:[],recebiveis:[],metas:[]};
test('denominação abreviada do ERP entra no Dashboard, outras empresas continuam excluídas',()=>{
 const r=apurarDashboard(base,filtro,hoje,sessao);
 assert.equal(r.resumo.pedidos,1);assert.equal(r.resumo.centavos,9000);
 assert.equal(r.resumo.completo,true);assert.equal(r.cobertura.empresa.divergenciasExcluidas,2);
 assert.deepEqual(detalharDashboard(base,filtro,hoje,sessao,{}).vendas.map(v=>v.id),['1']);
});
test('consulta financeira aceita a mesma denominação exata e rejeita empresas divergentes',()=>{
 const v=pedido('1');assert.doesNotThrow(()=>conciliarPedidoResultado(v,{pedido:v},hoje));
 for(const nome of ['Universo C. V Ltda','Impresilk C. V. Ltda Filial Externa'])assert.throws(()=>conciliarPedidoResultado(v,{pedido:{...v,empresaNome:nome}},hoje),/origem da empresa divergiu/);
});
