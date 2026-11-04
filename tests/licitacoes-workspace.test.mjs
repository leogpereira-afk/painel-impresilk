import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visaoLicitacoes,filtrarAcompanhamento,pendenteAcompanhamento,erroPreparacao,revisarRascunhoLicitacao} from '../src/lib/licitacoes-workspace.mjs';
const item={id:'demo-a',nome:'Sinalização das escolas',identificacao:'Órgão Exemplo',edital:'DEMO-A',responsavel:'Equipe Exemplo',dataAcompanhamento:'2026-11-06',dias:3,status:'avaliar',acompanhamento:{proximaAcao:'Conferir medidas'}};
test('links de relatório e item abrem pesquisa; uma aba explícita permite navegar sem perder versão',()=>{
  assert.equal(visaoLicitacoes(new URLSearchParams()),'acompanhamento');
  assert.equal(visaoLicitacoes(new URLSearchParams('aba=documentos')),'documentos');
  assert.equal(visaoLicitacoes(new URLSearchParams('visao=empresas&empresa=demo&item=demo')),'empresas');
  assert.equal(visaoLicitacoes(new URLSearchParams('aba=cadastros&visao=pesquisa')),'pesquisa');
  for(const query of ['relatorio=demo','item=demo','visao=invalida&item=demo'])assert.equal(visaoLicitacoes(new URLSearchParams(query)),'pesquisa');
  assert.equal(visaoLicitacoes(new URLSearchParams('visao=resultados&relatorio=demo&item=demo')),'resultados');
});
test('ação vencida precisa de atenção mesmo quando sessão futura e checklist completo',()=>{
 const futuro={...item,dias:17,dataAcompanhamento:'2026-11-20',acompanhamento:{prazoAcao:'2026-11-02',checklist:[{feito:true}]}};
 assert.equal(pendenteAcompanhamento(futuro,'2026-11-03'),true);
 assert.equal(filtrarAcompanhamento([futuro],{filtro:'pendentes',hoje:'2026-11-03'}).length,1);
 assert.equal(pendenteAcompanhamento(futuro,'2026-11-02'),false);
});
test('validação local informa limites e não modifica o rascunho',()=>{
 const rascunho={decisao:'D'.repeat(2100),proximaAcao:'A'.repeat(550),checklist:[{texto:'T'.repeat(320)}]},copia=structuredClone(rascunho);
 assert.match(erroPreparacao(rascunho),/Próxima ação/);assert.deepEqual(rascunho,copia);
 assert.equal(erroPreparacao({decisao:'D'.repeat(2000),checklist:[{texto:'T'.repeat(300)}]}),'');
});
test('revisão incorpora alterações remotas em campos não editados e conserva edições locais independentes',()=>{
 const base={nome:'Edital',responsavel:'Equipe A',acompanhamento:{decisao:'',checklist:[{id:'a',texto:'Conferir',feito:false}]}},rascunho=structuredClone(base),atual=structuredClone(base);
 rascunho.responsavel='Equipe B';atual.acompanhamento.decisao='Conferido por outra pessoa';atual.acompanhamento.checklist[0].feito=true;
 const revisao=revisarRascunhoLicitacao({base,rascunho,atual});
 assert.equal(revisao.pendentes,0);assert.equal(revisao.form.responsavel,'Equipe B');assert.equal(revisao.form.acompanhamento.decisao,atual.acompanhamento.decisao);assert.equal(revisao.form.acompanhamento.checklist[0].feito,true);
 assert.equal(rascunho.acompanhamento.checklist[0].feito,false);
});
test('alterações concorrentes no mesmo campo/checklist exigem escolha por campo e não são resolvidas implicitamente',()=>{
 const base={nome:'Original',acompanhamento:{checklist:[{id:'a',texto:'Etapa',feito:false}]}},rascunho=structuredClone(base),atual=structuredClone(base);
 rascunho.nome='Título local';atual.nome='Título remoto';rascunho.acompanhamento.checklist[0].texto='Descrição local';atual.acompanhamento.checklist[0].feito=true;
 const aberta=revisarRascunhoLicitacao({base,rascunho,atual});assert.equal(aberta.pendentes,2);
 const revisada=revisarRascunhoLicitacao({base,rascunho,atual,escolhas:{nome:'rascunho','acompanhamento.checklist':'atual'}});
 assert.equal(revisada.pendentes,0);assert.equal(revisada.form.nome,'Título local');assert.deepEqual(revisada.form.acompanhamento.checklist,atual.acompanhamento.checklist);
});
test('busca combinada sem acentos alcança órgão, responsável e próxima ação sem mutação',()=>{
 const original=structuredClone(item);assert.equal(filtrarAcompanhamento([item],{busca:'sinalizacao orgao medidas'}).length,1);
 assert.equal(filtrarAcompanhamento([item],{busca:'equipe inexistente'}).length,0);assert.deepEqual(item,original);
});
test('próximos sete dias excluem prazo ausente, passado e além da semana',()=>{
 const itens=[null,-1,0,7,8].map(dias=>({...item,dias}));
 assert.deepEqual(filtrarAcompanhamento(itens,{filtro:'semana'}).map(i=>i.dias),[0,7]);
});
test('pendências reúnem preparação e prazo sem contagem duplicada',()=>{
 assert.equal(pendenteAcompanhamento(item),false);
 assert.equal(pendenteAcompanhamento({...item,responsavel:' '}),true);
 assert.equal(pendenteAcompanhamento({...item,dataAcompanhamento:''}),true);
 assert.equal(pendenteAcompanhamento({...item,dias:-2}),true);
 assert.equal(pendenteAcompanhamento({...item,acompanhamento:{checklist:[{feito:false}]}}),true);
 assert.equal(pendenteAcompanhamento({...item,acompanhamento:{checklist:[{feito:true}]}}),false);
 assert.equal(filtrarAcompanhamento([{...item,responsavel:'',dias:-2}],{filtro:'pendentes'}).length,1);
 assert.equal(filtrarAcompanhamento([item],{filtro:'participar'}).length,0);
});
