import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {montarParticipacao} from '../supabase/functions/_shared/licitacoes-participacao.mjs';

const migracao='20261103235900_licitacao_preparacao_atomica.sql';
const sql=nome=>readFileSync(new URL('../supabase/migrations/'+nome,import.meta.url),'utf8');
async function fichaFicticia(){
 const pesquisa={estado:'disponivel',id:'pesquisa-ficticia-atomica',origem:'relatorio_publico_licitacoes',somenteLeitura:true,hash:'b'.repeat(64),geradoEm:'2026-11-03T12:00:00Z',oportunidades:[{id:'item-ficticio',orgao:'Órgão fictício',processo:'Processo fictício atômico',item:'Placas',lote:'',produto:'Sinalização fictícia',classificacao:'GO',prazo:'2026-11-04T12:00:00Z',oficialUrl:'https://example.com/edital',exigencias:['Conferir exigência fictícia.']}]};
 return (await montarParticipacao(pesquisa,{relatorioId:pesquisa.id,itemId:'item-ficticio'},{agora:new Date('2026-11-03T15:00:00Z'),quem:'Operador fictício'})).ficha;
}

test('PostgreSQL local: preparação atômica preserva vencedor, lixeira e permissões',async t=>{
 const db=new PGlite(),ficha=await fichaFicticia();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean);');
  for(const nome of ['0001_init.sql','20260906_proteger_registro_retirado.sql','20260906_equipamento_atomico.sql','20260906_lixeira_registros.sql','20261011120000_ramais_vinculos.sql','20261011120500_ativo_restaurar.sql',migracao])await db.exec(sql(nome));
  const preparar=async(registro=ficha,id=registro?.id)=> (await db.query('select public.painel_licitacao_preparar($1,$2) retorno',[id,registro])).rows[0].retorno;
  const limpar=()=>db.exec('truncate public.painel_registros;');
  const linhas=async()=> (await db.query('select colecao,id,registro,atualizado_em::text from public.painel_registros order by colecao,id')).rows;

  await t.test('criação conserva todos os campos e repetição retorna o vencedor sem atualizar nada',async()=>{
   assert.deepEqual(await preparar(),{item:ficha,repetido:false});
   const vencedor=structuredClone(ficha);vencedor.status='enviada';vencedor.observacao='Revisão humana a preservar';vencedor.temArquivo=true;vencedor.arquivoNome='Documento fictício.pdf';vencedor.acompanhamento.checklist[0].feito=true;vencedor.historico=[{acao:'conferido',por:'Pessoa fictícia'}];
   await db.query("update public.painel_registros set registro=$1,atualizado_em='2026-11-03T16:00:00Z' where colecao='ativo' and id=$2",[vencedor,ficha.id]);
   await db.query("insert into public.painel_registros(colecao,id,registro) values('arquivo',$1,$2)",[ficha.id,{conteudo:'bytes-ficticios',nome:'Documento fictício.pdf'}]);
   const antes=await linhas();
   for(let i=0;i<3;i++)assert.deepEqual(await preparar({...ficha,observacao:'Não substituir'}),{item:vencedor,repetido:true});
   assert.deepEqual(await linhas(),antes);await limpar();
  });

  await t.test('regressão: retirada entre leitura da Edge e gravação não ressuscita ativo nem anexo',async()=>{
   // A primeira chamada da Edge viu a ausência. Outra chamada cria e o usuário
   // retira antes que a primeira chegue à RPC: interleaving da falha original.
   assert.equal((await linhas()).length,0);
   await preparar();
   await db.query("insert into public.painel_registros(colecao,id,registro) values('arquivo',$1,$2)",[ficha.id,{conteudo:'bytes-ficticios',nome:'Preservar.pdf'}]);
   await db.query('select public.painel_ativo_retirar($1,null,$2)',[ficha.id,'Pessoa fictícia']);
   const retirada=await linhas();assert.deepEqual(retirada.map(r=>r.colecao),['arquivo_lixeira','ativo_lixeira']);
   await assert.rejects(preparar(),e=>e.code==='40001');
   assert.deepEqual(await linhas(),retirada);
   // O CAS genérico anterior reproduz a duplicação se usado isoladamente.
   // ROLLBACK mantém somente o registro retirado para o restante do ensaio.
   await db.exec('begin');
   await db.query('select public.painel_registro_gravar($1,$2,$3,null)',['ativo',ficha.id,ficha]);
   assert.deepEqual((await linhas()).map(r=>r.colecao),['arquivo_lixeira','ativo','ativo_lixeira']);
   await db.exec('rollback');assert.deepEqual(await linhas(),retirada);
   const tombstone=retirada.find(r=>r.colecao==='ativo_lixeira').registro;
   await db.query('select public.painel_ativo_restaurar($1,$2)',[ficha.id,tombstone]);
   const restaurado=await linhas();assert.deepEqual(restaurado.map(r=>r.colecao),['arquivo','ativo']);
   assert.deepEqual(await preparar(),{item:ficha,repetido:true});assert.deepEqual(await linhas(),restaurado);await limpar();
  });

  await t.test('lixeira genérica também impede recriação e conserva o histórico integral',async()=>{
   await preparar();await db.query('select public.painel_registro_retirar($1,$2,$3)',['ativo',ficha.id,'Pessoa fictícia']);
   const antes=await linhas();assert.equal(antes[0].colecao,'registro_lixeira');
   await assert.rejects(preparar(),e=>e.code==='40001');assert.deepEqual(await linhas(),antes);await limpar();
  });

  await t.test('estado legado com ativo e lixeira não sofre reparo ou sobrescrita implícita',async()=>{
   await preparar();await db.query("insert into public.painel_registros(colecao,id,registro) values('ativo_lixeira',$1,$2)",[ficha.id,{...ficha,_apagadoEm:'2026-11-03T16:00:00Z'}]);
   const antes=await linhas();await assert.rejects(preparar(),e=>e.code==='40001');assert.deepEqual(await linhas(),antes);await limpar();
  });

  await t.test('ID ocupado por outro tipo não é exposto nem substituído',async()=>{
   await db.query("insert into public.painel_registros(colecao,id,registro) values('ativo',$1,$2)",[ficha.id,{id:ficha.id,tipo:'documento',nome:'Documento fictício privado'}]);
   const antes=await linhas();await assert.rejects(preparar(),e=>e.code==='23505'&&!e.message.includes('privado'));assert.deepEqual(await linhas(),antes);await limpar();
  });

  await t.test('Agendar manual e conferência pendente usam a mesma proteção sem exigir preparo do Bot',async()=>{
   for(const pendente of [false,true]){
    const manual=structuredClone(ficha);delete manual.preparacaoBot;manual.status='avaliar';manual.origemPesquisa.pendente=pendente;
    if(pendente){manual.validade='';manual.acompanhamento.prazoAcao='2026-11-04';}
    assert.deepEqual(await preparar(manual),{item:manual,repetido:false});
    assert.deepEqual(await preparar(ficha),{item:manual,repetido:true});
    await db.query('select public.painel_ativo_retirar($1,null,$2)',[manual.id,'Pessoa fictícia']);
    await assert.rejects(preparar(manual),e=>e.code==='40001');await limpar();
   }
  });

  await t.test('payload nulo, identidade inconsistente e origem inválida não gravam parcialmente',async()=>{
   for(const [id,registro] of [[null,ficha],['',ficha],['outro',ficha],[ficha.id,null],[ficha.id,[]],[ficha.id,{}],[ficha.id,{...ficha,id:'outro'}],[ficha.id,{...ficha,tipo:'documento'}],[ficha.id,{...ficha,origemPesquisa:null}],[ficha.id,{...ficha,origemPesquisa:{...ficha.origemPesquisa,pendente:'false'}}],[ficha.id,{...ficha,origemPesquisa:{...ficha.origemPesquisa,itemId:''}}]]){
    await assert.rejects(preparar(registro,id),e=>e.code==='23514');assert.deepEqual(await linhas(),[]);
   }
  });

  await t.test('apenas service_role executa a RPC e a definição mantém a ordem dos locks e o CAS',async()=>{
   const assinatura='public.painel_licitacao_preparar(text,jsonb)';
   for(const role of ['anon','authenticated']){
    assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') permitido',[role,assinatura])).rows[0].permitido,false);
    await db.exec('set role '+role);await assert.rejects(preparar(),e=>e.code==='42501');await db.exec('reset role');
   }
   assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') permitido',['service_role',assinatura])).rows[0].permitido,true);
   await db.exec('set role service_role');assert.deepEqual(await preparar(),{item:ficha,repetido:false});await db.exec('reset role');
   const definicao=(await db.query('select pg_get_functiondef($1::regprocedure) definicao',[assinatura])).rows[0].definicao;
   assert.ok(definicao.indexOf("'painel:ativo:'")<definicao.indexOf("'painel:equipamentos'"));assert.match(definicao,/public\.painel_registro_gravar\('ativo',p_id,p_registro,null\)/);
  });
 }finally{await db.close();}
});
