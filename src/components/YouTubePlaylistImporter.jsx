import { useState } from 'react';
import {
  AlertCircle, CheckCircle2, ExternalLink, Info, KeyRound, Link2, LoaderCircle,
  LockKeyhole, Music2, Youtube,
} from 'lucide-react';
import { importYouTubeInputs, refreshYouTubeSourceMetadata } from '../lib/youtubeImport.js';
import { enrichTrackListMetadata } from '../lib/musicMetadata.js';

const KEY_SESSION_NAME = 'SURDHARA-youtube-api-key-session';
const DEFAULT_INPUT = 'https://www.youtube.com/watch?v=5wOmqB5PAko&list=PLteSRTKLf30zAi6_iCozS5OJZRysd1Smv';

export default function YouTubePlaylistImporter({ existingTracks, onImported, onOpenPlaylist, onRefreshMetadata, embedded = false, cloudPublishingEnabled = false }) {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [apiKey, setApiKey] = useState(() => {
    try { return window.sessionStorage.getItem(KEY_SESSION_NAME) || ''; } catch { return ''; }
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState('');
  const [refreshMessage, setRefreshMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleImport = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setIsImporting(true);
    setProgress('Preparing import…');
    try {
      try { window.sessionStorage.setItem(KEY_SESSION_NAME, apiKey.trim()); } catch { /* ignore storage restrictions */ }
      const response = await importYouTubeInputs(input, apiKey, new Set(existingTracks.filter((track) => track.youtubeId).map((track) => track.youtubeId)), setProgress);
      const publication = await onImported(response);
      const attempted = input.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).length;
      const importedCount = Math.max(0, attempted - response.failures.length);
      const metadataMatched = response.tracks.filter((track) => track.metadataStatus === 'matched' || track.metadataStatus === 'cross-checked').length;
      const metadataCrossChecked = response.tracks.filter((track) => track.metadataStatus === 'cross-checked').length;
      setResult({ attempted, importedCount, tracks: response.tracks.length, playlists: response.playlists.length, metadataMatched, metadataCrossChecked, failures: response.failures, duplicates: response.skippedDuplicates.length, firstPlaylist: response.playlists[0], publishedToCloud: Boolean(publication?.publishedToCloud) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import could not be completed. Please try again.');
    } finally {
      setIsImporting(false);
      setProgress('');
    }
  };


  const handleRefreshMetadata = async () => {
    const imported = (existingTracks || []).filter((track) => track.importedFromYouTube && track.youtubeId);
    if (!imported.length) {
      setRefreshMessage('There are no imported YouTube tracks to refresh yet.');
      return;
    }
    setRefreshMessage('');
    setIsRefreshing(true);
    setRefreshProgress('Preparing music-catalogue lookup…');
    try {
      const sourceUpdated = apiKey.trim()
        ? await refreshYouTubeSourceMetadata(imported, apiKey, setRefreshProgress)
        : imported;
      const updated = await enrichTrackListMetadata(sourceUpdated, setRefreshProgress);
      await onRefreshMetadata?.(updated);
      const matched = updated.filter((track) => track.metadataStatus === 'matched' || track.metadataStatus === 'cross-checked').length;
      const checkedFromTwo = updated.filter((track) => track.metadataStatus === 'cross-checked').length;
      const unverified = updated.length - matched;
      setRefreshMessage(`Checked ${updated.length} imported track${updated.length === 1 ? '' : 's'}; ${matched} confident match${matched === 1 ? '' : 'es'}${checkedFromTwo ? ` (${checkedFromTwo} cross-checked from two catalogues)` : ''}. Uncertain matches are rejected and existing metadata is kept${unverified ? ` (${unverified} not confidently matched)` : ''}.`);
    } catch (caught) {
      setRefreshMessage(caught instanceof Error ? caught.message : 'Metadata refresh could not be completed.');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress('');
    }
  };

  return (
    <div className={`youtube-import-page ${embedded ? 'youtube-import-embedded' : ''}`}>
      {!embedded && <section className="page-heading">
        <span className="section-eyebrow"><Youtube size={14} /> YOUTUBE DATA IMPORT</span>
        <h1>Import from YouTube</h1>
        <p>
          Paste one or more YouTube video, playlist, or channel links.
          YouTube supplies playback, source details, and clearly labelled credits when available. Song metadata is also checked against independent music catalogues.
        </p>
      </section>}

      <div className="youtube-import-layout">
        <form className="importer-card" onSubmit={handleImport}>
          <div className="importer-card-title">
            <span className="importer-icon"><Link2 size={20} /></span>
            <div><h2>YouTube sources</h2><p>Import playback links, read clearly labelled song credits from source descriptions, then fill remaining fields from music catalogues where possible.</p></div>
          </div>

          <label className="importer-label" htmlFor="youtube-source-list">YouTube links</label>
          <textarea
            id="youtube-source-list"
            className="importer-input importer-textarea"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'Paste one link per line, for example:\nhttps://www.youtube.com/watch?v=xxxx\nhttps://www.youtube.com/playlist?list=xxxx\nhttps://www.youtube.com/@channelname'}
            rows={8}
            required
          />
          <p className="importer-help">You can paste individual video links, playlist links, or channel links.
            Channel links import the available uploaded videos as individual tracks.
            Duplicate videos are skipped automatically.</p>

          <label className="importer-label" htmlFor="youtube-api-key">YouTube Data API key</label>
          <div className="importer-key-field"><KeyRound size={16} /><input id="youtube-api-key" className="importer-input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your API key" autoComplete="off" required /></div>
          <p className="importer-help">The key is kept in this browser tab's session storage and sent directly from your browser to Google. It is also needed to refresh descriptions and labelled credits for songs already imported.</p>

          {(existingTracks || []).some((track) => track.importedFromYouTube && track.youtubeId) && <div className="metadata-refresh-block">
            <div><strong>Improve existing song details</strong><p>Refresh YouTube source details and merge clearly labelled credits with independent music-catalogue results. Only confident matches can replace existing metadata; uncertain results are rejected and the existing values are kept. Generic uploader/channel names are never treated as singers.</p></div>
            <button className="subtle-button metadata-refresh-button" type="button" onClick={handleRefreshMetadata} disabled={isImporting || isRefreshing}>
              {isRefreshing ? <LoaderCircle size={15} className="spin-icon" /> : <Music2 size={15} />}
              {isRefreshing ? 'Checking metadata…' : 'Refresh metadata'}
            </button>
            {isRefreshing && refreshProgress && <p className="importer-progress" role="status"><LoaderCircle size={15} className="spin-icon" /> {refreshProgress}</p>}
            {refreshMessage && <p className="metadata-refresh-message" role="status">{refreshMessage}</p>}
          </div>}

          <button className="primary-button importer-submit" type="submit" disabled={isImporting || isRefreshing}>
            {isImporting ? <LoaderCircle size={16} className="spin-icon" /> : <Youtube size={17} />}
            {isImporting ? (cloudPublishingEnabled ? 'Importing & publishing…' : 'Importing…') : (cloudPublishingEnabled ? 'Import & publish to SURDHARA' : 'Import sources')}
          </button>
          {isImporting && progress && <p className="importer-progress" role="status"><LoaderCircle size={15} className="spin-icon" /> {progress}</p>}
          {error && <div className="importer-alert importer-alert-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
          {result && <div className="importer-alert importer-alert-success" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>{result.publishedToCloud ? 'Import successful — published to shared SURDHARA catalogue' : (result.failures.length ? `Import completed: ${result.importedCount} of ${result.attempted} sources imported.` : 'Import successful in this browser')}</strong>
              <p>{result.tracks} track{result.tracks === 1 ? '' : 's'} and {result.playlists} playlist{result.playlists === 1 ? '' : 's'} imported{result.publishedToCloud ? ' and saved to the shared cloud database for all visitors' : ' in this browser only; configure Supabase to publish them publicly'}. Music metadata matched for {result.metadataMatched} track{result.metadataMatched === 1 ? '' : 's'}{result.metadataCrossChecked ? `, including ${result.metadataCrossChecked} cross-checked against two catalogues` : ''}{result.tracks - result.metadataMatched > 0 ? `; ${result.tracks - result.metadataMatched} remain unverified` : ''}. {result.duplicates ? `${result.duplicates} duplicate track${result.duplicates === 1 ? '' : 's'} skipped. ` : ''}{result.failures.length ? `${result.failures.length} source${result.failures.length === 1 ? '' : 's'} failed or were invalid.` : ''}</p>
              {result.failures.length > 0 && <ul className="importer-failure-list">{result.failures.slice(0, 5).map((failure, index) => <li key={`${failure.raw}-${index}`}><strong>{failure.raw}</strong><span>{failure.reason}</span></li>)}</ul>}
              {result.failures.length > 5 && <small className="importer-more-failures">And {result.failures.length - 5} more skipped source(s).</small>}
              {result.firstPlaylist && <button type="button" className="text-action" onClick={() => onOpenPlaylist(result.firstPlaylist.id)}>Open imported playlist <ExternalLink size={13} /></button>}
            </div>
          </div>}
        </form>

        <aside className="importer-aside">
          <div className="importer-info-card"><span className="info-icon"><Info size={18} /></span><h3>How to get an API key</h3><ol><li>Open Google Cloud Console.</li><li>Create or select a project.</li><li>Enable <strong>YouTube Data API v3</strong>.</li><li>Create an API key and paste it here.</li></ol><a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Open YouTube Data API <ExternalLink size={13} /></a></div>
          <div className="importer-info-card"><span className="info-icon"><LockKeyhole size={18} /></span><h3>Use the key safely</h3><p>For a public deployment, restrict the key by HTTP referrer and limit it to YouTube Data API v3. Never publish an unrestricted key in your source code.</p></div>
          <div className="importer-info-card"><span className="info-icon"><Music2 size={18} /></span><h3>Import rules</h3><p>
  Video links become individual tracks. Playlist links become playlists.
  Channel links import the channel's available uploaded videos as
  individual tracks. Invalid links are reported, unavailable videos are
  skipped, and duplicate YouTube video IDs are not added twice.
</p></div>
        </aside>
      </div>
    </div>
  );
}
