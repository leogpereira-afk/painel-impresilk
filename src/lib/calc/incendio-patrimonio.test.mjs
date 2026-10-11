import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vencimentosIncendio,dataIncendioValida,situacaoValidadeIncendio} from './incendio-patrimonio.js';
test('datas de prevenção são reais; vazio é pendência',()=>{
 assert.equal(dataIncendioValida('2026-02-29'),false);assert.equal(dataIncendioValida('2028-02-29'),true);assert.equal(dataIncendioValida('0000-01-01'),false);
 assert.deepEqual(situacaoValidadeIncendio({validade:''},'2026-10-11'),{codigo:'pendente',texto:'Validade pendente'});
 assert.equal(situacaoValidadeIncendio({validade:'2026-10-10'},'2026-10-11').codigo,'vencido');
 assert.equal(situacaoValidadeIncendio({validade:'2026-10-11'},'2026-10-11').texto,'Vence hoje');
});
test('calendário usa ID e prazo cadastrado, exclui baixados e não expõe ficha',()=>{
 const itens=['Extintor','AVCB','Iluminação de emergência','Sinalização de segurança'].map((categoria,i)=>({id:`id-${i}`,tipo:'predial',categoria,nome:'Exemplo',validade:'2026-10-25',valor:98765,nf:'NF-SECRETA',arquivoIncendio:{caminho:'privado'},especificacao:{numero:'01'}}));
 const eventos=vencimentosIncendio([...itens,{...itens[0],id:'baixado',especificacao:{situacao:'baixado'}},{...itens[0],id:'outro-mes',validade:'2026-11-01'},{...itens[0],id:'erro-data',validade:'2026-10-32'}],'2026-10');
 assert.equal(eventos.length,4);assert.deepEqual(eventos.map(e=>e.ativoId),itens.map(i=>i.id));assert.match(eventos[2].titulo,/^Inspeção/);
 assert.doesNotMatch(JSON.stringify(eventos),/98765|NF-SECRETA|privado|baixado|outro-mes|erro-data/);
 const renovado=vencimentosIncendio([{...itens[0],validade:'2026-11-02'}],'2026-10');assert.deepEqual(renovado,[]);
});

test('luzes e placas mostram conferência, sem supor validade',()=>{
 for(const categoria of ['Iluminação de emergência','Sinalização de segurança']){
  assert.equal(situacaoValidadeIncendio({categoria},'2026-10-11').texto,'Conferência pendente');
  assert.equal(situacaoValidadeIncendio({categoria,validade:'2026-10-13'},'2026-10-11').texto,'Conferir em 2 dias');
  assert.equal(situacaoValidadeIncendio({categoria,validade:'2026-10-11'},'2026-10-11').texto,'Conferir hoje');
  assert.equal(situacaoValidadeIncendio({categoria,validade:'2026-10-10'},'2026-10-11').texto,'Conferência atrasada há 1 dias');
 }
});
