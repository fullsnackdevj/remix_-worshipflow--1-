import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "firebase/firestore";
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

// ── Firestore with offline persistence (Firebase v9.6+ modern API) ────────────
// initializeFirestore with persistentLocalCache enables IndexedDB-backed offline
// caching at construction time — synchronous, no async race conditions, and the
// officially supported approach for Firebase v12.
//
// persistentMultipleTabManager: all open tabs share the same cache and only
// one tab acts as the network owner. Falls back gracefully to single-tab if
// the browser does not support it (e.g., private mode on some browsers).
//
// What this gives you for free:
//   • All Firestore reads are served from IndexedDB when offline
//   • onSnapshot listeners fire with cached data immediately
//   • Writes made offline are queued and auto-synced when reconnected
//   • No extra code needed at call sites — it's transparent
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
    }),
});

export const storage = getStorage(app);

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
