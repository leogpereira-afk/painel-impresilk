import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.mjs';
import { ACMStorageError, MAX_PROJECT_BYTES, MAX_REVISIONS, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS, createProjectStorage, createIndexedDBBackend, parseProjectJSON, serializeProjectJSON } from './storage.mjs';

// A transactional test adapter: a failed operation never writes. Production uses IndexedDB.
function fixture() {
  const records = new Map(), manifests = new Map(), documents = new Map(); let serial = Promise.resolve(), sequence = 0, quota = false;
  const backend = { transact(owner, mode, update) {
    const operation = serial.catch(() => {}).then(() => {
      const result = update(structuredClone(records.get(owner)));
      if (mode === 'readwrite') {
        if (quota) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        records.set(owner, structuredClone(result.envelope));
      }
      return result.result;
    });
    serial = operation; return operation;
  }, transactDocuments(owner, mode, update, id) {
    const operation = serial.catch(() => {}).then(() => {
      const result = update(structuredClone(manifests.get(owner)), structuredClone(documents.get(JSON.stringify([owner,id]))));
      if (mode === 'readwrite') {
        if (quota) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        if (result.manifest) manifests.set(owner, structuredClone(result.manifest));
        if (result.document) documents.set(JSON.stringify([owner,result.document.id]), structuredClone(result.document));
      }
      return result.result;
    });
    serial = operation; return operation;
  } };
  return { records, manifests, documents, storage: createProjectStorage({ backend, uuid: () => `revision-${++sequence}`, now: () => '2026-01-01T00:00:00.000Z' }), fill: () => { quota = true; } };
}

test('JSON round trip preserves typed millimetres, independent edges and calibration metadata', () => {
  const project = createProject(); project.edges.left = { type: 'fold', height: 20 }; project.fabrication.compensation = { left: 1, top: 2 };
  assert.deepEqual(parseProjectJSON(serializeProjectJSON(project)), project);
  assert.deepEqual(parseProjectJSON(JSON.stringify(project)), project);
  const restored = parseProjectJSON(serializeProjectJSON(project)); restored.front.width = 10;
  assert.equal(project.front.width, 6000);
});

test('imports reject corrupt, future, unsafe, oversized and nonfinite inputs', () => {
  assert.throws(() => parseProjectJSON('{'), { code: 'CORRUPT' });
  assert.throws(() => parseProjectJSON(JSON.stringify({ ...createProject(), schemaVersion: 2 })), { code: 'SCHEMA' });
  assert.throws(() => parseProjectJSON('{"__proto__":{"polluted":true}}'), { code: 'SCHEMA' });
  const unsafe = JSON.stringify(createProject()).replace('"overrides":{}', '"overrides":{"__proto__":{"polluted":true}}');
  assert.throws(() => parseProjectJSON(unsafe), { code: 'SCHEMA' });
  const project = createProject(); project.front.width = Infinity;
  assert.throws(() => serializeProjectJSON(project), { code: 'SCHEMA' });
  assert.throws(() => parseProjectJSON(' '.repeat(MAX_PROJECT_BYTES * 2 + 1)), { code: 'SIZE' });
  assert.equal({}.polluted, undefined);
});

test('strict model validation is shared with import, and Unicode/malicious names remain plain data', () => {
  const project = createProject(); project.name = '<img src=x onerror=alert(1)>';
  assert.equal(parseProjectJSON(serializeProjectJSON(project)).name, project.name);
  project.stock.width = -1;
  assert.throws(() => parseProjectJSON(JSON.stringify(project)), { code: 'SCHEMA' });
});

test('first write requires version zero, reads clone, and simultaneous CAS has one winner', async () => {
  const { storage } = fixture(); const project = createProject();
  assert.equal(await storage.loadDraft('user-a'), null);
  const [a, b] = await Promise.allSettled([storage.saveDraft('user-a', project, 0), storage.saveDraft('user-a', { ...project, name: 'Other tab' }, 0)]);
  assert.equal(a.status, 'fulfilled'); assert.equal(b.status, 'rejected'); assert.equal(b.reason.code, 'CONFLICT');
  assert.equal(b.reason.currentVersion, 1);
  const loaded = await storage.loadDraft('user-a'); loaded.project.name = 'Local mutation';
  assert.equal((await storage.loadDraft('user-a')).project.name, project.name);
  const next = await storage.saveDraft('user-a', { ...project, name: 'Revision after reload' }, 1);
  assert.equal(next.version, 2);
  await assert.rejects(storage.saveDraft('user-a', project, 1), { code: 'CONFLICT' });
  assert.equal((await storage.loadDraft('user-a')).project.name, 'Revision after reload');
});

test('identities are mandatory and never fall back, normalize, or see another history', async () => {
  const { storage } = fixture(); const project = createProject();
  await assert.rejects(storage.loadDraft(''), { code: 'OWNER' });
  await storage.saveDraft('User-A', project, 0);
  const revision = await storage.saveRevision('User-A', project);
  assert.equal(await storage.loadDraft('user-a'), null);
  assert.equal(await storage.loadDraft('User-A '), null);
  assert.deepEqual(await storage.listRevisions('user-b'), []);
  await assert.rejects(storage.restoreRevision('user-b', revision.id), { code: 'NOT_FOUND' });
});

test('snapshots are immutable and idempotent; restore does not overwrite the draft', async () => {
  const { storage } = fixture(); const project = createProject();
  const revision = await storage.saveRevision('user-a', project);
  assert.equal((await storage.saveRevision('user-a', project)).id, revision.id);
  await assert.rejects(storage.saveRevision('user-a', { ...project, name: 'Different bytes' }), { code: 'CONFLICT' });
  await storage.saveDraft('user-a', { ...project, revision: 2, name: 'New draft' }, 0);
  const restored = await storage.restoreRevision('user-a', revision.id);
  assert.deepEqual(restored, project);
  assert.equal((await storage.loadDraft('user-a')).project.revision, 2);
  const history = await storage.listRevisions('user-a');
  assert.equal(history.length, 1); assert.equal(history[0].revision, 1); assert.equal(history[0].project, undefined);
});

test('quota failures and corrupt/future records preserve prior content', async () => {
  const { storage, records, fill } = fixture(); const project = createProject();
  await storage.saveDraft('user-a', project, 0); const original = structuredClone(records.get('user-a'));
  fill();
  await assert.rejects(storage.saveDraft('user-a', { ...project, revision: 2 }, 1), { code: 'QUOTA' });
  assert.deepEqual(records.get('user-a'), original);
  for (const corrupt of [false, null, { schemaVersion: 2 }, { ...original, owner: 'user-b' }, { ...original, draft: { ...original.draft, project: {} } }]) {
    records.set('bad', corrupt);
    await assert.rejects(storage.saveDraft('bad', project, 0), error => error instanceof ACMStorageError);
    assert.deepEqual(records.get('bad'), corrupt);
  }
});

test('revision limit never silently discards older snapshots', async () => {
  const { storage } = fixture();
  for (let i = 1; i <= MAX_REVISIONS; i++) await storage.saveRevision('user-a', { ...createProject(), revision: i });
  await assert.rejects(storage.saveRevision('user-a', { ...createProject(), revision: MAX_REVISIONS + 1 }), { code: 'QUOTA' });
  const history = await storage.listRevisions('user-a');
  assert.equal(history.length, MAX_REVISIONS); assert.equal(history.at(-1).revision, 1);
});

test('IndexedDB unavailable is explicit and does not fall back to global localStorage', async () => {
  const storage = createProjectStorage({ backend: createIndexedDBBackend({ indexedDB: null }) });
  await assert.rejects(storage.loadDraft('user-a'), { code: 'UNAVAILABLE' });
});

const document = overrides => ({ projectId: 'project-a', revision: 1, name: 'piece-front.svg', mime: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"><text>Peça á</text></svg>', ...overrides });

test('archived documents recover exact UTF-8 content and associate project, revision and digest without mixing users', async () => {
  const { storage } = fixture();
  const saved = await storage.saveDocument('User-A', document());
  assert.match(saved.sha256, /^[a-f0-9]{64}$/); assert.match(saved.id, /^doc-[a-f0-9]{64}$/);
  assert.equal(saved.bytes, new TextEncoder().encode(document().content).byteLength);
  assert.equal(saved.content, undefined);
  assert.deepEqual(await storage.getDocument('User-A', saved.id), { ...saved, content: document().content });
  assert.deepEqual(await storage.listDocuments('User-A','project-a'), [saved]);
  assert.deepEqual(await storage.listDocuments('User-A','another-project'), []);
  assert.deepEqual(await storage.listDocuments('user-a'), []);
  await assert.rejects(storage.getDocument('other-user', saved.id), { code: 'NOT_FOUND' });
  await assert.rejects(storage.saveDocument('', document()), { code: 'OWNER' });
});

test('same document is idempotent across races, while conflicting bytes cannot overwrite a saved revision', async () => {
  const { storage } = fixture();
  const same = await Promise.all([storage.saveDocument('a', document()), storage.saveDocument('a', document())]);
  assert.equal(same[0].id, same[1].id); assert.equal((await storage.listDocuments('a')).length, 1);
  const conflicting = document({ name: 'new.svg' });
  const race = await Promise.allSettled([storage.saveDocument('a', conflicting), storage.saveDocument('a', { ...conflicting, content: '<svg />' })]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(race.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
  await assert.rejects(storage.saveDocument('a', document({ content: '<svg />' })), { code: 'CONFLICT' });
  assert.equal((await storage.getDocument('a', same[0].id)).content, document().content);
  const back = await storage.saveDocument('a', document({ name: 'piece-back.svg' }));
  const next = await storage.saveDocument('a', document({ revision: 2, content: '<svg />' }));
  assert.notEqual(back.id, same[0].id); assert.notEqual(next.id, same[0].id);
});

test('PNG data URL and generated text types remain original data; caller mutation during hashing cannot change them', async () => {
  const { storage } = fixture();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=';
  const item = document({ name: 'scene.png', mime: 'image/png', content: png });
  const saving = storage.saveDocument('a', item); item.content = 'changed'; item.revision = 42;
  const saved = await saving;
  assert.equal(saved.revision, 1); assert.equal((await storage.getDocument('a',saved.id)).content, png);
  for (const mime of ['text/html;charset=utf-8','text/csv;charset=utf-8','application/dxf','application/json']) {
    const content = '<script>not executed by storage</script>\n=SUM(1)';
    const result = await storage.saveDocument('a', document({ name: `${mime.split(';')[0].replace('/','-')}.txt`, mime, content }));
    assert.equal((await storage.getDocument('a',result.id)).content, content);
  }
  for (const invalid of [{ mime: 'text/javascript' }, { revision: 0 }, { name: '../x.svg' }, { content: '' }, { mime: 'image/png', content: 'data:image/svg+xml;base64,aGVsbG8=' }]) await assert.rejects(storage.saveDocument('a', document(invalid)), { code: 'SCHEMA' });
  await assert.rejects(storage.saveDocument('a', document({ content: 'x'.repeat(MAX_DOCUMENT_BYTES + 1) })), { code: 'SIZE' });
});

test('quota, content corruption and future document indexes never overwrite archived content or existing drafts', async () => {
  const { storage, documents, manifests, records, fill } = fixture();
  const project = createProject(); await storage.saveDraft('a', project, 0);
  const draft = structuredClone(records.get('a'));
  const saved = await storage.saveDocument('a', document());
  const key = JSON.stringify(['a',saved.id]), original = structuredClone(documents.get(key));
  documents.get(key).content = document().content.replace('Peça', 'Peço'); // Same byte count, wrong digest.
  await assert.rejects(storage.getDocument('a', saved.id), { code: 'CORRUPT' });
  await assert.rejects(storage.saveDocument('a', document()), { code: 'CORRUPT' });
  documents.set(key, original);
  const manifest = structuredClone(manifests.get('a')); fill();
  await assert.rejects(storage.saveDocument('a', document({ revision: 2 })), { code: 'QUOTA' });
  assert.deepEqual(manifests.get('a'), manifest); assert.deepEqual(documents.get(key), original); assert.deepEqual(records.get('a'), draft);
  manifests.set('a', { ...manifest, schemaVersion: 99 });
  await assert.rejects(storage.saveDocument('a', document({ revision: 2 })), { code: 'SCHEMA' });
  assert.equal(manifests.get('a').schemaVersion, 99);
});

test('document count and aggregate size limits reject further writes without deleting previous files', async () => {
  const { storage } = fixture();
  for (let revision = 1; revision <= MAX_DOCUMENTS; revision++) await storage.saveDocument('a', document({ revision, content: 'x' }));
  await assert.rejects(storage.saveDocument('a', document({ revision: MAX_DOCUMENTS + 1 })), { code: 'QUOTA' });
  assert.equal((await storage.listDocuments('a')).length, MAX_DOCUMENTS);
  const full = document({ content: 'x'.repeat(MAX_DOCUMENT_BYTES) });
  for (let revision = 1; revision <= 5; revision++) await storage.saveDocument('big', { ...full, revision });
  await assert.rejects(storage.saveDocument('big', document({ revision: 6, content: 'x' })), { code: 'QUOTA' });
  assert.equal((await storage.listDocuments('big')).length, 5);
});
