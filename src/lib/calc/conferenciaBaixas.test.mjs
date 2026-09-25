import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararConferencia, baixaConferida, chaveBaixa } from './conferenciaBaixas.js';
const l={numero:'22927',cliente:'Cliente de teste',valor:351,recebido:350.5,diferenca:.5};
test('conferência exige motivo e evidência e não altera valores',()=>{const antes=structuredClone(l);assert.throws(()=>prepararConferencia(l,'','nota'));assert.throws(()=>prepararConferencia(l,'Desconto confirmado',' '));const r=prepararConferencia(l,'Desconto confirmado','Conferido no comprovante');assert.equal(baixaConferida(l,r),true);assert.deepEqual(l,antes);assert.equal(chaveBaixa(l),'conferencia-baixa:22927');});
test('mudança de valor ou cliente reabre a pendência e reabertura explícita funciona',()=>{const r=prepararConferencia(l,'Arredondamento confirmado','Conferido');for(const campo of ['valor','recebido','diferenca'])assert.equal(baixaConferida({...l,[campo]:l[campo]+1},r),false);assert.equal(baixaConferida({...l,cliente:'Outro'},r),false);assert.equal(baixaConferida(l,{conferenciaBaixa:{status:'pendente'}}),false);assert.equal(baixaConferida(l,JSON.parse(JSON.stringify(r))),true);});
