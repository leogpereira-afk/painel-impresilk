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
 // A a1 e a a2, em ordem, como o Supabase aplica. Cada uma duas vezes:
 // rodar de novo não quebra.
 for(const arquivo of ['20261010a_marketing_base.sql','20261011a_marketing_canais.sql']){
  const sql=await readFile(new URL('../supabase/migrations/'+arquivo,import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
 }
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
 assert.deepEqual(c.tabelas,['painel_mkt_acoes','painel_mkt_canais','painel_mkt_log','painel_mkt_metricas_canal','painel_mkt_orcamento_vinculo','painel_mkt_papeis','painel_mkt_playbook','painel_mkt_publicacoes']);
 // Toda tabela que existe está na cópia (a lista do backup confere a mesma coisa).
 for(const t of c.tabelas)assert.ok(Array.isArray(c[t]),t);
 assert.equal(c.painel_mkt_acoes.length,1);assert.equal(c.painel_mkt_orcamento_vinculo.length,1);assert.ok(c.painel_mkt_log.length>=2);
});

// ==== Etapa a2 (11/10/2026): canais, playbook, publicações, números, papéis ====
import {padraoParaBanco} from '../supabase/functions/_shared/marketing.mjs';
import {CANAIS_PADRAO,PLAYBOOK_PADRAO} from '../supabase/functions/_shared/marketing-padrao.mjs';
import {readFileSync} from 'node:fs';

const fn=(db,nome,args,params)=>db.query(`select public.${nome}(${args}) as r`,params).then(x=>x.rows[0].r);
const uma=(db,sql,params=[])=>db.query(sql,params).then(x=>x.rows[0]);
const conta=(db,tabela,onde='true',params=[])=>uma(db,`select count(*)::int n from ${tabela} where ${onde}`,params).then(x=>x.n);
const IG={codigo:'instagram',nome:'Instagram',grupo:'digital',icone:'instagram',cor:'#c13584',ordem:20,ativo:true,em_implantacao:false,dias_parado:7};
const salvarCanal=(db,dados=IG,{id=null,versao=null,quem='leo'}={})=>fn(db,'painel_mkt_salvar_canal','$1::uuid,$2::jsonb,$3::int,$4',[id,JSON.stringify(dados),versao,quem]);
const salvarItem=(db,dados,{id=null,versao=null,quem='leo'}={})=>fn(db,'painel_mkt_salvar_playbook','$1::uuid,$2::jsonb,$3::int,$4',[id,JSON.stringify(dados),versao,quem]);
const salvarPub=(db,dados,{id=null,versao=null,quem='ana'}={})=>fn(db,'painel_mkt_salvar_publicacao','$1::uuid,$2::jsonb,$3::int,$4',[id,JSON.stringify({fonte:'manual',...dados}),versao,quem]);
const importar=(db,linhas,quem='ana')=>fn(db,'painel_mkt_importar_publicacoes','$1::jsonb,$2',[JSON.stringify(linhas),quem]);
const metricas=(db,canal,semana,dados,quem='ana')=>fn(db,'painel_mkt_salvar_metricas','$1::uuid,$2::date,$3::jsonb,$4',[canal,semana,JSON.stringify({fonte:'manual',...dados}),quem]);
const padrao=(db,quem='leo')=>fn(db,'painel_mkt_carregar_padrao','$1::jsonb,$2',[JSON.stringify(padraoParaBanco(CANAIS_PADRAO,PLAYBOOK_PADRAO)),quem]);
const exportar=db=>uma(db,`select public.painel_mkt_exportar() as c`).then(x=>x.c);
const voltarTudo=(db,c)=>db.query(`select public.painel_restaurar_atomico($1::jsonb) as r`,[JSON.stringify({registros:[],contas:[],gestao:{},marketing:{...c,quem:'leo'}})]).then(x=>x.rows[0].r);

test('o caso ruim: o mesmo link duas vezes no mesmo canal é recusado pela chave; sem link entra sempre', pular, async()=>{
 const db=await banco();
 const c=await salvarCanal(db),outro=await salvarCanal(db,{...IG,codigo:'facebook',nome:'Facebook',icone:'facebook'});
 await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:10});
 await assert.rejects(salvarPub(db,{canal_id:c.id,data:'2026-10-06',url:'https://example.com/p/1'}),e=>e.code==='23505'&&/painel_mkt_publicacoes_canal_url/.test(e.message));
 // Outro canal pode ter o mesmo link (o mesmo post espelhado).
 await salvarPub(db,{canal_id:outro.id,data:'2026-10-05',url:'https://example.com/p/1'});
 await salvarPub(db,{canal_id:c.id,data:'2026-10-05',titulo:'sem link'});await salvarPub(db,{canal_id:c.id,data:'2026-10-05',titulo:'sem link'});
 assert.equal(await conta(db,'painel_mkt_publicacoes'),4);
});

test('o caso ruim: número não informado fica NULO no banco, nunca zero, e o banco recusa número negativo', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const p=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',alcance:0,impressoes:null});
 assert.equal(p.alcance,0);assert.equal(p.impressoes,null);assert.equal(p.leads,null);
 await assert.rejects(salvarPub(db,{canal_id:c.id,data:'2026-10-05',alcance:-1}),e=>e.code==='23514');
});

test('canal: código único e fixo, versão otimista, criar com o id da tela devolve o mesmo', pular, async()=>{
 const db=await banco();
 const c=await salvarCanal(db);assert.equal(c.versao,1);assert.equal(c.codigo,'instagram');
 await assert.rejects(salvarCanal(db,{...IG,nome:'Outro'}),e=>e.code==='23505'&&/painel_mkt_canais_codigo/.test(e.message));
 // Editar não muda o código, mesmo que ele venha no pedido.
 const e=await salvarCanal(db,{...IG,codigo:'insta',nome:'Instagram da Impresilk',ordem:5},{id:c.id,versao:1});
 assert.equal(e.codigo,'instagram');assert.equal(e.nome,'Instagram da Impresilk');assert.equal(e.versao,2);
 await assert.rejects(salvarCanal(db,{...IG,nome:'Velha'},{id:c.id,versao:1}),e=>e.code==='40001');
 await assert.rejects(salvarCanal(db,IG,{id:'99999999-2222-4333-8444-555555555555',versao:1}),e=>e.code==='P0002');
 const id='11111111-2222-4333-8444-555555555555',dados={...IG,codigo:'site',nome:'Site',icone:'globe'};
 const a=await salvarCanal(db,dados,{id}),b=await salvarCanal(db,dados,{id});
 assert.equal(a.id,id);assert.equal(b.id,id);assert.equal(await conta(db,'painel_mkt_canais'),2);
 await assert.rejects(salvarCanal(db,dados,{id,quem:'bia'}),e=>e.code==='P0002');
 // O banco segura formato que o servidor deixou passar.
 await assert.rejects(salvarCanal(db,{...IG,codigo:'Maiúsculo'}),e=>e.code==='23514');
 await assert.rejects(salvarCanal(db,{...IG,codigo:'x2',cor:'azul'}),e=>e.code==='23514');
});

test('o caso ruim: rotina sem recorrência, gatilho sem evento e implantação em rotina não entram nem pelo banco', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const base={canal_id:c.id,titulo:'X',checklist:[]};
 await assert.rejects(salvarItem(db,{...base,tipo:'rotina'}),e=>e.code==='23514');
 await assert.rejects(salvarItem(db,{...base,tipo:'gatilho'}),e=>e.code==='23514');
 await assert.rejects(salvarItem(db,{...base,tipo:'rotina',recorrencia:'semanal',implantacao:true}),e=>e.code==='23514');
 await assert.rejects(salvarItem(db,{...base,tipo:'rotina',recorrencia:'cada_n_dias'}),e=>e.code==='23514');
 await assert.rejects(salvarItem(db,{...base,tipo:'unica',canal_id:'99999999-2222-4333-8444-555555555555'}),e=>e.code==='P0002'&&/Canal/.test(e.message));
 const r=await salvarItem(db,{...base,tipo:'rotina',recorrencia:'cada_n_dias',a_cada_dias:15,meta_quantidade:1});
 assert.equal(r.a_cada_dias,15);assert.equal(r.prioridade,'media');assert.equal(r.evidencia,'nenhuma');
});

test('concluir: item que pede link exige o link, rotina não se conclui, desmarcar limpa, e trocar o tipo apaga a conclusão', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const i=await salvarItem(db,{canal_id:c.id,tipo:'unica',titulo:'Bio',evidencia:'link',checklist:['a']});
 const concluir=(id,versao,feito,ev,quem='ana')=>fn(db,'painel_mkt_concluir_playbook','$1::uuid,$2::int,$3::boolean,$4,$5',[id,versao,feito,ev,quem]);
 await assert.rejects(concluir(i.id,1,true,'  '),e=>e.code==='22023'&&/evidência/.test(e.message));
 const feito=await concluir(i.id,1,true,'https://example.com/bio');
 assert.ok(feito.concluido_em);assert.equal(feito.concluido_por,'ana');assert.equal(feito.evidencia_valor,'https://example.com/bio');assert.equal(feito.versao,2);
 await assert.rejects(concluir(i.id,1,false,null),e=>e.code==='40001');
 const desfeito=await concluir(i.id,2,false,null);
 assert.equal(desfeito.concluido_em,null);assert.equal(desfeito.evidencia_valor,null);
 const r=await salvarItem(db,{canal_id:c.id,tipo:'rotina',titulo:'Stories',recorrencia:'diaria',meta_quantidade:1,checklist:[]});
 await assert.rejects(concluir(r.id,1,true,null),e=>e.code==='22023'&&/agenda/.test(e.message));
 // Ação única concluída que vira rotina perde a conclusão (o banco não deixa as duas coisas).
 await concluir(i.id,3,true,'https://example.com/bio');
 const virou=await salvarItem(db,{canal_id:c.id,tipo:'rotina',titulo:'Bio',recorrencia:'mensal',meta_quantidade:1,checklist:[]},{id:i.id,versao:4});
 assert.equal(virou.concluido_em,null);assert.equal(virou.tipo,'rotina');
 // Retirar: some (ativo=false), não apaga; retirar de novo é "não encontrado".
 const ret=await fn(db,'painel_mkt_retirar_playbook','$1::uuid,$2::int,$3',[virou.id,virou.versao,'leo']);
 assert.equal(ret.ativo,false);assert.equal(await conta(db,'painel_mkt_playbook'),2);
 await assert.rejects(fn(db,'painel_mkt_retirar_playbook','$1::uuid,$2::int,$3',[virou.id,ret.versao,'leo']),e=>e.code==='P0002');
});

test('publicação: editar o título não finge medição nova; editar número muda fonte e data; retirada não se edita', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const p=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:10});
 await db.exec(`update painel_mkt_publicacoes set coletado_em='2026-10-05T10:00:00Z', fonte='csv'`);
 const t=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:10,titulo:'Reel'},{id:p.id,versao:2-1});
 assert.equal(t.fonte,'csv');assert.equal(new Date(t.coletado_em).toISOString(),'2026-10-05T10:00:00.000Z');
 const n=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:25,titulo:'Reel'},{id:p.id,versao:t.versao});
 assert.equal(n.fonte,'manual');assert.notEqual(new Date(n.coletado_em).toISOString(),'2026-10-05T10:00:00.000Z');
 await assert.rejects(salvarPub(db,{canal_id:c.id,data:'2026-10-05',acao_id:'99999999-2222-4333-8444-555555555555'}),e=>e.code==='P0002'&&/Ação/.test(e.message));
 const r=await fn(db,'painel_mkt_retirar_publicacao','$1::uuid,$2::int,$3',[p.id,n.versao,'ana']);
 assert.ok(r.retirada_em);assert.equal(r.retirada_por,'ana');
 await assert.rejects(salvarPub(db,{canal_id:c.id,data:'2026-10-05'},{id:p.id,versao:r.versao}),e=>e.code==='P0002');
});

test('o caso ruim: importar o CSV não zera número que a linha não trouxe, não duplica e não ressuscita retirada', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const r1=await importar(db,[
  {linha:2,canal_id:c.id,data:'2026-10-01',url:'https://example.com/p/1',alcance:100,leads:3},
  {linha:3,canal_id:c.id,data:'2026-10-02',titulo:'sem link',alcance:5},
  {linha:4,canal_id:c.id,data:'2026-10-03',url:'https://example.com/p/2',cliques:7}]);
 assert.deepEqual(r1,{inseridas:3,atualizadas:0,iguais:0,retiradas:[]});
 // Segunda vez, com o leads em branco e o alcance novo: atualiza o alcance e MANTÉM o leads.
 const r2=await importar(db,[{linha:2,canal_id:c.id,data:'2026-10-01',url:'https://example.com/p/1',alcance:150,leads:null},{linha:4,canal_id:c.id,data:'2026-10-03',url:'https://example.com/p/2',cliques:7}]);
 assert.deepEqual(r2,{inseridas:0,atualizadas:1,iguais:1,retiradas:[]});
 const p1=await uma(db,`select alcance,leads,fonte,versao from painel_mkt_publicacoes where url='https://example.com/p/1'`);
 assert.deepEqual(p1,{alcance:150,leads:3,fonte:'csv',versao:2});
 // Retirada: a linha volta como "retirada", a publicação continua retirada.
 const p2=await uma(db,`select id,versao from painel_mkt_publicacoes where url='https://example.com/p/2'`);
 await fn(db,'painel_mkt_retirar_publicacao','$1::uuid,$2::int,$3',[p2.id,p2.versao,'ana']);
 const r3=await importar(db,[{linha:9,canal_id:c.id,data:'2026-10-03',url:'https://example.com/p/2',cliques:99}]);
 assert.deepEqual(r3,{inseridas:0,atualizadas:0,iguais:0,retiradas:[9]});
 assert.equal((await uma(db,`select cliques from painel_mkt_publicacoes where id=$1`,[p2.id])).cliques,7);
 // Uma linha que o banco recusa derruba o lote inteiro (tudo ou nada).
 const antes=await conta(db,'painel_mkt_publicacoes');
 await assert.rejects(importar(db,[{linha:2,canal_id:c.id,data:'2026-10-04',titulo:'boa'},{linha:3,canal_id:'99999999-2222-4333-8444-555555555555',data:'2026-10-04'}]),e=>e.code==='P0002');
 assert.equal(await conta(db,'painel_mkt_publicacoes'),antes);
});

test('números da semana: uma linha por canal e semana, só o número que veio muda, segunda-feira obrigatória', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const a=await metricas(db,c.id,'2026-10-05',{seguidores:5230,alcance:6100},'ana');
 const b=await metricas(db,c.id,'2026-10-05',{leads:4},'bia');
 assert.equal(b.id,a.id);assert.equal(b.versao,2);assert.equal(b.seguidores,5230);assert.equal(b.alcance,6100);assert.equal(b.leads,4);assert.equal(b.atualizado_por,'bia');
 const c2=await metricas(db,c.id,'2026-10-05',{alcance:null},'ana');
 assert.equal(c2.alcance,null);assert.equal(c2.seguidores,5230);
 assert.equal(await conta(db,'painel_mkt_metricas_canal'),1);
 await assert.rejects(metricas(db,c.id,'2026-10-07',{alcance:1}),e=>e.code==='22023'&&/segunda/.test(e.message));
 await assert.rejects(metricas(db,'99999999-2222-4333-8444-555555555555','2026-10-05',{alcance:1}),e=>e.code==='P0002');
});

test('papéis: definir, trocar e tirar; o log acha a pessoa pelo id_pessoa', pular, async()=>{
 const db=await banco();
 const definir=(id,papel)=>fn(db,'painel_mkt_definir_papel','$1,$2,$3',[id,papel,'leo']);
 assert.equal((await definir('123456','visualizacao')).papel,'visualizacao');
 assert.equal((await definir('123456','gestao')).papel,'gestao');
 assert.equal(await conta(db,'painel_mkt_papeis'),1);
 assert.equal(await definir('123456',null),null);
 assert.equal(await conta(db,'painel_mkt_papeis'),0);
 await assert.rejects(definir('123456','dono'),e=>e.code==='23514');
 await assert.rejects(definir('Ana','gestao'),e=>e.code==='23514');
 const log=(await db.query(`select operacao,registro_id,quem from painel_mkt_log where tabela='painel_mkt_papeis' order by em`)).rows;
 assert.deepEqual(log.map(l=>[l.operacao,l.registro_id,l.quem]),[['insert','123456','leo'],['update','123456','leo'],['delete','123456','leo']]);
});

test('carga padrão: entra uma vez, não sobrescreve o que a casa editou e pendura o item no canal que já existia', pular, async()=>{
 const db=await banco();
 // A casa criou o Instagram antes, com outro nome e outra cor.
 const casa=await salvarCanal(db,{...IG,nome:'Insta da casa',cor:'#000000'});
 const r1=await padrao(db);
 const total=padraoParaBanco(CANAIS_PADRAO,PLAYBOOK_PADRAO);
 assert.deepEqual(r1,{canais:total.canais.length-1,itens:total.playbook.length});
 const ig=await uma(db,`select id,nome,cor from painel_mkt_canais where codigo='instagram'`);
 assert.deepEqual(ig,{id:casa.id,nome:'Insta da casa',cor:'#000000'});
 assert.equal(await conta(db,'painel_mkt_playbook','canal_id=$1',[casa.id]),PLAYBOOK_PADRAO.filter(i=>i.canal==='instagram').length);
 // Editar um item e rodar de novo: nada entra, nada muda.
 const item=await uma(db,`select id,versao from painel_mkt_playbook where codigo='instagram-3'`);
 await salvarItem(db,{canal_id:casa.id,tipo:'rotina',titulo:'5 posts por semana',recorrencia:'semanal',meta_quantidade:5,checklist:[]},{id:item.id,versao:item.versao});
 await db.query(`select public.painel_mkt_retirar_playbook(id,versao,'leo') from painel_mkt_playbook where codigo='site-1'`);
 assert.deepEqual(await padrao(db),{canais:0,itens:0});
 assert.equal((await uma(db,`select titulo from painel_mkt_playbook where codigo='instagram-3'`)).titulo,'5 posts por semana');
 assert.equal((await uma(db,`select ativo from painel_mkt_playbook where codigo='site-1'`)).ativo,false);
 assert.equal((await uma(db,`select em_implantacao from painel_mkt_canais where codigo='pinterest'`)).em_implantacao,true);
 assert.ok((await db.query(`select 1 from painel_mkt_log where motivo='Carga padrão do Marketing'`)).rows.length>0);
});

test('a ação ganha canal (que tem de existir) e responsável por id; a aba antiga não apaga o que a nova escolheu', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const s=(id,dados,versao)=>fn(db,'painel_mkt_salvar_acao','$1::uuid,$2::jsonb,$3::text[],$4::int,$5',[id,JSON.stringify({nome:'Reel',prazo:'2026-10-20',situacao:'Ideia',investimento:0,...dados}),[],versao,'ana']);
 await assert.rejects(s(null,{canal_id:'99999999-2222-4333-8444-555555555555',responsavel_id:'123456'},null),e=>e.code==='P0002'&&/Canal/.test(e.message));
 await assert.rejects(s(null,{responsavel_id:'Ana'},null),e=>e.code==='23514');
 const a=await s(null,{canal_id:c.id,responsavel_id:'123456',responsavel_texto:'Ana antiga',canal_texto:'Insta'},null);
 assert.equal(a.canal_id,c.id);assert.equal(a.responsavel_id,'123456');
 // Aba antiga: manda só os textos. O canal e a pessoa ficam.
 const b=await s(a.id,{canal_texto:'Instagram',responsavel_texto:'Ana'},1);
 assert.equal(b.canal_id,c.id);assert.equal(b.responsavel_id,'123456');assert.equal(b.canal_texto,'Instagram');
 // Aba nova: manda só os ids. O texto antigo fica guardado.
 const d=await s(a.id,{canal_id:null,responsavel_id:'654321'},2);
 assert.equal(d.canal_id,null);assert.equal(d.responsavel_id,'654321');assert.equal(d.responsavel_texto,'Ana');
});

test('backup a2: a volta traz as tabelas novas, a versão nunca repete e uma aba velha recebe conflito', pular, async()=>{
 const db=await banco();
 await padrao(db);
 const ig=await uma(db,`select * from painel_mkt_canais where codigo='instagram'`);
 const p=await salvarPub(db,{canal_id:ig.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:10});
 await metricas(db,ig.id,'2026-10-05',{seguidores:100});
 await fn(db,'painel_mkt_definir_papel','$1,$2,$3',['123456','visualizacao','leo']);
 const bk=await exportar(db);
 // Depois da cópia: muda o canal, o número, a publicação e o papel.
 await salvarCanal(db,{...IG,nome:'Mudou depois'},{id:ig.id,versao:1});
 await salvarPub(db,{canal_id:ig.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:999},{id:p.id,versao:1});
 await metricas(db,ig.id,'2026-10-05',{seguidores:200});
 await fn(db,'painel_mkt_definir_papel','$1,$2,$3',['123456','gestao','leo']);
 const nasceu=await salvarPub(db,{canal_id:ig.id,data:'2026-10-06',url:'https://example.com/p/novo'});
 const r=await voltarTudo(db,bk);assert.equal(r.verificado,true);
 const c=await uma(db,`select nome,versao from painel_mkt_canais where id=$1`,[ig.id]);
 assert.equal(c.nome,'Instagram');assert.ok(c.versao>2,`versão do canal: ${c.versao}`);
 await assert.rejects(salvarCanal(db,{...IG,nome:'Aba velha'},{id:ig.id,versao:2}),e=>e.code==='40001');
 assert.equal((await uma(db,`select alcance from painel_mkt_publicacoes where id=$1`,[p.id])).alcance,10);
 assert.equal((await uma(db,`select seguidores from painel_mkt_metricas_canal where canal_id=$1`,[ig.id])).seguidores,100);
 assert.equal((await uma(db,`select papel from painel_mkt_papeis where id_pessoa='123456'`)).papel,'visualizacao');
 // O que nasceu depois fica.
 assert.equal(await conta(db,'painel_mkt_publicacoes','id=$1',[nasceu.id]),1);
 assert.equal(await conta(db,'painel_mkt_playbook'),PLAYBOOK_PADRAO.length);
 assert.ok((await db.query(`select 1 from painel_mkt_log where motivo='Volta do backup' and tabela='painel_mkt_canais' and quem='leo'`)).rows.length>0);
});

test('o caso ruim: banco novo que recebeu a carga padrão ANTES da volta; o canal do arquivo vence e nada que apontava para o outro se perde', pular, async()=>{
 const velho=await banco();
 await padrao(velho);
 const igVelho=await uma(velho,`select id from painel_mkt_canais where codigo='instagram'`);
 await salvarPub(velho,{canal_id:igVelho.id,data:'2026-09-01',url:'https://example.com/p/1',alcance:10});
 await metricas(velho,igVelho.id,'2026-09-07',{seguidores:100});
 const bk=await exportar(velho);
 // Banco novo (outro dia, outra instalação): carga padrão gera OUTROS ids.
 const db=await banco();
 await padrao(db);
 const igNovo=await uma(db,`select id from painel_mkt_canais where codigo='instagram'`);
 assert.notEqual(igNovo.id,igVelho.id);
 const nasceu=await salvarPub(db,{canal_id:igNovo.id,data:'2026-10-05',url:'https://example.com/p/novo'});
 const repetida=await salvarPub(db,{canal_id:igNovo.id,data:'2026-10-05',url:'https://example.com/p/1',alcance:999});
 await metricas(db,igNovo.id,'2026-09-07',{seguidores:555});
 const acao=await fn(db,'painel_mkt_salvar_acao','$1::uuid,$2::jsonb,$3::text[],$4::int,$5',[null,JSON.stringify({nome:'Reel',prazo:'2026-10-20',situacao:'Ideia',investimento:0,canal_id:igNovo.id,responsavel_texto:'Ana'}),[],null,'ana']);
 const r=await voltarTudo(db,bk);assert.equal(r.verificado,true);
 // Um canal por código, com o id do arquivo.
 assert.equal(await conta(db,'painel_mkt_canais'),CANAIS_PADRAO.length);
 assert.equal((await uma(db,`select id from painel_mkt_canais where codigo='instagram'`)).id,igVelho.id);
 // O que apontava para o canal do banco novo foi junto para o id do arquivo.
 assert.equal((await uma(db,`select canal_id from painel_mkt_publicacoes where id=$1`,[nasceu.id])).canal_id,igVelho.id);
 assert.equal((await uma(db,`select canal_id from painel_mkt_acoes where id=$1`,[acao.id])).canal_id,igVelho.id);
 // A mesma publicação (mesmo link) e a mesma semana: a do arquivo vence.
 assert.equal(await conta(db,'painel_mkt_publicacoes','id=$1',[repetida.id]),0);
 assert.equal((await uma(db,`select alcance from painel_mkt_publicacoes where url='https://example.com/p/1'`)).alcance,10);
 assert.equal((await uma(db,`select seguidores from painel_mkt_metricas_canal where semana='2026-09-07'`)).seguidores,100);
 // O playbook também: um item por código, sem sobra.
 assert.equal(await conta(db,'painel_mkt_playbook'),PLAYBOOK_PADRAO.length);
 assert.equal(await conta(db,'painel_mkt_playbook p join painel_mkt_canais c on c.id=p.canal_id',"c.codigo='instagram'"),PLAYBOOK_PADRAO.filter(i=>i.canal==='instagram').length);
});

test('backup: link trocado entre duas publicações depois da cópia volta sem tropeçar na chave', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const a=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/A'});
 const b=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/B'});
 const bk=await exportar(db);
 await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/C'},{id:a.id,versao:1});
 await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/A'},{id:b.id,versao:1});
 assert.equal((await voltarTudo(db,bk)).verificado,true);
 const urls=Object.fromEntries((await db.query(`select id,url from painel_mkt_publicacoes`)).rows.map(x=>[x.id,x.url]));
 assert.deepEqual(urls,{[a.id]:'https://example.com/A',[b.id]:'https://example.com/B'});
});

test('backup antigo (só a1) não mexe nas tabelas novas; ação com canal que não existe volta sem canal', pular, async()=>{
 const db=await banco();
 await padrao(db);
 const antes=await conta(db,'painel_mkt_canais');
 const acao={id:'11111111-2222-4333-8444-555555555555',nome:'Antiga',prazo:'2026-10-20',situacao:'Ideia',investimento:0,versao:1,criado_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),
  canal_id:'99999999-2222-4333-8444-555555555555',responsavel_texto:'Ana'};
 const r=await voltarTudo(db,{painel_mkt_acoes:[acao],painel_mkt_orcamento_vinculo:[],painel_mkt_log:[]});
 assert.equal(r.verificado,true);
 assert.equal(await conta(db,'painel_mkt_canais'),antes);
 assert.equal((await uma(db,`select canal_id from painel_mkt_acoes where id=$1`,[acao.id])).canal_id,null);
});

test('ninguém de fora lê nem grava as tabelas novas: só a service_role chama as funções novas', pular, async()=>{
 const db=await banco();
 for(const t of ['painel_mkt_canais','painel_mkt_playbook','painel_mkt_publicacoes','painel_mkt_metricas_canal','painel_mkt_papeis']){
  const p=await uma(db,`select has_table_privilege('anon',$1,'select') a, has_table_privilege('authenticated',$1,'insert') b, has_table_privilege('authenticated',$1,'select') c`,['public.'+t]);
  assert.deepEqual(p,{a:false,b:false,c:false},t);
 }
 const funcoes=['painel_mkt_salvar_canal(uuid,jsonb,integer,text)','painel_mkt_salvar_playbook(uuid,jsonb,integer,text)','painel_mkt_retirar_playbook(uuid,integer,text)',
  'painel_mkt_concluir_playbook(uuid,integer,boolean,text,text)','painel_mkt_salvar_publicacao(uuid,jsonb,integer,text)','painel_mkt_retirar_publicacao(uuid,integer,text)',
  'painel_mkt_importar_publicacoes(jsonb,text)','painel_mkt_salvar_metricas(uuid,date,jsonb,text)','painel_mkt_definir_papel(text,text,text)','painel_mkt_carregar_padrao(jsonb,text)',
  'painel_mkt_salvar_acao(uuid,jsonb,text[],integer,text)','painel_mkt_exportar()','painel_mkt_restaurar(jsonb)'];
 for(const f of funcoes){
  const p=await uma(db,`select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') b, has_function_privilege('service_role',$1,'execute') c`,['public.'+f]);
  assert.deepEqual(p,{a:false,b:false,c:true},f);
 }
 assert.equal((await uma(db,`select bool_and(relrowsecurity) r from pg_class where relname like 'painel_mkt_%' and relkind='r'`)).r,true);
 // Toda tabela painel_mkt_* tem o gatilho do log.
 const semLog=(await db.query(`select c.relname from pg_class c where c.relname like 'painel_mkt_%' and c.relkind='r' and c.relname<>'painel_mkt_log'
   and not exists (select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname like '%_log')`)).rows;
 assert.deepEqual(semLog,[]);
});

test('a lista do backup cobre todas as tabelas painel_mkt_* que as migrações criam', pular, async()=>{
 const db=await banco();
 const noBanco=(await exportar(db)).tabelas;
 const fonte=readFileSync(new URL('../supabase/functions/painel-backup/index.ts',import.meta.url),'utf8');
 const lista=[...fonte.match(/const TABELAS_MARKETING = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual([...lista].sort(),[...noBanco].sort());
});

test('volta com o id do arquivo já usado por outro código (não deveria existir): o outro canal sai, o que apontava para ele passa para o do arquivo', pular, async()=>{
 const db=await banco();
 const W='11111111-2222-4333-8444-000000000001',L='11111111-2222-4333-8444-000000000002';
 const ws=await salvarCanal(db,IG,{id:W});
 const bk=await exportar(db); // no arquivo: W é "instagram"
 // Mexido à mão no banco: W virou "zz", e um L nasceu com "instagram".
 await db.exec(`update painel_mkt_canais set codigo='zz' where id='${W}'`);
 await salvarCanal(db,{...IG,nome:'Outro'},{id:L});
 await salvarPub(db,{canal_id:L,data:'2026-10-05',url:'https://example.com/p/1'});
 await salvarPub(db,{canal_id:W,data:'2026-10-05',url:'https://example.com/p/1',alcance:7});
 await salvarPub(db,{canal_id:L,data:'2026-10-06',url:'https://example.com/p/2'});
 await metricas(db,L,'2026-10-05',{seguidores:1});await metricas(db,W,'2026-10-05',{seguidores:2});await metricas(db,L,'2026-09-28',{seguidores:3});
 const item=await salvarItem(db,{canal_id:L,tipo:'unica',titulo:'X',checklist:[]});
 assert.equal((await voltarTudo(db,bk)).verificado,true);
 assert.deepEqual((await db.query(`select id,codigo from painel_mkt_canais`)).rows,[{id:W,codigo:'instagram'}]);
 assert.equal(await conta(db,'painel_mkt_publicacoes','canal_id=$1',[W]),2);
 assert.equal((await uma(db,`select alcance from painel_mkt_publicacoes where url='https://example.com/p/1'`)).alcance,7);
 assert.deepEqual((await db.query(`select semana::text s,seguidores from painel_mkt_metricas_canal order by semana`)).rows,[{s:'2026-09-28',seguidores:3},{s:'2026-10-05',seguidores:2}]);
 assert.equal((await uma(db,`select canal_id from painel_mkt_playbook where id=$1`,[item.id])).canal_id,W);
 assert.ok(ws.id);
});

// ==== Consertos da revisão da a2 ====
test('o caso ruim: publicação retirada não trava o link para sempre; lançar de novo à mão traz a mesma linha de volta', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const p=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://instagram.com/p/X',alcance:10});
 const r=await fn(db,'painel_mkt_retirar_publicacao','$1::uuid,$2::int,$3',[p.id,p.versao,'ana']);
 const v=await salvarPub(db,{canal_id:c.id,data:'2026-10-06',url:'https://instagram.com/p/X',titulo:'Relançada',alcance:12},{id:'aaaaaaaa-2222-4333-8444-555555555555',quem:'bia'});
 // A mesma linha (o histórico continua num lugar só), ativa, com os dados novos.
 assert.equal(v.id,p.id);assert.equal(v.retirada_em,null);assert.equal(v.retirada_por,null);
 assert.equal(v.titulo,'Relançada');assert.equal(v.alcance,12);assert.equal(v.versao,r.versao+1);assert.equal(v.atualizado_por,'bia');
 assert.equal(await conta(db,'painel_mkt_publicacoes'),1);
 // Ativa de novo: o mesmo link continua recusado pela chave.
 await assert.rejects(salvarPub(db,{canal_id:c.id,data:'2026-10-07',url:'https://instagram.com/p/X'}),e=>e.code==='23505');
 // A volta fica no log.
 assert.ok(await conta(db,'painel_mkt_log',`tabela='painel_mkt_publicacoes' and registro_id=$1 and quem='bia'`,[p.id])>=1);
});

test('o caso ruim: CSV que só troca o título não marca como "importado hoje" os números lançados à mão', pular, async()=>{
 const db=await banco();const c=await salvarCanal(db);
 const p=await salvarPub(db,{canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/9',alcance:10,engajamento:3});
 await db.exec(`update painel_mkt_publicacoes set coletado_em='2026-10-05T10:00:00Z'`);
 const r=await importar(db,[{linha:2,canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/9',titulo:'Título novo'}]);
 assert.deepEqual(r,{inseridas:0,atualizadas:1,iguais:0,retiradas:[]});
 const u=await uma(db,`select titulo,alcance,engajamento,fonte,coletado_em from painel_mkt_publicacoes where id=$1`,[p.id]);
 assert.equal(u.titulo,'Título novo');assert.equal(u.alcance,10);assert.equal(u.engajamento,3);
 assert.equal(u.fonte,'manual');assert.equal(new Date(u.coletado_em).toISOString(),'2026-10-05T10:00:00.000Z');
 // Com número novo, aí sim: fonte csv e data de agora.
 await importar(db,[{linha:2,canal_id:c.id,data:'2026-10-05',url:'https://example.com/p/9',alcance:40}]);
 const n=await uma(db,`select alcance,fonte,coletado_em from painel_mkt_publicacoes where id=$1`,[p.id]);
 assert.equal(n.alcance,40);assert.equal(n.fonte,'csv');assert.notEqual(new Date(n.coletado_em).toISOString(),'2026-10-05T10:00:00.000Z');
});

test('o caso ruim: canal com código "geral" ou "materiais" não entra nem pelo banco (são vistas da página)', pular, async()=>{
 const db=await banco();
 for(const codigo of ['geral','materiais'])
  await assert.rejects(salvarCanal(db,{...IG,codigo,nome:codigo}),e=>e.code==='23514');
 assert.equal(await conta(db,'painel_mkt_canais'),0);
});
