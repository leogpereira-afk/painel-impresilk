// OS DADOS FICTÍCIOS DAS FONTES NA PRÉVIA (src/review/fontes-ficticias*.json):
// o que a ação "fontes" devolve, gerado pelos conectores, pela coletora e pela
// porta de verdade (tests/gerar-fontes-ficticias.mjs).
//
// Começa pelo caso ruim: segredo no arquivo (o repositório é público) e o
// arquivo que ficou para trás de um conector que mudou (a prévia ensinaria a
// tela a desenhar um formato que o servidor não manda mais). Depois, a
// variedade que a prévia promete e o formato do fonteParaTela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CENARIOS, COMANDO, caminhoDoArquivo, gerarFontesFicticias, segredosFicticios, textoDoArquivo } from './gerar-fontes-ficticias.mjs';
import { FONTES, fonteParaTela, tirarRestrito } from '../supabase/functions/_shared/mkt-fontes/info.mjs';
import { MOTIVOS } from '../supabase/functions/_shared/mkt-oauth.mjs';

// O Supabase roda em UTC; a geração não depende do fuso (o gerador prova),
// mas o teste fixa o mesmo do servidor.
process.env.TZ = 'UTC';

const TRAVESSAO = /[\u2013\u2014]/;
const texto = (nome) => readFileSync(caminhoDoArquivo(nome), 'utf8');
const arquivo = (nome) => JSON.parse(texto(nome));

test('o caso ruim: nenhum segredo, token ou chave no arquivo da prévia (o repositório é público)', () => {
  for (const nome of Object.keys(CENARIOS)) {
    const t = texto(nome);
    const vazou = segredosFicticios().filter((s) => t.includes(s)).map((s) => `${s.slice(0, 12)}...`);
    assert.deepEqual(vazou, [], `${nome}: valor de secret ou token no arquivo`);
    assert.equal(/"(access_?token|refresh_?token|client_?secret|private_?key|api_?key|authorization|password|senha)"\s*:/i.test(t), false, `${nome}: chave de credencial`);
    assert.equal(/BEGIN [A-Z ]*PRIVATE KEY|Bearer\s+[A-Za-z0-9]|\bAIza[0-9A-Za-z_-]{30,}|\bya29\.|\bEAA[A-Za-z0-9]{30,}/.test(t), false, `${nome}: formato de credencial`);
    // Os NOMES dos secrets não vão no retrato (a tela recebe só "configurado").
    assert.equal(/"secrets"\s*:/.test(t), false, `${nome}: lista de secrets no retrato`);
  }
});

test('o caso ruim: o arquivo da prévia é o que os conectores de hoje geram (senão, gere de novo)', async () => {
  for (const nome of Object.keys(CENARIOS)) {
    const novo = textoDoArquivo(await gerarFontesFicticias(nome));
    assert.ok(novo === texto(nome), `${CENARIOS[nome].arquivo} ficou para trás dos conectores (ou da coletora, ou da porta). Gere de novo, na pasta do Painel:\n  ${COMANDO}`);
  }
});

test('a variedade que a prévia abre: um estado diferente em cada fonte, como o pedido', () => {
  const r = arquivo('variedade');
  const f = r.fontes;
  assert.deepEqual(Object.fromEntries(FONTES.map((x) => [x, f[x].estado])), {
    site: 'ok', google: 'parcial', meta: 'ok', google_ads: 'aguardando_aprovacao', linkedin: 'falta_configurar', pinterest: 'falta_conectar',
  });
  // Google: GA4 e Search Console ok, o Perfil da Empresa aguardando o Google.
  assert.deepEqual(Object.fromEntries(Object.entries(f.google.partes).map(([k, p]) => [k, p.estado])), { ga4: 'ok', search_console: 'ok', perfil: 'aguardando_aprovacao' });
  assert.ok(f.google.dados.ga4 && f.google.dados.search_console, 'o Google parcial tem os quadros do GA4 e do Search Console');
  assert.equal(f.google.dados.perfil, null, 'o Perfil nunca trouxe dado: null, e não um quadro de zeros');
  assert.ok(f.google.conexao?.conectadoEm, 'o Google está conectado');
  // LinkedIn sem os secrets do app; Pinterest com eles e sem conexão.
  assert.equal(f.linkedin.configurado, false);
  assert.equal(f.pinterest.configurado, true);
  assert.equal(f.pinterest.conexao, null);
  assert.deepEqual(f.linkedin.dados, {});
  assert.deepEqual(f.pinterest.dados, {});
  assert.deepEqual(f.google_ads.dados, {}, 'sem aprovação não há número: nenhum quadro inventado');
  assert.equal(f.google_ads.ultimaBoaEm, null);
  // O histórico tem os dois dias de cron; o da Meta tem a coleta que caiu ontem.
  for (const x of FONTES) assert.equal(f[x].ultimas.length, 2, x);
  assert.deepEqual(f.meta.ultimas.map((u) => u.estado), ['ok', 'erro']);
  assert.ok(FONTES.every((x) => f[x].andando === false));
});

test('as cheias: as seis ok, com todos os quadros (e o dado pessoal só dentro de "restrito")', () => {
  const r = arquivo('cheio');
  for (const x of FONTES) {
    assert.equal(r.fontes[x].estado, 'ok', x);
    assert.ok(Object.keys(r.fontes[x].dados).length > 0, `${x} sem quadros`);
    assert.ok(Object.values(r.fontes[x].partes).every((p) => p.estado === 'ok'), x);
    assert.equal(r.fontes[x].configurado, true, x);
  }
  for (const x of ['google', 'linkedin', 'pinterest']) assert.ok(r.fontes[x].conexao?.conectadoEm, `${x} conectado`);
  // O arquivo é a visão da gestão: tem "restrito". Sem ele, nenhum lead,
  // ligação ou e-mail de quem mexeu na conta sobra em lugar nenhum.
  const t = JSON.stringify(r);
  assert.ok(t.includes('"restrito"'));
  const semRestrito = JSON.stringify(tirarRestrito(r));
  assert.equal(semRestrito.includes('"restrito"'), false);
  assert.equal(/fulana@example\.com|Fulana de Teste|alguem@example\.com/.test(semRestrito), false, 'dado pessoal fora do "restrito"');
});

test('o formato é o da ação "fontes": a resposta da porta, cada fonte no formato do fonteParaTela', () => {
  const chaves = Object.keys(fonteParaTela('site', {})).sort();
  for (const nome of Object.keys(CENARIOS)) {
    const r = arquivo(nome);
    assert.deepEqual(Object.keys(r), ['_comentario', 'ok', 'papel', 'ordem', 'fontes', 'avisos', 'motivos'], nome);
    assert.match(r._comentario, /tests\/gerar-fontes-ficticias\.mjs/);
    assert.equal(r.ok, true);
    assert.equal(r.papel, 'gestao');
    assert.deepEqual(r.ordem, FONTES);
    assert.deepEqual(Object.keys(r.fontes), FONTES);
    assert.deepEqual(r.avisos, []);
    assert.deepEqual(r.motivos, MOTIVOS);
    for (const x of FONTES) {
      const f = r.fontes[x];
      assert.deepEqual(Object.keys(f).sort(), chaves, `${nome}.${x}`);
      assert.equal(f.fonte, x);
      assert.equal(f.oauth, ['google', 'linkedin', 'pinterest'].includes(x));
      // As datas do relógio fixo: as coletas de 10 e 11/10/2026, no horário dos jobs.
      assert.match(f.coletadoEm, /^2026-10-11T09:[0-3]\d:\d\d\.\d{3}Z$/, `${nome}.${x}`);
      for (const p of Object.values(f.partes)) assert.ok(p.coletadoEm === null || /^2026-10-1[01]T09:/.test(p.coletadoEm));
      // Texto do Painel sem travessão (título de post é do dono e fica como veio).
      for (const a of f.avisos) assert.equal(TRAVESSAO.test(a), false, `${nome}.${x}: ${a}`);
      for (const p of Object.values(f.partes)) assert.equal(TRAVESSAO.test(p.motivo ?? ''), false, `${nome}.${x}: ${p.motivo}`);
    }
  }
});
