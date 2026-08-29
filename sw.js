// Finora — service worker
// Purpose: when the app (installed as a home-screen app / PWA webview) has no
// network, show the app's own branded offline.html instead of the browser's
// default "no internet" error page.

const CACHE_NAME = 'finora-shell-v2';
const OFFLINE_URL = 'offline.html';

// App-shell files worth having available before the network ever drops.
// Missing files are skipped individually so one bad path can't break install.
const PRECACHE_URLS = [
  './',
  'index.html',
  'offline.html',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Page navigations: try the network first (so the app always gets fresh
  // content when online). If the network truly fails (no connectivity),
  // go straight to the dedicated offline page rather than silently falling
  // back to a cached copy of the app shell — a stale app shell with no
  // network can't actually do anything useful (auth, sync, etc. all need
  // a connection), so showing it instead of the offline screen is
  // misleading. HTTP error responses (4xx/5xx) still resolve normally here
  // and are NOT treated as offline, since fetch() only rejects on real
  // network failures.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Everything else (styles, scripts, images, fonts, API calls): serve from
  // cache when available, otherwise go to the network and cache the result
  // for next time. If both fail, just let the request fail normally — only
  // full page navigations get the offline fallback screen.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
