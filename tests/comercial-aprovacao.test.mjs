import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normOS} from '../scripts/lib/mubi-cache.mjs';
import {apurarComercial} from '../supabase/functions/_shared/comercial.mjs';
import {apurarDashboard,detalharDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';
const hoje='2026-10-25',periodo={de:'2026-10-01',ate:'2026-10-31'};
const os=(id,data,dataAprovacao,valor,tipo='Normal')=>({id,numero:id,data,dataAprovacao,valor,valorBruto:valor,desconto:0,tipo,clienteId:'c1',cliente:'Cliente fictício',vendedor:'Vendedora exemplo',empresaNome:'Impresilk',valorConfirmado:true,itens:[]});
const ordens=[os('antiga','2024-03-04','2026-10-02',100),os('nova','2026-10-03','2026-10-04',200),os('anterior','2026-09-01','2026-09-30',90),os('depois','2026-10-10','2026-11-01',70),os('retrabalho','2026-08-01','2026-10-05',25,'Retrabalho'),os('sem-data','2026-10-02',null,1000),{...os('cancelada','2026-10-02','2026-10-03',800),cancelada:true}];
const cobertura={desde:'2024-01-01',ate:hoje};
const base={criterioVendas:'aprovacao',ordens,clientes:[],orcamentos:[],acoes:[],cobertura,config:{}};
const dashboard={...base,catalogo:{completo:true,vendedores:[{id:'v1',nome:'Vendedora exemplo'}],produtos:[]},cargaStatus:{janelas:{ordens_aprovacao:[{desde:'2024-01-01',ate:hoje,concluidaEm:hoje}]}}};
test('normalização preserva aprovação sem substituir cadastro nem inventar aprovação ausente',()=>{
 const n=normOS({id:'x',data_cadastro:'2024-03-04',data_aprovacao:'2026-10-02 09:00:00',valor_total:'100',valor_desconto:'10'},0,new Map());
 assert.equal(n.data,'2024-03-04');assert.equal(n.dataAprovacao,'2026-10-02');assert.equal(n.valor,90);
 assert.equal(normOS({id:'sem',data_cadastro:hoje,data_aprovacao:null},0,new Map()).dataAprovacao,null);
});
test('Meu dia conta aprovação no mês, mesmo com cadastro antigo, e separa retrabalho',()=>{
 const r=apurarComercial(base,periodo,hoje);
 assert.deepEqual(r.vendas.map(o=>o.id),['antiga','nova']);assert.equal(r.valor,30000);assert.equal(r.pedidos,2);
 assert.equal(r.vendas[0].data,'2026-10-02');assert.equal(r.vendas[0].dataCadastro,'2024-03-04');
 assert.equal(r.retrabalhos.valor,2500);assert.equal(r.retrabalhos.pedidos,1);assert.equal(r.totalOS.valor,32500);assert.equal(r.totalOS.pedidos,3);
 assert.equal(r.completo,true);assert.equal(ordens[0].data,'2024-03-04');
});
test('Dashboard e detalhamento usam a mesma aprovação e cobertura específica',()=>{
 const r=apurarDashboard(dashboard,{modo:'mes',mes:'2026-10'},hoje,{master:true});
 assert.equal(r.resumo.centavos,30000);assert.equal(r.resumo.pedidos,2);assert.equal(r.resumo.completo,true);
 const d=detalharDashboard(dashboard,{modo:'mes',mes:'2026-10'},hoje,{master:true},{});
 assert.deepEqual(d.vendas.map(o=>o.id).sort(),['antiga','nova']);
 const semCobertura=apurarDashboard({...dashboard,cargaStatus:{janelas:{ordens:[{desde:'2024-01-01',ate:hoje,concluidaEm:hoje}]}}},{modo:'mes',mes:'2026-10'},hoje,{master:true});
 assert.equal(semCobertura.resumo.completo,false);
});
test('comparação usa aprovação do mês anterior e falta de cobertura não vira zero certificado',()=>{
 const r=apurarComercial(base,periodo,hoje);assert.equal(r.comparativo.valorAnterior,0);
 const completo=apurarComercial(base,{de:'2026-09-01',ate:'2026-09-30'},hoje);assert.equal(completo.valor,9000);
 const parcial=apurarComercial({...base,ordens:[],cobertura:{}},periodo,hoje);assert.equal(parcial.completo,false);assert.equal(parcial.valor,null);
});
