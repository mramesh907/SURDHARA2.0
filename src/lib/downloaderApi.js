// Client for the SURDHARA companion server (app.py) that downloads YouTube audio as M4A into
// <your Downloads folder>/Surdhara and serves those songs back to the website.

function resolveBase() {
  const configured = import.meta.env?.VITE_DOWNLOADER_URL;
  if (typeof configured === 'string' && configured.trim()) return configured.trim().replace(/\/+$/, '');
  // When the website itself is served by app.py (http://localhost:5000) the API is on the same origin.
  if (typeof window !== 'undefined' && window.location.port === '5000' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return '';
  return 'http://localhost:5000';
}

export const DOWNLOADER_BASE = resolveBase();
export const SERVER_START_COMMAND = 'python app.py';

const DEFAULT_COVER = '/local-audio-cover.svg';

async function request(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DOWNLOADER_BASE}${path}`, { ...options, signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON error body */ }
    if (!response.ok) throw Object.assign(new Error(body?.message || `The SURDHARA server answered ${response.status}.`), { status: response.status });
    return body;
  } catch (error) {
    if (error?.status) throw error;
    throw Object.assign(new Error('The SURDHARA server is not reachable.'), { unreachable: true });
  } finally {
    window.clearTimeout(timer);
  }
}

export const checkServer = () => request('/api/surdhara/health', {}, 4000);
export const fetchDeviceSongs = () => request('/api/surdhara/songs');
export const listDownloadJobs = () => request('/api/surdhara/jobs');
export const getDownloadJob = (id) => request(`/api/surdhara/jobs/${encodeURIComponent(id)}`);
export const deleteDeviceSong = (filename) => request(`/api/surdhara/songs/${encodeURIComponent(filename)}`, { method: 'DELETE' });

export function startYouTubeDownload(url) {
  return request('/api/surdhara/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

/** Turns a song from the server into a SURDHARA track the existing player / lists already understand. */
export function songToTrack(song) {
  const artist = song.artist || '';
  return {
    id: `dl-${song.id}`,
    localAudioId: `dl-${song.id}`,
    title: song.title,
    artist,
    artistNames: artist ? [artist] : [],
    artistIds: [],
    vocalArtistNames: [],
    album: '',
    movie: '',
    year: null,
    genre: 'Unclassified',
    language: 'Unknown',
    mood: 'all',
    tags: ['YouTube download'],
    description: song.sourceUrl ? `Downloaded from ${song.sourceUrl}` : 'Saved in your Downloads/Surdhara folder.',
    cover: song.thumbnail || DEFAULT_COVER,
    audioUrl: `${DOWNLOADER_BASE}${song.streamUrl}`,
    sourceType: 'local',
    importedFromYouTube: false,
    deviceDownload: true,          // lives in Downloads/Surdhara on this computer
    deviceFileName: song.filename,
    fileExtension: song.extension || 'm4a',
    sourceUrl: song.sourceUrl || '',
    localFileSize: song.size,
    durationSeconds: Number(song.duration) || 0,
    importedAt: song.addedAt,
    metadataStatus: 'device-download',
    metadataSources: ['Downloads/Surdhara'],
  };
}
