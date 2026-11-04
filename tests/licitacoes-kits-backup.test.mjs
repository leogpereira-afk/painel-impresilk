import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build,transformSync} from 'esbuild';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {idKitLicitacoes} from '../supabase/functions/_shared/licitacoes-kits.mjs';

const empresa='73405710-78db-461b-9d33-37a228fd62c0',documentoId='53405710-78db-461b-9d33-37a228fd62c0';
const arquivoChave=`documentos/${documentoId}/versao-ficticia`;
const portalId=await idKitLicitacoes('edital-ficticio',empresa);
const fixture=()=>[
 {colecao:'documentos_titulares',id:empresa,registro:{id:empresa,tipo:'empresa',nome:'Empresa fictícia'}},
 {colecao:'ativo',id:documentoId,registro:{id:documentoId,tipo:'documento',usoLicitacoes:true,titularId:empresa,nome:'Certidão fictícia',temArquivo:true,anexos:[{id:'versao-ficticia',nome:'certidao-ficticia.pdf',chave:arquivoChave}],versoes:[{id:'versao-ficticia',snapshot:{titularId:empresa},arquivo:{chave:arquivoChave}}]}},
 {colecao:'licitacoes_kits',id:portalId,registro:{id:portalId,titularId:empresa,licitacaoId:'edital-ficticio',nome:'Kit fictício',atualizadoEm:'2026-11-03T10:00:00.000Z',requisitos:[{id:'req-ficticio',categoria:'Regularidade',descricao:'Requisito fictício',documentoId,versaoId:'versao-ficticia',arquivoId:'versao-ficticia',dispensado:false,justificativa:'',snapshot:{titularId:empresa,emissao:'2026-01-01',validade:'2027-01-01',nome:'Certidão fictícia'}}],historico:[{id:'evento-ficticio',em:'2026-11-03T10:00:00.000Z',por:'Pessoa fictícia',acao:'criar',antes:null,depois:{nome:'Kit fictício',requisitos:[{id:'req-ficticio',documentoId,versaoId:'versao-ficticia'}]}}]}}
];
const copia=v=>JSON.parse(JSON.stringify(v));
function banco(rows=fixture()){
 const state={rows:structuredClone(rows),consultas:[],escritas:[],arquivos:new Map([[arquivoChave,new Uint8Array(Buffer.from('%PDF-1.7 arquivo fictício'))]]),uploads:[],remocoes:[],restaurado:null};
 function bucket(nome){return {
  async list(prefixo,{limit=100,offset=0}={}){
   if(nome!=='painel-arquivos')return {data:[],error:null};const pre=prefixo?prefixo+'/':'',out=new Map();
   for(const [path] of state.arquivos){if(!path.startsWith(pre))continue;const resto=path.slice(pre.length),barra=resto.indexOf('/'),name=barra<0?resto:resto.slice(0,barra);out.set(name,{name,id:barra<0?'arquivo-ficticio':null});}
   return {data:[...out.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(offset,offset+limit),error:null};
  },async download(path){const bytes=state.arquivos.get(path);return bytes?{data:new Blob([bytes],{type:'application/pdf'}),error:null}:{data:null,error:{statusCode:'404'}};},
  async upload(path,bytes,options){assert.equal(options.upsert,false);if(state.arquivos.has(path))return {error:{message:'arquivo já existente'}};state.arquivos.set(path,new Uint8Array(bytes));state.uploads.push(path);return {error:null};},
  async remove(paths){state.remocoes.push(...paths);for(const path of paths)state.arquivos.delete(path);return {error:null};}
 };}
 const sb={storage:{from:bucket},from(table){let filtros=[],order='',de=0,ate=Infinity;const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(k){order=k;return q;},range(a,b){de=a;ate=b;return q;},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]||null};},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(){state.consultas.push({table,filtros:copia(filtros)});const raw=table==='painel_registros'?state.rows:[];return {data:copia(raw.filter(r=>filtros.every(([k,v])=>r[k]===v)).sort((a,b)=>String(a[order]??'').localeCompare(String(b[order]??''))).slice(de,ate+1)),error:null};}return q;
 },async rpc(nome,args){if(nome==='painel_mkt_exportar')return {data:{tabelas:[]},error:null};assert.equal(nome,'painel_restaurar_atomico');state.restaurado=copia(args.p_backup);for(const row of args.p_backup.registros){const at=state.rows.findIndex(r=>r.colecao===row.colecao&&r.id===row.id);if(at<0)state.rows.push(copia(row));else state.rows[at]=copia(row);}state.escritas.push(copia(args));return {data:{verificado:true,gravou:args.p_backup.registros.length,contas:0},error:null};}};
 return {sb,...state};
}
let codigoBackup;
async function backupAmbiente({db=banco(),sessao={sub:'direcao-ficticia',master:true},revogado=false}={}){
 if(!codigoBackup){let s=readFileSync(new URL('../supabase/functions/painel-backup/index.ts',import.meta.url),'utf8');s=s.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>__banco;').replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,'const verificarJwt=async()=>__sessao;const crachaRevogado=async()=>__revogado;');const b=await build({stdin:{contents:s,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-backup/',import.meta.url))},bundle:true,format:'iife',platform:'neutral',write:false});codigoBackup=b.outputFiles[0].text;}
 let handler;vm.runInNewContext(codigoBackup,{__banco:db.sb,__sessao:sessao,__revogado:revogado,Deno:{env:{get:()=> 'ficticio'},serve:fn=>handler=fn},Request,Response,Blob,TextEncoder,Uint8Array,crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,console:{error(){}},fetch(){throw new Error('Rede não permitida neste teste.');}});
 return {...db,async chamar(body,token=true){const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:token?{authorization:'Bearer teste'}:{},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}

test('backup real descobre a nova coleção, conserva histórico, titular, IDs e bytes do documento',async()=>{
 const a=await backupAmbiente(),r=await a.chamar({action:'exportar'});assert.equal(r.status,200);const bk=r.body.backup;
 assert.deepEqual(bk.painel.licitacoes_kits[portalId],fixture()[2].registro);assert.deepEqual(bk.painel.documentos_titulares[empresa],fixture()[0].registro);assert.deepEqual(bk.painel.ativos[documentoId],fixture()[1].registro);
 assert.equal(bk.arquivos.length,1);assert.equal(bk.arquivos[0].caminho,arquivoChave);assert.equal(bk.arquivos[0].bucket,'painel-arquivos');assert.deepEqual(Buffer.from(bk.arquivos[0].base64,'base64'),Buffer.from(a.arquivos.get(arquivoChave)));assert.match(bk.arquivos[0].sha256,/^[a-f0-9]{64}$/);assert.equal(a.escritas.length,0);
});
test('restauração v3 percorre a coleção nova e retorna vínculos/arquivos sem duplicar nem apagar outros',async()=>{
 const origem=await backupAmbiente(),bk=(await origem.chamar({action:'exportar'})).body.backup;
 const destino=banco([{colecao:'licitacoes_kits',id:'outro-ficticio',registro:{id:'outro-ficticio',nome:'Preservar outro kit'}}]);destino.arquivos.clear();const a=await backupAmbiente({db:destino});const r=await a.chamar({action:'restaurar',backup:bk});assert.equal(r.status,200);assert.equal(r.body.verificado,true);assert.equal(r.body.arquivos,1);assert.deepEqual(destino.rows.find(x=>x.colecao==='licitacoes_kits'&&x.id===portalId),fixture()[2]);assert.equal(destino.rows.find(x=>x.id==='outro-ficticio').registro.nome,'Preservar outro kit');assert.deepEqual(destino.rows.find(x=>x.id===documentoId),fixture()[1]);assert.equal(destino.uploads.length,1);
 const bytes=Buffer.from(destino.arquivos.get(arquivoChave));assert.equal(bytes.toString(),'%PDF-1.7 arquivo fictício');assert.equal((await a.chamar({action:'restaurar',backup:bk})).status,200);assert.equal(destino.uploads.length,1);assert.equal(destino.rows.filter(x=>x.colecao==='licitacoes_kits'&&x.id===portalId).length,1);assert.equal(destino.remocoes.length,0);
});
test('backup de kit na lixeira conserva estado, datas, histórico e bytes ao recuperar a base',async()=>{
 const rows=fixture(),kit=rows[2].registro;
 Object.assign(kit,{estado:'lixeira',lixeiraEm:'2026-11-04T10:00:00.000Z',lixeiraPor:'Operador fictício',atualizadoEm:'2026-11-04T10:00:00.000Z'});
 kit.historico.push({id:'movimento-ficticio',em:kit.lixeiraEm,por:kit.lixeiraPor,acao:'mover_lixeira',antes:{estado:'ativo'},depois:{estado:'lixeira'}});
 const origem=await backupAmbiente({db:banco(rows)}),exportado=await origem.chamar({action:'exportar'});
 assert.equal(exportado.status,200);
 assert.deepEqual(exportado.body.backup.painel.licitacoes_kits[portalId],kit);
 const destino=banco([]);destino.arquivos.clear();
 const restaurador=await backupAmbiente({db:destino}),resultado=await restaurador.chamar({action:'restaurar',backup:exportado.body.backup});
 assert.equal(resultado.status,200);
 assert.deepEqual(destino.rows.find(r=>r.colecao==='licitacoes_kits'&&r.id===portalId).registro,kit);
 assert.deepEqual(destino.rows.find(r=>r.colecao==='ativo'&&r.id===documentoId),rows[1]);
 assert.deepEqual(destino.arquivos.get(arquivoChave),origem.arquivos.get(arquivoChave));
 assert.equal(destino.remocoes.length,0);
});
test('backup e restauração continuam exclusivos da direção, com sessão e revogação',async()=>{
 const bk={versao:3,sistema:'painel',painel:{licitacoes_kits:{[portalId]:fixture()[2].registro}},contas:{},arquivos:[]};
 for(const options of [{sessao:null},{sessao:{sub:'ficticio',perms:['licitacoes','documentos']}},{sessao:{sub:'ficticio',perms:['*']}},{revogado:true}]){const a=await backupAmbiente(options);for(const action of ['exportar','restaurar']){const r=await a.chamar({action,backup:bk});assert.ok([401,403].includes(r.status));assert.equal(a.consultas.length,0);assert.equal(a.escritas.length,0);assert.equal('backup' in r.body,false);}}
 assert.equal((await(await backupAmbiente()).chamar({action:'exportar'},false)).status,401);
});
test('backup pagina mais de mil kits sem perder a nova coleção',async()=>{
 const rows=Array.from({length:1001},(_,n)=>({colecao:'licitacoes_kits',id:'ficticio-'+String(n).padStart(4,'0'),registro:{nome:'Kit fictício '+n,titularId:empresa}}));const a=await backupAmbiente({db:banco(rows)}),r=await a.chamar({action:'exportar'});assert.equal(r.status,200);assert.equal(Object.keys(r.body.backup.painel.licitacoes_kits).length,1001);assert.equal(r.body.backup.painel.licitacoes_kits['ficticio-1000'].nome,'Kit fictício 1000');
});
test('configuração genérica não lê, altera, exclui nem baixa arquivos da nova coleção',async()=>{
 const source=readFileSync(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 for(const sessao of [{sub:'ficticio',perms:[]},{sub:'ficticio',perms:['licitacoes','documentos']},{sub:'ficticio',master:true}]){
  const db=banco();let handler;vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{Deno:{env:{get:()=> 'ficticio'},serve:fn=>handler=fn},createClient:()=>db.sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}}});
  for(const action of ['get','set','merge','removerId','lerArquivo','evento']){const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify({action,chave:'licitacoes_kits',id:portalId,arquivo:arquivoChave,patch:{[portalId]:{nome:'NÃO ALTERAR'}}})}));assert.ok([400,403].includes(r.status),action+': '+await r.text());}
  assert.equal(db.consultas.length,0);assert.equal(db.escritas.length,0);assert.deepEqual(db.rows,fixture());
 }
});
test('PostgreSQL local: RLS fecha a coleção e RPCs são exclusivas do serviço; restauro preserva histórico',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean);');
  await db.exec(readFileSync(new URL('../supabase/migrations/0001_init.sql',import.meta.url),'utf8'));
  const integridade=readFileSync(new URL('../supabase/migrations/20260906_auditoria_integridade.sql',import.meta.url),'utf8');
  // A cauda aplica ACLs a funções de login/ERP não utilizadas por esta coleção.
  // O ensaio usa integralmente as três RPCs do Painel e suas ACLs originais.
  await db.exec(integridade.split('-- Usadas pelas portas de entrada')[0]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260906_proteger_registro_retirado.sql',import.meta.url),'utf8'));
  // O restauro atual acrescenta Marketing. Seu executor é independente desta
  // coleção; este stub mantém apenas esse ramo sem carregar tabelas alheias.
  await db.exec('create function public.painel_mkt_restaurar(jsonb) returns int language sql as $$ select 0 $$;');
  const migration=readFileSync(new URL('../supabase/migrations/20261010a_marketing_base.sql',import.meta.url),'utf8'),restauro=migration.match(/create or replace function public\.painel_restaurar_atomico\(p_backup jsonb\)[\s\S]*?end \$\$;/)?.[0];assert.ok(restauro);await db.exec(restauro);
  const args={config:null,registros:fixture(),contas:[],gestao:{},marketing:null};const result=await db.query('select painel_restaurar_atomico($1) retorno',[args]);assert.equal(result.rows[0].retorno.verificado,true);assert.deepEqual((await db.query("select registro from painel_registros where colecao='licitacoes_kits'")).rows[0].registro,fixture()[2].registro);
  await db.exec('grant select,insert,update,delete on painel_registros to anon,authenticated;');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);assert.deepEqual((await db.query("select registro from painel_registros where colecao='licitacoes_kits'")).rows,[]);await assert.rejects(db.query('insert into painel_registros(colecao,id,registro) values($1,$2,$3)',['licitacoes_kits','tentativa',{}]),e=>e.code==='42501');await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_kits',portalId,{},null]),e=>e.code==='42501');await assert.rejects(db.query('select painel_restaurar_atomico($1)',[args]),e=>e.code==='42501');await db.exec('reset role');}
  const privileges=(await db.query("select has_function_privilege('service_role','painel_registro_gravar(text,text,jsonb,jsonb)','execute') gravar,has_function_privilege('service_role','painel_restaurar_atomico(jsonb)','execute') restaurar")).rows[0];assert.deepEqual(privileges,{gravar:true,restaurar:true});
  // Um item inválido posterior não deixa a primeira mudança parcialmente salva.
  const quebrado={...args,registros:[{...fixture()[2],registro:{nome:'NÃO PERSISTIR'}},{colecao:'licitacoes_kits',id:'',registro:{}}]};await assert.rejects(db.query('select painel_restaurar_atomico($1)',[quebrado]));assert.deepEqual((await db.query("select registro from painel_registros where colecao='licitacoes_kits'")).rows[0].registro,fixture()[2].registro);
 }finally{await db.close();}
});
