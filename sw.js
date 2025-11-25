// BUMPED TO V2 TO FORCE UPDATE
const CACHE_NAME = 'synapse-app-v2-features';

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
    e.waitUntil(clients.claim());
    e.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(key => {
            if (key !== CACHE_NAME) {
                console.log('Deleting old cache:', key);
                return caches.delete(key);
            }
            return Promise.resolve();
        })
    )));
});

self.addEventListener('fetch', e => {
    const url = e.request.url;

    if (url.includes('firestore.googleapis.com') || 
        url.includes('googleapis.com') || 
        url.includes('firebase') ||
        url.startsWith('chrome-extension')) {
        return; 
    }

    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (!res || res.status !== 200 || res.type !== 'basic') return res;
                const responseToCache = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseToCache));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});