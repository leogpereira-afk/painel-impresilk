import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const saida=await build({stdin:{contents:`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server.browser';
 import {MatrizHistorica,montarMatrizHistorica} from './components/dashboard/SerieDashboard.jsx';
 export {montarMatrizHistorica};
 export const renderizar=linhas=>renderToStaticMarkup(<MatrizHistorica linhas={linhas} abrir={()=>{}}/>);
`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent',jsx:'automatic',mainFields:['module','main'],conditions:['browser','import','default'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
const {montarMatrizHistorica,renderizar}=await import('data:text/javascript;base64,'+Buffer.from(saida.outputFiles[0].text).toString('base64'));

test('histórico separa zero confirmado, valor parcial e ausência sem inventar total anual',()=>{
 const anos=montarMatrizHistorica([{mes:'2026-01',centavos:0,completo:true},{mes:'2026-02',centavos:null,completo:false},{mes:'2026-03',centavos:12500,completo:false},{mes:'2025-01',centavos:null},{mes:'2026-13',centavos:999999}]);
 assert.equal(anos.length,2);
 assert.equal(anos[0].ano,'2026');
 assert.equal(anos[0].meses.length,12);
 assert.equal(anos[0].meses[0].centavos,0);
 assert.equal(anos[0].meses[1].centavos,null);
 assert.equal(anos[0].meses[2].completo,false);
 assert.equal(anos[0].meses[3].centavos,null);
 assert.equal(anos[0].total,12500);
 assert.equal(anos[1].total,null);
});

test('mapa de calor abre somente meses com valores e expõe cobertura para leitor de tela',()=>{
 const html=renderizar([{mes:'2026-01',centavos:0,completo:true},{mes:'2026-02',centavos:null,completo:false},{mes:'2026-03',centavos:12500,completo:false}]);
 const celulas=[...html.matchAll(/<button[^>]*class="chart-heatmap-cell"[^>]*>/g)].map(m=>m[0]);
 assert.equal(celulas.length,12);
 assert.equal(celulas.filter(c=>!c.includes('disabled=""')).length,2);
 assert.match(celulas[0],/data-nivel="0"/);
 assert.match(celulas[0],/R\$.*0,00.*abrir pedidos/);
 assert.match(celulas[1],/sem informação disponível/);
 assert.match(celulas[2],/cobertura parcial/);
 assert.match(html,/Ampliar Histórico mês a mês/);
 assert.match(html,/Visualização de Histórico mês a mês/);
 assert.match(html,/Zero confirmado/);
});

test('histórico vazio é indisponível e não desenha doze meses zerados',()=>{
 const html=renderizar([]);
 assert.match(html,/Histórico indisponível/);
 assert.doesNotMatch(html,/chart-heatmap-cell/);
});
