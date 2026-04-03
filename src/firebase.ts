import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore } from "firebase/firestore";
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

// Firebase Cloud Messaging — for push notifications
export const messaging = getMessaging(app);
export { getToken, onMessage };

// VAPID key for web push
export const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;
