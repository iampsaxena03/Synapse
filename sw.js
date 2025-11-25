// BUMPED TO V3 - Fixed Asset Paths
const CACHE_NAME = 'synapse-app-v3-core';

// CRITICAL: All these files must exist for the SW to install correctly.
const STATIC_ASSETS = [
    './', 
    './index.html', 
    './admin.html',
    './style.css', 
    './admin.css',
    './js/main.js',   // Changed from ./script.js to ./js/main.js
    './js/admin.js',  // Added admin logic
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(STATIC_ASSETS))
            .catch(err => console.error('SW Install Error: Could not cache assets.', err))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(clients.claim());
    e.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(key => {
            if (key !== CACHE_NAME) {
                console.log('Clearing old cache:', key);
                return caches.delete(key);
            }
            return Promise.resolve();
        })
    )));
});

self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Ignore Firebase/Google API requests (Network Only)
    if (url.includes('firestore.googleapis.com') || 
        url.includes('googleapis.com') || 
        url.includes('firebase') ||
        url.startsWith('chrome-extension')) {
        return; 
    }

    // Network First Strategy with explicit cache-busting
    e.respondWith(
        fetch(e.request, { cache: 'reload' }) // Forces network to give fresh version
            .then(res => {
                // Check if valid response
                if (!res || res.status !== 200 || res.type !== 'basic') return res;
                
                // Clone and update cache
                const responseToCache = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseToCache));
                
                return res;
            })
            .catch(() => {
                // If network fails, fall back to cache
                return caches.match(e.request).then(response => {
                    // If file not found in cache (e.g. new image), return nothing or offline page
                    return response || null;
                });
            })
    );
});