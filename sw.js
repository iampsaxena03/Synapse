const CACHE_NAME = 'synapse-fail-safe-v4';

// EMPTY PRE-CACHE
// We leave this empty to guarantee installation. 
// Even if files are missing, this SW will still install and take control.
const STATIC_ASSETS = []; 

self.addEventListener('install', e => {
    // Force immediate installation
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

self.addEventListener('activate', e => {
    // Force immediate control over the page (Kills the zombie SW)
    e.waitUntil(clients.claim());
    
    // Clean up all old caches
    e.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(key => {
            if (key !== CACHE_NAME) {
                console.log('Nuking old cache:', key);
                return caches.delete(key);
            }
            return Promise.resolve();
        })
    )));
});

self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Ignore Firebase/Google API requests
    if (url.includes('firestore.googleapis.com') || 
        url.includes('googleapis.com') || 
        url.includes('firebase') ||
        url.startsWith('chrome-extension')) {
        return; 
    }

    // NETWORK FIRST, CACHE FALLBACK
    // This ensures you always get the latest file if you are online.
    e.respondWith(
        fetch(e.request)
            .then(res => {
                // If network works, cache the fresh copy and return it
                if (res && res.status === 200 && res.type === 'basic') {
                    const responseToCache = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseToCache));
                }
                return res;
            })
            .catch(() => {
                // If network fails (Offline), try the cache
                return caches.match(e.request);
            })
    );
});