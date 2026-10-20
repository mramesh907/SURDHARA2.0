import { CloudOff, Download, RefreshCw, Wifi, AlertTriangle, Loader2 } from 'lucide-react';
import { formatAge } from '../lib/network.js';

/**
 * One calm, non-blocking status strip. Shows only the single most important thing:
 * offline > update ready > catalogue refresh failing > library not saved > back online > first-load progress.
 */
export default function NetworkBanner({
  online, justReconnected, catalogue, librarySync, hasSavedSongs, onOpenSaved, onRetry, updateReady, onUpdate,
}) {
  const progress = catalogue?.status === 'partial' && catalogue.progress ? Math.round(catalogue.progress * 100) : null;
  let tone = null; let icon = null; let text = null; let action = null;

  if (!online) {
    tone = 'offline'; icon = <CloudOff size={16} />;
    text = catalogue?.count
      ? <>You’re offline. Showing your saved library{catalogue.syncedAt ? ` (updated ${formatAge(catalogue.syncedAt)})` : ''}. Saved songs still play.</>
      : <>You’re offline. Connect to load music — saved songs still play.</>;
    if (hasSavedSongs) action = <button type="button" onClick={onOpenSaved}><Download size={14} /> Saved songs</button>;
  } else if (updateReady) {
    tone = 'info'; icon = <RefreshCw size={16} />; text = <>A new version of SURDHARA is ready.</>;
    action = <button type="button" onClick={onUpdate}>Update now</button>;
  } else if (catalogue?.status === 'stale' && catalogue.error && !catalogue.refreshing) {
    tone = 'warn'; icon = <AlertTriangle size={16} />;
    text = <>Couldn’t refresh the catalogue — showing the copy from {formatAge(catalogue.syncedAt) || 'earlier'}. Retrying automatically.</>;
    action = <button type="button" onClick={onRetry}><RefreshCw size={14} /> Retry now</button>;
  } else if (catalogue?.status === 'error') {
    tone = 'warn'; icon = <AlertTriangle size={16} />;
    text = <>The music catalogue couldn’t be loaded. Retrying automatically.</>;
    action = <button type="button" onClick={onRetry}><RefreshCw size={14} /> Retry now</button>;
  } else if (librarySync === 'error') {
    tone = 'warn'; icon = <AlertTriangle size={16} />; text = <>Your latest changes couldn’t be saved yet. We’ll keep retrying.</>;
  } else if (justReconnected) {
    tone = 'ok'; icon = <Wifi size={16} />; text = <>Back online — syncing your music.</>;
  } else if (progress !== null) {
    tone = 'info'; icon = <Loader2 size={16} className="spin-icon" />; text = <>Loading the catalogue… {progress}%</>;
  }
  if (!tone) return null;

  return (
    <div className={`network-banner network-banner-${tone}`} role="status" aria-live="polite">
      <span className="network-banner-icon">{icon}</span>
      <span className="network-banner-text">{text}</span>
      {action && <span className="network-banner-action">{action}</span>}
      {progress !== null && tone === 'info' && <i className="network-banner-progress" style={{ width: `${progress}%` }} />}
    </div>
  );
}
