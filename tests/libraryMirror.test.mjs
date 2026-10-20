import test from 'node:test';
import assert from 'node:assert/strict';
import { clearLibraryMirrorIfClean, readLibraryMirror, serializeLibrary, writeLibraryMirror } from '../src/lib/libraryMirror.js';

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

test('mirror round-trips and keeps the dirty flag', () => {
  const s = fakeStorage();
  writeLibraryMirror('u1', { favorites: ['a'], recent: ['b'] }, true, s);
  const m = readLibraryMirror('u1', s);
  assert.deepEqual(m.state.favorites, ['a']); assert.equal(m.dirty, true);
  assert.deepEqual(m.state.customPlaylists, []);
  assert.equal(readLibraryMirror('someone-else', s), null);
});

test('clean mirrors are removed on sign-out, dirty ones are kept so edits are never lost', () => {
  const s = fakeStorage();
  writeLibraryMirror('u1', { favorites: ['a'] }, false, s);
  clearLibraryMirrorIfClean('u1', s); assert.equal(readLibraryMirror('u1', s), null);
  writeLibraryMirror('u2', { favorites: ['x'] }, true, s);
  clearLibraryMirrorIfClean('u2', s); assert.ok(readLibraryMirror('u2', s));
});

test('serializeLibrary is key-order independent and tolerant of junk', () => {
  assert.equal(serializeLibrary({ recent: [1], favorites: [2] }), serializeLibrary({ favorites: [2], recent: [1] }));
  assert.doesNotThrow(() => serializeLibrary(null));
  assert.equal(readLibraryMirror('u', { getItem: () => '{not json' }), null);
});

test('storage failures never throw', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  assert.equal(writeLibraryMirror('u', {}, true, broken), false);
  assert.equal(readLibraryMirror('u', broken), null);
});
