/* Menyimpan file aplikasi agar bisa dibuka tanpa internet.
   File lama langsung ditampilkan, lalu diperbarui di latar belakang untuk pembukaan berikutnya. */
const CACHE = 'guru-mapel-v2';
const FILES = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/schema.js', 'js/store.js', 'js/sync.js', 'js/importer.js', 'js/sample.js', 'js/teaching.js', 'js/app.js',
  'vendor/react.production.min.js', 'vendor/react-dom.production.min.js', 'vendor/htm.umd.js', 'vendor/xlsx.full.min.js',
  'vendor/fonts/plus-jakarta-sans-latin-wght-normal.woff2', 'vendor/fonts/ibm-plex-mono-latin-500-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true })
      || (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const refresh = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
    if (cached) { event.waitUntil(refresh.catch(() => null)); return cached; }
    return refresh;
  })());
});
