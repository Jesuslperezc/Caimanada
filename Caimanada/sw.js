const CACHE_NAME = 'caimanada-cache-v18';
const urlsToCache = [
  './',
  './index.html',
  './css/main.css',
  './css/components.css',
  './css/views.css',
  './js/app.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
];

// Instalación: Guardamos todo en caché
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: Limpiar cachés viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Limpiando caché vieja', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch: Interceptar peticiones
self.addEventListener('fetch', e => {
  const requestUrl = e.request.url;

  // 1. ESTRATEGIA "NETWORK FIRST" PARA HTML, JS Y CSS (Tus archivos locales)
  // Siempre busca la versión más nueva en Netlify. Si falla, usa la caché.
  if (e.request.mode === 'navigate' || requestUrl.includes('/js/') || requestUrl.includes('/css/')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Si la red respondió, guardamos esta versión nueva en caché
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseClone);
          });
          return response; // Le mostramos al usuario la versión nueva de inmediato
        })
        .catch(() => {
          // Si no hay internet (offline), entregamos lo que tengamos en caché
          return caches.match(e.request).then(cachedResponse => {
            return cachedResponse || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 2. ESTRATEGIA "CACHE FIRST" PARA LIBRERÍAS EXTERNAS (Chart.js, jsQR)
  // Estas no cambian nunca, así que es mejor servirlas desde caché para ir más rápido
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});