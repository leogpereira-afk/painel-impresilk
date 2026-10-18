import test from 'node:test';
import assert from 'node:assert/strict';
import { documentBlob } from './downloads.mjs';

test('download preserves PNG binary bytes and rejects substituted data URLs', async () => {
  const bytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,255,128,65]);
  const blob = documentBlob(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  assert.equal(blob.type, 'image/png');
  for (const invalid of ['data:text/html;base64,aGVsbG8=', 'data:image/png;base64,aGVsbG8=', 'https://example.test/x.png']) assert.throws(() => documentBlob(invalid, 'image/png'));
});

test('document downloads preserve CSV accents and UTF-8 BOM', async () => {
  const source = '\uFEFFMaterial;Medida;Quantidade\nAço;1.200 mm;2';
  const blob = documentBlob(source, 'text/csv;charset=utf-8');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new TextEncoder().encode(source));
});
