import { useEffect, useState } from "react";
import { X, Music, Heart } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function WelcomeToast() {
    const { user } = useAuth();
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (!user?.uid || !user?.email) return;

        // Check Firestore (cross-device) for welcomed flag
        fetch(`/api/user-flags?userId=${user.uid}`)
            .then(r => r.json())
            .then(async flags => {
                // Already welcomed on any device before — skip
                if (flags?.welcomed) return;

                // Check if there's a live broadcast — if yes, defer welcome toast
                const broadcastRes = await fetch(`/api/broadcasts?email=${encodeURIComponent(user.email!)}`);
                const broadcast = await broadcastRes.json();
                if (broadcast?.id) return; // Broadcast takes priority — skip for now

                // Mark as welcomed in Firestore (works on ALL devices)
                await fetch("/api/user-flags", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: user.uid, welcomed: true }),
                });

                // Show the toast
                setTimeout(() => setVisible(true), 200);
            })
            .catch(() => {
                // If API fails, fall back to localStorage
                const key = `wf_welcomed_${user.uid}`;
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, "1");
                    setTimeout(() => setVisible(true), 200);
                }
            });
    }, [user?.uid, user?.email]);

    useEffect(() => {
        if (!visible) return;
        const t = setTimeout(() => dismiss(), 5000);
        return () => clearTimeout(t);
    }, [visible]);

    const dismiss = () => {
        setExiting(true);
        setTimeout(() => { setVisible(false); setExiting(false); }, 400);
    };

    if (!visible || !user) return null;

    const firstName = user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "there";

    return (
        /* ── Matches App.tsx toast stack position: fixed top-4 right-4 ── */
        <div
            className={`fixed top-4 right-4 z-[300] pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[340px] bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl px-4 py-3 transition-all duration-400 ${exiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}`}
            style={{ animation: exiting ? undefined : "slideInRight 0.25s ease-out" }}
        >
            {/* Indigo accent dot — matches toast icon style */}
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                <Heart size={10} className="text-white" />
            </span>

            {/* Message */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                    Welcome, {firstName}! 👋
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                    You're now part of the WorshipFlow team. <Music size={11} className="inline-block ml-0.5 -mt-0.5 text-indigo-500 dark:text-indigo-400" />
                </p>
            </div>

            {/* Dismiss */}
            <button
                onClick={dismiss}
                className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ml-1"
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}
