import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MUBI_BASE_URL = 'https://mubi.exemplo.invalid/api';
process.env.MUBI_PUBLIC_KEY = 'publica-ficticia';
process.env.MUBI_TOKEN = 'credencial-ficticia';
const { anosDoHistorico, fatiasPorAno } = await import('../netlify/functions/mubi-cache-background.mjs');

// Os anos reais da casa: 2020 ate 2026, do mais novo para o mais velho.
const TODAS = fatiasPorAno('2020-01-01', '2026-09-08');
const anos = (r) => r.fatias.map((f) => f.ano);

test('com a completa fresca, pula so o que ela ja cobre -- e mantem o mais novo primeiro', () => {
  const r = anosDoHistorico(TODAS, { completaHa: 6 });
  assert.deepEqual(anos(r), [2024, 2023, 2022, 2021, 2020]);
  assert.equal(r.pulados, 2);            // 2026 e 2025 sao da completa
  // A ORDEM importa: nada velho passa na frente de algo novo.
  assert.deepEqual(anos(r), [...anos(r)].sort((a, b) => b - a));
});

/* O CASO QUE A TRAVA EXISTE PARA IMPEDIR: se a completa parou de rodar, pular
   os anos dela deixaria 2025/2026 sem ninguem -- exatamente o defeito de
   08/09/2026, so que pior, porque teria virado regra. */
test('completa atrasada (ou que nunca rodou): faz TODOS os anos', () => {
  for (const h of [49, 200, Infinity]) {
    const r = anosDoHistorico(TODAS, { completaHa: h });
    assert.equal(r.pulados, 0);
    assert.deepEqual(anos(r), [2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  }
});

test('no limite de 48h ainda pula; um minuto depois, nao', () => {
  assert.equal(anosDoHistorico(TODAS, { completaHa: 48 }).pulados, 2);
  assert.equal(anosDoHistorico(TODAS, { completaHa: 48.02 }).pulados, 0);
});

test('pedido a mao manda: ninguem pede um periodo e recebe outro', () => {
  const r = anosDoHistorico(TODAS, { completaHa: 1, pedidoAMao: true });
  assert.equal(r.pulados, 0);
  assert.deepEqual(anos(r), [2026, 2025, 2024, 2023, 2022, 2021, 2020]);
});

/* Corrida que nao faz nada e diz "sucesso" e pior que corrida lenta. */
test('periodo todo dentro do alcance da completa: nao pula nada', () => {
  const so2026 = fatiasPorAno('2026-01-01', '2026-09-08');
  const r = anosDoHistorico(so2026, { completaHa: 1 });
  assert.equal(r.pulados, 0);
  assert.deepEqual(anos(r), [2026]);
});

test('lista vazia ou invalida nao quebra', () => {
  assert.deepEqual(anosDoHistorico([], { completaHa: 1 }).fatias, []);
  assert.deepEqual(anosDoHistorico(null, { completaHa: 1 }).fatias, []);
});
