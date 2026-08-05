// Service Worker: red primero (para tomar siempre la última versión publicada)
// con caché como respaldo para funcionar sin internet.
const CACHE = 'cotizador-v8';
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
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' salta el caché HTTP del navegador: trae la copia real del servidor
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
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
    fetch(new Request(e.request, { cache: 'no-cache' }))
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then((enCache) => enCache || caches.match('index.html')),
      ),
  );
});
