import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FolderDown, LoaderCircle, Link2, RefreshCw, Terminal, X } from 'lucide-react';
import { DOWNLOADER_BASE, SERVER_START_COMMAND, getDownloadJob, listDownloadJobs, startYouTubeDownload } from '../lib/downloaderApi.js';

const isFinal = (status) => status === 'done' || status === 'error';
const MAX_MISSED_POLLS = 8;

function ServerHelp({ state, onRecheck }) {
  const noYtDlp = state === 'no-ytdlp';
  return (
    <div className="downloader-help" role="status">
      <div className="downloader-help-title"><Terminal size={17} /><strong>{noYtDlp ? 'One more step: install yt-dlp' : 'Start the SURDHARA server to download songs'}</strong></div>
      <p>{noYtDlp
        ? 'The server is running but yt-dlp is not installed. In the SURDHARA project folder run the command below, then restart the server.'
        : 'Downloading needs a small helper that runs on your computer and saves songs into Downloads/Surdhara. Open a terminal in the SURDHARA project folder and run:'}</p>
      <pre><code>{noYtDlp ? 'pip install -r requirements.txt' : `pip install -r requirements.txt\n${SERVER_START_COMMAND}`}</code></pre>
      <p className="downloader-help-small">Looking for it at <code>{DOWNLOADER_BASE || window.location.origin}</code>. For best results also install <strong>ffmpeg</strong>.</p>
      <button type="button" className="subtle-button" onClick={onRecheck}><RefreshCw size={14} /> Check again</button>
    </div>
  );
}

function JobRow({ job, onDismiss }) {
  const working = !isFinal(job.status);
  const title = job.title || job.url;
  return (
    <li className={`downloader-job downloader-job-${job.status}`}>
      <span className="downloader-job-icon" aria-hidden="true">
        {job.status === 'done' ? <CheckCircle2 size={17} /> : job.status === 'error' ? <AlertCircle size={17} /> : <LoaderCircle size={17} className="spin-icon" />}
      </span>
      <div className="downloader-job-copy">
        <strong title={title}>{title}</strong>
        <span>{job.status === 'error' ? job.message : job.status === 'done' ? (job.alreadyDownloaded ? 'Already in Downloads/Surdhara' : 'Saved to Downloads/Surdhara as M4A') : job.message}</span>
        {working && <div className="downloader-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress || 0}><i style={{ width: `${Math.max(3, job.progress || 0)}%` }} /></div>}
      </div>
      {!working && <button type="button" className="tiny-icon-button" onClick={() => onDismiss(job.id)} aria-label="Dismiss"><X size={15} /></button>}
    </li>
  );
}

export default function SongDownloader({ serverState = 'checking', folder = '', ffmpeg = null, onRecheck, onSongSaved }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const savedRef = useRef(onSongSaved);
  savedRef.current = onSongSaved;
  const misses = useRef({});
  const announced = useRef(new Set());
  const ready = serverState === 'online';

  const mergeJobs = (incoming) => setJobs((previous) => {
    const map = new Map(previous.map((job) => [job.id, job]));
    incoming.forEach((job) => map.set(job.id, { ...map.get(job.id), ...job }));
    return [...map.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
  });

  const announce = (job) => {
    if (job.status === 'done' && !announced.current.has(job.id)) {
      announced.current.add(job.id);
      savedRef.current?.(job);
    }
  };

  // Pick up downloads that are still running when you come back to this page.
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    listDownloadJobs().then((result) => {
      if (!active) return;
      const running = (result.jobs || []).filter((job) => !isFinal(job.status));
      if (running.length) mergeJobs(running);
    }).catch(() => {});
    return () => { active = false; };
  }, [ready]);

  // Poll the server while something is downloading.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const active = jobsRef.current.filter((job) => !isFinal(job.status));
      if (!active.length) return;
      const updates = await Promise.all(active.map(async (job) => {
        try {
          const { job: fresh } = await getDownloadJob(job.id);
          misses.current[job.id] = 0;
          return fresh;
        } catch (caught) {
          misses.current[job.id] = (misses.current[job.id] || 0) + 1;
          if (caught?.status === 404) return { ...job, status: 'error', message: 'The server no longer knows this download. Press Refresh to see what was saved.' };
          if (misses.current[job.id] >= MAX_MISSED_POLLS) return { ...job, status: 'error', message: 'Lost contact with the SURDHARA server.' };
          return null;
        }
      }));
      const fresh = updates.filter(Boolean);
      if (fresh.length) { mergeJobs(fresh); fresh.forEach(announce); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const links = url.split(/[\s,]+/).filter(Boolean);
    if (!links.length) { setError('Paste a YouTube link first.'); return; }
    setBusy(true);
    setError('');
    const started = [];
    for (const link of links) {
      try {
        const { job } = await startYouTubeDownload(link);
        started.push(job);
      } catch (caught) {
        setError(caught.unreachable ? 'Could not reach the SURDHARA server. Make sure it is running.' : caught.message);
        if (caught.unreachable) onRecheck?.();
        break;
      }
    }
    if (started.length) {
      mergeJobs(started);
      started.forEach(announce);
      setUrl('');
    }
    setBusy(false);
  };

  const dismiss = (id) => setJobs((previous) => previous.filter((job) => job.id !== id));
  const running = jobs.some((job) => !isFinal(job.status));
  const finished = jobs.filter((job) => isFinal(job.status));

  return (
    <section className="importer-card downloader-card" aria-labelledby="downloader-title">
      <div className="importer-card-title">
        <span className="importer-icon"><Download size={20} /></span>
        <div>
          <h2 id="downloader-title">Add a song from YouTube</h2>
          <p>Paste a video link. SURDHARA saves the audio as an M4A file in your <strong>Downloads/Surdhara</strong> folder and lists it below.</p>
        </div>
      </div>

      {serverState === 'checking' || serverState === 'idle' ? <p className="importer-progress" role="status"><LoaderCircle size={15} className="spin-icon" /> Connecting to the SURDHARA server…</p>
        : !ready ? <ServerHelp state={serverState} onRecheck={onRecheck} /> : (
        <form onSubmit={submit}>
          <label className="importer-label" htmlFor="yt-download-url">YouTube video link</label>
          <div className="importer-key-field">
            <Link2 size={16} />
            <input
              id="yt-download-url" className="importer-input" type="text" inputMode="url" autoComplete="off" spellCheck="false"
              value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…  or  https://youtu.be/…"
            />
          </div>
          <p className="importer-help">Only a single video per link (playlist links are not downloaded). You can paste several links separated by a space or new line.</p>
          <button className="primary-button importer-submit" type="submit" disabled={busy || !url.trim()}>
            {busy ? <LoaderCircle size={16} className="spin-icon" /> : <FolderDown size={17} />}
            {busy ? 'Starting…' : 'Download as M4A'}
          </button>
          {error && <div className="importer-alert importer-alert-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
          {ffmpeg === false && <p className="importer-help">ffmpeg was not found on your computer. Most videos still work; install ffmpeg to support every video and embed song tags.</p>}
          {folder && <p className="importer-help downloader-folder">Saving to <code>{folder}</code></p>}
        </form>
      )}

      {jobs.length > 0 && <ul className="downloader-jobs" aria-live="polite">
        {jobs.map((job) => <JobRow key={job.id} job={job} onDismiss={dismiss} />)}
        {!running && finished.length > 1 && <li className="downloader-clear"><button type="button" className="text-action" onClick={() => setJobs([])}>Clear list</button></li>}
      </ul>}
    </section>
  );
}
