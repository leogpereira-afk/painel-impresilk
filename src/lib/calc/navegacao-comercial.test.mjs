import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SECOES_COMERCIAIS,secoesComerciais,destinoCentralComercial,secaoComercialAtual,redirecionarComercial,destinoSecaoComercial,ehRotaComercial} from './navegacao-comercial.js';
import {fontesDaRota} from '../fontes-por-rota.js';

test('Central mantém módulos independentes, Brief com autenticação própria e Dashboard só comercial',()=>{
  assert.deepEqual(secoesComerciais(m=>m==='bancos').map(s=>s.id),['bancos','brief']);
  assert.equal(destinoCentralComercial(m=>m==='bancos'),'/comercial/bancos');
  assert.deepEqual(secoesComerciais(m=>m==='glossario').map(s=>s.id),['glossario','brief']);
  assert.deepEqual(secoesComerciais(m=>m==='contas-atrasadas').map(s=>s.id),['contas-atrasadas','brief']);
  assert.deepEqual(secoesComerciais(m=>m==='orcamentos').map(s=>s.id),['visao-geral','brief','dashboard']);
  assert.deepEqual(secoesComerciais(()=>false).map(s=>s.id),['brief']);
  assert.equal(destinoCentralComercial(()=>true),'/comercial');
});

test('links antigos conservam filtros e fragmentos na ferramenta correspondente',()=>{
  for(const [antiga,nova] of [['/orcamentos','/comercial'],['/bancos','/comercial/bancos'],['/glossario','/comercial/glossario'],['/contas-atrasadas','/comercial/contas-atrasadas'],['/brief','/comercial/brief']]){
    assert.equal(redirecionarComercial(antiga,'?aba=teste&de=2026-01-01','#detalhes'),`${nova}?aba=teste&de=2026-01-01#detalhes`);
  }
});

test('cada ferramenta tem rota única e consultas isoladas, sem vazar filtros entre áreas',()=>{
  assert.equal(new Set(SECOES_COMERCIAIS.map(s=>s.caminho)).size,6);
  const memoria={'visao-geral':{search:'?aba=clientes&de=2026-01-01'},dashboard:{search:'?aba=produtos&ano=2025'}};
  assert.equal(destinoSecaoComercial(SECOES_COMERCIAIS[0],memoria),'/comercial?aba=clientes&de=2026-01-01');
  assert.equal(destinoSecaoComercial(SECOES_COMERCIAIS[5],memoria),'/comercial/dashboard?aba=produtos&ano=2025');
  assert.equal(destinoSecaoComercial(SECOES_COMERCIAIS[1],memoria),'/comercial/bancos');
  assert.equal(secaoComercialAtual('/comercial/dashboard').id,'dashboard');
  assert.equal(secaoComercialAtual('/comercial/nao-existe'),null);
  assert.equal(ehRotaComercial('/orcamentos/mesa'),true);
  assert.equal(ehRotaComercial('/comercial/dashboard'),true);
  assert.equal(ehRotaComercial('/marketing'),false);
});

test('novo endereço de cobrança carrega suas fontes e demais áreas não carregam o ERP inteiro',()=>{
  assert.deepEqual(fontesDaRota('/comercial/contas-atrasadas'),['recebiveis','ordens']);
  assert.deepEqual(fontesDaRota('/comercial/contas-atrasadas/'),['recebiveis','ordens']);
  for(const secao of SECOES_COMERCIAIS.filter(s=>s.id!=='contas-atrasadas'))assert.deepEqual(fontesDaRota(secao.caminho),[]);
});
