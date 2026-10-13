import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rotuloPessoa, pessoaDoVinculo, sugerirPessoa} from './pessoas-rh.js';

const pessoas = [
  {id: 'ficha-caio', nome: 'Caio Exemplo Souza', idPessoa: '111111', apelido: 'caio', disponivel: true},
  {id: 'ficha-ze', nome: 'José Exemplo Lima', idPessoa: '222222', apelido: 'zeca', disponivel: true},
  {id: 'ficha-lia-1', nome: 'Lia Exemplo', idPessoa: '333333', apelido: 'lia', disponivel: true},
  {id: 'ficha-lia-2', nome: 'Lia Outra Exemplo', idPessoa: '444444', apelido: 'liaoutra', disponivel: false},
  {id: 'ficha-saiu', nome: 'Otto Exemplo', idPessoa: '555555', apelido: 'otto', disponivel: false},
  {id: 'ficha-sem-id', nome: 'Pessoa Sem Id', idPessoa: '', disponivel: true},
];

test('rótulo mostra o ID da empresa ao lado do nome, e só quando o ID é válido', () => {
  assert.equal(rotuloPessoa(pessoas[0]), 'Caio Exemplo Souza · ID 111111');
  assert.equal(rotuloPessoa(pessoas[5]), 'Pessoa Sem Id');
  assert.equal(rotuloPessoa({nome: 'X', idPessoa: '12345'}), 'X');
  assert.equal(rotuloPessoa(null), '');
});

test('vínculo acha pela ficha e, se a ficha sumiu, pelo ID da empresa sem ambiguidade', () => {
  assert.equal(pessoaDoVinculo(pessoas, 'ficha-ze').id, 'ficha-ze');
  assert.equal(pessoaDoVinculo(pessoas, 'ficha-apagada', '222222').id, 'ficha-ze');
  assert.equal(pessoaDoVinculo(pessoas, 'ficha-apagada', '999999'), null);
  assert.equal(pessoaDoVinculo(pessoas, '', 'abc'), null);
  const repetido = [...pessoas, {id: 'ficha-copia', nome: 'Cópia', idPessoa: '222222', disponivel: true}];
  assert.equal(pessoaDoVinculo(repetido, 'ficha-apagada', '222222'), null);
});

test('sugestão: nome completo, começo do nome ou apelido, uma ficha só e ativa', () => {
  assert.equal(sugerirPessoa('Caio', pessoas).pessoa.id, 'ficha-caio');
  assert.equal(sugerirPessoa('  caio exemplo ', pessoas).pessoa.id, 'ficha-caio');
  assert.equal(sugerirPessoa('Zeca', pessoas).pessoa.id, 'ficha-ze');
  assert.equal(sugerirPessoa('JOSÉ EXEMPLO LIMA', pessoas).pessoa.id, 'ficha-ze');
});

test('sem sugestão quando o nome é ambíguo (contando quem saiu), de quem saiu ou desconhecido', () => {
  assert.deepEqual(sugerirPessoa('Lia', pessoas), {pessoa: null, motivo: 'varias', quantas: 2});
  assert.deepEqual(sugerirPessoa('Otto', pessoas), {pessoa: null, motivo: 'fora'});
  assert.deepEqual(sugerirPessoa('Recepção', pessoas), {pessoa: null, motivo: 'nenhuma'});
  assert.deepEqual(sugerirPessoa('', pessoas), {pessoa: null, motivo: 'vazio'});
  // Pedaço do meio ou do fim do nome não sugere ninguém.
  assert.equal(sugerirPessoa('Souza', pessoas).pessoa, null);
  assert.equal(sugerirPessoa('Exemplo', pessoas).pessoa, null);
});
