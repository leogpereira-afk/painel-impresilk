import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrintSessionCache} from '../src/pages/impressao3d-session.mjs';
import {createPrintProject, geometrySignature, validatePrintProject} from '../src/lib/impressao3d/model.mjs';
import {createFabricationStorage} from '../src/lib/fabrication/storage.mjs';

function fakeTarget() {
  const handlers = new Set();
  return {handlers, addEventListener(type, handler) { assert.equal(type, 'beforeunload'); handlers.add(handler); }, removeEventListener(type, handler) { assert.equal(type, 'beforeunload'); handlers.delete(handler); }};
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const snapshot = (project, extra = {}) => ({project, version:0, savedSignature:'', storageError:'', loaded:true, ...extra});

test('edição continua protegida após desmontar a página e fica isolada por usuário', () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), project = createPrintProject();
  cache.keepPending('ana', snapshot(project));
  assert.equal(target.handlers.size, 1);
  const event = {prevented:false, preventDefault() { this.prevented = true; }};
  for (const handler of target.handlers) handler(event);
  assert.equal(event.prevented, true); assert.equal(event.returnValue, '');
  assert.equal(cache.getPending('bia'), undefined);
  const recovered = cache.getPending('ana'); recovered.project.name = 'Mutação externa';
  assert.equal(cache.getPending('ana').project.name, project.name);
  cache.keepPending('bia', snapshot(createPrintProject()));
  cache.clearPending('ana'); assert.equal(target.handlers.size, 1);
  cache.clearPending('bia'); assert.equal(target.handlers.size, 0);
});

test('cache preserva campos incompletos e contém somente fonte e parâmetros, sem malhas', () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), project = createPrintProject();
  project.parameters.wall = ''; project.mesh = {positions:[1,2,3]}; project.parameters.mesh = {positions:[4,5,6]};
  cache.keepPending('ana', {...snapshot(project), result:{parts:[{mesh:{positions:[7,8,9]}}]}});
  const recovered = cache.getPending('ana');
  assert.equal(recovered.project.parameters.wall, '');
  assert.equal('mesh' in recovered.project, false); assert.equal('mesh' in recovered.project.parameters, false); assert.equal('result' in recovered, false);
  assert.equal(target.handlers.size, 1);
  cache.clearPending('ana');
});

test('salvar após desmontagem atualiza a versão CAS e preserva a edição posterior', async () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target});
  const first = createPrintProject(), later = {...first, name:'Edição durante salvamento', revision:2};
  const rows = new Map();
  const backend = {async transact(key, mode, update) { const next = update(structuredClone(rows.get(key))); if (mode === 'readwrite') rows.set(key, structuredClone(next.envelope)); return next.result; }};
  const storage = createFabricationStorage({product:'impressao-3d', validate:validatePrintProject, backend});
  const gate = deferred();
  const save = gate.promise.then(() => storage.save('ana', first, 0)).then(saved => { cache.finishPendingSave('ana', 0, first, saved.version); return saved; });
  cache.trackOwnerSave('ana', save);
  cache.keepPending('ana', snapshot(later));
  let ready = false; const wait = cache.waitForOwnerSave('ana').then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  gate.resolve(); await wait;
  const pending = cache.getPending('ana');
  assert.equal(pending.version, 1); assert.equal(pending.project.name, later.name);
  assert.equal(pending.savedSignature, geometrySignature(first));
  assert.equal(target.handlers.size, 1);
  const savedAgain = await storage.save('ana', pending.project, pending.version);
  assert.equal(savedAgain.version, 2);
  cache.finishPendingSave('ana', 1, later, savedAgain.version);
  assert.equal(cache.getPending('ana'), undefined); assert.equal(target.handlers.size, 0);
});

test('salvar exatamente a edição em memória limpa a pendência e uma resposta antiga não altera versão nova', () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), project = createPrintProject();
  cache.keepPending('ana', snapshot(project, {version:2}));
  assert.equal(cache.finishPendingSave('ana', 1, project, 2), false);
  assert.equal(cache.getPending('ana').version, 2);
  assert.equal(cache.finishPendingSave('ana', 2, project, 3), true);
  assert.equal(cache.getPending('ana'), undefined); assert.equal(target.handlers.size, 0);
});

test('gravação concluída preserva campo temporariamente inválido e só atualiza metadata', () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), saved = createPrintProject();
  const incomplete = structuredClone(saved); incomplete.parameters.wall = '';
  cache.keepPending('ana', snapshot(incomplete));
  assert.equal(cache.finishPendingSave('ana', 0, saved, 1), true);
  const pending = cache.getPending('ana');
  assert.equal(pending.project.parameters.wall, ''); assert.equal(pending.version, 1);
  assert.equal(pending.savedSignature, geometrySignature(saved)); assert.equal(target.handlers.size, 1);
  cache.clearPending('ana');
});

test('erro de gravação não destrói a edição e libera espera para recarregar estado real', async () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), project = createPrintProject(), gate = deferred();
  cache.keepPending('ana', snapshot(project));
  const save = cache.trackOwnerSave('ana', gate.promise);
  const failed = assert.rejects(save, /Quota/), wait = cache.waitForOwnerSave('ana');
  gate.reject(Error('Quota')); await failed; await wait;
  assert.equal(cache.getPending('ana').project.id, project.id); assert.equal(target.handlers.size, 1);
  cache.clearPending('ana'); assert.equal(target.handlers.size, 0);
});

test('espera cobre nova gravação registrada durante a anterior sem bloquear outro usuário', async () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), first = deferred(), second = deferred();
  cache.trackOwnerSave('ana', first.promise);
  let ready = false; const wait = cache.waitForOwnerSave('ana').then(() => { ready = true; });
  await cache.waitForOwnerSave('bia'); assert.equal(ready, false);
  cache.trackOwnerSave('ana', second.promise); first.resolve();
  await Promise.resolve(); await Promise.resolve(); assert.equal(ready, false);
  assert.equal(target.handlers.size, 1);
  second.resolve(); await wait; assert.equal(target.handlers.size, 0);
});

test('snapshot já salvo ou ainda não carregado não cria edição pendente', () => {
  const target = fakeTarget(), cache = createPrintSessionCache({target}), project = createPrintProject();
  cache.keepPending('ana', snapshot(project, {loaded:false}));
  assert.equal(cache.getPending('ana'), undefined);
  cache.keepPending('ana', snapshot(project, {savedSignature:geometrySignature(project)}));
  assert.equal(cache.getPending('ana'), undefined); assert.equal(target.handlers.size, 0);
  assert.throws(() => cache.keepPending('', snapshot(project)), /Identidade/);
});
