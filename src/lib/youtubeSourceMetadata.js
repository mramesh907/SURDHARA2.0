import { splitArtistCredit } from './artistCredits.js';

const LABEL_PATTERNS = [
  ['songTitle', /^(?:song(?:\s+name)?|track(?:\s+name)?|title)\s*[:=\-–—]\s*(.+)$/i],
  ['originalSingerNames', /^(?:original\s+(?:playback\s+)?singers?|original\s+vocalists?|original\s+vocals?)\s*[:=\-–—]\s*(.+)$/i],
  ['vocalArtistNames', /^(?:(?:playback\s+)?singers?|vocalists?|vocals?\s+by|sung\s+by|voice\s+of|performed\s+by|featuring\s+vocals)\s*[:=\-–—]\s*(.+)$/i],
  ['creditedArtist', /^(?:credited\s+artists?|artists?(?:\s+name)?|main\s+artist|featuring\s+artist)\s*[:=\-–—]\s*(.+)$/i],
  ['lyricist', /^(?:lyricists?|lyrics?|written\s+by\s+lyrics?|lyrics?\s+by|lyrics?\s+writer|writer\s+of\s+lyrics?|words\s+by)\s*[:=\-–—]\s*(.+)$/i],
  ['musicDirector', /^(?:music\s+directors?|music\s+direction|music\s+directed\s+by|score\s+by)\s*[:=\-–—]\s*(.+)$/i],
  ['composer', /^(?:composers?|music\s+composed\s+by|composed\s+by|music\s+composer|music\s+by|tune\s+by)\s*[:=\-–—]\s*(.+)$/i],
  ['producer', /^(?:producers?|produced\s+by|presented\s+by)\s*[:=\-–—]\s*(.+)$/i],
  ['movie', /^(?:movie|film|film\s+name|movie\s+name|from\s+the\s+movie|from\s+film|picture|featured\s+in|film\s+credits)\s*[:=\-–—]\s*(.+)$/i],
  ['album', /^(?:album|album\s+name|soundtrack|original\s+soundtrack|released\s+on\s+album|release)\s*[:=\-–—]\s*(.+)$/i],
  ['releaseDate', /^(?:original\s+release\s+date|release\s+date|released\s+on|release\s+year|year\s+of\s+release|year)\s*[:=\-–—]\s*(.+)$/i],
  ['label', /^(?:record\s+label|music\s+label|label(?:\s+name)?|audio\s+label|published\s+by\s+label|music\s+company|copyright\s+owner)\s*[:=\-–—]\s*(.+)$/i],
];

function cleanLine(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^\s*(?:[•*#>|]+|[-–—]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function valueOnly(value = '') {
  return cleanLine(value)
    .replace(/\s*(?:https?:\/\/\S+|www\.\S+)\s*/gi, ' ')
    .replace(/\s+#\w+/g, ' ')
    .replace(/[|•]+$/g, '')
    .trim()
    .slice(0, 240);
}

function looksLikePlaceholder(value = '') {
  return !value || /^(?:n\/?a|none|unknown|not available|not applicable|tba|to be announced|-)$/i.test(value.trim());
}

function findYear(value = '') {
  const match = String(value).match(/\b(?:18|19|20|21)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

/**
 * Extract only explicitly labelled music credits from the YouTube description. The raw description
 * is not treated as a catalog record and is not copied into visible song details. In particular,
 * a generic "Artist" credit is kept separate from verified vocal credits.
 */
export function extractYouTubeMusicMetadata({ title = '', description = '', tags = [], channelTitle = '', publishedAt = '' } = {}) {
  const result = {
    songTitle: '',
    vocalArtistNames: [],
    originalSingerNames: [],
    coverIndicators: [],
    creditedArtist: '',
    lyricist: '',
    musicDirector: '',
    composer: '',
    producer: '',
    movie: '',
    album: '',
    releaseDate: '',
    releaseYear: null,
    label: '',
    source: 'YouTube description',
    sourceChannel: cleanLine(channelTitle),
    sourceChannelType: '',
    searchTerms: [],
  };

  const channel = String(channelTitle || '').toLocaleLowerCase('en');
  if (/\b(saregama|shemaroo|t-series|zee music|eros now|venus music|ultra music|tips official|sony music india)\b/.test(channel)) {
    result.sourceChannelType = 'known music publisher/label channel';
  }

  const creditLabelLookahead = /\s*(?:\||｜|•)\s*(?=(?:song(?:\s+name)?|track(?:\s+name)?|title|original\s+(?:playback\s+)?singers?|original\s+vocalists?|(?:playback\s+)?singers?|vocalists?|vocals?\s+by|sung\s+by|voice\s+of|performed\s+by|credited\s+artists?|artists?(?:\s+name)?|lyricists?|lyrics?|written\s+by\s+lyrics?|lyrics?\s+by|music\s+directors?|music\s+direction|composers?|music\s+composed\s+by|composed\s+by|music\s+by|producers?|produced\s+by|movie|film|album|soundtrack|original\s+release\s+date|release\s+date|release\s+year|year|record\s+label|music\s+label|label)\s*[:=\-–—])/i;
  const descriptionLines = String(description || '').slice(0, 18000)
    .split(/\r?\n/).flatMap((line) => line.split(creditLabelLookahead)).map(cleanLine).filter(Boolean);
  // Some official uploads put credits in the title separated by pipes, e.g.
  // 'Song Name: X | Singer: Y | Movie: Z'. Treat each labelled segment as a credit line.
  const titleSegments = cleanLine(title).split(/\s*(?:\||｜|•|►)\s*/).filter(Boolean);
  const lines = [...titleSegments, ...descriptionLines];
  let creditSection = 'general';
  const sectionFor = (line) => {
    const heading = cleanLine(line).replace(/^[*_]+|[*_]+$/g, '').replace(/[:：\-–—]+$/g, '').toLocaleLowerCase('en').trim();
    if (/^(?:original\s+(?:song|track|recording|version)(?:\s+(?:details|credits|information|info))?|original song details|original version details)$/.test(heading)) return 'original';
    if (/^(?:cover\s+(?:song|track|recording|version)(?:\s+(?:details|credits|information|info))?|cover song details|cover version details|this version(?:\s+details)?|cover details)$/.test(heading)) return 'current';
    return '';
  };
  const parseCreditLine = (line) => {
    const section = sectionFor(line);
    if (section) {
      creditSection = section;
      return;
    }
    // Keep section boundaries visible to the next credit lines. A plain heading should never
    // be interpreted as a person's name or a song title.
    if (/^(?:original song details|cover song details|original version details|cover version details)\s*[:：]?$/i.test(line)) return;

    for (const [field, pattern] of LABEL_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const value = valueOnly(match[1]);
      if (looksLikePlaceholder(value)) break;
      if (field === 'vocalArtistNames' || field === 'originalSingerNames') {
        const candidates = splitArtistCredit(value);
        if (field === 'originalSingerNames' || (field === 'vocalArtistNames' && creditSection === 'original')) {
          if (candidates.length && !result.originalSingerNames.length) result.originalSingerNames = candidates;
        } else if (field === 'vocalArtistNames' && (creditSection === 'current' || creditSection === 'general')) {
          if (candidates.length && !result.vocalArtistNames.length) result.vocalArtistNames = candidates;
        }
      } else if (!result[field]) {
        result[field] = value;
      }
      break;
    }
  };
  lines.forEach(parseCreditLine);

  // Parse label-style original-credit wording without swallowing later phrases such as
  // "and music by ..." into the singer's name.
  if (!result.originalSingerNames.length) {
    const text = `${title}\n${description}`;
    const originallySungBy = text.match(/\boriginally\s+sung\s+by\s+(.+?)(?=\s+and\s+(?:music|composed|lyrics?|written|arranged)\s+by\b|[;|\n.]|$)/i);
    if (originallySungBy?.[1]) {
      const candidates = splitArtistCredit(valueOnly(originallySungBy[1]));
      if (candidates.length) result.originalSingerNames = candidates;
    }
  }

  // Official labels often explicitly write "Enjoy the cover version of X by Y" rather than
  // putting the current singer in a standalone Singer field. Treat Y as current singer and X
  // as the title only when that phrase is present; do not guess from a list of names in the title.
  const fullSourceText = `${title}\n${description}`;
  const coverOfBy = fullSourceText.match(/\bcover\s+(?:song|version|rendition)\s+of\s+["'“]?([^"'”\n.;]+?)["'”]?\s+by\s+([^.;\n]+?)(?=\s+Originally\s+sung\s+by|\s+originally\b|[.;\n]|$)/i);
  if (coverOfBy) {
    if (!result.songTitle) result.songTitle = valueOnly(coverOfBy[1]);
    if (!result.vocalArtistNames.length) {
      const candidates = splitArtistCredit(valueOnly(coverOfBy[2]));
      if (candidates.length) result.vocalArtistNames = candidates;
    }
    result.coverIndicators.push('YouTube description identifies a cover version and names its performer');
  }
  const titleText = cleanLine(title);
  if (/\b(?:cover(?:\s+(?:song|version|by|of))?|covered\s+by|recreated\s+version|tribute\s+cover|unplugged\s+cover)\b/i.test(titleText)) {
    result.coverIndicators.push('YouTube title explicitly mentions a cover or recreation');
  }
  if (!result.vocalArtistNames.length) {
    const titleSinger = titleText.match(/\b(?:cover(?:\s+version)?\s+by|sung\s+by|singer\s*[:=\-])\s*([^|()[\],;]+)/i);
    if (titleSinger?.[1]) {
      const candidates = splitArtistCredit(valueOnly(titleSinger[1]));
      if (candidates.length) result.vocalArtistNames = candidates;
    }
  }
  if (!result.originalSingerNames.length) {
    const titleOriginalSinger = titleText.match(/\b(?:original\s+singer|originally\s+sung\s+by)\s*[:=\-–—]?\s*([^|()[\],;]+)/i);
    if (titleOriginalSinger?.[1]) {
      const candidates = splitArtistCredit(valueOnly(titleOriginalSinger[1]));
      if (candidates.length) result.originalSingerNames = candidates;
    }
  }
  if (lines.some((line) => /\b(?:this\s+is\s+a\s+cover|cover\s+(?:song|version|by|of)|covered\s+by|recreated\s+version|unplugged\s+cover|tribute\s+cover)\b/i.test(line))) {
    result.coverIndicators.push('YouTube description mentions a cover or recreation');
  }
  result.coverIndicators = [...new Set(result.coverIndicators)];

  // When a description gives a structured title as a separate field, prefer it to the full promo title.
  result.songTitle = result.songTitle || '';
  result.releaseYear = findYear(result.releaseDate);
  result.searchTerms = [...new Set([
    result.songTitle, result.creditedArtist, ...result.vocalArtistNames, ...result.originalSingerNames, result.lyricist,
    result.musicDirector, result.composer, result.producer, result.movie, result.album, result.label,
    ...(Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string').slice(0, 20) : []),
  ].map((entry) => cleanLine(entry)).filter(Boolean))].slice(0, 40);
  return result;
}

export function getCreditText(value) {
  return cleanLine(value).slice(0, 300);
}
