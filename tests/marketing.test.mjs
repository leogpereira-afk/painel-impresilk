// Regras de campo do Centro de Comando do Marketing (_shared/marketing.mjs).
// Começa pelo caso ruim: o que deixaria uma venda contada duas vezes ou um
// dado errado passar calado.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararAcao,acaoParaTela,erroDoBanco,idAcao,ehDirecaoMarketing,podeMarketing,ErroMarketing,SITUACOES_ACAO} from '../supabase/functions/_shared/marketing.mjs';

const base={nome:'Reel da fachada',responsavel:'Ana',prazo:'2026-10-20',status:'Produção',investimento:150.555,orcamentos:['123','123',' 456 ',''],canal:'Instagram',url:'https://instagram.com/p/x'};

test('o caso ruim: orçamento repetido na mesma ação vira um só, e a ordem não importa', ()=>{
 assert.deepEqual(prepararAcao(base).orcamentos,['123','456']);
 assert.deepEqual(prepararAcao({...base,orcamentos:['456','123']}).orcamentos,['123','456']);
});

test('o caso ruim: orçamento com formato estranho é recusado, não gravado', ()=>{
 assert.throws(()=>prepararAcao({...base,orcamentos:['12; drop']}),ErroMarketing);
 assert.throws(()=>prepararAcao({...base,orcamentos:'123'}),ErroMarketing);
 assert.throws(()=>prepararAcao({...base,orcamentos:Array.from({length:301},(_,i)=>String(i))}),ErroMarketing);
});

test('campos obrigatórios, prazo real e situação da lista', ()=>{
 assert.throws(()=>prepararAcao({...base,nome:'   '}),/nome da ação/);
 assert.throws(()=>prepararAcao({...base,responsavel:''}),/responsável/);
 assert.throws(()=>prepararAcao({...base,prazo:'2026-02-30'}),/prazo/);
 assert.throws(()=>prepararAcao({...base,prazo:'20/10/2026'}),/prazo/);
 assert.throws(()=>prepararAcao({...base,status:'Feito'}),/Situação/);
 assert.equal(prepararAcao({...base,status:''}).dados.situacao,'Ideia');
 assert.deepEqual(SITUACOES_ACAO,['Ideia','Produção','Aprovação','Programada','Publicada','Encerrada']);
});

test('dinheiro: negativo recusado, centavos arredondados, vazio é zero', ()=>{
 assert.throws(()=>prepararAcao({...base,investimento:-1}),/negativo/);
 assert.throws(()=>prepararAcao({...base,investimento:'abc'}),/negativo/);
 assert.equal(prepararAcao(base).dados.investimento,150.56);
 assert.equal(prepararAcao({...base,investimento:''}).dados.investimento,0);
});

test('link só http(s), e espaços sobrando somem', ()=>{
 assert.throws(()=>prepararAcao({...base,url:'javascript:alert(1)'}),/http/);
 assert.equal(prepararAcao({...base,url:''}).dados.url,null);
 assert.equal(prepararAcao({...base,nome:'  Reel   da  fachada '}).dados.nome,'Reel da fachada');
});

test('a tela recebe os nomes de campo de antes', ()=>{
 const t=acaoParaTela({id:'a',nome:'X',canal_texto:'Instagram',responsavel_texto:'Ana',prazo:'2026-10-20',situacao:'Ideia',investimento:'10.50',versao:3,legado_id:'mkt-1'},['9','1']);
 assert.equal(t.canal,'Instagram');assert.equal(t.responsavel,'Ana');assert.equal(t.status,'Ideia');
 assert.equal(t.investimento,10.5);assert.deepEqual(t.orcamentos,['1','9']);assert.equal(t.migrada,true);assert.equal(t.versao,3);
});

test('erro do banco vira mensagem para gente, com o nome da outra ação', ()=>{
 const e=erroDoBanco({code:'23505',details:JSON.stringify({orcamento:'123',acao:'Outdoor Fenics'})});
 assert.equal(e.status,409);assert.match(e.message,/123.*Outdoor Fenics/);
 assert.equal(erroDoBanco({code:'23505',details:null}).status,409);
 assert.equal(erroDoBanco({code:'40001'}).status,409);
 assert.equal(erroDoBanco({code:'P0002'}).status,404);
 assert.equal(erroDoBanco({code:'XX000'}),null);
});

test('id de ação só UUID; direção é master ou "*"', ()=>{
 assert.equal(idAcao('7B0F6A52-1C2D-4E5F-8A9B-0C1D2E3F4A5B'),'7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
 assert.throws(()=>idAcao('mkt-1'),ErroMarketing);
 assert.equal(ehDirecaoMarketing({master:true}),true);assert.equal(ehDirecaoMarketing({perms:['*']}),true);
 assert.equal(ehDirecaoMarketing({perms:['marketing']}),false);assert.equal(podeMarketing({perms:['marketing']}),true);
 assert.equal(podeMarketing({perms:['orcamentos']}),false);assert.equal(podeMarketing(null),false);
});
