import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MUNICIPIOS,normalizarMunicipio,construirRegioes,pendenciasEntidade,filtrarCidades,formatarDataRegiao} from '../src/lib/licitacoes-regioes.mjs';
const hoje='2026-11-03';
const entidade={id:'entidade-ficticia',nome:'Comprador fictício',situacao:'ativo',tipo:'empresa',municipios:['Montes Claros'],responsavel:'Equipe fictícia',proximaAcao:'Conferir portal',prazoAcao:'2026-11-10',cadastroExigido:'nao',cadastroIds:[]};
const oportunidade={id:'oportunidade-ficticia',municipiosAbrangidos:['Montes Claros'],prazo:'2026-11-10T10:00:00-03:00',classificacao:'REVISÃO HUMANA'};
const cadastro={id:'cadastro-ficticio',nome:'Portal fictício',situacao:'ativo',validade:'2027-05-01',prazoAcao:''};
const cidade=(xs,nome='Montes Claros')=>xs.find(c=>c.nome===nome);

test('89 municípios canônicos, únicos, sem inferir pesquisa ou cadastros',()=>{
  const xs=construirRegioes({hoje});assert.equal(xs.length,89);assert.equal(new Set(xs.map(c=>c.nome)).size,89);
  assert.deepEqual(xs.map(c=>c.nome),MUNICIPIOS);assert.equal(new Set(MUNICIPIOS.map(normalizarMunicipio)).size,89);
  assert.ok(xs.every(c=>c.cobertura===null&&!c.oportunidades.length&&!c.entidades.length));
});
test('acentos e apóstrofos são equivalentes; nomes parciais não vinculam destinos',()=>{
  assert.equal(normalizarMunicipio('Olhos-d’Água'),normalizarMunicipio("olhos d'agua"));
  const xs=construirRegioes({hoje,pesquisa:{oportunidades:[{...oportunidade,municipiosAbrangidos:['montes claros','Montes','Olhos d agua','Belo Horizonte']}]}});
  assert.equal(cidade(xs).oportunidades.length,1);assert.equal(cidade(xs,'Olhos-d’Água').oportunidades.length,1);
  assert.equal(xs.reduce((s,c)=>s+c.oportunidades.length,0),2);
});
test('retidos só aparecem como pendentes territoriais, inclusive quando só há sede',()=>{
  const retido={id:'retido-ficticio',localExecucaoRegistrado:{municipios:['Montes Claros'],apenasSede:true}};
  const xs=construirRegioes({hoje,pesquisa:{candidatosRetidos:[retido,retido,{id:'sem-local',orgao:'Prefeitura de Montes Claros'}]}});
  assert.equal(cidade(xs).oportunidades.length,0);assert.equal(cidade(xs).pendentesTerritoriais.length,1);
  assert.equal(cidade(xs).pendentesTerritoriais[0].localExecucaoRegistrado.apenasSede,true);
});
test('vencidas, NO-GO e prazos inválidos permanecem disponíveis fora das oportunidades no prazo',()=>{
  const casos=[{...oportunidade,id:'passado',prazo:'2026-11-02T23:00:00-03:00'},
    {...oportunidade,id:'no-go',classificacao:'NO-GO'},
    {...oportunidade,id:'ausente',prazo:''},
    {...oportunidade,id:'invalido',prazo:'2026-02-31T10:00:00Z'},
    {...oportunidade,id:'ambigua',prazo:'2026-11-10 10:00'},
    {...oportunidade,id:'fuso',prazo:'2026-11-03T02:00:00Z'},
    {...oportunidade,id:'hoje',prazo:'2026-11-03T23:00:00-03:00'},oportunidade];
  const c=cidade(construirRegioes({hoje,pesquisa:{oportunidades:casos}}));
  assert.deepEqual(c.oportunidades.map(x=>x.id),['hoje','oportunidade-ficticia']);assert.equal(c.encerradas.length,6);
});
test('vínculo territorial e IDs repetidos não duplicam cadastros ou oportunidades',()=>{
  const e={...entidade,municipios:['Montes Claros','montes claros'],cadastroExigido:'sim',cadastroIds:[cadastro.id,cadastro.id]};
  const original=structuredClone(e),xs=construirRegioes({hoje,entidades:[e,e,{...entidade,id:'arquivado',situacao:'arquivado'}],cadastros:[cadastro,cadastro],pesquisa:{oportunidades:[oportunidade,oportunidade]}});
  assert.equal(cidade(xs).entidades.length,1);assert.equal(cidade(xs).oportunidades.length,1);assert.equal(cidade(xs).pendencias.length,0);assert.deepEqual(e,original);
});
test('uma entidade com várias pendências conta uma vez por cidade e mantém os motivos',()=>{
  const e={...entidade,responsavel:'',proximaAcao:'',prazoAcao:'2026-11-02',cadastroExigido:'sim'};
  const c=cidade(construirRegioes({hoje,entidades:[e]}));assert.equal(c.pendencias.length,1);assert.equal(c.pendencias[0].motivos.length,4);assert.equal(c.pendencias[0].entidadeId,e.id);
});
test('cadastros vencidos, a renovar, indisponíveis e arquivados exigem acompanhamento',()=>{
  for(const c of [{...cadastro,validade:'2026-11-01'},{...cadastro,validade:'2026-11-20'},{...cadastro,situacao:'arquivado'},{...cadastro,validade:'',semVencimento:false},{...cadastro,prazoAcao:hoje}]){
    assert.equal(pendenciasEntidade({...entidade,cadastroIds:[c.id,c.id]},[c],hoje).length,1);
  }
  assert.equal(pendenciasEntidade({...entidade,cadastroIds:['ausente']},[],hoje).length,1);
  assert.equal(pendenciasEntidade({...entidade,cadastroExigido:'confirmar'},[],hoje).length,1);
  assert.deepEqual(pendenciasEntidade({...entidade,situacao:'arquivado'},[],hoje),[]);
});
test('vínculos restritos não são confundidos com ausência de cadastro',()=>{
  const e={...entidade,cadastroExigido:'sim',cadastrosRestritos:true,cadastroIds:[]};
  assert.deepEqual(pendenciasEntidade(e,[],hoje),['Há cadastro vinculado indisponível para conferência.']);
  assert.deepEqual(pendenciasEntidade({...e,cadastroIds:['indisponivel']},[],hoje),['Há cadastro vinculado indisponível para conferência.']);
  assert.deepEqual(pendenciasEntidade({...e,cadastrosRestritos:false},[],hoje),['Vincular cadastro de fornecedor.']);
});
test('datas de Regiões preservam o dia literal e convertem timestamps para Brasília',()=>{
  assert.equal(formatarDataRegiao('2026-11-04'),'04/11/2026');
  assert.equal(formatarDataRegiao('2026-11-04T02:00:00Z'),'03/11/2026');
  assert.equal(formatarDataRegiao('2026-11-04T03:00:00Z'),'04/11/2026');
  assert.equal(formatarDataRegiao('2026-11-03T23:00:00-03:00'),'03/11/2026');
  for(const v of ['',null,undefined,123,'03/11/2026','2026-02-30','2026-02-30T12:00:00Z','2026-11-04T02:00:00','2026-11-04T25:00:00Z'])assert.equal(formatarDataRegiao(v),'A conferir',String(v));
});
test('cobertura corresponde somente ao recibo da cidade e conserva pendências',()=>{
  const cobertura={municipio:'Montes Claros',resultado:'PARCIAL',pendencia:'Completar consulta'};
  const xs=construirRegioes({hoje,pesquisa:{municipios:[cobertura,{municipio:'Montes',resultado:'CONCLUÍDA'}]}});
  assert.deepEqual(cidade(xs).cobertura,cobertura);assert.equal(cidade(xs,'Salinas').cobertura,null);
});
test('filtros de cidade combinam busca e situação, priorizam oportunidades e não alteram a lista',()=>{
  const xs=construirRegioes({hoje,entidades:[{...entidade,municipios:['Salinas'],responsavel:''}],pesquisa:{oportunidades:[oportunidade]}});
  const ordem=xs.map(x=>x.nome);
  assert.equal(filtrarCidades(xs)[0].nome,'Montes Claros');assert.equal(filtrarCidades(xs)[1].nome,'Salinas');
  assert.equal(filtrarCidades(xs,{filtro:'oportunidades'})[0].nome,'Montes Claros');
  assert.equal(filtrarCidades(xs,{filtro:'acompanhamento'})[0].nome,'Salinas');
  assert.equal(filtrarCidades(xs,{filtro:'pendencias',busca:'sal'}).length,1);
  assert.equal(filtrarCidades(xs,{filtro:'pendencias',busca:'Montes'}).length,0);
  assert.deepEqual(xs.map(x=>x.nome),ordem);
});
test('mais oportunidades vêm primeiro; empate usa o próximo dia em Brasília e depois o nome',()=>{
  const op=(id,municipio,prazo)=>({...oportunidade,id,municipiosAbrangidos:[municipio],prazo});
  const xs=construirRegioes({hoje,pesquisa:{oportunidades:[
    op('a','Salinas','2026-12-20T10:00:00-03:00'),
    op('b','Salinas','2026-12-30T10:00:00-03:00'),
    op('c','Montes Claros','2026-11-05T10:00:00-03:00'),
    op('d','Janaúba','2026-11-04T02:00:00Z'),
    op('e','Espinosa','2026-11-03T18:00:00-03:00'),
  ]}});
  const original=structuredClone(xs);
  assert.deepEqual(filtrarCidades(xs,{filtro:'oportunidades'}).map(c=>c.nome),['Salinas','Espinosa','Janaúba','Montes Claros']);
  assert.deepEqual(xs,original);
});
test('retidos e oportunidades encerradas não elevam a cidade acima de oportunidade no prazo',()=>{
  const xs=construirRegioes({hoje,pesquisa:{
    oportunidades:[oportunidade,{...oportunidade,id:'encerrada',municipiosAbrangidos:['Salinas'],classificacao:'NO-GO'}],
    candidatosRetidos:[{id:'retido',localExecucaoRegistrado:{municipios:['Salinas'],apenasSede:true}}],
  },entidades:[{...entidade,municipios:['Salinas'],responsavel:''}]});
  const ordem=filtrarCidades(xs);
  assert.equal(ordem[0].nome,'Montes Claros');assert.equal(ordem[1].nome,'Salinas');
  assert.equal(ordem[1].oportunidades.length,0);assert.equal(ordem[1].encerradas.length,1);assert.equal(ordem[1].pendentesTerritoriais.length,1);
});
