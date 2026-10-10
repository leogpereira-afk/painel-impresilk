// As tabelas e funções do Marketing num PostgreSQL em memória, sem tocar o
// Supabase. Mesmo caminho opcional de PGlite dos outros testes de banco:
//   PGLITE_PATH=/.../dist/index.js node --test tests/marketing-banco.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;
try { ({PGlite}=await import('@electric-sql/pglite')); }
catch { if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href)); }
const pular={skip:PGlite?false:'PGlite ausente: defina PGLITE_PATH'};

async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
  create table public.painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));
  create table public.painel_config_global(id boolean primary key,config jsonb,atualizado_em timestamptz);
  create table public.painel_contas(usuario text primary key,nome text,permissoes jsonb,vendedor_id text,hash text,salt text,iter int,atualizado_em timestamptz);`);
 const sql=await readFile(new URL('../supabase/migrations/20261010a_marketing_base.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql); // rodar duas vezes não quebra
 return db;
}
const salvar=(db,{id=null,nome='Ação',orcs=[],versao=null,quem='ana'}={})=>db.query(
 `select public.painel_mkt_salvar_acao($1::uuid,$2::jsonb,$3::text[],$4::int,$5) as r`,
 [id,JSON.stringify({nome,responsavel_texto:'Ana',prazo:'2026-10-20',situacao:'Ideia',investimento:10}),orcs,versao,quem]).then(x=>x.rows[0].r);

test('o caso ruim: o mesmo orçamento não entra em duas ações, nem trocando de mão', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{nome:'Outdoor Fenics',orcs:['123','456']});
 assert.deepEqual(a.orcamentos,['123','456']);
 await assert.rejects(salvar(db,{nome:'Reel',orcs:['456']}),e=>e.code==='23505'&&/Outdoor Fenics/.test(e.detail));
 // A ação recusada não fica pela metade: nenhuma linha "Reel" sobra.
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_acoes where nome='Reel'`)).rows[0].n,0);
 // Tirar o orçamento da primeira libera para a segunda.
 const a2=await salvar(db,{id:a.id,nome:'Outdoor Fenics',orcs:['123'],versao:1});
 assert.equal(a2.versao,2);
 const b=await salvar(db,{nome:'Reel',orcs:['456']});
 assert.deepEqual(b.orcamentos,['456']);
 const v=(await db.query(`select orcamento_id,acao_id from painel_mkt_orcamento_vinculo order by 1`)).rows;
 assert.deepEqual(v.map(x=>[x.orcamento_id,x.acao_id]),[['123',a.id],['456',b.id]]);
});

test('versão velha é recusada (outro aparelho salvou antes)', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{orcs:['1']});
 await salvar(db,{id:a.id,orcs:['1'],versao:1});
 await assert.rejects(salvar(db,{id:a.id,orcs:['1','2'],versao:1}),e=>e.code==='40001');
 assert.deepEqual((await db.query(`select array_agg(orcamento_id) o from painel_mkt_orcamento_vinculo`)).rows[0].o,['1']);
});

test('retirar libera os orçamentos, guarda quais eram e some da edição', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{orcs:['7','8']});
 const r=(await db.query(`select public.painel_mkt_retirar_acao($1::uuid,1,'leo') as r`,[a.id])).rows[0].r;
 assert.deepEqual(r.orcamentos_retirados,['7','8']);assert.ok(r.retirada_em);
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_orcamento_vinculo`)).rows[0].n,0);
 await assert.rejects(salvar(db,{id:a.id,versao:2}),e=>e.code==='P0002');
 assert.deepEqual((await salvar(db,{orcs:['7']})).orcamentos,['7']);
});

test('log de auditoria: toda gravação fica com quem e o antes/depois', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{nome:'Primeira',orcs:['5'],quem:'ana'});
 await salvar(db,{id:a.id,nome:'Segunda',orcs:[],versao:1,quem:'bia'});
 const log=(await db.query(`select quem,tabela,operacao,antes->>'nome' as antes,depois->>'nome' as depois from painel_mkt_log order by em, tabela`)).rows;
 assert.ok(log.some(l=>l.tabela==='painel_mkt_acoes'&&l.operacao==='insert'&&l.quem==='ana'&&l.depois==='Primeira'));
 assert.ok(log.some(l=>l.tabela==='painel_mkt_acoes'&&l.operacao==='update'&&l.quem==='bia'&&l.antes==='Primeira'&&l.depois==='Segunda'));
 assert.ok(log.some(l=>l.tabela==='painel_mkt_orcamento_vinculo'&&l.operacao==='delete'&&l.quem==='bia'));
});

test('migração das ações antigas: traz uma vez, não duplica, e trava com orçamento repetido', pular, async()=>{
 const db=await banco();
 await db.exec(`insert into painel_registros(colecao,id,registro) values
  ('marketing','mkt-a','{"tipo":"acao","nome":"Antiga A","responsavel":"Ana","prazo":"2026-09-01","status":"Publicada","investimento":250.5,"orcamentos":["11","12"]}'),
  ('marketing','mkt-b','{"tipo":"acao","nome":"","prazo":"lixo","status":"Inventada","investimento":"abc","orcamentos":"nao-e-lista"}'),
  ('marketing','ml-1','{"nome":"Drive","url":"https://x.com"}');`);
 const r=(await db.query(`select public.painel_mkt_migrar_legado('leo') as r`)).rows[0].r;
 assert.deepEqual(r,{total:2,migradas:2,vinculos:2});
 const a=(await db.query(`select nome,situacao,investimento::text i,prazo::text p,legado_id from painel_mkt_acoes order by legado_id`)).rows;
 assert.deepEqual(a.map(x=>[x.legado_id,x.nome,x.situacao,x.i]),[['mkt-a','Antiga A','Publicada','250.50'],['mkt-b','Ação sem nome','Ideia','0.00']]);
 assert.equal(a[0].p,'2026-09-01');
 // Rodar de novo não duplica nada.
 assert.deepEqual((await db.query(`select public.painel_mkt_migrar_legado('leo') as r`)).rows[0].r,{total:2,migradas:0,vinculos:0});
 // O atalho do Drive não virou ação.
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_acoes`)).rows[0].n,2);
 // Orçamento repetido entre ações antigas: trava, com a lista.
 await db.exec(`insert into painel_registros(colecao,id,registro) values('marketing','mkt-c','{"tipo":"acao","nome":"C","orcamentos":["11"]}')`);
 await assert.rejects(db.query(`select public.painel_mkt_migrar_legado('leo')`),e=>e.code==='23505'&&/11/.test(e.message));
});

test('backup: a volta traz o que estava no arquivo, sem apagar o que nasceu depois e sem tropeçar na trava', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{nome:'No backup',orcs:['1','2']});
 const copia={};
 for(const t of ['painel_mkt_acoes','painel_mkt_orcamento_vinculo','painel_mkt_log'])copia[t]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(x)),'[]') j from ${t} x`)).rows[0].j;
 // Depois do backup: a ação muda, o orçamento 2 vai para uma ação nova.
 await salvar(db,{id:a.id,nome:'Mudou depois',orcs:['1'],versao:1});
 const nova=await salvar(db,{nome:'Nasceu depois',orcs:['2']});
 const res=(await db.query(`select public.painel_restaurar_atomico($1::jsonb) as r`,[JSON.stringify({registros:[],contas:[],gestao:{},marketing:copia})])).rows[0].r;
 assert.equal(res.verificado,true);
 const acoes=(await db.query(`select id,nome from painel_mkt_acoes order by nome`)).rows;
 assert.deepEqual(acoes.map(x=>x.nome),['Nasceu depois','No backup']);
 const v=Object.fromEntries((await db.query(`select orcamento_id,acao_id from painel_mkt_orcamento_vinculo`)).rows.map(x=>[x.orcamento_id,x.acao_id]));
 assert.deepEqual(v,{1:a.id,2:a.id});
 assert.ok(nova.id);
 // Backup antigo, sem a parte do Marketing, não mexe em nada.
 const antes=(await db.query(`select count(*)::int n from painel_mkt_acoes`)).rows[0].n;
 await db.query(`select public.painel_restaurar_atomico($1::jsonb)`,[JSON.stringify({registros:[],contas:[],gestao:{}})]);
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_acoes`)).rows[0].n,antes);
});

test('ninguém de fora lê nem grava as tabelas: só a service_role chama as funções', pular, async()=>{
 const db=await banco();
 const priv=(await db.query(`select has_table_privilege('anon','public.painel_mkt_acoes','select') a, has_table_privilege('authenticated','public.painel_mkt_orcamento_vinculo','insert') b,
  has_function_privilege('anon','public.painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text)','execute') c,
  has_function_privilege('service_role','public.painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text)','execute') d`)).rows[0];
 assert.deepEqual(priv,{a:false,b:false,c:false,d:true});
 assert.equal((await db.query(`select bool_and(relrowsecurity) r from pg_class where relname like 'painel_mkt_%' and relkind='r'`)).rows[0].r,true);
});

// ---- Casos achados na revisão de 10/10/2026 ----

test('tentar de novo depois de resposta perdida devolve a MESMA ação, não cria outra', pular, async()=>{
 const db=await banco(),id='11111111-2222-4333-8444-555555555555';
 const criar=(quem='ana')=>db.query(`select public.painel_mkt_salvar_acao($1::uuid,$2::jsonb,$3::text[],null,$4) as r`,[id,JSON.stringify({nome:'Reel',responsavel_texto:'Ana',prazo:'2026-10-20',situacao:'Ideia',investimento:0}),['9'],quem]).then(x=>x.rows[0].r);
 const a=await criar(),b=await criar();
 assert.equal(a.id,id);assert.equal(b.id,id);assert.equal(b.versao,1);assert.deepEqual(b.orcamentos,['9']);
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_acoes`)).rows[0].n,1);
 // Outra pessoa não "reaproveita" o id de ninguém.
 await assert.rejects(criar('bia'),e=>e.code==='P0002');
});

const copiar=async db=>{const c={};for(const t of ['painel_mkt_acoes','painel_mkt_orcamento_vinculo','painel_mkt_log'])c[t]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(x)),'[]') j from ${t} x`)).rows[0].j;return c;};
const voltar=(db,c)=>db.query(`select public.painel_restaurar_atomico($1::jsonb) as r`,[JSON.stringify({registros:[],contas:[],gestao:{},marketing:{...c,quem:'leo'}})]);

test('o caso ruim: voltar um backup velho e depois o certo não deixa orçamento preso numa ação retirada', pular, async()=>{
 const db=await banco();
 const x=await salvar(db,{nome:'X',orcs:['1']});
 const b1=await copiar(db);
 await db.query(`select public.painel_mkt_retirar_acao($1::uuid,1,'ana')`,[x.id]);
 const b2=await copiar(db);
 await voltar(db,b1);await voltar(db,b2);
 const r=(await db.query(`select retirada_em is not null as retirada from painel_mkt_acoes where id=$1`,[x.id])).rows[0];
 assert.equal(r.retirada,true);
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_orcamento_vinculo`)).rows[0].n,0);
 assert.deepEqual((await salvar(db,{nome:'Y',orcs:['1']})).orcamentos,['1']);
});

test('a volta nunca repete um número de versão (aba velha recebe conflito)', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{orcs:[]});
 const bk=await copiar(db);
 await salvar(db,{id:a.id,versao:1}); // aba P fica com a versão 2 na mão
 await voltar(db,bk);
 const v=(await db.query(`select versao from painel_mkt_acoes where id=$1`,[a.id])).rows[0].versao;
 assert.ok(v>2,`versão depois da volta: ${v}`);
 await assert.rejects(salvar(db,{id:a.id,versao:2}),e=>e.code==='40001');
});

test('a volta do backup deixa rastro no log, com o motivo e quem voltou', pular, async()=>{
 const db=await banco();
 const a=await salvar(db,{nome:'A',orcs:['1']});
 const bk=await copiar(db);
 await salvar(db,{id:a.id,nome:'A',orcs:[],versao:1});
 const b=await salvar(db,{nome:'B',orcs:['1']});
 await voltar(db,bk);
 const log=(await db.query(`select quem,tabela,operacao,registro_id from painel_mkt_log where motivo='Volta do backup'`)).rows;
 assert.ok(log.some(l=>l.quem==='leo'&&l.tabela==='painel_mkt_orcamento_vinculo'&&l.operacao==='delete'),'o orçamento tirado de B ficou no log');
 assert.ok(log.some(l=>l.quem==='leo'&&l.tabela==='painel_mkt_acoes'&&l.registro_id===a.id));
 assert.equal((await db.query(`select acao_id from painel_mkt_orcamento_vinculo where orcamento_id='1'`)).rows[0].acao_id,a.id);
 assert.ok(b.id);
});

test('vínculo sem a ação no arquivo (cópia no meio de uma gravação) não derruba a volta inteira', pular, async()=>{
 const db=await banco();
 const bk=await copiar(db);
 bk.painel_mkt_orcamento_vinculo=[{orcamento_id:'77',acao_id:'99999999-2222-4333-8444-555555555555',criado_em:new Date().toISOString(),criado_por:'x'}];
 const r=(await voltar(db,bk)).rows[0].r;
 assert.equal(r.verificado,true);
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_orcamento_vinculo`)).rows[0].n,0);
});

test('ação antiga com orçamento já ligado a uma ação nova: trava dizendo qual', pular, async()=>{
 const db=await banco();
 await salvar(db,{nome:'Outdoor novo',orcs:['55']});
 await db.exec(`insert into painel_registros(colecao,id,registro) values('marketing','mkt-z','{"tipo":"acao","nome":"Z","orcamentos":["55"]}')`);
 await assert.rejects(db.query(`select public.painel_mkt_migrar_legado('leo')`),e=>e.code==='23505'&&/Outdoor novo/.test(e.detail));
 assert.equal((await db.query(`select count(*)::int n from painel_mkt_acoes`)).rows[0].n,1);
});

test('a cópia sai num retrato só e lista as tabelas painel_mkt_* que existem', pular, async()=>{
 const db=await banco();
 await salvar(db,{orcs:['3']});
 const c=(await db.query(`select public.painel_mkt_exportar() as c`)).rows[0].c;
 assert.deepEqual(c.tabelas,['painel_mkt_acoes','painel_mkt_log','painel_mkt_orcamento_vinculo']);
 assert.equal(c.painel_mkt_acoes.length,1);assert.equal(c.painel_mkt_orcamento_vinculo.length,1);assert.ok(c.painel_mkt_log.length>=2);
});
