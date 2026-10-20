import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, FolderOpen, LoaderCircle, Music2, Upload, X, FileAudio, PencilLine } from 'lucide-react';
import { artistSlug, splitArtistCredit } from '../lib/artistCredits.js';
import { saveLocalAudioFiles } from '../lib/localAudioStorage.js';

const AUDIO_TYPES = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus';
const LANGUAGE_OPTIONS = ['Bengali', 'Hindi', 'English', 'Assamese', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Punjabi', 'Urdu', 'Marathi', 'Other'];
const MOOD_OPTIONS = [
  { value: 'all', label: 'Not specified' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'chill', label: 'Chill & Relax' },
  { value: 'classic', label: 'Classic / Evergreen' },
  { value: 'sad', label: 'Sad / Heartbreak' },
  { value: 'feel-good', label: 'Feel-good / Upbeat' },
];

function cleanTitle(name = '') {
  return name.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled local song';
}

function fileKey(file) {
  return `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
}

function makeEntry(file) {
  return {
    entryId: fileKey(file),
    file,
    details: {
      title: cleanTitle(file.name), singer: '', originalSinger: '', album: '', movie: '',
      releaseDate: '', year: '', language: '', genre: '', mood: 'all', lyricist: '',
      composer: '', musicDirector: '', producer: '', label: '', tags: '', notes: '',
    },
  };
}

function splitTags(value = '') {
  return [...new Set(String(value).split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean))];
}

function makeLocalTrack(entry) {
  const { file, details } = entry;
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const singers = splitArtistCredit(details.singer);
  const originalSingers = splitArtistCredit(details.originalSinger);
  const releaseYear = String(details.year || (details.releaseDate ? details.releaseDate.slice(0, 4) : '')).trim();
  const releaseDate = details.releaseDate.trim();
  const tags = splitTags(details.tags);
  const genre = details.genre.trim();
  if (genre && !tags.some((tag) => tag.toLocaleLowerCase('en') === genre.toLocaleLowerCase('en'))) tags.push(genre);

  return {
    id,
    localAudioId: id,
    title: details.title.trim() || cleanTitle(file.name),
    artist: singers.join(' & '),
    artistNames: singers,
    artistIds: singers.map(artistSlug).filter(Boolean),
    vocalArtistNames: singers,
    artistCreditRole: singers.length ? 'vocalist' : '',
    originalSinger: originalSingers.join(' & '),
    originalSingerNames: originalSingers,
    originalSingerSource: originalSingers.length ? 'User-entered local metadata' : '',
    album: details.album.trim(),
    movie: details.movie.trim(),
    year: releaseYear && Number.isFinite(Number(releaseYear)) ? Number(releaseYear) : null,
    releaseDate,
    metadataReleaseDate: releaseDate,
    genre: genre || 'Unclassified',
    language: details.language || 'Unknown',
    languageSource: details.language ? 'user-provided' : '',
    mood: details.mood || 'all',
    lyricist: details.lyricist.trim(),
    composer: details.composer.trim(),
    musicDirector: details.musicDirector.trim(),
    producer: details.producer.trim(),
    label: details.label.trim(),
    tags,
    description: details.notes.trim(),
    cover: '/local-audio-cover.svg',
    audioUrl: URL.createObjectURL(file),
    sourceType: 'local',
    importedFromYouTube: false,
    localFileName: file.name,
    localFileSize: file.size,
    localFileType: file.type || 'audio/*',
    durationSeconds: 0,
    importedAt: new Date().toISOString(),
    metadataStatus: 'user-entered',
    metadataSources: ['User-entered local metadata'],
  };
}

export default function LocalAudioImporter({ onImported, cloudPublishingEnabled = false }) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [songs, setSongs] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [expandedSongId, setExpandedSongId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);

  const totalSize = useMemo(() => songs.reduce((sum, song) => sum + song.file.size, 0), [songs]);
  const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const addFiles = (incoming) => {
    const audioFiles = [...incoming].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name));
    const seen = new Set(songs.map(({ file }) => fileKey(file)));
    const newSongs = audioFiles.filter((file) => !seen.has(fileKey(file))).map(makeEntry);
    setSongs((previous) => {
      const previousIds = new Set(previous.map((song) => song.entryId));
      return [...previous, ...newSongs.filter((song) => !previousIds.has(song.entryId))];
    });
    setExpandedSongId((previous) => previous || newSongs[0]?.entryId || '');
    setMessage('');
    setStorageWarning(false);
  };

  const updateDetail = (entryId, field, value) => {
    setSongs((previous) => previous.map((song) => song.entryId === entryId ? { ...song, details: { ...song.details, [field]: value } } : song));
  };

  const removeSong = (entryId) => {
    if (expandedSongId === entryId) setExpandedSongId(songs.find((song) => song.entryId !== entryId)?.entryId || '');
    setSongs((previous) => previous.filter((song) => song.entryId !== entryId));
  };

  const importFiles = async () => {
    if (!songs.length) return;
    setIsImporting(true);
    setMessage('');
    const tracks = songs.map(makeLocalTrack);
    const title = playlistName.trim();
    const playlist = title ? {
      id: `local-playlist-${Date.now()}`,
      title,
      subtitle: 'Local music collection',
      description: 'Songs imported from a device and published to the SURDHARA catalogue.',
      cover: '/local-audio-cover.svg',
      trackIds: tracks.map((track) => track.id),
      isCustom: true,
    } : null;

    if (cloudPublishingEnabled) {
      try {
        const files = songs.map((song, index) => ({ trackId: tracks[index].id, file: song.file }));
        const result = await onImported?.({ tracks, playlist, files });
        if (!result?.publishedToCloud) {
          throw new Error('The cloud server did not confirm publication. The songs have not been marked as public.');
        }
        tracks.forEach((track) => { if (track.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(track.audioUrl); });
        setSongs([]);
        setPlaylistName('');
        setExpandedSongId('');
        setMessage(`${tracks.length} local song${tracks.length === 1 ? '' : 's'} uploaded to cloud storage and published in the shared SURDHARA library.`);
        setStorageWarning(false);
      } catch (error) {
        tracks.forEach((track) => { if (track.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(track.audioUrl); });
        setMessage(error instanceof Error ? error.message : 'The songs could not be published. Check your connection and try again.');
        setStorageWarning(true);
      } finally {
        setIsImporting(false);
      }
      return;
    }

    let audioFilesSaved = true;
    try {
      await saveLocalAudioFiles(tracks.map((track, index) => ({ id: track.localAudioId, file: songs[index].file })));
    } catch {
      // Keep playback working for the current session even if this browser blocks IndexedDB.
      audioFilesSaved = false;
    }
    const sessionTracks = tracks.map((track) => ({ ...track, localAudioPersistent: audioFilesSaved }));
    try {
      await onImported?.({ tracks: sessionTracks, playlist });
      setSongs([]);
      setPlaylistName('');
      setExpandedSongId('');
      setMessage(audioFilesSaved
        ? `${tracks.length} local song${tracks.length === 1 ? '' : 's'} imported into this browser only. Configure Supabase and sign in as Admin to publish them for everyone.`
        : `${tracks.length} local song${tracks.length === 1 ? '' : 's'} imported for this session only. Browser storage was unavailable, and cloud publishing is not configured.`);
      setStorageWarning(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The songs could not be imported. Please try again.');
      setStorageWarning(true);
    } finally {
      setIsImporting(false);
    }
  };

  const field = (entry, name, label, placeholder = '', type = 'text') => (
    <label className="local-detail-field" key={name}>
      <span>{label}</span>
      <input
        className="importer-input"
        type={type}
        value={entry.details[name]}
        placeholder={placeholder}
        onChange={(event) => updateDetail(entry.entryId, name, event.target.value)}
      />
    </label>
  );

  const selectField = (entry, name, label, options, placeholder) => (
    <label className="local-detail-field" key={name}>
      <span>{label}</span>
      <select className="importer-input" value={entry.details[name]} onChange={(event) => updateDetail(entry.entryId, name, event.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => typeof option === 'string'
          ? <option value={option} key={option}>{option || 'Not specified'}</option>
          : <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  return (
    <section className="importer-card local-import-card">
      <div className="importer-card-title">
        <span className="importer-icon"><Music2 size={20} /></span>
        <div><h2>Import Local Songs</h2><p>Choose files, add each song's details, then publish them to the shared cloud library when Admin cloud setup is ready.</p></div>
      </div>

      <div className="local-import-actions">
        <button type="button" className="primary-button local-picker-button" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Choose songs</button>
        <button type="button" className="subtle-button local-picker-button" onClick={() => folderInputRef.current?.click()}><FolderOpen size={16} /> Choose folder</button>
        <input ref={fileInputRef} hidden type="file" accept={AUDIO_TYPES} multiple onChange={(event) => { addFiles(event.target.files || []); event.target.value = ''; }} />
        <input ref={folderInputRef} hidden type="file" accept={AUDIO_TYPES} multiple webkitdirectory="true" directory="true" onChange={(event) => { addFiles(event.target.files || []); event.target.value = ''; }} />
      </div>

      <p className="importer-help">Supported: MP3, WAV, M4A, AAC, OGG, FLAC and OPUS. Each song can have its own singer, album/movie, release details, language, genre and credits. {cloudPublishingEnabled ? 'Importing uploads the audio to SURDHARA cloud storage and publishes it for all visitors.' : 'Without cloud setup, audio stays in this browser and is not visible to other visitors.'}</p>

      <label className="importer-label" htmlFor="local-playlist-name">Also create a playlist for this batch (optional)</label>
      <input id="local-playlist-name" className="importer-input" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="e.g. My downloaded songs" />
      <p className="local-import-note">Every imported song will still appear in All songs, Search, Artists and matching SURDHARA playlists. This optional playlist is an extra collection only.</p>

      {songs.length > 0 && <div className="local-file-list" aria-live="polite">
        <div className="local-file-list-heading"><strong>{songs.length} selected</strong><span>{formatSize(totalSize)}</span></div>
        <div className="local-song-editor-list">
          {songs.map((song) => {
            const isExpanded = expandedSongId === song.entryId;
            const singerSummary = song.details.singer.trim() || 'Singer not entered';
            return <article className={`local-song-editor ${isExpanded ? 'expanded' : ''}`} key={song.entryId}>
              <div className="local-song-editor-row">
                <span className="local-song-file-icon"><FileAudio size={16} /></span>
                <div className="local-song-editor-copy"><strong>{song.details.title.trim() || cleanTitle(song.file.name)}</strong><small>{singerSummary} · {song.file.name} · {formatSize(song.file.size)}</small></div>
                <button type="button" className="local-edit-details-button" onClick={() => setExpandedSongId(isExpanded ? '' : song.entryId)} aria-expanded={isExpanded}>
                  <PencilLine size={14} /> {isExpanded ? 'Close' : 'Edit details'} {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button type="button" className="local-remove-file-button" aria-label={`Remove ${song.file.name}`} onClick={() => removeSong(song.entryId)}><X size={14} /></button>
              </div>
              {isExpanded && <div className="local-song-details-form">
                <div className="local-details-form-heading"><strong>Song details</strong><span>Enter as much accurate information as you know. Blank details will stay unclassified rather than being guessed.</span></div>
                <div className="local-details-grid">
                  {field(song, 'title', 'Song title', 'Song name')}
                  {field(song, 'singer', 'Singer / artist(s)', 'e.g. Kishore Kumar, Lata Mangeshkar')}
                  {field(song, 'originalSinger', 'Original singer (if a cover)', 'Leave blank if unknown')}
                  {field(song, 'album', 'Album', 'Album name')}
                  {field(song, 'movie', 'Movie / soundtrack', 'Movie name, if applicable')}
                  {field(song, 'releaseDate', 'Release date', '', 'date')}
                  {field(song, 'year', 'Release year', 'e.g. 1994', 'number')}
                  {selectField(song, 'language', 'Language', LANGUAGE_OPTIONS, 'Choose language')}
                  {field(song, 'genre', 'Genre / style', 'e.g. Bengali Folk, Rabindra Sangeet, Romantic')}
                  {selectField(song, 'mood', 'Mood (optional)', MOOD_OPTIONS)}
                  {field(song, 'lyricist', 'Lyricist', 'Lyrics by')}
                  {field(song, 'composer', 'Composer', 'Music composed by')}
                  {field(song, 'musicDirector', 'Music director', 'Music director')}
                  {field(song, 'producer', 'Producer', 'Producer')}
                  {field(song, 'label', 'Music label', 'Record label')}
                  {field(song, 'tags', 'Tags / playlist keywords', 'e.g. 90s, evergreen, folk')}
                  {field(song, 'notes', 'Notes about this song', 'Optional notes')}
                </div>
              </div>}
            </article>;
          })}
        </div>
      </div>}

      <button type="button" className="primary-button importer-submit" disabled={!songs.length || isImporting} onClick={importFiles}>
        {isImporting ? <LoaderCircle size={16} className="spin-icon" /> : <Upload size={17} />}
        {isImporting ? (cloudPublishingEnabled ? 'Uploading & publishing…' : 'Importing…') : `${cloudPublishingEnabled ? 'Upload & Publish' : 'Import'} ${songs.length || ''} Local Song${songs.length === 1 ? '' : 's'}`.trim()}
      </button>

      {message && <div className={`importer-alert ${storageWarning ? 'importer-alert-warning' : 'importer-alert-success'}`} role="status"><CheckCircle2 size={18} /><span>{message}</span></div>}
    </section>
  );
}
