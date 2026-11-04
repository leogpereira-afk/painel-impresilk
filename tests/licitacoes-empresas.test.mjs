import test from 'node:test';
import assert from 'node:assert/strict';
import {construirCarteiraEmpresas,filtrarCarteiraEmpresas,metricasCarteiraEmpresas} from '../src/lib/licitacoes-empresas.mjs';

const hoje='2026-11-04';
const empresa={id:'empresa-ficticia',tipo:'empresa',nome:'Empresa fictícia',municipios:['Montes Claros'],situacao:'ativo',cadastroExigido:'sim',cadastroIds:[],prioridade:'media',responsavel:'Pessoa fictícia',proximaAcao:'Conferir cadastro',prazoAcao:'2026-12-10',atualizadoEm:'2026-11-03T15:00:00Z',historico:[{id:'evento-ficticio',acao:'criar'}]};
const cadastro={id:'cadastro-ficticio',nome:'Portal fictício',situacao:'ativo',validade:'2027-05-01',prazoAcao:''};
const montar=(entidades,cadastros=[])=>construirCarteiraEmpresas({entidades,cadastros,hoje});
const vinculada=(patch={})=>({...empresa,cadastroIds:[cadastro.id],...patch});

test('carteira vazia não infere empresas, cadastros nem oportunidades',()=>{
  assert.deepEqual(montar([]),[]);
  assert.deepEqual(metricasCarteiraEmpresas([]),{total:0,acadastrar:0,preparacao:0,ativas:0,pendencias:0,arquivadas:0,comPendencias:0,cadastrosAtivos:0,acoesVencidas:0});
});
test('considera somente empresas por ID e preserva ficha original, versão e histórico',()=>{
  const e=vinculada(),original=structuredClone(e),c=structuredClone(cadastro);
  const carteira=montar([e,e,{...empresa,id:'orgao-ficticio',tipo:'orgao'},{...empresa,id:''}],[c,c]);
  assert.equal(carteira.length,1);assert.equal(carteira[0].entidade,e);assert.equal(carteira[0].cadastrosVinculados.length,1);
  assert.deepEqual(e,original);assert.deepEqual(c,cadastro);assert.equal(carteira[0].entidade.atualizadoEm,original.atualizadoEm);assert.deepEqual(carteira[0].entidade.historico,original.historico);
  assert.equal('oportunidades' in carteira[0],false);
});
test('nomes e cidades iguais não vinculam cadastro; vínculo deve ser explícito',()=>{
  const [sem,com]=montar([empresa,vinculada({id:'outra-empresa',nome:empresa.nome})],[{...cadastro,nome:empresa.nome,abrangencia:'Montes Claros'}]);
  assert.equal(sem.grupo,'a-cadastrar');assert.equal(sem.cadastrosVinculados.length,0);assert.equal(com.grupo,'ativas');assert.equal(com.cadastrosAtivos.length,1);
});
test('cadastro planejado ou em preparação não vira ativo por preencher contato e próxima ação',()=>{
  for(const situacao of ['planejado','preparacao','enviado','em-analise']){
    const [i]=montar([vinculada({contato:'Contato fictício'})],[{...cadastro,situacao}]);
    assert.equal(i.grupo,situacao==='planejado'?'a-cadastrar':'preparacao');assert.equal(i.cadastrosAtivos.length,0);
  }
  const [vazia]=montar([{...empresa,cadastroExigido:'nao',responsavel:'',proximaAcao:'',prazoAcao:'',contato:''}]);
  assert.equal(vazia.grupo,'preparacao');assert.equal(vazia.etapa.rotulo,'Relacionamento comercial');assert.equal(vazia.cadastrosAtivos.length,0);assert.equal(metricasCarteiraEmpresas([vazia]).ativas,0);
});
test('cadastro ativo exige validade válida ou sem vencimento explicitamente confirmado',()=>{
  for(const patch of [{validade:''},{validade:'2026-02-30'},{validade:'2026-11-03'},{validade:'',semVencimento:'true'},{validade:'2026-11-03',semVencimento:true}]){
    const [i]=montar([vinculada()],[{...cadastro,...patch}]);assert.equal(i.grupo,'pendencias');assert.equal(i.cadastrosAtivos.length,0);
  }
  const [semVencimento]=montar([vinculada()],[{...cadastro,validade:'',semVencimento:true}]);assert.equal(semVencimento.grupo,'ativas');assert.equal(semVencimento.cadastrosAtivos.length,1);
  const [incerta]=construirCarteiraEmpresas({entidades:[vinculada()],cadastros:[cadastro],hoje:'inválido'});assert.equal(incerta.cadastrosAtivos.length,0);
});
test('validade próxima continua registrada como ativa, com renovação na fila de pendências',()=>{
  for(const validade of [hoje,'2026-12-04']){
    const [i]=montar([vinculada()],[{...cadastro,validade}]);assert.equal(i.grupo,'pendencias');assert.equal(i.etapa.grupo,'ativas');assert.equal(i.cadastrosAtivos.length,1);assert.match(i.pendencias.join(' '),/Vence hoje|Renovar em breve/);
  }
  assert.equal(montar([vinculada()],[{...cadastro,validade:'2026-12-05'}])[0].grupo,'ativas');
});
test('retorno vencido e cadastro ativo são informações independentes',()=>{
  const [i]=montar([vinculada({prazoAcao:'2026-11-03'})],[cadastro]);
  assert.equal(i.grupo,'pendencias');assert.equal(i.etapa.grupo,'ativas');assert.equal(i.acaoVencida,true);assert.equal(i.cadastrosAtivos.length,1);
  const m=metricasCarteiraEmpresas([i]);assert.equal(m.ativas,0);assert.equal(m.cadastrosAtivos,1);assert.equal(m.acoesVencidas,1);
  const [prazoCadastro]=montar([vinculada()],[{...cadastro,prazoAcao:'2026-11-01'}]);assert.equal(prazoCadastro.acaoVencida,true);assert.equal(prazoCadastro.grupo,'pendencias');assert.equal(prazoCadastro.cadastrosAtivos.length,1);
});
test('ação hoje, exigências, indeferimento e cadastro inativo ou arquivado não indicam prontidão',()=>{
  const [hojeItem]=montar([{...empresa,prazoAcao:hoje}]);assert.equal(hojeItem.grupo,'pendencias');assert.equal(hojeItem.acaoVencida,false);
  for(const situacao of ['exigencia','indeferido','inativo','arquivado','desconhecida']){
    const [i]=montar([vinculada()],[{...cadastro,situacao}]);assert.equal(i.grupo,'pendencias');assert.equal(i.cadastrosAtivos.length,0);assert.ok(i.pendencias.length>0);
  }
});
test('cadastros restritos ou inexistentes permanecem pendência, sem alegar ausência de vínculo',()=>{
  for(const e of [vinculada(),{...empresa,cadastrosRestritos:true}]){
    const [i]=montar([e]);assert.equal(i.grupo,'pendencias');assert.equal(i.cadastrosIndisponiveis,true);assert.equal(i.cadastrosAtivos.length,0);assert.match(i.pendencias.join(' '),/indisponível/);assert.doesNotMatch(i.pendencias.join(' '),/Vincular cadastro/);
  }
});
test('um cadastro válido não oculta outro vencido; compartilhados são contados uma só vez',()=>{
  const vencido={...cadastro,id:'vencido',validade:'2026-10-01'};
  const carteira=montar([vinculada({cadastroIds:[cadastro.id,cadastro.id,vencido.id]}),vinculada({id:'segunda'})],[cadastro,cadastro,vencido]);
  assert.equal(carteira[0].cadastrosVinculados.length,2);assert.equal(carteira[0].grupo,'pendencias');assert.equal(carteira[0].etapa.grupo,'ativas');
  const m=metricasCarteiraEmpresas(carteira);assert.equal(m.total,2);assert.equal(m.cadastrosAtivos,1);assert.equal(m.ativas,1);assert.equal(m.pendencias,1);
});
test('arquivadas ficam preservadas e fora da fila, métricas operacionais e cadastros ativos',()=>{
  const [i]=montar([vinculada({situacao:'arquivado',prazoAcao:'2026-01-01'})],[cadastro]);
  assert.equal(i.grupo,'arquivadas');assert.deepEqual(i.pendencias,[]);assert.equal(i.acaoVencida,false);assert.equal(filtrarCarteiraEmpresas([i]).length,0);assert.equal(filtrarCarteiraEmpresas([i],{grupo:'arquivadas'}).length,1);
  const m=metricasCarteiraEmpresas([i]);assert.equal(m.arquivadas,1);assert.equal(m.total,0);assert.equal(m.cadastrosAtivos,0);assert.equal(m.comPendencias,0);
});
test('busca encontra empresa, cidade, contato e nome do cadastro sem mudar sua identidade',()=>{
  const [i]=montar([vinculada({nome:'Árvore fictícia',municipios:['São João da Ponte'],contato:'João fictício',prioridade:'alta'})],[cadastro]);
  for(const busca of ['arvore','sao joao','JOAO','portal'])assert.equal(filtrarCarteiraEmpresas([i],{busca}).length,1,busca);
  assert.equal(filtrarCarteiraEmpresas([i],{municipio:'sao joao da ponte',prioridade:'alta',responsavel:'Pessoa fictícia'}).length,1);
  assert.equal(filtrarCarteiraEmpresas([i],{municipio:'São João'}).length,0);assert.equal(filtrarCarteiraEmpresas([i],{grupo:'a-cadastrar'}).length,0);
});
test('busca também encontra serviços e exigências somente nos cadastros explicitamente vinculados',()=>{
  const vinculo={...cadastro,servicos:'Impressão e comunicação visual',exigencias:'Apresentar certidão técnica atualizada'};
  const carteira=montar([vinculada(),{...empresa,id:'sem-vinculo'}],[vinculo,{...cadastro,id:'outro',servicos:'Uniformes exclusivos'}]),antes=structuredClone(carteira);
  for(const busca of ['impressao','COMUNICACAO VISUAL','certidao tecnica'])assert.deepEqual(filtrarCarteiraEmpresas(carteira,{busca}).map(i=>i.id),[empresa.id]);
  assert.deepEqual(filtrarCarteiraEmpresas(carteira,{busca:'uniformes'}),[]);assert.deepEqual(carteira,antes);
});
test('grupos particionam empresas abertas e comPendencias mantém necessidades de acompanhamento',()=>{
  const carteira=montar([empresa,vinculada({id:'preparo',cadastroIds:['preparar']}),vinculada({id:'ativa',responsavel:''}),vinculada({id:'pendente',prazoAcao:'2026-11-01'}),{...empresa,id:'arquivo',situacao:'arquivado'}],[cadastro,{...cadastro,id:'preparar',situacao:'preparacao'}]);
  const m=metricasCarteiraEmpresas(carteira);assert.equal(m.total,4);assert.equal(m.acadastrar,1);assert.equal(m.preparacao,1);assert.equal(m.ativas,1);assert.equal(m.pendencias,1);assert.equal(m.arquivadas,1);assert.equal(m.comPendencias,4);
  assert.equal(m.total,m.acadastrar+m.preparacao+m.ativas+m.pendencias);assert.equal(filtrarCarteiraEmpresas(carteira,{grupo:'com-pendencias'}).length,m.comPendencias);
});
test('prioriza ação vencida, bloqueio real, prioridade, prazo e nome sem alterar a lista',()=>{
  const carteira=montar([
    {...empresa,id:'planejada',nome:'A planejada',prioridade:'alta'},
    vinculada({id:'bloqueio',nome:'B pendente',cadastroIds:['exigencia'],prioridade:'baixa'}),
    {...empresa,id:'atrasada',nome:'C atrasada',prazoAcao:'2026-11-01',prioridade:'baixa'},
    {...empresa,id:'media',nome:'D média',prioridade:'media'},
  ],[{...cadastro,id:'exigencia',situacao:'exigencia'}]);
  const antes=structuredClone(carteira);assert.deepEqual(filtrarCarteiraEmpresas(carteira).map(i=>i.id),['atrasada','bloqueio','planejada','media']);assert.deepEqual(carteira,antes);
});
