import { useEffect, useMemo, useState } from 'react';
import { getTrackArtistNames } from '../lib/artistCredits.js';
import SleepTimerButton from './SleepTimerButton.jsx';
import { matchesSearch } from '../lib/searchUtils.js';
import {
  ChevronUp, Headphones, Heart, Info, ListMusic, ListPlus, Minimize2, Search,
  Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward,
  Volume2, VolumeX, X,
} from 'lucide-react';

function formatTime(value = 0) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${String(minutes).padStart(2, '0')}:${seconds}`;
}

export default function PlayerDock({
  track, isPlaying, liked, onToggleLike, onTogglePlayback, onPrevious, onNext,
  currentTime, duration, onSeek, shuffleEnabled = false, onToggleShuffle,
  repeatMode = 'off', onCycleRepeat, volume = 68, muted = false,
  onVolumeChange, onToggleMute, queueTracks = [], onPlayTrack,
  playlistsList = [], onAddToPlaylist, sleepTimer = null, onSetSleepTimer, playbackNote = '',
  backgroundPlay = true, onToggleBackgroundPlay,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const safeDuration = Number(duration) > 0 ? Number(duration) : (Number(track?.durationSeconds) || 0);
  const progress = safeDuration > 0 ? Math.min(safeDuration, Math.max(0, currentTime || 0)) : 0;
  const progressPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (progress / safeDuration) * 100)) : 0;
  const rightTimeLabel = safeDuration > 0
    ? (showRemainingTime ? `-${formatTime(Math.max(0, safeDuration - progress))}` : formatTime(safeDuration))
    : '--:--';
  const toggleTimeDisplay = () => setShowRemainingTime((previous) => !previous);
  const singerNames = getTrackArtistNames(track || {});
  const artistLabel = singerNames.join(' & ');
  const movieAlbumLabel = [...new Map([track?.movie, track?.album].filter(Boolean).map((value) => [String(value).trim().toLocaleLowerCase('en'), String(value).trim()])).values()].join(' · ');
  const releaseDateLabel = track?.metadataReleaseDate || track?.releaseDate || track?.year;
  const filteredPlaylists = useMemo(() => playlistsList.filter((playlist) => matchesSearch(playlistSearch, [playlist.title, playlist.subtitle, playlist.collection, playlist.description])), [playlistsList, playlistSearch]);

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (showPlaylistPicker) setShowPlaylistPicker(false);
        else if (showQueue) setShowQueue(false);
        else setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [expanded, showQueue, showPlaylistPicker]);

  useEffect(() => {
    setShowPlaylistPicker(false);
    setPlaylistSearch('');
    setShowMoreInfo(false);
  }, [track?.id]);

  const openQueue = () => {
    setExpanded(true);
    setShowQueue((open) => !open || !expanded);
    setShowPlaylistPicker(false);
  };

  const addToPlaylist = (playlistId) => {
    if (!track?.id) return;
    onAddToPlaylist?.(playlistId, track.id);
    setShowPlaylistPicker(false);
  };

  return (
    <>
      {expanded && (
        <section className={`now-playing-overlay ${showQueue ? 'now-playing-with-queue' : ''}`} role="dialog" aria-modal="true" aria-label="Expanded Now Playing">
          <header className="expanded-player-topbar">
            <div className="expanded-player-brand"><img className="expanded-brand-mark" src="/surdhara-logo.png" alt="SURDHARA logo" /><span><strong>SURDHARA</strong><small>NOW PLAYING</small></span></div>
            <div className="expanded-player-top-actions">
              <button className="expanded-icon-button" onClick={() => setShowQueue((open) => !open)} aria-label={showQueue ? 'Hide queue' : 'Show queue'} title={showQueue ? 'Hide queue' : 'Show queue'}><ListMusic size={19} /></button>
              <button className="expanded-icon-button expanded-minimize-button" onClick={() => { setExpanded(false); setShowPlaylistPicker(false); }} aria-label="Minimize player" title="Minimize player"><Minimize2 size={19} /></button>
              <button className="expanded-icon-button" onClick={() => { setExpanded(false); setShowPlaylistPicker(false); }} aria-label="Close expanded player" title="Close expanded player"><X size={20} /></button>
            </div>
          </header>

          <div className="expanded-player-layout">
            <main className="expanded-player-main">
              <div className="expanded-artwork-wrap">
                <img className="expanded-artwork" src={track?.cover} alt={`${track?.title || 'Current track'} artwork`} />
                <div className="expanded-artwork-glow" />
              </div>

              <div className="expanded-track-info">
                <span className="expanded-track-kicker">YOUR SOUNDS, YOUR FEELINGS</span>
                <h1 title={track?.title}>{track?.title || 'Choose a song'}</h1>
                <p>{artistLabel || 'Singer not identified'}</p>
                <button
                  type="button"
                  className="expanded-more-info-toggle"
                  onClick={() => setShowMoreInfo((open) => !open)}
                  aria-expanded={showMoreInfo}
                  aria-controls="expanded-track-more-info"
                >
                  <Info size={15} />
                  <span>{showMoreInfo ? 'Hide Info' : 'More Info'}</span>
                  <ChevronUp className={showMoreInfo ? 'more-info-chevron is-open' : 'more-info-chevron'} size={14} />
                </button>
                {showMoreInfo && (
                  <section id="expanded-track-more-info" className="expanded-more-info" aria-label="Track information">
                    <div className="expanded-more-info-item">
                      <span>Singer</span>
                      <strong>{singerNames.length ? singerNames.join(' & ') : 'Not identified in verified metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Original Singer</span>
                      <strong>{track?.originalSingerNames?.length ? track.originalSingerNames.join(' & ') : (track?.originalSinger || 'Not identified in verified metadata')}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Cover Status</span>
                      <strong>{track?.coverStatus === 'confirmed-cover' ? 'Confirmed cover' : track?.coverStatus === 'likely-cover' ? 'Likely cover' : track?.coverStatus === 'cover-indicated' ? 'Cover indicated by source' : 'Not enough reliable evidence'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Original Recording</span>
                      <strong>{[track?.originalRecordingTitle, track?.originalRecordingDate].filter(Boolean).join(' · ') || 'Not identified in verified metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Cover Evidence</span>
                      <strong>{track?.coverEvidence?.length ? track.coverEvidence.join('; ') : 'No reliable cover evidence found yet'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Credited Artist</span>
                      <strong>{track?.creditedArtist || track?.creditedArtistNames?.join(' & ') || 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Lyricist (Lyrics by)</span>
                      <strong>{track?.lyricist || 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Music Director / Composer</span>
                      <strong>{track?.musicDirector || track?.composer || 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Producer</span>
                      <strong>{track?.producer || 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Music Label</span>
                      <strong>{track?.label || 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Movie / Album</span>
                      <strong>{movieAlbumLabel || 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Release Date</span>
                      <strong>{releaseDateLabel ? String(releaseDateLabel).slice(0, 10) : 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Language</span>
                      <strong>{track?.language && track.language !== 'Unknown' ? track.language : 'Not available in metadata'}</strong>
                    </div>
                    <div className="expanded-more-info-item">
                      <span>Genre</span>
                      <strong>{track?.genre && track.genre !== 'Unclassified' ? track.genre : 'Not available in metadata'}</strong>
                    </div>
                  </section>
                )}
              </div>

              <div className="expanded-player-controls-area">
                <div className="expanded-progress-row">
                  <button type="button" className="player-time-label" onClick={toggleTimeDisplay} aria-label="Toggle total and remaining playback time" title="Click to toggle total / remaining time">{formatTime(currentTime)}</button>
                  <input
                    aria-label="Track progress"
                    type="range"
                    min="0"
                    max={Math.max(1, safeDuration)}
                    step="1"
                    value={Math.min(progress, Math.max(1, safeDuration))}
                    onChange={(event) => onSeek(Number(event.target.value))}
                    style={{ '--progress': `${progressPercent}%` }}
                  />
                  <button type="button" className="player-time-label" onClick={toggleTimeDisplay} aria-label="Toggle total and remaining playback time" title="Click to toggle total / remaining time">{rightTimeLabel}</button>
                </div>

                <div className="expanded-primary-controls">
                  <button className={`expanded-mode-button ${shuffleEnabled ? 'active' : ''}`} onClick={onToggleShuffle} aria-label={shuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'} title={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}><Shuffle size={20} /></button>
                  <button className="expanded-skip-button" onClick={onPrevious} aria-label="Previous track" title="Previous track"><SkipBack size={23} fill="currentColor" /></button>
                  <button className="expanded-play-button" onClick={onTogglePlayback} aria-label={isPlaying ? 'Pause track' : 'Play track'} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}</button>
                  <button className="expanded-skip-button" onClick={onNext} aria-label="Next track" title="Next track"><SkipForward size={23} fill="currentColor" /></button>
                  <button className={`expanded-mode-button ${repeatMode !== 'off' ? 'active' : ''}`} onClick={onCycleRepeat} aria-label={`Repeat ${repeatMode}`} title={`Repeat: ${repeatMode}`}>{repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}{repeatMode !== 'off' && <i className="mode-indicator" />}</button>
                </div>

                <div className="expanded-secondary-controls">
                  <div className="expanded-volume-control">
                    <button className="expanded-icon-button" onClick={onToggleMute} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'} title={muted || volume === 0 ? 'Unmute' : 'Mute'}>{muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
                    <input aria-label="Volume" type="range" min="0" max="100" step="1" value={muted ? 0 : volume} onChange={(event) => onVolumeChange(Number(event.target.value))} style={{ '--volume': `${muted ? 0 : volume}%` }} />
                    <span>{muted ? 'Muted' : `${volume}%`}</span>
                  </div>
                  <div className="expanded-track-actions">
                    <button className={`expanded-action-button ${liked ? 'is-liked' : ''}`} onClick={() => onToggleLike?.(track?.id)} aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}><Heart size={18} fill={liked ? 'currentColor' : 'none'} /><span>{liked ? 'Favorited' : 'Favorite'}</span></button>
                    <div className="expanded-add-wrap">
                      <button className="expanded-action-button" onClick={() => { setShowPlaylistPicker((open) => !open); setShowQueue(false); }} aria-expanded={showPlaylistPicker}><ListPlus size={18} /><span>Add to playlist</span></button>
                      {showPlaylistPicker && <div className="expanded-playlist-picker"><label className="expanded-playlist-search"><Search size={14} /><input value={playlistSearch} onChange={(event) => setPlaylistSearch(event.target.value)} placeholder="Search playlists…" aria-label="Search playlists" autoFocus /></label><strong>Add “{track?.title}” to</strong>{filteredPlaylists.length ? filteredPlaylists.map((playlist) => <button key={playlist.id} onClick={() => addToPlaylist(playlist.id)}><Plus size={14} /><span>{playlist.title}</span><small>{playlist.trackIds?.length || 0}</small></button>) : <p>{playlistsList.length ? 'No playlists match your search.' : 'Create a playlist first.'}</p>}</div>}
                    </div>
                    <button className="expanded-action-button" onClick={openQueue}><ListMusic size={18} /><span>Queue</span></button>
                    {onToggleBackgroundPlay && <button className={`expanded-action-button ${backgroundPlay ? 'is-on' : ''}`} onClick={onToggleBackgroundPlay} aria-pressed={backgroundPlay}><Headphones size={18} /><span>Background play: {backgroundPlay ? 'On' : 'Off'}</span></button>}
                  </div>
                </div>
              </div>
            </main>

            {showQueue && (
              <aside className="expanded-queue-panel" aria-label="Playback queue">
                <div className="expanded-queue-header"><div><span>UP NEXT</span><h2>Queue</h2><p>{queueTracks.length} track{queueTracks.length === 1 ? '' : 's'} in this queue</p></div><button className="expanded-icon-button" onClick={() => setShowQueue(false)} aria-label="Close queue"><X size={18} /></button></div>
                <div className="expanded-queue-list">
                  {queueTracks.map((queueTrack, index) => (
                    <button key={queueTrack.id} className={`expanded-queue-track ${queueTrack.id === track?.id ? 'active' : ''}`} onClick={() => onPlayTrack?.(queueTrack)}>
                      <span className="expanded-queue-index">{queueTrack.id === track?.id && isPlaying ? <span className="queue-playing-bars"><i /><i /><i /></span> : String(index + 1).padStart(2, '0')}</span>
                      <img src={queueTrack.cover} alt="" loading="lazy" />
                      <span className="expanded-queue-track-copy"><strong>{queueTrack.title}</strong><small>{getTrackArtistNames(queueTrack).join(' & ') || (queueTrack.importedFromYouTube ? 'Singer not identified' : (queueTrack.artist || 'Singer not identified'))}</small></span>
                      {queueTrack.id === track?.id && <span className="expanded-queue-current">CURRENT</span>}
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </section>
      )}

      <div className="player-dock" aria-label="Now Playing bar">
        <button className="dock-expand-button" onClick={() => { setExpanded(true); setShowQueue(false); }} aria-label="Expand Now Playing" title="Expand Now Playing"><ChevronUp size={18} /></button>
        <div className="dock-track">
          <div className="dock-cover-wrap"><img src={track?.cover} alt="" /></div>
          <div className="dock-track-text"><strong>{track?.title || 'Choose a song'}</strong><span>{artistLabel || (track?.importedFromYouTube ? 'Singer not identified' : (track?.artist || 'Singer not identified'))}</span><small className={`dock-status ${isPlaying ? 'dock-status-playing' : ''}`}>{isPlaying ? 'NOW PLAYING' : 'READY TO PLAY'}</small></div>
          <button className={`dock-like ${liked ? 'is-liked' : ''}`} onClick={() => onToggleLike?.(track?.id)} aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'} title={liked ? 'Remove favorite' : 'Add favorite'}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="dock-center">
          <div className="dock-controls">
            <button className={`dock-secondary-control dock-mode-control ${shuffleEnabled ? 'active' : ''}`} onClick={onToggleShuffle} aria-label={shuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'} title="Shuffle"><Shuffle size={15} /></button>
            <button className="dock-secondary-control" onClick={onPrevious} aria-label="Previous track"><SkipBack size={17} fill="currentColor" /></button>
            <button className="dock-play-button" onClick={onTogglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <button className="dock-secondary-control" onClick={onNext} aria-label="Next track"><SkipForward size={17} fill="currentColor" /></button>
            <button className={`dock-secondary-control dock-mode-control ${repeatMode !== 'off' ? 'active' : ''}`} onClick={onCycleRepeat} aria-label={`Repeat ${repeatMode}`} title={`Repeat: ${repeatMode}`}>{repeatMode === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}</button>
          </div>
          <div className="dock-progress-row"><button type="button" className="player-time-label" onClick={toggleTimeDisplay} aria-label="Toggle total and remaining playback time" title="Click to toggle total / remaining time">{formatTime(currentTime)}</button><input aria-label="Seek track" type="range" min="0" max={Math.max(1, safeDuration)} value={Math.min(progress, Math.max(1, safeDuration))} onChange={(event) => onSeek(Number(event.target.value))} style={{ '--progress': `${progressPercent}%` }} /><button type="button" className="player-time-label" onClick={toggleTimeDisplay} aria-label="Toggle total and remaining playback time" title="Click to toggle total / remaining time">{rightTimeLabel}</button></div>
        </div>
        <div className="dock-right-actions">
          {playbackNote && <span className="dock-offline-pill">{playbackNote}</span>}
          {onSetSleepTimer && <SleepTimerButton timer={sleepTimer} onSet={onSetSleepTimer} className="dock-volume-toggle" />}
          <button className="dock-volume-toggle" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <button className="dock-queue-button" onClick={openQueue} aria-label="Open playback queue" title="Queue"><ListMusic size={19} /></button>
        </div>
      </div>
    </>
  );
}
