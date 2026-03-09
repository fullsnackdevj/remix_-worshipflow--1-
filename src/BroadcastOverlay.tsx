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
    const { user } = useAuth();
    const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
    const [dismissing, setDismissing] = useState(false);

    useEffect(() => {
        if (!user?.email) return;
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
                {/* Animated background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-3xl animate-pulse" />
                    <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-orange-500/5 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
                </div>

                <div className="relative z-10 max-w-sm w-full text-center space-y-6">
                    {/* Icon */}
                    <div className="mx-auto w-24 h-24 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <span className="text-5xl animate-bounce" style={{ animationDuration: "2s" }}>🔧</span>
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

                    {/* Branding */}
                    <p className="text-xs text-gray-600 mt-8">WorshipFlow — Please check back soon</p>
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
