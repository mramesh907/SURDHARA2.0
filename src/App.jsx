import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, AudioLines, BadgeCheck, Check, ChevronRight, Clock3, Compass, Disc3,
  Heart, Languages, LibraryBig, ListMusic, MicVocal, Music2, Play, Plus, Sparkles, TrendingUp,
  X, Youtube, Search, Trash2, ListPlus, Info, Share2, ShieldCheck, DownloadCloud, CloudOff, FolderDown, RefreshCw,
} from 'lucide-react';
import { artists, moods, playlists, tracks } from './data/catalog.js';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import PlaylistCard from './components/PlaylistCard.jsx';
import TrackRow from './components/TrackRow.jsx';
import PlayerDock from './components/PlayerDock.jsx';
import UnifiedAudioPlayer from './components/UnifiedAudioPlayer.jsx';
import MobileNav from './components/MobileNav.jsx';
import ImportSongsPage from './components/ImportSongsPage.jsx';
import AdminCatalogManager from './components/AdminCatalogManager.jsx';
import ProfileAuthModal from './components/ProfileAuthModal.jsx';
import SongDownloader from './components/SongDownloader.jsx';
import { checkServer, deleteDeviceSong, fetchDeviceSongs, songToTrack } from './lib/downloaderApi.js';
import { getAccountRole, isSupabaseConfigured, supabase } from './lib/supabaseClient.js';
import { getMusicLookupTitle, mergeVerifiedMetadata } from './lib/musicMetadata.js';
import { artistSlug, getTrackArtistNames, normalizeArtistKey, normalizeTrackArtistCredits } from './lib/artistCredits.js';
import { resolveArtistPhoto } from './lib/artistPhotos.js';
import { matchesIndexedSearch, matchesSearch, searchTerms } from './lib/searchUtils.js';
import { globalPlaylistDefinitions, trackMatchesGlobalPlaylist } from './data/globalPlaylists.js';
import { getStoredLocalAudioFile, restoreLocalAudioTracks } from './lib/localAudioStorage.js';
import {
  deletePublishedArtist, deletePublishedPlaylist, deletePublishedSong,
  loadUserLibrary, publishLocalImport, publishYouTubeImport, saveUserLibrary,
  updatePublishedPlaylist, updatePublishedSongMetadata, upsertPublishedArtist,
} from './lib/cloudMusic.js';
import { createCatalogueSync } from './lib/catalogueSync.js';
import { backoffDelay, isNetworkError } from './lib/network.js';
import { useNetworkStatus } from './lib/useNetworkStatus.js';
import { clearLibraryMirrorIfClean, readLibraryMirror, serializeLibrary, writeLibraryMirror } from './lib/libraryMirror.js';
import {
  initOfflineAudio, isSavedOffline, removeAudioOffline, saveAudioOffline, clearAllOfflineAudio, normalizeAudioUrl,
} from './lib/offlineAudio.js';
import { useOfflineAudio } from './lib/useOfflineAudio.js';
import { useMediaSession } from './lib/useMediaSession.js';
import { useBackgroundPlayback } from './lib/useBackgroundPlayback.js';
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts.js';
import { useInstallPrompt } from './lib/useInstallPrompt.js';
import { applyServiceWorkerUpdate, registerServiceWorker } from './lib/pwa.js';
import NetworkBanner from './components/NetworkBanner.jsx';
import ShortcutsModal from './components/ShortcutsModal.jsx';

const FAVORITES_KEY = 'SURDHARA-en-favorites-v1';
const RECENT_KEY = 'SURDHARA-en-recent-v1';
const CUSTOM_PLAYLISTS_KEY = 'SURDHARA-en-custom-playlists-v1';
const PLAYLIST_OVERRIDES_KEY = 'SURDHARA-en-playlist-overrides-v1';
const IMPORTED_TRACKS_KEY = 'SURDHARA-en-youtube-tracks-v1';
const YOUTUBE_PLAYLISTS_KEY = 'SURDHARA-en-youtube-playlists-v1';
const PLAYLIST_REMOVALS_KEY = 'SURDHARA-en-playlist-removals-v1';
const THEME_KEY = 'SURDHARA-theme-v1';
const LOCAL_TRACKS_KEY = 'SURDHARA-local-audio-tracks-v1';
const CURRENT_TRACK_KEY = 'SURDHARA-last-selected-track-v1';
const DOWNLOADER_SEEN_KEY = 'SURDHARA-downloader-seen-v1';
const EMPTY_TRACKS = Object.freeze([]);
const UNAVAILABLE_KEY = 'SURDHARA-unavailable-tracks-v1';
const UNAVAILABLE_TTL_MS = 7 * 24 * 3600 * 1000; // a removed/blocked video is retried after a week
const MAX_AUTO_SKIPS = 4;                          // stop skipping after this many failures in a row
const TRACK_PAGE_SIZE = 60;                        // rows rendered per step in long lists

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 16) return 'Good afternoon';
  if (hour >= 16 && hour < 19) return 'Good evening';
  return 'Good night';
}

function SectionTitle({ eyebrow, title, description, actionLabel = 'View all', onAction, icon: Icon }) {
  return (
    <div className="section-title-row">
      <div className="section-title-copy">
        {eyebrow && <span className="section-eyebrow">{Icon && <Icon size={13} />} {eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {onAction && <button className="section-action" onClick={onAction}>{actionLabel}<ChevronRight size={15} /></button>}
    </div>
  );
}

function EmptyState({ icon: Icon = Music2, title, text, action, onAction }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={25} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <button className="soft-action" onClick={onAction}>{action}</button>}
    </div>
  );
}

function ArtistCard({ artist, onClick }) {
  return (
    <button className="artist-card" onClick={() => onClick(artist.id)}>
      <span className="artist-image-wrap">
        {artist.image ? <img src={artist.image} alt={`${artist.name} portrait`} loading="lazy" /> : <span className="artist-photo-empty" aria-hidden="true" />}
        <span className="artist-image-play"><Play size={15} fill="currentColor" /></span>
      </span>
      <strong>{artist.name}</strong>
      <span>Artist</span>
    </button>
  );
}

function getAlbumLabel(track) {
  // Only show albums/soundtracks confirmed by music metadata; don't invent an album from the uploader channel.
  return track.album || track.movie || '';
}

function getTrackSearchFields(track = {}) {
  return [
    track.title, track.youtubeTitle, track.sourceVideoTitle, track.artist, track.creditedArtist,
    ...(track.creditedArtistNames || []), ...(track.artistNames || []), ...(track.vocalArtistNames || []),
    track.album, track.movie, track.year, track.releaseDate, track.metadataReleaseDate,
    track.lyricist, track.composer, track.musicDirector, track.producer, track.label,
    track.genre, track.language, track.youtubeChannel, track.youtubeSourceMetadata?.sourceChannel,
    ...(track.youtubeSourceMetadata?.searchTerms || []), ...(track.youtubeTags || []),
    ...(track.tags || []), ...(track.metadataSources || []),
  ].filter(Boolean);
}

function matchesFeaturedPlaylist(track, playlistId) {
  const tags = (track.tags || []).map((tag) => typeof tag === 'string' ? tag : tag?.name || '').join(' ');
  const text = `${track.genre || ''} ${tags}`.toLocaleLowerCase('en');
  const year = Number(track.year) || 0;
  switch (playlistId) {
    case 'romantic-evening': return track.mood === 'romantic' || /romantic|love song|love songs/.test(text);
    case 'timeless-classics': return track.mood === 'classic' || /classic|evergreen|oldies|retro/.test(text) || year > 0 && year < 2000;
    case 'slow-and-soft': return track.mood === 'chill' || /chill|ambient|acoustic|relax|downtempo/.test(text);
    case 'cinema-soundtrack': return Boolean(track.movie) || /soundtrack|film song|motion picture/.test(text);
    case 'melody-room': return /melody|melodic/.test(text);
    default: return false;
  }
}

function TrackSkeleton({ rows = 6 }) {
  return (
    <div className="track-table track-skeleton" aria-busy="true" aria-label="Loading songs">
      {Array.from({ length: rows }, (_, i) => <div className="track-row skeleton-row" key={i}><span className="sk sk-index" /><span className="sk sk-cover" /><span className="sk-lines"><span className="sk sk-line" /><span className="sk sk-line sk-short" /></span></div>)}
    </div>
  );
}

function TrackTable({ list, currentTrackId, isPlaying, favorites, onPlay, onToggleFavorite, playlistsList, onAddToPlaylist, onPlayNext, onAddToQueue, onGoToArtist, onGoToAlbum, onShowDetails, onShare, onDownload, onRemoveFromPlaylist, removeMode = false, removeLabel, emptyTitle = 'No tracks found', emptyText = 'Try another search or choose a different section.', action, onAction, getTrackFlags, onToggleOffline, loading = false }) {
  // Long lists render in steps (IntersectionObserver) instead of mounting thousands of rows at once.
  const [limit, setLimit] = useState(TRACK_PAGE_SIZE);
  const sentinelRef = useRef(null);
  const signature = `${list.length}:${list[0]?.id || ''}:${list[list.length - 1]?.id || ''}`;
  useEffect(() => { setLimit(TRACK_PAGE_SIZE); }, [signature]);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || limit >= list.length || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setLimit((value) => Math.min(list.length, value + TRACK_PAGE_SIZE));
    }, { rootMargin: '900px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, list.length]);

  if (!list.length) return loading ? <TrackSkeleton /> : <EmptyState icon={Music2} title={emptyTitle} text={emptyText} action={action} onAction={onAction} />;
  const visible = list.length > limit ? list.slice(0, limit) : list;
  return (
    <div className="track-table">
      <div className="track-table-heading"><span>#</span><span>Track</span><span>Album / Movie</span><span>Year</span><span aria-label="Actions"><Heart size={14} /></span></div>
      {visible.map((track, index) => (
        <TrackRow key={track.id} track={track} index={index} onPlay={onPlay} isLiked={favorites.includes(track.id)} onToggleLike={onToggleFavorite} active={currentTrackId === track.id} playing={currentTrackId === track.id && isPlaying} playlists={playlistsList} onAddToPlaylist={onAddToPlaylist} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToArtist={onGoToArtist} onGoToAlbum={onGoToAlbum} onShowDetails={onShowDetails} onShare={onShare} onDownload={onDownload} onRemoveFromPlaylist={onRemoveFromPlaylist} removeMode={removeMode} removeLabel={removeLabel} flags={getTrackFlags?.(track)} onToggleOffline={onToggleOffline} />
      ))}
      {list.length > limit && <div className="track-table-more" ref={sentinelRef}><span>Showing {limit.toLocaleString()} of {list.length.toLocaleString()}</span><button type="button" className="subtle-button" onClick={() => setLimit((value) => Math.min(list.length, value + TRACK_PAGE_SIZE * 2))}>Show more</button></div>}
    </div>
  );
}

const ROUTE_PAGES = new Set([
  'home', 'discover', 'songs', 'recently-added', 'playlists', 'importer', 'admin-catalog', 'playlist-detail',
  'artists', 'artist-detail', 'library', 'liked', 'recent', 'albums', 'languages', 'album-detail', 'offline', 'youtube-downloads',
]);

function readRouteFromLocation() {
  const fallback = { page: 'home', query: '', activeMood: 'all', selectedPlaylistId: null, selectedArtistId: null, selectedLanguage: '' };
  if (typeof window === 'undefined') return fallback;
  const historyRoute = window.history.state?.surdharaRoute;
  if (historyRoute?.page && ROUTE_PAGES.has(historyRoute.page)) return { ...fallback, ...historyRoute };
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return fallback;
  const [path, queryString = ''] = raw.split('?');
  const page = ROUTE_PAGES.has(path) ? path : 'home';
  const params = new URLSearchParams(queryString);
  return {
    page,
    query: params.get('q') || '',
    activeMood: params.get('mood') || 'all',
    selectedPlaylistId: params.get('playlist') || null,
    selectedArtistId: params.get('artist') || null,
    selectedLanguage: params.get('language') || '',
  };
}

function buildRouteHash(route) {
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.activeMood && route.activeMood !== 'all') params.set('mood', route.activeMood);
  if (route.selectedPlaylistId) params.set('playlist', route.selectedPlaylistId);
  if (route.selectedArtistId) params.set('artist', route.selectedArtistId);
  if (route.selectedLanguage) params.set('language', route.selectedLanguage);
  const queryString = params.toString();
  return `#/${route.page}${queryString ? `?${queryString}` : ''}`;
}

export default function App() {
  const legacyImportedTracksRef = useRef(null);
  const legacyYoutubePlaylistsRef = useRef(null);
  const legacyLocalTracksRef = useRef(null);
  if (legacyImportedTracksRef.current === null) legacyImportedTracksRef.current = readStorage(IMPORTED_TRACKS_KEY, []);
  if (legacyYoutubePlaylistsRef.current === null) legacyYoutubePlaylistsRef.current = readStorage(YOUTUBE_PLAYLISTS_KEY, []);
  if (legacyLocalTracksRef.current === null) legacyLocalTracksRef.current = readStorage(LOCAL_TRACKS_KEY, []);
  const initialRouteRef = useRef(null);
  if (!initialRouteRef.current) initialRouteRef.current = readRouteFromLocation();
  const initialRoute = initialRouteRef.current;
  const [page, setPage] = useState(initialRoute.page);
  const [query, setQuery] = useState(initialRoute.query);
  const [activeMood, setActiveMood] = useState(initialRoute.activeMood);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(initialRoute.selectedPlaylistId);
  const [selectedArtistId, setSelectedArtistId] = useState(initialRoute.selectedArtistId);
  const [selectedLanguage, setSelectedLanguage] = useState(initialRoute.selectedLanguage);
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  const [favorites, setFavorites] = useState(() => isSupabaseConfigured ? [] : readStorage(FAVORITES_KEY, []));
  const [recent, setRecent] = useState(() => isSupabaseConfigured ? [] : readStorage(RECENT_KEY, []));
  const [customPlaylists, setCustomPlaylists] = useState(() => isSupabaseConfigured ? [] : readStorage(CUSTOM_PLAYLISTS_KEY, []));
  const [playlistOverrides, setPlaylistOverrides] = useState(() => isSupabaseConfigured ? {} : readStorage(PLAYLIST_OVERRIDES_KEY, {}));
  const [playlistRemovals, setPlaylistRemovals] = useState(() => isSupabaseConfigured ? {} : readStorage(PLAYLIST_REMOVALS_KEY, {}));
  const [queuedTrackIds, setQueuedTrackIds] = useState([]);
  const [detailsTrack, setDetailsTrack] = useState(null);
  const [addSongsPlaylistId, setAddSongsPlaylistId] = useState(null);
  const [addSongsSearch, setAddSongsSearch] = useState('');
  const [removePlaylistSongsMode, setRemovePlaylistSongsMode] = useState(false);
  const [importedTracks, setImportedTracks] = useState(() => readStorage(IMPORTED_TRACKS_KEY, []).map((track) => {
    if (!track.importedFromYouTube) return track;
    const sourceTitle = track.youtubeTitle || track.sourceVideoTitle || track.title || 'Untitled track';
    const sourceMetadata = track.youtubeSourceMetadata || {};
    const hasBeenChecked = Boolean(track.metadataCheckedAt);
    const verifiedSingerNames = getTrackArtistNames({
      ...track,
      importedFromYouTube: true,
      vocalArtistNames: [...new Set([
        ...(Array.isArray(track.vocalArtistNames) ? track.vocalArtistNames : []),
        ...(Array.isArray(sourceMetadata.vocalArtistNames) ? sourceMetadata.vocalArtistNames : []),
      ])],
    });
    const explicitOriginalSingerNames = Array.isArray(track.originalSingerNames) && track.originalSingerNames.length
      ? track.originalSingerNames
      : (Array.isArray(sourceMetadata.originalSingerNames) ? sourceMetadata.originalSingerNames : []);
    const sourceHasMetadata = Boolean(
      sourceMetadata.songTitle || sourceMetadata.vocalArtistNames?.length || sourceMetadata.originalSingerNames?.length ||
      sourceMetadata.creditedArtist || sourceMetadata.lyricist || sourceMetadata.musicDirector || sourceMetadata.composer || sourceMetadata.movie ||
      sourceMetadata.album || sourceMetadata.releaseDate || sourceMetadata.releaseYear || sourceMetadata.label || sourceMetadata.producer || sourceMetadata.coverIndicators?.length,
    );
    const metadataSources = [...new Set([
      ...(Array.isArray(track.metadataSources) ? track.metadataSources : []),
      ...(sourceHasMetadata ? ['YouTube source metadata'] : []),
    ])];
    return normalizeTrackArtistCredits({
      ...track,
      youtubeTitle: sourceTitle,
      sourceVideoTitle: track.sourceVideoTitle || sourceTitle,
      title: hasBeenChecked ? track.title : (getMusicLookupTitle({ ...track, youtubeTitle: sourceTitle }) || sourceMetadata.songTitle || sourceTitle),
      // Keep only role-verified or explicitly labelled vocalist credits for Artist cards.
      artist: verifiedSingerNames.join(' & '),
      artistNames: verifiedSingerNames,
      artistIds: verifiedSingerNames.map(artistSlug),
      vocalArtistNames: verifiedSingerNames,
      artistCreditRole: verifiedSingerNames.length ? 'vocalist' : '',
      vocalArtistSource: track.vocalArtistSource || (sourceMetadata.vocalArtistNames?.length ? 'Explicit YouTube description credit' : ''),
      originalSingerNames: explicitOriginalSingerNames,
      originalSinger: explicitOriginalSingerNames.join(' & ') || track.originalSinger || '',
      originalSingerSource: track.originalSingerSource || (explicitOriginalSingerNames.length ? 'Explicit YouTube source credit' : ''),
      isCover: typeof track.isCover === 'boolean' ? track.isCover : (sourceMetadata.coverIndicators?.length ? true : null),
      album: track.album || sourceMetadata.album || '',
      movie: track.movie || sourceMetadata.movie || '',
      musicDirector: track.musicDirector || sourceMetadata.musicDirector || '',
      composer: track.composer || sourceMetadata.composer || '',
      lyricist: track.lyricist || sourceMetadata.lyricist || '',
      producer: track.producer || sourceMetadata.producer || '',
      label: track.label || sourceMetadata.label || '',
      creditedArtist: track.creditedArtist || sourceMetadata.creditedArtist || '',
      releaseDate: track.releaseDate || sourceMetadata.releaseDate || '',
      metadataReleaseDate: track.metadataReleaseDate || track.releaseDate || sourceMetadata.releaseDate || '',
      year: track.year || sourceMetadata.releaseYear || null,
      coverStatus: track.coverStatus && track.coverStatus !== 'unknown'
        ? track.coverStatus
        : (sourceMetadata.coverIndicators?.length ? 'cover-indicated' : (track.coverStatus || 'unknown')),
      coverConfidence: track.coverConfidence || (sourceMetadata.coverIndicators?.length ? 76 : 0),
      coverEvidence: [...new Set([...(track.coverEvidence || []), ...(sourceMetadata.coverIndicators || [])])],
      genre: hasBeenChecked ? (track.genre || 'Unclassified') : 'Unclassified',
      mood: hasBeenChecked ? (track.mood || 'all') : 'all',
      language: hasBeenChecked ? (track.language || 'Unknown') : 'Unknown',
      languageSource: hasBeenChecked ? (track.languageSource || '') : '',
      // Never expose the raw YouTube description as song-detail content.
      description: '',
      tags: [...new Set([...(Array.isArray(track.tags) ? track.tags : []), ...(sourceMetadata.searchTerms || [])])].slice(0, 50),
      metadataStatus: hasBeenChecked ? (track.metadataStatus || 'unmatched') : (sourceHasMetadata ? 'youtube-source' : 'pending'),
      metadataSources,
      metadataCheckedAt: hasBeenChecked ? track.metadataCheckedAt : '',
      metadataConfidence: hasBeenChecked ? (track.metadataConfidence || 0) : 0,
    });
  }));
  const [youtubePlaylists, setYoutubePlaylists] = useState(() => readStorage(YOUTUBE_PLAYLISTS_KEY, []));
  const [cloudArtists, setCloudArtists] = useState([]);
  const [personalLibraryReady, setPersonalLibraryReady] = useState(!isSupabaseConfigured);
  const [personalLibraryStatus, setPersonalLibraryStatus] = useState(isSupabaseConfigured ? 'signed-out' : 'local');
  const [localTracks, setLocalTracks] = useState([]);
  const [localTracksReady, setLocalTracksReady] = useState(false);
  // Songs saved in <Downloads>/Surdhara by the SURDHARA server (app.py).
  const [deviceSongs, setDeviceSongs] = useState([]);
  const [downloader, setDownloader] = useState({ state: 'idle', folder: '', ffmpeg: null });
  const [currentTrackId, setCurrentTrackId] = useState(() => {
    try { return window.localStorage.getItem(CURRENT_TRACK_KEY) || 'tomake-chai'; }
    catch { return 'tomake-chai'; }
  });
  const [autoplayKey, setAutoplayKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off');
  const [volume, setVolume] = useState(68);
  const [muted, setMuted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [roleLoading, setRoleLoading] = useState(false);
  const [accountRole, setAccountRole] = useState('guest');
  const [accountRoleError, setAccountRoleError] = useState('');
  const [authError, setAuthError] = useState('');
  const [cloudCatalogueStatus, setCloudCatalogueStatus] = useState(isSupabaseConfigured ? 'loading' : 'not-configured');
  const [catalogueMeta, setCatalogueMeta] = useState({ status: isSupabaseConfigured ? 'loading' : 'local', count: 0, syncedAt: 0 });
  const catalogueSyncRef = useRef(null);
  const { online, changedAt: networkChangedAt, reportFailure } = useNetworkStatus();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const offlineAudio = useOfflineAudio();
  const { canInstall, install: installApp } = useInstallPrompt();
  const [updateRegistration, setUpdateRegistration] = useState(null);
  const [justReconnected, setJustReconnected] = useState(false);
  const [librarySync, setLibrarySync] = useState('idle');
  const [libraryReloadKey, setLibraryReloadKey] = useState(0);
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sleepTimer, setSleepTimer] = useState(null);
  const [backgroundPlay, setBackgroundPlay] = useState(() => {
    try { return window.localStorage.getItem('surdhara-background-play') !== 'off'; } catch { return true; }
  });
  const [unavailable, setUnavailable] = useState(() => {
    const stored = readStorage(UNAVAILABLE_KEY, {});
    const now = Date.now();
    return Object.fromEntries(Object.entries(stored).filter(([, at]) => now - Number(at) < UNAVAILABLE_TTL_MS));
  });
  const lastSyncedLibraryRef = useRef('');
  const saveFailuresRef = useRef(0);
  const libraryNeedsReloadRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const userPausedRef = useRef(false);
  const lastPlayingAtRef = useRef(0);
  const resumePositionRef = useRef(0);
  const wantedPlayingOnDropRef = useRef(false);
  const lastStallToastRef = useRef(0);
  const [cloudCatalogueError, setCloudCatalogueError] = useState('');
  const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);
  // Refs hold the one-time browser migration queue; bump this state whenever that queue changes
  // so the Import Songs card recomputes its displayed pending-item count immediately.
  const [, setLegacyMigrationRevision] = useState(0);
  const canManageCatalog = !isSupabaseConfigured || accountRole === 'admin';
  const cloudPublishingEnabled = Boolean(isSupabaseConfigured && authUser && accountRole === 'admin' && !roleLoading && online && catalogueMeta.status !== 'partial');
  const playerRef = useRef(null);
  const appliedAuthUserIdRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }
    let active = true;
    const applySession = (session) => {
      if (!active) return;
      const nextUserId = session?.user?.id || null;
      if (isSupabaseConfigured && appliedAuthUserIdRef.current !== nextUserId) {
        appliedAuthUserIdRef.current = nextUserId;
        setFavorites([]);
        setRecent([]);
        setCustomPlaylists([]);
        setPlaylistOverrides({});
        setPlaylistRemovals({});
        setPersonalLibraryReady(!nextUserId);
        setPersonalLibraryStatus(nextUserId ? 'loading' : 'signed-out');
      }
      setAuthUser(session?.user || null);
      setAuthLoading(false);
      setAuthError('');
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      applySession(data?.session || null);
    }).catch((error) => {
      if (!active) return;
      setAuthError(error?.message || 'Unable to read the current session.');
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Cloud-enabled users load a clean, account-specific library instead of reusing this browser's localStorage.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setPersonalLibraryReady(true);
      setPersonalLibraryStatus('local');
      return undefined;
    }
    let active = true;
    if (!authUser?.id) {
      setFavorites([]);
      setRecent([]);
      setCustomPlaylists([]);
      setPlaylistOverrides({});
      setPlaylistRemovals({});
      setPersonalLibraryReady(true);
      setPersonalLibraryStatus('signed-out');
      return undefined;
    }
    setPersonalLibraryReady(false);
    setPersonalLibraryStatus('loading');
    const userId = authUser.id;
    const applyLibrary = (library) => {
      setFavorites(library.favorites);
      setRecent(library.recent);
      setCustomPlaylists(library.customPlaylists);
      setPlaylistOverrides(library.playlistOverrides);
      setPlaylistRemovals(library.playlistRemovals);
      setPersonalLibraryStatus('ready');
      setPersonalLibraryReady(true);
    };
    loadUserLibrary(userId).then((library) => {
      if (!active) return;
      // Unsynced local edits (made offline / before a crash) win and are pushed by the save effect.
      const mirror = readLibraryMirror(userId);
      if (mirror?.dirty) { lastSyncedLibraryRef.current = ''; applyLibrary(mirror.state); return; }
      lastSyncedLibraryRef.current = serializeLibrary(library);
      writeLibraryMirror(userId, library, false);
      applyLibrary(library);
    }).catch((error) => {
      if (!active) return;
      reportFailure(error);
      const mirror = isNetworkError(error) ? readLibraryMirror(userId) : null;
      if (mirror) {
        // Offline: open the last known library; re-check the cloud as soon as the connection returns.
        libraryNeedsReloadRef.current = !mirror.dirty;
        lastSyncedLibraryRef.current = mirror.dirty ? '' : serializeLibrary(mirror.state);
        applyLibrary(mirror.state);
        setLibrarySync('offline');
        return;
      }
      libraryNeedsReloadRef.current = isNetworkError(error);
      setFavorites([]);
      setRecent([]);
      setCustomPlaylists([]);
      setPlaylistOverrides({});
      setPlaylistRemovals({});
      setPersonalLibraryStatus('error');
      setPersonalLibraryReady(true);
      setToast(isNetworkError(error) ? 'You’re offline — your library will load when you reconnect.' : (error instanceof Error ? error.message : 'Could not load your personal music library.'));
    });
    return () => { active = false; };
  }, [authUser?.id, libraryReloadKey]);

  // Library could not be fetched (offline) → fetch it as soon as we are back online.
  useEffect(() => {
    if (online && libraryNeedsReloadRef.current) {
      libraryNeedsReloadRef.current = false;
      setLibraryReloadKey((value) => value + 1);
    }
  }, [online]);

  // Personal library autosave. Edits are mirrored locally first (so they survive offline / closed tabs),
  // then pushed with exponential backoff. A failed save never disables later saves.
  useEffect(() => {
    if (!isSupabaseConfigured || !authUser?.id || !personalLibraryReady || personalLibraryStatus === 'error') return undefined;
    const userId = authUser.id;
    const snapshot = { favorites, recent, customPlaylists, playlistOverrides, playlistRemovals };
    const json = serializeLibrary(snapshot);
    if (json === lastSyncedLibraryRef.current) return undefined;
    writeLibraryMirror(userId, snapshot, true);
    if (!online) { setLibrarySync('offline'); return undefined; }
    const delay = saveFailuresRef.current ? backoffDelay(saveFailuresRef.current - 1, { baseMs: 1500, maxMs: 30000 }) : 550;
    const timer = window.setTimeout(() => {
      setLibrarySync('saving');
      saveUserLibrary(userId, snapshot).then(() => {
        saveFailuresRef.current = 0;
        lastSyncedLibraryRef.current = json;
        writeLibraryMirror(userId, snapshot, false);
        setLibrarySync('saved');
      }).catch((error) => {
        saveFailuresRef.current += 1;
        reportFailure(error);
        const network = isNetworkError(error);
        setLibrarySync(network ? 'offline' : 'error');
        if (!network && saveFailuresRef.current === 1) setToast(error instanceof Error ? error.message : 'Could not save your personal music library.');
        setSaveRetryTick((value) => value + 1);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [authUser?.id, personalLibraryReady, personalLibraryStatus, favorites, recent, customPlaylists, playlistOverrides, playlistRemovals, online, saveRetryTick]);

  useEffect(() => {
    if (!supabase || !authUser) {
      setAccountRole('guest');
      setAccountRoleError('');
      setRoleLoading(false);
      return undefined;
    }
    let active = true;
    setRoleLoading(true);
    getAccountRole(authUser).then(({ role, error }) => {
      if (!active) return;
      setAccountRole(role);
      setAccountRoleError(error?.message || '');
      setRoleLoading(false);
    }).catch((error) => {
      if (!active) return;
      setAccountRole('user');
      setAccountRoleError(error?.message || 'Account roles have not been set up yet.');
      setRoleLoading(false);
    });
    return () => { active = false; };
  }, [authUser]);

  // Shared catalogue: cache-first, delta-synced, realtime-patched (see src/lib/catalogueSync.js).
  useEffect(() => {
    if (!supabase) {
      setCloudCatalogueStatus('not-configured');
      return undefined;
    }
    let active = true;
    const sync = createCatalogueSync({
      onCatalogue: (catalogue) => {
        if (!active) return;
        // Reconcile the browser-only migration queue against the actual public cloud catalogue.
        // This repairs a stale item count left by an earlier app version after a successful migration.
        const publishedYoutubeIds = new Set((catalogue.tracks || [])
          .map((track) => track.youtubeId || (String(track.id || '').startsWith('yt-') ? String(track.id).slice(3) : ''))
          .filter(Boolean));
        const publishedBrowserTrackIds = new Set((catalogue.tracks || [])
          .map((track) => String(track.browserTrackId || ''))
          .filter(Boolean));
        const previousLegacyYoutube = legacyImportedTracksRef.current || [];
        const previousLegacyLocal = legacyLocalTracksRef.current || [];
        const nextLegacyYoutube = previousLegacyYoutube.filter((track) => {
          const youtubeId = track.youtubeId || (String(track.id || '').startsWith('yt-') ? String(track.id).slice(3) : '');
          return !youtubeId || !publishedYoutubeIds.has(youtubeId);
        });
        const nextLegacyLocal = previousLegacyLocal.filter((track) => !publishedBrowserTrackIds.has(String(track.id || '')));
        if (nextLegacyYoutube.length !== previousLegacyYoutube.length || nextLegacyLocal.length !== previousLegacyLocal.length) {
          legacyImportedTracksRef.current = nextLegacyYoutube;
          legacyLocalTracksRef.current = nextLegacyLocal;
          try {
            window.localStorage.setItem(IMPORTED_TRACKS_KEY, JSON.stringify(nextLegacyYoutube));
            window.localStorage.setItem(LOCAL_TRACKS_KEY, JSON.stringify(nextLegacyLocal));
          } catch { /* The cloud catalogue remains authoritative if browser storage is unavailable. */ }
          setLegacyMigrationRevision((revision) => revision + 1);
        }

        setImportedTracks(catalogue.tracks);
        setYoutubePlaylists(catalogue.playlists);
        setCloudArtists(catalogue.artists || []);
      },
      onStatus: (info) => {
        if (!active) return;
        setCatalogueMeta(info);
        // 'partial' (streaming), 'stale' (cached copy) and 'ready' all have songs to show.
        setCloudCatalogueStatus(info.status === 'loading' ? 'loading' : info.status === 'error' ? 'error' : 'ready');
        setCloudCatalogueError(info.status === 'error' || (info.status === 'stale' && !info.refreshing) ? (info.error || '') : '');
        if (info.error && !info.offline) reportFailure(new Error(info.error));
      },
    });
    catalogueSyncRef.current = sync;
    sync.start();
    return () => { active = false; catalogueSyncRef.current = null; sync.stop(); };
  }, []);

  const handleProviderSignIn = async (provider) => {
    if (!supabase) {
      setAuthError('Add your Supabase URL and publishable key to .env.local first.');
      return;
    }
    setAuthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    });
    if (error) setAuthError(error.message);
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (authUser?.id) clearLibraryMirrorIfClean(authUser.id);
    setAccountRole('guest');
    setProfileModalOpen(false);
    setToast('Signed out successfully');
  };

  // Once the cloud backend is configured, only central published imports are shown in the shared library.
  // Browser-only records stay available to the one-time Admin migration action, not to public visitors.
  const visibleImportedTracks = isSupabaseConfigured && cloudCatalogueStatus !== 'ready' ? EMPTY_TRACKS : importedTracks;
  const visibleLocalTracks = isSupabaseConfigured ? EMPTY_TRACKS : localTracks;
  // The 5 built-in demo songs are only a fallback: hidden as soon as the real catalogue has content.
  const demoTracks = isSupabaseConfigured && visibleImportedTracks.length > 0 ? EMPTY_TRACKS : tracks;
  const deviceTracks = useMemo(() => deviceSongs.map(songToTrack), [deviceSongs]);
  const allTracks = useMemo(() => {
    const combined = new Map();
    // Downloads/Surdhara songs go last and stay next to each other, so "next song" inside that section stays inside it.
    [...demoTracks, ...visibleImportedTracks, ...visibleLocalTracks, ...deviceTracks].forEach((track) => {
      const key = track.youtubeId ? `youtube:${track.youtubeId}` : `track:${track.id}`;
      const previous = combined.get(key);
      if (!previous || track.cloudPublished || track.cloudSongId) combined.set(key, track);
    });
    return [...combined.values()];
  }, [demoTracks, visibleImportedTracks, visibleLocalTracks, deviceTracks]);
  const recentlyAddedTracks = useMemo(() => [...visibleImportedTracks, ...visibleLocalTracks].sort((a, b) => {
    const aTime = Date.parse(a.importedAt || a.youtubePublishedAt || '') || 0;
    const bTime = Date.parse(b.importedAt || b.youtubePublishedAt || '') || 0;
    return bTime - aTime;
  }), [visibleImportedTracks, visibleLocalTracks]);
  const importedArtists = useMemo(() => {
    const seen = new Map();
    [...visibleImportedTracks, ...visibleLocalTracks].forEach((track) => {
      getTrackArtistNames(track).forEach((name) => {
        const id = artistSlug(name);
        if (!id || seen.has(id)) return;
        seen.set(id, {
          id,
          name,
          type: 'artist',
          bio: 'Singer / performer of tracks imported into SURDHARA.',
        });
      });
    });
    return [...seen.values()];
  }, [visibleImportedTracks, visibleLocalTracks]);

  const [artistPhotos, setArtistPhotos] = useState({});

  const allArtists = useMemo(() => {
    const byName = new Map();
    [...artists, ...importedArtists, ...cloudArtists].forEach((artist) => {
      const key = normalizeArtistKey(artist.name);
      if (!key) return;
      const existing = byName.get(key);
      byName.set(key, {
        ...existing,
        ...artist,
        id: artistSlug(artist.name) || artist.id,
        type: 'artist',
        image: artist.photoUrl || artist.image || artistPhotos[artistSlug(artist.name)] || '',
      });
    });
    return [...byName.values()];
  }, [artistPhotos, importedArtists, cloudArtists]);

  const artistPhotoNames = useMemo(
    () => [...new Map(allArtists.map((artist) => [artistSlug(artist.name), artist.name])).values()],
    [allArtists],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(artistPhotoNames.map(async (name) => [artistSlug(name), await resolveArtistPhoto(name)]))
      .then((entries) => {
        if (cancelled) return;
        setArtistPhotos((previous) => {
          const next = { ...previous };
          let changed = false;
          entries.forEach(([id, image]) => {
            if (image && next[id] !== image) {
              next[id] = image;
              changed = true;
            } else if (!image && Object.prototype.hasOwnProperty.call(next, id)) {
              // Clear any previously cached portrait if the current exact-name lookup cannot
              // verify a suitable singer photo. Never keep a questionable stale match.
              delete next[id];
              changed = true;
            }
          });
          return changed ? next : previous;
        });
      });
    return () => { cancelled = true; };
  }, [artistPhotoNames]);
  const allPlaylists = useMemo(() => {
    const withoutRemoved = (playlistId, ids) => {
      const removed = new Set(playlistRemovals[playlistId] || []);
      return [...new Set(ids)].filter((id) => !removed.has(id));
    };
    const imported = youtubePlaylists.map((playlist) => ({
      ...playlist,
      trackIds: withoutRemoved(playlist.id, playlistOverrides[playlist.id] ?? playlist.trackIds ?? []),
    }));
    const featured = playlists.map((playlist) => {
      const autoTracks = allTracks.filter((track) => matchesFeaturedPlaylist(track, playlist.id)).map((track) => track.id);
      const trackIds = withoutRemoved(playlist.id, [...(playlistOverrides[playlist.id] ?? playlist.trackIds ?? []), ...autoTracks]);
      return { ...playlist, trackIds, isFeatured: true, collection: 'Featured Playlists' };
    });
    const global = globalPlaylistDefinitions.map((definition) => {
      const autoTracks = allTracks.filter((track) => trackMatchesGlobalPlaylist(track, definition.id)).map((track) => track.id);
      const manualTracks = playlistOverrides[definition.id] || [];
      const trackIds = withoutRemoved(definition.id, [...autoTracks, ...manualTracks]);
      return { ...definition, trackIds, subtitle: `${trackIds.length} ${trackIds.length === 1 ? 'track' : 'tracks'}` };
    });
    return [...customPlaylists, ...imported, ...featured, ...global];
  }, [customPlaylists, youtubePlaylists, playlistOverrides, playlistRemovals, allTracks]);

  const albumEntries = useMemo(() => {
    const names = [...new Set(allTracks.map(getAlbumLabel).filter(Boolean))];
    return names.map((title, index) => {
      const albumTracks = allTracks.filter((track) => getAlbumLabel(track) === title);
      const firstTrack = albumTracks[0];
      return {
        id: `album-${index}`, kind: 'album', title,
        subtitle: `${albumTracks.length} tracks · ${firstTrack?.year || 'Release year unknown'}`,
        description: `Songs from ${title}.`, cover: firstTrack?.cover || playlists[0].cover,
        trackIds: albumTracks.map((track) => track.id),
      };
    });
  }, [allTracks]);
  const currentTrack = allTracks.find((track) => track.id === currentTrackId) || allTracks[0] || tracks[0];
  const selectedPlaylist = allPlaylists.find((playlist) => playlist.id === selectedPlaylistId);
  const selectedArtist = allArtists.find((artist) => artist.id === selectedArtistId);
  const [greeting, setGreeting] = useState(() => getGreeting());

  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 10))); }, [recent]);
  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(customPlaylists)); }, [customPlaylists]);
  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(PLAYLIST_OVERRIDES_KEY, JSON.stringify(playlistOverrides)); }, [playlistOverrides]);
  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(PLAYLIST_REMOVALS_KEY, JSON.stringify(playlistRemovals)); }, [playlistRemovals]);
  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(IMPORTED_TRACKS_KEY, JSON.stringify(importedTracks)); }, [importedTracks]);
  useEffect(() => { if (!isSupabaseConfigured) window.localStorage.setItem(YOUTUBE_PLAYLISTS_KEY, JSON.stringify(youtubePlaylists)); }, [youtubePlaylists]);
  // Keep the selected track across a browser refresh. Playback itself starts paused after reload
  // because browsers generally block unsolicited autoplay; the user can press Play to resume.
  useEffect(() => {
    if (!currentTrackId) return;
    try { window.localStorage.setItem(CURRENT_TRACK_KEY, currentTrackId); } catch { /* selection still works for this session */ }
  }, [currentTrackId]);
  useEffect(() => {
    let active = true;
    const savedTracks = readStorage(LOCAL_TRACKS_KEY, []);
    restoreLocalAudioTracks(savedTracks).then((restoredTracks) => {
      if (!active) {
        restoredTracks.forEach((track) => { if (track.audioUrl) URL.revokeObjectURL(track.audioUrl); });
        return;
      }
      setLocalTracks((previous) => {
        const restoredIds = new Set(restoredTracks.map((track) => track.id));
        return [...restoredTracks, ...previous.filter((track) => !restoredIds.has(track.id))];
      });
      setLocalTracksReady(true);
    }).catch(() => { if (active) setLocalTracksReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!localTracksReady) return;
    const savedTracks = localTracks
      .filter((track) => track.localAudioPersistent !== false)
      .map(({ audioUrl, localAudioPersistent, ...track }) => track);
    try { window.localStorage.setItem(LOCAL_TRACKS_KEY, JSON.stringify(savedTracks)); } catch { /* audio stays in IndexedDB; current session remains available */ }
  }, [localTracks, localTracksReady]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* theme still works for this session */ }
  }, [theme]);
  useEffect(() => {
    const currentRoute = { ...initialRoute };
    if (!window.history.state?.surdharaRoute) {
      window.history.replaceState({ surdharaRoute: currentRoute }, '', buildRouteHash(currentRoute));
    }
    const handlePopState = () => {
      const route = readRouteFromLocation();
      setPage(route.page);
      setQuery(route.query);
      setActiveMood(route.activeMood);
      setSelectedPlaylistId(route.selectedPlaylistId);
      setSelectedArtistId(route.selectedArtistId);
      setSelectedLanguage(route.selectedLanguage);
      setMobileMenuOpen(false);
      setMobileSearchOpen(false);
      setRemovePlaylistSongsMode(false);
      setAddSongsPlaylistId(null);
      setAddSongsSearch('');
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);
  useEffect(() => {
    const update = () => setGreeting(getGreeting());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!createModalOpen) return undefined;
    const handleEscape = (event) => { if (event.key === 'Escape') setCreateModalOpen(false); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [createModalOpen]);

  const commitNavigation = (route, { replace = false } = {}) => {
    const nextRoute = {
      page: ROUTE_PAGES.has(route.page) ? route.page : 'home',
      query: route.query ?? query,
      activeMood: route.activeMood ?? activeMood,
      selectedPlaylistId: route.selectedPlaylistId ?? null,
      selectedArtistId: route.selectedArtistId ?? null,
      selectedLanguage: route.selectedLanguage ?? '',
    };
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ surdharaRoute: nextRoute }, '', buildRouteHash(nextRoute));
    setPage(nextRoute.page);
    setQuery(nextRoute.query);
    setActiveMood(nextRoute.activeMood);
    setSelectedPlaylistId(nextRoute.selectedPlaylistId);
    setSelectedArtistId(nextRoute.selectedArtistId);
    setSelectedLanguage(nextRoute.selectedLanguage);
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
    setRemovePlaylistSongsMode(false);
    setAddSongsPlaylistId(null);
    setAddSongsSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigate = (nextPage) => commitNavigation({
    page: nextPage,
    selectedPlaylistId: null,
    selectedArtistId: null,
    selectedLanguage: '',
  });

  const openPlaylist = (id) => commitNavigation({
    page: 'playlist-detail',
    selectedPlaylistId: id,
    selectedArtistId: null,
    selectedLanguage: '',
  });

  const openArtist = (id) => commitNavigation({
    page: 'artist-detail',
    selectedPlaylistId: null,
    selectedArtistId: id,
    selectedLanguage: '',
  });

  const handleSearchSubmit = () => commitNavigation({
    page: 'discover',
    query,
    selectedPlaylistId: null,
    selectedArtistId: null,
    selectedLanguage: '',
  });

  // useDeferredValue keeps typing instant: the (potentially large) filter runs at low priority, and the
  // per-track search index is cached, so a keystroke costs a string includes() per song instead of a re-normalise.
  const deferredQuery = useDeferredValue(query);
  const filteredTracks = useMemo(() => {
    const terms = searchTerms(deferredQuery);
    return allTracks.filter((track) => {
      const matchesMood = activeMood === 'all' || track.mood === activeMood || String(track.genre || '').toLocaleLowerCase('en') === activeMood;
      return matchesMood && matchesIndexedSearch(terms, track, getTrackSearchFields);
    });
  }, [deferredQuery, activeMood, allTracks]);


  const addToRecent = (id) => {
    if (isSupabaseConfigured && (!authUser || !personalLibraryReady)) return;
    setRecent((previous) => [id, ...previous.filter((item) => item !== id)].slice(0, 10));
  };
  // ---- Resilient playback -------------------------------------------------------------------
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const currentTrackIdRef = useRef(currentTrackId);
  currentTrackIdRef.current = currentTrackId;
  const stepTrackRef = useRef(null);

  // Songs in Downloads/Surdhara stream from this computer, so they play with no internet too.
  const isOfflinePlayable = (track) => Boolean(track?.deviceDownload || (track?.audioUrl && isSavedOffline(track.audioUrl)));
  const isTrackPlayable = (track) => {
    if (!track) return false;
    if (unavailable[track.id]) return false;
    return online || isOfflinePlayable(track);
  };
  const markUnavailable = (id) => setUnavailable((previous) => {
    const next = { ...previous, [id]: Date.now() };
    try { window.localStorage.setItem(UNAVAILABLE_KEY, JSON.stringify(next)); } catch { /* storage full: in-memory flag still works */ }
    return next;
  });
  const clearUnavailable = (id) => setUnavailable((previous) => {
    if (!previous[id]) return previous;
    const { [id]: _removed, ...rest } = previous;
    try { window.localStorage.setItem(UNAVAILABLE_KEY, JSON.stringify(rest)); } catch { /* ignore */ }
    return rest;
  });
  const pausePlayback = () => { userPausedRef.current = true; playerRef.current?.pause(); };
  const seekToSeconds = (seconds) => {
    const limit = duration || currentTrack?.durationSeconds || Infinity;
    const target = Math.max(0, Math.min(limit, seconds));
    playerRef.current?.seekTo(target);
    setCurrentTime(target);
  };

  const handlePlayTrack = (track) => {
    if (!track) return;
    if (track.id === currentTrackId && isPlaying) {
      pausePlayback();
      return;
    }
    if (!online && !isOfflinePlayable(track)) {
      setToast(track.audioUrl ? 'You’re offline. Save this song while online to play it without internet.' : 'You’re offline. This song streams from YouTube — saved songs still play.');
      return;
    }
    if (unavailable[track.id]) clearUnavailable(track.id); // explicit tap = try again
    userPausedRef.current = false;
    consecutiveFailuresRef.current = 0;
    setQueuedTrackIds((previous) => previous.filter((id) => id !== track.id));
    setCurrentTrackId(track.id);
    addToRecent(track.id);
    setCurrentTime(0);
    setDuration(track.durationSeconds || 0);
    setAutoplayKey((value) => value + 1);
  };

  const playTrackNext = (track) => {
    if (!track || track.id === currentTrackId) return;
    setQueuedTrackIds((previous) => [track.id, ...previous.filter((id) => id !== track.id)]);
    setToast(`“${track.title}” will play next`);
  };

  const addTrackToQueue = (track) => {
    if (!track || track.id === currentTrackId) return;
    const alreadyQueued = queuedTrackIds.includes(track.id);
    setQueuedTrackIds((previous) => previous.includes(track.id) ? previous : [...previous, track.id]);
    setToast(alreadyQueued ? 'Track is already in the queue' : 'Track added to queue');
  };

  const togglePlayback = () => {
    if (isPlaying) { pausePlayback(); return; }
    if (!online && !isOfflinePlayable(currentTrack)) { setToast('You’re offline. Pick a saved song to keep listening.'); return; }
    userPausedRef.current = false;
    if (autoplayKey === 0) setAutoplayKey(1);
    else playerRef.current?.play();
  };

  const toggleFavorite = (id) => {
    if (isSupabaseConfigured && !authUser) {
      setProfileModalOpen(true);
      setToast('Sign in to save liked songs to your own account');
      return;
    }
    if (isSupabaseConfigured && !personalLibraryReady) { setToast('Your personal library is still loading'); return; }
    const hasFavorite = favorites.includes(id);
    setFavorites((previous) => hasFavorite ? previous.filter((trackId) => trackId !== id) : [id, ...previous]);
    setToast(hasFavorite ? 'Removed from liked songs' : 'Added to liked songs');
  };

  const stepTrack = (direction, automatic = false) => {
    if (!allTracks.length) return;
    if (automatic && repeatMode === 'one') {
      playerRef.current?.seekTo(0);
      playerRef.current?.play();
      setCurrentTime(0);
      return;
    }

    // Explicitly queued tracks always take priority over the default library order when moving forward.
    if (direction > 0 && queuedTrackIds.length) {
      const queueIds = queuedTrackIds.filter((id) => id !== currentTrackId && allTracks.some((track) => track.id === id && isTrackPlayable(track)));
      const nextQueuedId = queueIds[0];
      const nextQueuedTrack = allTracks.find((track) => track.id === nextQueuedId);
      if (nextQueuedTrack) {
        setQueuedTrackIds((previous) => previous.filter((id) => id !== nextQueuedId));
        setCurrentTrackId(nextQueuedTrack.id);
        addToRecent(nextQueuedTrack.id);
        setCurrentTime(0);
        setDuration(nextQueuedTrack.durationSeconds || 0);
        setAutoplayKey((value) => value + 1);
        return;
      }
      setQueuedTrackIds([]);
    }

    const index = Math.max(0, allTracks.findIndex((track) => track.id === currentTrackId));
    let nextIndex;
    if (shuffleEnabled && allTracks.length > 1 && direction < 0 && !automatic) {
      const previousTrackId = recent.find((id) => id !== currentTrackId);
      const previousIndex = allTracks.findIndex((track) => track.id === previousTrackId);
      if (previousIndex >= 0) nextIndex = previousIndex;
      else {
        const candidates = allTracks.map((_, candidateIndex) => candidateIndex).filter((candidateIndex) => candidateIndex !== index && isTrackPlayable(allTracks[candidateIndex]));
        nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
      }
    } else if (shuffleEnabled && allTracks.length > 1) {
      const candidates = allTracks.map((_, candidateIndex) => candidateIndex).filter((candidateIndex) => candidateIndex !== index && isTrackPlayable(allTracks[candidateIndex]));
      nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      nextIndex = index + direction;
      if (automatic && nextIndex >= allTracks.length && repeatMode !== 'all') {
        setIsPlaying(false);
        setCurrentTime(duration);
        return;
      }
      nextIndex = (nextIndex + allTracks.length) % allTracks.length;
      // Skip songs that cannot play right now (removed video, or YouTube-only while offline).
      for (let hops = 0; hops < allTracks.length && !isTrackPlayable(allTracks[nextIndex]); hops += 1) {
        nextIndex = (nextIndex + (direction || 1) + allTracks.length) % allTracks.length;
      }
    }
    const nextTrack = allTracks[nextIndex];
    if (!nextTrack) return;
    if (!isTrackPlayable(nextTrack)) {
      setIsPlaying(false);
      setToast(online ? 'No playable songs left in the list.' : 'You’re offline and no saved songs are next in the list.');
      return;
    }
    setCurrentTrackId(nextTrack.id);
    addToRecent(nextTrack.id);
    setCurrentTime(0);
    setDuration(nextTrack.durationSeconds || 0);
    setAutoplayKey((value) => value + 1);
  };
  stepTrackRef.current = stepTrack;
  const handleTrackEnded = () => {
    if (sleepTimer?.endOfTrack) {
      setSleepTimer(null);
      setIsPlaying(false);
      setToast('Sleep timer: stopped after this song. Good night 🌙');
      return;
    }
    stepTrack(1, true);
  };

  const handlePlaybackError = (message, meta = {}) => {
    setIsPlaying(false);
    if (meta.engine) { setToast(message); return; }
    if (meta.code === 'network' || !onlineRef.current) {
      // Not the song's fault: remember where we were and resume by ourselves when the connection returns.
      reportFailure(new TypeError('Failed to fetch'));
      wantedPlayingOnDropRef.current = !userPausedRef.current;
      resumePositionRef.current = playerRef.current?.getCurrentTime?.() || currentTimeRef.current || 0;
      setToast('Connection lost. Playback resumes automatically when you’re back online.');
      return;
    }
    const failedId = currentTrackIdRef.current;
    if (meta.permanent && failedId) markUnavailable(failedId);
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current > MAX_AUTO_SKIPS) {
      setToast(`${message} Paused after several songs in a row failed.`);
      return;
    }
    setToast(`${message} Skipping to the next song…`);
    window.setTimeout(() => { if (currentTrackIdRef.current === failedId) stepTrackRef.current?.(1); }, 1200);
  };
  const handlePlaybackStarted = () => { consecutiveFailuresRef.current = 0; userPausedRef.current = false; };
  const handleStall = () => {
    reportFailure(new TypeError('Failed to fetch')); // runs a real connectivity probe
    if (Date.now() - lastStallToastRef.current > 30000) { lastStallToastRef.current = Date.now(); setToast('Slow connection — still buffering…'); }
  };

  // Connection drops mid-song → remember position + intent; connection returns → pick up where we left off.
  const wasOnlineRef = useRef(online);
  useEffect(() => { if (isPlaying) lastPlayingAtRef.current = Date.now(); }, [isPlaying]);
  useEffect(() => {
    if (!online) {
      wantedPlayingOnDropRef.current = !userPausedRef.current && (isPlayingRef.current || Date.now() - lastPlayingAtRef.current < 20000);
      resumePositionRef.current = playerRef.current?.getCurrentTime?.() || currentTimeRef.current || 0;
    } else if (wasOnlineRef.current === false) {
      setJustReconnected(true);
      const timer = window.setTimeout(() => setJustReconnected(false), 3500);
      if (wantedPlayingOnDropRef.current && !isPlayingRef.current) playerRef.current?.reload?.(resumePositionRef.current, true);
      wantedPlayingOnDropRef.current = false;
      wasOnlineRef.current = online;
      return () => window.clearTimeout(timer);
    }
    wasOnlineRef.current = online;
    return undefined;
  }, [online]);

  // Offline song library + service worker
  useEffect(() => { initOfflineAudio(); }, []);
  useEffect(() => { registerServiceWorker({ onUpdateReady: setUpdateRegistration }); }, []);
  const toggleOfflineSave = async (track) => {
    if (!track?.audioUrl) return;
    if (isSavedOffline(track.audioUrl)) { await removeAudioOffline(track.audioUrl); setToast('Removed from your offline songs'); return; }
    if (!onlineRef.current) { setToast('Connect to the internet to save songs for offline.'); return; }
    try {
      setToast(`Saving “${track.title}” for offline…`);
      await saveAudioOffline(track.audioUrl);
      setToast(`“${track.title}” is now available offline`);
    } catch (error) {
      reportFailure(error);
      setToast(error instanceof Error ? error.message : 'Could not save this song offline.');
    }
  };
  const getTrackFlags = (track) => {
    const key = track.audioUrl ? normalizeAudioUrl(track.audioUrl) : '';
    return {
      canSave: Boolean(track.audioUrl) && !track.deviceDownload && offlineAudio.supported,
      saved: Boolean(key) && offlineAudio.saved.has(key),
      progress: key ? offlineAudio.progress[key] : undefined,
      unavailable: Boolean(unavailable[track.id]),
      blocked: !online && !isOfflinePlayable(track),
    };
  };

  // Sleep timer with a 10-second volume fade-out
  useEffect(() => {
    if (!sleepTimer?.endsAt) return undefined;
    const id = window.setInterval(() => {
      const remaining = sleepTimer.endsAt - Date.now();
      if (remaining <= 0) {
        pausePlayback();
        playerRef.current?.setVolume?.(volume);
        setSleepTimer(null);
        setToast('Sleep timer: playback stopped. Good night 🌙');
        return;
      }
      if (remaining <= 10000 && !muted) playerRef.current?.setVolume?.(Math.max(0, Math.round((volume * remaining) / 10000)));
    }, 500);
    return () => { window.clearInterval(id); playerRef.current?.setVolume?.(volume); };
  }, [sleepTimer, volume, muted]);

  useBackgroundPlayback({
    enabled: backgroundPlay,
    isPlaying,
    usesIframe: !(currentTrack?.sourceType === 'local' || currentTrack?.audioUrl),
    userPausedRef,
    playerRef,
  });
  useMediaSession({
    track: currentTrack, isPlaying, currentTime, duration,
    onPlay: () => togglePlayback(), onPause: () => pausePlayback(),
    onPrevious: () => stepTrack(-1), onNext: () => stepTrack(1),
    onSeekTo: (seconds) => seekToSeconds(seconds),
  });
  useKeyboardShortcuts({
    togglePlayback, next: () => stepTrack(1), previous: () => stepTrack(-1),
    seekBy: (delta) => seekToSeconds((playerRef.current?.getCurrentTime?.() ?? currentTime) + delta),
    volumeBy: (delta) => { setMuted(false); setVolume((value) => Math.max(0, Math.min(100, value + delta))); },
    toggleMute: () => setMuted((value) => !value),
    toggleLike: () => currentTrack && toggleFavorite(currentTrack.id),
    toggleShuffle: () => setShuffleEnabled((value) => !value),
    cycleRepeat: () => setRepeatMode((mode) => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'),
    showHelp: () => setShortcutsOpen(true),
  });

  const createPlaylist = () => {
    if (isSupabaseConfigured && !authUser) { setProfileModalOpen(true); setToast('Sign in to create your own playlists'); return; }
    if (isSupabaseConfigured && !personalLibraryReady) { setToast('Your personal library is still loading'); return; }
    setNewPlaylistName('');
    setCreateModalOpen(true);
  };

  const submitNewPlaylist = (event) => {
    event.preventDefault();
    const title = newPlaylistName.trim();
    if (!title) return;
    const newPlaylist = {
      id: `custom-${Date.now()}`,
      title,
      subtitle: 'A collection made by you',
      description: 'Keep your favorite tracks together in one personal playlist.',
      cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=900&q=85',
      trackIds: [], mood: 'all', isCustom: true,
    };
    setCustomPlaylists((previous) => [newPlaylist, ...previous]);
    setCreateModalOpen(false);
    commitNavigation({ page: 'playlist-detail', selectedPlaylistId: newPlaylist.id, selectedArtistId: null, selectedLanguage: '' });
    setToast('Playlist created');
  };

  const mergePublishedTracks = (previousTracks, newTracks) => {
    const byKey = new Map((previousTracks || []).map((track) => [track.youtubeId ? `youtube:${track.youtubeId}` : `cloud:${track.cloudSongId || track.id}`, track]));
    (newTracks || []).forEach((track) => byKey.set(track.youtubeId ? `youtube:${track.youtubeId}` : `cloud:${track.cloudSongId || track.id}`, track));
    return [...byKey.values()];
  };

  const mergePublishedPlaylists = (previousPlaylists, newPlaylists) => [
    ...(newPlaylists || []),
    ...(previousPlaylists || []).filter((playlist) => !(newPlaylists || []).some((incoming) => incoming.id === playlist.id || (incoming.cloudPlaylistId && incoming.cloudPlaylistId === playlist.cloudPlaylistId))),
  ];

  const handleImportedLocal = async ({ tracks: incomingTracks = [], playlist = null, files = [] }) => {
    if (!incomingTracks.length) return { publishedToCloud: false };
    if (isSupabaseConfigured) {
      if (!authUser || accountRole !== 'admin') throw new Error('Only the signed-in SURDHARA Admin can publish local audio to the public cloud catalogue.');
      const result = await publishLocalImport({ tracks: incomingTracks, files, playlist, userId: authUser.id });
      setImportedTracks((previous) => mergePublishedTracks(previous, result.tracks));
      if (result.playlists.length) setYoutubePlaylists((previous) => mergePublishedPlaylists(previous, result.playlists));
      setCloudCatalogueStatus('ready');
      setToast(`${result.tracks.length} local song${result.tracks.length === 1 ? '' : 's'} published to the shared SURDHARA catalogue`);
      return { publishedToCloud: true, tracks: result.tracks };
    }

    setLocalTracks((previous) => {
      const existingIds = new Set(previous.map((track) => track.id));
      return [...previous, ...incomingTracks.filter((track) => !existingIds.has(track.id))];
    });
    if (playlist) setCustomPlaylists((previous) => [playlist, ...previous]);
    setToast('Imported into this browser only. Configure Supabase to publish songs for everyone.');
    return { publishedToCloud: false };
  };

  const handleImportedPlaylist = async ({ playlists: importedPlaylists = [], tracks: incomingTracks = [], failures = [], skippedDuplicates = [] }) => {
    const newTracks = incomingTracks.map((track) => normalizeTrackArtistCredits(track));
    const knownTracks = [...allTracks, ...newTracks];
    const trackIdByYoutubeId = new Map(knownTracks.filter((track) => track.youtubeId).map((track) => [track.youtubeId, track.id]));
    const normalizedPlaylists = importedPlaylists.map((playlist) => ({
      ...playlist,
      trackIds: [...new Set((playlist.trackIds || []).map((id) => {
        const youtubeId = String(id).startsWith('yt-') ? String(id).slice(3) : '';
        return trackIdByYoutubeId.get(youtubeId) || id;
      }))],
    }));

    if (isSupabaseConfigured) {
      if (!authUser || accountRole !== 'admin') throw new Error('Sign in with the SURDHARA Admin account to publish YouTube imports to the shared catalogue.');
      const published = await publishYouTubeImport({ tracks: newTracks, playlists: normalizedPlaylists, userId: authUser.id });
      setImportedTracks((previous) => mergePublishedTracks(previous, published.tracks));
      if (published.playlists.length) setYoutubePlaylists((previous) => mergePublishedPlaylists(previous, published.playlists));
      setCloudCatalogueStatus('ready');
      setToast(published.tracks.length || published.playlists.length ? `${published.tracks.length} YouTube song${published.tracks.length === 1 ? '' : 's'} published to the shared SURDHARA catalogue` : 'No new tracks to publish');
      return { publishedToCloud: true };
    }

    setImportedTracks((previous) => {
      const byVideoId = new Map(previous.map((track) => [track.youtubeId || track.id, track]));
      newTracks.forEach((track) => { if (!byVideoId.has(track.youtubeId || track.id)) byVideoId.set(track.youtubeId || track.id, track); });
      return [...byVideoId.values()];
    });
    if (normalizedPlaylists.length) {
      setYoutubePlaylists((previous) => [
        ...normalizedPlaylists,
        ...previous.filter((item) => !normalizedPlaylists.some((incoming) => incoming.id === item.id)),
      ]);
    }
    const total = newTracks.length + normalizedPlaylists.length;
    if (total && failures.length) setToast('Import completed in this browser with skipped items; songs are not public yet');
    else if (total) setToast('Imported in this browser only. Configure Supabase to publish songs for everyone.');
    else if (failures.length) setToast('No items imported');
    else if (skippedDuplicates.length) setToast('No new tracks to import');
    return { publishedToCloud: false };
  };

  const handleRefreshedMetadata = async (refreshedTracks = []) => {
    const refreshedByYoutubeId = new Map(refreshedTracks.filter((track) => track?.youtubeId).map((track) => [track.youtubeId, track]));
    const mergeResults = [];
    const mergedTracks = importedTracks.map((track) => {
      const refreshed = refreshedByYoutubeId.get(track.youtubeId);
      if (!refreshed) return track;
      const result = mergeVerifiedMetadata(track, normalizeTrackArtistCredits(refreshed));
      mergeResults.push({ youtubeId: track.youtubeId, ...result });
      return { ...result.track, importedAt: track.importedAt || result.track.importedAt };
    });
    setImportedTracks(mergedTracks);

    if (isSupabaseConfigured) {
      if (!authUser || accountRole !== 'admin') throw new Error('Only the Admin can save refreshed metadata to the shared catalogue.');
      const currentTracksByYoutubeId = new Map();
      mergeResults.forEach((result) => {
        if (result.youtubeId) currentTracksByYoutubeId.set(result.youtubeId, result.track);
      });
      const savedRows = await Promise.all([...currentTracksByYoutubeId.values()]
        .filter((track) => track.youtubeId && track.cloudSongId)
        .map((track) => updatePublishedSongMetadata(track, authUser.id)));
      const cloudByYoutubeId = new Map(savedRows.filter(Boolean).map((track) => [track.youtubeId, track]));
      if (cloudByYoutubeId.size) {
        setImportedTracks((previous) => previous.map((track) => {
          const saved = cloudByYoutubeId.get(track.youtubeId);
          return saved ? { ...track, ...saved, importedAt: track.importedAt || saved.importedAt } : track;
        }));
      }
    }

    const appliedCount = mergeResults.filter((result) => result.appliedFields.length > 0).length;
    const rejectedCount = mergeResults.filter((result) => result.rejectedFields.length > 0 && result.appliedFields.length === 0).length;
    setToast(`Metadata checked for ${mergeResults.length} song${mergeResults.length === 1 ? '' : 's'}; ${appliedCount} updated confidently${rejectedCount ? `, ${rejectedCount} uncertain result${rejectedCount === 1 ? '' : 's'} rejected and existing metadata kept` : ''}.`);
  };

  const handleAdminSaveSong = async (track, options = {}) => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account before editing songs.');
    const saved = await updatePublishedSongMetadata(track, authUser.id, options);
    if (!saved) throw new Error('The song could not be found in the shared cloud catalogue.');
    const normalized = normalizeTrackArtistCredits(saved);
    setImportedTracks((previous) => previous.map((item) => item.cloudSongId === normalized.cloudSongId ? { ...item, ...normalized } : item));
    setCloudCatalogueStatus('ready');
    setToast('Song details saved for all SURDHARA visitors');
    return normalized;
  };

  const handleAdminDeleteSong = async (track) => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account before deleting songs.');
    await deletePublishedSong(track, authUser.id);
    setImportedTracks((previous) => previous.filter((item) => item.cloudSongId !== track.cloudSongId));
    setToast('Song deleted from the shared SURDHARA catalogue');
  };

  const handleAdminSaveArtist = async (artist) => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account before editing artists.');
    const saved = await upsertPublishedArtist({ ...artist, userId: authUser.id });
    const nameKey = normalizeArtistKey(saved.name);
    setCloudArtists((previous) => [saved, ...previous.filter((item) => normalizeArtistKey(item.name) !== nameKey && item.cloudArtistId !== saved.cloudArtistId)]);
    setToast('Artist profile saved for all SURDHARA visitors');
    return saved;
  };

  const handleAdminDeleteArtist = async (artist) => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account before deleting artists.');
    await deletePublishedArtist(artist, authUser.id);
    setCloudArtists((previous) => previous.filter((item) => item.cloudArtistId !== artist.cloudArtistId));
    setToast('Artist profile removed from the shared catalogue');
  };

  const handleAdminSavePlaylist = async (playlist, options = {}) => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account before editing playlists.');
    const saved = await updatePublishedPlaylist(playlist, authUser.id, options);
    setYoutubePlaylists((previous) => previous.map((item) => item.cloudPlaylistId === saved.cloudPlaylistId ? { ...item, ...saved } : item));
    setToast('Shared playlist updated for all SURDHARA visitors');
    return saved;
  };

  const handleAdminDeletePlaylist = async (playlist) => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account before deleting playlists.');
    await deletePublishedPlaylist(playlist, authUser.id);
    setYoutubePlaylists((previous) => previous.filter((item) => item.cloudPlaylistId !== playlist.cloudPlaylistId));
    if (selectedPlaylistId === playlist.id) navigate('playlists');
    setToast('Shared playlist deleted');
  };

  const handleMigrateExistingBrowserImports = async () => {
    if (!cloudPublishingEnabled || !authUser) throw new Error('Sign in with the SURDHARA Admin account first.');
    setIsMigratingLegacy(true);
    setToast('Migrating older browser-only imports to cloud storage…');
    try {
      const legacyYoutubeTracks = (legacyImportedTracksRef.current || []).filter((track) => track.youtubeId || String(track.id || '').startsWith('yt-')).map((track) => normalizeTrackArtistCredits(track));
      const legacyYoutubePlaylists = legacyYoutubePlaylistsRef.current || [];
      let migratedYoutube = { tracks: [], playlists: [] };
      if (legacyYoutubeTracks.length || legacyYoutubePlaylists.length) {
        migratedYoutube = await publishYouTubeImport({ tracks: legacyYoutubeTracks, playlists: legacyYoutubePlaylists, userId: authUser.id, migrationMode: true });
      }

      const legacyLocalTracks = (legacyLocalTracksRef.current || []).filter((track) => !track.cloudPublished && !track.audioPath);
      const files = [];
      const tracksWithFiles = [];
      let missingAudio = 0;
      for (const track of legacyLocalTracks) {
        try {
          const file = await getStoredLocalAudioFile(track);
          if (file) {
            tracksWithFiles.push(track);
            files.push({ trackId: track.id, file });
          } else missingAudio += 1;
        } catch { missingAudio += 1; }
      }
      let migratedLocal = { tracks: [], playlists: [] };
      if (tracksWithFiles.length) {
        migratedLocal = await publishLocalImport({ tracks: tracksWithFiles, files, userId: authUser.id, migrationMode: true });
      }
      setImportedTracks((previous) => mergePublishedTracks(previous, [...migratedYoutube.tracks, ...migratedLocal.tracks]));
      if (migratedYoutube.playlists.length || migratedLocal.playlists.length) {
        setYoutubePlaylists((previous) => mergePublishedPlaylists(previous, [...migratedYoutube.playlists, ...migratedLocal.playlists]));
      }
      // Remove successfully handled items from this page's one-time migration queue.
      // Browser localStorage is retained, but the migration button won't re-upload these items.
      const migratedYoutubeIds = new Set(legacyYoutubeTracks.map((track) => track.youtubeId || (String(track.id || '').startsWith('yt-') ? String(track.id).slice(3) : '')).filter(Boolean));
      const migratedLocalIds = new Set(tracksWithFiles.map((track) => track.id));
      legacyImportedTracksRef.current = (legacyImportedTracksRef.current || []).filter((track) => {
        const youtubeId = track.youtubeId || (String(track.id || '').startsWith('yt-') ? String(track.id).slice(3) : '');
        return !migratedYoutubeIds.has(youtubeId);
      });
      legacyLocalTracksRef.current = (legacyLocalTracksRef.current || []).filter((track) => !migratedLocalIds.has(track.id));
      // Persist the reduced queue so a refresh does not offer already-migrated items again.
      try {
        window.localStorage.setItem(IMPORTED_TRACKS_KEY, JSON.stringify(legacyImportedTracksRef.current));
        window.localStorage.setItem(LOCAL_TRACKS_KEY, JSON.stringify(legacyLocalTracksRef.current));
      } catch { /* Cloud-side idempotency still prevents duplicate uploads if browser storage is unavailable. */ }
      // The queue is held in refs, which do not trigger React renders by themselves.
      // Explicitly refresh the UI so the button count disappears/reduces after migration.
      setLegacyMigrationRevision((revision) => revision + 1);

      const publishedCount = migratedYoutube.tracks.length + migratedLocal.tracks.length;
      const alreadyInCloud = Math.max(0, migratedYoutubeIds.size - migratedYoutube.tracks.length);
      setToast(`${publishedCount} new song${publishedCount === 1 ? '' : 's'} added to the public cloud catalogue${alreadyInCloud ? `; ${alreadyInCloud} existing YouTube song${alreadyInCloud === 1 ? '' : 's'} left unchanged` : ''}${missingAudio ? `; ${missingAudio} local file${missingAudio === 1 ? '' : 's'} could not be found in browser storage` : ''}`);
      return { publishedToCloud: true, tracks: publishedCount, alreadyInCloud, missingAudio };
    } catch (error) {
      setToast(error instanceof Error ? `Migration failed: ${error.message}` : 'Could not migrate older browser imports.');
      return { publishedToCloud: false };
    } finally {
      setIsMigratingLegacy(false);
    }
  };


  const addTrackToPlaylist = (playlistId, trackId) => {
    if (isSupabaseConfigured && !authUser) { setProfileModalOpen(true); setToast('Sign in to manage your personal playlists'); return; }
    if (isSupabaseConfigured && !personalLibraryReady) { setToast('Your personal library is still loading'); return; }
    const custom = customPlaylists.some((playlist) => playlist.id === playlistId);
    const targetPlaylist = allPlaylists.find((playlist) => playlist.id === playlistId);
    if (custom) {
      setCustomPlaylists((previous) => previous.map((playlist) => playlist.id === playlistId && !playlist.trackIds.includes(trackId)
        ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
        : playlist));
    } else {
      setPlaylistOverrides((previous) => {
        const existing = targetPlaylist?.isGlobal
          ? (previous[playlistId] || [])
          : (previous[playlistId] ?? targetPlaylist?.trackIds ?? []);
        return { ...previous, [playlistId]: [...new Set([...existing, trackId])] };
      });
      setPlaylistRemovals((previous) => ({
        ...previous,
        [playlistId]: (previous[playlistId] || []).filter((id) => id !== trackId),
      }));
    }
    setToast('Track added to playlist');
  };

  const removeTrackFromPlaylist = (playlistId, trackId) => {
    if (isSupabaseConfigured && !authUser) { setProfileModalOpen(true); setToast('Sign in to manage your personal playlists'); return; }
    if (isSupabaseConfigured && !personalLibraryReady) { setToast('Your personal library is still loading'); return; }
    const custom = customPlaylists.some((playlist) => playlist.id === playlistId);
    if (custom) {
      setCustomPlaylists((previous) => previous.map((playlist) => playlist.id === playlistId
        ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId) }
        : playlist));
    } else {
      setPlaylistRemovals((previous) => ({
        ...previous,
        [playlistId]: [...new Set([...(previous[playlistId] || []), trackId])],
      }));
      setPlaylistOverrides((previous) => previous[playlistId]
        ? { ...previous, [playlistId]: previous[playlistId].filter((id) => id !== trackId) }
        : previous);
    }
    setToast('Track removed from playlist');
  };

  const renamePlaylist = (playlist) => {
    const nextTitle = window.prompt('Rename playlist', playlist.title)?.trim();
    if (!nextTitle || nextTitle === playlist.title) return;
    if (playlist.isCustom) {
      setCustomPlaylists((previous) => previous.map((item) => item.id === playlist.id ? { ...item, title: nextTitle } : item));
    } else if (playlist.isYouTubeImport) {
      setYoutubePlaylists((previous) => previous.map((item) => item.id === playlist.id ? { ...item, title: nextTitle } : item));
    }
    setToast('Playlist renamed');
  };

  const deletePlaylist = (playlist) => {
    if (!window.confirm(`Delete “${playlist.title}”? This does not delete any song from your library.`)) return;
    if (playlist.isCustom) setCustomPlaylists((previous) => previous.filter((item) => item.id !== playlist.id));
    else if (playlist.isYouTubeImport) setYoutubePlaylists((previous) => previous.filter((item) => item.id !== playlist.id));
    setPlaylistOverrides((previous) => { const next = { ...previous }; delete next[playlist.id]; return next; });
    setPlaylistRemovals((previous) => { const next = { ...previous }; delete next[playlist.id]; return next; });
    if (selectedPlaylistId === playlist.id) navigate('playlists');
    setToast('Playlist deleted');
  };

  const getTracksByIds = (ids = []) => ids.map((id) => allTracks.find((track) => track.id === id)).filter(Boolean);
  const recentTracks = getTracksByIds(recent);
  const likedTracks = getTracksByIds(favorites);
  const personalizedTracks = useMemo(() => {
    const seedIds = new Set([...favorites, ...recent]);
    const artistWeights = new Map();
    const genreWeights = new Map();
    const languageWeights = new Map();
    favorites.forEach((id) => {
      const track = allTracks.find((item) => item.id === id);
      if (!track) return;
      getTrackArtistNames(track).forEach((name) => artistWeights.set(normalizeArtistKey(name), (artistWeights.get(normalizeArtistKey(name)) || 0) + 3));
      if (track.genre && track.genre !== 'Unclassified') genreWeights.set(track.genre.toLowerCase(), (genreWeights.get(track.genre.toLowerCase()) || 0) + 2);
      if (track.language && track.language !== 'Unknown') languageWeights.set(track.language.toLowerCase(), (languageWeights.get(track.language.toLowerCase()) || 0) + 1);
    });
    recent.forEach((id) => {
      const track = allTracks.find((item) => item.id === id);
      if (!track) return;
      getTrackArtistNames(track).forEach((name) => artistWeights.set(normalizeArtistKey(name), (artistWeights.get(normalizeArtistKey(name)) || 0) + 1));
      if (track.genre && track.genre !== 'Unclassified') genreWeights.set(track.genre.toLowerCase(), (genreWeights.get(track.genre.toLowerCase()) || 0) + 1);
      if (track.language && track.language !== 'Unknown') languageWeights.set(track.language.toLowerCase(), (languageWeights.get(track.language.toLowerCase()) || 0) + 0.5);
    });
    const score = (track) => {
      let result = 0;
      getTrackArtistNames(track).forEach((name) => { result += artistWeights.get(normalizeArtistKey(name)) || 0; });
      result += genreWeights.get(String(track.genre || '').toLowerCase()) || 0;
      result += languageWeights.get(String(track.language || '').toLowerCase()) || 0;
      return result;
    };
    const ranked = allTracks.filter((track) => !seedIds.has(track.id)).map((track) => ({ track, score: score(track), timestamp: Date.parse(track.importedAt || track.publishedAt || '') || 0 }));
    ranked.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
    return ranked.slice(0, 5).map((item) => item.track);
  }, [allTracks, favorites, recent]);
  const selectedPlaylistTracks = selectedPlaylist ? getTracksByIds(selectedPlaylist.trackIds) : [];
  const artistTracks = selectedArtist ? allTracks.filter((track) => {
    const selectedKey = normalizeArtistKey(selectedArtist.name);
    const names = getTrackArtistNames(track).map(normalizeArtistKey);
    return track.artistIds?.includes(selectedArtist.id) || names.includes(selectedKey);
  }) : [];

  const goToTrackArtist = (track) => {
    const names = getTrackArtistNames(track || {});
    const target = names.length ? allArtists.find((artist) => normalizeArtistKey(artist.name) === normalizeArtistKey(names[0])) : null;
    if (target) openArtist(target.id);
    else setToast('No verified singer profile is linked to this track yet');
  };

  const goToTrackAlbum = (track) => {
    const label = getAlbumLabel(track || {});
    const target = albumEntries.find((album) => normalizeArtistKey(album.title) === normalizeArtistKey(label));
    if (target) {
      commitNavigation({ page: 'album-detail', selectedPlaylistId: target.id, selectedArtistId: null, selectedLanguage: '' });
    } else setToast('No album or movie metadata is available for this song');
  };

  const shareTrack = async (track) => {
    const shareUrl = track?.videoUrl || track?.shareUrl || track?.sourceUrl || (track?.youtubeId ? `https://www.youtube.com/watch?v=${track.youtubeId}` : window.location.href);
    const shareData = { title: track?.title || 'SURDHARA track', text: `${track?.title || 'Music'} — ${track?.artist || 'Singer not identified'}`, url: shareUrl };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setToast('Share sheet opened');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setToast('Song link copied to clipboard');
      } else {
        window.prompt('Copy this song link:', shareUrl);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setToast('Could not share this track from the current browser');
    }
  };

  const downloadTrack = async (track) => {
    const rawUrl = track?.downloadUrl || track?.audioUrl || track?.downloadableAudioUrl || '';
    if (!rawUrl) {
      setToast(track?.youtubeId
        ? 'Download is unavailable for YouTube-hosted tracks. Use YouTube’s authorized offline options.'
        : 'No authorized downloadable audio file is attached to this track');
      return;
    }
    try {
      const url = new URL(rawUrl, window.location.href);
      if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw new Error('Unsupported download URL');
      const filename = `${String(track.title || 'SURDHARA track').replace(/[\/:*?"<>|]+/g, '-').slice(0, 100)}.${track.fileExtension || 'mp3'}`;
      if (url.protocol === 'blob:' || url.origin === window.location.origin) {
        const anchor = document.createElement('a');
        anchor.href = url.href;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setToast('Download started');
        return;
      }
      const response = await fetch(url.href);
      if (!response.ok) throw new Error('The audio host rejected the download');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      setToast('Download started');
    } catch {
      setToast('This host does not permit direct downloads from SURDHARA');
    }
  };
  // ---- Downloads/Surdhara (songs saved by the SURDHARA server, app.py) ----
  const downloaderStateRef = useRef('idle');
  downloaderStateRef.current = downloader.state;
  const downloaderInflightRef = useRef(false);
  const refreshDownloader = useCallback(async () => {
    if (downloaderInflightRef.current) return;
    downloaderInflightRef.current = true;
    setDownloader((previous) => (previous.state === 'online' ? previous : { ...previous, state: 'checking' }));
    try {
      const health = await checkServer();
      const listing = await fetchDeviceSongs();
      setDeviceSongs(listing.songs || []);
      setDownloader({ state: health.ytdlp ? 'online' : 'no-ytdlp', folder: listing.folder || health.folder || '', ffmpeg: health.ffmpeg });
      try { window.localStorage.setItem(DOWNLOADER_SEEN_KEY, '1'); } catch { /* the section still works without this hint */ }
    } catch {
      setDownloader((previous) => ({ ...previous, state: 'offline' }));
    } finally {
      downloaderInflightRef.current = false;
    }
  }, []);
  useEffect(() => {
    // On localhost, or once you have used the downloader, look for the server at start-up so the songs are ready.
    // Elsewhere we wait until you open the section, so visitors without the server never see a browser prompt.
    let seen = false;
    try { seen = window.localStorage.getItem(DOWNLOADER_SEEN_KEY) === '1'; } catch { /* ignore */ }
    if (seen || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) refreshDownloader();
  }, [refreshDownloader]);
  useEffect(() => { if (page === 'youtube-downloads') refreshDownloader(); }, [page, refreshDownloader]);
  useEffect(() => {
    // Files you add to / remove from the folder yourself show up when you come back to this tab.
    const onVisible = () => { if (document.visibilityState === 'visible' && downloaderStateRef.current === 'online') refreshDownloader(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshDownloader]);
  const handleDeviceSongSaved = (job) => {
    refreshDownloader();
    setToast(job.alreadyDownloaded ? `“${job.title}” is already in Downloads/Surdhara` : `“${job.title}” saved to Downloads/Surdhara`);
  };
  const deleteDeviceTrack = async (trackId) => {
    const track = deviceTracks.find((item) => item.id === trackId);
    if (!track) return;
    if (!window.confirm(`Delete “${track.title}” from your Downloads/Surdhara folder?\n\nThis removes the file from your computer.`)) return;
    try {
      await deleteDeviceSong(track.deviceFileName);
      setDeviceSongs((previous) => previous.filter((song) => song.filename !== track.deviceFileName));
      setToast('Song deleted from Downloads/Surdhara');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not delete this song');
    }
  };

  const activeNavPage = page === 'playlist-detail' ? 'playlists' : page === 'artist-detail' ? 'artists' : page === 'recent' ? 'library' : page;

  const trackTableProps = {
    currentTrackId, isPlaying, favorites, onPlay: handlePlayTrack, onToggleFavorite: toggleFavorite,
    playlistsList: allPlaylists, onAddToPlaylist: addTrackToPlaylist,
    onPlayNext: playTrackNext, onAddToQueue: addTrackToQueue, onGoToArtist: goToTrackArtist,
    onGoToAlbum: goToTrackAlbum, onShowDetails: setDetailsTrack, onShare: shareTrack, onDownload: downloadTrack,
    getTrackFlags, onToggleOffline: toggleOfflineSave,
    loading: cloudCatalogueStatus === 'loading' || catalogueMeta.status === 'partial',
  };

  const addSongsTarget = allPlaylists.find((playlist) => playlist.id === addSongsPlaylistId);
  const addSongsExistingIds = new Set(addSongsTarget?.trackIds || []);
  const addSongsCandidates = addSongsTarget
    ? allTracks.filter((track) => !addSongsExistingIds.has(track.id) && matchesSearch(addSongsSearch, getTrackSearchFields(track)))
    : [];

  const renderHome = () => (
    <>
      <section className="welcome-row">
        <div><span className="eyebrow-line"><Sparkles size={14} /> YOUR PERSONAL SOUNDTRACK</span><h1>{greeting}, listener<span className="greeting-period">.</span></h1><p>Find the feeling. Follow the sound.</p></div>
        <div className="welcome-date"><span className="welcome-dot" /> YOUR MUSIC SPACE</div>
      </section>

      <section className="hero-banner">
        <img src={playlists[0].cover} alt="" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <span className="hero-kicker"><span className="hero-kicker-dot" /> EDITOR'S FEATURE</span>
          <h2>Every feeling<br />has a <em>sound.</em></h2>
          <p>From late-night thoughts to brighter mornings, find the playlist that feels like you.</p>
          <div className="hero-actions"><button className="primary-button" onClick={() => openPlaylist('romantic-evening')}><Play size={16} fill="currentColor" /> Play featured mix</button><button className="hero-secondary-button" onClick={() => navigate('discover')}>Explore music <ArrowRight size={15} /></button></div>
        </div>
        <div className="hero-art-stack"><div className="hero-art-shadow" /><img src={playlists[0].cover} alt="Romantic Evening playlist cover" /><span className="hero-art-eq"><i /><i /><i /><i /></span></div>
        <span className="hero-index">01 <i /> 05</span>
      </section>

      <section className="content-section">
        <SectionTitle eyebrow="PICK YOUR MOOD" title="What are you feeling?" description="Choose a mood and let the music do the rest." icon={AudioLines} />
        <div className="mood-grid">
          {[
            { id: 'romantic', title: 'Romantic', subtitle: 'Warm & heartfelt', icon: '♡', className: 'mood-rose' },
            { id: 'chill', title: 'Chill', subtitle: 'Slow things down', icon: '〰', className: 'mood-blue' },
            { id: 'classic', title: 'Classics', subtitle: 'Timeless favorites', icon: '✦', className: 'mood-gold' },
            { id: 'all', title: 'Everything', subtitle: 'Follow the feeling', icon: '♫', className: 'mood-violet' },
          ].map((mood) => <button key={mood.id} className={`mood-card ${mood.className}`} onClick={() => { setActiveMood(mood.id); navigate('discover'); }}><span className="mood-symbol">{mood.icon}</span><span><strong>{mood.title}</strong><small>{mood.subtitle}</small></span><ArrowRight size={16} /></button>)}
        </div>
      </section>

      <section className="content-section">
        <SectionTitle eyebrow="HANDPICKED FOR YOU" title="Featured playlists" description="Curated collections for every kind of moment." icon={ListMusic} actionLabel="All playlists" onAction={() => navigate('playlists')} />
        <div className="playlist-grid">{[...allPlaylists.filter((playlist) => playlist.isFeatured), ...allPlaylists.filter((playlist) => playlist.isGlobal && playlist.trackIds.length > 0)].slice(0, 4).map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onClick={openPlaylist} />)}</div>
      </section>

      <section className="content-section">
        <SectionTitle eyebrow="BASED ON YOUR LISTENING" title="Recommended for you" description={favorites.length || recent.length ? 'Picked from the singers, genres and languages you like.' : 'Like songs and play music to build your personal recommendations.'} icon={Sparkles} actionLabel="Explore tracks" onAction={() => navigate('discover')} />
        <TrackTable list={personalizedTracks} {...trackTableProps} emptyTitle="Your recommendations are warming up" emptyText="Like a few songs or play tracks to personalize this section." />
      </section>

      <section className="content-section">
        <SectionTitle eyebrow="ON REPEAT" title="Trending tracks" description="Songs from across your SURDHARA library." icon={TrendingUp} actionLabel="Explore tracks" onAction={() => navigate('songs')} />
        <TrackTable list={[...recentlyAddedTracks, ...demoTracks].slice(0, 4)} {...trackTableProps} />
      </section>

      {recentlyAddedTracks.length > 0 && <section className="content-section">
        <SectionTitle eyebrow="FRESHLY IMPORTED" title="Recently added" description="Your latest device and YouTube imports, now part of your music library." icon={Clock3} actionLabel="View all" onAction={() => navigate('recently-added')} />
        <TrackTable list={recentlyAddedTracks.slice(0, 5)} {...trackTableProps} />
      </section>}

      <section className="content-section last-section">
        <SectionTitle eyebrow="VOICES TO KNOW" title="Popular artists" description="Meet the voices behind the songs." icon={MicVocal} actionLabel="All artists" onAction={() => navigate('artists')} />
        <div className="artist-grid">{allArtists.slice(0, 6).map((artist) => <ArtistCard key={artist.id} artist={artist} onClick={openArtist} />)}</div>
      </section>
    </>
  );

  const renderDiscover = () => {
    const hasQuery = searchTerms(query).length > 0;
    const matchedSongIds = new Set(filteredTracks.map((track) => track.id));
    const matchedAlbums = albumEntries.filter((album) => !hasQuery
      ? true
      : matchesSearch(query, [album.title]) || album.trackIds.some((id) => matchedSongIds.has(id)))
      .slice(0, hasQuery ? undefined : 8);
    const matchedPlaylists = allPlaylists.filter((playlist) => {
      if (!hasQuery) return Boolean(playlist.trackIds?.length) && (playlist.isCustom || playlist.isYouTubeImport || playlist.isFeatured);
      return matchesSearch(query, [playlist.title, playlist.subtitle, playlist.description, playlist.collection])
        || (playlist.trackIds || []).some((id) => matchedSongIds.has(id));
    }).slice(0, hasQuery ? undefined : 8);
    const collectionCards = [
      ...matchedAlbums.map((album) => ({ ...album, discoverKind: 'album', id: album.id })),
      ...matchedPlaylists.map((playlist) => ({ ...playlist, discoverKind: 'playlist' })),
    ];
    const matchedArtists = allArtists.filter((artist) => !hasQuery
      ? true
      : matchesSearch(query, [artist.name]) || filteredTracks.some((track) =>
        getTrackArtistNames(track).some((name) => normalizeArtistKey(name) === normalizeArtistKey(artist.name))))
      .slice(0, hasQuery ? undefined : 8);

    return <>
      <section className="page-heading discover-heading">
        <span className="section-eyebrow"><Compass size={14} /> DISCOVER</span>
        <h1>Discover</h1>
        <h2>Find your next favorites</h2>
        <p>Explore tracks by title, artist, album, movie, or mood.</p>
      </section>
      <div className="filter-chips">{moods.map((mood) => <button key={mood.id} className={activeMood === mood.id ? 'filter-chip active' : 'filter-chip'} onClick={() => setActiveMood(mood.id)}>{mood.label}</button>)}</div>

      <section className="content-section discover-results-section">
        <SectionTitle title={hasQuery ? 'Matched Albums & Playlists' : 'Explore Albums & Playlists'} description={`${collectionCards.length} ${collectionCards.length === 1 ? 'collection' : 'collections'}${hasQuery ? ` matching “${query}”` : ' to explore'}`} />
        {collectionCards.length ? <div className="playlist-grid discover-collection-grid">{collectionCards.map((entry) => <PlaylistCard key={`${entry.discoverKind}-${entry.id}`} playlist={entry} onClick={() => {
          if (entry.discoverKind === 'album') commitNavigation({ page: 'album-detail', selectedPlaylistId: entry.id, selectedArtistId: null, selectedLanguage: '' });
          else openPlaylist(entry.id);
        }} />)}</div> : <p className="discover-empty-hint">No albums or playlists match this search.</p>}
      </section>

      <section className="content-section discover-results-section">
        <SectionTitle eyebrow="SINGER PROFILES" title="Matched Artists" description="Choose a singer to open their track collection." icon={MicVocal} />
        {matchedArtists.length ? <div className="artist-grid discover-artist-grid">{matchedArtists.map((artist) => <ArtistCard key={artist.id} artist={artist} onClick={openArtist} />)}</div> : <p className="discover-empty-hint">No artists match this search.</p>}
      </section>

      <section className="content-section discover-results-section last-section">
        <SectionTitle title={hasQuery ? 'Matched Songs' : 'Songs to Explore'} description={`${filteredTracks.length} ${filteredTracks.length === 1 ? 'song' : 'songs'}${hasQuery ? ` matching “${query}”` : ' in your library'}`} />
        <TrackTable list={filteredTracks} {...trackTableProps} emptyTitle="No matching songs" emptyText="Try a shorter title, another singer name, a movie, or an album." />
      </section>
    </>;
  };


  const renderSongs = () => (
    <>
      <section className="page-heading"><span className="section-eyebrow"><Music2 size={14} /> YOUR MUSIC CATALOGUE</span><h1>All songs</h1><p>Built-in and imported tracks together in one searchable library.</p></section>
      <section className="content-section"><TrackTable list={allTracks} {...trackTableProps} emptyTitle="No songs yet" emptyText="Import songs from your device or YouTube to add music to your library." action="Import Songs" onAction={() => navigate('importer')} /></section>
    </>
  );

  const renderRecentlyAdded = () => (
    <>
      <section className="page-heading"><span className="section-eyebrow"><Clock3 size={14} /> NEW IN YOUR LIBRARY</span><h1>Recently added</h1><p>New imports, with song details matched against independent music catalogues when available.</p></section>
      <TrackTable list={recentlyAddedTracks} {...trackTableProps} emptyTitle="Nothing added yet" emptyText="Import songs from your device or YouTube and tracks will appear here." action="Import Songs" onAction={() => navigate('importer')} />
    </>
  );

  const renderPlaylists = () => {
    const userAndImportedPlaylists = allPlaylists.filter((playlist) => playlist.isCustom || playlist.isYouTubeImport);
    const featuredPlaylists = allPlaylists.filter((playlist) => playlist.isFeatured);
    const globalCollections = [...new Set(allPlaylists.filter((playlist) => playlist.isGlobal).map((playlist) => playlist.collection))];
    return (
      <>
        <section className="page-heading page-heading-actions"><div><span className="section-eyebrow"><ListMusic size={14} /> COLLECTIONS</span><h1>Playlists</h1><p>Explore organized music collections, imported playlists, and your own mixes.</p></div><div className="playlist-header-actions"><button className="subtle-button" onClick={() => navigate('importer')}><Music2 size={16} /> Import Songs</button><button className="primary-button" onClick={createPlaylist}><Plus size={17} /> Create playlist</button></div></section>
        {userAndImportedPlaylists.length > 0 && <section className="content-section playlist-collection-section"><SectionTitle eyebrow="YOUR COLLECTIONS" title="Your & imported playlists" description="Personal playlists and playlists brought in from supported sources." /><div className="playlist-grid playlist-grid-large">{userAndImportedPlaylists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onClick={openPlaylist} />)}</div></section>}
        {featuredPlaylists.length > 0 && <section className="content-section playlist-collection-section"><SectionTitle eyebrow="SURDHARA PICKS" title="Featured playlists" description="The original Surdhara mixes, connected to your growing music library." /><div className="playlist-grid playlist-grid-large">{featuredPlaylists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onClick={openPlaylist} />)}</div></section>}
        {globalCollections.map((collection) => {
          const collectionPlaylists = allPlaylists.filter((playlist) => playlist.isGlobal && playlist.collection === collection);
          return <section className="content-section playlist-collection-section" key={collection}><SectionTitle eyebrow="GLOBAL PLAYLIST COLLECTION" title={collection} description={`${collectionPlaylists.length} playable playlists. Tracks are added only when available metadata supports the category.`} /><div className="playlist-grid playlist-grid-large">{collectionPlaylists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onClick={openPlaylist} />)}</div></section>;
        })}
      </>
    );
  };

  const renderPlaylistDetail = () => selectedPlaylist ? (
    <>
      <section className="detail-hero playlist-detail-hero"><div className="detail-cover"><img src={selectedPlaylist.cover} alt="" /></div><div className="detail-copy"><span className="section-eyebrow">PLAYLIST · {selectedPlaylist.isCustom ? 'YOUR COLLECTION' : selectedPlaylist.isYouTubeImport ? 'IMPORTED COLLECTION' : 'CURATED MIX'}</span><h1>{selectedPlaylist.title}</h1><p>{selectedPlaylist.description}</p><div className="detail-meta"><span><Music2 size={14} /> {selectedPlaylistTracks.length} tracks</span><span><Clock3 size={14} /> About {Math.max(1, Math.round(selectedPlaylistTracks.length * 4.3))} min</span></div><div className="detail-actions playlist-manage-actions"><button className="primary-button" disabled={!selectedPlaylistTracks.length} onClick={() => selectedPlaylistTracks[0] && handlePlayTrack(selectedPlaylistTracks[0])}><Play size={16} fill="currentColor" /> Play playlist</button><button className="subtle-button" onClick={() => { setAddSongsPlaylistId(selectedPlaylist.id); setAddSongsSearch(''); setRemovePlaylistSongsMode(false); }}><ListPlus size={16} /> Add songs</button><button className={`subtle-button ${removePlaylistSongsMode ? 'is-active' : ''}`} onClick={() => setRemovePlaylistSongsMode((value) => !value)}><Trash2 size={16} /> {removePlaylistSongsMode ? 'Done removing' : 'Remove songs'}</button></div></div></section>
      {removePlaylistSongsMode && <p className="playlist-removal-notice"><Trash2 size={14} /> Select the remove icon beside any track, or use its three-dots menu, to remove it from this playlist.</p>}
      <section className="content-section"><SectionTitle eyebrow="THE TRACKLIST" title="All tracks" description="Use the three-dots menu to manage tracks, credits, and playback order." /><TrackTable list={selectedPlaylistTracks} {...trackTableProps} removeMode={removePlaylistSongsMode} onRemoveFromPlaylist={(trackId) => removeTrackFromPlaylist(selectedPlaylist.id, trackId)} emptyTitle="This playlist is empty" emptyText="Use Add songs to bring tracks into this playlist." /></section>
    </>
  ) : <EmptyState title="Playlist not found" text="Choose a playlist from your collections." action="Browse playlists" onAction={() => navigate('playlists')} />;

  const renderArtists = () => (
    <>
      <section className="page-heading"><span className="section-eyebrow"><MicVocal size={14} /> THE PEOPLE BEHIND THE MUSIC</span><h1>Artists</h1><p>Explore the voices behind your favorite tracks.</p></section>
      <div className="artist-grid artist-grid-large">{allArtists.map((artist) => <ArtistCard key={artist.id} artist={artist} onClick={openArtist} />)}</div>
    </>
  );

  const renderArtistDetail = () => selectedArtist ? (
    <>
      <section className="detail-hero artist-detail-hero"><div className="artist-detail-image">{selectedArtist.image ? <img src={selectedArtist.image} alt="" /> : <span className="artist-photo-empty" aria-hidden="true" />}</div><div className="detail-copy"><span className="section-eyebrow"><BadgeCheck size={14} /> ARTIST PROFILE</span><h1>{selectedArtist.name}</h1><p>{selectedArtist.bio}</p><div className="detail-meta"><span><Music2 size={14} /> {artistTracks.length} tracks in SURDHARA</span></div><div className="detail-actions"><button className="primary-button" disabled={!artistTracks.length} onClick={() => artistTracks[0] && handlePlayTrack(artistTracks[0])}><Play size={16} fill="currentColor" /> Play top track</button></div></div></section>
      <section className="content-section"><SectionTitle eyebrow="ARTIST CATALOGUE" title={`Tracks by ${selectedArtist.name}`} description="Explore the tracks currently listed for this artist." /><TrackTable list={artistTracks} {...trackTableProps} /></section>
    </>
  ) : <EmptyState title="Artist not found" text="Choose an artist from the directory." action="Browse artists" onAction={() => navigate('artists')} />;

  const renderLibrary = () => (
    <>
      <section className="page-heading"><span className="section-eyebrow"><LibraryBig size={14} /> YOUR COLLECTION</span><h1>Your library</h1><p>Your recent listening and saved music, all in one place.</p></section>
      <section className="content-section"><SectionTitle title="Recently played" description="Pick up where you left off." actionLabel="View history" onAction={() => navigate('recent')} />{recentTracks.length ? <TrackTable list={recentTracks} {...trackTableProps} /> : <EmptyState icon={Clock3} title="No listening history yet" text="Play a track and it will appear here." action="Discover music" onAction={() => navigate('discover')} />}</section>
      <section className="content-section"><SectionTitle title="Liked songs" description={`${likedTracks.length} saved ${likedTracks.length === 1 ? 'track' : 'tracks'}.`} actionLabel="View all" onAction={() => navigate('liked')} />{likedTracks.length ? <TrackTable list={likedTracks} {...trackTableProps} /> : <EmptyState icon={Heart} title="Your favorites live here" text="Use the heart icon beside any track to save it." action="Explore tracks" onAction={() => navigate('discover')} />}</section>
      <section className="content-section"><SectionTitle title="Recently added" description="Your latest imports, integrated into the library." actionLabel="View all" onAction={() => navigate('recently-added')} />{recentlyAddedTracks.length ? <TrackTable list={recentlyAddedTracks.slice(0, 5)} {...trackTableProps} /> : <EmptyState icon={Clock3} title="No recent additions" text="Imported songs will appear in this section." action="Import Songs" onAction={() => navigate('importer')} />}</section>
      <section className="content-section"><SectionTitle title="All songs" description={`${allTracks.length} tracks available in your music library.`} actionLabel="View all" onAction={() => navigate('songs')} /><TrackTable list={allTracks.slice(0, 5)} {...trackTableProps} /></section>
      <section className="content-section"><SectionTitle title="Your playlists" actionLabel="Manage playlists" onAction={() => navigate('playlists')} /><div className="playlist-grid">{allPlaylists.slice(0, 3).map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onClick={openPlaylist} />)}</div></section>
    </>
  );

  const renderLiked = () => (
    <>
      <section className="detail-hero liked-hero"><div className="liked-hero-icon"><Heart size={46} fill="currentColor" /></div><div className="detail-copy"><span className="section-eyebrow">YOUR PERSONAL COLLECTION</span><h1>Liked songs</h1><p>The tracks you want to keep close, ready whenever you are.</p><div className="detail-meta"><span><Heart size={14} /> {likedTracks.length} saved tracks</span></div><div className="detail-actions"><button className="primary-button" disabled={!likedTracks.length} onClick={() => likedTracks[0] && handlePlayTrack(likedTracks[0])}><Play size={16} fill="currentColor" /> Play liked songs</button></div></div></section>
      <TrackTable list={likedTracks} {...trackTableProps} emptyTitle="Nothing liked yet" emptyText="Tap the heart beside a track and it will show up here." action="Explore music" onAction={() => navigate('discover')} />
    </>
  );

  const savedOfflineTracks = allTracks.filter((track) => track.audioUrl && offlineAudio.saved.has(normalizeAudioUrl(track.audioUrl)));
  const formatMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 * 100 ? 0 : 1)} MB`;
  const renderOffline = () => (
    <>
      <section className="page-heading"><span className="section-eyebrow"><DownloadCloud size={14} /> LISTEN WITHOUT INTERNET</span><h1>Saved offline</h1><p>Songs you saved play instantly, use no mobile data, and keep working when the connection drops.{offlineAudio.quota ? ` Device storage in use: ${formatMB(offlineAudio.usage)} of ${formatMB(offlineAudio.quota)} available to SURDHARA.` : ''}</p>
        {savedOfflineTracks.length > 0 && <button type="button" className="subtle-button" onClick={async () => { await clearAllOfflineAudio(); setToast('All offline songs removed'); }}>Remove all saved songs</button>}
      </section>
      <TrackTable list={savedOfflineTracks} {...trackTableProps} emptyTitle="No songs saved yet" emptyText="Open the ••• menu on a song hosted by SURDHARA and choose “Save for offline”. Songs that stream from YouTube can’t be saved." action="Browse songs" onAction={() => navigate('songs')} />
    </>
  );

  const renderRecent = () => (
    <>
      <section className="page-heading"><span className="section-eyebrow"><Clock3 size={14} /> YOUR HISTORY</span><h1>Recently played</h1><p>Your latest listening, in the order you played it.</p></section>
      <TrackTable list={recentTracks} {...trackTableProps} emptyTitle="Nothing played yet" emptyText="Your listening history will appear here after you play a track." />
    </>
  );

  const renderAlbums = () => <>
    <section className="page-heading"><span className="section-eyebrow"><Disc3 size={14} /> ALBUMS & SOUNDTRACKS</span><h1>Albums and soundtracks</h1><p>Browse tracks by their album or movie soundtrack.</p></section>
    {albumEntries.length ? <div className="playlist-grid playlist-grid-large">{albumEntries.map((entry) => <PlaylistCard key={entry.id} playlist={entry} onClick={() => commitNavigation({ page: 'album-detail', selectedPlaylistId: entry.id, selectedArtistId: null, selectedLanguage: '' })} />)}</div> : <EmptyState icon={Disc3} title="No confirmed albums yet" text="Albums appear when metadata identifies a movie or album name." />}
  </>;


  const renderLanguages = () => {
    const languageTracks = allTracks.filter((track) => track.language && track.language !== 'Unknown');
    const languageNames = [...new Set(languageTracks.map((track) => track.language))].sort((a, b) => a.localeCompare(b));
    if (selectedLanguage) {
      const matchingTracks = languageTracks.filter((track) => track.language === selectedLanguage);
      return <>
        <section className="page-heading page-heading-actions">
          <div><span className="section-eyebrow"><Languages size={14} /> MUSIC BY LANGUAGE</span><h1>{selectedLanguage}</h1><p>{matchingTracks.length} track{matchingTracks.length === 1 ? '' : 's'} identified as {selectedLanguage}. Language can be catalogued or inferred from the script when catalogue details are missing.</p></div>
          <button className="subtle-button" onClick={() => setSelectedLanguage('')}>All languages</button>
        </section>
        <TrackTable list={matchingTracks} {...trackTableProps} emptyTitle="No tracks in this language" emptyText="Import more music or choose another language." />
      </>;
    }
    return <>
      <section className="page-heading"><span className="section-eyebrow"><Languages size={14} /> MUSIC BY LANGUAGE</span><h1>Languages</h1><p>Explore tracks using language information matched from music catalogues or inferred from the song title's script.</p></section>
      {languageNames.length ? <div className="playlist-grid playlist-grid-large">{languageNames.map((language) => {
        const items = languageTracks.filter((track) => track.language === language);
        return <PlaylistCard key={language} playlist={{ id: `language-${language}`, title: language, subtitle: `${items.length} track${items.length === 1 ? '' : 's'}`, description: `Music identified as ${language}.`, cover: items[0]?.cover || playlists[0].cover }} onClick={() => setSelectedLanguage(language)} />;
      })}</div> : <EmptyState icon={Languages} title="No language metadata yet" text="Imported tracks will appear here when a music catalogue provides a language or the title script identifies one." action="Import Songs" onAction={() => navigate('importer')} />}
    </>;
  };

  const renderAlbumDetail = () => {
    const album = albumEntries.find((item) => item.id === selectedPlaylistId);
    const albumTracks = album ? getTracksByIds(album.trackIds) : [];
    return <>
      <section className="detail-hero playlist-detail-hero"><div className="detail-cover"><img src={albumTracks[0]?.cover || allTracks[0].cover} alt="" /></div><div className="detail-copy"><span className="section-eyebrow">ALBUM / SOUNDTRACK</span><h1>{album?.title || 'Album'}</h1><p>A soundtrack collection in SURDHARA.</p><div className="detail-meta"><span><Music2 size={14} /> {albumTracks.length} tracks</span></div><div className="detail-actions"><button className="primary-button" disabled={!albumTracks.length} onClick={() => albumTracks[0] && handlePlayTrack(albumTracks[0])}><Play size={16} fill="currentColor" /> Play album</button></div></div></section>
      <TrackTable list={albumTracks} {...trackTableProps} />
    </>;
  };

  const renderYouTubeDownloads = () => (
    <>
      <section className="page-heading">
        <span className="section-eyebrow"><FolderDown size={14} /> DOWNLOADS / SURDHARA</span>
        <h1>YouTube Downloads</h1>
        <p>{downloader.state === 'online' && !downloader.folder ? 'Paste a YouTube link to save the song as an M4A file on this device. You can add it to SURDHARA afterwards with Import songs.' : 'Paste a YouTube link to keep the song as an M4A file on your computer. Every song inside your Downloads/Surdhara folder is listed here and plays right in SURDHARA.'}</p>
      </section>
      <SongDownloader serverState={downloader.state} folder={downloader.folder} ffmpeg={downloader.ffmpeg} onRecheck={refreshDownloader} onSongSaved={handleDeviceSongSaved} />
      {!(downloader.state === 'online' && !downloader.folder) && (
      <section className="content-section">
        <div className="section-title-row downloader-songs-head">
          <div className="section-title-copy"><h2>Your downloaded songs</h2><p>{deviceTracks.length ? `${deviceTracks.length} song${deviceTracks.length === 1 ? '' : 's'} in your Downloads/Surdhara folder.` : 'Songs you download appear here.'}</p></div>
          <div className="downloader-section-actions">
            <button type="button" className="subtle-button" onClick={refreshDownloader} disabled={downloader.state === 'checking'}><RefreshCw size={14} /> Refresh</button>
            {deviceTracks.length > 0 && <button type="button" className="primary-button" onClick={() => handlePlayTrack(deviceTracks[0])}><Play size={15} fill="currentColor" /> Play all</button>}
          </div>
        </div>
        <TrackTable
          list={deviceTracks} {...trackTableProps} loading={false}
          removeMode onRemoveFromPlaylist={deleteDeviceTrack} removeLabel="Delete from Downloads/Surdhara"
          emptyTitle={downloader.state === 'online' ? 'No downloaded songs yet' : 'Songs from Downloads/Surdhara will show here'}
          emptyText={downloader.state === 'online' ? 'Paste a YouTube link above and the song will be saved and listed here.' : 'Start the SURDHARA server (see above) to download songs and see everything saved in your Downloads/Surdhara folder.'}
        />
      </section>
      )}
    </>
  );

  const pageContent = () => {
    switch (page) {
      case 'youtube-downloads': return renderYouTubeDownloads();
      case 'discover': return renderDiscover();
      case 'songs': return renderSongs();
      case 'offline': return renderOffline();
      case 'recently-added': return renderRecentlyAdded();
      case 'playlists': return renderPlaylists();
      case 'importer':
        if (isSupabaseConfigured && accountRole !== 'admin') {
          return <EmptyState icon={ShieldCheck} title="Admin access required" text="Sign in with the SURDHARA administrator account to import songs and manage the public catalogue." action="Open profile" onAction={() => setProfileModalOpen(true)} />;
        }
        return <ImportSongsPage
          existingTracks={allTracks}
          onImported={handleImportedPlaylist}
          onOpenPlaylist={openPlaylist}
          onRefreshMetadata={handleRefreshedMetadata}
          onImportedLocal={handleImportedLocal}
          cloudConfigured={isSupabaseConfigured}
          cloudStatus={cloudCatalogueStatus}
          cloudPublishingEnabled={cloudPublishingEnabled}
          onMigrateExisting={handleMigrateExistingBrowserImports}
          legacyImportCount={(legacyImportedTracksRef.current || []).filter((track) => track.youtubeId || String(track.id || '').startsWith('yt-')).length + (legacyLocalTracksRef.current || []).filter((track) => !track.cloudPublished && !track.audioPath).length}
          isMigratingLegacy={isMigratingLegacy}
          cloudError={cloudCatalogueError}
        />;
      case 'admin-catalog':
        if (isSupabaseConfigured && accountRole !== 'admin') {
          return <EmptyState icon={ShieldCheck} title="Admin access required" text="Only the designated SURDHARA administrator can modify songs, artist pages, artwork and shared playlists." action="Open profile" onAction={() => setProfileModalOpen(true)} />;
        }
        return <AdminCatalogManager
          songs={importedTracks.filter((track) => track.cloudSongId)}
          artists={allArtists}
          playlists={youtubePlaylists.filter((playlist) => playlist.isPublishedCatalog && playlist.cloudPlaylistId)}
          enabled={cloudPublishingEnabled && cloudCatalogueStatus === 'ready'}
          onSaveSong={handleAdminSaveSong}
          onDeleteSong={handleAdminDeleteSong}
          onSaveArtist={handleAdminSaveArtist}
          onDeleteArtist={handleAdminDeleteArtist}
          onSavePlaylist={handleAdminSavePlaylist}
          onDeletePlaylist={handleAdminDeletePlaylist}
        />;
      case 'playlist-detail': return renderPlaylistDetail();
      case 'artists': return renderArtists();
      case 'artist-detail': return renderArtistDetail();
      case 'library': return renderLibrary();
      case 'liked': return renderLiked();
      case 'recent': return renderRecent();
      case 'albums': return renderAlbums();
      case 'languages': return renderLanguages();
      case 'album-detail': return renderAlbumDetail();
      default: return renderHome();
    }
  };

  const priorityQueueTracks = queuedTrackIds.map((id) => allTracks.find((track) => track.id === id)).filter(Boolean);
  const fallbackUpcomingTracks = (() => {
    const currentIndex = Math.max(0, allTracks.findIndex((track) => track.id === currentTrackId));
    return [...allTracks.slice(currentIndex + 1), ...allTracks.slice(0, currentIndex)].filter((track) => track.id !== currentTrackId);
  })();
  const upcomingTracks = [...priorityQueueTracks, ...fallbackUpcomingTracks.filter((track) => !queuedTrackIds.includes(track.id))].slice(0, 4);
  const queueTracksForPlayer = [currentTrack, ...priorityQueueTracks, ...fallbackUpcomingTracks.filter((track) => !queuedTrackIds.includes(track.id))]
    .filter((track, index, list) => track && list.findIndex((candidate) => candidate?.id === track.id) === index);
  return (
    <div className="app-shell">
      <Sidebar
        activePage={activeNavPage}
        onNavigate={navigate}
        playlists={allPlaylists}
        onOpenPlaylist={openPlaylist}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onCreatePlaylist={createPlaylist}
        onShowRecent={() => navigate('recent')}
        onRenamePlaylist={renamePlaylist}
        onDeletePlaylist={deletePlaylist}
        canManageCatalog={canManageCatalog}
        showOffline={offlineAudio.supported && (offlineAudio.saved.size > 0 || allTracks.some((track) => track.audioUrl && !track.deviceDownload))}
      />

      <main className="main-column">
        <Header
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={handleSearchSubmit}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onOpenProfile={() => setProfileModalOpen(true)}
          user={authUser}
          role={accountRole}
          searchOpen={mobileSearchOpen}
          onToggleSearch={() => setMobileSearchOpen((open) => !open)}
          theme={theme}
          onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
          canInstall={canInstall}
          onInstall={installApp}
        />

        <div className="workspace-grid">
          <div className="page-content" key={page}>{pageContent()}</div>
          <aside className="right-rail">
            <UnifiedAudioPlayer
              ref={playerRef}
              track={currentTrack}
              autoplayKey={autoplayKey}
              volume={volume}
              muted={muted}
              onPlayingChange={setIsPlaying}
              onEnded={handleTrackEnded}
              onPlaybackError={handlePlaybackError}
              onStall={handleStall}
              onPlaybackStarted={handlePlaybackStarted}
              onProgress={(time, total) => { setCurrentTime(time); setDuration(total || currentTrack.durationSeconds || 0); }}
            />
            <section className="up-next-card">
              <div className="up-next-heading"><div><span className="section-eyebrow">YOUR NEXT LISTEN</span><h3>Up next</h3></div><button className="tiny-icon-button" onClick={() => navigate('discover')} aria-label="Browse tracks"><ArrowRight size={16} /></button></div>
              <div className="up-next-list">{upcomingTracks.map((track) => <button key={track.id} className="up-next-track" onClick={() => handlePlayTrack(track)}><img src={track.cover} alt="" /><span className="up-next-copy"><strong>{track.title}</strong><small>{track.artist || 'Singer not identified'}</small></span><Play size={14} fill="currentColor" /></button>)}</div>
              <button className="up-next-browse" onClick={() => navigate('discover')}>Browse all tracks <ArrowRight size={14} /></button>
            </section>
            <div className="rail-note"><span><Sparkles size={15} /></span><p><strong>A little note</strong>Choose tracks from any playlist to update your player and listening queue.</p></div>
          </aside>
        </div>
        <footer className="site-footer"><span>© {new Date().getFullYear()} SURDHARA</span><span>Made for the love of music</span><span className="footer-built"><span /> Built to adapt to your screen</span></footer>
      </main>

      <MobileNav activePage={activeNavPage} onNavigate={navigate} />
      <PlayerDock
        track={currentTrack}
        isPlaying={isPlaying}
        liked={favorites.includes(currentTrack.id)}
        onToggleLike={toggleFavorite}
        onTogglePlayback={togglePlayback}
        onPrevious={() => stepTrack(-1)}
        onNext={() => stepTrack(1)}
        onOpenQueue={() => {}}
        currentTime={currentTime}
        duration={duration}
        onSeek={(value) => seekToSeconds(value)}
        sleepTimer={sleepTimer}
        onSetSleepTimer={setSleepTimer}
        playbackNote={!online ? 'OFFLINE' : ''}
        shuffleEnabled={shuffleEnabled}
        onToggleShuffle={() => setShuffleEnabled((value) => !value)}
        repeatMode={repeatMode}
        onCycleRepeat={() => setRepeatMode((mode) => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off')}
        volume={volume}
        muted={muted}
        onVolumeChange={(value) => { setVolume(value); if (value > 0 && muted) setMuted(false); }}
        onToggleMute={() => setMuted((value) => !value)}
        queueTracks={queueTracksForPlayer}
        onPlayTrack={handlePlayTrack}
        playlistsList={allPlaylists}
        onAddToPlaylist={addTrackToPlaylist}
        backgroundPlay={backgroundPlay}
        onToggleBackgroundPlay={() => setBackgroundPlay((value) => {
          const next = !value;
          try { window.localStorage.setItem('surdhara-background-play', next ? 'on' : 'off'); } catch { /* storage unavailable */ }
          setToast(next ? 'Background play on — music keeps playing when you leave the app.' : 'Background play off.');
          return next;
        })}
      />

      {toast && <div className="toast" role="status"><Check size={16} /> {toast}</div>}
      <NetworkBanner
        online={online}
        justReconnected={justReconnected}
        catalogue={catalogueMeta}
        librarySync={librarySync}
        hasSavedSongs={offlineAudio.saved.size > 0}
        onOpenSaved={() => navigate('offline')}
        onRetry={() => catalogueSyncRef.current?.refresh({ force: true })}
        updateReady={Boolean(updateRegistration)}
        onUpdate={() => applyServiceWorkerUpdate(updateRegistration)}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <ProfileAuthModal
        open={profileModalOpen}
        user={authUser}
        role={accountRole}
        configured={isSupabaseConfigured}
        loading={authLoading || roleLoading}
        roleError={accountRoleError}
        authError={authError}
        onClose={() => setProfileModalOpen(false)}
        onSignIn={handleProviderSignIn}
        onSignOut={handleSignOut}
      />

      {detailsTrack && <div className="modal-scrim track-details-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsTrack(null); }}>
        <section className="track-details-modal" role="dialog" aria-modal="true" aria-label={`Song credits for ${detailsTrack.title}`}>
          <button className="modal-close icon-button" onClick={() => setDetailsTrack(null)} aria-label="Close song details"><X size={18} /></button>
          <span className="modal-icon"><Info size={22} /></span>
          <span className="section-eyebrow">SONG CREDITS & DETAILS</span>
          <h2>{detailsTrack.title}</h2>
          <p className="track-details-byline">{getTrackArtistNames(detailsTrack).join(' & ') || 'Singer not identified'}</p>
          <div className="track-details-list">
            {[
              ['Singer', getTrackArtistNames(detailsTrack).join(' & ')],
              ['Original Singer', detailsTrack.originalSingerNames?.join(' & ') || detailsTrack.originalSinger],
              ['Cover Status', detailsTrack.coverStatus === 'confirmed-cover' ? 'Confirmed cover' : detailsTrack.coverStatus === 'likely-cover' ? 'Likely cover' : detailsTrack.coverStatus === 'cover-indicated' ? 'Cover indicated by source' : 'Not enough reliable evidence'],
              ['Cover Evidence', (detailsTrack.coverEvidence || []).join('; ')],
              ['Original Recording', [detailsTrack.originalRecordingTitle, detailsTrack.originalRecordingDate].filter(Boolean).join(' · ')],
              ['Original Singer Source', detailsTrack.originalSingerSource],
              ['Credited Artist', detailsTrack.creditedArtist || detailsTrack.creditedArtistNames?.join(' & ')],
              ['Lyricist', detailsTrack.lyricist],
              ['Composer', detailsTrack.composer],
              ['Music Director', detailsTrack.musicDirector],
              ['Producer', detailsTrack.producer],
              ['Music Label', detailsTrack.label],
              ['Movie', detailsTrack.movie],
              ['Album', detailsTrack.album],
              ['Release Date', detailsTrack.metadataReleaseDate || detailsTrack.releaseDate],
              ['Release Year', detailsTrack.year],
              ['Language', detailsTrack.language !== 'Unknown' ? detailsTrack.language : ''],
              ['Genre', detailsTrack.genre !== 'Unclassified' ? detailsTrack.genre : ''],
              ['Metadata Sources', (detailsTrack.metadataSources || []).join(', ')],
              ['Notes', detailsTrack.description],
            ].map(([label, value]) => <div className="track-details-field" key={label}><span>{label}</span><strong>{value || 'Not available in metadata'}</strong></div>)}
          </div>
          {detailsTrack.videoUrl && <a className="track-source-link" href={detailsTrack.videoUrl} target="_blank" rel="noreferrer"><Youtube size={15} /> Open YouTube source</a>}
          <div className="modal-actions"><button className="subtle-button" onClick={() => shareTrack(detailsTrack)}><Share2 size={15} /> Share</button><button className="primary-button" onClick={() => { handlePlayTrack(detailsTrack); setDetailsTrack(null); }}><Play size={15} fill="currentColor" /> Play song</button></div>
        </section>
      </div>}

      {addSongsPlaylistId && addSongsTarget && <div className="modal-scrim add-songs-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddSongsPlaylistId(null); }}>
        <section className="add-songs-modal" role="dialog" aria-modal="true" aria-label={`Add songs to ${addSongsTarget.title}`}>
          <button className="modal-close icon-button" onClick={() => setAddSongsPlaylistId(null)} aria-label="Close add songs"><X size={18} /></button>
          <span className="modal-icon"><ListPlus size={22} /></span>
          <span className="section-eyebrow">PLAYLIST MANAGEMENT</span>
          <h2>Add songs</h2>
          <p>Choose tracks from your SURDHARA library to add to <strong>{addSongsTarget.title}</strong>.</p>
          <label className="add-songs-search"><Search size={16} /><input autoFocus value={addSongsSearch} onChange={(event) => setAddSongsSearch(event.target.value)} placeholder="Search songs, artists, albums, movies…" aria-label="Search songs to add" /></label>
          <div className="add-songs-results">
            {addSongsCandidates.length ? addSongsCandidates.map((track) => <div className="add-songs-result" key={track.id}><img src={track.cover} alt="" /><div><strong>{track.title}</strong><small>{getTrackArtistNames(track).join(' & ') || 'Singer not identified'} · {track.album || track.movie || 'Album not identified'}</small></div><button className="primary-button add-songs-add-button" onClick={() => addTrackToPlaylist(addSongsTarget.id, track.id)}><Plus size={14} /> Add</button></div>) : <p className="add-songs-empty">{allTracks.length ? 'No more songs match your search, or every matching song is already in this playlist.' : 'Import songs to your library first.'}</p>}
          </div>
          <div className="modal-actions"><button className="subtle-button" onClick={() => setAddSongsPlaylistId(null)}>Done</button></div>
        </section>
      </div>}

      {createModalOpen && <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateModalOpen(false); }}>
        <form className="create-playlist-modal" onSubmit={submitNewPlaylist}>
          <button type="button" className="modal-close icon-button" onClick={() => setCreateModalOpen(false)} aria-label="Close dialog"><X size={18} /></button>
          <span className="modal-icon"><ListMusic size={22} /></span>
          <span className="section-eyebrow">MAKE IT YOURS</span>
          <h2>Create a playlist</h2>
          <p>Give your collection a name. You can add tracks as you explore.</p>
          <label htmlFor="new-playlist-name">Playlist name</label>
          <input id="new-playlist-name" value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="e.g. Late Night Drives" autoFocus maxLength={60} required />
          <div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setCreateModalOpen(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={16} /> Create playlist</button></div>
        </form>
      </div>}
    </div>
  );
}
