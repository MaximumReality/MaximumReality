const CACHE_NAME = 'max-reality-v1';
const ASSETS_TO_CACHE = [
  '/maximum-reality.html',
  '/manifest.json',
  'https://maximumreality.xyz/max-real-favicon.jpeg',
  'https://maximumreality.xyz/echoes_in_the_silicon_wreckage.mp3'
];

// Install Event: Save the files to the cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Maximum Reality: Files Cached');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch Event: Serve files from cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return the cached file, or try to fetch it from the network
      return response || fetch(event.request);
    })
  );
});
