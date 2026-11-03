import test from 'node:test';
import assert from 'node:assert/strict';
import {categoriaDoServico,categoriasDosServicos,contarServicos,filtrarServicos,resumirProduto} from '../src/lib/licitacoes-servicos.mjs';

const itens=[
 {id:'exemplo-1',orgao:'Instituto Exemplo',processo:'Edital 01',produto:'Placas e sinalização',item:'1'},
 {id:'exemplo-2',orgao:'Instituto Exemplo',processo:'Edital 01',produto:'Adesivos e envelopamento',item:'2'},
 {id:'exemplo-3',orgao:'Fundação Exemplo',processo:'Edital 01',produto:'Letras-caixa e totem',item:'1'},
 {id:'exemplo-4',produto:'Serviço ainda sem especificação',motivos:['Destino de execução pendente.']},
];

test('categorias vêm somente dos produtos presentes e não fabricam catálogo completo',()=>{
 const categorias=categoriasDosServicos(itens);
 assert.deepEqual(categorias.map(item=>item.id),['letras','adesivos','sinalizacao','outros']);
 assert.equal(categorias.reduce((total,item)=>total+item.itens,0),itens.length);
 assert.deepEqual(categoriasDosServicos([]),[]);
});

test('agrupamento visual não muda status nem valida aderência ao portfólio',()=>{
 const dados=[{...itens[0],classificacao:'REVISÃO HUMANA'},{...itens[1],motivos:['Aderência não comprovada.']}],antes=structuredClone(dados);
 categoriasDosServicos(dados);filtrarServicos(dados,{categoria:'adesivos'});
 assert.deepEqual(dados,antes);assert.equal(categoriaDoServico('Produto desconhecido').id,'outros');assert.equal(categoriaDoServico('').id,'a-conferir');
});

test('contagem separa itens e processos por órgão e processo, sem inventar identificação ausente',()=>{
 assert.deepEqual(contarServicos(itens),{itens:4,processos:2,semProcesso:1});
 assert.deepEqual(contarServicos([{orgao:'A',processo:'1-2'},{orgao:'A',processo:'12'}]),{itens:2,processos:2,semProcesso:0});
});

test('busca e categoria combinam produtos, processo, órgão, destino e pendência sem acentos',()=>{
 assert.deepEqual(filtrarServicos(itens,{categoria:'sinalizacao',busca:'instituto sinalizacao'}).map(item=>item.id),['exemplo-1']);
 assert.deepEqual(filtrarServicos(itens,{categoria:'adesivos',busca:'letras'}),[]);
 assert.deepEqual(filtrarServicos(itens,{busca:'execucao pendente'}).map(item=>item.id),['exemplo-4']);
 assert.deepEqual(filtrarServicos(itens,{busca:'exemplo-3'}).map(item=>item.id),['exemplo-3']);
});

test('título encurta descrição longa sem alterar a origem e preserva descrição curta',()=>{
 const produto='Fornecimento de placas de sinalização em material demonstrativo com instalação em todas as unidades fictícias e garantia definida no anexo.';
 const resumo=resumirProduto(produto);assert.ok(resumo.length<=110);assert.ok(resumo.endsWith('…'));assert.ok(produto.includes('garantia'));
 assert.equal(resumirProduto('Adesivos'),'Adesivos');assert.equal(resumirProduto(''),'Serviço a conferir');
});
