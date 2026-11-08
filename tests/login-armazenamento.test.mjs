import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const src=fileURLToPath(new URL('../src/',import.meta.url));
const bundle=await build({stdin:{contents:'export * from "./lib/sessao.js";',resolveDir:src,loader:'js'},bundle:true,format:'cjs',platform:'neutral',write:false,logLevel:'silent',define:{'import.meta.env':'{"MODE":"test"}'}});
const codigo=bundle.outputFiles[0].text;
const conta={token:'token-ficticio',usuario:'pessoa-teste',nome:'Pessoa de teste',master:false,permissoes:['orcamentos'],trocarSenha:false};
function armazenamento(falha=()=>false){
 const dados=new Map();return {dados,getItem:k=>dados.get(k)??null,setItem(k,v){if(falha(k))throw new DOMException('quota de teste','QuotaExceededError');dados.set(k,String(v));},removeItem:k=>dados.delete(k)};
}
function ambiente({local=armazenamento(),aba=armazenamento(),resposta=conta,unica=true}={}){
 const chamadas=[];let sessaoNaTela;
 const ctx={module:{exports:{}},localStorage:local,sessionStorage:aba,console,Date,Error,TypeError,JSON,Response,fetch:async(url)=>{
  chamadas.push(url);
  if(url.endsWith('acesso-entrar'))return new Response(JSON.stringify(unica?{ok:true,crachas:{painel:resposta},sistemas:['painel'],trocarSenha:resposta?.trocarSenha}:{}),{status:unica?200:401});
  return new Response(JSON.stringify(resposta),{status:200});
 }};vm.runInNewContext(codigo,ctx);const m=ctx.module.exports;
 m.aoMudarSessao(()=>{sessaoNaTela=m.getSessao()});
 return {m,local,aba,chamadas,tela:()=>sessaoNaTela,recarregar:()=>ambiente({local,aba})};
}

test('login com quota cheia abre a sessão na aba, sem apagar dados de outros sistemas',async()=>{
 const a=ambiente({local:armazenamento(()=>true)});a.local.dados.set('centralLeo.v1','rascunho preservado');
 await a.m.login('pessoa-teste','senha-ficticia');
 assert.equal(a.tela()?.usuario,conta.usuario);
 assert.equal(a.m.getToken(),conta.token);
 assert.equal(a.m.getSessao()?.somenteNestaAba,true);
 assert.equal(a.chamadas.length,1,'erro de armazenamento não repete autenticação na porta antiga');
 assert.equal(a.local.dados.get('centralLeo.v1'),'rascunho preservado');
 assert.equal(a.recarregar().m.getSessao()?.usuario,conta.usuario);
});

test('sessão válida não some quando atualizar horário de uso falha por quota',()=>{
 const local=armazenamento(()=>true);local.dados.set('painel_auth_token',conta.token);local.dados.set('painel_auth_sessao',JSON.stringify({...conta,visto:Date.now()}));
 const a=ambiente({local});assert.equal(a.m.getSessao()?.usuario,conta.usuario);assert.equal(a.m.getToken(),conta.token);
});

test('se nenhuma gaveta aceita a sessão, login retorna erro visível e não sucesso silencioso',async()=>{
 const a=ambiente({local:armazenamento(()=>true),aba:armazenamento(()=>true)});
 await assert.rejects(a.m.login('pessoa-teste','senha-ficticia'),/guardar.*sessão/i);
 assert.equal(a.m.getSessao(),null);assert.equal(a.m.getToken(),null);
 assert.equal(a.chamadas.length,1);
});

test('resposta 200 inválida da porta antiga não é aceita como login',async()=>{
 for(const resposta of [null,{}, {token:conta.token},{usuario:conta.usuario}]){
  const a=ambiente({resposta,unica:false});
  await assert.rejects(a.m.login('pessoa-teste','senha-ficticia'),/resposta.*acesso/i);
  assert.equal(a.m.getSessao(),null);assert.equal(a.m.getToken(),null);
 }
});

test('gravação parcial não mistura token novo com identidade antiga; nova tentativa volta ao armazenamento permanente',async()=>{
 let falhar=true;
 const local=armazenamento(k=>falhar&&k==='painel_auth_sessao');
 local.dados.set('painel_auth_token','token-antigo');local.dados.set('painel_auth_sessao',JSON.stringify({...conta,usuario:'outra-pessoa'}));
 const a=ambiente({local});await a.m.login('pessoa-teste','senha-ficticia');
 assert.equal(a.m.getSessao()?.usuario,conta.usuario);assert.equal(a.m.getToken(),conta.token);
 assert.equal(local.dados.has('painel_auth_token'),false);assert.equal(local.dados.has('painel_auth_sessao'),false);
 falhar=false;await a.m.login('pessoa-teste','senha-ficticia');
 assert.equal(a.m.getSessao()?.somenteNestaAba,undefined);assert.equal(a.aba.dados.size,0);
 assert.equal(a.recarregar().m.getSessao()?.usuario,conta.usuario);
});

test('sessão na aba preserva permissões e sai por logout ou inatividade',async()=>{
 for(const expirar of [false,true]){
  const a=ambiente({local:armazenamento(()=>true)});await a.m.login('pessoa-teste','senha-ficticia');
  assert.equal(a.m.podeAbrir('orcamentos'),true);assert.equal(a.m.podeAbrir('acessos'),false);assert.equal(a.m.ehDirecao(),false);
  if(expirar){const r=JSON.parse(a.aba.dados.get('painel_auth_aba'));r.sessao.visto=Date.now()-13*3600000;a.aba.dados.set('painel_auth_aba',JSON.stringify(r));assert.equal(a.m.getSessao(),null);}
  else a.m.sair();
  assert.equal(a.m.getToken(),null);assert.equal(a.m.getSessao(),null);assert.equal(a.recarregar().m.getSessao(),null);assert.equal(a.aba.dados.size,0);
 }
});

test('senha provisória continua obrigatória na aba após recarga e pode ser concluída',async()=>{
 const a=ambiente({local:armazenamento(()=>true),resposta:{...conta,trocarSenha:true}});await a.m.login('pessoa-teste','senha-ficticia');
 assert.equal(a.m.getSessao()?.trocarSenha,true);assert.equal(a.recarregar().m.getSessao()?.trocarSenha,true);
 a.m.senhaTrocada();assert.equal(a.m.getSessao()?.trocarSenha,false);assert.equal(a.recarregar().m.getSessao()?.trocarSenha,false);
});

test('bloqueio total do localStorage ainda permite a sessão na aba e logout',async()=>{
 const local={getItem(){throw new Error('bloqueado')},setItem(){throw new Error('bloqueado')},removeItem(){throw new Error('bloqueado')}};
 const a=ambiente({local});await a.m.login('pessoa-teste','senha-ficticia');
 assert.equal(a.m.getSessao()?.usuario,conta.usuario);a.m.sair();assert.equal(a.m.getToken(),null);assert.equal(a.recarregar().m.getSessao(),null);
});
