// A SUB-ABA "DADOS" DO CANAL (marketing-dados*.js): o que cada quadro mostra
// a partir do "dados" das fontes. Começa pelo caso ruim: o número que
// ninguém mediu virando 0, o código técnico do motivo indo para a tela, o
// link "javascript:" virando link, o dado pessoal (chaves "restrito")
// aparecendo para quem não é gestão, e a parte parada mostrando números
// vazios em vez do estado.
//
// Os retratos são os de src/review/fontes-ficticias*.json: a resposta da ação
// "fontes" que os seis conectores de verdade geraram com as fixtures
// fictícias. E o formato da revisão 2 dos conectores (motivo em frase com o
// código ao lado, wordpress.codigo, perfil.dias_ate, story lido_em/parcial)
// é provado por cima de uma cópia deles (revisao2, abaixo), porque os
// arquivos só serão gerados de novo depois que as duas pontas se juntarem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUSENTE,
  NAO_MEDIDO,
  blocoGrafico,
  celula,
  comparacao,
  estadoDoQuadro,
  formatar,
  motivoDaParte,
  motivosDasLigacoes,
  numero,
  parteDoAviso,
  quadroDeAvisos,
  rotuloDia,
  rotuloInstante,
  somaDisponivel,
  somaEstrita,
  diaDe,
} from './marketing-dados.js';
import { chaveDaLigacao, ligacoesNaAba, quadrosDaLigacao, quadrosDoCanal, QUADROS_DA_LIGACAO } from './marketing-dados-canal.js';
import { quadrosGa4, quadrosPerfilEmpresa } from './marketing-dados-google.js';
import { quadrosSite, tomDaMedida, tomDaNota } from './marketing-dados-site.js';
import { quadrosGoogleAds } from './marketing-dados-ads.js';
import { quadrosInstagram } from './marketing-dados-meta.js';
import { FONTES_DO_CANAL, fontesDoCanal } from './marketing-fontes.js';
import { tirarRestrito } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';

const ler = (n) => JSON.parse(readFileSync(new URL(`../../review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const copia = (x) => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-11';
const CANAIS = Object.keys(FONTES_DO_CANAL);
const TRAVESSAO = /[\u2013\u2014]/;
const ctx = { hoje: HOJE };

/** Todos os blocos de um quadro (os do topo e os das seções). */
const blocos = (q) => [...q.topo, ...q.secoes.flatMap((s) => s.blocos)];
/** Todo texto que a tela escreveria de um quadro. */
function textos(q) {
  const t = [q.titulo, q.legenda, q.destaque, q.vazio, q.estado.info.rotulo, q.estado.info.texto, q.estado.motivo, ...q.estado.ressalvas, ...q.notas];
  for (const s of q.secoes) t.push(s.titulo, s.resumo);
  for (const b of blocos(q)) {
    if (b.tipo === 'numeros') for (const n of b.itens) t.push(b.titulo, n.rotulo, n.texto, n.titulo, n.nota?.texto, n.nota?.antes);
    else if (b.tipo === 'tabela') {
      t.push(b.nota, ...b.colunas.map((c) => c.rotulo));
      for (const l of b.linhas) for (const c of l.celulas) t.push(c.texto, c.titulo);
    } else if (b.tipo === 'pares') for (const p of b.itens) t.push(p.rotulo, p.texto);
    else if (b.tipo === 'lista') for (const i of b.itens) t.push(i.titulo, i.sub, i.texto, i.detalhe);
    else if (b.tipo === 'barras') for (const i of b.itens) t.push(b.titulo, i.rotulo, i.texto);
    else if (b.tipo === 'grafico') t.push(b.titulo, b.resumo, ...b.pontos.map((p) => p.texto));
    else if (b.tipo === 'avisos') t.push(...b.itens.map((a) => a.texto));
    else if (b.tipo === 'texto') t.push(b.texto);
  }
  return t.filter((x) => typeof x === 'string');
}
const todosOsQuadros = (r) => CANAIS.flatMap((c) => quadrosDoCanal(c, r.fontes, ctx));

/** O formato da revisão 2 dos conectores, por cima de uma cópia. */
function revisao2(r) {
  const n = copia(r);
  const ads = n.fontes.google_ads;
  if (ads.partes.conta && ads.partes.conta.estado !== 'ok') {
    ads.partes.conta.motivo = 'O projeto do Google Cloud ainda não tem o nível Explorer da Google Ads API. Peça em Google Ads API Overview.';
    ads.partes.conta.codigo = 'projeto_sem_aprovacao';
  }
  const site = n.fontes.site;
  site.partes.crux = { ...site.partes.crux, estado: 'ok', motivo: 'O Chrome ainda não tem visitas suficientes do site para medir a experiência real.', codigo: 'sem_dados' };
  site.dados.crux = { sem_dados: true, origem: { todos: null, celular: null, computador: null }, inicio: null, historico: { celular: null, computador: null }, semanas: [] };
  site.partes.wordpress = { ...site.partes.wordpress, estado: 'ok', motivo: 'A REST do WordPress está fechada para quem não está logado.', codigo: 'rest_fechada' };
  site.dados.wordpress = { ...site.dados.wordpress, rest: false, codigo: 'http_403' };
  delete site.dados.wordpress.motivo;
  for (const k of ['paginas', 'posts']) for (const i of site.dados.wordpress[k]?.itens ?? []) Object.assign(i, { tipo: k === 'paginas' ? 'pagina' : 'post', link_curto: `https://exemplo.com.br/?${k === 'paginas' ? 'page_id' : 'p'}=${i.id}` });
  const perfil = n.fontes.google.dados.perfil;
  if (perfil) {
    const dias = perfil.dias;
    for (const d of dias.slice(-2)) for (const k of Object.keys(d)) if (k !== 'data') d[k] = null;
    perfil.dias_ate = dias[dias.length - 3].data;
    const ultima = perfil.semanas[perfil.semanas.length - 1];
    Object.assign(ultima, { fechada: false, impressoes: null, cliques_site: null, ligacoes: null, rotas: null, reservas: null, cliques: null, interacoes: null });
  }
  const ig = n.fontes.meta.dados.instagram;
  if (ig) for (const s of ig.stories) Object.assign(s, { lido_em: '2026-10-11T09:17:00.000Z', parcial: true, titulo: null });
  return n;
}
const REVISAO2 = revisao2(CHEIAS);
const REVISAO2_VARIEDADE = revisao2(VARIEDADE);

// ---------------------------------------------------------------- o zero --

test('o caso ruim: número não medido nunca vira 0 (célula, número grande, soma, comparação)', () => {
  for (const v of [null, undefined, '', 'abc', NaN, Infinity]) {
    assert.deepEqual(celula('int', v), { texto: AUSENTE, vazio: true, titulo: NAO_MEDIDO }, String(v));
    assert.equal(numero({ rotulo: 'Cliques', valor: v }).texto, NAO_MEDIDO);
    assert.equal(numero({ rotulo: 'Gasto', tipo: 'moeda', valor: v }).texto, NAO_MEDIDO);
  }
  // O zero medido continua zero.
  assert.equal(celula('int', 0).texto, '0');
  assert.equal(numero({ rotulo: 'Cliques', valor: 0 }).texto, '0');
  assert.equal(somaDisponivel([null, undefined, 'x']), null);
  assert.equal(somaDisponivel([null, 0]), 0);
  assert.equal(somaDisponivel([2, null, 3]), 5);
  assert.equal(somaEstrita([2, null, 3]), null, 'um dia sem dado deixa o total sem número');
  assert.equal(somaEstrita([]), null);
  assert.equal(somaEstrita([2, 0, 3]), 5);
  // Sem o anterior não há seta nem porcentagem inventada.
  assert.deepEqual(comparacao('int', 10, null), { texto: null, antes: `antes: ${NAO_MEDIDO}`, tom: 'neutral', direcao: null });
  assert.equal(comparacao('int', null, 10).texto, null);
});

test('o caso ruim: nenhum quadro das duas prévias mostra "0" no lugar de um número que veio null', () => {
  // Procura, quadro a quadro, toda célula vazia: tem de ser o ponto de
  // ausente com "não medido" (ou "não informado") no title, e nenhuma
  // célula com vazio=true pode trazer um número.
  for (const r of [VARIEDADE, CHEIAS, REVISAO2]) {
    for (const q of todosOsQuadros(r)) {
      for (const b of blocos(q)) {
        if (b.tipo === 'tabela') {
          for (const l of b.linhas) for (const c of l.celulas) if (c.vazio) assert.equal(c.texto, AUSENTE, `${q.id}: ${JSON.stringify(c)}`);
        }
        if (b.tipo === 'numeros') for (const n of b.itens) if (n.vazio) assert.equal(n.texto, NAO_MEDIDO, `${q.id}: ${n.rotulo}`);
      }
    }
  }
  // E o caso concreto do retrato: a semana da Página do Facebook com um dia
  // sem medida deixa as visualizações sem número (o conector manda null).
  const pagina = quadrosDoCanal('facebook', CHEIAS.fontes, ctx).find((q) => q.id === 'meta-pagina');
  const semana = pagina.topo.find((b) => b.tipo === 'numeros' && b.titulo?.startsWith('Semana'));
  assert.equal(semana.itens.find((n) => n.id === 'visualizacoes').texto, NAO_MEDIDO);
  assert.match(semana.titulo, /6 de 7 dias medidos/);
});

test('o gráfico desenha o não medido como ausência (y null), e o zero como zero', () => {
  const g = blocoGrafico([{ data: '2026-10-01', n: 3 }, { data: '2026-10-02', n: null }, { data: '2026-10-03', n: 0 }], { x: 'data', y: 'n', titulo: 'Teste', hoje: HOJE });
  assert.deepEqual(g.pontos.map((p) => p.y), [3, null, 0]);
  assert.equal(g.pontos[1].texto, `02/10: ${NAO_MEDIDO}`);
  assert.match(g.resumo, /1 ponto sem medida/);
  // Tudo nulo: nem desenha (não existe gráfico de zeros inventados).
  assert.equal(blocoGrafico([{ data: '2026-10-01', n: null }], { x: 'data', y: 'n', titulo: 'T' }), null);
  // O Perfil da Empresa da revisão 2: os dias que o Google ainda não
  // processou chegam null e ficam null no gráfico (nunca 0).
  const [desempenho] = quadrosPerfilEmpresa(fontesDoCanal('google', REVISAO2.fontes)[0], ctx);
  const graf = desempenho.topo.find((b) => b.tipo === 'grafico');
  assert.deepEqual(graf.pontos.slice(-2).map((p) => p.y), [null, null]);
});

// ------------------------------------------------------------- o estado --

test('o caso ruim: parte parada mostra o estado e a frase do que fazer, e nenhum número vazio', () => {
  // Na variedade: o Google Ads aguarda aprovação, o Perfil da Empresa também,
  // o LinkedIn não tem os secrets e o Pinterest não foi conectado.
  const casos = [
    ['site', 'google_ads', 'aguardando_aprovacao'],
    ['google', 'perfil', 'aguardando_aprovacao'],
    ['linkedin', 'linkedin', 'falta_configurar'],
    ['pinterest', 'pinterest', 'falta_conectar'],
  ];
  for (const [canal, id, estado] of casos) {
    const q = quadrosDoCanal(canal, VARIEDADE.fontes, ctx).find((x) => x.id === id);
    assert.ok(q, `${canal}: quadro ${id}`);
    assert.equal(q.estado.chave, estado, id);
    assert.equal(q.temDado, false, id);
    assert.equal(q.topo.length + q.secoes.length, 0, `${id}: nada de número vazio`);
    assert.ok(q.estado.info.texto.length > 10, `${id}: a frase do que fazer`);
    assert.match(q.legenda, /ainda sem coleta/, id);
  }
  // O motivo que o servidor mandou vai junto (a frase do Google).
  const perfil = quadrosDoCanal('google', VARIEDADE.fontes, ctx)[0];
  assert.match(perfil.estado.motivo, /não aprovou o acesso à API do Perfil da Empresa/);
});

test('o caso ruim: o código técnico do motivo nunca vai para a tela (formato antigo e revisão 2)', () => {
  // Formato antigo: o código vinha em "motivo"; a tela troca pela frase.
  assert.deepEqual(motivoDaParte({ estado: 'erro', motivo: 'projeto_sem_aprovacao' }), {
    texto: 'O projeto ainda não tem o nível Explorer da Google Ads API.',
    codigo: 'projeto_sem_aprovacao',
  });
  // Revisão 2: a frase em "motivo", o código ao lado.
  assert.deepEqual(motivoDaParte({ estado: 'erro', motivo: 'O Google recusou.', codigo: 'recusado' }), { texto: 'O Google recusou.', codigo: 'recusado' });
  // Código desconhecido: sem frase (só o estado), e nunca o código cru.
  assert.equal(motivoDaParte({ estado: 'erro', motivo: 'codigo_novo_qualquer' }).texto, null);
  for (const r of [VARIEDADE, REVISAO2_VARIEDADE]) {
    const ads = quadrosDoCanal('site', r.fontes, ctx).find((q) => q.id === 'google_ads');
    for (const t of textos(ads)) assert.equal(/projeto_sem_aprovacao/.test(t), false, t);
    assert.match(ads.estado.motivo, /^Conta: O projeto/);
  }
});

test('fonte inteira: o quadro mostra o pior estado entre as partes dele, com o nome da parte no motivo', () => {
  const l = copia(fontesDoCanal('site', CHEIAS.fontes).find((x) => x.fonte === 'google_ads'));
  l.partes.termos = { estado: 'erro', motivo: 'O tempo da coleta acabou antes; o que faltou vem na próxima.', codigo: 'sem_tempo', coletadoEm: '2026-10-10T09:23:00.000Z', tentadoEm: '2026-10-11T09:23:00.000Z' };
  const e = estadoDoQuadro(l, ['campanhas', 'termos']);
  assert.equal(e.chave, 'erro');
  assert.equal(e.motivo, 'Termos de pesquisa: O tempo da coleta acabou antes; o que faltou vem na próxima.');
  // A data na tela é a do dado mais velho, e a tentativa que falhou vai junto.
  assert.equal(e.coletadoEm, '2026-10-10T09:23:00.000Z');
  assert.equal(e.tentadoEm, '2026-10-11T09:23:00.000Z');
  // E a seção dos termos, sem o dado, diz o estado no lugar da tabela.
  delete l.dados.termos;
  const [q] = quadrosGoogleAds(l, ctx);
  const termos = q.secoes.find((s) => s.id === 'termos');
  assert.equal(termos.blocos[0].tipo, 'texto');
  assert.match(termos.blocos[0].texto, /^Erro na coleta: O tempo da coleta acabou/);
});

test('revisão 2: parte ok que traz motivo vira nota (ressalva), sem mudar o estado', () => {
  const quadros = quadrosSite(fontesDoCanal('site', REVISAO2.fontes).find((x) => x.fonte === 'site'), ctx);
  const crux = quadros.find((q) => q.id === 'site-crux');
  assert.equal(crux.estado.chave, 'ok');
  assert.equal(crux.temDado, false, 'o Chrome sem visitas: nada para desenhar');
  assert.equal(crux.vazio, 'O Chrome ainda não tem visitas suficientes do site para medir a experiência real.');
  const wp = quadros.find((q) => q.id === 'site-wordpress');
  assert.equal(wp.estado.chave, 'ok');
  assert.ok(wp.notas.includes('A REST do WordPress está fechada para quem não está logado.'));
  // wordpress.codigo (http_403) não vira texto em lugar nenhum.
  for (const t of textos(wp)) assert.equal(/http_403|rest_fechada/.test(t), false, t);
  // O link curto do WordPress é aceito (o permanente continua sendo o link).
  const paginasWp = wp.secoes.find((s) => s.id === 'paginas_wp').blocos[0];
  assert.ok(paginasWp.linhas[0].celulas[0].link.startsWith('https://exemplo.com.br/'));
});

test('revisão 2: o story lido no meio do dia diz a hora da leitura e que ela é parcial', () => {
  const [, publicacoes] = quadrosInstagram(fontesDoCanal('instagram', REVISAO2.fontes)[0], ctx);
  const stories = publicacoes.secoes.find((s) => s.id === 'stories');
  const tabela = stories.blocos[0];
  const i = tabela.colunas.findIndex((c) => c.id === 'lido_em');
  assert.ok(i > 0);
  const c = tabela.linhas[0].celulas[i];
  assert.match(c.texto, /^11\/10 às \d\d:17$/, 'a hora no fuso de quem olha');
  assert.equal(c.tom, 'warn');
  assert.match(c.titulo, /parcial/);
  assert.match(tabela.nota, /não o final do story/);
  // Story sem legenda: a linha não fica sem nome.
  assert.equal(tabela.linhas[0].celulas[1].texto, 'abrir');
});

test('revisão 2: a semana do Perfil da Empresa ainda não fechada fica sem número e diz isso', () => {
  const [desempenho] = quadrosPerfilEmpresa(fontesDoCanal('google', REVISAO2.fontes)[0], ctx);
  const semanas = desempenho.secoes.find((s) => s.id === 'semanas').blocos[0];
  const primeira = semanas.linhas[0].celulas;
  assert.equal(primeira[1].texto, 'ainda não fechada');
  assert.equal(primeira[2].texto, AUSENTE);
  assert.ok(desempenho.notas.some((n) => /^O Google mandou números até \d\d\/\d\d/.test(n)));
  // A comparação de cima usa só semanas fechadas.
  const nums = desempenho.topo.find((b) => b.tipo === 'numeros' && b.titulo?.startsWith('Semana'));
  assert.notEqual(nums.itens[0].texto, NAO_MEDIDO);
});

test('estado de antes da conexão e fonte não lida: nada de motivo velho', () => {
  const r = copia(VARIEDADE);
  r.fontes.pinterest.conexao = { conectadoEm: '2026-10-11T12:00:00.000Z', conectadoPor: 'demo', conta: null, escopos: [], expiraEm: null, refreshExpiraEm: null };
  const [q] = quadrosDoCanal('pinterest', r.fontes, ctx);
  assert.equal(q.estado.chave, 'aguardando_coleta');
  assert.equal(q.estado.motivo, null);
  // A fonte que nem veio na resposta: "não lido", e não "sem dados".
  const semPinterest = copia(VARIEDADE.fontes);
  delete semPinterest.pinterest;
  const [nl] = quadrosDoCanal('pinterest', semPinterest, ctx);
  assert.equal(nl.estado.chave, 'nao_lido');
  assert.equal(nl.temDado, false);
});

// ------------------------------------------------------------- a segurança --

test('o caso ruim: link que não é http(s) não vira link (o texto vem do site e das APIs)', () => {
  const l = copia(fontesDoCanal('site', CHEIAS.fontes).find((x) => x.parte === 'ga4'));
  l.dados.paginas[0].link = 'javascript:alert(1)';
  l.dados.paginas[1].link = 'https://exemplo.com.br/ok';
  const [q] = quadrosGa4(l, ctx);
  const tabela = q.secoes.find((s) => s.id === 'paginas').blocos[0];
  const links = tabela.linhas.map((x) => x.celulas[0].link);
  assert.equal(links.includes('javascript:alert(1)'), false);
  assert.ok(links.includes('https://exemplo.com.br/ok'));
  assert.equal(celula('texto', 'abrir', { link: 'data:text/html,<b>x</b>' }).link, undefined);
});

test('o caso ruim: o dado pessoal ("restrito") só aparece quando o servidor mandou (gestão)', () => {
  const gestao = quadrosGoogleAds(fontesDoCanal('site', CHEIAS.fontes).find((x) => x.fonte === 'google_ads'), ctx)[0];
  const marketing = copia(CHEIAS.fontes);
  for (const f of Object.values(marketing)) f.dados = tirarRestrito(f.dados);
  const semRestrito = quadrosGoogleAds(fontesDoCanal('site', marketing).find((x) => x.fonte === 'google_ads'), ctx)[0];
  const tudo = (q) => textos(q).join(' | ');
  assert.match(tudo(gestao), /Fulana de Teste/, 'a gestão vê o lead');
  assert.match(tudo(gestao), /alguem@example\.com/, 'a gestão vê quem mexeu');
  assert.doesNotMatch(tudo(semRestrito), /Fulana de Teste|Beltrano|alguem@example\.com/);
  // Os números sem dado pessoal continuam para todos.
  assert.match(tudo(semRestrito), /Guardados no Painel/);
});

// --------------------------------------------------------- os canais e a ordem --

test('todo canal com fonte monta quadros nas duas prévias, cada um com a fonte e a data à vista', () => {
  for (const r of [VARIEDADE, CHEIAS, REVISAO2, REVISAO2_VARIEDADE]) {
    for (const c of CANAIS) {
      const qs = quadrosDoCanal(c, r.fontes, ctx);
      assert.ok(qs.length >= 1, c);
      const ids = qs.map((q) => q.id);
      assert.equal(new Set(ids).size, ids.length, `${c}: id repetido (a escolha de aberto e fechado se misturaria)`);
      for (const q of qs) {
        assert.ok(q.legenda.startsWith(`${q.rotuloFonte}, `), `${q.id}: ${q.legenda}`);
        assert.match(q.legenda, /coletado em \d\d\/\d\d às \d\d:\d\d|ainda sem coleta/, q.id);
      }
    }
  }
  // Nas seis fontes cheias, todo quadro tem dado e fica ok.
  for (const q of todosOsQuadros(CHEIAS)) assert.equal(q.estado.comDado, true, q.id);
  // Canal sem integração não tem aba Dados.
  assert.deepEqual(quadrosDoCanal('whatsapp', CHEIAS.fontes, ctx), []);
});

test('cada ligação de FONTES_DO_CANAL tem quem desenhe, e a que não tem vira um quadro com o estado', () => {
  for (const ligacoes of Object.values(FONTES_DO_CANAL)) {
    for (const l of ligacoes) assert.ok(QUADROS_DA_LIGACAO[chaveDaLigacao(l)], chaveDaLigacao(l));
  }
  const [q] = quadrosDaLigacao({ fonte: 'tiktok', parte: null, rotulo: 'TikTok', estado: 'ok', partes: {}, dados: {}, carregada: true }, ctx);
  assert.equal(q.temDado, false);
  assert.equal(q.vazio, 'Esta tela ainda não sabe desenhar os dados desta fonte.');
});

test('o canal site abre com o tráfego: Google Analytics, Search Console, Google Ads e depois o site', () => {
  assert.deepEqual(ligacoesNaAba('site', CHEIAS.fontes).map(chaveDaLigacao), ['google:ga4', 'google:search_console', 'google_ads:', 'site:']);
  assert.deepEqual(quadrosDoCanal('site', CHEIAS.fontes, ctx).map((q) => q.id), [
    'ga4', 'search_console', 'google_ads', 'site-avisos', 'site-etiquetas', 'site-paginas', 'site-pagespeed', 'site-crux', 'site-robots', 'site-wordpress',
  ]);
  assert.deepEqual(quadrosDoCanal('facebook', CHEIAS.fontes, ctx).map((q) => q.id), ['meta-pagina', 'meta-anuncios', 'meta-pixel']);
  assert.deepEqual(quadrosDoCanal('instagram', CHEIAS.fontes, ctx).map((q) => q.id), ['ig-conta', 'ig-publicacoes', 'ig-publico']);
});

test('o que o pedido lista em cada canal está lá (os quadros e as seções)', () => {
  const secoes = (canal, id) => quadrosDoCanal(canal, CHEIAS.fontes, ctx).find((q) => q.id === id).secoes.map((s) => s.id);
  assert.deepEqual(
    ['canais', 'origens', 'campanhas', 'paginas', 'entradas', 'cidades', 'aparelhos', 'eventos_chave', 'dias', 'semanas'].filter((s) => !secoes('site', 'ga4').includes(s)),
    []
  );
  assert.deepEqual(['consultas', 'paginas', 'paises', 'aparelhos', 'dias', 'sitemaps'].filter((s) => !secoes('site', 'search_console').includes(s)), []);
  assert.deepEqual(['campanhas', 'termos'].filter((s) => !secoes('site', 'google_ads').includes(s)), []);
  assert.deepEqual(['laboratorio', 'melhorar'].filter((s) => !secoes('site', 'site-pagespeed').includes(s)), []);
  assert.deepEqual(['historico', 'semanas'].filter((s) => !secoes('site', 'site-crux').includes(s)), []);
  assert.deepEqual(['robots', 'sitemap'].filter((s) => !secoes('site', 'site-robots').includes(s)), []);
  assert.deepEqual(['posts', 'semanas'].filter((s) => !secoes('facebook', 'meta-pagina').includes(s)), []);
  assert.deepEqual(['campanhas'].filter((s) => !secoes('facebook', 'meta-anuncios').includes(s)), []);
  assert.deepEqual(['eventos'].filter((s) => !secoes('facebook', 'meta-pixel').includes(s)), []);
  assert.deepEqual(['midias', 'stories'].filter((s) => !secoes('instagram', 'ig-publicacoes').includes(s)), []);
  assert.deepEqual(['recentes'].filter((s) => !secoes('google', 'perfil-avaliacoes').includes(s)), []);
  assert.deepEqual(['posts'].filter((s) => !secoes('google', 'perfil-posts').includes(s)), []);
  assert.deepEqual(['posts'].filter((s) => !secoes('linkedin', 'li-posts').includes(s)), []);
  assert.deepEqual(['pins', 'pastas'].filter((s) => !secoes('pinterest', 'pin-pins').includes(s)), []);
  // A matriz de etiquetas: uma linha por página lida, uma coluna por etiqueta,
  // e "falta" onde a etiqueta está em outras páginas e não nesta.
  const etiquetas = quadrosDoCanal('site', CHEIAS.fontes, ctx).find((q) => q.id === 'site-etiquetas');
  const matriz = etiquetas.secoes.find((s) => s.id === 'por_pagina').blocos[0];
  assert.equal(matriz.colunas.length, 11);
  assert.ok(matriz.linhas.some((l) => l.celulas.some((c) => c.marca === 'falta')));
  assert.ok(matriz.linhas.some((l) => l.celulas.some((c) => c.marca === 'sim')));
  // O Instagram não chama de orgânico (os números incluem anúncio): a palavra
  // só aparece na frase que diz justamente que NÃO são só orgânicos.
  for (const q of quadrosDoCanal('instagram', CHEIAS.fontes, ctx)) {
    for (const t of textos(q)) assert.doesNotMatch(t.replace(/não são (números )?só orgânicos/g, ''), /orgânic/i, `${q.id}: ${t}`);
  }
});

// --------------------------------------------------------------- avisos --

test('os avisos da coleta vão num quadro só, sem repetir o motivo que um quadro já escreveu', () => {
  const ligacoes = ligacoesNaAba('site', REVISAO2_VARIEDADE.fontes);
  const q = quadroDeAvisos(ligacoes, REVISAO2_VARIEDADE.fontes, { avisosGerais: ['Aviso geral.'], jaDitos: motivosDasLigacoes(ligacoes), hoje: HOJE });
  const itens = q.topo[0].itens.map((a) => a.texto);
  assert.ok(itens.some((t) => t.startsWith('Google: Search Console')), 'com o nome da fonte (o canal site tem três)');
  assert.ok(itens.includes('Aviso geral.'));
  // O aviso do Google Ads é a mesma frase do motivo da parte conta: sai.
  const adsAviso = REVISAO2_VARIEDADE.fontes.google_ads.avisos[0];
  REVISAO2_VARIEDADE.fontes.google_ads.avisos = [REVISAO2_VARIEDADE.fontes.google_ads.partes.conta.motivo];
  const q2 = quadroDeAvisos(ligacoes, REVISAO2_VARIEDADE.fontes, { jaDitos: motivosDasLigacoes(ligacoes), hoje: HOJE });
  assert.equal(q2.topo[0].itens.some((a) => a.texto.includes('nível Explorer')), false);
  REVISAO2_VARIEDADE.fontes.google_ads.avisos = [adsAviso];
  // Canal de uma fonte só: sem o nome na frente.
  const fb = ligacoesNaAba('facebook', CHEIAS.fontes);
  const qfb = quadroDeAvisos(fb, CHEIAS.fontes, { hoje: HOJE });
  assert.ok(qfb.topo[0].itens.every((a) => !a.texto.startsWith('Meta:')));
  // Sem aviso nenhum: nada (null), e não um quadro vazio.
  assert.equal(quadroDeAvisos(ligacoesNaAba('linkedin', CHEIAS.fontes), CHEIAS.fontes, { hoje: HOJE }), null);
  // Aviso de antes da conexão fala de uma situação que já mudou: não entra.
  const r = copia(VARIEDADE.fontes);
  r.pinterest.avisos = ['Aviso velho.'];
  r.pinterest.conexao = { conectadoEm: '2026-10-11T12:00:00.000Z', escopos: [] };
  assert.equal(quadroDeAvisos(ligacoesNaAba('pinterest', r), r, { hoje: HOJE }), null);
});

test('o aviso de uma parte vai só para o canal que mostra a parte', () => {
  const avisos = (canal) => quadroDeAvisos(ligacoesNaAba(canal, CHEIAS.fontes), CHEIAS.fontes, { hoje: HOJE })?.topo[0].itens.map((a) => a.texto) ?? [];
  // "Search Console: ..." é do canal site; o Google Meu Negócio não o vê.
  assert.ok(avisos('site').some((t) => t.includes('Search Console:')));
  assert.equal(avisos('google').some((t) => t.includes('Search Console:')), false);
  // Os da Meta: Página e Pixel no facebook; Instagram no instagram.
  assert.ok(avisos('facebook').some((t) => t.startsWith('Pixel:')));
  assert.equal(avisos('facebook').some((t) => t.startsWith('Instagram:')), false);
  assert.ok(avisos('instagram').some((t) => t.startsWith('Instagram:')));
  assert.equal(avisos('instagram').some((t) => /^(Página|Pixel|Anúncios):/.test(t)), false);
  assert.equal(parteDoAviso('google', 'Perfil da Empresa: a cota acabou.'), 'perfil');
  assert.equal(parteDoAviso('google', 'Aviso da fonte inteira.'), null);
});

// ------------------------------------------------------------- formatos --

test('as datas nas quatro formas das APIs, sem depender do Safari ler "+0000"', () => {
  assert.equal(diaDe('2026-10-08'), '2026-10-08');
  assert.equal(diaDe('2026-10-07 16:20:00.123456'), '2026-10-07', 'sem fuso: o dia da conta');
  assert.equal(diaDe('2026-10-08T14:00:00+0000'), '2026-10-08');
  assert.equal(diaDe('2026-02-30'), null);
  assert.equal(diaDe('ontem'), null);
  assert.equal(rotuloDia('2025-03-01 00:00:00', HOJE), '01/03/2025', 'outro ano leva o ano');
  assert.equal(rotuloDia('2026-10-08', HOJE), '08/10');
  assert.equal(rotuloInstante('2026-10-07 16:20:00.123456', HOJE), '07/10 às 16:20');
  assert.match(rotuloInstante('2026-10-11T22:10:00+0000', HOJE), /^11\/10 às \d\d:10$/);
});

test('taxa e posição comparam em pontos; contagem em %; e a régua diz se subir é bom', () => {
  assert.deepEqual(comparacao('fracao', 0.025, 0.021), { texto: '+0,4 p.p.', antes: 'antes: 2,1%', tom: 'ok', direcao: 'sobe' });
  assert.deepEqual(comparacao('dec1', 14.2, 15.1, { subirE: 'ruim' }), { texto: '-0,9', antes: 'antes: 15,1', tom: 'ok', direcao: 'desce' });
  assert.equal(comparacao('int', 110, 100).texto, '+10%');
  assert.equal(comparacao('int', 101, 100).texto, '+1%');
  assert.equal(comparacao('int', 5, 0).texto, '+5', 'de 0 para 5 não tem porcentagem');
  assert.equal(comparacao('moeda', 120, 100, { subirE: 'neutro' }).tom, 'neutral', 'gasto subir não é bom nem ruim');
  assert.equal(comparacao('int', 7, 7).texto, 'igual');
  assert.equal(formatar('parcela', { valor: 0.0999, menosDe10: true }), 'menos de 10%');
  assert.equal(formatar('faixa', { min: 1000, max: 5000 }), 'entre 1.000 e 5.000');
  assert.equal(formatar('moeda', 846.5, { moeda: 'BRL' }).replace(/\u00a0/g, ' '), 'R$ 846,50');
});

test('as réguas de velocidade do Google e das notas do PageSpeed', () => {
  assert.equal(tomDaMedida('lcp_ms', 2500), 'ok');
  assert.equal(tomDaMedida('lcp_ms', 3100), 'warn');
  assert.equal(tomDaMedida('lcp_ms', 4001), 'bad');
  assert.equal(tomDaMedida('cls', 0.05), 'ok');
  assert.equal(tomDaMedida('inp_ms', null), null);
  assert.equal(tomDaNota(90), 'ok');
  assert.equal(tomDaNota(89), 'warn');
  assert.equal(tomDaNota(49), 'bad');
  assert.equal(tomDaNota(null), null);
});

test('as frases da aba não levam travessão (a regra da casa), nem as células', () => {
  // Só o que a TELA escreve: o texto que vem de fora (título de página do
  // site, nome de campanha) é dado e passa como veio.
  for (const r of [VARIEDADE, CHEIAS, REVISAO2]) {
    for (const q of todosOsQuadros(r)) {
      const nossos = [q.titulo, q.legenda, q.vazio, q.estado.info.texto, ...q.notas.filter((n) => !/Endereço medido/.test(n)), ...q.secoes.flatMap((s) => [s.titulo, s.resumo])];
      for (const b of blocos(q)) {
        if (b.tipo === 'texto') nossos.push(b.texto);
        if (b.tipo === 'tabela') nossos.push(b.titulo, b.nota, ...b.colunas.map((c) => c.rotulo));
        if (b.tipo === 'numeros') nossos.push(b.titulo, ...b.itens.map((n) => n.rotulo));
      }
      for (const t of nossos.filter((x) => typeof x === 'string')) assert.equal(TRAVESSAO.test(t), false, `${q.id}: ${t}`);
    }
  }
  // As CÉLULAS também (o dado ausente era o travessão sozinho na célula; a
  // ordem do dono trocou pelo ponto). Travessão em célula só quando veio de
  // fora, no texto do site ou da API.
  const deFora = [];
  const andar = (x) => {
    if (typeof x === 'string') { if (TRAVESSAO.test(x)) deFora.push(x); }
    else if (Array.isArray(x)) x.forEach(andar);
    else if (x && typeof x === 'object') Object.values(x).forEach(andar);
  };
  andar([VARIEDADE.fontes, CHEIAS.fontes, REVISAO2.fontes]);
  const veioDeFora = (t) => deFora.some((s) => s.includes(t.replace(/…$/, '')) || t.includes(s));
  for (const r of [VARIEDADE, CHEIAS, REVISAO2]) {
    for (const q of todosOsQuadros(r)) {
      for (const b of blocos(q)) {
        if (b.tipo !== 'tabela') continue;
        for (const l of b.linhas) {
          for (const c of l.celulas) {
            if (c.vazio) assert.equal(c.texto, AUSENTE, `${q.id}: célula vazia sem o ponto`);
            for (const t of [c.texto, c.titulo].filter((x) => typeof x === 'string')) {
              if (TRAVESSAO.test(t)) assert.ok(veioDeFora(t), `${q.id}: travessão na célula: ${t}`);
            }
          }
        }
      }
    }
  }
  assert.equal(TRAVESSAO.test(AUSENTE), false, 'o marcador de ausente não é travessão');
});
