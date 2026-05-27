// Service Worker - No Cache Version
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network only - ไม่ cache เลย
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request.url + (e.request.url.includes('?') ? '&' : '?') + '_t=' + Date.now()));
});
