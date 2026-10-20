import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesIndexedSearch, matchesSearch, searchTerms } from '../src/lib/searchUtils.js';

const fieldsOf = (t) => [t.title, t.artist, t.album, t.year];
const tracks = [
  { title: 'Tomake Chai', artist: 'Arijit Singh', album: 'Gangster', year: 2016 },
  { title: 'Bojhena Shey Bojhena', artist: 'Zubeen Garg', album: 'Prem Amar', year: 2009 },
  { title: 'Ki Kore Toke Bolbo', artist: 'Papon, Palak Muchhal', album: 'Ki Kore Toke Bolbo', year: 2016 },
  { title: 'Café Déjà Vu', artist: "Beyoncé & Jay-Z feat. Rihanna", album: null, year: null },
  { title: 'আমার সোনার বাংলা', artist: 'রবীন্দ্রনাথ', album: '', year: 1905 },
];
const queries = ['', 'arijit', 'singh arijit', 'tomake chai', 'papon palak', 'bolbo ki', 'cafe deja', 'beyonce jay z', 'feat rihanna', '2016', 'zz', 'আমার', 'song the music', "bojhena shey's", 'a'];

test('indexed search is exactly equivalent to matchesSearch for every query/track pair', () => {
  for (const q of queries) {
    const terms = searchTerms(q);
    for (const t of tracks) assert.equal(matchesIndexedSearch(terms, t, fieldsOf), matchesSearch(q, fieldsOf(t)), `query "${q}" track "${t.title}"`);
  }
});

test('index is computed once per track object', () => {
  let calls = 0; const t = { title: 'X' };
  const f = (item) => { calls += 1; return [item.title]; };
  matchesIndexedSearch(['x'], t, f); matchesIndexedSearch(['y'], t, f); matchesIndexedSearch(['x'], t, f);
  assert.equal(calls, 1);
});
