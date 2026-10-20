import { supabase, isSupabaseConfigured } from './supabaseClient.js';

export const SURDHARA_AUDIO_BUCKET = 'surdhara-audio';
export const SURDHARA_ARTWORK_BUCKET = 'surdhara-artwork';

function ensureCloud() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Cloud publishing is not configured. Add your Supabase URL and publishable key to .env.local, then run the Phase 2 SQL setup.');
  }
}

function ensureAdmin(userId) {
  if (!userId) throw new Error('Sign in with the SURDHARA administrator account before publishing songs.');
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function stableYoutubeId(track) {
  return String(track?.youtubeId || (String(track?.id || '').startsWith('yt-') ? String(track.id).slice(3) : '')).trim();
}

function songToRow(track, { userId, id, audioPath } = {}) {
  const youtubeId = stableYoutubeId(track);
  const artistNames = asArray(track.artistNames).length ? asArray(track.artistNames) : toStringArray(track.artist);
  const originalSingerNames = asArray(track.originalSingerNames).length ? asArray(track.originalSingerNames) : toStringArray(track.originalSinger);
  const cover = track.cover && !String(track.cover).startsWith('blob:') ? String(track.cover) : null;
  const dateCandidate = String(track.releaseDate || track.metadataReleaseDate || '').trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateCandidate) ? new Date(`${dateCandidate}T00:00:00.000Z`) : null;
  const validReleaseDate = parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dateCandidate ? dateCandidate : null;
  const tags = [...new Set([...asArray(track.tags), ...asArray(track.youtubeTags)])].slice(0, 80);
  const extraMetadata = {
    youtubeTitle: track.youtubeTitle || '',
    sourceVideoTitle: track.sourceVideoTitle || '',
    youtubeChannel: track.youtubeChannel || '',
    youtubeChannelId: track.youtubeChannelId || '',
    youtubePublishedAt: track.youtubePublishedAt || '',
    creditedArtist: track.creditedArtist || '',
    artistCreditRole: track.artistCreditRole || '',
    vocalArtistSource: track.vocalArtistSource || '',
    originalSingerSource: track.originalSingerSource || '',
    isCover: typeof track.isCover === 'boolean' ? track.isCover : null,
    coverStatus: track.coverStatus || 'unknown',
    coverConfidence: Number(track.coverConfidence) || 0,
    coverEvidence: asArray(track.coverEvidence),
    languageSource: track.languageSource || '',
    metadataStatus: track.metadataStatus || '',
    metadataSources: asArray(track.metadataSources),
    metadataConfidence: Number(track.metadataConfidence) || 0,
    metadataCheckedAt: track.metadataCheckedAt || '',
    metadataRefreshRejected: Boolean(track.metadataRefreshRejected),
    metadataRefreshRejectedAt: track.metadataRefreshRejectedAt || '',
    metadataRefreshPolicy: track.metadataRefreshPolicy || 'confident-only',
    importedAt: track.importedAt || new Date().toISOString(),
    browserTrackId: youtubeId ? '' : String(track.id || ''),
    youtubeSourceMetadata: track.youtubeSourceMetadata && typeof track.youtubeSourceMetadata === 'object' ? track.youtubeSourceMetadata : {},
    youtubeTags: asArray(track.youtubeTags),
    notes: track.description || '',
  };

  const row = {
    source_type: youtubeId ? 'youtube' : 'local',
    youtube_id: youtubeId || null,
    source_url: track.videoUrl || track.sourceUrl || (youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null),
    title: String(track.title || track.youtubeTitle || 'Untitled track').trim().slice(0, 500),
    artist: artistNames.join(' & ') || String(track.artist || '').trim(),
    artist_names: artistNames,
    original_singer: originalSingerNames.join(' & ') || String(track.originalSinger || '').trim(),
    original_singer_names: originalSingerNames,
    album: String(track.album || '').trim() || null,
    movie: String(track.movie || '').trim() || null,
    release_date: validReleaseDate,
    year: Number.isFinite(Number(track.year)) && Number(track.year) > 0 ? Number.parseInt(track.year, 10) : null,
    language: String(track.language || 'Unknown').trim(),
    genre: String(track.genre || 'Unclassified').trim(),
    mood: String(track.mood || 'all').trim(),
    lyricist: String(track.lyricist || '').trim() || null,
    composer: String(track.composer || '').trim() || null,
    music_director: String(track.musicDirector || '').trim() || null,
    producer: String(track.producer || '').trim() || null,
    music_label: String(track.label || '').trim() || null,
    tags,
    cover_url: cover,
    duration_seconds: Math.max(0, Number.parseInt(track.durationSeconds, 10) || 0),
    audio_path: audioPath || track.audioPath || null,
    status: 'published',
    published_at: new Date().toISOString(),
    created_by: userId || null,
    extra_metadata: extraMetadata,
    updated_at: new Date().toISOString(),
  };
  if (id) row.id = id;
  return row;
}

export function rowToTrack(row) {
  const youtubeId = row.youtube_id || '';
  const isYoutube = row.source_type === 'youtube';
  let audioUrl = '';
  if (row.audio_path && supabase) {
    audioUrl = supabase.storage.from(SURDHARA_AUDIO_BUCKET).getPublicUrl(row.audio_path).data?.publicUrl || '';
  }
  const extra = row.extra_metadata && typeof row.extra_metadata === 'object' ? row.extra_metadata : {};
  const artistNames = asArray(row.artist_names);
  const originalSingerNames = asArray(row.original_singer_names);
  return {
    id: isYoutube ? `yt-${youtubeId}` : row.id,
    cloudSongId: row.id,
    cloudPublished: true,
    // Used to reconcile local-audio items after a successful browser-to-cloud migration.
    browserTrackId: String(extra.browserTrackId || ''),
    sourceType: isYoutube ? 'youtube' : 'local',
    importedFromYouTube: isYoutube,
    youtubeId: youtubeId || undefined,
    videoUrl: row.source_url || (youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : ''),
    sourceUrl: row.source_url || '',
    title: row.title || 'Untitled track',
    youtubeTitle: extra.youtubeTitle || row.title || '',
    sourceVideoTitle: extra.sourceVideoTitle || row.title || '',
    artist: row.artist || artistNames.join(' & '),
    artistNames,
    artistIds: [],
    vocalArtistNames: artistNames,
    originalSinger: row.original_singer || originalSingerNames.join(' & '),
    originalSingerNames,
    album: row.album || '',
    movie: row.movie || '',
    releaseDate: row.release_date || '',
    metadataReleaseDate: row.release_date || '',
    year: row.year || null,
    language: row.language || 'Unknown',
    genre: row.genre || 'Unclassified',
    mood: row.mood || 'all',
    lyricist: row.lyricist || '',
    composer: row.composer || '',
    musicDirector: row.music_director || '',
    producer: row.producer || '',
    label: row.music_label || '',
    tags: asArray(row.tags),
    cover: row.cover_url || (isYoutube && youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : '/local-audio-cover.svg'),
    audioPath: row.audio_path || '',
    audioUrl,
    durationSeconds: Number(row.duration_seconds) || 0,
    duration: formatDuration(Number(row.duration_seconds) || 0),
    importedAt: extra.importedAt || row.published_at || row.created_at || '',
    youtubePublishedAt: extra.youtubePublishedAt || '',
    youtubeChannel: extra.youtubeChannel || '',
    youtubeChannelId: extra.youtubeChannelId || '',
    creditedArtist: extra.creditedArtist || '',
    artistCreditRole: extra.artistCreditRole || '',
    vocalArtistSource: extra.vocalArtistSource || '',
    originalSingerSource: extra.originalSingerSource || '',
    isCover: typeof extra.isCover === 'boolean' ? extra.isCover : null,
    coverStatus: extra.coverStatus || 'unknown',
    coverConfidence: Number(extra.coverConfidence) || 0,
    coverEvidence: asArray(extra.coverEvidence),
    languageSource: extra.languageSource || '',
    metadataStatus: extra.metadataStatus || 'published',
    metadataSources: asArray(extra.metadataSources),
    metadataConfidence: Number(extra.metadataConfidence) || 0,
    metadataCheckedAt: extra.metadataCheckedAt || '',
    youtubeSourceMetadata: extra.youtubeSourceMetadata || {},
    youtubeTags: asArray(extra.youtubeTags),
    description: extra.notes || '',
    status: row.status,
    publishedAt: row.published_at || '',
  };
}

function formatDuration(totalSeconds) {
  const total = Math.max(0, Number(totalSeconds) || 0);
  if (!total) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(Math.floor(total % 60)).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

async function upsertYoutubeSongs(tracks, userId, { ignoreExisting = false } = {}) {
  ensureCloud();
  ensureAdmin(userId);
  const unique = new Map();
  (tracks || []).forEach((track) => {
    const youtubeId = stableYoutubeId(track);
    if (youtubeId) unique.set(youtubeId, track);
  });
  if (!unique.size) return [];
  const rows = [...unique.values()].map((track) => songToRow(track, { userId }));
  const { data, error } = await supabase.from('songs').upsert(rows, { onConflict: 'youtube_id', ignoreDuplicates: ignoreExisting }).select('*');
  if (error) throw new Error(`Could not publish YouTube songs to the cloud database: ${error.message}`);
  return (data || []).map(rowToTrack);
}

async function publishPlaylistRecords(playlists, sourceType, userId, tracks, { skipExisting = false } = {}) {
  if (!playlists?.length) return [];
  let sourcePlaylists = playlists;
  let rows = playlists.map((playlist) => {
    const youtubePlaylistId = playlist.youtubePlaylistId || String(playlist.id || '').replace(/^ytpl-/, '');
    const sourceKey = sourceType === 'youtube'
      ? `youtube:${youtubePlaylistId}`
      : `local:${userId}:${playlist.id || crypto.randomUUID()}`;
    return {
      source_key: sourceKey,
      source_type: sourceType,
      title: String(playlist.title || 'Imported music').trim().slice(0, 250),
      description: String(playlist.description || playlist.subtitle || 'A music collection published to SURDHARA.').slice(0, 2000),
      cover_url: playlist.cover || null,
      status: 'published',
      created_by: userId,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  if (skipExisting && rows.length) {
    const { data: existingRows, error: existingReadError } = await supabase
      .from('catalog_playlists')
      .select('source_key')
      .in('source_key', rows.map((row) => row.source_key));
    if (existingReadError) throw new Error(`Could not check existing playlists before migration: ${existingReadError.message}`);
    const existingKeys = new Set((existingRows || []).map((row) => row.source_key));
    const retained = rows.map((row, index) => ({ row, playlist: playlists[index] })).filter(({ row }) => !existingKeys.has(row.source_key));
    rows = retained.map(({ row }) => row);
    sourcePlaylists = retained.map(({ playlist }) => playlist);
    // During one-time migration, an existing playlist and its track links must remain untouched.
    if (!rows.length) return [];
  }
  const { data: savedPlaylists, error } = await supabase.from('catalog_playlists').upsert(rows, { onConflict: 'source_key', ignoreDuplicates: skipExisting }).select('*');
  if (error) throw new Error(`Songs were uploaded, but their playlist could not be published: ${error.message}`);

  const playlistYoutubeIds = (sourcePlaylists || []).flatMap((playlist) => playlist.trackIds || []).map((id) => String(id).match(/^yt-(.+)$/)?.[1] || '').filter(Boolean);
  const youtubeIds = [...new Set([...(tracks || []).map(stableYoutubeId).filter(Boolean), ...playlistYoutubeIds])];
  const knownSongsByOriginalId = new Map((tracks || []).map((track) => [track.id, track]));
  const dbIdByYoutubeId = new Map();
  const dbIdByTrackId = new Map();
  if (youtubeIds.length) {
    const { data: dbSongs, error: songReadError } = await supabase.from('songs').select('id,youtube_id').in('youtube_id', youtubeIds);
    if (songReadError) throw new Error(`Playlist details could not be linked to published songs: ${songReadError.message}`);
    (dbSongs || []).forEach((row) => dbIdByYoutubeId.set(row.youtube_id, row.id));
  }
  (tracks || []).forEach((track) => {
    const youtubeId = stableYoutubeId(track);
    if (youtubeId && dbIdByYoutubeId.has(youtubeId)) dbIdByTrackId.set(track.id, dbIdByYoutubeId.get(youtubeId));
    if (track.cloudSongId) dbIdByTrackId.set(track.id, track.cloudSongId);
  });

  const { data: allRows, error: readError } = await supabase.from('catalog_playlists').select('id,source_key,source_type,title,description,cover_url,status,published_at').in('source_key', rows.map((row) => row.source_key));
  if (readError) throw new Error(`Could not reload published playlists: ${readError.message}`);
  const playlistRowBySourceKey = new Map((allRows || []).map((row) => [row.source_key, row]));
  const trackLinks = [];
  (sourcePlaylists || []).forEach((playlist, index) => {
    const dbPlaylist = playlistRowBySourceKey.get(rows[index].source_key);
    if (!dbPlaylist) return;
    const ids = (playlist.trackIds || []).map((trackId) => {
      const knownTrack = knownSongsByOriginalId.get(trackId);
      if (knownTrack) return dbIdByTrackId.get(knownTrack.id) || null;
      const match = String(trackId).match(/^yt-(.+)$/);
      return match ? dbIdByYoutubeId.get(match[1]) || null : null;
    }).filter(Boolean);
    [...new Set(ids)].forEach((songId, position) => trackLinks.push({ playlist_id: dbPlaylist.id, song_id: songId, position }));
  });

  const playlistIds = (allRows || []).map((row) => row.id);
  if (playlistIds.length) {
    const { error: deleteError } = await supabase.from('catalog_playlist_tracks').delete().in('playlist_id', playlistIds);
    if (deleteError) throw new Error(`Could not refresh shared playlist tracks: ${deleteError.message}`);
  }
  if (trackLinks.length) {
    const { error: linksError } = await supabase.from('catalog_playlist_tracks').insert(trackLinks);
    if (linksError) throw new Error(`Could not publish shared playlist tracks: ${linksError.message}`);
  }
  return (allRows || []).map((row) => {
    const index = rows.findIndex((candidate) => candidate.source_key === row.source_key);
    const original = index >= 0 ? sourcePlaylists[index] : null;
    return { ...playlistRowToUi(row), trackIds: original?.trackIds || [] };
  });
}

export function playlistRowToUi(row, tracksByDbId = new Map()) {
  const youtube = row.source_type === 'youtube';
  const sourceId = String(row.source_key || '').replace(/^youtube:/, '');
  return {
    id: youtube ? `ytpl-${sourceId}` : `catalog-playlist-${row.id}`,
    cloudPlaylistId: row.id,
    title: row.title,
    subtitle: 'Published to SURDHARA',
    description: row.description || '',
    cover: row.cover_url || '/local-audio-cover.svg',
    trackIds: tracksByDbId.get(row.id) || [],
    isCustom: false,
    isYouTubeImport: youtube,
    isPublishedCatalog: true,
    sourceType: row.source_type,
    publishedAt: row.published_at || '',
  };
}

export async function publishYouTubeImport({ tracks, playlists = [], userId, migrationMode = false }) {
  // One-time migration is additive: never overwrite an existing cloud song's metadata.
  const publishedTracks = await upsertYoutubeSongs(tracks, userId, { ignoreExisting: migrationMode });
  // Existing imported playlists and their track links are left untouched during migration.
  const publishedPlaylists = await publishPlaylistRecords(playlists, 'youtube', userId, tracks, { skipExisting: migrationMode });
  return { tracks: publishedTracks, playlists: publishedPlaylists };
}

export async function publishLocalImport({ tracks = [], files = [], playlist = null, userId, migrationMode = false }) {
  ensureCloud();
  ensureAdmin(userId);
  let targetTracks = tracks;
  if (migrationMode && targetTracks.length) {
    const browserTrackIds = [...new Set(targetTracks.map((track) => String(track.id || '')).filter(Boolean))];
    if (browserTrackIds.length) {
      const { data: existingRows, error: existingReadError } = await supabase
        .from('songs')
        .select('extra_metadata')
        .in('extra_metadata->>browserTrackId', browserTrackIds);
      if (existingReadError) throw new Error(`Could not check existing local songs before migration: ${existingReadError.message}`);
      const existingBrowserIds = new Set((existingRows || []).map((row) => String(row.extra_metadata?.browserTrackId || '')).filter(Boolean));
      targetTracks = targetTracks.filter((track) => !existingBrowserIds.has(String(track.id || '')));
    }
  }
  if (!targetTracks.length) return { tracks: [], playlists: [] };
  const fileByTrackId = new Map(files.map(({ trackId, file }) => [trackId, file]));
  const uploadedPaths = [];
  const rows = [];
  let insertedSongIds = [];
  const possiblePlaylistSourceKey = playlist ? `local:${userId}:${playlist.id}` : '';
  const bucket = supabase.storage.from(SURDHARA_AUDIO_BUCKET);
  try {
    for (const track of targetTracks) {
      const file = fileByTrackId.get(track.id);
      if (!file) throw new Error(`The audio file for “${track.title}” could not be found. Select it again and retry.`);
      const songId = crypto.randomUUID();
      const originalName = String(file.name || track.localFileName || 'audio-file').normalize('NFKD');
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-150) || 'audio-file';
      const path = `${userId}/${songId}/${safeName}`;
      const candidateType = file.type || track.localFileType || '';
      const safeContentType = candidateType && !candidateType.includes('*') ? candidateType : 'application/octet-stream';
      const { error: uploadError } = await bucket.upload(path, file, {
        upsert: false,
        cacheControl: '31536000',
        contentType: safeContentType,
      });
      if (uploadError) throw new Error(`Could not upload “${track.title}” to cloud storage: ${uploadError.message}`);
      uploadedPaths.push(path);
      rows.push(songToRow(track, { userId, id: songId, audioPath: path }));
    }

    const { data, error } = await supabase.from('songs').insert(rows).select('*');
    if (error) throw new Error(`Audio files reached cloud storage, but their database records were not saved: ${error.message}`);
    insertedSongIds = rows.map((row) => row.id);
    const savedTracks = (data || []).map(rowToTrack);
    const playlistTrackRefs = targetTracks.map((track, index) => ({ ...track, cloudSongId: rows[index]?.id || savedTracks.find((saved) => saved.title === track.title)?.cloudSongId }));
    const publishedPlaylists = playlist
      ? await publishPlaylistRecords([{
          ...playlist,
          id: playlist.id,
          trackIds: targetTracks.map((track) => track.id),
        }], 'local_batch', userId, playlistTrackRefs)
      : [];
    const orderedSavedTrackIds = targetTracks.map((track, index) => savedTracks.find((saved) => saved.cloudSongId === rows[index]?.id)?.id).filter(Boolean);
    const playlistWithTracks = publishedPlaylists.map((item) => ({ ...item, trackIds: orderedSavedTrackIds }));
    return { tracks: savedTracks, playlists: playlistWithTracks };
  } catch (error) {
    if (possiblePlaylistSourceKey) {
      try { await supabase.from('catalog_playlists').delete().eq('source_key', possiblePlaylistSourceKey); } catch { /* best-effort rollback */ }
    }
    if (insertedSongIds.length) {
      try { await supabase.from('songs').delete().in('id', insertedSongIds); } catch { /* best-effort rollback */ }
    }
    if (uploadedPaths.length) {
      await bucket.remove(uploadedPaths).catch(() => {});
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Catalogue reads. PostgREST returns at most 1,000 rows per request (a server-side cap), so a plain
// `select('*')` silently drops songs once the catalogue grows past that. Everything below pages
// with .range() and checks the exact total, so no song is ever lost and nothing is fetched twice.
// ---------------------------------------------------------------------------------------------
export const CATALOGUE_PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery, { pageSize = CATALOGUE_PAGE_SIZE, onPage, describe = 'rows' } = {}) {
  const rows = [];
  let total = null;
  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await buildQuery(from === 0).range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load ${describe}: ${error.message}`);
    const page = data || [];
    if (from === 0 && Number.isFinite(count)) total = count;
    rows.push(...page);
    if (onPage) await onPage(page, rows.length, total);
    // Prefer the exact total (robust if the server caps rows lower than pageSize); otherwise a short page means "done".
    if (!page.length) break;
    if (total !== null ? rows.length >= total : page.length < pageSize) break;
  }
  return rows;
}

export const catalogueApi = {
  /** Published songs, newest first. With `since`, only rows changed at/after that ISO time (oldest first). */
  fetchSongs({ since = '', onPage } = {}) {
    ensureCloud();
    const build = (first) => {
      let query = supabase.from('songs').select('*', first ? { count: 'exact' } : undefined).eq('status', 'published');
      query = since
        ? query.gte('updated_at', since).order('updated_at', { ascending: true }).order('id', { ascending: true })
        : query.order('published_at', { ascending: false }).order('id', { ascending: true });
      return query;
    };
    return fetchAllPages(build, { onPage, describe: 'the public SURDHARA music catalogue (run supabase/phase2-cloud-music.sql if this keeps failing)' });
  },
  /** One cheap HEAD request: how many published songs exist right now. */
  async fetchPublishedSongCount() {
    ensureCloud();
    const { count, error } = await supabase.from('songs').select('id', { count: 'exact', head: true }).eq('status', 'published');
    if (error) throw new Error(`Could not verify the catalogue size: ${error.message}`);
    return Number.isFinite(count) ? count : null;
  },
  /** id-only listing (a few dozen bytes per song) used to find songs removed from the public view. */
  async fetchPublishedSongIds() {
    ensureCloud();
    const rows = await fetchAllPages(
      (first) => supabase.from('songs').select('id', first ? { count: 'exact' } : undefined).eq('status', 'published').order('id', { ascending: true }),
      { describe: 'the list of published song ids' },
    );
    return rows.map((row) => row.id);
  },
  async fetchSongsByIds(ids = []) {
    ensureCloud();
    const rows = [];
    for (let index = 0; index < ids.length; index += 100) {
      const { data, error } = await supabase.from('songs').select('*').eq('status', 'published').in('id', ids.slice(index, index + 100));
      if (error) throw new Error(`Could not load missing songs: ${error.message}`);
      rows.push(...(data || []));
    }
    return rows;
  },
  /** Playlists, artists and playlist links are small; they are re-read whole (still paginated). */
  async fetchRelations() {
    ensureCloud();
    const [playlists, artists, links] = await Promise.all([
      fetchAllPages((first) => supabase.from('catalog_playlists').select('*', first ? { count: 'exact' } : undefined).eq('status', 'published').order('published_at', { ascending: false }).order('id'), { describe: 'published playlists' }),
      fetchAllPages((first) => supabase.from('artists').select('*', first ? { count: 'exact' } : undefined).eq('status', 'published').order('name', { ascending: true }).order('id'), { describe: 'the artist catalogue' }),
      fetchAllPages((first) => supabase.from('catalog_playlist_tracks').select('playlist_id,song_id,position', first ? { count: 'exact' } : undefined).order('playlist_id').order('position').order('song_id'), { describe: 'shared playlist contents' }),
    ]);
    return { playlists, artists, links };
  },
};

/** Full, non-cached read. Kept for callers that need a one-off snapshot; the app itself uses catalogueSync. */
export async function loadPublishedCatalogue() {
  const [songRows, relations] = await Promise.all([catalogueApi.fetchSongs(), catalogueApi.fetchRelations()]);
  const publicTracks = songRows.map(rowToTrack);
  const uiTrackIdBySongId = new Map(publicTracks.map((track) => [track.cloudSongId, track.id]));
  const publishedIds = new Set(relations.playlists.map((playlist) => playlist.id));
  const tracksByPlaylist = new Map();
  relations.links.forEach((link) => {
    const uiTrackId = uiTrackIdBySongId.get(link.song_id);
    if (!uiTrackId || !publishedIds.has(link.playlist_id)) return;
    const list = tracksByPlaylist.get(link.playlist_id) || [];
    list.push({ position: link.position, id: uiTrackId });
    tracksByPlaylist.set(link.playlist_id, list);
  });
  const playlists = relations.playlists.map((row) => playlistRowToUi(row, new Map([[row.id, (tracksByPlaylist.get(row.id) || []).sort((a, b) => a.position - b.position).map((item) => item.id)]])));
  return { tracks: publicTracks, playlists, artists: relations.artists.map(artistRowToUi) };
}

function safeFileName(name, fallback = 'artwork') {
  return String(name || fallback).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120) || fallback;
}

async function uploadArtwork(file, path) {
  if (!file) return null;
  if (!String(file.type || '').startsWith('image/')) throw new Error('Choose a valid image file for artwork.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Artwork images must be 10 MB or smaller.');
  const bucket = supabase.storage.from(SURDHARA_ARTWORK_BUCKET);
  const { error } = await bucket.upload(path, file, { upsert: true, cacheControl: '31536000', contentType: file.type });
  if (error) throw new Error(`Could not upload artwork: ${error.message}. Run the Phase 3 SQL setup if the artwork bucket is missing.`);
  const { data } = bucket.getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('The artwork upload completed, but a public URL could not be created.');
  return data.publicUrl;
}

export async function updatePublishedSongMetadata(track, userId, { coverFile = null } = {}) {
  ensureCloud();
  ensureAdmin(userId);
  if (!track?.cloudSongId) {
    const saved = await upsertYoutubeSongs(track?.youtubeId ? [track] : [], userId);
    return saved[0] || null;
  }

  let workingTrack = { ...track };
  if (coverFile) {
    const imagePath = `${userId}/songs/${track.cloudSongId}/${safeFileName(coverFile.name, 'song-artwork')}`;
    workingTrack.cover = await uploadArtwork(coverFile, imagePath);
  }
  const row = songToRow(workingTrack, { userId, id: track.cloudSongId, audioPath: track.audioPath });
  const { id: _id, created_by: _createdBy, published_at: _publishedAt, ...changes } = row;
  const { data, error } = await supabase.from('songs').update(changes).eq('id', track.cloudSongId).select('*').single();
  if (error) throw new Error(`Could not update song metadata in the cloud database: ${error.message}`);
  return rowToTrack(data);
}

export async function deletePublishedSong(track, userId) {
  ensureCloud();
  ensureAdmin(userId);
  if (!track?.cloudSongId) throw new Error('This song is not a cloud catalogue record.');
  const audioPath = track.audioPath || '';
  const { error } = await supabase.from('songs').delete().eq('id', track.cloudSongId);
  if (error) throw new Error(`Could not delete the song from SURDHARA: ${error.message}`);
  if (audioPath) {
    const { error: storageError } = await supabase.storage.from(SURDHARA_AUDIO_BUCKET).remove([audioPath]);
    if (storageError) throw new Error(`The song was removed from the catalogue, but its audio file could not be removed from storage: ${storageError.message}`);
  }
  return track.cloudSongId;
}

function artistSlugFromName(name) {
  // Preserve non-Latin names (e.g. Bengali) so unrelated singers do not all collide as 'artist'.
  return String(name || '').normalize('NFKC').toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'artist';
}

export function artistRowToUi(row) {
  return {
    id: artistSlugFromName(row.name),
    cloudArtistId: row.id,
    slug: row.slug,
    name: row.name || '',
    bio: row.bio || '',
    image: row.photo_url || '',
    photoUrl: row.photo_url || '',
    isCloudManaged: true,
  };
}

export async function upsertPublishedArtist({ name, bio = '', photoUrl = '', photoFile = null, cloudArtistId = '', userId }) {
  ensureCloud();
  ensureAdmin(userId);
  const safeName = String(name || '').trim().slice(0, 200);
  if (!safeName) throw new Error('Artist name is required.');
  let finalPhotoUrl = photoUrl || null;
  const slug = artistSlugFromName(safeName);
  if (photoFile) {
    finalPhotoUrl = await uploadArtwork(photoFile, `${userId}/artists/${slug}/${safeFileName(photoFile.name, 'artist-photo')}`);
  }
  const profile = { slug, name: safeName, bio: String(bio || '').trim().slice(0, 10000), photo_url: finalPhotoUrl, status: 'published', updated_at: new Date().toISOString() };
  // Update by primary key when an existing artist is renamed; upsert-on-slug alone
  // would conflict with the row's old UUID after its slug changes.
  const result = cloudArtistId
    ? await supabase.from('artists').update(profile).eq('id', cloudArtistId).select('*').single()
    : await supabase.from('artists').upsert({ ...profile, created_by: userId }, { onConflict: 'slug' }).select('*').single();
  const { data, error } = result;
  if (error) throw new Error(`Could not save artist information: ${error.message}`);
  return artistRowToUi(data);
}

export async function deletePublishedArtist(artist, userId) {
  ensureCloud();
  ensureAdmin(userId);
  if (!artist?.cloudArtistId) throw new Error('This artist does not have a saved cloud profile yet.');
  const { error } = await supabase.from('artists').delete().eq('id', artist.cloudArtistId);
  if (error) throw new Error(`Could not delete artist profile: ${error.message}`);
  return artist.cloudArtistId;
}

export async function updatePublishedPlaylist(playlist, userId, { coverFile = null } = {}) {
  ensureCloud();
  ensureAdmin(userId);
  if (!playlist?.cloudPlaylistId) throw new Error('This playlist is not a shared cloud playlist.');
  let coverUrl = playlist.cover || null;
  if (coverFile) coverUrl = await uploadArtwork(coverFile, `${userId}/playlists/${playlist.cloudPlaylistId}/${safeFileName(coverFile.name, 'playlist-cover')}`);
  const { data, error } = await supabase.from('catalog_playlists').update({
    title: String(playlist.title || '').trim().slice(0, 250),
    description: String(playlist.description || '').trim().slice(0, 2000),
    cover_url: coverUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', playlist.cloudPlaylistId).select('*').single();
  if (error) throw new Error(`Could not update the published playlist: ${error.message}`);
  return playlistRowToUi(data, new Map([[data.id, playlist.trackIds || []]]));
}

export async function deletePublishedPlaylist(playlist, userId) {
  ensureCloud();
  ensureAdmin(userId);
  if (!playlist?.cloudPlaylistId) throw new Error('This playlist is not a shared cloud playlist.');
  const { error } = await supabase.from('catalog_playlists').delete().eq('id', playlist.cloudPlaylistId);
  if (error) throw new Error(`Could not delete the published playlist: ${error.message}`);
  return playlist.cloudPlaylistId;
}

const EMPTY_USER_LIBRARY = Object.freeze({ favorites: [], recent: [], customPlaylists: [], playlistOverrides: {}, playlistRemovals: {} });

export async function loadUserLibrary(userId) {
  ensureCloud();
  if (!userId) return { ...EMPTY_USER_LIBRARY };
  const { data, error } = await supabase.from('user_library_state').select('favorites,recently_played,custom_playlists,playlist_overrides,playlist_removals').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not load your personal music library: ${error.message}. Run the Phase 3 SQL setup.`);
  if (!data) return { ...EMPTY_USER_LIBRARY };
  return {
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    recent: Array.isArray(data.recently_played) ? data.recently_played : [],
    customPlaylists: Array.isArray(data.custom_playlists) ? data.custom_playlists : [],
    playlistOverrides: data.playlist_overrides && typeof data.playlist_overrides === 'object' && !Array.isArray(data.playlist_overrides) ? data.playlist_overrides : {},
    playlistRemovals: data.playlist_removals && typeof data.playlist_removals === 'object' && !Array.isArray(data.playlist_removals) ? data.playlist_removals : {},
  };
}

export async function saveUserLibrary(userId, state) {
  ensureCloud();
  if (!userId) throw new Error('Sign in to save your personal music library.');
  const row = {
    user_id: userId,
    favorites: Array.isArray(state.favorites) ? [...new Set(state.favorites.map(String))].slice(0, 10000) : [],
    recently_played: Array.isArray(state.recent) ? [...new Set(state.recent.map(String))].slice(0, 200) : [],
    custom_playlists: Array.isArray(state.customPlaylists) ? state.customPlaylists.slice(0, 500) : [],
    playlist_overrides: state.playlistOverrides && typeof state.playlistOverrides === 'object' ? state.playlistOverrides : {},
    playlist_removals: state.playlistRemovals && typeof state.playlistRemovals === 'object' ? state.playlistRemovals : {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('user_library_state').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not save your personal music library: ${error.message}`);
}
