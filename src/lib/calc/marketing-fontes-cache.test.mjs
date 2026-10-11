// A memória das fontes na tela (marketing-fontes-cache.js): a ação "fontes"
// lida por um caminho só, leve para a faixa e o Conexões, com os dados só
// das fontes do canal para a sub-aba Dados. Começa pelo caso ruim: a data de
// uma coleta nova em cima dos números da anterior, o "restrito" da gestão
// que sobra para outro papel, a leitura velha que passa por cima da nova, a
// faixa com uma fonte só e o "sem dados" de uma fonte que só foi lida leve.
//
// As respostas são as de src/review/fontes-ficticias*.json: o que a porta de
// verdade devolve, gerado pelos conectores com as fixtures fictícias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FONTES } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';
import {
  VALIDADE_MS,
  andandoEntre,
  cheiasParaLer,
  desatualizadas,
  juntarFonte,
  juntarLeitura,
  leveVale,
  listaDeFontes,
  memoriaVazia,
  mesmaColeta,
  vistaCheia,
  vistaLeve,
} from './marketing-fontes-cache.js';

const ler = (n) => JSON.parse(readFileSync(new URL(`../../review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const copia = (x) => JSON.parse(JSON.stringify(x));

/** A resposta da porta para um pedido: só as `fontes` (null: todas) e, na
 *  leve, sem a chave "dados" (é o que a painel-marketing faz). */
function resposta(base, { leve = false, fontes = null, papel = base.papel } = {}) {
  const ordem = fontes ? base.ordem.filter((f) => fontes.includes(f)) : [...base.ordem];
  const lista = Object.fromEntries(ordem.map((f) => {
    const { dados, ...resto } = copia(base.fontes[f]);
    return [f, leve ? resto : { ...resto, dados }];
  }));
  return { ok: true, papel, ordem, fontes: lista, avisos: [...base.avisos], motivos: { ...base.motivos } };
}
/** A mesma resposta com uma coleta nova numa fonte (a data anda). */
function comColetaNova(base, fonte, coletadoEm) {
  const r = copia(base);
  r.fontes[fonte] = { ...r.fontes[fonte], coletadoEm, ultimaBoaEm: coletadoEm, dados: { marca: 'coleta nova' } };
  return r;
}

/* --------------------------------------------------------- o caso ruim -- */

test('O CASO RUIM: a leitura leve não apaga os dados, e a sub-aba nunca mostra a data de uma coleta nova em cima dos números da anterior', () => {
  const T = 1_000_000;
  let m = juntarLeitura(memoriaVazia(), resposta(CHEIAS, { fontes: ['meta'] }), { fontes: ['meta'], quando: T });
  const antes = vistaCheia(m, ['meta']).porFonte.meta;
  assert.deepEqual(antes.dados, CHEIAS.fontes.meta.dados);
  // A faixa lê leve, da MESMA coleta: os dados ficam, e o retrato vale como lido agora.
  m = juntarLeitura(m, resposta(CHEIAS, { leve: true }), { leve: true, quando: T + 1000 });
  assert.deepEqual(vistaCheia(m, ['meta']).porFonte.meta.dados, CHEIAS.fontes.meta.dados);
  assert.deepEqual(desatualizadas(m, ['meta']), []);
  assert.deepEqual(cheiasParaLer(m, ['meta'], T + 1000 + VALIDADE_MS - 1), [], 'confirmado pela leve: vale mais 10 minutos');
  // A leve vê uma coleta NOVA: o retrato da sub-aba continua o de antes, inteiro.
  const NOVA = '2026-10-11T18:00:00.000Z';
  m = juntarLeitura(m, resposta(comColetaNova(CHEIAS, 'meta', NOVA), { leve: true }), { leve: true, quando: T + 2000 });
  const vista = vistaCheia(m, ['meta']).porFonte.meta;
  assert.equal(vista.coletadoEm, CHEIAS.fontes.meta.coletadoEm, 'a data da coleta nova não vai para cima dos números da anterior');
  assert.deepEqual(vista.dados, CHEIAS.fontes.meta.dados);
  assert.deepEqual(desatualizadas(m, ['meta']), ['meta'], 'e a sub-aba sabe que precisa pedir de novo');
  assert.deepEqual(cheiasParaLer(m, ['meta', 'site'], T + 2000), ['site', 'meta']);
  // A faixa já mostra a coleta nova.
  assert.equal(vistaLeve(m).porFonte.meta.coletadoEm, NOVA);
  // A leitura cheia da fonte põe o retrato novo inteiro.
  m = juntarLeitura(m, resposta(comColetaNova(CHEIAS, 'meta', NOVA), { fontes: ['meta'] }), { fontes: ['meta'], quando: T + 3000 });
  assert.deepEqual([vistaCheia(m, ['meta']).porFonte.meta.coletadoEm, vistaCheia(m, ['meta']).porFonte.meta.dados], [NOVA, { marca: 'coleta nova' }]);
  assert.deepEqual(desatualizadas(m, ['meta']), []);
});

test('O CASO RUIM: o retrato da gestão (com o "restrito") não sobra quando o papel muda', () => {
  const T = 1_000_000;
  let m = juntarLeitura(memoriaVazia(), resposta(CHEIAS), { quando: T });
  assert.ok(JSON.stringify(m).includes('"restrito"'), 'a gestão vê');
  // A leitura seguinte veio para outro papel (a gestão tirou o papel desta pessoa).
  m = juntarLeitura(m, resposta(CHEIAS, { leve: true, papel: 'marketing' }), { leve: true, quando: T + 1000 });
  assert.equal(JSON.stringify(m).includes('"restrito"'), false, 'o dado pessoal saiu da memória');
  assert.equal(m.papel, 'marketing');
  assert.equal(vistaCheia(m, ['google_ads']), null, 'a sub-aba lê de novo, já com o papel novo');
  assert.ok(vistaLeve(m), 'a leitura leve de todas continua valendo');
  // Leitura parcial com papel novo: só a fonte lida fica, e a faixa espera a leitura de todas.
  let p = juntarLeitura(memoriaVazia(), resposta(CHEIAS), { quando: T });
  p = juntarLeitura(p, resposta(CHEIAS, { fontes: ['meta'], papel: 'visualizacao' }), { fontes: ['meta'], quando: T + 1000 });
  assert.deepEqual(Object.keys(p.estados), ['meta']);
  assert.equal(vistaLeve(p), null);
  assert.equal(JSON.stringify(p).includes('"restrito"'), false);
});

test('O CASO RUIM: uma leitura que saiu antes de uma notícia mais nova não passa por cima dela', () => {
  const T = 1_000_000;
  const NOVA = '2026-10-11T18:00:00.000Z';
  let m = juntarLeitura(memoriaVazia(), resposta(CHEIAS), { quando: T });
  // O "Atualizar agora" terminou e trouxe a fonte nova (cheia) às T+5000.
  const nova = comColetaNova(CHEIAS, 'site', NOVA).fontes.site;
  m = juntarFonte(m, nova, T + 5000);
  // Uma leitura que tinha saído às T+4000 chega depois, com a fonte de antes.
  m = juntarLeitura(m, resposta(CHEIAS, { leve: true }), { leve: true, quando: T + 4000 });
  assert.equal(vistaLeve(m).porFonte.site.coletadoEm, NOVA, 'a leitura velha não desfez o Atualizar agora');
  assert.deepEqual(vistaCheia(m, ['site']).porFonte.site.dados, { marca: 'coleta nova' });
  // As outras fontes dessa leitura entram (a notícia delas é a mais nova).
  assert.equal(m.marcas.meta, T + 4000);
  // Uma cheia que saiu às T+4500 também não troca o retrato que chegou às T+5000.
  m = juntarLeitura(m, resposta(CHEIAS, { fontes: ['site'] }), { fontes: ['site'], quando: T + 4500 });
  assert.equal(vistaCheia(m, ['site']).porFonte.site.coletadoEm, NOVA);
  // A que sai depois manda.
  m = juntarLeitura(m, resposta(CHEIAS, { leve: true }), { leve: true, quando: T + 6000 });
  assert.equal(vistaLeve(m).porFonte.site.coletadoEm, CHEIAS.fontes.site.coletadoEm);
});

test('O CASO RUIM: a cheia que saiu antes de uma leve mais nova ainda entra como retrato inteiro, e a sub-aba não fica esperando para sempre', () => {
  const T = 1_000_000;
  // A sub-aba pediu os dados do google às T; a faixa pediu leve às T+100, e a leve chegou primeiro.
  let m = juntarLeitura(memoriaVazia(), resposta(VARIEDADE, { leve: true }), { leve: true, quando: T + 100 });
  assert.equal(vistaCheia(m, ['google']), null, 'só a leve: a sub-aba espera');
  m = juntarLeitura(m, resposta(VARIEDADE, { fontes: ['google'] }), { fontes: ['google'], quando: T });
  const g = vistaCheia(m, ['google']);
  assert.ok(g, 'a cheia que chegou depois vale');
  assert.deepEqual(g.porFonte.google.dados, VARIEDADE.fontes.google.dados);
  assert.equal(m.marcas.google, T + 100, 'o estado continua o da notícia mais nova');
  assert.deepEqual(desatualizadas(m, ['google']), [], 'mesma coleta');
});

test('O CASO RUIM: a faixa nunca vira uma fonte só, e a sub-aba nunca mostra "sem dados" de uma fonte lida só na leve', () => {
  const T = 1_000_000;
  // A sub-aba do Facebook leu só a Meta, com os dados.
  let m = juntarLeitura(memoriaVazia(), resposta(VARIEDADE, { fontes: ['meta'] }), { fontes: ['meta'], quando: T });
  assert.equal(vistaLeve(m), null, 'a leitura de um canal não é a leitura de todas');
  assert.equal(leveVale(m, T), false);
  // A faixa leu todas, leve.
  m = juntarLeitura(m, resposta(VARIEDADE, { leve: true }), { leve: true, quando: T + 1 });
  assert.deepEqual(vistaLeve(m).lista.map((f) => f.fonte), FONTES);
  assert.ok(vistaLeve(m).lista.every((f) => !('dados' in f)), 'a faixa desenha a notícia mais nova, a leve');
  assert.deepEqual(vistaCheia(m, ['meta']).porFonte.meta.dados, VARIEDADE.fontes.meta.dados, 'e os dados da Meta continuam guardados (mesma coleta)');
  // O canal Site: site, google e google_ads só foram lidos leves. A sub-aba espera os dados.
  assert.equal(vistaCheia(m, ['site', 'google', 'google_ads']), null);
  assert.deepEqual(cheiasParaLer(m, ['site', 'google', 'google_ads'], T + 2), ['site', 'google', 'google_ads']);
  assert.deepEqual(cheiasParaLer(m, ['meta'], T + 2), []);
});

test('O CASO RUIM: o retrato que o servidor apagou (o Desconectar do LinkedIn) sai da memória na leitura leve, e os números não ficam na tela', () => {
  const T = 1_000_000;
  let m = juntarLeitura(memoriaVazia(), resposta(CHEIAS, { fontes: ['linkedin'] }), { fontes: ['linkedin'], quando: T });
  assert.ok(Object.keys(vistaCheia(m, ['linkedin']).porFonte.linkedin.dados).length > 0);
  // Depois do Desconectar: a porta manda o LinkedIn sem coleta nenhuma.
  const depois = copia(CHEIAS);
  depois.fontes.linkedin = { ...depois.fontes.linkedin, estado: 'falta_conectar', conexao: null, coletadoEm: null, ultimaBoaEm: null, partes: {}, avisos: [], dados: {} };
  m = juntarLeitura(m, resposta(depois, { leve: true }), { leve: true, quando: T + 1 });
  assert.equal(vistaCheia(m, ['linkedin']), null, 'a sub-aba espera a releitura, sem os números de antes');
  assert.equal('linkedin' in m.cheias, false);
  assert.deepEqual(cheiasParaLer(m, ['linkedin'], T + 2), ['linkedin']);
  const numeros = JSON.stringify(CHEIAS.fontes.linkedin.dados);
  assert.equal(JSON.stringify(m).includes(numeros), false, 'nenhuma cópia dos dados do LinkedIn na memória');
});

/* ----------------------------------------------------------- o resto -- */

test('a fonte pedida com os dados que o servidor não mandou fica "lida" (null): a sub-aba diz que não leu, e não pede de novo a cada desenho', () => {
  const T = 1_000_000;
  const semGoogleAds = resposta(VARIEDADE, { fontes: ['site', 'google'] });
  const m = juntarLeitura(memoriaVazia(), semGoogleAds, { fontes: ['site', 'google', 'google_ads'], quando: T });
  assert.equal(m.cheias.google_ads, null);
  const v = vistaCheia(m, ['site', 'google', 'google_ads']);
  assert.deepEqual(Object.keys(v.porFonte), ['site', 'google']);
  assert.deepEqual(cheiasParaLer(m, ['site', 'google', 'google_ads'], T + 1), []);
  assert.deepEqual(cheiasParaLer(m, ['google_ads'], T + VALIDADE_MS), ['google_ads'], 'depois da validade, tenta de novo');
});

test('a coleta andando: a sub-aba mostra o "andando" da notícia mais nova sem trocar os números; a leve não vale enquanto anda', () => {
  const T = 1_000_000;
  let m = juntarLeitura(memoriaVazia(), resposta(CHEIAS), { quando: T });
  assert.equal(leveVale(m, T + 1), true);
  assert.deepEqual(andandoEntre(m), []);
  // O "Atualizar agora" voltou {andando: true}: a fonte de agora, marcada.
  m = juntarFonte(m, { ...vistaLeve(m).porFonte.site, andando: true }, T + 10);
  assert.deepEqual(andandoEntre(m), ['site']);
  assert.deepEqual(andandoEntre(m, ['meta', 'google']), []);
  assert.equal(leveVale(m, T + 11), false, 'enquanto anda, a tela relê');
  const v = vistaCheia(m, ['site']).porFonte.site;
  assert.equal(v.andando, true);
  assert.deepEqual(v.dados, CHEIAS.fontes.site.dados);
  // Terminou (a leve diz que não anda mais, com a coleta nova): a sub-aba pede de novo.
  const NOVA = '2026-10-11T18:00:00.000Z';
  m = juntarLeitura(m, resposta(comColetaNova(CHEIAS, 'site', NOVA), { leve: true, fontes: ['site'] }), { leve: true, fontes: ['site'], quando: T + 20 });
  assert.deepEqual(andandoEntre(m), []);
  assert.equal(vistaCheia(m, ['site']).porFonte.site.andando, false);
  assert.deepEqual(desatualizadas(m, ['site']), ['site']);
  // A leitura parcial não conta como leitura de todas.
  assert.equal(m.lidoEm, T);
});

test('a resposta cheia a um pedido leve (a função antiga ignora o pedido) é aproveitada inteira', () => {
  const m = juntarLeitura(memoriaVazia(), resposta(CHEIAS), { leve: true, quando: 5 });
  assert.ok(vistaLeve(m));
  assert.deepEqual(vistaCheia(m, FONTES).lista.map((f) => f.fonte), FONTES);
  assert.deepEqual(cheiasParaLer(m, FONTES, 6), []);
});

test('a leitura de todas tira a fonte que o servidor não manda mais; resposta torta não vira memória; nome estranho de fonte não entra', () => {
  const T = 1_000_000;
  let m = juntarLeitura(memoriaVazia(), resposta(VARIEDADE), { quando: T });
  const semPinterest = resposta(VARIEDADE, { fontes: FONTES.filter((f) => f !== 'pinterest'), leve: true });
  m = juntarLeitura(m, semPinterest, { leve: true, quando: T + 1 });
  assert.equal('pinterest' in m.estados, false);
  assert.equal('pinterest' in m.cheias, false);
  assert.deepEqual(vistaLeve(m).lista.map((f) => f.fonte), FONTES.filter((f) => f !== 'pinterest'));
  for (const torta of [null, {}, { ok: true }, { fontes: [] }, 'texto']) assert.equal(juntarLeitura(m, torta, { quando: T + 2 }), null, JSON.stringify(torta));
  const estranha = JSON.parse('{"ok":true,"papel":"gestao","ordem":["__proto__","Site","site"],"fontes":{"__proto__":{"fonte":"__proto__","estado":"ok"},"Site":{"fonte":"Site"},"site":{"fonte":"site","estado":"ok"}},"avisos":[],"motivos":{}}');
  const e = juntarLeitura(memoriaVazia(), estranha, { leve: true, quando: 1 });
  assert.deepEqual(Object.keys(e.estados), ['site']);
  assert.equal(Object.getPrototypeOf(e.estados), Object.prototype);
  // juntarFonte com fonte inválida devolve a mesma memória.
  for (const f of [null, {}, { fonte: '__proto__' }, { fonte: 'Site' }, 'site']) assert.equal(juntarFonte(m, f, T + 3), m, JSON.stringify(f));
});

test('a memória de entrada nunca muda (cada leitura devolve uma nova)', () => {
  const vazia = memoriaVazia();
  const congelada = JSON.stringify(vazia);
  const m = juntarLeitura(vazia, resposta(CHEIAS), { quando: 1 });
  assert.equal(JSON.stringify(vazia), congelada);
  const antes = JSON.stringify(m);
  juntarLeitura(m, resposta(CHEIAS, { leve: true }), { leve: true, quando: 2 });
  juntarFonte(m, { ...CHEIAS.fontes.site, andando: true }, 3);
  assert.equal(JSON.stringify(m), antes);
});

test('a validade: a leve vale 10 minutos desde a leitura de todas; a cheia, desde a leitura (ou a confirmação) de cada fonte', () => {
  const T = 1_000_000;
  const m = juntarLeitura(memoriaVazia(), resposta(VARIEDADE), { quando: T });
  assert.equal(leveVale(m, T + VALIDADE_MS - 1), true);
  assert.equal(leveVale(m, T + VALIDADE_MS), false);
  assert.equal(leveVale(memoriaVazia(), T), false);
  assert.equal(leveVale(null, T), false);
  assert.deepEqual(cheiasParaLer(m, ['site'], T + VALIDADE_MS - 1), []);
  assert.deepEqual(cheiasParaLer(m, ['site'], T + VALIDADE_MS), ['site']);
  assert.deepEqual(cheiasParaLer(null, ['site'], T), ['site']);
});

test('a lista de um pedido: null é todas; sem repetir, sem nome estranho, na ordem de FONTES; mesmaColeta compara a data da coleta e a da última boa', () => {
  assert.deepEqual(listaDeFontes(null), FONTES);
  assert.deepEqual(listaDeFontes(undefined), FONTES);
  assert.deepEqual(listaDeFontes(['meta', 'meta', 'Meta', '__proto__', 42, null, 'site']), ['site', 'meta']);
  assert.deepEqual(listaDeFontes(['google_ads', 'site', 'google']), ['site', 'google', 'google_ads'], 'a mesma lista em outra ordem é o mesmo pedido');
  // Fonte que esta tela ainda não conhece (um conector novo) vai no fim, sem sumir.
  assert.deepEqual(listaDeFontes(['tiktok', 'meta']), ['meta', 'tiktok']);
  assert.deepEqual(listaDeFontes('site'), []);
  const a = { fonte: 'site', coletadoEm: 'x', ultimaBoaEm: 'y' };
  assert.equal(mesmaColeta(a, { ...a, estado: 'erro', andando: true }), true);
  assert.equal(mesmaColeta(a, { ...a, coletadoEm: 'z' }), false);
  assert.equal(mesmaColeta(a, { ...a, ultimaBoaEm: null }), false);
  assert.equal(mesmaColeta(a, { ...a, fonte: 'meta' }), false);
  assert.equal(mesmaColeta(a, null), false);
});
