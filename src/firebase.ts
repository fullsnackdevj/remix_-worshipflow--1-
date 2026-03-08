import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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
