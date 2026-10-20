const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const photoCache = new Map();

// Results survive reloads: a found portrait is kept 30 days, a confirmed "no portrait" 7 days.
// Network failures are NEVER cached, so going offline cannot permanently erase every artist photo.
const STORAGE_KEY = 'SURDHARA-artist-photos-v2';
const FOUND_TTL_MS = 30 * 24 * 3600 * 1000;
const MISSING_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_CONCURRENT = 3;
let persisted = null;
let persistTimer = null;

function readPersisted() {
  if (persisted) return persisted;
  try { persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { persisted = {}; }
  return persisted;
}
function writePersisted(key, url) {
  readPersisted()[key] = { url, at: Date.now() };
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); } catch { /* quota: memory cache still works */ }
  }, 500);
}
function readFresh(key) {
  const hit = readPersisted()[key];
  if (!hit) return undefined;
  const ttl = hit.url ? FOUND_TTL_MS : MISSING_TTL_MS;
  return Date.now() - hit.at < ttl ? hit.url : undefined;
}

let active = 0;
const waiting = [];
function schedule(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      task().then(resolve, reject).finally(() => { active -= 1; waiting.shift()?.(); });
    };
    if (active < MAX_CONCURRENT) run(); else waiting.push(run);
  });
}

// Names with common ambiguity or transliteration variants are explicitly mapped to the
// intended singer's biography page. We never search loosely for a similar-looking name.
const CANONICAL_ARTICLE_BY_NAME = new Map();
const aliases = {
  'Hemant Kumar': [
    'Hemant Kumar', 'Hemanta Mukherjee', 'Hemanta Mukhopadhyay',
    'Hemanta Kumar Mukhopadhyay', 'Hemant Kumar Mukhopadhyay',
    'হেমন্ত মুখোপাধ্যায়', 'হেমন্ত মুখোপাধ্যায়', 'হেমন্ত মুখার্জি', 'হেমন্ত কুমার মুখোপাধ্যায়',
  ],
  'Mukesh (singer)': [
    'Mukesh', 'Mukesh singer', 'Mukesh Chand Mathur',
    'মুকেশ', 'মুকেশ চাঁদ মাথুর',
  ],
  'Papon (singer)': [
    'Papon', 'Angaraag Mahanta', 'Angarag Mahanta', 'পাপন', 'অংগৰাগ মহন্ত', 'অংগরাগ মহন্ত',
  ],
};

function normalize(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

Object.entries(aliases).forEach(([article, names]) => {
  names.forEach((name) => CANONICAL_ARTICLE_BY_NAME.set(normalize(name), article));
});

function isUsableImage(url = '') {
  return /^https?:\/\//i.test(String(url)) && !/\.svg(?:[?#]|$)/i.test(String(url));
}

function isSingerBiography(page = {}) {
  const description = String(page.description || '');
  const extract = String(page.extract || '').slice(0, 1200);
  const text = `${description} ${extract}`.toLocaleLowerCase('en');
  // Images are shown only when the exact biography identifies a music performer.
  // Names that resolve to a businessman, industrialist, actor, or generic disambiguation
  // page must not receive a guessed portrait.
  const singerRole = /\b(playback singer|singer|vocalist|vocal artist|singer-songwriter|music artist|musician)\b/i.test(text);
  const wrongIdentityOnly = /\b(businessman|businesswoman|industrialist|business magnate|entrepreneur|politician)\b/i.test(description)
    && !/\b(playback singer|singer|vocalist|vocal artist|singer-songwriter)\b/i.test(description);
  const isDisambiguation = /may refer to|disambiguation|people with the name/i.test(description)
    || /may refer to the following|is a surname|is a given name/i.test(extract.slice(0, 300));
  return singerRole && !wrongIdentityOnly && !isDisambiguation;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Wikipedia responded with ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function lookupArtistPhoto(name) {
  const query = String(name || '').trim();
  if (!query) return '';

  const requestedKey = normalize(query);
  const canonicalTitle = CANONICAL_ARTICLE_BY_NAME.get(requestedKey) || query;
  const explicitlyMapped = CANONICAL_ARTICLE_BY_NAME.has(requestedKey);
  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', canonicalTitle);
  url.searchParams.set('redirects', '1');
  url.searchParams.set('prop', 'pageimages|extracts|description');
  url.searchParams.set('piprop', 'thumbnail|original');
  url.searchParams.set('pithumbsize', '700');
  url.searchParams.set('exintro', '1');
  url.searchParams.set('explaintext', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  // Network/HTTP failures propagate (resolveArtistPhoto decides not to cache them). Only a successful
  // lookup that finds no suitable singer biography returns '' — a blank is safer than a wrong portrait.
  const data = await fetchJson(url.toString());
  const page = Object.values(data?.query?.pages || {})[0];
  if (!page || page.missing !== undefined) return '';

  // For non-curated names, accept only the exact article title; never use fuzzy search results.
  if (!explicitlyMapped && normalize(page.title) !== requestedKey) return '';
  if (!isSingerBiography(page)) return '';

  const image = page.original?.source || page.thumbnail?.source || '';
  return isUsableImage(image) ? image : '';
}

export async function resolveArtistPhoto(name) {
  const key = normalize(name);
  if (!key) return '';
  if (photoCache.has(key)) return photoCache.get(key);
  const stored = readFresh(key);
  if (stored !== undefined) return stored;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return '';
  const promise = schedule(() => lookupArtistPhoto(name))
    .then((url) => { writePersisted(key, url); return url; })
    .catch(() => { photoCache.delete(key); return ''; }); // failure: forget it so the next call retries
  photoCache.set(key, promise);
  return promise;
}
