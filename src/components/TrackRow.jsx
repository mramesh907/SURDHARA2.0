import { useEffect, useMemo, useState } from 'react';
import {
  Play, Heart, MoreHorizontal, Plus, Youtube, ListPlus, ListEnd, ListMusic,
  UserRound, Disc3, Info, Share2, Download, Trash2, Search, ChevronLeft, DownloadCloud, CloudOff, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { matchesSearch } from '../lib/searchUtils.js';
import { getTrackArtistNames } from '../lib/artistCredits.js';

export default function TrackRow({
  track, index, onPlay, isLiked, onToggleLike, active = false, playing = false,
  playlists = [], onAddToPlaylist, showIndex = true,
  onPlayNext, onAddToQueue, onGoToArtist, onGoToAlbum, onShowDetails, onShare,
  onDownload, onRemoveFromPlaylist, removeMode = false, removeLabel = 'Remove from playlist', flags, onToggleOffline,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistChooserOpen, setPlaylistChooserOpen] = useState(false);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [menuPlacement, setMenuPlacement] = useState('down');
  const vocalistNames = getTrackArtistNames(track || {});
  const playlistResults = useMemo(() => playlists.filter((playlist) => matchesSearch(playlistSearch, [
    playlist.title, playlist.subtitle, playlist.collection, playlist.description,
  ])), [playlists, playlistSearch]);

  const closeMenu = () => {
    setMenuOpen(false);
    setPlaylistChooserOpen(false);
    setPlaylistSearch('');
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleEscape = (event) => { if (event.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [menuOpen]);
  const runAction = (callback, ...args) => {
    callback?.(...args);
    closeMenu();
  };
  const choosePlaylist = (playlistId, alreadyAdded) => {
    if (alreadyAdded) return;
    onAddToPlaylist?.(playlistId, track.id);
  };

  return (
    <div className={`track-row ${active ? 'track-row-active' : ''} ${active && playing ? 'track-row-playing' : ''} ${flags?.unavailable ? 'track-row-unavailable' : ''} ${flags?.blocked ? 'track-row-blocked' : ''}`}>
      {showIndex && <span className="track-index">{active ? (playing ? <span className="playing-bars" aria-label="Now playing"><i /><i /><i /></span> : <Play className="track-active-play" size={13} fill="currentColor" aria-label="Selected track" />) : String(index + 1).padStart(2, '0')}</span>}
      <button className="track-cover-button" onClick={() => onPlay(track)} aria-label={`Play ${track.title}`}>
        <img className="track-cover" src={track.cover} alt="" loading="lazy" />
        <span className="track-cover-play"><Play size={13} fill="currentColor" /></span>
      </button>
      <button className="track-main-info" onClick={() => onPlay(track)} title={track.metadataSources?.length ? `Music metadata: ${track.metadataSources.join(' + ')}` : 'Song metadata has not been confidently matched yet.'}>
        <strong>{track.title}{flags?.saved && <CheckCircle2 className="track-offline-badge" size={13} aria-label="Saved for offline" />}{flags?.unavailable && <span className="track-flag track-flag-warn"><AlertTriangle size={11} /> Unavailable</span>}{flags?.blocked && !flags?.unavailable && <span className="track-flag"><CloudOff size={11} /> Needs internet</span>}</strong>
        <span>{vocalistNames.length ? vocalistNames.join(' & ') : (track.importedFromYouTube ? 'Singer not identified' : (track.artist || 'Singer not identified'))}</span>
      </button>
      <span className="track-album" title={track.album || track.movie || 'No confirmed album metadata'}>{track.album || track.movie || (track.importedFromYouTube ? 'Album not identified' : 'Single')}</span>
      <span className="track-year">{track.year || '—'}</span>
      <div className="track-actions">
        {removeMode && onRemoveFromPlaylist && <button className="track-icon-button track-remove-button" onClick={() => onRemoveFromPlaylist(track.id)} aria-label={`${removeLabel}: ${track.title}`} title={removeLabel}><Trash2 size={15} /></button>}
        <button className={`track-icon-button ${isLiked ? 'is-liked' : ''}`} onClick={() => onToggleLike(track.id)} aria-label={isLiked ? 'Remove from liked songs' : 'Add to liked songs'} title={isLiked ? 'Unlike' : 'Like'}><Heart size={16} fill={isLiked ? 'currentColor' : 'none'} /></button>
        <button className="track-icon-button row-youtube-button" onClick={() => onPlay(track)} aria-label={`Play ${track.title}`} title="Play audio"><Youtube size={16} /></button>
        <div className="track-more-wrap">
          <button className="track-icon-button" onClick={(event) => {
          const nextOpen = !menuOpen;
          if (nextOpen) {
            const rect = event.currentTarget.getBoundingClientRect();
            const estimatedMenuHeight = Math.min(330, Math.max(240, window.innerHeight * 0.36));
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setMenuPlacement(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? 'up' : 'down');
          }
          setMenuOpen(nextOpen);
          setPlaylistChooserOpen(false);
          setPlaylistSearch('');
        }} aria-label={`More actions for ${track.title}`} title="More actions"><MoreHorizontal size={17} /></button>
          {menuOpen && <>
            <button className="menu-dismiss" aria-label="Close track actions" onClick={closeMenu} />
            <div className={`track-popover track-popover-${menuPlacement}`} role="menu" aria-label={`Actions for ${track.title}`}>
              <b>Song Actions</b>
              <button role="menuitem" onClick={() => { setPlaylistChooserOpen(true); setPlaylistSearch(''); }}><ListPlus size={15} /><span>Add to Playlist</span></button>
              <button role="menuitem" onClick={() => runAction(onPlayNext, track)}><ListEnd size={15} /><span>Play Next</span></button>
              <button role="menuitem" onClick={() => runAction(onAddToQueue, track)}><ListMusic size={15} /><span>Add to Queue</span></button>
              <button role="menuitem" onClick={() => runAction(onToggleLike, track.id)}><Heart size={15} fill={isLiked ? 'currentColor' : 'none'} /><span>{isLiked ? 'Remove from Favorites' : 'Add to Favorites'}</span></button>
              <button role="menuitem" disabled={!vocalistNames.length} onClick={() => runAction(onGoToArtist, track)}><UserRound size={15} /><span>Go to Artist</span></button>
              <button role="menuitem" disabled={!(track.album || track.movie)} onClick={() => runAction(onGoToAlbum, track)}><Disc3 size={15} /><span>Go to Album</span></button>
              <button role="menuitem" onClick={() => runAction(onShowDetails, track)}><Info size={15} /><span>Song Credits / Details</span></button>
              <button role="menuitem" onClick={() => runAction(onShare, track)}><Share2 size={15} /><span>Share</span></button>
              {flags?.canSave && onToggleOffline && <button role="menuitem" onClick={() => runAction(onToggleOffline, track)} disabled={flags.progress !== undefined}><DownloadCloud size={15} /><span>{flags.progress !== undefined ? `Saving… ${Math.round(flags.progress * 100)}%` : flags.saved ? 'Remove offline copy' : 'Save for offline'}</span></button>}
              <button role="menuitem" onClick={() => runAction(onDownload, track)}><Download size={15} /><span>Download</span></button>
              {onRemoveFromPlaylist && <button role="menuitem" className="track-menu-danger" onClick={() => runAction(onRemoveFromPlaylist, track.id)}><Trash2 size={15} /><span>Remove from Playlist</span></button>}
            </div>
            {playlistChooserOpen && <div className="track-playlist-popover" role="dialog" aria-label={`Add ${track.title} to a playlist`}>
              <label className="track-playlist-search">
                <Search size={14} aria-hidden="true" />
                <input autoFocus value={playlistSearch} onChange={(event) => setPlaylistSearch(event.target.value)} placeholder="Search playlists..." aria-label="Search playlists" />
              </label>
              <div className="track-playlist-popover-heading"><b>Add to Playlist</b><button type="button" onClick={() => { setPlaylistChooserOpen(false); setPlaylistSearch(''); }} aria-label="Close playlist chooser">×</button></div>
              <div className="track-playlist-results">
                {playlistResults.length ? playlistResults.map((playlist) => {
                  const alreadyAdded = (playlist.trackIds || []).includes(track.id);
                  return (
                    <button key={playlist.id} className={alreadyAdded ? 'track-playlist-added' : ''} role="menuitem" aria-label={alreadyAdded ? `${playlist.title} already contains ${track.title}` : `Add ${track.title} to ${playlist.title}`} onClick={() => choosePlaylist(playlist.id, alreadyAdded)}>
                      {alreadyAdded ? <span className="track-playlist-check" aria-hidden="true">✓</span> : <Plus size={14} />}
                      <span>{playlist.title}</span>
                      <small>{playlist.trackIds?.length || 0} {playlist.trackIds?.length === 1 ? 'song' : 'songs'}</small>
                    </button>
                  );
                }) : <small className="track-no-results">No playlists match your search.</small>}
              </div>
            </div>}
          </>}
        </div>
      </div>
    </div>
  );
}
