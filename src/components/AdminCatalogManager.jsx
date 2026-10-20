import { useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Disc3, ImagePlus, Loader2, Music2, Pencil, Plus,
  Save, Search, ShieldCheck, Trash2, Users, X,
} from 'lucide-react';

const TABS = [
  { id: 'songs', label: 'Songs', icon: Music2 },
  { id: 'artists', label: 'Artists', icon: Users },
  { id: 'playlists', label: 'Playlists', icon: Disc3 },
];

function artistText(track) {
  return Array.isArray(track?.artistNames) && track.artistNames.length
    ? track.artistNames.join(' & ')
    : (track?.artist || '');
}

function startSongDraft(track) {
  return {
    title: track.title || '',
    artist: artistText(track),
    originalSinger: Array.isArray(track.originalSingerNames) ? track.originalSingerNames.join(' & ') : (track.originalSinger || ''),
    album: track.album || '',
    movie: track.movie || '',
    releaseDate: track.releaseDate || '',
    year: track.year || '',
    language: track.language || '',
    genre: track.genre || '',
    mood: track.mood || '',
    lyricist: track.lyricist || '',
    composer: track.composer || '',
    musicDirector: track.musicDirector || '',
    producer: track.producer || '',
    label: track.label || '',
    cover: track.cover || '',
  };
}

function TextField({ label, value, onChange, type = 'text', placeholder = '' }) {
  return <label className="admin-field"><span>{label}</span><input type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ArtworkPicker({ label, url, file, onUrlChange, onFileChange }) {
  return (
    <div className="admin-artwork-editor">
      <div className="admin-artwork-preview">{file ? <span>{file.name}</span> : url ? <img src={url} alt={`${label} preview`} /> : <ImagePlus size={25} />}</div>
      <div className="admin-artwork-controls">
        <label className="admin-field"><span>{label} URL</span><input value={url || ''} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://…" /></label>
        <label className="admin-file-picker"><ImagePlus size={15} /> Upload image <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" onChange={(event) => onFileChange(event.target.files?.[0] || null)} /></label>
        <small>JPEG, PNG, WebP, AVIF or GIF. Maximum 10 MB.</small>
      </div>
    </div>
  );
}

export default function AdminCatalogManager({
  songs = [], artists = [], playlists = [], enabled = false,
  onSaveSong, onDeleteSong, onSaveArtist, onDeleteArtist,
  onSavePlaylist, onDeletePlaylist,
}) {
  const [tab, setTab] = useState('songs');
  const [query, setQuery] = useState('');
  const [editingSong, setEditingSong] = useState(null);
  const [songDraft, setSongDraft] = useState(null);
  const [songArtworkFile, setSongArtworkFile] = useState(null);
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistDraft, setArtistDraft] = useState(null);
  const [artistPhotoFile, setArtistPhotoFile] = useState(null);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [playlistDraft, setPlaylistDraft] = useState(null);
  const [playlistCoverFile, setPlaylistCoverFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState('');

  const filteredSongs = useMemo(() => songs.filter((song) => `${song.title} ${artistText(song)} ${song.album || ''} ${song.movie || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 250), [songs, query]);
  const filteredArtists = useMemo(() => artists.filter((artist) => `${artist.name} ${artist.bio || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 250), [artists, query]);
  const filteredPlaylists = useMemo(() => playlists.filter((playlist) => `${playlist.title} ${playlist.description || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 250), [playlists, query]);

  const resetFeedback = () => { setFeedback(''); setFailure(''); };
  const closeEditors = () => {
    setEditingSong(null); setSongDraft(null); setSongArtworkFile(null);
    setEditingArtist(null); setArtistDraft(null); setArtistPhotoFile(null);
    setEditingPlaylist(null); setPlaylistDraft(null); setPlaylistCoverFile(null);
    setBusy(false);
  };

  const runAction = async (action, successMessage) => {
    setBusy(true); resetFeedback();
    try {
      await action();
      setFeedback(successMessage);
      closeEditors();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const openSongEditor = (song) => { resetFeedback(); setEditingSong(song); setSongDraft(startSongDraft(song)); setSongArtworkFile(null); };
  const openArtistEditor = (artist = null) => {
    resetFeedback();
    const value = artist || { id: '', name: '', bio: '', image: '', photoUrl: '' };
    setEditingArtist(value);
    setArtistDraft({ name: value.name || '', bio: value.bio || '', photoUrl: value.photoUrl || value.image || '' });
    setArtistPhotoFile(null);
  };
  const openPlaylistEditor = (playlist) => {
    resetFeedback(); setEditingPlaylist(playlist);
    setPlaylistDraft({ title: playlist.title || '', description: playlist.description || '', cover: playlist.cover || '' });
    setPlaylistCoverFile(null);
  };

  const saveSong = (event) => {
    event.preventDefault();
    if (!editingSong || !songDraft?.title.trim()) return setFailure('Song title is required.');
    const artistNames = songDraft.artist.split(/\s*(?:,|;|\||&|\+)\s*/).map((name) => name.trim()).filter(Boolean);
    runAction(() => onSaveSong({
      ...editingSong,
      ...songDraft,
      title: songDraft.title.trim(),
      artist: artistNames.join(' & '),
      artistNames,
      vocalArtistNames: artistNames,
      originalSingerNames: songDraft.originalSinger.split(/\s*(?:,|;|\||&|\+)\s*/).map((name) => name.trim()).filter(Boolean),
      year: songDraft.year ? Number(songDraft.year) : null,
      durationSeconds: editingSong.durationSeconds || 0,
    }, { coverFile: songArtworkFile }), 'Song metadata and artwork saved to the cloud catalogue.');
  };

  const saveArtist = (event) => {
    event.preventDefault();
    if (!artistDraft?.name.trim()) return setFailure('Artist name is required.');
    runAction(() => onSaveArtist({ ...editingArtist, ...artistDraft, photoFile: artistPhotoFile }), 'Artist profile saved to the cloud catalogue.');
  };

  const savePlaylist = (event) => {
    event.preventDefault();
    if (!playlistDraft?.title.trim()) return setFailure('Playlist title is required.');
    runAction(() => onSavePlaylist({ ...editingPlaylist, ...playlistDraft }, { coverFile: playlistCoverFile }), 'Published playlist updated for all listeners.');
  };

  const deleteItem = (title, action, successMessage) => {
    if (!window.confirm(`Delete “${title}” from the shared SURDHARA catalogue? This action cannot be undone.`)) return;
    runAction(action, successMessage);
  };

  return (
    <div className="admin-catalog-page">
      <section className="page-heading">
        <span className="section-eyebrow"><ShieldCheck size={14} /> ADMIN WORKSPACE</span>
        <h1>Manage Music</h1>
        <p>Update published song details, artwork, artist profiles, album/movie information and shared playlists.</p>
      </section>

      {!enabled && <div className="cloud-publishing-banner cloud-publishing-warning"><AlertCircle size={18} /><div><strong>Admin cloud access is not ready</strong><p>Connect Supabase, run the Phase 1–3 SQL setup and sign in with the account assigned the Admin role before making shared changes.</p></div></div>}
      {enabled && <div className="cloud-publishing-banner cloud-publishing-ready"><CheckCircle2 size={18} /><div><strong>Admin tools enabled</strong><p>Changes are saved to the shared cloud catalogue. Database and storage policies enforce Admin permissions.</p></div></div>}

      <div className="admin-catalog-toolbar">
        <div className="admin-tabs" role="tablist" aria-label="Catalogue management sections">
          {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setQuery(''); resetFeedback(); }}><Icon size={16} />{label}</button>)}
        </div>
        <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}…`} /></label>
      </div>

      {feedback && <div className="admin-feedback success"><CheckCircle2 size={16} />{feedback}</div>}
      {failure && <div className="admin-feedback error"><AlertCircle size={16} />{failure}</div>}

      {tab === 'songs' && <div className="admin-list-panel">
        <div className="admin-list-heading"><div><h2>Published songs</h2><p>Editing here updates the public catalogue without rebuilding the website.</p></div><span>{filteredSongs.length} shown</span></div>
        {filteredSongs.length ? filteredSongs.map((song) => <article className="admin-catalog-row" key={song.cloudSongId || song.id}>
          <img className="admin-row-artwork" src={song.cover || '/local-audio-cover.svg'} alt="" />
          <div className="admin-row-copy"><strong>{song.title || 'Untitled track'}</strong><span>{artistText(song) || 'Singer not identified'}</span><small>{[song.album || song.movie, song.year || 'Year unknown', song.sourceType === 'local' ? 'Uploaded audio' : 'YouTube'].filter(Boolean).join(' · ')}</small></div>
          <div className="admin-row-actions"><button type="button" className="subtle-button" disabled={!enabled || !song.cloudSongId} onClick={() => openSongEditor(song)}><Pencil size={14} /> Edit</button><button type="button" className="admin-icon-danger" aria-label={`Delete ${song.title}`} disabled={!enabled || !song.cloudSongId || busy} onClick={() => deleteItem(song.title, () => onDeleteSong(song), 'Song deleted from the shared catalogue.')}><Trash2 size={15} /></button></div>
        </article>) : <p className="admin-empty">No published songs match this search.</p>}
      </div>}

      {tab === 'artists' && <div className="admin-list-panel">
        <div className="admin-list-heading"><div><h2>Artist profiles</h2><p>Only verified singer profiles should receive portraits. If unsure, leave the photo blank.</p></div><button type="button" className="primary-button" disabled={!enabled || busy} onClick={() => openArtistEditor()}><Plus size={15} /> Add artist</button></div>
        {filteredArtists.length ? filteredArtists.map((artist) => <article className="admin-catalog-row" key={artist.cloudArtistId || artist.id}>
          {artist.image ? <img className="admin-row-artwork artist-round" src={artist.image} alt="" /> : <div className="admin-row-artwork artist-round admin-empty-photo"><Users size={17} /></div>}
          <div className="admin-row-copy"><strong>{artist.name}</strong><span>{artist.bio || 'No biography has been added.'}</span><small>{artist.cloudArtistId ? 'Cloud profile' : 'Artist detected from song credits'}</small></div>
          <div className="admin-row-actions"><button type="button" className="subtle-button" disabled={!enabled || busy} onClick={() => openArtistEditor(artist)}><Pencil size={14} /> Edit</button>{artist.cloudArtistId && <button type="button" className="admin-icon-danger" aria-label={`Delete ${artist.name}`} disabled={!enabled || busy} onClick={() => deleteItem(artist.name, () => onDeleteArtist(artist), 'Artist profile deleted. Song records remain unchanged.')}><Trash2 size={15} /></button>}</div>
        </article>) : <p className="admin-empty">No artist profiles match this search.</p>}
      </div>}

      {tab === 'playlists' && <div className="admin-list-panel">
        <div className="admin-list-heading"><div><h2>Shared playlists</h2><p>These playlists are published for all SURDHARA visitors. Private user playlists are stored separately.</p></div><span>{filteredPlaylists.length} shown</span></div>
        {filteredPlaylists.length ? filteredPlaylists.map((playlist) => <article className="admin-catalog-row" key={playlist.cloudPlaylistId || playlist.id}>
          <img className="admin-row-artwork" src={playlist.cover || '/local-audio-cover.svg'} alt="" />
          <div className="admin-row-copy"><strong>{playlist.title}</strong><span>{playlist.description || 'No description yet.'}</span><small>{playlist.trackIds?.length || 0} tracks · Shared catalogue</small></div>
          <div className="admin-row-actions"><button type="button" className="subtle-button" disabled={!enabled || !playlist.cloudPlaylistId} onClick={() => openPlaylistEditor(playlist)}><Pencil size={14} /> Edit</button><button type="button" className="admin-icon-danger" aria-label={`Delete ${playlist.title}`} disabled={!enabled || !playlist.cloudPlaylistId || busy} onClick={() => deleteItem(playlist.title, () => onDeletePlaylist(playlist), 'Shared playlist deleted. Songs remain in the catalogue.')}><Trash2 size={15} /></button></div>
        </article>) : <p className="admin-empty">No shared playlists match this search.</p>}
      </div>}

      {editingSong && songDraft && <div className="modal-scrim admin-editor-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditors(); }}>
        <form className="admin-editor-modal" onSubmit={saveSong} role="dialog" aria-modal="true" aria-labelledby="admin-song-editor-title">
          <div className="admin-editor-heading"><div><span className="section-eyebrow">SONG METADATA</span><h2 id="admin-song-editor-title">Edit song</h2></div><button className="icon-button" type="button" disabled={busy} onClick={closeEditors} aria-label="Close editor"><X size={18} /></button></div>
          <div className="admin-fields-grid">
            <TextField label="Song title *" value={songDraft.title} onChange={(value) => setSongDraft((draft) => ({ ...draft, title: value }))} />
            <TextField label="Singer(s)" value={songDraft.artist} onChange={(value) => setSongDraft((draft) => ({ ...draft, artist: value }))} />
            <TextField label="Original singer" value={songDraft.originalSinger} onChange={(value) => setSongDraft((draft) => ({ ...draft, originalSinger: value }))} />
            <TextField label="Album" value={songDraft.album} onChange={(value) => setSongDraft((draft) => ({ ...draft, album: value }))} />
            <TextField label="Movie / soundtrack" value={songDraft.movie} onChange={(value) => setSongDraft((draft) => ({ ...draft, movie: value }))} />
            <TextField label="Release date" type="date" value={songDraft.releaseDate} onChange={(value) => setSongDraft((draft) => ({ ...draft, releaseDate: value }))} />
            <TextField label="Release year" type="number" value={songDraft.year} onChange={(value) => setSongDraft((draft) => ({ ...draft, year: value }))} />
            <TextField label="Language" value={songDraft.language} onChange={(value) => setSongDraft((draft) => ({ ...draft, language: value }))} />
            <TextField label="Genre" value={songDraft.genre} onChange={(value) => setSongDraft((draft) => ({ ...draft, genre: value }))} />
            <TextField label="Mood" value={songDraft.mood} onChange={(value) => setSongDraft((draft) => ({ ...draft, mood: value }))} />
            <TextField label="Lyricist" value={songDraft.lyricist} onChange={(value) => setSongDraft((draft) => ({ ...draft, lyricist: value }))} />
            <TextField label="Composer" value={songDraft.composer} onChange={(value) => setSongDraft((draft) => ({ ...draft, composer: value }))} />
            <TextField label="Music director" value={songDraft.musicDirector} onChange={(value) => setSongDraft((draft) => ({ ...draft, musicDirector: value }))} />
            <TextField label="Producer" value={songDraft.producer} onChange={(value) => setSongDraft((draft) => ({ ...draft, producer: value }))} />
            <TextField label="Music label" value={songDraft.label} onChange={(value) => setSongDraft((draft) => ({ ...draft, label: value }))} />
          </div>
          <ArtworkPicker label="Song artwork" url={songDraft.cover} file={songArtworkFile} onUrlChange={(value) => setSongDraft((draft) => ({ ...draft, cover: value }))} onFileChange={setSongArtworkFile} />
          <div className="admin-editor-actions"><button type="button" className="subtle-button" disabled={busy} onClick={closeEditors}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />} Save changes</button></div>
        </form>
      </div>}

      {editingArtist && artistDraft && <div className="modal-scrim admin-editor-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditors(); }}>
        <form className="admin-editor-modal" onSubmit={saveArtist} role="dialog" aria-modal="true" aria-labelledby="admin-artist-editor-title">
          <div className="admin-editor-heading"><div><span className="section-eyebrow">SINGER PROFILE</span><h2 id="admin-artist-editor-title">{editingArtist.name ? 'Edit artist' : 'Add artist'}</h2></div><button className="icon-button" type="button" disabled={busy} onClick={closeEditors} aria-label="Close editor"><X size={18} /></button></div>
          <TextField label="Artist name *" value={artistDraft.name} onChange={(value) => setArtistDraft((draft) => ({ ...draft, name: value }))} />
          <label className="admin-field"><span>Artist biography</span><textarea rows={5} value={artistDraft.bio} onChange={(event) => setArtistDraft((draft) => ({ ...draft, bio: event.target.value }))} placeholder="Verified singer biography…" /></label>
          <ArtworkPicker label="Artist portrait" url={artistDraft.photoUrl} file={artistPhotoFile} onUrlChange={(value) => setArtistDraft((draft) => ({ ...draft, photoUrl: value }))} onFileChange={setArtistPhotoFile} />
          <p className="admin-editor-note">If you cannot verify that the photo belongs to this singer, leave the portrait empty. SURDHARA will use a neutral placeholder.</p>
          <div className="admin-editor-actions"><button type="button" className="subtle-button" disabled={busy} onClick={closeEditors}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />} Save artist</button></div>
        </form>
      </div>}

      {editingPlaylist && playlistDraft && <div className="modal-scrim admin-editor-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditors(); }}>
        <form className="admin-editor-modal" onSubmit={savePlaylist} role="dialog" aria-modal="true" aria-labelledby="admin-playlist-editor-title">
          <div className="admin-editor-heading"><div><span className="section-eyebrow">SHARED COLLECTION</span><h2 id="admin-playlist-editor-title">Edit playlist</h2></div><button className="icon-button" type="button" disabled={busy} onClick={closeEditors} aria-label="Close editor"><X size={18} /></button></div>
          <TextField label="Playlist title *" value={playlistDraft.title} onChange={(value) => setPlaylistDraft((draft) => ({ ...draft, title: value }))} />
          <label className="admin-field"><span>Description</span><textarea rows={4} value={playlistDraft.description} onChange={(event) => setPlaylistDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
          <ArtworkPicker label="Playlist artwork" url={playlistDraft.cover} file={playlistCoverFile} onUrlChange={(value) => setPlaylistDraft((draft) => ({ ...draft, cover: value }))} onFileChange={setPlaylistCoverFile} />
          <div className="admin-editor-actions"><button type="button" className="subtle-button" disabled={busy} onClick={closeEditors}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />} Save playlist</button></div>
        </form>
      </div>}
    </div>
  );
}
