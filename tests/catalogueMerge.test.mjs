import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySongRows, bySongOrder, computeCursor, deserializeState, diffIds, emptyState,
  playlistTrackIds, removeSongs, replaceLinks, replaceRows, serializeState, SYNC_OVERLAP_MS,
} from '../src/lib/catalogueMerge.js';

const song = (id, extra = {}) => ({ id, title: `Song ${id}`, status: 'published', updated_at: '2026-10-19T10:00:00.000Z', published_at: '2026-10-01T00:00:00Z', ...extra });

test('applySongRows upserts, and drops rows that are no longer published', () => {
  const s = emptyState();
  assert.equal(applySongRows(s, [song('a'), song('b')]), 2);
  applySongRows(s, [song('a', { title: 'Renamed' })]);
  assert.equal(s.songs.get('a').title, 'Renamed');
  applySongRows(s, [song('b', { status: 'archived' })]);
  assert.equal(s.songs.has('b'), false);
  assert.equal(s.songs.size, 1);
});

test('computeCursor keeps an overlap window and never moves backwards', () => {
  const rows = [song('a', { updated_at: '2026-10-19T10:00:00.000Z' }), song('b', { updated_at: '2026-10-19T10:05:00.000Z' })];
  const cursor = computeCursor(rows, '');
  assert.equal(Date.parse(cursor), Date.parse('2026-10-19T10:05:00.000Z') - SYNC_OVERLAP_MS);
  const older = computeCursor([song('c', { updated_at: '2026-10-19T09:00:00.000Z' })], cursor);
  assert.equal(older, cursor);
  assert.equal(computeCursor([], 'keep-me'), 'keep-me');
});

test('mid-pagination update is not missed thanks to the overlap window', () => {
  // Row X updated at 10:00:20 after page 1 was read; a later page saw row Y updated at 10:00:50.
  const seen = [song('y', { updated_at: '2026-10-19T10:00:50.000Z' })];
  const cursor = computeCursor(seen, '');
  const x = Date.parse('2026-10-19T10:00:20.000Z');
  assert.ok(x >= Date.parse(cursor), 'row X must be re-read by the next delta (updated_at >= cursor)');
});

test('diffIds finds removed and missing ids', () => {
  const s = emptyState(); applySongRows(s, [song('a'), song('b'), song('c')]);
  assert.deepEqual(diffIds(s, ['a', 'c', 'd']), { removed: ['b'], missing: ['d'] });
  assert.equal(removeSongs(s, ['b', 'zzz']), 1);
});

test('playlistTrackIds orders by position and ignores unknown songs / playlists', () => {
  const s = emptyState();
  replaceRows(s, 'playlists', [{ id: 'p1', status: 'published' }]);
  replaceLinks(s, [
    { playlist_id: 'p1', song_id: 'b', position: 2 }, { playlist_id: 'p1', song_id: 'a', position: 1 },
    { playlist_id: 'p1', song_id: 'ghost', position: 0 }, { playlist_id: 'p2', song_id: 'a', position: 0 },
  ]);
  const map = playlistTrackIds(s, new Map([['a', 'yt-a'], ['b', 'yt-b']]));
  assert.deepEqual(map.get('p1'), ['yt-a', 'yt-b']);
  assert.equal(map.has('p2'), false);
});

test('serialize -> deserialize round-trips, and rejects other cache versions', () => {
  const s = emptyState(); applySongRows(s, [song('a')]); replaceRows(s, 'artists', [{ id: 'ar', name: 'X' }]);
  s.cursor = '2026-10-19T10:00:00.000Z'; s.syncedAt = 123;
  const copy = deserializeState(JSON.parse(JSON.stringify(serializeState(s))));
  assert.equal(copy.songs.size, 1); assert.equal(copy.artists.size, 1); assert.equal(copy.cursor, s.cursor); assert.equal(copy.syncedAt, 123);
  assert.equal(deserializeState({ v: 999, songs: [] }), null);
  assert.equal(deserializeState(null), null);
});

test('bySongOrder: newest published first, stable tie-break on id', () => {
  const rows = [song('b', { published_at: '2026-01-01T00:00:00Z' }), song('a', { published_at: '2026-01-01T00:00:00Z' }), song('c', { published_at: '2026-06-01T00:00:00Z' })];
  assert.deepEqual(rows.sort(bySongOrder).map((r) => r.id), ['c', 'a', 'b']);
});
