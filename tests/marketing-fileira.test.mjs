import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fileira = await readFile(new URL('../src/components/marketing/Fileira.jsx', import.meta.url), 'utf8');
test('canais visíveis não dependem de efeitos ou estado de rolagem', () => {
  assert.doesNotMatch(fileira, /useLayoutEffect|useState|scrollBy|ResizeObserver/);
  assert.match(fileira, /aria-label={rotulo}/);
  assert.match(fileira, /{children}/);
});
