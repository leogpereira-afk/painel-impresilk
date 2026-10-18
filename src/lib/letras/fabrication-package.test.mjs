import test from 'node:test';
import assert from 'node:assert/strict';
import { createLetterProject } from './model.mjs';
import { calculateLetters } from './engine.mjs';
import { fabricationPackageHTML } from './fabrication-package.mjs';
test('caderno reúne roteiro, emendas e plano de chapas na mesma revisão', () => {
  const p = createLetterProject({ id: 'pacote-ficticio', revision: 7, name: 'Estudo <fictício>', text: { value: 'O', heightMm: 100 }, construction: { family: 'galvanized-acrylic', depthMm: 75 }, fabrication: { overlapMm: 8, compensationMm: 0, maxStripLengthMm: 250 } });
  const result = calculateLetters(p), html = fabricationPackageHTML(p, result, { generatedAt: '2026-10-17T12:00:00Z' });
  assert.match(html, /Origens, emendas e reconciliação/); assert.match(html, /Plano de corte por material e processo/);
  assert.match(html, /CORTE_NOMINAL/); assert.match(html, /REFERENCIAS_NAO_CORTAR/); assert.match(html, /ANOTACOES_NAO_CORTAR/);
  assert.match(html, /2026-10-17T12:00:00.000Z/); assert.match(html, /Estudo &lt;fictício&gt;/); assert.match(html, /pacote-ficticio · R7/);
  assert.throws(() => fabricationPackageHTML({ ...p, revision: 8 }, result), /revisão/);
});
