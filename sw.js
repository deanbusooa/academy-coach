// Offline support: cache the app shell, serve cache-first, refresh in background.
// Bump CACHE_VERSION whenever you add/rename files in ASSETS.

const CACHE_VERSION = 'v1';
const CACHE = `academy-coach-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/actions.js',
  './js/backup.js',
  './js/demo.js',
  './js/utils/dom.js',
  './js/utils/date.js',
  './js/utils/format.js',
  './js/models/players.js',
  './js/models/drills.js',
  './js/models/sessions.js',
  './js/models/bookings.js',
  './js/models/ratings.js',
  './js/ui/icons.js',
  './js/ui/modal.js',
  './js/ui/toast.js',
  './js/ui/form.js',
  './js/ui/chart.js',
  './js/views/shared.js',
  './js/views/players.js',
  './js/views/player-detail.js',
  './js/views/sessions.js',
  './js/views/session-detail.js',
  './js/views/bookings.js',
  './js/views/progress.js',
  './js/views/drills.js',
  './js/views/settings.js',
];

// addAll is all-or-nothing: if any file fails, install fails and the browser
// retries on the next visit, so we never activate with a half-empty cache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('academy-coach-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate for same-origin GETs: instant from cache, updated for next load.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (new URL(request.url).pathname.includes('/tests/')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => { if (res.ok) cache.put(request, res.clone()).catch(() => {}); return res; })
        .catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (request.mode === 'navigate') {
        const shell = (await cache.match('./index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      return Response.error();
    }),
  );
});
