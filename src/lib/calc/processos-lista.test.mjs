import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrarProcessos,selecionarProcessos,sinalProcesso} from './processos-lista.js';
const hoje='2026-10-26';
const base={id:'a',titulo:'Revisão de processos',empresa:'Exemplo',setor:'producao',prioridade:'normal',situacao:'execucao',responsavelRhId:'p1',envolvidos:[{rhId:'p1',nome:'Pessoa exemplo'}],etapas:[],registros:[],anexos:[]};
test('fila cruza busca sem acento, responsável, setor e prioridade sem ampliar a lista',()=>{
 assert.equal(filtrarProcessos([base],{busca:'revisao',setor:'producao',responsavel:'p1',prioridade:'normal'}).length,1);
 assert.equal(filtrarProcessos([base],{responsavel:'p2'}).length,0);
});
test('etapa pronta para validação não é atraso de execução',()=>{
 const item={...base,etapas:[{id:'e',situacao:'validacao',prazo:'2026-10-01'}]};
 assert.equal(sinalProcesso(item,hoje).atrasado,false);
 assert.equal(selecionarProcessos([item],'validacao',hoje).length,1);
 assert.equal(selecionarProcessos([item],'atrasados',hoje).length,0);
});
test('obrigação da etapa ordena processo sem prazo geral antes de futuro',()=>{
 const vencido={...base,id:'v',etapas:[{id:'e',situacao:'pendente',prazo:'2026-10-01'}]};
 assert.deepEqual(selecionarProcessos([{...base,prazo:'2026-10-30'},vencido],'abertos',hoje).map(x=>x.id),['v','a']);
 assert.equal(sinalProcesso(vencido,hoje).proximoPrazo,'2026-10-01');
});
test('encerrados não aparecem nas filas operacionais',()=>{
 for(const situacao of ['concluida','cancelada'])for(const filtro of ['abertos','atrasados','bloqueados','validacao'])
 assert.equal(selecionarProcessos([{...base,situacao,prazo:'2020-01-01',etapas:[{situacao:'bloqueada',prazo:'2020-01-01'}]}],filtro,hoje).length,0);
});
