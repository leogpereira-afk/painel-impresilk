// Local, synthetic review only. Run against `vite --mode review` on localhost.
// PLAYWRIGHT_MODULE may point to the installed Playwright index.mjs.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PRINT_BASE_URL || 'http://127.0.0.1:4390/revisao-local.html';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Only local synthetic review is allowed');
const out=process.env.PRINT_TEST_OUTPUT || '/tmp/p3d-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
const evidence={base,checks:[],pageErrors:[],failedResources:[],externalRequests:[]};
await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1'].includes(url.hostname)){evidence.externalRequests.push(url.origin);return route.abort();}return route.continue();});
const url=base+'#/ferramenta-ia?ferramenta=impressao-3d';
const page=await context.newPage();
context.on('page',p=>p.on('pageerror',e=>evidence.pageErrors.push(e.message)));page.on('pageerror',e=>evidence.pageErrors.push(e.message));
page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))evidence.failedResources.push({url:r.url(),status:r.status()});});
page.on('dialog',d=>d.accept());
const check=(name,value=true)=>{assert(value,name);evidence.checks.push(name);};
const generate=async(p=page)=>{await p.getByRole('button',{name:'Gerar e conferir 3D',exact:true}).click();await p.getByTestId('print-results').waitFor({timeout:30000});};
const textField=p=>p.getByRole('textbox',{name:/^Texto/});
const heightField=p=>p.getByRole('spinbutton',{name:/^Altura do texto/});
async function dl(name,p=page){const promise=p.waitForEvent('download');await p.getByRole('button',{name,exact:true}).click();const d=await promise;const file=path.join(out,d.suggestedFilename());await d.saveAs(file);return {file,content:await readFile(file)};}
try{
 await page.goto(url);await page.getByRole('button',{name:'Gerar e conferir 3D',exact:true}).waitFor();await generate();
 check('Initial A produces two parts',await page.locator('.p3d-part').count()===2);
 const report=JSON.parse((await dl('Relatório JSON')).content);const stl=await dl('Baixar STL do corpo');
 const count=stl.content.readUInt32LE(80);check('STL binary size',stl.content.length===84+50*count);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<count;i++)for(let j=0;j<9;j++){const n=stl.content.readFloatLE(96+50*i+4*j),axis=j%3;min[axis]=Math.min(min[axis],n);max[axis]=Math.max(max[axis],n);}
 check('STL coordinates start at XYZ zero',min.every(n=>Math.abs(n)<0.0001));check('Downloaded STL matches report dimensions',max.every((n,i)=>Math.abs(n-report.parts[0].dimensionsMm[i])<0.01));
 const svg=(await dl('SVG para corte')).content.toString();check('SVG declares physical mm',/width="[\d.]+mm"/.test(svg));
 await page.getByRole('button',{name:'Separada',exact:true}).click();check('Selected view remains legible under hover',await page.getByRole('button',{name:'Separada',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(36, 83, 107)')); await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});await page.getByTestId('print-viewport').screenshot({path:path.join(out,'desktop-viewport.png')});
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await page.getByText('Rascunho salvo neste navegador, para sua conta.',{exact:false}).waitFor();
 const backup=await dl('Exportar projeto JSON');check('Backup has no mesh',!backup.content.includes('positions')&&!backup.content.includes('indices'));
 await page.reload();await page.getByText('Rascunho recuperado deste navegador.',{exact:false}).waitFor();check('Restored project keeps original size',await heightField(page).inputValue()==='120');check('Reload requires fresh generation',await page.getByTestId('print-results').count()===0);
 await textField(page).fill('O');await generate();await heightField(page).fill('');check('Incomplete numeric edit invalidates exports',await page.getByTestId('print-results').count()===0);check('Incomplete numeric edit cannot generate',await page.getByRole('button',{name:'Gerar e conferir 3D',exact:true}).isDisabled());
 await heightField(page).fill('230');await generate();check('Ender blocks oversized STL',await page.getByRole('button',{name:'Baixar STL do corpo',exact:true}).isDisabled());
 await page.getByRole('combobox',{name:/^Perfil/}).selectOption('k1-max');check('Changing profile invalidates result',await page.getByTestId('print-results').count()===0);await generate();check('K1 Max permits same individual part',await page.getByRole('button',{name:'Baixar STL do corpo',exact:true}).isEnabled());
 await page.getByRole('textbox',{name:'Nome do projeto',exact:true}).fill('Piloto sintético navegador');
 await page.getByRole('link',{name:'Início',exact:true}).click();await page.getByRole('link',{name:/Ferramenta I.A/}).click();await page.getByRole('button',{name:/Impressão 3D/}).click();
 await page.getByText('Edição pendente recuperada desta sessão.',{exact:false}).waitFor();
 check('Unsaved draft survives SPA navigation',await page.getByRole('textbox',{name:'Nome do projeto',exact:true}).inputValue()==='Piloto sintético navegador');
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await page.getByText('Rascunho salvo neste navegador, para sua conta.',{exact:false}).waitFor();
 const other=await context.newPage();other.on('dialog',d=>d.accept());await other.goto(url);await other.getByText('Rascunho recuperado deste navegador.',{exact:false}).waitFor();
 await textField(other).fill('B');await textField(page).fill('A');await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await page.getByText('Rascunho salvo neste navegador, para sua conta.',{exact:false}).waitFor();
 await other.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await other.getByText('Outra aba alterou este rascunho.',{exact:false}).waitFor();check('Concurrent tab blocks overwrite',await textField(other).inputValue()==='B');check('Conflict still permits JSON backup',await other.getByRole('button',{name:'Exportar projeto JSON',exact:true}).isEnabled());await other.close();
 await page.getByLabel('Abrir projeto JSON',{exact:true}).setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await page.getByRole('alert').filter({hasText:'Arquivo não aberto'}).waitFor();check('Invalid JSON preserves current draft',await textField(page).inputValue()==='A');
 await page.getByLabel('Abrir projeto JSON',{exact:true}).setInputFiles(backup.file);await page.getByText('Arquivo carregado.',{exact:false}).waitFor();check('Project backup reopens',await heightField(page).inputValue()==='120');
 await page.getByRole('combobox',{name:/^Origem/}).selectOption('file');const svgSource='<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="120mm" viewBox="0 0 100 120"><path d="M 0 0 L 100 0 L 100 120 L 0 120 Z"/></svg>';
 await page.getByLabel('Arquivo vetorial',{exact:true}).setInputFiles({name:'retangulo.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svgSource)});await generate();check('SVG physical dimensions preserved',(await page.getByTestId('print-assembly-dimensions').innerText()).includes('100 × 120 × 40'));
 await page.getByLabel('Arquivo vetorial',{exact:true}).setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svgSource.replace('100mm','100px'))});await page.getByRole('button',{name:'Gerar e conferir 3D',exact:true}).click();await page.getByRole('alert').filter({hasText:'explicitamente em mm'}).waitFor();check('Unsupported SVG scale blocks output',await page.getByTestId('print-results').count()===0);
 const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES','0','LWPOLYLINE','90','4','70','1','10','0','20','0','10','100','20','0','10','100','20','120','10','0','20','120','0','ENDSEC','0','EOF'].join('\n');
 await page.getByLabel('Arquivo vetorial',{exact:true}).setInputFiles({name:'retangulo.dxf',mimeType:'application/dxf',buffer:Buffer.from(dxf)});await generate();check('DXF mm accepted',(await page.getByTestId('print-assembly-dimensions').innerText()).includes('100 × 120 × 40'));
 await page.getByRole('combobox',{name:/^Origem/}).selectOption('text');await page.getByRole('combobox',{name:/^Fonte/}).selectOption('gentilis');await textField(page).fill('Ç');await page.getByRole('button',{name:'Gerar e conferir 3D',exact:true}).click();await page.getByRole('alert').waitFor();check('Known split shape blocks download',await page.getByTestId('print-results').count()===0);
 await textField(page).fill('AÇÃO');await heightField(page).fill('210');await generate();check('Valid accented word generates 10 components',await page.locator('.p3d-part').count()===10);
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:path.join(out,'dark.png'),fullPage:true});const colors=await page.locator('.print-viewport').evaluate(e=>({ink:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));check('Dark preview uses light text',colors.ink==='rgb(229, 237, 244)');
 await page.evaluate(()=>document.documentElement.classList.remove('dark'));await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});check('Mobile page has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.getByTestId('print-viewport').scrollIntoViewIfNeeded();await page.getByTestId('print-viewport').screenshot({path:path.join(out,'mobile-viewport.png')});
 const licenses=await page.locator('a').filter({hasText:'Licenças do motor'}).getAttribute('href');const licenseResponse=await context.request.get(new URL(licenses,base).href);check('Distributed licenses accessible',licenseResponse.ok()&&(await licenseResponse.text()).includes('Apache'));
 check('No JavaScript page errors',evidence.pageErrors.length===0);check('No failed product resources',evidence.failedResources.length===0);
 evidence.download={triangleCount:count,dimensionsMm:max,reportDimensions:report.parts[0].dimensionsMm};evidence.themeColors=colors;
} finally {await writeFile(path.join(out,'result.json'),JSON.stringify(evidence,null,2));await browser.close();}
console.log(JSON.stringify(evidence,null,2));
