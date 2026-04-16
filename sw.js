const CACHE_NAME = 'synapse-v2-cache-1';

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/main.js',
    './js/config.js',
    './js/state.js',
    './js/dom.js',
    './js/utils.js',
    './js/ui.js',
    './js/auth.js',
    './js/chat-list.js',
    './js/messages.js',
    './js/interactions.js'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(() => {
                // If any asset fails, still install
                return Promise.resolve();
            });
        })
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(clients.claim());
    e.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(key => {
            if (key !== CACHE_NAME) {
                return caches.delete(key);
            }
            return Promise.resolve();
        })
    )));
});

self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Skip Firebase / external API requests
    if (url.includes('firestore.googleapis.com') ||
        url.includes('googleapis.com') ||
        url.includes('firebase') ||
        url.includes('gstatic.com') ||
        url.startsWith('chrome-extension')) {
        return;
    }

    // Network first, cache fallback
    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const responseToCache = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseToCache));
                }
                return res;
            })
            .catch(() => {
                return caches.match(e.request);
            })
    );
});