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
    signInWithGoogle: () => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");

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
                return;
            }
            // Check if user is in approved list
            try {
                const res = await fetch(`/api/auth/check?email=${encodeURIComponent(u.email ?? "")}`);
                const data = await res.json();
                if (data.approved) {
                    setStatus("approved");
                } else {
                    setStatus("denied");
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
        await signOut(auth);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                status,
                isAdmin: user?.email === ADMIN_EMAIL,
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
