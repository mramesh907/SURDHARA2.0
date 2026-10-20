import { artistSlug, normalizeArtistKey, splitArtistCredit } from './artistCredits.js';
import { extractYouTubeMusicMetadata } from './youtubeSourceMetadata.js';

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const MUSICBRAINZ_SEARCH = 'https://musicbrainz.org/ws/2/recording/';
const COVER_ART_ARCHIVE = 'https://coverartarchive.org/release/';
const metadataCache = new Map();
let musicBrainzQueue = Promise.resolve();
let lastMusicBrainzRequest = 0;
const MUSICBRAINZ_INTERVAL_MS = 1100;

const LANGUAGE_CODES = {
  asm: 'Assamese', ben: 'Bengali', bn: 'Bengali', eng: 'English', en: 'English', guj: 'Gujarati', gu: 'Gujarati',
  hin: 'Hindi', hi: 'Hindi', kan: 'Kannada', kn: 'Kannada', mal: 'Malayalam', ml: 'Malayalam', mar: 'Marathi', mr: 'Marathi',
  nep: 'Nepali', ne: 'Nepali', ori: 'Odia', ory: 'Odia', or: 'Odia', pan: 'Punjabi', pa: 'Punjabi', tam: 'Tamil', ta: 'Tamil',
  tel: 'Telugu', te: 'Telugu', urd: 'Urdu', ur: 'Urdu', bho: 'Bhojpuri', san: 'Sanskrit', jpn: 'Japanese', ja: 'Japanese',
  kor: 'Korean', ko: 'Korean', zho: 'Chinese', zh: 'Chinese', spa: 'Spanish', es: 'Spanish', fra: 'French', fr: 'French',
};

const MARKETING_TERMS = /\b(official|full|video|music video|lyrical|lyrics|lyric video|audio|song|songs|hd|uhd|4k|8k|remaster(?:ed)?|new version|jukebox|status video|whatsapp status|visualizer|visualiser|promo|teaser|trailer|extended version|with lyrics|video song|official audio|official video|cover version|cover song|covered by|cover by|cover)\b/gi;
const MATCH_STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'from', 'with', 'to', 'in', 'on', 'official', 'full', 'video', 'music', 'song', 'songs', 'audio', 'lyrics', 'lyrical', 'hd', 'uhd', '4k', '8k', 'status', 'jukebox', 'remastered', 'remaster', 'new', 'version', 'cover', 'covered', 'recreated', 'by', 'movie', 'film']);

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripMarketing(text) {
  return safeString(text)
    .replace(/\([^)]*(?:official|full video|lyrics?|lyrical|audio|hd|4k|remaster|status|cover|recreated)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(?:official|full video|lyrics?|lyrical|audio|hd|4k|remaster|status|cover|recreated)[^\]]*\]/gi, ' ')
    .replace(/\s+(?:cover(?:\s+(?:song|version))?|covered)\s+by\s+[^|]+$/i, ' ')
    .replace(MARKETING_TERMS, ' ')
    .replace(/\b(sl(o|ow)\s*[-&+ ]?\s*reverb|nightcore|sped\s*up|slowed)\b/gi, ' ')
    .replace(/[|•►]+/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:;,]+|[\s\-–—:;,]+$/g, '')
    .trim();
}

/** Keep the original YouTube title as a matching hint, not as authoritative music metadata. */
export function getMusicLookupTitle(track) {
  // A clearly labelled Song / Song Name in the source description is a much better
  // catalogue query than the full promotional YouTube title. The latter often includes
  // uploader, movie, label, SEO tags and 'official video' wording.
  const explicitSongTitle = safeString(track?.youtubeSourceMetadata?.songTitle || track?.songTitle);
  if (explicitSongTitle) return explicitSongTitle.replace(/^\s*(?:song(?:\s+name)?|track(?:\s+name)?|title)\s*[:=–—-]\s*/i, '').trim() || explicitSongTitle;
  const rawTitle = safeString(track?.youtubeTitle || track?.sourceVideoTitle || track?.title);
  const titleParts = rawTitle.split(/\s*(?:\||｜|•|►)\s*/).map(stripMarketing).filter(Boolean);
  const labelledTitle = titleParts
    .map((part) => part.match(/^(?:song(?:\s+name)?|track(?:\s+name)?|title)\s*[:=–—-]\s*(.+)$/i)?.[1])
    .find(Boolean);
  const firstUseful = titleParts.find((segment) => segment.replace(/[^\p{L}\p{N}]/gu, '').length >= 2);
  return stripMarketing(labelledTitle || firstUseful || rawTitle) || rawTitle;
}

function tokens(value) {
  return new Set(
    safeString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('en')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1 && !MATCH_STOP_WORDS.has(token)),
  );
}

function overlapCoverage(candidateTokens, sourceTokens) {
  if (!candidateTokens.size) return 0;
  let matched = 0;
  candidateTokens.forEach((token) => { if (sourceTokens.has(token)) matched += 1; });
  return matched / candidateTokens.size;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((token) => { if (right.has(token)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

function durationMatch(sourceSeconds, candidateSeconds) {
  const source = Number(sourceSeconds) || 0;
  const candidate = Number(candidateSeconds) || 0;
  if (!source || !candidate) return 0;
  const difference = Math.abs(source - candidate);
  return Math.max(0, 1 - difference / Math.max(source, candidate, 1));
}

function matchScore({ sourceTitle, sourceContext, sourceDuration, candidateTitle, candidateArtist, candidateDuration, serviceScore = 1 }) {
  const sourceTitleTokens = tokens(sourceTitle);
  const candidateTitleTokens = tokens(candidateTitle);
  const titleCoverage = overlapCoverage(candidateTitleTokens, sourceTitleTokens);
  const titleSimilarity = (titleCoverage * 0.72) + (jaccard(candidateTitleTokens, sourceTitleTokens) * 0.28);
  const artistCoverage = overlapCoverage(tokens(candidateArtist), tokens(sourceContext));
  const durationSimilarity = durationMatch(sourceDuration, candidateDuration);
  const candidateWordCount = candidateTitleTokens.size;
  const ambiguityPenalty = candidateWordCount <= 1 && artistCoverage < 0.35 && durationSimilarity < 0.78 ? 0.18 : 0;
  const score = Math.max(0, Math.min(1,
    (titleSimilarity * 0.65) + (artistCoverage * 0.22) + (durationSimilarity * 0.08) + (Math.max(0, Math.min(1, serviceScore)) * 0.05) - ambiguityPenalty,
  ));
  return { score, titleCoverage, titleSimilarity, artistCoverage, durationSimilarity };
}

async function fetchJson(url, { timeoutMs = 7000, headers = {} } = {}) {
  const cached = metadataCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`Metadata service responded with ${response.status}`);
    const data = await response.json();
    metadataCache.set(url, { value: data, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

function fetchMusicBrainzJson(url) {
  const cached = metadataCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  const request = musicBrainzQueue.then(async () => {
    const delay = Math.max(0, MUSICBRAINZ_INTERVAL_MS - (Date.now() - lastMusicBrainzRequest));
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    lastMusicBrainzRequest = Date.now();
    return fetchJson(url, { timeoutMs: 9000, headers: { Accept: 'application/json' } });
  });
  musicBrainzQueue = request.catch(() => undefined);
  return request;
}

async function searchITunes(title) {
  if (!title) return [];
  const url = new URL(ITUNES_SEARCH);
  url.searchParams.set('term', title);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('media', 'music');
  url.searchParams.set('country', 'IN');
  url.searchParams.set('limit', '12');
  try {
    const response = await fetchJson(url.toString());
    return Array.isArray(response.results) ? response.results : [];
  } catch {
    return [];
  }
}

function escapeLucene(value) {
  return safeString(value).replace(/[+\-!(){}\[\]^"~*?:\\/]/g, '\\$&');
}

async function searchMusicBrainz(title, sourceTitle = '') {
  if (!title) return [];
  const url = new URL(MUSICBRAINZ_SEARCH);
  const titleOptions = [title, ...safeString(title).split(/\s+[-–—]\s+/).map((part) => part.trim()), ...safeString(sourceTitle).split(/\s*(?:\||｜|•|►|\s+[-–—]\s+)\s*/).map(stripMarketing)]
    .filter((part) => tokens(part).size >= 2)
    .filter((part, index, list) => list.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index);
  const query = titleOptions.map((part) => `recording:"${escapeLucene(part)}"`).join(' OR ');
  url.searchParams.set('query', query || `recording:"${escapeLucene(title)}"`);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '8');
  url.searchParams.set('inc', 'artist-credits releases tags genres');
  try {
    const response = await fetchMusicBrainzJson(url.toString());
    return Array.isArray(response.recordings) ? response.recordings : [];
  } catch {
    return [];
  }
}

function joinArtistCredit(credit = []) {
  if (!Array.isArray(credit)) return '';
  return credit.map((item) => {
    if (typeof item === 'string') return item;
    return safeString(item?.name || item?.artist?.name) + safeString(item?.joinphrase);
  }).join('').trim();
}

function getArtistNamesFromCredit(credit = []) {
  if (!Array.isArray(credit)) return [];
  return [...new Set(credit.map((item) => safeString(item?.name || item?.artist?.name)).filter(Boolean))];
}

function relationType(relation = {}) {
  return safeString(relation?.type).toLocaleLowerCase('en').replace(/[_-]+/g, ' ');
}

function relationAttributes(relation = {}) {
  return (Array.isArray(relation?.attributes) ? relation.attributes : [])
    .map((item) => safeString(typeof item === 'string' ? item : item?.type || item?.name).toLocaleLowerCase('en'));
}

function relationshipArtistName(relation = {}) {
  return safeString(relation?.artist?.name || relation?.target?.name || relation?.label?.name || '');
}

function vocalNamesFromRelations(relations = []) {
  const names = (Array.isArray(relations) ? relations : [])
    .filter((relation) => {
      const type = relationType(relation);
      if (type === 'vocal' || type === 'vocals' || type === 'singer') return true;
      if (!['performer', 'performance'].includes(type)) return false;
      return relationAttributes(relation).some((attribute) => /vocal|vocals|voice|singer|singing/.test(attribute));
    })
    .map(relationshipArtistName)
    .filter(Boolean);
  return [...new Set(names.flatMap((name) => splitArtistCredit(name)))];
}

function recordingWorkIdsFromRelations(relations = []) {
  const ids = [];
  (Array.isArray(relations) ? relations : []).forEach((relation) => {
    const workId = safeString(relation?.work?.id)
      || (safeString(relation?.['target-type']).toLowerCase() === 'work' ? safeString(relation?.target?.id) : '');
    if (workId && (relation?.work || relationType(relation) === 'performance' || relationType(relation) === 'recording of')) ids.push(workId);
  });
  return [...new Set(ids)];
}

function getRecordingReleaseDate(recording = {}) {
  // MusicBrainz lookup and search/browse representations use slightly different keys.
  const direct = safeString(
    recording?.['first-release-date'] || recording?.firstreleasedate || recording?.firstReleaseDate || recording?.first_release_date,
  );
  if (direct) return direct;
  const dates = (Array.isArray(recording?.releases) ? recording.releases : [])
    .map((release) => safeString(release?.date || release?.['first-release-date']))
    .filter((date) => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date))
    .sort();
  return dates[0] || '';
}

function collectNestedRelations(entity, output = [], visited = new Set()) {
  if (!entity || typeof entity !== 'object' || visited.has(entity)) return output;
  visited.add(entity);
  const relations = Array.isArray(entity.relations) ? entity.relations : [];
  relations.forEach((relation) => {
    output.push(relation);
    // MusicBrainz may place work-level composer/lyricist links on the nested work object.
    collectNestedRelations(relation?.work, output, visited);
    collectNestedRelations(relation?.recording, output, visited);
    collectNestedRelations(relation?.release, output, visited);
    collectNestedRelations(relation?.['release-group'], output, visited);
  });
  return output;
}

async function getMusicBrainzRecordingCredits(recordingId) {
  const empty = {
    vocalArtistNames: [], lyricists: [], composers: [], producers: [], labels: [],
    workIds: [], coverRelationship: false, releaseDate: '', release: null,
  };
  if (!recordingId) return empty;
  const lookupUrl = new URL(`${MUSICBRAINZ_SEARCH}${encodeURIComponent(recordingId)}`);
  lookupUrl.searchParams.set('inc', 'artist-rels artist-credits releases release-groups tags genres recording-level-rels work-rels work-level-rels');
  lookupUrl.searchParams.set('fmt', 'json');
  try {
    const recording = await fetchMusicBrainzJson(lookupUrl.toString());
    const relations = collectNestedRelations(recording);
    const namesFor = (predicate) => [...new Set(relations
      .filter(predicate)
      .map(relationshipArtistName)
      .filter(Boolean))];
    const vocalArtistNames = vocalNamesFromRelations(relations);
    const lyricists = namesFor((relation) => /^(lyricist|lyrics|writer of lyrics|writing lyrics)$/.test(relationType(relation)));
    const composers = namesFor((relation) => /^(composer|composed by|music composer)$/.test(relationType(relation)));
    const producers = namesFor((relation) => /^(producer|produced by)$/.test(relationType(relation)));
    const labelsFromReleases = (Array.isArray(recording?.releases) ? recording.releases : [])
      .flatMap((release) => Array.isArray(release?.['label-info']) ? release['label-info'] : [])
      .map((item) => safeString(item?.label?.name || ''))
      .filter(Boolean);
    const coverRelationship = relations.some((relation) =>
      relationType(relation) === 'performance' && relationAttributes(relation).includes('cover'));
    return {
      vocalArtistNames,
      lyricists: [...new Set(lyricists.flatMap((name) => splitArtistCredit(name)))],
      composers: [...new Set(composers.flatMap((name) => splitArtistCredit(name)))],
      producers: [...new Set(producers.flatMap((name) => splitArtistCredit(name)))],
      labels: [...new Set(labelsFromReleases)],
      workIds: recordingWorkIdsFromRelations(relations),
      coverRelationship,
      releaseDate: getRecordingReleaseDate(recording),
      release: pickBestRelease(recording),
    };
  } catch {
    return empty;
  }
}

/**
 * Find other recordings attached to the same MusicBrainz work and inspect actual vocal
 * relationships. Artist credits alone are deliberately not treated as proof that someone sang.
 */
async function getRelatedWorkRecordings(workId, currentRecordingId) {
  if (!workId) return [];
  const url = new URL(MUSICBRAINZ_SEARCH);
  url.searchParams.set('work', workId);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '100');
  url.searchParams.set('inc', 'artist-rels artist-credits releases recording-level-rels work-rels');
  try {
    const response = await fetchMusicBrainzJson(url.toString());
    const recordings = Array.isArray(response?.recordings) ? response.recordings : [];
    return recordings.map((recording) => ({
      id: safeString(recording?.id),
      title: safeString(recording?.title),
      releaseDate: getRecordingReleaseDate(recording),
      vocalArtistNames: vocalNamesFromRelations(collectNestedRelations(recording)),
    })).filter((recording) => recording.id && recording.id !== currentRecordingId)
      .sort((a, b) => {
        if (a.releaseDate && b.releaseDate) return a.releaseDate.localeCompare(b.releaseDate);
        if (a.releaseDate) return -1;
        if (b.releaseDate) return 1;
        return a.title.localeCompare(b.title);
      });
  } catch {
    return [];
  }
}

function namesHaveMeaningfulDifference(left = [], right = []) {
  const a = new Set((left || []).map(normalizeArtistKey).filter(Boolean));
  const b = new Set((right || []).map(normalizeArtistKey).filter(Boolean));
  if (!a.size || !b.size) return false;
  if (a.size !== b.size) return true;
  for (const name of a) if (!b.has(name)) return true;
  return false;
}

function getMetadataMatchContext(track = {}) {
  const source = track.youtubeSourceMetadata || {};
  return [
    track.youtubeTitle, track.sourceVideoTitle, track.title, track.youtubeChannel,
    track.creditedArtist, ...(track.creditedArtistNames || []),
    ...(track.vocalArtistNames || []), ...(source.vocalArtistNames || []),
    ...(source.originalSingerNames || []), source.creditedArtist, source.movie, source.album,
  ].filter(Boolean).join(' ');
}

function chooseBestITunesResult(results, track, lookupTitle) {
  const sourceContext = getMetadataMatchContext(track);
  const ranked = results.map((item) => {
    const score = matchScore({
      sourceTitle: lookupTitle,
      sourceContext,
      sourceDuration: track?.durationSeconds,
      candidateTitle: item.trackName,
      candidateArtist: item.artistName,
      candidateDuration: Number(item.trackTimeMillis || 0) / 1000,
    });
    return { item, ...score };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.titleCoverage < 0.62 || best.score < 0.53) return null;
  if (tokens(best.item.trackName).size <= 2 && best.artistCoverage < 0.2 && best.durationSimilarity < 0.8) return null;
  return best;
}

function chooseBestMusicBrainzResult(results, track, lookupTitle) {
  const sourceContext = getMetadataMatchContext(track);
  const ranked = results.map((item) => {
    const artistsText = joinArtistCredit(item['artist-credit'] || []);
    const score = matchScore({
      sourceTitle: lookupTitle,
      sourceContext,
      sourceDuration: track?.durationSeconds,
      candidateTitle: item.title,
      candidateArtist: artistsText,
      candidateDuration: Number(item.length || 0) / 1000,
      serviceScore: Number(item.score || 0) / 100,
    });
    return { item, artistsText, artistNames: getArtistNamesFromCredit(item['artist-credit'] || []), ...score };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.titleCoverage < 0.62 || best.score < 0.50) return null;
  if (tokens(best.item.title).size <= 2 && best.artistCoverage < 0.2 && best.durationSimilarity < 0.8) return null;
  return best;
}

function pickBestRelease(recording) {
  const releases = Array.isArray(recording?.releases) ? recording.releases.filter((release) => release?.title) : [];
  return releases.sort((a, b) => {
    const aDate = String(a.date || '9999');
    const bDate = String(b.date || '9999');
    return aDate.localeCompare(bDate);
  })[0] || null;
}

function isCompatibleMatch(appleMatch, musicBrainzMatch) {
  if (!appleMatch || !musicBrainzMatch) return false;
  const appleTitle = tokens(appleMatch.item.trackName);
  const brainzTitle = tokens(musicBrainzMatch.item.title);
  const titleAgreement = jaccard(appleTitle, brainzTitle) >= 0.45 || overlapCoverage(appleTitle, brainzTitle) >= 0.65 || overlapCoverage(brainzTitle, appleTitle) >= 0.65;
  const appleArtists = tokens(appleMatch.item.artistName);
  const brainzArtists = tokens(musicBrainzMatch.artistsText);
  const artistsAgree = jaccard(appleArtists, brainzArtists) >= 0.35 || overlapCoverage(appleArtists, brainzArtists) >= 0.6 || overlapCoverage(brainzArtists, appleArtists) >= 0.6;
  return titleAgreement && (artistsAgree || appleMatch.score >= 0.78 && musicBrainzMatch.score >= 0.78);
}

function languageFromScript(text = '') {
  if (/[\u0980-\u09FF]/u.test(text)) return { language: 'Bengali', source: 'script-inference' };
  if (/[\u0B80-\u0BFF]/u.test(text)) return { language: 'Tamil', source: 'script-inference' };
  if (/[\u0C00-\u0C7F]/u.test(text)) return { language: 'Telugu', source: 'script-inference' };
  if (/[\u0C80-\u0CFF]/u.test(text)) return { language: 'Kannada', source: 'script-inference' };
  if (/[\u0D00-\u0D7F]/u.test(text)) return { language: 'Malayalam', source: 'script-inference' };
  if (/[\u0A00-\u0A7F]/u.test(text)) return { language: 'Punjabi', source: 'script-inference' };
  if (/[\u0A80-\u0AFF]/u.test(text)) return { language: 'Gujarati', source: 'script-inference' };
  if (/[\u0B00-\u0B7F]/u.test(text)) return { language: 'Odia', source: 'script-inference' };
  if (/[\u0D80-\u0DFF]/u.test(text)) return { language: 'Sinhala', source: 'script-inference' };
  if (/[\uAC00-\uD7AF]/u.test(text)) return { language: 'Korean', source: 'script-inference' };
  if (/[\u3040-\u30FF]/u.test(text)) return { language: 'Japanese', source: 'script-inference' };
  return { language: 'Unknown', source: '' };
}

function languageFromMetadata(release, tags = [], title = '') {
  const code = safeString(release?.['text-representation']?.language || release?.language).toLowerCase();
  if (LANGUAGE_CODES[code]) return { language: LANGUAGE_CODES[code], source: 'MusicBrainz' };
  const text = tags.map((tag) => typeof tag === 'string' ? tag : tag?.name).filter(Boolean).join(' ').toLowerCase();
  const tagLanguage = Object.entries({
    bengali: 'Bengali', bangla: 'Bengali', hindi: 'Hindi', punjabi: 'Punjabi', tamil: 'Tamil', telugu: 'Telugu',
    malayalam: 'Malayalam', kannada: 'Kannada', marathi: 'Marathi', gujarati: 'Gujarati', assamese: 'Assamese',
    odia: 'Odia', oriya: 'Odia', bhojpuri: 'Bhojpuri', urdu: 'Urdu', nepali: 'Nepali', english: 'English',
  }).find(([word]) => new RegExp(`\\b${word}\\b`).test(text));
  if (tagLanguage) return { language: tagLanguage[1], source: 'MusicBrainz tags' };
  return languageFromScript(title);
}

function mapGenreToMood(genre, tags = []) {
  const text = `${genre || ''} ${tags.map((tag) => typeof tag === 'string' ? tag : tag?.name || '').join(' ')}`.toLowerCase();
  if (/heartbreak|heartbroken|sad song|sad songs|melancholy|melancholic|sorrow|longing/.test(text)) return 'sad';
  if (/romantic|love song|love songs|romance|love ballad/.test(text)) return 'romantic';
  if (/chill|lo[- ]?fi|ambient|acoustic|relax|downtempo/.test(text)) return 'chill';
  if (/upbeat|feel[- ]?good|happy|celebrat|positive mood/.test(text)) return 'feel-good';
  if (/peaceful|meditation|meditative/.test(text)) return 'peaceful';
  if (/classic|evergreen|oldies|retro/.test(text)) return 'classic';
  return 'all';
}

async function getMusicBrainzCover(releaseId) {
  if (!releaseId) return '';
  try {
    const coverInfo = await fetchJson(`${COVER_ART_ARCHIVE}${encodeURIComponent(releaseId)}`, { timeoutMs: 5000, headers: { Accept: 'application/json' } });
    const front = (coverInfo.images || []).find((image) => image.front) || coverInfo.images?.[0];
    return front?.thumbnails?.['250'] || front?.thumbnails?.small || front?.image || '';
  } catch {
    return '';
  }
}

/**
 * Enrich a YouTube-backed track by combining explicit YouTube source credits with
 * independently matched music-catalogue data. Generic uploader / artist-credit fields
 * are not promoted to vocalist credits unless a source explicitly identifies singing.
 */
export async function enrichTrackMetadata(track, onProgress = () => {}) {
  if (!track?.youtubeId) return track;
  const sourceTitle = safeString(track.youtubeTitle || track.sourceVideoTitle || track.title);
  // Existing imported tracks are not guaranteed to have been saved with parsed source metadata.
  // Parse the title/description before choosing a catalogue query, so labelled song titles are
  // not lost just because this is an older local import.
  const parsedSourceMetadata = extractYouTubeMusicMetadata({
    title: sourceTitle,
    description: track.youtubeDescription || track.sourceDescription || '',
    tags: track.youtubeTags || [],
    channelTitle: track.youtubeChannel || '',
    publishedAt: track.youtubePublishedAt || '',
  });
  const storedSourceMetadata = track.youtubeSourceMetadata || {};
  const sourceArray = (key) => Array.isArray(storedSourceMetadata[key]) && storedSourceMetadata[key].length
    ? storedSourceMetadata[key]
    : (Array.isArray(parsedSourceMetadata[key]) ? parsedSourceMetadata[key] : []);
  const sourceMeta = {
    ...parsedSourceMetadata,
    ...storedSourceMetadata,
    songTitle: safeString(storedSourceMetadata.songTitle || parsedSourceMetadata.songTitle),
    vocalArtistNames: sourceArray('vocalArtistNames'),
    originalSingerNames: sourceArray('originalSingerNames'),
    coverIndicators: sourceArray('coverIndicators'),
    lyricist: safeString(storedSourceMetadata.lyricist || parsedSourceMetadata.lyricist),
    musicDirector: safeString(storedSourceMetadata.musicDirector || parsedSourceMetadata.musicDirector),
    composer: safeString(storedSourceMetadata.composer || parsedSourceMetadata.composer),
    producer: safeString(storedSourceMetadata.producer || parsedSourceMetadata.producer),
    movie: safeString(storedSourceMetadata.movie || parsedSourceMetadata.movie),
    album: safeString(storedSourceMetadata.album || parsedSourceMetadata.album),
    releaseDate: safeString(storedSourceMetadata.releaseDate || parsedSourceMetadata.releaseDate),
    releaseYear: storedSourceMetadata.releaseYear || parsedSourceMetadata.releaseYear || null,
    label: safeString(storedSourceMetadata.label || parsedSourceMetadata.label),
    creditedArtist: safeString(storedSourceMetadata.creditedArtist || parsedSourceMetadata.creditedArtist),
    searchTerms: [...new Set([...(storedSourceMetadata.searchTerms || []), ...(parsedSourceMetadata.searchTerms || [])])].slice(0, 40),
  };
  const hydratedTrack = { ...track, youtubeSourceMetadata: sourceMeta };
  const lookupTitle = getMusicLookupTitle(hydratedTrack);
  if (!lookupTitle) return { ...hydratedTrack, description: '', tags: [] };
  const sourceMetaSignature = [
    sourceMeta.songTitle,
    ...(Array.isArray(sourceMeta.vocalArtistNames) ? sourceMeta.vocalArtistNames : []),
    ...(Array.isArray(sourceMeta.originalSingerNames) ? sourceMeta.originalSingerNames : []),
    ...(Array.isArray(sourceMeta.coverIndicators) ? sourceMeta.coverIndicators : []),
    sourceMeta.creditedArtist, sourceMeta.lyricist, sourceMeta.musicDirector, sourceMeta.composer,
    sourceMeta.producer, sourceMeta.movie, sourceMeta.album, sourceMeta.releaseDate, sourceMeta.label,
    ...(Array.isArray(track.vocalArtistNames) ? track.vocalArtistNames : []),
  ].map(safeString).filter(Boolean).join('|').toLocaleLowerCase('en').slice(0, 600);
  const cacheKey = `track:${safeString(track.youtubeId)}:${lookupTitle.toLowerCase()}:${safeString(track.youtubeChannel).toLowerCase()}:${track.durationSeconds || 0}:${encodeURIComponent(sourceMetaSignature)}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...track, ...cached.value };

  onProgress(`Checking music catalogues for “${lookupTitle}”…`);
  const [appleResults, brainzResults] = await Promise.all([
    searchITunes(lookupTitle),
    searchMusicBrainz(lookupTitle, sourceTitle),
  ]);
  let apple = chooseBestITunesResult(appleResults, hydratedTrack, lookupTitle);
  // If the labelled/song-name query has no confident Apple match, try the cleaned source title
  // once rather than accepting an unrelated result or silently giving up.
  if (!apple && sourceTitle && normalizeArtistKey(sourceTitle) !== normalizeArtistKey(lookupTitle)) {
    const fallbackTitle = getMusicLookupTitle({ youtubeTitle: sourceTitle, sourceVideoTitle: sourceTitle, title: sourceTitle });
    if (fallbackTitle && normalizeArtistKey(fallbackTitle) !== normalizeArtistKey(lookupTitle)) {
      const fallbackResults = await searchITunes(fallbackTitle);
      apple = chooseBestITunesResult(fallbackResults, hydratedTrack, fallbackTitle);
    }
  }
  const brainz = chooseBestMusicBrainzResult(brainzResults, hydratedTrack, lookupTitle);
  const compatible = isCompatibleMatch(apple, brainz);

  let preferred = null;
  if (compatible) preferred = apple.score >= brainz.score - 0.12 ? 'apple' : 'brainz';
  else if (apple && brainz) preferred = apple.score >= brainz.score + 0.08 ? 'apple' : brainz.score >= apple.score + 0.08 ? 'brainz' : (apple.titleSimilarity >= brainz.titleSimilarity ? 'apple' : 'brainz');
  else if (apple) preferred = 'apple';
  else if (brainz) preferred = 'brainz';

  const selectedApple = preferred === 'apple' ? apple : (compatible ? apple : null);
  const selectedBrainz = preferred === 'brainz' ? brainz : (compatible ? brainz : null);
  const youtubeSourceMetadata = sourceMeta;
  const brainzCredits = selectedBrainz?.item?.id
    ? await getMusicBrainzRecordingCredits(selectedBrainz.item.id)
    : { vocalArtistNames: [], lyricists: [], composers: [], producers: [], labels: [], workIds: [], coverRelationship: false, releaseDate: '', release: null };
  // Lookup responses reliably include linked releases/labels even when a search result omitted them.
  const brainzRelease = (selectedBrainz ? pickBestRelease(selectedBrainz.item) : null) || brainzCredits.release || null;
  // The YouTube description is tied to the actual imported recording. If it explicitly labels
  // the current performer (for example, "Cover Song Details — Singer: Debolinaa Nandy"), that
  // singer must take precedence over a catalog result that may describe the older original version.
  // Only fall back to MusicBrainz vocal relationships when the source does not name this version's singer.
  const explicitSourceVocalists = splitArtistCredit(youtubeSourceMetadata.vocalArtistNames || []);
  const previouslyVerifiedVocalists = track.vocalArtistSource === 'MusicBrainz recording vocal relationship'
    ? splitArtistCredit(track.vocalArtistNames || [])
    : [];
  const catalogueVocalists = splitArtistCredit(brainzCredits.vocalArtistNames || []);
  const vocalArtistNames = explicitSourceVocalists.length
    ? explicitSourceVocalists
    : (previouslyVerifiedVocalists.length ? previouslyVerifiedVocalists : catalogueVocalists);
  const artistNames = vocalArtistNames;
  const artist = artistNames.join(' & ');
  const explicitOriginalSingerNames = [...new Set([
    ...(youtubeSourceMetadata.originalSingerNames || []),
    ...(track.originalSingerNames || []),
    ...(track.originalSinger ? [track.originalSinger] : []),
  ].flatMap((name) => splitArtistCredit(name)).map(safeString).filter(Boolean))];
  const currentRecordingDate = safeString(getRecordingReleaseDate(selectedBrainz?.item || {}) || brainzCredits.releaseDate || brainzRelease?.date || '');
  let relatedRecordings = [];
  if (selectedBrainz?.item?.id && brainzCredits.workIds?.length) {
    // This is the cross-check that lets SURDHARA look for earlier versions of the same composition.
    relatedRecordings = await getRelatedWorkRecordings(brainzCredits.workIds[0], selectedBrainz.item.id);
  }
  const datedEarlierVersions = relatedRecordings
    .filter((recording) => recording.releaseDate && currentRecordingDate && recording.releaseDate < currentRecordingDate)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const relatedRecordingsWithVocalists = relatedRecordings.filter((recording) => recording.vocalArtistNames.length);
  const earlierRecordingsWithVocalists = datedEarlierVersions.filter((recording) => recording.vocalArtistNames.length);
  const earliestRelatedRecording = relatedRecordingsWithVocalists[0] || null;
  const earliestEarlierRecording = earlierRecordingsWithVocalists[0] || null;
  const earliestEarlierSingerDiffers = Boolean(
    earliestEarlierRecording && vocalArtistNames.length &&
    namesHaveMeaningfulDifference(vocalArtistNames, earliestEarlierRecording.vocalArtistNames),
  );

  let originalSingerNames = explicitOriginalSingerNames;
  let originalSingerSource = explicitOriginalSingerNames.length ? 'Explicit Original Singer credit in YouTube description' : '';
  let originalRecordingTitle = '';
  let originalRecordingDate = '';
  let originalRecordingMusicBrainzId = '';
  let coverStatus = 'unknown';
  let isCover = null;
  let coverConfidence = 0;
  const coverEvidence = [];
  const sourceCoverIndicators = Array.isArray(youtubeSourceMetadata.coverIndicators) ? youtubeSourceMetadata.coverIndicators : [];

  if (brainzCredits.coverRelationship) {
    isCover = true;
    coverStatus = 'confirmed-cover';
    coverConfidence = 98;
    coverEvidence.push('MusicBrainz explicitly marks the recording as a cover of a work');
    const candidate = earliestEarlierRecording || null;
    const earlierWithoutVocalist = datedEarlierVersions[0] || null;
    if (candidate) {
      if (!originalSingerNames.length) {
        originalSingerNames = candidate.vocalArtistNames;
        originalSingerSource = 'MusicBrainz vocal credits from an earlier recording of the same work';
      }
      originalRecordingTitle = candidate.title;
      originalRecordingDate = candidate.releaseDate;
      originalRecordingMusicBrainzId = candidate.id;
    } else if (earlierWithoutVocalist) {
      originalRecordingTitle = earlierWithoutVocalist.title;
      originalRecordingDate = earlierWithoutVocalist.releaseDate;
      originalRecordingMusicBrainzId = earlierWithoutVocalist.id;
      coverEvidence.push('An earlier recording is known, but MusicBrainz does not identify its vocalist in the available data');
    }
  } else if (datedEarlierVersions.length) {
    // An older recording of the same work is useful evidence, but it is not by itself
    // proof that the current version is a cover: the same singer may have re-recorded it.
    const earliestVersion = earliestEarlierRecording || datedEarlierVersions[0];
    if (earliestEarlierSingerDiffers) {
      isCover = true;
      coverStatus = 'likely-cover';
      coverConfidence = 82;
      coverEvidence.push('MusicBrainz links an earlier recording of the same work with different identified vocalists');
    } else if (!vocalArtistNames.length && sourceCoverIndicators.length) {
      isCover = true;
      coverStatus = 'cover-indicated';
      coverConfidence = 76;
      coverEvidence.push('Source explicitly indicates a cover; MusicBrainz also lists an earlier recording of the same work');
    } else {
      coverEvidence.push(earliestEarlierRecording
        ? 'An earlier recording of the same work is listed; available data does not prove this recording is a cover'
        : 'An earlier recording is listed, but its vocalist or original-version relationship is not verified');
    }
    if (earliestEarlierRecording) {
      // Explicit original-singer credits from a trusted source take precedence over inferred
      // names from related recordings. The latter can be incomplete or linked to a different version.
      if (!explicitOriginalSingerNames.length && (!originalSingerNames.length || earliestEarlierSingerDiffers)) {
        originalSingerNames = earliestEarlierRecording.vocalArtistNames;
        originalSingerSource = 'MusicBrainz vocal credits from an earlier recording of the same work';
      }
      originalRecordingTitle = earliestEarlierRecording.title;
      originalRecordingDate = earliestEarlierRecording.releaseDate;
      originalRecordingMusicBrainzId = earliestEarlierRecording.id;
    } else if (earliestVersion) {
      originalRecordingTitle = earliestVersion.title;
      originalRecordingDate = earliestVersion.releaseDate;
      originalRecordingMusicBrainzId = earliestVersion.id;
    }
  }

  if (!brainzCredits.coverRelationship && !datedEarlierVersions.length && sourceCoverIndicators.length) {
    isCover = true;
    coverStatus = 'cover-indicated';
    coverConfidence = Math.max(coverConfidence, 76);
    coverEvidence.push(...sourceCoverIndicators);
  }
  if (!brainzCredits.coverRelationship && namesHaveMeaningfulDifference(vocalArtistNames, originalSingerNames)) {
    isCover = true;
    coverStatus = 'likely-cover';
    coverConfidence = Math.max(coverConfidence, 72);
    coverEvidence.push('Current singer and explicitly credited original singer differ');
  }
  if (!originalSingerNames.length && isCover === true && earliestEarlierRecording) {
    originalSingerNames = earliestEarlierRecording.vocalArtistNames;
    originalSingerSource = 'MusicBrainz vocal credits from an earlier recording of the same work';
    originalRecordingTitle = earliestEarlierRecording.title;
    originalRecordingDate = earliestEarlierRecording.releaseDate;
    originalRecordingMusicBrainzId = earliestEarlierRecording.id;
  }
  if (!isCover && explicitOriginalSingerNames.length) {
    coverEvidence.push('Original Singer credit is present, but that credit alone does not prove the current recording is a cover');
  }
  const originalSinger = originalSingerNames.join(' & ');
  const creditedArtist = safeString(selectedApple?.item?.artistName || selectedBrainz?.artistsText || track.creditedArtist || youtubeSourceMetadata.creditedArtist);
  const album = selectedApple?.item?.collectionName || brainzRelease?.title || safeString(track.album) || safeString(youtubeSourceMetadata.album);
  const movie = safeString(track.movie || youtubeSourceMetadata.movie);
  const releaseDate = getRecordingReleaseDate(selectedBrainz?.item || {}) || brainzCredits.releaseDate || brainzRelease?.date || selectedApple?.item?.releaseDate || youtubeSourceMetadata.releaseDate || track.metadataReleaseDate || track.releaseDate || '';
  const yearMatch = String(releaseDate).match(/\b(18|19|20|21)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : (Number(track.year) || youtubeSourceMetadata.releaseYear || null);
  const musicDirector = safeString(track.musicDirector || youtubeSourceMetadata.musicDirector);
  const composer = [...new Set([...(brainzCredits.composers || []), ...(safeString(track.composer || youtubeSourceMetadata.composer) ? [safeString(track.composer || youtubeSourceMetadata.composer)] : [])])].join(' & ');
  const lyricist = [...new Set([...(brainzCredits.lyricists || []), ...(safeString(track.lyricist || youtubeSourceMetadata.lyricist) ? [safeString(track.lyricist || youtubeSourceMetadata.lyricist)] : [])])].join(' & ');
  const producer = [...new Set([...(brainzCredits.producers || []), ...(safeString(track.producer || youtubeSourceMetadata.producer) ? [safeString(track.producer || youtubeSourceMetadata.producer)] : [])])].join(' & ');
  const label = safeString(brainzCredits.labels?.[0] || track.label || youtubeSourceMetadata.label);
  const musicBrainzTags = [...(selectedBrainz?.item?.genres || []), ...(selectedBrainz?.item?.tags || [])];
  const musicBrainzTagNames = [...new Set(musicBrainzTags.map((item) => safeString(typeof item === 'string' ? item : item?.name)).filter(Boolean))].slice(0, 12);
  const genre = selectedApple?.item?.primaryGenreName || musicBrainzTagNames[0] || 'Unclassified';
  const languageInfo = languageFromMetadata(brainzRelease, musicBrainzTagNames, selectedApple?.item?.trackName || selectedBrainz?.item?.title || lookupTitle);
  const sources = [];
  if (selectedApple) sources.push('Apple/iTunes');
  if (selectedBrainz) sources.push('MusicBrainz');
  if ([youtubeSourceMetadata.songTitle, youtubeSourceMetadata.creditedArtist, youtubeSourceMetadata.vocalArtistNames?.length ? 'vocalists' : '', youtubeSourceMetadata.originalSingerNames?.length ? 'original singer' : '', youtubeSourceMetadata.coverIndicators?.length ? 'cover clue' : '', youtubeSourceMetadata.lyricist, youtubeSourceMetadata.musicDirector, youtubeSourceMetadata.composer, youtubeSourceMetadata.movie, youtubeSourceMetadata.album, youtubeSourceMetadata.releaseDate, youtubeSourceMetadata.label, youtubeSourceMetadata.producer].some(Boolean)) sources.push('YouTube source metadata');
  if (brainzCredits.workIds?.length || brainzCredits.coverRelationship || relatedRecordings.length) sources.push('MusicBrainz work/version cross-check');
  const confidenceScore = Math.round(100 * Math.max(selectedApple?.score || 0, selectedBrainz?.score || 0));
  let catalogCover = '';
  if (selectedBrainz && brainzRelease?.id) {
    catalogCover = await getMusicBrainzCover(brainzRelease.id);
  }
  const metadataTitle = selectedApple?.item?.trackName || selectedBrainz?.item?.title || youtubeSourceMetadata.songTitle || lookupTitle || sourceTitle;
  const matched = Boolean(preferred && (selectedApple || selectedBrainz));
  const enrichment = {
    title: metadataTitle,
    artist,
    artistNames,
    artistIds: artistNames.map(artistSlug).filter(Boolean),
    vocalArtistNames,
    originalSingerNames,
    originalSinger,
    originalSingerSource,
    originalRecordingTitle,
    originalRecordingDate,
    originalRecordingMusicBrainzId,
    isCover,
    coverStatus,
    coverConfidence,
    coverEvidence: [...new Set(coverEvidence)],
    originalSingerMetadataConflict: Boolean(explicitOriginalSingerNames.length && originalSingerNames.length && namesHaveMeaningfulDifference(explicitOriginalSingerNames, originalSingerNames)),
    artistCreditRole: vocalArtistNames.length ? 'vocalist' : '',
    vocalArtistSource: brainzCredits.vocalArtistNames?.length ? 'MusicBrainz recording vocal relationship' : vocalArtistNames.length ? 'Explicit YouTube description credit' : '',
    creditedArtist,
    creditedArtistNames: splitArtistCredit(creditedArtist),
    album,
    movie,
    year,
    releaseDate,
    musicDirector,
    composer,
    lyricist,
    producer,
    label,
    youtubeSourceMetadata,
    genre,
    mood: mapGenreToMood(genre, musicBrainzTagNames),
    language: languageInfo.language !== 'Unknown' ? languageInfo.language : (track.language || 'Unknown'),
    languageSource: languageInfo.source || track.languageSource || '',
    description: '',
    tags: [...new Set([...(track.tags || []), ...musicBrainzTagNames, ...(youtubeSourceMetadata.searchTerms || [])])].slice(0, 50),
    metadataSources: sources,
    metadataStatus: selectedApple && selectedBrainz ? 'cross-checked' : matched ? 'matched' : sources.length ? 'youtube-source' : 'unmatched',
    metadataConfidence: matched ? confidenceScore : sources.length ? 40 : 0,
    metadataCheckedAt: new Date().toISOString(),
    metadataReleaseDate: releaseDate,
    musicBrainzRecordingId: selectedBrainz?.item?.id || '',
    musicBrainzReleaseId: brainzRelease?.id || '',
    appleTrackId: selectedApple?.item?.trackId || null,
    appleStoreUrl: selectedApple?.item?.trackViewUrl || '',
    metadataGenreSource: selectedApple ? 'Apple/iTunes' : selectedBrainz ? 'MusicBrainz' : '',
  };
  // Album artwork from Apple is deliberately not used as player artwork. Cache only catalogue artwork;
  // a fallback YouTube thumbnail is source-specific and must never leak across two video IDs.
  if (catalogCover) enrichment.cover = catalogCover;
  metadataCache.set(cacheKey, { value: enrichment, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return { ...track, ...enrichment };
}



/**
 * Apply refreshed metadata only when the catalogue match is sufficiently confident.
 * A refresh is allowed to correct an existing value, but an uncertain/low-confidence
 * result must never replace metadata that is already stored on the track.
 */
export function mergeVerifiedMetadata(existingTrack = {}, refreshedTrack = {}) {
  const existing = { ...existingTrack };
  const refreshed = { ...refreshedTrack };
  const status = String(refreshed.metadataStatus || '').toLowerCase();
  const confidence = Number(refreshed.metadataConfidence) || 0;
  const threshold = status === 'cross-checked' ? 65 : 70;
  const confident = (status === 'matched' || status === 'cross-checked') && confidence >= threshold;
  const appliedFields = [];
  const rejectedFields = [];

  const apply = (field, value, { allowEmpty = false } = {}) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    const unusableText = typeof normalizedValue === 'string' && /^(unknown|unclassified|all|n\/a|na)$/i.test(normalizedValue);
    const usable = allowEmpty ? value !== undefined && value !== null : value !== undefined && value !== null && String(value).trim() !== '' && !unusableText;
    if (confident && usable) {
      existing[field] = value;
      appliedFields.push(field);
      return true;
    }
    if (!confident && value !== undefined && value !== null && String(value).trim() !== '') rejectedFields.push(field);
    return false;
  };

  if (confident) {
    // Core identity fields are only accepted from a confident catalogue match.
    apply('title', refreshed.title);
    apply('album', refreshed.album);
    apply('movie', refreshed.movie);
    apply('year', refreshed.year);
    apply('releaseDate', refreshed.releaseDate);
    apply('metadataReleaseDate', refreshed.metadataReleaseDate || refreshed.releaseDate);
    apply('genre', refreshed.genre);
    apply('mood', refreshed.mood);
    apply('language', refreshed.language);
    apply('languageSource', refreshed.languageSource);
    apply('musicDirector', refreshed.musicDirector);
    apply('composer', refreshed.composer);
    apply('lyricist', refreshed.lyricist);
    apply('producer', refreshed.producer);
    apply('label', refreshed.label);
    apply('creditedArtist', refreshed.creditedArtist);
    apply('creditedArtistNames', refreshed.creditedArtistNames);
    apply('cover', refreshed.cover);

    // Artist cards must remain vocalist-only. Never replace a singer with a generic
    // uploader/channel or an album-level artist credit.
    const vocalists = Array.isArray(refreshed.vocalArtistNames) ? refreshed.vocalArtistNames.filter(Boolean) : [];
    if (vocalists.length && String(refreshed.artistCreditRole || '').toLowerCase() === 'vocalist') {
      apply('artist', refreshed.artist);
      apply('artistNames', vocalists);
      apply('artistIds', refreshed.artistIds);
      apply('vocalArtistNames', vocalists);
      apply('artistCreditRole', 'vocalist');
      apply('vocalArtistSource', refreshed.vocalArtistSource);
    }

    if (Array.isArray(refreshed.originalSingerNames) && refreshed.originalSingerNames.length) {
      apply('originalSingerNames', refreshed.originalSingerNames);
      apply('originalSinger', refreshed.originalSinger);
      apply('originalSingerSource', refreshed.originalSingerSource);
      apply('originalRecordingTitle', refreshed.originalRecordingTitle);
      apply('originalRecordingDate', refreshed.originalRecordingDate);
      apply('originalRecordingMusicBrainzId', refreshed.originalRecordingMusicBrainzId);
    }

    if (typeof refreshed.isCover === 'boolean') {
      apply('isCover', refreshed.isCover, { allowEmpty: true });
      apply('coverStatus', refreshed.coverStatus);
      apply('coverConfidence', refreshed.coverConfidence);
      apply('coverEvidence', refreshed.coverEvidence);
    }
  } else {
    // Keep the existing metadata completely intact when no trustworthy match exists.
    ['title','artist','album','movie','year','releaseDate','genre','language','musicDirector','composer','lyricist','producer','label','cover'].forEach((field) => {
      if (refreshed[field] !== undefined && refreshed[field] !== null && String(refreshed[field]).trim() !== '') rejectedFields.push(field);
    });
  }

  existing.tags = [...new Set([...(Array.isArray(existing.tags) ? existing.tags : []), ...(confident && Array.isArray(refreshed.tags) ? refreshed.tags : [])])].slice(0, 50);
  existing.metadataSources = [...new Set([...(Array.isArray(existing.metadataSources) ? existing.metadataSources : []), ...(Array.isArray(refreshed.metadataSources) ? refreshed.metadataSources : [])])];
  existing.metadataCheckedAt = refreshed.metadataCheckedAt || existing.metadataCheckedAt || '';
  existing.metadataConfidence = confident ? confidence : (Number(existing.metadataConfidence) || 0);
  existing.metadataStatus = confident ? status : (existing.metadataStatus || 'unmatched');
  existing.metadataRefreshRejected = !confident;
  existing.metadataRefreshRejectedAt = !confident ? (refreshed.metadataCheckedAt || new Date().toISOString()) : '';

  return { track: existing, appliedFields: [...new Set(appliedFields)], rejectedFields: [...new Set(rejectedFields)] };
}
export async function enrichTrackListMetadata(tracks, onProgress = () => {}) {
  const list = Array.isArray(tracks) ? tracks : [];
  const result = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      const track = list[index];
      onProgress(`Verifying song metadata (${index + 1} of ${list.length})…`);
      try {
        result[index] = await enrichTrackMetadata(track, onProgress);
      } catch {
        result[index] = { ...track, description: '', tags: [], metadataStatus: 'unmatched', metadataSources: [] };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, () => worker()));
  return result;
}
