// Pure delta-sync state helpers for the shared catalogue. No network, no React, no Supabase.
//
// The catalogue is cached as raw database rows keyed by id. A sync only downloads rows whose
// updated_at is newer than the saved cursor, so opening the app costs a few KB instead of the
// whole catalogue. Rows that left the public view (deleted/archived) are found by a cheap
// count check followed by an id-only reconcile.

export const CACHE_VERSION = 1;
export const SYNC_OVERLAP_MS = 60_000; // re-read a 1-minute window: covers clock skew + rows updated mid-pagination

export function emptyState() {
  return { songs: new Map(), playlists: new Map(), artists: new Map(), links: new Map(), cursor: '', syncedAt: 0 };
}

const isPublished = (row) => !row?.status || row.status === 'published';

/** Insert/update song rows; rows that are no longer published are dropped. Returns how many changed. */
export function applySongRows(state, rows = []) {
  let changed = 0;
  for (const row of rows) {
    if (!row?.id) continue;
    if (!isPublished(row)) {
      if (state.songs.delete(row.id)) changed += 1;
      continue;
    }
    state.songs.set(row.id, row);
    changed += 1;
  }
  return changed;
}

export function removeSongs(state, ids = []) {
  let removed = 0;
  for (const id of ids) if (id && state.songs.delete(id)) removed += 1;
  return removed;
}

/** New cursor = newest updated_at seen, minus the overlap window. Never moves backwards. */
export function computeCursor(rows = [], previousCursor = '', overlapMs = SYNC_OVERLAP_MS) {
  let newest = 0;
  for (const row of rows) {
    const time = Date.parse(row?.updated_at || '');
    if (Number.isFinite(time) && time > newest) newest = time;
  }
  if (!newest) return previousCursor;
  const next = new Date(newest - overlapMs).toISOString();
  const previous = Date.parse(previousCursor || '');
  return Number.isFinite(previous) && previous > Date.parse(next) ? previousCursor : next;
}

export function replaceRows(state, key, rows = []) {
  const map = new Map();
  for (const row of rows) if (row?.id && isPublished(row)) map.set(row.id, row);
  state[key] = map;
}

export const linkKey = (link) => `${link.playlist_id}:${link.song_id}`;

export function replaceLinks(state, links = []) {
  const map = new Map();
  for (const link of links) if (link?.playlist_id && link?.song_id) map.set(linkKey(link), link);
  state.links = map;
}

/** Compare local song ids with the server's published ids. */
export function diffIds(state, serverIds) {
  const server = serverIds instanceof Set ? serverIds : new Set(serverIds);
  const removed = [];
  for (const id of state.songs.keys()) if (!server.has(id)) removed.push(id);
  const missing = [];
  for (const id of server) if (!state.songs.has(id)) missing.push(id);
  return { removed, missing };
}

export const bySongOrder = (a, b) => {
  const aTime = Date.parse(a.published_at || a.created_at || '') || 0;
  const bTime = Date.parse(b.published_at || b.created_at || '') || 0;
  if (aTime !== bTime) return bTime - aTime;
  return String(a.id).localeCompare(String(b.id));
};

/** Groups playlist links by playlist id, ordered by position, restricted to known songs. */
export function playlistTrackIds(state, uiTrackIdBySongId) {
  const grouped = new Map();
  for (const link of state.links.values()) {
    const uiId = uiTrackIdBySongId.get(link.song_id);
    if (!uiId || !state.playlists.has(link.playlist_id)) continue;
    const list = grouped.get(link.playlist_id) || [];
    list.push({ position: Number(link.position) || 0, id: uiId });
    grouped.set(link.playlist_id, list);
  }
  const result = new Map();
  for (const [playlistId, list] of grouped) result.set(playlistId, list.sort((a, b) => a.position - b.position).map((item) => item.id));
  return result;
}

export function serializeState(state) {
  return {
    v: CACHE_VERSION,
    songs: [...state.songs.values()],
    playlists: [...state.playlists.values()],
    artists: [...state.artists.values()],
    links: [...state.links.values()],
    cursor: state.cursor,
    syncedAt: state.syncedAt,
  };
}

export function deserializeState(blob) {
  if (!blob || blob.v !== CACHE_VERSION || !Array.isArray(blob.songs)) return null;
  const state = emptyState();
  applySongRows(state, blob.songs);
  replaceRows(state, 'playlists', blob.playlists || []);
  replaceRows(state, 'artists', blob.artists || []);
  replaceLinks(state, blob.links || []);
  state.cursor = typeof blob.cursor === 'string' ? blob.cursor : '';
  state.syncedAt = Number(blob.syncedAt) || 0;
  return state;
}
