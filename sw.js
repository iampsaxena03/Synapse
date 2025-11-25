const CACHE_NAME = 'prasoon-den-v6-network-first';
const STATIC_ASSETS = [
    './', 
    './index.html', 
    './style.css', 
    './script.js', 
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())
    )));
});

// Network First Strategy: prevents "Old Version" glitches
self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Ignore Firebase and Extension requests
    if (url.includes('firestore.googleapis.com') || 
        url.includes('googleapis.com') || 
        url.includes('firebase') ||
        url.startsWith('chrome-extension')) {
        return; 
    }

    e.respondWith(
        fetch(e.request)
            .then(res => {
                // Clone and cache the new version if valid
                if (!res || res.status !== 200 || res.type !== 'basic') return res;
                const responseToCache = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseToCache));
                return res;
            })
            .catch(() => caches.match(e.request)) // Fallback to cache if offline
    );
});