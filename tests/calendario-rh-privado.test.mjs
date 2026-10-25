import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
function ambiente({perfil='COLABORADOR',ativo=true,contaAtiva=true,master=false,semVinculo=false,erro=false}={}) {
  let handler;
  const consultas=[];
  const sb={from(tabela){
    consultas.push(tabela);
    let single=false;
    const q={select(){return q;},eq(){return q;},gt(){return q;},limit(){return q;},order(){return q;},range(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){
      let data=tabela==='acesso_conta' ? {ativo:contaAtiva,...(!semVinculo?{auth_user_id:'auth-ficticio'}:{})}
        :tabela==='perfis'?{perfil,ativo,colaborador_id:'pessoa-ficticia'}
        :tabela==='config_global'?{config:{}}:[];
      if(tabela==='registros')data=[{id:'evento-ficticio',registro:{id:'evento-ficticio',titulo:'Aviso privado fictício',data:'2026-10-24',tipo:'Outro'}}];
      return Promise.resolve({data:single?data:data,error:erro?{message:'falha fictícia'}:null}).then(resolve,reject);
    }};return q;
  }};
  const source=readFileSync('supabase/functions/painel-agenda/index.ts','utf8').replace(/^import .*;\s*$/gm,'');
  vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code,{
    Deno:{env:{get:()=> 'ficticio'},serve:f=>handler=f},createClient:()=>sb,
    verificarJwt:async()=>({sub:'comercial-ficticio',perms:['*'],master}),crachaRevogado:async()=>false,
    hojeSP:()=> '2026-10-24',celebracoesRH:()=>[],Request,Response,console:{error(){}},
  });
  return {consultas,async chamar(){const r=await handler(new Request('http://teste.invalid',{method:'POST',headers:{authorization:'Bearer ficticio'},body:JSON.stringify({action:'empresa',mes:'2026-10'})}));return {status:r.status,body:await r.json()};}};
}
for(const opcoes of [{},{perfil:'GESTOR'},{master:true},{perfil:'ADMIN_RH',ativo:false},{perfil:'ADMIN_RH',contaAtiva:false},{semVinculo:true}]){
 test(`sem autorização RH não consulta dados privados: ${JSON.stringify(opcoes)}`,async()=>{
  const a=ambiente(opcoes),r=await a.chamar();assert.equal(r.status,200);assert.deepEqual(r.body.eventos,[]);assert.equal(r.body.restritoRH,true);assert.ok(!a.consultas.includes('registros'));assert.ok(!a.consultas.includes('config_global'));
 });
}
test('perfil RH ativo continua vendo eventos',async()=>{const a=ambiente({perfil:'ADMIN_RH'}),r=await a.chamar();assert.equal(r.status,200);assert.ok(r.body.eventos.some(e=>e.titulo==='Aviso privado fictício'));});
test('falha de autorização fecha a consulta sem dados',async()=>{const a=ambiente({erro:true}),r=await a.chamar();assert.ok(r.status>=400);assert.ok(!a.consultas.includes('registros'));});
