// O cofre das conexões, os números que vêm da API, a faxina do LinkedIn e o
// agendamento das coletas (20261012a_marketing_fontes.sql) num PostgreSQL em
// memória, sem tocar o Supabase. Mesmo caminho opcional de PGlite dos outros
// testes de banco:
//   PGLITE_PATH=/.../dist/index.js node --test tests/marketing-fontes-banco.test.mjs
//
// O PGlite não tem Vault, pg_cron nem pg_net. Os três viram stubs AQUI, no
// teste, nunca na migração: no Supabase eles já existem (0002_cron_backup.sql).
// Os stubs imitam as assinaturas reais, e em dois pontos são mais duros que o
// real, de propósito:
//  * o Vault "cifra" (base64) o que guarda: quem ler a tabela em vez da view
//    decrypted_secrets recebe lixo, e o teste pega;
//  * o cron.schedule NÃO substitui job de mesmo nome (o real substitui desde a
//    1.3): se a migração esquecer o unschedule, rodar duas vezes quebra aqui.
//
// Todo token e todo segredo daqui é FICTÍCIO (a palavra está no valor, para o
// teste poder procurar por ela). O repositório é público.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {anotarDiario} from '../supabase/functions/_shared/mkt-fontes/coletora.mjs';
let PGlite;
try { ({PGlite}=await import('@electric-sql/pglite')); }
catch { if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href)); }
const pular={skip:PGlite?false:'PGlite ausente: defina PGLITE_PATH'};

const STUBS=`
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, description text not null default '',
  secret text not null, key_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create view vault.decrypted_secrets as
  select id, name, description, secret, convert_from(decode(secret, 'base64'), 'utf8') as decrypted_secret, key_id, created_at, updated_at
    from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language plpgsql as $$
declare i uuid;
begin
  insert into vault.secrets(name, description, secret, key_id) values ($2, coalesce($3, ''), encode(convert_to($1, 'utf8'), 'base64'), $4) returning id into i;
  return i;
end $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language plpgsql as $$
begin
  update vault.secrets set secret = coalesce(encode(convert_to($2, 'utf8'), 'base64'), secret), name = coalesce($3, name),
    description = coalesce($4, description), updated_at = now() where id = $1;
end $$;

create schema cron;
create table cron.job(jobid bigserial primary key, jobname text unique, schedule text not null, command text not null);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare i bigint;
begin
  insert into cron.job(jobname, schedule, command) values ($1, $2, $3) returning jobid into i;
  return i;
end $$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
begin
  delete from cron.job where jobname = $1;
  if not found then raise exception 'could not find valid entry for job ''%''', $1; end if;
  return true;
end $$;

create schema net;
create table net.chamadas(id bigserial primary key, url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$
declare i bigint;
begin
  insert into net.chamadas(url, body, params, headers, timeout_milliseconds) values ($1, $2, $3, $4, $5) returning id into i;
  return i;
end $$;
`;

async function banco(){
 const db=new PGlite();
 // Fuso de propósito longe de São Paulo: a regra da semana fechada tem de
 // usar o fuso de São Paulo, nunca o da sessão.
 await db.exec(`set timezone = 'Pacific/Kiritimati';
  create role anon; create role authenticated; create role service_role; create role qualquer;
  -- O que o Supabase faz: toda função nova do schema public nasce com execute
  -- para anon e authenticated. É isso que o revoke da migração precisa desfazer.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create table public.painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));
  create table public.painel_config_global(id boolean primary key,config jsonb,atualizado_em timestamptz);
  create table public.painel_contas(usuario text primary key,nome text,permissoes jsonb,vendedor_id text,hash text,salt text,iter int,atualizado_em timestamptz);
  -- O painel_cache da 0001_init.sql: o diário, as travas da coleta e os
  -- pedidos de conexão moram nele.
  create table public.painel_cache(chave text primary key,valor jsonb not null,atualizado_em timestamptz not null default now());`);
 await db.exec(STUBS);
 // Um job de outro sistema, que a migração não pode tocar.
 await db.exec(`insert into cron.job(jobname, schedule, command) values ('painel-backup-diario', '40 8 * * *', 'select 1')`);
 // A a1, a a2 e esta, em ordem, como o Supabase aplica. Cada uma duas vezes:
 // rodar de novo não quebra nem duplica.
 for(const arquivo of ['20261010a_marketing_base.sql','20261011a_marketing_canais.sql','20261012a_marketing_fontes.sql']){
  const sql=await readFile(new URL('../supabase/migrations/'+arquivo,import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
 }
 return db;
}

const fn=(db,nome,args,params)=>db.query(`select public.${nome}(${args}) as r`,params).then(x=>x.rows[0].r);
const uma=(db,sql,params=[])=>db.query(sql,params).then(x=>x.rows[0]);
const conta=(db,tabela,onde='true',params=[])=>uma(db,`select count(*)::int n from ${tabela} where ${onde}`,params).then(x=>x.n);
const CANAL={nome:'Canal',grupo:'digital',icone:'globe',cor:'#0a66c2',ordem:10,ativo:true,em_implantacao:false,dias_parado:7};
const criarCanal=(db,codigo)=>fn(db,'painel_mkt_salvar_canal','$1::uuid,$2::jsonb,$3::int,$4',[null,JSON.stringify({...CANAL,codigo,nome:codigo}),null,'leo']);
const gravar=(db,fonte,valor)=>fn(db,'painel_mkt_conexao_gravar','$1,$2::jsonb',[fonte,JSON.stringify(valor)]);
const ler=(db,fonte)=>fn(db,'painel_mkt_conexao_ler','$1',[fonte]);
const info=db=>fn(db,'painel_mkt_conexao_info','',[]);
const apagar=(db,fonte)=>fn(db,'painel_mkt_conexao_apagar','$1',[fonte]);
const semanasApi=(db,linhas,quem='coletora')=>fn(db,'painel_mkt_api_metricas','$1::jsonb,$2',[JSON.stringify(linhas),quem]);
const pubsApi=(db,linhas,quem='coletora')=>fn(db,'painel_mkt_api_publicacoes','$1::jsonb,$2',[JSON.stringify(linhas),quem]);
const faxina=(db,canal,dn,dt)=>fn(db,'painel_mkt_api_faxina','$1,$2::int,$3::int',[canal,dn,dt]);
const metricasManual=(db,canal,semana,dados,quem='ana')=>fn(db,'painel_mkt_salvar_metricas','$1::uuid,$2::date,$3::jsonb,$4',[canal,semana,JSON.stringify({fonte:'manual',...dados}),quem]);
const pubManual=(db,dados,{id=null,versao=null,quem='ana'}={})=>fn(db,'painel_mkt_salvar_publicacao','$1::uuid,$2::jsonb,$3::int,$4',[id,JSON.stringify({fonte:'manual',...dados}),versao,quem]);
// Datas calculadas no banco, no fuso de São Paulo: nada aqui depende do fuso
// da máquina que roda o teste.
const segundaDe=d=>`((${d}) - (extract(isodow from (${d}))::int - 1))`;
const datas=db=>uma(db,`select h::text hoje, ${segundaDe('h')}::text atual, (${segundaDe('h')} - 7)::text passada,
  (${segundaDe('h')} - 14)::text retrasada, (${segundaDe('h')} + 7)::text futura, (${segundaDe('h')} - 6)::text terca_passada,
  ${segundaDe('h - 400')}::text velha, ${segundaDe('h - 420')}::text velha_manual, ${segundaDe('h - 440')}::text velha3, ${segundaDe('h - 300')}::text recente,
  (h - 200)::text pub_velha, (h - 100)::text pub_recente, (h - 400)::text pub_ano
  from (select (now() at time zone 'America/Sao_Paulo')::date h) x`);

const FUNCOES=['painel_mkt_conexao_gravar(text,jsonb)','painel_mkt_conexao_ler(text)','painel_mkt_conexao_info()',
 'painel_mkt_conexao_apagar(text)','painel_mkt_conexao_regravar(text,jsonb,jsonb)','painel_mkt_conexao_pedido(text,text,text,text,integer)',
 'painel_mkt_conexao_consumir(text)','painel_mkt_conexao_pendente(text,text,text,jsonb,integer)','painel_mkt_conexao_confirmar(text,text,text)',
 'painel_mkt_api_metricas(jsonb,text)','painel_mkt_api_publicacoes(jsonb,text)',
 'painel_mkt_api_faxina(text,integer,integer)','painel_mkt_coleta_anotar(jsonb,boolean)','painel_mkt_coleta_pedir(text,text,integer)'];
// O gatilho da origem dos números e o ajudante da faxina: ninguém de fora
// executa (nem o PUBLIC).
const INTERNAS=['painel_mkt_origem_numeros()','painel_mkt_sem_numeros_api(jsonb,text[])'];
const regravar=(db,fonte,esperado,valor)=>fn(db,'painel_mkt_conexao_regravar','$1,$2::jsonb,$3::jsonb',[fonte,JSON.stringify(esperado),JSON.stringify(valor)]);
const pedidoConexao=(db,nonce,fonte,quem,verificador=null,validade=600)=>fn(db,'painel_mkt_conexao_pedido','$1,$2,$3,$4,$5::int',[nonce,fonte,quem,verificador,validade]);
const consumir=(db,nonce)=>fn(db,'painel_mkt_conexao_consumir','$1',[nonce]);
const pendente=(db,nonce,fonte,quem,valor,validade=600)=>fn(db,'painel_mkt_conexao_pendente','$1,$2,$3,$4::jsonb,$5::int',[nonce,fonte,quem,JSON.stringify(valor),validade]);
const confirmar=(db,fonte,nonce,quem)=>fn(db,'painel_mkt_conexao_confirmar','$1,$2,$3',[fonte,nonce,quem]);
const guardadoNoVault=(db,nome)=>uma(db,`select decrypted_secret d from vault.decrypted_secrets where name=$1`,[nome]).then(x=>x?.d??null);
const importarCsv=(db,linhas,quem='ana')=>fn(db,'painel_mkt_importar_publicacoes','$1::jsonb,$2',[JSON.stringify(linhas),quem]);
const anotar=(db,entrada,exclusiva=false)=>fn(db,'painel_mkt_coleta_anotar','$1::jsonb,$2::boolean',[JSON.stringify(entrada),exclusiva]);
const pedirColeta=(db,fonte,quem='ana',intervalo=120)=>fn(db,'painel_mkt_coleta_pedir','$1,$2,$3::int',[fonte,quem,intervalo]);
const cache=(db,chave)=>uma(db,`select valor from painel_cache where chave=$1`,[chave]).then(x=>x?.valor??null);

test('o caso ruim: anon, authenticated e um papel qualquer (pelo PUBLIC) não executam nenhuma função nova; só a service_role', pular, async()=>{
 const db=await banco();
 for(const f of FUNCOES){
  const p=await uma(db,`select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') b,
   has_function_privilege('qualquer',$1,'execute') c, has_function_privilege('service_role',$1,'execute') d`,['public.'+f]);
  assert.deepEqual(p,{a:false,b:false,c:false,d:true},f);
 }
 for(const f of INTERNAS){
  const p=await uma(db,`select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') b,
   has_function_privilege('qualquer',$1,'execute') c`,['public.'+f]);
  assert.deepEqual(p,{a:false,b:false,c:false},f);
 }
 // Não é só o catálogo: a chamada de verdade é barrada.
 for(const [papel,chamada] of [['anon',`select public.painel_mkt_conexao_ler('google')`],['authenticated',`select public.painel_mkt_conexao_info()`],
  ['anon',`select public.painel_mkt_api_metricas('[]'::jsonb,'x')`],['qualquer',`select public.painel_mkt_api_faxina('linkedin',365,180)`]]){
  await assert.rejects(db.exec(`set role ${papel}; ${chamada};`),e=>e.code==='42501',`${papel}: ${chamada}`);
  await db.exec('reset role');
 }
 // security definer com search_path fixo, em todas.
 const defs=(await db.query(`select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') cfg from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'painel_mkt_conexao_%' or p.proname like 'painel_mkt_api_%' or p.proname like 'painel_mkt_coleta_%')`)).rows;
 assert.equal(defs.length,FUNCOES.length);
 for(const d of defs){assert.equal(d.prosecdef,true,d.proname);assert.equal(d.cfg,'search_path=public, pg_temp',d.proname);}
});

test('o caso ruim: a info do cofre nunca devolve token, nem em campo novo, nem escondido dentro de conta ou dos escopos', pular, async()=>{
 const db=await banco();
 const conexao={access_token:'tok-acesso-FICTICIO',refresh_token:'tok-refresh-FICTICIO',id_token:'tok-id-FICTICIO',segredo_novo:'FICTICIO-solto',
  escopos:['https://www.googleapis.com/auth/analytics.readonly',{token:'tok-escopo-FICTICIO'}],conta:'Impresilk (GA4)',
  conectado_por:'123456',conectado_em:'2026-10-12T09:00:00Z',expira_em:'2026-10-12T10:00:00Z',refresh_expira_em:null};
 // Gravar e apagar não devolvem nada (void chega como vazio).
 const vazio=r=>r===null||r==='';
 assert.ok(vazio(await gravar(db,'google',conexao)));
 await gravar(db,'linkedin',{access_token:'tok-li-FICTICIO',escopos:['rw_organization_admin'],conta:{nome:'x',access_token:'tok-conta-FICTICIO'},conectado_por:'123456',conectado_em:'2026-10-12T09:00:00Z',expira_em:1791795600});
 const i=await info(db);
 assert.doesNotMatch(JSON.stringify(i),/FICTICIO|tok-/);
 assert.deepEqual(i,{
  google:{conectado_em:'2026-10-12T09:00:00Z',conectado_por:'123456',conta:'Impresilk (GA4)',escopos:['https://www.googleapis.com/auth/analytics.readonly'],
   expira_em:'2026-10-12T10:00:00Z',refresh_expira_em:null},
  linkedin:{conectado_em:'2026-10-12T09:00:00Z',conectado_por:'123456',conta:null,escopos:['rw_organization_admin'],expira_em:1791795600,refresh_expira_em:null},
  pinterest:null});
 // Depois de cada função do cofre, a info continua sem token.
 await gravar(db,'pinterest',{access_token:'tok-pin-FICTICIO',refresh_token:'tok-pin2-FICTICIO',escopos:[],conectado_por:'123456',conectado_em:'2026-10-12T09:00:00Z'});
 assert.doesNotMatch(JSON.stringify(await info(db)),/FICTICIO|tok-/);
 assert.equal((await ler(db,'pinterest')).access_token,'tok-pin-FICTICIO');
 assert.doesNotMatch(JSON.stringify(await info(db)),/FICTICIO|tok-/);
 assert.ok(vazio(await apagar(db,'google')));
 assert.doesNotMatch(JSON.stringify(await info(db)),/FICTICIO|tok-/);
 // O token entra pelas funções do Vault (que cifram), nunca escrito puro na tabela de baixo.
 assert.equal(await conta(db,'vault.secrets',`secret like '%FICTICIO%'`),0);
});

test('o caso ruim: fonte fora da lista e conexão que não é objeto são recusadas pelo cofre, sem gravar nada', pular, async()=>{
 const db=await banco();
 for(const fonte of ['meta','site','google_ads','GOOGLE','',null])
  await assert.rejects(gravar(db,fonte,{access_token:'tok-FICTICIO',escopos:[]}),e=>e.code==='22023',String(fonte));
 for(const valor of [[],'texto',null,42])
  await assert.rejects(gravar(db,'google',valor),e=>e.code==='22023'&&!/FICTICIO/.test(e.message),JSON.stringify(valor));
 await assert.rejects(ler(db,'meta'),e=>e.code==='22023');
 await assert.rejects(apagar(db,'site'),e=>e.code==='22023');
 assert.equal(await conta(db,'vault.secrets'),0);
});

test('cofre: grava, regrava no MESMO segredo, lê, apaga (vira sem conexão) e conecta de novo', pular, async()=>{
 const db=await banco();
 assert.equal(await ler(db,'google'),null);
 const v1={access_token:'a1-FICTICIO',refresh_token:'r1-FICTICIO',escopos:['x'],conectado_por:'123456',conectado_em:'2026-10-12T09:00:00Z'};
 await gravar(db,'google',v1);
 const id=(await uma(db,`select id from vault.secrets where name='mkt_conexao_google'`)).id;
 assert.deepEqual(await ler(db,'google'),v1);
 const v2={...v1,access_token:'a2-FICTICIO'};
 await gravar(db,'google',v2);
 assert.equal(await conta(db,'vault.secrets',`name='mkt_conexao_google'`),1);
 assert.equal((await uma(db,`select id from vault.secrets where name='mkt_conexao_google'`)).id,id);
 assert.deepEqual(await ler(db,'google'),v2);
 assert.equal(await ler(db,'linkedin'),null);
 // Apagar destrói o token (o valor guardado deixa de ter o texto) e a fonte
 // volta a "sem conexão" na leitura e na info.
 await apagar(db,'google');
 assert.equal(await ler(db,'google'),null);
 assert.equal((await info(db)).google,null);
 assert.doesNotMatch((await uma(db,`select decrypted_secret d from vault.decrypted_secrets where name='mkt_conexao_google'`)).d,/FICTICIO/);
 // Apagar o que nunca foi conectado não cria segredo nem dá erro.
 await apagar(db,'pinterest');
 assert.equal(await conta(db,'vault.secrets',`name='mkt_conexao_pinterest'`),0);
 // Conectar de novo grava por cima.
 const v3={...v1,access_token:'a3-FICTICIO'};
 await gravar(db,'google',v3);
 assert.deepEqual(await ler(db,'google'),v3);
 assert.equal(await conta(db,'vault.secrets',`name='mkt_conexao_google'`),1);
});

test('o caso ruim: segredo ilegível no cofre dá erro limpo na leitura (sem pedaço do conteúdo) e "sem conexão" na info', pular, async()=>{
 const db=await banco();
 await db.query(`select vault.create_secret($1, 'mkt_conexao_linkedin')`,['{"access_token":"tok-quebrado-FICTICIO']);
 await assert.rejects(ler(db,'linkedin'),e=>e.code==='XX001'&&!/FICTICIO|tok-/.test(e.message+' '+(e.detail||'')+' '+(e.where||'')));
 const i=await info(db);
 assert.equal(i.linkedin,null);
 assert.doesNotMatch(JSON.stringify(i),/FICTICIO/);
});

test('o caso ruim: números da semana com canal inexistente, semana aberta, dia que não é segunda e número torto ficam de fora com o motivo, sem derrubar o resto', pular, async()=>{
 const db=await banco();await criarCanal(db,'linkedin');
 const d=await datas(db);
 const r=await semanasApi(db,[
  {canal:'nao-existe',semana:d.passada,numeros:{alcance:1}},
  {canal:'linkedin',semana:d.atual,numeros:{alcance:2}},
  {canal:'linkedin',semana:d.terca_passada,numeros:{alcance:3}},
  {canal:'linkedin',semana:'lixo',numeros:{alcance:4}},
  {canal:'linkedin',semana:d.retrasada,numeros:{alcance:-5}},
  {canal:'linkedin',semana:d.retrasada,numeros:{alcance:1.5}},
  {canal:'linkedin',semana:d.retrasada,numeros:{impressoes:2000000000}},
  {canal:'linkedin',semana:d.retrasada,numeros:{alcance:null}},
  'texto',
  {canal:'linkedin',semana:d.futura,numeros:{alcance:6}},
  {canal:'linkedin',semana:d.passada,numeros:{alcance:10,leads:0}},
 ]);
 assert.equal(r.gravadas,1);assert.equal(r.iguais,0);
 assert.deepEqual(r.ignoradas.map(x=>[x.indice,x.motivo,x.campo??null]),[
  [0,'canal_inexistente',null],[1,'semana_aberta',null],[2,'semana_invalida',null],[3,'semana_invalida',null],
  [4,'numero_invalido','alcance'],[5,'numero_invalido','alcance'],[6,'numero_invalido','impressoes'],[7,'sem_numeros',null],
  [8,'linha_invalida',null],[9,'semana_aberta',null]]);
 // A coletora lê o código do canal da ignorada para avisar "crie o canal".
 assert.equal(r.ignoradas[0].canal,'nao-existe');
 assert.equal(await conta(db,'painel_mkt_metricas_canal'),1);
 const m=await uma(db,`select semana::text s,alcance,leads,impressoes,seguidores,fonte,criado_por from painel_mkt_metricas_canal`);
 // Zero é resultado e entra; o que não veio fica nulo, nunca zero.
 assert.deepEqual(m,{s:d.passada,alcance:10,leads:0,impressoes:null,seguidores:null,fonte:'api',criado_por:'coletora'});
 await assert.rejects(semanasApi(db,{nao:'é lista'}),e=>e.code==='22023');
});

test('números da semana: ausente ou nulo não apaga o que existe, a API manda sobre o manual, e a mesma coleta de novo não regrava', pular, async()=>{
 const db=await banco();const c=await criarCanal(db,'instagram');
 const d=await datas(db);
 await metricasManual(db,c.id,d.passada,{seguidores:100,alcance:50,conversas:5});
 const r1=await semanasApi(db,[{canal:'instagram',semana:d.passada,numeros:{alcance:70,impressoes:300}}]);
 assert.deepEqual(r1,{gravadas:1,iguais:0,ignoradas:[]});
 const sel=`select seguidores,alcance,impressoes,conversas,fonte,versao,coletado_em::text c from painel_mkt_metricas_canal where semana=$1::date`;
 const a=await uma(db,sel,[d.passada]);
 assert.deepEqual({...a,c:undefined},{seguidores:100,alcance:70,impressoes:300,conversas:5,fonte:'api',versao:2,c:undefined});
 const logAntes=await conta(db,'painel_mkt_log');
 // A mesma coleta (com um número que a API recusou hoje, vindo nulo): igual, nada regravado.
 const r2=await semanasApi(db,[{canal:'instagram',semana:d.passada,numeros:{alcance:70,impressoes:null}}]);
 assert.deepEqual(r2,{gravadas:0,iguais:1,ignoradas:[]});
 assert.deepEqual(await uma(db,sel,[d.passada]),a);
 assert.equal(await conta(db,'painel_mkt_log'),logAntes);
 // Só o número que veio muda.
 await semanasApi(db,[{canal:'instagram',semana:d.passada,numeros:{seguidores:120}}]);
 const b=await uma(db,sel,[d.passada]);
 assert.deepEqual([b.seguidores,b.alcance,b.impressoes,b.conversas,b.versao],[120,70,300,5,3]);
 // Número manual que a API confirma igual: a fonte e a data passam a ser da API juntas.
 await metricasManual(db,c.id,d.retrasada,{alcance:40});
 await db.query(`update painel_mkt_metricas_canal set coletado_em='2026-01-05T10:00:00Z' where semana=$1::date`,[d.retrasada]);
 assert.deepEqual(await semanasApi(db,[{canal:'instagram',semana:d.retrasada,numeros:{alcance:40}}]),{gravadas:1,iguais:0,ignoradas:[]});
 const e=await uma(db,sel,[d.retrasada]);
 assert.equal(e.fonte,'api');assert.notEqual(new Date(e.c).toISOString(),'2026-01-05T10:00:00.000Z');
 assert.deepEqual(await semanasApi(db,[{canal:'instagram',semana:d.retrasada,numeros:{alcance:40}}]),{gravadas:0,iguais:1,ignoradas:[]});
 // Canal desativado continua existindo: o número da semana dele entra.
 await db.exec(`update painel_mkt_canais set ativo=false where codigo='instagram'`);
 assert.equal((await semanasApi(db,[{canal:'instagram',semana:d.retrasada,numeros:{alcance:41}}])).gravadas,1);
});

test('o caso ruim: publicação retirada não volta pela API, título vazio não apaga o título, e linha sem canal, link ou data fica de fora', pular, async()=>{
 const db=await banco();const c=await criarCanal(db,'facebook');
 const d=await datas(db);
 const p1=await pubManual(db,{canal_id:c.id,data:d.passada,url:'https://example.com/p/1',titulo:'Post A',alcance:10});
 await fn(db,'painel_mkt_retirar_publicacao','$1::uuid,$2::int,$3',[p1.id,p1.versao,'ana']);
 const r=await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/1',data:d.passada,titulo:'Post A da API',alcance:999}]);
 assert.deepEqual(r,{inseridas:0,atualizadas:0,iguais:0,retiradas:1,ignoradas:[]});
 const v1=await uma(db,`select retirada_em is not null ret,alcance,titulo,fonte from painel_mkt_publicacoes where id=$1`,[p1.id]);
 assert.deepEqual(v1,{ret:true,alcance:10,titulo:'Post A',fonte:'manual'});

 const p2=await pubManual(db,{canal_id:c.id,data:d.passada,url:'https://example.com/p/2',titulo:'Post B',alcance:5});
 for(const titulo of ['','   ',null,undefined]){
  await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/2',data:d.passada,titulo,alcance:6}]);
  assert.equal((await uma(db,`select titulo from painel_mkt_publicacoes where id=$1`,[p2.id])).titulo,'Post B',String(titulo));
 }

 const r2=await pubsApi(db,[
  {canal:'nao-existe',url:'https://example.com/p/9',data:d.passada},
  {canal:'facebook',data:d.passada,titulo:'sem link'},
  {canal:'facebook',url:'javascript:alert(1)',data:d.passada},
  {canal:'facebook',url:'https://example.com/'+'x'.repeat(500),data:d.passada},
  {canal:'facebook',url:'https://example.com/p/9',data:'2026-02-30'},
  {canal:'facebook',url:'https://example.com/p/9',data:d.passada,cliques:-1},
  ['lista'],
  {canal:'facebook',url:'https://example.com/p/9',data:d.passada,cliques:3},
 ]);
 assert.equal(r2.inseridas,1);
 assert.deepEqual(r2.ignoradas.map(x=>[x.indice,x.motivo,x.campo??null]),[
  [0,'canal_inexistente',null],[1,'url_invalida',null],[2,'url_invalida',null],[3,'url_invalida',null],
  [4,'data_invalida',null],[5,'numero_invalido','cliques'],[6,'linha_invalida',null]]);
 assert.equal(r2.ignoradas[0].canal,'nao-existe');
 await assert.rejects(pubsApi(db,null),e=>e.code==='22023');
});

test('publicações: nova entra com fonte api; número da API manda sobre o manual; ausente mantém; só título não finge medição; repetir não regrava', pular, async()=>{
 const db=await banco();const c=await criarCanal(db,'facebook');
 const d=await datas(db);
 const sel=`select data::text,titulo,alcance,impressoes,cliques,leads,fonte,versao,coletado_em::text c,criado_por from painel_mkt_publicacoes where url=$1`;
 const n=await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/3',data:d.passada,titulo:'Reel',alcance:100}],'coletora:meta');
 assert.deepEqual(n,{inseridas:1,atualizadas:0,iguais:0,retiradas:0,ignoradas:[]});
 const p3=await uma(db,sel,['https://example.com/p/3']);
 assert.deepEqual({...p3,c:undefined},{data:d.passada,titulo:'Reel',alcance:100,impressoes:null,cliques:null,leads:null,fonte:'api',versao:1,c:undefined,criado_por:'coletora:meta'});

 // Lançada à mão, depois medida pela API.
 await pubManual(db,{canal_id:c.id,data:d.passada,url:'https://example.com/p/4',titulo:'Manual',alcance:10,cliques:3});
 await db.exec(`update painel_mkt_publicacoes set coletado_em='2026-01-05T10:00:00Z' where url='https://example.com/p/4'`);
 assert.equal((await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/4',data:d.passada,alcance:50,leads:null}])).atualizadas,1);
 const a=await uma(db,sel,['https://example.com/p/4']);
 assert.deepEqual([a.alcance,a.cliques,a.leads,a.titulo,a.fonte,a.versao],[50,3,null,'Manual','api',2]);
 assert.notEqual(new Date(a.c).toISOString(),'2026-01-05T10:00:00.000Z');
 // Só o título muda: fonte e data dos números ficam.
 await db.exec(`update painel_mkt_publicacoes set coletado_em='2026-01-06T10:00:00Z' where url='https://example.com/p/4'`);
 assert.equal((await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/4',data:d.passada,titulo:'Título da API',alcance:50}])).atualizadas,1);
 const b=await uma(db,sel,['https://example.com/p/4']);
 assert.equal(b.titulo,'Título da API');assert.equal(new Date(b.c).toISOString(),'2026-01-06T10:00:00.000Z');assert.equal(b.versao,3);
 // A mesma coleta de novo: igual, sem versão nova e sem linha nova no log.
 const logAntes=await conta(db,'painel_mkt_log');
 assert.deepEqual(await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/4',data:d.passada,titulo:'Título da API',alcance:50}]),
  {inseridas:0,atualizadas:0,iguais:1,retiradas:0,ignoradas:[]});
 assert.equal((await uma(db,sel,['https://example.com/p/4'])).versao,3);
 assert.equal(await conta(db,'painel_mkt_log'),logAntes);
 // A data de publicação vem da API.
 await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/4',data:d.retrasada,alcance:50}]);
 assert.equal((await uma(db,sel,['https://example.com/p/4'])).data,d.retrasada);

 // Linha sem número (o LinkedIn manda só link e data): entra, com tudo nulo.
 await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/5',data:d.passada}]);
 const p5=await uma(db,sel,['https://example.com/p/5']);
 assert.deepEqual([p5.titulo,p5.alcance,p5.impressoes,p5.fonte],[null,null,null,'api']);
 // Manual com números, e a API sem número nenhum: os números continuam manuais.
 await pubManual(db,{canal_id:c.id,data:d.passada,url:'https://example.com/p/6',titulo:'X',alcance:7});
 await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/6',data:d.passada,titulo:'Y'}]);
 const p6=await uma(db,sel,['https://example.com/p/6']);
 assert.deepEqual([p6.titulo,p6.alcance,p6.fonte],['Y',7,'manual']);
 // Título comprido é cortado em 200, não recusado.
 await pubsApi(db,[{canal:'facebook',url:'https://example.com/p/7',data:d.passada,titulo:'a'.repeat(300)}]);
 assert.equal((await uma(db,sel,['https://example.com/p/7'])).titulo.length,200);
});

test('o caso ruim: faxina com dias zero, negativo ou absurdo é recusada; canal que não existe não é erro', pular, async()=>{
 const db=await banco();await criarCanal(db,'linkedin');
 for(const [dn,dt] of [[0,180],[365,0],[-1,180],[365,-30],[3651,180]])
  await assert.rejects(faxina(db,'linkedin',dn,dt),e=>e.code==='22023',`${dn}/${dt}`);
 assert.deepEqual(await faxina(db,'nao-existe',365,180),{canal:'nao-existe',ignorada:'canal_inexistente'});
});

test('faxina: por dias, só o que veio da API, só do canal pedido, e o log não guarda o que saiu', pular, async()=>{
 const db=await banco();
 const li=await criarCanal(db,'linkedin'),fb=await criarCanal(db,'facebook');
 const d=await datas(db);
 await semanasApi(db,[
  {canal:'linkedin',semana:d.velha,numeros:{impressoes:777001}},
  {canal:'linkedin',semana:d.recente,numeros:{impressoes:777002}},
  {canal:'facebook',semana:d.velha,numeros:{impressoes:777004}}]);
 // Atualizada depois: o log da semana velha tem mais de uma linha com o número.
 await semanasApi(db,[{canal:'linkedin',semana:d.velha,numeros:{impressoes:777011}}]);
 await metricasManual(db,li.id,d.velha_manual,{impressoes:777003});
 await pubsApi(db,[
  {canal:'linkedin',url:'https://www.linkedin.com/feed/update/1',data:d.pub_velha,titulo:'Titulo velho FAXINA1'},
  {canal:'linkedin',url:'https://www.linkedin.com/feed/update/2',data:d.pub_recente,titulo:'Titulo novo FAXINA2'},
  {canal:'facebook',url:'https://example.com/fb/1',data:d.pub_velha,titulo:'Titulo FB FAXINA4'}]);
 await pubManual(db,{canal_id:li.id,data:d.pub_velha,url:'https://www.linkedin.com/feed/update/3',titulo:'Titulo manual FAXINA3'});
 const velha=await uma(db,`select id,versao from painel_mkt_publicacoes where url='https://www.linkedin.com/feed/update/1'`);

 const r=await faxina(db,'linkedin',365,180);
 assert.deepEqual(r,{canal:'linkedin',numeros_apagados:1,publicacoes_limpas:0,titulos_zerados:1});
 const semanas=(await db.query(`select c.codigo, m.semana::text s, m.fonte from painel_mkt_metricas_canal m join painel_mkt_canais c on c.id=m.canal_id order by 1,2`)).rows;
 assert.deepEqual(semanas.map(x=>[x.codigo,x.s,x.fonte]).sort(),[['facebook',d.velha,'api'],['linkedin',d.recente,'api'],['linkedin',d.velha_manual,'manual']].sort());
 const titulos=Object.fromEntries((await db.query(`select url,titulo from painel_mkt_publicacoes`)).rows.map(x=>[x.url,x.titulo]));
 assert.deepEqual(titulos,{'https://www.linkedin.com/feed/update/1':null,'https://www.linkedin.com/feed/update/2':'Titulo novo FAXINA2',
  'https://example.com/fb/1':'Titulo FB FAXINA4','https://www.linkedin.com/feed/update/3':'Titulo manual FAXINA3'});
 // O que saiu não ficou no log; o que ficou continua lá (a faxina é dirigida).
 const log=(await uma(db,`select string_agg(coalesce(antes::text,'')||coalesce(depois::text,''),' ') t from painel_mkt_log`)).t;
 assert.doesNotMatch(log,/777001|777011|FAXINA1/);
 assert.match(log,/777002/);assert.match(log,/777003/);assert.match(log,/777004/);assert.match(log,/FAXINA2/);assert.match(log,/FAXINA3/);assert.match(log,/FAXINA4/);
 const resumo=(await db.query(`select quem,registro_id,depois,motivo from painel_mkt_log where operacao='faxina'`)).rows;
 assert.equal(resumo.length,1);
 assert.equal(resumo[0].registro_id,li.id);
 assert.deepEqual(resumo[0].depois,{numeros_apagados:1,publicacoes_limpas:0,titulos_zerados:1,dias_numeros:365,dias_titulo:180});
 // A tela aberta com o título antigo não o grava de volta: a versão subiu.
 await assert.rejects(pubManual(db,{canal_id:li.id,data:d.pub_velha,url:'https://www.linkedin.com/feed/update/1',titulo:'Titulo velho FAXINA1'},{id:velha.id,versao:velha.versao}),e=>e.code==='40001');
 // De novo: nada a fazer, e nenhuma linha de resumo nova.
 assert.deepEqual(await faxina(db,'linkedin',365,180),{canal:'linkedin',numeros_apagados:0,publicacoes_limpas:0,titulos_zerados:0});
 assert.equal(await conta(db,'painel_mkt_log',`operacao='faxina'`),1);
 // Dias nulos deixam aquela parte quieta.
 assert.deepEqual(await faxina(db,'linkedin',null,null),{canal:'linkedin',numeros_apagados:0,publicacoes_limpas:0,titulos_zerados:0});
 assert.equal(await conta(db,'painel_mkt_metricas_canal'),3);
});

test('o caso ruim: rodar a migração de novo não duplica job nem mexe no job de outro sistema', pular, async()=>{
 const db=await banco();
 const sql=await readFile(new URL('../supabase/migrations/20261012a_marketing_fontes.sql',import.meta.url),'utf8');
 await db.exec(sql);
 assert.equal(await conta(db,'cron.job',`jobname like 'painel-mkt-fonte-%'`),6);
 assert.equal(await conta(db,'cron.job',`jobname = 'painel-mkt-log-coleta'`),1);
 assert.deepEqual(await uma(db,`select schedule,command from cron.job where jobname='painel-backup-diario'`),{schedule:'40 8 * * *',command:'select 1'});
 // Nenhuma tabela nova: a cópia do backup continua com as mesmas tabelas.
 const c=(await uma(db,`select public.painel_mkt_exportar() as c`)).c;
 assert.deepEqual(c.tabelas,['painel_mkt_acoes','painel_mkt_canais','painel_mkt_log','painel_mkt_metricas_canal','painel_mkt_orcamento_vinculo','painel_mkt_papeis','painel_mkt_playbook','painel_mkt_publicacoes']);
});

test('agendamento: um job por fonte entre 09:05 e 09:35 UTC, x-token lido do Vault na hora de rodar, corpo certo e timeout explícito', pular, async()=>{
 const db=await banco();
 const jobs=(await db.query(`select jobname,schedule,command from cron.job where jobname like 'painel-mkt-fonte-%' order by schedule`)).rows;
 const FONTES=['site','google','meta','google_ads','linkedin','pinterest'];
 assert.deepEqual(jobs.map(j=>j.jobname).sort(),FONTES.map(f=>'painel-mkt-fonte-'+f).sort());
 const minutos=jobs.map(j=>{
  const m=/^(\d{1,2}) 9 \* \* \*$/.exec(j.schedule);
  assert.ok(m,`${j.jobname}: ${j.schedule}`);
  return Number(m[1]);
 });
 assert.ok(minutos.every(m=>m>=5&&m<=35),String(minutos));
 assert.equal(new Set(minutos).size,6);
 // O token não está no comando: ele é lido do Vault quando o job roda. Aqui
 // o segredo nem existia na hora da migração, e é girado no meio.
 await db.query(`select vault.create_secret($1,'painel_token')`,['token-de-teste-FICTICIO']);
 for(const j of jobs){
  assert.doesNotMatch(j.command,/FICTICIO/);
  await db.exec(j.command);
 }
 const ch=(await db.query(`select url,body,headers,timeout_milliseconds t from net.chamadas order by id`)).rows;
 assert.equal(ch.length,6);
 for(const [i,j] of jobs.entries()){
  const fonte=j.jobname.replace('painel-mkt-fonte-','');
  assert.equal(ch[i].url,'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-mkt-fontes');
  assert.deepEqual(ch[i].body,{action:'coletar',fonte});
  assert.deepEqual(ch[i].headers,{'Content-Type':'application/json','x-token':'token-de-teste-FICTICIO'});
  // O padrão do pg_net (5 s) desistiria de uma coleta de até 110 s.
  assert.ok(ch[i].t>=110000&&ch[i].t<150000,String(ch[i].t));
 }
 const id=(await uma(db,`select id from vault.secrets where name='painel_token'`)).id;
 await db.query(`select vault.update_secret($1::uuid,$2)`,[id,'token-girado-FICTICIO']);
 await db.exec(jobs[0].command);
 assert.equal((await uma(db,`select headers->>'x-token' t from net.chamadas order by id desc limit 1`)).t,'token-girado-FICTICIO');
});

// --------------------------------------------- a conexão durante a coleta --

test('o caso ruim: a coleta não desfaz um Desconectar nem um Reconectar feito no meio dela (regravar só grava a conexão que leu)', pular, async()=>{
 const db=await banco();
 const C1={access_token:'a1-FICTICIO',refresh_token:'r1-FICTICIO',escopos:['x'],conta:'impresilk',conectado_por:'123456',conectado_em:'2026-09-01T00:00:00Z'};
 // Pinterest: a coleta leu e renovou; a gestão desconectou no meio.
 await gravar(db,'pinterest',C1);
 const lida=await ler(db,'pinterest');
 await apagar(db,'pinterest');
 assert.equal(await regravar(db,'pinterest',lida,{...lida,access_token:'a1-NOVO-FICTICIO',refresh_token:'r1-NOVO-FICTICIO'}),'mudou');
 assert.equal(await ler(db,'pinterest'),null,'a conexão apagada continua apagada');
 assert.equal((await info(db)).pinterest,null);
 assert.doesNotMatch((await uma(db,`select decrypted_secret d from vault.decrypted_secrets where name='mkt_conexao_pinterest'`)).d,/FICTICIO/);
 // Google: a coleta leu C1; a gestão reconectou com outra conta (C2) no meio.
 await gravar(db,'google',C1);
 const lidaG=await ler(db,'google');
 const C2={access_token:'a2-FICTICIO',refresh_token:'r2-FICTICIO',escopos:['x','y'],conta:'Conta Nova',conectado_por:'555555',conectado_em:'2026-10-11T10:00:00Z'};
 await gravar(db,'google',C2);
 assert.equal(await regravar(db,'google',lidaG,{...lidaG,access_token:'a1-RENOVADO-FICTICIO',conta:'Conta Antiga'}),'mudou');
 assert.deepEqual(await ler(db,'google'),C2,'a reconexão fica');
 // Nunca conectado: nada a regravar, e nenhum segredo é criado.
 assert.equal(await regravar(db,'linkedin',C1,C1),'mudou');
 assert.equal(await conta(db,'vault.secrets',`name='mkt_conexao_linkedin'`),0);
 // Ilegível também é "mudou" (conectar de novo resolve).
 await db.query(`select vault.create_secret($1, 'mkt_conexao_linkedin')`,['{"access_token":"quebrado']);
 assert.equal(await regravar(db,'linkedin',C1,C1),'mudou');
 // A mesma conexão: grava, e a próxima confere contra a que acabou de gravar.
 const renovadaG={...C2,access_token:'a2-RENOVADO-FICTICIO'};
 assert.equal(await regravar(db,'google',C2,renovadaG),'gravada');
 assert.deepEqual(await ler(db,'google'),renovadaG);
 assert.equal(await regravar(db,'google',C2,{...C2,conta:'velha'}),'mudou','a esperada já não é a do cofre');
 assert.equal(await conta(db,'vault.secrets',`name='mkt_conexao_google'`),1);
 await assert.rejects(regravar(db,'meta',C1,C1),e=>e.code==='22023');
 await assert.rejects(regravar(db,'google',C1,[]),e=>e.code==='22023');
 await assert.rejects(regravar(db,'google',null,C1),e=>e.code==='22023');
});

test('o caso ruim: o pedido de conexão vale uma volta só; vencido, desconhecido ou torto não vale', pular, async()=>{
 const db=await banco();
 const N='nonce-de-teste-0123456789', V='v'.repeat(43);
 assert.ok(['',null].includes(await pedidoConexao(db,N,'google','gil',V)));
 assert.deepEqual(await consumir(db,N),{fonte:'google',quem:'gil',verificador:V});
 assert.equal(await consumir(db,N),null,'a segunda volta com o mesmo state não acha nada');
 assert.equal(await consumir(db,'nunca-pedido-0123456789'),null);
 for(const ruim of ['curto','com espaço no meio 0123456789',"x'; drop table painel_cache; --",null]) assert.equal(await consumir(db,ruim),null,String(ruim));
 // Vencido: não vale (e sai na consulta).
 await pedidoConexao(db,'nonce-vencido-0123456789','linkedin','gil',null,60);
 await db.exec(`update painel_cache set valor = jsonb_set(valor,'{exp}',to_jsonb(floor(extract(epoch from now()))::bigint - 1)) where chave='mkt_oauth_nonce-vencido-0123456789'`);
 assert.equal(await consumir(db,'nonce-vencido-0123456789'),null);
 assert.equal(await conta(db,'painel_cache',`chave='mkt_oauth_nonce-vencido-0123456789'`),0);
 // Cada pedido novo leva junto os vencidos e os tortos (só os de pedido).
 await pedidoConexao(db,'nonce-velho-00000000000','pinterest','gil');
 await db.exec(`update painel_cache set valor = jsonb_set(valor,'{exp}','1'::jsonb) where chave='mkt_oauth_nonce-velho-00000000000'`);
 await db.exec(`insert into painel_cache(chave,valor) values ('mkt_oauth_torto-0000000000000000','{"exp":"amanha"}'),('mkt_outra_chave','{"exp":1}')`);
 await pedidoConexao(db,'nonce-novo-000000000000','pinterest','gil');
 assert.deepEqual((await db.query(`select chave from painel_cache order by chave`)).rows.map(x=>x.chave),['mkt_oauth_nonce-novo-000000000000','mkt_outra_chave']);
 // Entrada torta é recusada sem gravar.
 for(const args of [['curto','google','gil'],[N,'meta','gil'],[N,'google',''],[N,'google','gil','curto'],[N,'google','gil',null,10]])
  await assert.rejects(pedidoConexao(db,...args),e=>e.code==='22023',JSON.stringify(args));
 assert.equal(await conta(db,'painel_cache',`chave like 'mkt_oauth_%'`),1);
});

// ------------------------------------- a conexão pendente e a confirmação --
// A volta do provedor não tem crachá: ela deixa a conexão PENDENTE, e só o
// crachá de quem clicou em Conectar a leva para o cofre (revisão de 12/10).

const PENDENTE={access_token:'acesso-PENDENTE-FICTICIO',refresh_token:'refresh-PENDENTE-FICTICIO',escopos:['x'],conta:null,conectado_por:'leo',conectado_em:'2026-10-12T09:00:00Z'};
const N1='nonce-pendente-1-0123456789',N2='nonce-pendente-2-0123456789',N3='nonce-pendente-3-0123456789';

test('o caso ruim: consentimento completado sem a confirmação de quem clicou nunca chega ao cofre, nem em texto aberto', pular, async()=>{
 const db=await banco();
 const vazio=r=>r===null||r==='';
 assert.ok(vazio(await pendente(db,N1,'google','leo',PENDENTE)));
 // A coleta lê o cofre: nada. A tela lê a info: nada.
 assert.equal(await ler(db,'google'),null);
 assert.equal((await info(db)).google,null);
 assert.equal(await conta(db,'vault.secrets',`name='mkt_conexao_google'`),0);
 // Mora no Vault (cifrada), nunca no painel_cache, e nada em texto aberto.
 assert.equal(await conta(db,'vault.secrets',`name='mkt_pendente_google'`),1);
 assert.equal(await conta(db,'vault.secrets',`secret like '%FICTICIO%'`),0);
 assert.equal(await conta(db,'painel_cache',`valor::text like '%FICTICIO%'`),0);
 // A volta mais nova da mesma fonte troca a anterior (uma por fonte).
 await pendente(db,N2,'google','leo',{...PENDENTE,access_token:'acesso-OUTRA-FICTICIO'});
 assert.equal(await conta(db,'vault.secrets',`name='mkt_pendente_google'`),1);
 assert.deepEqual(await confirmar(db,'google',N1,'leo'),{ok:false,motivo:'pedido_vencido'},'a pendente do nonce velho foi trocada');
 // Entrada torta é recusada sem gravar.
 for(const args of [['curto','google','leo',PENDENTE],[N1,'meta','leo',PENDENTE],[N1,'google','',PENDENTE],[N1,'google','leo',[]],[N1,'google','leo','texto'],[N1,'google','leo',PENDENTE,10]])
  await assert.rejects(pendente(db,...args),e=>e.code==='22023'&&!/FICTICIO/.test(e.message),JSON.stringify(args.slice(0,3)));
 assert.equal(await conta(db,'vault.secrets',`name like 'mkt_pendente_%'`),1);
});

test('o caso ruim: outra pessoa não confirma a pendente de quem clicou; nonce errado ou de outra fonte também não; e a pendente fica para quem clicou', pular, async()=>{
 const db=await banco();
 await pendente(db,N1,'google','leo',PENDENTE);
 assert.deepEqual(await confirmar(db,'google',N1,'gil'),{ok:false,motivo:'outra_pessoa'});
 assert.equal(await ler(db,'google'),null,'a conta de quem não clicou não entra');
 assert.deepEqual(await confirmar(db,'google',N3,'leo'),{ok:false,motivo:'pedido_vencido'},'outro nonce');
 assert.deepEqual(await confirmar(db,'linkedin',N1,'leo'),{ok:false,motivo:'pedido_vencido'},'outra fonte');
 assert.deepEqual(await confirmar(db,'google','curto','leo'),{ok:false,motivo:'pedido_vencido'},'nonce torto');
 assert.equal(await ler(db,'google'),null);
 // Quem clicou confirma: entra no cofre como veio, e a pendente sai.
 assert.deepEqual(await confirmar(db,'google',N1,'leo'),{ok:true});
 assert.deepEqual(await ler(db,'google'),PENDENTE);
 assert.equal(await guardadoNoVault(db,'mkt_pendente_google'),'null');
 await assert.rejects(confirmar(db,'meta',N1,'leo'),e=>e.code==='22023');
 await assert.rejects(confirmar(db,'google',N1,''),e=>e.code==='22023');
});

test('o caso ruim: o mesmo nonce confirmado duas vezes entra uma vez só; a segunda é pedido_vencido e não regrava nada', pular, async()=>{
 const db=await banco();
 await pendente(db,N1,'linkedin','leo',PENDENTE);
 assert.deepEqual(await confirmar(db,'linkedin',N1,'leo'),{ok:true});
 // Depois da confirmação, alguém reconecta (outra conexão no cofre): a
 // segunda confirmação do mesmo nonce não pode trazer a velha de volta.
 const NOVA={...PENDENTE,access_token:'acesso-NOVO-FICTICIO',conectado_em:'2026-10-12T10:00:00Z'};
 await gravar(db,'linkedin',NOVA);
 assert.deepEqual(await confirmar(db,'linkedin',N1,'leo'),{ok:false,motivo:'pedido_vencido'});
 assert.deepEqual(await ler(db,'linkedin'),NOVA);
});

test('o caso ruim: pendente vencida não confirma e sai na hora; o clique novo e o Desconectar também derrubam a pendente', pular, async()=>{
 const db=await banco();
 // Vencida: passou dos 10 minutos sem confirmação.
 await pendente(db,N1,'pinterest','leo',PENDENTE,60);
 const id=(await uma(db,`select id from vault.secrets where name='mkt_pendente_pinterest'`)).id;
 const v=JSON.parse(await guardadoNoVault(db,'mkt_pendente_pinterest'));
 await db.query(`select vault.update_secret($1::uuid,$2)`,[id,JSON.stringify({...v,exp:Math.floor(Date.now()/1000)-1})]);
 assert.deepEqual(await confirmar(db,'pinterest',N1,'leo'),{ok:false,motivo:'pedido_vencido'});
 assert.equal(await guardadoNoVault(db,'mkt_pendente_pinterest'),'null','o token vencido não fica esperando');
 assert.equal(await ler(db,'pinterest'),null);
 // O clique novo em Conectar desiste do anterior: a pendente dele sai.
 await pendente(db,N2,'pinterest','leo',PENDENTE);
 await pedidoConexao(db,'nonce-clique-novo-0123456789','pinterest','leo');
 assert.deepEqual(await confirmar(db,'pinterest',N2,'leo'),{ok:false,motivo:'pedido_vencido'});
 assert.equal(await ler(db,'pinterest'),null);
 // O clique de OUTRA fonte não mexe nesta.
 await pendente(db,N3,'google','leo',PENDENTE);
 await pedidoConexao(db,'nonce-clique-outro-0123456789','linkedin','leo');
 // O Desconectar leva a pendente junto.
 await pendente(db,N2,'linkedin','leo',PENDENTE);
 await apagar(db,'linkedin');
 assert.deepEqual(await confirmar(db,'linkedin',N2,'leo'),{ok:false,motivo:'pedido_vencido'});
 assert.equal(await ler(db,'linkedin'),null);
 assert.deepEqual(await confirmar(db,'google',N3,'leo'),{ok:true});
 assert.equal((await ler(db,'google')).access_token,PENDENTE.access_token);
});

// ------------------------------------------- o diário e a trava da coleta --

const agoraDoBanco=db=>uma(db,`select (extract(epoch from now())*1000)::float8 ms`).then(x=>Math.round(x.ms));
const iso=ms=>new Date(ms).toISOString();

test('o caso ruim: a trava do "Atualizar agora" confere e marca num passo só, por fonte, sem apagar o pedido de outra fonte', pular, async()=>{
 const db=await banco();
 assert.deepEqual(await pedirColeta(db,'linkedin','ana'),{ok:true});
 const r=await pedirColeta(db,'linkedin','gil');
 assert.equal(r.ok,false);
 assert.ok(r.aguardar_s>100&&r.aguardar_s<=120,String(r.aguardar_s));
 // Outra fonte não espera, e o pedido dela não apaga o do LinkedIn.
 assert.deepEqual(await pedirColeta(db,'site','bia'),{ok:true});
 const v=await cache(db,'mkt_coleta_pedidos');
 assert.deepEqual(Object.keys(v).sort(),['linkedin','site']);
 assert.equal(v.linkedin.por,'ana');
 // Passado o intervalo, libera.
 await db.exec(`update painel_cache set valor = jsonb_set(valor,'{linkedin,em}',to_jsonb(now() - interval '121 seconds')) where chave='mkt_coleta_pedidos'`);
 assert.deepEqual(await pedirColeta(db,'linkedin','gil'),{ok:true});
 assert.equal((await cache(db,'mkt_coleta_pedidos')).linkedin.por,'gil');
 // Data torta não tranca a fonte para sempre.
 await db.exec(`update painel_cache set valor = jsonb_set(valor,'{site,em}','"ontem"') where chave='mkt_coleta_pedidos'`);
 assert.deepEqual(await pedirColeta(db,'site'),{ok:true});
 for(const [f,i] of [['',120],['LINKEDIN',120],['site',0],['site',99999]]) await assert.rejects(pedirColeta(db,f,'ana',i),e=>e.code==='22023',`${f} ${i}`);
});

test('o caso ruim: o diário é anotado num passo só: a segunda execução da mesma fonte é recusada, e quem termina junto não apaga a outra', pular, async()=>{
 const db=await banco();
 const agora=await agoraDoBanco(db);
 const e=(id,fonte,ms,extra={})=>({id,fonte,inicio:iso(ms),fim:null,estado:'andando',chamadas:0,quem:'cron',...extra});
 assert.equal((await anotar(db,e('m1','meta',agora-5000),true)).andando,false);
 const li=await anotar(db,e('l1','linkedin',agora-4000),true);
 assert.equal(li.andando,false);
 assert.deepEqual(li.diario.execucoes.map(x=>x.id),['l1','m1']);
 // A segunda do LinkedIn enquanto a primeira anda: recusada, e nada gravado.
 const antes=await cache(db,'mkt_coleta_diario');
 assert.deepEqual(await anotar(db,e('l2','linkedin',agora-1000),true),{andando:true});
 assert.deepEqual(await cache(db,'mkt_coleta_diario'),antes);
 // As duas terminam juntas: as duas ficam, cada uma com o fim e as chamadas dela.
 assert.deepEqual(await anotar(db,{...e('m1','meta',agora-5000),fim:iso(agora),estado:'ok',chamadas:42,log:['semanas: 8 gravada(s)']}),{andando:false});
 await anotar(db,{...e('l1','linkedin',agora-4000),fim:iso(agora),estado:'ok',chamadas:30});
 const d=await cache(db,'mkt_coleta_diario');
 assert.deepEqual(d.execucoes.map(x=>[x.id,x.estado,x.chamadas]),[['l1','ok',30],['m1','ok',42]]);
 // O gasto por hora: cada fonte com o dela, na hora UTC do início.
 assert.deepEqual(d.cota,{meta:{[iso(agora-5000).slice(0,13)]:42},linkedin:{[iso(agora-4000).slice(0,13)]:30}});
 // Terminada a do LinkedIn, a próxima passa; o diário que volta não leva o log.
 const outra=await anotar(db,e('l3','linkedin',agora-500),true);
 assert.equal(outra.andando,false);
 assert.equal(JSON.stringify(outra.diario).includes('semanas: 8'),false);
 assert.deepEqual(outra.diario.cota,d.cota);
 for(const ruim of [null,[],{id:'x'},{fonte:'meta'},{fonte:'META',id:'x'}]) await assert.rejects(anotar(db,ruim),er=>er.code==='22023',JSON.stringify(ruim));
});

test('o diário do banco é o mesmo do anotarDiario (coletora.mjs): interrompida, 20 por fonte, ordem e gasto por hora', pular, async()=>{
 const db=await banco();
 const agora=await agoraDoBanco(db);
 const H=3600_000, hora=ms=>iso(ms).slice(0,13);
 const execucoes=[
  ...Array.from({length:22},(_,i)=>({id:`s${i}`,fonte:'site',inicio:iso(agora-(i+1)*H),fim:iso(agora-(i+1)*H+30_000),estado:'ok',chamadas:3})),
  {id:'mv',fonte:'meta',inicio:iso(agora-10*60_000),fim:null,estado:'andando',chamadas:0},
  {id:'gr',fonte:'google',inicio:iso(agora-10_000),fim:null,estado:'andando',chamadas:0},
  {id:'sem',fonte:'pinterest',estado:'andando',erro:'falhou antes'},
  {id:'semerro',fonte:'pinterest',estado:'andando'},
  {id:'empate',fonte:'linkedin',inicio:iso(agora-2*H),estado:'ok',chamadas:9},
  'lixo',null,
 ];
 const base={versao:1,execucoes,cota:{linkedin:{[hora(agora-60*H)]:50,[hora(agora-2*H)]:10,lixo:3,[hora(agora-3*H)]:-1},site:{x:1},meta:'torto'}};
 await db.query(`insert into painel_cache(chave,valor) values ('mkt_coleta_diario',$1::jsonb)`,[JSON.stringify(base)]);
 const entrada={id:'novo',fonte:'linkedin',inicio:iso(agora-2*H),fim:iso(agora),estado:'ok',chamadas:7};
 await anotar(db,entrada);
 const doBanco=await cache(db,'mkt_coleta_diario');
 const doJs=JSON.parse(JSON.stringify(anotarDiario(base,entrada,agora)));
 assert.deepEqual(doBanco,doJs);
 // E o que os dois fizeram, conferido à mão.
 assert.equal(doBanco.execucoes.filter(x=>x.fonte==='site').length,20);
 assert.equal(doBanco.execucoes[0].id,'gr','a mais nova primeiro');
 assert.deepEqual(doBanco.execucoes.filter(x=>x.fonte==='linkedin').map(x=>x.id),['novo','empate'],'empate no início: a entrada nova vem antes');
 assert.equal(doBanco.execucoes.find(x=>x.id==='mv').estado,'interrompida');
 assert.equal(doBanco.execucoes.find(x=>x.id==='gr').estado,'andando');
 assert.equal(doBanco.execucoes.find(x=>x.id==='sem').erro,'falhou antes');
 assert.match(doBanco.execucoes.find(x=>x.id==='semerro').erro,/parou sem terminar/);
 assert.deepEqual(doBanco.execucoes.slice(-2).map(x=>x.id).sort(),['sem','semerro'],'sem início vai para o fim');
 assert.deepEqual(doBanco.cota,{linkedin:{[hora(agora-2*H)]:17}});
});

// --------------------------------------------------- faxina, de novo --

test('o caso ruim: a faxina do LinkedIn apaga só o número que o LinkedIn mede; o lançado à mão, o título digitado e o histórico de gente ficam', pular, async()=>{
 const db=await banco();
 const li=await criarCanal(db,'linkedin');
 const d=await datas(db);
 // A Ana lança leads e conversas à mão (a API do LinkedIn nunca manda esses
 // dois); depois a coleta grava os números do LinkedIn na mesma semana.
 await metricasManual(db,li.id,d.velha,{leads:5,conversas:3});
 await semanasApi(db,[{canal:'linkedin',semana:d.velha,numeros:{impressoes:778001,alcance:778002,seguidores:778003}}]);
 assert.equal((await uma(db,`select fonte from painel_mkt_metricas_canal where semana=$1::date`,[d.velha])).fonte,'api');
 // Um post do LinkedIn com mais de um ano, com os números do post (o
 // relatório da Página), e um título digitado numa publicação da API.
 await pubsApi(db,[{canal:'linkedin',url:'https://www.linkedin.com/feed/update/9',data:d.pub_ano,impressoes:778011,alcance:778012,engajamento:778013,cliques:778014}]);
 await pubsApi(db,[{canal:'linkedin',url:'https://www.linkedin.com/feed/update/8',data:d.pub_velha}]);
 const p8=await uma(db,`select id,versao from painel_mkt_publicacoes where url='https://www.linkedin.com/feed/update/8'`);
 await pubManual(db,{canal_id:li.id,data:d.pub_velha,url:'https://www.linkedin.com/feed/update/8',titulo:'Campanha feira 2026 (nome interno)'},{id:p8.id,versao:p8.versao});
 assert.equal((await uma(db,`select fonte from painel_mkt_publicacoes where id=$1`,[p8.id])).fonte,'api','editar só o título mantém a fonte api');

 // Como a coletora chama: 365 dias para os números, título nulo.
 const r=await faxina(db,'linkedin',365,null);
 assert.deepEqual(r,{canal:'linkedin',numeros_apagados:1,publicacoes_limpas:1,titulos_zerados:0});
 const m=await uma(db,`select seguidores,alcance,impressoes,engajamento,cliques,conversas,leads,fonte from painel_mkt_metricas_canal where semana=$1::date`,[d.velha]);
 assert.deepEqual(m,{seguidores:null,alcance:null,impressoes:null,engajamento:null,cliques:null,conversas:3,leads:5,fonte:'manual'});
 const p9=await uma(db,`select url,data::text,alcance,impressoes,engajamento,cliques from painel_mkt_publicacoes where url='https://www.linkedin.com/feed/update/9'`);
 assert.deepEqual(p9,{url:'https://www.linkedin.com/feed/update/9',data:d.pub_ano,alcance:null,impressoes:null,engajamento:null,cliques:null});
 assert.equal((await uma(db,`select titulo from painel_mkt_publicacoes where id=$1`,[p8.id])).titulo,'Campanha feira 2026 (nome interno)');
 // O log: os números do LinkedIn saíram, inclusive do antes e depois da
 // própria faxina; o lançamento da Ana continua lá.
 const log=(await uma(db,`select string_agg(coalesce(antes::text,'')||coalesce(depois::text,''),' ') t from painel_mkt_log`)).t;
 assert.doesNotMatch(log,/77800[1-3]|77801[1-4]/);
 assert.match(log,/Campanha feira 2026/);
 const daAna=(await db.query(`select depois from painel_mkt_log where tabela='painel_mkt_metricas_canal' and quem='ana' and operacao='insert'`)).rows;
 assert.equal(daAna.length,1);
 assert.deepEqual([daAna[0].depois.leads,daAna[0].depois.conversas],[5,3]);
 // De novo: nada a fazer, e o que ficou continua.
 assert.deepEqual(await faxina(db,'linkedin',365,null),{canal:'linkedin',numeros_apagados:0,publicacoes_limpas:0,titulos_zerados:0});
 assert.equal(await conta(db,'painel_mkt_metricas_canal'),1);
 // Semana só da API, sem nada de gente: aí sim a linha sai inteira.
 await semanasApi(db,[{canal:'linkedin',semana:d.velha_manual,numeros:{impressoes:778021}}]);
 assert.equal((await faxina(db,'linkedin',365,null)).numeros_apagados,1);
 assert.equal(await conta(db,'painel_mkt_metricas_canal'),1);
});

test('o caso ruim: a faxina escolhe pelo número que a API gravou: o seguidores digitado numa semana que a API tomou fica; o número do LinkedIn numa linha que virou manual sai, da tabela e do log', pular, async()=>{
 const db=await banco();
 const li=await criarCanal(db,'linkedin');
 const d=await datas(db);
 const sel=`select seguidores,alcance,impressoes,engajamento,cliques,conversas,leads,fonte from painel_mkt_metricas_canal where semana=$1::date`;
 // (16) A Ana lança seguidores à mão; a API do LinkedIn toma a semana sem
 // mandar seguidores (ela só manda na segunda logo depois). A linha vira 'api'.
 await metricasManual(db,li.id,d.velha,{seguidores:4321});
 await semanasApi(db,[{canal:'linkedin',semana:d.velha,numeros:{impressoes:785001,alcance:785002,engajamento:785003,cliques:785004}}]);
 assert.equal((await uma(db,sel,[d.velha])).fonte,'api');
 // (17) A API grava a semana; depois, fora das 8 que a coleta relê, a Ana
 // acrescenta leads: a linha vira 'manual'.
 await semanasApi(db,[{canal:'linkedin',semana:d.velha_manual,numeros:{impressoes:786001,alcance:786002}}]);
 await metricasManual(db,li.id,d.velha_manual,{leads:2});
 assert.equal((await uma(db,sel,[d.velha_manual])).fonte,'manual');
 // (17) Post do LinkedIn de mais de um ano com os números da Página; a Ana
 // registra 2 leads nele (a tela manda a publicação inteira de volta).
 await pubsApi(db,[{canal:'linkedin',url:'https://www.linkedin.com/feed/update/77',data:d.pub_ano,impressoes:787001,alcance:787002,engajamento:787003,cliques:787004}]);
 const p=await uma(db,`select * from painel_mkt_publicacoes where url='https://www.linkedin.com/feed/update/77'`);
 await pubManual(db,{canal_id:li.id,data:d.pub_ano,url:p.url,titulo:null,alcance:p.alcance,impressoes:p.impressoes,engajamento:p.engajamento,cliques:p.cliques,leads:2},{id:p.id,versao:p.versao});
 assert.equal((await uma(db,`select fonte from painel_mkt_publicacoes where id=$1`,[p.id])).fonte,'manual');
 // A Ana digitou POR CIMA do número da API: o dela fica, o da API sai do log.
 await semanasApi(db,[{canal:'linkedin',semana:d.velha3,numeros:{impressoes:788001}}]);
 await metricasManual(db,li.id,d.velha3,{impressoes:8100});

 const r=await faxina(db,'linkedin',365,null);
 assert.deepEqual(r,{canal:'linkedin',numeros_apagados:2,publicacoes_limpas:1,titulos_zerados:0});
 assert.deepEqual(await uma(db,sel,[d.velha]),{seguidores:4321,alcance:null,impressoes:null,engajamento:null,cliques:null,conversas:null,leads:null,fonte:'manual'},'o seguidores da Ana fica');
 assert.deepEqual(await uma(db,sel,[d.velha_manual]),{seguidores:null,alcance:null,impressoes:null,engajamento:null,cliques:null,conversas:null,leads:2,fonte:'manual'},'o número do LinkedIn sai mesmo com a linha manual');
 assert.deepEqual(await uma(db,sel,[d.velha3]),{seguidores:null,alcance:null,impressoes:8100,engajamento:null,cliques:null,conversas:null,leads:null,fonte:'manual'});
 assert.deepEqual(await uma(db,`select impressoes,alcance,engajamento,cliques,leads from painel_mkt_publicacoes where id=$1`,[p.id]),{impressoes:null,alcance:null,engajamento:null,cliques:null,leads:2});
 // O log: nenhum número que a API do LinkedIn gravou; os da Ana, todos.
 const log=(await uma(db,`select string_agg(coalesce(antes::text,'')||coalesce(depois::text,''),' ') t from painel_mkt_log`)).t;
 assert.doesNotMatch(log,/78500[1-4]|78600[12]|78700[1-4]|788001/);
 const daAna=(await db.query(`select depois from painel_mkt_log where tabela='painel_mkt_metricas_canal' and quem='ana' and operacao='insert'`)).rows;
 assert.deepEqual(daAna.map(x=>x.depois.seguidores),[4321],'o insert da Ana continua com o seguidores dela');
 assert.match(log,/"impressoes": 8100/);
 // De novo: nada a fazer, e nada muda.
 const antes=(await db.query(`select * from painel_mkt_metricas_canal order by semana`)).rows;
 assert.deepEqual(await faxina(db,'linkedin',365,null),{canal:'linkedin',numeros_apagados:0,publicacoes_limpas:0,titulos_zerados:0});
 assert.deepEqual((await db.query(`select * from painel_mkt_metricas_canal order by semana`)).rows,antes);
});

test('origem por número: a coleta anota só o número que ela mudou; gente que muda um número tira ele da lista; a volta do backup não quebra', pular, async()=>{
 const db=await banco();
 const c=await criarCanal(db,'site');
 const d=await datas(db);
 const lista=s=>uma(db,`select numeros_api from painel_mkt_metricas_canal where semana=$1::date`,[s]).then(x=>x.numeros_api);
 // Linha nova da API: todo número que veio é dela.
 await semanasApi(db,[{canal:'site',semana:d.passada,numeros:{alcance:10,impressoes:20}}]);
 assert.deepEqual(await lista(d.passada),['alcance','impressoes']);
 // Gente muda um número: ele sai da lista; o outro continua da API.
 await metricasManual(db,c.id,d.passada,{alcance:11,leads:3});
 assert.deepEqual(await lista(d.passada),['impressoes']);
 // A API confirma o número de gente igual: continua de gente.
 await semanasApi(db,[{canal:'site',semana:d.passada,numeros:{alcance:11,impressoes:20}}]);
 assert.deepEqual(await lista(d.passada),['impressoes']);
 // A API troca o número de gente: passa a ser dela.
 await semanasApi(db,[{canal:'site',semana:d.passada,numeros:{alcance:12}}]);
 assert.deepEqual(await lista(d.passada),['alcance','impressoes']);
 // Linha nova de gente: sem lista.
 await metricasManual(db,c.id,d.retrasada,{alcance:5});
 assert.equal(await lista(d.retrasada),null);
 // A volta do backup: a cópia traz a lista, e a linha nascida depois da cópia não a perde.
 const copia=(await uma(db,`select public.painel_mkt_exportar() as c`)).c;
 assert.deepEqual(copia.painel_mkt_metricas_canal.find(x=>x.semana===d.passada).numeros_api,['alcance','impressoes']);
 await db.query(`delete from painel_mkt_metricas_canal where semana=$1::date`,[d.passada]);
 await db.query(`select public.painel_mkt_restaurar($1::jsonb)`,[JSON.stringify({...copia,quem:'leo'})]);
 assert.deepEqual(await lista(d.passada),['alcance','impressoes'],'a linha que volta traz a origem do arquivo');
 // Cópia antiga, de antes da coluna: volta sem lista (nenhum número da API).
 const velha={...copia,painel_mkt_metricas_canal:copia.painel_mkt_metricas_canal.map(({numeros_api,...x})=>x)};
 await db.query(`delete from painel_mkt_metricas_canal`);
 await db.query(`select public.painel_mkt_restaurar($1::jsonb)`,[JSON.stringify({...velha,quem:'leo'})]);
 assert.equal(await lista(d.passada),null);
});

// ------------------------------------------------------- o log da coleta --

test('o caso ruim: a coleta que troca número lançado por gente deixa linha no log, mesmo numa linha que já era da API; só a regravação de número da API fica fora', pular, async()=>{
 const db=await banco();
 const site=await criarCanal(db,'site');const pin=await criarCanal(db,'pinterest');
 const d=await datas(db);
 const trocas=(campo,semanaOuUrl)=>db.query(`select l.antes->>$1 antes, l.depois->>$1 depois, l.motivo from painel_mkt_log l
   where l.operacao='update' and l.motivo='Coleta da API' and (l.antes->>$1) is distinct from (l.depois->>$1)
     and l.registro_id in (select id::text from painel_mkt_metricas_canal where semana::text=$2 union select id::text from painel_mkt_publicacoes where url=$2)
   order by l.em, l.id`,[campo,semanaOuUrl]).then(x=>x.rows.map(r=>[r.antes,r.depois]));
 // (o achado da segurança) A Ana lança leads=5 e conversas=3; a coleta do
 // google traz só o Search Console (a linha vira 'api'); no dia seguinte o
 // GA4 volta com leads=0.
 await metricasManual(db,site.id,d.passada,{leads:5,conversas:3});
 await semanasApi(db,[{canal:'site',semana:d.passada,numeros:{cliques:40}}],'coleta google');
 await semanasApi(db,[{canal:'site',semana:d.passada,numeros:{leads:0,alcance:100}}],'coleta google');
 assert.deepEqual(await trocas('leads',d.passada),[['5','0']],'a troca de 5 para 0 está no log');
 // (o achado dos consertos) O GA4 toma a semana; a Ana lança cliques=40; o
 // GA4 regrava; o Search Console fecha a semana com 55.
 await semanasApi(db,[{canal:'site',semana:d.retrasada,numeros:{alcance:10,impressoes:20,engajamento:5}}],'coleta google');
 await metricasManual(db,site.id,d.retrasada,{cliques:40});
 await semanasApi(db,[{canal:'site',semana:d.retrasada,numeros:{alcance:11,impressoes:21,engajamento:5}}],'coleta google');
 await semanasApi(db,[{canal:'site',semana:d.retrasada,numeros:{cliques:55}}],'coleta google');
 assert.deepEqual(await trocas('cliques',d.retrasada),[['40','55']]);
 // Cinco dias de número subindo numa linha só da API: nenhuma linha nova.
 const l0=await conta(db,'painel_mkt_log');
 for(let dia=1;dia<=5;dia++) await semanasApi(db,[{canal:'site',semana:d.retrasada,numeros:{cliques:55+dia,alcance:11+dia}}],'coleta google');
 assert.equal(await conta(db,'painel_mkt_log'),l0);
 assert.equal((await uma(db,`select cliques from painel_mkt_metricas_canal where semana=$1::date`,[d.retrasada])).cliques,60);
 // Publicação: o número que veio do CSV (fonte csv) numa publicação que a
 // API criou. A API regrava (a linha volta a 'api') e depois troca o do CSV.
 const url='https://www.pinterest.com/pin/4242';
 await pubsApi(db,[{canal:'pinterest',url,data:d.passada,impressoes:100}],'coleta pinterest');
 await importarCsv(db,[{canal_id:pin.id,data:d.passada,url,cliques:7,linha:2}]);
 assert.equal((await uma(db,`select fonte from painel_mkt_publicacoes where url=$1`,[url])).fonte,'csv');
 await pubsApi(db,[{canal:'pinterest',url,data:d.passada,impressoes:110}],'coleta pinterest');
 await pubsApi(db,[{canal:'pinterest',url,data:d.passada,impressoes:120,cliques:9}],'coleta pinterest');
 assert.deepEqual(await trocas('cliques',url),[['7','9']],'a troca do número do CSV está no log');
 const l1=await conta(db,'painel_mkt_log');
 await pubsApi(db,[{canal:'pinterest',url,data:d.passada,impressoes:130,cliques:10}],'coleta pinterest');
 assert.equal(await conta(db,'painel_mkt_log'),l1,'o 9 já era da API: a troca para 10 não vira linha');
 // A guarda de 1 ano tira o log só de máquina e deixa a troca de número de gente.
 await db.exec(`update painel_mkt_log set em = now() - interval '400 days'`);
 const job=await uma(db,`select command from cron.job where jobname='painel-mkt-log-coleta'`);
 await db.exec(job.command);
 assert.deepEqual(await trocas('leads',d.passada),[['5','0']]);
 assert.deepEqual(await trocas('cliques',d.retrasada),[['40','55']]);
 assert.deepEqual(await trocas('cliques',url),[['7','9']]);
 assert.equal(await conta(db,'painel_mkt_log',`motivo='Coleta da API' and operacao='insert'`),0,'a linha nova da coleta sai depois de 1 ano');
 assert.ok(await conta(db,'painel_mkt_log',`quem='ana'`)>0,'o log de gente não é tocado');
});

test('o caso ruim: a coleta diária que só sobe número não enche o log; o que importa para quem audita continua, e a guarda tira o log de máquina com mais de 1 ano', pular, async()=>{
 const db=await banco();
 const c=await criarCanal(db,'pinterest');
 const d=await datas(db);
 const pins=Array.from({length:30},(_,i)=>({canal:'pinterest',url:`https://www.pinterest.com/pin/${1000+i}`,data:d.passada,titulo:`Pin ${i}`,impressoes:100,cliques:1}));
 const l0=await conta(db,'painel_mkt_log');
 await pubsApi(db,pins);
 const depoisDaPrimeira=await conta(db,'painel_mkt_log');
 assert.equal(depoisDaPrimeira-l0,30,'a publicação nova vai para o log');
 // Cinco dias de coleta com as impressões subindo.
 for(let dia=1;dia<=5;dia++) assert.equal((await pubsApi(db,pins.map(p=>({...p,impressoes:100+dia*10,cliques:1+dia})))).atualizadas,30);
 assert.equal(await conta(db,'painel_mkt_log'),depoisDaPrimeira,'número que sobe todo dia não vira linha de log');
 assert.equal((await uma(db,`select impressoes,versao from painel_mkt_publicacoes where url=$1`,[pins[0].url])).impressoes,150,'o número em si foi gravado');
 // Continua no log: o número manual que a API passou a medir, e o título que mudou.
 await pubManual(db,{canal_id:c.id,data:d.passada,url:'https://www.pinterest.com/pin/9999',titulo:'Manual',impressoes:5});
 const l1=await conta(db,'painel_mkt_log');
 await pubsApi(db,[{canal:'pinterest',url:'https://www.pinterest.com/pin/9999',data:d.passada,impressoes:50}]);
 assert.equal(await conta(db,'painel_mkt_log'),l1+1,'o número de gente trocado pela API fica no log');
 await pubsApi(db,[{...pins[0],titulo:'Pin 0 novo',impressoes:999}]);
 assert.equal(await conta(db,'painel_mkt_log'),l1+2,'o título que mudou fica no log');
 // As semanas também: API sobre API, só número, não vira linha.
 await semanasApi(db,[{canal:'pinterest',semana:d.passada,numeros:{impressoes:10}}]);
 const l2=await conta(db,'painel_mkt_log');
 await semanasApi(db,[{canal:'pinterest',semana:d.passada,numeros:{impressoes:20}}]);
 assert.equal(await conta(db,'painel_mkt_log'),l2);
 // A guarda: o job tira só o log DA COLETA com mais de 1 ano.
 const job=await uma(db,`select schedule,command from cron.job where jobname='painel-mkt-log-coleta'`);
 assert.equal(job.schedule,'41 9 * * *');
 await db.exec(`update painel_mkt_log set em = now() - interval '400 days' where motivo = 'Coleta da API' and registro_id in (select id::text from painel_mkt_publicacoes where url like '%/pin/100%')`);
 await db.exec(`update painel_mkt_log set em = now() - interval '400 days' where quem = 'ana'`);
 const velhasDaColeta=await conta(db,'painel_mkt_log',`motivo = 'Coleta da API' and em < now() - interval '365 days'`);
 const daAna=await conta(db,'painel_mkt_log',`quem = 'ana'`);
 assert.ok(velhasDaColeta>0&&daAna>0);
 const total=await conta(db,'painel_mkt_log');
 await db.exec(job.command);
 assert.equal(await conta(db,'painel_mkt_log'),total-velhasDaColeta);
 assert.equal(await conta(db,'painel_mkt_log',`quem = 'ana'`),daAna,'o log de gente não é tocado');
 assert.equal(await conta(db,'painel_mkt_log',`motivo = 'Coleta da API' and em < now() - interval '365 days'`),0);
});
