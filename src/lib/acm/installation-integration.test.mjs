import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, calibrationSignature } from './model.mjs';
import { createInstallation } from '../../../supabase/functions/_shared/acm-installation.mjs';
import { serializeProjectJSON, parseProjectJSON } from './storage.mjs';
import { productionInput } from './navigation.mjs';
import { buildProject } from './engine.mjs';

// Valid PNG with a bounded ancillary text chunk exercises the generic text-size guard.
function photoFixture() {
  const original = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const data = Buffer.from('Comment\0' + 'ficticio '.repeat(2000));
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length); chunk.write('tEXt', 4); data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return 'data:image/png;base64,' + Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]).toString('base64');
}

test('legacy project and incomplete installation remain valid recoverable drafts', () => {
  const project = createProject();
  assert.deepEqual(validateProject(project), []);
  project.installation = createInstallation();
  assert.deepEqual(validateProject(project), []);
  assert.deepEqual(parseProjectJSON(serializeProjectJSON(project)), project);
  assert.equal(project.installation.space.baseGround, null);
});

test('installation photo and typed order association survive backup without relaxing other text guards', () => {
  const project = createProject(); project.installation = createInstallation();
  project.installation.order = { source: 'painel-os', id: 'os-ficticia-a', number: 'F-10', client: 'Cliente fictício', company: 'Empresa de teste', linkedAt: '2026-01-01T00:00:00Z' };
  project.installation.photos = [{ id: 'photo-test', name: 'Local fictício.png', dataUrl: photoFixture(), note: 'Imagem de teste' }];
  assert.ok(project.installation.photos[0].dataUrl.length > 16000);
  assert.deepEqual(parseProjectJSON(serializeProjectJSON(project)), project);
  const unrelated = structuredClone(project); unrelated.titleBlock = { client: photoFixture() };
  assert.throws(() => serializeProjectJSON(unrelated));
  const unsafe = structuredClone(project); unsafe.installation.photos[0].dataUrl = 'https://example.invalid/private-photo.png';
  assert.throws(() => serializeProjectJSON(unsafe));
});

test('site measurements, position and order do not change cutting geometry or workshop calibration', () => {
  const before = createProject(), after = structuredClone(before);
  after.installation = createInstallation();
  after.installation.space = { ...after.installation.space, width: 10000, height: 4000, baseGround: 0 };
  after.installation.plate = { width: 4000, height: 800, thickness: 3, weight: null };
  assert.deepEqual(productionInput(after), productionInput(before));
  assert.equal(calibrationSignature(after), calibrationSignature(before));
  assert.deepEqual(buildProject(after), buildProject(before));
});

test('invalid imported installation cannot bypass the shared model or backup validator', () => {
  for (const mutate of [
    value => { value.space.width = NaN; },
    value => { value.plate.weight = -3; },
    value => { value.photos = Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: 'Foto', dataUrl: photoFixture() })); },
    value => { value.order = { source: 'arbitrary', id: '123' }; },
  ]) {
    const project = createProject(); project.installation = createInstallation(); mutate(project.installation);
    assert.ok(validateProject(project).length);
    assert.throws(() => serializeProjectJSON(project));
  }
});
