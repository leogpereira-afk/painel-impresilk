import test from 'node:test';
import assert from 'node:assert/strict';
import {diaBrasilia,diasCadastro,situacaoCadastro,filtrarCadastros,urlPortalSegura,conciliarCadastro} from '../src/lib/licitacoes-cadastros.mjs';

test('cadastros respeitam a virada do dia em Brasília e datas impossíveis',()=>{
 assert.equal(diaBrasilia(new Date('2026-11-04T01:30:00Z')),'2026-11-03');
 assert.equal(diaBrasilia(new Date('2026-11-04T03:00:00Z')),'2026-11-04');
 assert.equal(diasCadastro('2026-11-03','2026-11-04'),1);
 assert.equal(diasCadastro('2026-02-30','2026-03-01'),null);
});
test('aprovado não confunde validade pendente ou vencida com cadastro apto',()=>{
 const ativo={situacao:'ativo'};
 assert.equal(situacaoCadastro(ativo,'2026-11-03').grupo,'pendente');
 assert.equal(situacaoCadastro({...ativo,validade:'2026-11-02'},'2026-11-03').rotulo,'Cadastro vencido');
 assert.equal(situacaoCadastro({...ativo,validade:'2026-11-03'},'2026-11-03').rotulo,'Vence hoje');
 assert.equal(situacaoCadastro({...ativo,validade:'2027-01-01'},'2026-11-03').grupo,'ativo');
 assert.equal(situacaoCadastro({...ativo,semVencimento:true},'2026-11-03').grupo,'ativo');
 assert.equal(situacaoCadastro({situacao:'em-analise',validade:'2027-01-01'},'2026-11-03').grupo,'analise');
});
test('recortes preservam empresa, buscas sem acentos e itens arquivados',()=>{
 const itens=[{nome:'Certificação estadual',titularId:'a',situacao:'em-analise'}, {nome:'Portal B',titularId:'b',situacao:'exigencia'},{nome:'Antigo',titularId:'a',situacao:'arquivado'}];
 assert.deepEqual(filtrarCadastros(itens,{titularId:'a',busca:'certificacao'}).map(i=>i.nome),['Certificação estadual']);
 assert.equal(filtrarCadastros(itens,{grupo:'arquivo'}).length,1);
 assert.equal(filtrarCadastros(itens).length,2);
 assert.equal(filtrarCadastros(itens)[0].nome,'Portal B');
});
test('links de portal não aceitam scripts ou credenciais embutidas',()=>{
 assert.equal(urlPortalSegura('javascript:alert(1)'),'');
 assert.equal(urlPortalSegura('https://login:segredo@example.com'),'');
 assert.equal(urlPortalSegura('https://example.com/cadastro'),'https://example.com/cadastro');
});
test('prazos vencidos, ações de hoje e indeferimento pedem ação, sem reabrir arquivo',()=>{
 assert.equal(situacaoCadastro({situacao:'indeferido'},'2026-11-03').grupo,'pendente');
 assert.equal(situacaoCadastro({situacao:'em-analise',prazoAcao:'2026-11-02'},'2026-11-03').rotulo,'Prazo de ação vencido');
 assert.equal(situacaoCadastro({situacao:'planejado',prazoAcao:'2026-11-03'},'2026-11-03').grupo,'pendente');
 assert.equal(situacaoCadastro({situacao:'arquivado',prazoAcao:'2026-11-01'},'2026-11-03').grupo,'arquivo');
});

test('conciliação mantém edição local e atualiza campos intactos sem descartar conflitos',()=>{
 const base={nome:'Original',protocolo:'A',situacao:'em-analise',atualizadoEm:'1'};
 const rascunho={...base,nome:'Meu texto'};
 const atual={...base,nome:'Texto de outra pessoa',protocolo:'B',atualizadoEm:'2'};
 const r=conciliarCadastro(base,rascunho,atual,['nome','protocolo','situacao']);
 assert.equal(r.item.nome,'Meu texto');assert.equal(r.item.protocolo,'B');assert.equal(r.item.atualizadoEm,'2');
 assert.deepEqual(r.conflitos,['nome']);assert.deepEqual(r.alterados,['nome','protocolo']);
 assert.equal(base.nome,'Original');
});
