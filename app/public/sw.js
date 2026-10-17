// ZEN DRAMA service worker — offline app shell and fast repeat loads.
//
// Strategy:
//   - navigation (HTML)  -> network-first, fall back to the cached shell when offline
//   - hashed/static files -> stale-while-revalidate (instant from cache, refreshed after)
//   - everything else (API server, video, poster CDNs, any cross-origin) -> untouched
//
// Bump CACHE when this file changes so old caches are dropped on activate.

// Pull in the ProPush push worker (the root file ProPush asks to host) so a single /sw.js serves
// both the PWA cache and push subscriptions. The ProPush Smart Tag points here via &sw=/sw.js.
// If the remote ProPush script is unreachable, install still succeeds and caching keeps working.
try {
  importScripts('/sw-check-permissions-49eba.js');
} catch {
  // Push unavailable; offline caching below is unaffected.
}

const CACHE = 'zen-drama-v1';

const SHELL = [
  '/',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/maskable512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

const STATIC_RE = /\.(?:js|css|png|jpe?g|webp|avif|svg|woff2?|ttf|otf|ico)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Let the browser handle non-GET and ranged media requests normally.
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  // Only same-origin assets are cacheable; the API server, video and poster hosts are dynamic.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/') || STATIC_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
