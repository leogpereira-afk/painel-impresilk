// O conector do LinkedIn (supabase/functions/_shared/mkt-fontes/linkedin.mjs),
// executado de verdade com um ctx.fetchJson de mentira: nenhuma chamada sai
// para o LinkedIn, nenhuma credencial é real. As respostas vêm de
// tests/fixtures/mkt-linkedin: as "doc-*" são os exemplos da documentação
// (copiados da pesquisa, inclusive o erro de digitação "uniqueImpressionsCounts");
// as outras são fictícias, de uma Página inventada.
//
// O mkt-oauth.mjs é de outra peça (e pode nem existir ainda): o esbuild
// empacota o conector com um renovar de mentira no lugar do import.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
import {hojeSP} from '../supabase/functions/_shared/marketing.mjs';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const DIR=new URL('../supabase/functions/_shared/mkt-fontes/',import.meta.url);
const FONTE_JS=readFileSync(new URL('linkedin.mjs',DIR),'utf8');
const IMPORT_OAUTH=/^import\s*\{\s*renovar\s*\}\s*from\s*'\.\.\/mkt-oauth\.mjs';\s*$/m;
const code=buildSync({stdin:{contents:FONTE_JS.replace(IMPORT_OAUTH,'const renovar=(...a)=>globalThis.__renovarLinkedin(...a);'),loader:'js',resolveDir:fileURLToPath(DIR),sourcefile:'linkedin.mjs'},bundle:true,write:false,format:'esm',platform:'node'}).outputFiles[0].text;
const L=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const fx=n=>JSON.parse(readFileSync(new URL(`./fixtures/mkt-linkedin/${n}.json`,import.meta.url),'utf8'));

const DIA=86_400_000,msDia=d=>Date.parse(d+'T00:00:00Z');
const ORG='urn:li:organization:90000001',ORG_ENC='urn%3Ali%3Aorganization%3A90000001';
// Valores fictícios, só para provar que nunca aparecem fora do cofre.
const TOKEN='tk-ficticio-AAAA',TOKEN_NOVO='tk-ficticio-BBBB',REFRESH='rf-ficticio-CCCC';
const ENV={LINKEDIN_CLIENT_ID:'id-ficticio',LINKEDIN_CLIENT_SECRET:'segredo-ficticio'};
const HOJE='2026-10-14'; // quarta: semana atual começa em 2026-10-12
const ESCOPOS=['rw_organization_admin','r_organization_social','r_organization_social_feed'];
const CANAIS=[{codigo:'linkedin',url_perfil:'https://www.linkedin.com/company/empresa-exemplo'},{codigo:'site',url_perfil:'https://exemplo.com.br'}];
const conexao=(extra={})=>({access_token:TOKEN,refresh_token:REFRESH,expira_em:new Date(Date.now()+40*DIA).toISOString(),
 refresh_expira_em:new Date(Date.now()+300*DIA).toISOString(),escopos:ESCOPOS,conta:'Empresa Exemplo Ltda',conectado_por:'leo',conectado_em:'2026-10-01T12:00:00Z',...extra});

class Falha{constructor(status,corpo=null){this.status=status;this.corpo=corpo;}}
const falha=(s,c=null)=>new Falha(s,c);
const intervalo=url=>{const m=/timeRange:\(start:(\d+),end:(\d+)\)/.exec(url);return m?[Number(m[1]),Number(m[2])]:null;};
function serie(url,f){const [a,b]=intervalo(url);const elements=[];for(let t=a;t<b;t+=DIA){const x=f(new Date(t).toISOString().slice(0,10));if(x)elements.push({timeRange:{start:t,end:t+DIA},...x});}return {paging:{count:10,start:0},elements};}
const ganho=()=>({followerGains:{organicFollowerGain:3,paidFollowerGain:1},organizationalEntity:ORG});
const visita=()=>({organization:ORG,totalPageStatistics:{clicks:{desktopCustomButtonClickCounts:[{customButtonType:'VISIT_WEBSITE',clicks:1}],mobileCustomButtonClickCounts:[]},
 views:{allPageViews:{pageViews:10,uniquePageViews:7},overviewPageViews:{pageViews:6,uniquePageViews:4},careersPageViews:{pageViews:0,uniquePageViews:0}}}});
const conteudoDia=()=>({organizationalEntity:ORG,totalShareStatistics:{impressionCount:100,uniqueImpressionsCount:60,clickCount:5,likeCount:4,commentCount:1,shareCount:1,engagement:0.11}});
const rota=url=>new URL(url).pathname.replace(/^\/rest/,'');
const ehPorPost=url=>/[?&](shares=|ugcPosts)/.test(url);

/** A API de mentira: responde pela rota, como o LinkedIn responderia. */
function respostaPadrao(url){
 const p=rota(url),janela=url.includes('timeIntervals=');
 if(p==='/organizationAcls')return fx('acl');
 if(p==='/organizations/90000001')return fx('organizacao');
 if(p.startsWith('/networkSizes/'))return fx('network-sizes');
 if(p==='/organizationalEntityFollowerStatistics')return janela?serie(url,ganho):fx('seguidores-perfil');
 if(p==='/organizationPageStatistics')return janela?serie(url,visita):fx('visitas-desde-sempre');
 if(p==='/organizationalEntityShareStatistics')return ehPorPost(url)?fx('estatistica-por-post'):janela?serie(url,conteudoDia):fx('conteudo-desde-sempre');
 if(p==='/posts')return fx('posts');
 if(p.startsWith('/socialMetadata/'))return fx('social-metadata');
 if(p==='/videoAnalytics')return fx('video');
 throw new Error('rota inesperada '+p);
}

let renovacoes=[];
function montar({responder=respostaPadrao,cx=conexao(),env=ENV,hoje=HOJE,canais=CANAIS,prazo,chamadasHoje,renovar}={}){
 const chamadas=[],logs=[];renovacoes=[];
 globalThis.__renovarLinkedin=async(...a)=>{renovacoes.push(a);if(!renovar)throw new Error('renovar não devia ser chamado');return renovar(...a);};
 const ctx={env:n=>env[n],conexao:cx,hoje,canais,prazo:prazo?()=>prazo(chamadas):()=>100_000,log:t=>logs.push(t),
  async fetchJson(url,op={}){chamadas.push({url,...op});const r=await responder(url,op,chamadas);
   if(r instanceof Falha){const e=new Error(`HTTP ${r.status}`);e.status=r.status;e.corpo=r.corpo;throw e;}return structuredClone(r);}};
 if(chamadasHoje!==undefined)ctx.chamadasHoje=chamadasHoje;
 return {ctx,chamadas,logs,rodar:()=>L.coletar(ctx)};
}
const comFalha=(teste,resposta)=>(url,op,ch)=>teste(url,ch)?resposta:respostaPadrao(url);
const semConexao=({conexao:_c,...resto})=>resto;
const contar=(chamadas,trecho)=>chamadas.filter(c=>c.url.includes(trecho)).length;

// ------------------------------------------------- os casos ruins primeiro --

test('O CASO RUIM: sem os secrets do app é falta_configurar, sem nenhuma chamada, e a faxina vai junto', async()=>{
 const t=montar({env:{LINKEDIN_CLIENT_ID:'id-ficticio'}}),r=await t.rodar();
 assert.equal(r.estado,'falta_configurar');assert.equal(t.chamadas.length,0);
 assert.match(r.avisos.join(' '),/LINKEDIN_CLIENT_SECRET/);
 assert.deepEqual(r.faxina,{canal:'linkedin',dias_numeros:365,dias_titulo:180});
 assert.deepEqual([r.semanas,r.publicacoes],[[],[]]);
});

test('sem conexão no cofre é falta_conectar, sem chamada', async()=>{
 for(const cx of [null,{conectado_por:'leo'},{access_token:''}]){
  const t=montar({cx}),r=await t.rodar();
  assert.equal(r.estado,'falta_conectar');assert.equal(t.chamadas.length,0);assert.ok(r.faxina);
 }
});

test('401 na primeira chamada vira reconectar, com UMA chamada só (token morto não insiste)', async()=>{
 const t=montar({responder:()=>falha(401,fx('erro-401'))}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.equal(t.chamadas.length,1);
 assert.match(r.avisos.join(' '),/Clique em Reconectar/);
 // Nem o token, nem o texto do LinkedIn vão para a tela, o cache ou o diário.
 const fora=JSON.stringify(r)+t.logs.join('\n');
 assert.ok(!fora.includes(TOKEN));assert.ok(!/revoked/i.test(fora));
});

test('401 no meio da coleta para tudo na hora: nenhuma chamada depois dela', async()=>{
 const t=montar({responder:comFalha(url=>rota(url).startsWith('/networkSizes/'),falha(401))}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.equal(t.chamadas.length,3);
 assert.ok(rota(t.chamadas.at(-1).url).startsWith('/networkSizes/'));
});

test('o fetchJson pode devolver o erro em envelope, ou o corpo de erro do LinkedIn: dá o mesmo estado', async()=>{
 let t=montar({responder:()=>({ok:false,status:401,dados:fx('erro-401')})});
 assert.equal((await t.rodar()).estado,'reconectar');assert.equal(t.chamadas.length,1);
 t=montar({responder:url=>rota(url)==='/organizationAcls'?fx('erro-403'):respostaPadrao(url)});
 assert.equal((await t.rodar()).estado,'aguardando_aprovacao');assert.equal(t.chamadas.length,1);
});

test('403 na lista de Páginas (produto sem aprovação) vira aguardando_aprovacao, com uma chamada', async()=>{
 const t=montar({responder:()=>falha(403,fx('erro-403'))}),r=await t.rodar();
 assert.equal(r.estado,'aguardando_aprovacao');assert.equal(t.chamadas.length,1);
 assert.match(r.avisos.join(' '),/Community Management API/);
 assert.ok(!r.avisos.join(' ').includes('Not enough permissions'));
});

test('conta que não administra Página nenhuma: reconectar com o motivo, sem gastar mais chamada', async()=>{
 const t=montar({responder:url=>rota(url)==='/organizationAcls'?fx('acl-vazia'):respostaPadrao(url)}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.equal(t.chamadas.length,1);assert.match(r.avisos.join(' '),/administradora/);
});

test('conexão sem o escopo de administrador: reconectar antes de chamar', async()=>{
 const t=montar({cx:conexao({escopos:['r_organization_social']})}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.equal(t.chamadas.length,0);
});

test('o caso ruim (motivo): parte que falhou leva a frase em motivo e o código curto em codigo; parte ok não leva nenhum; o aviso diz "não mandou"', async()=>{
 const t=montar({responder:comFalha(url=>rota(url)==='/organizationPageStatistics',falha(500))}),r=await t.rodar();
 // A frase é a de MOTIVOS; o código é do mesmo caso, só [a-z0-9_], nunca para mostrar.
 assert.deepEqual([r.partes.visitas.estado,r.partes.visitas.motivo,r.partes.visitas.codigo],['erro',L.MOTIVOS.falhou,'falhou']);
 for(const [nome,p] of Object.entries(r.partes)){
  if(p.estado==='ok'){assert.equal('motivo' in p||'codigo' in p,false,nome);continue;}
  assert.match(p.codigo,/^[a-z0-9_]+$/,nome);assert.equal(p.motivo,L.MOTIVOS[p.codigo],nome);
 }
 assert.ok(r.avisos.includes('O LinkedIn não mandou as visitas à Página desta vez.'),r.avisos.join(' | '));
 assert.equal(r.avisos.some(a=>/não respondeu/.test(a)),false);
 // Cota (corte que fica para a próxima coleta): o código é "cota".
 const c=await montar({responder:comFalha(url=>rota(url)==='/organizationPageStatistics',falha(429))}).rodar();
 assert.deepEqual([c.partes.visitas.codigo,c.partes.visitas.motivo],['cota',L.MOTIVOS.cota]);
});

test('versão da API vencida: erro com aviso para trocar a constante, e para na primeira', async()=>{
 const t=montar({responder:()=>falha(426,fx('erro-426'))}),r=await t.rodar();
 assert.equal(r.estado,'erro');assert.equal(t.chamadas.length,1);assert.match(r.avisos.join(' '),/VERSAO_API/);
});

test('429 (cota do dia) para a coleta: o que veio fica, o resto é pulado, estado parcial', async()=>{
 const t=montar({responder:comFalha(url=>rota(url)==='/organizationPageStatistics',falha(429))}),r=await t.rodar();
 assert.equal(t.chamadas.length,5);assert.equal(r.estado,'parcial');
 assert.match(r.avisos.join(' '),/cota do dia/);
 assert.equal(r.partes.pagina.estado,'ok');assert.equal(r.partes.seguidores.estado,'parcial');assert.equal(r.partes.seguidores.motivo,L.MOTIVOS.cota);
 // Estado de parte só dos que a coletora conhece (outro ela troca por erro).
 for(const p of ['visitas','conteudo','posts'])assert.deepEqual([r.partes[p].estado,r.partes[p].motivo],['erro',L.MOTIVOS.cota]);
 // Parte que não veio não aparece em dados: a coletora mantém a da coleta anterior.
 assert.equal(r.dados.visitas,undefined);assert.equal(r.dados.posts,undefined);
 // Parte parcial leva só o que veio: sem a chave "perfil", o perfil de antes fica.
 assert.equal(r.dados.seguidores.total,1500);assert.equal('perfil' in r.dados.seguidores,false);
 // Nada de zero no lugar do que não veio; e numa quarta nem o total de
 // seguidores vai (o número da semana é o retrato lido na segunda).
 assert.deepEqual(r.semanas,[]);
 assert.deepEqual(r.publicacoes,[]);
});

test('403 nas reações (escopo de feed) vira aviso, não repete post a post e não derruba o resto', async()=>{
 const t=montar({responder:comFalha(url=>rota(url).startsWith('/socialMetadata/'),falha(403,fx('erro-403')))}),r=await t.rodar();
 assert.equal(contar(t.chamadas,'/socialMetadata/'),1);
 assert.equal(r.estado,'parcial');assert.equal(r.partes.posts.estado,'parcial');assert.equal(r.partes.conteudo.estado,'ok');
 assert.match(r.avisos.join(' '),/reações por tipo/);
 assert.ok(r.dados.posts.itens.every(p=>p.reacoes===null));
 assert.equal(r.publicacoes.length,4);
});

test('falha de servidor numa parte não apaga as outras nem vira zero', async()=>{
 const t=montar({responder:comFalha(url=>rota(url)==='/organizationalEntityShareStatistics'&&url.includes('timeIntervals='),falha(503))}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.equal(r.partes.conteudo.estado,'erro');assert.equal(r.dados.conteudo,undefined);
 assert.equal(r.partes.seguidores.estado,'ok');
 for(const l of r.semanas)for(const k of ['impressoes','alcance','engajamento','cliques'])assert.equal(k in l.numeros,false);
 assert.equal(r.dados.seguidores.semanas[0].total_fim,1496,'o total da semana continua na tela');
});

test('token vencido sem refresh: reconectar sem chamar ninguém', async()=>{
 const t=montar({cx:conexao({refresh_token:undefined,expira_em:new Date(Date.now()-DIA).toISOString()})}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.equal(t.chamadas.length,0);assert.equal(renovacoes.length,0);
});

// O que o mkt-oauth.mjs lança: ErroOAuth com um código curto e fixo.
const erroOAuth=codigo=>Object.assign(new Error(codigo),{name:'ErroOAuth',codigo});
const venceEm=ms=>new Date(Date.now()+ms).toISOString();

test('token vencido e renovação recusada: cada código no seu estado, sem chamada à API', async()=>{
 const casos=[[erroOAuth('reconectar'),'reconectar',/Reconectar/],[erroOAuth('credencial_recusada'),'erro',/Secrets do Supabase/],
  [erroOAuth('falta_configurar'),'falta_configurar',/Secrets do Supabase/],[new Error('invalid_grant: texto do provedor'),'erro',/A próxima coleta tenta de novo/]];
 for(const [e,estado,aviso] of casos){
  const t=montar({cx:conexao({expira_em:venceEm(-DIA)}),renovar:()=>{throw e;}}),r=await t.rodar();
  assert.equal(r.estado,estado,e.message);assert.equal(t.chamadas.length,0);assert.equal(renovacoes.length,1);
  assert.match(r.avisos.join(' '),aviso);
  // Texto do provedor não vai para a tela nem para o diário.
  assert.ok(!(JSON.stringify(r)+t.logs.join(' ')).includes('texto do provedor'));
 }
});

test('a coletora já renova com 7 dias de folga: o conector não renova de novo nem repete o aviso', async()=>{
 const t=montar({cx:conexao({expira_em:venceEm(3*DIA),refresh_expira_em:venceEm(5*DIA)})}),r=await t.rodar();
 assert.equal(renovacoes.length,0);assert.equal(r.estado,'ok');assert.deepEqual(r.avisos,[]);
 assert.ok(t.chamadas.every(c=>c.headers.Authorization===`Bearer ${TOKEN}`));
});

test('renovação recusada com o token valendo mais uns minutos: coleta com ele e avisa', async()=>{
 const t=montar({cx:conexao({expira_em:venceEm(5*60_000)}),renovar:()=>{throw erroOAuth('reconectar');}}),r=await t.rodar();
 assert.equal(r.estado,'ok');assert.equal(r.conexao,undefined);
 assert.ok(t.chamadas.every(c=>c.headers.Authorization===`Bearer ${TOKEN}`));
 assert.match(r.avisos.join(' '),/Clique em Reconectar/);
});

test('vence durante a coleta: renova pelo renovar do mkt-oauth, usa o token novo e devolve a conexão para regravar', async()=>{
 const nova={access_token:TOKEN_NOVO,expira_em:venceEm(60*DIA),refresh_token:undefined};
 const t=montar({cx:conexao({expira_em:venceEm(5*60_000)}),renovar:()=>nova}),r=await t.rodar();
 assert.equal(renovacoes.length,1);
 const [fonte,cx,env,f,op]=renovacoes[0];
 assert.equal(fonte,'linkedin');assert.equal(cx.refresh_token,REFRESH);assert.equal(typeof f,'function');assert.equal(typeof op.agora,'number');
 // O mkt-oauth lê o env como função ou como objeto: vale dos dois jeitos.
 assert.equal(env('LINKEDIN_CLIENT_ID'),'id-ficticio');assert.equal(env.LINKEDIN_CLIENT_SECRET,'segredo-ficticio');assert.equal(env.get('LINKEDIN_CLIENT_ID'),'id-ficticio');
 assert.ok(t.chamadas.length>0&&t.chamadas.every(c=>c.headers.Authorization===`Bearer ${TOKEN_NOVO}`));
 // A renovação não devolveu refresh_token: o guardado continua (undefined não apaga).
 assert.equal(r.conexao.access_token,TOKEN_NOVO);assert.equal(r.conexao.refresh_token,REFRESH);assert.equal(r.conexao.conectado_por,'leo');
 assert.ok(!JSON.stringify(semConexao(r)).includes(TOKEN_NOVO));
});

test('sem aprovação de escopo de feed na conexão: nenhuma chamada de reações, parte parcial', async()=>{
 const t=montar({cx:conexao({escopos:['rw_organization_admin','r_organization_social']})}),r=await t.rodar();
 assert.equal(contar(t.chamadas,'/socialMetadata/'),0);assert.equal(r.partes.posts.estado,'parcial');assert.equal(r.partes.posts.motivo,L.MOTIVOS.sem_escopo);
 assert.match(r.avisos.join(' '),/r_organization_social_feed/);
});

test('prazo curto: nenhuma chamada nova começa, estado parcial com o que já veio', async()=>{
 let t=montar({prazo:()=>10_000}),r=await t.rodar();
 assert.equal(t.chamadas.length,0);assert.equal(r.estado,'parcial');assert.match(r.avisos.join(' '),/tempo da coleta/);
 t=montar({prazo:ch=>ch.length<3?100_000:1_000});r=await t.rodar();
 assert.equal(t.chamadas.length,3);assert.equal(r.estado,'parcial');
 assert.equal(r.partes.pagina.estado,'ok');assert.equal(r.partes.seguidores.estado,'parcial');assert.equal(r.partes.visitas.motivo,L.MOTIVOS.prazo);
});

test('cota do dia já gasta por outras coletas (ctx.chamadasHoje): não chama e diz por quê', async()=>{
 const t=montar({chamadasHoje:95}),r=await t.rodar();
 assert.equal(t.chamadas.length,0);assert.equal(r.estado,'parcial');assert.match(r.avisos.join(' '),/cota do dia/);
 assert.ok(Object.values(r.partes).every(p=>p.estado==='erro'&&p.motivo===L.MOTIVOS.orcamento));assert.equal(Object.keys(r.partes).length,5);
});

// Uma Página com muitos posts: 30 nos últimos 60 dias, 1 em cada 3 é vídeo.
function muitosPosts(n=30){
 const elements=[];for(let i=0;i<n;i++){const ms=msDia('2026-10-13')-i*DIA-3_600_000;const video=i%3===0;
  elements.push({id:`urn:li:${video?'ugcPost':'share'}:71000000000000000${String(i).padStart(2,'0')}`,lifecycleState:'PUBLISHED',publishedAt:ms,createdAt:ms,
   distribution:{feedDistribution:'MAIN_FEED'},content:video?{media:{id:'urn:li:video:FICTICIO'+i}}:{}});}
 return url=>rota(url)==='/posts'?{paging:{start:0,count:100,links:[]},elements}:ehPorPost(url)?{elements:[]}:respostaPadrao(url);
}

test('orçamento por execução: nunca passa de 40 chamadas, e o detalhe por post tem teto', async()=>{
 const t=montar({responder:muitosPosts()}),r=await t.rodar();
 assert.ok(t.chamadas.length<=L.ORCAMENTO_CHAMADAS,`${t.chamadas.length} chamadas`);
 assert.equal(contar(t.chamadas,'/socialMetadata/'),15);
 assert.equal(contar(t.chamadas,'/videoAnalytics'),12);
 assert.equal(contar(t.chamadas,'shares=List('),2); // 30 posts em lotes de 20
 assert.equal(r.dados.cota.usadas,t.chamadas.length);assert.equal(r.dados.cota.teto_dia,100);
 assert.equal(r.publicacoes.length,30);
});

test('orçamento menor (o dia já gastou 70): corta o detalhe na chamada 20 e avisa', async()=>{
 const t=montar({responder:muitosPosts(),chamadasHoje:70}),r=await t.rodar();
 assert.equal(t.chamadas.length,20);assert.equal(r.dados.cota.orcamento,20);
 assert.equal(r.partes.posts.estado,'parcial');assert.equal(r.partes.posts.motivo,L.MOTIVOS.orcamento);
 assert.match(r.avisos.join(' '),/usou as 20 chamadas/);
 assert.equal(contar(t.chamadas,'/videoAnalytics'),0);
 // O essencial veio antes do detalhe: as semanas e as publicações estão completas.
 assert.equal(r.semanas.length,8);assert.equal(r.publicacoes.length,30);
});

test('lista de posts paginada com teto de 3 páginas', async()=>{
 const pagina=start=>({paging:{start,count:100,links:[{rel:'next',href:`/rest/posts?q=author&start=${start+100}`}]},
  elements:Array.from({length:100},(_,i)=>({id:`urn:li:share:72${String(start+i).padStart(15,'0')}`,lifecycleState:'PUBLISHED',publishedAt:msDia('2026-10-13')-((start+i)%50)*DIA,distribution:{feedDistribution:'MAIN_FEED'},content:{}}))});
 const t=montar({responder:url=>rota(url)==='/posts'?pagina(Number(new URL(url).searchParams.get('start')||0)):ehPorPost(url)?{elements:[]}:respostaPadrao(url)}),r=await t.rodar();
 const lista=t.chamadas.filter(c=>rota(c.url)==='/posts');
 assert.equal(lista.length,3);assert.deepEqual(lista.map(c=>new URL(c.url).searchParams.get('start')),[null,'100','200']);
 assert.match(r.avisos.join(' '),/mais posts/);
});

test('ugcPosts=List(...) recusado com 400: refaz o lote no formato indexado', async()=>{
 const t=montar({responder:url=>ehPorPost(url)&&url.includes('ugcPosts=List(')?falha(400):respostaPadrao(url)}),r=await t.rodar();
 const lotes=t.chamadas.filter(c=>ehPorPost(c.url));
 assert.equal(lotes.length,2);assert.match(lotes[1].url,/ugcPosts\[0\]=urn%3Ali%3AugcPost%3A7000000000000000002&ugcPosts\[1\]=urn%3Ali%3AugcPost%3A7000000000000000006/);
 assert.equal(r.partes.posts.estado,'ok');
 assert.equal(r.publicacoes.find(p=>p.url.endsWith('7000000000000000002')).impressoes,1200);
});

test('sem canal do LinkedIn ativo: coleta para a tela, mas nada vai para as semanas e publicações', async()=>{
 const t=montar({canais:[{codigo:'site',url_perfil:'https://exemplo.com.br'}]}),r=await t.rodar();
 assert.equal(r.estado,'ok');assert.deepEqual([r.semanas,r.publicacoes],[[],[]]);
 assert.ok(r.dados.seguidores);assert.match(r.avisos.join(' '),/Nenhum canal ativo do LinkedIn/);
 assert.equal(r.faxina.canal,'linkedin');
});

test('canal achado pelo link do perfil, com outro código: semanas, publicações e faxina usam o código dele', async()=>{
 const t=montar({canais:[{codigo:'linkedin-empresa',url_perfil:'https://br.linkedin.com/company/empresa-exemplo'}]}),r=await t.rodar();
 assert.equal(r.faxina.canal,'linkedin-empresa');
 assert.ok(r.semanas.every(l=>l.canal==='linkedin-empresa'));assert.ok(r.publicacoes.every(p=>p.canal==='linkedin-empresa'));
});

test('dados da Página que não vieram: a parte vai parcial só com o que a lista de Páginas disse', async()=>{
 const t=montar({responder:comFalha(url=>rota(url)==='/organizations/90000001',falha(500))}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.equal(r.partes.pagina.estado,'parcial');
 assert.deepEqual(r.dados.pagina,{urn:ORG,id:'90000001'});
 // O nome da conta continua o da conexão (e a coleta segue inteira).
 assert.equal(r.conta,'Empresa Exemplo Ltda');assert.equal(r.partes.posts.estado,'ok');assert.equal(r.semanas.length,8);
});

// ------------------------------------------------------------ o caminho bom --

test('coleta completa: estado ok, partes ok, 19 chamadas, todas GET com os cabeçalhos da versão', async()=>{
 const t=montar(),r=await t.rodar();
 assert.equal(r.estado,'ok');assert.equal(r.conta,'Empresa Exemplo Ltda');
 assert.deepEqual(Object.keys(r.partes).sort(),['conteudo','pagina','posts','seguidores','visitas']);
 assert.ok(Object.values(r.partes).every(p=>p.estado==='ok'&&typeof p.coletado_em==='string'));
 assert.equal(t.chamadas.length,19);
 for(const c of t.chamadas){
  assert.equal(c.method,'GET');assert.equal(c.body,undefined);assert.ok(c.url.startsWith('https://api.linkedin.com/rest/'));
  assert.equal(c.headers['LinkedIn-Version'],'202609');assert.equal(c.headers['X-Restli-Protocol-Version'],'2.0.0');
  assert.equal(c.headers.Authorization,`Bearer ${TOKEN}`);assert.match(c.rotulo,/^linkedin:/);
 }
 assert.equal(L.VERSAO_API,'202609');
 const posts=t.chamadas.find(c=>rota(c.url)==='/posts');
 assert.equal(posts.headers['X-RestLi-Method'],'FINDER');assert.match(posts.url,new RegExp(`author=${ORG_ENC}&q=author&count=100&sortBy=CREATED`));
 const seg=t.chamadas.find(c=>c.url.includes('/organizationalEntityFollowerStatistics')&&c.url.includes('timeIntervals'));
 assert.ok(seg.url.endsWith(`organizationalEntity=${ORG_ENC}&timeIntervals=(timeRange:(start:${msDia('2026-08-17')},end:${msDia('2026-10-13')}),timeGranularityType:DAY)`));
 assert.ok(t.chamadas.some(c=>c.url.endsWith(`/networkSizes/${ORG_ENC}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`)));
 assert.equal(r.conexao,undefined);assert.equal(r.dados.cota.usadas,19);
});

test('nada de token, segredo, texto ou título de post fora do cofre (dados, avisos, diário)', async()=>{
 const t=montar(),r=await t.rodar(),fora=JSON.stringify(r)+t.logs.join('\n');
 for(const s of [TOKEN,REFRESH,'segredo-ficticio','TEXTO-DO-POST','TITULO-DE-MIDIA','TITULO-DE-ARTIGO'])assert.ok(!fora.includes(s),s);
 assert.ok(!/[\u2013\u2014]/.test(r.avisos.join(' ')+t.logs.join(' ')));
});

test('semanas: as 8 FECHADAS, segunda-feira, só o que foi medido, nunca conversas nem leads', async()=>{
 const r=await montar().rodar();
 assert.deepEqual(r.semanas.map(l=>l.semana),['2026-10-05','2026-09-28','2026-09-21','2026-09-14','2026-09-07','2026-08-31','2026-08-24','2026-08-17']);
 // Numa quarta, seguidores não vai para a semana (só na segunda, ver o teste
 // dos seguidores); a estimativa fica na tela: total de hoje (1500) menos o
 // ganho de 12/10 (o dia da semana atual que já chegou).
 for(const l of r.semanas)assert.deepEqual(l.numeros,{alcance:420,impressoes:700,engajamento:77,cliques:35});
 for(const l of r.semanas){assert.equal('conversas' in l.numeros,false);assert.equal('leads' in l.numeros,false);assert.equal(l.canal,'linkedin');}
 const d=r.dados;
 assert.deepEqual(d.seguidores.semanas[0],{semana:'2026-10-05',ganho:28,organicos:21,pagos:7,total_fim:1496});
 assert.equal(d.seguidores.semanas[1].total_fim,null);
 assert.equal(d.seguidores.pronto_ate,'2026-10-12');assert.equal(d.seguidores.total,1500);
 assert.deepEqual(d.visitas.semanas[0],{semana:'2026-10-05',visualizacoes:70,inicio:42,cliques_botao:7});
 assert.equal(d.conteudo.semanas[0].taxa,0.11);
 // A série diária vai do início da 8a semana até ontem.
 assert.equal(d.conteudo.por_dia[0].dia,'2026-08-17');assert.equal(d.conteudo.por_dia.at(-1).dia,'2026-10-13');
 assert.equal(d.visitas.por_dia[0].dia,'2026-08-17');
});

test('publicações: link do post, dia de São Paulo, SEM título, números do post e zero só para o post que a API não devolve', async()=>{
 const r=await montar().rodar();
 assert.deepEqual(r.publicacoes,[
  {canal:'linkedin',url:'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001',data:'2026-10-12',titulo:null,impressoes:800,alcance:500,engajamento:56,cliques:20},
  {canal:'linkedin',url:'https://www.linkedin.com/feed/update/urn:li:ugcPost:7000000000000000002',data:'2026-10-08',titulo:null,impressoes:1200,engajamento:64,cliques:15},
  // 01/10 às 02:30 UTC ainda é 30/09 em São Paulo.
  {canal:'linkedin',url:'https://www.linkedin.com/feed/update/urn:li:ugcPost:7000000000000000006',data:'2026-09-30',titulo:null,impressoes:300,alcance:200,engajamento:10,cliques:1},
  {canal:'linkedin',url:'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000003',data:'2026-09-20',titulo:null,impressoes:0,alcance:0,engajamento:0,cliques:0},
 ]);
 const p=r.dados.posts;
 assert.equal(p.desde,'2026-08-15');assert.deepEqual(p.ignorados,{nao_publicados:1,sem_feed:1});
 assert.deepEqual(p.itens.map(i=>i.tipo),['texto','video','imagem','artigo']);
 assert.deepEqual(p.itens[0].reacoes,{LIKE:20,PRAISE:5,ENTERTAINMENT:2,CELEBRATION:1});
 assert.equal(p.itens[0].reacoes_total,28);assert.equal(p.itens[0].comentarios_total,6);assert.equal(p.itens[0].comentarios_principais,4);
 assert.deepEqual(p.itens[1].video,{visualizacoes:42,espectadores:42,tempo_das_visualizacoes_ms:42,tempo_assistido_ms:42});
 assert.equal(p.itens[0].video,null);
 for(const i of p.itens){assert.equal('commentary' in i,false);assert.equal('titulo' in i,false);}
});

test('estatística por post que falhou: a publicação vai sem números (não zera o que foi lançado à mão)', async()=>{
 const t=montar({responder:comFalha(url=>ehPorPost(url),falha(500))}),r=await t.rodar();
 assert.equal(r.partes.posts.estado,'parcial');assert.equal(r.partes.posts.motivo,L.MOTIVOS.estatistica);
 assert.ok(r.publicacoes.length===4&&r.publicacoes.every(p=>Object.keys(p).sort().join()==='canal,data,titulo,url'));
});

test('dados da página e perfis acumulados', async()=>{
 const d=(await montar().rodar()).dados;
 assert.deepEqual(d.pagina,{urn:ORG,id:'90000001',nome:'Empresa Exemplo Ltda',vanity:'empresa-exemplo',url:'https://www.linkedin.com/company/empresa-exemplo',
  site:'https://exemplo.com.br',porte:'SIZE_11_TO_50',setores:['urn:li:industry:83'],tipo:'PRIVATELY_HELD'});
 const ps=d.seguidores.perfil;
 assert.deepEqual(ps.pais,[{codigo:'urn:li:geo:90000102',n:900},{codigo:'urn:li:geo:90000101',n:40}]); // organicFollowerCount, sem somar o pago
 assert.deepEqual(ps.porte.map(x=>x.rotulo),['11 a 50','10001 ou mais','1']);
 assert.deepEqual(ps.vinculo,[{codigo:'EMPLOYEE',n:12}]);
 const v=d.visitas.desde_sempre;
 assert.deepEqual(v.vistas.total,{visualizacoes:5000,unicas:2100});assert.deepEqual(v.vistas.vagas,{visualizacoes:30,unicas:20});
 assert.deepEqual(v.vistas.outras,{aboutPageViews:{visualizacoes:400,unicas:300}});
 assert.deepEqual(v.cliques_botao,{computador:7,celular:0});
 assert.deepEqual(d.visitas.perfil.setor,[{codigo:'urn:li:industry:83',n:350}]);
 assert.deepEqual(d.conteudo.desde_sempre,{impressoes:90000,alcance:41000,cliques:2100,curtidas:1500,comentarios:120,compartilhamentos:60,engajamento:3780,taxa:0.042});
});

// --------------------------------------- leitores, com o exemplo da documentação --

test('O CASO RUIM dos leitores: resposta vazia ou torta vira null ou lista vazia, nunca zero', ()=>{
 assert.equal(L.lerTotalSeguidores({}),null);assert.equal(L.lerTotalSeguidores({firstDegreeSize:-3}),null);assert.equal(L.lerTotalSeguidores(null),null);
 assert.equal(L.lerGanhosPorDia({}).size,0);assert.equal(L.lerConteudoTotal({elements:[]}),null);
 // Data torta (fora do que o Date aguenta) não derruba a coleta: o item sai.
 assert.equal(L.lerGanhosPorDia({elements:[{timeRange:{start:1e20},followerGains:{organicFollowerGain:1,paidFollowerGain:0}}]}).size,0);
 assert.deepEqual(L.lerPosts({elements:[{id:'urn:li:share:1',lifecycleState:'PUBLISHED',publishedAt:1e20}]}).itens,[]);
 assert.equal(L.lerPerfilSeguidores({elements:[]}),null);assert.equal(L.lerVisitasDesdeSempre({}),null);
 assert.equal(L.lerSocialMetadata(null),null);assert.equal(L.lerVideo({elements:[]}),null);
 // Impressão sem o campo de únicos: alcance desconhecido, não zero.
 assert.equal(L.lerNumerosConteudo({impressionCount:50,clickCount:1,likeCount:0,commentCount:0,shareCount:0}).alcance,null);
 // Dia sem careersPageViews (só para quem paga Career Pages): null.
 const v=L.lerVisitasPorDia({elements:[{timeRange:{start:msDia('2026-10-01')},totalPageStatistics:{views:{allPageViews:{pageViews:3}}}}]}).get('2026-10-01');
 assert.equal(v.carreiras,null);assert.equal(v.cliques_botao_computador,null);assert.equal(v.unicas,null);
 // Ganho com um dos dois lados faltando: total desconhecido.
 assert.equal(L.lerGanhosPorDia({elements:[{timeRange:{start:msDia('2026-10-01')},followerGains:{organicFollowerGain:2}}]}).get('2026-10-01').total,null);
});

test('doc: seguidores por dia somam orgânico e pago, no dia UTC', ()=>{
 const m=L.lerGanhosPorDia(fx('doc-seguidores-por-dia'));
 assert.deepEqual(m.get('2018-09-08'),{dia:'2018-09-08',organicos:223,pagos:12,total:235});
 assert.deepEqual(m.get('2018-09-09'),{dia:'2018-09-09',organicos:1,pagos:2,total:3});
});

test('doc: conteúdo por dia aceita o "uniqueImpressionsCounts" do exemplo e o zero sem impressão', ()=>{
 const m=L.lerConteudoPorDia(fx('doc-conteudo-por-dia'));
 assert.deepEqual(m.get('2016-01-01'),{dia:'2016-01-01',impressoes:331,alcance:203,cliques:0,curtidas:0,comentarios:0,compartilhamentos:0,engajamento:0,taxa:0});
 assert.equal(m.get('2016-01-02').alcance,0);
});

test('doc: estatística por post; engajamento é a soma, a taxa vem do LinkedIn', ()=>{
 const n=L.lerEstatisticasPorPost(fx('doc-estatistica-por-post')).get('urn:li:share:1000000');
 assert.deepEqual(n,{impressoes:5287,alcance:null,cliques:78,curtidas:14,comentarios:24,compartilhamentos:5,engajamento:121,taxa:0.022886324947985624});
});

test('doc: visitas por dia só com os campos confirmados; zero de verdade continua zero', ()=>{
 const v=L.lerVisitasPorDia(fx('doc-visitas-por-dia')).get('2016-01-07');
 assert.deepEqual(v,{dia:'2016-01-07',visualizacoes:0,unicas:0,inicio:0,inicio_unicas:0,carreiras:0,carreiras_unicas:0,cliques_botao_computador:0,cliques_botao_celular:0});
});

test('doc: networkSizes, posts e socialMetadata', ()=>{
 assert.equal(L.lerTotalSeguidores(fx('doc-network-sizes')),219145);
 const p=L.lerPosts(fx('doc-posts'));
 assert.deepEqual(p.itens,[{urn:'urn:li:share:6856921137721544704',url:'https://www.linkedin.com/feed/update/urn:li:share:6856921137721544704',
  data:hojeSP(new Date(1634817394721)),publicado_em:new Date(1634817394721).toISOString(),tipo:'texto',patrocinado:false}]);
 assert.equal(L.lerPosts(fx('doc-posts'),'2026-08-15').itens.length,0);
 assert.deepEqual(L.lerSocialMetadata(fx('doc-social-metadata')),{reacoes:{EMPATHY:1},reacoes_total:1,comentarios_total:4,comentarios_principais:3});
});

test('organizationAcls: aceita "organization" e "organizationTarget", só ADMINISTRATOR aprovado, sem repetir', ()=>{
 assert.deepEqual(L.lerAcl(fx('acl-variantes')),[{urn:'urn:li:organization:90000002',id:'90000002'}]);
 assert.deepEqual(L.lerAcl(fx('acl')),[{urn:ORG,id:'90000001'}]);
 assert.deepEqual(L.lerAcl({}),[]);
});

test('classificarErro: cada status no seu estado', ()=>{
 const c=(status,corpo)=>L.classificarErro({status,corpo});
 assert.equal(c(401,fx('erro-401')),'reconectar');assert.equal(c(403,fx('erro-403')),'sem_permissao');
 assert.equal(c(429),'cota');assert.equal(c(426,fx('erro-426')),'versao');assert.equal(c(400,{code:'VERSION_MISSING'}),'versao');
 assert.equal(c(400,{message:'Requested version 202301 is not active'}),'versao');
 assert.equal(c(400,{message:'Invalid param'}),'formato');assert.equal(c(500),'falhou');assert.equal(c(null),'falhou');
 assert.deepEqual(L.lerFalha(new Error('HTTP 403 Forbidden')),{status:403,corpo:null});
});

test('o caso ruim: seguidores vai para a semana só na segunda logo depois dela, com o total lido; nos outros dias a estimativa não troca o retrato', async()=>{
 // A semana termina com 1000; entram 2 por dia e sai 1 na quarta (que os
 // ganhos não descontam). Os ganhos chegam com 2 dias de atraso.
 const ganhos=new Map([['2026-10-12',{total:2}],['2026-10-13',{total:2}],['2026-10-14',{total:2}],['2026-10-15',{total:2}],['2026-10-16',{total:2}]]);
 const totalNoDia={'2026-10-12':1000,'2026-10-13':1002,'2026-10-14':1004,'2026-10-15':1005,'2026-10-16':1007,'2026-10-17':1009,'2026-10-18':1011};
 const atrasado=(hoje)=>new Map([...ganhos].filter(([d])=>d<=new Date(Date.parse(`${hoje}T12:00:00Z`)-2*DIA).toISOString().slice(0,10)));
 const gravado={};
 for(const [hoje,total] of Object.entries(totalNoDia)){
  const s=L.montarSemanas({hoje,total,ganhos:atrasado(hoje)});
  const l=s.linhas.find(x=>x.semana==='2026-10-05');
  if(l&&'seguidores' in l.numeros)gravado[hoje]=l.numeros.seguidores;
  assert.ok(s.linhas.filter(x=>x.semana!=='2026-10-05').every(x=>!('seguidores' in x.numeros)),hoje);
 }
 assert.deepEqual(gravado,{'2026-10-12':1000},'só a segunda grava, e grava o retrato');
 // Pelo conector inteiro: segunda vai com o total lido; quarta não vai.
 const seg=await montar({hoje:'2026-10-12'}).rodar();
 assert.equal(seg.semanas.find(x=>x.semana==='2026-10-05').numeros.seguidores,seg.dados.seguidores.total);
 const qua=await montar().rodar();
 assert.ok(qua.semanas.every(x=>!('seguidores' in x.numeros)));
});

test('montarSemanas: dia faltando deixa aquele número de fora da semana (nem zero, nem null mandado)', ()=>{
 const dias=new Map();
 for(let t=msDia('2026-08-17');t<msDia('2026-10-14');t+=DIA){const dia=new Date(t).toISOString().slice(0,10);
  if(dia==='2026-09-30')continue; // um dia que o LinkedIn não mandou
  dias.set(dia,{dia,impressoes:10,alcance:5,cliques:1,curtidas:1,comentarios:0,compartilhamentos:0,engajamento:2});}
 const s=L.montarSemanas({hoje:HOJE,conteudo:dias});
 const semana=s.linhas.find(l=>l.semana==='2026-09-28');assert.equal(semana,undefined);
 assert.equal(s.conteudo.find(l=>l.semana==='2026-09-28').impressoes,null);
 assert.deepEqual(s.linhas.find(l=>l.semana==='2026-10-05').numeros,{alcance:35,impressoes:70,engajamento:14,cliques:7});
 // Número negativo (descurtidas) não vai para o banco, que só aceita de 0 a 1 bilhão.
 const neg=new Map([...dias].map(([k,v])=>[k,{...v,engajamento:-1}]));
 const s2=L.montarSemanas({hoje:HOJE,conteudo:neg});
 assert.ok(s2.linhas.every(l=>!('engajamento' in l.numeros)));assert.ok(s2.fora_da_faixa.length>0);
});

test('dia que o LinkedIn não mandou vira aviso (e a semana dele fica sem o número)', async()=>{
 const sem30=url=>rota(url)==='/organizationalEntityShareStatistics'&&url.includes('timeIntervals=')?serie(url,dia=>dia==='2026-09-30'?null:conteudoDia()):respostaPadrao(url);
 const t=montar({responder:sem30}),r=await t.rodar();
 assert.match(r.avisos.join(' '),/não mandou 1 dia\(s\) de números dos posts/);
 // Sem número medido, a semana nem vai (nada de zero, nada de null que apague o lançado à mão).
 assert.equal(r.semanas.some(l=>l.semana==='2026-09-28'),false);assert.equal(r.semanas.length,7);
 assert.equal(r.dados.conteudo.semanas.find(l=>l.semana==='2026-09-28').impressoes,null);
 assert.equal(L.diasFaltando(new Map(),'2026-10-01'),0);
});

test('semanas fechadas: a semana atual nunca entra, nem no domingo, nem na segunda', ()=>{
 assert.equal(L.semanasFechadas('2026-10-12')[0],'2026-10-05');
 assert.equal(L.semanasFechadas('2026-10-11')[0],'2026-09-28');
 assert.equal(L.semanasFechadas(HOJE).length,8);
});

test('miudezas: janela do Rest.li, instante, escopos e o orçamento do dia', ()=>{
 assert.equal(L.janelaDia('2026-10-01','2026-10-02'),`timeIntervals=(timeRange:(start:${msDia('2026-10-01')},end:${msDia('2026-10-02')}),timeGranularityType:DAY)`);
 assert.equal(L.instante('2026-10-01T00:00:00Z'),msDia('2026-10-01'));assert.equal(L.instante(1790812800),1790812800000);assert.equal(L.instante(null),null);
 assert.equal(L.lerEscopos([]),null);assert.ok(L.lerEscopos('rw_organization_admin,r_organization_social').has('r_organization_social'));
 assert.equal(L.orcamentoDaRodada(undefined),40);assert.equal(L.orcamentoDaRodada(0),40);assert.equal(L.orcamentoDaRodada(70),20);assert.equal(L.orcamentoDaRodada(200),0);
 assert.equal(L.acharCanal([{codigo:'x',url_perfil:'https://evil.com/linkedin.com'}]),null);
});

// ------------------------------------------------------------- guardas --

test('o arquivo: FORMATO no topo, sem travessão, sem import de npm, só GET para a API, faxina do contrato', ()=>{
 assert.match(FONTE_JS.slice(0,4000),/=+ FORMATO =+/);
 assert.ok(!/[\u2013\u2014]/.test(FONTE_JS),'travessão no conector');
 assert.ok(!/[\u2013\u2014]/.test(readFileSync(new URL(import.meta.url),'utf8')),'travessão no teste');
 const imports=[...FONTE_JS.matchAll(/^import .* from '([^']+)';$/gm)].map(m=>m[1]);
 assert.deepEqual(imports,['../marketing.mjs','../mkt-oauth.mjs']);
 assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(FONTE_JS));
 assert.ok(IMPORT_OAUTH.test(FONTE_JS));
 assert.deepEqual(L.FAXINA,{canal:'linkedin',dias_numeros:365,dias_titulo:180});
 assert.equal(L.FONTE,'linkedin');assert.deepEqual(L.SECRETS,['LINKEDIN_CLIENT_ID','LINKEDIN_CLIENT_SECRET']);
});

const OAUTH=new URL('../supabase/functions/_shared/mkt-oauth.mjs',import.meta.url);
const semOauth={skip:existsSync(OAUTH)?false:'mkt-oauth.mjs ainda não existe (outra peça)'};
test('o mkt-oauth.mjs, quando existir, exporta o renovar que o conector importa', semOauth, async()=>{
 const m=await import(pathToFileURL(fileURLToPath(OAUTH)).href);
 assert.equal(typeof m.renovar,'function');
});

test('com o mkt-oauth.mjs de verdade: a renovação vai ao LinkedIn com o env do ctx e a conexão nova volta', semOauth, async()=>{
 // O conector empacotado SEM a troca do import, e o fetch global de mentira
 // só durante este teste (é por ele que a renovação sai).
 const real=buildSync({stdin:{contents:FONTE_JS,loader:'js',resolveDir:fileURLToPath(DIR),sourcefile:'linkedin.mjs'},bundle:true,write:false,format:'esm',platform:'node'}).outputFiles[0].text;
 const LR=await import('data:text/javascript;base64,'+Buffer.from(real).toString('base64'));
 const pedidos=[],antes=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{pedidos.push({url,init});
  return new Response(JSON.stringify({access_token:TOKEN_NOVO,expires_in:5184000,scope:ESCOPOS.join(',')}),{status:200,headers:{'content-type':'application/json'}});};
 try{
  const t=montar({cx:conexao({expira_em:venceEm(5*60_000)})});
  const r=await LR.coletar(t.ctx);
  assert.equal(pedidos.length,1);assert.equal(pedidos[0].url,'https://www.linkedin.com/oauth/v2/accessToken');assert.equal(pedidos[0].init.method,'POST');
  const corpo=new URLSearchParams(pedidos[0].init.body);
  assert.equal(corpo.get('grant_type'),'refresh_token');assert.equal(corpo.get('refresh_token'),REFRESH);assert.equal(corpo.get('client_id'),'id-ficticio');
  assert.ok(pedidos[0].init.signal,'renovação sem teto de tempo');
  assert.equal(r.estado,'ok');assert.equal(r.conexao.access_token,TOKEN_NOVO);assert.equal(r.conexao.refresh_token,REFRESH);
  assert.ok(t.chamadas.every(c=>c.headers.Authorization===`Bearer ${TOKEN_NOVO}`));
 }finally{globalThis.fetch=antes;}
});

test('o caso ruim (revisão de 12/10): número fora da faixa vira frase para gente; a chave interna e a data ISO ficam no diário', () => {
  assert.equal(L.avisoDeForaDaFaixa(['impressoes 2026-09-28']), 'Um número veio fora da faixa e ficou de fora: as impressões da semana de 28/09.');
  assert.equal(L.avisoDeForaDaFaixa(['seguidores 2026-09-28', 'cliques 2026-10-05', 'numero_novo 2026-10-05']),
    'Alguns números vieram fora da faixa e ficaram de fora: os seguidores da semana de 28/09, os cliques da semana de 05/10 e um número da semana de 05/10.');
  for (const a of [L.avisoDeForaDaFaixa(['engajamento 2026-09-28'])]) assert.equal(/impressoes|\d{4}-\d{2}-\d{2}|_/.test(a), false, a);
  assert.equal(L.avisoDeForaDaFaixa([]), null);
});
