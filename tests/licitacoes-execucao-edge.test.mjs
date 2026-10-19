import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {processarExecucaoLicitacoes as processarReal} from '../supabase/functions/_shared/licitacoes-execucao.mjs';
function ambiente({perms=['licitacoes'],master=false,revogarDepois=Infinity,semSessao=false,banco,processador}={}) {
  let handler,chamadas=0,checks=0;const estritos=[];
  const source=readFileSync(new URL('../supabase/functions/painel-dados/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
  vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code,{
    Deno:{env:{get:key=>key==='PAINEL_GH_REPO'?'empresa-exemplo/painel-exemplo':'ficticio'},serve:f=>handler=f},createClient:()=>banco||({}),
    verificarJwt:async()=>semSessao?null:{sub:'conta-ficticia',perms,master},
    crachaRevogado:async(_sb,_s,_claims,estrito)=>{estritos.push(estrito);return ++checks>revogarDepois;},
    financeiroDasOSCompartilhado(){},Request,Response,URL,console:{error(){}},
    processarExecucaoLicitacoes:processador|| (async({confirmarAcesso})=>{chamadas++;await confirmarAcesso();await confirmarAcesso();return {estado:'solicitada',execucao:null};}),
    CHAVE_DISPARO_LICITACOES:'pesquisa_licitacoes_disparo',
  });
  return {get chamadas(){return chamadas;},estritos,async chamar(method='GET') {const r=await handler(new Request('https://test.invalid?modulo=licitacoes-execucao',{method,headers:{authorization:'Bearer ficticio'}}));return {status:r.status,body:await r.json()};}};
}
test('leitura de execução exige sessão e permissão licitações',async()=>{
 for(const [config,status] of [[{semSessao:true},401],[{perms:['marketing']},403]]){const a=ambiente(config);assert.equal((await a.chamar()).status,status);assert.equal(a.chamadas,0);}
});
test('quem tem apenas licitações consulta status mas não pode disparar',async()=>{
 const a=ambiente();const get=await a.chamar();assert.equal(get.status,200);assert.equal(get.body.podeIniciar,false);assert.equal((await a.chamar('POST')).status,403);assert.equal(a.chamadas,1);
});
test('somente master ou permissão geral pode solicitar pesquisa e todas as conferências são estritas',async()=>{
 for(const config of [{master:true},{perms:['*']}]){const a=ambiente(config);const r=await a.chamar('POST');assert.equal(r.status,202);assert.equal(r.body.podeIniciar,true);assert.equal(r.body.estado,'solicitada');assert.ok(a.estritos.length>=3);assert.ok(a.estritos.every(Boolean));}
});
test('revogação durante o handler bloqueia a resposta de execução',async()=>{
 const a=ambiente({master:true,revogarDepois:2});const r=await a.chamar('POST');assert.equal(r.status,401);assert.equal(r.body.semSessao,true);assert.equal(r.body.execucao,undefined);
});

function bancoFicticio(registro=null) {
 let row=registro;
 return {get row(){return row;},from(tabela){
  assert.equal(tabela,'painel_meta');let patch=null;const filtros=[];
  const q={select(){return q;},eq(campo,valor){filtros.push([campo,valor]);return q;},update(valor){patch=valor;return q;},
   async insert(valor){if(row)return {error:{code:'23505'}};row=structuredClone(valor);return {error:null};},
   async maybeSingle(){
    const coincide=row&&filtros.every(([k,v])=>(k==='valor->>solicitacaoId'?row.valor?.solicitacaoId:row[k])===v);
    if(!coincide)return {data:null,error:null};if(patch)row={...row,...structuredClone(patch)};return {data:structuredClone(row),error:null};
   }};return q;
 }};
}
test('handler real reserva metadado antigo por compare-and-set e impede dispatch concorrente',async()=>{
 const banco=bancoFicticio({chave:'pesquisa_licitacoes_disparo',valor:{estado:'falhou',em:'2025-01-01T12:00:00Z',solicitacaoId:'anterior-ficticio'},atualizado_em:'2025-01-01T12:00:00Z'});let disparos=0,id=0;
 const processador=opcoes=>processarReal({...opcoes,agora:()=>new Date('2026-01-15T12:00:00.000Z'),novoId:()=>`solicitacao-ficticia-${++id}`,fetcher:async(_url,opcoes)=>{if(opcoes.method==='POST'){disparos++;return new Response(null,{status:204});}return Response.json({total_count:0,workflow_runs:[]});}});
 const a=ambiente({master:true,banco,processador});const [r1,r2]=await Promise.all([a.chamar('POST'),a.chamar('POST')]);
 assert.equal(r1.status,202);assert.equal(r2.status,202);assert.equal(disparos,1);assert.equal(banco.row.valor.estado,'solicitada');assert.equal(banco.row.atualizado_em,'2026-01-15T12:00:00.000Z');
});
