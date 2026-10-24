import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referenciaMaquina,manualDaMaquina,conteudoManualVazio,pendenciasManual,urlManualSegura,caminhoManualMaquina,enderecoManualMaquina,qrManualDataUrl} from './manuais-maquinas.js';

test('máquina e bem usam identidade explícita sem aproximar nomes',()=>{
 const ativo={id:'maquina-antiga',nome:'Máquina'},bem={id:'bem:pat-antigo',somenteBem:true,bem:{id:'pat-antigo'},nome:'Máquina'};
 assert.deepEqual(referenciaMaquina(ativo),{tipo:'ativo',id:'maquina-antiga'});
 assert.deepEqual(referenciaMaquina(bem),{tipo:'bem',id:'pat-antigo'});
 const m={id:'manual',referencias:[referenciaMaquina(ativo),referenciaMaquina(bem)]};
 assert.equal(manualDaMaquina(ativo,[m]),m);assert.equal(manualDaMaquina(bem,[m]),m);
 assert.equal(manualDaMaquina({id:'outra',nome:'Máquina'},[m]),null);
 assert.throws(()=>manualDaMaquina(ativo,[m,{...m,id:'outro-manual'}]),/conflitantes/);
});
test('manual vazio preserva pendências; fonte precisa corresponder ao modelo',()=>{
 const c=conteudoManualVazio();assert.equal(pendenciasManual(c).length,8);
 Object.assign(c,{identificacaoConfirmada:true,fabricante:'Exemplo',modelo:'M1',seguranca:'Exemplo',operacao:'Exemplo',responsavelId:'rh',revisarEm:'2027-01-01'});
 c.fontes=[{titulo:'Exemplo',url:'https://example.com/manual',situacao:'verificado',conferidoEm:'2026-10-24',modelo:'M2'}];assert.equal(pendenciasManual(c).length,1);
 c.fontes[0].modelo='M1';assert.deepEqual(pendenciasManual(c),[]);
});
test('links persistidos recusam script, senha e token; deep link e QR nunca incluem credencial',()=>{
 for(const url of ['javascript:alert(1)','https://usuario:senha@example.com','https://example.com/?token=privado','http://example.com','https://localhost/x'])assert.equal(urlManualSegura(url),'');
 assert.equal(urlManualSegura('https://drive.google.com/file/d/demo/view'),'https://drive.google.com/file/d/demo/view');
 assert.equal(caminhoManualMaquina({id:'bem:pat-antigo'}),'/patrimonio?aba=maquinas&manual=bem%3Apat-antigo');
 const endereco=enderecoManualMaquina({id:'maq-ficticia'});assert.equal(new URL(endereco).origin,'https://leogpereira-afk.github.io');
 const qr=qrManualDataUrl({id:'maq-ficticia'});assert.ok(qr.startsWith('data:image/svg+xml;'));const svg=decodeURIComponent(qr.split(',')[1]);assert.match(svg,/<svg/);assert.match(svg,/<path/);assert.equal(/<script|<image|<foreignObject/.test(svg),false);
});
