import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build,transformSync} from 'esbuild';
import vm from 'node:vm';
import {idCadastroLicitacoes} from '../supabase/functions/_shared/licitacoes-cadastros.mjs';

const empresa='73405710-78db-461b-9d33-37a228fd62c0',documentoId='53405710-78db-461b-9d33-37a228fd62c0';
const arquivoChave=`documentos/${documentoId}/versao-ficticia`;
const portalId=await idCadastroLicitacoes(empresa,'https://portal.example/fornecedores');
const entidadeId='e1382290-bdc0-4b2d-8d9d-15aa12630101';
const fichaEntidade={id:entidadeId,nome:'Organização fictícia',tipo:'orgao',municipios:['Montes Claros','Salinas'],cadastroIds:[portalId],responsavel:'Comercial fictício',situacao:'ativo',historico:[{id:'evento-ficticio',antes:null,depois:{cadastroIds:[portalId],municipios:['Montes Claros','Salinas']}}]};
const fixture=()=>[
 {colecao:'licitacoes_entidades',id:entidadeId,registro:fichaEntidade},
 {colecao:'documentos_titulares',id:empresa,registro:{id:empresa,tipo:'empresa',nome:'Empresa fictícia'}},
 {colecao:'ativo',id:documentoId,registro:{id:documentoId,tipo:'documento',usoLicitacoes:true,titularId:empresa,nome:'Certidão fictícia',temArquivo:true,anexos:[{id:'versao-ficticia',nome:'certidao-ficticia.pdf',chave:arquivoChave}],versoes:[{id:'versao-ficticia',snapshot:{titularId:empresa},arquivo:{chave:arquivoChave}}]}},
 {colecao:'licitacoes_cadastros',id:portalId,registro:{id:portalId,titularId:empresa,nome:'Portal fictício',url:'https://portal.example/fornecedores',situacao:'arquivado',protocolo:'PROTOCOLO-FICTICIO',atualizadoEm:'2026-11-03T10:00:00.000Z',documentoIds:[documentoId],historico:[{id:'evento-ficticio',em:'2026-11-03T10:00:00.000Z',por:'Pessoa fictícia',acao:'arquivar',antes:{situacao:'ativo',protocolo:'PROTOCOLO-FICTICIO'},depois:{situacao:'arquivado',protocolo:'PROTOCOLO-FICTICIO'}}]}}
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

test('entidades: backup/restauração reais preservam contatos, municípios, vínculos e histórico sem duplicidade',async()=>{
 const origem=await backupAmbiente(),r=await origem.chamar({action:'exportar'});assert.equal(r.status,200);const bk=r.body.backup;assert.deepEqual(bk.painel.licitacoes_entidades[entidadeId],fichaEntidade);assert.ok(bk.painel.licitacoes_cadastros[portalId]);assert.equal(origem.escritas.length,0);
 const outra={colecao:'licitacoes_entidades',id:'outra-ficha',registro:{nome:'Preservar outra ficha'}},db=banco([outra]),destino=await backupAmbiente({db});
 for(let i=0;i<2;i++){const result=await destino.chamar({action:'restaurar',backup:bk});assert.equal(result.status,200);assert.equal(result.body.verificado,true);}
 assert.deepEqual(db.rows.find(r=>r.colecao==='licitacoes_entidades'&&r.id===entidadeId).registro,fichaEntidade);assert.deepEqual(db.rows.find(r=>r.id==='outra-ficha'),outra);assert.equal(db.rows.filter(r=>r.colecao==='licitacoes_entidades'&&r.id===entidadeId).length,1);assert.equal(db.remocoes.length,0);
});
test('entidades: backup de coleção completa acima de mil registros e acesso exclusivo da direção',async()=>{
 const rows=Array.from({length:1001},(_,n)=>({colecao:'licitacoes_entidades',id:'ficticio-'+String(n).padStart(4,'0'),registro:{...fichaEntidade,id:'ficticio-'+n}}));const a=await backupAmbiente({db:banco(rows)}),r=await a.chamar({action:'exportar'});assert.equal(r.status,200);assert.equal(Object.keys(r.body.backup.painel.licitacoes_entidades).length,1001);
 for(const sessao of [null,{sub:'ficticio',perms:['licitacoes','documentos']},{sub:'ficticio',perms:['*']}]){const b=await backupAmbiente({sessao});assert.ok([401,403].includes((await b.chamar({action:'exportar'})).status));assert.equal(b.consultas.length,0);}
});
test('entidades: configuração genérica não consulta, altera ou apaga a coleção privada',async()=>{
 const source=readFileSync(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 for(const sessao of [{sub:'ficticio',perms:[]},{sub:'ficticio',perms:['licitacoes','documentos']},{sub:'ficticio',master:true}]){
  const db=banco();let handler;vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{Deno:{env:{get:()=> 'ficticio'},serve:fn=>handler=fn},createClient:()=>db.sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}}});
  for(const action of ['get','set','merge','removerId','lerArquivo','evento']){const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify({action,chave:'licitacoes_entidades',id:entidadeId,patch:{[entidadeId]:{nome:'NÃO ALTERAR'}}})}));assert.ok([400,403].includes(r.status),action+': '+await r.text());}
  assert.equal(db.consultas.length,0);assert.equal(db.escritas.length,0);assert.deepEqual(db.rows,fixture());
 }
});
