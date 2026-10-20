import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { globalPlaylistDefinitions, trackMatchesGlobalPlaylist } from '../src/data/globalPlaylists.js';

// Reference implementation = the ORIGINAL (un-memoised) module, kept in tests/fixtures for regression checks.
const reference = existsSync(new URL('./fixtures/globalPlaylists.original.mjs', import.meta.url))
  ? await import('./fixtures/globalPlaylists.original.mjs') : null;

const langs = ['Bengali', 'Hindi', 'English', 'Unknown', ''];
const artists = ['Kishore Kumar', 'Lata Mangeshkar', 'Arijit Singh', 'Rabindranath Tagore', 'Mukesh & Asha Bhosle', 'Sonu Nigam, Alka Yagnik', 'Someone Else', ''];
const genres = ['Pop', 'Rabindra Sangeet', 'Folk', 'Bollywood romantic classic', 'lo-fi chill', 'sad heartbreak evergreen', 'Baul', 'nostalgic monsoon', 'Unclassified', ''];
const makeTracks = () => {
  const out = []; let i = 0;
  for (const language of langs) for (const a of artists) for (const genre of genres) {
    i += 1;
    out.push({ id: `t${i}`, title: `Song ${i}`, language, artist: a, artistNames: a ? a.split(/[,&]/).map((x) => x.trim()) : [], vocalArtistNames: a ? a.split(/[,&]/).map((x) => x.trim()) : [], genre, tags: i % 3 ? [genre, 'late night'] : [], year: 1950 + (i * 7) % 75, movie: i % 4 ? '' : 'Film', mood: ['romantic', 'sad', 'classic', 'chill', 'all'][i % 5], importedFromYouTube: i % 2 === 0, metadataSources: i % 6 ? ['musicbrainz'] : [], metadataStatus: i % 5 ? 'matched' : 'pending', artistCreditRole: 'vocalist' });
  }
  return out;
};

test('memoised global playlist matching is identical to the original implementation', { skip: !reference }, () => {
  const tracks = makeTracks(); let compared = 0, trues = 0;
  for (const def of globalPlaylistDefinitions) for (const t of tracks) {
    const expected = reference.trackMatchesGlobalPlaylist(t, def.id);
    assert.equal(trackMatchesGlobalPlaylist(t, def.id), expected, `${def.id} / ${t.id}`);
    compared += 1; if (expected) trues += 1;
  }
  assert.ok(trues > 200, `sanity: expected a healthy number of matches, got ${trues}`);
  console.log(`compared ${compared} (playlist, song) pairs; ${trues} matches`);
});

test('large catalogue evaluates quickly (no per-playlist recomputation)', () => {
  const tracks = []; for (let i = 0; i < 3000; i += 1) tracks.push({ ...makeTracks()[i % 400], id: `big${i}` });
  const started = performance.now();
  for (const def of globalPlaylistDefinitions) tracks.filter((t) => trackMatchesGlobalPlaylist(t, def.id));
  const ms = performance.now() - started;
  assert.ok(ms < 3000, `took ${ms.toFixed(0)}ms`);
  console.log(`3000 songs x ${globalPlaylistDefinitions.length} playlists: ${ms.toFixed(0)}ms`);
});
