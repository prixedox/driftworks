// Minimal service worker — just enough to make Driftworks installable as a PWA.
// Network-first with a cache fallback so the app shell still opens offline once
// it has been loaded. A proper precache pipeline (e.g. vite-plugin-pwa) is a
// later step.
const CACHE = 'driftworks-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Promise.reject(new Error('offline')))),
  );
});
