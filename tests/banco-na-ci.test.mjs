// O BANCO DE VERDADE NA CI (12/10/2026).
//
// Os testes de banco (os *banco*.test.mjs, o patrimonio-final-integridade e o
// mkt-fontes-integracao) rodam o SQL das migrações num PostgreSQL em memória,
// o PGlite, sem tocar o Supabase. Sem o pacote eles PULAM, e teste pulado sai
// verde: até 12/10 a CI passava sem rodar nenhum deles, porque o pacote só
// existia nas máquinas de quem programava. Agora ele está no devDependencies
// (o npm ci da CI instala), e este teste trava a volta: na CI (o GitHub
// define CI=true), sem o PGlite, ele FALHA, em vez de os outros pularem
// calados. Fora da CI, sem o pacote, ele pula dizendo o motivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('na CI o PGlite existe e responde: os testes de banco rodam de verdade, não pulam', async (t) => {
  let n = null;
  let erro = null;
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
      n = (await db.query('select 1 + 1 as n')).rows[0]?.n ?? null;
    } finally {
      await db.close();
    }
  } catch (e) {
    erro = e;
  }
  if (n !== 2 && process.env.CI !== 'true') {
    t.skip(`PGlite ausente fora da CI (${erro?.message ?? 'select 1 + 1 não deu 2'}): rode npm ci`);
    return;
  }
  assert.equal(n, 2, `Na CI o PGlite tem de existir (@electric-sql/pglite no devDependencies): ${erro?.message ?? 'select 1 + 1 não deu 2'}`);
});
