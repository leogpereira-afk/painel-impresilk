// As contas das fontes de dados do Marketing (marketing-fontes.js): que fonte
// alimenta cada canal, o estado de cada uma para gente, os botões por papel e
// os números. Começa pelo caso ruim: o zero que ninguém mediu, o "ok" velho
// de uma fonte desconectada, o estado de antes da conexão, o texto da URL na
// tela e o endereço de conexão que não é do provedor.
//
// Os retratos de verdade vêm de src/review/fontes-ficticias*.json: a resposta
// da ação "fontes" que os seis conectores geraram com as fixtures fictícias
// (tests/gerar-fontes-ficticias.mjs). Assim a conta daqui é provada contra o
// que o servidor manda, e não contra um objeto escrito à mão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ESTADOS_FONTE,
  FONTES_DO_CANAL,
  NAO_MEDIDO,
  ROTULO_FONTE,
  ROTULO_PARTE,
  acoesDaFonte,
  canaisDaFonte,
  canalTemFonte,
  estadoDeAntesDaConexao,
  estadoDoCanal,
  fmtAbaixoDe,
  fmtCompacto,
  fmtDataHora,
  fmtDecimal,
  fmtDuracao,
  fmtFaixa,
  fmtMoeda,
  fmtMs,
  fmtNumero,
  fmtParcela,
  fmtPercentual,
  fmtPorcento,
  fontesDoCanal,
  fontesQueAlimentam,
  infoEstado,
  legendaDaColeta,
  motivoLegivel,
  normalizarFontes,
  rotuloParte,
  secretsDaFonte,
  situacaoDaFonte,
  trocarFonte,
  urlDeConexaoSegura,
} from './marketing-fontes.js';
import { ESTADOS, FONTES, SECRETS_PADRAO } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';
import { PROVEDORES } from '../../../supabase/functions/_shared/mkt-oauth.mjs';
import { SECRETS_OPCIONAIS as OPCIONAIS_DO_SITE } from '../../../supabase/functions/_shared/mkt-fontes/site.mjs';
import { SECRETS_OPCIONAIS as OPCIONAIS_DA_META } from '../../../supabase/functions/_shared/mkt-fontes/meta.mjs';
import { SECRETS_OPCIONAIS as OPCIONAIS_DO_ADS } from '../../../supabase/functions/_shared/mkt-fontes/google_ads.mjs';

const ler = (n) => JSON.parse(readFileSync(new URL(`../../review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const copia = (x) => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-11';
const TRAVESSAO = /[\u2013\u2014]/;
const legivel = (s) => s.replace(/\u00a0/g, ' ');

/* ------------------------------------------------------------- o zero -- */

test('O CASO RUIM: nulo, vazio e lixo nunca viram zero em nenhum formatador', () => {
  const ausentes = [null, undefined, '', '   ', 'abc', '12abc', NaN, Infinity, -Infinity, true, false, {}, [], [3]];
  const formatadores = {
    fmtNumero, fmtCompacto, fmtPercentual, fmtPorcento, fmtMoeda, fmtDecimal, fmtDuracao, fmtMs, fmtParcela,
  };
  for (const [nome, fmt] of Object.entries(formatadores)) {
    for (const v of ausentes) assert.equal(fmt(v), NAO_MEDIDO, `${nome}(${JSON.stringify(v)})`);
    // O texto do ausente é de quem chama (o traço da tabela, por exemplo).
    assert.equal(fmt(null, { vazio: '-' }), '-', nome);
  }
  // Zero medido é zero, em todos.
  assert.equal(fmtNumero(0), '0');
  assert.equal(fmtNumero('0'), '0', 'o GA4 manda número como texto');
  assert.equal(fmtCompacto(0), '0');
  assert.equal(fmtPercentual(0), '0%');
  assert.equal(fmtPorcento(0), '0%');
  assert.equal(legivel(fmtMoeda(0)), 'R$ 0,00');
  assert.equal(fmtDecimal(0), '0,00');
  assert.equal(fmtDuracao(0), '0 s');
  assert.equal(fmtMs(0), '0 ms');
  assert.equal(fmtParcela({ valor: 0 }), '0%');
  // Faixa, teto e parcela sem número também não inventam.
  assert.equal(fmtFaixa(null), NAO_MEDIDO);
  assert.equal(fmtFaixa({ min: null, max: undefined }), NAO_MEDIDO);
  assert.equal(fmtAbaixoDe({}), NAO_MEDIDO);
  assert.equal(fmtAbaixoDe({ usuarios: null, abaixo_de: null }), NAO_MEDIDO);
  assert.equal(fmtParcela({ valor: null }), NAO_MEDIDO);
  // Duração e tempo negativos não existem: não medido, e não "-3 s".
  assert.equal(fmtDuracao(-3), NAO_MEDIDO);
  assert.equal(fmtMs(-1), NAO_MEDIDO);
});

test('O CASO RUIM: o que arredonda para zero sai "0", nunca "-0"', () => {
  assert.equal(fmtNumero(-0), '0');
  assert.equal(fmtNumero(-0.3), '0');
  assert.equal(fmtNumero(-0.004, { casas: 2 }), '0');
  assert.equal(fmtPercentual(-0.0001), '0%');
  assert.equal(fmtPorcento(-0.04, { sinal: true }), '0%');
  assert.equal(fmtDecimal(-0.001), '0,00');
  assert.equal(legivel(fmtMoeda(-0.001)), 'R$ 0,00');
  // E o negativo de verdade continua negativo.
  assert.equal(fmtNumero(-12), '-12');
});

test('os números em pt-BR: milhar, casas, porcentagem, dinheiro na moeda da conta, tempo e as faixas do Google', () => {
  assert.equal(fmtNumero(1234567), '1.234.567');
  assert.equal(fmtNumero('1500'), '1.500');
  assert.equal(fmtNumero(14.25, { casas: 1 }), '14,3');
  assert.equal(legivel(fmtCompacto(12400)), '12,4 mil');
  // Fração (GA4, Google Ads, Pinterest) e porcentagem pronta (o ctr da Meta).
  assert.equal(fmtPercentual(0.125), '12,5%');
  assert.equal(fmtPercentual(0.07), '7%', 'sem o 7,000000000000001 do ponto flutuante');
  assert.equal(fmtPercentual(0.05, { sinal: true }), '+5%');
  assert.equal(fmtPercentual(-0.05, { sinal: true }), '-5%');
  assert.equal(fmtPorcento(4.5), '4,5%');
  assert.equal(legivel(fmtMoeda(1234.5)), 'R$ 1.234,50');
  assert.equal(legivel(fmtMoeda('980.1', { casas: 0 })), 'R$ 980');
  assert.equal(legivel(fmtMoeda(12, { moeda: 'USD' })), 'US$ 12,00');
  assert.equal(legivel(fmtMoeda(12, { moeda: 'reais' })), 'R$ 12,00', 'moeda torta vira real, não quebra a tela');
  assert.equal(fmtDecimal(0.051), '0,05');
  assert.equal(fmtDecimal(14.2, { casas: 1 }), '14,2');
  assert.equal(fmtDuracao(45), '45 s');
  assert.equal(fmtDuracao(125), '2 min 5 s');
  assert.equal(fmtDuracao(120), '2 min');
  assert.equal(fmtDuracao(3780), '1 h 3 min');
  assert.equal(fmtDuracao(7170), '2 h', '1 h 59 min 30 s arredonda para 2 h, e não "1 h 60 min"');
  assert.equal(fmtMs(850), '850 ms');
  assert.equal(fmtMs(999.6), '1 s', 'e não "1000 ms"');
  assert.equal(fmtMs(2430), '2,4 s');
  // O Google diz "abaixo de 10%" mandando 0,0999: a tela não escreve 9,99%.
  assert.equal(fmtParcela({ valor: 0.0999, menosDe10: true }), 'menos de 10%');
  assert.equal(fmtParcela({ valor: 0.9001, maisDe90: true }), 'mais de 90%');
  assert.equal(fmtParcela({ valor: 0.42, menosDe10: false }), '42%');
  assert.equal(fmtParcela(0.5), '50%');
  // Volume de busca é faixa, nunca um número só; termo raro é "menos de".
  assert.equal(fmtFaixa({ min: 1000, max: 10000 }), 'entre 1.000 e 10.000');
  assert.equal(fmtFaixa({ min: 10, max: null }), '10 ou mais');
  assert.equal(fmtFaixa({ min: null, max: 50 }), 'até 50');
  assert.equal(fmtAbaixoDe({ usuarios: 37 }), '37');
  assert.equal(fmtAbaixoDe({ usuarios: null, abaixo_de: 15 }), 'menos de 15');
});

/* --------------------------------------------- o estado de antes da conexão -- */

const fonte = (extra = {}) => ({
  fonte: 'pinterest', nome: 'Pinterest', oauth: true, estado: 'falta_conectar', conta: null, partes: {}, dados: {}, avisos: [],
  coletadoEm: '2026-10-11T09:35:00.000Z', ultimaBoaEm: null, configurado: true, conexao: null, andando: false, ultimas: [], ...extra,
});
const conexao = (conectadoEm) => ({ conectadoEm, conectadoPor: 'demo', conta: null, escopos: [], expiraEm: null, refreshExpiraEm: null });

test('O CASO RUIM: logo depois de Conectar o servidor ainda manda o estado de antes; a tela diz "aguardando a coleta"', () => {
  // A volta do Conectar às 15h; a última coleta foi às 09:35, com "falta conectar".
  const recemConectada = fonte({ conexao: conexao('2026-10-11T15:00:00.000Z'), avisos: ['O Pinterest ainda não foi conectado. Clique em Conectar em Configurações, Marketing.'] });
  assert.equal(estadoDeAntesDaConexao(recemConectada), true);
  const s = situacaoDaFonte(recemConectada);
  assert.equal(s.chave, 'aguardando_coleta');
  assert.equal(s.tom, 'neutral');
  assert.equal(s.avisosVelhos, true, 'o aviso "ainda não foi conectado" é de antes: a tela não o mostra como atual');
  // O mesmo depois de Reconectar uma fonte que estava "reconectar".
  const reconectada = fonte({ fonte: 'google', estado: 'reconectar', conexao: conexao('2026-10-12T08:00:00.000Z') });
  assert.equal(situacaoDaFonte(reconectada).chave, 'aguardando_coleta');
  // Na ligação do canal também: o estado e o motivo da parte guardada são de antes.
  const reconectadaComParte = { ...reconectada, partes: { ga4: { estado: 'reconectar', motivo: 'O Google recusou o acesso.', coletadoEm: null, tentadoEm: '2026-10-11T09:11:00.000Z' } } };
  const ga4 = fontesDoCanal('site', { google: reconectadaComParte }).find((l) => l.parte === 'ga4');
  assert.deepEqual([ga4.estado, ga4.motivo, ga4.info.rotulo], ['aguardando_coleta', null, 'Aguardando a coleta']);
  // Nunca coletada e já conectada também espera a coleta.
  assert.equal(situacaoDaFonte(fonte({ estado: null, coletadoEm: null, conexao: conexao('2026-10-11T15:00:00.000Z') })).chave, 'aguardando_coleta');
  // Depois da coleta seguinte, o estado é o dela.
  const coletada = fonte({ estado: 'ok', coletadoEm: '2026-10-12T09:35:00.000Z', conexao: conexao('2026-10-11T15:00:00.000Z') });
  assert.equal(estadoDeAntesDaConexao(coletada), false);
  assert.equal(situacaoDaFonte(coletada).chave, 'ok');
  assert.equal(situacaoDaFonte(coletada).avisosVelhos, false);
  // Sem os secrets, "falta configurar" manda (o servidor decide agora), mesmo com conexão no cofre.
  assert.equal(situacaoDaFonte(fonte({ estado: 'falta_configurar', configurado: false, conexao: conexao('2026-10-11T15:00:00.000Z') })).chave, 'falta_configurar');
  // Fonte sem OAuth não tem conexão para comparar.
  assert.equal(estadoDeAntesDaConexao(fonte({ fonte: 'meta', oauth: false, conexao: conexao('2026-10-12T00:00:00.000Z') })), false);
  // Data torta não acusa nada.
  assert.equal(estadoDeAntesDaConexao(fonte({ conexao: conexao('ontem') })), false);
});

test('O CASO RUIM: fonte desconectada não mostra a parte velha do cache como "Funcionando"', () => {
  // O Google desconectado: a porta diz falta_conectar, mas as partes e os
  // dados guardados ainda dizem "ok" (o cache só muda na coleta seguinte).
  const fontes = copia(VARIEDADE.fontes);
  Object.assign(fontes.google, { estado: 'falta_conectar', conexao: null, avisos: [] });
  assert.equal(fontes.google.partes.ga4.estado, 'ok', 'controle: a parte guardada continua ok');
  const site = fontesDoCanal('site', fontes);
  const ga4 = site.find((l) => l.parte === 'ga4');
  assert.equal(ga4.estado, 'falta_conectar');
  assert.equal(ga4.info.rotulo, 'Falta conectar');
  assert.equal(ga4.motivo, null, 'o motivo velho da parte não explica a trava de agora');
  assert.ok(ga4.dados, 'o dado de antes continua lá, com a data dele, para quem quiser ver');
  assert.equal(estadoDoCanal('google', fontes).chave, 'falta_conectar');
  // E sem os secrets do app: falta configurar em todas as partes.
  Object.assign(fontes.google, { estado: 'falta_configurar', configurado: false });
  assert.ok(fontesDoCanal('site', fontes).filter((l) => l.fonte === 'google').every((l) => l.estado === 'falta_configurar'));
});

test('O CASO RUIM: fonte que não veio na resposta não vira "sem dados" nem "ok"', () => {
  const ligacoes = fontesDoCanal('site', { site: VARIEDADE.fontes.site });
  assert.deepEqual(ligacoes.map((l) => [l.fonte, l.carregada]), [['site', true], ['google', false], ['google', false], ['google_ads', false]]);
  for (const l of ligacoes.filter((x) => !x.carregada)) {
    assert.equal(l.estado, null);
    assert.equal(l.dados, null);
    assert.equal(l.info.chave, 'sem_coleta');
  }
  assert.equal(estadoDoCanal('site', { site: VARIEDADE.fontes.site }).chave, 'parcial');
  assert.equal(estadoDoCanal('linkedin', {}).chave, 'sem_coleta');
  assert.deepEqual(fontesDoCanal('site', null).map((l) => l.carregada), [false, false, false, false]);
  // Resposta sem o mapa de fontes: null, e não "nenhuma fonte".
  for (const r of [null, {}, { fontes: null }, { fontes: [] }, 'texto']) assert.equal(normalizarFontes(r), null, JSON.stringify(r));
});

test('O CASO RUIM: papel desconhecido só vê; visualização nunca ganha botão', () => {
  for (const f of Object.values(CHEIAS.fontes)) {
    for (const papel of ['visualizacao', 'admin', undefined, null, 'GESTAO']) {
      assert.deepEqual(acoesDaFonte(f, papel), { atualizar: false, conectar: false, reconectar: false, desconectar: false }, `${f.fonte} ${papel}`);
    }
  }
  assert.deepEqual(acoesDaFonte(null, 'gestao'), { atualizar: false, conectar: false, reconectar: false, desconectar: false });
  assert.deepEqual(acoesDaFonte({ fonte: 'orkut', oauth: true, configurado: true }, 'gestao'), { atualizar: false, conectar: false, reconectar: false, desconectar: false });
});

test('O CASO RUIM: o Conectar só abre a tela de permissão do provedor daquela fonte (ou um caminho do Painel)', () => {
  const google = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=x&state=y';
  assert.equal(urlDeConexaoSegura('google', google), google);
  assert.equal(urlDeConexaoSegura('linkedin', 'https://www.linkedin.com/oauth/v2/authorization?state=y'), 'https://www.linkedin.com/oauth/v2/authorization?state=y');
  assert.equal(urlDeConexaoSegura('pinterest', 'https://www.pinterest.com/oauth/?state=y'), 'https://www.pinterest.com/oauth/?state=y');
  // A prévia volta direto para Configurações.
  assert.equal(urlDeConexaoSegura('google', '/configuracoes?secao=marketing&conexao=google&r=ok'), '/configuracoes?secao=marketing&conexao=google&r=ok');
  const ruins = [
    ['google', 'javascript:alert(1)'],
    ['google', 'https://evil.example/o/oauth2/v2/auth'],
    ['google', 'https://accounts.google.com.evil.example/o/oauth2/v2/auth'],
    ['google', 'http://accounts.google.com/o/oauth2/v2/auth'],
    ['google', 'https://accounts.google.com/outra/coisa'],
    ['google', 'https://usuario:senha@accounts.google.com/o/oauth2/v2/auth'],
    ['google', 'https://www.pinterest.com/oauth/'],
    ['site', 'https://accounts.google.com/o/oauth2/v2/auth'],
    ['google', '//evil.example/x'],
    ['google', '/\\evil.example'],
    ['google', '/ com espaço'],
    ['google', ''],
    ['google', null],
    ['google', 'x'.repeat(5000)],
  ];
  for (const [f, url] of ruins) assert.equal(urlDeConexaoSegura(f, url), null, `${f} ${url}`);
});

/* -------------------------------------------- que fonte alimenta o canal -- */

test('que fonte e que parte alimentam cada canal (o pedido do contrato, ligação por ligação)', () => {
  const plano = Object.fromEntries(Object.entries(FONTES_DO_CANAL).map(([c, l]) => [c, l.map((x) => (x.parte ? `${x.fonte}.${x.parte}` : x.fonte))]));
  assert.deepEqual(plano, {
    site: ['site', 'google.ga4', 'google.search_console', 'google_ads'],
    facebook: ['meta.pagina', 'meta.anuncios', 'meta.pixel'],
    instagram: ['meta.instagram'],
    google: ['google.perfil'],
    linkedin: ['linkedin'],
    pinterest: ['pinterest'],
  });
  // Toda fonte alimenta algum canal, e toda parte citada existe no conector
  // (a resposta cheia tem todas as partes de todas as fontes).
  for (const f of FONTES) assert.ok(canaisDaFonte(f).length > 0, f);
  for (const ligacoes of Object.values(FONTES_DO_CANAL)) {
    for (const { fonte: f, parte } of ligacoes) if (parte) assert.ok(parte in CHEIAS.fontes[f].partes, `${f}.${parte} não é parte do conector`);
  }
  assert.deepEqual(canaisDaFonte('google'), ['site', 'google']);
  assert.deepEqual(canaisDaFonte('meta'), ['facebook', 'instagram']);
  assert.deepEqual(canaisDaFonte('google_ads'), ['site']);
  assert.deepEqual(canaisDaFonte('orkut'), []);
  assert.equal(canalTemFonte('whatsapp'), false);
  assert.equal(canalTemFonte('__proto__'), false);
  assert.deepEqual(fontesDoCanal('whatsapp', VARIEDADE.fontes), []);
  assert.equal(estadoDoCanal('whatsapp', VARIEDADE.fontes), null, 'canal sem integração não tem estado de fonte');
});

test('O CASO RUIM: a sub-aba Dados pede só as fontes do canal (canal sem integração não pede nada); cada fonte uma vez, na ordem do servidor', () => {
  for (const codigo of ['whatsapp', 'orkut', '__proto__', 'constructor', '', null, undefined]) assert.deepEqual(fontesQueAlimentam(codigo), [], String(codigo));
  assert.deepEqual(Object.fromEntries(Object.keys(FONTES_DO_CANAL).map((c) => [c, fontesQueAlimentam(c)])), {
    site: ['site', 'google', 'google_ads'],
    facebook: ['meta'],
    instagram: ['meta'],
    google: ['google'],
    linkedin: ['linkedin'],
    pinterest: ['pinterest'],
  });
  // Toda fonte de que o canal precisa está na lista (nenhuma ligação sem a sua fonte).
  for (const [codigo, ligacoes] of Object.entries(FONTES_DO_CANAL)) for (const l of ligacoes) assert.ok(fontesQueAlimentam(codigo).includes(l.fonte), `${codigo}: ${l.fonte}`);
});

test('os canais com o retrato que os conectores geraram: a variedade da prévia', () => {
  const f = VARIEDADE.fontes;
  const site = fontesDoCanal('site', f);
  assert.deepEqual(site.map((l) => [l.rotulo, l.estado]), [
    ['Site', 'ok'], ['Google Analytics', 'ok'], ['Search Console', 'ok'], ['Google Ads', 'aguardando_aprovacao'],
  ]);
  // A data do dado é a da parte; na fonte inteira, a última coleta boa.
  assert.equal(site[1].coletadoEm, f.google.partes.ga4.coletadoEm);
  assert.equal(site[0].coletadoEm, f.site.ultimaBoaEm);
  assert.equal(site[3].coletadoEm, null, 'o Google Ads nunca trouxe dado');
  assert.equal(site[1].dados, f.google.dados.ga4);
  assert.equal(site[0].dados, f.site.dados, 'a fonte inteira entrega o dados inteiro');
  assert.equal(estadoDoCanal('site', f).chave, 'parcial');
  // O canal Google Meu Negócio é o Perfil da Empresa, que aguarda o Google.
  const [perfil] = fontesDoCanal('google', f);
  assert.equal(perfil.estado, 'aguardando_aprovacao');
  assert.match(perfil.motivo, /ainda não aprovou/);
  assert.ok(perfil.tentadoEm, 'a tentativa fica com data');
  assert.equal(estadoDoCanal('google', f).chave, 'aguardando_aprovacao');
  assert.equal(estadoDoCanal('facebook', f).chave, 'ok');
  assert.equal(estadoDoCanal('instagram', f).chave, 'ok');
  assert.equal(estadoDoCanal('linkedin', f).chave, 'falta_configurar');
  assert.equal(estadoDoCanal('pinterest', f).chave, 'falta_conectar');
  // E com as seis ok, todo canal fica ok.
  for (const c of Object.keys(FONTES_DO_CANAL)) assert.equal(estadoDoCanal(c, CHEIAS.fontes).chave, 'ok', c);
});

test('os botões de cada fonte por papel, com as fontes da variedade', () => {
  const f = VARIEDADE.fontes;
  const tabela = (papel) => Object.fromEntries(FONTES.map((x) => [x, Object.entries(acoesDaFonte(f[x], papel)).filter(([, v]) => v).map(([k]) => k).join(' ')]));
  assert.deepEqual(tabela('gestao'), {
    site: 'atualizar',
    google: 'atualizar reconectar desconectar',
    meta: 'atualizar',
    google_ads: 'atualizar',
    linkedin: '', // sem os secrets do app: nem Conectar adianta
    pinterest: 'conectar', // sem conexão, Atualizar só repetiria "falta conectar"
  });
  assert.deepEqual(tabela('marketing'), { site: 'atualizar', google: 'atualizar', meta: 'atualizar', google_ads: 'atualizar', linkedin: '', pinterest: '' });
  assert.deepEqual(tabela('visualizacao'), { site: '', google: '', meta: '', google_ads: '', linkedin: '', pinterest: '' });
  // Conectado, mas sem os secrets do app (alguém apagou): Desconectar continua.
  const semApp = { ...f.google, configurado: false, estado: 'falta_configurar' };
  assert.deepEqual(acoesDaFonte(semApp, 'gestao'), { atualizar: false, conectar: false, reconectar: false, desconectar: true });
});

/* ---------------------------------------------------------- os estados -- */

test('todo estado do servidor tem rótulo, tom da casa e frase sem travessão; o desconhecido não vira "Funcionando"', () => {
  assert.deepEqual(Object.keys(ESTADOS_FONTE).sort(), [...ESTADOS].sort(), 'a lista de estados é a do info.mjs');
  for (const e of ESTADOS) {
    const i = infoEstado(e);
    assert.equal(i.chave, e);
    assert.ok(['ok', 'warn', 'bad', 'neutral'].includes(i.tom), e);
    assert.ok(i.rotulo && i.texto, e);
    assert.equal(TRAVESSAO.test(i.rotulo + i.texto), false, e);
  }
  assert.equal(infoEstado('ok').tom, 'ok');
  assert.equal(infoEstado('parcial').tom, 'warn');
  assert.equal(infoEstado('reconectar').tom, 'bad');
  assert.equal(infoEstado('erro').tom, 'bad');
  assert.equal(infoEstado(null).chave, 'sem_coleta');
  assert.equal(infoEstado(undefined).chave, 'sem_coleta');
  assert.equal(infoEstado('aguardando_coleta').chave, 'aguardando_coleta');
  for (const x of ['funcionando', 'OK', '__proto__', 'toString', 42, {}]) {
    const i = infoEstado(x);
    assert.equal(i.chave, 'desconhecido', String(x));
    assert.equal(i.tom, 'neutral');
  }
  // A situação traz o "coletando agora" à parte, sem esconder o último resultado.
  const s = situacaoDaFonte({ ...VARIEDADE.fontes.meta, andando: true });
  assert.deepEqual([s.chave, s.andando], ['ok', true]);
  assert.equal(situacaoDaFonte(null).chave, 'desconhecido');
  // Os nomes: toda fonte e toda parte do retrato cheio têm nome, sem travessão.
  for (const f of FONTES) {
    assert.ok(ROTULO_FONTE[f], f);
    for (const parte of Object.keys(CHEIAS.fontes[f].partes)) {
      assert.ok(ROTULO_PARTE[f][parte], `${f}.${parte} sem nome`);
      assert.equal(TRAVESSAO.test(rotuloParte(f, parte)), false);
    }
  }
  assert.equal(rotuloParte('site', 'parte_nova'), 'parte nova', 'parte de conector novo aparece, não some');
});

test('os motivos em código viram frase; frase passa como veio; código desconhecido não aparece cru', () => {
  assert.equal(motivoLegivel('projeto_sem_aprovacao'), 'O projeto ainda não tem o nível Explorer da Google Ads API.');
  assert.equal(motivoLegivel('sem_chave'), 'Falta a chave do Google (GOOGLE_API_KEY) nos Secrets.');
  assert.equal(motivoLegivel('pagina_nao_atribuida'), 'A Página não está atribuída ao usuário do sistema.');
  assert.equal(motivoLegivel('http_503'), 'O provedor respondeu com erro 503.');
  const frase = VARIEDADE.fontes.google.partes.perfil.motivo;
  assert.equal(motivoLegivel(frase), frase);
  for (const x of ['codigo_que_ninguem_conhece', '', '   ', null, undefined, 42, 'constructor', 'toString']) assert.equal(motivoLegivel(x), null, String(x));
  // Todo motivo em código que a prévia tem (variedade e cheia) tem frase.
  for (const r of [VARIEDADE, CHEIAS]) {
    for (const f of Object.values(r.fontes)) {
      for (const [nome, p] of Object.entries(f.partes)) if (p.motivo) assert.ok(motivoLegivel(p.motivo), `${f.fonte}.${nome}: ${p.motivo}`);
    }
  }
});

test('os secrets de cada fonte (só os NOMES): os do conector e os do app; os opcionais batem com os dos conectores', () => {
  assert.deepEqual(SECRETS_PADRAO.site, []);
  assert.deepEqual(secretsDaFonte('site'), { obrigatorios: [], opcionais: [...OPCIONAIS_DO_SITE] });
  assert.deepEqual(secretsDaFonte('google').obrigatorios, ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']);
  assert.deepEqual(secretsDaFonte('meta'), { obrigatorios: ['META_TOKEN'], opcionais: [...OPCIONAIS_DA_META] });
  assert.deepEqual(secretsDaFonte('google_ads'), { obrigatorios: ['GOOGLE_ADS_SA_JSON'], opcionais: [...OPCIONAIS_DO_ADS] });
  assert.deepEqual(OPCIONAIS_DA_META, ['META_APP_SECRET']);
  assert.deepEqual(OPCIONAIS_DO_ADS, ['GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID']);
  for (const f of ['linkedin', 'pinterest']) assert.deepEqual(secretsDaFonte(f).obrigatorios, [PROVEDORES[f].secrets.id, PROVEDORES[f].secrets.segredo]);
  assert.deepEqual(secretsDaFonte('orkut'), { obrigatorios: [], opcionais: [] });
});

/* ------------------------------------------------- a fonte e a data -- */

test('a legenda de todo número: de onde veio e de quando, no fuso de quem olha', () => {
  // O npm test roda em UTC: 09:11 UTC.
  assert.equal(legendaDaColeta({ rotulo: 'Google Analytics', coletadoEm: '2026-10-11T09:11:00.060Z' }, HOJE), 'Google Analytics, coletado em 11/10 às 09:11');
  assert.equal(legendaDaColeta({ rotulo: 'Perfil da Empresa', coletadoEm: null, tentadoEm: '2026-10-11T09:11:00.125Z' }, HOJE), 'Perfil da Empresa, ainda sem coleta; última tentativa em 11/10 às 09:11');
  assert.equal(legendaDaColeta({ rotulo: 'Site', coletadoEm: '2025-12-30T10:00:00Z' }, HOJE), 'Site, coletado em 30/12/2025 às 10:00', 'outro ano vai por extenso');
  assert.equal(legendaDaColeta({}, HOJE), 'Fonte, ainda sem coleta');
  assert.equal(fmtDataHora('não é data', HOJE), 'sem data');
  assert.equal(fmtDataHora(null, HOJE, { vazio: '-' }), '-');
  // O caso ruim: carimbo estragado (1970, 2200) não derruba a tela nem vira legenda de coleta.
  assert.equal(fmtDataHora('1970-01-01T00:00:00Z', HOJE), 'sem data');
  assert.equal(fmtDataHora('2200-01-01T00:00:00Z', HOJE), 'sem data');
  assert.equal(legendaDaColeta({ rotulo: 'Site', coletadoEm: '1970-01-01T00:00:00Z', tentadoEm: '0001-01-01T00:00:00Z' }, HOJE), 'Site, ainda sem coleta');
  // Sem o "hoje", a data sai com o ano (nunca adivinhada).
  assert.equal(fmtDataHora('2026-10-11T09:11:00Z'), '11/10/2026 às 09:11');
  // No fuso de São Paulo, o mesmo instante é 06:11; e 01h30 UTC de 12/10 ainda é 11/10.
  const modulo = new URL('./marketing-fontes.js', import.meta.url).href;
  const script = `
    const m = await import(${JSON.stringify(modulo)});
    console.log(JSON.stringify([m.fmtDataHora('2026-10-11T09:11:00Z', '2026-10-11'), m.fmtDataHora('2026-10-12T01:30:00Z', '2026-10-11')]));`;
  const sp = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/Sao_Paulo' }, encoding: 'utf8' }));
  assert.deepEqual(sp, ['11/10 às 06:11', '11/10 às 22:30']);
});

/* ---------------------------------------------------------- a resposta -- */

test('a resposta "fontes" normalizada: a ordem do servidor, a fonte nova no fim, e a troca de uma fonte sem mexer na outra', () => {
  const n = normalizarFontes(VARIEDADE);
  assert.equal(n.papel, 'gestao');
  assert.deepEqual(n.lista.map((f) => f.fonte), FONTES);
  assert.equal(n.porFonte.google, VARIEDADE.fontes.google);
  assert.deepEqual(n.motivos, VARIEDADE.motivos);
  assert.equal(normalizarFontes({ ...VARIEDADE, papel: 'admin' }).papel, 'visualizacao');
  // Fonte que o servidor mandou sem estar na ordem entra no fim; a que está na ordem e não veio fica fora.
  const r = { papel: 'marketing', ordem: ['meta', 'tiktok', 'site'], fontes: { site: { fonte: 'site' }, meta: { fonte: 'meta' }, nova: { fonte: 'nova' }, ruim: 'x' }, avisos: ['ok', 3, ''] };
  const m = normalizarFontes(r);
  assert.deepEqual(m.lista.map((f) => f.fonte), ['meta', 'site', 'nova']);
  assert.deepEqual(m.avisos, ['ok']);
  // trocarFonte devolve outro retrato, com a fonte nova no lugar da velha.
  const coletada = { ...VARIEDADE.fontes.meta, coletadoEm: '2026-10-11T16:00:00.000Z' };
  const depois = trocarFonte(n, coletada);
  assert.notEqual(depois, n);
  assert.equal(depois.porFonte.meta, coletada);
  assert.equal(depois.lista[2], coletada);
  assert.equal(n.porFonte.meta, VARIEDADE.fontes.meta, 'o retrato de antes não mudou');
  assert.equal(trocarFonte(n, null), n);
  assert.equal(trocarFonte(null, coletada), null);
});
