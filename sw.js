// Racing Dynasty — Service Worker
// Strategia: i file essenziali (shell + dati di gioco) vengono precaricati all'installazione.
// Tutto il resto (immagini, audio) viene messo in cache "al volo" la prima volta che serve
// davvero (cache-first con fallback rete) — non serve elencare a mano centinaia di file, la
// cache si riempie da sola mentre si gioca, e da quel momento in poi funziona anche offline.
const CACHE_NAME = 'racing-dynasty-v0.9.7.8.11';
const PRECACHE_URLS = [
  './',
  'index.html',
  'game.js',
  'manifest.json',
  'data/data.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // salviamo in cache solo risposte valide dello stesso dominio (asset del gioco)
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
