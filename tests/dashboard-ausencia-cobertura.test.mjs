import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {apurarDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
const saida=await build({stdin:{contents:`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server.browser';
 import {EvolucaoVendas} from './components/dashboard/GraficosVendas.jsx';
 import {MetasDashboard} from './components/dashboard/InteligenciaDashboard.jsx';
 export const grafico=dados=>renderToStaticMarkup(<EvolucaoVendas dados={dados} modo="mes" abrirPeriodo={()=>{}} abrirTodos={()=>{}}/>);
 export const meta=dados=>renderToStaticMarkup(<MetasDashboard dados={dados} onGerenciar={()=>{}}/>);
`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent',jsx:'automatic',mainFields:['module','main'],conditions:['browser','import','default'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
const ui=await import('data:text/javascript;base64,'+Buffer.from(saida.outputFiles[0].text).toString('base64'));
const hoje='2026-10-17',sessao={sub:'direcao',master:true};
const venda=(id,extra={})=>({id,numero:'900'+id,clienteId:'cliente-ficticio',cliente:'Cliente fictício',vendedor:'Vendedora Alfa',vendedorErpId:'1',empresaNome:'Impresilk',tipo:'Normal',data:'2026-10-05',valor:90,bruto:100,desconto:10,itens:[],...extra});
const base=(ordens,extra={})=>({catalogo:{completo:true,vendedores:[{id:'1',nome:'Vendedora Alfa'},{id:'2',nome:'Vendedora Beta'}],produtos:[]},config:{vinculos:{alfa:'1'},participantesMetas:['1']},ordens,recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2026-10-01',ate:hoje,concluidaEm:hoje}]}},metas:[{id:'1_2026-10',vendedorId:'1',mes:'2026-10',valor:500}],recebiveis:[],orcamentos:[],...extra});
const run=(b,s=sessao)=>apurarDashboard(b,{modo:'mes',mes:'2026-10'},hoje,s);

test('pedidos sem empresa não viram realizado zero da meta',()=>{
 const r=run(base([venda('pendente',{empresaNome:null})]));
 assert.equal(r.resumo.estado,'indisponivel');
 assert.equal(r.metas.realizado,null);
 assert.equal(r.metas.percentual,null);
 assert.match(ui.meta(r.metas),/Realizado dos mesmos participantes<\/span><strong>Não disponível<\/strong>/);
});

test('período indisponível não desenha zeros isolados como evolução de vendas',()=>{
 const r=run(base([venda('pendente',{empresaNome:null})]));
 // Dias efetivamente vazios mantêm sua semântica no contrato, inclusive para o histórico.
 assert.equal(r.series.diaria[0].centavos,0);
 assert.equal(r.series.diaria[4].centavos,null);
 const html=ui.grafico(r);
 assert.doesNotMatch(html,/class="chart-svg"/);
 assert.match(html,/indisponíveis neste período/);
});

test('zero com cobertura completa continua comprovado na meta e no gráfico',()=>{
 const r=run(base([]));
 assert.equal(r.resumo.completo,true);
 assert.equal(r.resumo.centavos,0);
 assert.equal(r.metas.realizado,0);
 assert.equal(r.metas.percentual,0);
 assert.equal(r.series.diaria.every(p=>p.centavos===0&&p.completo),true);
 assert.match(ui.grafico(r),/class="chart-svg"/);
 assert.match(ui.meta(r.metas),/Realizado dos mesmos participantes<\/span><strong>R\$.*0,00<\/strong>/);
});

test('cobertura parcial mantém valores observados, empresa e carteira autorizada',()=>{
 const b=base([venda('confirmada'),venda('pendente',{empresaNome:null,data:'2026-10-12'}),venda('alheia',{empresaNome:'Outra empresa',valor:90000}),venda('outra-carteira',{vendedor:'Vendedora Beta',vendedorErpId:'2',valor:80000})]);
 const r=run(b,{sub:'alfa',perms:['orcamentos']});
 assert.equal(r.resumo.estado,'parcial');
 assert.equal(r.resumo.centavos,9000);
 assert.equal(r.metas.realizado,9000);
 assert.equal(r.metas.percentual,null);
 assert.match(ui.grafico(r),/class="chart-svg"/);
 assert.equal(r.series.diaria[11].centavos,null);
});

test('meta sem vendas dos participantes não herda zero de outro vendedor quando falta cobertura',()=>{
 const r=run(base([venda('outra-carteira',{vendedor:'Vendedora Beta',vendedorErpId:'2'}),venda('pendente',{empresaNome:null})]));
 assert.equal(r.resumo.estado,'parcial');
 assert.equal(r.metas.realizado,null);
 assert.equal(r.metas.percentual,null);
});

test('venda confirmada de valor zero continua observada mesmo com cobertura parcial',()=>{
 const r=run(base([venda('zero',{valor:0,bruto:0,desconto:0}),venda('pendente',{empresaNome:null})]));
 assert.equal(r.resumo.estado,'parcial');
 assert.equal(r.metas.realizado,0);
 assert.equal(r.metas.percentual,null);
 assert.match(ui.grafico(r),/class="chart-svg"/);
});
