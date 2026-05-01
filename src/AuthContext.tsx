import React, { createContext, useContext, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

const ADMIN_EMAIL = "jayfullsnackdev@gmail.com";

export type AuthStatus = "loading" | "unauthenticated" | "pending" | "approved" | "denied";

interface AuthContextValue {
    user: User | null;
    status: AuthStatus;
    isAdmin: boolean;
    userRole: string;
    signInWithGoogle: () => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Offline auth session cache keys ──────────────────────────────────────────
// Saves the last successful auth to localStorage so the app works after
// a server restart at the campsite when Firebase can't be reached.
const CACHE_KEY  = "wf_auth_session_v2";
const ROLE_KEY   = "wf_auth_role_v2";

function saveAuthCache(u: User, role: string) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            uid: u.uid, email: u.email,
            displayName: u.displayName, photoURL: u.photoURL,
            ts: Date.now(),
        }));
        localStorage.setItem(ROLE_KEY, role);
    } catch { /* noop */ }
}

function loadAuthCache(): { uid: string; email: string; displayName: string; photoURL: string; role: string } | null {
    try {
        const raw  = localStorage.getItem(CACHE_KEY);
        const role = localStorage.getItem(ROLE_KEY) ?? "member";
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Accept cached session up to 30 days old
        const age = Date.now() - (data.ts ?? 0);
        if (age > 30 * 24 * 60 * 60 * 1000) return null;
        return { ...data, role };
    } catch { return null; }
}

function clearAuthCache() {
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(ROLE_KEY); } catch { /* noop */ }
}

// True when running as local dev server (campsite / offline mode)
const IS_LOCAL = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]       = useState<User | null>(null);
    const [status, setStatus]   = useState<AuthStatus>("loading");
    const [userRole, setUserRole] = useState<string>("member");

    useEffect(() => {
        // ── Offline safety net: if on localhost and Firebase takes >5s to resolve,
        // restore from cache so the app doesn't stay stuck on the login screen. ──
        let offlineTimer: ReturnType<typeof setTimeout> | null = null;
        let resolved = false;

        if (IS_LOCAL) {
            offlineTimer = setTimeout(() => {
                if (resolved) return; // Firebase already resolved — no need
                const cached = loadAuthCache();
                if (cached) {
                    // Synthesise a minimal user-like object for the context
                    // (real User object not available offline — enough for display/roles)
                    setUser({ uid: cached.uid, email: cached.email, displayName: cached.displayName, photoURL: cached.photoURL } as unknown as User);
                    setUserRole(cached.role);
                    setStatus("approved");
                    console.info("[WorshipFlow] Offline mode — auth restored from cache ✅");
                } else {
                    // No cache at all — show login (user must sign in once online first)
                    setStatus("unauthenticated");
                }
            }, 5000); // 5s timeout for Firebase to respond
        }

        const unsub = onAuthStateChanged(auth, async (u) => {
            resolved = true;
            if (offlineTimer) clearTimeout(offlineTimer);

            if (!u) {
                setUser(null);
                setStatus("unauthenticated");
                return;
            }
            setUser(u);
            // Admin always has access
            if (u.email === ADMIN_EMAIL) {
                setStatus("approved");
                setUserRole("admin");
                saveAuthCache(u, "admin");
                return;
            }
            // Check if user is in approved list
            try {
                const res  = await fetch(`/api/auth/check?email=${encodeURIComponent(u.email ?? "")}`);
                const data = await res.json();
                if (data.approved) {
                    const role = data.role ?? "member";
                    setStatus("approved");
                    setUserRole(role);
                    saveAuthCache(u, role); // ✅ save for offline use
                } else {
                    setStatus("denied");
                    setUserRole("member");
                    // Auto-log this user as a pending request for admin review
                    fetch("/api/auth/request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: u.email,
                            name: u.displayName ?? "",
                            photo: u.photoURL ?? "",
                        }),
                    }).catch(() => { });
                }
            } catch {
                // Network error during role check — fall back to cached role
                const cached = loadAuthCache();
                if (cached && cached.uid === u.uid) {
                    setStatus("approved");
                    setUserRole(cached.role);
                    console.info("[WorshipFlow] Role check offline — using cached role:", cached.role);
                } else {
                    setStatus("denied");
                }
            }
        });

        return () => { unsub(); if (offlineTimer) clearTimeout(offlineTimer); };
    }, []);

    const signInWithGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err: any) {
            console.error("Sign-in error:", err);
        }
    };

    const logOut = async () => {
        clearAuthCache(); // remove offline session cache on explicit sign-out
        try {
            const PRESERVE_KEYS = new Set(["wf_playlists_v1", "wf_last_playlist", "wf_playlist_info_visits"]);
            Object.keys(localStorage)
                .filter(k => k.startsWith("wf_") && !PRESERVE_KEYS.has(k))
                .forEach(k => localStorage.removeItem(k));
        } catch { /* noop */ }
        await signOut(auth);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                status,
                isAdmin: user?.email === ADMIN_EMAIL,
                userRole,
                signInWithGoogle,
                logOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
