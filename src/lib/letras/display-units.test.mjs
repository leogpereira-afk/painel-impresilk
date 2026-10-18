import test from 'node:test';
import assert from 'node:assert/strict';
import { fromMillimeters, toMillimeters } from './display-units.mjs';
test('display units preserve missing values and the physical size', () => {
  assert.equal(fromMillimeters(null), null);
  assert.equal(toMillimeters(null), null);
  assert.equal(fromMillimeters(75), 7.5);
  assert.equal(toMillimeters(7.5), 75);
  assert.equal(toMillimeters(0.07), 0.7);
  for (const value of [0, 0.7, 3.25, 75, 1234.567, 100000]) {
    for (const unit of ['cm', 'mm']) assert.equal(toMillimeters(fromMillimeters(value, unit), unit), value);
  }
});
test('unknown units are rejected instead of changing scale silently', () => {
  assert.throws(() => toMillimeters(1, 'm'));
  assert.throws(() => fromMillimeters(1, 'px'));
});
