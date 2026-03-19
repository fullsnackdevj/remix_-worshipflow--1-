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
    userRole: string;  // e.g. "member", "musician", "leader", "audio_tech", "admin"
    signInWithGoogle: () => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [userRole, setUserRole] = useState<string>("member");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
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
                return;
            }
            // Check if user is in approved list
            try {
                const res = await fetch(`/api/auth/check?email=${encodeURIComponent(u.email ?? "")}`);
                const data = await res.json();
                if (data.approved) {
                    setStatus("approved");
                    setUserRole(data.role ?? "member");
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
                setStatus("denied");
            }
        });
        return unsub;
    }, []);

    const signInWithGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err: any) {
            console.error("Sign-in error:", err);
        }
    };

    const logOut = async () => {
        // Clear all app caches so the next user starts with a clean state.
        // Without this, cached songs/members/schedules from the signed-out
        // session would briefly flash on the next user's screen.
        try {
            Object.keys(localStorage)
                .filter(k => k.startsWith("wf_"))
                .forEach(k => localStorage.removeItem(k));
        } catch { /* noop — storage may be restricted */ }
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
