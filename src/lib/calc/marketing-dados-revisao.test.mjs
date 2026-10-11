// A REVISÃO FINAL DA ABA "DADOS" (11/10/2026): os seis achados, cada um
// pelo caso ruim.
//  1. número que não veio virando 0 ("nota 4,5 em 0 avaliações"; o
//     celular 0 com o computador null virando "Cliques no botão: 0");
//  2. código da API à vista (FOLLOWER, CELEBRATION, EMPLOYEE, ip_address, o
//     post_engagement no title das ações da Meta);
//  3. alvo de toque abaixo da régua (chip de 36px, cabeçalho de 40px, o
//     atalho de navegação com 40px, link de tabela com 17px);
//  4. texto cinza de 2,6:1 no tema claro (o ponto de ausente e o eixo dos
//     gráficos), e o par do escuro;
//  5. o travessão sozinho na célula (a ordem do dono: nada de travessão);
//  6. a semana que ainda não começou somada no período.
// Os retratos são os das duas prévias (src/review/fontes-ficticias*.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUSENTE,
  NAO_INFORMADO,
  NAO_MEDIDO,
  blocoGrafico,
  celula,
  conhecido,
  formatar,
  jaAconteceu,
  nomeDaMoeda,
  nomeDoFuso,
  nomeDoPais,
  separarPorHoje,
  textoDoMapa,
  traduzir,
} from './marketing-dados.js';
import { ligacoesNaAba, quadrosDaLigacao, quadrosDoCanal } from './marketing-dados-canal.js';
import { destaqueDasAvaliacoes, nomeDoAtributo, quadrosPerfilEmpresa } from './marketing-dados-google.js';
import { nomeDaAcao, quadrosAnunciosMeta, quadrosInstagram, quadrosPixelMeta } from './marketing-dados-meta.js';
import { nomeDaAbaLinkedin, quadrosLinkedin, rotuloDoCodigo, situacaoDoDia, textoExtras } from './marketing-dados-social.js';
import { nomeDoCampoAds, quadrosGoogleAds } from './marketing-dados-ads.js';
import { FONTES_DO_CANAL, fontesDoCanal } from './marketing-fontes.js';

const ler = (n) => JSON.parse(readFileSync(new URL(`../../review/${n}`, import.meta.url), 'utf8'));
const lerTexto = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const copia = (x) => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-11';
const ctx = { hoje: HOJE };
const CANAIS = Object.keys(FONTES_DO_CANAL);
const ligacao = (r, canal, fonte, parte = undefined) => copia(fontesDoCanal(canal, r.fontes).find((l) => l.fonte === fonte && (parte === undefined || l.parte === parte)));
const tabelasDa = (q, secaoId) => (q.secoes.find((s) => s.id === secaoId)?.blocos ?? []).filter((b) => b?.tipo === 'tabela');
function celulaDe(tabela, i, rotulo) {
  const k = tabela.colunas.findIndex((c) => c.rotulo === rotulo);
  assert.ok(k >= 0, `coluna "${rotulo}" em ${tabela.colunas.map((c) => c.rotulo).join(', ')}`);
  return tabela.linhas[i].celulas[k];
}
const numeroDe = (q, id) => q.topo.filter((b) => b?.tipo === 'numeros').flatMap((b) => b.itens).find((n) => n.id === id);

/** Todo texto que a tela escreveria de um quadro, com a chave de onde ele
 *  sai (a linha da tabela pelo nome dela, não pela posição: a ordem muda
 *  quando um número some). */
function mapaDeTextos(q) {
  const m = new Map();
  const add = (k, v) => { if (typeof v === 'string') m.set(`${q.id}|${k}`, v); };
  const bloco = (p, b) => {
    if (!b) return;
    if (b.tipo === 'tabela') {
      const vistos = new Map();
      for (const l of b.linhas) {
        const nome = l.celulas[0]?.texto;
        const k = vistos.get(nome) ?? 0;
        vistos.set(nome, k + 1);
        l.celulas.forEach((c, j) => { add(`${p}|${b.titulo}|${nome}#${k}|${b.colunas[j].rotulo}`, c.texto); add(`${p}|${b.titulo}|${nome}#${k}|${b.colunas[j].rotulo}|title`, c.titulo); });
      }
    } else if (b.tipo === 'numeros') for (const n of b.itens) { add(`${p}|n|${n.id}`, n.texto); add(`${p}|nota|${n.id}`, n.nota?.texto); add(`${p}|antes|${n.id}`, n.nota?.antes); }
    else if (b.tipo === 'pares') for (const x of b.itens) add(`${p}|p|${x.rotulo}`, x.texto);
    else if (b.tipo === 'barras') for (const x of b.itens) add(`${p}|b|${b.titulo}|${x.rotulo}`, x.texto);
    else if (b.tipo === 'grafico') { add(`${p}|g`, b.resumo); for (const x of b.pontos) add(`${p}|g|${x.x}`, x.texto); }
    else if (b.tipo === 'lista') for (const x of b.itens) { add(`${p}|l|${x.id}|t`, x.titulo); add(`${p}|l|${x.id}|x`, x.texto); }
    else if (b.tipo === 'texto') add(`${p}|t`, b.texto);
  };
  add('destaque', q.destaque);
  q.notas.forEach((n, i) => add(`nota${i}`, n));
  q.topo.forEach((b, i) => bloco(`topo${i}`, b));
  for (const s of q.secoes) { add(`${s.id}|resumo`, s.resumo); s.blocos.forEach((b, i) => bloco(`${s.id}|${i}`, b)); }
  return m;
}
const ZERO = /(^|[^\d,.])0([^\d,]|$)|R\$\s?0,00|(^|[^\d])0%/;
/** Anula, um por vez, cada número de `raiz` (dentro de fontes[fonte].dados)
 *  e acusa o texto que mudou e passou a ter um zero que não tinha. */
function nuloViraZero(r, fonte, raiz, canal) {
  // Só os quadros da fonte anulada (o canal site tem quatro fontes).
  const montar = (fontes) => new Map(ligacoesNaAba(canal, fontes).filter((l) => l.fonte === fonte).flatMap((l) => quadrosDaLigacao(l, ctx)).flatMap((q) => [...mapaDeTextos(q)]));
  const antes = montar(r.fontes);
  const caminhos = [];
  const andar = (x, p) => {
    if (typeof x === 'number') caminhos.push(p);
    else if (Array.isArray(x)) x.forEach((v, i) => andar(v, [...p, i]));
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) andar(v, [...p, k]);
  };
  let no = r.fontes[fonte].dados;
  for (const k of raiz) no = no[k];
  andar(no, raiz);
  const achados = [];
  for (const p of caminhos) {
    // Só a fonte anulada vai copiada (o retrato inteiro tem 225 kB).
    const f = { ...r.fontes, [fonte]: copia(r.fontes[fonte]) };
    let o = f[fonte].dados;
    for (const k of p.slice(0, -1)) o = o[k];
    o[p.at(-1)] = null;
    for (const [k, v] of montar(f)) {
      const a = antes.get(k);
      if (a === v || !ZERO.test(v) || (a && ZERO.test(a))) continue;
      achados.push(`${p.join('.')} -> ${k}: "${a}" virou "${v}"`);
    }
  }
  return { achados, caminhos: caminhos.length };
}

// ------------------------------------------------- 1. nulo virando zero --

test('1. o caso ruim: o Perfil manda a nota e não o total, e a tela não escreve "em 0 avaliações"', () => {
  const r = copia(CHEIAS);
  r.fontes.google.dados.perfil.avaliacoes.total = null;
  const q = quadrosPerfilEmpresa(fontesDoCanal('google', r.fontes)[0], ctx).find((x) => x.id === 'perfil-avaliacoes');
  assert.equal(q.destaque, 'nota 4,5', 'sem total, sem contagem');
  assert.doesNotMatch(q.destaque, /0 avalia/);
  assert.equal(numeroDe(q, 'total').texto, NAO_MEDIDO);
  // Com o total, a contagem volta; só o total, só a contagem; nada, nada.
  assert.equal(destaqueDasAvaliacoes({ media: 4.5, total: 4 }), 'nota 4,5 em 4 avaliações');
  assert.equal(destaqueDasAvaliacoes({ media: 4.5, total: 0 }), 'nota 4,5 em 0 avaliações', 'o zero medido continua zero');
  assert.equal(destaqueDasAvaliacoes({ media: null, total: 1 }), '1 avaliação');
  assert.equal(destaqueDasAvaliacoes({ media: null, total: null }), null);
  // A base das porcentagens da distribuição: uma nota sem número deixa as
  // barras sem porcentagem (a soma parcial daria porcentagem errada).
  const r2 = copia(CHEIAS);
  r2.fontes.google.dados.perfil.avaliacoes.distribuicao['5'] = null;
  const q2 = quadrosPerfilEmpresa(fontesDoCanal('google', r2.fontes)[0], ctx).find((x) => x.id === 'perfil-avaliacoes');
  const barras = q2.topo.find((b) => b?.tipo === 'barras');
  assert.equal(barras.itens.some((i) => /%/.test(i.texto)), false);
  assert.equal(barras.itens.find((i) => i.rotulo === '5 estrelas').texto, NAO_MEDIDO);
});

test('1. o caso ruim: o LinkedIn manda o celular 0 e não o computador, e a tela não escreve "Cliques no botão: 0"', () => {
  const r = copia(CHEIAS);
  Object.assign(r.fontes.linkedin.dados.visitas.desde_sempre.cliques_botao, { celular: 0, computador: null });
  const q = quadrosLinkedin(fontesDoCanal('linkedin', r.fontes)[0], ctx).find((x) => x.id === 'li-visitas');
  assert.equal(numeroDe(q, 'ds-botao').texto, NAO_MEDIDO, 'computador mais celular é o total: uma parte sem número, total sem número');
  // As duas medidas: a soma; o zero medido continua zero.
  Object.assign(r.fontes.linkedin.dados.visitas.desde_sempre.cliques_botao, { celular: 0, computador: 0 });
  assert.equal(numeroDe(quadrosLinkedin(fontesDoCanal('linkedin', r.fontes)[0], ctx).find((x) => x.id === 'li-visitas'), 'ds-botao').texto, '0');
  Object.assign(r.fontes.linkedin.dados.visitas.desde_sempre.cliques_botao, { celular: 2, computador: 7 });
  assert.equal(numeroDe(quadrosLinkedin(fontesDoCanal('linkedin', r.fontes)[0], ctx).find((x) => x.id === 'li-visitas'), 'ds-botao').texto, '9');
});

test('1. nenhum número das avaliações do Perfil, das visitas do LinkedIn e dos anúncios da Meta vira 0 quando some (um por vez)', () => {
  // A mesma conta do fuzzer da revisão (g-um-nulo.mjs), nas partes em que
  // ele achou o defeito e nas somas do período, para não demorar.
  for (const [fonte, raiz, canal] of [
    ['google', ['perfil', 'avaliacoes'], 'google'],
    ['linkedin', ['visitas', 'desde_sempre'], 'linkedin'],
    ['linkedin', ['posts', 'itens', 1], 'linkedin'],
    ['meta', ['anuncios', 'contas', 0, 'por_semana', 7], 'facebook'],
    ['google_ads', ['locais'], 'site'],
    ['google_ads', ['resumo', 'aparelhos'], 'site'],
    ['pinterest', ['anuncios', 'contas', 0, 'semanas', 0], 'pinterest'],
  ]) {
    const { achados, caminhos } = nuloViraZero(CHEIAS, fonte, raiz, canal);
    assert.ok(caminhos > 0, `${fonte}.${raiz.join('.')}: sem número para anular`);
    assert.deepEqual(achados, [], `${fonte}.${raiz.join('.')}`);
  }
});

test('1. o gráfico em que tudo o que foi medido deu zero não elege "o maior" (e diz quantos ficaram sem medida)', () => {
  const g = blocoGrafico([{ s: '2026-09-21', v: 0 }, { s: '2026-09-28', v: null }, { s: '2026-10-05', v: 0 }], { x: 's', y: 'v', titulo: 'Gasto por semana', tipo: 'moeda', hoje: HOJE });
  assert.equal(g.resumo, 'Gasto por semana, de 21/09 a 05/10: todos os pontos medidos ficaram em zero. 1 ponto sem medida.');
  assert.deepEqual(g.pontos.map((p) => p.y), [0, null, 0]);
});

// ------------------------------------------- 2. código da API à vista --

/** Os textos que a tela escreveria (célula, title, número, par, barra,
 *  lista, aviso, nota) das prévias, com o canal e o quadro. */
function textosDasPrevias() {
  const fora = [];
  for (const r of [VARIEDADE, CHEIAS]) {
    for (const canal of CANAIS) {
      for (const q of quadrosDoCanal(canal, r.fontes, ctx)) for (const [k, v] of mapaDeTextos(q)) fora.push([`${canal}|${k}`, v]);
    }
  }
  return fora;
}
// Código de API: MAIÚSCULAS_COM_TRAÇO, snake_case, camelCase com PageViews,
// código com ponto (onsite_conversion.x), e as palavras em maiúsculas que as
// APIs mandam como valor. Fora daqui: endereço (?page_id=), nome de evento
// do site e do GA4 (é o nome que o dono deu), @usuário e texto de fora.
const CODIGO = /\b(?:[A-Z]{2,}(?:_[A-Z0-9]+)+|[a-z]+(?:_[a-z0-9]+)+(?:\.[a-z_0-9]+)*|[a-z]+[A-Z][A-Za-z]*PageViews|CELEBRATION|EMPLOYEE|FOLLOWER|PRAISE|ENTERTAINMENT|MOBILE|DESKTOP|ENABLED|PAUSED|ACTIVE|LIVE|READY|MISS|HIT)\b/;
const PERMITIDOS = /page_id|sitemap_n|rest_route|utm_source|generate_lead|trabalhe_conosco|page_view|impresilk_exemplo|empresa_exemplo|AbCdEfGh_1|mx\.hospedagem|x-cache MISS/;

test('2. o caso ruim: nenhum código da API aparece na aba, nem no title (as duas prévias)', () => {
  // Endereço e caminho (sitemap_index.xml, ?page_id=) são dado, não código.
  const semEnderecos = (v) => v.replace(/https?:\/\/\S+|\/[\w./?=&%-]*/g, '').replace(new RegExp(PERMITIDOS.source, 'g'), '');
  const achados = textosDasPrevias()
    .filter(([, v]) => CODIGO.test(semEnderecos(v)))
    .map(([k, v]) => `${k}: ${v}`);
  assert.deepEqual([...new Set(achados)], []);
});

test('2. os cinco que a revisão achou, com nome de gente', () => {
  // Os valores crus vão numa cópia da prévia (o teste não depende de o
  // arquivo gerado continuar com eles).
  // Instagram: "Seguir e deixar (como a Meta manda)" mostrava FOLLOWER 25.
  const lig = ligacao(CHEIAS, 'instagram', 'meta', 'instagram');
  for (const s of lig.dados.por_semana) s.seguir_deixar = { FOLLOWER: 25, NON_FOLLOWER: 4 };
  const [conta] = quadrosInstagram(lig, ctx);
  const [semanas] = tabelasDa(conta, 'semanas');
  const seguir = celulaDe(semanas, 0, 'Seguiram e deixaram de seguir');
  assert.equal(seguir.texto, 'seguiram 25, deixaram de seguir 4');
  // LinkedIn: a reação CELEBRATION ia crua; é o "parabéns" (soma com PRAISE).
  const ll = ligacao(CHEIAS, 'linkedin', 'linkedin');
  for (const p of ll.dados.posts.itens) p.reacoes = { LIKE: 20, PRAISE: 5, ENTERTAINMENT: 2, CELEBRATION: 1 };
  ll.dados.seguidores.perfil = { ...ll.dados.seguidores.perfil, vinculo: [{ codigo: 'EMPLOYEE', n: 12 }] };
  const li = quadrosLinkedin(ll, ctx);
  const [posts] = tabelasDa(li.find((q) => q.id === 'li-posts'), 'posts');
  assert.equal(celulaDe(posts, 0, 'Reações por tipo').texto, 'gostei 20, parabéns 6, engraçado 2');
  // LinkedIn: "EMPLOYEE" em Quem segue (o segundo mapa nunca era lido).
  const perfil = li.find((q) => q.id === 'li-seguidores').secoes.find((s) => s.id === 'perfil').blocos;
  assert.deepEqual(perfil.find((b) => /vínculo/.test(b.titulo)).itens.map((i) => i.rotulo), ['funcionários']);
  assert.equal(rotuloDoCodigo('EMPLOYEE'), 'funcionários');
  assert.equal(rotuloDoCodigo('CODIGO_NOVO'), 'outro');
  assert.equal(rotuloDoCodigo('urn:li:geo:123'), 'lugar 123');
  assert.equal(rotuloDoCodigo('urn:li:novo:9'), 'item 9');
  // As outras abas das visitas ("aboutPageViews").
  assert.equal(nomeDaAbaLinkedin('aboutPageViews'), 'Sobre');
  assert.equal(nomeDaAbaLinkedin('desktopLifeAtPageViews'), 'Vida na empresa, no computador');
  assert.equal(nomeDaAbaLinkedin('fooBarPageViews'), 'Outra aba');
  // Pixel: "ip_address 100%, email 13%".
  const lp = ligacao(CHEIAS, 'facebook', 'meta', 'pixel');
  Object.assign(lp.dados.pixels[0], { campos_correspondencia: ['em', 'ph'] });
  lp.dados.pixels[0].qualidade[0].chaves = [{ chave: 'ip_address', cobertura: 100 }, { chave: 'email', cobertura: 12.5 }];
  const [pixel] = quadrosPixelMeta(lp, ctx);
  const [qualidade] = tabelasDa(pixel, 'qualidade');
  assert.equal(celulaDe(qualidade, 0, 'Dados que casam').texto, 'endereço IP 100%, e-mail 13%');
  const config = pixel.secoes.find((s) => s.id === 'configuracao').blocos[0].itens;
  assert.equal(config.find((p) => p.rotulo === 'Campos da correspondência').texto, 'e-mail, telefone');
  // Anúncios da Meta: o title das ações levava o código.
  const [anuncios] = quadrosAnunciosMeta(ligacao(CHEIAS, 'facebook', 'meta', 'anuncios'), ctx);
  for (const t of tabelasDa(anuncios, 'acoes')) {
    for (const l of t.linhas) {
      const c = l.celulas[t.colunas.findIndex((x) => x.rotulo === 'Ação')];
      assert.equal(/_|\./.test(`${c.texto} ${c.titulo ?? ''}`), false, `${c.texto} | ${c.titulo}`);
    }
  }
});

test('2. código que nenhum mapa conhece vira nome genérico, nunca o código (e não some calado)', () => {
  assert.equal(traduzir({ A: 'a' }, 'B', 'outra coisa'), 'outra coisa');
  assert.equal(traduzir({ A: 'a' }, 'A', 'outra coisa'), 'a');
  assert.equal(traduzir({ A: 'a' }, null, 'outra coisa'), null, 'vazio continua vazio');
  assert.equal(traduzir({}, 'X'), 'outro', 'sem o nome genérico, "outro"');
  assert.equal(conhecido({ A: 'a' }, 'B'), null);
  // As ações da Meta: o nome da família, nunca o código.
  assert.equal(nomeDaAcao('post_engagement'), 'engajamento com o post');
  assert.equal(nomeDaAcao('actions:onsite_conversion.messaging_conversation_started_7d'), 'conversas iniciadas');
  assert.equal(nomeDaAcao('offsite_conversion.custom.123456'), 'conversão personalizada');
  assert.equal(nomeDaAcao('offsite_conversion.fb_pixel_algo_novo'), 'outra conversão no site');
  assert.equal(nomeDaAcao('onsite_conversion.messaging_novo'), 'outra ação nas mensagens');
  assert.equal(nomeDaAcao('acao_nova'), 'outra ação');
  // A ação desconhecida na tabela: nome genérico, e o title diz por quê.
  const l = ligacao(CHEIAS, 'facebook', 'meta', 'anuncios');
  l.dados.contas[0].por_semana[0].acoes.acao_nova_da_meta = 2;
  const [periodo] = tabelasDa(quadrosAnunciosMeta(l, ctx)[0], 'acoes');
  const i = periodo.linhas.findIndex((x) => x.celulas[0].texto === 'outra ação');
  assert.ok(i >= 0);
  assert.equal(periodo.linhas[i].celulas[0].titulo, 'Ação da Meta que esta tela ainda não traduz.');
  // O mapa {chave: n}: o desconhecido soma em "outros", no fim.
  assert.equal(textoDoMapa({ LIKE: 3, NOVA: 2, OUTRA: 1 }, { rotular: (k) => conhecido({ LIKE: 'gostei' }, k), outros: 'outras reações' }), 'gostei 3, outras reações 3');
  assert.equal(textoExtras({ METRICA_NOVA: 5 }), 'outra métrica 5');
  assert.equal(situacaoDoDia('BEFORE_PIN_CREATED'), 'antes da medição');
  assert.equal(situacaoDoDia('ESTADO_NOVO'), 'outra situação');
  assert.equal(nomeDoAtributo('has_wheelchair_accessible_entrance'), 'entrada acessível para cadeira de rodas');
  assert.equal(nomeDoAtributo('has_coisa_nova'), 'outro atributo');
  assert.equal(nomeDoCampoAds('keyword.matchType'), 'correspondência');
  assert.equal(nomeDoCampoAds('campaign.algoNovoMicros'), 'valor');
  assert.equal(nomeDoCampoAds('campo.novo'), 'outro campo');
  // País, moeda e fuso pelo nome, de qualquer país (duas ou três letras).
  assert.equal(nomeDoPais('bra'), 'Brasil');
  assert.equal(nomeDoPais('BR'), 'Brasil');
  assert.equal(nomeDoPais('nld'), 'Países Baixos');
  assert.equal(nomeDoPais('zzz'), 'país não identificado');
  assert.equal(nomeDoPais('lixo'), 'outro país');
  assert.equal(nomeDaMoeda('BRL'), 'real brasileiro');
  assert.equal(nomeDaMoeda('USD'), 'dólar americano');
  assert.equal(nomeDoFuso('America/Sao_Paulo'), 'horário de Brasília');
  assert.equal(nomeDoFuso('Fuso/Inexistente'), 'outro fuso');
  // O Google Ads: o motivo novo e o tipo do anúncio.
  const ads = ligacao(CHEIAS, 'site', 'google_ads');
  ads.dados.campanhas.lista[0].motivos = ['BUDGET_CONSTRAINED', 'MOTIVO_NOVO', 'OUTRO_NOVO'];
  const [config] = tabelasDa(quadrosGoogleAds(ads, ctx)[0], 'config');
  const k = config.linhas.findIndex((x) => x.celulas[0].texto === ads.dados.campanhas.lista[0].nome);
  assert.equal(celulaDe(config, k, 'Motivos da situação').texto, 'limitada pelo orçamento, outro motivo', 'os dois novos viram um "outro motivo" só');
  const [anuncios] = tabelasDa(quadrosGoogleAds(ligacao(CHEIAS, 'site', 'google_ads'), ctx)[0], 'anuncios');
  assert.equal(celulaDe(anuncios, 0, 'Tipo').texto, 'Pesquisa responsivo');
});

// --------------------------------------------- 3. e 4. alvo e contraste --

/** As declarações de uma regra do CSS (o primeiro bloco com o seletor). */
function regra(css, seletor) {
  const i = css.indexOf(`${seletor} {`);
  assert.ok(i >= 0, `regra ${seletor} no CSS`);
  return css.slice(i, css.indexOf('}', i));
}
const px = (decl, prop) => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+);`).exec(decl);
  return m ? m[1].trim() : null;
};
const luminancia = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a, b) => { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const BRANCO = '#ffffff';
const CARTAO_ESCURO = '#161a2c'; // --surface do tema escuro (index.css)

test('3. o caso ruim: o toque de 40px de cada chip não cobre o chip da linha de cima (vão de 10px), e o cabeçalho fica com 44px', () => {
  const css = lerTexto('../../components/marketing/dados/dados.css');
  const chip = regra(css, '.mkt-dados-chip');
  const desenho = parseFloat(px(chip, 'height'));
  const [vaoLinhas] = px(regra(css, '.mkt-dados-chips'), 'gap').split(/\s+/).map(parseFloat);
  assert.ok(vaoLinhas >= 40 - desenho, `vão entre linhas ${vaoLinhas}px, e o toque passa ${(40 - desenho) / 2}px de cada lado do chip`);
  // A legenda sobe 4px sobre o botão do cabeçalho: ela não pode pegar o toque.
  const legenda = regra(css, '.mkt-quadro-legenda');
  if (parseFloat(px(legenda, 'margin')) < 0) assert.equal(px(legenda, 'pointer-events'), 'none');
  // "Ver todas": desenhado com 32px, a faixa de 40px passa 4px, o vão até a tabela.
  const mais = regra(css, '.mkt-dados-mais');
  const vaoTabela = parseFloat(px(regra(css, '.mkt-dados-tabela-pe'), 'margin-top'));
  assert.ok((40 - parseFloat(px(mais, 'min-height'))) / 2 <= vaoTabela, '"Ver todas" não entra na tabela de cima');
  // O link no meio da tabela: 24px de altura (12,5px x 1,35 de linha, mais a folga).
  const link = regra(css, '.mkt-dados-link');
  assert.equal(px(link, 'display'), 'inline-block');
  const folga = parseFloat(px(link, 'padding'));
  assert.ok(12.5 * 1.35 + 2 * folga >= 24, `link com ${12.5 * 1.35 + 2 * folga}px`);
  assert.ok(parseFloat(px(link, 'min-width')) >= 24);
  // O atalho para Configurações é navegação: 44px.
  const quadro = lerTexto('../../components/marketing/dados/QuadroDados.jsx');
  assert.match(quadro, /<Link to="\/configuracoes\?secao=marketing" className="[^"]*\balvo-44\b/);
});

test('4. o caso ruim: o ponto de ausente e o eixo dos gráficos passam de 4,5:1 nos dois temas; nada de texto slate-400', () => {
  const css = lerTexto('../../components/marketing/dados/dados.css');
  for (const [claro, escuro] of [['.mkt-dados-tabela .vazio', 'html.dark .mkt-dados-tabela .vazio'], ['.mkt-dados-eixo', 'html.dark .mkt-dados-eixo']]) {
    const c = px(regra(css, claro), 'color');
    const e = px(regra(css, escuro), 'color');
    assert.ok(contraste(c, BRANCO) >= 4.5, `${claro}: ${c} dá ${contraste(c, BRANCO).toFixed(2)}:1`);
    assert.ok(contraste(e, CARTAO_ESCURO) >= 4.5, `${escuro}: ${e} dá ${contraste(e, CARTAO_ESCURO).toFixed(2)}:1`);
  }
  // A marca de "não medido" do gráfico é marca que informa: 3:1.
  const vazio = /--mkt-dados-vazio:\s*(#[0-9a-f]{6})/i.exec(regra(css, '.mkt-dados'))[1];
  assert.ok(contraste(vazio, BRANCO) >= 3, `marca de não medido: ${contraste(vazio, BRANCO).toFixed(2)}:1`);
  for (const arq of ['Blocos.jsx', 'QuadroDados.jsx', 'GraficoBarras.jsx']) {
    const t = lerTexto(`../../components/marketing/dados/${arq}`).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.equal(/text-slate-400/.test(t), false, `${arq}: texto em slate-400 (2,6:1 no branco)`);
  }
});

// ------------------------------------------------- 5. nada de travessão --

test('5. o caso ruim: a célula sem dado é o ponto, com "não medido" no title, e nenhuma célula das prévias leva travessão', () => {
  assert.equal(AUSENTE, '\u00b7');
  assert.deepEqual(celula('int', null), { texto: '\u00b7', vazio: true, titulo: NAO_MEDIDO });
  assert.deepEqual(celula('texto', null), { texto: '\u00b7', vazio: true, titulo: NAO_INFORMADO });
  // O travessão só fica quando veio de fora (o título que o site escreveu).
  const deFora = [];
  const andar = (x) => {
    if (typeof x === 'string') { if (/[\u2013\u2014]/.test(x)) deFora.push(x); }
    else if (Array.isArray(x)) x.forEach(andar);
    else if (x && typeof x === 'object') Object.values(x).forEach(andar);
  };
  andar([VARIEDADE.fontes, CHEIAS.fontes]);
  for (const [k, v] of textosDasPrevias()) {
    if (!/[\u2013\u2014]/.test(v)) continue;
    const limpo = v.replace(/…$/, '');
    assert.ok(deFora.some((s) => s.includes(limpo) || limpo.includes(s)), `${k}: travessão escrito pela tela: ${v}`);
  }
  // E o componente: o ponto vai com role img e o aria-label.
  const blocos = lerTexto('../../components/marketing/dados/Blocos.jsx');
  assert.match(blocos, /role="img"[^>]*aria-label=\{c\.titulo/);
});

// ---------------------------------------------- 6. só o que já aconteceu --

test('6. o caso ruim: a semana da Meta que começa amanhã não entra no gasto do período (e a tabela diz que ela não começou)', () => {
  assert.equal(jaAconteceu('2026-10-11', HOJE), true);
  assert.equal(jaAconteceu('2026-10-12', HOJE), false);
  assert.equal(jaAconteceu(null, HOJE), true, 'sem data, conta (não se esconde o que não se prova futuro)');
  assert.equal(jaAconteceu('2026-10-12', undefined), true);
  assert.deepEqual(separarPorHoje([{ d: '2026-10-10' }, { d: '2026-10-12' }], 'd', HOJE).depois, [{ d: '2026-10-12' }]);
  const l = ligacao(CHEIAS, 'facebook', 'meta', 'anuncios');
  const semanas = l.dados.contas[0].por_semana;
  // A semana de amanhã (a prévia trouxe uma; se o arquivo mudar, ela entra aqui).
  if (!semanas.some((s) => s.semana === '2026-10-12')) semanas.push({ ...semanas.at(-1), semana: '2026-10-12', fim: '2026-10-18', fechada: false, gasto: 10 });
  semanas.sort((a, b) => a.semana.localeCompare(b.semana));
  const [q] = quadrosAnunciosMeta(l, ctx);
  const ate = semanas.filter((s) => s.semana <= HOJE);
  const esperado = ate.reduce((a, s) => a + s.gasto, 0);
  assert.equal(numeroDe(q, 'gasto').texto, formatar('moeda', esperado));
  assert.equal(q.destaque, `${formatar('moeda', esperado)} no período`);
  assert.notEqual(numeroDe(q, 'gasto').texto, formatar('moeda', semanas.reduce((a, s) => a + s.gasto, 0)), 'a semana de amanhã não entrou');
  assert.equal(numeroDe(q, 'impressoes').texto, formatar('int', ate.reduce((a, s) => a + s.impressoes, 0)));
  const [porSemana] = tabelasDa(q, 'semanas');
  assert.equal(celulaDe(porSemana, 0, 'Semana de').texto, '12/10');
  assert.equal(celulaDe(porSemana, 0, 'Situação').texto, 'ainda não começou');
  assert.ok(q.notas.includes('A semana de 12/10 ainda não começou: aparece na tabela e fica fora das somas do período.'));
  // O gráfico do gasto não desenha a semana de amanhã.
  const g = q.topo.find((b) => b?.tipo === 'grafico');
  assert.equal(g.pontos.some((p) => p.x > HOJE), false);
  // As ações do período também não.
  const [periodo] = tabelasDa(q, 'acoes');
  const cliques = periodo.linhas.find((x) => x.celulas[0].texto === 'cliques no link');
  assert.equal(cliques.celulas[1].texto, formatar('num2', ate.reduce((a, s) => a + (s.acoes?.link_click ?? 0), 0)));
});

test('6. o post do LinkedIn com data de amanhã fica na tabela e fora das somas', () => {
  const l = ligacao(CHEIAS, 'linkedin', 'linkedin');
  const itens = l.dados.posts.itens;
  if (!itens.some((x) => x.data > HOJE)) itens.unshift({ ...itens[0], urn: 'urn:li:share:amanha', data: '2026-10-12', publicado_em: '2026-10-12T13:00:00.000Z', impressoes: 800, cliques: 20 });
  const ate = itens.filter((x) => x.data <= HOJE);
  assert.ok(ate.length < itens.length);
  const q = quadrosLinkedin(l, ctx).find((x) => x.id === 'li-posts');
  assert.equal(numeroDe(q, 'posts').texto, String(ate.length));
  assert.equal(numeroDe(q, 'impressoes').texto, formatar('int', ate.reduce((a, x) => a + x.impressoes, 0)));
  assert.equal(numeroDe(q, 'cliques').texto, formatar('int', ate.reduce((a, x) => a + x.cliques, 0)));
  assert.equal(tabelasDa(q, 'posts')[0].linhas.length, itens.length, 'a tabela mostra todos');
  assert.ok(q.notas.some((n) => /^O post de 12\/10 tem data que ainda não chegou/.test(n)));
});
