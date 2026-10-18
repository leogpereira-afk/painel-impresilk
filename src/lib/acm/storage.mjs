/** Local, per-identity recovery. This is not server authentication or cloud backup. */
import { validateProject as validateModel } from './model.mjs';
import { isSafeRasterDataURL } from './visual.mjs';
import { isSafeFixingPhoto } from '../../../supabase/functions/_shared/acm-fixing.mjs';
import { isSafeInstallationPhoto } from '../../../supabase/functions/_shared/acm-installation.mjs';
export const MAX_PROJECT_BYTES = 4 * 1024 * 1024;
export const MAX_REVISIONS = 50;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_DOCUMENTS = 200;
const DB_VERSION = 2;
const STORE = 'owners';
const DOCUMENTS = 'documents';
const DOCUMENT_OWNERS = 'documentOwners';
const FORMAT = 'impresilk-acm-project';
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export class ACMStorageError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'ACMStorageError'; this.code = code;
    Object.assign(this, details);
  }
}
const fail = (code, message, details) => { throw new ACMStorageError(code, message, details); };
const byteLength = text => new TextEncoder().encode(text).byteLength;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const copy = value => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function assertJSON(value, depth = 0, count = { n: 0 }, seen = new Set(), path = 'project') {
  if (++count.n > 30000 || depth > 16) fail('SIZE', 'O projeto excede o limite de complexidade.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) fail('SCHEMA', 'O projeto contém um número inválido.');
    return;
  }
  if (typeof value === 'string') {
    const assetPath = /^project\.visual\.assets\.\d+\.dataUrl$/.test(path);
    const photoPath = /^project\.(?:fixing|overrides\.[^.]+\.fixing)\.(?:screwProduct|tapeProduct)\.photoDataUrl$/.test(path);
    const installationPhotoPath = /^project\.installation\.photos\.\d+\.dataUrl$/.test(path);
    if (value.length > 16000 && !((assetPath && isSafeRasterDataURL(value)) || (photoPath && isSafeFixingPhoto(value)) || (installationPhotoPath && isSafeInstallationPhoto(value)))) fail('SIZE', 'Um texto do projeto excede o limite permitido.');
    return;
  }
  if (!Array.isArray(value) && !plain(value)) fail('SCHEMA', 'O projeto deve conter somente dados JSON.');
  if (seen.has(value)) fail('SCHEMA', 'O projeto contém uma referência circular.');
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 5000) fail('SIZE', 'Uma lista do projeto excede o limite permitido.');
    for (const [index, item] of value.entries()) assertJSON(item, depth + 1, count, seen, `${path}.${index}`);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) fail('SCHEMA', 'O projeto contém uma chave não permitida.');
      assertJSON(item, depth + 1, count, seen, `${path}.${key}`);
    }
  }
  seen.delete(value);
}

function requireObject(value, field) {
  if (!plain(value)) fail('SCHEMA', `Campo inválido ou ausente: ${field}.`);
}
/** Uses the same schema validation as geometry; rejects incompatible backups without replacing data. */
export function validateProject(project) {
  requireObject(project, 'projeto');
  assertJSON(project);
  if (project.schemaVersion !== 1) fail('SCHEMA', 'Versão do projeto não suportada. O arquivo original foi preservado.');
  const errors = validateModel(project);
  if (errors.length) fail('SCHEMA', errors.map(error => error.message).join(' '), { errors });
  if (!Number.isSafeInteger(project.revision) || project.revision > 1000000) fail('SCHEMA', 'Revisão inválida.');
  const text = JSON.stringify(project);
  if (byteLength(text) > MAX_PROJECT_BYTES) fail('SIZE', 'O projeto excede 4 MiB, incluindo imagens incorporadas.');
  return JSON.parse(text);
}

export function serializeProjectJSON(project) {
  return JSON.stringify({ format: FORMAT, formatVersion: 1, project: validateProject(project) }, null, 2);
}

export function parseProjectJSON(text) {
  if (typeof text !== 'string') fail('SCHEMA', 'Envie o conteúdo de um arquivo JSON.');
  if (byteLength(text) > MAX_PROJECT_BYTES * 2) fail('SIZE', 'O arquivo excede 8 MiB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('CORRUPT', 'Não foi possível ler o JSON. O projeto atual foi preservado.'); }
  if (plain(parsed) && own(parsed, 'format')) {
    if (parsed.format !== FORMAT || parsed.formatVersion !== 1) fail('SCHEMA', 'Formato de backup não suportado.');
    return validateProject(parsed.project);
  }
  return validateProject(parsed);
}

function ownerKey(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.length > 200 || /[\u0000-\u001f]/.test(ownerId)) fail('OWNER', 'Identidade ausente ou inválida para salvar o projeto.');
  return ownerId; // Never trim, lowercase, or fall back to another user's key.
}
function validateEnvelope(envelope, owner) {
  if (envelope === undefined) return { schemaVersion: 1, owner, draft: null, revisions: [] };
  if (!plain(envelope)) fail('CORRUPT', 'Armazenamento local inconsistente. Nenhum dado foi substituído.');
  if (envelope.schemaVersion !== 1) fail('SCHEMA', 'Versão do armazenamento não suportada. Nenhum dado foi substituído.');
  if (envelope.owner !== owner || !Array.isArray(envelope.revisions) || envelope.revisions.length > MAX_REVISIONS) fail('CORRUPT', 'Histórico local inconsistente. Exporte os dados antes de recuperar.');
  if (envelope.draft) {
    if (!Number.isSafeInteger(envelope.draft.version) || envelope.draft.version < 1 || typeof envelope.draft.updatedAt !== 'string') fail('CORRUPT', 'Rascunho local inconsistente. Nenhum dado foi substituído.');
    validateProject(envelope.draft.project);
  }
  const ids = new Set();
  const revs = new Set();
  for (const revision of envelope.revisions) {
    if (!revision || typeof revision.id !== 'string' || typeof revision.createdAt !== 'string' || ids.has(revision.id)) fail('CORRUPT', 'Revisão local inconsistente. Nenhum dado foi substituído.');
    const project = validateProject(revision.project);
    const key = `${project.id}:${project.revision}`;
    if (revs.has(key)) fail('CORRUPT', 'O histórico contém revisões duplicadas.');
    ids.add(revision.id); revs.add(key);
  }
  return envelope;
}
function storageError(error) {
  if (error instanceof ACMStorageError) return error;
  if (error?.name === 'QuotaExceededError') return new ACMStorageError('QUOTA', 'O armazenamento está cheio. Exporte um backup antes de liberar espaço.');
  if (error?.name === 'VersionError') return new ACMStorageError('SCHEMA', 'O armazenamento foi criado por uma versão mais recente. Nenhum dado foi alterado.');
  return new ACMStorageError('UNAVAILABLE', 'Não foi possível acessar o armazenamento local. Exporte um backup JSON.', { cause: error });
}

/** update is synchronous inside one read/write IDB transaction; get+put is atomic across tabs. */
export function createIndexedDBBackend({ indexedDB = globalThis.indexedDB, dbName = 'impresilk-acm-studio' } = {}) {
  let connection;
  async function open() {
    if (!indexedDB) fail('UNAVAILABLE', 'Este navegador não disponibilizou armazenamento local. Use o backup JSON.');
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        // Version 2 only adds stores. Version-1 drafts and revisions remain byte-for-byte intact.
        if (!db.objectStoreNames.contains(DOCUMENTS)) db.createObjectStore(DOCUMENTS);
        if (!db.objectStoreNames.contains(DOCUMENT_OWNERS)) db.createObjectStore(DOCUMENT_OWNERS);
      };
      request.onerror = () => reject(storageError(request.error));
      request.onblocked = () => { blocked = true; reject(new ACMStorageError('UNAVAILABLE', 'Feche as outras abas do ACM Studio para atualizar o armazenamento.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    }).catch(error => { connection = undefined; throw error; });
    return connection;
  }
  return {
    async transact(owner, mode, update) {
      const db = await open();
      return new Promise((resolve, reject) => {
        let transaction, result, failure;
        try { transaction = db.transaction(STORE, mode); } catch (error) { reject(storageError(error)); return; }
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(storageError(failure || transaction.error));
        transaction.onerror = () => { /* onabort owns the rejection, preserving validation errors. */ };
        const store = transaction.objectStore(STORE);
        const request = store.get(owner);
        request.onsuccess = () => {
          try {
            const next = update(request.result);
            result = next.result;
            if (mode === 'readwrite') store.put(next.envelope, owner);
          } catch (error) { failure = error; transaction.abort(); }
        };
      });
    },
    async transactDocuments(owner, mode, update, documentId) {
      const db = await open();
      return new Promise((resolve, reject) => {
        let transaction, result, failure;
        try { transaction = db.transaction([DOCUMENT_OWNERS, DOCUMENTS], mode); } catch (error) { reject(storageError(error)); return; }
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(storageError(failure || transaction.error));
        transaction.onerror = () => {};
        const index = transaction.objectStore(DOCUMENT_OWNERS), documents = transaction.objectStore(DOCUMENTS);
        const request = index.get(owner);
        request.onsuccess = () => {
          const apply = document => {
            try {
              const next = update(request.result, document);
              result = next.result;
              if (mode === 'readwrite') {
                if (next.document) documents.add(next.document, [owner, next.document.id]);
                if (next.manifest) index.put(next.manifest, owner);
              }
            } catch (error) { failure = error; transaction.abort(); }
          };
          if (documentId) {
            const content = documents.get([owner, documentId]);
            content.onsuccess = () => apply(content.result);
          } else apply(undefined);
        };
      });
    },
  };
}

function documentProjectId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f]/.test(value)) fail('SCHEMA', 'Identificador de projeto inválido para o documento.');
  return value;
}
function documentFields(value) {
  if (!plain(value)) fail('SCHEMA', 'Documento inválido.');
  documentProjectId(value.projectId);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 1000000) fail('SCHEMA', 'Revisão do documento inválida.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 180 || /[\u0000-\u001f/\\]/.test(value.name)) fail('SCHEMA', 'Nome do documento inválido.');
  if (typeof value.mime !== 'string' || !/^(?:text\/(?:html|csv)|image\/svg\+xml|application\/(?:dxf|json)|image\/png)(?:;\s*charset=utf-8)?$/i.test(value.mime)) fail('SCHEMA', 'Formato de documento não suportado.');
}
async function sha256(text) {
  if (!globalThis.crypto?.subtle) fail('UNAVAILABLE', 'Não foi possível verificar a integridade do documento neste navegador.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function documentMetadata(record) {
  const { id, projectId, revision, name, mime, bytes, sha256: hash, createdAt } = record;
  return { id, projectId, revision, name, mime, bytes, sha256: hash, createdAt };
}
function validateDocumentManifest(raw, owner) {
  if (raw === undefined) return { schemaVersion: 1, owner, bytes: 0, documents: [] };
  if (!plain(raw) || raw.owner !== owner) fail('CORRUPT', 'Índice local de documentos inconsistente. Nenhum arquivo foi substituído.');
  if (raw.schemaVersion !== 1) fail('SCHEMA', 'Versão do arquivo local de documentos não suportada.');
  if (!Array.isArray(raw.documents) || raw.documents.length > MAX_DOCUMENTS || !Number.isSafeInteger(raw.bytes) || raw.bytes < 0 || raw.bytes > MAX_DOCUMENT_TOTAL_BYTES) fail('CORRUPT', 'Índice local de documentos inconsistente.');
  const ids = new Set(), slots = new Set(); let total = 0;
  for (const metadata of raw.documents) {
    documentFields(metadata);
    if (!/^doc-[0-9a-f]{64}$/.test(metadata.id) || !/^[0-9a-f]{64}$/.test(metadata.sha256) || !Number.isSafeInteger(metadata.bytes) || metadata.bytes < 1 || metadata.bytes > MAX_DOCUMENT_BYTES || typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt))) fail('CORRUPT', 'Metadados do documento estão inconsistentes.');
    const slot = JSON.stringify([metadata.projectId, metadata.revision, metadata.name]);
    if (ids.has(metadata.id) || slots.has(slot)) fail('CORRUPT', 'O arquivo local contém documentos duplicados.');
    ids.add(metadata.id); slots.add(slot); total += metadata.bytes;
  }
  if (total !== raw.bytes) fail('CORRUPT', 'O tamanho do arquivo local de documentos está inconsistente.');
  return raw;
}
function validateStoredDocument(record, metadata, owner) {
  if (!plain(record) || record.schemaVersion !== 1 || record.owner !== owner || typeof record.content !== 'string' || JSON.stringify(documentMetadata(record)) !== JSON.stringify(documentMetadata(metadata)) || byteLength(record.content) !== metadata.bytes) fail('CORRUPT', 'O documento local está inconsistente. Nenhum conteúdo foi substituído.');
  return record;
}

/** Injectable transactional backend keeps storage semantics testable without a DOM. */
export function createProjectStorage({ backend = createIndexedDBBackend(), now = () => new Date().toISOString(), uuid = () => globalThis.crypto.randomUUID() } = {}) {
  async function transact(ownerId, mode, change) {
    const owner = ownerKey(ownerId);
    try {
      return await backend.transact(owner, mode, raw => {
        const envelope = validateEnvelope(raw, owner);
        return change(envelope);
      });
    } catch (error) { throw storageError(error); }
  }
  async function documentTransaction(ownerId, mode, change, documentId) {
    const owner = ownerKey(ownerId);
    try {
      if (!backend.transactDocuments) fail('UNAVAILABLE', 'Arquivo local de documentos indisponível.');
      return await backend.transactDocuments(owner, mode, (raw, document) => change(validateDocumentManifest(raw, owner), document, owner), documentId);
    } catch (error) { throw storageError(error); }
  }
  return {
    async saveDocument(ownerId, value) {
      ownerKey(ownerId); documentFields(value);
      if (typeof value.content !== 'string' || !value.content.length) fail('SCHEMA', 'O conteúdo do documento está vazio ou inválido.');
      const bytes = byteLength(value.content);
      if (bytes > MAX_DOCUMENT_BYTES) fail('SIZE', 'O documento excede 20 MiB.');
      if (/^image\/png(?:;|$)/i.test(value.mime) && (!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value.content) || value.content.slice(22).length % 4 !== 0 || value.content.length < 66)) fail('SCHEMA', 'A imagem deve ser um PNG em data URL base64 válido.');
      value = { projectId: value.projectId, revision: value.revision, name: value.name, mime: value.mime, content: value.content }; // Freeze the caller's values before asynchronous hashing.
      const hash = await sha256(value.content);
      const metadata = { id: `doc-${await sha256(JSON.stringify([value.projectId, value.revision, value.name, value.mime, hash]))}`, projectId: value.projectId, revision: value.revision, name: value.name, mime: value.mime, bytes, sha256: hash, createdAt: now() };
      return documentTransaction(ownerId, 'readwrite', (manifest, stored, owner) => {
        const existing = manifest.documents.find(document => document.projectId === metadata.projectId && document.revision === metadata.revision && document.name === metadata.name);
        if (existing) {
          if (existing.id !== metadata.id || existing.sha256 !== metadata.sha256 || existing.mime !== metadata.mime || existing.bytes !== bytes) fail('CONFLICT', 'Este nome já foi arquivado com outro conteúdo nesta revisão. Use outro nome ou uma nova revisão.');
          const original = validateStoredDocument(stored, existing, owner);
          if (original.content !== value.content) fail('CORRUPT', 'O conteúdo arquivado não corresponde à sua assinatura. Nenhum arquivo foi substituído.');
          return { result: copy(existing) };
        }
        if (stored !== undefined) fail('CORRUPT', 'Documento sem índice correspondente. Nenhum arquivo foi substituído.');
        if (manifest.documents.length >= MAX_DOCUMENTS || manifest.bytes + bytes > MAX_DOCUMENT_TOTAL_BYTES) fail('QUOTA', 'O arquivo local atingiu 200 documentos ou 100 MiB. Nenhum documento anterior foi removido.');
        const document = { schemaVersion: 1, owner, ...metadata, content: value.content };
        manifest.documents.push(metadata); manifest.bytes += bytes;
        return { manifest, document, result: copy(metadata) };
      }, metadata.id);
    },
    listDocuments(ownerId, projectId) {
      if (projectId !== undefined) documentProjectId(projectId);
      return documentTransaction(ownerId, 'readonly', manifest => ({ result: copy(manifest.documents.filter(document => projectId === undefined || document.projectId === projectId).slice().reverse()) }));
    },
    async getDocument(ownerId, id) {
      if (typeof id !== 'string' || !/^doc-[0-9a-f]{64}$/.test(id)) fail('SCHEMA', 'Identificador de documento inválido.');
      const result = await documentTransaction(ownerId, 'readonly', (manifest, stored, owner) => {
        const metadata = manifest.documents.find(document => document.id === id);
        if (!metadata) fail('NOT_FOUND', 'Documento não encontrado para esta identidade.');
        const record = validateStoredDocument(stored, metadata, owner);
        return { result: { ...copy(metadata), content: record.content } };
      }, id);
      if (await sha256(result.content) !== result.sha256) fail('CORRUPT', 'A assinatura do documento local não confere. O arquivo original foi preservado.');
      return result;
    },
    loadDraft(ownerId) {
      return transact(ownerId, 'readonly', envelope => ({ result: envelope.draft ? copy(envelope.draft) : null }));
    },
    saveDraft(ownerId, project, expectedVersion) {
      const safe = validateProject(project);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) fail('CONFLICT', 'Informe a versão que foi carregada antes de salvar.');
      return transact(ownerId, 'readwrite', envelope => {
        const currentVersion = envelope.draft?.version || 0;
        if (currentVersion !== expectedVersion) fail('CONFLICT', 'Outra aba alterou este rascunho. Recarregue ou exporte sua cópia antes de continuar.', { currentVersion });
        envelope.draft = { project: safe, version: currentVersion + 1, updatedAt: now() };
        return { envelope, result: copy(envelope.draft) };
      });
    },
    listRevisions(ownerId) {
      return transact(ownerId, 'readonly', envelope => ({ result: envelope.revisions.map(rev => ({ id: rev.id, projectId: rev.project.id, name: rev.project.name, revision: rev.project.revision, createdAt: rev.createdAt })).reverse() }));
    },
    saveRevision(ownerId, project) {
      const safe = validateProject(project);
      return transact(ownerId, 'readwrite', envelope => {
        const existing = envelope.revisions.find(rev => rev.project.id === safe.id && rev.project.revision === safe.revision);
        if (existing) {
          if (JSON.stringify(existing.project) !== JSON.stringify(safe)) fail('CONFLICT', 'Esta revisão já foi salva com outro conteúdo. Crie uma nova revisão.');
          return { envelope, result: { ...copy(existing), revision: safe.revision } };
        }
        if (envelope.revisions.length >= MAX_REVISIONS) fail('QUOTA', 'O limite de 50 revisões locais foi atingido. Exporte o histórico antes de criar outras.');
        const saved = { id: uuid(), project: safe, createdAt: now() };
        envelope.revisions.push(saved);
        return { envelope, result: { ...copy(saved), revision: safe.revision } };
      });
    },
    restoreRevision(ownerId, id) {
      if (typeof id !== 'string' || !id || id.length > 200) fail('SCHEMA', 'Identificador de revisão inválido.');
      return transact(ownerId, 'readonly', envelope => {
        const saved = envelope.revisions.find(revision => revision.id === id);
        if (!saved) fail('NOT_FOUND', 'Revisão não encontrada para esta identidade.');
        return { result: copy(saved.project) }; // Caller confirms and saves a new draft with its current CAS version.
      });
    },
  };
}

let defaultStorage;
const local = () => defaultStorage ||= createProjectStorage();
export const loadDraft = ownerId => local().loadDraft(ownerId);
export const saveDraft = (ownerId, project, expectedVersion) => local().saveDraft(ownerId, project, expectedVersion);
export const listRevisions = ownerId => local().listRevisions(ownerId);
export const saveRevision = (ownerId, project) => local().saveRevision(ownerId, project);
export const restoreRevision = (ownerId, id) => local().restoreRevision(ownerId, id);
export const saveDocument = (ownerId, document) => local().saveDocument(ownerId, document);
export const listDocuments = (ownerId, projectId) => local().listDocuments(ownerId, projectId);
export const getDocument = (ownerId, id) => local().getDocument(ownerId, id);
