import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirestore } from "firebase/firestore";

// Firebase client config — safe to expose (restricted by authorized domains)
const firebaseConfig = {
    apiKey: "AIzaSyDiFuHQ3qUTdvZ7qppCqJRlCBgxJM3vhw0",
    authDomain: "worshipflow-1fbe0.firebaseapp.com",
    projectId: "worshipflow-1fbe0",
    storageBucket: "worshipflow-1fbe0.firebasestorage.app",
    messagingSenderId: "1007052719455",
    appId: "1:1007052719455:web:e0d6c338a503cdefcfe2ea",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Always show the account picker — prevents auto-sign-in with the previous
// account after the user has explicitly signed out.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = getFirestore(app);

// Firebase Cloud Messaging — for push notifications
export const messaging = getMessaging(app);
export { getToken, onMessage };

// VAPID key for web push
export const VAPID_KEY = "BAg369pso0CcSa_8hXoSf3Ff3eUPPRQEb50Jl8CRfXAuIR1UpGzqVq4GG1qcyO8Sttya_PeqJQmyoeQxolnyYtE";
