import test from 'node:test';
import assert from 'node:assert/strict';
import {criarLeituraLicitacoes} from '../src/lib/licitacoes-leitura.mjs';
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
