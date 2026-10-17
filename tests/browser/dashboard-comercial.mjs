// Executar com Vite --mode review. Rede externa bloqueada e Chrome isolado.
// NAV_PLAYWRIGHT_MODULE / NAV_CHROME_EXECUTABLE aceitam runtime já instalado.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {respostaDashboardDemo} from '../../src/review/dashboard.mjs';
import {moeda} from '../../src/components/dashboard/formatos.js';
const {chromium}=await import(process.env.NAV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NAV_BASE_URL||'http://127.0.0.1:4281';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const origin=new URL(base).origin,saida=process.env.DASH_SCREENSHOTS||'/tmp/central-comercial-dashboard';
await mkdir(saida,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.NAV_CHROME_EXECUTABLE?{executablePath:process.env.NAV_CHROME_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.emulateMedia({reducedMotion:'reduce'});
page.setDefaultTimeout(8000);
const erros=[],falhas=[],aprovados=[];let nulos=false,duplicados=false,injecoes=0;
page.on('pageerror',e=>erros.push(e.message));
await page.route('**/*',async r=>{
  const url=new URL(r.request().url());
  if(url.origin!==origin)return r.abort();
  if((nulos||duplicados)&&url.pathname==='/src/review/dashboard.mjs'){
    const resposta=await r.fetch(),codigo=await resposta.text();
    assert.ok(codigo.includes('return Response.json(resposta);'),'o cenário nulo precisa ser injetado apenas no fixture');
    injecoes++;
    const cenario=duplicados?`if(b.action==='dashboardDetalhe'&&resposta.vendas?.[0]?.produtos?.[0]){const p=resposta.vendas[0].produtos[0];resposta.vendas[0].produtos.push({...p,nome:p.nome+' · segunda linha'});}`:`Object.assign(resposta.resumo,{centavos:null,pedidos:null,clientes:null,ticketMedio:null,brutoCentavos:null,descontoCentavos:null});resposta.series={mensal:[{mes:'2026-01',centavos:null,completo:false}]};`;
    return r.fulfill({response:resposta,body:codigo.replace('return Response.json(resposta);',`${cenario}return Response.json(resposta);`)});
  }
  return r.continue();
});
const principal=()=>page.locator('.commercial-dashboard').first();
const pronto=async()=>{await page.locator('.commercial-dashboard[aria-busy="false"]').first().waitFor();};
const abrir=async(query='',perfil='')=>{
  await page.goto(`${base}/revisao-local.html${perfil?`?perfil=${perfil}`:''}#/comercial/dashboard${query?'?'+query:''}`,{waitUntil:'networkidle'});
  await pronto();
};
const filtros=async()=>{const el=principal().locator('.dash-filters');if(await el.getAttribute('open')===null)await el.locator(':scope > summary').click();};
const ranking=async()=>{const el=principal().locator('.dash-ranking-detail');if(await el.getAttribute('open')===null)await el.locator(':scope > summary').click();};
const analise=async nome=>{await page.getByRole('navigation',{name:'Análises comerciais',exact:true}).getByRole('button',{name:nome,exact:true}).click();await pronto();};
const textoKpi=async nome=>principal().locator('.dash-kpi').filter({has:page.locator('span',{hasText:nome})}).locator('strong').innerText();
const esperaKpi=async(nome,esperado)=>{await page.waitForFunction(({nome,esperado})=>[...document.querySelectorAll('.dash-kpi')].some(k=>k.querySelector('span')?.textContent===nome&&k.querySelector('strong')?.textContent===esperado),{nome,esperado});};
const semOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow horizontal de página');
const topo=async()=>{
  await page.addStyleTag({content:'html,body,*{scroll-behavior:auto!important}'});
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});for(const el of document.querySelectorAll('body *'))if(el.scrollTop)el.scrollTo({top:0,left:0,behavior:'instant'});});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
};
const testar=async(nome,fn)=>{try{await fn();aprovados.push(nome);console.log('OK:',nome);}catch(e){falhas.push({nome,erro:e.message});console.log('FALHOU:',nome,e.message);await page.screenshot({path:`${saida}/falha-${falhas.length}.png`,fullPage:false});}};
const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),ano=hoje.slice(0,4),mes=hoje.slice(0,7);

try{
  await testar('8 análises e métricas mensais renderizam sem erro',async()=>{
    await abrir();
    const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'mes',mes}}).json();
    await esperaKpi('Vendas registradas',moeda(esperado.resumo.centavos));
    for(const nome of ['Panorama','Produtos','Vendedores','Clientes','Atrasos','Curva ABC','Histórico','Oportunidades']){
      await analise(nome);
      const texto=await principal().innerText();
      assert.ok(!/\b(?:undefined|NaN)\b/.test(texto));
      assert.equal(await principal().getByRole('alert').count(),0);
      await semOverflow();
    }
  });

  await testar('períodos mês, ano e todos os anos conciliam com fixture',async()=>{
    await analise('Panorama');await filtros();
    for(const modo of ['ano','todos','mes']){
      await page.getByLabel('Período',{exact:true}).selectOption(modo);
      const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo,mes,ano}}).json();
      await esperaKpi('Vendas registradas',moeda(esperado.resumo.centavos));
      assert.equal(await textoKpi('Pedidos'),String(esperado.resumo.pedidos));
    }
  });

  await testar('produto e vendedor restringem o recorte e não confundem atrasos',async()=>{
    await filtros();await page.getByLabel('Vendedor',{exact:true}).selectOption('101');
    await page.getByLabel('Produto').selectOption('p1');
    const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'mes',mes,ano,vendedor:'101',produto:'p1'}}).json();
    await esperaKpi('Vendas registradas',moeda(esperado.resumo.centavos));
    await analise('Atrasos');
    const texto=await principal().innerText();
    assert.match(texto,/produto|categoria|vínculo/i);
    assert.equal(await principal().locator('.dash-kpi').count(),0,'atrasos não podem virar zero quando o filtro não é aplicável');
    await page.getByRole('button',{name:'Limpar filtros de seleção',exact:true}).click();
    await pronto();
  });

  await testar('detalhe abre pedidos, captura Tab e devolve foco ao fechar por Escape',async()=>{
    await analise('Produtos');await ranking();
    const gatilho=principal().locator('table tbody tr').first().getByRole('button').first();
    const nome=await gatilho.innerText();
    await gatilho.click();
    const dialog=page.getByRole('dialog',{name:nome,exact:true});
    await dialog.waitFor();
    await dialog.locator('tbody tr').first().waitFor();
    assert.ok(await dialog.locator('tbody tr').count()>0);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
    await page.screenshot({path:`${saida}/detalhe-desktop.png`,fullPage:false});
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await gatilho.evaluate(el=>document.activeElement===el),true);
  });

  await testar('Curva ABC aceita faixas, classifica clientes e produtos',async()=>{
    await analise('Curva ABC');await filtros();await ranking();
    await page.getByLabel('Faixa A · até (%)').fill('70');
    await page.getByLabel('Faixa B · até (%)').fill('90');
    await pronto();
    assert.ok(await principal().locator('.dash-badge').count()>0);
    await page.getByLabel('Curva de').selectOption('produtos');
    await pronto();await ranking();
    assert.match(await principal().locator('table caption').innerText(),/produto/i);
    assert.ok(await principal().locator('.dash-badge').count()>0);
  });

  await testar('simulador calcula cenário sem salvar meta e margem permanece indisponível',async()=>{
    await analise('Oportunidades');
    await page.getByLabel('Meta desejada (R$)').fill('100000');
    await page.getByLabel('Ticket médio do cenário (R$)').fill('500');
    await page.getByText('200 vendas',{exact:true}).waitFor();
    assert.match(await principal().innerText(),/A margem não foi estimada/);
    assert.match(await principal().innerText(),/Não altera a meta cadastrada/);
    await topo();
    await page.screenshot({path:`${saida}/oportunidades-desktop.png`,fullPage:true});
  });

  await testar('detalhe mensal preserva período personalizado e vendedor',async()=>{
    const de=`${mes}-10`,ate=`${mes}-15`;
    await page.getByLabel('Período',{exact:true}).selectOption('personalizado');
    await page.getByLabel('De',{exact:true}).fill(de);
    await page.getByLabel('Até',{exact:true}).fill(ate);
    await filtros();await page.getByLabel('Vendedor',{exact:true}).selectOption('101');
    const esperado=await respostaDashboardDemo({action:'dashboard',filtro:{modo:'personalizado',de,ate,vendedor:'101'}}).json();
    assert.ok(esperado.resumo.pedidos>0,'o fixture precisa ter pedidos nesse recorte');
    await analise('Panorama');await esperaKpi('Vendas registradas',moeda(esperado.resumo.centavos));
    const grafico=principal().locator('.analytic-chart').filter({has:page.getByRole('heading',{name:'Evolução das vendas',exact:true})});
    await grafico.getByRole('button',{name:'Mês',exact:true}).click();
    await grafico.locator('.chart-mark').first().click();
    await grafico.locator('.chart-inspector').getByRole('button',{name:'Ver registros'}).click();
    const dialog=page.getByRole('dialog');
    await dialog.locator('tbody tr').first().waitFor();
    assert.equal(await dialog.locator('tbody tr').count(),esperado.resumo.pedidos);
    const linhas=await dialog.locator('tbody tr').allTextContents();
    assert.ok(linhas.every(l=>l.includes('Ana Exemplo')),'o detalhe deve preservar o vendedor selecionado');
    const datas=await dialog.locator('tbody tr td:nth-child(2)').allTextContents();
    assert.ok(datas.every(d=>{const iso=d.split('/').reverse().join('-');return iso>=de&&iso<=ate;}));
    const valores=await dialog.locator('tbody tr td:nth-child(5)').allTextContents();
    const centavos=valores.reduce((s,v)=>s+Math.round(Number(v.replace(/[^\d,-]/g,'').replace(',','.'))*100),0);
    assert.equal(centavos,esperado.resumo.centavos,'os pedidos do detalhe devem conciliar com a célula e os KPIs');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    await abrir();
  });

  await testar('mobile 390px nas 8 análises sem overflow ou erro',async()=>{
    await page.setViewportSize({width:390,height:844});
    for(const nome of ['Panorama','Produtos','Vendedores','Clientes','Atrasos','Curva ABC','Histórico','Oportunidades']){
      await analise(nome);await semOverflow();
      assert.equal(await principal().getByRole('alert').count(),0);
    }
    await analise('Panorama');
    await topo();
    await page.screenshot({path:`${saida}/panorama-mobile.png`,fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    const painelFiltros=principal().locator('.dash-filters');if(await painelFiltros.getAttribute('open')!==null)await painelFiltros.locator(':scope > summary').click();
    await topo();
    await page.screenshot({path:`${saida}/panorama-desktop.png`,fullPage:false});
  });

  await testar('vendedor sem financeiro não recebe link ou números de cobranças',async()=>{
    await abrir('','comercial-ana');
    await analise('Atrasos');
    await principal().getByText('Atrasos financeiros',{exact:true}).waitFor();
    assert.equal(await principal().getByRole('link',{name:/Contas atrasadas/i}).count(),0);
    assert.equal(await principal().locator('.dash-kpi').count(),0);
    assert.match(await principal().innerText(),/permissão|acesso/i);
    await abrir();
  });

  await testar('itens repetidos do mesmo produto permanecem visíveis no detalhe',async()=>{
    duplicados=true;await page.reload({waitUntil:'networkidle'});await pronto();
    await analise('Produtos');await ranking();
    await principal().locator('table tbody tr').first().getByRole('button').first().click();
    const dialog=page.getByRole('dialog');
    const primeira=dialog.locator('tbody tr').first();await primeira.waitFor();
    await primeira.getByText('Ver itens',{exact:true}).click();
    const itens=primeira.locator('li');
    assert.equal(await itens.count(),3,'duas linhas originais e duplicata sintética do primeiro produto');
    assert.equal(await itens.last().isVisible(),true);
    assert.match(await itens.last().innerText(),/segunda linha/);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    duplicados=false;await page.reload({waitUntil:'networkidle'});await pronto();
  });

  await testar('valores nulos não viram zero em KPIs e histórico',async()=>{
    nulos=true;duplicados=false;await abrir();await page.reload({waitUntil:'networkidle'});await pronto();
    assert.ok(injecoes>0,'a resposta sintética com nulos foi injetada');
    assert.equal(await textoKpi('Vendas registradas'),'Não disponível');
    assert.equal(await textoKpi('Pedidos'),'—');
    await analise('Histórico');
    await principal().getByRole('button',{name:'Tabela',exact:true}).click();
    const total=await principal().locator('.dash-matrix tbody tr').first().locator('td').last().innerText();
    assert.equal(total,'Não disponível','total histórico deve ficar indisponível quando todos os meses são nulos');
  });

  assert.deepEqual(erros,[]);
  console.log(JSON.stringify({aprovados:aprovados.length,falhas,errosJavaScript:erros,screenshots:saida},null,2));
  if(falhas.length)process.exitCode=1;
}finally{await browser.close();}
