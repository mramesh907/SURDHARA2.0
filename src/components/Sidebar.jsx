import { useState } from 'react';
import {
  AudioLines, House, Compass, LibraryBig, ListMusic, MicVocal,
  Heart, Plus, X, Disc3, Clock3, Youtube, Languages, MoreHorizontal, Pencil, Trash2, DownloadCloud, FolderDown,
} from 'lucide-react';

const primaryNav = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'songs', label: 'Songs', icon: AudioLines },
  { id: 'library', label: 'Your library', icon: LibraryBig },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'youtube-downloads', label: 'YouTube Downloads', icon: FolderDown },
  { id: 'importer', label: 'Import Songs', icon: Youtube },
  { id: 'admin-catalog', label: 'Manage Music', icon: Disc3 },
  { id: 'artists', label: 'Artists', icon: MicVocal },
  { id: 'liked', label: 'Liked songs', icon: Heart },
  { id: 'offline', label: 'Saved offline', icon: DownloadCloud },
];

export default function Sidebar({
  activePage, onNavigate, playlists = [], onOpenPlaylist, open, onClose,
  onCreatePlaylist, onShowRecent, onRenamePlaylist, onDeletePlaylist, canManageCatalog = true, showOffline = false,
}) {
  const [openPlaylistMenuId, setOpenPlaylistMenuId] = useState(null);
  const managedPlaylists = playlists.filter((playlist) => (playlist.isCustom && !playlist.isPublishedCatalog) || (playlist.isYouTubeImport && !playlist.isPublishedCatalog));

  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/surdhara-logo.png" alt="SURDHARA logo" /></div>
          <div className="brand-text"><strong>SURDHARA</strong><span>Your Sounds, Your Feelings</span></div>
          <button className="icon-button mobile-sidebar-close" onClick={onClose} aria-label="Close menu"><X size={19} /></button>
        </div>

        <div className="sidebar-label">MENU</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {primaryNav.filter(({ id }) => (!['importer', 'admin-catalog'].includes(id) || canManageCatalog) && (id !== 'offline' || showOffline)).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${activePage === id ? 'active' : ''}`} onClick={() => { onNavigate(id); onClose?.(); }}>
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
              {id === 'liked' && <span className="nav-end"><Heart size={13} /></span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-separator" />
        <div className="sidebar-section-heading"><span>MY PLAYLISTS</span><button className="tiny-icon-button" title="Create playlist" onClick={onCreatePlaylist}><Plus size={17} /></button></div>
        <div className="sidebar-playlists">
          {managedPlaylists.length ? managedPlaylists.map((playlist, index) => (
            <div className="sidebar-playlist-row" key={playlist.id}>
              <button className="sidebar-playlist" onClick={() => { onOpenPlaylist(playlist.id); onClose?.(); setOpenPlaylistMenuId(null); }} title={playlist.title}>
                <span className={`playlist-mini-icon palette-${index % 5}`}><ListMusic size={15} /></span>
                <span className="sidebar-playlist-copy"><span>{playlist.title}</span><small>{playlist.trackIds?.length || 0} tracks</small></span>
              </button>
              <div className="sidebar-playlist-menu-wrap">
                <button className="sidebar-playlist-more" title={`Manage ${playlist.title}`} aria-label={`Manage ${playlist.title}`} aria-expanded={openPlaylistMenuId === playlist.id} onClick={() => setOpenPlaylistMenuId((current) => current === playlist.id ? null : playlist.id)}><MoreHorizontal size={16} /></button>
                {openPlaylistMenuId === playlist.id && <>
                  <button className="sidebar-menu-dismiss" aria-label="Close playlist actions" onClick={() => setOpenPlaylistMenuId(null)} />
                  <div className="sidebar-playlist-popover">
                    <button onClick={() => { setOpenPlaylistMenuId(null); onRenamePlaylist?.(playlist); }}><Pencil size={14} />Rename</button>
                    <button className="sidebar-playlist-delete" onClick={() => { setOpenPlaylistMenuId(null); onDeletePlaylist?.(playlist); }}><Trash2 size={14} />Delete</button>
                  </div>
                </>}
              </div>
            </div>
          )) : <p className="sidebar-playlists-empty">Create a playlist to keep your favorite tracks together.</p>}
        </div>

        <div className="sidebar-utility-links">
          <button onClick={onShowRecent}><Clock3 size={16} /> Recently played</button>
          <button onClick={() => onNavigate('recently-added')}><AudioLines size={16} /> Recently added</button>
          <button onClick={() => onNavigate('albums')}><Disc3 size={16} /> Albums & soundtracks</button>
          <button onClick={() => onNavigate('languages')}><Languages size={16} /> Languages</button>
        </div>
        <div className="sidebar-bottom-note">
          <div className="note-icon"><AudioLines size={16} /></div>
          <p>One place for the sounds you love.<br /><b>Find your next repeat.</b></p>
        </div>
        <div className="sidebar-footer"><span className="footer-dot" /> Your personal music space</div>
      </aside>
    </>
  );
}
