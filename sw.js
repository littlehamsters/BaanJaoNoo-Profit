const CACHE_NAME = 'baan-jao-noo-v3';

// Install: cache เฉพาะไฟล์หลัก
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: ลบ cache เก่าทั้งหมด
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Network first เสมอ ไม่ cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
