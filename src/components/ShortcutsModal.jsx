import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

const ROWS = [
  ['Space', 'Play / pause'], ['← / →', 'Back / forward 5 seconds'], ['Shift + ← / →', 'Previous / next song'],
  ['N  /  P', 'Next / previous song'], ['↑ / ↓', 'Volume up / down'], ['M', 'Mute'], ['L', 'Like the current song'],
  ['S', 'Shuffle'], ['R', 'Repeat'], ['/', 'Search'], ['?', 'Show this list'],
];

export default function ShortcutsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="shortcuts-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <button className="modal-close icon-button" onClick={onClose} aria-label="Close shortcuts"><X size={18} /></button>
        <span className="modal-icon"><Keyboard size={22} /></span>
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts-list">{ROWS.map(([keys, label]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{label}</dd></div>)}</dl>
      </section>
    </div>
  );
}
