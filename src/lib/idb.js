// Tiny promise-based IndexedDB key/value store. Every operation fails soft (private mode,
// quota, blocked upgrade) so caching can never break the app.
const DB_NAME = 'surdhara-cache';
const STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run(mode, action) {
  return openDb().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => resolve(undefined);
        transaction.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
}

export const idbGet = (key) => run('readonly', (store) => store.get(key));
export const idbSet = (key, value) => run('readwrite', (store) => store.put(value, key)).then(() => true);
export const idbDelete = (key) => run('readwrite', (store) => store.delete(key)).then(() => true);
