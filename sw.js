// Racing Dynasty — Service Worker
// FIX V0.9.7.8.17: la versione precedente era cache-first per TUTTO, incluso game.js — questo
// significava che dopo la prima visita, il codice restava bloccato per sempre alla versione vista
// quella prima volta, anche con decine di aggiornamenti pubblicati dopo (bug segnalato: suoni
// nuovi che continuavano a non sentirsi perche' il browser usava ancora il game.js vecchio).
//
// Strategia corretta, divisa in due:
// - CODICE (index.html, game.js, manifest.json) -> network-first: prova sempre la rete per primo,
//   cosi' ogni aggiornamento pubblicato arriva SUBITO alla visita successiva. Cache solo come
//   fallback per l'uso offline.
// - ASSET PESANTI (immagini, audio, dati di gioco) -> cache-first: cambiano raramente, meglio
//   risparmiare banda e tempo di caricamento; si aggiornano da soli quando cambia il loro nome file.
// FIX V0.9.7.8.21: il manifest.json era network-first, ma le IMMAGINI a cui punta (logo.png,
// favicon) no — restavano cache-first come tutti gli asset pesanti. Risultato: ogni modifica
// all'icona veniva ignorata dal browser, che continuava a servire il file vecchio dalla propria
// cache — disinstallare/reinstallare l'app dalla schermata Home NON svuota questa cache, sono
// due meccanismi completamente separati. Ora le icone sono network-first come il codice.
const CACHE_NAME = 'racing-dynasty-v0.9.9.235';
const CODE_FILES = ['index.html', 'game.js', 'manifest.json', './', 'assets/app-icon.png', 'assets/fuoriscala/fuoriscala_primary_white.svg'];
const PRECACHE_URLS = [...CODE_FILES, 'data/data.json'];

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
      // V0.9.9.201: filtro per prefisso, non solo per nome esatto diverso — cancelliamo SOLO le
      // vecchie cache di QUESTO gioco (stesso prefisso "racing-dynasty-"), mai cache di altri
      // giochi che in futuro potrebbero condividere la stessa origine (es. un dominio FUORISCALA
      // con più giochi sotto percorsi diversi).
      Promise.all(names.filter((n) => n.startsWith('racing-dynasty-') && n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

function isCodeFile(url) {
  const path = new URL(url).pathname;
  return CODE_FILES.some((f) => path.endsWith(f) || path.endsWith('/' + f)) || path.endsWith('/');
}

// V0.9.9.231: BUG CRITICO CORRETTO — segnalato da Gio: "se metto modalità aereo non va un
// cazzo". CAUSA: il tentativo di rete per i file di codice (fetch(event.request)) non aveva
// NESSUN limite di tempo — in modalità aereo vera, il dispositivo non rifiuta la richiesta
// all'istante come in un test simulato, il tentativo di connessione resta "appeso" per un tempo
// lunghissimo (timeout di sistema/DNS) prima di arrendersi, quindi il fallback sulla cache non
// scattava mai in un tempo ragionevole — la pagina restava a caricare all'infinito, sembrando
// completamente rotta. CORRETTO: la richiesta di rete ha ora un limite di 3 secondi, passato il
// quale si ricade sulla cache immediatamente.
function fetchConLimiteDiTempo(request, msLimite){
  return Promise.race([
    fetch(request),
    new Promise((_, reject)=> setTimeout(()=> reject(new Error('timeout rete')), msLimite))
  ]);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isCode = isCodeFile(event.request.url);

  if (isCode) {
    // network-first: prova la rete (con limite di tempo), aggiorna la cache, usa la cache se
    // offline O se la rete impiega troppo
    event.respondWith(
      fetchConLimiteDiTempo(event.request, 3000).then((response) => {
        if (response && response.status === 200) {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // asset pesanti: cache-first, come prima — stesso limite di tempo se non ancora in cache
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetchConLimiteDiTempo(event.request, 3000).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
