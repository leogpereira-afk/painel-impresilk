import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;try{({PGlite}=await import('@electric-sql/pglite'));}catch{if(process.env.PGLITE_PATH)({PGlite}=await import(pathToFileURL(process.env.PGLITE_PATH).href));}

// Prova, contra as migrações reais (PGlite), que o vínculo pela ficha cabe nas
// regras que já estão no ar, sem migração nova. Cada db.query é uma transação,
// como cada RPC do painel-ativos: a regra adiada roda no fim de cada uma.
const pasta=new URL('../supabase/migrations/',import.meta.url);
const pacote=(await readdir(pasta)).filter(n=>/^20261011\d*_(ramais_vinculos|celulares_vinculos|equipamentos_familias|fisicos_numeracao|fisicos_integridade|ativo_restaurar|infra_referencias)\.sql$/.test(n)).sort();
async function banco(){
 const db=new PGlite();
 await db.exec('create role anon;create role authenticated;create role service_role;create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');
 for(const n of ['20260906_equipamento_atomico.sql','20260906_lixeira_registros.sql','20260906_proteger_registro_retirado.sql',...pacote])await db.exec(await readFile(new URL(n,pasta),'utf8'));
 return db;
}
const put=(db,c,id,r)=>db.query('insert into painel_registros(colecao,id,registro) values($1,$2,$3)',[c,id,r]);
const gravar=(db,c,id,novo,anterior)=>db.query('select painel_registro_gravar($1,$2,$3,$4)',[c,id,novo,anterior]);
const ler=async(db,c,id)=>(await db.query('select registro from painel_registros where colecao=$1 and id=$2',[c,id])).rows[0]?.registro;
const recusa=(db,promessa,code='23503')=>assert.rejects(promessa,e=>e.code===code);

test('pacote de migrações encontrado',()=>{assert.equal(pacote.length,7);});

test('ligar só pela ficha passa; ligar a bem com origem de outra ficha falha com 23503',{skip:!PGlite},async()=>{const db=await banco();try{
 const maq={id:'maq',tipo:'maquina',nome:'Máquina fictícia'};
 await put(db,'patrimonio','bem',{codigo:'GER-001'});await put(db,'ativo','maq',maq);
 await gravar(db,'ativo','maq',{...maq,bemId:'bem'},maq);
 assert.equal((await ler(db,'ativo','maq')).bemId,'bem');assert.equal((await ler(db,'patrimonio','bem')).origemAtivoId,undefined);
 const carro={id:'carro',tipo:'veiculo',nome:'Carro fictício'};
 await put(db,'ativo','carro',carro);await put(db,'ativo','outra',{tipo:'veiculo'});await put(db,'patrimonio','bem-alheio',{origemAtivoId:'outra'});
 await recusa(db,gravar(db,'ativo','carro',{...carro,bemId:'bem-alheio'},carro));
 // O bem já usado pela ficha `maq` também não serve a outra.
 await recusa(db,gravar(db,'ativo','carro',{...carro,bemId:'bem'},carro));
 assert.equal((await ler(db,'ativo','carro')).bemId,undefined);
}finally{await db.close();}});

test('desfazer: limpar a ficha com o bem apontando falha; bem primeiro e ficha depois passa',{skip:!PGlite},async()=>{const db=await banco();try{
 const bem={codigo:'GER-002',origemAtivoId:'pc'},pc={id:'pc',tipo:'informatica',categoria:'Computador',nome:'PC fictício',bemId:'bem'};
 await put(db,'patrimonio','bem',bem);await put(db,'ativo','pc',pc);
 await recusa(db,gravar(db,'ativo','pc',{...pc,bemId:''},pc));
 const {origemAtivoId:_fora,...semOrigem}=bem;
 await gravar(db,'patrimonio','bem',semOrigem,bem);
 await gravar(db,'ativo','pc',{...pc,bemId:''},pc);
 assert.equal((await ler(db,'ativo','pc')).bemId,'');assert.equal((await ler(db,'patrimonio','bem')).origemAtivoId,undefined);
 // Vínculo legado só pelo bem: a ficha sobe a versão sem mexer no bemId.
 const leg={id:'pc-leg',tipo:'informatica',categoria:'Computador'};await put(db,'ativo','pc-leg',leg);await put(db,'patrimonio','bem-leg',{origemAtivoId:'pc-leg'});
 await gravar(db,'patrimonio','bem-leg',{},{origemAtivoId:'pc-leg'});
 await gravar(db,'ativo','pc-leg',{...leg,atualizadoEm:'v2'},leg);
}finally{await db.close();}});

test('retirar bem ligado pela ficha passa no banco (por isso o painel-config confere antes e depois)',{skip:!PGlite},async()=>{const db=await banco();try{
 await put(db,'patrimonio','bem',{codigo:'GER-003'});await put(db,'ativo','maq',{tipo:'maquina',bemId:'bem'});
 await db.query("select painel_registro_retirar('patrimonio','bem','teste')");
 assert.equal(await ler(db,'patrimonio','bem'),undefined);assert.equal((await ler(db,'ativo','maq')).bemId,'bem');
 // A volta que o painel-config usa na corrida devolve o bem como era.
 await db.query("select painel_registro_recuperar('patrimonio:bem')");
 assert.deepEqual(await ler(db,'patrimonio','bem'),{codigo:'GER-003'});
}finally{await db.close();}});

test('restaurar ficha cujo bem já está em outra: sem regravar falha; regravando a lixeira sem bemId passa',{skip:!PGlite},async()=>{const db=await banco();try{
 const lixo={id:'pc',tipo:'informatica',categoria:'Computador',nome:'PC fictício',bemId:'bem',_apagadoEm:'ontem'};
 await put(db,'patrimonio','bem',{codigo:'GER-004'});await put(db,'ativo','pc-2',{tipo:'informatica',categoria:'Computador',bemId:'bem'});
 await put(db,'ativo_lixeira','pc',lixo);
 await recusa(db,db.query('select painel_ativo_restaurar($1,$2)',['pc',lixo]));
 assert.deepEqual(await ler(db,'ativo_lixeira','pc'),lixo);
 const {bemId:_solto,...semBem}=lixo;const nova={...semBem,historicoVinculo:[{id:'e1',acao:'desvinculado',bemId:'bem',via:'restaurar'}]};
 await gravar(db,'ativo_lixeira','pc',nova,lixo);
 await recusa(db,db.query('select painel_ativo_restaurar($1,$2)',['pc',lixo]),'40001');
 await db.query('select painel_ativo_restaurar($1,$2)',['pc',nova]);
 const {_apagadoEm,...esperado}=nova;assert.deepEqual(await ler(db,'ativo','pc'),esperado);assert.equal(await ler(db,'ativo_lixeira','pc'),undefined);
}finally{await db.close();}});
