import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lerPessoasPatrimonio,validarVinculoPessoa,prepararPessoasControle} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {aplicarOperacaoCaixa,quantidadeEmUso} from '../supabase/functions/_shared/patrimonio-caixas.mjs';
const pessoas=[{id:'rh-1',nome:'Ana Exemplo',disponivel:true},{id:'rh-2',nome:'Ana Exemplo',disponivel:true},{id:'rh-3',nome:'Bruno Exemplo',disponivel:false}];

test('RH é consultado com projeção fechada, paginação e ID oficial',async()=>{
 const chamadas=[];
 const rows=Array.from({length:1001},(_,i)=>({id:'linha-'+i,pid:'rh-'+i,nome:'Pessoa '+i,statusId:i===0?'inativo':'ativo',saiu:i===1?'2026-01-01':null,salario:123,cpf:'não expor'}));
 const sb={from(tabela){assert.equal(tabela,'registros');let cols;const q={select(c){cols=c;assert(!c.includes('salario'));assert(!c.includes('cpf'));assert(!c.includes('*'));return q;},eq(k,v){assert.equal(k,'colecao');assert.equal(v,'colaboradores');return q;},order(){return q;},async range(de,ate){chamadas.push({de,ate,cols});return{data:rows.slice(de,ate+1),error:null};}};return q;}};
 const lista=await lerPessoasPatrimonio(sb);assert.equal(lista.length,1001);assert.equal(chamadas.length,2);
 assert.deepEqual(lista.find(p=>p.id==='rh-0'),{id:'rh-0',nome:'Pessoa 0',disponivel:false});
 assert(!JSON.stringify(lista).includes('não expor'));assert.deepEqual(Object.keys(lista[0]).sort(),['disponivel','id','nome']);
});
test('falha do RH não vira lista vazia',async()=>{
 const q={select(){return q;},eq(){return q;},order(){return q;},range:async()=>({error:{message:'banco fora'},data:null})};
 await assert.rejects(lerPessoasPatrimonio({from:()=>q}),/consultar/);
});
test('IDs oficiais duplicados impedem vínculo e não são unidos por nome',async()=>{
 const q={select(){return q;},eq(){return q;},order(){return q;},range:async()=>({error:null,data:[{id:'linha-1',pid:'repetido',nome:'Ana Exemplo'},{id:'linha-2',pid:'repetido',nome:'Bruno Exemplo'}]})};
 await assert.rejects(lerPessoasPatrimonio({from:()=>q}),/IDs repetidos/);
});
test('vínculos usam IDs, rejeitam nomes livres e nomes forjados viram nome oficial',()=>{
 assert.throws(()=>validarVinculoPessoa({pessoa:'Ana Exemplo'},null,pessoas),/RH/);
 assert.throws(()=>validarVinculoPessoa({pessoaId:'não-existe'},null,pessoas),/RH/);
 assert.throws(()=>validarVinculoPessoa({pessoaId:'rh-3'},null,pessoas),/RH/);
 assert.deepEqual(validarVinculoPessoa({pessoaId:'rh-2',pessoa:'forjado'},null,pessoas),{pessoaId:'rh-2',pessoa:'Ana Exemplo'});
 assert.deepEqual(validarVinculoPessoa({responsavelId:'rh-1'},null,pessoas,'responsavel'),{responsavelId:'rh-1',responsavel:'Ana Exemplo'});
});
test('legados e desligados existentes são preservados, sem associação por nome',()=>{
 const antes={pessoa:'Recepção / Ana',telefone:'123'};
 assert.deepEqual(validarVinculoPessoa({pessoa:antes.pessoa},antes,pessoas),{pessoaId:'',pessoa:antes.pessoa});
 assert.throws(()=>validarVinculoPessoa({pessoa:'Outra pessoa'},antes,pessoas),/RH/);
 assert.deepEqual(validarVinculoPessoa({pessoaId:'rh-3'},{pessoaId:'rh-3',pessoa:'Nome antigo'},pessoas),{pessoaId:'rh-3',pessoa:'Bruno Exemplo'});
 assert.deepEqual(validarVinculoPessoa({pessoaId:'removido'},{pessoaId:'removido',pessoa:'Histórico'},pessoas),{pessoaId:'removido',pessoa:'Histórico'});
 assert.deepEqual(validarVinculoPessoa({pessoaId:'',pessoa:''},antes,pessoas),{pessoaId:'',pessoa:''});
});
test('homônimos e mudança de nome não misturam saldos de ferramentas',()=>{
 const agora='2026-10-11T14:00:00Z',sessao={sub:'operador',nome:'Operador'},base={tipo:'ferramentas',numero:'1',pessoa:'',pessoaId:'',acervo:[{id:'i',nome:'Alicate',quantidade:5}],movimentacoes:[],avaliacoes:[]};
 const op=(tipo,id,q)=>({tipo,itemId:'i',pessoaId:id,pessoa:'Nome forjado',quantidade:q,data:'2026-10-11',estado:'bom'});
 const aplicar=(caixa,operacaoCaixa,lista=pessoas)=>({...caixa,...aplicarOperacaoCaixa(caixa,prepararPessoasControle({pessoa:'',operacaoCaixa},caixa,lista).operacaoCaixa,sessao,agora)});
 let caixa=aplicar(base,op('entrega','rh-1',2));caixa=aplicar(caixa,op('entrega','rh-2',1));
 assert.equal(quantidadeEmUso(caixa.movimentacoes,'i',{pessoaId:'rh-1',pessoa:'outro nome'}),2);
 assert.equal(quantidadeEmUso(caixa.movimentacoes,'i',{pessoaId:'rh-2'}),1);
 assert.throws(()=>aplicar(caixa,op('devolucao','rh-2',2)),/excede/);
 caixa=aplicar(caixa,op('devolucao','rh-1',2),[{...pessoas[0],nome:'Nome atualizado',disponivel:false},pessoas[1]]);
 assert.equal(quantidadeEmUso(caixa.movimentacoes,'i',{pessoaId:'rh-1'}),0);
 assert.equal(caixa.movimentacoes[0].pessoa,'Ana Exemplo');assert.equal(caixa.movimentacoes[2].pessoa,'Nome atualizado');
});
test('devolução antiga fica isolada dos novos IDs e não permite nova entrega livre',()=>{
 const antiga={movimentacoes:[{tipo:'entrega',itemId:'i',pessoa:'Ana Exemplo',quantidade:2}]};
 assert.equal(quantidadeEmUso(antiga.movimentacoes,'i',{pessoaId:'rh-1',pessoa:'Ana Exemplo'}),0);
 const operacaoCaixa={tipo:'devolucao',itemId:'i',pessoa:'Ana Exemplo'};
 assert.equal(prepararPessoasControle({operacaoCaixa},antiga,pessoas).operacaoCaixa.pessoaId,'');
 assert.throws(()=>prepararPessoasControle({operacaoCaixa:{...operacaoCaixa,pessoa:'Outro nome'}},antiga,pessoas),/quem/);
 assert.throws(()=>prepararPessoasControle({operacaoCaixa:{...operacaoCaixa,tipo:'entrega'}},antiga,pessoas),/RH/);
});
