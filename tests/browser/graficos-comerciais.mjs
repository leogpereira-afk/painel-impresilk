// UI real, somente fixture local: nenhuma chamada ou alteração externa.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {respostaDashboardDemo} from '../../src/review/dashboard.mjs';
import {moeda} from '../../src/components/dashboard/formatos.js';
const {chromium}=await import(process.env.NAV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NAV_BASE_URL||'http://127.0.0.1:4281',origin=new URL(base).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const saida='/tmp/central-comercial-graficos-v2';await mkdir(saida,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.NAV_CHROME_EXECUTABLE?{executablePath:process.env.NAV_CHROME_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
page.setDefaultTimeout(10000);
await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
const erros=[],falhas=[],aprovados=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),mes=hoje.slice(0,7),ano=hoje.slice(0,4);
const dashboard=()=>page.locator('.commercial-dashboard').first();
const pronto=()=>page.locator('.commercial-dashboard[aria-busy="false"]').first().waitFor();
let cenario=0;
const go=async query=>{await page.goto(`${base}/revisao-local.html?cenario=${++cenario}#/comercial/dashboard${query?'?'+query:''}`,{waitUntil:'networkidle'});await pronto();};
const grafico=nome=>dashboard().locator('.analytic-chart').filter({has:page.getByRole('heading',{name:nome,exact:true})});
const semOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
const reais=v=>Math.round(Number(v.replace(/[^\d,-]/g,'').replace(',','.'))*100);
const testar=async(nome,fn)=>{try{await fn();aprovados.push(nome);console.log('OK:',nome);}catch(e){falhas.push({nome,erro:e.message});console.log('FALHOU:',nome,e.message);await page.screenshot({path:`${saida}/falha-${falhas.length}.png`});}};
try {
 await testar('gráficos visíveis na primeira tela, tabela e controles temporais',async()=>{
  await go('');
  const g=grafico('Evolução das vendas');await g.locator('svg.chart-svg').waitFor();
  assert.ok((await g.locator('svg.chart-svg').boundingBox()).y<900,'gráfico deve aparecer sem percorrer cards de texto');
  assert.equal(await dashboard().locator('.analytic-chart').count(),3);
  for(const nome of ['Dia','Mês','Ano']){await g.getByRole('button',{name:nome,exact:true}).click();assert.ok(await g.locator('.chart-mark').count()>0);}
  await g.getByRole('button',{name:'Tabela',exact:true}).click();
  const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'mes',mes}}).json();
  assert.equal(reais(await g.locator('tbody tr td').first().innerText()),esperado.resumo.centavos);
  await g.getByRole('button',{name:'Gráfico',exact:true}).click();
  await g.getByRole('button',{name:'Dia',exact:true}).click();
  await semOverflow();await page.screenshot({path:`${saida}/panorama.png`,fullPage:false});
 });
 await testar('duas séries comparadas continuam acessíveis por teclado',async()=>{
  const g=grafico('Evolução das vendas');
  await g.getByLabel('Comparação da evolução').selectOption('anoAnterior');
  const pontos=g.locator('.chart-mark[tabindex="0"]');assert.equal(await pontos.count(),2);
  await pontos.first().focus();await page.keyboard.press('End');
  assert.equal(await g.locator('.chart-mark[tabindex="0"]').count(),2,'selecionar atual não retira série anterior da navegação');
  await page.keyboard.press('Tab');
  assert.match(await page.locator(':focus').getAttribute('aria-label'),/Ano anterior/);
  await page.keyboard.press('ArrowRight');
  assert.match(await g.locator('.chart-inspector').innerText(),/Ano anterior/);
  assert.equal(await g.locator('.chart-inspector button').count(),0,'referência comparativa não abre pedidos do período atual');
  await g.getByRole('button',{name:'Ampliar Evolução das vendas'}).click();
  const modal=page.getByRole('dialog',{name:'Evolução das vendas'});await modal.waitFor();
  assert.ok((await modal.boundingBox()).width>1000);
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  assert.equal(await g.getByRole('button',{name:'Ampliar Evolução das vendas'}).evaluate(e=>e===document.activeElement),true);
 });
 await testar('pontos de vendas e descontos conservam a data sem filtro de vendedor inventado',async()=>{
  for(const analise of ['resumo','descontos']) {
   await go(`analise=${analise}`);const g=grafico(analise==='resumo'?'Evolução das vendas':'Descontos nas vendas');
   await g.locator('.chart-mark').first().click();await g.locator('.chart-inspector').getByRole('button',{name:'Ver registros'}).click();
   const dialog=page.getByRole('dialog');await dialog.locator('tbody tr').first().waitFor();
   const esperado=await respostaDashboardDemo({action:'dashboardDetalhe',filtro:{modo:'personalizado',de:mes+'-01',ate:mes+'-01'}}).json();
   assert.equal(await dialog.locator('tbody tr').count(),esperado.vendas.length);
   const datas=await dialog.locator('tbody tr td:nth-child(2)').allTextContents();assert.ok(datas.every(v=>v===`01/${mes.slice(5)}/${ano}`));
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  }
 });
 await testar('rota antiga conserva equipe e comparações por dias úteis e meses fechados',async()=>{
  await page.goto(`${base}/revisao-local.html#/comercial?aba=vendas&de=${mes}-01&ate=${hoje}&equipe=com2`,{waitUntil:'networkidle'});await pronto();
  const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'personalizado',de:mes+'-01',ate:hoje,equipe:'com2'}}).json();
  assert.equal(await dashboard().locator('.dash-kpi').first().locator('strong').innerText(),moeda(esperado.resumo.centavos));
  assert.ok(page.url().includes('equipe=com2'));await page.getByRole('button',{name:'Remover filtro Equipe',exact:true}).waitFor();
  await dashboard().locator('.res-order').first().waitFor();const linhas=await dashboard().locator('.res-order-client').allTextContents();assert.ok(linhas.every(v=>v.includes('Ana Exemplo')));
  await go('analise=vendas');
  await page.getByLabel('Critério da comparação mensal').selectOption('mesCompleto');
  const baseMes=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'mes',mes}}).json();
  const bloco=dashboard().locator('section').filter({has:page.getByRole('heading',{name:'Comparação das vendas',exact:true})}).first();
  assert.equal(await bloco.locator('.dash-comparison strong').first().innerText(),moeda(baseMes.comparacoes.mesCompleto.valorAtual));
  await bloco.getByRole('button',{name:'Ver registros'}).first().click();const dialog=page.getByRole('dialog');await dialog.locator('tbody tr').first().waitFor();
  const intervalo=baseMes.comparacoes.mesCompleto.periodoAtual;const datas=await dialog.locator('tbody tr td:nth-child(2)').allTextContents();assert.ok(datas.every(d=>{const iso=d.split('/').reverse().join('-');return iso>=intervalo.de&&iso<=intervalo.ate;}));
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 });
 await testar('ranking permite unidade de quantidade, seleção removível e totais do produto',async()=>{
  await go('analise=produtos');const g=grafico('Ranking de produtos');
  const medidas=g.getByLabel('Medida de produtos');
  await medidas.waitFor();
  assert.ok(await medidas.locator('option[value^="q:"]').count()>0);
  await medidas.selectOption(await medidas.locator('option[value^="q:"]').first().getAttribute('value'));
  assert.ok(await g.locator('.chart-horizontal-row').count()>0);
  await medidas.selectOption('valor');
  await g.getByRole('button',{name:'Top 10',exact:true}).click();assert.equal(await g.locator('.chart-horizontal-row').count(),10);
  await g.locator('.chart-horizontal-row').first().click();
  await g.getByRole('button',{name:'Filtrar produto',exact:true}).click();await pronto();
  const produto=new URLSearchParams(page.url().split('?').at(-1)).get('produto');assert.ok(produto);
  const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'mes',mes,produto}}).json();
  assert.equal(await dashboard().locator('.dash-kpi').first().locator('strong').innerText(),moeda(esperado.resumo.centavos));
  await page.getByRole('button',{name:'Remover filtro Produto',exact:true}).click();await pronto();assert.ok(!page.url().includes('produto='));
 });
 await testar('ponto do vendedor abre somente esse vendedor e o mês exato',async()=>{
  await go(`analise=vendedores&modo=ano&ano=${ano}`);const g=grafico('Vendedores mês a mês');
  const ponto=g.locator('.chart-mark').filter({has:page.locator('title',{hasText:'Ana Exemplo'})}).first();
  await ponto.click();await g.locator('.chart-inspector').getByRole('button',{name:'Ver registros'}).click();
  const dialog=page.getByRole('dialog');await dialog.locator('tbody tr').first().waitFor();
  const vendedores=await dialog.locator('tbody tr td:nth-child(4)').allTextContents();assert.ok(vendedores.length&&vendedores.every(v=>v==='Ana Exemplo'));
  const datas=await dialog.locator('tbody tr td:nth-child(2)').allTextContents();assert.ok(datas.every(v=>v.endsWith(`/01/${ano}`)));
  await dialog.getByRole('button',{name:'Abrir pedidos, financeiro e acompanhamento'}).click();await pronto();
  assert.match(page.url(),/vendedor=101/);assert.match(page.url(),new RegExp(`de=${ano}-01-01`));
  await dashboard().locator('.res-order').first().waitFor();
 });
 await testar('Pareto tem valores e participação acumulada sem confundir as escalas',async()=>{
  await go('analise=abc');const g=grafico('Pareto de clientes');
  assert.ok(await g.locator('svg rect').count()>0&&await g.locator('svg path').count()>0);
  assert.ok((await g.locator('svg text').allTextContents()).includes('100%'));
  await g.getByRole('button',{name:'Tabela',exact:true}).click();
  const primeiro=await g.locator('tbody tr td').allTextContents();assert.match(primeiro[0],/R\$/);assert.match(primeiro[1],/%/);
  await page.screenshot({path:`${saida}/pareto-tabela.png`,fullPage:false});
 });
 await testar('faixa de atraso abre os títulos exatos e concilia com o gráfico',async()=>{
  await go('analise=atrasos');const g=grafico('Distribuição dos atrasos');
  const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'mes',mes}}).json();
  const faixa=esperado.financeiro.faixas.find(f=>f.centavos>0);assert.ok(faixa);
  await g.locator('.chart-mark').filter({has:page.locator('title',{hasText:faixa.nome})}).click();
  await g.locator('.chart-inspector').getByRole('button',{name:'Ver registros'}).click();
  const dialog=page.getByRole('dialog');await dialog.locator('tbody tr').first().waitFor();
  assert.equal(await dialog.locator('tbody tr').count(),faixa.titulos);
  const valores=await dialog.locator('tbody tr td:last-child').allTextContents();assert.equal(valores.reduce((s,v)=>s+reais(v),0),faixa.centavos);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 });
 await testar('gráficos em celular e modo escuro mantêm leitura e não expandem a página',async()=>{
  await page.setViewportSize({width:390,height:844});
  for(const analise of ['resumo','produtos','vendedores','abc','metas','descontos','historico']){await go(`analise=${analise}&modo=ano&ano=${ano}`);await semOverflow();}
  await page.screenshot({path:`${saida}/historico-mobile.png`,fullPage:false});
  await page.setViewportSize({width:1440,height:1000});await go('');
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  const cor=await dashboard().getByRole('heading',{name:'Dashboard',exact:true}).evaluate(el=>getComputedStyle(el).color);assert.notEqual(cor,'rgb(32, 42, 61)');
  await semOverflow();await page.screenshot({path:`${saida}/panorama-dark.png`,fullPage:false});
 });
 assert.deepEqual(erros,[]);
 console.log(JSON.stringify({aprovados:aprovados.length,falhas,errosJavaScript:erros,screenshots:saida},null,2));
 if(falhas.length)process.exitCode=1;
} finally {await browser.close();}
