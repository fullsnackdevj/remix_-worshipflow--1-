// WorshipFlow Service Worker — v9 (2026-03-20)
// Strategy: network-first for EVERYTHING so returning users always get the latest
// app code and data. Only fall back to cache when truly offline.

const CACHE_VERSION = 'wf-v9';
const OFFLINE_URL   = '/offline.html';

// Minimal offline shell — only these need pre-caching
const PRECACHE_URLS = ['/offline.html', '/icon-192x192.png'];

// ── Message handler: allow clients to trigger skipWaiting ────────────────────
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Install: cache offline shell only ────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE_URLS))
    );
    // Activate immediately — don't wait for old tabs to close
    self.skipWaiting();
});

// ── Activate: delete ALL old cache versions immediately ──────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
        ).then(() => self.clients.claim()) // take control of all open tabs right now
    );
});

// ── Fetch: NETWORK-FIRST for everything ──────────────────────────────────────
// • Navigation (HTML/JS/CSS): always network — ensures latest app code
// • API calls: always network — ensures latest data
// • Static assets (images/icons): network-first, cache as fallback
// • Only serve from cache when the network fails (offline mode)
self.addEventListener('fetch', event => {
    // Skip non-GET and browser-extension requests
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    // For Firebase, FCM, and external CDN requests — let browser handle normally
    const isExternal = !url.hostname.includes('worshipflow') &&
                       !url.hostname.includes('netlify') &&
                       url.hostname !== self.location.hostname;
    if (isExternal) return;

    event.respondWith(
        fetch(event.request)
            .then(networkRes => {
                // Cache successful responses for offline fallback
                if (networkRes.ok) {
                    const clone = networkRes.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
                }
                return networkRes;
            })
            .catch(async () => {
                // Network failed — serve from cache
                const cached = await caches.match(event.request);
                if (cached) return cached;
                // For navigation requests — show offline page
                if (event.request.mode === 'navigate') {
                    return caches.match(OFFLINE_URL);
                }
                // For everything else — return a generic network error response
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            })
    );
});
