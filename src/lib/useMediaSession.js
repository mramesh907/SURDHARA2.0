import { useEffect, useRef } from 'react';
import { getTrackArtistNames } from './artistCredits.js';

const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof window.MediaMetadata === 'function';
const absolute = (url) => { try { return new URL(url, window.location.href).href; } catch { return ''; } };

/**
 * Lock-screen / notification / Bluetooth-headset / hardware-media-key controls with artwork.
 * Works while the tab is open (browsers do not let a web page keep YouTube audio alive once the OS
 * suspends it; self-hosted audio keeps playing with the screen off on most phones).
 */
export function useMediaSession({ track, isPlaying, currentTime, duration, onPlay, onPause, onPrevious, onNext, onSeekTo }) {
  const handlers = useRef({});
  handlers.current = { onPlay, onPause, onPrevious, onNext, onSeekTo, currentTime, duration };

  useEffect(() => {
    if (!supported() || !track) return;
    const cover = absolute(track.cover);
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: track.title || 'SURDHARA',
      artist: getTrackArtistNames(track).join(' & ') || track.artist || '',
      album: track.album || track.movie || 'SURDHARA',
      artwork: cover ? [{ src: cover, sizes: '480x360' }, { src: cover, sizes: '512x512' }] : [{ src: absolute('/icon-512.png'), sizes: '512x512', type: 'image/png' }],
    });
  }, [track?.id, track?.title, track?.cover]);

  useEffect(() => {
    if (!supported()) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!supported()) return undefined;
    const set = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* action unsupported on this browser */ } };
    set('play', () => handlers.current.onPlay?.());
    set('pause', () => handlers.current.onPause?.());
    set('previoustrack', () => handlers.current.onPrevious?.());
    set('nexttrack', () => handlers.current.onNext?.());
    set('seekbackward', (details) => handlers.current.onSeekTo?.(Math.max(0, (handlers.current.currentTime || 0) - (details?.seekOffset || 10))));
    set('seekforward', (details) => handlers.current.onSeekTo?.((handlers.current.currentTime || 0) + (details?.seekOffset || 10)));
    set('seekto', (details) => { if (Number.isFinite(details?.seekTime)) handlers.current.onSeekTo?.(details.seekTime); });
    return () => ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'].forEach((action) => set(action, null));
  }, []);

  const whole = Math.floor(currentTime || 0);
  useEffect(() => {
    if (!supported() || !navigator.mediaSession.setPositionState) return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try { navigator.mediaSession.setPositionState({ duration, position: Math.min(duration, Math.max(0, whole)), playbackRate: 1 }); } catch { /* invalid state while tracks switch */ }
  }, [whole, duration, track?.id]);
}
