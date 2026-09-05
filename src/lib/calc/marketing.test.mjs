import test from 'node:test';import assert from 'node:assert/strict';import {resolverOrcamentosMarketing as resolver} from './marketing.js';
test('atribuição usa IDs estáveis, deduplica e não confunde número com id',()=>{assert.deepEqual(resolver('10, 10',[{id:'abc',numero:10}]),['abc']);});
test('orçamento ausente ou número ambíguo impede atribuição inventada',()=>{assert.throws(()=>resolver('10',[]));assert.throws(()=>resolver('10',[{id:'a',numero:10},{id:'b',numero:10}]));});
test('edição preserva vínculo existente fora da base, mas não aceita id desconhecido',()=>{assert.deepEqual(resolver('id:abc',[],['abc']),['abc']);assert.throws(()=>resolver('id:xyz',[],['abc']));});
