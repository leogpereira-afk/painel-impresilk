import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SECOES_COMERCIAIS,secoesComerciais,destinoCentralComercial,secaoComercialAtual,redirecionarComercial,destinoSecaoComercial,ehRotaComercial,destinoComercialLegado,secoesGlossario} from './navegacao-comercial.js';
import {fontesDaRota} from '../fontes-por-rota.js';

test('Central mantém módulos independentes, Brief com autenticação própria e Dashboard só comercial',()=>{
  assert.deepEqual(secoesComerciais(m=>m==='bancos').map(s=>s.id),['bancos','brief']);
  assert.equal(destinoCentralComercial(m=>m==='bancos'),'/comercial/bancos');
  assert.deepEqual(secoesComerciais(m=>m==='glossario').map(s=>s.id),['glossario','brief']);
  assert.deepEqual(secoesComerciais(m=>m==='contas-atrasadas').map(s=>s.id),['contas-atrasadas','brief']);
  assert.deepEqual(secoesComerciais(m=>m==='orcamentos').map(s=>s.id),['visao-geral','glossario','brief','dashboard']);
  assert.deepEqual(secoesComerciais(m=>m==='compromissos').map(s=>s.id),['compromissos','brief']);
  assert.deepEqual(secoesComerciais(()=>false).map(s=>s.id),['brief']);
  assert.equal(destinoCentralComercial(()=>true),'/comercial');
});

test('links antigos conservam filtros e fragmentos na ferramenta correspondente',()=>{
  for(const [antiga,nova] of [['/orcamentos','/comercial'],['/compromissos','/comercial/compromissos'],['/bancos','/comercial/bancos'],['/glossario','/comercial/glossario'],['/contas-atrasadas','/comercial/contas-atrasadas'],['/brief','/comercial/brief']]){
    assert.equal(redirecionarComercial(antiga,'?aba=teste&de=2026-01-01','#detalhes'),`${nova}?aba=teste&de=2026-01-01#detalhes`);
  }
});

test('cada ferramenta tem rota única e consultas isoladas, sem vazar filtros entre áreas',()=>{
  assert.equal(new Set(SECOES_COMERCIAIS.map(s=>s.caminho)).size,7);
  const memoria={'visao-geral':{search:'?aba=clientes&de=2026-01-01'},dashboard:{search:'?aba=produtos&ano=2025'}};
  assert.equal(destinoSecaoComercial(SECOES_COMERCIAIS[0],memoria),'/comercial?aba=clientes&de=2026-01-01');
  assert.equal(destinoSecaoComercial(SECOES_COMERCIAIS.find(s=>s.id==='dashboard'),memoria),'/comercial/dashboard?aba=produtos&ano=2025');
  assert.equal(destinoSecaoComercial(SECOES_COMERCIAIS.find(s=>s.id==='bancos'),memoria),'/comercial/bancos');
  assert.equal(secaoComercialAtual('/comercial/dashboard').id,'dashboard');
  assert.equal(secaoComercialAtual('/comercial/nao-existe'),null);
  assert.equal(ehRotaComercial('/orcamentos/mesa'),true);
  assert.equal(ehRotaComercial('/comercial/dashboard'),true);
  assert.equal(ehRotaComercial('/marketing'),false);
});

test('Resultados e Soluções antigos chegam à mesma funcionalidade com filtros e ações preservados',()=>{
  for(const path of ['/comercial','/orcamentos']){
    for(const aba of ['vendas','metas']){
      const destino=destinoComercialLegado(path,`?aba=${aba}&de=2026-10-10&ate=2026-10-15&vendedor=101&abrir=meta&acao=acao-ficticia`,'#registro');
      const url=new URL(destino,'https://teste.local');
      assert.equal(url.pathname,'/comercial/dashboard');
      assert.equal(url.searchParams.get('analise'),aba);
      assert.equal(url.searchParams.get('modo'),'personalizado');
      assert.equal(url.searchParams.get('de'),'2026-10-10');
      assert.equal(url.searchParams.get('ate'),'2026-10-15');
      assert.equal(url.searchParams.get('vendedor'),'101');
      assert.equal(url.searchParams.get('abrir'),'meta');
      assert.equal(url.searchParams.get('acao'),'acao-ficticia');
      assert.equal(url.hash,'#registro');
      assert.equal(url.searchParams.has('aba'),false);
    }
    assert.equal(redirecionarComercial(path,'?aba=produtos&produto=produto-ficticio'),'\/comercial/glossario?produto=produto-ficticio&secao=solucoes');
  }
  assert.equal(destinoComercialLegado('/comercial/solucoes','?categoria=acm'),'/comercial/glossario?categoria=acm&secao=solucoes');
  assert.equal(destinoComercialLegado('/comercial/dashboard','?aba=produtos'),null);
  assert.equal(destinoComercialLegado('/comercial','?aba=clientes'),null);
});

test('Glossário conserva permissões distintas de termos e catálogo comercial',()=>{
  assert.deepEqual(secoesGlossario(m=>m==='glossario').map(s=>s.id),['termos']);
  assert.deepEqual(secoesGlossario(m=>m==='orcamentos').map(s=>s.id),['solucoes']);
  assert.deepEqual(secoesGlossario(()=>false),[]);
  assert.deepEqual(secoesGlossario(()=>true).map(s=>s.id),['termos','solucoes']);
});

test('novo endereço de cobrança carrega suas fontes e demais áreas não carregam o ERP inteiro',()=>{
  assert.deepEqual(fontesDaRota('/comercial/contas-atrasadas'),['recebiveis','ordens']);
  assert.deepEqual(fontesDaRota('/comercial/contas-atrasadas/'),['recebiveis','ordens']);
  for(const secao of SECOES_COMERCIAIS.filter(s=>s.id!=='contas-atrasadas'))assert.deepEqual(fontesDaRota(secao.caminho),[]);
});
