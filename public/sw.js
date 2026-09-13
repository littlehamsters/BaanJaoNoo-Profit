// Service Worker - Pass-through (no cache, no interception)
// Cache-busting is handled by <meta http-equiv="Cache-Control"> in index.html.
// We must NOT intercept fetches — the previous implementation rewrote every
// request as a bare GET with a cache-busting query param, which stripped
// the POST method, body, and auth headers from Firebase WebChannel calls
// and caused them to fail with HTTP 400.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
