// O que a página do Marketing (etapa a2) escolhe para cada lista:
// src/components/marketing/derivar.js. As contas de prazo, semáforo e
// indicador têm teste próprio (src/lib/calc/marketing-canais.test.mjs); aqui
// se prova QUEM entra em cada lista, para a Visão geral, o chip e o canal
// aberto nunca discordarem sobre a mesma tarefa.
// Começa pelo caso ruim: tarefa sumida, tarefa fantasma, zero inventado,
// link perigoso e conclusão que apagaria o canal ou a pessoa da ação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acaoComSituacao,
  calendarioDoMes,
  canaisDaFileira,
  diaDaSemana,
  historicoDoCanal,
  itensDeImplantacao,
  kpisGerais,
  linhasFazer,
  linkSeguro,
  linkWhatsapp,
  numeroDoWhatsapp,
  MES_VALIDO,
  mesVizinho,
  nomeDoMes,
  nomeDoResponsavel,
  resumoDosCanais,
  rotinasDoCanal,
  semanaParaComparar,
  semanaParaLancar,
  semanasDoCanal,
  SITUACAO_AO_CONCLUIR,
  trechosDaFileira,
  trocarMetricas,
  trocarPorId,
  ultimasPublicacoes,
} from '../src/components/marketing/derivar.js';
import { acaoParaTela, prepararAcao, SITUACOES_FEITAS } from '../supabase/functions/_shared/marketing.mjs';

const HOJE = '2026-10-14'; // quarta-feira
const IG = 'c0000000-0000-4000-8000-000000000002';
const SITE = 'c0000000-0000-4000-8000-000000000001';
const WA = 'c0000000-0000-4000-8000-000000000007';

const canais = [
  { id: SITE, codigo: 'site', nome: 'Site', grupo: 'digital', ativo: true, emImplantacao: false, diasParado: 7 },
  { id: IG, codigo: 'instagram', nome: 'Instagram', grupo: 'digital', ativo: true, emImplantacao: false, diasParado: 7 },
  { id: WA, codigo: 'whatsapp', nome: 'WhatsApp', grupo: 'contato', ativo: true, emImplantacao: false, diasParado: 7 },
  { id: 'c-pin', codigo: 'pinterest', nome: 'Pinterest', grupo: 'digital', ativo: false, emImplantacao: true, diasParado: 7 },
  { id: 'c-velho', codigo: 'orkut', nome: 'Orkut', grupo: 'digital', ativo: false, emImplantacao: false, diasParado: 7 },
];
const acao = (id, extra = {}) => ({ id, nome: `Ação ${id}`, canalId: IG, prazo: HOJE, status: 'Produção', investimento: 0, responsavelId: null, responsavel: '', ...extra });
const item = (id, extra = {}) => ({ id, canalId: IG, tipo: 'unica', titulo: `Item ${id}`, ativo: true, concluidoEm: null, implantacao: false, ordem: 0, ...extra });

// ------------------------------------------------------------- caso ruim --

test('o caso ruim: ação feita some do Fazer, mas fica na tela enquanto o Desfazer está à vista', () => {
  const acoes = [acao('a1', { status: 'Encerrada' }), acao('a2', { status: 'Publicada' }), acao('a3')];
  assert.deepEqual(linhasFazer({ acoes }).map((l) => l.id), ['a3']);
  const mantidos = new Set(['acao:a1']);
  const linhas = linhasFazer({ acoes, mantidos });
  assert.deepEqual(linhas.map((l) => [l.id, l.feito]), [['a1', true], ['a3', false]]);
  // A conclusão na linha usa uma situação que conta como feita.
  assert.ok(SITUACOES_FEITAS.includes(SITUACAO_AO_CONCLUIR));
});

test('o caso ruim: rotina, gatilho, item retirado e item feito não viram tarefa de concluir no Fazer', () => {
  const playbook = [
    item('i1'),
    item('i2', { tipo: 'rotina' }),
    item('i3', { tipo: 'gatilho' }),
    item('i4', { ativo: false }),
    item('i5', { concluidoEm: '2026-10-10T12:00:00Z' }),
  ];
  assert.deepEqual(linhasFazer({ playbook }).map((l) => l.id), ['i1']);
  // Item do playbook ainda não tem dia: nunca aparece como atrasado.
  assert.equal(linhasFazer({ playbook })[0].prazo, null);
  // Feito, mas com o Desfazer à vista: continua, marcado.
  assert.deepEqual(linhasFazer({ playbook, mantidos: new Set(['item:i5']) }).map((l) => [l.id, l.feito]), [['i1', false], ['i5', true]]);
});

test('o caso ruim: item do playbook de canal desativado não fica órfão no Fazer; a ação do canal continua', () => {
  const fileira = new Set(canaisDaFileira(canais).map((c) => c.id));
  const acoes = [acao('a1', { canalId: 'c-velho' })];
  const playbook = [item('i1', { canalId: 'c-velho' }), item('i2', { canalId: 'c-pin' }), item('i3')];
  assert.deepEqual(linhasFazer({ acoes, playbook, canaisDoPlaybook: fileira }).map((l) => l.id), ['a1', 'i2', 'i3']);
  // Sem a lista de canais (quem chama não pediu o filtro), nada some.
  assert.deepEqual(linhasFazer({ acoes, playbook }).map((l) => l.id), ['a1', 'i1', 'i2', 'i3']);
});

test('o caso ruim: lista que não chegou não vira zero nos números do topo', () => {
  const k = kpisGerais({ acoes: undefined, playbook: [], publicacoes: undefined }, HOJE);
  assert.equal(k.abertas, null);
  assert.equal(k.atrasadas, null);
  assert.equal(k.publicacoes, null);
  assert.equal(k.investimentoMes, null);
  // E publicações que não chegaram não acusam canal parado.
  const r = resumoDosCanais({ canais, acoes: [], playbook: [], publicacoes: undefined }, HOJE).get(IG);
  assert.equal(r.indicador, null);
  assert.equal(r.semaforo.tom, 'ok');
});

test('o caso ruim: link "javascript:" nunca vira link na tela', () => {
  assert.equal(linkSeguro('javascript:alert(1)'), null);
  assert.equal(linkSeguro('  JAVASCRIPT:alert(1)'), null);
  assert.equal(linkSeguro('data:text/html,oi'), null);
  assert.equal(linkSeguro(''), null);
  assert.equal(linkSeguro(null), null);
  assert.equal(linkSeguro(' https://impresilk.com.br '), 'https://impresilk.com.br');
});

test('o caso ruim: concluir na linha não apaga o canal, a pessoa nem os orçamentos da ação', () => {
  const linha = {
    id: '7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b', nome: 'Reel', objetivo: null, publico: null, canal_id: IG, canal_texto: 'Redes',
    responsavel_id: '100001', responsavel_texto: 'Ana', prazo: HOJE, situacao: 'Produção', investimento: 500, url: null, versao: 3,
    criado_em: '2026-10-01T10:00:00Z', atualizado_em: '2026-10-02T10:00:00Z', legado_id: null,
  };
  const tela = acaoParaTela(linha, ['123', '456']);
  const enviada = acaoComSituacao(tela, SITUACAO_AO_CONCLUIR);
  // Carimbos e versão não vão no corpo da ação (a versão vai à parte).
  for (const k of ['versao', 'criadoEm', 'atualizadoEm', 'migrada']) assert.equal(k in enviada, false, k);
  // A mesma regra do servidor aceita e mantém tudo, mudando só a situação.
  const { dados, orcamentos } = prepararAcao(enviada);
  assert.equal(dados.situacao, 'Encerrada');
  assert.equal(dados.canal_id, IG);
  assert.equal(dados.canal_texto, 'Redes');
  assert.equal(dados.responsavel_id, '100001');
  assert.equal(dados.responsavel_texto, 'Ana');
  assert.equal(dados.investimento, 500);
  assert.deepEqual(orcamentos, ['123', '456']);
  // A ação de antes não foi tocada.
  assert.equal(tela.status, 'Produção');
  assert.equal(tela.versao, 3);
});

// ------------------------------------------------------------------ Fazer --

test('Fazer do canal: só as do canal; filtro "minhas" pelo id da pessoa; implantação fora quando ela tem lugar próprio', () => {
  const acoes = [acao('a1'), acao('a2', { canalId: WA }), acao('a3', { responsavelId: '100001' })];
  const playbook = [item('i1'), item('i2', { implantacao: true }), item('i3', { canalId: WA, responsavelId: '100001' })];
  assert.deepEqual(linhasFazer({ acoes, playbook, canalId: IG }).map((l) => l.id), ['a1', 'a3', 'i1', 'i2']);
  assert.deepEqual(linhasFazer({ acoes, playbook, canalId: IG, semImplantacao: true }).map((l) => l.id), ['a1', 'a3', 'i1']);
  assert.deepEqual(linhasFazer({ acoes, playbook, idPessoa: '100001' }).map((l) => l.id), ['a3', 'i3']);
  // O texto antigo do responsável viaja junto, para a tela mostrar o nome.
  assert.equal(linhasFazer({ acoes: [acao('a9', { responsavel: 'Ana (antigo)' })] })[0].responsavelTexto, 'Ana (antigo)');
});

test('nome do responsável: pessoa pelo id; sem id, o texto antigo; id fora da lista não mostra o número', () => {
  const pessoas = [{ idPessoa: '100001', nome: 'Ana Exemplo' }];
  assert.equal(nomeDoResponsavel({ responsavelId: '100001' }, pessoas), 'Ana Exemplo');
  assert.equal(nomeDoResponsavel({ responsavelId: null, responsavelTexto: 'Bruno' }, pessoas), 'Bruno');
  assert.equal(nomeDoResponsavel({ responsavelId: '999999' }, pessoas), 'Pessoa fora da lista do RH');
  // Lista ainda chegando (ou o RH fora): nunca vazio, que a linha leria
  // como "Sem responsável", nem "fora da lista".
  assert.equal(nomeDoResponsavel({ responsavelId: '100001' }, null), 'Responsável');
  assert.equal(nomeDoResponsavel({ responsavelId: '100001', responsavelTexto: 'Ana (antigo)' }, null), 'Ana (antigo)');
});

// -------------------------------------------------------- chips e números --

test('fileira: canal ativo ou em implantação, na ordem que veio; desativado fora de implantação sai', () => {
  assert.deepEqual(canaisDaFileira(canais).map((c) => c.codigo), ['site', 'instagram', 'whatsapp', 'pinterest']);
  assert.deepEqual(canaisDaFileira(undefined), []);
});

test('fileira em trechos de um grupo só: a ordem cadastrada manda, e nenhum canal some', () => {
  // A carga padrão: digital, contato e offline seguidos viram três trechos.
  const padrao = [
    { id: '1', grupo: 'digital' }, { id: '2', grupo: 'digital' },
    { id: '3', grupo: 'contato' }, { id: '4', grupo: 'contato' },
    { id: '5', grupo: 'offline' },
  ];
  assert.deepEqual(trechosDaFileira(padrao).map((t) => [t.grupo, t.canais.map((c) => c.id)]), [
    ['digital', ['1', '2']],
    ['contato', ['3', '4']],
    ['offline', ['5']],
  ]);
  // O caso ruim: WhatsApp cadastrado entre Site e Instagram. A tela não
  // reordena calada (o chip sairia do lugar que a gestão escolheu): vira um
  // trecho a mais, com fio dos dois lados.
  const misturada = [{ id: 's', grupo: 'digital' }, { id: 'w', grupo: 'contato' }, { id: 'i', grupo: 'digital' }];
  assert.deepEqual(trechosDaFileira(misturada).map((t) => t.canais.map((c) => c.id)), [['s'], ['w'], ['i']]);
  // Grupo vazio ou estranho não derruba o canal da fileira.
  const estranhos = trechosDaFileira([{ id: 'a' }, { id: 'b', grupo: '' }, { id: 'c', grupo: 'novo' }, null]);
  assert.deepEqual(estranhos.map((t) => [t.grupo, t.canais.length]), [['sem-grupo', 2], ['novo', 1]]);
  assert.deepEqual(trechosDaFileira(undefined), []);
});

test('chip: pendentes contam ação aberta e item único; "parado" só em canal digital', () => {
  const acoes = [acao('a1', { prazo: '2026-10-10' }), acao('a2', { canalId: WA, prazo: '2026-10-30' })];
  const playbook = [item('i1', { canalId: SITE })];
  const publicacoes = [{ id: 'p1', canalId: IG, data: '2026-10-13' }];
  const r = resumoDosCanais({ canais, acoes, playbook, publicacoes }, HOJE);
  assert.equal(r.get(IG).pendentes, 1);
  assert.equal(r.get(IG).semaforo.tom, 'bad'); // a1 atrasada
  assert.equal(r.get(IG).indicador.valor, 1);
  // Site digital sem nenhuma publicação: vermelho, "sem publicação".
  assert.deepEqual(r.get(SITE).semaforo, { tom: 'bad', texto: 'sem publicação' });
  // WhatsApp é contato: não publica, então não é julgado parado.
  assert.equal(r.get(WA).semaforo.tom, 'ok');
  assert.equal(r.get(WA).pendentes, 1);
});

test('números do topo: abertas, atrasadas, publicações de 7 dias e investimento das ações com prazo no mês', () => {
  const acoes = [
    acao('a1', { prazo: '2026-10-10', investimento: 100 }),
    acao('a2', { prazo: '2026-10-20', investimento: 50.5, status: 'Encerrada' }),
    acao('a3', { prazo: '2026-11-02', investimento: 999 }),
  ];
  const publicacoes = [{ id: 'p1', canalId: IG, data: '2026-10-13' }, { id: 'p2', canalId: IG, data: '2026-10-01' }];
  const k = kpisGerais({ acoes, playbook: [], publicacoes }, HOJE);
  assert.equal(k.abertas, 2);
  assert.equal(k.atrasadas, 1);
  assert.equal(k.publicacoes.valor, 1);
  assert.equal(k.investimentoMes, 150.5);
  assert.equal(k.mes, '2026-10');
});

// ------------------------------------------------- canal aberto e listas --

test('implantação, rotinas e gatilhos do canal, na ordem do playbook', () => {
  const playbook = [
    item('i3', { implantacao: true, ordem: 30 }),
    item('i1', { implantacao: true, ordem: 10, concluidoEm: '2026-10-01T10:00:00Z' }),
    item('i2', { implantacao: true, ordem: 20, ativo: false }),
    item('r2', { tipo: 'rotina', ordem: 20 }),
    item('r1', { tipo: 'rotina', ordem: 10 }),
    item('g1', { tipo: 'gatilho' }),
    item('r3', { tipo: 'rotina', ativo: false }),
    item('x', { tipo: 'rotina', canalId: WA }),
  ];
  // Os feitos ficam no checklist (dá para desmarcar); retirado sai.
  assert.deepEqual(itensDeImplantacao(playbook, IG).map((i) => i.id), ['i1', 'i3']);
  const { rotinas, gatilhos } = rotinasDoCanal(playbook, IG);
  assert.deepEqual(rotinas.map((i) => i.id), ['r1', 'r2']);
  assert.deepEqual(gatilhos.map((i) => i.id), ['g1']);
});

test('histórico do canal: do mais novo para o mais velho, sem data no fim, retirada fora', () => {
  const acoes = [acao('a1', { prazo: '2026-10-01', status: 'Encerrada' }), acao('a2', { prazo: '2026-10-09' }), acao('a3', { prazo: '2026-09-01', status: 'Publicada' })];
  const playbook = [item('i1', { concluidoEm: '2026-10-05T15:00:00Z' })];
  const publicacoes = [
    { id: 'p1', canalId: IG, data: '2026-10-08', titulo: 'Reel' },
    { id: 'p2', canalId: IG, data: '2026-10-07', retiradaEm: '2026-10-08T10:00:00Z' },
    { id: 'p3', canalId: WA, data: '2026-10-08' },
  ];
  const h = historicoDoCanal({ acoes, playbook, publicacoes }, IG);
  assert.deepEqual(h.map((x) => x.chave), ['pub:p1', 'item:i1', 'acao:a1', 'acao:a3']);
});

test('calendário do mês: só os dias com alguma coisa, em ordem; ação aberta e feita entram', () => {
  const acoes = [acao('a1', { prazo: '2026-10-20' }), acao('a2', { prazo: '2026-10-03', status: 'Encerrada' }), acao('a3', { prazo: '2026-11-01' })];
  const publicacoes = [{ id: 'p1', canalId: IG, data: '2026-10-20' }, { id: 'p2', canalId: IG, data: '2026-10-21', retiradaEm: 'x' }];
  const cal = calendarioDoMes({ acoes, publicacoes }, IG, '2026-10');
  assert.deepEqual(cal.map((d) => d.dia), ['2026-10-03', '2026-10-20']);
  assert.deepEqual(cal[1].entradas.map((e) => e.chave), ['acao:a1', 'pub:p1']);
  assert.equal(cal[0].entradas[0].feito, true);
});

test('mês na URL: só AAAA-MM real; vizinho atravessa o ano; nome por extenso', () => {
  for (const ruim of ['2026-13', '2026-1', '2026-00', 'abc', '', null, '1999-12', '2026-10-01']) assert.equal(MES_VALIDO(ruim), false, String(ruim));
  assert.equal(MES_VALIDO('2026-10'), true);
  assert.equal(mesVizinho('2026-12', 1), '2027-01');
  assert.equal(mesVizinho('2026-01', -1), '2025-12');
  assert.equal(nomeDoMes('2026-03'), 'março de 2026');
  assert.equal(nomeDoMes('2026-13'), '');
  assert.equal(diaDaSemana('2026-10-12'), 'segunda');
  assert.equal(diaDaSemana('2026-10-18'), 'domingo');
  assert.equal(diaDaSemana('lixo'), '');
});

test('semanas dos Resultados: a mais recente com número; sem nada, a de hoje; a de hoje sempre na lista', () => {
  const metricas = [
    { canalId: IG, semana: '2026-09-28' },
    { canalId: IG, semana: '2026-10-05' },
    { canalId: WA, semana: '2026-10-12' },
  ];
  assert.equal(semanaParaComparar(metricas, IG, HOJE), '2026-10-05');
  assert.equal(semanaParaComparar([], IG, HOJE), '2026-10-12');
  assert.deepEqual(semanasDoCanal(metricas, IG, HOJE), ['2026-10-12', '2026-10-05', '2026-09-28']);
});

test('semana para lançar: nunca abre por padrão na última que já tem número', () => {
  // Segunda 19/10, número só de 05/10: abre na 12/10, a que falta (a da
  // comparação seria 05/10, que convidaria a sobrescrever).
  const so0510 = [{ canalId: IG, semana: '2026-10-05' }];
  assert.equal(semanaParaComparar(so0510, IG, '2026-10-19'), '2026-10-05');
  assert.equal(semanaParaLancar(so0510, IG, '2026-10-19'), '2026-10-12');
  // Semana passada já lançada: abre na desta semana.
  assert.equal(semanaParaLancar([{ canalId: IG, semana: '2026-10-12' }], IG, '2026-10-19'), '2026-10-19');
  // Número de outro canal não conta.
  assert.equal(semanaParaLancar([{ canalId: WA, semana: '2026-10-12' }], IG, '2026-10-19'), '2026-10-12');
  assert.equal(semanaParaLancar([], IG, 'lixo'), null);
});

test('últimas publicações do canal: as mais novas primeiro, sem as retiradas', () => {
  const pubs = [
    { id: 'p1', canalId: IG, data: '2026-10-01' },
    { id: 'p2', canalId: IG, data: '2026-10-09' },
    { id: 'p3', canalId: IG, data: '2026-10-10', retiradaEm: 'x' },
    { id: 'p4', canalId: WA, data: '2026-10-11' },
    { id: 'p5', canalId: IG, data: '2026-10-05' },
  ];
  assert.deepEqual(ultimasPublicacoes(pubs, IG, 2).map((p) => p.id), ['p2', 'p5']);
});

test('WhatsApp do canal: link wa.me com o número da empresa e a mensagem escrita', () => {
  // número fictício (o repositório é público)
  assert.equal(linkWhatsapp('Olá! Quero um orçamento & prazo', '5531900000000'), 'https://wa.me/5531900000000?text=Ol%C3%A1!%20Quero%20um%20or%C3%A7amento%20%26%20prazo');
  assert.equal(linkWhatsapp('Olá', '+55 (31) 90000-0000'), 'https://wa.me/5531900000000?text=Ol%C3%A1');
});

test('WhatsApp do canal: sem mensagem ou sem número que preste, sem link (wa.me sem número não chega ao comercial)', () => {
  assert.equal(linkWhatsapp('Olá! Quero um orçamento', null), null);
  assert.equal(linkWhatsapp('Olá! Quero um orçamento', ''), null);
  assert.equal(linkWhatsapp('Olá! Quero um orçamento', '123'), null);
  assert.equal(linkWhatsapp('Olá! Quero um orçamento', '1234567890123456'), null);
  assert.equal(linkWhatsapp('   ', '5531900000000'), null);
  assert.equal(linkWhatsapp(null, '5531900000000'), null);
});

test('número do WhatsApp: tirado do link do perfil do canal WhatsApp', () => {
  const com = (urlPerfil, extra = {}) => [{ id: IG, codigo: 'instagram', urlPerfil: 'https://wa.me/5531911111111' }, { id: WA, codigo: 'whatsapp', ativo: true, urlPerfil, ...extra }];
  assert.equal(numeroDoWhatsapp(com('https://wa.me/5531900000000')), '5531900000000');
  assert.equal(numeroDoWhatsapp(com('https://wa.me/5531900000000?text=oi')), '5531900000000');
  assert.equal(numeroDoWhatsapp(com('https://api.whatsapp.com/send?phone=5531900000000&text=oi')), '5531900000000');
  assert.equal(numeroDoWhatsapp(com('+55 31 90000-0000')), '5531900000000');
  // casos ruins: sem canal, sem link, canal inativo, outro site, sem número, número curto
  assert.equal(numeroDoWhatsapp([]), null);
  assert.equal(numeroDoWhatsapp(null), null);
  assert.equal(numeroDoWhatsapp(com(null)), null);
  assert.equal(numeroDoWhatsapp(com('https://wa.me/5531900000000', { ativo: false })), null);
  assert.equal(numeroDoWhatsapp(com('https://exemplo.com/5531900000000')), null);
  assert.equal(numeroDoWhatsapp(com('https://wa.me/')), null);
  assert.equal(numeroDoWhatsapp(com('https://wa.me/123')), null);
  assert.equal(numeroDoWhatsapp(com('javascript:alert(5531900000000)')), null);
  // o número de outro canal não vale: só o do canal WhatsApp
  assert.equal(numeroDoWhatsapp([{ id: IG, codigo: 'instagram', urlPerfil: 'https://wa.me/5531911111111' }]), null);
});

// ----------------------------------------------------- trocas no estado --

test('troca no estado: a linha nova toma o lugar da velha sem mexer na lista antiga', () => {
  const antes = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
  const depois = trocarPorId(antes, { id: 'b', v: 2 });
  assert.deepEqual(depois, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
  assert.deepEqual(antes[1], { id: 'b', v: 1 });
  assert.deepEqual(trocarPorId(antes, { id: 'c', v: 1 }).map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(trocarPorId(antes, { v: 9 }).length, 2);
  // Números da semana: um por (canal, semana), mesmo com id novo.
  const m = trocarMetricas([{ id: 'x', canalId: IG, semana: '2026-10-05', alcance: 1 }], { id: 'y', canalId: IG, semana: '2026-10-05', alcance: 2 });
  assert.deepEqual(m, [{ id: 'y', canalId: IG, semana: '2026-10-05', alcance: 2 }]);
});
