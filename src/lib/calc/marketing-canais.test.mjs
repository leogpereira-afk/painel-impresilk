// As contas dos canais do Marketing (marketing-canais.js) e os números curtos
// de format.js. Começa pelo caso ruim: o que pintaria um canal da cor errada
// ou mostraria um zero que ninguém mediu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  gruposFazer,
  semaforoCanal,
  indicadorCanal,
  topPublicacoes,
  semanaDe,
  compararSemanas,
  prazoCurto,
  ultimaPublicacao,
  fonteDoNumero,
  paraDia,
  diaValido,
  numeroOuNulo,
  hojeDaTela,
} from './marketing-canais.js';
import { numeroCompacto, moedaCompacta } from '../format.js';

const HOJE = '2026-10-10'; // sábado
const ids = (lista) => lista.map((x) => x.id);
// O espaço do Intl entre número e unidade é o inseparável (U+00A0).
const legivel = (s) => s.replace(/\u00a0/g, ' ');

/* ------------------------------------------------------------ virada do dia */

test('O CASO RUIM: dia AAAA-MM-DD não anda para trás no fuso de São Paulo', () => {
  // new Date("2026-10-12").getDate() em São Paulo dá 11. A conta daqui tem de
  // dar o mesmo dia em qualquer fuso; roda a mesma conta em três fusos.
  // A URL já vem codificada: a pasta do Léo tem espaço no caminho (iCloud).
  const modulo = new URL('./marketing-canais.js', import.meta.url).href;
  const script = `
    const m = await import(${JSON.stringify(modulo)});
    const g = m.gruposFazer([{id:'a',prazo:'2026-10-10'},{id:'b',prazo:'2026-10-11'},{id:'c',prazo:'2026-10-09'}], '2026-10-10');
    console.log(JSON.stringify({
      semana: [m.semanaDe('2026-10-11'), m.semanaDe('2026-10-12'), m.semanaDe('2027-01-01')],
      grupos: [g.atrasadas.map(x=>x.id), g.hoje.map(x=>x.id), g.semana.map(x=>x.id)],
      prazo: m.prazoCurto('2026-10-11', '2026-10-10').texto,
      coletado: m.fonteDoNumero({fonte:'manual', coletadoEm:'2026-10-13T01:30:00Z'}, '2026-10-13'),
    }));`;
  const rodar = (TZ) =>
    JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }));
  const sp = rodar('America/Sao_Paulo');
  const utc = rodar('UTC');
  const toquio = rodar('Asia/Tokyo');
  for (const r of [sp, utc, toquio]) {
    assert.deepEqual(r.semana, ['2026-10-05', '2026-10-12', '2026-12-28']);
    assert.deepEqual(r.grupos, [['c'], ['a'], ['b']]);
    assert.equal(r.prazo, 'amanhã');
  }
  // O carimbo de coleta é um INSTANTE: 01h30 UTC de 13/10 é 22h30 de 12/10
  // em São Paulo, e a legenda mostra o dia de quem olha.
  assert.equal(sp.coletado, 'Lançado à mão em 12/10');
  assert.equal(utc.coletado, 'Lançado à mão em 13/10');
});

test('O CASO RUIM: hoje como Date às 23h59 ainda é hoje; à meia-noite vira atraso', () => {
  // A suíte roda com TZ=UTC, então o Date local é o UTC aqui.
  const item = [{ id: 'x', prazo: '2026-10-10' }];
  assert.deepEqual(ids(gruposFazer(item, new Date(2026, 9, 10, 23, 59, 59)).hoje), ['x']);
  assert.deepEqual(ids(gruposFazer(item, new Date(2026, 9, 11, 0, 0, 0)).atrasadas), ['x']);
  assert.equal(prazoCurto('2026-10-10', new Date(2026, 9, 11, 0, 0, 0)).texto, '1 dia atrasada');
});

test('virada do mês e do ano contam dias certos', () => {
  assert.equal(prazoCurto('2026-11-01', '2026-10-31').texto, 'amanhã');
  assert.equal(prazoCurto('2026-12-31', '2027-01-02').texto, '2 dias atrasada');
  assert.equal(semanaDe('2028-02-29'), '2028-02-28'); // ano bissexto, terça
  assert.equal(semanaDe('2026-03-01'), '2026-02-23'); // domingo na virada do mês
});

test('"hoje" estragado quebra alto em vez de pintar a tela calado', () => {
  assert.throws(() => gruposFazer([], '10/10/2026'), /hoje/);
  assert.throws(() => semaforoCanal({ itensPendentes: [] }, '2026-02-30'), /hoje/);
  assert.throws(() => prazoCurto('2026-10-10', null), /hoje/);
});

test('paraDia: data real, timestamp vira dia local, lixo vira null', () => {
  assert.equal(paraDia('2026-10-10'), '2026-10-10');
  assert.equal(paraDia(' 2026-10-10 '), '2026-10-10');
  assert.equal(paraDia('2026-02-30'), null);
  assert.equal(paraDia('2026-10-10T15:00:00Z'), '2026-10-10');
  assert.equal(paraDia(''), null);
  assert.equal(paraDia(null), null);
  assert.equal(paraDia(20261010), null);
  assert.equal(paraDia(new Date('x')), null);
  assert.equal(diaValido('1999-12-31'), false);
});

/* ------------------------------------------------------------ gruposFazer */

test('O CASO RUIM: tarefa sem prazo NÃO cai em atrasadas ("" < "2026" é verdade como texto)', () => {
  const g = gruposFazer(
    [
      { id: 'vazio', prazo: '' },
      { id: 'nulo', prazo: null },
      { id: 'sem' },
      { id: 'estragado', prazo: '2026-02-30' },
      { id: 'texto', prazo: 'amanhã' },
    ],
    HOJE
  );
  assert.deepEqual(g.atrasadas, []);
  assert.deepEqual(ids(g.semData), ['vazio', 'nulo', 'sem', 'estragado', 'texto']);
});

test('O CASO RUIM: lista que não chegou devolve null, e não "nada a fazer"', () => {
  assert.equal(gruposFazer(null, HOJE), null);
  assert.equal(gruposFazer(undefined, HOJE), null);
  assert.deepEqual(gruposFazer([], HOJE), { atrasadas: [], hoje: [], semana: [], proximas: [], semData: [] });
});

test('gruposFazer separa pelas réguas da agenda e ordena pelo prazo', () => {
  const g = gruposFazer(
    [
      { id: 'longe', prazo: '2026-10-18' }, // 8 dias: próximas
      { id: 'limite', prazo: '2026-10-17' }, // 7 dias: ainda semana
      { id: 'amanha', prazo: '2026-10-11' },
      { id: 'hoje2', prazo: '2026-10-10' },
      { id: 'ontem', prazo: '2026-10-09' },
      { id: 'mes', prazo: '2026-09-10' },
      { id: 'hoje1', prazo: '2026-10-10' },
      null,
      'lixo',
    ],
    HOJE
  );
  assert.deepEqual(ids(g.atrasadas), ['mes', 'ontem']); // a mais antiga primeiro
  assert.deepEqual(ids(g.hoje), ['hoje2', 'hoje1']); // mesmo dia: ordem de chegada
  assert.deepEqual(ids(g.semana), ['amanha', 'limite']);
  assert.deepEqual(ids(g.proximas), ['longe']);
});

test('gruposFazer não esconde o que está feito: a linha precisa ficar durante o Desfazer', () => {
  const g = gruposFazer([{ id: 'f', prazo: HOJE, feito: true }], HOJE);
  assert.deepEqual(ids(g.hoje), ['f']);
});

test('timestamp de prazo vale pelo dia local', () => {
  assert.deepEqual(ids(gruposFazer([{ id: 't', prazo: '2026-10-10T18:00:00Z' }], HOJE).hoje), ['t']);
});

/* ------------------------------------------------------------ prazoCurto */

test('prazoCurto: os textos da linha e o tom', () => {
  assert.deepEqual(prazoCurto('2026-10-10', HOJE), { texto: 'hoje', tom: 'warn', dias: 0 });
  assert.deepEqual(prazoCurto('2026-10-11', HOJE), { texto: 'amanhã', tom: 'warn', dias: 1 });
  assert.equal(prazoCurto('2026-10-12', HOJE).tom, 'warn'); // 48h
  assert.deepEqual(prazoCurto('2026-10-13', HOJE), { texto: '13/10', tom: 'neutral', dias: 3 });
  assert.deepEqual(prazoCurto('2026-10-07', HOJE), { texto: '3 dias atrasada', tom: 'bad', dias: -3 });
  assert.equal(prazoCurto('2026-10-09', HOJE).texto, '1 dia atrasada');
  assert.deepEqual(prazoCurto(null, HOJE), { texto: 'sem prazo', tom: 'neutral', dias: null });
  assert.equal(prazoCurto('2026-10-12', HOJE, { diasAviso: 1 }).tom, 'neutral');
});

test('prazoCurto mostra o ano quando ele não é o de hoje (12/01 sozinho num dezembro engana)', () => {
  assert.equal(prazoCurto('2027-01-12', '2026-12-20').texto, '12/01/2027');
  assert.equal(prazoCurto('2026-11-12', HOJE).texto, '12/11');
});

/* ------------------------------------------------------------ semaforoCanal */

const pend = (...prazos) => prazos.map((prazo, i) => ({ id: String(i), prazo }));

test('O CASO RUIM: pendências que não chegaram não viram "em dia"', () => {
  assert.equal(semaforoCanal({ itensPendentes: undefined }, HOJE), null);
  assert.equal(semaforoCanal({}, HOJE), null);
  assert.equal(semaforoCanal(undefined, HOJE), null);
});

test('O CASO RUIM: canal sem nenhuma publicação lançada fica vermelho, e não "parado há 20 mil dias"', () => {
  const s = semaforoCanal({ itensPendentes: [], ultimaPublicacao: null, diasParado: 7, contaParado: true }, HOJE);
  assert.deepEqual(s, { tom: 'bad', texto: 'sem publicação' });
});

test('O CASO RUIM: publicações que não carregaram (undefined) não acusam o canal de parado', () => {
  const s = semaforoCanal({ itensPendentes: [], ultimaPublicacao: undefined, diasParado: 7, contaParado: true }, HOJE);
  assert.deepEqual(s, { tom: 'ok', texto: 'em dia' });
  // Data estragada também é "não sei".
  assert.equal(semaforoCanal({ itensPendentes: [], ultimaPublicacao: 'ontem', diasParado: 7, contaParado: true }, HOJE).tom, 'ok');
});

test('O CASO RUIM: dias para parado nulo ou zero não deixa todo canal vermelho', () => {
  for (const diasParado of [null, undefined, 0, -3, 'abc', 2.5]) {
    const s = semaforoCanal({ itensPendentes: [], ultimaPublicacao: '2026-01-01', diasParado, contaParado: true }, HOJE);
    assert.equal(s.tom, 'ok', String(diasParado));
  }
});

test('parado: só passa a valer DEPOIS de diasParado (exatamente 7 dias ainda não é parado)', () => {
  const base = { itensPendentes: [], diasParado: 7, contaParado: true };
  assert.equal(semaforoCanal({ ...base, ultimaPublicacao: '2026-10-03' }, HOJE).tom, 'ok'); // 7 dias
  assert.deepEqual(semaforoCanal({ ...base, ultimaPublicacao: '2026-10-02' }, HOJE), { tom: 'bad', texto: 'parado há 8 dias' });
  assert.deepEqual(semaforoCanal({ ...base, ultimaPublicacao: '2026-09-28' }, HOJE), { tom: 'bad', texto: 'parado há 12 dias' });
  // Sem contaParado (canal de contato, por exemplo), não julga parado.
  assert.equal(semaforoCanal({ ...base, contaParado: false, ultimaPublicacao: null }, HOJE).tom, 'ok');
  // dias_parado vindo como texto do banco ainda vale.
  assert.equal(semaforoCanal({ ...base, diasParado: '7', ultimaPublicacao: '2026-10-02' }, HOJE).tom, 'bad');
});

test('semáforo: atrasada, vence logo e em dia, sempre com texto', () => {
  assert.deepEqual(semaforoCanal({ itensPendentes: pend('2026-10-08', '2026-10-09', '2026-10-20') }, HOJE), { tom: 'bad', texto: '2 atrasadas' });
  assert.deepEqual(semaforoCanal({ itensPendentes: pend('2026-10-09') }, HOJE), { tom: 'bad', texto: '1 atrasada' });
  assert.deepEqual(semaforoCanal({ itensPendentes: pend('2026-10-12', '2026-10-30') }, HOJE), { tom: 'warn', texto: 'vence em 2 dias' });
  assert.deepEqual(semaforoCanal({ itensPendentes: pend('2026-10-11') }, HOJE), { tom: 'warn', texto: 'vence amanhã' });
  assert.deepEqual(semaforoCanal({ itensPendentes: pend('2026-10-10') }, HOJE), { tom: 'warn', texto: 'vence hoje' });
  assert.deepEqual(semaforoCanal({ itensPendentes: pend('2026-10-13', null, '') }, HOJE), { tom: 'ok', texto: 'em dia' });
  assert.deepEqual(semaforoCanal({ itensPendentes: [] }, HOJE), { tom: 'ok', texto: 'em dia' });
  // A antecedência do âmbar vem por parâmetro (vira regra editável depois).
  assert.equal(semaforoCanal({ itensPendentes: pend('2026-10-13'), diasAviso: 3 }, HOJE).tom, 'warn');
});

test('semáforo: implantação é âmbar, mas atrasada continua vermelha e o parado não pune quem nem começou', () => {
  const impl = { emImplantacao: true, contaParado: true, diasParado: 7, ultimaPublicacao: null };
  assert.deepEqual(semaforoCanal({ ...impl, itensPendentes: [] }, HOJE), { tom: 'warn', texto: 'em implantação' });
  assert.deepEqual(semaforoCanal({ ...impl, itensPendentes: pend('2026-10-01') }, HOJE), { tom: 'bad', texto: '1 atrasada' });
});

test('semáforo: atrasada vence o parado (o texto mais acionável primeiro)', () => {
  const s = semaforoCanal({ itensPendentes: pend('2026-10-09'), contaParado: true, diasParado: 7, ultimaPublicacao: null }, HOJE);
  assert.deepEqual(s, { tom: 'bad', texto: '1 atrasada' });
});

/* ------------------------------------------------------------ última publicação */

test('ultimaPublicacao: retirada e agendada para depois não contam; sem lista é "não sei"', () => {
  const pubs = [
    { id: '1', data: '2026-10-01' },
    { id: '2', data: '2026-10-08', retiradaEm: '2026-10-09T10:00:00Z' },
    { id: '3', data: '2026-10-12' }, // agendada
    { id: '4', data: '2026-10-05' },
    { id: '5', data: null },
  ];
  assert.equal(ultimaPublicacao(pubs, HOJE), '2026-10-05');
  assert.equal(ultimaPublicacao([], HOJE), null);
  assert.equal(ultimaPublicacao([{ data: '2026-10-11' }], HOJE), null);
  assert.equal(ultimaPublicacao(null, HOJE), undefined);
});

/* ------------------------------------------------------------ indicadorCanal */

test('O CASO RUIM: publicações que não carregaram não viram "0" no chip', () => {
  assert.equal(indicadorCanal(null, HOJE), null);
  assert.equal(indicadorCanal(undefined, HOJE), null);
});

test('O CASO RUIM: canal sem publicação é medida de verdade: 0 contra 0, sem dividir por zero', () => {
  assert.deepEqual(indicadorCanal([], HOJE), { valor: 0, anterior: 0, variacao: 0, rotulo: 'publicações nos últimos 7 dias' });
});

test('indicadorCanal: janelas de 7 dias com as bordas certas', () => {
  const pubs = [
    { data: '2026-10-10' }, // hoje: conta
    { data: '2026-10-04' }, // 6 dias atrás: conta
    { data: '2026-10-03' }, // 7 dias atrás: semana anterior
    { data: '2026-09-27' }, // 13 dias atrás: semana anterior
    { data: '2026-09-26' }, // 14 dias atrás: fora
    { data: '2026-10-11' }, // amanhã (agendada): fora
    { data: '2026-10-09', retiradaEm: '2026-10-09T12:00:00Z' }, // retirada: fora
    { data: '' }, // sem data: fora
    null,
  ];
  assert.deepEqual(indicadorCanal(pubs, HOJE), { valor: 2, anterior: 2, variacao: 0, rotulo: 'publicações nos últimos 7 dias' });
  const mais = indicadorCanal([...pubs, { data: '2026-10-09' }, { data: '2026-10-08' }], HOJE);
  assert.equal(mais.valor, 4);
  assert.equal(mais.variacao, 2);
});

/* ------------------------------------------------------------ topPublicacoes */

test('O CASO RUIM: engajamento nulo fica fora do top, e zero informado entra', () => {
  const pubs = [
    { id: 'nulo', engajamento: null, data: '2026-10-09' },
    { id: 'ausente', data: '2026-10-09' },
    { id: 'vazio', engajamento: '', data: '2026-10-09' },
    { id: 'zero', engajamento: 0, data: '2026-10-09' },
    { id: 'dez', engajamento: 10, data: '2026-10-01' },
  ];
  assert.deepEqual(ids(topPublicacoes(pubs, 'engajamento')), ['dez', 'zero']);
});

test('topPublicacoes: ordena, desempata pela mais recente, corta em n e ignora retirada', () => {
  const pubs = [
    { id: 'a', leads: 3, data: '2026-10-01' },
    { id: 'b', leads: 7, data: '2026-10-02' },
    { id: 'c', leads: 3, data: '2026-10-05' },
    { id: 'd', leads: 9, data: '2026-10-03', retiradaEm: '2026-10-04T00:00:00Z' },
    { id: 'e', leads: '5', data: '2026-10-04' }, // número em texto do banco
    { id: 'f', leads: 1, data: '2026-10-06' },
    { id: 'g', leads: 2, data: '2026-10-07' },
  ];
  assert.deepEqual(ids(topPublicacoes(pubs, 'leads')), ['b', 'e', 'c', 'a', 'g']);
  assert.deepEqual(ids(topPublicacoes(pubs, 'leads', 2)), ['b', 'e']);
  assert.equal(topPublicacoes(null, 'leads'), null);
  assert.throws(() => topPublicacoes(pubs, 'alcance'), /Campo/);
});

/* ------------------------------------------------------------ semanaDe */

test('semanaDe: segunda é a própria, domingo volta seis dias', () => {
  assert.equal(semanaDe('2026-10-12'), '2026-10-12'); // segunda
  assert.equal(semanaDe('2026-10-10'), '2026-10-05'); // sábado
  assert.equal(semanaDe('2026-10-11'), '2026-10-05'); // domingo
  assert.equal(semanaDe('2027-01-01'), '2026-12-28'); // sexta, virada do ano
  assert.equal(semanaDe(''), null);
  assert.equal(semanaDe(null), null);
  assert.equal(semanaDe('2026-13-01'), null);
});

/* ------------------------------------------------------------ compararSemanas */

test('O CASO RUIM: número não informado continua null, sem diferença e sem variação inventadas', () => {
  const metricas = [
    { semana: '2026-10-05', alcance: 1200, leads: null, seguidores: 500, cliques: 10 },
    { semana: '2026-09-28', alcance: 1000, leads: 4, seguidores: 0 },
  ];
  const c = compararSemanas(metricas, '2026-10-10');
  const por = Object.fromEntries(c.numeros.map((n) => [n.campo, n]));
  assert.deepEqual(por.alcance, { campo: 'alcance', rotulo: 'Alcance', atual: 1200, anterior: 1000, diferenca: 200, variacao: 0.2 });
  assert.deepEqual(por.leads, { campo: 'leads', rotulo: 'Leads', atual: null, anterior: 4, diferenca: null, variacao: null });
  // De 0 para 500: diferença existe, variação percentual não (não é "infinito").
  assert.equal(por.seguidores.diferenca, 500);
  assert.equal(por.seguidores.variacao, null);
  // Semana anterior sem o campo: não é zero.
  assert.equal(por.cliques.anterior, null);
  assert.equal(por.cliques.diferenca, null);
  assert.equal(por.impressoes.atual, null);
});

test('compararSemanas: qualquer dia acha a semana dele; semana sem lançamento é null', () => {
  const metricas = [{ semana: '2026-10-05', alcance: 10, coletadoEm: '2026-10-06T10:00:00Z' }];
  const c = compararSemanas(metricas, '2026-10-11'); // domingo da mesma semana
  assert.equal(c.semana, '2026-10-05');
  assert.equal(c.semanaAnterior, '2026-09-28');
  assert.equal(c.atual.alcance, 10);
  assert.equal(c.anterior, null);
  assert.equal(compararSemanas(null, HOJE), null);
  assert.equal(compararSemanas([], 'x'), null);
});

test('compararSemanas: linha repetida da mesma semana usa a coleta mais recente', () => {
  const metricas = [
    { semana: '2026-10-05', alcance: 1, coletadoEm: '2026-10-06T10:00:00Z' },
    { semana: '2026-10-05', alcance: 2, coletadoEm: '2026-10-07T10:00:00Z' },
  ];
  assert.equal(compararSemanas(metricas, HOJE).atual.alcance, 2);
});

/* ------------------------------------------------------------ fonte do número */

test('fonteDoNumero: de onde veio e de quando, com o ano quando não é o deste', () => {
  assert.equal(fonteDoNumero({ fonte: 'manual', coletadoEm: '2026-10-12T15:00:00Z' }, HOJE), 'Lançado à mão em 12/10');
  assert.equal(fonteDoNumero({ fonte: 'csv', coletadoEm: '2026-10-12T15:00:00Z' }, HOJE), 'Importado de CSV em 12/10');
  assert.equal(fonteDoNumero({ fonte: 'api', coletadoEm: '2025-12-30T15:00:00Z' }, HOJE), 'Lido automaticamente em 30/12/2025');
  assert.equal(fonteDoNumero({ fonte: 'manual' }, HOJE), 'Lançado à mão');
  assert.equal(fonteDoNumero({}, HOJE), 'Origem não informada');
});

/* ------------------------------------------------------------ números */

test('numeroOuNulo: só número de verdade', () => {
  assert.equal(numeroOuNulo(0), 0);
  assert.equal(numeroOuNulo('12'), 12);
  assert.equal(numeroOuNulo(''), null);
  assert.equal(numeroOuNulo(' '), null);
  assert.equal(numeroOuNulo(null), null);
  assert.equal(numeroOuNulo(NaN), null);
  assert.equal(numeroOuNulo('1.234'), 1.234); // texto do banco vem com ponto decimal
  assert.equal(numeroOuNulo('12abc'), null);
});

test('O CASO RUIM: número curto de vazio NÃO é "0"', () => {
  for (const v of [null, undefined, '', '   ', 'abc', NaN, Infinity]) {
    assert.equal(numeroCompacto(v), '', String(v));
    assert.equal(moedaCompacta(v), '', String(v));
  }
  assert.equal(numeroCompacto(0), '0'); // zero medido é zero
});

test('numeroCompacto: mil, mi e bi do jeito brasileiro, sem "1.000 mil" na borda', () => {
  assert.equal(numeroCompacto(999), '999');
  assert.equal(legivel(numeroCompacto(1000)), '1 mil');
  assert.equal(legivel(numeroCompacto(1234)), '1,2 mil');
  assert.equal(legivel(numeroCompacto(12345)), '12,3 mil');
  assert.equal(legivel(numeroCompacto(999950)), '1 mi');
  assert.equal(legivel(numeroCompacto(3400000)), '3,4 mi');
  assert.equal(legivel(numeroCompacto(1e9)), '1 bi');
  assert.equal(legivel(numeroCompacto(-1234)), '-1,2 mil');
  assert.equal(numeroCompacto(-0.01), '0');
  assert.equal(legivel(numeroCompacto('2500')), '2,5 mil');
  // O espaço é o inseparável: o "mil" não quebra de linha sozinho.
  assert.match(numeroCompacto(1234), /\u00a0/);
});

test('moedaCompacta: "R$ 12,4 mil", e abaixo de mil sem centavos', () => {
  assert.equal(legivel(moedaCompacta(12400)), 'R$ 12,4 mil');
  assert.equal(legivel(moedaCompacta(950.5)), 'R$ 951');
  assert.equal(legivel(moedaCompacta(999.6)), 'R$ 1 mil');
  assert.equal(legivel(moedaCompacta(0)), 'R$ 0');
  assert.equal(legivel(moedaCompacta(-0.3)), 'R$ 0');
  assert.equal(legivel(moedaCompacta(2500000)), 'R$ 2,5 mi');
});

/* -------------------------------------------------- o "hoje" da tela (12/10) */

test('O CASO RUIM: aparelho com a data errada não muda o "hoje" da tela', () => {
  // 11/10 às 15h em São Paulo (18h UTC); o servidor disse 11/10.
  const atrasado = new Date('2026-09-01T18:00:00Z');
  const adiantado = new Date('2026-12-25T18:00:00Z');
  assert.equal(hojeDaTela('2026-10-11', { agora: atrasado, passouMs: 1000 }), '2026-10-11');
  assert.equal(hojeDaTela('2026-10-11', { agora: adiantado, passouMs: 1000 }), '2026-10-12', 'adiantado só ganha o dia seguinte');
  // Fuso do aparelho não conta: 02h UTC do dia 12 ainda é 23h do dia 11 em São Paulo.
  assert.equal(hojeDaTela('2026-10-11', { agora: new Date('2026-10-12T02:00:00Z'), passouMs: 1000 }), '2026-10-11');
});

test('a tela vira o dia à meia-noite sem recarregar, e só o que o tempo passado permite', () => {
  const meiaNoiteEPouco = new Date('2026-10-12T03:05:00Z'); // 00:05 do dia 12 em São Paulo
  assert.equal(hojeDaTela('2026-10-11', { agora: meiaNoiteEPouco, passouMs: 10 * 60000 }), '2026-10-12');
  const tresDias = new Date('2026-10-14T15:00:00Z');
  assert.equal(hojeDaTela('2026-10-11', { agora: tresDias, passouMs: 3 * 86400000 }), '2026-10-14');
  assert.equal(hojeDaTela('2026-10-11', { agora: tresDias, passouMs: 86400000 }), '2026-10-12');
});

test('sem o dia do servidor, vale o dia de São Paulo do aparelho', () => {
  const agora = new Date('2026-10-12T02:00:00Z');
  assert.equal(hojeDaTela(null, { agora }), '2026-10-11');
  assert.equal(hojeDaTela('2026-02-30', { agora }), '2026-10-11');
  assert.equal(hojeDaTela(undefined, { agora, passouMs: NaN }), '2026-10-11');
});
