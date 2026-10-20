import { supabase, supabaseProjectKey } from './supabaseClient.js';
import { artistRowToUi, catalogueApi, playlistRowToUi, rowToTrack } from './cloudMusic.js';
import {
  applySongRows, bySongOrder, computeCursor, deserializeState, diffIds, emptyState, playlistTrackIds,
  removeSongs, replaceLinks, replaceRows, serializeState,
} from './catalogueMerge.js';
import { idbGet, idbSet } from './idb.js';
import { backoffDelay, isNetworkError } from './network.js';

const MIN_FOCUS_SYNC_MS = 60_000;        // tab focus / visibility never re-syncs more often than this
const BACKGROUND_SYNC_MS = 5 * 60_000;   // safety net while the tab stays open and visible
const FIRST_PAINT_ROWS = 1000;           // first page is shown immediately on a cold start; the rest streams in

/**
 * Cache-first, delta-synced view of the shared catalogue.
 *
 *  1. Paint instantly from IndexedDB (works offline, no spinner on repeat visits).
 *  2. Ask the server only for rows changed since the saved cursor.
 *  3. Verify the total with one cheap HEAD request; only if it differs download the id list.
 *  4. Apply realtime row events in place instead of re-downloading everything.
 *
 * onCatalogue(catalogue, meta)   catalogue = { tracks, playlists, artists }
 * onStatus({ status, syncedAt, error, fromCache, offline, progress })
 *   status: 'loading' (nothing to show yet) | 'partial' (first page shown, rest streaming) |
 *           'ready' | 'stale' (showing cached data; last sync failed / offline) | 'error' (nothing to show)
 */
export function createCatalogueSync({ onCatalogue, onStatus }) {
  const cacheKey = `catalogue:${supabaseProjectKey}`;
  let state = emptyState();
  const trackCache = new Map(); // song id -> { row, track }  (re-map only rows that changed)
  let disposed = false;
  let syncing = false;
  let queuedReason = null;
  let lastAttemptAt = 0;
  let failures = 0;
  let retryTimer = null;
  let emitTimer = null;
  let persistTimer = null;
  let relationsTimer = null;
  let channel = null;
  let backgroundTimer = null;

  const hasData = () => state.songs.size > 0 || state.syncedAt > 0;
  const status = (next, extra = {}) => { if (!disposed) onStatus?.({ status: next, syncedAt: state.syncedAt, count: state.songs.size, ...extra }); };

  function buildCatalogue() {
    const rows = [...state.songs.values()].sort(bySongOrder);
    const tracks = rows.map((row) => {
      const hit = trackCache.get(row.id);
      if (hit && hit.row === row) return hit.track;
      const track = rowToTrack(row);
      trackCache.set(row.id, { row, track });
      return track;
    });
    if (trackCache.size > rows.length + 50) {
      for (const id of trackCache.keys()) if (!state.songs.has(id)) trackCache.delete(id);
    }
    const uiTrackIdBySongId = new Map(tracks.map((track) => [track.cloudSongId, track.id]));
    const idsByPlaylist = playlistTrackIds(state, uiTrackIdBySongId);
    const playlists = [...state.playlists.values()]
      .sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0))
      .map((row) => playlistRowToUi(row, new Map([[row.id, idsByPlaylist.get(row.id) || []]])));
    const artists = [...state.artists.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(artistRowToUi);
    return { tracks, playlists, artists };
  }

  function emitNow(meta = {}) {
    if (disposed) return;
    window.clearTimeout(emitTimer); emitTimer = null;
    onCatalogue?.(buildCatalogue(), meta);
  }
  const scheduleEmit = () => { if (!emitTimer) emitTimer = window.setTimeout(() => { emitTimer = null; emitNow(); }, 150); };

  function persist() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => { idbSet(cacheKey, serializeState(state)); }, 800);
  }

  async function loadFromCache() {
    const cached = deserializeState(await idbGet(cacheKey));
    if (!cached || disposed) return false;
    state = cached;
    emitNow({ fromCache: true });
    return true;
  }

  async function refreshRelations() {
    const relations = await catalogueApi.fetchRelations();
    replaceRows(state, 'playlists', relations.playlists);
    replaceRows(state, 'artists', relations.artists);
    replaceLinks(state, relations.links);
  }

  async function reconcileIfNeeded() {
    const serverCount = await catalogueApi.fetchPublishedSongCount();
    if (serverCount === null || serverCount === state.songs.size) return;
    const { removed, missing } = diffIds(state, await catalogueApi.fetchPublishedSongIds());
    removeSongs(state, removed);
    if (missing.length) applySongRows(state, await catalogueApi.fetchSongsByIds(missing));
  }

  async function sync(reason = 'manual') {
    if (disposed) return;
    if (syncing) { queuedReason = reason; return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      status(hasData() ? 'stale' : 'error', { offline: true, fromCache: hasData(), error: 'You are offline.' });
      return;
    }
    syncing = true;
    lastAttemptAt = Date.now();
    window.clearTimeout(retryTimer); retryTimer = null;
    const coldStart = !state.cursor;
    if (!hasData()) status('loading');
    try {
      const rows = await catalogueApi.fetchSongs({
        since: state.cursor,
        onPage: async (page, loaded, total) => {
          if (coldStart) {
            applySongRows(state, page);
            // Cold start: show the first page right away while the remaining pages keep streaming in.
            if (loaded <= FIRST_PAINT_ROWS) emitNow({ partial: true });
            status('partial', { progress: total ? Math.min(1, loaded / total) : null, total });
          }
        },
      });
      if (!coldStart) applySongRows(state, rows);
      state.cursor = computeCursor(rows, state.cursor);
      await refreshRelations();
      if (!coldStart) await reconcileIfNeeded();
      state.syncedAt = Date.now();
      failures = 0;
      emitNow({ fromCache: false });
      persist();
      status('ready', { fromCache: false });
    } catch (error) {
      failures += 1;
      const offline = isNetworkError(error);
      const message = error instanceof Error ? error.message : 'The cloud music catalogue could not be loaded.';
      status(hasData() ? 'stale' : 'error', { error: message, offline, fromCache: hasData() });
      // Keep trying quietly with backoff (1s, 2s, 4s ... max 60s) until it works.
      if (!disposed) retryTimer = window.setTimeout(() => sync('retry'), backoffDelay(failures - 1, { baseMs: 1500, maxMs: 60_000 }));
    } finally {
      syncing = false;
      if (queuedReason && !disposed) { const next = queuedReason; queuedReason = null; sync(next); }
    }
  }

  function applyRealtimeSong(payload) {
    if (payload.eventType === 'DELETE') {
      if (removeSongs(state, [payload.old?.id])) { scheduleEmit(); persist(); }
      return;
    }
    const row = payload.new;
    if (!row?.id || row.title === undefined) { sync('realtime-incomplete'); return; } // oversized payloads arrive truncated
    applySongRows(state, [row]);
    scheduleEmit();
    persist();
  }

  function scheduleRelationsRefresh() {
    window.clearTimeout(relationsTimer);
    relationsTimer = window.setTimeout(async () => {
      try { await refreshRelations(); scheduleEmit(); persist(); } catch { /* the next full sync repairs this */ }
    }, 800);
  }

  const onFocusLike = () => {
    if (document.visibilityState === 'hidden') return;
    if (Date.now() - lastAttemptAt >= MIN_FOCUS_SYNC_MS) sync('focus');
  };
  const onOnline = () => { failures = 0; sync('online'); };
  const onOffline = () => { if (hasData()) status('stale', { offline: true, fromCache: true, error: 'You are offline.' }); };

  return {
    async start() {
      const cached = await loadFromCache();
      if (cached) status('stale', { fromCache: true, refreshing: true });
      sync('start');
      if (supabase) {
        channel = supabase.channel('surdhara-public-catalogue')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, applyRealtimeSong)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_playlists' }, scheduleRelationsRefresh)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_playlist_tracks' }, scheduleRelationsRefresh)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'artists' }, scheduleRelationsRefresh)
          .subscribe();
      }
      window.addEventListener('focus', onFocusLike);
      document.addEventListener('visibilitychange', onFocusLike);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      backgroundTimer = window.setInterval(onFocusLike, BACKGROUND_SYNC_MS);
    },
    refresh({ force = true } = {}) { if (force) failures = 0; return sync(force ? 'manual' : 'soft'); },
    stop() {
      disposed = true;
      [retryTimer, emitTimer, persistTimer, relationsTimer].forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(backgroundTimer);
      window.removeEventListener('focus', onFocusLike);
      document.removeEventListener('visibilitychange', onFocusLike);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (channel && supabase) supabase.removeChannel(channel);
    },
  };
}
