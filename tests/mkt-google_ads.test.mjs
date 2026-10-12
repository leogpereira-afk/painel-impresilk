// O conector do Google Ads (_shared/mkt-fontes/google_ads.mjs), rodado de
// verdade com um fetchJson de mentira e as respostas fictícias de
// tests/fixtures/mkt-google_ads/ (formato REST da v25). Nenhuma chamada sai
// para a rede, e nenhum segredo mora aqui: a chave RSA da conta de serviço é
// gerada na hora e jogada fora no fim.
// Começa pelo caso ruim: credencial morta, projeto sem aprovação, consulta
// recusada, tempo esgotado, cota, rede, e o que não pode vazar.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as G from '../supabase/functions/_shared/mkt-fontes/google_ads.mjs';

const DIR = new URL('./fixtures/mkt-google_ads/', import.meta.url);
const fx = (n) => JSON.parse(readFileSync(new URL(`${n}.json`, DIR), 'utf8'));
const HOJE = '2026-10-11';
const TOKEN = 'ya29.TOKEN-FICTICIO-DO-TESTE';
const par = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256'}, true, ['sign','verify']);
const PKCS8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', par.privateKey)).toString('base64');
const PEM = `-----BEGIN PRIVATE KEY-----\n${PKCS8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
// token_uri de propósito errado: o conector tem de ignorar e usar o fixo.
const SA = {type:'service_account', project_id:'projeto-ficticio', private_key_id:'kid0ficticio', private_key:PEM, client_email:'painel-google-ads@projeto-ficticio.iam.gserviceaccount.com', token_uri:'https://exemplo.invalido/token'};
const SA_JSON = JSON.stringify(SA);
const TRAVESSAO = /[–—]/;

// rótulo da consulta -> fixture
const ROTAS = {contas:'contas-acessiveis', semanas:'semanas', conversoes_semana:'conversoes-semana', acoes:'acoes-conversao', campanhas_lista:'campanhas-lista',
 campanhas_dias:'campanhas-dias', ligacoes:'ligacoes', leads:'leads', dias:'dias', termos:'termos', palavras:'palavras', grupos:'grupos', anuncios:'anuncios',
 parcela:'parcela', chamadas:'chamadas', paginas:'paginas', cidades:'cidades', nomes_geo:'geo-nomes', horarios:'horarios', aparelhos:'aparelhos', idade:'idade',
 genero:'genero', termos_pmax:'termos-pmax', categorias:'categorias', pmax:'pmax', alteracoes:'alteracoes'};

function montar({env={GOOGLE_ADS_SA_JSON:SA_JSON}, rotas={}, prazo, anterior, embrulhar=false}={}){
 const chamadas=[], logs=[];
 const responder=(ch)=>{
  if(ch.nome in rotas){const r=rotas[ch.nome];return typeof r==='function'?r(ch,chamadas):structuredClone(r);}
  if(ch.nome==='token')return {status:200,ok:true,json:{access_token:TOKEN,expires_in:3599,token_type:'Bearer'}};
  // A consulta de reserva responde com a mesma fixture da principal.
  const id=/customers\/(\d+)\//.exec(ch.url)?.[1],base=ch.nome.replace(/_reserva$/,'');
  if(base==='conta')return fx(`conta-${id}`);
  if(base==='filhas')return fx(`filhas-${id}`);
  if(ROTAS[base])return fx(ROTAS[base]);
  return {results:[]};
 };
 const fetchJson=async(url,op={})=>{
  let corpo=null;try{corpo=op.headers?.['Content-Type']==='application/json'&&op.body?JSON.parse(op.body):null}catch{}
  const ch={url,nome:String(op.rotulo||'').replace(/^google_ads:/,''),rotulo:op.rotulo,method:op.method,headers:{...(op.headers||{})},body:op.body,query:corpo?.query??null,pageToken:corpo?.pageToken??null,corpo};
  chamadas.push(ch);
  const r=await responder(ch);
  // A coletora pode devolver o corpo já lido ou {status, ok, json}.
  return embrulhar&&!(r&&typeof r==='object'&&'ok' in r)?{status:200,ok:true,json:r}:r;
 };
 const ctx={env:(n)=>env[n]??null,conexao:null,fetchJson,prazo:prazo?()=>prazo(chamadas):()=>100_000,hoje:HOJE,canais:[{codigo:'site',url_perfil:'https://www.example.com'}],log:(t)=>logs.push(t),...(anterior?{anterior}:{})};
 return {ctx,chamadas,logs,rodar:()=>G.coletar(ctx)};
}
const erro=(status,nome)=>({status,ok:false,json:fx(nome)});
const nomes=(t)=>t.chamadas.map((c)=>c.nome);
const daAds=(t)=>t.chamadas.filter((c)=>c.url.startsWith('https://googleads.googleapis.com/'));
// Tudo que sai do conector, num texto só, para procurar vazamento.
const tudo=(t,r)=>JSON.stringify(r)+'\n'+t.logs.join('\n')+'\n'+t.chamadas.map((c)=>c.rotulo).join('\n');

// ------------------------------------------------------------- caso ruim --

test('o caso ruim: sem o secret, falta_configurar e nenhuma chamada', async()=>{
 const t=montar({env:{}}),r=await t.rodar();
 assert.equal(r.estado,'falta_configurar');assert.equal(t.chamadas.length,0);
 // A frase vai uma vez, no motivo da parte (com o estado da fonte), e não se
 // repete em "avisos" (revisão de 12/10).
 assert.match(r.partes.conta.motivo,/GOOGLE_ADS_SA_JSON/);assert.equal(r.partes.conta.codigo,'sem_secret');
 assert.equal(r.partes.conta.estado,'falta_configurar');assert.deepEqual(r.avisos,[]);
 assert.deepEqual(r.dados,{});assert.deepEqual(r.semanas,[]);assert.deepEqual(r.publicacoes,[]);assert.equal(r.conexao,undefined);
});

test('o caso ruim: o motivo da parte chega à tela como frase, e o código vai em "codigo" (antes a tela recebia "parada" e "sem_secret")', async()=>{
 // client_email e private_key são os campos do arquivo que o Léo cola: a frase os cita de propósito.
 const frase=(m)=>typeof m==='string'&&/[.]$/.test(m)&&!/^[a-z_]+$/.test(m)&&!/\b(?!client_email\b|private_key\b)[a-z]+_[a-z_]+\b/.test(m)&&!TRAVESSAO.test(m);
 const sem=await montar({env:{}}).rodar();
 assert.deepEqual([sem.partes.conta.codigo,sem.partes.conta.motivo],['sem_secret','Falta cadastrar o GOOGLE_ADS_SA_JSON nos secrets do Supabase (o arquivo JSON da conta de serviço).']);
 // Coleta que parou no meio (projeto sem o nível Explorer): o quadro que não
 // veio diz POR QUE a coleta parou, que é o que destrava.
 const parou=await montar({rotas:{acoes:erro(403,'erro-aprovacao')}}).rodar();
 assert.equal(parou.partes.termos.codigo,'parada');
 assert.match(parou.partes.termos.motivo,/nível Explorer/);
 let vistos=0;
 for(const r of [sem,parou,await montar({rotas:{chamadas:erro(400,'erro-consulta')}}).rodar(),await montar({prazo:(ch)=>(ch.length<8?100_000:1000)}).rodar()]){
  for(const [nome,p] of Object.entries(r.partes)){
   if(!('codigo' in p)){assert.equal('motivo' in p,false,nome);continue;}
   vistos++;
   assert.ok(frase(p.motivo),`${nome}: "${p.motivo}"`);
   assert.notEqual(p.motivo,p.codigo);
  }
 }
 assert.ok(vistos>=10,String(vistos));
 for(const c of ['falhou','sem_tempo','grande_demais','limite_segundo','sem_resposta','recusada','parada','sem_secret','json_invalido','chave_formato','chave_recusada','token_recusado','token_pedido_invalido','token_sem_valor','api_desativada','projeto_sem_aprovacao','sem_contas','sem_acesso_na_conta','id_cliente_invalido','conta_desativada','sem_conta_comum','cota','permissao','outro'])assert.ok(frase(G.fraseDoMotivo(c)),c);
});

test('o caso ruim: JSON errado vira falta_configurar, sem chamada e sem repetir o que foi colado', async()=>{
 const casos=[
  ['{"private_key":"SEGREDO-COLADO-ERRADO"', 'json_invalido'],
  [JSON.stringify({type:'authorized_user',client_email:'a@b.com',private_key:'SEGREDO-COLADO-ERRADO'}), 'json_invalido'],
  [JSON.stringify({...SA,client_email:''}), 'json_invalido'],
  [JSON.stringify({...SA,private_key:'-----BEGIN PRIVATE KEY-----\nSEGREDO-COLADO-ERRADO\n-----END PRIVATE KEY-----'}), 'chave_formato'],
  [JSON.stringify({...SA,private_key:'-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----'}), 'chave_formato'],
 ];
 for(const [valor,motivo] of casos){
  const t=montar({env:{GOOGLE_ADS_SA_JSON:valor}}),r=await t.rodar();
  assert.equal(r.estado,'falta_configurar',motivo);assert.equal(r.partes.conta.codigo,motivo);assert.equal(t.chamadas.length,0);
  assert.equal(tudo(t,r).includes('SEGREDO-COLADO-ERRADO'),false);
 }
});

test('o caso ruim: chave recusada no token vira reconectar, uma chamada só, sem tocar no Google Ads', async()=>{
 const t=montar({rotas:{token:erro(400,'erro-token')}}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.deepEqual(nomes(t),['token']);
 assert.equal(r.partes.conta.codigo,'chave_recusada');assert.match(r.partes.conta.motivo,/chave JSON nova/);
 assert.equal(r.partes.conta.estado,'reconectar');assert.equal(r.avisos.includes(r.partes.conta.motivo),false,'a frase não se repete como aviso');
 assert.deepEqual(r.dados,{},'a parte boa da coleta anterior fica com a coletora');
 assert.equal(tudo(t,r).includes('Invalid JWT Signature'),false,'texto do provedor não sai');
 // Rede fora no token: erro, não reconectar (a chave pode estar boa).
 const t2=montar({rotas:{token:{status:503,ok:false,json:null}}}),r2=await t2.rodar();
 assert.equal(r2.estado,'erro');assert.equal(t2.chamadas.length,1);
});

test('o caso ruim: projeto sem o nível Explorer vira aguardando_aprovacao e para na primeira consulta', async()=>{
 const t=montar({rotas:{conta:erro(403,'erro-aprovacao')}}),r=await t.rodar();
 assert.equal(r.estado,'aguardando_aprovacao');assert.deepEqual(nomes(t),['token','contas','conta']);
 // A parte "conta" fica no MESMO estado da fonte (era "erro": a linha dizia
 // "Conta: Erro na coleta" ao lado do selo "Aguardando aprovação"), e a frase
 // dela não se repete em "avisos" (o "1 aviso" dizia a mesma coisa de novo).
 assert.equal(r.partes.conta.estado,'aguardando_aprovacao');
 assert.match(r.partes.conta.motivo,/nível Explorer/);assert.equal(r.partes.conta.codigo,'projeto_sem_aprovacao');
 assert.equal(r.avisos.some((a)=>/nível Explorer/.test(a)),false,r.avisos.join(' | '));
 assert.equal(tudo(t,r).includes('Detalhe interno'),false);
 // A mesma recusa no meio da coleta: para ali, sem mais nenhum pedido.
 const t2=montar({rotas:{acoes:erro(403,'erro-aprovacao')}}),r2=await t2.rodar();
 assert.equal(r2.estado,'aguardando_aprovacao');assert.equal(nomes(t2).at(-1),'acoes');
 assert.equal(r2.partes.resumo.estado,'ok','o que já veio fica');assert.equal(r2.partes.termos.codigo,'parada');
});

test('o caso ruim: 401 no meio vira reconectar e nada mais é pedido', async()=>{
 const t=montar({rotas:{campanhas_dias:erro(401,'erro-401')}}),r=await t.rodar();
 assert.equal(r.estado,'reconectar');assert.equal(nomes(t).at(-1),'campanhas_dias');
 assert.equal(t.chamadas.filter((c)=>c.nome==='campanhas_dias').length,1,'não repete');
 assert.equal(r.partes.campanhas.estado,'erro');assert.equal(r.dados.campanhas,undefined);
 // Erro LANÇADO pelo fetchJson, com a mensagem carregando a URL e o token.
 const t2=montar({rotas:{semanas:()=>{const e=new Error(`falhou ${G.VERSAO_API} Bearer ${TOKEN}`);e.status=401;throw e;}}}),r2=await t2.rodar();
 assert.equal(r2.estado,'reconectar');assert.equal(nomes(t2).at(-1),'semanas');assert.equal(tudo(t2,r2).includes(TOKEN),false);
});

test('o caso ruim: 403 de permissão numa consulta só, depois de outras darem certo, não vira "falta conectar"', async()=>{
 const t=montar({rotas:{chamadas:erro(403,'erro-sem-acesso')}}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.deepEqual(r.partes.chamadas,{estado:'erro',motivo:G.MOTIVOS.recusada,codigo:'recusada',coletado_em:null});
 assert.ok(nomes(t).includes('alteracoes'),'a coleta seguiu');assert.equal(r.partes.paginas.estado,'ok');
 // Na PRIMEIRA consulta da coleta, a mesma recusa é da conexão: para ali.
 const t2=montar({rotas:{semanas:erro(403,'erro-sem-acesso')}}),r2=await t2.rodar();
 assert.equal(r2.estado,'falta_conectar');assert.equal(nomes(t2).at(-1),'semanas');
 assert.ok(r2.avisos.some((a)=>a.includes(SA.client_email)));
});

test('o caso ruim: API desligada é falta_configurar; conta de serviço sem acesso é falta_conectar, com o e-mail dela', async()=>{
 const t=montar({rotas:{contas:erro(403,'erro-api-desativada')}}),r=await t.rodar();
 assert.equal(r.estado,'falta_configurar');assert.equal(r.partes.conta.codigo,'api_desativada');assert.deepEqual(nomes(t),['token','contas']);
 const t2=montar({rotas:{contas:{resourceNames:[]}}}),r2=await t2.rodar();
 assert.equal(r2.estado,'falta_conectar');assert.equal(r2.partes.conta.codigo,'sem_contas');
 assert.ok(r2.avisos.some((a)=>a.includes(SA.client_email)),'a tela mostra quem adicionar como Somente leitura');
 const t3=montar({rotas:{conta:erro(403,'erro-sem-acesso')}}),r3=await t3.rodar();
 assert.equal(r3.estado,'falta_conectar');assert.equal(r3.partes.conta.codigo,'sem_acesso_na_conta');
 // ID cadastrado errado (o número da tag no lugar do ID do cliente).
 const t4=montar({env:{GOOGLE_ADS_SA_JSON:SA_JSON,GOOGLE_ADS_CUSTOMER_ID:'AW-11004527401'}}),r4=await t4.rodar();
 assert.equal(r4.estado,'falta_configurar');assert.equal(r4.partes.conta.codigo,'id_cliente_invalido');assert.deepEqual(nomes(t4),['token']);
});

test('o caso ruim: consulta opcional recusada vira aviso e null; o resto segue e o estado continua ok', async()=>{
 const t=montar({rotas:{ligacoes:erro(400,'erro-consulta')}}),r=await t.rodar();
 assert.equal(r.estado,'ok');assert.ok(nomes(t).includes('alteracoes'),'seguiu até o fim');
 // O nome do erro da API vai só para o diário; o aviso é para gente.
 assert.ok(r.avisos.includes('A API recusou a consulta de ligações pelo anúncio; esses números ficaram sem dado.'),r.avisos.join(' | '));
 assert.equal(r.avisos.some((a)=>/PROHIBITED_SEGMENT|[A-Z]{3,}_[A-Z]{3,}/.test(a)),false);
 assert.ok(t.logs.some((l)=>/PROHIBITED_SEGMENT_WITH_METRIC_IN_SELECT_OR_WHERE_CLAUSE/.test(l)),t.logs.join(' | '));
 assert.equal(tudo(t,r).includes('Cannot select'),false,'mensagem do provedor não vai para o aviso');
 const s=r.dados.resumo;
 assert.equal(s.regras.conversas,null);assert.ok(s.semanas.every((x)=>x.numeros.conversas===null&&x.ligacoes===null));
 assert.equal(s.semanas[0].numeros.leads,3,'leads não dependem das ligações');
 assert.equal(r.dados.campanhas.lista.find((c)=>c.id==='501').totais.ligacoes,null);
});

test('o caso ruim: consulta essencial recusada derruba só a sua parte; a reserva salva quando dá', async()=>{
 const t=montar({rotas:{palavras:erro(400,'erro-consulta'),palavras_reserva:erro(400,'erro-stream')}}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.deepEqual(r.partes.palavras,{estado:'erro',motivo:G.MOTIVOS.recusada,codigo:'recusada',coletado_em:null});
 assert.equal(r.dados.palavras,undefined);assert.equal(r.partes.grupos.estado,'ok');
 assert.ok(r.avisos.some((a)=>/parte dos campos de palavras-chave/.test(a)));
 assert.equal(r.avisos.some((a)=>/UNRECOGNIZED_FIELD/.test(a)),false,'o nome do erro da API não vai para o aviso');
 assert.ok(t.logs.some((l)=>/UNRECOGNIZED_FIELD/.test(l)),'vai para o diário');
 const t2=montar({rotas:{palavras:erro(400,'erro-consulta')}}),r2=await t2.rodar();
 assert.equal(r2.estado,'ok');assert.equal(r2.partes.palavras.estado,'ok');assert.equal(r2.dados.palavras.lista.length,2);
 const pedidos=t2.chamadas.filter((c)=>c.nome.startsWith('palavras'));
 assert.deepEqual(pedidos.map((c)=>c.nome),['palavras','palavras_reserva']);assert.doesNotMatch(pedidos[1].query,/quality_info/);
});

test('o caso ruim: o tempo acaba; o que faltou fica com a coleta anterior e o estado é parcial', async()=>{
 // Cada chamada gasta 8 s de um orçamento de 100 s; a folga é de 25 s.
 const t=montar({prazo:(ch)=>100_000-ch.length*8_000}),r=await t.rodar();
 assert.equal(r.estado,'parcial');
 assert.deepEqual(nomes(t),['token','contas','conta','conta','semanas','conversoes_semana','acoes','campanhas_lista','campanhas_dias','ligacoes']);
 for(const p of ['resumo','campanhas','conversoes'])assert.equal(r.partes[p].estado,'ok',p);
 for(const p of ['leads','termos','palavras','alteracoes','pmax']){assert.equal(r.partes[p].codigo,'sem_tempo',p);assert.equal(r.dados[p],undefined,p);}
 assert.ok(r.avisos.some((a)=>a.startsWith('O tempo da coleta acabou antes de: leads de formulário, dias da conta')));
});

test('o caso ruim: paginação tem teto, sem pageSize, e o corte vira aviso', async()=>{
 const linha=fx('palavras').results[0];
 const t=montar({rotas:{palavras:(ch,todas)=>({results:[linha],nextPageToken:`pag${todas.filter((c)=>c.nome==='palavras').length}`})}}),r=await t.rodar();
 const pags=t.chamadas.filter((c)=>c.nome==='palavras');
 assert.equal(pags.length,G.MAX_PAGINAS);assert.equal(pags[0].pageToken,null);assert.equal(pags[1].pageToken,'pag1');
 assert.ok(t.chamadas.every((c)=>!c.corpo||!('pageSize' in c.corpo)),'pageSize dá PAGE_SIZE_NOT_SUPPORTED');
 assert.ok(r.avisos.some((a)=>a.includes(`palavras-chave passou de ${G.MAX_PAGINAS} páginas`)));
 assert.equal(r.dados.palavras.lista[0].impressoes,250*G.MAX_PAGINAS);
});

test('o caso ruim: cota esgotada para a coleta; o que já veio fica, e nada mais é pedido', async()=>{
 const t=montar({rotas:{leads:erro(429,'erro-cota')}}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.equal(nomes(t).at(-1),'leads');
 assert.equal(r.partes.resumo.estado,'ok');assert.equal(r.partes.leads.codigo,'parada');assert.equal(r.partes.paginas.codigo,'parada');
 assert.ok(r.avisos.some((a)=>/cota diária/.test(a)));
});

test('o caso ruim: limite POR SEGUNDO (RESOURCE_TEMPORARILY_EXHAUSTED) não para a coleta nem diz que a cota do dia acabou', async()=>{
 const t=montar({rotas:{leads:erro(429,'erro-limite-segundo')}}),r=await t.rodar();
 // Só aquela consulta fica sem dado; as seguintes continuam.
 assert.ok(nomes(t).includes('dias')&&nomes(t).includes('alteracoes'),'a coleta parou num pico de um segundo');
 assert.equal(r.avisos.some((a)=>/cota diária/.test(a)),false);
 assert.ok(r.avisos.some((a)=>/limite por segundo, passageiro/.test(a)));
 assert.equal(r.estado,'parcial');
 assert.deepEqual([r.partes.leads.estado,r.partes.leads.codigo],['erro','limite_segundo']);
 assert.equal(r.partes.resumo.estado,'ok');
 assert.ok(Object.values(r.partes).every((p)=>p.codigo!=='parada'),'nenhuma parte ficou "parada"');
 // A cota do DIA (RESOURCE_EXHAUSTED no quotaError) continua parando.
 assert.deepEqual(G.classificarErro({status:429,corpo:fx('erro-limite-segundo')}),{tipo:'limite_segundo',codigo:'RESOURCE_TEMPORARILY_EXHAUSTED'});
 assert.equal(G.classificarErro({status:429,corpo:fx('erro-cota')}).tipo,'cota');
 // Dois picos seguidos: aí sim para (cada tentativa só gasta tempo), com o aviso de que é passageiro.
 const t2=montar({rotas:{leads:erro(429,'erro-limite-segundo'),dias:erro(429,'erro-limite-segundo')}}),r2=await t2.rodar();
 assert.equal(nomes(t2).includes('alteracoes'),false);
 assert.ok(r2.avisos.some((a)=>/A cota do dia não acabou/.test(a)));
 assert.equal(r2.avisos.some((a)=>/cota diária/.test(a)),false);
 for(const a of [...r.avisos,...r2.avisos])assert.equal(TRAVESSAO.test(a),false,a);
});

test('o caso ruim: resposta grande demais (teto da coletora) não é "a API recusou"', async()=>{
 // Do jeito que a coletora lança: ErroFonte grande_demais, com o status 200.
 const grande=()=>{const e=new Error('termos: grande_demais (HTTP 200)');e.codigo='grande_demais';e.status=200;throw e;};
 const t=montar({rotas:{termos:grande,termos_reserva:grande}}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.deepEqual(r.partes.termos,{estado:'erro',motivo:G.MOTIVOS.grande_demais,codigo:'grande_demais',coletado_em:null});
 assert.ok(r.avisos.some((a)=>/termos de pesquisa passou do tamanho/.test(a)));assert.equal(r.avisos.some((a)=>/recusou a consulta de termos/.test(a)),false);
 assert.deepEqual(nomes(t).filter((n)=>/^termos(_reserva)?$/.test(n)),['termos'],'não tenta a reserva: o problema não é campo');
 assert.ok(nomes(t).includes('alteracoes'));
});

test('o caso ruim: duas falhas de rede seguidas param a coleta; uma só não', async()=>{
 const caiu=()=>{throw new Error('timeout');};
 const t=montar({rotas:{leads:caiu,dias:caiu}}),r=await t.rodar();
 assert.equal(r.estado,'parcial');assert.equal(nomes(t).at(-1),'dias');assert.equal(r.partes.leads.codigo,'sem_resposta');
 const t2=montar({rotas:{leads:caiu}}),r2=await t2.rodar();
 assert.equal(r2.estado,'parcial');assert.ok(nomes(t2).includes('alteracoes'));assert.equal(r2.partes.leads.estado,'erro');
});

test('o caso ruim: nenhum segredo sai no retorno, no log, nos rótulos; developer-token nunca vai', async()=>{
 const runs=[];
 for(const rotas of [{},{token:erro(400,'erro-token')},{conta:erro(403,'erro-aprovacao')},{semanas:erro(401,'erro-401')}]){
  const t=montar({rotas}),r=await t.rodar();runs.push([t,r]);
 }
 const assinaturas=[];
 for(const [t,r] of runs){
  const texto=tudo(t,r);
  for(const proibido of [TOKEN,PKCS8.slice(200,260),'PRIVATE KEY','kid0ficticio','assertion'])assert.equal(texto.includes(proibido),false,proibido);
  const tok=t.chamadas.find((c)=>c.nome==='token');assert.equal(tok.url,'https://oauth2.googleapis.com/token','token_uri do JSON ignorado');
  assinaturas.push(new URLSearchParams(tok.body).get('assertion'));
  for(const c of daAds(t)){
   assert.equal(Object.keys(c.headers).some((h)=>h.toLowerCase()==='developer-token'),false,'developer-token acabou em 09/2026');
   assert.equal(c.headers.Authorization,`Bearer ${TOKEN}`);
  }
 }
 for(const a of assinaturas)assert.equal(JSON.stringify(runs.map(([,r])=>r)).includes(a),false);
 assert.equal(runs[0][1].conexao,undefined,'conta de serviço não grava nada no cofre');
});

test('o caso ruim: semana sem linha do Google fica null, não zero', async()=>{
 const r=await montar().rodar(),s=r.dados.resumo.semanas.find((x)=>x.semana==='2026-08-24');
 assert.equal(s.atividade,false);assert.equal(s.fechada,true);
 assert.deepEqual(s.numeros,{seguidores:null,alcance:null,impressoes:null,engajamento:null,cliques:null,conversas:null,leads:null});
 assert.equal(s.gasto,null);assert.equal(s.ligacoes,null);
 assert.equal(G.num(undefined),null);assert.equal(G.num(''),null);assert.equal(G.num('0'),0);assert.equal(G.dinheiro(undefined),null);
});

test('o caso ruim: dado pessoal só mora em "restrito"', async()=>{
 const r=await montar().rodar();
 const sem=JSON.parse(JSON.stringify(r.dados,(k,v)=>k==='restrito'?undefined:v));
 const texto=JSON.stringify(sem);
 for(const p of ['Fulana','fulana@example.com','90000-0001','gclid-ficticio','alguem@example.com','6 metros'])assert.equal(texto.includes(p),false,p);
 assert.equal(texto.includes('"ddd"'),false);
 assert.ok(JSON.stringify(r.dados.leads.restrito).includes('fulana@example.com'));
 assert.deepEqual(r.dados.chamadas.restrito.lista.map((c)=>c.ddd),[null,'31',null]);assert.equal(r.dados.alteracoes.restrito.lista[0].email,'alguem@example.com');
});

// --------------------------------------------------------- caso bom --

test('JWT RS256 da conta de serviço: assinatura confere, sem sub, 1 hora, escopo e aud certos', async()=>{
 let visto=null;
 const t=montar({rotas:{token:async(ch)=>{
  const p=new URLSearchParams(ch.body);visto={grant:p.get('grant_type'),tipo:ch.headers['Content-Type']};
  const [h,c,s]=p.get('assertion').split('.');
  visto.cab=JSON.parse(Buffer.from(h,'base64url'));visto.claims=JSON.parse(Buffer.from(c,'base64url'));
  visto.ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',par.publicKey,Buffer.from(s,'base64url'),new TextEncoder().encode(`${h}.${c}`));
  return {access_token:TOKEN,expires_in:3599,token_type:'Bearer'};
 }}});
 const r=await t.rodar();
 assert.equal(r.estado,'ok');assert.equal(visto.ok,true);
 assert.equal(visto.grant,'urn:ietf:params:oauth:grant-type:jwt-bearer');assert.equal(visto.tipo,'application/x-www-form-urlencoded');
 assert.deepEqual(visto.cab,{alg:'RS256',typ:'JWT',kid:'kid0ficticio'});
 const c=visto.claims;
 assert.equal(c.iss,SA.client_email);assert.equal(c.scope,'https://www.googleapis.com/auth/adwords');assert.equal(c.aud,'https://oauth2.googleapis.com/token');
 assert.equal(c.exp-c.iat,3600);assert.equal('sub' in c,false);assert.ok(Math.abs(c.iat-Date.now()/1000)<60);
 // Colado com "\n" literal, ou em base64: também serve.
 assert.equal((await montar({env:{GOOGLE_ADS_SA_JSON:JSON.stringify({...SA,private_key:PEM.replace(/\n/g,'\\n')})}}).rodar()).estado,'ok');
 assert.equal((await montar({env:{GOOGLE_ADS_SA_JSON:Buffer.from(SA_JSON).toString('base64')}}).rodar()).estado,'ok');
});

test('coleta completa: estado ok, uma parte por chave de dados, só leitura, versão única, semanas e publicações vazias', async()=>{
 const t=montar(),r=await t.rodar();
 assert.equal(r.estado,'ok',r.avisos.join(' | '));assert.equal(r.conta,'Impresilk Comunicação Visual (123-456-7890)');
 assert.deepEqual(r.semanas,[]);assert.deepEqual(r.publicacoes,[]);
 const partes=['conta','resumo','campanhas','grupos','anuncios','palavras','termos','conversoes','chamadas','leads','publico','locais','paginas','horarios','pmax','organico','alteracoes'];
 assert.deepEqual(Object.keys(r.partes).sort(),[...partes].sort());assert.deepEqual(Object.keys(r.dados).sort(),[...partes].sort());
 for(const p of partes){assert.equal(r.partes[p].estado,'ok',p);assert.match(r.partes[p].coletado_em,/^\d{4}-\d{2}-\d{2}T/);}
 for(const c of t.chamadas.slice(1))assert.match(c.url,/^https:\/\/googleads\.googleapis\.com\/v25\/customers(:listAccessibleCustomers|\/\d{10}\/googleAds:search)$/);
 assert.ok(t.chamadas.every((c)=>!/mutate/i.test(c.url)));
 const q=t.chamadas.filter((c)=>c.query).map((c)=>c.query);
 assert.ok(q.every((x)=>/^SELECT /.test(x)));
 assert.equal(r.dados.conta.consultas,t.chamadas.length);assert.ok(t.chamadas.length<=40,'cabe folgado na cota do Explorer');
 assert.ok(t.logs.some((l)=>/google_ads: ok, conta 123-456-7890/.test(l)));
 // Sem campanha Inteligente, de Vídeo ou Display: essas consultas nem saem.
 for(const n of ['termos_smart','video','display','alcance'])assert.equal(nomes(t).includes(n),false,n);
});

test('descoberta: a conta da tag AW-11004527401 entre as que a credencial alcança, sem login-customer-id', async()=>{
 const t=montar(),r=await t.rodar();
 assert.equal(r.dados.conta.id,'1234567890');assert.equal(r.dados.conta.tagConfere,true);assert.equal(r.dados.conta.viaGerente,null);
 assert.equal(r.dados.conta.moeda,'BRL');assert.equal(r.dados.conta.relatorioChamadas,true);assert.equal(r.dados.conta.versaoApi,'v25');
 assert.deepEqual(r.dados.conta.periodo,{inicio:'2026-08-10',fim:'2026-10-10',semanas:['2026-08-10','2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28'],semanaAtual:'2026-10-05'});
 assert.ok(daAds(t).every((c)=>!('login-customer-id' in c.headers)));
 assert.ok(t.chamadas.filter((c)=>c.nome==='semanas').every((c)=>c.url.includes('/customers/1234567890/')));
 // Sem a tag em nenhuma: usa a comum e avisa.
 const t2=montar({rotas:{contas:{resourceNames:['customers/9876543210']}}}),r2=await t2.rodar();
 assert.equal(r2.dados.conta.id,'9876543210');assert.equal(r2.dados.conta.tagConfere,false);
 assert.ok(r2.avisos.some((a)=>/não tem a tag AW-11004527401/.test(a)));
});

test('descoberta pela agência: a conta filha vai com login-customer-id da administradora', async()=>{
 // Com o ID cadastrado (com traços) fora do acesso direto.
 const t=montar({env:{GOOGLE_ADS_SA_JSON:SA_JSON,GOOGLE_ADS_CUSTOMER_ID:'123-456-7890'},rotas:{contas:{resourceNames:['customers/5550001111']}}}),r=await t.rodar();
 assert.equal(r.estado,'ok');assert.equal(r.dados.conta.viaGerente,'555-000-1111');
 assert.equal(t.chamadas.find((c)=>c.nome==='filhas').headers['login-customer-id'],'5550001111');
 for(const c of daAds(t).filter((c)=>c.url.includes('/customers/1234567890/')))assert.equal(c.headers['login-customer-id'],'5550001111');
 // Sem ID cadastrado: olha as filhas e acha pela tag; a cancelada fica fora.
 const t2=montar({rotas:{contas:{resourceNames:['customers/5550001111']}}}),r2=await t2.rodar();
 assert.equal(r2.dados.conta.id,'1234567890');assert.equal(r2.dados.conta.viaGerente,'555-000-1111');
 assert.equal(t2.chamadas.some((c)=>c.url.includes('/customers/4440003333/')),false);
 // ID cadastrado que nenhuma conta alcança.
 const t3=montar({env:{GOOGLE_ADS_SA_JSON:SA_JSON,GOOGLE_ADS_CUSTOMER_ID:'1112223334'},rotas:{contas:{resourceNames:['customers/9876543210']}}}),r3=await t3.rodar();
 assert.equal(r3.estado,'falta_configurar');assert.equal(r3.partes.conta.codigo,'id_cliente_invalido');
});

test('números da semana: 8 fechadas e a corrente; leads pelas categorias; conversas = ligações + contato', async()=>{
 const r=await montar().rodar(),s=r.dados.resumo;
 assert.deepEqual(s.semanas.map((x)=>x.semana),['2026-08-10','2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28','2026-10-05']);
 assert.deepEqual(s.semanas.map((x)=>x.fechada),[true,true,true,true,true,true,true,true,false]);
 assert.deepEqual(s.regras,{leads:'categorias',conversas:'ligacoes_e_contato'});
 const col=(k)=>s.semanas.map((x)=>x.numeros[k]);
 assert.deepEqual(col('impressoes'),[1000,1200,null,900,1100,1300,1000,1150,700]);
 assert.deepEqual(col('engajamento'),[50,60,null,45,55,70,52,61,30]);
 assert.deepEqual(col('leads'),[3,4,null,0,2.33,5,3,4,1],'a ação de Visita (não primária) não conta');
 assert.deepEqual(col('conversas'),[3,1.5,null,4,0,3,0,1,1]);
 assert.deepEqual(col('seguidores'),Array(9).fill(null));assert.deepEqual(col('alcance'),Array(9).fill(null));
 assert.deepEqual(s.semanas.map((x)=>x.gasto),[100,120.5,null,90,110,140,104,122,60]);
 assert.deepEqual(s.semanas.map((x)=>x.ligacoes),[1,0,null,2,0,1,0,0,1]);
 assert.equal(s.semanas[0].ctr,0.05);assert.equal(s.semanas[0].cpcMedio,2);assert.equal(s.semanas[0].custoPorConversao,20);
 assert.deepEqual(s.totais,{impressoes:8350,cliques:423,interacoes:423,gasto:846.5,conversoes:38,valorConversoes:0,todasConversoes:50.5,ctr:0.0507,cpcMedio:2,custoPorConversao:22.28});
 assert.deepEqual(s.dias.map((d)=>[d.data,d.gasto]),[['2026-10-09',12.35],['2026-10-10',10]]);
 assert.equal(s.aparelhos[0].aparelho,'MOBILE');assert.equal(s.aparelhos[0].rede,'SEARCH');
});

test('números da semana: sem ação de lead vale o total; sem ligação e sem contato, conversas null', ()=>{
 const per=G.periodo(HOJE);
 const conta=G.lerSemanasConta(fx('semanas').results);
 const acoes=[{id:'9',categoria:'PAGE_VIEW',status:'ENABLED',contaNasConversoes:true}];
 const m=G.montarSemanas({per,conta,conversoes:[],acoes,ligacoes:{porCampanha:new Map(),porSemana:new Map(),temLigacao:false}});
 assert.deepEqual(m.regras,{leads:'total',conversas:null});
 assert.deepEqual(m.semanas.map((x)=>x.numeros.leads),[5,6,null,3,4,7,5,6,2]);
 assert.ok(m.semanas.every((x)=>x.numeros.conversas===null));
 // Ação de lead existe, mas a consulta de conversões falhou: null, não o total.
 const m2=G.montarSemanas({per,conta,conversoes:null,acoes:[{id:'1',categoria:'SUBMIT_LEAD_FORM',status:'ENABLED',contaNasConversoes:true}],ligacoes:null});
 assert.equal(m2.regras.leads,null);assert.ok(m2.semanas.every((x)=>x.numeros.leads===null));
 // Ação de lead PAUSADA não conta como configurada.
 const m3=G.montarSemanas({per,conta,conversoes:[],acoes:[{id:'1',categoria:'SUBMIT_LEAD_FORM',status:'PAUSED',contaNasConversoes:true}],ligacoes:null});
 assert.equal(m3.regras.leads,'total');
});

test('parcela de impressões: 0,0999 é "menos de 10%"; 0,9001 perdida é "mais de 90%"', async()=>{
 assert.deepEqual(G.parcela(0.0999),{valor:0.0999,menosDe10:true});assert.deepEqual(G.parcela(0.42),{valor:0.42,menosDe10:false});
 assert.equal(G.parcela(undefined),null);assert.deepEqual(G.parcelaPerdida(0.9001),{valor:0.9001,maisDe90:true});
 const r=await montar().rodar();
 assert.deepEqual(r.dados.resumo.semanas[1].parcelaImpressoes,{valor:0.0999,menosDe10:true});
 assert.equal(r.dados.resumo.semanas[8].parcelaImpressoes,null);
 const p=r.dados.campanhas.lista.find((c)=>c.id==='501').parcela;
 assert.deepEqual(p.map((x)=>x.semana),['2026-09-21','2026-09-28']);
 assert.equal(p[1].impressoes.menosDe10,true);assert.equal(p[1].perdidaOrcamento.maisDe90,true);assert.equal(p[0].topo,null);
 assert.equal(r.dados.palavras.lista[0].parcelaImpressoes.menosDe10,true);
});

test('campanhas: removida que gastou entra, pausada sem gasto aparece com null, ligações por dia', async()=>{
 const r=await montar().rodar(),l=r.dados.campanhas.lista,por=(id)=>l.find((c)=>c.id===id);
 assert.deepEqual(l.map((c)=>c.id),['501','502','503','504']);
 const c=por('501');
 assert.deepEqual(c.totais,{impressoes:500,cliques:30,interacoes:30,gasto:65.5,conversoes:3.5,valorConversoes:0,todasConversoes:3.5,ctr:0.06,cpcMedio:2.18,custoPorConversao:18.71,ligacoes:5});
 assert.deepEqual(c.dias.map((d)=>[d.data,d.gasto,d.ligacoes]),[['2026-09-01',40,2],['2026-09-02',25.5,0]]);
 assert.deepEqual(c.orcamento,{valor:50,periodo:'DAILY',entrega:'STANDARD',recomendado:null});assert.equal(c.otimizacao,0.87);
 assert.equal(por('502').totais.ligacoes,null,'campanha sem telefone: null, não 0');assert.deepEqual(por('502').motivos,['BUDGET_CONSTRAINED']);
 assert.equal(por('503').status,'REMOVED');assert.equal(por('503').totais.gasto,6);assert.equal(por('503').totais.conversoes,null);
 assert.equal(por('504').totais.gasto,null);assert.deepEqual(por('504').dias,[]);
 assert.equal(c.alcance,null);assert.equal(c.video,null);assert.equal(c.display,null);
});

test('termos: o mesmo termo em grupos diferentes é uma linha; "outros termos" é o que o Google escondeu', async()=>{
 const r=await montar().rodar(),t=r.dados.termos;
 assert.deepEqual(t.lista.map((x)=>[x.termo,x.impressoes,x.cliques,x.gasto,x.conversoes]),[['fachada em acm',150,12,24,1],['letreiro luminoso preço',80,8,16,1]]);
 assert.deepEqual(t.lista[0].grupos,['Fachadas','Letreiros']);assert.equal(t.lista[0].palavras.length,2);assert.deepEqual(t.lista[0].tiposCorrespondencia,['PHRASE']);
 assert.deepEqual(t.outros,[{campanhaId:'501',campanha:'Pesquisa Comunicação Visual',impressoes:270,cliques:10,gasto:25.5,conversoes:1.5},
  {campanhaId:'503',campanha:'Campanha antiga',impressoes:50,cliques:3,gasto:6,conversoes:null}]);
 assert.equal(t.cortados,null);
 assert.deepEqual(t.pmax.map((x)=>[x.termo,x.campanhaId,x.gasto]),[['fachada de loja','502',8]]);assert.equal(t.smart,null);
 assert.deepEqual(t.categorias[0],{categoria:'fachadas comerciais',impressoes:400,cliques:20,conversoes:2,volume:{min:1000,max:5000}});
 assert.equal(t.categorias[1].volume,null);assert.equal(t.categorias[1].categoria,null);
 // A diferença nunca fica negativa, e o teto não muda a conta.
 assert.deepEqual(G.outrosTermos([{id:'1',nome:'x',tipo:'SEARCH',totais:{impressoes:10,cliques:1,gasto:1,conversoes:0}}],new Map([['1',{impressoes:12,cliques:1,gasto:2e6}]])),
  [{campanhaId:'1',campanha:'x',impressoes:0,cliques:0,gasto:0,conversoes:0}]);
});

test('leads: a guarda é por id; o primeiro registro vale e o que o Google apagou continua', async()=>{
 const anterior={dados:{leads:{restrito:{porId:{
  L0:{id:'L0',data:'2026-07-01 10:00:00-03:00',campanha:'Pesquisa Comunicação Visual',campos:[],perguntas:[],vistoEm:'2026-07-01'},
  L1:{id:'L1',data:'2026-09-20 14:30:00-03:00',campanha:'Pesquisa Comunicação Visual',campos:[],perguntas:[],vistoEm:'2026-09-21'}}}}}};
 const t=montar({anterior}),r=await t.rodar(),l=r.dados.leads;
 assert.deepEqual(Object.keys(l.restrito.porId).sort(),['L0','L1','L2']);
 assert.equal(l.restrito.porId.L0.vistoEm,'2026-07-01','o Google já apagou; aqui fica');
 assert.equal(l.restrito.porId.L1.vistoEm,'2026-09-21','o primeiro registro vale');
 assert.equal(l.restrito.porId.L2.vistoEm,HOJE);
 assert.equal(l.total,3);assert.equal(l.novos,1);assert.equal(l.ultimos60,2);
 assert.deepEqual(l.porCampanha,[{campanha:'Pesquisa Comunicação Visual',leads:3}]);
 assert.match(t.chamadas.find((c)=>c.nome==='leads').query,/submission_date_time >= '2026-08-12'/);
 // Sem a coleta anterior: só os 60 dias do Google.
 const r2=await montar().rodar();
 assert.equal(r2.dados.leads.total,2);assert.equal(r2.dados.leads.novos,2);
 const l1=r2.dados.leads.restrito.porId.L1;
 assert.deepEqual(l1.campos,[{tipo:'FULL_NAME',valor:'Fulana de Teste'},{tipo:'PHONE_NUMBER',valor:'+55 31 90000-0001'},{tipo:'EMAIL',valor:'fulana@example.com'}]);
 assert.deepEqual(l1.perguntas,[{pergunta:'Qual o tamanho da fachada?',valor:'6 metros'}]);
});

test('chamadas: resumo por dia e status; relatório de chamadas desligado nem consulta', async()=>{
 const r=await montar().rodar(),c=r.dados.chamadas;
 assert.equal(c.ligado,true);assert.equal(c.total,3);assert.equal(c.recebidas,2);assert.equal(c.perdidas,1);assert.equal(c.duracaoMedia,95);
 assert.deepEqual(c.porDia,[{data:'2026-09-30',total:1,recebidas:1,perdidas:0},{data:'2026-10-09',total:2,recebidas:1,perdidas:1}]);
 assert.equal(c.restrito.lista[2].ddd,null,'ligação curta vem sem DDD');
 const t2=montar({env:{GOOGLE_ADS_SA_JSON:SA_JSON,GOOGLE_ADS_CUSTOMER_ID:'9876543210'}}),r2=await t2.rodar();
 assert.equal(nomes(t2).includes('chamadas'),false);assert.equal(r2.dados.chamadas.ligado,false);assert.equal(r2.dados.chamadas.total,null);
 assert.ok(r2.avisos.some((a)=>/relatório de chamadas está desligado/.test(a)));
});

test('o resto dos quadros: grupos, anúncios, palavras, cidades, páginas, horários, público, Performance Max, alterações', async()=>{
 const t=montar(),r=await t.rodar(),d=r.dados;
 assert.deepEqual(d.grupos.lista.map((g)=>[g.nome,g.gasto,g.ligacoes]),[['Fachadas',45,3],['Letreiros',20.5,null]]);assert.equal(d.grupos.cortados,0);
 const a=d.anuncios.lista[0];
 assert.deepEqual([a.link,a.titulos,a.descricoes,a.caminho,a.forca,a.aprovacao],['https://www.example.com/fachadas',['Fachadas em ACM','Orçamento em 24 horas'],['Projeto, produção e instalação.'],['fachadas','acm'],'GOOD','APPROVED']);
 assert.equal(d.palavras.lista.length,2,'o mesmo criterion_id em grupos diferentes são duas palavras');
 assert.deepEqual(d.palavras.lista[0].qualidade,{nota:7,anuncio:'ABOVE_AVERAGE',pagina:'AVERAGE',ctrEsperado:'BELOW_AVERAGE'});
 assert.equal(d.palavras.lista[0].lanceCpc,2.5);assert.equal(d.palavras.lista[0].cpcPrimeiraPagina,1.8);
 assert.equal(d.palavras.lista[1].impressoes,0,'zero que o Google mandou é zero');assert.equal(d.palavras.lista[1].ctr,null);
 assert.deepEqual(d.locais.cidades.map((c)=>[c.nome,c.tipo,c.impressoes]),[['Cidade Fictícia A','presenca',400],['Cidade Fictícia A','interesse',100],['Cidade Fictícia B','presenca',50]]);
 assert.match(t.chamadas.find((c)=>c.nome==='nomes_geo').query,/IN \('geoTargetConstants\/1031836', 'geoTargetConstants\/1031893'\)/);
 assert.equal(d.paginas.lista[0].url,'https://www.example.com/fachadas');
 assert.deepEqual(d.horarios.grade,[{dia:'MONDAY',hora:9,impressoes:80,cliques:5,gasto:10,conversoes:1},{dia:'TUESDAY',hora:14,impressoes:20,cliques:1,gasto:2,conversoes:null}]);
 assert.deepEqual(d.publico.idade.map((x)=>[x.faixa,x.impressoes]),[['AGE_RANGE_25_34',300],['AGE_RANGE_35_44',150]]);
 assert.deepEqual(d.publico.genero.map((x)=>x.genero),['MALE','FEMALE']);
 assert.equal(d.pmax.aplica,true);assert.equal(d.pmax.grupos[0].nome,'Fachadas de lojas');
 assert.deepEqual(d.organico,{lista:[],cortados:0});
 assert.equal(d.alteracoes.total,2);assert.deepEqual(d.alteracoes.porDia,[{data:'2026-10-07',total:2}]);
 assert.deepEqual(d.alteracoes.restrito.lista[1].campos,['keyword.text','keyword.matchType','status']);
 assert.deepEqual(d.conversoes.acoes.map((x)=>[x.nome,x.categoria,x.contaNasConversoes]),[['Formulário do site','SUBMIT_LEAD_FORM',true],['Clique no WhatsApp','CONTACT',true],['Visita à página de orçamento','PAGE_VIEW',false]]);
 assert.equal(d.conversoes.semanas.find((x)=>x.semana==='2026-09-07').conversoes,2.33);
 assert.deepEqual(d.conversoes.semanas.filter((x)=>x.semana==='2026-08-10').map((x)=>[x.acaoId,x.acao,x.categoria]),[['222','Clique no WhatsApp','CONTACT'],['111','Formulário do site','SUBMIT_LEAD_FORM']]);
 // Sem Performance Max na conta: a parte vem dizendo que não se aplica.
 const lista=fx('campanhas-lista');lista.results=lista.results.filter((x)=>x.campaign.id!=='502');
 const dias=fx('campanhas-dias');dias.results=dias.results.filter((x)=>x.campaign.id!=='502');
 const t2=montar({rotas:{campanhas_lista:lista,campanhas_dias:dias}}),r2=await t2.rodar();
 assert.deepEqual(r2.dados.pmax,{aplica:false,grupos:[]});assert.equal(nomes(t2).includes('pmax'),false);assert.equal(r2.dados.termos.pmax,null);
});

test('consultas: ligações sem segments.device, alterações com os 30 dias e LIMIT, parcela só de semanas fechadas', ()=>{
 const q=G.consultas(G.periodo(HOJE));
 assert.match(q.ligacoes,/metrics\.phone_calls/);assert.doesNotMatch(q.ligacoes,/segments\.device/);
 for(const [k,v] of Object.entries(q)){
  if(/phone_calls/.test(v))assert.doesNotMatch(v,/segments\.device/,k);
  assert.doesNotMatch(v,/developer|pageSize|mutate/i,k);
  assert.doesNotMatch(v,/start_date[^_]|end_date[^_]/,`${k}: start_date e end_date saíram na v23`);
 }
 assert.match(q.alteracoes,/change_date_time >= '2026-09-12' AND change_event\.change_date_time <= '2026-10-11 23:59:59'.*LIMIT 200$/);
 assert.match(q.parcela,/BETWEEN '2026-08-10' AND '2026-10-04'/);assert.match(q.semanas,/BETWEEN '2026-08-10' AND '2026-10-10'/);
 assert.doesNotMatch(q.termosReserva,/search_term_match_type/);
 // Segunda-feira: a semana corrente ainda não tem dia nenhum.
 const seg=G.periodo('2026-10-05');assert.equal(seg.fim,'2026-10-04');assert.equal(seg.fimFechado,'2026-10-04');assert.equal(seg.inicio,'2026-08-10');
});

test('leitura: int64 em texto, micros, lotes do searchStream e listAccessibleCustomers', ()=>{
 const linhas=G.lerLinhas(fx('stream-exemplo'));
 assert.equal(linhas.length,2);assert.equal(G.num(linhas[0].metrics.impressions),10922);
 assert.deepEqual(G.lerAparelhos(linhas.map((l)=>({...l,segments:{device:l.segments.device,adNetworkType:'SEARCH'}}))).map((x)=>[x.aparelho,x.impressoes]),[['DESKTOP',28297],['MOBILE',10922]]);
 assert.equal(G.lerLinhas({results:[1]}).length,1);assert.deepEqual(G.lerLinhas(null),[]);
 assert.equal(G.dinheiro('12345678'),12.35);assert.equal(G.dinheiro('0'),0);
 assert.deepEqual(G.lerContasAcessiveis({resourceNames:['customers/1234567890','customers/1234567890','lixo']}),['1234567890']);
 assert.equal(G.formatarId('1234567890'),'123-456-7890');
 assert.equal(G.escolherConta([{id:'1',gerente:true,tag:G.TAG_AW}]),null,'administradora não é conta de anúncio');
});

test('erros: os formatos do Google viram o mesmo tipo; texto do provedor nunca vira código', ()=>{
 const tipo=(status,nome)=>G.classificarErro({status,corpo:fx(nome)});
 assert.deepEqual(tipo(403,'erro-aprovacao'),{tipo:'aprovacao',codigo:'projeto_sem_aprovacao'});
 assert.deepEqual(tipo(403,'erro-sem-acesso'),{tipo:'conexao',codigo:'sem_acesso_na_conta'});
 assert.deepEqual(tipo(400,'erro-consulta'),{tipo:'consulta',codigo:'PROHIBITED_SEGMENT_WITH_METRIC_IN_SELECT_OR_WHERE_CLAUSE'});
 assert.deepEqual(tipo(400,'erro-stream'),{tipo:'consulta',codigo:'UNRECOGNIZED_FIELD'});
 assert.equal(tipo(429,'erro-cota').tipo,'cota');assert.equal(tipo(401,'erro-401').tipo,'credencial');
 assert.deepEqual(tipo(400,'erro-token'),{tipo:'credencial',codigo:'chave_recusada'});
 assert.deepEqual(tipo(403,'erro-api-desativada'),{tipo:'configuracao',codigo:'api_desativada'});
 assert.equal(G.classificarErro({status:503,corpo:null}).tipo,'transitorio');assert.equal(G.classificarErro({status:0}).tipo,'transitorio');
 assert.equal(G.classificarErro({status:403,corpo:null}).tipo,'permissao');
 assert.equal(G.codigoDoErro({error:{status:'texto livre com espaço'}}),null);
 // O que o fetchJson devolve, em qualquer formato.
 assert.deepEqual(G.normalizarResposta({results:[]}),{ok:true,status:200,corpo:{results:[]}});
 assert.deepEqual(G.normalizarResposta({status:200,ok:true,json:{results:[]}}),{ok:true,status:200,corpo:{results:[]}});
 assert.equal(G.normalizarResposta(fx('erro-401')).status,401);assert.equal(G.normalizarResposta(fx('erro-401')).ok,false);
 assert.equal(G.normalizarResposta(fx('erro-stream')).status,400);assert.equal(G.normalizarResposta(fx('erro-token')).ok,false);
 assert.equal(G.normalizarResposta({status:200,ok:true,json:fx('erro-stream')}).ok,false,'erro dentro de um 200 do stream');
});

test('o fetchJson pode devolver o corpo ou {status, ok, json}: o resultado é o mesmo', async()=>{
 const a=await montar().rodar(),b=await montar({embrulhar:true}).rodar();
 const limpa=(r)=>JSON.parse(JSON.stringify({...r,partes:Object.fromEntries(Object.entries(r.partes).map(([k,v])=>[k,{...v,coletado_em:null}]))}));
 assert.deepEqual(limpa(b),limpa(a));
});

test('sem travessão nos avisos nem no arquivo do conector', async()=>{
 const fonte=readFileSync(new URL('../supabase/functions/_shared/mkt-fontes/google_ads.mjs',import.meta.url),'utf8');
 assert.equal(TRAVESSAO.test('a — b'),true,'o detector pega');
 assert.equal(TRAVESSAO.test(fonte),false);
 // Os avisos e as frases das partes: as duas vão para a tela (a frase da
 // porta fechada mora só na parte "conta", desde a revisão de 12/10).
 const avisos=[];
 const frases=(r)=>[...r.avisos,...Object.values(r.partes).map((p)=>p.motivo).filter(Boolean)];
 for(const rotas of [{},{ligacoes:erro(400,'erro-consulta')},{token:erro(400,'erro-token')},{leads:erro(429,'erro-cota')},{contas:{resourceNames:[]}},{conta:erro(403,'erro-aprovacao')}])
  avisos.push(...frases(await montar({rotas}).rodar()));
 avisos.push(...frases(await montar({env:{}}).rodar()),...frases(await montar({prazo:(ch)=>100_000-ch.length*8_000}).rodar()));
 assert.ok(avisos.length>8);
 for(const a of avisos)assert.equal(TRAVESSAO.test(a),false,a);
});

test('o caso ruim (guarda de 12 meses): lead de mais de um ano sai, na coleta e em toda execução da coletora', async()=>{
 // Decisão do Léo (12/10/2026): lead é dado pessoal e fica 12 meses, contados do dia do formulário.
 assert.equal(G.DIAS_GUARDA_LEADS,365);
 const limite='2025-10-11'; // HOJE (2026-10-11) menos 365 dias
 const anterior={dados:{leads:{restrito:{porId:{
  V:{id:'V',data:'2025-10-10 23:59:00-03:00',campanha:'Velha',campos:[{tipo:'EMAIL',valor:'velha@example.com'}],perguntas:[],vistoEm:'2025-10-10'},
  N:{id:'N',data:`${limite} 08:00:00-03:00`,campanha:'No limite',campos:[],perguntas:[],vistoEm:limite},
  S:{id:'S',data:null,campanha:'Sem data',campos:[],perguntas:[],vistoEm:'2026-01-10'},
  X:{id:'X',data:'',campanha:'Nada',campos:[],perguntas:[]}}}}}};
 const r=await montar({anterior}).rodar(),l=r.dados.leads;
 assert.deepEqual(Object.keys(l.restrito.porId).sort(),['L1','L2','N','S'],'a velha e a sem data nenhuma saem');
 assert.equal(JSON.stringify(l).includes('velha@example.com'),false);
 assert.equal(l.total,4);
 // podarGuardado: a coletora roda em toda execução, até na que falhou (a parte antiga fica no retrato).
 const dados={resumo:{n:1},leads:{total:2,novos:0,ultimos60:0,porDia:[],porCampanha:[],restrito:{porId:{V:anterior.dados.leads.restrito.porId.V,N:anterior.dados.leads.restrito.porId.N}}}};
 const p=G.podarGuardado(dados,HOJE);
 assert.deepEqual(Object.keys(p.leads.restrito.porId),['N']);
 assert.equal(p.leads.total,1);
 assert.deepEqual(p.leads.porCampanha,[{campanha:'No limite',leads:1}]);
 assert.deepEqual(p.resumo,{n:1},'o resto dos dados fica');
 assert.equal(Object.keys(dados.leads.restrito.porId).length,2,'não mexe no objeto de entrada');
 // Nada para podar: devolve o mesmo objeto; sem leads, também.
 const semVelho={leads:{total:1,restrito:{porId:{N:anterior.dados.leads.restrito.porId.N}}}};
 assert.equal(G.podarGuardado(semVelho,HOJE),semVelho);
 assert.equal(G.podarGuardado({resumo:{}},HOJE).resumo !== undefined,true);
 assert.equal(G.podarGuardado(null,HOJE),null);
});
