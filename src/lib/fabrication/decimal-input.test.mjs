import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimalDraft } from './decimal-input.mjs';
test('entrada decimal preserva estados intermediários e interpreta vírgula', () => {
  assert.deepEqual(parseDecimalDraft('1,'), { valid: true, complete: false });
  assert.deepEqual(parseDecimalDraft('-'), { valid: true, complete: false });
  assert.deepEqual(parseDecimalDraft('1,25'), { valid: true, complete: true, value: 1.25 });
  assert.deepEqual(parseDecimalDraft(''), { valid: true, complete: true, value: null });
  assert.equal(parseDecimalDraft('1,2,3').valid, false);
  assert.equal(parseDecimalDraft('Infinity').valid, false);
});
