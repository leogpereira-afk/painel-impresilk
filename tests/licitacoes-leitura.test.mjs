import test from 'node:test';
import assert from 'node:assert/strict';
import {criarLeituraLicitacoes,criarExportacaoLicitacoes} from '../src/lib/licitacoes-leitura.mjs';
function promessa(){let resolve,reject;const p=new Promise((r,j)=>{resolve=r;reject=j;});return {p,resolve,reject};}
test('atualização antiga não substitui relatório de consulta mais recente',async()=>{
  const a=promessa(),b=promessa(),estados=[],sinais=[];let n=0;
  const leitor=criarLeituraLicitacoes({consultar:signal=>{sinais.push(signal);return n++===0?a.p:b.p;},receber:e=>estados.push(e)});
  const primeira=leitor.atualizar(),segunda=leitor.atualizar();
  b.resolve({id:'novo'});await segunda;a.resolve({id:'antigo'});await primeira;
  assert.equal(sinais[0].aborted,true);assert.equal(estados.at(-1).dados.id,'novo');
});
test('falha de leitura remove dados anteriores e não os apresenta como atuais',async()=>{
  let n=0;const estados=[];
  const leitor=criarLeituraLicitacoes({consultar:async()=>{if(n++)throw Error('Fonte indisponível');return {id:'anterior'};},receber:e=>estados.push(e)});
  await leitor.atualizar();await leitor.atualizar();
  assert.equal(estados.at(-1).dados,null);assert.equal(estados.at(-1).erro,'Fonte indisponível');assert.equal(estados.at(-1).carregando,false);
});
test('desmontagem ou troca de sessão descarta resposta que chegou depois',async()=>{
  const a=promessa(),estados=[];const leitor=criarLeituraLicitacoes({consultar:()=>a.p,receber:e=>estados.push(e)});
  const p=leitor.atualizar();leitor.cancelar();const antes=estados.length;a.resolve({id:'consulta-encerrada'});await p;
  assert.equal(estados.length,antes);
});


test('seleção específica chega à consulta e retorno atrasado não troca versão',async()=>{
  const a=promessa(),b=promessa(),estados=[],ids=[];
  const leitor=criarLeituraLicitacoes({consultar:(_signal,id)=>{ids.push(id);return id==='semana-a'?a.p:b.p;},receber:e=>estados.push(e)});
  const primeira=leitor.atualizar('semana-a'),segunda=leitor.atualizar('semana-b');
  b.resolve({id:'semana-b'});await segunda;a.resolve({id:'semana-a'});await primeira;
  assert.deepEqual(ids,['semana-a','semana-b']);assert.equal(estados.at(-1).dados.id,'semana-b');assert.equal(estados.at(-1).chave,'semana-b');
});

test('histórico paginado usa a mesma proteção contra resposta de página antiga',async()=>{
  const a=promessa(),b=promessa(),estados=[];
  const leitor=criarLeituraLicitacoes({consultar:(_signal,pagina)=>pagina===1?a.p:b.p,receber:e=>estados.push(e)});
  const primeira=leitor.atualizar(1),segunda=leitor.atualizar(2);b.resolve({pagina:2,registros:[]});await segunda;a.resolve({pagina:1,registros:[]});await primeira;
  assert.equal(estados.at(-1).chave,2);assert.equal(estados.at(-1).dados.pagina,2);
});

test('PDF recebe todos os dados da seleção e compartilha cliques durante a geração',async()=>{
  const pendente=promessa(),estados=[];let recebido,chamadas=0;
  const controle=criarExportacaoLicitacoes({gerar:(dados)=>{recebido=dados;chamadas++;return pendente.p;},receber:e=>estados.push(e)});
  const dados={estado:'disponivel',id:'exemplo',oportunidades:Array.from({length:9},(_,id)=>({id})),candidatosRetidos:[{id:'pendente'}]};
  const a=controle.baixar(dados),b=controle.baixar(dados);assert.equal(a,b);assert.equal(chamadas,1);assert.equal(recebido,dados);
  pendente.resolve();await a;assert.deepEqual(estados.at(-1),{carregando:false,erro:null});
});

test('troca de relatório ou sessão aborta entrega de PDF e ignora erro tardio',async()=>{
  const pendente=promessa(),estados=[];let sinal;
  const controle=criarExportacaoLicitacoes({gerar:(_dados,{signal})=>{sinal=signal;return pendente.p;},receber:e=>estados.push(e)});
  const operacao=controle.baixar({estado:'disponivel'});controle.cancelar();const total=estados.length;
  pendente.reject(new Error('erro tardio'));await operacao;assert.equal(sinal.aborted,true);assert.equal(estados.length,total);
});

test('falha PDF pode ser exibida e nova tentativa é possível',async()=>{
  const estados=[];let chamadas=0;
  const controle=criarExportacaoLicitacoes({gerar:async()=>{if(!chamadas++)throw new Error('Falha fictícia');},receber:e=>estados.push(e)});
  await controle.baixar({estado:'disponivel'});assert.equal(estados.at(-1).erro,'Falha fictícia');
  await controle.baixar({estado:'disponivel'});assert.equal(chamadas,2);assert.equal(estados.at(-1).erro,null);
});
