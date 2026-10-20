import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Background playback
//
// Phones suspend web pages when the screen locks or the user switches apps. Two things help music keep going:
//   1. The page must look like a real "media" page to the OS: an <audio> element that is actually playing plus
//      Media Session metadata/handlers (see useMediaSession). Self-hosted songs already use an <audio> element, so
//      they keep playing natively. The YouTube player is an iframe, which does NOT count, so while a YouTube song
//      plays we run a silent, looping <audio> clip in parallel to hold the audio session open.
//   2. If the browser still pauses the YouTube iframe the instant the page is hidden, we detect "paused by the
//      system, not by the user" (it happens within a moment of the page going hidden) and resume it.
// A user pressing pause (in the app, on the lock screen, or on a headset) always wins: userPausedRef is true then.
// ---------------------------------------------------------------------------------------------------------------

const SILENT_SECONDS = 10; // Chrome only treats media of 5s+ as a notification-worthy media session.
const SAMPLE_RATE = 8000;
const SYSTEM_PAUSE_WINDOW_MS = 3000;
const RESUME_ATTEMPTS = 6;
const RESUME_INTERVAL_MS = 500;

let silentUrl = null;
function getSilentWavUrl() {
  if (silentUrl) return silentUrl;
  const samples = SAMPLE_RATE * SILENT_SECONDS;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const writeText = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + samples, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  writeText(36, 'data'); view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128); // 8-bit PCM silence
  silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return silentUrl;
}

/**
 * @param enabled        user setting ("Background play" switch)
 * @param isPlaying      shared playback state
 * @param usesIframe     true when the current song is played by the YouTube iframe (self-hosted audio needs no help)
 * @param userPausedRef  ref that is true after an explicit pause by the user
 * @param playerRef      ref to the active player (play / pause)
 */
export function useBackgroundPlayback({ enabled, isPlaying, usesIframe, userPausedRef, playerRef }) {
  const keepAliveRef = useRef(null);
  const isPlayingRef = useRef(isPlaying);
  const stateRef = useRef({ hiddenAt: 0, playingWhenHidden: false, timer: null });
  isPlayingRef.current = isPlaying;

  // 1) Silent keep-alive clip, only while a YouTube song is actually playing.
  useEffect(() => {
    if (typeof Audio === 'undefined') return undefined;
    if (!keepAliveRef.current) {
      const element = new Audio();
      element.loop = true;
      element.preload = 'auto';
      element.setAttribute('playsinline', '');
      element.setAttribute('aria-hidden', 'true');
      keepAliveRef.current = element;
    }
    const element = keepAliveRef.current;
    const shouldRun = enabled && usesIframe && isPlaying;
    if (shouldRun) {
      if (!element.src) element.src = getSilentWavUrl();
      element.play().catch(() => { /* blocked until a user gesture; the next tap on play starts it */ });
    } else if (!element.paused) {
      element.pause();
    }
    return undefined;
  }, [enabled, usesIframe, isPlaying]);

  useEffect(() => () => { keepAliveRef.current?.pause(); }, []);

  // 2) Resume if the system paused the iframe because the page was hidden.
  useEffect(() => {
    if (!enabled) return undefined;
    const state = stateRef.current;
    const clearTimer = () => { window.clearTimeout(state.timer); state.timer = null; };
    const tryResume = (attempt = 0) => {
      clearTimer();
      if (!state.playingWhenHidden || userPausedRef.current || isPlayingRef.current) return;
      if (attempt >= RESUME_ATTEMPTS) return;
      try { playerRef.current?.play?.(); } catch { /* player not ready */ }
      state.timer = window.setTimeout(() => tryResume(attempt + 1), RESUME_INTERVAL_MS);
    };
    state.tryResume = tryResume;

    const onVisibility = () => {
      if (document.hidden) {
        state.hiddenAt = Date.now();
        state.playingWhenHidden = isPlayingRef.current && !userPausedRef.current;
      } else {
        // Back in the app: if the song was playing when we left and got stopped by the system, pick it up again.
        if (state.playingWhenHidden && !userPausedRef.current && !isPlayingRef.current) tryResume(0);
        state.playingWhenHidden = false;
        clearTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      clearTimer();
    };
  }, [enabled, userPausedRef, playerRef]);

  // The iframe reports "not playing" shortly after the page is hidden → that is the system pausing it, resume it.
  useEffect(() => {
    const state = stateRef.current;
    if (!enabled || isPlaying) return;
    if (document.hidden && state.playingWhenHidden && !userPausedRef.current && Date.now() - state.hiddenAt < SYSTEM_PAUSE_WINDOW_MS) {
      state.tryResume?.(0);
    }
  }, [enabled, isPlaying, userPausedRef]);
}
