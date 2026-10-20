import { useEffect, useRef } from 'react';

const isTypingTarget = (target) => {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
};
const isButtonLike = (target) => {
  const tag = target?.tagName?.toLowerCase();
  const role = target?.getAttribute?.('role');
  return tag === 'button' || tag === 'a' || role === 'button' || role === 'menuitem';
};

/** Global player shortcuts. `actions` may change every render; the listener is attached once. */
export function useKeyboardShortcuts(actions, enabled = true) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const a = ref.current;
      const key = event.key;
      const handle = (fn) => { event.preventDefault(); fn?.(); };
      if (key === ' ' || key === 'Spacebar') { if (!isButtonLike(event.target)) handle(a.togglePlayback); return; }
      if (key === 'ArrowRight') return handle(event.shiftKey ? a.next : () => a.seekBy?.(5));
      if (key === 'ArrowLeft') return handle(event.shiftKey ? a.previous : () => a.seekBy?.(-5));
      if (key === 'ArrowUp') return handle(() => a.volumeBy?.(5));
      if (key === 'ArrowDown') return handle(() => a.volumeBy?.(-5));
      const lower = key.length === 1 ? key.toLowerCase() : key;
      if (lower === 'n') return handle(a.next);
      if (lower === 'p') return handle(a.previous);
      if (lower === 'm') return handle(a.toggleMute);
      if (lower === 'l') return handle(a.toggleLike);
      if (lower === 's') return handle(a.toggleShuffle);
      if (lower === 'r') return handle(a.cycleRepeat);
      if (key === '?') return handle(a.showHelp);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
