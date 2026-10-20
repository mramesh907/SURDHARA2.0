import { getTrackArtistNames, normalizeArtistKey } from '../../src/lib/artistCredits.js';

const cover = {
  bengali: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85',
  heritage: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85',
  hindi: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=900&q=85',
  era: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=85',
  artists: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85',
  mood: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85',
};

const playlist = (collection, id, title, description, artwork) => ({
  id: `global-${id}`,
  title,
  collection,
  subtitle: '0 tracks',
  description,
  cover: artwork,
  trackIds: [],
  isGlobal: true,
  isCustom: false,
});

export const globalPlaylistDefinitions = [
  // Bengali Music
  playlist('Bengali Music', 'bengali-songs', 'Bengali Songs', 'Songs identified as Bengali from available catalogue or language metadata.', cover.bengali),
  playlist('Bengali Music', 'bengali-classics', 'Bengali Classics', 'Bengali tracks with reliable classic, retro, or pre-2000 era evidence.', cover.bengali),
  playlist('Bengali Music', '90s-bengali-melody', '90s Bengali Melody', 'Bengali songs with an original release year from 1990 through 1999.', cover.bengali),
  playlist('Bengali Music', 'bengali-evergreen-hits', 'Bengali Evergreen Hits', 'Bengali songs tagged as evergreen or classic by available metadata.', cover.bengali),
  playlist('Bengali Music', 'bengali-romantic-songs', 'Bengali Romantic Songs', 'Bengali songs with romantic or love-song metadata.', cover.bengali),
  playlist('Bengali Music', 'sad-bengali-songs', 'Sad Bengali Songs', 'Bengali songs with explicit sad, melancholy, or heartbreak metadata.', cover.bengali),
  playlist('Bengali Music', 'modern-bengali-songs', 'Modern Bengali Songs', 'Bengali songs with a confirmed original release year of 2000 or later.', cover.bengali),
  playlist('Bengali Music', 'bengali-adhunik', 'Bengali Adhunik', 'Bengali tracks explicitly identified as Adhunik in reliable music metadata.', cover.bengali),
  playlist('Bengali Music', 'bengali-modern-classics', 'Bengali Modern Classics', 'Bengali tracks from 2000–2019 with classic or evergreen evidence.', cover.bengali),
  playlist('Bengali Music', 'bengali-film-songs', 'Bengali Film Songs', 'Bengali tracks with confirmed movie or soundtrack metadata.', cover.bengali),
  playlist('Bengali Music', 'classic-bengali-film-songs', 'Classic Bengali Film Songs', 'Bengali film songs with an original release year before 2000.', cover.bengali),
  playlist('Bengali Music', 'bengali-classics-1960s', 'Bengali Classics — 1960s', 'Bengali songs released between 1960 and 1969.', cover.bengali),
  playlist('Bengali Music', 'bengali-classics-1970s', 'Bengali Classics — 1970s', 'Bengali songs released between 1970 and 1979.', cover.bengali),
  playlist('Bengali Music', 'bengali-classics-1980s', 'Bengali Classics — 1980s', 'Bengali songs released between 1980 and 1989.', cover.bengali),
  playlist('Bengali Music', 'bengali-classics-1990s', 'Bengali Classics — 1990s', 'Bengali songs released between 1990 and 1999.', cover.bengali),

  // Bengali Heritage & Traditional Music
  playlist('Bengali Heritage & Traditional Music', 'rabindra-sangeet', 'Rabindra Sangeet', 'Tracks explicitly identified as Rabindra Sangeet or Rabindranath Tagore compositions.', cover.heritage),
  playlist('Bengali Heritage & Traditional Music', 'nazrul-geeti', 'Nazrul Geeti', 'Tracks explicitly identified as Nazrul Geeti or Kazi Nazrul Islam compositions.', cover.heritage),
  playlist('Bengali Heritage & Traditional Music', 'bengali-folk-songs', 'Bengali Folk Songs', 'Bengali music with folk-tradition metadata.', cover.heritage),
  playlist('Bengali Heritage & Traditional Music', 'baul-songs', 'Baul Songs', 'Tracks explicitly identified as Baul music.', cover.heritage),
  playlist('Bengali Heritage & Traditional Music', 'bengali-devotional-songs', 'Bengali Devotional Songs', 'Bengali tracks with devotional or spiritual metadata.', cover.heritage),

  // Hindi Music & Bollywood
  playlist('Hindi Music & Bollywood', 'hindi-songs', 'Hindi Songs', 'Songs identified as Hindi from available catalogue or language metadata.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'hindi-classics', 'Hindi Classics', 'Hindi tracks with reliable classic, retro, or pre-2000 era evidence.', cover.hindi),
  playlist('Hindi Music & Bollywood', '90s-hindi-melody', '90s Hindi Melody', 'Hindi songs with an original release year from 1990 through 1999.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'classic-bollywood', 'Classic Bollywood', 'Hindi film songs from the classic era or explicitly tagged as Bollywood classics.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'hindi-evergreen-hits', 'Hindi Evergreen Hits', 'Hindi songs tagged as evergreen or classic by available metadata.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'bollywood-love-songs', 'Bollywood Love Songs', 'Hindi film songs with romantic or love-song metadata.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'sad-hindi-songs', 'Sad Hindi Songs', 'Hindi songs with explicit sad, melancholy, or heartbreak metadata.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'modern-hindi-hits', 'Modern Hindi Hits', 'Hindi songs with a confirmed original release year of 2000 or later.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'hindi-classics-1960s', 'Hindi Classics — 1960s', 'Hindi songs released between 1960 and 1969.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'hindi-classics-1970s', 'Hindi Classics — 1970s', 'Hindi songs released between 1970 and 1979.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'hindi-classics-1980s', 'Hindi Classics — 1980s', 'Hindi songs released between 1980 and 1989.', cover.hindi),
  playlist('Hindi Music & Bollywood', 'hindi-classics-1990s', 'Hindi Classics — 1990s', 'Hindi songs released between 1990 and 1999.', cover.hindi),

  // Era, Retro & Timeless Classics
  playlist('Era, Retro & Timeless Classics', '60s-classics', '60s Classics', 'Tracks with a confirmed original release year from 1960 through 1969.', cover.era),
  playlist('Era, Retro & Timeless Classics', '70s-classics', '70s Classics', 'Tracks with a confirmed original release year from 1970 through 1979.', cover.era),
  playlist('Era, Retro & Timeless Classics', '80s-classics', '80s Classics', 'Tracks with a confirmed original release year from 1980 through 1989.', cover.era),
  playlist('Era, Retro & Timeless Classics', '90s-classics', '90s Classics', 'Tracks with a confirmed original release year from 1990 through 1999.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'golden-era', 'Golden Era', 'Tracks with a confirmed original release year from 1950 through 1979.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'old-is-gold', 'Old Is Gold', 'Older songs with a confirmed original release year before 1990 or explicit oldies metadata.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'evergreen-classics', 'Evergreen Classics', 'Tracks with explicit evergreen or classic metadata, not inferred from upload date.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'retro-melodies', 'Retro Melodies', 'Tracks with explicit retro or oldies tags, or a confirmed pre-1990 release year.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'vintage-songs', 'Vintage Songs', 'Tracks with confirmed original release years before 1980.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'timeless-melodies', 'Timeless Melodies', 'Tracks identified as melodic classics by metadata or released before 1980.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'forgotten-gems', 'Forgotten Gems', 'Curated manually: add tracks here only when their lesser-known status is established.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'rare-classics', 'Rare Classics', 'Curated manually: add rare recordings when a reliable source supports that status.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'underrated-classics', 'Underrated Classics', 'Curated manually: no popularity judgement is inferred from song metadata.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'musical-memories', 'Musical Memories', 'Tracks with explicit nostalgic or memory-themed metadata.', cover.era),
  playlist('Era, Retro & Timeless Classics', 'all-time-favorites', 'All-Time Favorites', 'A global collection you can populate manually with tracks you want to keep close.', cover.era),

  // Artists & Legendary Voices
  playlist('Artists & Legendary Voices', 'kishore-kumar-hits', 'Kishore Kumar Hits', 'Tracks with Kishore Kumar credited as an individual artist.', cover.artists),
  playlist('Artists & Legendary Voices', 'lata-mangeshkar-hits', 'Lata Mangeshkar Hits', 'Tracks with Lata Mangeshkar credited as an individual artist.', cover.artists),
  playlist('Artists & Legendary Voices', 'arijit-singh-hits', 'Arijit Singh Hits', 'Tracks with Arijit Singh credited as an individual artist.', cover.artists),
  playlist('Artists & Legendary Voices', 'legendary-artist-voices', 'Legendary Artist Voices', 'Tracks credited to recognized legendary playback singers.', cover.artists),
  playlist('Artists & Legendary Voices', 'iconic-male-voices', 'Iconic Male Voices', 'Tracks credited to recognized iconic male playback singers.', cover.artists),
  playlist('Artists & Legendary Voices', 'iconic-female-voices', 'Iconic Female Voices', 'Tracks credited to recognized iconic female playback singers.', cover.artists),
  playlist('Artists & Legendary Voices', 'duets-collaborations', 'Duets & Collaborations', 'Tracks with two or more individual performers credited by a music catalogue.', cover.artists),
  playlist('Artists & Legendary Voices', 'legendary-duets', 'Legendary Duets', 'Older collaborations between recognized legendary playback singers.', cover.artists),

  // Mood & Listening Experience
  playlist('Mood & Listening Experience', 'lo-fi', 'Lo-Fi', 'Tracks explicitly tagged as lo-fi / lofi.', cover.mood),
  playlist('Mood & Listening Experience', 'chill-relax', 'Chill & Relax', 'Tracks with chill, ambient, acoustic, relax, or downtempo evidence.', cover.mood),
  playlist('Mood & Listening Experience', 'late-night-vibes', 'Late Night Vibes', 'Tracks explicitly tagged for late-night listening.', cover.mood),
  playlist('Mood & Listening Experience', 'morning-vibes', 'Morning Vibes', 'Tracks explicitly tagged for morning or sunrise listening.', cover.mood),
  playlist('Mood & Listening Experience', 'heartbreak-songs', 'Heartbreak Songs', 'Tracks with explicit heartbreak, sad, or melancholy metadata.', cover.mood),
  playlist('Mood & Listening Experience', 'peaceful-melodies', 'Peaceful Melodies', 'Tracks explicitly tagged as peaceful, ambient, or meditative.', cover.mood),
  playlist('Mood & Listening Experience', 'travel-songs', 'Travel Songs', 'Tracks explicitly tagged for travel or road-trip listening.', cover.mood),
  playlist('Mood & Listening Experience', 'feel-good-songs', 'Feel-Good Songs', 'Tracks with explicit upbeat, happy, celebratory, or feel-good metadata.', cover.mood),
  playlist('Mood & Listening Experience', 'evergreen-romantic-hits', 'Evergreen Romantic Hits', 'Romantic tracks with classic / evergreen evidence or a confirmed pre-2000 release year.', cover.mood),
  playlist('Mood & Listening Experience', 'romantic-classics', 'Romantic Classics', 'Romantic tracks with a confirmed original release year before 2000.', cover.mood),
  playlist('Mood & Listening Experience', 'sad-classics', 'Sad Classics', 'Sad or heartbreak tracks with a confirmed original release year before 2000.', cover.mood),
  playlist('Mood & Listening Experience', 'love-longing', 'Love & Longing', 'Tracks explicitly tagged with love-and-longing themes.', cover.mood),
  playlist('Mood & Listening Experience', 'nostalgic-songs', 'Nostalgic Songs', 'Tracks with explicit nostalgia or memory-themed metadata.', cover.mood),
  playlist('Mood & Listening Experience', 'rainy-day-melodies', 'Rainy Day Melodies', 'Tracks explicitly tagged for rain or monsoon listening.', cover.mood),
  playlist('Mood & Listening Experience', 'feel-good-classics', 'Feel-Good Classics', 'Upbeat / happy tracks with a confirmed original release year before 2000.', cover.mood),
];

const decadeFor = (year) => Number.isFinite(year) && year >= 1900 ? Math.floor(year / 10) * 10 : null;
const isYear = (year, start, end) => Number.isFinite(year) && year >= start && year <= end;
const termMatch = (text, expression) => expression.test(text);
const classicTerms = /\b(classic|classics|evergreen|oldies|retro|vintage|golden era|timeless|adhunik)\b/i;
const romanticTerms = /\b(romantic|romance|love song|love songs|love ballad)\b/i;
const sadTerms = /\b(sad|heartbreak|heartbroken|melancholy|melancholic|sorrow|longing)\b/i;
const filmTerms = /\b(film song|film songs|film soundtrack|movie soundtrack|soundtrack|original motion picture|motion picture|bollywood)\b/i;
const traditionTerms = {
  rabindra: /\b(rabindra sangeet|rabindrasangeet|rabindranath tagore|tagore song)\b/i,
  nazrul: /\b(nazrul geeti|nazrulgeeti|kazi nazrul islam)\b/i,
  folk: /\b(folk song|folk songs|bengali folk|lokgeeti|lok sangeet)\b/i,
  baul: /\b(baul|baul song|baul songs)\b/i,
  devotional: /\b(devotional|bhajan|spiritual song|prayer song)\b/i,
};

function getGenreTagText(track) {
  const tags = Array.isArray(track?.tags) ? track.tags.map((tag) => typeof tag === 'string' ? tag : tag?.name || '') : [];
  return [track?.genre, ...tags].filter(Boolean).join(' ').toLocaleLowerCase('en');
}

function getMetadataText(track) {
  const hasIndependentMatch = !track?.importedFromYouTube || (track.metadataSources || []).length > 0 || ['matched', 'cross-checked'].includes(track.metadataStatus);
  const reliableValues = [getGenreTagText(track), track?.movie, track?.musicDirector, track?.lyricist].filter(Boolean);
  if (hasIndependentMatch) reliableValues.push(track?.title, track?.album, track?.description);
  return reliableValues.join(' ').toLocaleLowerCase('en');
}

function artistsFor(track) {
  return getTrackArtistNames(track).map(normalizeArtistKey).filter(Boolean);
}

function hasArtist(track, target) {
  const key = normalizeArtistKey(target);
  return artistsFor(track).some((artist) => artist === key);
}

const maleLegends = [
  'Kishore Kumar', 'Mohammed Rafi', 'Manna Dey', 'Mukesh', 'Hemant Kumar', 'Talat Mahmood', 'Mahendra Kapoor', 'Udit Narayan', 'Sonu Nigam',
];
const femaleLegends = ['Lata Mangeshkar', 'Asha Bhosle', 'Geeta Dutt', 'Shamshad Begum', 'Suman Kalyanpur', 'Alka Yagnik', 'Anuradha Paudwal'];
const allLegends = [...maleLegends, ...femaleLegends];
const hasKnownArtist = (track, names) => names.some((name) => hasArtist(track, name));

/** Return true only where the track's available metadata supports this global playlist. */
export function trackMatchesGlobalPlaylist(track, playlistId) {
  const hasIndependentMatch = !track?.importedFromYouTube
    || (track?.metadataSources || []).length > 0
    || ['matched', 'cross-checked'].includes(track?.metadataStatus);
  const language = hasIndependentMatch && track?.languageSource !== 'script-inference'
    ? String(track?.language || '').toLocaleLowerCase('en')
    : '';
  const year = Number(track?.year) || NaN;
  const decade = decadeFor(year);
  const text = getMetadataText(track);
  const genreTagText = getGenreTagText(track);
  const artistCount = artistsFor(track).length;
  const isBengali = language === 'bengali';
  const isHindi = language === 'hindi';
  const romantic = track?.mood === 'romantic' || termMatch(genreTagText, romanticTerms);
  const sad = track?.mood === 'sad' || termMatch(genreTagText, sadTerms);
  const classic = termMatch(genreTagText, classicTerms) || track?.mood === 'classic';
  const evergreen = /\b(evergreen|all-time classic|timeless classic)\b/i.test(genreTagText);
  const soundtrack = Boolean(track?.movie) || termMatch(genreTagText, filmTerms);
  const explicitBollywood = /\b(bollywood|hindi film|hindi cinema)\b/i.test(genreTagText);
  const knownLegend = hasKnownArtist(track, allLegends);
  const duet = artistCount >= 2;
  const loFi = /\b(lo[ -]?fi|lofi)\b/i.test(genreTagText);
  const chill = track?.mood === 'chill' || /\b(chill|ambient|acoustic|relax|downtempo)\b/i.test(genreTagText);
  const happy = /\b(upbeat|happy|celebration|celebratory|feel good|feel-good|positive mood)\b/i.test(genreTagText) || track?.mood === 'feel-good';
  const peace = /\b(peaceful|meditation|meditative|ambient)\b/i.test(genreTagText);
  const nostalgic = /\b(nostalgic|nostalgia|musical memories|memories)\b/i.test(genreTagText);

  switch (playlistId) {
    // Bengali Music
    case 'global-bengali-songs': return isBengali;
    case 'global-bengali-classics': return isBengali && (classic || Number.isFinite(year) && year < 2000);
    case 'global-90s-bengali-melody': return isBengali && isYear(year, 1990, 1999);
    case 'global-bengali-evergreen-hits': return isBengali && (evergreen || classic && Number.isFinite(year) && year < 2000);
    case 'global-bengali-romantic-songs': return isBengali && romantic;
    case 'global-sad-bengali-songs': return isBengali && sad;
    case 'global-modern-bengali-songs': return isBengali && Number.isFinite(year) && year >= 2000;
    case 'global-bengali-adhunik': return isBengali && /\b(adhunik|adhunik bangla)\b/i.test(text);
    case 'global-bengali-modern-classics': return isBengali && isYear(year, 2000, 2019) && classic;
    case 'global-bengali-film-songs': return isBengali && soundtrack;
    case 'global-classic-bengali-film-songs': return isBengali && soundtrack && Number.isFinite(year) && year < 2000;
    case 'global-bengali-classics-1960s': return isBengali && decade === 1960;
    case 'global-bengali-classics-1970s': return isBengali && decade === 1970;
    case 'global-bengali-classics-1980s': return isBengali && decade === 1980;
    case 'global-bengali-classics-1990s': return isBengali && decade === 1990;

    // Bengali heritage
    case 'global-rabindra-sangeet': return isBengali && (traditionTerms.rabindra.test(text) || hasArtist(track, 'Rabindranath Tagore'));
    case 'global-nazrul-geeti': return isBengali && (traditionTerms.nazrul.test(text) || hasArtist(track, 'Kazi Nazrul Islam'));
    case 'global-bengali-folk-songs': return isBengali && traditionTerms.folk.test(text);
    case 'global-baul-songs': return isBengali && traditionTerms.baul.test(text);
    case 'global-bengali-devotional-songs': return isBengali && (traditionTerms.devotional.test(text) || /\b(kirtan|shyama sangeet|shyamasangeet)\b/i.test(text));

    // Hindi Music & Bollywood
    case 'global-hindi-songs': return isHindi;
    case 'global-hindi-classics': return isHindi && (classic || Number.isFinite(year) && year < 2000);
    case 'global-90s-hindi-melody': return isHindi && isYear(year, 1990, 1999);
    case 'global-classic-bollywood': return isHindi && (explicitBollywood || soundtrack) && (classic || Number.isFinite(year) && year < 2000);
    case 'global-hindi-evergreen-hits': return isHindi && (evergreen || classic && Number.isFinite(year) && year < 2000);
    case 'global-bollywood-love-songs': return isHindi && romantic && (explicitBollywood || soundtrack || Number.isFinite(year));
    case 'global-sad-hindi-songs': return isHindi && sad;
    case 'global-modern-hindi-hits': return isHindi && Number.isFinite(year) && year >= 2000;
    case 'global-hindi-classics-1960s': return isHindi && decade === 1960;
    case 'global-hindi-classics-1970s': return isHindi && decade === 1970;
    case 'global-hindi-classics-1980s': return isHindi && decade === 1980;
    case 'global-hindi-classics-1990s': return isHindi && decade === 1990;

    // Cross-language era collections
    case 'global-60s-classics': return decade === 1960;
    case 'global-70s-classics': return decade === 1970;
    case 'global-80s-classics': return decade === 1980;
    case 'global-90s-classics': return decade === 1990;
    case 'global-golden-era': return isYear(year, 1950, 1979);
    case 'global-old-is-gold': return Number.isFinite(year) && year < 1990 || /\b(oldies|old is gold)\b/i.test(text);
    case 'global-evergreen-classics': return evergreen || classic && Number.isFinite(year) && year < 2000;
    case 'global-retro-melodies': return /\b(retro|oldies)\b/i.test(text) || Number.isFinite(year) && year < 1990;
    case 'global-vintage-songs': return Number.isFinite(year) && year < 1980;
    case 'global-timeless-melodies': return /\b(melody|melodic|timeless|evergreen|classic)\b/i.test(text) && (classic || evergreen || Number.isFinite(year) && year < 1980);
    case 'global-forgotten-gems':
    case 'global-rare-classics':
    case 'global-underrated-classics':
    case 'global-all-time-favorites': return false; // User-curated; never infer rarity, popularity, or personal taste.
    case 'global-musical-memories': return nostalgic;

    // Artist collections
    case 'global-kishore-kumar-hits': return hasArtist(track, 'Kishore Kumar');
    case 'global-lata-mangeshkar-hits': return hasArtist(track, 'Lata Mangeshkar');
    case 'global-arijit-singh-hits': return hasArtist(track, 'Arijit Singh');
    case 'global-legendary-artist-voices': return knownLegend;
    case 'global-iconic-male-voices': return hasKnownArtist(track, maleLegends);
    case 'global-iconic-female-voices': return hasKnownArtist(track, femaleLegends);
    case 'global-duets-collaborations': return duet;
    case 'global-legendary-duets': return duet && hasKnownArtist(track, maleLegends) && hasKnownArtist(track, femaleLegends) && Number.isFinite(year) && year < 2000;

    // Mood collections. Broad moods are assigned only when the matching metadata supports them.
    case 'global-lo-fi': return loFi;
    case 'global-chill-relax': return chill;
    case 'global-late-night-vibes': return /\b(late night|night vibes|midnight|after dark)\b/i.test(text);
    case 'global-morning-vibes': return /\b(morning vibes|sunrise|morning music)\b/i.test(text);
    case 'global-heartbreak-songs': return sad;
    case 'global-peaceful-melodies': return peace;
    case 'global-travel-songs': return /\b(travel song|travel music|road trip|journey song)\b/i.test(text);
    case 'global-feel-good-songs': return happy;
    case 'global-evergreen-romantic-hits': return romantic && (evergreen || classic && Number.isFinite(year) && year < 2000);
    case 'global-romantic-classics': return romantic && Number.isFinite(year) && year < 2000;
    case 'global-sad-classics': return sad && Number.isFinite(year) && year < 2000;
    case 'global-love-longing': return /\b(love and longing|love & longing|longing|yearning)\b/i.test(text);
    case 'global-nostalgic-songs': return nostalgic;
    case 'global-rainy-day-melodies': return /\b(rainy day|rain song|monsoon|rain melodies)\b/i.test(text);
    case 'global-feel-good-classics': return happy && Number.isFinite(year) && year < 2000;
    default: return false;
  }
}

export function classifyTrackForGlobalPlaylists(track) {
  return globalPlaylistDefinitions
    .filter((definition) => trackMatchesGlobalPlaylist(track, definition.id))
    .map((definition) => definition.id);
}

export function getGlobalPlaylistCollections(globalPlaylists = []) {
  const titles = [...new Set(globalPlaylists.map((item) => item.collection))];
  return titles.map((title) => ({ title, playlists: globalPlaylists.filter((item) => item.collection === title) }));
}
