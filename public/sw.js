const CACHE_NAME = 'worshipflow-v2';
const API_CACHE_NAME = 'worshipflow-api-v1';
const OFFLINE_URL = '/offline.html';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png',
];

// API routes to cache with stale-while-revalidate (serve cache instantly, refresh in bg)
const API_SWR_ROUTES = ['/api/songs', '/api/tags', '/api/members', '/api/schedules', '/api/notes'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME && k !== API_CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Navigation — network-first, fallback to offline page
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // API routes — stale-while-revalidate: respond instantly from cache, refresh in background
    const isApiSwr = API_SWR_ROUTES.some(route => url.pathname.startsWith(route));
    if (isApiSwr && event.request.method === 'GET') {
        event.respondWith(
            caches.open(API_CACHE_NAME).then(async cache => {
                const cached = await cache.match(event.request);
                // Kick off background refresh regardless
                const networkFetch = fetch(event.request).then(networkRes => {
                    if (networkRes.ok) {
                        cache.put(event.request, networkRes.clone());
                    }
                    return networkRes;
                }).catch(() => null);
                // Serve cache immediately if available, otherwise await network
                return cached ?? networkFetch;
            })
        );
        return;
    }

    // Static assets — cache-first
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
