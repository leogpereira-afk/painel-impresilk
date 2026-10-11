// AS FONTES DO MARKETING NA PRÉVIA E OS SERVIÇOS DA TELA.
//
// A porta de mentira (src/review/marketing-fontes.mjs) tem de responder como a
// de verdade (supabase/functions/painel-marketing): o papel que pode cada
// botão, a trava de 2 minutos do "Atualizar agora", o dado pessoal só para a
// gestão, o estado que o fonteParaTela daria e as MESMAS frases. Se a prévia
// fosse mais boazinha que o servidor, a tela seria feita para um servidor que
// não existe. E os serviços (src/services/marketing.js) são provados contra
// ela: o erro que leva os segundos da trava, o "servidor antigo", o endereço
// de conexão conferido.
//
// Começa pelo caso ruim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  FRASES, FRASES_CONFIRMAR, faltaApp, travaTexto, criarFontesDaPrevia, parametrosDaPrevia, conexaoDaPrevia, pedidoValido, ESPERA_COLETA_MS, DURACAO_ANDANDO_MS,
} from '../src/review/marketing-fontes.mjs';
import { FONTES, TRAVA_COLETA_MS, fonteParaTela, SECRETS_PADRAO } from '../supabase/functions/_shared/mkt-fontes/info.mjs';
import { AVISO_DESCONECTAR_GOOGLE, FONTES_OAUTH, MOTIVOS, PROVEDORES, VALIDADE_STATE_S } from '../supabase/functions/_shared/mkt-oauth.mjs';
import { situacaoDaFonte } from '../src/lib/calc/marketing-fontes.js';
import { lerVoltaDoOAuth } from '../src/lib/calc/marketing-conexoes.js';

const ler = (n) => JSON.parse(readFileSync(new URL(`../src/review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const PORTA = readFileSync(new URL('../supabase/functions/painel-marketing/index.ts', import.meta.url), 'utf8');
const INICIO = Date.parse('2026-10-11T15:00:00.000Z');
// Os nonces da prévia no teste: fixos e no formato do servidor (base64url).
const NONCE = (n) => `nonce-de-teste-${String(n).padStart(4, '0')}`;

/** A prévia com relógio de mentira (anda só quando o teste manda). */
function previa({ papel = 'gestao', cenarios = [], pedidoGuardado = null, quem = 'demo' } = {}) {
  const relogio = { t: INICIO };
  const guardadas = [];
  let n = 0;
  const p = criarFontesDaPrevia({
    carregar: async () => VARIEDADE,
    carregarCheias: async () => CHEIAS,
    papel,
    cenarios: new Set(cenarios),
    pedidoGuardado,
    guardarPedido: (v) => guardadas.push(v),
    agora: () => relogio.t,
    // A espera da coleta simulada passa no relógio de mentira, sem dormir.
    esperar: async (ms) => { relogio.t += ms; },
    gerarNonce: () => NONCE(++n),
    quem,
  });
  return { relogio, guardadas, pedir: (action, corpo = {}) => p.responder(action, { action, ...corpo }) };
}
/** O nonce que a volta do Conectar trouxe na URL. */
const nonceDaUrl = (url) => new URLSearchParams(url.split('?')[1]).get('confirmar');

/* ------------------------------------------------------------- o papel -- */

test('o caso ruim: visualização não pede coleta; marketing não conecta nem desconecta (as frases da porta)', async () => {
  const ver = previa({ papel: 'visualizacao' });
  for (const fonte of FONTES) assert.deepEqual(await ver.pedir('coletarAgora', { fonte }), { status: 403, corpo: { erro: FRASES.soVer } }, fonte);
  for (const acao of ['conectarInicio', 'desconectar']) {
    for (const papel of ['visualizacao', 'marketing']) {
      const t = previa({ papel });
      assert.deepEqual(await t.pedir(acao, { fonte: 'google' }), { status: 403, corpo: { erro: FRASES.soGestao } }, `${papel} ${acao}`);
    }
  }
  // Mas todos veem o retrato, com o papel de cada um.
  for (const papel of ['visualizacao', 'marketing', 'gestao']) {
    const r = await previa({ papel }).pedir('fontes');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.papel, papel);
    assert.deepEqual(r.corpo.ordem, FONTES);
  }
  // O marketing pede a coleta.
  const mkt = previa({ papel: 'marketing' });
  const r = await mkt.pedir('coletarAgora', { fonte: 'site' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.andando, false);
  assert.equal(r.corpo.fonte.fonte, 'site');
});

test('o caso ruim: dado pessoal (as chaves "restrito") só chega para a gestão', async () => {
  for (const papel of ['marketing', 'visualizacao']) {
    const t = previa({ papel, cenarios: ['fontes-cheias'] });
    const texto = JSON.stringify((await t.pedir('fontes')).corpo);
    assert.equal(texto.includes('"restrito"'), false, papel);
    assert.equal(/Fulana de Teste|fulana@example\.com|alguem@example\.com/.test(texto), false, `${papel}: lead ou e-mail na tela`);
    // Nem pela resposta do "Atualizar agora".
    const r = await t.pedir('coletarAgora', { fonte: 'google_ads' });
    assert.equal(JSON.stringify(r.corpo).includes('"restrito"'), false, `${papel}: restrito no Atualizar agora`);
  }
  const gestao = await previa({ cenarios: ['fontes-cheias'] }).pedir('fontes');
  assert.ok(gestao.corpo.fontes.google_ads.dados.leads.restrito, 'a gestão vê os leads');
});

test('o caso ruim: a leitura leve da prévia não leva "dados" (nem o "restrito") para papel nenhum, e o resto é o da cheia', async () => {
  for (const papel of ['visualizacao', 'marketing', 'gestao']) {
    const t = previa({ papel, cenarios: ['fontes-cheias'] });
    const leve = (await t.pedir('fontes', { leve: true })).corpo;
    for (const f of FONTES) assert.equal('dados' in leve.fontes[f], false, `${papel} ${f}`);
    assert.equal(/"restrito"|Fulana de Teste|fulana@example\.com/.test(JSON.stringify(leve)), false, papel);
    const cheia = (await t.pedir('fontes')).corpo;
    for (const f of FONTES) {
      const { dados, ...semDados } = cheia.fontes[f];
      assert.ok(Object.keys(dados).length > 0, `${papel} ${f}: a cheia tem os dados`);
      assert.deepEqual(leve.fontes[f], semDados, `${papel} ${f}`);
    }
    assert.deepEqual([leve.papel, leve.ordem, leve.avisos, leve.motivos], [cheia.papel, cheia.ordem, cheia.avisos, cheia.motivos]);
    // "leve" que não é true vale como "não mandou" (como na porta).
    assert.ok('dados' in (await t.pedir('fontes', { leve: 'sim' })).corpo.fontes.site);
  }
});

test('o caso ruim: a lista de fontes da prévia traz só as pedidas, como a porta (desconhecida ignorada, restrito só da gestão)', async () => {
  const mkt = previa({ papel: 'marketing', cenarios: ['fontes-cheias'] });
  const r = (await mkt.pedir('fontes', { fontes: ['google_ads', 'tiktok', 42, null, 'site', 'site'] })).corpo;
  assert.deepEqual(r.ordem, ['site', 'google_ads'], 'na ordem do servidor, uma vez cada');
  assert.deepEqual(Object.keys(r.fontes), ['site', 'google_ads']);
  assert.equal(JSON.stringify(r).includes('"restrito"'), false, 'pedir só a fonte não abre o dado pessoal');
  assert.ok(Object.keys(r.fontes.google_ads.dados).length > 0);
  const gestao = (await previa({ cenarios: ['fontes-cheias'] }).pedir('fontes', { fontes: ['google_ads'] })).corpo;
  assert.ok(gestao.fontes.google_ads.dados.leads.restrito, 'a gestão vê, pedindo só a fonte');
  // As duas juntas; a lista vazia; o que não é lista vale como "não mandou".
  const lf = (await mkt.pedir('fontes', { leve: true, fontes: ['meta'] })).corpo;
  assert.deepEqual([lf.ordem, 'dados' in lf.fontes.meta], [['meta'], false]);
  assert.deepEqual((await mkt.pedir('fontes', { fontes: [] })).corpo.fontes, {});
  for (const fontes of ['site', { site: 1 }, 3]) assert.deepEqual((await mkt.pedir('fontes', { fontes })).corpo.ordem, FONTES, JSON.stringify(fontes));
});

test('o caso ruim: o segundo "Atualizar agora" da mesma fonte em menos de 2 minutos é recusado com os segundos que faltam', async () => {
  const t = previa({ papel: 'marketing' });
  const primeiro = await t.pedir('coletarAgora', { fonte: 'meta' });
  assert.equal(primeiro.status, 200);
  // A coleta simulada levou 1,5 s; 30 s depois, faltam 120 - 31,5 = 88,5 s: 89.
  t.relogio.t += 30_000;
  const segundo = await t.pedir('coletarAgora', { fonte: 'meta' });
  assert.equal(segundo.status, 429);
  assert.deepEqual(segundo.corpo, { erro: travaTexto(89), aguardarSegundos: 89 });
  // A trava é por fonte: outra fonte pode.
  assert.equal((await t.pedir('coletarAgora', { fonte: 'site' })).status, 200);
  // Passados os 2 minutos do pedido, pode de novo.
  t.relogio.t = INICIO + TRAVA_COLETA_MS;
  assert.equal((await t.pedir('coletarAgora', { fonte: 'meta' })).status, 200);
  // Fonte que não existe não ocupa trava nenhuma.
  for (const fonte of ['tiktok', '', null, 42, '__proto__']) assert.deepEqual(await t.pedir('coletarAgora', { fonte }), { status: 422, corpo: { erro: FRASES.fonteInvalida } }, String(fonte));
});

test('o caso ruim: Conectar sem os secrets do app diz o que falta (só os NOMES); fonte sem OAuth não conecta', async () => {
  const t = previa();
  const li = await t.pedir('conectarInicio', { fonte: 'linkedin' });
  assert.equal(li.status, 422);
  assert.deepEqual(li.corpo, { erro: 'Falta cadastrar LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET nos Secrets do Supabase.', faltaConfigurar: true });
  for (const fonte of ['site', 'meta', 'google_ads', 'tiktok', undefined]) {
    assert.deepEqual(await t.pedir('conectarInicio', { fonte }), { status: 422, corpo: { erro: FRASES.naoConecta } }, String(fonte));
    assert.deepEqual(await t.pedir('desconectar', { fonte }), { status: 422, corpo: { erro: FRASES.naoConecta } }, String(fonte));
  }
  assert.deepEqual(t.guardadas.filter(Boolean), [], 'nada foi conectado');
});

test('o caso ruim: as frases da prévia são as da porta de verdade, letra por letra', () => {
  for (const [nome, frase] of Object.entries(FRASES)) assert.ok(PORTA.includes(frase), `"${nome}" não está mais na painel-marketing: ${frase}`);
  // As duas que levam número ou nome, pelo molde escrito na porta.
  assert.ok(PORTA.includes('Falta cadastrar ${p.secrets.id} e ${p.secrets.segredo} nos Secrets do Supabase.'));
  assert.ok(PORTA.includes('Esta fonte foi atualizada há pouco. Tente de novo em ${aguardar} segundos.'));
  for (const f of FONTES_OAUTH) assert.equal(faltaApp(f), `Falta cadastrar ${PROVEDORES[f].secrets.id} e ${PROVEDORES[f].secrets.segredo} nos Secrets do Supabase.`);
  // E os campos que a porta manda junto do erro, que a tela usa.
  assert.ok(PORTA.includes('aguardarSegundos: aguardar') && PORTA.includes('faltaConfigurar: true'));
  // As da recusa da confirmação: a prévia lê do MOTIVOS do servidor, e a
  // porta responde com o MOTIVOS (as duas recusas, e o nonce torto também).
  assert.deepEqual(FRASES_CONFIRMAR, { pedidoVencido: MOTIVOS.pedido_vencido, outraPessoa: MOTIVOS.outra_pessoa });
  assert.equal(PORTA.split("json({ erro: MOTIVOS.pedido_vencido, motivo: 'pedido_vencido' }, 404)").length - 1, 2, 'o 404 pedido_vencido da porta (nonce torto e pedido vencido)');
  assert.ok(PORTA.includes("json({ erro: MOTIVOS.outra_pessoa, motivo: 'outra_pessoa' }, 403)"), 'o 403 outra_pessoa da porta');
  assert.ok(Object.values(FRASES_CONFIRMAR).every((t) => typeof t === 'string' && t.length > 20 && !/[\u2013\u2014]/.test(t)));
});

test('o caso ruim: a vista da prévia dá o mesmo estado e os mesmos avisos que o fonteParaTela daria', async () => {
  // Para cada fonte: o retrato (o que a última coleta gravou) e as três
  // situações de agora: com tudo, sem conexão (OAuth) e sem os secrets.
  for (const fonte of FONTES) {
    const oauth = FONTES_OAUTH.includes(fonte);
    const base = CHEIAS.fontes[fonte];
    const extras = oauth ? [PROVEDORES[fonte].secrets.id, PROVEDORES[fonte].secrets.segredo] : [];
    const casos = [
      { nome: 'com tudo', conectada: true, configurada: true },
      ...(oauth ? [{ nome: 'sem conexão', conectada: false, configurada: true }] : []),
      ...(SECRETS_PADRAO[fonte].length || oauth ? [{ nome: 'sem os secrets', conectada: true, configurada: false }] : []),
    ];
    for (const caso of casos) {
      const tela = fonteParaTela(fonte, {
        linha: { valor: { estado: base.estado, avisos: ['aviso da coleta'], partes: {}, dados: {}, coletado_em: base.coletadoEm } },
        conexaoInfo: oauth && caso.conectada ? { conectado_em: base.conexao.conectadoEm, escopos: [] } : null,
        env: () => (caso.configurada ? 'existe' : null), oauth, secretsExtras: extras,
      });
      const resposta = { ...CHEIAS, fontes: { ...CHEIAS.fontes, [fonte]: { ...base, avisos: ['aviso da coleta'], configurado: caso.configurada, conexao: oauth && caso.conectada ? base.conexao : null } } };
      const p = criarFontesDaPrevia({ carregar: async () => resposta, agora: () => INICIO });
      const vista = (await p.responder('fontes', {})).corpo.fontes[fonte];
      assert.deepEqual([vista.estado, vista.avisos], [tela.estado, tela.avisos], `${fonte}, ${caso.nome}`);
    }
  }
});

/* ------------------------------------------------- conectar e desconectar -- */

test('o caso ruim: a volta do Conectar não liga nada sozinha; a confirmação vale uma vez, no prazo, só para quem pediu', async () => {
  const t = previa();
  const { corpo } = await t.pedir('conectarInicio', { fonte: 'pinterest' });
  const nonce = nonceDaUrl(corpo.url);
  assert.equal(nonce, NONCE(1));
  // Antes de confirmar, nada mudou: o Pinterest continua sem conexão.
  assert.equal((await t.pedir('fontes')).corpo.fontes.pinterest.conexao, null);
  const vencido = { status: 404, corpo: { erro: FRASES_CONFIRMAR.pedidoVencido, motivo: 'pedido_vencido' } };
  // Nonce que não saiu daqui, de outra fonte, vazio, ou com cara de objeto.
  for (const [fonte, n] of [['pinterest', NONCE(99)], ['google', nonce], ['pinterest', ''], ['pinterest', undefined], ['pinterest', '__proto__'], ['pinterest', { toString: () => nonce }]]) {
    assert.deepEqual(await t.pedir('conectarConfirmar', { fonte, nonce: n }), vencido, `${fonte} ${String(n)}`);
  }
  // Quem não é gestão não confirma; fonte sem OAuth não confirma.
  for (const papel of ['marketing', 'visualizacao']) assert.deepEqual(await previa({ papel }).pedir('conectarConfirmar', { fonte: 'pinterest', nonce }), { status: 403, corpo: { erro: FRASES.soGestao } }, papel);
  for (const fonte of ['site', 'meta', 'google_ads', 'tiktok']) assert.deepEqual(await t.pedir('conectarConfirmar', { fonte, nonce }), { status: 422, corpo: { erro: FRASES.naoConecta } }, fonte);
  // Outra pessoa (o pedido guardado é de outro login): 403, e o pedido não
  // se gasta (quem pediu ainda confirma).
  const outra = previa({ pedidoGuardado: { fonte: 'pinterest', nonce, em: INICIO, quem: 'outro.login' } });
  assert.deepEqual(await outra.pedir('conectarConfirmar', { fonte: 'pinterest', nonce }), { status: 403, corpo: { erro: FRASES_CONFIRMAR.outraPessoa, motivo: 'outra_pessoa' } });
  // Passados os 10 minutos do state, venceu.
  const tarde = previa();
  const n2 = nonceDaUrl((await tarde.pedir('conectarInicio', { fonte: 'pinterest' })).corpo.url);
  tarde.relogio.t += VALIDADE_STATE_S * 1000 + 1;
  assert.deepEqual(await tarde.pedir('conectarConfirmar', { fonte: 'pinterest', nonce: n2 }), vencido);
  // A confirmação certa liga; a segunda, com o mesmo nonce, não vale mais.
  const ok = await t.pedir('conectarConfirmar', { fonte: 'pinterest', nonce });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.fonte.fonte, 'pinterest');
  assert.deepEqual(ok.corpo.fonte.conexao, conexaoDaPrevia('pinterest', INICIO));
  assert.deepEqual(await t.pedir('conectarConfirmar', { fonte: 'pinterest', nonce }), vencido, 'o mesmo nonce não vale duas vezes');
  // Os dois cenários forçam as recusas, para a tela ser vista com elas.
  const cv = previa({ cenarios: ['pedido-vencido'] });
  const n3 = nonceDaUrl((await cv.pedir('conectarInicio', { fonte: 'google' })).corpo.url);
  assert.deepEqual(await cv.pedir('conectarConfirmar', { fonte: 'google', nonce: n3 }), vencido);
  const co = previa({ cenarios: ['outra-pessoa'] });
  const n4 = nonceDaUrl((await co.pedir('conectarInicio', { fonte: 'google' })).corpo.url);
  assert.equal((await co.pedir('conectarConfirmar', { fonte: 'google', nonce: n4 })).corpo.motivo, 'outra_pessoa');
  // confirmar-falhou: a primeira dá 500 (sem motivo), e o pedido continua
  // de pé; a segunda, com o mesmo nonce, liga.
  const cf = previa({ cenarios: ['confirmar-falhou'] });
  const n5 = nonceDaUrl((await cf.pedir('conectarInicio', { fonte: 'pinterest' })).corpo.url);
  assert.deepEqual(await cf.pedir('conectarConfirmar', { fonte: 'pinterest', nonce: n5 }), { status: 500, corpo: { erro: FRASES.falhou } });
  assert.equal((await cf.pedir('conectarConfirmar', { fonte: 'pinterest', nonce: n5 })).status, 200);
  // O texto que a tela mostra para os dois códigos vem do mapa da ação
  // "fontes", que é o MOTIVOS do servidor (a fonte da verdade, e não uma
  // frase copiada aqui).
  const motivos = (await t.pedir('fontes')).corpo.motivos;
  assert.deepEqual(motivos, { ...MOTIVOS });
  assert.equal(motivos.pedido_vencido, MOTIVOS.pedido_vencido);
  assert.equal(motivos.outra_pessoa, MOTIVOS.outra_pessoa);
  assert.deepEqual(motivos, VARIEDADE.motivos, 'o arquivo gerado pela porta traz o mesmo mapa');
});

test('Conectar devolve a volta com o nonce; confirmada, a conexão vale; a coleta seguinte traz os dados da fonte', async () => {
  const t = previa();
  const r = await t.pedir('conectarInicio', { fonte: 'pinterest' });
  assert.deepEqual(r, { status: 200, corpo: { ok: true, url: `/configuracoes?secao=marketing&conexao=pinterest&r=ok&confirmar=${NONCE(1)}`, nonce: NONCE(1) } });
  // A tela lê essa volta como "confirmar", com o mesmo nonce.
  assert.deepEqual(lerVoltaDoOAuth(new URLSearchParams(r.corpo.url.split('?')[1])), { fonte: 'pinterest', nome: 'Pinterest', tipo: 'confirmar', nonce: NONCE(1) });
  assert.deepEqual(t.guardadas, [{ fonte: 'pinterest', nonce: NONCE(1), em: INICIO, quem: 'demo' }], 'o pedido fica guardado para a recarga da página');
  const confirmada = await t.pedir('conectarConfirmar', { fonte: 'pinterest', nonce: NONCE(1) });
  assert.equal(confirmada.status, 200);
  assert.deepEqual(t.guardadas.at(-1), null, 'confirmado, o pedido guardado sai');
  const pin = (await t.pedir('fontes')).corpo.fontes.pinterest;
  assert.deepEqual(pin, confirmada.corpo.fonte, 'a confirmação devolve a fonte no formato da ação "fontes"');
  assert.deepEqual(pin.conexao, conexaoDaPrevia('pinterest', INICIO));
  assert.equal(pin.conexao.conta, null, 'a conta vem da coleta, não do Conectar');
  // Como o servidor de verdade: o estado ainda é o da última coleta (de antes
  // da conexão). A conta da tela percebe e diz "aguardando a coleta".
  assert.equal(pin.estado, 'falta_conectar');
  assert.equal(situacaoDaFonte(pin).chave, 'aguardando_coleta');
  // Atualizar agora: os dados completos do Pinterest (o arquivo "cheias").
  t.relogio.t += 60_000;
  const c = await t.pedir('coletarAgora', { fonte: 'pinterest' });
  assert.equal(c.status, 200);
  const nova = c.corpo.fonte;
  assert.equal(nova.estado, 'ok');
  assert.deepEqual(Object.keys(nova.dados), Object.keys(CHEIAS.fontes.pinterest.dados));
  assert.equal(nova.conexao.conectadoEm, pin.conexao.conectadoEm, 'a coleta não muda quem conectou nem quando');
  assert.equal(nova.conexao.conta, CHEIAS.fontes.pinterest.conta, 'a coleta descobre a conta');
  const fim = new Date(INICIO + 60_000 + ESPERA_COLETA_MS).toISOString();
  assert.equal(nova.coletadoEm, fim);
  assert.ok(Object.values(nova.partes).every((p) => p.coletadoEm === fim));
  assert.equal(situacaoDaFonte(nova).chave, 'ok');
  assert.deepEqual(nova.ultimas[0], { inicio: new Date(INICIO + 60_000).toISOString(), fim, estado: 'ok', chamadas: CHEIAS.fontes.pinterest.ultimas[0].chamadas, erro: null });
  assert.equal(nova.ultimas.length, 3);
});

test('o pedido sobrevive à recarga da volta (o guardado na aba) e é confirmado depois; o guardado estragado não vale', async () => {
  const pedido = { fonte: 'pinterest', nonce: NONCE(7), em: INICIO - 5_000, quem: 'demo' };
  const t = previa({ pedidoGuardado: pedido });
  // Recarregou: a conexão ainda não vale (só depois da confirmação).
  assert.equal((await t.pedir('fontes')).corpo.fontes.pinterest.conexao, null);
  const c = await t.pedir('conectarConfirmar', { fonte: 'pinterest', nonce: NONCE(7) });
  assert.equal(c.status, 200);
  assert.equal(c.corpo.fonte.conexao.conectadoEm, new Date(INICIO).toISOString(), 'conectado na confirmação');
  for (const ruim of [{ ...pedido, fonte: 'site' }, { ...pedido, nonce: 'curto' }, { ...pedido, em: 'ontem' }, { ...pedido, quem: '' }, 'texto', null]) {
    assert.equal(pedidoValido(ruim), false, JSON.stringify(ruim));
    const p = previa({ pedidoGuardado: ruim });
    assert.equal((await p.pedir('conectarConfirmar', { fonte: 'pinterest', nonce: NONCE(7) })).status, 404, JSON.stringify(ruim));
    assert.equal((await p.pedir('fontes')).corpo.fontes.pinterest.conexao, null);
  }
  // LinkedIn sem os secrets do app: nem o pedido guardado liga (como na porta).
  const li = previa({ pedidoGuardado: { ...pedido, fonte: 'linkedin' } });
  assert.equal((await li.pedir('conectarConfirmar', { fonte: 'linkedin', nonce: NONCE(7) })).status, 422);
  assert.equal((await li.pedir('fontes')).corpo.fontes.linkedin.conexao, null);
  // Volta negada: o endereço diz o motivo, não há nonce nem pedido guardado.
  const negada = previa({ cenarios: ['conexao-negada'] });
  assert.equal((await negada.pedir('conectarInicio', { fonte: 'google' })).corpo.url, '/configuracoes?secao=marketing&conexao=google&r=erro&motivo=negado');
  assert.deepEqual(negada.guardadas, []);
});

test('Desconectar: a fonte cai para "falta conectar" e os dados de antes ficam; o Google revoga e avisa dos três juntos', async () => {
  const t = previa();
  const r = await t.pedir('desconectar', { fonte: 'google' });
  assert.deepEqual(r, { status: 200, corpo: { ok: true, revogado: true, aviso: AVISO_DESCONECTAR_GOOGLE } });
  assert.deepEqual(t.guardadas, [null], 'a volta guardada sai junto');
  const g = (await t.pedir('fontes')).corpo.fontes.google;
  assert.equal(g.estado, 'falta_conectar');
  assert.equal(g.conexao, null);
  assert.deepEqual(g.avisos, []);
  assert.ok(g.dados.ga4, 'como no servidor: o retrato guardado fica, só a conexão sai');
  // Sem conexão para revogar: null, e o aviso do Google continua.
  assert.deepEqual((await t.pedir('desconectar', { fonte: 'google' })).corpo, { ok: true, revogado: null, aviso: AVISO_DESCONECTAR_GOOGLE });
  // LinkedIn e Pinterest não revogam por API.
  const c = previa({ cenarios: ['fontes-cheias'] });
  assert.deepEqual((await c.pedir('desconectar', { fonte: 'pinterest' })).corpo, { ok: true, revogado: null, aviso: null });
  // O Google que não confirma a revogação.
  const falhou = previa({ cenarios: ['revogar-falhou'] });
  assert.deepEqual((await falhou.pedir('desconectar', { fonte: 'google' })).corpo, { ok: true, revogado: false, aviso: FRASES.revogarFalhou });
  // Sem conexão, Atualizar agora só anota a tentativa: o estado não muda.
  t.relogio.t += 10_000;
  const a = await t.pedir('coletarAgora', { fonte: 'google' });
  assert.equal(a.corpo.fonte.estado, 'falta_conectar');
  assert.equal(a.corpo.fonte.ultimas[0].chamadas, 0);
});

test('Atualizar agora em cada estado da variedade: a data anda; o estado só muda quando a coleta de verdade mudaria', async () => {
  const t = previa();
  const antes = (await t.pedir('fontes')).corpo.fontes;
  for (const fonte of FONTES) {
    t.relogio.t += TRAVA_COLETA_MS;
    const r = await t.pedir('coletarAgora', { fonte });
    assert.equal(r.status, 200, fonte);
    const f = r.corpo.fonte;
    assert.equal(f.estado, antes[fonte].estado, `${fonte}: o estado não muda sem motivo`);
    assert.ok(Date.parse(f.coletadoEm) > Date.parse(antes[fonte].coletadoEm), `${fonte}: a data da coleta andou`);
    assert.equal(f.ultimas.length, antes[fonte].ultimas.length + 1);
    assert.deepEqual(Object.keys(f.dados), Object.keys(antes[fonte].dados), `${fonte}: os quadros são os mesmos`);
  }
  const depois = (await t.pedir('fontes')).corpo.fontes;
  // A parte que falhou (o Perfil) fica com a tentativa nova e sem data de dado.
  assert.equal(depois.google.partes.perfil.coletadoEm, null);
  assert.ok(Date.parse(depois.google.partes.perfil.tentadoEm) > Date.parse(antes.google.partes.perfil.tentadoEm));
  assert.equal(depois.google_ads.ultimaBoaEm, null, 'sem aprovação, nenhuma coleta foi boa');
  assert.equal(depois.linkedin.ultimas[0].chamadas, 0, 'sem os secrets, nada foi pedido');
});

test('os cenários da prévia: andando, erro, antigo e cheio', async () => {
  // fontes-andando: a resposta diz "andando" e a fonte fica coletando até terminar.
  const t = previa({ cenarios: ['fontes-andando'] });
  assert.deepEqual(await t.pedir('coletarAgora', { fonte: 'site' }), { status: 200, corpo: { ok: true, andando: true } });
  const durante = (await t.pedir('fontes')).corpo.fontes.site;
  assert.equal(durante.andando, true);
  assert.equal(durante.coletadoEm, VARIEDADE.fontes.site.coletadoEm, 'enquanto anda, o retrato é o de antes');
  t.relogio.t += DURACAO_ANDANDO_MS;
  const fim = (await t.pedir('fontes')).corpo.fontes.site;
  assert.equal(fim.andando, false);
  assert.equal(fim.coletadoEm, new Date(INICIO + DURACAO_ANDANDO_MS).toISOString());
  // fontes-erro: a leitura falha como a porta falha.
  assert.deepEqual(await previa({ cenarios: ['fontes-erro'] }).pedir('fontes'), { status: 500, corpo: { erro: FRASES.falhou } });
  // fontes-antigo: a função antiga não conhece nenhuma das cinco ações.
  for (const acao of ['fontes', 'conectarInicio', 'conectarConfirmar', 'desconectar', 'coletarAgora']) {
    assert.deepEqual(await previa({ cenarios: ['fontes-antigo'] }).pedir(acao, { fonte: 'google' }), { status: 400, corpo: { erro: FRASES.acaoInvalida } }, acao);
  }
  // fontes-cheias: as seis ok.
  const cheias = (await previa({ cenarios: ['fontes-cheias'] }).pedir('fontes')).corpo.fontes;
  assert.ok(FONTES.every((f) => cheias[f].estado === 'ok'));
  // Ação que não é das fontes não passa por aqui.
  assert.deepEqual(await previa().pedir('painel'), { status: 400, corpo: { erro: FRASES.acaoInvalida } });
});

test('os parâmetros da prévia: papel e cenários, antes ou depois do #; o desconhecido é ignorado', () => {
  assert.deepEqual(parametrosDaPrevia('http://127.0.0.1:5196/marketing'), { papel: 'gestao', direcao: true, cenarios: new Set() });
  const a = parametrosDaPrevia('http://127.0.0.1:5196/configuracoes?secao=marketing&papel=marketing&cenario=fontes-andando,revogar-falhou');
  assert.deepEqual([a.papel, a.direcao, [...a.cenarios]], ['marketing', false, ['fontes-andando', 'revogar-falhou']]);
  const h = parametrosDaPrevia('http://127.0.0.1/dist-review/revisao-local.html#/marketing?papel=visualizacao&cenario=fontes-cheias');
  assert.deepEqual([h.papel, [...h.cenarios]], ['visualizacao', ['fontes-cheias']]);
  const ruim = parametrosDaPrevia('http://x/?papel=admin&cenario=apagar-tudo,,fontes-erro');
  assert.deepEqual([ruim.papel, ruim.direcao, [...ruim.cenarios]], ['gestao', true, ['fontes-erro']]);
  // ?papel=gestao é a gestão que não é direção (não traz as ações antigas).
  assert.equal(parametrosDaPrevia('http://x/?papel=gestao').direcao, false);
  assert.equal(parametrosDaPrevia('não é url').papel, 'gestao');
});

/* ------------------------------------------------- os serviços da tela -- */

/** O src/services/marketing.js de verdade, com a rede trocada pela prévia:
 *  o comCracha de mentira entrega o pedido a `globalThis.__portaFontes` e
 *  devolve a Response, como o modo review faz. */
async function servicos() {
  const stubs = {
    '../lib/sessao.js': `export const mensagemDoStatus = (s) => 'status ' + s;
      export const comCracha = async (url, o) => { const b = JSON.parse(o.body); const r = await globalThis.__portaFontes(b); return new Response(JSON.stringify(r.corpo), { status: r.status }); };`,
    '../lib/api.js': "export const API = 'https://api.invalid';",
  };
  const saida = await build({
    entryPoints: [fileURLToPath(new URL('../src/services/marketing.js', import.meta.url))],
    bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^\.\.\/lib\/(sessao|api)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(saida.outputFiles[0].text).toString('base64')}`);
}
const ligar = (t) => { globalThis.__portaFontes = (b) => t.pedir(b.action, b); };

test('o caso ruim (serviços): a trava volta com os segundos; o servidor antigo vira frase; o endereço de fora não vira navegação', async () => {
  const s = await servicos();
  const t = previa({ papel: 'marketing' });
  ligar(t);
  const r = await s.coletarAgoraMarketing('linkedin');
  assert.equal(r.andando, false);
  assert.equal(r.fonte.fonte, 'linkedin');
  await assert.rejects(s.coletarAgoraMarketing('linkedin'), (e) => e.status === 429 && e.aguardarSegundos === 119 && e.message === travaTexto(119));
  await assert.rejects(s.conectarInicioMarketing('google'), (e) => e.status === 403 && e.message === FRASES.soGestao);
  // A função antiga no ar: as quatro dizem o mesmo que o lerPainelMarketing.
  ligar(previa({ cenarios: ['fontes-antigo'] }));
  const ANTIGO = 'O servidor do Marketing ainda está na versão anterior. Tente de novo em alguns minutos.';
  for (const chamar of [() => s.lerFontesMarketing(), () => s.conectarInicioMarketing('google'), () => s.confirmarConexaoMarketing('google', NONCE(1)), () => s.desconectarMarketing('google'), () => s.coletarAgoraMarketing('site'), () => s.lerPainelMarketing()]) {
    await assert.rejects(chamar(), (e) => e.message === ANTIGO && e.servidorAntigo === true && e.status === 400);
  }
  // Um servidor que mandasse o Léo para outro endereço: o serviço recusa.
  for (const url of ['https://evil.example/o/oauth2/v2/auth', 'javascript:alert(1)', '//evil.example', null]) {
    globalThis.__portaFontes = async () => ({ status: 200, corpo: { ok: true, url } });
    await assert.rejects(s.conectarInicioMarketing('google'), /endereço de conexão inesperado/, String(url));
  }
  // O nonce do Conectar: fora do formato, ou ausente (função antiga), vira null.
  for (const [nonce, esperado] of [[NONCE(5), NONCE(5)], ['curto', null], ['<b>x</b>xxxxxxxxxxxxxxxx', null], [undefined, null], [42, null]]) {
    globalThis.__portaFontes = async () => ({ status: 200, corpo: { ok: true, url: '/configuracoes?secao=marketing&conexao=google&r=ok', nonce } });
    assert.deepEqual(await s.conectarInicioMarketing('google'), { url: '/configuracoes?secao=marketing&conexao=google&r=ok', nonce: esperado }, String(nonce));
  }
  // Erro sem frase do servidor: a frase do status, com o status junto.
  globalThis.__portaFontes = async () => ({ status: 502, corpo: null });
  await assert.rejects(s.lerFontesMarketing(), (e) => e.message === 'status 502' && e.status === 502 && !('aguardarSegundos' in e));
});

test('os serviços com a prévia: ler, conectar (com faltaConfigurar), desconectar e atualizar no formato do contrato', async () => {
  const s = await servicos();
  const t = previa();
  ligar(t);
  const r = await s.lerFontesMarketing();
  assert.deepEqual(Object.keys(r), ['ok', 'papel', 'ordem', 'fontes', 'avisos', 'motivos']);
  assert.deepEqual(r.ordem, FONTES);
  // A leve e a do canal, pelo serviço.
  const leve = await s.lerFontesMarketing({ leve: true });
  assert.ok(FONTES.every((f) => !('dados' in leve.fontes[f])));
  const doCanal = await s.lerFontesMarketing({ fontes: ['google', 'site'] });
  assert.deepEqual(doCanal.ordem, ['site', 'google']);
  assert.deepEqual(await s.conectarInicioMarketing('pinterest'), { url: `/configuracoes?secao=marketing&conexao=pinterest&r=ok&confirmar=${NONCE(1)}`, nonce: NONCE(1) });
  // A confirmação: a fonte nova; repetida, a recusa com o CÓDIGO do motivo.
  const confirmada = await s.confirmarConexaoMarketing('pinterest', NONCE(1));
  assert.equal(confirmada.fonte, 'pinterest');
  assert.ok(confirmada.conexao);
  await assert.rejects(s.confirmarConexaoMarketing('pinterest', NONCE(1)), (e) => e.status === 404 && e.motivo === 'pedido_vencido');
  await assert.rejects(s.conectarInicioMarketing('linkedin'), (e) => e.status === 422 && e.faltaConfigurar === true && /LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET/.test(e.message));
  assert.deepEqual(await s.desconectarMarketing('google'), { revogado: true, aviso: AVISO_DESCONECTAR_GOOGLE });
  assert.deepEqual(await s.desconectarMarketing('linkedin'), { revogado: null, aviso: null });
  const c = await s.coletarAgoraMarketing('meta');
  assert.equal(c.andando, false);
  assert.equal(c.fonte.fonte, 'meta');
  // Andando: a fonte não vem (a tela relê depois).
  ligar(previa({ cenarios: ['fontes-andando'] }));
  assert.deepEqual(await s.coletarAgoraMarketing('site'), { andando: true, fonte: null });
});

test('o caso ruim (serviços): a confirmação leva o CÓDIGO do motivo e nada mais; resposta torta não vira fonte', async () => {
  const s = await servicos();
  // Outra pessoa: 403 com o código.
  const co = previa({ cenarios: ['outra-pessoa'] });
  ligar(co);
  const { url } = await s.conectarInicioMarketing('google');
  await assert.rejects(s.confirmarConexaoMarketing('google', nonceDaUrl(url)), (e) => e.status === 403 && e.motivo === 'outra_pessoa' && e.message === FRASES_CONFIRMAR.outraPessoa);
  // Quem não é gestão: 403 sem código (a tela mostra a frase do servidor).
  ligar(previa({ papel: 'marketing' }));
  await assert.rejects(s.confirmarConexaoMarketing('google', NONCE(1)), (e) => e.status === 403 && !('motivo' in e) && e.message === FRASES.soGestao);
  // Motivo com cara de texto (ou de outra coisa) não passa como código.
  for (const motivo of ['<b>ligue</b>', 'Pedido_Vencido', 'tem espaço', 42, { a: 1 }, 'x'.repeat(61)]) {
    globalThis.__portaFontes = async () => ({ status: 404, corpo: { erro: 'Venceu.', motivo } });
    await assert.rejects(s.confirmarConexaoMarketing('google', NONCE(1)), (e) => e.status === 404 && !('motivo' in e), String(motivo));
  }
  // 200 com a fonte de OUTRA fonte, ou sem fonte: null (a tela relê as fontes).
  for (const fonte of [{ fonte: 'linkedin' }, null, 'google', [], undefined]) {
    globalThis.__portaFontes = async () => ({ status: 200, corpo: { ok: true, fonte } });
    assert.equal(await s.confirmarConexaoMarketing('google', NONCE(1)), null, JSON.stringify(fonte));
  }
  // O pedido vai com a fonte e o nonce, e só isso.
  let corpo = null;
  globalThis.__portaFontes = async (b) => { corpo = b; return { status: 200, corpo: { ok: true, fonte: { fonte: 'google' } } }; };
  assert.deepEqual(await s.confirmarConexaoMarketing('google', NONCE(3)), { fonte: 'google' });
  assert.deepEqual(corpo, { action: 'conectarConfirmar', fonte: 'google', nonce: NONCE(3) });
});

test('o caso ruim (serviços): a leitura das fontes só manda "leve" e "fontes" quando pedidos de verdade; sem eles, o pedido de antes', async () => {
  const s = await servicos();
  const pedidos = [];
  globalThis.__portaFontes = async (b) => { pedidos.push(b); return { status: 200, corpo: { ok: true, papel: 'gestao', ordem: [], fontes: {}, avisos: [], motivos: {} } }; };
  await s.lerFontesMarketing();
  await s.lerFontesMarketing({ leve: 'sim', fontes: 'site' });
  await s.lerFontesMarketing({ leve: true });
  await s.lerFontesMarketing({ fontes: ['meta'] });
  await s.lerFontesMarketing({ leve: true, fontes: [] });
  assert.deepEqual(pedidos, [
    { action: 'fontes' },
    { action: 'fontes' },
    { action: 'fontes', leve: true },
    { action: 'fontes', fontes: ['meta'] },
    { action: 'fontes', leve: true, fontes: [] },
  ]);
});
