import test from 'node:test';
import assert from 'node:assert/strict';
import {camerasAtivas,itensConferenciaVazios,conferenciaCompleta,contarCategoriasSeguranca,ocupacaoGravadores,copiasEmPosse,pendenciasDesligamento,historicoPreservado} from './seguranca-patrimonio.js';

test('câmeras legadas entram na conferência e canais vêm das referências',()=>{
 const itens=[{id:'d',tipo:'seguranca',categoria:'DVR/NVR',especificacao:{canaisTotais:'8'}},{id:'a',tipo:'seguranca',categoria:'Câmera',especificacao:{gravadorId:'d',canal:'1'}},{id:'b',tipo:'seguranca',categoria:'Câmeras / CFTV',especificacao:{gravadorId:'d',canal:'1'}},{id:'c',tipo:'seguranca',categoria:'Câmera',especificacao:{situacao:'baixado',gravadorId:'d',canal:'2'}}];
 assert.deepEqual(camerasAtivas(itens).map(i=>i.id),['a','b']);
 assert.deepEqual(contarCategoriasSeguranca(itens),{'DVR/NVR':1,'Câmera':3});
 assert.deepEqual(ocupacaoGravadores(itens).d,{cameras:2,canaisOcupados:1,canais:['1'],duplicados:['1'],total:8});
 const vazios=itensConferenciaVazios(itens);
 assert.deepEqual(vazios,[{cameraId:'a',status:''},{cameraId:'b',status:''}]);
 assert.equal(conferenciaCompleta(vazios,camerasAtivas(itens)),false);
 assert.equal(conferenciaCompleta(vazios.map(i=>({...i,status:'gravando'})),camerasAtivas(itens)),true);
});
test('categoria, inventário e pessoa nunca são inferidos pelo nome',()=>{
 const itens=[{id:'a',tipo:'seguranca',categoria:'Câmera',nome:'Entrada',especificacao:{}},{id:'b',tipo:'informatica',categoria:'Computador',nome:'Entrada',responsavelId:'x'}];
 assert.deepEqual(contarCategoriasSeguranca(itens),{'Câmera':1});
 assert.deepEqual(pendenciasDesligamento('x',itens,{}),[{tipo:'computador',nome:'Entrada',itemId:'b'}]);
 assert.deepEqual(pendenciasDesligamento('y',itens,{}),[]);
});
test('devoluções e bloqueios ficam no histórico e somem das pendências atuais',()=>{
 const item={id:'x',tipo:'seguranca',categoria:'Portão',nome:'Entrada',especificacao:{copias:[{id:'old',tipo:'tag',pessoaId:'p',entrega:'2026-01-01',devolucao:'2026-02-01'},{id:'now',tipo:'controle',pessoaId:'p',entrega:'2026-02-02',devolucao:''}]}};
 assert.deepEqual(copiasEmPosse(item).map(c=>c.id),['now']);
 assert.equal(historicoPreservado(item,{...item,especificacao:{copias:[item.especificacao.copias[1]]}},'copias'),false);
 assert.equal(historicoPreservado(item,{...item,especificacao:{copias:[item.especificacao.copias[0]]}},'copias'),false);
 assert.equal(historicoPreservado(item,{...item,especificacao:{copias:[item.especificacao.copias[0],{...item.especificacao.copias[1],devolucao:'2026-03-01'}]}},'copias'),true);
 assert.deepEqual(pendenciasDesligamento('p',[item],{l:{tipo:'celulares',pessoaId:'p',numero:'123'}}).map(x=>x.tipo),['controle','linha celular']);
});
