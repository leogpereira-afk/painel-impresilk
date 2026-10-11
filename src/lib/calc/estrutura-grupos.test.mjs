import test from 'node:test';
import assert from 'node:assert/strict';
import {filtrarGrupoEstrutura,historicoEstrutura,CATEGORIAS_ESTRUTURA,prepararEstrutura} from './estrutura-patrimonio.js';
test('grupos usam categorias exatas, com variações de apóstrofo',()=>{
 const itens=['Hidráulica','Caixa-d’água',"Caixa-d'água",'Caixa-d\u2018água','Elétrica','Iluminação','Rede e internet','Hidráulica industrial'].map((categoria,id)=>({id,categoria}));
 assert.equal(filtrarGrupoEstrutura(itens,'hidraulica').length,4);
 assert.equal(filtrarGrupoEstrutura(itens,'eletrica').length,2);
 assert.equal(filtrarGrupoEstrutura(itens).length,8);
});
test('histórico por ID e totais respeitam virada de mês em São Paulo',()=>{
 const itens=[{id:'a'}];
 const mapa={um:{ativoId:'a',data:'2026-09-30',valor:10},dois:{ativoId:'a',data:'2026-10-01',valor:20},tres:{ativoId:'b',data:'2026-09-30',valor:999},quatro:{ativoId:'a',data:'2025-09-30',valor:30}};
 const h=historicoEstrutura(mapa,itens,new Date('2026-10-01T01:00:00Z'));
 assert.equal(h.mes,10);assert.equal(h.ano,30);assert.equal(h.porItem.a.length,3);assert.equal(h.registros[0].id,'dois');
});
test('sugestões excluem segurança e rede, preservam dados antigos e incêndio',()=>{
 for(const c of ['Câmeras / CFTV','Alarme','Rede e internet']) assert.ok(!CATEGORIAS_ESTRUTURA.includes(c));
 assert.ok(CATEGORIAS_ESTRUTURA.includes('Combate a incêndio'));
 const antigo={id:'rede',tipo:'predial',categoria:'Rede e internet',nome:'Item sintético'};
 assert.equal(prepararEstrutura([antigo])[0].categoria,antigo.categoria);assert.equal(antigo.tipo,'predial');
});
