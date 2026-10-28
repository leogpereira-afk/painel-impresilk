import {geometrySignature, PARAMETER_RANGES} from '../lib/impressao3d/model.mjs';

const copy = value => structuredClone(value);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, copy(value[key])]));
const ownerKey = owner => {
  if (typeof owner !== 'string' || !owner.trim()) throw Error('Identidade ausente para a edição local.');
  return owner;
};
function sourceProject(project) {
  const result = pick(project, ['id', 'name', 'revision', 'product', 'schemaVersion', 'unit', 'units', 'material']);
  result.source = pick(project?.source, ['kind', 'text', 'font', 'content', 'name']);
  result.parameters = pick(project?.parameters, Object.keys(PARAMETER_RANGES));
  result.bed = pick(project?.bed, ['id', 'name', 'x', 'y', 'z', 'margin', 'synthetic', 'referenceUrl']);
  return result;
}

// Session-only source data. STL, viewport meshes and results never enter this cache.
export function createPrintSessionCache({target = globalThis.window, signature = geometrySignature} = {}) {
  const drafts = new Map(), saves = new Map();
  let listening = false;
  const warn = event => { event.preventDefault(); event.returnValue = ''; };
  const syncWarning = () => {
    const needed = drafts.size > 0 || saves.size > 0;
    if (needed === listening || !target?.addEventListener || !target?.removeEventListener) return;
    if (needed) target.addEventListener('beforeunload', warn);
    else target.removeEventListener('beforeunload', warn);
    listening = needed;
  };
  const sameAsSaved = snapshot => {
    try { return signature(snapshot.project) === snapshot.savedSignature; }
    catch { return false; } // Incomplete fields are unsaved edits too.
  };
  function getPending(owner) {
    const snapshot = drafts.get(ownerKey(owner));
    return snapshot ? copy(snapshot) : undefined;
  }
  function clearPending(owner) { drafts.delete(ownerKey(owner)); syncWarning(); }
  function keepPending(owner, snapshot) {
    const key = ownerKey(owner);
    if (!snapshot?.loaded) return;
    const next = {
      project: sourceProject(snapshot.project),
      savedSignature: typeof snapshot.savedSignature === 'string' ? snapshot.savedSignature : '',
      storageError: typeof snapshot.storageError === 'string' ? snapshot.storageError : '',
      version: snapshot.version,
      loaded: true,
    };
    if (sameAsSaved(next)) drafts.delete(key); else drafts.set(key, next);
    syncWarning();
  }
  function finishPendingSave(owner, expectedVersion, savedProject, savedVersion) {
    const key = ownerKey(owner), pending = drafts.get(key);
    // A completion must never rewrite metadata from a newer owner session.
    if (!pending || pending.version !== expectedVersion) return false;
    if (!Number.isSafeInteger(savedVersion) || savedVersion !== expectedVersion + 1) throw Error('Versão de gravação local inválida.');
    const next = {...pending, version:savedVersion, savedSignature:signature(savedProject), storageError:''};
    if (sameAsSaved(next)) drafts.delete(key); else drafts.set(key, next);
    syncWarning();
    return true;
  }
  function trackOwnerSave(owner, promise) {
    const key = ownerKey(owner), tracked = Promise.resolve(promise);
    const ownerSaves = saves.get(key) || new Set();
    ownerSaves.add(tracked); saves.set(key, ownerSaves); syncWarning();
    const settled = () => {
      ownerSaves.delete(tracked);
      if (!ownerSaves.size && saves.get(key) === ownerSaves) saves.delete(key);
      syncWarning();
    };
    // Handle cleanup on either outcome without changing the caller's rejection.
    tracked.then(settled, settled);
    return tracked;
  }
  async function waitForOwnerSave(owner) {
    const key = ownerKey(owner);
    // A second save can be registered while an earlier one is settling.
    while (saves.get(key)?.size) await Promise.allSettled([...saves.get(key)]);
  }
  return {getPending, keepPending, clearPending, finishPendingSave, trackOwnerSave, waitForOwnerSave};
}

const session = createPrintSessionCache();
export const {getPending, keepPending, clearPending, finishPendingSave, trackOwnerSave, waitForOwnerSave} = session;
