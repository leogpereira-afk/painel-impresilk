import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {conferirCopiaVirada} from '../supabase/functions/_shared/virada-backup.mjs';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const id='00000000-0000-4000-8000-000000000001',mid='00000000-0000-4000-8000-000000000002',fid='00000000-0000-4000-8000-000000000003';
const path=`virada/${id}/${mid}/${fid}.jpg`,photo=new Uint8Array([255,216,255,224,0,255,217]);
const row=()=>({id,ativo:true,versao:3,atualizado_em:'2026-01-01T12:00:00Z',registro:{id,versao:3,dias:90,nome:'Ciclo fictício',inicio:null,participantes:[],missoes:[{id:mid,evidencias:[{id:'evidencia-teste',texto:'Registro fictício',resultado:'Resultado fictício',fotos:[{id:fid,chave:path,nome:'foto.jpg',mime:'image/jpeg',tamanho:photo.length}]}],historico:[{acao:'validou_missao',xp:10}]}],mural:[],historico:[{acao:'criou_ciclo'}]}});
const source=readFileSync(new URL('../supabase/functions/painel-backup/index.ts',import.meta.url),'utf8')
 .replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__db;')
 .replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,'const verificarJwt=async()=>globalThis.__session;const crachaRevogado=async()=>false;');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-backup/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
function environment({rows=[row()],withPhoto=true,master=true}={}) {
 const data=structuredClone(rows),files=new Map(),calls=[];let handler,transportFailure=false,failTable=false,uploadObserver=null;
 if(withPhoto)files.set('virada-evidencias:'+path,photo);
 const db={from(table){let start=0,end=Infinity;const result=()=>({data:structuredClone(table==='virada_ciclos'?data.slice(start,end+1):[]),...(failTable&&table==='virada_ciclos'?{error:{message:'tabela indisponível'}}:{})});const q={select(){return q;},eq(){return q;},order(){return q;},range(a,b){start=a;end=b;return q;},maybeSingle(){return Promise.resolve({data:null});},then(a,b){return Promise.resolve(result()).then(a,b);}};return q;},async rpc(name,args){calls.push({name,args});if(name==='painel_mkt_exportar')return {data:{tabelas:[]}};assert.ok(['painel_restaurar_com_virada','painel_restaurar_atomico'].includes(name));if(transportFailure)throw new Error('transporte incerto');if(name==='painel_restaurar_com_virada')for(const r of args.p_backup.virada_ciclos)if(!data.some(x=>x.id===r.id))data.push(structuredClone(r));return {data:{verificado:true,viradaCiclos:args.p_backup.virada_ciclos?.length||0}};},storage:{from(bucket){return {
  async list(prefix,{offset=0,limit=100}){const head=bucket+':'+(prefix?prefix+'/':'');const out=new Map();for(const key of files.keys()){if(!key.startsWith(head))continue;const rest=key.slice(head.length),parts=rest.split('/');out.set(parts[0],{name:parts[0],id:parts.length===1?'file':null});}return {data:[...out.values()].slice(offset,offset+limit)};},
  async download(key){const bytes=files.get(bucket+':'+key);return bytes?{data:new Blob([bytes],{type:key.endsWith('.pdf')?'application/pdf':'image/jpeg'})}:{error:{statusCode:'404'}};},
  async upload(key,bytes,opts){assert.equal(opts.upsert,false);if(uploadObserver){const resultado=uploadObserver(key);if(resultado)return resultado;}files.set(bucket+':'+key,new Uint8Array(bytes));return {};},async remove(keys){keys.forEach(key=>files.delete(bucket+':'+key));return {};}
 };}}};
 vm.runInNewContext(code,{__db:db,__session:{sub:'direcao-ficticia',master,perms:['*']},Deno:{env:{get:()=> 'teste'},serve:fn=>handler=fn},Request,Response,Blob,TextEncoder,Uint8Array,crypto,atob,btoa,setTimeout,clearTimeout,console:{error(){}},fetch(){throw new Error('Sem rede neste ensaio');}});
 return {data,files,calls,transportFailure:()=>transportFailure=true,failTable:()=>failTable=true,onUpload:fn=>uploadObserver=fn,async call(body){const r=await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:r.status,...await r.json()};}};
}
test('exportação inclui ciclo exato, histórico e bytes no bucket privado',async()=>{
 const t=environment(),r=await t.call({action:'exportar'});assert.equal(r.status,200);assert.deepEqual(r.backup.painel.viradaCiclos[id],row());
 assert.equal(r.backup.arquivos[0].bucket,'virada-evidencias');assert.equal(r.backup.arquivos[0].caminho,path);assert.deepEqual(Buffer.from(r.backup.arquivos[0].base64,'base64'),Buffer.from(photo));assert.match(r.backup.arquivos[0].sha256,/^[a-f0-9]{64}$/);
});
test('não declara backup completo se tabela falhar ou faltar foto referenciada',async()=>{
 const a=environment({withPhoto:false});assert.equal((await a.call({action:'exportar'})).status,500);
 const b=environment();b.failTable();assert.equal((await b.call({action:'exportar'})).status,500);
});
test('restauro encaminha A Virada para RPC atômica e restaura bytes no bucket correto',async()=>{
 const source=environment(),bk=(await source.call({action:'exportar'})).backup,target=environment({rows:[],withPhoto:false});
 const r=await target.call({action:'restaurar',backup:bk});assert.equal(r.status,200);assert.deepEqual(target.data,[row()]);assert.deepEqual(target.files.get('virada-evidencias:'+path),photo);
 const rpc=target.calls.find(c=>c.name==='painel_restaurar_com_virada');assert.ok(rpc);assert.equal(rpc.args.p_backup.registros.length,0);assert.equal(rpc.args.p_backup.virada_ciclos[0].registro.missoes[0].historico[0].xp,10);
 assert.equal((await target.call({action:'restaurar',backup:bk})).status,200);assert.equal(target.files.size,1);assert.equal(target.data.length,1);
});
test('cópia antiga sem A Virada mantém RPC antiga e não altera ciclos',async()=>{
 const t=environment(),before=structuredClone(t.data),r=await t.call({action:'restaurar',backup:{versao:3,sistema:'painel',painel:{},contas:{},arquivos:[]}});
 assert.equal(r.status,200);assert.ok(t.calls.some(c=>c.name==='painel_restaurar_atomico'));assert.deepEqual(t.data,before);
});
test('restauro incerto preserva fotos privadas e não aceita manifesto incompleto',async()=>{
 const bk=(await environment().call({action:'exportar'})).backup,target=environment({rows:[],withPhoto:false});target.transportFailure();assert.equal((await target.call({action:'restaurar',backup:bk})).status,500);assert.equal(target.files.size,1);
 const invalid=environment({rows:[],withPhoto:false});assert.equal((await invalid.call({action:'restaurar',backup:{...bk,arquivos:[]}})).status,500);assert.equal(invalid.files.size,0);
});
test('exportar e restaurar seguem restritos à direção',async()=>{
 const t=environment({master:false});assert.equal((await t.call({action:'exportar'})).status,403);assert.equal((await t.call({action:'restaurar',backup:{}})).status,403);assert.equal(t.calls.length,0);
});
test('validador não aceita chave do ciclo divergente, versão falsa ou metadados de foto alterados',()=>{
 const a={bucket:'virada-evidencias',caminho:path,tipo:'image/jpeg',bytes:photo.length};assert.equal(conferirCopiaVirada({[id]:row()},[a]).length,1);
 assert.throws(()=>conferirCopiaVirada({[id]:{...row(),versao:7}},[a]));assert.throws(()=>conferirCopiaVirada({errado:row()},[a]));assert.throws(()=>conferirCopiaVirada({[id]:row()},[{...a,bytes:999}]));
});
test('Postgres: recuperação exata é idempotente; conflito preserva ambos módulos e erro do Painel desfaz Virada',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);create table public.outro_modulo(valor text);
  create function public.painel_restaurar_atomico(p_backup jsonb) returns jsonb language plpgsql as $$ begin insert into public.outro_modulo values ('restaurado');if p_backup->>'falhar'='true' then raise exception 'ensaio';end if;return '{"verificado":true}'::jsonb;end;$$;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261115_a_virada.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261115b_a_virada_backup.sql',import.meta.url),'utf8'));
  const restore=data=>db.query('select public.painel_restaurar_com_virada($1::jsonb) retorno',[JSON.stringify(data)]);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(restore({virada_ciclos:[row()]}),e=>e.code==='42501');await db.exec('reset role');}
  await restore({virada_ciclos:[row()]});await restore({virada_ciclos:[row()]});assert.equal((await db.query('select count(*) n from virada_ciclos')).rows[0].n,1);
  const count=(await db.query('select count(*) n from outro_modulo')).rows[0].n;
  const changed=row();changed.registro.nome='Versão diferente';await assert.rejects(restore({virada_ciclos:[changed]}),e=>e.code==='40001');assert.equal((await db.query('select count(*) n from outro_modulo')).rows[0].n,count);assert.equal((await db.query('select registro from virada_ciclos')).rows[0].registro.nome,'Ciclo fictício');
  await db.exec('truncate virada_ciclos');await assert.rejects(restore({virada_ciclos:[row()],falhar:true}));assert.equal((await db.query('select count(*) n from virada_ciclos')).rows[0].n,0);assert.equal((await db.query('select count(*) n from outro_modulo')).rows[0].n,count);
 }finally{await db.close();}
});
test('publicador descobre função e helpers dinamicamente; workflow inclui mudanças de servidor',()=>{
 const script=readFileSync(new URL('../scripts/publicar-functions.sh',import.meta.url),'utf8'),workflow=readFileSync(new URL('../.github/workflows/functions.yml',import.meta.url),'utf8');
 assert.match(script,/for dir in "\$RAIZ"\/\*\//);assert.match(script,/find _shared -type f/);assert.match(script,/verify_jwt\\":false/);assert.match(workflow,/supabase\/functions\/\*\*/);assert.match(workflow,/\.\/scripts\/publicar-functions\.sh/);
});

test('falha na preparação não apaga foto já referenciada por restauração concorrente',async()=>{
 const secondPath=`virada/${id}/${mid}/00000000-0000-4000-8000-000000000004.jpg`;
 const snapshot=row();snapshot.registro.missoes[0].evidencias[0].fotos.push({...snapshot.registro.missoes[0].evidencias[0].fotos[0],id:'00000000-0000-4000-8000-000000000004',chave:secondPath});
 const origem=environment({rows:[snapshot]});origem.files.set('virada-evidencias:'+secondPath,photo);const bk=(await origem.call({action:'exportar'})).backup;
 const destino=environment({rows:[],withPhoto:false});
 destino.onUpload(key=>{
  if(key===path)destino.data.push(row()); // Outra recuperação confirma referência à primeira foto.
  if(key===secondPath)return {error:{message:'Falha na segunda foto'}};
 });
 assert.equal((await destino.call({action:'restaurar',backup:bk})).status,500);
 assert.equal(destino.data[0].registro.missoes[0].evidencias[0].fotos[0].chave,path);
 assert.equal(destino.files.has('virada-evidencias:'+path),true);
});


test('backup inclui PDFs e impede recuperação sem documento ou checksum correto',async()=>{
 const r=row(),key=`virada/${id}/pdis/${mid}/${fid}.pdf`,bytes=new TextEncoder().encode('%PDF-1.7\n%%EOF\n');
 const sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 r.registro.participantes=[{id:mid,rhId:'rh-ficticio',documentos:[{id:fid,chave:key,nome:'pdi.pdf',mime:'application/pdf',tamanho:bytes.length,sha256:sha}]}];
 const source=environment({rows:[r]});source.files.set('virada-evidencias:'+key,bytes);
 const result=await source.call({action:'exportar'});assert.equal(result.status,200);const bk=result.backup;
 assert.ok(bk.arquivos.some(a=>a.caminho===key&&a.sha256===sha));
 assert.throws(()=>conferirCopiaVirada({[id]:r},bk.arquivos.filter(a=>a.caminho!==key)));
 assert.throws(()=>conferirCopiaVirada({[id]:r},bk.arquivos.map(a=>a.caminho===key?{...a,sha256:'0'.repeat(64)}:a)));
 const target=environment({rows:[],withPhoto:false});assert.equal((await target.call({action:'restaurar',backup:bk})).status,200);
 assert.deepEqual(target.files.get('virada-evidencias:'+key),bytes);assert.equal(target.data[0].registro.participantes[0].documentos.length,1);
});
