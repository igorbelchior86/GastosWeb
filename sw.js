// Cache principal. Mantemos um único bucket e confiamos em URLs versionadas
// e estratégias de atualização para evitar precisar "bump" manual a cada release.
const CACHE = 'app-cache-1.4.8-a20';
const RUNTIME = { pages: 'pages-v1', assets: 'assets-v1', cdn: 'cdn-v1' };
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './icons/icon-192x192.png',
  './icons/icon-180x180.png',
  './site.webmanifest'
];

// Helper: convert base64url VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Instalação e pré-cache
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Força busca de rede para não recachear versões antigas controladas pelo SW anterior
    const requests = ASSETS.map(u => new Request(u, { cache: 'reload' }));
    await cache.addAll(requests);
  })());
  // Ativa imediatamente o novo SW
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
  const { request } = event;
  if (request.method !== 'GET') return; // não cachear POST/PUT

  // Navegações (HTML): network-first com fallback para cache
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const c = await caches.open(CACHE);
        c.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(request);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Demais recursos: stale-while-revalidate e respeita query string (sem ignoreSearch)
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      // Atualiza em background sem bloquear resposta
      fetch(request).then(resp => {
        if (!resp || resp.status !== 200) return;
        caches.open(CACHE).then(c => c.put(request, resp.clone()));
      }).catch(() => {});
      return cached;
    }
    try {
      const resp = await fetch(request);
      const c = await caches.open(CACHE);
      c.put(request, resp.clone());
      return resp;
    } catch (_) {
      return Response.error();
    }
  })());
});

// Permite que a página force a ativação imediata de um SW recém-instalado
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Improved Background Sync handler: if no client is open, re‑register the sync to try again later
self.addEventListener('sync', event => {
  if (event.tag === 'sync-tx') {
    event.waitUntil((async () => {
      const clientsList = await self.clients.matchAll();
      if (clientsList.length) {
        clientsList.forEach(c => c.postMessage({ type: 'sync-tx' }));
        return;
      }
      // No open clients: ask the browser to try again later
      if (self.registration && self.registration.sync) {
        try { await self.registration.sync.register('sync-tx'); } catch (_) {}
      }
    })());
  }
});

// (Web Push handlers removidos)

// Auto re-subscribe if the push subscription changes (rotation/cleanup)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const VAPID_PUBLIC_KEY = 'BH-IaONzYmuE0aFxfxdf4UA5v9kcPOhkcegbPDg7L3mHUpfiWm-5TQXNh57fFNsMASV9kNelRBZrtLLt4xe8fwQ';
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      // Inform any open clients so they can persist the new subscription
      const clientsList = await self.clients.matchAll();
      clientsList.forEach(c => c.postMessage({ type: 'push-resub', sub: sub.toJSON() }));
      // Also schedule a background sync attempt
      if (self.registration && self.registration.sync) {
        try { await self.registration.sync.register('sync-tx'); } catch (_) {}
      }
    } catch (err) {
      // swallow – will retry next time a page opens
    }
  })());
});
