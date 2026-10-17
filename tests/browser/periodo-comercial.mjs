// Refinamento do período: interação real em prévia, sem rede externa.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {respostaDashboardDemo} from '../../src/review/dashboard.mjs';
import {moeda} from '../../src/components/dashboard/formatos.js';
const {chromium}=await import(process.env.NAV_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NAV_BASE_URL||'http://127.0.0.1:4281',origin=new URL(base).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const saida='/tmp/central-comercial-periodo-v3';await mkdir(saida,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.NAV_CHROME_EXECUTABLE?{executablePath:process.env.NAV_CHROME_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
page.setDefaultTimeout(10000);await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
const erros=[],falhas=[],aprovados=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),ano=hoje.slice(0,4),mes=hoje.slice(0,7);
const periodo=()=>page.getByRole('region',{name:'Período da análise'});
const modo=nome=>periodo().getByRole('group',{name:'Período',exact:true}).getByRole('button',{name:nome,exact:true});
const params=()=>new URLSearchParams(page.url().split('#')[1].split('?')[1]);
const conferir=async filtro=>{
 const esperado=await respostaDashboardDemo({action:'dashboard',filtro}).json();assert.ok(!esperado.erro);
 await page.waitForFunction(v=>document.querySelector('.dash-kpi strong')?.textContent===v,moeda(esperado.resumo.centavos));
 await page.locator('.commercial-dashboard[aria-busy="false"]').waitFor();
};
const testar=async(nome,fn)=>{try{await fn();aprovados.push(nome);console.log('OK:',nome);}catch(e){falhas.push({nome,erro:e.message});console.log('FALHOU:',nome,e.message);await page.screenshot({path:`${saida}/falha-${falhas.length}.png`});}};
try{
 await page.goto(`${base}/revisao-local.html#/comercial/dashboard`,{waitUntil:'networkidle'});await conferir({modo:'mes',mes});
 await testar('períodos visíveis sem expandir filtros, emojis decorativos e mês em português',async()=>{
  assert.equal(await page.locator('.dash-filters').getAttribute('open'),null);
  for(const n of ['Mês','Ano','Todos os anos','Personalizado'])assert.ok(await modo(n).isVisible());
  assert.equal(await modo('Mês').getAttribute('aria-pressed'),'true');
  assert.equal(await periodo().locator('.dash-period-emoji[aria-hidden="true"]').count(),4);
  assert.equal(await periodo().getByLabel('Mês',{exact:true}).locator('option').count(),12);
  assert.equal(await periodo().getByLabel('Mês',{exact:true}).locator('option[value="01"]').innerText(),'Janeiro');
  await page.screenshot({path:`${saida}/mes-desktop.png`,fullPage:false});
 });
 await testar('mês e ano mudam juntos ao cruzar dezembro e preservam vendedor',async()=>{
  await page.locator('.dash-filters > summary').click();await page.getByLabel('Vendedor',{exact:true}).selectOption('101');
  await periodo().getByLabel('Ano',{exact:true}).selectOption(String(Number(ano)-1));
  await periodo().getByLabel('Mês',{exact:true}).selectOption('12');
  await conferir({modo:'mes',mes:`${Number(ano)-1}-12`,vendedor:'101'});
  await periodo().getByRole('button',{name:'Próximo mês',exact:true}).click();
  await conferir({modo:'mes',mes:`${ano}-01`,vendedor:'101'});
  assert.equal(params().get('ano'),ano);assert.equal(params().get('mes'),ano+'-01');assert.equal(params().get('vendedor'),'101');
  await periodo().getByRole('button',{name:'Mês anterior',exact:true}).click();
  await conferir({modo:'mes',mes:`${Number(ano)-1}-12`,vendedor:'101'});
  assert.equal(await periodo().getByLabel('Ano',{exact:true}).inputValue(),String(Number(ano)-1));
 });
 await testar('modo anual usa o ano escolhido e retorna ao mês desse mesmo ano',async()=>{
  await modo('Ano').click();await conferir({modo:'ano',ano:String(Number(ano)-1),vendedor:'101'});
  assert.equal(await modo('Ano').getAttribute('aria-pressed'),'true');
  await periodo().getByRole('button',{name:'Próximo ano',exact:true}).click();await conferir({modo:'ano',ano,vendedor:'101'});
  await modo('Mês').click();assert.equal(params().get('mes'),ano+'-12');
  await periodo().getByRole('button',{name:'Este mês',exact:true}).click();await conferir({modo:'mes',mes,vendedor:'101'});
  assert.equal(await periodo().getByRole('button',{name:'Este mês',exact:true}).isDisabled(),true);
 });
 await testar('todos os anos mostra abrangência, mantém carteira e não oferece data sem efeito',async()=>{
  await modo('Todos os anos').click();await conferir({modo:'todos',vendedor:'101'});
  assert.equal(await periodo().locator('select,input').count(),0);
  assert.match(await periodo().innerText(),/Histórico disponível/);assert.match(await periodo().innerText(),new RegExp(String(Number(ano)-2)));
  assert.equal(params().get('vendedor'),'101');await page.screenshot({path:`${saida}/todos-desktop.png`,fullPage:false});
 });
 await testar('datas personalizadas e limpar seleção não alteram o intervalo',async()=>{
  await modo('Personalizado').click();const de=mes+'-02',ate=mes+'-07';
  await periodo().getByLabel('De',{exact:true}).fill(de);await periodo().getByLabel('Até',{exact:true}).fill(ate);
  await conferir({modo:'personalizado',de,ate,vendedor:'101'});
  await page.getByRole('button',{name:'Limpar filtros de seleção',exact:true}).click();await conferir({modo:'personalizado',de,ate});
  assert.equal(params().get('de'),de);assert.equal(params().get('ate'),ate);assert.equal(params().get('vendedor'),null);
 });
 await testar('teclado ativa ano e mantém seleção identificada por texto e estado',async()=>{
  await modo('Ano').focus();await page.keyboard.press('Enter');await conferir({modo:'ano',ano});
  assert.equal(await modo('Ano').getAttribute('aria-pressed'),'true');
  assert.equal(await modo('Personalizado').getAttribute('aria-pressed'),'false');
 });
 await testar('celular e modo escuro preservam controles sem rolagem horizontal',async()=>{
  await page.locator('.dash-filters > summary').click();
  for(const largura of [390,320]){
   await page.setViewportSize({width:largura,height:844});
   for(const n of ['Mês','Ano','Todos os anos','Personalizado']){
    await modo(n).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${largura}px ${n}`);
    for(const el of await periodo().getByRole('button').all())if(await el.isVisible())assert.ok((await el.boundingBox()).width>25);
   }
  }
  await page.setViewportSize({width:390,height:844});await modo('Mês').click();await conferir({modo:'mes',mes});
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:`${saida}/mes-mobile.png`,fullPage:false});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`${saida}/mes-mobile-dark.png`,fullPage:false});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`${saida}/mes-dark.png`,fullPage:false});
 });
 assert.deepEqual(erros,[]);console.log(JSON.stringify({aprovados:aprovados.length,falhas,errosJavaScript:erros,saida},null,2));if(falhas.length)process.exitCode=1;
}finally{await browser.close();}
