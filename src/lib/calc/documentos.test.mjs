import test from 'node:test';
import assert from 'node:assert/strict';
import {dataValida,situacaoDocumento,calcDocumentos,filtrarDocumentos,nomeTitular,controlesDoBem,situacaoRequisito,controleEditavel,validarControle} from './documentos.js';
const hoje='2026-10-11';
const base={id:'doc-1',tipo:'documento',nome:'Certidão fictícia',categoria:'CND fictícia',titularId:'titular-1',validade:'2026-12-31',estado:'ativo',alertaDias:30};

test('datas inválidas não são corrigidas silenciosamente por Date',()=>{
  assert.equal(dataValida('2026-02-29'),false);
  assert.equal(dataValida('2024-02-29'),true);
  assert.equal(dataValida('2026-04-31'),false);
  assert.equal(dataValida('2026-10-11T00:00:00Z'),false);
  assert.equal(situacaoDocumento({...base,validade:'2026-02-31'},hoje).nivel,'sem');
});
test('prazo ausente difere da declaração explícita de sem vencimento',()=>{
  assert.equal(situacaoDocumento({...base,validade:''},hoje).nivel,'sem');
  assert.equal(situacaoDocumento({...base,validade:'',semVencimento:true},hoje).nivel,'semVencimento');
  assert.match(validarControle({...base,semVencimento:true}),/Escolha uma data/);
});
test('vencimento considera a data civil e alerta individual, inclusive zero',()=>{
  assert.equal(situacaoDocumento({...base,validade:'2026-10-10'},hoje).dias,-1);
  assert.equal(situacaoDocumento({...base,validade:hoje,alertaDias:0},hoje).rotulo,'Vence hoje');
  assert.equal(situacaoDocumento({...base,validade:'2026-10-12',alertaDias:0},hoje).nivel,'ok');
  assert.equal(situacaoDocumento({...base,validade:'2026-12-01',alertaDias:60},hoje).nivel,'urgente');
});
test('cancelado/encerrado não voltam aos alertas; seguro futuro não está vigente',()=>{
  const vm=calcDocumentos([
    {...base,id:'cancelado',estado:'cancelado',validade:'2026-01-01'},
    {...base,id:'futuro',tipo:'seguro',emissao:'2026-10-20',validade:'2027-10-20'},
    {...base,id:'vence',validade:hoje},
  ],hoje);
  assert.deepEqual(vm.criticos.map(i=>i.id),['vence']);
  assert.equal(vm.lista.find(i=>i.id==='futuro').sit.nivel,'futuro');
  assert.equal(vm.lista.find(i=>i.id==='cancelado').sit.nivel,'encerrado');
});
test('seguro sem início é pendência; seguro expirado conserva o alerta mesmo sem início',()=>{
  assert.equal(situacaoDocumento({...base,tipo:'seguro'},hoje).nivel,'sem');
  assert.equal(situacaoDocumento({...base,tipo:'seguro',validade:'2026-10-01'},hoje).nivel,'vencido');
});
test('bens físicos e seus medidores não são contados como controles documentais',()=>{
  const vm=calcDocumentos([base,{id:'carro',tipo:'veiculo',validade:hoje},{id:'maquina',tipo:'maquina',medidorAtual:500,medidorProximo:400}],hoje);
  assert.equal(vm.kpis.total,1);assert.equal(vm.criticos.length,0);
});
test('vínculos com bens e requisitos dependem exclusivamente do ID e titular',()=>{
  const lista=calcDocumentos([{...base,ativoIds:['bem-a','bem-b']},{...base,id:'homonimo',nome:'Certidão fictícia',categoria:'CND fictícia',titularId:'titular-2'}],hoje).lista;
  assert.equal(controlesDoBem(lista,'bem-a')[0].id,'doc-1');
  assert.equal(controlesDoBem(lista,'bem-c').length,0);
  assert.equal(situacaoRequisito({titularId:'titular-1',categoria:'Certidão fictícia',estado:'aplicavel'},lista).nivel,'faltante');
  assert.equal(situacaoRequisito({titularId:'titular-1',documentoId:'homonimo',estado:'aplicavel'},lista).nivel,'faltante');
  assert.equal(situacaoRequisito({titularId:'titular-1',documentoId:'doc-1',estado:'aplicavel'},lista).item.id,'doc-1');
  assert.equal(situacaoRequisito({estado:'nao-se-aplica'},lista).nivel,'nao-se-aplica');
});
test('nomes iguais no RH e titulares não unem pessoas nem filtros',()=>{
  const pessoas=[{id:'pessoa-a',nome:'Pessoa fictícia'},{id:'pessoa-b',nome:'Pessoa fictícia'}];
  const titulares=[{id:'titular-1',tipo:'pessoa',nome:'Pessoa fictícia',pessoaId:'pessoa-a'},{id:'titular-2',tipo:'pessoa',nome:'Pessoa fictícia',pessoaId:'pessoa-b'}];
  const lista=calcDocumentos([base,{...base,id:'outro',titularId:'titular-2'}],hoje).lista;
  assert.equal(nomeTitular(titulares[0],pessoas),'Pessoa fictícia');
  assert.deepEqual(filtrarDocumentos(lista,{rh:'pessoa-a'},titulares,pessoas).map(i=>i.id),['doc-1']);
  assert.deepEqual(filtrarDocumentos(lista,{titularId:'titular-2'},titulares,pessoas).map(i=>i.id),['outro']);
});
test('filtro RH também encontra responsáveis internos de titulares empresa por ID',()=>{
  const titulares=[{id:'titular-1',tipo:'empresa',nome:'Empresa fictícia'}];
  const lista=calcDocumentos([{...base,responsavelId:'rh-1'},{...base,id:'sem-responsavel'}],hoje).lista;
  assert.deepEqual(filtrarDocumentos(lista,{rh:'rh-1'},titulares).map(i=>i.id),['doc-1']);
  assert.deepEqual(filtrarDocumentos(lista,{rh:'__sem__'},titulares).map(i=>i.id),['sem-responsavel']);
});
test('payload de edição/renovação usa apenas id e não devolve arquivos, versões ou patrimônio',()=>{
  const item={...base,cadastroId:'uuid-novo',versoes:[{id:'v1'}],anexos:[{id:'a1'}],arquivoNome:'interno.pdf',arquivo:{chave:'bucket-secret'},especificacao:{placa:'ficticia'},nf:'nf',valor:1500,contato:{nome:'Contato',chave:'interna'}};
  const payload=controleEditavel(item);
  assert.equal(payload.id,'doc-1');
  for(const chave of ['cadastroId','versoes','anexos','arquivoNome','arquivo','especificacao','nf','valor']) assert.equal(Object.hasOwn(payload,chave),false,chave);
  assert.deepEqual(payload.contato,{nome:'Contato'});
  const novo=controleEditavel({cadastroId:'uuid-novo',id:'',tipo:'documento',nome:'Novo'});
  assert.equal(novo.cadastroId,'uuid-novo');assert.equal(Object.hasOwn(novo,'id'),false);
});
test('renovação exige arquivo, datas coerentes e titular confirmado',()=>{
  assert.match(validarControle(base,true,false),/Anexe/);
  assert.equal(validarControle(base,true,true),'');
  assert.match(validarControle({...base,titularId:''}),/titular/);
  assert.match(validarControle({...base,emissao:'2027-01-01'}),/posterior/);
  assert.match(validarControle({...base,linkOficial:'javascript:alert(1)'}),/https/);
  assert.match(validarControle({...base,acionamentos:[{data:'2026-02-31',problema:'Falha fictícia'}]}),/acionamento/);
});
