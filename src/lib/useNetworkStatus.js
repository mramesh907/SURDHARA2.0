import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError, probeConnectivity } from './network.js';

/**
 * Real connectivity state. Listens to the browser online/offline events, but verifies with an
 * actual request (captive portals and "lie-fi" report online while nothing loads). While offline
 * it re-probes every few seconds so the UI recovers by itself.
 */
export function useNetworkStatus({ probeUrl = '/manifest.webmanifest', probeIntervalMs = 6000 } = {}) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [changedAt, setChangedAt] = useState(() => Date.now());
  const onlineRef = useRef(online);

  const apply = useCallback((next) => {
    if (onlineRef.current === next) return;
    onlineRef.current = next;
    setOnline(next);
    setChangedAt(Date.now());
  }, []);

  const probe = useCallback(async () => {
    const ok = await probeConnectivity(probeUrl);
    apply(ok);
    return ok;
  }, [apply, probeUrl]);

  useEffect(() => {
    const handleOnline = () => { probe(); };
    const handleOffline = () => apply(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine === false) apply(false);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [apply, probe]);

  useEffect(() => {
    if (online) return undefined;
    const timer = window.setInterval(() => { probe(); }, probeIntervalMs);
    return () => window.clearInterval(timer);
  }, [online, probe, probeIntervalMs]);

  /** Call when any request fails while the browser still claims to be online. */
  const reportFailure = useCallback((error) => {
    if (onlineRef.current && isNetworkError(error)) probe();
  }, [probe]);

  return { online, changedAt, probe, reportFailure };
}
