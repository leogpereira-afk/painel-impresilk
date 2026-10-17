// Controlled review only. External requests are blocked; edits stay in the
// in-memory demonstration fixture and cannot reach productive records.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.NAV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NAV_BASE_URL||'http://127.0.0.1:4281';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const origin=new URL(base).origin,saida=process.env.RESULTADOS_SCREENSHOTS||'/tmp/central-comercial-resultados-v2';await mkdir(saida,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.NAV_CHROME_EXECUTABLE?{executablePath:process.env.NAV_CHROME_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}});await page.emulateMedia({reducedMotion:'reduce'});page.setDefaultTimeout(12000);
const erros=[],aprovados=[],falhas=[];
page.on('pageerror',e=>erros.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
const abrir=async(analise='vendas',perfil='')=>{await page.goto(`${base}/revisao-local.html${perfil?`?perfil=${perfil}`:''}#/comercial/dashboard?analise=${analise}`,{waitUntil:'networkidle'});await page.locator('.commercial-dashboard[aria-busy="false"]').first().waitFor();};
const semOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'não deve haver overflow de página');
const testar=async(nome,fn)=>{try{await fn();aprovados.push(nome);console.log('OK:',nome);}catch(e){falhas.push({nome,erro:e.message});console.log('FALHOU:',nome,e.message);await page.screenshot({path:`${saida}/falha-${falhas.length}.png`});}};
try{
 await testar('vendas preservam sinal, recebido, saldo e consulta do pedido por ID',async()=>{
  await abrir();await page.getByRole('heading',{name:'Pedidos que compõem o resultado',exact:true}).waitFor();
  const linha=page.locator('.res-order').first();await linha.locator('summary').first().click();
  await linha.locator('.res-financial-grid').waitFor();
  await linha.locator('.res-financial-grid').getByText('Consultando…',{exact:true}).first().waitFor({state:'hidden'});
  assert.match(await linha.innerText(),/Sinal registrado/);assert.match(await linha.innerText(),/Recebido conciliado/);assert.match(await linha.innerText(),/Saldo conciliado/);
  assert.equal(await linha.getByRole('alert').count(),0);assert.equal(await linha.getByText('A conferir',{exact:true}).count(),0);
  await linha.getByRole('button',{name:'Consultar pedido e andamento'}).click();
  const d=page.getByRole('dialog');await d.getByText('Recebimento do pedido',{exact:true}).waitFor();assert.equal(await d.getByRole('alert').count(),0);
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await semOverflow();await page.screenshot({path:`saida-vendas-desktop.png`.replace('saida-',saida+'/'),fullPage:true});
 });
 await testar('histórico do cliente e formulário de retorno mantêm a identidade',async()=>{
  const linha=page.locator('.res-order').first();await linha.getByRole('button',{name:'Histórico e próximos passos'}).click();
  const d=page.getByRole('dialog');await d.getByRole('heading',{name:'Histórico de compras autorizado',exact:true}).waitFor();
  await d.getByRole('button',{name:'Agendar retorno',exact:true}).click();
  await page.getByRole('dialog').getByText('CLIENTE SELECIONADO',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0);await page.keyboard.press('Escape');
 });
 await testar('gestão edita meta em memória e novo Dashboard reflete o mesmo cadastro',async()=>{
  await abrir('metas');await page.getByRole('heading',{name:'Minhas metas',exact:true}).waitFor();
  const linha=page.locator('.res-meta-list article').first();await linha.getByRole('button',{name:'Editar',exact:true}).click();
  const d=page.getByRole('dialog');await d.getByLabel('Meta em reais').fill('125000');await d.getByRole('button',{name:'Salvar meta',exact:true}).click();await d.waitFor({state:'hidden'});
  await page.locator('.res-meta-list article').first().getByText('R$ 125.000,00',{exact:true}).waitFor();
  await page.locator('.commercial-dashboard[aria-busy="false"]').waitFor();
  await page.locator('.res-metas').getByText('R$ 245.000,00',{exact:true}).waitFor();
  assert.equal(await page.locator('.res-commercial').getByRole('alert').count(),0);await semOverflow();
  await page.screenshot({path:saida+'/metas-desktop.png',fullPage:true});
 });
 await testar('perfil comercial consulta apenas sua carteira e não edita metas ou regras',async()=>{
  await abrir('metas','comercial-ana');await page.getByRole('heading',{name:'Minhas metas',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cadastrar meta',exact:true}).count(),0);
  assert.equal(await page.locator('.res-meta-list').getByRole('button',{name:'Editar',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Participação, calendário e regras',exact:true}).count(),0);
  assert.ok(!(await page.locator('.res-commercial').innerText()).includes('Beatriz Exemplo'));
 });
 await testar('celular mantém nomes e valores separados, com detalhes completos',async()=>{
  await page.setViewportSize({width:390,height:844});await abrir('vendas');
  const linha=page.locator('.res-order').first();await linha.locator('summary').first().click();await linha.locator('.res-financial-grid').waitFor();await semOverflow();
  const cliente=await linha.locator('.res-order-client').boundingBox(),valor=await linha.locator('.res-order-value').boundingBox();assert.ok(cliente.y+cliente.height<=valor.y+1,'cliente não deve sobrepor valor');
  await page.screenshot({path:saida+'/vendas-mobile.png',fullPage:true});
 });
 assert.deepEqual(erros,[],'nenhum erro JavaScript');
 console.log(JSON.stringify({aprovados:aprovados.length,falhas,erros,saida},null,2));
 if(falhas.length)process.exitCode=1;
}finally{await browser.close();}
