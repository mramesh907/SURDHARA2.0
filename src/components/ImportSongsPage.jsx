import { AlertCircle, CheckCircle2, CloudUpload, Music2, Youtube } from 'lucide-react';
import LocalAudioImporter from './LocalAudioImporter.jsx';
import YouTubePlaylistImporter from './YouTubePlaylistImporter.jsx';

export default function ImportSongsPage({ existingTracks, onImported, onOpenPlaylist, onRefreshMetadata, onImportedLocal, cloudConfigured = false, cloudStatus = 'not-configured', cloudPublishingEnabled = false, onMigrateExisting, legacyImportCount = 0, isMigratingLegacy = false, cloudError = '' }) {
  return (
    <div className="import-songs-page">
      <section className="page-heading">
        <span className="section-eyebrow"><Music2 size={14} /> MUSIC IMPORT</span>
        <h1>Import Songs</h1>
        <p>Bring music into SURDHARA from your device or from YouTube, using the source that fits you best.</p>
      </section>

      {!cloudConfigured ? <div className="cloud-publishing-banner cloud-publishing-warning"><AlertCircle size={18} /><div><strong>Cloud publishing is not configured</strong><p>Imports will stay in this browser only. Follow <code>docs/PHASE-2-CLOUD-MUSIC.md</code> to connect the shared database and public audio storage.</p></div></div> : cloudStatus === 'ready' && cloudPublishingEnabled ? <div className="cloud-publishing-banner cloud-publishing-ready"><CheckCircle2 size={18} /><div><strong>Shared cloud catalogue connected</strong><p>Admin imports will be saved to the central database. Local audio uploads go to cloud storage; published songs are visible to all visitors without a website rebuild.</p></div></div> : <div className="cloud-publishing-banner cloud-publishing-warning"><AlertCircle size={18} /><div><strong>Cloud setup needs attention</strong><p>{cloudError || 'Check the Supabase environment values and run the Phase 2 SQL migration.'} Do not treat browser-only imports as publicly published.</p></div></div>}

      {cloudPublishingEnabled && cloudStatus === 'ready' && legacyImportCount > 0 && <section className="cloud-migration-card"><div className="cloud-migration-copy"><span className="section-eyebrow"><CloudUpload size={13} /> ONE-TIME CATALOG MIGRATION</span><h2>Publish existing browser imports</h2><p>Move older YouTube imports and local audio saved only in this browser into the shared cloud catalogue. The count is for song items; playlists are handled separately. Existing cloud songs and published playlist links are preserved, and matching YouTube videos are skipped. Review your rights to each audio file before publishing.</p></div><button type="button" className="subtle-button" onClick={onMigrateExisting} disabled={!onMigrateExisting || isMigratingLegacy}>{isMigratingLegacy ? <span className="spin-icon"><CloudUpload size={15} /></span> : <CloudUpload size={15} />} {isMigratingLegacy ? 'Publishing existing imports…' : `Migrate ${legacyImportCount} item${legacyImportCount === 1 ? '' : 's'}`}</button></section>}

      <section className="import-source-section">
        <div className="import-source-heading">
          <div><span className="section-eyebrow"><Music2 size={13} /> FROM YOUR DEVICE</span><h2>Import Local Songs</h2><p>Select downloaded songs or a complete music folder. {cloudPublishingEnabled ? 'Admin uploads are stored in shared cloud storage and published for everyone.' : 'Without cloud setup, audio remains on this device.'}</p></div>
        </div>
        <LocalAudioImporter onImported={onImportedLocal} cloudPublishingEnabled={cloudPublishingEnabled} />
      </section>

      <section className="import-source-section import-youtube-section">
        <div className="import-source-heading">
          <div><span className="section-eyebrow"><Youtube size={13} /> FROM YOUTUBE</span><h2>Import from YouTube</h2><p>Paste YouTube video, playlist, or channel links and keep official YouTube playback with enriched music metadata.</p></div>
        </div>
        <YouTubePlaylistImporter embedded existingTracks={existingTracks} onImported={onImported} onOpenPlaylist={onOpenPlaylist} onRefreshMetadata={onRefreshMetadata} cloudPublishingEnabled={cloudPublishingEnabled} />
      </section>
    </div>
  );
}
