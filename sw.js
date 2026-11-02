// Garde la page d'accueil disponible hors ligne.
// Changer CACHE à chaque mise à jour des fichiers listés ci-dessous.
// Ce service worker couvre tout le site (/) : il ne s'occupe QUE des fichiers de l'accueil
// et des icônes demandées par l'accueil (?hub=1). Chaque appli a son propre sw.js.
var CACHE = 'applis-marc-v3';
var ICONS = 'applis-marc-icones';
var FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/fredoka-latin.woff2',
  './fonts/nunito-latin.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
var PATHS = FILES.map(function (f) { return new URL(f, self.registration.scope).pathname; });

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== ICONS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // Icônes des applis affichées sur l'accueil : réseau d'abord, sinon la copie gardée.
  if (url.searchParams.has('hub')) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(ICONS).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return caches.match(req, { cacheName: ICONS }).then(function (hit) { return hit || Response.error(); }); })
    );
    return;
  }

  // Tout le reste (les applis) ne nous regarde pas.
  if (PATHS.indexOf(url.pathname) < 0) return;

  // La page passe d'abord par le réseau pour recevoir les mises à jour, sinon le cache.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', copy); }); }
        return res;
      }).catch(function () { return caches.match('./index.html', { cacheName: CACHE }); })
    );
    return;
  }

  e.respondWith(caches.match(req, { cacheName: CACHE }).then(function (hit) { return hit || fetch(req); }));
});
