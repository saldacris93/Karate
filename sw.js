// Service Worker: deja la app disponible sin internet (cache-first con actualización en segundo plano).
const CACHE = 'cotizador-v2';
const ARCHIVOS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'vendor/jspdf.umd.min.js',
  'vendor/jspdf.plugin.autotable.min.js',
  'icons/icono-192.png',
  'icons/icono-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return; // API de GitHub: siempre a la red
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((enCache) => {
      const red = fetch(e.request)
        .then((resp) => {
          if (resp.ok && new URL(e.request.url).origin === location.origin) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return resp;
        })
        .catch(() => enCache);
      return enCache || red;
    }),
  );
});
