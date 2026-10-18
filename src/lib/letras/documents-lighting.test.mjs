import test from 'node:test';
import assert from 'node:assert/strict';
import {letterLightingReportHTML,letterReportHTML} from './documents.mjs';
import {createLetterProject} from './model.mjs';
import {calculateLetters} from './engine.mjs';
import {createLightLayout,calculateLightLayout} from './light-layout.mjs';
import {applyLedCatalog,LED_CATALOG} from './lighting-catalog.mjs';

const example=()=>({
 applicable:true,demonstration:false,
 config:{enabled:true,model:{name:'Módulo de teste',voltageV:12,powerW:.72,datasheet:'https://example.test/module.pdf',checkedAt:'2026-10-17'},supply:{name:'LPV-60-12',powerW:60,loadPercent:80,conditionsConfirmed:false},grid:{pitchXmm:35,pitchYmm:35,clearanceMm:3},wire:{name:'Corfio BWF 750 V',sectionMm2:1.5,resistanceOhmPerM:.0133,resistanceTemperatureC:20,maxCurrentA:null,extraPercent:10,maxDropPercent:3}},
 totals:{moduleCount:50,powerW:36,currentA:3,sourceCount:1,circuitCount:2,installedPowerW:60,usablePowerW:48,availablePowerW:12,minimumSourcesByPower:1,feedCableM:2,interconnectCableM:3,nominalCableM:5,extraCableM:.5,cableM:5.5,conductorM:11},
 sources:[{id:'F1',name:'LPV-60-12',nominalPowerW:60,ratedCurrentA:5,usablePowerW:48,powerW:36,usedPercent:60,availableW:12,physicalOutputs:1,distributionMode:'external',branchCount:2,circuitIds:['C1','C2']}],
 circuits:[{id:'C1',sourceId:'F1',branch:1,output:1,moduleCount:30,powerW:21.6,currentA:1.8,cableM:3,dropV:.08,dropPercent:.667},{id:'C2',sourceId:'F1',branch:2,output:1,moduleCount:20,powerW:14.4,currentA:1.2,cableM:2,dropV:null,dropPercent:null}],
 wires:[{id:'C1-W1',kind:'feed',circuitId:'C1',from:'F1',to:'LED1',oneWayM:2,conductorM:4,currentA:1.8,dropV:.04}],perLetter:[{label:'Exemplo fictício',count:50}],
});

test('caderno distingue potência nominal, carga, folga e ramais de uma saída física',()=>{
 const html=letterLightingReportHTML(example());
 assert.match(html,/50 módulos × 0\.72 W = 36 W/);
 assert.match(html,/<td>F1 · LPV-60-12<\/td><td>60<\/td><td>5<\/td><td>48<\/td><td>36<\/td><td>60<\/td><td>12<\/td><td>2<\/td>/);
 assert.match(html,/<td>F1<\/td><td>1<\/td><td>Ramais externos após a saída<\/td><td>C1, C2<\/td>/);
 assert.match(html,/<td>C2<\/td><td>F1<\/td><td>2<\/td><td>1<\/td><td>20<\/td>/);
 assert.match(html,/critério definido neste projeto/);
});

test('caderno mantém reserva e soma de dois condutores separadas do percurso e não inventa corrente admissível',()=>{
 const html=letterLightingReportHTML(example());
 assert.match(html,/<td>2<\/td><td>3<\/td><td>5<\/td><td>0\.5<\/td><td>5\.5<\/td><td>11<\/td>/);
 assert.match(html,/<td>1\.5<\/td><td>0\.0133<\/td><td>20<\/td><td>Não informado<\/td><td>3<\/td>/);
 assert.match(html,/não desconta chicotes/);
 assert.match(html,/Rede AC, proteção, terminais, emendas/);
 assert.match(html,/sem somar potência interligando positivos ou negativos/);
});

test('fichas e nomes de catálogo são texto escapado, nunca links executáveis',()=>{
 const layout=example();layout.config.model.name='<script>alert(1)</script>';layout.config.model.datasheet='javascript:alert(1) <img src=x onerror=alert(1)>';
 const html=letterLightingReportHTML(layout);
 assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<img'),false);assert.equal(html.includes('href='),false);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.match(html,/2026-10-17/);
});

test('dados ausentes continuam pendentes no relatório e iluminação desativada não gera quantitativos',()=>{
 const layout=example();layout.sources[0].nominalPowerW=null;layout.totals.feedCableM=null;
 const html=letterLightingReportHTML(layout);assert.match(html,/<td>F1 · LPV-60-12<\/td><td>Não informado<\/td>/);assert.match(html,/<td>Não informado<\/td><td>3<\/td><td>5<\/td>/);
 layout.config.enabled=false;assert.match(letterLightingReportHTML(layout),/desativada/);assert.doesNotMatch(letterLightingReportHTML(layout),/36 W/);
});

test('caderno integrado obtém quantidade e circuitos da revisão calculada',()=>{
 const p=createLetterProject({id:'teste-documento-led',name:'Exemplo fictício',text:{value:'OB',heightMm:200},construction:{family:'galvanized-acrylic'},lighting:createLightLayout()});
 const geometry=calculateLetters(p),layout=calculateLightLayout(p,geometry),html=letterReportHTML(p,geometry,null);
 assert.match(html,new RegExp(`${layout.totals.moduleCount} módulos ×`));
 for(const circuit of layout.circuits)assert.ok(html.includes(`<td>${circuit.id}</td>`));
 assert.match(html,/ESTUDO PARA CONFERÊNCIA/);
});

test('variante do catálogo aparece com fabricante, SKU, CCT e IP no caderno',()=>{
 const layout=example(),record=LED_CATALOG[0];layout.config.model=applyLedCatalog(createLightLayout(),record.id).model;
 const html=letterLightingReportHTML(layout);
 for(const field of [record.manufacturer,record.sku,record.cctK,record.ip])assert.ok(html.includes(`<td>${field}</td>`));
 assert.match(html,/Valores correspondem à referência de catálogo consultada; instalação não aprovada/);
});

test('editar metadados de variante conserva os dados do projeto sem confirmar correspondência de catálogo',()=>{
 const layout=example(),record=LED_CATALOG[0];layout.config.model=applyLedCatalog(createLightLayout(),record.id).model;
 layout.config.model.sku='CODIGO-EDITADO';layout.config.model.cctK=3000;layout.config.model.ip='IP a conferir';
 const html=letterLightingReportHTML(layout);
 assert.match(html,/CODIGO-EDITADO/);assert.match(html,/<td>3000<\/td>/);assert.match(html,/Referência de catálogo alterada ou indisponível/);
 assert.doesNotMatch(html,/Valores correspondem à referência de catálogo consultada/);
});
