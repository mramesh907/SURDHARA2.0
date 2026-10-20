const DB_NAME = 'SURDHARA-local-audio-v1';
const STORE_NAME = 'audio-files';
const DB_VERSION = 1;

let databasePromise;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Browser storage is not available.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local audio storage.'));
    request.onblocked = () => reject(new Error('Local audio storage is blocked by another open tab.'));
  });
  databasePromise.catch(() => { databasePromise = null; });
  return databasePromise;
}

/** Save selected audio blobs to this browser's IndexedDB. The app stores searchable metadata separately. */
export async function saveLocalAudioFiles(entries = []) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    entries.forEach(({ id, file }) => {
      if (id && file) store.put({ id, blob: file, name: file.name || '', type: file.type || 'audio/*', size: file.size || 0 });
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save audio files.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving audio files was cancelled.'));
  });
}

function readAudioBlob(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = () => reject(request.error || new Error('Could not read a local audio file.'));
  });
}

/** Restore local track object URLs from IndexedDB after a page refresh. */
export async function restoreLocalAudioTracks(savedTracks = []) {
  if (!savedTracks.length) return [];
  let db;
  try {
    db = await openDatabase();
  } catch {
    return savedTracks.map((track) => ({ ...track, audioUrl: '', localAudioUnavailable: true }));
  }
  return Promise.all(savedTracks.map(async (track) => {
    try {
      const blob = await readAudioBlob(db, track.localAudioId || track.id);
      return blob
        ? { ...track, audioUrl: URL.createObjectURL(blob), localAudioUnavailable: false }
        : { ...track, audioUrl: '', localAudioUnavailable: true };
    } catch {
      return { ...track, audioUrl: '', localAudioUnavailable: true };
    }
  }));
}

/** Read a browser-only audio Blob so an administrator can explicitly migrate old imports to cloud storage. */
export async function getStoredLocalAudioFile(track = {}) {
  const db = await openDatabase();
  const blob = await readAudioBlob(db, track.localAudioId || track.id);
  if (!blob) return null;
  const name = track.localFileName || 'surdhara-local-audio';
  const candidateType = track.localFileType || blob.type || '';
  const type = candidateType && !candidateType.includes('*') ? candidateType : 'application/octet-stream';
  if (typeof File !== 'undefined') return new File([blob], name, { type, lastModified: Date.now() });
  const namedBlob = blob.slice(0, blob.size, type);
  Object.defineProperty(namedBlob, 'name', { value: name, configurable: true });
  return namedBlob;
}
