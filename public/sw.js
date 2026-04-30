// WorshipFlow Service Worker — v10 (2026-04-30)
// Offline Mode: App shell is pre-cached at install so the app opens instantly
// even without internet. Firestore data is cached in IndexedDB by the Firebase
// SDK — this SW only needs to guarantee the JS/CSS/HTML shell loads offline.
//
// Strategy:
//   • App shell (/, /index.html, etc.)  → Cache-First   (fast opens, offline)
//   • Static assets (JS/CSS/fonts/img) → Cache-First   (immutable hashed names)
//   • API calls (/api/*)               → Network-First  (fresh data when online)
//   • Firebase / FCM / external CDN    → Pass-through  (browser handles)

const CACHE_VERSION = 'wf-v10';
const OFFLINE_URL   = '/offline.html';

// ── App shell: pre-cached at install ─────────────────────────────────────────
// These are the bare minimum needed to boot the React app offline.
// Hashed JS/CSS bundles are added to cache automatically on first network visit.
const PRECACHE_URLS = [
    '/',
    '/offline.html',
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png',
];

// ── Message handler: allow clients to trigger skipWaiting ────────────────────
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Install: cache the app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting(); // activate immediately
});

// ── Activate: delete ALL old cache versions immediately ──────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim()) // take control of all open tabs
    );
});

// ── Fetch: tiered strategy based on request type ─────────────────────────────
self.addEventListener('fetch', event => {
    // Skip non-GET and browser-extension requests
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    // ── Pass-through: Firebase, FCM, Google APIs, YouTube, external CDNs ────
    // These are handled directly by the browser — no caching needed/possible.
    const isExternal = (
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebase.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('youtube.com') ||
        url.hostname.includes('youtu.be') ||
        url.hostname.includes('ytimg.com') ||
        url.hostname.includes('googleusercontent.com') ||
        // Only cache our own origin and Netlify
        (!url.hostname.includes('worshipflow') &&
         !url.hostname.includes('netlify') &&
          url.hostname !== self.location.hostname)
    );
    if (isExternal) return;

    // ── Network-First: API calls ─────────────────────────────────────────────
    // Always try network first so data is fresh. Fall back to cache on failure.
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
                    }
                    return res;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    return new Response(JSON.stringify({ offline: true }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' },
                    });
                })
        );
        return;
    }

    // ── Cache-First: static assets with hashed filenames (JS/CSS/fonts/images)
    // Vite generates files like /assets/App.Abc123.js — these never change
    // once deployed, so cache-first is safe and makes the app load instantly.
    const isHashedAsset = url.pathname.startsWith('/assets/') ||
                          url.pathname.match(/\.(woff2?|ttf|otf|eot)$/i);
    if (isHashedAsset) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
                    }
                    return res;
                });
            })
        );
        return;
    }

    // ── Network-First with cache fallback: HTML navigation + everything else ─
    // Navigation requests (/, /index.html): always try network to get the latest
    // app shell, but serve from cache when offline.
    event.respondWith(
        fetch(event.request)
            .then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
                }
                return res;
            })
            .catch(async () => {
                const cached = await caches.match(event.request);
                if (cached) return cached;
                // Navigation offline → serve app shell so React can boot
                if (event.request.mode === 'navigate') {
                    const shell = await caches.match('/');
                    if (shell) return shell;
                    return caches.match(OFFLINE_URL);
                }
                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            })
    );
});
