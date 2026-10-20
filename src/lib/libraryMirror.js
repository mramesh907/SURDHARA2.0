// Local mirror of the signed-in user's personal library (likes, recents, playlists).
//  - Lets the library open instantly and fully offline.
//  - `dirty: true` means "changes not yet confirmed saved to the cloud" — they survive a closed tab,
//    a dead connection, or a crash, and are pushed on the next successful sync.
const PREFIX = 'SURDHARA-library-mirror-v1:';
const getStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function normalizeLibrary(input) {
  const state = input && typeof input === 'object' ? input : {};
  return {
    favorites: Array.isArray(state.favorites) ? state.favorites : [],
    recent: Array.isArray(state.recent) ? state.recent : [],
    customPlaylists: Array.isArray(state.customPlaylists) ? state.customPlaylists : [],
    playlistOverrides: state.playlistOverrides && typeof state.playlistOverrides === 'object' ? state.playlistOverrides : {},
    playlistRemovals: state.playlistRemovals && typeof state.playlistRemovals === 'object' ? state.playlistRemovals : {},
  };
}

/** Stable (fixed key order) JSON, used to detect "nothing changed since the last successful save". */
export const serializeLibrary = (state) => JSON.stringify(normalizeLibrary(state));

export function readLibraryMirror(userId, storage = getStorage()) {
  if (!userId || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(PREFIX + userId) || 'null');
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    return { state: normalizeLibrary(parsed.state), dirty: Boolean(parsed.dirty), at: Number(parsed.at) || 0 };
  } catch { return null; }
}

export function writeLibraryMirror(userId, state, dirty, storage = getStorage()) {
  if (!userId || !storage) return false;
  try { storage.setItem(PREFIX + userId, JSON.stringify({ state: normalizeLibrary(state), dirty: Boolean(dirty), at: Date.now() })); return true; }
  catch { return false; } // quota: the cloud copy is still authoritative
}

/** On sign-out: drop the mirror unless it holds unsynced edits (never lose the user's changes). */
export function clearLibraryMirrorIfClean(userId, storage = getStorage()) {
  const mirror = readLibraryMirror(userId, storage);
  if (mirror && !mirror.dirty) { try { storage.removeItem(PREFIX + userId); } catch { /* ignore */ } }
}
