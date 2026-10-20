/** Normalize artist names for stable matching across punctuation, accents, and spacing. */
export function normalizeArtistKey(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function artistSlug(value = '') {
  return normalizeArtistKey(value).replace(/\s+/g, '-');
}

/**
 * Split common collaboration credits when a service gives only one combined credit string.
 * Prefer MusicBrainz's structured artist-credit array when available; this helper is a fallback
 * for plain catalogue credit strings such as "Kishore Kumar & Lata Mangeshkar".
 */
export function splitArtistCredit(value) {
  const entries = Array.isArray(value) ? value : [value];
  const candidates = [];
  entries.forEach((entry) => {
    const raw = typeof entry === 'string' ? entry : String(entry?.name || entry?.artist?.name || '');
    if (!raw.trim()) return;
    const parts = raw.split(/\s*(?:,|;|\||\/|&|\+)\s*|\s+(?:feat\.?|featuring|with|and)\s+|\s+x\s+/i);
    parts.forEach((part) => {
      const cleaned = part
        .replace(/^\s*(?:feat\.?|featuring|with)\s+/i, '')
        .replace(/\s*\((?:with|feat\.?|featuring)\s+[^)]*\)\s*$/i, '')
        .trim();
      if (cleaned && !/^(?:various artists|unknown artist|chorus|backing vocals)$/i.test(cleaned)) candidates.push(cleaned);
    });
  });
  const seen = new Set();
  return candidates.filter((name) => {
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getTrackArtistNames(track = {}) {
  const vocalNames = Array.isArray(track.vocalArtistNames) ? track.vocalArtistNames : [];
  if (vocalNames.length) return splitArtistCredit(vocalNames);

  // Imported YouTube tracks must have an explicit vocal/performer role before they can
  // contribute an Artist card. This blocks generic metadata credits from leaking into Artists.
  if (track.importedFromYouTube) {
    if (track.artistCreditRole !== 'vocalist' && track.artistCreditRole !== 'performer') return [];
    const preferred = Array.isArray(track.artistNames) && track.artistNames.length
      ? track.artistNames
      : (track.artist ? [track.artist] : []);
    return splitArtistCredit(preferred);
  }

  // Keep the built-in catalogue working exactly as before; those records already model
  // their singer/performer associations explicitly.
  const preferred = Array.isArray(track.artistNames) && track.artistNames.length
    ? track.artistNames
    : (track.artist ? [track.artist] : []);
  return splitArtistCredit(preferred);
}

export function normalizeTrackArtistCredits(track = {}) {
  const artistNames = getTrackArtistNames(track);
  if (!artistNames.length) return { ...track, artist: '', artistNames: [], artistIds: [] };
  return {
    ...track,
    artist: artistNames.join(' & '),
    artistNames,
    artistIds: artistNames.map(artistSlug).filter(Boolean),
  };
}
