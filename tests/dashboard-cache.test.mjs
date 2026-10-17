import test from 'node:test';
import assert from 'node:assert/strict';
import {criarCacheComercial} from '../src/lib/cache-comercial.mjs';
import {moeda,numero,porcentagem} from '../src/components/dashboard/formatos.js';

test('cache isola pessoa, permissões e filtros e expira',async()=>{
 let agora=0,n=0;const c=criarCacheComercial({ttl:30,relogio:()=>agora}),ler=async()=>++n;
 assert.equal(await c.consultar('ana:leitura','mes1',ler),1);
 assert.equal(await c.consultar('ana:leitura','mes1',ler),1);
 assert.equal(await c.consultar('ana:leitura','mes2',ler),2);
 assert.equal(await c.consultar('ana:master','mes1',ler),3);
 assert.equal(await c.consultar('bia:master','mes1',ler),4);
 agora=31;assert.equal(await c.consultar('bia:master','mes1',ler),5);
});
test('resposta antiga não repopula cache depois de troca de usuário ou invalidação',async()=>{
 const c=criarCacheComercial();let resolver;const lento=new Promise(r=>resolver=r);
 const antigo=c.consultar('ana','k',()=>lento);
 assert.equal(await c.consultar('bia','k',async()=>20),20);
 resolver(10);await antigo;
 assert.equal(await c.consultar('bia','k',async()=>30),20);
 let concluir;const leitura=c.consultar('bia','j',()=>new Promise(r=>concluir=r));
 c.limpar();concluir(40);await leitura;
 assert.equal(await c.consultar('bia','j',async()=>50),50);
});
test('erros e consultas abortadas não viram resultados em cache',async()=>{
 const c=criarCacheComercial();await assert.rejects(()=>c.consultar('ana','k',async()=>{throw Error('fonte');}),/fonte/);
 const ac=new AbortController();let resolver;const consulta=c.consultar('ana','k',()=>new Promise(r=>resolver=r),ac.signal);
 ac.abort();resolver(10);await consulta;
 assert.equal(await c.consultar('ana','k',async()=>20),20);
 await assert.rejects(()=>c.consultar('ana','k',async()=>30,ac.signal),{name:'AbortError'});
});
test('limite de memória não conserva histórico ilimitado',async()=>{
 const c=criarCacheComercial({limite:2});
 for(const k of ['a','b','c'])await c.consultar('ana',k,async()=>k);
 assert.equal(await c.consultar('ana','a',async()=>'novo'),'novo');
});
test('ausência monetária nunca vira zero e valores em centavos mantêm escala',()=>{
 assert.equal(moeda(null),'Não disponível');assert.equal(moeda(undefined),'Não disponível');
 assert.equal(numero(null),'—');assert.equal(porcentagem(null),'—');
 assert.match(moeda(12345),/123,45/);assert.match(moeda(0),/0,00/);assert.equal(porcentagem(0),'0%');
});
