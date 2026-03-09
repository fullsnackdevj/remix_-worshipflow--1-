import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

interface Broadcast {
    id: string;
    type: "maintenance" | "whats_new";
    title: string;
    message: string;
    bulletPoints: string[];
    active: boolean;
    targetEmails: string[];
    dismissedBy: string[];
}

export default function BroadcastOverlay() {
    const { user, isAdmin, logOut } = useAuth();
    const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
    const [dismissing, setDismissing] = useState(false);

    useEffect(() => {
        if (!user?.email || isAdmin) return; // 👑 Admins are never blocked — they control broadcasts
        fetch(`/api/broadcasts?email=${encodeURIComponent(user.email)}`)
            .then(r => r.json())
            .then(data => { if (data?.id) setBroadcast(data); })
            .catch(() => { });
    }, [user?.email]);

    if (!broadcast) return null;

    const handleDismiss = async () => {
        if (!user?.email || broadcast.type !== "whats_new") return;
        setDismissing(true);
        await fetch(`/api/broadcasts/${broadcast.id}/dismiss`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email }),
        });
        setBroadcast(null);
    };

    // ── Under Maintenance Screen ───────────────────────────────────────────────
    if (broadcast.type === "maintenance") {
        return (
            <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gray-950 px-6">
                {/* Animated background glows */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-3xl animate-pulse" />
                    <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-orange-500/5 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
                </div>

                <div className="relative z-10 max-w-sm w-full text-center space-y-6">

                    {/* Logo + Wrench badge */}
                    <div className="relative mx-auto w-28 h-28">
                        {/* App icon */}
                        <img
                            src="/icon-192x192.png"
                            alt="WorshipFlow"
                            className="w-28 h-28 shadow-2xl shadow-amber-500/10"
                        />
                        {/* Animated wrench badge — top right corner */}
                        <div className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50 flex items-center justify-center animate-bounce" style={{ animationDuration: "1.5s" }}>
                            <span className="text-lg">🔧</span>
                        </div>
                    </div>

                    {/* Text */}
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold text-white">{broadcast.title}</h1>
                        {broadcast.message && (
                            <p className="text-sm text-gray-400 leading-relaxed">{broadcast.message}</p>
                        )}
                    </div>

                    {/* Status pill */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-xs text-amber-400 font-medium">Maintenance in progress</span>
                    </div>

                    {/* Sign out button — so users aren't fully stuck */}
                    <div className="pt-4">
                        <button
                            onClick={logOut}
                            className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-gray-200 text-sm font-medium transition-all active:scale-95"
                        >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                            </svg>
                            Sign out
                        </button>
                        <p className="text-xs text-gray-700 mt-3">WorshipFlow — Please check back soon</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── What's New Screen ──────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
            <div className="relative bg-gray-900 border border-gray-700/60 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                {/* Header gradient strip */}
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div className="px-6 pt-6 pb-8 space-y-5">
                    {/* Icon + title */}
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <span className="text-2xl">🎉</span>
                        </div>
                        <div>
                            <p className="text-[11px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">What's New</p>
                            <h2 className="text-lg font-bold text-white leading-tight">{broadcast.title}</h2>
                        </div>
                    </div>

                    {/* Message */}
                    {broadcast.message && (
                        <p className="text-sm text-gray-400 leading-relaxed">{broadcast.message}</p>
                    )}

                    {/* Bullet points */}
                    {broadcast.bulletPoints?.length > 0 && (
                        <ul className="space-y-2.5">
                            {broadcast.bulletPoints.filter(Boolean).map((point, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mt-0.5">
                                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-indigo-400">
                                            <path d="M5 13l4 4L19 7" />
                                        </svg>
                                    </span>
                                    <span className="text-sm text-gray-300 leading-snug">{point}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Dismiss button */}
                    <button
                        onClick={handleDismiss}
                        disabled={dismissing}
                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition-all active:scale-[0.98] shadow-lg disabled:opacity-60"
                    >
                        {dismissing ? "..." : "Got it! 🙌"}
                    </button>
                </div>
            </div>
        </div>
    );
}
