// Backend transacional compartilhado. Mantém os stores e a versão legados do ACM.
const DB_VERSION=2, STORE='owners', DOCUMENTS='documents', DOCUMENT_OWNERS='documentOwners';
export function createIndexedDBBackend({ indexedDB = globalThis.indexedDB, dbName = 'impresilk-fabrication', errorFactory = (code, message) => Object.assign(new Error(message), {code}) } = {}) {
  const fail = (code, message) => { throw errorFactory(code, message); };
  const storageError = error => error?.code ? error : errorFactory(error?.name === 'QuotaExceededError' ? 'QUOTA' : 'UNAVAILABLE', error?.name === 'QuotaExceededError' ? 'Limite do armazenamento local atingido; os arquivos anteriores foram preservados.' : 'Armazenamento local indisponível. Exporte seu projeto.');
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
      request.onblocked = () => { blocked = true; reject(errorFactory('UNAVAILABLE', 'Feche as outras abas da ferramenta para atualizar o armazenamento.')); };
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
