import test from 'node:test';
import assert from 'node:assert/strict';
import {ordensParaTabela, completaConfirmada} from '../scripts/lib/atualizacao-ordens.mjs';
test('incremental não devolve à tabela o valor velho de uma O.S. fora da janela',()=>{
 const antiga={id:'antiga',valor:900,valorBruto:900};
 const recente={id:'recente',valor:200,valorBruto:200};
 const p={ordens:[antiga,recente],ordensAtualizadas:[recente],orcamentos:[{}]};
 assert.deepEqual(ordensParaTabela(p,'incremental'),[recente]);
 assert.deepEqual(ordensParaTabela(p,'completo'),[antiga,recente]);
 assert.deepEqual(ordensParaTabela({ordens:[antiga]},'incremental'),[]);
});
test('fonte ausente ou destino recusado não renova o carimbo da completa',()=>{
 const p={ordens:[{}],orcamentos:[{}]};
 assert.equal(completaConfirmada('completo',p),true);
 for(const dados of [{...p,ordens:null},{...p,ordens:[]},{...p,orcamentos:null}]) assert.equal(completaConfirmada('completo',dados),false);
 for(const erro of ['painel_ordens','vazio-recusado:ordens','vazio-recusado:orcamentos']) assert.equal(completaConfirmada('completo',p,[erro]),false);
 assert.equal(completaConfirmada('incremental',p),false);
 assert.equal(completaConfirmada('completo',{...p,falhas:['catalogo-indisponivel']}),true);
});
