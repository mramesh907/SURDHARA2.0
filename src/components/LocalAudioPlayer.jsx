import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { isSavedOffline, resolveSavedAudioUrl } from '../lib/offlineAudio.js';

const LocalAudioPlayer = forwardRef(function LocalAudioPlayer({ track, autoplayKey, volume = 68, muted = false, onPlayingChange, onEnded, onProgress, onPlaybackError, onStall, onPlaybackStarted }, forwardedRef) {
  const audioRef = useRef(null);
  const lastAutoplayKeyRef = useRef(0);

  useImperativeHandle(forwardedRef, () => ({
    play: () => audioRef.current?.play?.(),
    pause: () => audioRef.current?.pause?.(),
    toggle: () => { const audio = audioRef.current; if (!audio) return; audio.paused ? audio.play() : audio.pause(); },
    seekTo: (seconds) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, Number(seconds) || 0); },
    setVolume: (value) => { if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, Number(value) / 100)); },
    mute: () => { if (audioRef.current) audioRef.current.muted = true; },
    unMute: () => { if (audioRef.current) audioRef.current.muted = false; },
    getCurrentTime: () => Number(audioRef.current?.currentTime) || 0,
    retry: () => {},
    reload: (seconds = 0, autoplay = true) => {
      const audio = audioRef.current;
      if (!audio || !audio.src) return;
      const resumeAt = Math.max(0, seconds);
      audio.load();
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = resumeAt; if (autoplay) audio.play().catch(() => {}); }, { once: true });
    },
  }), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, Number(volume) / 100));
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    let cancelled = false;
    let savedCopy = null;
    audio.pause();
    audio.currentTime = 0;
    const previousAutoplayKey = lastAutoplayKeyRef.current;
    const shouldAutoplay = autoplayKey > previousAutoplayKey;
    const start = (src) => {
      if (cancelled) return;
      audio.src = src;
      audio.load();
      if (shouldAutoplay) {
        lastAutoplayKeyRef.current = autoplayKey;
        audio.play().catch(() => {});
      }
    };
    if (track?.audioUrl) {
      // A song saved for offline plays from the device (instant start, no data, works with no network).
      if (isSavedOffline(track.audioUrl)) {
        resolveSavedAudioUrl(track.audioUrl).then((saved) => {
          savedCopy = saved;
          start(saved?.url || track.audioUrl);
        });
      } else {
        start(track.audioUrl);
      }
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
    return () => {
      cancelled = true;
      savedCopy?.revoke();
      // React StrictMode (npm run dev) mounts, cleans up and re-runs this effect immediately; without this the second run
      // thinks the tap was already handled and the first song you tap never starts.
      if (shouldAutoplay && lastAutoplayKeyRef.current === autoplayKey) lastAutoplayKeyRef.current = previousAutoplayKey;
    };
  }, [track?.id, track?.audioUrl, autoplayKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = () => onProgress?.(audio.currentTime || 0, audio.duration || track?.durationSeconds || 0);
    const onPlay = () => { onPlayingChange?.(true); onPlaybackStarted?.(); };
    let stallTimer = null;
    const onWaiting = () => { window.clearTimeout(stallTimer); stallTimer = window.setTimeout(() => onStall?.(), 12000); };
    const onResume = () => window.clearTimeout(stallTimer);
    const onError = () => {
      window.clearTimeout(stallTimer);
      onPlayingChange?.(false);
      const code = audio.error?.code; // 2 = network, 3 = decode, 4 = source not supported / not found
      onPlaybackError?.(code === 2 ? 'The connection dropped while loading this song.' : 'This audio file could not be played.', { code: code === 2 ? 'network' : `media-${code}`, permanent: code === 4 || code === 3 });
    };
    const onPause = () => onPlayingChange?.(false);
    const onEnd = () => { onPlayingChange?.(false); onEnded?.(); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onResume);
    audio.addEventListener('canplay', onResume);
    audio.addEventListener('error', onError);
    return () => {
      window.clearTimeout(stallTimer);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onResume);
      audio.removeEventListener('canplay', onResume);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnd);
    };
  }, [onPlayingChange, onEnded, onProgress, onPlaybackError, onStall, onPlaybackStarted, track?.durationSeconds]);

  return <audio ref={audioRef} preload="metadata" aria-hidden="true" />;
});

export default LocalAudioPlayer;
