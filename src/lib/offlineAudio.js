// "Save for offline" for self-hosted audio (files in Supabase Storage / uploaded by the admin).
// Stored in the browser Cache API; playback prefers the saved copy, so it works with no network.
//
// NOTE: tracks that stream from YouTube can NOT be saved: YouTube's terms forbid downloading or
// caching their media, so offline mode only applies to audio the catalogue owner hosts.

export const AUDIO_CACHE = 'surdhara-audio-v1';

const listeners = new Set();
let snapshot = { ready: false, supported: false, saved: new Set(), progress: {}, usage: 0, quota: 0, persisted: false };

const emit = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); };
export const subscribeOfflineAudio = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const getOfflineAudioSnapshot = () => snapshot;

export const normalizeAudioUrl = (url) => { try { return new URL(url, window.location.href).href; } catch { return String(url || ''); } };
export const isSavedOffline = (url) => Boolean(url) && snapshot.saved.has(normalizeAudioUrl(url));

const cachesAvailable = () => typeof caches !== 'undefined' && typeof caches.open === 'function';

export async function refreshStorageUsage() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    emit({ usage: estimate?.usage || 0, quota: estimate?.quota || 0 });
  } catch { /* estimate is best effort */ }
}

export async function initOfflineAudio() {
  if (!cachesAvailable()) { emit({ ready: true, supported: false }); return; }
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    const persisted = Boolean(await navigator.storage?.persisted?.());
    emit({ ready: true, supported: true, saved: new Set(keys.map((request) => request.url)), persisted });
    refreshStorageUsage();
  } catch {
    emit({ ready: true, supported: false });
  }
}

export async function saveAudioOffline(url, { signal } = {}) {
  if (!snapshot.supported) throw new Error('Offline saving is not supported in this browser.');
  const key = normalizeAudioUrl(url);
  if (snapshot.saved.has(key)) return;
  emit({ progress: { ...snapshot.progress, [key]: 0.01 } });
  const clearProgress = () => { const { [key]: _removed, ...rest } = snapshot.progress; emit({ progress: rest }); };
  try {
    // Ask the browser not to evict our saved songs under storage pressure (best effort).
    if (!snapshot.persisted && navigator.storage?.persist) navigator.storage.persist().then((granted) => emit({ persisted: Boolean(granted) })).catch(() => {});
    const response = await fetch(key, { mode: 'cors', credentials: 'omit', signal });
    if (!response.ok) throw new Error(`The audio host answered ${response.status}.`);
    const total = Number(response.headers.get('content-length')) || 0;
    const chunks = [];
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) emit({ progress: { ...snapshot.progress, [key]: Math.min(0.99, received / total) } });
      }
    } else {
      chunks.push(new Uint8Array(await response.arrayBuffer()));
    }
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });
    if (!blob.size) throw new Error('The audio file was empty.');
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(key, new Response(blob, { status: 200, headers: { 'Content-Type': blob.type, 'Content-Length': String(blob.size) } }));
    emit({ saved: new Set([...snapshot.saved, key]) });
    clearProgress();
    refreshStorageUsage();
  } catch (error) {
    clearProgress();
    if (error?.name === 'QuotaExceededError') throw new Error('Your device is out of storage space for saved songs.');
    throw error;
  }
}

export async function removeAudioOffline(url) {
  if (!snapshot.supported) return;
  const key = normalizeAudioUrl(url);
  try { await (await caches.open(AUDIO_CACHE)).delete(key); } catch { /* ignore */ }
  const next = new Set(snapshot.saved); next.delete(key);
  emit({ saved: next });
  refreshStorageUsage();
}

export async function clearAllOfflineAudio() {
  if (!cachesAvailable()) return;
  try { await caches.delete(AUDIO_CACHE); } catch { /* ignore */ }
  emit({ saved: new Set() });
  refreshStorageUsage();
}

/** A blob: URL for a saved copy (seekable, no network), or null when the song is not saved. */
export async function resolveSavedAudioUrl(url) {
  if (!snapshot.supported || !isSavedOffline(url)) return null;
  try {
    const match = await (await caches.open(AUDIO_CACHE)).match(normalizeAudioUrl(url));
    if (!match) return null;
    const objectUrl = URL.createObjectURL(await match.blob());
    return { url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    return null;
  }
}
