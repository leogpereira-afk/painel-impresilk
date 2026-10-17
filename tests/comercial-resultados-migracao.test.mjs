import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtroConsultaPedido,conciliarPedidoResultado,metasNoPeriodo} from '../src/lib/calc/resultados-comerciais.mjs';
import {consultarApoioComercial} from '../supabase/functions/_shared/comercial-apoio.mjs';

const venda={id:'pedido-a',numero:'9001',data:'2022-02-15',centavos:1000,totalOS:10000,cliente:'Cliente Exemplo'};
const resposta=()=>({pedido:{...venda,valor:100,sinalPago:20,empresaNome:'Impresilk',itens:[]},financeiro:{temPagos:true,desdeDados:'2020-01-01',consultadas:['9001'],abertos:[{id:'t1',os:'9001',valor:80,pago:20}],pagos:[],permutaDaOS:{}},consultadoEm:'2026-10-17T12:00:00Z'});

test('pedido antigo consulta por sua própria data sem alterar seleção do gráfico',()=>{
 const filtro={modo:'todos',vendedor:'v1',produto:'p1',campanha:'c1'};
 assert.deepEqual(filtroConsultaPedido(venda,filtro),{de:'2022-02-15',ate:'2022-02-15',vendedor:'v1',equipe:''});
 assert.equal(filtro.produto,'p1');assert.equal(filtro.modo,'todos');
});
test('consulta de pedido anterior a2020 adapta só janela legada, preservando data original',()=>{const p={...venda,data:'2018-02-10'};assert.equal(filtroConsultaPedido(p).de,'2020-01-01');assert.equal(p.data,'2018-02-10');});
test('recorte de produto mantém financeiro da O.S. inteira e conciliação original',()=>{
 const r=conciliarPedidoResultado(venda,resposta(),'2026-10-17');
 assert.deepEqual(r.financeiro,{recebido:20,saldo:80});
 assert.equal(venda.centavos,1000);assert.equal(r.pedido.valor,100);
});
test('financeiro só associa identidade exata; número igual em outra O.S. não autoriza mistura',()=>{
 const outra=resposta();outra.pedido.id='pedido-b';assert.throws(()=>conciliarPedidoResultado(venda,outra,'2026-10-17'),/outro pedido/);
 const trocada=resposta();trocada.pedido.numero='9002';assert.throws(()=>conciliarPedidoResultado(venda,trocada,'2026-10-17'),/outro pedido/);
 const empresa=resposta();empresa.pedido.empresaNome='Outra Empresa';assert.throws(()=>conciliarPedidoResultado(venda,empresa,'2026-10-17'),/empresa divergiu/);
});
test('fonte financeira ausente mantém saldo e recebido indisponíveis',()=>{
 const r=resposta();r.financeiro={estado:'indisponivel',temPagos:false};assert.equal(conciliarPedidoResultado(venda,r,'2026-10-17').financeiro,null);
});
test('metas históricas respeitam período e ordenação sem transformar valor ausente em zero',()=>{
 const metas=[{id:'1',mes:'2024-01',vendedorId:'v1',valor:1},{id:'2',mes:'2025-02',vendedorId:'v1',valor:null},{id:'3',mes:'2025-03',vendedorId:'v2',valor:0}];
 assert.deepEqual(metasNoPeriodo(metas,{de:'2025-01-01',ate:'2025-12-31'}).map(m=>[m.id,m.valor]),[['3',0],['2',null]]);
 assert.deepEqual(metasNoPeriodo(metas,{}),[]);
});
function fixture(){
 const queries=[],cache=[{chave:'comercial_catalogo',valor:{completo:true,vendedores:[{id:'v1',nome:'Ana Exemplo'},{id:'v2',nome:'Bia Exemplo'}],produtos:[{id:'p1',nome:'Produto Exemplo'}]},atualizado_em:'2026-10-17T12:00:00Z'}];
 const registros=[{colecao:'comercial_config',id:'regras',registro:{vinculos:{ana:'v1',bia:'v2'},equipes:[{id:'e1',vendedores:['v1','v2']}],fichasProdutos:{},calendario:{configurado:true}}},...['comercial_acoes','comercial_metas'].flatMap(colecao=>['v1','v2'].map(vendedorId=>({colecao,id:colecao+vendedorId,registro:{vendedorId,nota:vendedorId==='v1'?'Anotação da Ana':'Privado da Bia'}})))];
 let fail=false;
 const sb={from(table){queries.push(table);assert.ok(['painel_cache','painel_registros'].includes(table),'Não carregar histórico de ordens');let rows=table==='painel_cache'?cache:registros;
  const field=(x,k)=>k==='registro->>vendedorId'?x.registro?.vendedorId:x[k];
  const q={select(){return q;},eq(k,v){rows=rows.filter(x=>field(x,k)===v);return q;},in(k,v){rows=rows.filter(x=>v.includes(field(x,k)));return q;},order(){return q;},maybeSingle(){return Promise.resolve(fail?{error:{}}:{data:structuredClone(rows[0]||null)});},range(a,b){return Promise.resolve(fail?{error:{}}:{data:structuredClone(rows.slice(a,b+1))});}};return q;}};
 return {sb,queries,cache,fail:()=>{fail=true;}};
}
test('apoio carrega só cadastros da carteira e não usa vendas nem financeiro',async()=>{
 const t=fixture(),r=await consultarApoioComercial(t.sb,{sub:'ana',perms:['orcamentos']});
 assert.deepEqual(r.catalogo.vendedores.map(v=>v.id),['v1']);
 assert.equal(r.base.acoes.length,1);assert.equal(r.metas.length,1);
 assert.equal(JSON.stringify(r).includes('Privado da Bia'),false);
 assert.equal(r.config.vinculos,undefined);assert.equal(r.config.equipes,undefined);
 assert.equal(r.relatorio,undefined);assert.equal(r.financeiro,undefined);
 assert.deepEqual(r.base.clientes,[]);assert.deepEqual(r.base.orcamentos,[]);
});
test('apoio rejeita seleção de carteira alheia e falta de permissão',async()=>{
 const t=fixture();await assert.rejects(consultarApoioComercial(t.sb,{sub:'ana',perms:['orcamentos']},{vendedor:'v2'}),e=>e.status===403);
 await assert.rejects(consultarApoioComercial(t.sb,{sub:'ana',perms:[]}),e=>e.status===403);
});
test('gestão mantém regras completas, mas filtro de vendedor limita metas e ações',async()=>{
 const t=fixture(),r=await consultarApoioComercial(t.sb,{sub:'direcao',master:true},{vendedor:'v1'});
 assert.deepEqual(r.config.vinculos,{ana:'v1',bia:'v2'});assert.equal(r.metas.length,1);assert.equal(r.base.acoes.length,1);assert.equal(r.catalogo.vendedores.length,2);
});
test('falha da fonte e catálogo incompleto não viram cadastros vazios confirmados',async()=>{
 const t=fixture();t.fail();await assert.rejects(consultarApoioComercial(t.sb,{master:true}),e=>e.status===503);
 const i=fixture();i.cache[0].valor.completo=false;await assert.rejects(consultarApoioComercial(i.sb,{master:true}),e=>e.status===503);
});
