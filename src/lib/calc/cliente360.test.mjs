import test from 'node:test';
import assert from 'node:assert/strict';
import {fichaCliente360} from './cliente360.js';
const alvo={id:'a',clienteId:'1',cliente:'Alfa'};
test('homônimos com cadastros distintos não misturam propostas',()=>{
 const r=fichaCliente360(alvo,{orcamentos:[{...alvo,valor:100,situacao:'aberto'},{id:'b',clienteId:'2',cliente:'Alfa',valor:900,situacao:'aberto'}]});
 assert.equal(r.valorAberto,100);assert.equal(r.propostas.length,1);
});
test('sem identificador, inclui apenas a proposta selecionada',()=>{const r=fichaCliente360({id:'a',cliente:'Alfa'},{orcamentos:[{id:'a',cliente:'Alfa'},{id:'b',cliente:'Alfa'}],recebiveis:[{id:'t',cliente:'Alfa',valor:100}]});assert.equal(r.propostas.length,1);assert.equal(r.titulos.length,0);assert.equal(Boolean(r.vinculoFinanceiro),false);});
test('cadastro de outro cliente é ignorado',()=>{assert.equal(fichaCliente360(alvo,{}, {id:'2',documento:'12345678000199'}).documento,'');});
test('saldo usa restante e vínculo por documento; ID conflitante prevalece',()=>{
 const r=fichaCliente360(alvo,{recebiveis:[{id:'t',cnpj:'12.345.678/0001-99',valor:40,valorTitulo:100,vencimento:'2026-09-01'},{id:'x',clienteId:'2',cnpj:'12345678000199',valor:500},{id:'y',cnpj:'12345678000199',valor:10,vencimento:'2026-10-01'}]}, {id:'1',documento:'12345678000199'},'2026-09-05');
 assert.equal(r.saldo,50);assert.equal(r.saldoVencido,40);
});
test('conversão conta apenas propostas concluídas e evita duplicação',()=>{
 const r=fichaCliente360(alvo,{orcamentos:[{...alvo,situacao:'ganho',valor:100},{...alvo,situacao:'ganho',valor:100},{id:'b',clienteId:'1',situacao:'aberto'},{id:'c',clienteId:'1',situacao:'perdido'}]});assert.equal(r.valorGanho,100);assert.equal(r.conversao,.5);
});
test('documento inválido não cria associações e O.S. cancelada não entra',()=>{
 const r=fichaCliente360({...alvo,cnpj:'123'}, {ordens:[{id:'o',cnpj:'123'},{id:'c',clienteId:'1',cancelada:true},{id:'v',clienteId:'1',valor:10}]});assert.equal(r.ordens.length,1);assert.equal(r.ordens[0].id,'v');
});
