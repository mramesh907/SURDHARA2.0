const SEARCH_STOP_WORDS = new Set([
  'and', 'or', 'with', 'feat', 'featuring', 'ft', 'the', 'a', 'an', 'by', 'from', 'song', 'songs',
  'track', 'tracks', 'music', 'audio', 'movie', 'film', 'album', 'artist', 'singer',
]);

export function normalizeSearchText(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchTerms(value = '') {
  const normalized = normalizeSearchText(value);
  return normalized.split(' ').filter((term) => term && !SEARCH_STOP_WORDS.has(term));
}

/**
 * Token-wise substring matching makes artist collaborations order-independent and tolerant of
 * separators such as comma, ampersand, slash, "and", and "feat.". Every meaningful query token
 * must occur somewhere in the combined searchable fields, preventing loose OR matches.
 */
export function matchesSearch(query, fields = []) {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const haystack = normalizeSearchText(fields.filter((field) => field !== null && field !== undefined).join(' '));
  return terms.every((term) => haystack.split(' ').some((candidate) => candidate.includes(term)));
}

// ---- Indexed search -------------------------------------------------------------------------
// matchesSearch() re-normalises every field of every track on every keystroke. For a large catalogue
// that is the main cost of typing in the search box. This keeps ONE normalised string per track
// (WeakMap: freed with the track) and is exactly equivalent: query terms contain no spaces, so
// "some token includes term" is the same as "the space-joined string includes term".
const searchIndexCache = new WeakMap();

export function getSearchIndex(item, getFields) {
  let index = searchIndexCache.get(item);
  if (index === undefined) {
    index = normalizeSearchText(getFields(item).filter((field) => field !== null && field !== undefined).join(' '));
    searchIndexCache.set(item, index);
  }
  return index;
}

export function matchesIndexedSearch(terms, item, getFields) {
  if (!terms.length) return true;
  const index = getSearchIndex(item, getFields);
  for (let i = 0; i < terms.length; i += 1) if (!index.includes(terms[i])) return false;
  return true;
}
