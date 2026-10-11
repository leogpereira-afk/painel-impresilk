// O PASSO A PASSO DO DONO ("Como ligar", src/components/marketing/conexoes-passos.js).
//
// O Léo segue esse texto sozinho, no Google Cloud, no Gerenciador da Meta, no
// LinkedIn, no Pinterest e no Supabase. Três coisas nele não podem envelhecer
// caladas:
//  1. O NOME DE CADA SECRET. A pesquisa usava nomes que o código não lê
//     (GOOGLE_PSI_KEY, META_SYSTEM_USER_TOKEN, GOOGLE_CLIENT_ID, GBP_CLIENT_ID).
//     Secret com nome errado é uma fonte "falta configurar" para sempre, com o
//     Léo jurando que cadastrou. Todo nome citado tem de ser do SECRETS (ou
//     SECRETS_OPCIONAIS) do conector daquela fonte, e todo nome que o conector
//     exige (ou aceita como opcional) tem de estar citado. O opcional é citado
//     COMO opcional, no próprio passo, com o motivo; o obrigatório, nunca.
//  2. O ENDEREÇO DE RETORNO e os ESCOPOS: um caractere diferente e o provedor
//     recusa a conexão. Têm de ser os do mkt-oauth.mjs, que o servidor usa.
//  3. O TRAVESSÃO (regra da casa).
//
// Começa pelo caso ruim: o detector de nome de secret tem de pegar o nome
// errado da pesquisa, senão a guarda nunca dispara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISO_DOS_VALORES,
  PASSOS,
  URL_RETORNO,
  URL_SECRETS,
  pedacosDoPasso,
  secretsCitados,
  secretsNoTexto,
  textosDaFonte,
} from '../src/components/marketing/conexoes-passos.js';
import { FONTES } from '../supabase/functions/_shared/mkt-fontes/info.mjs';
import { FONTES_OAUTH, PROVEDORES, REDIRECT_URI } from '../supabase/functions/_shared/mkt-oauth.mjs';

const TRAVESSAO = /[–—]/;

// O que cada conector exporta (o código manda, não a pesquisa).
const CONECTORES = Object.fromEntries(
  await Promise.all(FONTES.map(async (f) => [f, await import(`../supabase/functions/_shared/mkt-fontes/${f}.mjs`)])),
);
const exigidos = (f) => [...new Set([...(CONECTORES[f].SECRETS || []), ...(PROVEDORES[f] ? [PROVEDORES[f].secrets.id, PROVEDORES[f].secrets.segredo] : [])])];
const opcionais = (f) => [...(CONECTORES[f].SECRETS_OPCIONAIS || [])];
const aceitos = (f) => new Set([...exigidos(f), ...opcionais(f)]);
// Os passos de uma fonte (sem título e resumo), com o nome que cada um cita.
const passosDaFonte = (f) => PASSOS[f].etapas.flatMap((e) => e.passos);
const OPCIONAL = /\bopcional\b/i;

test('O CASO RUIM: o detector pega os nomes errados da pesquisa (e não pega nome de tela)', () => {
  assert.deepEqual(secretsNoTexto('Crie GOOGLE_PSI_KEY e depois META_SYSTEM_USER_TOKEN.'), ['GOOGLE_PSI_KEY', 'META_SYSTEM_USER_TOKEN']);
  assert.deepEqual(secretsNoTexto('Os secrets GBP_CLIENT_ID e GBP_CLIENT_SECRET'), ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET']);
  // Palavra em maiúsculas sem "_" é nome de tela ou de sigla, não secret.
  assert.deepEqual(secretsNoTexto('Ative a API, baixe o JSON, envie UMA vez, POR MINUTO, o erro 403 access_denied.'), []);
  // O "_" de dentro de um endereço não vira secret.
  assert.deepEqual(secretsNoTexto(`Abra ${URL_SECRETS} e ${URL_RETORNO}`), []);
  // E nenhum dos nomes errados está no passo a passo.
  const todos = FONTES.flatMap(secretsCitados);
  for (const errado of ['GOOGLE_PSI_KEY', 'META_SYSTEM_USER_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'META_APP_ID', 'META_CONFIG_ID']) {
    assert.equal(todos.includes(errado), false, errado);
  }
});

test('todo nome de secret citado é do SECRETS (ou SECRETS_OPCIONAIS) do conector DAQUELA fonte', () => {
  for (const f of FONTES) {
    const ok = aceitos(f);
    for (const nome of secretsCitados(f)) assert.ok(ok.has(nome), `${f}: "${nome}" não está no SECRETS do conector (${[...ok].join(', ') || 'nenhum'})`);
  }
});

test('todo secret que o conector exige, ou aceita como opcional, está citado no passo a passo da fonte', () => {
  for (const f of FONTES) {
    const citados = new Set(secretsCitados(f));
    for (const nome of [...exigidos(f), ...opcionais(f)]) assert.ok(citados.has(nome), `${f}: falta citar ${nome}`);
  }
  // Os nomes que o Léo vai cadastrar, fonte a fonte (se mudar no código, este
  // teste mostra exatamente o quê).
  assert.deepEqual(Object.fromEntries(FONTES.map((f) => [f, secretsCitados(f)])), {
    site: ['GOOGLE_API_KEY'],
    google: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
    meta: ['META_TOKEN', 'META_APP_SECRET'],
    google_ads: ['GOOGLE_ADS_SA_JSON', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    pinterest: ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'],
  });
});

test('O CASO RUIM: o secret opcional é dito opcional no passo que o cita, com o motivo; o obrigatório nunca é chamado de opcional', () => {
  // O detector: pega "Opcional," no começo e "é opcional" no meio, e não
  // pega palavra que só contém o pedaço.
  assert.equal(OPCIONAL.test('Opcional, só se o app pedir: crie META_APP_SECRET.'), true);
  assert.equal(OPCIONAL.test('Essa chave é opcional: sem ela...'), true);
  assert.equal(OPCIONAL.test('Crie META_APP_SECRET (opcionalmente).'), false);
  for (const f of FONTES) {
    for (const nome of opcionais(f)) {
      const passos = passosDaFonte(f).filter((p) => secretsNoTexto(p).includes(nome));
      assert.ok(passos.length > 0, `${f}: nenhum passo cita ${nome}`);
      for (const p of passos) {
        assert.ok(OPCIONAL.test(p), `${f}: o passo de ${nome} não diz que é opcional: ${p}`);
        // O motivo em linguagem simples: quando vale a pena, ou o que fica sem ele.
        assert.ok(/\bs[oó] se\b|\bsem el[ae]s?\b|\bsem os dois\b|não precisa/i.test(p), `${f}: o passo de ${nome} não diz quando vale a pena: ${p}`);
      }
    }
    for (const nome of exigidos(f)) {
      for (const p of passosDaFonte(f).filter((x) => secretsNoTexto(x).includes(nome))) assert.equal(OPCIONAL.test(p), false, `${f}: ${nome} é obrigatório e o passo diz opcional: ${p}`);
    }
  }
});

test('o endereço de retorno é o do servidor, e só as fontes com Conectar o citam', () => {
  assert.equal(URL_RETORNO, 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-mkt-oauth');
  assert.equal(URL_RETORNO, REDIRECT_URI);
  for (const f of FONTES) {
    const cita = textosDaFonte(f).some((t) => t.includes(URL_RETORNO));
    assert.equal(cita, FONTES_OAUTH.includes(f), `${f}: ${cita ? 'cita' : 'não cita'} o endereço de retorno`);
  }
});

test('os escopos citados são os que o servidor pede (o Google sem o do Google Ads; o LinkedIn sem r_basicprofile)', () => {
  const google = textosDaFonte('google').join(' ');
  for (const e of PROVEDORES.google.escopos) assert.ok(google.includes(e), e);
  assert.equal(/auth\/adwords/.test(google), false, 'o escopo do Google Ads é restrito e fica fora do Conectar');
  // O ponto final da frase não é do escopo ("...business.manage. Clique").
  const escoposCitados = [...google.matchAll(/https:\/\/www\.googleapis\.com\/auth\/[a-z]+(?:\.[a-z]+)*/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(escoposCitados)].sort(), [...PROVEDORES.google.escopos].sort());
  const linkedin = textosDaFonte('linkedin').join(' ');
  for (const e of PROVEDORES.linkedin.escopos) assert.ok(linkedin.includes(e), e);
  assert.equal(linkedin.includes('r_basicprofile'), false);
});

test('uma fonte por fonte do servidor, cada uma com etapas e passos de verdade', () => {
  assert.deepEqual(Object.keys(PASSOS).sort(), [...FONTES].sort());
  for (const f of FONTES) {
    const g = PASSOS[f];
    assert.ok(g.titulo && g.resumo, f);
    assert.ok(g.etapas.length > 0, f);
    for (const e of g.etapas) {
      assert.ok(e.titulo, `${f}: etapa sem título`);
      assert.ok(e.passos.length > 0, `${f}: ${e.titulo} sem passos`);
      for (const p of e.passos) assert.ok(typeof p === 'string' && p.trim().length > 10, `${f}: passo vazio`);
    }
  }
});

test('sem travessão em nenhum texto do passo a passo', () => {
  assert.equal(TRAVESSAO.test('a casa — o canal'), true, 'o detector pega');
  assert.equal(TRAVESSAO.test(AVISO_DOS_VALORES), false);
  for (const f of FONTES) for (const t of textosDaFonte(f)) assert.equal(TRAVESSAO.test(t), false, `${f}: ${t}`);
});

test('nenhum valor com cara de segredo no texto (token, chave, refresh)', () => {
  // Chave de API do Google começa com AIza; token da Meta com EAA; os do
  // Pinterest com pina_/pinr_; refresh do Google com 1//. E nada de palavra
  // comprida sem espaço fora de endereço.
  for (const f of FONTES) {
    for (const t of textosDaFonte(f)) {
      const semEndereco = t.replace(/https:\/\/\S+/g, '');
      assert.equal(/AIza|\bEAA[A-Za-z0-9]|pin[ar]_|1\/\//.test(semEndereco), false, `${f}: ${t}`);
      assert.equal(/[A-Za-z0-9_-]{32,}/.test(semEndereco), false, `${f}: ${t}`);
    }
  }
});

test('os pedaços de um passo: link, código, secret e o endereço de retorno; pontuação fica fora do endereço', () => {
  assert.deepEqual(pedacosDoPasso('Abra https://impresilk.com.br. Em Key, escreva GOOGLE_API_KEY; pronto.'), [
    { tipo: 'texto', valor: 'Abra ' },
    { tipo: 'link', valor: 'https://impresilk.com.br' },
    { tipo: 'texto', valor: '. Em Key, escreva ' },
    { tipo: 'secret', valor: 'GOOGLE_API_KEY' },
    { tipo: 'texto', valor: '; pronto.' },
  ]);
  assert.deepEqual(pedacosDoPasso(`cole exatamente ${URL_RETORNO} (sem barra)`), [
    { tipo: 'texto', valor: 'cole exatamente ' },
    { tipo: 'retorno', valor: URL_RETORNO },
    { tipo: 'texto', valor: ' (sem barra)' },
  ]);
  assert.deepEqual(pedacosDoPasso('https://www.googleapis.com/auth/analytics.readonly, e'), [
    { tipo: 'codigo', valor: 'https://www.googleapis.com/auth/analytics.readonly' },
    { tipo: 'texto', valor: ', e' },
  ]);
  // O endereço com consulta inteira (o chamado do Pinterest), sem a vírgula.
  const chamado = 'https://help.pinterest.com/contact?pinterest_api_and_developer_tools=api_access&origin=pbc';
  assert.deepEqual(pedacosDoPasso(`em ${chamado}, com o App ID`)[1], { tipo: 'link', valor: chamado });
  // Juntando os pedaços, o texto volta inteiro, em todo passo de verdade.
  for (const f of FONTES) for (const t of textosDaFonte(f)) assert.equal(pedacosDoPasso(t).map((p) => p.valor).join(''), t);
  // Só https vira link: javascript: e http: ficam texto.
  assert.deepEqual(pedacosDoPasso('javascript:alert(1) http://x.com'), [{ tipo: 'texto', valor: 'javascript:alert(1) http://x.com' }]);
  assert.deepEqual(pedacosDoPasso(''), []);
});
