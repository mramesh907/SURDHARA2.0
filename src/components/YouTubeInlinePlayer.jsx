import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const API_LOAD_TIMEOUT_MS = 12000;
const STALL_AFTER_MS = 12000;
// YouTube error codes: 2 invalid id · 5 HTML5 player error (usually transient) · 100 removed/private ·
// 101/150 embedding disabled by the owner. Only 2/100/101/150 mean "this video will never play here".
const PERMANENT_ERRORS = new Set([2, 100, 101, 150]);

let youtubeApiPromise = null;
function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previousReady;
      document.querySelector('script[data-surdhara-yt-api]')?.remove();
      youtubeApiPromise = null; // IMPORTANT: a failed load must not be cached, or going back online never recovers.
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail('The YouTube Player API timed out.'), API_LOAD_TIMEOUT_MS);
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.surdharaYtApi = 'true';
    script.onerror = () => fail('The YouTube Player API could not be loaded.');
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

const YouTubeInlinePlayer = forwardRef(function YouTubeInlinePlayer({
  track, autoplayKey, volume = 68, muted = false,
  onPlayingChange, onEnded, onProgress, onPlaybackError, onStall, onPlaybackStarted, onEngineStatus,
}, forwardedRef) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const latestRef = useRef({});
  const lastVideoIdRef = useRef(null);
  const lastAutoplayKeyRef = useRef(0);
  const progressTimerRef = useRef(null);
  const stallTimerRef = useRef(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [initAttempt, setInitAttempt] = useState(0);

  latestRef.current = { track, autoplayKey, volume, muted, onPlayingChange, onEnded, onProgress, onPlaybackError, onStall, onPlaybackStarted, onEngineStatus };

  useImperativeHandle(forwardedRef, () => ({
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    toggle: () => {
      const player = playerRef.current;
      if (!player || !window.YT) return;
      player.getPlayerState?.() === window.YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
    },
    seekTo: (seconds) => playerRef.current?.seekTo?.(Math.max(0, Number(seconds) || 0), true),
    getCurrentTime: () => Number(playerRef.current?.getCurrentTime?.()) || 0,
    setVolume: (value) => playerRef.current?.setVolume?.(Math.max(0, Math.min(100, Number(value) || 0))),
    mute: () => playerRef.current?.mute?.(),
    unMute: () => playerRef.current?.unMute?.(),
    /** Re-attempt loading the engine (called when the connection returns). */
    retry: () => { if (!playerRef.current) setInitAttempt((value) => value + 1); },
    /** Re-load the current video from a known position (recover after a dropped connection). */
    reload: (seconds = 0, autoplay = true) => {
      const player = playerRef.current;
      const id = latestRef.current.track?.youtubeId;
      if (!player || !id) return;
      if (autoplay) player.loadVideoById({ videoId: id, startSeconds: Math.max(0, seconds) });
      else player.cueVideoById({ videoId: id, startSeconds: Math.max(0, seconds) });
    },
  }), []);

  // If the engine could not load while offline, try again the moment the browser reports a connection.
  useEffect(() => {
    const retry = () => { if (!playerRef.current) setInitAttempt((value) => value + 1); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPlayerReady(false);
    latestRef.current.onEngineStatus?.('loading');
    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      const initialTrack = latestRef.current.track;
      // YT.Player replaces the element it is given, so always hand it a fresh child node.
      hostRef.current.textContent = '';
      const mount = document.createElement('div');
      hostRef.current.appendChild(mount);
      playerRef.current = new YT.Player(mount, {
        width: '200',
        height: '200',
        videoId: initialTrack?.youtubeId || undefined,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, enablejsapi: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            lastVideoIdRef.current = initialTrack?.youtubeId;
            setPlayerReady(true);
            latestRef.current.onEngineStatus?.('ready');
            const latest = latestRef.current;
            event.target.setVolume(Math.max(0, Math.min(100, latest.volume)));
            if (latest.muted) event.target.mute(); else event.target.unMute();
            if (latest.track?.youtubeId && (latest.track.youtubeId !== initialTrack?.youtubeId || latest.autoplayKey > 0)) {
              lastVideoIdRef.current = latest.track.youtubeId;
              lastAutoplayKeyRef.current = latest.autoplayKey;
              // Restoring a remembered selection after refresh must not start playback; only an explicit play request does.
              if (latest.autoplayKey > 0) event.target.loadVideoById(latest.track.youtubeId);
              else event.target.cueVideoById(latest.track.youtubeId);
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const latest = latestRef.current;
            const state = event.data;
            window.clearTimeout(stallTimerRef.current);
            if (state === YT.PlayerState.BUFFERING) {
              // A buffering spinner that never ends is how a dropped connection looks to the user: surface it.
              stallTimerRef.current = window.setTimeout(() => latest.onStall?.(), STALL_AFTER_MS);
            }
            const playing = state === YT.PlayerState.PLAYING;
            if (playing) latest.onPlaybackStarted?.();
            latest.onPlayingChange?.(playing);
            if (state === YT.PlayerState.ENDED) latest.onEnded?.();
          },
          onError: (event) => {
            if (cancelled) return;
            window.clearTimeout(stallTimerRef.current);
            const latest = latestRef.current;
            latest.onPlayingChange?.(false);
            const code = Number(event.data);
            const permanent = PERMANENT_ERRORS.has(code);
            const reason = code === 101 || code === 150
              ? 'The owner of this video does not allow playback outside YouTube.'
              : code === 100
                ? 'This video was removed or made private.'
                : 'YouTube could not play this track right now.';
            latest.onPlaybackError?.(reason, { code, permanent });
          },
        },
      });
    }).catch(() => {
      if (cancelled) return;
      latestRef.current.onEngineStatus?.('failed');
      latestRef.current.onPlaybackError?.(
        navigator.onLine === false
          ? 'You are offline. YouTube songs need a connection; saved songs still play.'
          : 'The YouTube playback service could not load. Retrying when the connection is stable.',
        { code: 'api-load', permanent: false, engine: true },
      );
    });

    return () => {
      cancelled = true;
      window.clearInterval(progressTimerRef.current);
      window.clearTimeout(stallTimerRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* Player may not have finished mounting. */ }
        playerRef.current = null;
      }
    };
  }, [initAttempt]);

  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player || !track?.youtubeId) return;
    if (lastVideoIdRef.current !== track.youtubeId) {
      const explicitPlayRequested = autoplayKey > lastAutoplayKeyRef.current;
      lastVideoIdRef.current = track.youtubeId;
      lastAutoplayKeyRef.current = autoplayKey;
      if (explicitPlayRequested) player.loadVideoById(track.youtubeId);
      else player.cueVideoById(track.youtubeId);
    } else if (autoplayKey !== lastAutoplayKeyRef.current) {
      lastAutoplayKeyRef.current = autoplayKey;
      if (autoplayKey > 0) player.playVideo();
    }
  }, [track?.youtubeId, autoplayKey, playerReady]);

  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player) return;
    player.setVolume?.(Math.max(0, Math.min(100, Number(volume) || 0)));
    if (muted) player.mute?.(); else player.unMute?.();
  }, [volume, muted, playerReady]);

  useEffect(() => {
    window.clearInterval(progressTimerRef.current);
    if (!playerReady) return undefined;
    progressTimerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const currentTime = player.getCurrentTime?.() || 0;
        const playerDuration = player.getDuration?.() || 0;
        const metadataDuration = latestRef.current.track?.durationSeconds || 0;
        latestRef.current.onProgress?.(currentTime, playerDuration || metadataDuration);
      } catch { /* The iframe may be transitioning between tracks. */ }
    }, 500);
    return () => window.clearInterval(progressTimerRef.current);
  }, [playerReady]);

  // The official YouTube iframe stays mounted off-canvas; the visible UI is the SURDHARA player.
  return <div className="youtube-audio-host" aria-hidden="true"><div className="youtube-audio-frame" ref={hostRef} /></div>;
});

export default YouTubeInlinePlayer;
