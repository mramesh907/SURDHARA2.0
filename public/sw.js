/* SURDHARA service worker — app shell + image caching so the app opens with no network.
 * Audio is NOT handled here: saved songs live in the Cache API ("surdhara-audio-v1") and are played
 * straight from there by the app (see src/lib/offlineAudio.js).
 * Deployed at the site root. Bump VERSION to force clients to refresh their caches. */
const VERSION = 'v1';
const SHELL_CACHE = `surdhara-shell-${VERSION}`;
const ASSET_CACHE = `surdhara-assets-${VERSION}`;
const IMAGE_CACHE = `surdhara-images-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE]);
const SHELL_URLS = ['/manifest.webmanifest', '/surdhara-logo.png', '/local-audio-cover.svg', '/icon-192.png', '/apple-touch-icon.png'];
const IMAGE_LIMIT = 400;
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const assets = await caches.open(ASSET_CACHE);
    // The page that registered us already downloaded its JS/CSS *before* we existed, so those files are
    // not in any cache yet. Read the shell HTML and cache exactly the hashed bundles it references.
    try {
      const response = await fetch('/index.html', { cache: 'reload' });
      if (response.ok) {
        const html = await response.clone().text();
        await shell.put('/index.html', response.clone());
        await shell.put('/', response);
        const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
        await Promise.all([...new Set(refs)].map((url) => assets.add(url).catch(() => {})));
      }
    } catch { /* installing offline is impossible; the next online visit retries */ }
    await Promise.all(SHELL_URLS.map((url) => shell.add(url).catch(() => {})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('surdhara-') && !name.startsWith('surdhara-audio-') && !KEEP.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

async function navigationStrategy(request) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) { shell.put('/index.html', response.clone()); return response; }
    throw new Error(`navigation ${response.status}`);
  } catch {
    // Offline, slow, or server error: serve the last good shell. Routing is hash-based, so one HTML file covers every page.
    return (await shell.match('/index.html')) || (await shell.match('/')) ||
      new Response('<h1>SURDHARA is offline</h1><p>Open the app once while online to enable offline mode.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let index = 0; index < keys.length - limit; index += 1) await cache.delete(keys[index]);
}

async function imageStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(request.url);
  const refresh = (async () => {
    try {
      // Only CORS-readable images are cached: opaque responses would each be charged ~7 MB of storage quota.
      const response = await fetch(new Request(request.url, { mode: 'cors', credentials: 'omit' }));
      if (response.ok) { await cache.put(request.url, response.clone()); trimCache(IMAGE_CACHE, IMAGE_LIMIT); }
      return response;
    } catch {
      try { return await fetch(request); } catch { return null; }
    }
  })();
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') { event.respondWith(navigationStrategy(request)); return; }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(request, ASSET_CACHE)); return; }
    if (url.pathname === '/manifest.webmanifest' || /\.(?:png|svg|jpe?g|webp|ico)$/i.test(url.pathname)) { event.respondWith(staleWhileRevalidate(request, SHELL_CACHE)); return; }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { event.respondWith(staleWhileRevalidate(request, ASSET_CACHE)); return; }
  if (request.destination === 'image') { event.respondWith(imageStrategy(request)); }
  // Everything else (Supabase API, YouTube, metadata APIs) goes straight to the network.
});
