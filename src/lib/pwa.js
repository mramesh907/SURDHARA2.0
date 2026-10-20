// Service worker registration + update flow. Production builds only (a SW in `vite dev` causes stale-cache confusion).
let updateRequested = false;

export function registerServiceWorker({ onUpdateReady, onOfflineReady } = {}) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First-install claim() also fires this; only reload when the user asked for an update.
    if (updateRequested) window.location.reload();
  });
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      if (registration.waiting && navigator.serviceWorker.controller) onUpdateReady?.(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return;
          if (navigator.serviceWorker.controller) onUpdateReady?.(registration);
          else onOfflineReady?.();
        });
      });
      window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    } catch { /* the app works without a service worker */ }
  };
  // React usually mounts AFTER the window 'load' event, so a plain load listener would never fire.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export function applyServiceWorkerUpdate(registration) {
  updateRequested = true;
  if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}
