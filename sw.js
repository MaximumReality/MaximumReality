const CACHE_NAME = 'max-reality-v2.4';
const ASSETS_TO_CACHE = [
  '/maximum-reality.html',
  '/manifest.json',
  'https://maximumreality.xyz/max-real-favicon.jpeg',
  'https://maximumreality.xyz/avatar.html',
  'https://maximumreality.xyz/echoes_in_the_silicon_wreckage.mp3'
];

// Install: Cache the assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Maximum Reality: Files Cached');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch: Serve cached assets if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
