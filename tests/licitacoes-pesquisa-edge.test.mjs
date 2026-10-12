import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

function ambiente(perms=['licitacoes'],opcoes={}) {
  let handler,leituras=0,conferencias=0;
  const source=readFileSync(new URL('../supabase/functions/painel-dados/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
  vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code,{
    Deno:{env:{get:key=>key==='PAINEL_JWT_SECRET'&&opcoes.semSegredo?'':'ficticio'},serve:f=>handler=f},
    createClient:()=>({}),verificarJwt:async()=>opcoes.semSessao?null:{sub:'operador-ficticio',perms,master:opcoes.master===true},
    crachaRevogado:async()=>{conferencias++;return opcoes.revogado===true||(opcoes.revogadoDepois&&conferencias>1);},
    financeiroDasOSCompartilhado(){},Request,Response,URL,console:{error(){}},
    consultarPesquisaLicitacoes:async()=>{leituras++;return {estado:'sem_relatorio'};},
  });
  return {get leituras(){return leituras;},async chamar(method='GET'){
    const r=await handler(new Request('https://test.invalid?modulo=licitacoes',{method,headers:{authorization:'Bearer ficticio'}}));
    return {status:r.status,body:await r.json()};
  }};
}
test('a leitura de pesquisa usa a permissão existente e não cria licitação',async()=>{
  const a=ambiente();const r=await a.chamar();
  assert.equal(r.status,200);
  assert.equal(r.body.estado,'sem_relatorio');
  assert.equal(a.leituras,1);
});
test('sem módulo, sessão, segredo ou crachá vigente recusa antes de buscar pesquisa',async()=>{
  for(const [perms,opcoes,status] of [[['marketing'],{},403],[['licitacoes'],{semSessao:true},401],[['licitacoes'],{revogado:true},401],[['licitacoes'],{semSegredo:true},503]]){
    const a=ambiente(perms,opcoes);assert.equal((await a.chamar()).status,status);assert.equal(a.leituras,0);
  }
});
test('revogação durante a consulta impede devolver dados',async()=>{
  const a=ambiente(['licitacoes'],{revogadoDepois:true});const r=await a.chamar();
  assert.equal(r.status,401);assert.equal(r.body.semSessao,true);assert.equal(r.body.estado,undefined);
});
test('POST não inicia pesquisa nem publica dados',async()=>{
  const a=ambiente();assert.equal((await a.chamar('POST')).status,405);assert.equal(a.leituras,0);
});
