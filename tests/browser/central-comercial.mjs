// Teste manual de navegador: exige uma prévia Vite --mode review já iniciada.
// NAV_PLAYWRIGHT_MODULE e NAV_CHROME_EXECUTABLE podem apontar ao runtime local.
// Só acessa localhost; bloqueia qualquer pedido externo, inclusive o Brief.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.NAV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NAV_BASE_URL||'http://127.0.0.1:4281';
const origin=new URL(base).origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'use somente a prévia local');
const saida=process.env.NAV_SCREENSHOTS||'/tmp/central-comercial-navegacao';
await mkdir(saida,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.NAV_CHROME_EXECUTABLE?{executablePath:process.env.NAV_CHROME_EXECUTABLE}:{})});
const erros=[],requisicoes=[],bloqueadas=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>erros.push(e.message));
page.on('request',r=>requisicoes.push(r.url()));
await page.route('**/*',r=>{
  if(new URL(r.request().url()).origin===origin)return r.continue();
  bloqueadas.push(r.request().url());return r.abort();
});
const abrir=async(path,perfil='')=>{
  await page.goto(`${base}/revisao-local.html${perfil?`?perfil=${perfil}`:''}#${path}`,{waitUntil:'networkidle'});
  await page.getByRole('navigation',{name:'Central Comercial',exact:true}).waitFor();
};
const nav=()=>page.getByRole('navigation',{name:'Central Comercial',exact:true});
const aba=nome=>nav().getByRole('link',{name:nome,exact:true});
const semOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'não deve haver rolagem horizontal da página');

try{
  await abrir('/bancos?teste=1');
  await page.getByRole('heading',{name:'Bancos e Pix',exact:true}).waitFor();
  assert.ok(page.url().endsWith('#/comercial/bancos?teste=1'),'a URL legada precisa preservar a query');
  assert.deepEqual(await nav().getByRole('link').allTextContents(),['Visão geral','Bancos e Pix','Glossário','Contas atrasadas','Brief','Dashboard']);
  const lateral=page.getByRole('navigation',{name:'Módulos do painel',exact:true});
  assert.equal(await lateral.getByRole('link',{name:'Comercial',exact:true}).count(),1);
  for(const nome of ['Bancos e Pix','Glossário','Contas atrasadas','Brief'])assert.equal(await lateral.getByRole('link',{name:nome,exact:true}).count(),0);
  for(const nome of ['DashboardComercial.jsx','Glossario.jsx','ContasAtrasadas.jsx'])assert.equal(requisicoes.some(u=>u.includes('/src/pages/'+nome)),false,`${nome} não deve ser baixado ao abrir Bancos`);
  await semOverflow();
  console.log('OK: legado, sidebar e carregamento apenas da seção aberta');

  await aba('Glossário').click();
  const busca=page.getByRole('textbox',{name:'Buscar termo no glossário'});
  await busca.fill('ACM');
  await aba('Bancos e Pix').click();
  await page.getByRole('heading',{name:'Bancos e Pix',exact:true}).waitFor();
  await page.goBack();
  await busca.waitFor();
  assert.equal(await busca.inputValue(),'ACM','Voltar deve recuperar o filtro do Glossário');
  await aba('Bancos e Pix').click();
  await aba('Glossário').click();
  assert.equal(await busca.inputValue(),'ACM','alternar pelo menu também deve preservar o filtro');
  await page.screenshot({path:`${saida}/glossario-desktop.png`,fullPage:false});
  console.log('OK: voltar e filtros locais conservados ao alternar as ferramentas');

  await abrir('/comercial/dashboard?analise=produtos&modo=ano&ano=2025');
  await page.locator('.commercial-dashboard[aria-busy="false"]').waitFor();
  await aba('Glossário').click();
  await busca.waitFor();
  await aba('Dashboard').click();
  assert.ok(page.url().includes('analise=produtos')&&page.url().includes('ano=2025'),'Dashboard mantém seus próprios filtros');
  assert.equal(await page.getByRole('navigation',{name:'Análises comerciais'}).getByRole('button',{name:'Produtos',exact:true}).getAttribute('aria-current'),'page');
  await semOverflow();
  console.log('OK: filtros por URL ficam isolados por seção');

  await abrir('/comercial/brief');
  const frame=page.getByTitle('Brief',{exact:true});
  await frame.waitFor();
  const tamanho=await frame.boundingBox();
  assert.ok(tamanho.width>1000&&tamanho.height>=540,'Brief precisa aproveitar a área de trabalho');
  console.log('OK: Brief em área útil completa; conexão externa bloqueada de propósito');

  await abrir('/comercial','central-bancos');
  await page.getByRole('heading',{name:'Bancos e Pix',exact:true}).waitFor();
  assert.deepEqual(await nav().getByRole('link').allTextContents(),['Bancos e Pix','Brief']);
  assert.ok(page.url().endsWith('/comercial/bancos'));
  await abrir('/comercial/dashboard','central-bancos');
  await page.getByRole('heading',{name:'Acesso não liberado',exact:true}).waitFor();
  assert.equal(await page.locator('.commercial-dashboard').count(),0);
  console.log('OK: perfil só Bancos acessa a Central e tem Dashboard bloqueado');

  await abrir('/comercial/glossario');
  await busca.waitFor();
  assert.equal(await busca.inputValue(),'','recarregar inicia outra memória de filtros');
  await page.setViewportSize({width:390,height:844});
  await semOverflow();
  for(const link of await nav().getByRole('link').all()){
    const box=await link.boundingBox();
    assert.ok(box.height>=44,'alvo de toque precisa ter pelo menos 44px');
  }
  await page.screenshot({path:`${saida}/glossario-mobile.png`,fullPage:false});
  await aba('Dashboard').click();
  await page.locator('.commercial-dashboard[aria-busy="false"]').waitFor();
  await semOverflow();
  await page.screenshot({path:`${saida}/dashboard-mobile.png`,fullPage:false});
  console.log('OK: navegação e conteúdo responsivos a 390px');
  assert.deepEqual(erros,[],'o navegador não deve apresentar erro JavaScript');
  console.log(JSON.stringify({resultado:'aprovado',errosJavaScript:erros.length,pedidosExternosBloqueados:bloqueadas.length,screenshots:saida}));
}finally{await browser.close();}
