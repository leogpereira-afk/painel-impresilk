import test from 'node:test';
import assert from 'node:assert/strict';
import { validarPlanejamento,projetarCampanhas } from '../supabase/functions/_shared/campanhas-planejamento.mjs';
const acao=(campos={})=>({id:'acao-exemplo',titulo:'Preparar materiais',responsavel:'Equipe exemplo',data:'2026-11-20',calendario:true,status:'pendente',...campos});
const plano=(acoes=[acao()])=>({consideracoes:' Aprendizado ',estrategia:'Estratégia',proximaCampanha:'Próxima edição',acoes});
test('salva textos, responsáveis e datas sem alterar entrada',()=>{const p=plano();assert.equal(validarPlanejamento(p).consideracoes,'Aprendizado');assert.equal(p.consideracoes,' Aprendizado ');assert.deepEqual(validarPlanejamento(p).acoes,p.acoes);});
test('data opcional quando não vinculada',()=>assert.equal(validarPlanejamento(plano([acao({calendario:false,data:''})])).acoes[0].data,''));
test('bloqueia data ausente, inexistente e formatos ambíguos',()=>{for(const data of ['', '2026-02-30','20/11/2026'])assert.throws(()=>validarPlanejamento(plano([acao({data})])));});
test('bloqueia ações duplicadas, sem título e status desconhecido',()=>{assert.throws(()=>validarPlanejamento(plano([acao(),acao()])));assert.throws(()=>validarPlanejamento(plano([acao({titulo:''})])));assert.throws(()=>validarPlanejamento(plano([acao({status:'qualquer'})])));});
test('limita tamanho do planejamento',()=>{assert.throws(()=>validarPlanejamento({...plano(),consideracoes:'x'.repeat(10001)}));assert.throws(()=>validarPlanejamento(plano(Array.from({length:101},(_,i)=>acao({id:String(i)})))));});
test('calendário mostra só ações pendentes vinculadas no mês e campanha aberta',()=>{
 const c={id:'campanha-exemplo',nome:'Campanha exemplo',planejamento:validarPlanejamento(plano())};
 const eventos=projetarCampanhas([c], '2026-11');assert.equal(eventos.length,1);assert.equal(eventos[0].href,'/campanhas?campanha=campanha-exemplo');assert.equal(eventos[0].id,'campanha:campanha-exemplo:acao-exemplo');
 assert.equal(projetarCampanhas([c],'2026-12').length,0);
 assert.equal(projetarCampanhas([{...c,encerrada:true}],'2026-11').length,0);
 for(const patch of [{status:'concluida'},{status:'cancelada'},{calendario:false}]) assert.equal(projetarCampanhas([{...c,planejamento:plano([acao(patch)])}],'2026-11').length,0);
});
test('reagendamento mantém identidade sem criar evento paralelo',()=>{const c={id:'exemplo',planejamento:plano()};const antes=projetarCampanhas([c],'2026-11')[0];c.planejamento.acoes[0].data='2026-12-02';assert.equal(projetarCampanhas([c],'2026-11').length,0);assert.equal(projetarCampanhas([c],'2026-12')[0].id,antes.id);});
test('planejamento sem ações não produz evento',()=>assert.deepEqual(projetarCampanhas([{id:'exemplo',planejamento:validarPlanejamento(plano([]))}],'2026-11'),[]));

import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
function porta(perms, falha=false){
 let handler,consultas=0;
 const q={select(){consultas++;return q;},eq(){return q;},gt(){return q;},order(){return q;},limit(){return Promise.resolve({data:[{id:'campanha-exemplo',registro:{nome:'Campanha fictícia',planejamento:plano()}}],error:falha?{message:'Erro privado'}:null});}};
 const source=readFileSync(new URL('../supabase/functions/painel-agenda/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{
  Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>({from:()=>q}),verificarJwt:async()=>({perms,sub:'exemplo'}),crachaRevogado:async()=>false,
  projetarCampanhas,Request,Response,console:{error(){}}
 });
 return {call:()=>handler(new Request('https://exemplo.test',{method:'POST',headers:{Authorization:'Bearer teste'},body:JSON.stringify({action:'campanhas',mes:'2026-11'})})),consultas:()=>consultas};
}
test('porta exige acesso à campanha e ao calendário antes de ler',async()=>{for(const perms of [[],['campanhas'],['calendario-empresa']]){const p=porta(perms);assert.equal((await p.call()).status,403);assert.equal(p.consultas(),0);}});
test('porta devolve projeção e falha não vira calendário vazio',async()=>{const r=await porta(['campanhas','calendario-empresa']).call();assert.equal(r.status,200);assert.equal((await r.json()).eventos.length,1);const falha=await porta(['campanhas','calendario-empresa'],true).call();assert.equal(falha.status,500);assert.ok(!(await falha.text()).includes('Erro privado'));});
