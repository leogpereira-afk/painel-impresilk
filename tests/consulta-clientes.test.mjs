import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clienteCorresponde,consultarClientes} from '../supabase/functions/_shared/consulta-clientes.mjs';
test('pesquisa de carteira e geral aceitam acentos, razão social, termos fora de ordem e documento pontuado',()=>{
 const c={nome:'Café do João',razaoSocial:'Comércio Horizonte Ltda',documento:'12345678000190'};
 for(const q of ['cafe joao',' JOAO  CAFE ','comercio horizonte','12.345.678/0001-90','12345678000190',''])assert.equal(clienteCorresponde(c,q),true,q);
 assert.equal(clienteCorresponde(c,'cafe inexistente'),false);
});
test('CNPJ duplicado preserva cada cadastro e documento exato vem antes do parcial',()=>{
 const fonte={valor:{completo:true,clientes:{a:{id:'a',nome:'Z Loja',documento:'12345678000190'},b:{id:'b',nome:'Outra razão',documento:'12.345.678/0001-90'},c:{id:'c',nome:'A Loja',documento:'12345678'}}},atualizado_em:'2026-10-07T12:00:00Z'};
 const r=consultarClientes(fonte,{busca:'12345678000190'});assert.equal(r.total,2);assert.equal(new Set(r.clientes.map(c=>c.id)).size,2);assert.equal(r.atualizadoEm,fonte.atualizado_em);
 assert.equal(consultarClientes(fonte,{busca:'12345678'}).clientes[0].id,'c');
});
