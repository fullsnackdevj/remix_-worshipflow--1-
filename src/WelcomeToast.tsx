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
                setTimeout(() => setVisible(true), 800);
            })
            .catch(() => {
                // If API fails, fall back to localStorage
                const key = `wf_welcomed_${user.uid}`;
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, "1");
                    setTimeout(() => setVisible(true), 800);
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
        <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-2rem)] max-w-sm transition-all duration-400 ${exiting ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
            style={{ animation: exiting ? undefined : "welcomeSlideUp 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
        >
            <div className="bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden">
                {/* Rainbow top stripe */}
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div className="flex items-center gap-3 px-4 py-3.5">
                    {/* Avatar */}
                    <div className="shrink-0 relative">
                        {user.photoURL ? (
                            <img
                                src={user.photoURL}
                                alt={user.displayName ?? ""}
                                className="w-11 h-11 rounded-full border-2 border-indigo-500/50"
                            />
                        ) : (
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base">
                                {firstName[0]?.toUpperCase()}
                            </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shadow">
                            <Heart size={10} className="text-white" />
                        </span>
                    </div>

                    {/* Message */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white leading-tight">
                            Welcome, {firstName}!
                        </p>
                        <p className="text-xs text-gray-400 leading-snug mt-0.5">
                            You're now part of the WorshipFlow team. <Music size={12} className="inline-block ml-0.5 -mt-0.5 text-indigo-400" />
                        </p>
                    </div>

                    {/* Dismiss */}
                    <button
                        onClick={dismiss}
                        className="shrink-0 p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/5 transition-colors"
                        aria-label="Dismiss"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}
