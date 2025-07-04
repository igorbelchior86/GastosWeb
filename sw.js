const CACHE = 'v3';   // bump para nova versão
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './icons/icon-192x192.png',
  './icons/icon-180x180.png',
  './site.webmanifest'
];

// Instalação e pré-cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Ativa novo SW imediatamente
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Intercepta requisições
self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    if (event.request.method !== 'GET') {
      // não cachear POST/PUT
      return fetch(event.request);
    }
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await Promise.race([
        fetch(event.request),
        new Promise((_, rej) => setTimeout(() => rej('timeout'), 10000))
      ]);
      const cache = await caches.open(CACHE);
      cache.put(event.request, response.clone());
      return response;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});

// Notify clients to flush queue when back online
self.addEventListener('sync', event => {
  if (event.tag === 'sync-tx') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'sync-tx' })
        );
      })
    );
  }
});