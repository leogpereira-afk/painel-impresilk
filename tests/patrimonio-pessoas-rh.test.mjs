import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lerPessoasPatrimonio,validarVinculoPessoa,prepararPessoasControle} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {aplicarOperacaoCaixa,quantidadeEmUso} from '../supabase/functions/_shared/patrimonio-caixas.mjs';
const pessoas=[{id:'rh-1',nome:'Ana Exemplo',idPessoa:'111111',disponivel:true},{id:'rh-2',nome:'Ana Exemplo',idPessoa:'222222',disponivel:true},{id:'rh-3',nome:'Bruno Exemplo',idPessoa:'333333',disponivel:false}];
const SITUACOES=[{id:'ativo',conta:'true'},{id:'experiencia',conta:'true'},{id:'freelancer',conta:'true'},{id:'afastado',conta:'false'},{id:'inativo',conta:'false'},{id:'direcao',conta:'false'}];
// Banco falso do RH: confere a projeção fechada e serve as duas coleções que a régua lê.
function bancoRH({status=SITUACOES,colaboradores=[],falhaEm=null}={}) {
 const chamadas=[];
 return {chamadas,from(tabela){assert.equal(tabela,'registros');let cols,colecao;const q={
  select(c){cols=c;assert(!c.includes('salario'));assert(!c.includes('cpf'));assert(!c.includes('*'));return q;},
  eq(k,v){assert.equal(k,'colecao');colecao=v;return q;},order(){return q;},
  async range(de,ate){chamadas.push({colecao,de,ate,cols});if(falhaEm===colecao)return{data:null,error:{message:'banco fora'}};
   const linhas=colecao==='status'?status:colecao==='colaboradores'?colaboradores:assert.fail('coleção inesperada '+colecao);
   return{data:linhas.slice(de,ate+1),error:null};}};return q;}};
}

test('RH é consultado com projeção fechada, paginação e ID da empresa',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({id:'linha-'+i,apagado:false,pid:'rh-'+i,nome:'Pessoa '+i,idPessoa:String(100000+i),statusId:i===0?'inativo':'ativo',saiu:i===1?'2026-01-01':null,salario:123,cpf:'não expor'}));
 const sb=bancoRH({colaboradores:rows});
 const lista=await lerPessoasPatrimonio(sb);assert.equal(lista.length,1001);
 assert.deepEqual(sb.chamadas.map(c=>c.colecao),['status','colaboradores','colaboradores']);
 assert.deepEqual(lista.find(p=>p.id==='rh-0'),{id:'rh-0',nome:'Pessoa 0',idPessoa:'100000',apelido:'',disponivel:false});
 assert.equal(lista.find(p=>p.id==='rh-1').disponivel,false);assert.equal(lista.find(p=>p.id==='rh-2').disponivel,true);
 assert(!JSON.stringify(lista).includes('não expor'));assert.deepEqual(Object.keys(lista[0]).sort(),['apelido','disponivel','id','idPessoa','nome']);
});
test('régua oficial do RH: conta como ativo ou direção, sem desligamento; apagada não é pessoa',async()=>{
 const linha=(pid,extra)=>({id:'l-'+pid,apagado:false,pid,nome:'Pessoa '+pid,idPessoa:'',...extra});
 const lista=await lerPessoasPatrimonio(bancoRH({colaboradores:[
  linha('ativo',{statusId:'ativo',idPessoa:'123456',apelido:' apelido '}),linha('experiencia',{statusId:'experiencia'}),
  linha('freelancer',{statusId:'freelancer'}),linha('afastado',{statusId:'afastado'}),linha('inativo',{statusId:'inativo'}),
  linha('direcao',{statusId:'direcao'}),linha('dir-marca',{statusId:'afastado',direcao:'true'}),
  linha('saiu',{statusId:'ativo',saiu:'2026-09-30'}),linha('saiu-branco',{statusId:'ativo',saiu:'  '}),
  linha('sem-situacao',{statusId:'desconhecida'}),linha('apagada',{statusId:'ativo',apagado:true}),
  linha('id-curto',{statusId:'ativo',idPessoa:'12345'}),
 ]}));
 const disp=Object.fromEntries(lista.map(p=>[p.id,p.disponivel]));
 assert.deepEqual(disp,{ativo:true,experiencia:true,freelancer:true,afastado:false,inativo:false,direcao:true,'dir-marca':true,saiu:false,'saiu-branco':true,'sem-situacao':false,'id-curto':true});
 assert.equal(lista.find(p=>p.id==='ativo').idPessoa,'123456');assert.equal(lista.find(p=>p.id==='ativo').apelido,'apelido');
 assert.equal(lista.find(p=>p.id==='id-curto').idPessoa,'');
});
test('falha do RH não vira lista vazia, nem nas situações nem nos colaboradores',async()=>{
 await assert.rejects(lerPessoasPatrimonio(bancoRH({falhaEm:'status'})),/situações/);
 await assert.rejects(lerPessoasPatrimonio(bancoRH({falhaEm:'colaboradores'})),/colaboradores/);
});
test('IDs oficiais duplicados impedem vínculo e não são unidos por nome',async()=>{
 await assert.rejects(lerPessoasPatrimonio(bancoRH({colaboradores:[{id:'linha-1',pid:'repetido',nome:'Ana Exemplo',statusId:'ativo'},{id:'linha-2',pid:'repetido',nome:'Bruno Exemplo',statusId:'ativo'}]})),/IDs repetidos/);
});
test('vínculos usam IDs, rejeitam nomes livres e nomes forjados viram nome oficial',()=>{
 assert.throws(()=>validarVinculoPessoa({pessoa:'Ana Exemplo'},null,pessoas),/RH/);
 assert.throws(()=>validarVinculoPessoa({pessoaId:'não-existe'},null,pessoas),/RH/);
 assert.throws(()=>validarVinculoPessoa({pessoaId:'rh-3'},null,pessoas),/RH/);
 assert.deepEqual(validarVinculoPessoa({pessoaId:'rh-2',pessoa:'forjado',pessoaIdPessoa:'999999'},null,pessoas),{pessoaId:'rh-2',pessoa:'Ana Exemplo',pessoaIdPessoa:'222222'});
 assert.deepEqual(validarVinculoPessoa({responsavelId:'rh-1'},null,pessoas,'responsavel'),{responsavelId:'rh-1',responsavel:'Ana Exemplo',responsavelIdPessoa:'111111'});
});
test('legados e desligados existentes são preservados, sem associação por nome',()=>{
 const antes={pessoa:'Recepção / Ana',telefone:'123'};
 assert.deepEqual(validarVinculoPessoa({pessoa:antes.pessoa},antes,pessoas),{pessoaId:'',pessoa:antes.pessoa,pessoaIdPessoa:''});
 assert.throws(()=>validarVinculoPessoa({pessoa:'Outra pessoa'},antes,pessoas),/RH/);
 assert.deepEqual(validarVinculoPessoa({pessoaId:'rh-3'},{pessoaId:'rh-3',pessoa:'Nome antigo'},pessoas),{pessoaId:'rh-3',pessoa:'Bruno Exemplo',pessoaIdPessoa:'333333'});
 assert.deepEqual(validarVinculoPessoa({pessoaId:'removido'},{pessoaId:'removido',pessoa:'Histórico',pessoaIdPessoa:'444444'},pessoas),{pessoaId:'removido',pessoa:'Histórico',pessoaIdPessoa:'444444'});
 assert.deepEqual(validarVinculoPessoa({pessoaId:'',pessoa:''},antes,pessoas),{pessoaId:'',pessoa:'',pessoaIdPessoa:''});
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
