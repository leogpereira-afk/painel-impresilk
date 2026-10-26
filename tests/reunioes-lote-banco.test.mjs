// PostgreSQL em memória, apenas dados fictícios. Não acessa Supabase.
import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const sql=nome=>readFileSync(new URL('../supabase/migrations/'+nome,import.meta.url),'utf8');
const entrada=(id,versao='v1',anterior=null,extra={})=>({colecao:'reunioes_empresa',id,registro:{id,versao,titulo:'Encontro fictício',...extra},anterior});
const lote=itens=>db.query('select public.painel_reunioes_gravar_lote($1::jsonb) as itens',[JSON.stringify(itens)]);
const obter=async(id,colecao='reunioes_empresa')=>(await db.query('select registro from public.painel_registros where colecao=$1 and id=$2',[colecao,id])).rows[0]?.registro;
const contar=async()=>Number((await db.query('select count(*) as n from public.painel_registros')).rows[0].n);
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table public.painel_registros(colecao text not null,id text not null,registro jsonb not null,atualizado_em timestamptz not null default now(),primary key(colecao,id));
 alter table public.painel_registros enable row level security;`);
 await db.exec(sql('20260906_proteger_registro_retirado.sql'));
 await db.exec('revoke all on function public.painel_registro_gravar(text,text,jsonb,jsonb) from public,anon,authenticated; grant execute on function public.painel_registro_gravar(text,text,jsonb,jsonb) to service_role;');
 await db.exec(sql('20261026165648_reunioes_lote_atomico.sql'));
});
after(()=>db.close());
beforeEach(async()=>{await db.exec('reset role; truncate public.painel_registros');});

test('lote permite somente service_role e não depende de privilégios diretos na tabela',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(lote([entrada('a')]),e=>e.code==='42501');await db.exec('reset role');
 }
 await db.exec('set role service_role');const result=await lote([entrada('a')]);assert.equal(result.rows[0].itens[0].id,'a');
 await assert.rejects(db.query('select * from public.painel_registros'),e=>e.code==='42501');await db.exec('reset role');assert.equal(await contar(),1);
 const meta=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.painel_reunioes_gravar_lote(jsonb)'::regprocedure")).rows[0];assert.equal(meta.prosecdef,false);assert.deepEqual(meta.proconfig,['search_path=""']);
});
test('CAS real salva todas as ocorrências e retry exato não as duplica',async()=>{
 const itens=[entrada('serie'),entrada('serie_r2')];await lote(itens);await lote(itens);assert.equal(await contar(),2);
 const antigos=await Promise.all(itens.map(e=>obter(e.id)));await lote(itens.map((e,i)=>entrada(e.id,'v2',antigos[i],{titulo:'Ajustado'})));
 assert.equal((await obter('serie')).titulo,'Ajustado');assert.equal((await obter('serie_r2')).versao,'v2');
});
test('erro de CAS no último item desfaz a edição já feita no primeiro',async()=>{
 await lote([entrada('a'),entrada('z')]);
 await assert.rejects(lote([entrada('a','v2',await obter('a')),entrada('z','v2',{id:'z',versao:'antiga'})]),e=>e.code==='40001');
 assert.equal((await obter('a')).versao,'v1');assert.equal((await obter('z')).versao,'v1');
});
test('colisão de criação desfaz ocorrências anteriores e não toma uma reunião única',async()=>{
 await lote([entrada('z','ocupado')]);
 await assert.rejects(lote([entrada('a'),entrada('z','serie')]),e=>e.code==='40001');assert.equal(await obter('a'),undefined);assert.equal((await obter('z')).versao,'ocupado');
});
test('lixeira impede recriação e desfaz o restante do lote',async()=>{
 await db.query("insert into public.painel_registros values('registro_lixeira','reunioes_empresa:z','{}',now())");
 await assert.rejects(lote([entrada('a'),entrada('z')]),e=>e.code==='40001');assert.equal(await obter('a'),undefined);assert.equal(await obter('z'),undefined);assert.equal(await contar(),1);
});
test('dois escritores com o mesmo snapshot preservam o vencedor e rejeitam o atrasado',async()=>{
 await lote([entrada('a'),entrada('b')]);const a=await obter('a'),b=await obter('b');
 const results=await Promise.allSettled([lote([entrada('b','editor1',b),entrada('a','editor1',a)]),lote([entrada('a','editor2',a),entrada('b','editor2',b)])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'40001');assert.equal((await obter('a')).versao,(await obter('b')).versao);
});
function encaminhamento(antes){
 const reuniao=entrada('r','v2',antes,{decisoes:[{id:'decisao',demandaId:'demanda'}]});
 const demanda={colecao:'processos_empresa',id:'demanda',anterior:null,registro:{id:'demanda',versao:'nova',tipo:'demanda',origemReuniaoId:'r',origemDecisaoId:'decisao'}};
 return [reuniao,demanda];
}
test('demanda e vínculo da decisão persistem na mesma transação e aceitam retry exato',async()=>{
 await lote([entrada('r','v1',null,{decisoes:[{id:'decisao'}]})]);const itens=encaminhamento(await obter('r'));await lote(itens);await lote(itens);
 assert.equal((await obter('r')).decisoes[0].demandaId,'demanda');assert.equal((await obter('demanda','processos_empresa')).origemReuniaoId,'r');assert.equal(await contar(),2);
});
test('conflito na reunião desfaz a demanda criada antes pela ordem de travas',async()=>{
 await lote([entrada('r','v1',null,{decisoes:[{id:'decisao'}]})]);
 await assert.rejects(lote(encaminhamento({id:'r',versao:'antiga'})),e=>e.code==='40001');assert.equal(await obter('demanda','processos_empresa'),undefined);assert.equal((await obter('r')).decisoes[0].demandaId,undefined);
});
test('lixeira de demanda impede conversão sem deixar vínculo pendurado',async()=>{
 await lote([entrada('r','v1',null,{decisoes:[{id:'decisao'}]})]);await db.exec("insert into public.painel_registros values('registro_lixeira','processos_empresa:demanda','{}',now())");
 await assert.rejects(lote(encaminhamento(await obter('r'))),e=>e.code==='40001');assert.equal((await obter('r')).decisoes[0].demandaId,undefined);
});
test('contrato rejeita coleção alheia, IDs divergentes, duplicação e demanda sem vínculo',async()=>{
 const invalidos=[null,{},[],Array.from({length:105},(_,i)=>entrada('a'+i)),[{...entrada('a'),colecao:'acesso_conta'}],[{...entrada('a'),id:'outro'}],[entrada('a'),entrada('a')],[{...entrada('a'),anterior:[]}],[{...entrada('a'),anterior:{id:'outro'}}],[{...entrada('a'),registro:{id:'a'}}],[{...entrada('a'),colecao:'processos_empresa'}]];
 for(const itens of invalidos)await assert.rejects(lote(itens),e=>e.code==='22023');
 const semVinculo=encaminhamento({id:'r',versao:'v1'});semVinculo[0].registro.decisoes=[];await assert.rejects(lote(semVinculo),e=>e.code==='22023');assert.equal(await contar(),0);
});
