import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { getFirestore, enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase client config — loaded from environment variables.
// Safe to expose publicly (restricted by Firebase authorized domains).
const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Always show the account picker — prevents auto-sign-in with the previous
// account after the user has explicitly signed out.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = getFirestore(app);
export const storage = getStorage(app);

// ── Firestore Offline Persistence ────────────────────────────────────────────
// Enables IndexedDB-backed offline caching so the app works without internet.
// Multi-tab persistence is attempted first (works across multiple open tabs);
// falls back to single-tab if the browser does not support it.
// Writes made offline are queued locally and automatically flushed when
// the connection is restored — no extra code needed at the call site.
(async () => {
    try {
        await enableMultiTabIndexedDbPersistence(db);
    } catch (err: any) {
        if (err?.code === 'unimplemented') {
            // Browser has no IndexedDB (very rare) — offline cache unavailable
        } else if (err?.code === 'failed-precondition') {
            // Multi-tab not available — fall back to single-tab persistence
            try { await enableIndexedDbPersistence(db); } catch { /* noop */ }
        }
        // Any other error is silently ignored — the app still works online
    }
})();

// Firebase Cloud Messaging — lazily initialized so it never crashes on
// unsupported platforms (iOS Safari < 16.4, in-app browsers from WhatsApp /
// Messenger / Instagram, etc. that lack Service Worker + Push API support).
// A top-level getMessaging() call on those platforms throws at module load
// time — BEFORE React mounts — producing a completely blank page.
let _messaging: Messaging | null = null;
export function getMessagingInstance(): Messaging | null {
    if (_messaging) return _messaging;
    try {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            _messaging = getMessaging(app);
        }
    } catch {
        // Silently ignored — push notifications simply won't work on this browser.
    }
    return _messaging;
}

// Keep the named re-exports so existing import sites don't need to change.
export { getToken, onMessage };

// Legacy alias — callers that imported `messaging` directly get null on
// unsupported browsers instead of a crash. Prefer getMessagingInstance().
export const messaging = (() => {
    try {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            return getMessaging(app);
        }
    } catch { /* unsupported browser */ }
    return null;
})();

// VAPID key for web push
export const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;
