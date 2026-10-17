import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseDashboardDemo,respostaDashboardDemo} from '../src/review/dashboard.mjs';
import {apurarDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';
import {respostaComercial} from '../src/review/comercial.mjs';

const hoje='2026-10-17',sessao={sub:'demo',master:true},filtro={modo:'mes',mes:'2026-10'};
const call=async(body={},s=sessao)=>{const response=respostaDashboardDemo({action:'dashboard',filtro,...body},s,hoje);return {status:response.status,body:await response.json()};};
const somar=xs=>xs.reduce((s,x)=>s+x.centavos,0);

test('prévia usa o motor real e dados determinísticos; rankings e séries reconciliam cada centavo',async()=>{
 const base=baseDashboardDemo(hoje),{status,body:r}=await call();
 assert.equal(status,200);
 assert.deepEqual(base,baseDashboardDemo(hoje));
 assert.deepEqual(r,apurarDashboard(base,filtro,hoje,sessao,{consultadoEm:hoje+'T09:00:00Z'}));
 assert.equal(r.resumo.centavos,18826300);
 assert.equal(r.resumo.pedidos,12);
 assert.equal(r.resumo.completo,true);
 for(const dim of ['produtos','clientes','vendedores'])assert.equal(somar(r.rankings[dim]),r.resumo.centavos);
 assert.equal(somar(r.series.mensal),r.resumo.centavos);
 assert.equal(somar(r.series.anual),r.resumo.centavos);
 assert.equal(r.comparacoes.anterior.completo,true);
 assert.equal(r.comparacoes.anoAnterior.completo,true);
 assert.equal(r.metas.valor,24000000);
 assert.equal(r.metas.realizado,r.resumo.centavos);
 assert.equal(r.metas.cobertura.completa,true);
 assert.equal(r.financeiro.estado,'disponivel');
 assert.equal(somar(r.financeiro.faixas),r.financeiro.vencidoCentavos);
 assert.equal(r.financeiro.titulos,6);
 assert.equal(r.financeiro.titulosVencidos,4);
});

test('três anos de prévia distinguem empresa externa e origem desconhecida de venda Impresilk',async()=>{
 const {body:r}=await call({filtro:{modo:'todos'}});
 assert.equal(r.series.anual.length,3);
 assert.equal(r.series.mensal.length,34);
 assert.equal(r.resumo.pedidos,408);
 assert.equal(r.resumo.centavos,468534544);
 assert.equal(somar(r.series.anual),r.resumo.centavos);
 assert.equal(somar(r.series.mensal),r.resumo.centavos);
 assert.equal(r.cobertura.empresa.divergenciasExcluidas,1);
 assert.equal(r.resumo.empresaNaoIdentificadaPedidos,1);
 assert.equal(r.resumo.empresaNaoIdentificadaCentavos,42000);
 assert.equal(r.resumo.completo,false);
 const vendas=[];
 for(let pagina=1;pagina<=9;pagina++){
  const {status,body:d}=await call({action:'dashboardDetalhe',filtro:{modo:'todos'},pagina,tamanho:50});
  assert.equal(status,200);vendas.push(...d.vendas);
 }
 assert.equal(somar(vendas),r.resumo.centavos);
 assert.equal(new Set(vendas.map(v=>v.id)).size,408);
 assert.ok(vendas.every(v=>v.id!=='demo-outra-empresa'&&v.id!=='demo-sem-empresa'));
});

test('drilldown de produto paginado reconcilia ranking de todos os anos',async()=>{
 const {body:r}=await call({filtro:{modo:'todos'}}),produto=r.rankings.produtos[0],vendas=[];
 let pagina=1,temMais=true;
 while(temMais){const {status,body:d}=await call({action:'dashboardDetalhe',filtro:{modo:'todos'},dimensao:'produto',id:produto.id,pagina,tamanho:25});assert.equal(status,200);vendas.push(...d.vendas);temMais=d.paginacao.temMais;pagina++;}
 assert.equal(somar(vendas),produto.centavos);
 assert.equal(vendas.length,produto.pedidos);
});

test('prévia aplica carteira e permissões de Comercial, Campanhas e financeiro',async()=>{
 const ana={sub:'ana-exemplo',perms:['orcamentos']},{status,body:r}=await call({},ana);
 assert.equal(status,200);
 assert.equal(r.resumo.pedidos,6);
 assert.equal(r.rankings.vendedores.length,1);
 assert.equal(r.rankings.vendedores[0].id,'101');
 assert.equal(JSON.stringify(r).includes('Beatriz Exemplo'),false);
 assert.equal(r.financeiro.estado,'sem_permissao');
 assert.deepEqual(r.catalogo.campanhas,[]);
 assert.equal((await call({filtro:{...filtro,vendedor:'102'}},ana)).status,403);
 assert.equal((await call({filtro:{...filtro,campanha:'campanha-demo'}},ana)).status,403);
 assert.equal((await call({}, {sub:'bloqueado',perms:[]})).status,403);
 const {body:detalhe}=await call({action:'dashboardDetalhe',dimensao:'vendedor',id:'102'},ana);
 assert.deepEqual(detalhe.vendas,[]);
});

test('hook review encaminha dashboard e mantém as actions anteriores',async()=>{
 const r=await respostaComercial({action:'dashboard',filtro:{modo:'mes'}},sessao).json();
 assert.equal(r.versao,2);assert.equal(r.catalogo.produtos.length,10);assert.ok(r.series.diaria.length>0);assert.equal(r.series.diaria.at(-1).ate,r.periodo.ateEfetivo);
 const antigo=await respostaComercial({action:'contextoRelacionamento',clienteId:'c1'},sessao).json();
 assert.equal(antigo.cliente.id,'c1');assert.ok(Array.isArray(antigo.timelineContatos));
});
