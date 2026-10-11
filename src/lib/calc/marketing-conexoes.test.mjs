// As contas do bloco "Conexões" (Configurações > Marketing) e da faixa
// "Fontes" da Visão geral: marketing-conexoes.js. Começa pelo caso ruim: o
// texto da URL na tela, o nonce que vaza, a parte velha mostrada como atual,
// o secret que aparece com valor e o aviso que aparece sem o servidor dizer.
//
// Os retratos são os de src/review/fontes-ficticias.json: a resposta da ação
// "fontes" gerada pelos seis conectores de verdade com as fixtures fictícias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESPERAS_DA_RELEITURA_S,
  LIMITE_DA_RELEITURA_MS,
  PARAMETROS_DA_VOLTA,
  apagarNonceGuardado,
  avisarSemIdentidade,
  avisoDaVolta,
  avisoDoDesconectar,
  botoesDaLinha,
  coletaTerminou,
  confirmacaoTransitoria,
  detalheDaLinha,
  chaveDoNonce,
  faixaDasFontes,
  guardarNonce,
  lerFoco,
  lerNonceGuardado,
  lerVoltaDoOAuth,
  linhaDaConexao,
  listaHumana,
  motivoDaParte,
  opcionaisDaFonte,
  partesDaLinha,
  perguntaDeDesconectar,
  semContaNoPainel,
  semParametros,
  textoDaColeta,
  textoDaColetaAndando,
  textoDaColetaDemorada,
  textoDaColetaPronta,
  textoDoMotivo,
  voltaDestaAba,
} from './marketing-conexoes.js';
import { normalizarFontes, situacaoDaFonte } from './marketing-fontes.js';
import { AVISO_DESCONECTAR_GOOGLE, MOTIVOS } from '../../../supabase/functions/_shared/mkt-oauth.mjs';

const ler = (n) => JSON.parse(readFileSync(new URL(`../../review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const copia = (x) => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-11';
const TRAVESSAO = /[–—]/;
const p = (q) => new URLSearchParams(q);
const NONCE = 'AbCdEfGhIjKlMnOpQrStUv';

/* ------------------------------------------------------------ a volta -- */

test('O CASO RUIM: nada da URL vira texto; o nonce nunca aparece no aviso', () => {
  // Motivo forjado com texto: vira o código nulo e a frase genérica.
  const forjada = lerVoltaDoOAuth(p('secao=marketing&conexao=google&r=erro&motivo=<b>Ligue para 0800</b>'));
  assert.deepEqual(forjada, { fonte: 'google', nome: 'Google', tipo: 'erro', motivo: null });
  const aviso = avisoDaVolta(forjada, VARIEDADE.motivos);
  assert.equal(aviso.texto, `A conexão do Google não foi feita. ${MOTIVOS.troca_falhou}`);
  assert.equal(/0800|<b>/.test(aviso.texto), false);
  // Nonce com cara de outra coisa não é nonce: vira "sem confirmação" e não
  // vai ao servidor.
  for (const ruim of ['curto', '<script>alert(1)</script>xxxxxxxxx', 'a'.repeat(129), 'abc def ghi jkl mno pqr', 'x&r=ok&confirmar=yyyyyyyyyyyyyyyy']) {
    assert.equal(lerVoltaDoOAuth({ conexao: 'google', r: 'ok', confirmar: ruim }).tipo, 'sem_confirmacao', ruim);
  }
  // Fonte que não se conecta por OAuth, ou que não existe, não é volta.
  for (const q of ['conexao=site&r=ok&confirmar=' + NONCE, 'conexao=meta&r=erro&motivo=negado', 'conexao=__proto__&r=ok', 'conexao=google&r=talvez', 'conexao=google', 'r=ok', '']) {
    assert.equal(lerVoltaDoOAuth(p(q)), null, q);
  }
  // O nonce não aparece em nenhuma etapa do aviso.
  const v = lerVoltaDoOAuth(p(`secao=marketing&conexao=pinterest&r=ok&confirmar=${NONCE}`));
  assert.deepEqual(v, { fonte: 'pinterest', nome: 'Pinterest', tipo: 'confirmar', nonce: NONCE });
  for (const etapa of ['confirmando', 'ok', 'recusada', 'falhou']) {
    const a = avisoDaVolta({ ...v, etapa, motivo: 'pedido_vencido', mensagem: 'Pedido vencido.' }, VARIEDADE.motivos);
    assert.equal(a.texto.includes(NONCE), false, etapa);
    assert.equal(TRAVESSAO.test(a.texto), false, etapa);
  }
});

/** Um sessionStorage de mentira (e um que recusa tudo, como a aba com o
 *  armazenamento bloqueado). */
function armazenamento() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const bloqueado = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => { throw new Error('x'); } };

test('O CASO RUIM: a volta só confirma com o nonce guardado NESTA aba, para aquela fonte', () => {
  const a = armazenamento();
  const volta = lerVoltaDoOAuth(p(`secao=marketing&conexao=google&r=ok&confirmar=${NONCE}`));
  // Nada guardado (link de outra pessoa, ou de outra aba): não confirma.
  assert.equal(voltaDestaAba(volta, lerNonceGuardado('google', a)), false);
  // Guardado outro nonce, ou o mesmo nonce em outra fonte: não confirma.
  assert.equal(guardarNonce('google', 'OutroNonceQualquer0001', a), true);
  assert.equal(voltaDestaAba(volta, lerNonceGuardado('google', a)), false);
  assert.equal(guardarNonce('pinterest', NONCE, a), true);
  assert.equal(voltaDestaAba(volta, lerNonceGuardado('google', a)), false);
  // O mesmo nonce, na mesma fonte: confirma. Usado, sai da aba.
  assert.equal(guardarNonce('google', NONCE, a), true);
  assert.equal(voltaDestaAba(volta, lerNonceGuardado('google', a)), true);
  apagarNonceGuardado('google', a);
  assert.equal(lerNonceGuardado('google', a), null);
  assert.equal(voltaDestaAba(volta, lerNonceGuardado('google', a)), false, 'a mesma volta não confirma duas vezes');
  // Só "confirmar" confirma; volta de erro ou sem nonce, nunca.
  assert.equal(voltaDestaAba({ ...volta, tipo: 'erro' }, NONCE), false);
  assert.equal(voltaDestaAba(null, NONCE), false);
  // O aviso de quando não confirma pede o Conectar de novo, sem o nonce.
  const aviso = avisoDaVolta({ ...volta, tipo: 'outra_aba' });
  assert.equal(aviso.tom, 'aviso');
  assert.match(aviso.texto, /não foi confirmada/);
  assert.match(aviso.texto, /clique em Conectar de novo/);
  assert.equal(aviso.texto.includes(NONCE), false);
  assert.equal(TRAVESSAO.test(aviso.texto), false);
});

test('o caso ruim: o nonce guardado na aba: só fonte por OAuth, só no formato, e armazenamento bloqueado não derruba nada', () => {
  const a = armazenamento();
  for (const [fonte, nonce] of [['site', NONCE], ['meta', NONCE], ['__proto__', NONCE], ['google', 'curto'], ['google', '<b>xxxxxxxxxxxxxxxxx</b>'], ['google', null]]) {
    assert.equal(guardarNonce(fonte, nonce, a), false, `${fonte} ${nonce}`);
  }
  assert.equal(a.m.size, 0, 'nada foi guardado');
  // Valor estragado na aba não vale como nonce.
  a.setItem(chaveDoNonce('google'), 'javascript:alert(1)');
  assert.equal(lerNonceGuardado('google', a), null);
  // Armazenamento bloqueado: guardar devolve false (o Conectar avisa), ler devolve null, apagar não lança.
  assert.equal(guardarNonce('google', NONCE, bloqueado), false);
  assert.equal(lerNonceGuardado('google', bloqueado), null);
  assert.doesNotThrow(() => apagarNonceGuardado('google', bloqueado));
  assert.equal(guardarNonce('google', NONCE, null), false);
  // Uma chave por fonte.
  assert.notEqual(chaveDoNonce('google'), chaveDoNonce('linkedin'));
});

test('o caso ruim: o texto do motivo só sai de chave própria de um mapa; código com cara de texto não é código', () => {
  assert.equal(textoDoMotivo('toString', {}), null);
  assert.equal(textoDoMotivo('constructor', {}), null);
  assert.equal(textoDoMotivo('__proto__', { __proto__: { x: 1 } }), null);
  assert.equal(textoDoMotivo('Negado', MOTIVOS), null, 'maiúscula não é código');
  assert.equal(textoDoMotivo('negado mesmo', MOTIVOS), null);
  assert.equal(textoDoMotivo(null, MOTIVOS), null);
  // Valor que não é texto no mapa do servidor: cai para o próximo mapa.
  assert.equal(textoDoMotivo('negado', { negado: 42 }), MOTIVOS.negado);
  assert.equal(textoDoMotivo('negado', { negado: '   ' }), MOTIVOS.negado);
});

test('o texto do motivo: o mapa do servidor primeiro, depois o MOTIVOS do servidor que vem no pacote da tela', () => {
  assert.equal(textoDoMotivo('negado', { negado: 'Frase nova do servidor.' }), 'Frase nova do servidor.');
  assert.equal(textoDoMotivo('negado', VARIEDADE.motivos), MOTIVOS.negado);
  assert.equal(textoDoMotivo('negado', null), MOTIVOS.negado);
  // Os dois da confirmação: do mapa que veio, quando veio; senão, do MOTIVOS
  // (a confirmação pode responder antes de as fontes serem lidas). A frase é
  // sempre a do servidor: nenhuma cópia dela mora na tela.
  assert.equal(textoDoMotivo('pedido_vencido', { pedido_vencido: 'Venceu (servidor).' }), 'Venceu (servidor).');
  assert.equal(textoDoMotivo('pedido_vencido', VARIEDADE.motivos), MOTIVOS.pedido_vencido);
  assert.equal(textoDoMotivo('outra_pessoa', {}), MOTIVOS.outra_pessoa);
  assert.equal(textoDoMotivo('outra_pessoa', null), MOTIVOS.outra_pessoa);
  assert.equal(textoDoMotivo('codigo_que_ninguem_conhece', VARIEDADE.motivos), null);
  for (const t of [MOTIVOS.pedido_vencido, MOTIVOS.outra_pessoa]) assert.ok(typeof t === 'string' && t.length > 20 && !TRAVESSAO.test(t), t);
});

test('a volta: confirmar, erro com motivo, ok sem confirmação; também lida de objeto', () => {
  assert.deepEqual(lerVoltaDoOAuth(p('secao=marketing&conexao=google&r=erro&motivo=negado')), { fonte: 'google', nome: 'Google', tipo: 'erro', motivo: 'negado' });
  assert.deepEqual(lerVoltaDoOAuth({ conexao: 'linkedin', r: 'ok' }), { fonte: 'linkedin', nome: 'LinkedIn', tipo: 'sem_confirmacao' });
  assert.deepEqual(lerVoltaDoOAuth({ conexao: 'linkedin', r: 'ok', confirmar: NONCE }), { fonte: 'linkedin', nome: 'LinkedIn', tipo: 'confirmar', nonce: NONCE });
  // O nonce de verdade (base64url de 16 bytes) passa.
  assert.equal(lerVoltaDoOAuth(p('conexao=google&r=ok&confirmar=q8-_Zz09AaBbCcDdEeFfGg')).tipo, 'confirmar');
  assert.equal(lerVoltaDoOAuth(null), null);
  assert.equal(lerVoltaDoOAuth('conexao=google&r=ok'), null);
});

test('os avisos da volta, etapa por etapa', () => {
  const v = { fonte: 'google', nome: 'Google', tipo: 'confirmar', nonce: NONCE };
  assert.deepEqual(avisoDaVolta({ ...v, etapa: 'confirmando' }), { tom: 'neutro', texto: 'Confirmando a conexão do Google...' });
  assert.deepEqual(avisoDaVolta({ ...v, etapa: 'ok' }), { tom: 'ok', texto: 'Google conectado. Os números chegam na próxima coleta (todo dia de manhã) ou em Atualizar agora.' });
  // Recusada: o texto do código; sem código, a frase do servidor; sem nada, a genérica.
  assert.equal(avisoDaVolta({ ...v, etapa: 'recusada', motivo: 'outra_pessoa', mensagem: 'x' }, { outra_pessoa: 'De outra pessoa (servidor).' }).texto, 'A conexão do Google não foi feita. De outra pessoa (servidor).');
  assert.equal(avisoDaVolta({ ...v, etapa: 'recusada', motivo: null, mensagem: 'Só a gestão do Marketing mexe nisso.' }).texto, 'A conexão do Google não foi feita. Só a gestão do Marketing mexe nisso.');
  assert.equal(avisoDaVolta({ ...v, etapa: 'recusada' }).texto, `A conexão do Google não foi feita. ${MOTIVOS.troca_falhou}`);
  assert.equal(avisoDaVolta({ ...v, etapa: 'recusada', motivo: 'pedido_vencido' }).tom, 'erro');
  // Falhou (rede, servidor fora): dá para tentar de novo com o mesmo nonce.
  const falhou = avisoDaVolta({ ...v, etapa: 'falhou', mensagem: 'Sem conexão com a internet.' });
  assert.deepEqual(falhou, { tom: 'erro', texto: 'Não deu para confirmar a conexão do Google agora. Sem conexão com a internet.', tentarDeNovo: true });
  // r=erro e r=ok sem nonce.
  assert.deepEqual(avisoDaVolta({ fonte: 'pinterest', tipo: 'erro', motivo: 'negado' }, VARIEDADE.motivos), { tom: 'erro', texto: `A conexão do Pinterest não foi feita. ${MOTIVOS.negado}` });
  const sem = avisoDaVolta({ fonte: 'linkedin', tipo: 'sem_confirmacao' });
  assert.equal(sem.tom, 'neutro');
  assert.match(sem.texto, /sem o pedido de confirmação/);
  assert.equal(/conectado\.$/.test(sem.texto), false, 'não afirma que conectou');
  // Lixo: null.
  for (const ruim of [null, {}, { fonte: 'site', tipo: 'erro' }, { fonte: 'google', tipo: 'outro' }]) assert.equal(avisoDaVolta(ruim), null, JSON.stringify(ruim));
});

test('quando vale tentar confirmar de novo: rede e 5xx sim; 4xx (resposta) não', () => {
  assert.equal(confirmacaoTransitoria(new Error('Sem conexão')), true);
  assert.equal(confirmacaoTransitoria({ status: 502 }), true);
  assert.equal(confirmacaoTransitoria({ status: 500 }), true);
  for (const s of [400, 401, 403, 404, 422]) assert.equal(confirmacaoTransitoria({ status: s }), false, String(s));
  assert.equal(confirmacaoTransitoria(null), true);
});

test('limpar a URL: só as chaves pedidas saem; o resto (secao, campanha) fica; nada a tirar é null', () => {
  const q = p(`secao=marketing&conexao=google&r=ok&confirmar=${NONCE}&campanha=x`);
  assert.equal(semParametros(q).toString(), 'secao=marketing&campanha=x');
  assert.equal(q.get('confirmar'), NONCE, 'a consulta de entrada não muda');
  assert.equal(semParametros(p('secao=marketing&r=erro&motivo=negado')).toString(), 'secao=marketing');
  assert.equal(semParametros(p('secao=marketing')), null);
  assert.equal(semParametros(p('secao=marketing&fonte=google'), ['fonte']).toString(), 'secao=marketing');
  assert.equal(semParametros(null), null);
  assert.deepEqual([...PARAMETROS_DA_VOLTA], ['conexao', 'r', 'confirmar', 'motivo']);
});

test('o foco (?fonte=): só uma fonte que existe', () => {
  assert.equal(lerFoco(p('secao=marketing&fonte=google_ads')), 'google_ads');
  for (const ruim of ['fonte=tiktok', 'fonte=', 'fonte=__proto__', '']) assert.equal(lerFoco(p(ruim)), null, ruim);
});

/* ------------------------------------------------------------- a linha -- */

test('O CASO RUIM: a linha de uma fonte sem os secrets diz os NOMES que faltam, sem valor e sem partes velhas', () => {
  const li = linhaDaConexao(VARIEDADE.fontes.linkedin, 'gestao', HOJE);
  assert.equal(li.situacao.chave, 'falta_configurar');
  assert.equal(li.detalhe, 'Precisa de LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET nos Secrets do Supabase; falta ao menos um. Veja Como ligar.');
  assert.deepEqual(li.partes.lista, []);
  assert.equal(li.coleta, null, 'a tentativa de cada manhã na porta fechada não é informação');
  // Sem secret com um só nome.
  const meta = { ...copia(VARIEDADE.fontes.meta), configurado: false, estado: 'falta_configurar' };
  assert.equal(linhaDaConexao(meta, 'visualizacao', HOJE).detalhe, 'Precisa de META_TOKEN nos Secrets do Supabase. Veja Como ligar.');
  // A fonte desconfigurada com o cache "ok" de antes: nenhuma parte "Funcionando".
  const google = { ...copia(CHEIAS.fontes.google), configurado: false, estado: 'falta_configurar' };
  const lg = linhaDaConexao(google, 'gestao', HOJE);
  assert.deepEqual(lg.partes.lista, []);
  assert.match(lg.coleta, /^dados de \d{2}\/\d{2} às \d{2}:\d{2}$/, 'só diz de quando são os dados que ficaram');
});

test('o caso ruim: estado e avisos de ANTES da conexão não aparecem como atuais', () => {
  // Pinterest recém-conectado: o servidor ainda manda "falta_conectar" e o
  // cache tem partes de uma coleta antiga.
  const pin = copia(CHEIAS.fontes.pinterest);
  pin.conexao = { ...pin.conexao, conectadoEm: '2026-10-11T15:00:00.000Z' };
  pin.coletadoEm = '2026-10-10T09:35:00.000Z';
  pin.estado = 'falta_conectar';
  pin.avisos = ['Aviso de antes da conexão.'];
  const l = linhaDaConexao(pin, 'gestao', HOJE);
  assert.equal(l.situacao.chave, 'aguardando_coleta');
  assert.deepEqual(l.partes.lista, []);
  assert.deepEqual(l.avisos, []);
  assert.equal(l.detalhe, situacaoDaFonte(pin).texto);
  assert.equal(l.conectado, 'conectado em 11/10');
});

test('a linha do Google: as três partes na ordem do conector, cada uma com o estado e o motivo em TEXTO', () => {
  const g = linhaDaConexao(VARIEDADE.fontes.google, 'gestao', HOJE);
  assert.equal(g.rotulo, 'Google');
  assert.equal(g.situacao.chave, 'parcial');
  assert.equal(g.conta, 'marketing@exemplo.com.br');
  assert.equal(g.conectado, 'conectado em 01/10');
  assert.match(g.coleta, /^coletado em 11\/10 às \d{2}:\d{2}$/);
  assert.deepEqual(g.partes.lista.map((x) => [x.chave, x.rotulo, x.info.rotulo]), [
    ['ga4', 'Google Analytics', 'Funcionando'],
    ['search_console', 'Search Console', 'Funcionando'],
    ['perfil', 'Perfil da Empresa', 'Aguardando aprovação'],
  ]);
  assert.equal(g.partes.lista[2].motivo, VARIEDADE.fontes.google.partes.perfil.motivo);
  assert.equal(g.partes.lista[0].motivo, null);
  assert.deepEqual([g.partes.funcionando, g.partes.total, g.partes.resumidas], [2, 3, false]);
  assert.deepEqual(g.avisos, VARIEDADE.fontes.google.avisos);
  assert.equal(g.detalhe, null, 'parcial se explica pelas partes');
  assert.deepEqual(g.acoes, { atualizar: true, conectar: false, reconectar: true, desconectar: true });
});

test('a linha com muitas partes: só as que pedem atenção, e a conta das que funcionam; código vira frase', () => {
  const ads = linhaDaConexao(VARIEDADE.fontes.google_ads, 'marketing', HOJE);
  assert.equal(ads.situacao.chave, 'aguardando_aprovacao');
  // A frase é a que o conector mandou (a do arquivo gerado pelos conectores
  // de verdade), e não uma cópia escrita aqui: o código técnico vai à parte.
  const conta = VARIEDADE.fontes.google_ads.partes.conta;
  assert.equal(conta.codigo, 'projeto_sem_aprovacao');
  assert.match(conta.motivo, /nível Explorer/);
  assert.deepEqual(ads.partes.lista.map((x) => [x.rotulo, x.info.rotulo, x.motivo]), [['Conta', 'Erro na coleta', conta.motivo]]);
  assert.match(ads.coleta, /^tentou em 11\/10 às \d{2}:\d{2}, sem dados ainda$/);
  const cheio = linhaDaConexao(CHEIAS.fontes.google_ads, 'gestao', HOJE);
  assert.deepEqual([cheio.partes.lista.length, cheio.partes.funcionando, cheio.partes.total, cheio.partes.resumidas], [0, 17, 17, true]);
  // O site com o PageSpeed sem a chave: as duas partes, com a frase do motivo.
  const site = copia(VARIEDADE.fontes.site);
  site.partes.pagespeed = { estado: 'falta_configurar', motivo: 'sem_chave', coletadoEm: null, tentadoEm: site.coletadoEm };
  site.partes.crux = { estado: 'falta_configurar', motivo: 'sem_chave', coletadoEm: null, tentadoEm: site.coletadoEm };
  const ls = linhaDaConexao(site, 'gestao', HOJE);
  assert.deepEqual(ls.partes.lista.map((x) => [x.chave, x.motivo]), [
    ['pagespeed', 'Falta a chave do Google (GOOGLE_API_KEY) nos Secrets.'],
    ['crux', 'Falta a chave do Google (GOOGLE_API_KEY) nos Secrets.'],
  ]);
  assert.deepEqual([ls.partes.funcionando, ls.partes.total], [6, 8]);
  // Código desconhecido não vira texto cru.
  site.partes.dns = { estado: 'erro', motivo: 'algo_que_ninguem_conhece', coletadoEm: null, tentadoEm: null };
  assert.equal(partesDaLinha(site).lista.find((x) => x.chave === 'dns').motivo, null);
  // A Meta (4 partes): todas na linha, com os 4 avisos.
  const meta = linhaDaConexao(VARIEDADE.fontes.meta, 'gestao', HOJE);
  assert.deepEqual(meta.partes.lista.map((x) => x.rotulo), ['Página do Facebook', 'Instagram', 'Anúncios da Meta', 'Pixel da Meta']);
  assert.equal(meta.avisos.length, 4);
  assert.equal(meta.conectado, null, 'a Meta não se conecta por OAuth');
});

test('O CASO RUIM: os opcionais da linha são só NOME e "cadastrado" (nada com cara de valor), e o servidor antigo não inventa lista', () => {
  const f = {
    fonte: 'google_ads',
    opcionais: [
      { nome: 'GOOGLE_ADS_CUSTOMER_ID', cadastrado: true },
      { nome: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', cadastrado: 'sim' },
      { nome: 'GOOGLE_ADS_CUSTOMER_ID', cadastrado: false },
      { nome: '1234567890', cadastrado: true },
      { nome: 'google_ads_customer_id', cadastrado: true },
      { nome: 'X <b>', cadastrado: true },
      { nome: 'META_APP_SECRET', cadastrado: true, valor: 'segredo-FALSO-0123' },
      'META_APP_SECRET',
      null,
    ],
  };
  const l = opcionaisDaFonte(f);
  assert.deepEqual(l, [
    { nome: 'GOOGLE_ADS_CUSTOMER_ID', cadastrado: true },
    { nome: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', cadastrado: false },
    { nome: 'META_APP_SECRET', cadastrado: true },
  ]);
  assert.equal(JSON.stringify(l).includes('segredo-FALSO'), false, 'só o nome e o cadastrado saem daqui');
  for (const antigo of [{ fonte: 'site' }, { fonte: 'site', opcionais: 'GOOGLE_API_KEY' }, null]) assert.deepEqual(opcionaisDaFonte(antigo), [], JSON.stringify(antigo));
  // A linha leva a lista para o "Como ligar".
  const site = { ...copia(VARIEDADE.fontes.site), opcionais: [{ nome: 'GOOGLE_API_KEY', cadastrado: false }] };
  assert.deepEqual(linhaDaConexao(site, 'gestao', HOJE).opcionais, [{ nome: 'GOOGLE_API_KEY', cadastrado: false }]);
});

test('O CASO RUIM: o código técnico da parte nunca aparece; vale o formato novo (frase + código) e o antigo (código no motivo)', () => {
  // Formato dos conectores consertados: {estado, motivo (frase), codigo}.
  const nova = { estado: 'erro', motivo: 'A Meta recusou o token do usuário do sistema.', codigo: 'token_invalido', coletado_em: null };
  assert.equal(motivoDaParte(nova), 'A Meta recusou o token do usuário do sistema.');
  // Só o código (a frase não veio): o código conhecido vira frase.
  assert.equal(motivoDaParte({ estado: 'falta_configurar', codigo: 'sem_chave' }), 'Falta a chave do Google (GOOGLE_API_KEY) nos Secrets.');
  // Código desconhecido, ou com cara de texto, nunca aparece.
  for (const codigo of ['erro_interno_x9', 'Ligue <b>0800</b>', 'tem espaço', 42, null]) assert.equal(motivoDaParte({ estado: 'erro', codigo }), null, String(codigo));
  // Formato antigo: o código no motivo.
  assert.equal(motivoDaParte({ estado: 'erro', motivo: 'projeto_sem_aprovacao' }), 'O projeto ainda não tem o nível Explorer da Google Ads API.');
  assert.equal(motivoDaParte({ estado: 'erro', motivo: 'codigo_que_ninguem_conhece', codigo: 'sem_chave' }), 'Falta a chave do Google (GOOGLE_API_KEY) nos Secrets.');
  assert.equal(motivoDaParte(null), null);
  // Na linha: a parte com o formato novo mostra a frase, e o código não
  // aparece em lugar nenhum da linha.
  const meta = copia(VARIEDADE.fontes.meta);
  meta.estado = 'parcial';
  meta.partes.pixel = { estado: 'erro', motivo: 'O Pixel não está atribuído ao usuário do sistema.', codigo: 'pixel_nao_atribuido_tecnico', coletadoEm: null, tentadoEm: meta.coletadoEm };
  const l = linhaDaConexao(meta, 'gestao', HOJE);
  assert.equal(l.partes.lista.find((x) => x.chave === 'pixel').motivo, 'O Pixel não está atribuído ao usuário do sistema.');
  assert.equal(JSON.stringify(l).includes('pixel_nao_atribuido_tecnico'), false);
});

test('a frase de apoio muda com o papel: quem pode clicar lê o que clicar', () => {
  const pin = VARIEDADE.fontes.pinterest;
  assert.equal(detalheDaLinha(pin, 'gestao'), 'Configurado. Falta clicar em Conectar e aceitar na tela do provedor.');
  assert.equal(detalheDaLinha(pin, 'marketing'), 'Configurado. Falta a gestão do Marketing conectar.');
  const morta = { ...copia(VARIEDADE.fontes.google), estado: 'reconectar' };
  assert.equal(detalheDaLinha(morta, 'gestao'), 'A conexão parou de valer. Clique em Reconectar.');
  assert.equal(detalheDaLinha(morta, 'visualizacao'), 'A conexão parou de valer. A gestão do Marketing precisa reconectar.');
  const erro = { ...copia(VARIEDADE.fontes.meta), estado: 'erro', ultimas: [{ erro: 'A Meta não respondeu.' }] };
  assert.equal(detalheDaLinha(erro, 'gestao'), 'A última coleta falhou: A Meta não respondeu. O que já estava na tela continua.');
  assert.equal(detalheDaLinha({ ...erro, ultimas: [] }, 'gestao'), 'A última coleta falhou. O que já estava na tela continua.');
  assert.equal(detalheDaLinha({ ...copia(VARIEDADE.fontes.site), estado: null, coletadoEm: null, ultimaBoaEm: null }, 'gestao'), 'Esta fonte ainda não foi coletada nenhuma vez.');
  assert.equal(detalheDaLinha(null, 'gestao'), null);
});

test('a última coleta, em cada caso', () => {
  const f = (extra) => ({ fonte: 'site', oauth: false, configurado: true, ...extra });
  assert.equal(textoDaColeta(f({ coletadoEm: '2026-10-11T09:05:00.000Z', ultimaBoaEm: '2026-10-11T09:05:00.000Z' }), HOJE).startsWith('coletado em 11/10 às '), true);
  assert.match(textoDaColeta(f({ coletadoEm: '2026-10-11T09:05:00.000Z', ultimaBoaEm: '2026-10-10T09:05:00.000Z' }), HOJE), /^dados de 10\/10 às \d{2}:\d{2}; tentou de novo em 11\/10 às \d{2}:\d{2}$/);
  assert.match(textoDaColeta(f({ coletadoEm: '2026-10-11T09:05:00.000Z', ultimaBoaEm: null }), HOJE), /^tentou em 11\/10 às \d{2}:\d{2}, sem dados ainda$/);
  assert.equal(textoDaColeta(f({ coletadoEm: null, ultimaBoaEm: null }), HOJE), 'ainda sem coleta');
  // Ano diferente do de hoje: com o ano.
  assert.match(textoDaColeta(f({ coletadoEm: '2025-12-30T12:00:00.000Z', ultimaBoaEm: '2025-12-30T12:00:00.000Z' }), HOJE), /^coletado em 30\/12\/2025 às /);
  // Data estragada não vira "1970".
  assert.equal(textoDaColeta(f({ coletadoEm: 'ontem', ultimaBoaEm: null }), HOJE), 'ainda sem coleta');
  assert.equal(textoDaColeta(null, HOJE), null);
});

test('os botões: dois à vista, Desconectar no menu; o que resolve o estado vem primeiro e cheio', () => {
  const tabela = (papel) => Object.fromEntries(VARIEDADE.ordem.map((x) => {
    const l = linhaDaConexao(VARIEDADE.fontes[x], papel, HOJE);
    return [x, botoesDaLinha(l.acoes, l.situacao.chave)];
  }));
  assert.deepEqual(tabela('gestao'), {
    site: { visiveis: ['atualizar'], menu: [], primario: null },
    google: { visiveis: ['atualizar', 'reconectar'], menu: ['desconectar'], primario: null },
    meta: { visiveis: ['atualizar'], menu: [], primario: null },
    google_ads: { visiveis: ['atualizar'], menu: [], primario: null },
    linkedin: { visiveis: [], menu: [], primario: null },
    pinterest: { visiveis: ['conectar'], menu: [], primario: 'conectar' },
  });
  assert.deepEqual(tabela('marketing').google, { visiveis: ['atualizar'], menu: [], primario: null });
  assert.ok(Object.values(tabela('visualizacao')).every((b) => !b.visiveis.length && !b.menu.length));
  // Conexão morta: Reconectar primeiro e cheio.
  assert.deepEqual(botoesDaLinha({ atualizar: true, conectar: false, reconectar: true, desconectar: true }, 'reconectar'), { visiveis: ['reconectar', 'atualizar'], menu: ['desconectar'], primario: 'reconectar' });
  assert.deepEqual(botoesDaLinha(null, 'ok'), { visiveis: [], menu: [], primario: null });
});

/* ------------------------------------------------------------- a faixa -- */

test('a faixa: um selo por fonte, na ordem do servidor, com o MESMO estado da linha', () => {
  const r = normalizarFontes(VARIEDADE);
  const faixa = faixaDasFontes(r);
  assert.deepEqual(faixa.map((x) => [x.fonte, x.rotulo, x.info.rotulo]), [
    ['site', 'Site', 'Funcionando'],
    ['google', 'Google', 'Parcial'],
    ['meta', 'Meta', 'Funcionando'],
    ['google_ads', 'Google Ads', 'Aguardando aprovação'],
    ['linkedin', 'LinkedIn', 'Falta configurar'],
    ['pinterest', 'Pinterest', 'Falta conectar'],
  ]);
  for (const x of faixa) assert.equal(x.info.chave, linhaDaConexao(r.porFonte[x.fonte], 'gestao', HOJE).situacao.chave);
  assert.equal(faixaDasFontes(null), null, 'sem retrato: a tela diz que não leu');
  assert.deepEqual(faixaDasFontes({ lista: [null, 'x', { fonte: '' }] }), []);
});

/* ----------------------------------------------------- as respostas -- */

test('as frases das respostas: sem artigo para concordar, sem travessão; o Google avisa dos três', () => {
  assert.equal(textoDaColetaPronta(VARIEDADE.fontes.meta), 'Meta: coleta concluída (Funcionando).');
  assert.equal(textoDaColetaAndando('Site'), 'Site: a coleta começou e continua no servidor. Esta linha se atualiza sozinha quando ela terminar.');
  assert.match(textoDaColetaDemorada('LinkedIn'), /^LinkedIn: a coleta ainda não terminou/);
  const google = perguntaDeDesconectar('google');
  assert.match(google, /^Desconectar o Google\?/);
  assert.match(google, /Analytics, o Search Console e o Perfil da Empresa/);
  assert.equal(perguntaDeDesconectar('pinterest'), 'Desconectar o Pinterest? A coleta para até alguém conectar de novo; os números já coletados ficam.');
  assert.deepEqual(avisoDoDesconectar('google', { revogado: true, aviso: AVISO_DESCONECTAR_GOOGLE }), { tom: 'ok', texto: `Google desconectado. ${AVISO_DESCONECTAR_GOOGLE}` });
  assert.deepEqual(avisoDoDesconectar('google', { revogado: false, aviso: 'O Google não confirmou.' }), { tom: 'aviso', texto: 'Google desconectado. O Google não confirmou.' });
  assert.deepEqual(avisoDoDesconectar('linkedin', { revogado: null, aviso: null }), { tom: 'ok', texto: 'LinkedIn desconectado.' });
  for (const t of [google, perguntaDeDesconectar('linkedin'), textoDaColetaAndando('X'), textoDaColetaDemorada('X')]) assert.equal(TRAVESSAO.test(t), false, t);
});

test('a coleta acompanhada termina quando a data muda e não está mais andando', () => {
  const desde = '2026-10-11T09:05:00.000Z';
  assert.equal(coletaTerminou({ andando: true, coletadoEm: '2026-10-11T15:00:00.000Z' }, desde), false);
  assert.equal(coletaTerminou({ andando: false, coletadoEm: desde }, desde), false, 'ainda não começou a gravar');
  assert.equal(coletaTerminou({ andando: false, coletadoEm: '2026-10-11T15:00:00.000Z' }, desde), true);
  assert.equal(coletaTerminou({ andando: false, coletadoEm: '2026-10-11T15:00:00.000Z' }, null), true, 'nunca tinha coletado');
  assert.equal(coletaTerminou(null, desde), false);
  // As esperas somam a vida de uma coleta (150 s) com folga, e o limite cobre todas.
  const soma = ESPERAS_DA_RELEITURA_S.reduce((a, b) => a + b, 0);
  assert.ok(soma >= 150 && soma * 1000 <= LIMITE_DA_RELEITURA_MS, String(soma));
  assert.ok(ESPERAS_DA_RELEITURA_S.length <= 6, 'cada releitura traz as seis fontes');
});

/* ------------------------------------------------- o login e a pessoa -- */

test('O CASO RUIM: campo que não veio (servidor antigo) não vira aviso nenhum', () => {
  const pessoas = [{ idPessoa: '100001', nome: 'Ana' }, { idPessoa: '100002', nome: 'Bruno', temContaPainel: true }, { idPessoa: '100003', nome: 'Carla', temContaPainel: false }];
  assert.equal(semContaNoPainel(pessoas, '100001'), false, 'sem o campo, sem aviso');
  assert.equal(semContaNoPainel(pessoas, '100002'), false);
  assert.equal(semContaNoPainel(pessoas, '100003'), true);
  assert.equal(semContaNoPainel(pessoas, '999999'), false, 'fora da lista');
  assert.equal(semContaNoPainel(null, '100003'), false, 'lista ainda chegando');
  assert.equal(semContaNoPainel(pessoas, ''), false);
  assert.equal(avisarSemIdentidade({ papel: 'gestao' }), false, 'servidor antigo');
  assert.equal(avisarSemIdentidade({ papel: 'gestao', semIdentidade: false }), false);
  assert.equal(avisarSemIdentidade({ papel: 'gestao', semIdentidade: true }), true);
  assert.equal(avisarSemIdentidade({ papel: 'marketing', semIdentidade: true }), false, 'só a gestão');
  assert.equal(avisarSemIdentidade({ papel: 'gestao', semIdentidade: 'sim' }), false);
  assert.equal(avisarSemIdentidade(null), false);
});

test('a lista para gente', () => {
  assert.equal(listaHumana([]), '');
  assert.equal(listaHumana(['A']), 'A');
  assert.equal(listaHumana(['A', 'B']), 'A e B');
  assert.equal(listaHumana(['A', 'B', 'C']), 'A, B e C');
  assert.equal(listaHumana(null), '');
});
