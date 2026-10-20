import { enrichTrackMetadata, enrichTrackListMetadata } from './musicMetadata.js';
import { extractYouTubeMusicMetadata } from './youtubeSourceMetadata.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export function parseYouTubeInput(input) {
  const lines = String(input || '').split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
  return lines.map((raw) => {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'].includes(host)) return { raw, type: 'invalid', reason: 'Unsupported URL' };
      const listId = url.searchParams.get('list');
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (listId) {
        return { raw, type: 'playlist', id: listId };
      }

      // YouTube channel ID
      if (pathParts[0] === 'channel' && pathParts[1]) {
        return {
          raw,
          type: 'channel',
          id: pathParts[1],
          channelType: 'id',
        };
      }

      // YouTube handle: youtube.com/@channelname
      if (pathParts[0]?.startsWith('@')) {
        return {
          raw,
          type: 'channel',
          id: pathParts[0].slice(1),
          channelType: 'handle',
        };
      }

      // Legacy username: youtube.com/user/username
      if (pathParts[0] === 'user' && pathParts[1]) {
        return {
          raw,
          type: 'channel',
          id: pathParts[1],
          channelType: 'username',
        };
      }
      const videoId = host === 'youtu.be'
        ? pathParts[0]
        : (url.searchParams.get('v') || (['shorts', 'embed', 'live', 'v'].includes(pathParts[0]) ? pathParts[1] : ''));
      if (listId) return { raw, type: 'playlist', id: listId };
      if (videoId) return { raw, type: 'video', id: videoId };
      return { raw, type: 'invalid', reason: 'No video or playlist ID found' };
    } catch {
      return { raw, type: 'invalid', reason: 'Invalid URL' };
    }
  });
}

function bestThumbnail(thumbnails, fallbackVideoId) {
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    if (thumbnails?.[size]?.url) return thumbnails[size].url;
  }
  return fallbackVideoId ? `https://i.ytimg.com/vi/${fallbackVideoId}/hqdefault.jpg` : '';
}

function formatDuration(isoDuration = '') {
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return '';
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  if (!total) return '';
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

function durationSeconds(isoDuration = '') {
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

async function apiGet(resource, params, apiKey) {
  const url = new URL(`${API_BASE}/${resource}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  let response;
  try { response = await fetch(url.toString()); } catch { throw new Error('Could not connect to the YouTube Data API. Check your internet connection and try again.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const message = body?.error?.message || '';
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === 'keyInvalid' || /API key not valid|invalid API key/i.test(message)) throw new Error('The API key was rejected. Check the key and make sure YouTube Data API v3 is enabled.');
    if (response.status === 403 && /quota/i.test(message)) throw new Error('The YouTube API quota has been reached. Try again after the quota resets.');
    if (response.status === 403) throw new Error('YouTube denied this request. Check the API key restrictions and access permissions.');
    throw new Error(message || `YouTube API request failed (${response.status}).`);
  }
  return body;
}

function normalizeTrack(video, fallback = {}) {
  const snippet = video?.snippet || {};
  const content = video?.contentDetails || {};
  const status = video?.status || {};
  const statistics = video?.statistics || {};
  const videoId = video?.id || fallback.videoId;
  const channelName = snippet.channelTitle || fallback.channelTitle || fallback.channelName || 'Unknown channel';
  const isoDuration = content.duration || fallback.duration || '';
  const youtubeTitle = snippet.title || fallback.title || 'Untitled track';
  const youtubeSourceMetadata = extractYouTubeMusicMetadata({
    title: youtubeTitle, description: snippet.description || fallback.description || '',
    tags: snippet.tags || fallback.tags || [], channelTitle: channelName,
    publishedAt: snippet.publishedAt || fallback.publishedAt || '',
  });
  return {
    id: `yt-${videoId}`,
    youtubeId: videoId,
    // youtubeTitle is retained only as a lookup clue/source label, not canonical music metadata.
    youtubeTitle,
    sourceVideoTitle: youtubeTitle,
    title: youtubeTitle,
    youtubeChannel: channelName,
    youtubeChannelId: snippet.channelId || fallback.channelId || '',
    artist: youtubeSourceMetadata.vocalArtistNames.join(' & '),
    artistNames: [...youtubeSourceMetadata.vocalArtistNames],
    artistIds: [],
    vocalArtistNames: [...youtubeSourceMetadata.vocalArtistNames],
    originalSingerNames: [...youtubeSourceMetadata.originalSingerNames],
    originalSinger: youtubeSourceMetadata.originalSingerNames.join(' & '),
    isCover: null,
    coverStatus: youtubeSourceMetadata.coverIndicators.length ? 'cover-indicated' : 'unknown',
    coverConfidence: youtubeSourceMetadata.coverIndicators.length ? 76 : 0,
    coverEvidence: [...youtubeSourceMetadata.coverIndicators],
    artistCreditRole: youtubeSourceMetadata.vocalArtistNames.length ? 'vocalist' : '',
    vocalArtistSource: youtubeSourceMetadata.vocalArtistNames.length ? 'Explicit YouTube description credit' : '',
    creditedArtist: youtubeSourceMetadata.creditedArtist || '',
    youtubeSourceMetadata,
    youtubeTags: Array.isArray(snippet.tags || fallback.tags) ? (snippet.tags || fallback.tags).slice(0, 30) : [],
    // Raw descriptions are parsed for explicitly labelled credits, not copied into visible metadata.
    description: '',
    tags: [...youtubeSourceMetadata.searchTerms],
    youtubeCategoryId: snippet.categoryId || fallback.categoryId || '',
    youtubePublishedAt: snippet.publishedAt || fallback.publishedAt || '',
    importedAt: new Date().toISOString(),
    duration: formatDuration(isoDuration),
    durationSeconds: durationSeconds(isoDuration),
    cover: bestThumbnail(snippet.thumbnails || fallback.thumbnails, videoId),
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    language: 'Unknown',
    languageSource: '',
    year: youtubeSourceMetadata.releaseYear || null,
    releaseDate: youtubeSourceMetadata.releaseDate || '',
    metadataReleaseDate: youtubeSourceMetadata.releaseDate || '',
    album: youtubeSourceMetadata.album || '',
    movie: youtubeSourceMetadata.movie || '',
    musicDirector: youtubeSourceMetadata.musicDirector || '',
    composer: youtubeSourceMetadata.composer || '',
    lyricist: youtubeSourceMetadata.lyricist || '',
    producer: youtubeSourceMetadata.producer || '',
    label: youtubeSourceMetadata.label || '',
    genre: 'Unclassified',
    mood: 'all',
    viewCount: Number(statistics.viewCount || 0) || null,
    videoDefinition: content.definition || '',
    captionsAvailable: content.caption === 'true',
    embeddable: typeof status.embeddable === 'boolean' ? status.embeddable : true,
    metadataSources: [],
    metadataStatus: 'pending',
    metadataConfidence: 0,
    importedFromYouTube: true,
  };
}

function looksLikeNonMusicVideo(video) {
  const title = String(video?.snippet?.title || '').toLowerCase();

  const blockedTerms = [
    'vlog',
    'daily vlog',
    'interview',
    'interviews',
    'podcast',
    'trailer',
    'teaser',
    'behind the scenes',
    'behind-the-scenes',
    'making of',
    'press conference',
    'live stream',
    'livestream',
    'web series',
    'episode',
    'ep.',
    'short film',
    'documentary',
    'reaction',
    'review',
    'news',
    'news update',
    'announcement',
    'roast',
    'comedy',
    'standup',
    'stand-up',
    'talk show',
    'conversation',
  ];

  return blockedTerms.some((term) => title.includes(term));
}

function looksLikeShort(video) {
  const duration = durationSeconds(video?.contentDetails?.duration || '');

  // Shorts are normally very short.
  // We intentionally reject videos <= 60 seconds here.
  return duration > 0 && duration <= 60;
}

function looksLikeMusicCandidate(video) {
  if (!video) return false;

  const title = String(video?.snippet?.title || '').trim();

  if (!title) return false;

  // Never import obvious non-song content.
  if (looksLikeNonMusicVideo(video)) {
    return false;
  }

  // Never import Shorts as songs.
  if (looksLikeShort(video)) {
    return false;
  }

  const categoryId = String(video?.snippet?.categoryId || '');

  // YouTube Music category.
  if (categoryId === '10') {
    return true;
  }

  const musicTerms = [
    'official audio',
    'official song',
    'official music',
    'music video',
    'lyrics',
    'lyric video',
    'audio',
    'song',
    'jukebox',
    'full song',
    'full audio',
    'original soundtrack',
    'ost',
    'soundtrack',
    'music',
  ];

  return musicTerms.some((term) => title.toLowerCase().includes(term));
}


async function fetchVideoDetails(videoIds, apiKey, onProgress = () => {}) {
  const ids = [...new Set(videoIds.filter(Boolean))];
  const result = new Map();
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    onProgress(`Loading video details (${Math.min(index + chunk.length, ids.length)} of ${ids.length})…`);
    const response = await apiGet('videos', { part: 'snippet,contentDetails,status,statistics', id: chunk.join(','), maxResults: 50 }, apiKey);
    (response.items || []).forEach((video) => result.set(video.id, video));
  }
  return result;
}

/** Refresh source-level metadata from the YouTube Data API without replacing verified music-catalogue fields. */
export async function refreshYouTubeSourceMetadata(tracks, apiKey, onProgress = () => {}) {
  const list = Array.isArray(tracks) ? tracks : [];
  const ids = [...new Set(list.map((track) => track.youtubeId).filter(Boolean))];
  if (!apiKey?.trim() || !ids.length) return list;
  const details = await fetchVideoDetails(ids, apiKey, onProgress);
  return list.map((track) => {
    const video = details.get(track.youtubeId);
    if (!video) return track;
    const snippet = video.snippet || {};
    const youtubeSourceMetadata = extractYouTubeMusicMetadata({
      title: snippet.title || track.youtubeTitle || track.title,
      description: snippet.description || '',
      tags: snippet.tags || [],
      channelTitle: snippet.channelTitle || track.youtubeChannel || '',
      publishedAt: snippet.publishedAt || track.youtubePublishedAt || '',
    });
    const verifiedStoredVocalists = track.vocalArtistSource === 'MusicBrainz recording vocal relationship'
      ? (track.vocalArtistNames || [])
      : [];
    // Fresh, section-aware YouTube credits describe the recording that is actually being played.
    // They must win over an older catalogue match that may point to the original recording.
    const refreshedVocalArtistNames = youtubeSourceMetadata.vocalArtistNames.length
      ? [...new Set(youtubeSourceMetadata.vocalArtistNames)]
      : [...new Set(verifiedStoredVocalists)];
    return {
      ...track,
      youtubeTitle: snippet.title || track.youtubeTitle,
      sourceVideoTitle: snippet.title || track.sourceVideoTitle || track.youtubeTitle,
      youtubeChannel: snippet.channelTitle || track.youtubeChannel,
      youtubeChannelId: snippet.channelId || track.youtubeChannelId || '',
      youtubePublishedAt: snippet.publishedAt || track.youtubePublishedAt || '',
      youtubeTags: Array.isArray(snippet.tags) ? snippet.tags.slice(0, 30) : (track.youtubeTags || []),
      youtubeSourceMetadata,
      tags: [...new Set([...(track.tags || []), ...youtubeSourceMetadata.searchTerms])].slice(0, 50),
      // Rebuild source-derived singer credits from the freshly fetched description so an old
      // "Original Singer" field cannot remain incorrectly attached to the current recording.
      vocalArtistNames: refreshedVocalArtistNames,
      originalSingerNames: youtubeSourceMetadata.originalSingerNames,
      originalSinger: youtubeSourceMetadata.originalSingerNames.join(' & '),
      artistCreditRole: refreshedVocalArtistNames.length ? 'vocalist' : '',
      vocalArtistSource: youtubeSourceMetadata.vocalArtistNames.length
        ? 'Explicit YouTube description credit'
        : (verifiedStoredVocalists.length ? 'MusicBrainz recording vocal relationship' : ''),
      creditedArtist: track.creditedArtist || youtubeSourceMetadata.creditedArtist || '',
      lyricist: track.lyricist || youtubeSourceMetadata.lyricist || '',
      musicDirector: track.musicDirector || youtubeSourceMetadata.musicDirector || '',
      composer: track.composer || youtubeSourceMetadata.composer || '',
      producer: track.producer || youtubeSourceMetadata.producer || '',
      movie: track.movie || youtubeSourceMetadata.movie || '',
      album: track.album || youtubeSourceMetadata.album || '',
      label: track.label || youtubeSourceMetadata.label || '',
      releaseDate: track.releaseDate || youtubeSourceMetadata.releaseDate || '',
      metadataReleaseDate: track.metadataReleaseDate || youtubeSourceMetadata.releaseDate || '',
      year: track.year || youtubeSourceMetadata.releaseYear || null,
      description: '',
    };
  });
}

export async function importYouTubeVideo(videoId, apiKey, onProgress = () => {}) {
  onProgress('Reading song details…');
  const response = await apiGet('videos', { part: 'snippet,contentDetails,status,statistics', id: videoId, maxResults: 1 }, apiKey);
  const video = response.items?.[0];
  if (!video) throw new Error('The YouTube video was not found or is not accessible.');
  const title = video.snippet?.title || '';
  if (/^(private video|deleted video)$/i.test(title.trim())) throw new Error('This YouTube video is unavailable.');
  return enrichTrackMetadata(normalizeTrack(video), onProgress);
}

export async function importYouTubePlaylist(input, apiKey, onProgress = () => {}) {
  const parsed = parseYouTubeInput(input).find((item) => item.type === 'playlist');
  if (!parsed) throw new Error('No valid YouTube playlist link was found.');
  const playlistId = parsed.id;
  onProgress('Reading playlist details…');
  const playlistResponse = await apiGet('playlists', { part: 'snippet,contentDetails', id: playlistId, maxResults: 1 }, apiKey);
  const playlistItem = playlistResponse.items?.[0];
  if (!playlistItem) throw new Error('The playlist was not found or is not accessible.');
  const snippet = playlistItem.snippet || {};
  const rawItems = [];
  let pageToken = '';
  do {
    const response = await apiGet('playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: 50, pageToken }, apiKey);
    rawItems.push(...(response.items || []));
    pageToken = response.nextPageToken || '';
    onProgress(`Loading playlist tracks (${rawItems.length})…`);
  } while (pageToken);
  const videoIds = [...new Set(rawItems.map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId).filter(Boolean))];
  if (!videoIds.length) throw new Error('The playlist contains no accessible videos.');
  const details = await fetchVideoDetails(videoIds, apiKey, onProgress);
  const tracks = [];
  const seen = new Set();
  for (const item of rawItems) {
    const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    const video = details.get(videoId);
    if (!video || /^(private video|deleted video)$/i.test((video.snippet?.title || '').trim())) continue;
    tracks.push(normalizeTrack(video, item.snippet));
  }
  if (!tracks.length) throw new Error('No playable public videos were found in this playlist.');
  const enrichedTracks = await enrichTrackListMetadata(tracks, onProgress);
  return {
    playlistId,
    playlist: {
      youtubePlaylistId: playlistId,
      title: snippet.title || 'Imported YouTube Playlist',
      subtitle: 'Imported from YouTube',
      // Playlist description describes the list itself; it is never used as song metadata.
      description: 'Tracks imported from this YouTube playlist. Song details are checked against music catalogues where possible.',
      cover: bestThumbnail(snippet.thumbnails, '') || enrichedTracks[0]?.cover || '',
      sourceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      isYouTubeImport: true,
    },
    tracks: enrichedTracks,
  };
}

export async function importYouTubeChannel(
  entry,
  apiKey,
  onProgress = () => {}
) {
  onProgress('Reading YouTube channel…');

  const params = {
    part: 'snippet,contentDetails',
    maxResults: 1,
  };

  if (entry.channelType === 'id') {
    params.id = entry.id;
  } else if (entry.channelType === 'handle') {
    params.forHandle = entry.id;
  } else if (entry.channelType === 'username') {
    params.forUsername = entry.id;
  } else {
    throw new Error('Unsupported YouTube channel link.');
  }

  const channelResponse = await apiGet(
    'channels',
    params,
    apiKey
  );

  const channel = channelResponse.items?.[0];

  if (!channel) {
    throw new Error(
      'The YouTube channel was not found or is not accessible.'
    );
  }

  const uploadsPlaylistId =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error(
      'Could not find the uploaded videos for this channel.'
    );
  }

  const rawItems = [];
  let pageToken = '';

  // Read every page of the channel uploads
  do {
    const response = await apiGet(
      'playlistItems',
      {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken,
      },
      apiKey
    );

    rawItems.push(...(response.items || []));

    pageToken = response.nextPageToken || '';

    onProgress(
      `Reading channel videos (${rawItems.length})…`
    );
  } while (pageToken);

  const videoIds = [
    ...new Set(
      rawItems
        .map(
          (item) =>
            item.contentDetails?.videoId ||
            item.snippet?.resourceId?.videoId
        )
        .filter(Boolean)
    ),
  ];

  if (!videoIds.length) {
    throw new Error(
      'No accessible videos were found in this channel.'
    );
  }

  // Get full metadata for all videos
  const details = await fetchVideoDetails(
    videoIds,
    apiKey,
    onProgress
  );

  const candidateVideos = [];

  for (const item of rawItems) {
    const videoId =
      item.contentDetails?.videoId ||
      item.snippet?.resourceId?.videoId;

    if (!videoId) continue;

    const video = details.get(videoId);

    if (!video) continue;

    const title = video.snippet?.title || '';

    // Skip deleted/private videos
    if (
      /^(private video|deleted video)$/i.test(
        title.trim()
      )
    ) {
      continue;
    }

    // First-level music filtering
    if (!looksLikeMusicCandidate(video)) {
      continue;
    }

    candidateVideos.push(video);
  }

  if (!candidateVideos.length) {
    throw new Error(
      'No likely individual music videos were found in this channel.'
    );
  }

  onProgress(
    `Checking ${candidateVideos.length} possible songs against music catalogues…`
  );

  const normalizedTracks = candidateVideos.map((video) =>
    normalizeTrack(video, {
      channelTitle: channel.snippet?.title,
      channelId: channel.id,
    })
  );

  // IMPORTANT:
  // Independent music metadata is used to verify whether
  // the YouTube video is actually a song.
  const enrichedTracks =
    await enrichTrackListMetadata(
      normalizedTracks,
      onProgress
    );

  /*
   * Second-level filtering.
   *
   * A video is accepted when:
   * 1. Independent music metadata matched it, OR
   * 2. YouTube itself categorised it as Music.
   *
   * This prevents most vlogs, interviews, trailers,
   * podcasts and random channel videos from entering
   * the music library.
   */
  const musicTracks = enrichedTracks.filter((track) => {
    const matched =
      track.metadataStatus === 'matched' ||
      track.metadataStatus === 'cross-checked';

    const youtubeMusicCategory =
      String(
        candidateVideos.find(
          (video) => video.id === track.youtubeId
        )?.snippet?.categoryId || ''
      ) === '10';

    return matched || youtubeMusicCategory;
  });

  if (!musicTracks.length) {
    throw new Error(
      'The channel was scanned, but no videos could be confidently identified as individual songs.'
    );
  }

  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title || '',
    tracks: musicTracks,
  };
}

export async function importYouTubeInputs(input, apiKey, existingVideoIds = new Set(), onProgress = () => {}) {
  if (!apiKey?.trim()) throw new Error('Enter a YouTube Data API key to import content.');
  const entries = parseYouTubeInput(input);
  if (!entries.length) throw new Error('Paste at least one YouTube video or playlist link.');
  const invalid = entries.filter((entry) => entry.type === 'invalid').map((entry) => ({ raw: entry.raw, reason: entry.reason }));
  const videos = entries.filter((entry) => entry.type === 'video');
  const playlists = entries.filter((entry) => entry.type === 'playlist');
  const channels = entries.filter((entry) => entry.type === 'channel');
  const importedTracks = [];
  const importedPlaylists = [];
  const skippedDuplicates = [];
  const failures = [...invalid];
  const seenVideoIds = new Set(existingVideoIds);
  let processed = invalid.length;

  const addTrack = (track) => {
    if (!track?.youtubeId) return;
    if (seenVideoIds.has(track.youtubeId)) { skippedDuplicates.push(track.title); return; }
    seenVideoIds.add(track.youtubeId);
    importedTracks.push(track);
  };

  for (const entry of videos) {
    try {
      onProgress(`Importing song ${processed + 1} of ${entries.length}…`);
      addTrack(await importYouTubeVideo(entry.id, apiKey.trim(), onProgress));
    } catch (error) {
      failures.push({ raw: entry.raw, reason: error instanceof Error ? error.message : 'Import failed' });
    }
    processed += 1;
  }

  for (const entry of playlists) {
    try {
      onProgress(`Importing playlist ${processed + 1} of ${entries.length}…`);
      const response = await importYouTubePlaylist(entry.raw, apiKey.trim(), onProgress);
      const trackIds = [];
      response.tracks.forEach((track) => {
        const alreadyExists = seenVideoIds.has(track.youtubeId);
        if (!alreadyExists) addTrack(track);
        else skippedDuplicates.push(track.title);
        const existing = `yt-${track.youtubeId}`;
        trackIds.push(existing);
      });
      importedPlaylists.push({ ...response.playlist, id: `ytpl-${response.playlistId}`, trackIds, isCustom: false });
    } catch (error) {
      failures.push({ raw: entry.raw, reason: error instanceof Error ? error.message : 'Import failed' });
    }
    processed += 1;
  }

  for (const entry of channels) {
  try {
    onProgress(
      `Importing channel ${processed + 1} of ${entries.length}…`
    );

    const response = await importYouTubeChannel(
      entry,
      apiKey.trim(),
      onProgress
    );

    response.tracks.forEach(addTrack);
  } catch (error) {
    failures.push({
      raw: entry.raw,
      reason:
        error instanceof Error
          ? error.message
          : 'Channel import failed',
    });
  }

  processed += 1;
}

  return { tracks: importedTracks, playlists: importedPlaylists, failures, skippedDuplicates };
}
