import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caminhoCadastroPatrimonio, caminhoManutencao, redirecionarManutencoes, destinoPatrimonio, recortarManutencoes, abasPatrimonio, abaPatrimonioAtual, secaoEstruturaInicial } from './navegacao-patrimonio.js';
import { calcManutencoes, agruparGastos, CATEGORIAS_POR_FAMILIA } from './manutencoes.js';

test('acesso unificado mantém usuários com apenas manutenção e não concede inventário', () => {
  assert.equal(destinoPatrimonio(false, true), '/patrimonio/manutencoes');
  assert.equal(destinoPatrimonio(true, false), '/patrimonio');
  assert.equal(destinoPatrimonio(true, true), '/patrimonio');
  assert.equal(destinoPatrimonio(false, false), null);
});
test('Computadores migra para Estrutura sem perder o endereço antigo',()=>{
  const abas=abasPatrimonio(modulo=>modulo==='patrimonio');
  assert.equal(abas.includes('estrutura'),true);
  assert.equal(abas.includes('computadores'),false);
  assert.equal(abaPatrimonioAtual('computadores'),'estrutura');
  assert.equal(secaoEstruturaInicial('computadores'),'computadores');
  assert.equal(secaoEstruturaInicial('estrutura'),'outros');
  assert.equal(abaPatrimonioAtual('ramais'),'telefonia');
  assert.equal(abaPatrimonioAtual('celulares'),'telefonia');
});
test('manutenção oferece as novas categorias na família correta',()=>{
  assert.equal(CATEGORIAS_POR_FAMILIA.informatica.includes('Servidor'),true);
  for(const categoria of ['Padrão de energia','Transformador','Usina fotovoltaica'])assert.equal(CATEGORIAS_POR_FAMILIA.predial.includes(categoria),true);
});
test('links antigos preservam ficha e histórico; novos codificam IDs', () => {
  assert.equal(redirecionarManutencoes('?aba=historico&item=a%26b'), '/patrimonio/manutencoes?aba=historico&item=a%26b');
  const url = new URL(caminhoManutencao({item:'a&b',familia:'maquina',novo:true}), 'https://example.com');
  assert.equal(url.searchParams.get('item'), 'a&b');
  assert.equal(url.searchParams.get('novo'), 'maquina');
  assert.equal(new URL(caminhoManutencao({familia:'invalida',novo:true}), url).searchParams.has('novo'), false);
});

test('a ficha da manutenção retorna ao cadastro na área correta, pelo mesmo ID',()=>{
  for(const [familia,categoria,aba,param,secao] of [
    ['veiculo','','carros'],['maquina','','maquinas'],
    ['informatica','Computador','estrutura','estrutura','computadores'],
    ['informatica','Telefone','telefonia','telefonia','ramais'],
    ['informatica','Celular','telefonia','telefonia','celulares'],
    ['predial','Hidráulica','estrutura','estrutura','hidraulica'],
    ['predial','Transformador','estrutura','estrutura','eletrica'],
    ['seguranca','Alarme','seguranca','seguranca','alarmes'],
    ['seguranca','Acesso facial','seguranca','seguranca','facial'],
  ]){
    const url=new URL(caminhoCadastroPatrimonio({familia,categoria,item:'id&a',novo:true}),'https://example.com');
    assert.equal(url.pathname,'/patrimonio');assert.equal(url.searchParams.get('aba'),aba);
    assert.equal(url.searchParams.get('ficha'),'id&a');
    if(param)assert.equal(url.searchParams.get(param),secao);
    assert.equal(url.searchParams.has('cadastro'),['veiculo','maquina'].includes(familia));
  }
});
test('ficha usa apenas seu custo e preserva lançamentos órfãos na visão geral', () => {
  const itens = [{id:'a'},{id:'b'}];
  const mapa = {um:{ativoId:'a',valor:10},dois:{ativoId:'b',valor:20},tres:{ativoId:'removido',valor:30}};
  assert.deepEqual(recortarManutencoes(itens,mapa,'a'), {itens:[{id:'a'}],mapa:{um:mapa.um}});
  assert.deepEqual(recortarManutencoes(itens,mapa,'removido'), {itens:[],mapa:{tres:mapa.tres}});
  assert.equal(recortarManutencoes(itens,mapa).mapa, mapa);
  assert.equal(Object.keys(mapa).length, 3);
});

test('indicadores e histórico mensal concordam no recorte, inclusive de equipamento removido', () => {
  const itens = [{id:'a',tipo:'veiculo'}, {id:'b',tipo:'maquina'}];
  const mapa = {um:{ativoId:'a',data:'2026-10-01',valor:120},dois:{ativoId:'b',data:'2026-10-02',valor:350},tres:{ativoId:'removido',data:'2026-10-03',valor:80}};
  for (const [id,total] of [['',550],['a',120],['removido',80]]) {
    const recorte = recortarManutencoes(itens,mapa,id);
    const vm = calcManutencoes(recorte.itens,recorte.mapa,'2026-10-11');
    assert.equal(vm.kpis.gastoMes,total);
    assert.equal(vm.kpis.gastoAno,total);
    assert.equal(agruparGastos(vm.lancamentos,itens).anos[0].total,total);
  }
});
