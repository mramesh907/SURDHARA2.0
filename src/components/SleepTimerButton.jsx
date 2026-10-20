import { useEffect, useState } from 'react';
import { Moon } from 'lucide-react';

const OPTIONS = [
  { label: '15 minutes', minutes: 15 }, { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 }, { label: '1 hour', minutes: 60 },
];

function format(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** timer: null | { endsAt: number } | { endOfTrack: true } */
export default function SleepTimerButton({ timer, onSet, className = 'dock-secondary-control' }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer?.endsAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer?.endsAt]);
  const active = Boolean(timer);
  const label = timer?.endsAt ? format(timer.endsAt - now) : timer?.endOfTrack ? 'End of song' : '';
  const choose = (value) => { onSet(value); setOpen(false); };

  return (
    <span className="sleep-timer-wrap">
      <button type="button" className={`${className} sleep-timer-button ${active ? 'active' : ''}`} onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} aria-label={active ? `Sleep timer: ${label}` : 'Set sleep timer'} title={active ? `Sleep timer: ${label}` : 'Sleep timer'}>
        <Moon size={16} />{active && <small>{label}</small>}
      </button>
      {open && <>
        <button type="button" className="menu-dismiss" aria-label="Close sleep timer" onClick={() => setOpen(false)} />
        <div className="sleep-timer-menu" role="menu" aria-label="Sleep timer">
          <b>Sleep timer</b>
          {OPTIONS.map((option) => <button key={option.minutes} role="menuitem" onClick={() => choose({ endsAt: Date.now() + option.minutes * 60_000 })}>{option.label}</button>)}
          <button role="menuitem" onClick={() => choose({ endOfTrack: true })}>End of this song</button>
          {active && <button role="menuitem" className="sleep-timer-off" onClick={() => choose(null)}>Turn off</button>}
        </div>
      </>}
    </span>
  );
}
