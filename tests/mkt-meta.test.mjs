// O conector da Meta (Página, Instagram, anúncios e Pixel) rodado com um
// fetch de mentira e fixtures fictícias (tests/fixtures/mkt-meta, no formato
// da documentação oficial). Nenhuma chamada real, nenhum token real.
//
// Começa pelo caso ruim: token morto, Página não atribuída, métrica que a
// Meta tirou do ar, limite de chamadas, tempo acabando. Guarda que nunca
// dispara não prova nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as meta from '../supabase/functions/_shared/mkt-fontes/meta.mjs';

const fx = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/mkt-meta/${nome}.json`, import.meta.url), 'utf8'));
const TOKEN = 'TOKEN-DO-USUARIO-DO-SISTEMA-FICTICIO';
const TOKEN_PAGINA = 'TOKEN-DA-PAGINA-FICTICIO';
const HOJE = '2026-10-12'; // segunda-feira: a semana de 05/10 acabou de fechar
const PAGE = '100000000000001', IG = '17841400000000001', ACT = 'act_1000000001', PIX = meta.PIXEL_PADRAO;
const CANAIS = [
  { codigo: 'site', url_perfil: 'https://impresilk.com.br' },
  { codigo: 'facebook', url_perfil: 'https://www.facebook.com/impresilk.exemplo' },
  { codigo: 'instagram', url_perfil: 'https://www.instagram.com/impresilk_exemplo/' },
];
const TRAVESSAO = /[–—]/;

class ErroHttp extends Error {
  constructor(status, corpo) { super(`HTTP ${status}`); this.status = status; this.corpo = corpo; }
}
const erroMeta = (nome, status = 400) => new ErroHttp(status, fx(nome));

/** Devolve só as métricas pedidas; métrica em `recusar` derruba a chamada
 *  inteira com o erro 100, como a Meta faz. */
function filtrar(f, metricas, recusar = []) {
  if (metricas.some((m) => recusar.includes(m))) throw erroMeta('erro-metrica');
  return { ...f, data: f.data.filter((d) => metricas.includes(d.name)) };
}

/** A Meta de mentira: responde pelo caminho e pelos parâmetros. */
function rotaPadrao(u) {
  const p = u.pathname.replace(/^\/v26\.0/, '');
  const q = Object.fromEntries(u.searchParams);
  const metricas = (q.metric || '').split(',').filter(Boolean);
  switch (p) {
    case '/me/accounts': return fx('me-accounts');
    case `/${PAGE}`: return fx('pagina');
    case `/${PAGE}/insights`:
      if (q.period === 'day') return filtrar(fx('pagina-insights-dia'), metricas);
      if (q.period === 'week') return filtrar(fx('pagina-insights-semana'), metricas);
      if (q.period === 'days_28') return filtrar(fx('pagina-insights-28'), metricas);
      // page_follows_city não está na referência: a Meta recusa.
      return filtrar(fx('pagina-lugares'), metricas, ['page_follows_city']);
    case `/${PAGE}/published_posts`: return q.after === 'B' ? fx('posts-p2') : fx('posts-p1');
    case `/${PAGE}/video_reels`: throw erroMeta('erro-permissao');
    case `/${IG}`: return fx('ig-conta');
    case `/${IG}/insights`:
      if (q.breakdown === 'media_product_type') return fx('ig-insights-quebra');
      if (q.breakdown === 'follow_type' && metricas.includes('follows_and_unfollows')) return fx('ig-seguir');
      // A lista que a API v26.0 aceita (12/10/2026). follower_type, o nome da
      // documentação para as visualizações, é recusado com esta mensagem.
      if (q.breakdown && !['country', 'city', 'age', 'gender', 'follow_type', 'media_product_type', 'contact_button_type'].includes(q.breakdown)) {
        throw new ErroHttp(400, { error: { message: '(#100) breakdown[0] must be one of the following values: country, city, age, gender, follow_type, media_product_type, contact_button_type', type: 'OAuthException', code: 100 } });
      }
      if (['follow_type', 'contact_button_type'].includes(q.breakdown)) return filtrar(fx('ig-quebras'), metricas);
      if (['age', 'city', 'country', 'gender'].includes(q.breakdown)) return { data: fx('ig-demografia')[q.breakdown].filter((d) => metricas.includes(d.name)) };
      if (q.metric_type === 'time_series') return fx('ig-serie');
      return filtrar(fx('ig-insights-semana'), metricas);
    case `/${IG}/media`: return fx('ig-midias');
    case `/${IG}/stories`: return fx('ig-stories');
    case '/me/adaccounts': return fx('adaccounts');
    case `/${ACT}/insights`:
      if (q.level === 'campaign') return q.time_increment === '1' ? fx('ads-campanha-dia') : fx('ads-campanha');
      if (q.breakdowns === 'publisher_platform') return fx('ads-plataforma');
      if (q.time_increment === '7') return fx('ads-semana');
      return fx('ads-dia');
    case `/${ACT}/campaigns`: return fx('campanhas');
    case `/${ACT}/adspixels`: return fx('adspixels');
    case `/${PIX}`: return fx('pixel');
    case `/${PIX}/stats`: return fx({ event: 'pixel-stats-evento', event_source: 'pixel-stats-origem', url: 'pixel-stats-url' }[q.aggregation]);
    case '/dataset_quality': return fx('dataset-quality');
    case '/7001/video_insights': return fx('reel-insights');
    case '/18000000000000001/insights':
      // A mídia do feed não foi compartilhada no Facebook: a Meta dá erro.
      if (metricas.includes('facebook_views')) throw erroMeta('erro-metrica');
      return filtrar(fx('ig-midia-feed'), metricas);
    case '/18000000000000002/insights':
      return metricas.includes('facebook_views') ? filtrar(fx('ig-midia-cruzadas'), metricas) : filtrar(fx('ig-midia-reels'), metricas);
    case '/18000000000000009/insights': throw erroMeta('erro-poucos');
  }
  if (/^\/\d+_\d+\/insights$/.test(p)) return filtrar(metricas.some((m) => m.startsWith('post_video')) ? fx('post-video-insights') : fx('post-insights'), metricas);
  throw new Error(`rota não prevista no teste: ${p}`);
}

/** O ctx que a coletora monta, de mentira. `rota(u, n)` pode lançar (erro da
 *  Meta), devolver uma resposta, ou undefined para cair na rota padrão. */
function montar({ env = { META_TOKEN: TOKEN }, rota = null, prazo = () => 100_000, canais = CANAIS, hoje = HOJE } = {}) {
  const pedidos = [];
  const logs = [];
  const ctx = {
    env: (n) => env[n], conexao: null, hoje, canais, prazo, log: (t) => logs.push(t),
    async fetchJson(url, op = {}) {
      pedidos.push({ url, op });
      const u = new URL(url);
      const r = (rota && rota(u, pedidos.length)) ?? rotaPadrao(u);
      return structuredClone(r);
    },
  };
  return { ctx, pedidos, logs };
}
const caminho = (url) => new URL(url).pathname.replace(/^\/v26\.0/, '');
const metricasDe = (url) => (new URL(url).searchParams.get('metric') || '').split(',').filter(Boolean);
const semTravessao = (r) => {
  for (const a of r.avisos) assert.equal(TRAVESSAO.test(a), false, `aviso com travessão: ${a}`);
};
const semToken = (texto) => {
  for (const t of [TOKEN, TOKEN_PAGINA, 'TOKEN-DA-OUTRA-FICTICIO']) assert.equal(texto.includes(t), false, 'token vazou');
};

// ------------------------------------------------------------ casos ruins --

test('sem META_TOKEN: falta_configurar, nenhuma chamada, nada para gravar', async () => {
  const { ctx, pedidos } = montar({ env: {} });
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'falta_configurar');
  assert.equal(pedidos.length, 0);
  assert.deepEqual(Object.keys(r.partes).sort(), ['anuncios', 'instagram', 'pagina', 'pixel']);
  for (const p of Object.values(r.partes)) assert.equal(p.estado, 'falta_configurar');
  assert.deepEqual([r.semanas, r.publicacoes, r.dados], [[], [], {}]);
  semTravessao(r);
  // Token só de espaços é o mesmo que nenhum.
  assert.equal((await meta.coletar(montar({ env: { META_TOKEN: '   ' } }).ctx)).estado, 'falta_configurar');
});

test('token recusado (190) na primeira chamada: reconectar, uma chamada só, nada gravado', async () => {
  const { ctx, pedidos, logs } = montar({ rota: () => { throw erroMeta('erro-token'); } });
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'reconectar');
  assert.equal(pedidos.length, 1, 'token morto não insiste');
  for (const p of Object.values(r.partes)) assert.deepEqual([p.estado, p.codigo], ['reconectar', 'token_invalido']);
  assert.deepEqual([r.semanas, r.publicacoes, r.dados, r.conta], [[], [], {}, null]);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /META_TOKEN/);
  semTravessao(r);
  semToken(JSON.stringify(r) + logs.join('\n'));
  // O texto da Meta não vai para a tela.
  assert.equal(JSON.stringify(r).includes('Session has expired'), false);
});

test('o caso ruim: Story lido minutos depois de publicado não vai para o banco como número final, nem com o título "Story" por cima do digitado', async () => {
  // O Story está no ar há minutos quando a coleta diária passa: o número
  // que a Meta dá é o daquele instante, e depois de 24 h ele some com as
  // métricas (ninguém regrava). Antes: alcance 3 e título "Story" no banco.
  const historia = { data: [{ id: '18000000000000077', media_type: 'IMAGE', media_product_type: 'STORY', permalink: 'https://www.instagram.com/stories/impresilk_exemplo/18000000000000077/', timestamp: '2026-10-12T08:50:00+0000' }] };
  const numeros = { data: ['views', 'reach', 'replies', 'shares', 'follows', 'profile_visits', 'profile_activity', 'total_interactions', 'reposts', 'link_clicks']
    .map((name) => ({ name, period: 'lifetime', values: [{ value: 3 }] })) };
  const { ctx } = montar({ rota: (u) => {
    const p = caminho(u.href);
    if (p === `/${IG}/stories`) return historia;
    if (p === '/18000000000000077/insights') return metricasDe(u.href).includes('facebook_views') ? { data: [] } : u.searchParams.get('breakdown') ? { data: [] } : numeros;
    return undefined;
  } });
  const antes = Date.now();
  const r = await meta.coletar(ctx);
  const pub = r.publicacoes.find((p) => p.url.includes('/stories/'));
  assert.deepEqual(pub, { canal: 'instagram', url: 'https://www.instagram.com/stories/impresilk_exemplo/18000000000000077', data: '2026-10-12', titulo: null });
  for (const k of ['alcance', 'impressoes', 'engajamento', 'cliques']) assert.equal(k in pub, false, `${k} do Story foi para o banco`);
  // A leitura fica nos dados, com a hora e marcada como parcial.
  const s = r.dados.instagram.stories[0];
  assert.deepEqual([s.alcance, s.visualizacoes, s.parcial], [3, 3, true]);
  assert.ok(Date.parse(s.lido_em) >= antes - 1000, s.lido_em);
  // Reel do Facebook sem descrição: título null, nunca "Reel".
  assert.equal(meta.publicacaoDoReel({ link: 'https://www.facebook.com/reel/1', data: '2026-10-12', titulo: null, reproducoes: 5 }).titulo, null);
  // E a mídia do feed continua com os números.
  assert.ok('alcance' in r.publicacoes.find((p) => p.url === 'https://www.instagram.com/p/AbCdEf1'));
});

test('o caso ruim: o motivo da parte é frase para gente; o código vai em "codigo"', async () => {
  // Antes, a tela recebia "falha_provedor" e "pagina_nao_atribuida" como texto.
  const frase = (m) => typeof m === 'string' && /[.]$/.test(m) && !/^[a-z_]+$/.test(m) && !/\b[a-z]+_[a-z_]+\b/.test(m) && !TRAVESSAO.test(m);
  const casos = [
    montar({ env: {} }),
    montar({ rota: () => { throw erroMeta('erro-token'); } }),
    montar({ rota: (u) => (caminho(u.href) === '/me/accounts' ? { data: [] } : undefined) }),
    montar({ rota: (u) => { if (caminho(u.href) === `/${ACT}/insights`) throw erroMeta('erro-limite'); return undefined; } }),
    montar({ rota: (u) => { const p = caminho(u.href); if (p === `/${PAGE}/insights` || p === `/${PAGE}/published_posts`) throw new ErroHttp(500, null); return undefined; } }),
  ];
  let vistos = 0;
  for (const { ctx } of casos) {
    const r = await meta.coletar(ctx);
    for (const [nome, p] of Object.entries(r.partes)) {
      if (!('codigo' in p)) { assert.equal('motivo' in p, false, nome); continue; }
      vistos++;
      assert.ok(frase(p.motivo), `${nome}: "${p.motivo}"`);
      assert.equal(p.motivo, meta.MOTIVOS[p.codigo]);
    }
  }
  assert.ok(vistos >= 10, String(vistos));
  for (const [c, f] of Object.entries(meta.MOTIVOS)) assert.ok(frase(f), `${c}: ${f}`);
});

test('o caso ruim: aviso concorda com o número (1 mídia, 1 linha, 1 post) e o nome da Página não leva travessão', async () => {
  const contas = fx('me-accounts');
  contas.data[0].name = 'Impresilk \u2013 Comunicação Visual';
  const { ctx } = montar({ canais: [CANAIS[0]], rota: (u) => (caminho(u.href) === '/me/accounts' ? contas : undefined) });
  const r = await meta.coletar(ctx);
  // A fixture tem 1 Story com menos de 5 espectadores e 1 linha estranha no Pixel.
  assert.ok(r.avisos.includes('Instagram: 1 mídia ficou sem números nesta coleta (Story com menos de 5 espectadores não tem número).'), r.avisos.join(' | '));
  assert.ok(r.avisos.includes('Pixel: 1 linha das estatísticas por evento veio num formato desconhecido e ficou fora.'), r.avisos.join(' | '));
  assert.ok(!r.avisos.some((a) => /\b1 (mídias|linhas|posts)\b/.test(a)));
  // Duas Páginas e nenhuma casa com o link (o canal facebook não está na lista):
  // o aviso cita a escolhida, com a meia-risca trocada.
  const escolhida = r.avisos.find((a) => /foi usada a primeira/.test(a));
  assert.ok(escolhida && escolhida.includes('Impresilk - Comunicação Visual'), escolhida);
  semTravessao(r);
});

test('HTTP 401 sem corpo, e corpo de erro devolvido em vez de lançado, também são reconectar', async () => {
  const a = await meta.coletar(montar({ rota: () => { throw new ErroHttp(401, null); } }).ctx);
  assert.equal(a.estado, 'reconectar');
  // Uma coletora que devolve o JSON da Graph sem lançar: o conector confere.
  const m = montar({ rota: () => fx('erro-token') });
  const b = await meta.coletar(m.ctx);
  assert.equal(b.estado, 'reconectar');
  assert.equal(m.pedidos.length, 1);
});

test('token que morre no meio (Instagram): para na hora, nenhuma chamada depois', async () => {
  let morreuEm = null;
  const { ctx, pedidos } = montar({
    rota: (u, n) => {
      if (caminho(u.href) === `/${IG}/insights`) { morreuEm ??= n; throw erroMeta('erro-token'); }
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'reconectar');
  assert.equal(pedidos.length, morreuEm, 'nada foi pedido depois do token morto');
  assert.deepEqual([r.semanas, r.publicacoes, r.dados], [[], [], {}]);
});

test('Página não atribuída: Página e Instagram falta_conectar; anúncios e Pixel seguem; estado parcial', async () => {
  const { ctx, pedidos } = montar({ rota: (u) => (caminho(u.href) === '/me/accounts' ? { data: [] } : undefined) });
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'parcial');
  assert.deepEqual([r.partes.pagina.estado, r.partes.pagina.codigo], ['falta_conectar', 'pagina_nao_atribuida']);
  assert.deepEqual([r.partes.instagram.estado, r.partes.instagram.codigo], ['falta_conectar', 'pagina_nao_atribuida']);
  assert.equal(r.partes.anuncios.estado, 'ok');
  assert.equal(r.partes.pixel.estado, 'ok');
  assert.equal(r.dados.pagina, undefined, 'parte sem dado fica fora: a coletora guarda o retrato anterior');
  assert.equal(r.dados.instagram, undefined);
  assert.ok(r.dados.anuncios && r.dados.pixel);
  assert.deepEqual([r.semanas, r.publicacoes], [[], []]);
  assert.ok(r.avisos.some((a) => /atribua a Página/.test(a)));
  assert.equal(pedidos.some((p) => caminho(p.url).startsWith(`/${PAGE}`) || caminho(p.url).startsWith(`/${IG}`)), false);
  semTravessao(r);
});

test('métrica que a Meta tirou do ar: null e aviso, nunca zero; as outras do lote seguem; não é pedida de novo', async () => {
  const { ctx, pedidos, logs } = montar({
    rota: (u) => {
      const p = caminho(u.href), q = u.searchParams, ms = metricasDe(u.href);
      if (p === `/${PAGE}/insights` && q.get('period') === 'day') return filtrar(fx('pagina-insights-dia'), ms, ['page_post_engagements']);
      if (p === `/${IG}/insights` && !q.get('breakdown') && q.get('metric_type') === 'total_value') return filtrar(fx('ig-insights-semana'), ms, ['views']);
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'ok', 'métrica sumida não derruba a coleta');
  const pg = r.dados.pagina;
  assert.ok(pg.por_dia.every((d) => d.engajamento === null), 'engajamento sem métrica é null');
  assert.ok(pg.por_dia.some((d) => d.visualizacoes === 100), 'as outras métricas do lote vieram');
  assert.ok(pg.por_semana.every((s) => s.engajamento === null));
  const fb = r.semanas.filter((s) => s.canal === 'facebook');
  assert.ok(fb.every((s) => !('engajamento' in s.numeros)), 'número ausente não vai para o banco (nem como zero)');
  // O CASO RUIM (revisão de 12/10): o aviso dizia "a Meta recusou a métrica
  // page_follows_city", o nome da API, que não diz nada a quem lê. Uma frase
  // por parte, com todas as recusadas pelo nome para gente; o nome da API vai
  // só para o diário.
  assert.ok(r.avisos.includes('Página: a Meta recusou o engajamento dos posts e os seguidores por cidade; esses números ficam vazios.'), r.avisos.join(' | '));
  assert.ok(r.avisos.includes('Instagram: a Meta recusou as visualizações; esse número fica vazio.'), r.avisos.join(' | '));
  assert.equal(r.avisos.some((a) => /page_|_unique|\bviews\b/.test(a)), false, 'nome da API não vai para o aviso');
  assert.ok(logs.some((l) => /page_post_engagements/.test(l) && /page_follows_city/.test(l)), logs.join(' | '));
  assert.ok(logs.some((l) => /instagram: métricas recusadas views/.test(l)));
  // 12/10/2026: o diário leva também a mensagem da Meta, que diz o porquê.
  assert.ok(logs.some((l) => l.includes('métricas recusadas views em conta (código 100: (#100) The value must be a valid insights metric)')), logs.join(' | '));
  // Métrica que esta lista não conhece vira "uma das métricas", nunca o nome cru.
  assert.equal(meta.avisoDeMetricasRecusadas('Pixel', ['metrica_nova_da_meta']), 'Pixel: a Meta recusou uma das métricas; esse número fica vazio.');
  // Instagram: o lote da 1ª semana cai, a busca da culpada acontece uma vez,
  // e as 7 semanas seguintes já não pedem "views".
  const igSemana = pedidos.filter((p) => caminho(p.url) === `/${IG}/insights` && !new URL(p.url).searchParams.get('breakdown') && new URL(p.url).searchParams.get('metric_type') === 'total_value');
  assert.equal(igSemana.filter((p) => metricasDe(p.url).includes('views')).length, 2, 'o lote que caiu e a pergunta sozinha');
  assert.equal(igSemana.length, 1 + 11 + 7);
  const ig = r.dados.instagram.por_semana;
  assert.ok(ig.every((s) => s.visualizacoes === null));
  assert.ok(ig.every((s) => s.alcance === 2240));
  assert.ok(r.semanas.filter((s) => s.canal === 'instagram').every((s) => !('impressoes' in s.numeros)));
  semTravessao(r);
});

test('parte que montou o retrato e depois falhou fica fora de dados (a coletora guarda o anterior)', async () => {
  // O nó da Página vem, mas os insights e os posts caem com 500: nenhuma
  // etapa boa. Um retrato pela metade não pode substituir o da coleta anterior.
  const { ctx } = montar({
    rota: (u) => {
      const p = caminho(u.href);
      if (p === `/${PAGE}/insights` || p === `/${PAGE}/published_posts`) throw new ErroHttp(500, null);
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  assert.deepEqual([r.partes.pagina.estado, r.partes.pagina.codigo], ['erro', 'falha_provedor']);
  assert.equal(r.dados.pagina, undefined);
  assert.equal(r.semanas.some((s) => s.canal === 'facebook'), false);
  assert.equal(r.publicacoes.some((s) => s.canal === 'facebook'), false);
  assert.equal(r.partes.instagram.estado, 'ok');
  assert.equal(r.estado, 'parcial');
  // O código (HTTP 500) vai para o diário; o aviso é para gente.
  assert.ok(r.avisos.includes('Página: a Meta não entregou os números da Página.'), r.avisos.join(' | '));
  assert.equal(r.avisos.some((a) => /HTTP|código \d/.test(a)), false);
});

test('parte parcial: a chave da etapa que não rodou fica ausente, não vazia', async () => {
  // A coletora junta campo a campo numa parte parcial: `posts: []` apagaria
  // os posts da coleta anterior. Aqui os posts caem; os números da Página vêm.
  const { ctx } = montar({ rota: (u) => { if (caminho(u.href) === `/${PAGE}/published_posts`) throw new ErroHttp(503, null); return undefined; } });
  const r = await meta.coletar(ctx);
  assert.deepEqual([r.partes.pagina.estado, r.partes.pagina.codigo], ['parcial', 'falha_provedor']);
  assert.equal('posts' in r.dados.pagina, false);
  assert.equal(r.dados.pagina.por_dia.length, 56);
  assert.equal(r.publicacoes.some((x) => x.canal === 'facebook' && x.url.includes('/posts/')), false);
});

test('posts: se a Meta recusar o since, o recuo vai sem ele e com os campos básicos; o corte de 90 dias é local', async () => {
  const { ctx, pedidos } = montar({
    rota: (u) => {
      if (caminho(u.href) === `/${PAGE}/published_posts` && u.searchParams.has('since')) throw erroMeta('erro-metrica');
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  const posts = pedidos.filter((p) => caminho(p.url) === `/${PAGE}/published_posts`);
  assert.equal(posts.length, 3, 'o pedido recusado, o recuo e a página 2');
  assert.equal(new URL(posts[1].url).searchParams.has('since'), false);
  assert.deepEqual(r.dados.pagina.posts.map((p) => p.id), [`${PAGE}_9001`, `${PAGE}_9002`]);
  assert.ok(r.avisos.some((a) => /Página: a Meta recusou parte dos campos de os posts/.test(a)));
  assert.equal(r.partes.pagina.estado, 'ok');
});

test('Pixel não atribuído (100/33): falta_conectar só no Pixel, o resto ok', async () => {
  const { ctx } = montar({ rota: (u) => { if (caminho(u.href) === `/${PIX}`) throw erroMeta('erro-nao-existe'); return undefined; } });
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'parcial');
  assert.deepEqual([r.partes.pixel.estado, r.partes.pixel.codigo], ['falta_conectar', 'pixel_nao_atribuido']);
  assert.equal(r.dados.pixel, undefined);
  for (const p of ['pagina', 'instagram', 'anuncios']) assert.equal(r.partes[p].estado, 'ok', p);
  assert.ok(r.avisos.some((a) => /Usar conjunto de dados de eventos/.test(a)));
});

test('limite de chamadas da conta de anúncios (80004): anúncios erro, sem repetir; o resto segue', async () => {
  let vezes = 0;
  const { ctx } = montar({ rota: (u) => { if (caminho(u.href) === `/${ACT}/insights`) { vezes++; throw erroMeta('erro-limite'); } return undefined; } });
  const r = await meta.coletar(ctx);
  assert.equal(vezes, 1, 'pedido de calma não é insistência');
  assert.deepEqual([r.partes.anuncios.estado, r.partes.anuncios.codigo], ['erro', 'limite_de_chamadas']);
  assert.equal(r.dados.anuncios, undefined);
  assert.equal(r.partes.pixel.estado, 'ok', 'limite de conta de anúncio não freia o Pixel');
  assert.equal(r.estado, 'parcial');
  assert.ok(r.avisos.some((a) => /pediu calma/.test(a)));
});

test('limite do app (código 4): freia todas as partes seguintes, sem novas chamadas', async () => {
  let n4 = null;
  const { ctx, pedidos } = montar({
    rota: (u, n) => {
      if (caminho(u.href) === '/me/adaccounts') { n4 = n; throw new ErroHttp(400, { error: { code: 4, message: 'Application request limit reached' } }); }
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  assert.equal(pedidos.length, n4, 'depois do código 4 nada mais é pedido');
  assert.deepEqual([r.partes.anuncios.codigo, r.partes.pixel.codigo], ['limite_de_chamadas', 'limite_de_chamadas']);
  assert.equal(r.partes.pagina.estado, 'parcial', 'a Página tinha números; os posts ficaram para a próxima');
  assert.equal(r.estado, 'parcial');
});

test('tempo acabando: para de chamar antes da folga e sai parcial', async () => {
  let pedidosFeitos = 0;
  const m = montar({ prazo: () => (pedidosFeitos < 6 ? 100_000 : meta.MARGEM_MS - 1) });
  const fetch = m.ctx.fetchJson;
  m.ctx.fetchJson = async (...a) => { pedidosFeitos++; return fetch(...a); };
  const r = await meta.coletar(m.ctx);
  assert.equal(m.pedidos.length, 6, 'nenhuma chamada nova sem folga de tempo');
  assert.equal(r.estado, 'parcial');
  assert.ok(Object.values(r.partes).some((p) => p.codigo === 'prazo' && p.motivo === meta.MOTIVOS.prazo));
  assert.ok(r.avisos.some((a) => /tempo da coleta acabou/.test(a)));
  semTravessao(r);
});

test('o token vai só no cabeçalho, só para o graph.facebook.com, e nunca sai em dados, avisos ou log', async () => {
  const { ctx, pedidos, logs } = montar();
  const r = await meta.coletar(ctx);
  assert.ok(pedidos.length > 40);
  for (const { url, op } of pedidos) {
    assert.ok(url.startsWith(`${meta.BASE_GRAPH}/`), url);
    semToken(url);
    assert.equal(new URL(url).searchParams.has('access_token'), false);
    assert.equal(op.method, 'GET', 'só leitura');
    assert.match(op.headers.Authorization, /^Bearer /);
    // Página e post com o token da Página; o resto com o do usuário do sistema.
    const p = caminho(url);
    const daPagina = p.startsWith(`/${PAGE}`) || /^\/\d+_\d+\//.test(p) || p.startsWith('/7001/');
    assert.equal(op.headers.Authorization, `Bearer ${daPagina ? TOKEN_PAGINA : TOKEN}`, p);
  }
  semToken(JSON.stringify(r) + logs.join('\n'));
  assert.equal(JSON.stringify(r).includes('Bearer'), false);
});

test('próxima página de outro endereço não é seguida (o token não sai do graph.facebook.com)', async () => {
  const { ctx, pedidos } = montar({
    rota: (u) => {
      if (caminho(u.href) === `/${PAGE}/published_posts`) return { ...fx('posts-p1'), paging: { next: `https://evil.example.com/v26.0/${PAGE}/published_posts?after=B` } };
      return undefined;
    },
  });
  await meta.coletar(ctx);
  assert.equal(pedidos.some((p) => !p.url.startsWith('https://graph.facebook.com/')), false);
  assert.equal(pedidos.filter((p) => caminho(p.url) === `/${PAGE}/published_posts`).length, 1);
  assert.equal(meta.proximaPagina({ paging: { next: 'http://graph.facebook.com/v26.0/x?after=1' } }), null, 'sem https não');
  assert.equal(meta.proximaPagina({ paging: { next: 'https://graph.facebook.com.evil.example/v26.0/x' } }), null);
  assert.equal(meta.proximaPagina({ paging: { next: 'https://graph.facebook.com:8443/v26.0/x' } }), null);
  // Token e date_format que vierem no link saem; a versão vira a nossa.
  assert.equal(meta.proximaPagina({ paging: { next: 'https://graph.facebook.com/v25.0/1/feed?access_token=XYZ&date_format=U&after=QQ' } }),
    'https://graph.facebook.com/v26.0/1/feed?after=QQ');
});

test('v26: uma versão só, nada de GET /?ids= nem date_format', async () => {
  const { ctx, pedidos } = montar();
  await meta.coletar(ctx);
  assert.equal(meta.VERSAO_GRAPH, 'v26.0');
  for (const { url } of pedidos) {
    const u = new URL(url);
    assert.ok(u.pathname.startsWith('/v26.0/') && u.pathname.length > '/v26.0/'.length, url);
    assert.equal(u.searchParams.has('ids'), false);
    assert.equal(u.searchParams.has('date_format'), false);
  }
  assert.throws(() => meta.montarUrl('/', { ids: '1,2' }));
  assert.throws(() => meta.montarUrl('/../x'));
});

test('Página sem a tarefa Insights: nem pede insights da Página; o retrato e os posts seguem', async () => {
  const contas = fx('me-accounts');
  contas.data[0].tasks = ['CREATE_CONTENT'];
  const { ctx, pedidos } = montar({ rota: (u) => (caminho(u.href) === '/me/accounts' ? contas : undefined) });
  const r = await meta.coletar(ctx);
  assert.equal(pedidos.some((p) => caminho(p.url) === `/${PAGE}/insights`), false);
  assert.deepEqual([r.partes.pagina.estado, r.partes.pagina.codigo], ['parcial', 'sem_tarefa_insights']);
  assert.equal(r.dados.pagina.seguidores, 4210);
  assert.ok(r.dados.pagina.posts.length > 0);
  assert.equal('por_dia' in r.dados.pagina || 'por_semana' in r.dados.pagina, false, 'etapa que não rodou não traz chave');
  // Só o retrato de seguidores (segunda-feira) vai para a semana.
  assert.deepEqual(r.semanas.filter((s) => s.canal === 'facebook'), [{ canal: 'facebook', semana: '2026-10-05', numeros: { seguidores: 4210 } }]);
});

test('canal inativo no Painel não recebe números nem publicações', async () => {
  const { ctx } = montar({ canais: CANAIS.filter((c) => c.codigo !== 'instagram') });
  const r = await meta.coletar(ctx);
  assert.equal(r.semanas.some((s) => s.canal === 'instagram'), false);
  assert.equal(r.publicacoes.some((p) => p.canal === 'instagram'), false);
  assert.ok(r.dados.instagram, 'o retrato para a tela continua');
  assert.ok(r.avisos.some((a) => /canal instagram não está ativo/.test(a)));
});

// ---------------------------------------------------------- caminho bom --

test('coleta completa: estado ok, conta, partes e janela de 8 semanas fechadas', async () => {
  const { ctx } = montar();
  const r = await meta.coletar(ctx);
  assert.equal(r.estado, 'ok');
  assert.equal(r.conta, 'Impresilk Exemplo e @impresilk_exemplo');
  for (const p of ['pagina', 'instagram', 'anuncios', 'pixel']) {
    assert.equal(r.partes[p].estado, 'ok', p);
    assert.match(r.partes[p].coletado_em, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.equal(r.dados.versao_api, 'v26.0');
  assert.equal(r.dados.janela.semanas.length, 8);
  assert.deepEqual(r.dados.janela.semanas[0], { semana: '2026-08-17', fim: '2026-08-23' });
  assert.deepEqual(r.dados.janela.semanas[7], { semana: '2026-10-05', fim: '2026-10-11' });
  assert.equal(r.dados.janela.publicacoes_desde, '2026-07-14');
  semTravessao(r);
  // Avisos esperados do caminho bom (nada de erro calado):
  assert.ok(r.avisos.some((a) => /os seguidores por cidade/.test(a)));
  assert.ok(r.avisos.some((a) => /Reels do Facebook ficaram fora/.test(a)));
  assert.ok(r.avisos.some((a) => /Story com menos de 5 espectadores/.test(a)));
});

test('Página: dia a dia pelo fuso do Pacífico, semana só com os 7 dias, alcance do domingo', async () => {
  const r = await meta.coletar(montar().ctx);
  const pg = r.dados.pagina;
  assert.equal(pg.id, PAGE);
  assert.equal(pg.escolhida_por, 'link');
  assert.deepEqual([pg.seguidores, pg.nota, pg.check_ins, pg.alcance_28_dias, pg.alcance_28_dias_ate], [4210, 4.8, 310, 2950, '2026-10-10']);
  assert.deepEqual(pg.seguidores_por_pais, { BR: 4100, PT: 12 });
  assert.equal(pg.seguidores_por_cidade, null, 'métrica recusada é null');
  assert.equal(pg.tarefas.includes('ANALYZE'), true);
  assert.equal('instagram' in pg, false);
  assert.equal(pg.reels, null, 'a Meta não deixou listar os Reels: null, não lista vazia');
  assert.equal(pg.por_dia.length, 56);
  // end_time 2026-08-18T07:00Z fecha o dia 17/08 (meia-noite do Pacífico).
  assert.deepEqual([pg.por_dia[0].dia, pg.por_dia[0].visualizacoes], ['2026-08-17', 100]);
  assert.equal(pg.por_dia.find((d) => d.dia === '2026-10-01').visualizacoes, null);
  assert.deepEqual(pg.por_dia[0].reacoes, {}, 'dia sem reação é objeto vazio, não null');
  const s = Object.fromEntries(pg.por_semana.map((x) => [x.semana, x]));
  // 1ª semana: dias 0..6 -> 100..106 = 721; alcance do domingo 23/08 (i=6) = 506.
  assert.deepEqual([s['2026-08-17'].visualizacoes, s['2026-08-17'].alcance, s['2026-08-17'].dias_com_dado], [721, 506, 7]);
  assert.equal(s['2026-08-17'].engajamento, 10 + 11 + 12 + 13 + 14 + 10 + 11);
  assert.deepEqual([s['2026-08-17'].novos_seguidores, s['2026-08-17'].deixaram_de_seguir], [14, 7]);
  // Semana com um dia faltando: sem soma (seria menor que o real).
  assert.deepEqual([s['2026-09-28'].visualizacoes, s['2026-09-28'].dias_com_dado], [null, 6]);
  assert.notEqual(s['2026-09-28'].engajamento, null);
});

test('números da semana: facebook e instagram, só semana fechada, seguidores só na segunda', async () => {
  const r = await meta.coletar(montar().ctx);
  const fb = r.semanas.filter((x) => x.canal === 'facebook');
  assert.equal(fb.length, 8);
  assert.deepEqual(fb[0], { canal: 'facebook', semana: '2026-08-17', numeros: { alcance: 506, impressoes: 721, engajamento: 81, cliques: 6 } });
  assert.equal('impressoes' in fb.find((x) => x.semana === '2026-09-28').numeros, false);
  assert.equal(fb[7].numeros.seguidores, 4210, 'retrato de segunda vai para a semana que acabou de fechar');
  assert.ok(fb.slice(0, 7).every((x) => !('seguidores' in x.numeros)), 'semana velha não recebe o retrato de hoje');
  const ig = r.semanas.filter((x) => x.canal === 'instagram');
  assert.equal(ig.length, 8);
  assert.deepEqual(ig[0], { canal: 'instagram', semana: '2026-08-17', numeros: { alcance: 2240, impressoes: 9100, engajamento: 410, cliques: 18 } });
  // A semana de 05/10 ainda não está madura (a Meta atrasa até 48 h): só o retrato.
  assert.deepEqual(ig[7], { canal: 'instagram', semana: '2026-10-05', numeros: { seguidores: 5230 } });
  for (const x of r.semanas) {
    assert.ok(x.semana <= '2026-10-05');
    assert.equal(meta.janelaSemanas(HOJE).some((w) => w.semana === x.semana), true);
    for (const v of Object.values(x.numeros)) assert.ok(Number.isInteger(v) && v >= 0);
    assert.equal('leads' in x.numeros || 'conversas' in x.numeros, false, 'leads e conversas não vão para o canal');
  }
  // Coletando na terça, nenhum retrato de seguidores entra.
  const terca = await meta.coletar(montar({ hoje: '2026-10-13' }).ctx);
  assert.equal(terca.semanas.some((x) => 'seguidores' in x.numeros), false);
});

test('Instagram: conta, quebras, série, demografia e o aviso de que não é orgânico', async () => {
  const r = await meta.coletar(montar().ctx);
  const ig = r.dados.instagram;
  assert.deepEqual([ig.usuario, ig.seguidores, ig.seguindo, ig.publicacoes_total], ['impresilk_exemplo', 5230, 310, 812]);
  assert.match(ig.observacao, /não são só orgânicos/);
  assert.equal(Object.keys(ig.por_semana[0]).some((k) => /organ/i.test(k)), false);
  assert.deepEqual(ig.por_semana[0].seguir_deixar, { FOLLOWER: 25, NON_FOLLOWER: 4 });
  assert.deepEqual(ig.por_semana.map((s) => s.madura), [true, true, true, true, true, true, true, false]);
  assert.equal(ig.quebras.semana, '2026-09-28', 'quebras da última semana madura');
  assert.deepEqual(ig.quebras.alcance_por_tipo, { CAROUSEL_CONTAINER: 100, POST: 124 });
  assert.equal(ig.quebras.visualizacoes_por_tipo, null);
  assert.deepEqual(ig.quebras.toques_por_botao, { CALL: 6, DIRECTION: 4, TEXT: 5, UNDEFINED: 3 });
  assert.equal(ig.alcance_por_dia.length, 28);
  assert.deepEqual(ig.alcance_por_dia[0], { dia: '2026-09-13', alcance: 300 });
  assert.deepEqual(ig.demografia.seguidores.cidade, { 'Belo Horizonte, Minas Gerais': 2600, 'Contagem, Minas Gerais': 400 });
  assert.equal(ig.demografia.engajados.cidade, null);
});

test('publicações: links normalizados, últimos 90 dias, só os números que vieram', async () => {
  const r = await meta.coletar(montar().ctx);
  const por = Object.fromEntries(r.publicacoes.map((p) => [p.url, p]));
  // Post com foto: utm sai do link; título é a 1ª linha; engajamento = 30 + 5 + 2.
  assert.deepEqual(por['https://www.facebook.com/impresilk.exemplo/posts/pfbid0Exemplo1'], {
    canal: 'facebook', url: 'https://www.facebook.com/impresilk.exemplo/posts/pfbid0Exemplo1', data: '2026-10-08',
    titulo: 'Fachada nova em ACM para cliente de BH', alcance: 800, impressoes: 1200, engajamento: 37, cliques: 35,
  });
  // Vídeo sem texto: título null (não apaga o que existe); sem "shares" com as contagens presentes é 0.
  const video = por['https://www.facebook.com/impresilk.exemplo/videos/9002'];
  assert.deepEqual([video.titulo, video.engajamento], [null, 0]);
  assert.equal(r.publicacoes.some((p) => /pfbid0Antigo|Antiga3/.test(p.url)), false, 'mais velho que 90 dias fica fora');
  // Instagram: igsh sai do link; cliques = profile_activity.
  assert.deepEqual(por['https://www.instagram.com/p/AbCdEf1'], {
    canal: 'instagram', url: 'https://www.instagram.com/p/AbCdEf1', data: '2026-10-09',
    titulo: 'Letreiro em LED pronto para instalar', alcance: 700, impressoes: 900, engajamento: 51, cliques: 4,
  });
  const reel = por['https://www.instagram.com/reel/AbCdEf2'];
  assert.deepEqual([reel.alcance, reel.impressoes, reel.engajamento, 'cliques' in reel], [2500, 3000, 154, false]);
  // Story: entra com link e data, sem número nenhum e sem o título de enfeite
  // (sem legenda, título null: o banco mantém o que a equipe digitou).
  const story = r.publicacoes.find((p) => p.url.includes('/stories/'));
  assert.deepEqual(Object.keys(story).sort(), ['canal', 'data', 'titulo', 'url']);
  assert.equal(story.titulo, null);
  for (const p of r.publicacoes) {
    assert.equal(meta.tituloDe(p.titulo ?? '') === (p.titulo ?? null) || p.titulo === null, true);
    for (const k of ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads']) if (k in p) assert.ok(Number.isInteger(p[k]) && p[k] >= 0, `${k} inteiro`);
    assert.equal('leads' in p, false);
  }
  assert.equal(new Set(r.publicacoes.map((p) => `${p.canal}|${p.url}`)).size, r.publicacoes.length);
});

test('mídias do Instagram: cruzadas com o Facebook em chamada separada, erro só daquela mídia', async () => {
  const { ctx, pedidos } = montar();
  const r = await meta.coletar(ctx);
  const m = Object.fromEntries(r.dados.instagram.midias.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(m), ['18000000000000001', '18000000000000002']);
  assert.deepEqual([m['18000000000000001'].visualizacoes_facebook, m['18000000000000001'].alcance], [null, 700]);
  assert.deepEqual([m['18000000000000002'].visualizacoes_facebook, m['18000000000000002'].visualizacoes_cruzadas], [300, 350]);
  assert.deepEqual([m['18000000000000002'].tempo_medio_reels_ms, m['18000000000000002'].total_visualizacoes], [4200, 3400]);
  assert.equal(m['18000000000000001'].ia, false);
  // A métrica de mídia não leva metric_type (é parâmetro da conta).
  for (const p of pedidos.filter((x) => /^\/18\d+\/insights$/.test(caminho(x.url)))) assert.equal(new URL(p.url).searchParams.has('metric_type'), false);
  // A recusa das cruzadas não vira aviso de métrica sumida.
  assert.equal(r.avisos.some((a) => /facebook_views/.test(a)), false);
  assert.equal(r.dados.instagram.stories[0].visualizacoes, null);
});

test('anúncios: por dia, semana, plataforma e campanha; leads e conversas pelas ações', async () => {
  const r = await meta.coletar(montar().ctx);
  const c = r.dados.anuncios.contas[0];
  assert.deepEqual(r.dados.anuncios.periodo, { inicio: '2026-08-17', fim: HOJE });
  assert.deepEqual([c.id, c.moeda, c.fuso, c.situacao], [ACT, 'BRL', 'America/Sao_Paulo', 'ativa']);
  const d0 = c.por_dia[0];
  assert.deepEqual([d0.dia, d0.gasto, d0.impressoes, d0.alcance, d0.cliques_link, d0.cliques_saida, d0.ctr, d0.leads, d0.conversas], ['2026-10-05', 45.2, 3200, 2100, 50, 12, 2.5, 3, 4]);
  assert.deepEqual(d0.resultados, [{ indicador: 'actions:onsite_conversion.lead_grouped', valor: 3 }]);
  // Dia com entrega e sem a ação de lead: zero (a Meta só lista a ação que aconteceu).
  assert.deepEqual([c.por_dia[1].leads, c.por_dia[1].conversas], [0, 0]);
  assert.equal(c.por_semana.length, 9);
  assert.deepEqual(c.por_semana.map((s) => s.fechada), [true, true, true, true, true, true, true, true, false]);
  assert.deepEqual(c.por_plataforma.map((p) => [p.plataforma, p.leads]), [['facebook', 3], ['instagram', 0]]);
  assert.deepEqual(c.campanhas.map((k) => [k.nome, k.gasto, k.leads]), [['Leads Fachadas BH', 1800.5, 3], ['Tráfego Site', 620, 0], ['Campanha parada', null, null]]);
  assert.deepEqual([c.campanhas[0].orcamento_diario_centavos, c.campanhas[1].orcamento_total_centavos], [5000, 100000]);
  assert.equal(c.campanhas_por_dia.length, 2);
  assert.equal(r.semanas.some((s) => 'gasto' in s.numeros), false);
});

test('Pixel: eventos por dia, origem, páginas sem a consulta (dado pessoal) e qualidade', async () => {
  const { ctx, pedidos } = montar();
  const r = await meta.coletar(ctx);
  const px = r.dados.pixel;
  assert.deepEqual(px.periodo, { inicio: '2026-10-06', fim: '2026-10-11' });
  const p = px.pixels[0];
  assert.equal(px.pixels.length, 1, 'o Pixel da conta é o mesmo: não repete');
  assert.deepEqual([p.id, p.ultimo_disparo, p.correspondencia_automatica], [PIX, '2026-10-11T22:10:00+0000', true]);
  assert.deepEqual(p.eventos_total, { PageView: 260, Lead: 2, Contact: 1 });
  assert.deepEqual(p.eventos_por_dia, [{ dia: '2026-10-07', eventos: { PageView: 200, Lead: 2 } }, { dia: '2026-10-08', eventos: { PageView: 60, Contact: 1 } }]);
  assert.deepEqual(p.por_origem, { WEB: 260 });
  assert.deepEqual(p.urls, [{ url: 'https://impresilk.com.br/', disparos: 153 }, { url: 'https://impresilk.com.br/contato/', disparos: 7 }]);
  assert.equal(JSON.stringify(r).includes('fulano'), false, 'e-mail da consulta não entra no cache');
  assert.deepEqual(p.qualidade[0], { evento: 'PageView', nota: 6.2, chaves: [{ chave: 'ip_address', cobertura: 100 }, { chave: 'email', cobertura: 12.5 }], cobertura_eventos: 0, acr: 0, frequencia_envio: 'real_time' });
  assert.ok(r.avisos.some((a) => /formato desconhecido/.test(a)));
  const stats = pedidos.filter((x) => caminho(x.url) === `/${PIX}/stats`);
  assert.equal(stats.length, 3);
  const q = new URL(stats[0].url).searchParams;
  assert.deepEqual([q.get('start_time'), q.get('end_time')], [String(meta.unixInicioSP('2026-10-06')), String(meta.unixInicioSP('2026-10-12'))]);
});

test('META_APP_SECRET: cada chamada leva o appsecret_proof do token usado, e o segredo não aparece', async () => {
  const SEGREDO = 'SEGREDO-DO-APP-FICTICIO';
  const { ctx, pedidos, logs } = montar({ env: { META_TOKEN: TOKEN, META_APP_SECRET: SEGREDO } });
  const r = await meta.coletar(ctx);
  const provaUsuario = await meta.provaDoSegredo(TOKEN, SEGREDO);
  const provaPagina = await meta.provaDoSegredo(TOKEN_PAGINA, SEGREDO);
  for (const { url, op } of pedidos) {
    const prova = new URL(url).searchParams.get('appsecret_proof');
    assert.equal(prova, op.headers.Authorization === `Bearer ${TOKEN}` ? provaUsuario : provaPagina);
    assert.equal(url.includes(SEGREDO), false);
  }
  assert.equal((JSON.stringify(r) + logs.join('')).includes(SEGREDO), false);
});

// ------------------------------------------------------- funções de leitura --

test('números: ausente é null, nunca zero', () => {
  assert.equal(meta.numeroMeta('12.34'), 12.34);
  assert.equal(meta.numeroMeta(0), 0);
  for (const v of [undefined, null, '', 'abc', NaN, {}, [], '1,5']) assert.equal(meta.numeroMeta(v), null, String(v));
  assert.equal(meta.inteiro('-3'), null);
  assert.equal(meta.inteiro('1500'), 1500);
  assert.equal(meta.inteiro(5e12), 1e9, 'o banco aceita até 1 bilhão');
});

test('erros da Meta: cada código no seu tipo', () => {
  const t = (corpo, status = 400) => meta.classificarErro({ status, corpo }).tipo;
  assert.equal(t(fx('erro-token')), 'token');
  assert.equal(t(null, 401), 'token');
  assert.equal(t({ error: { code: 102 } }), 'token');
  assert.equal(t(fx('erro-permissao')), 'permissao');
  assert.equal(t(fx('erro-poucos')), 'permissao');
  assert.equal(t(fx('erro-nao-existe')), 'permissao', '100/33 é objeto que o token não enxerga');
  assert.equal(t(null, 403), 'permissao');
  assert.equal(t(fx('erro-limite')), 'limite');
  assert.equal(t({ error: { code: 17 } }), 'limite');
  assert.equal(t(null, 429), 'limite');
  assert.equal(t(fx('erro-metrica')), 'invalido');
  assert.equal(t(JSON.stringify(fx('erro-metrica'))), 'invalido', 'corpo em texto também');
  assert.equal(meta.classificarErro(Object.assign(new Error('x'), { name: 'TimeoutError' })).tipo, 'tempo');
  // O ErroFonte da coletora: .codigo, .status e .corpo (o JSON de erro da Meta).
  const erroFonte = (codigo, status, corpo) => Object.assign(new Error(`meta:x: ${codigo}`), { name: 'ErroFonte', codigo, status, corpo });
  assert.equal(meta.classificarErro(erroFonte('tempo', null, null)).tipo, 'tempo');
  assert.equal(meta.classificarErro(erroFonte('nao_autorizado', 401, null)).tipo, 'token');
  assert.equal(meta.classificarErro(erroFonte('nao_autorizado', 403, fx('erro-poucos'))).tipo, 'permissao');
  assert.equal(meta.classificarErro(erroFonte('http', 400, fx('erro-token'))).tipo, 'token', 'a Graph manda 190 com HTTP 400');
  assert.equal(meta.classificarErro(erroFonte('rede', null, null)).tipo, 'falha');
  assert.equal(t(null, 500), 'falha');
  assert.deepEqual(meta.classificarErro({ status: 400, corpo: fx('erro-token') }), { tipo: 'token', status: 400, codigo: 190, subcodigo: 463, mensagem: 'Error validating access token: Session has expired.' });
});

test('datas: o dia do end_time da Meta, a semana fechada e a meia-noite de São Paulo', () => {
  assert.equal(meta.diaDoFimMeta('2026-10-05T07:00:00+0000'), '2026-10-04');
  assert.equal(meta.diaDoFimMeta('2026-12-05T08:00:00+0000'), '2026-12-04', 'inverno do Pacífico');
  assert.equal(meta.diaDoFimMeta('2026-10-05T03:00:00+0000'), '2026-10-04', 'se a Meta mudar para o fuso de SP, ainda acerta');
  assert.equal(meta.diaDoFimMeta('lixo'), null);
  assert.equal(meta.dataSP('2026-10-12T02:30:00+0000'), '2026-10-11', '23h30 de domingo em SP');
  assert.equal(meta.unixInicioSP('2026-10-12'), Date.UTC(2026, 9, 12, 3) / 1000);
  const dom = meta.janelaSemanas('2026-10-11');
  assert.deepEqual(dom[7], { semana: '2026-09-28', fim: '2026-10-04' }, 'no domingo a semana corrente ainda não fechou');
  assert.equal(meta.janelaSemanas('2026-10-12').length, 8);
});

test('insights: lê o exemplo oficial (total_value com quebra) e o formato lifetime', () => {
  const ins = meta.lerInsights(fx('ig-insights-quebra'));
  assert.equal(ins.reach.total, 224);
  assert.deepEqual(ins.reach.quebras.media_product_type, { CAROUSEL_CONTAINER: 100, POST: 124 });
  const post = meta.lerInsights(fx('post-insights'));
  assert.equal(meta.valorDe(post.post_media_view), 1200);
  assert.deepEqual(meta.valorDe(post.post_reactions_by_type_total), { like: 26, love: 4 });
  assert.deepEqual(meta.lerInsights({}), {});
  assert.deepEqual(meta.lerInsights({ data: [{ name: 'reach', total_value: {} }] }).reach.total, null, 'total_value sem valor é null');
});

test('semana da Página: soma só com os 7 dias, alcance do domingo', () => {
  const janela = [{ semana: '2026-10-05', fim: '2026-10-11' }];
  const dias = (n, pular = -1) => ({ valores: Array.from({ length: n }, (_, i) => ({ dia: `2026-10-${String(5 + i).padStart(2, '0')}`, valor: 10 })).filter((_, i) => i !== pular) });
  const completa = meta.semanasDaPagina({ page_media_view: dias(7) }, { page_total_media_view_unique: { valores: [{ dia: '2026-10-11', valor: 33 }, { dia: '2026-10-10', valor: 99 }] } }, janela)[0];
  assert.deepEqual([completa.visualizacoes, completa.alcance, completa.engajamento], [70, 33, null]);
  const buraco = meta.semanasDaPagina({ page_media_view: dias(7, 3) }, {}, janela)[0];
  assert.deepEqual([buraco.visualizacoes, buraco.alcance, buraco.dias_com_dado], [null, null, 6]);
});

test('anúncios: linha sem entrega não tem número; com entrega, ação ausente é zero', () => {
  const vazia = meta.lerLinhaAnuncio({});
  assert.deepEqual([vazia.gasto, vazia.leads, vazia.conversas, vazia.resultados, vazia.cliques_saida], [null, null, null, null, null]);
  const sem = meta.lerLinhaAnuncio({ spend: '1.00', impressions: '10' });
  assert.deepEqual([sem.leads, sem.conversas], [0, 0]);
  // Sem "lead", soma formulário da Meta + Pixel (não se sobrepõem).
  const outra = meta.lerLinhaAnuncio({ impressions: '10', actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '1' }] });
  assert.equal(outra.leads, 3);
  assert.deepEqual(meta.lerAcoes([{ action_type: 'x', value: 'abc' }, { value: '1' }]), {});
});

test('títulos: primeira linha com texto, 200 letras sem partir emoji, sem caractere de controle', () => {
  assert.equal(meta.tituloDe('\n\n  Linha boa  \nresto'), 'Linha boa');
  assert.equal(meta.tituloDe(''), null);
  assert.equal(meta.tituloDe(null), null);
  const longo = '😀'.repeat(250);
  const t = meta.tituloDe(longo);
  assert.equal(Array.from(t).length, 200);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(t), false, 'sem meio emoji');
  assert.equal(meta.tituloDe('a\u0000b'), 'a b');
});

test('escolha da Página e do Instagram pelo link do canal', () => {
  const contas = meta.lerContasPaginas(fx('me-accounts').data);
  assert.equal(contas.length, 2);
  assert.equal(contas[0].token, TOKEN_PAGINA);
  assert.equal(JSON.stringify(contas.map((c) => c.pagina)).includes('TOKEN'), false, 'o token fica fora do retrato');
  assert.equal(meta.escolherPagina(contas, 'https://www.facebook.com/impresilk.exemplo/').pelo, 'link');
  assert.equal(meta.escolherPagina(contas, `https://www.facebook.com/profile.php?id=100000000000002`).pagina.id, '100000000000002');
  assert.deepEqual([meta.escolherPagina(contas, null).pelo, meta.escolherPagina(contas.slice(1), null).pelo], ['primeira', 'unica']);
  assert.equal(meta.escolherPagina([], null), null);
  assert.equal(meta.escolherInstagram(contas, contas[1], 'https://instagram.com/impresilk_exemplo').id, IG);
  assert.equal(meta.escolherInstagram(contas.slice(1), contas[1], null), null);
});

test('appsecret_proof confere com HMAC-SHA256 calculado fora (Python)', async () => {
  assert.equal(await meta.provaDoSegredo('token-de-teste', 'segredo-de-teste'), '752d9f63754040c4f22dfab2102828da32757b5eee22c2d197c0345ebc291af3');
});

test('interface do conector e texto sem travessão no arquivo inteiro', () => {
  assert.equal(meta.FONTE, 'meta');
  assert.deepEqual(meta.SECRETS, ['META_TOKEN']);
  assert.equal(typeof meta.coletar, 'function');
  const fonte = readFileSync(new URL('../supabase/functions/_shared/mkt-fontes/meta.mjs', import.meta.url), 'utf8');
  assert.equal(TRAVESSAO.test(fonte), false, 'travessão no conector');
  assert.match(fonte, /\* -+ FORMATO/);
  // O caso ruim do detector: ele pega travessão de verdade.
  assert.equal(TRAVESSAO.test('a — b'), true);
});

test('a mensagem do erro da Meta vai para o diário: curta, numa linha e sem token', () => {
  const info = meta.classificarErro({ status: 400, corpo: { error: { code: 100, error_subcode: 2108006, message: '(#100) Param start_time\n must be within the last 7 days' } } });
  assert.deepEqual([info.tipo, info.codigo, info.subcodigo, info.mensagem], ['invalido', 100, 2108006, '(#100) Param start_time must be within the last 7 days']);
  assert.equal(meta.descreverCodigo(info), 'código 100/2108006: (#100) Param start_time must be within the last 7 days');
  // Nada com cara de token passa, nem no texto nem num endereço citado.
  const m = meta.mensagemDaMeta({ message: 'Invalid OAuth EAAGm0PX4ZCpsBAABCDEFGHIJKLMNOP for https://graph.facebook.com/x?access_token=EAAxyz123&appsecret_proof=abc&fields=id' });
  assert.equal(/EAA[A-Za-z0-9]{6}|abc&/.test(m), false, m);
  assert.ok(m.includes('access_token=[token]') && m.includes('appsecret_proof=[token]'), m);
  assert.equal(meta.mensagemDaMeta({ message: 'x'.repeat(400) }).length, 160);
  assert.equal(meta.mensagemDaMeta({}), null);
  assert.equal(meta.mensagemDaMeta(null), null);
  // Sem mensagem, o diário fica como antes.
  assert.equal(meta.descreverCodigo({ codigo: 100 }), 'código 100');
  assert.equal(meta.descreverCodigo({ status: 500 }), 'HTTP 500');
});

test('o caso ruim (12/10): as visualizações por seguidor pedem follow_type, o nome que a API aceita', async () => {
  // Com follower_type (o nome da documentação) a Meta respondia "breakdown[0]
  // must be one of ...", e o aviso dizia que as visualizações tinham ficado
  // vazias, mas as da semana tinham vindo.
  const { ctx, pedidos } = montar();
  const r = await meta.coletar(ctx);
  const ig = r.dados.instagram;
  assert.deepEqual(ig.quebras.visualizacoes_por_seguidor, { FOLLOWER: 5100, NON_FOLLOWER: 4000 });
  assert.deepEqual(ig.quebras.alcance_por_seguidor, { FOLLOWER: 1200, NON_FOLLOWER: 1040 });
  const quebras = pedidos.map((p) => new URL(p.url).searchParams.get('breakdown')).filter(Boolean);
  assert.equal(quebras.includes('follower_type'), false);
  assert.equal(r.avisos.some((a) => /visualiza/.test(a)), false, r.avisos.join(' | '));
});

test('divisão recusada não diz que o número sumiu: o aviso fala da divisão, e o número da semana fica', async () => {
  const { ctx, logs } = montar({
    rota: (u) => {
      const q = u.searchParams;
      if (caminho(u.href) === `/${IG}/insights` && q.get('breakdown') === 'follow_type' && metricasDe(u.href).includes('views')) throw erroMeta('erro-metrica');
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  assert.ok(r.avisos.includes('Instagram: a Meta recusou a divisão das visualizações; esse quadro fica vazio.'), r.avisos.join(' | '));
  assert.equal(r.avisos.some((a) => /recusou as visualizações/.test(a)), false);
  assert.ok(r.dados.instagram.por_semana.some((s) => s.visualizacoes != null), 'as visualizações da semana vieram');
  assert.equal(r.dados.instagram.quebras.visualizacoes_por_seguidor, null);
  assert.ok(logs.some((l) => l.includes('views em conta:follow_type (código 100')), logs.join(' | '));
  assert.equal(meta.avisoDeDivisoesRecusadas('Instagram', ['reach', 'views']), 'Instagram: a Meta recusou a divisão do alcance e das visualizações; esses quadros ficam vazios.');
});

test('o caso ruim (12/10): Pixel com as estatísticas negadas ("(#100) Permission Denied"): uma chamada só, aviso claro, o resto do Pixel vem', async () => {
  const { ctx, pedidos, logs } = montar({
    rota: (u) => {
      if (caminho(u.href) === `/${PIX}/stats`) throw new ErroHttp(400, { error: { message: '(#100) Permission Denied', type: 'OAuthException', code: 100 } });
      return undefined;
    },
  });
  const r = await meta.coletar(ctx);
  assert.deepEqual([r.partes.pixel.estado, r.partes.pixel.codigo], ['parcial', 'estatisticas_negadas']);
  assert.match(r.partes.pixel.motivo, /negou ao usuário do sistema/);
  assert.equal(pedidos.filter((x) => caminho(x.url) === `/${PIX}/stats`).length, 1, 'negou uma vez, não pede origem nem página');
  const p = r.dados.pixel.pixels[0];
  assert.equal(p.ultimo_disparo, '2026-10-11T22:10:00+0000');
  assert.ok(Array.isArray(p.qualidade) && p.qualidade.length > 0, 'a qualidade veio');
  assert.deepEqual([p.eventos_por_dia, p.por_origem, p.urls], [null, null, null]);
  assert.equal(r.avisos.filter((a) => a.startsWith('Pixel: a Meta negou')).length, 1);
  assert.ok(logs.some((l) => l.includes('Permission Denied')), logs.join(' | '));
  semTravessao(r);
});
