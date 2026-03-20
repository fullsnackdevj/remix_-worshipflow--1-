import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { Sparkles, Wrench, ThumbsUp, Loader2 } from "lucide-react";

interface Broadcast {
    id: string;
    type: "maintenance" | "whats_new";
    title: string;
    message: string;
    bulletPoints: string[];
    active: boolean;
    targetEmails: string[];
    dismissedBy: string[];
    createdAt?: string;
}

export default function BroadcastOverlay() {
    const { user, isAdmin, logOut } = useAuth();
    const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
    const [dismissing, setDismissing] = useState(false);
    // Start true so we block the dashboard until the check resolves.
    // Admins skip everything so we default to false for them immediately.
    const [isChecking, setIsChecking] = useState(!isAdmin);

    const MIN_LOAD_MS = 4000; // minimum splash duration in ms

    useEffect(() => {
        // Admins are never blocked — they control broadcasts
        if (isAdmin) { setIsChecking(false); return; }
        // Wait until Firebase has resolved the user
        if (user?.email === undefined) return;
        if (!user?.email) {
            // Still honour the minimum splash time for signed-out users
            const t = setTimeout(() => setIsChecking(false), MIN_LOAD_MS);
            return () => clearTimeout(t);
        }

        const minDelay = new Promise<void>(res => setTimeout(res, MIN_LOAD_MS));
        const fetchBroadcast = fetch(`/api/broadcasts?email=${encodeURIComponent(user.email)}`)
            .then(r => r.json())
            .then(data => { if (data?.id) setBroadcast(data); })
            .catch(() => {});

        // Only hide loader when BOTH the fetch AND the 4s timer are done
        Promise.all([fetchBroadcast, minDelay]).finally(() => setIsChecking(false));
    }, [user?.email, isAdmin]);

    // ── Still loading: render an opaque overlay so dashboard never flashes ──
    if (isChecking) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950">
                <div className="flex flex-col items-center gap-4">
                    <img src="/icon-192x192.png" alt="WorshipFlow" className="w-20 h-20 animate-pulse" />
                    <div className="flex gap-1.5">
                        {[0, 1, 2].map(i => (
                            <span key={i} className="w-2 h-2 rounded-full bg-indigo-500/60 animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

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
                            className="w-28 h-28"
                        />
                        {/* Animated wrench badge — top right corner */}
                        <div className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-amber-500/70 shadow-lg shadow-amber-500/50 flex items-center justify-center animate-bounce" style={{ animationDuration: "1.5s" }}>
                            <Wrench size={16} className="text-white" />
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
            <div className="relative bg-gray-900 border border-gray-700/60 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh]">
                {/* Header gradient strip */}
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shrink-0" />

                {/* Scrollable content */}
                <div className="overflow-y-auto flex-1 px-6 pt-6 space-y-5 pretty-scrollbar">
                    {/* Logo + Confetti badge */}
                    <div className="flex items-start gap-4">
                        <div className="relative shrink-0 w-14 h-14">
                            <img
                                src="/icon-192x192.png"
                                alt="WorshipFlow"
                                className="w-14 h-14"
                            />
                            {/* Animated sparkle badge — top right corner */}
                            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-indigo-500/70 shadow-lg shadow-indigo-500/50 flex items-center justify-center animate-bounce" style={{ animationDuration: "1.8s" }}>
                                <Sparkles size={14} className="text-white" />
                            </div>
                        </div>
                        <div>
                            <p className="text-[11px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">What's New</p>
                            <h2 className="text-lg font-bold text-white leading-tight">{broadcast.title}</h2>
                            {broadcast.createdAt && (
                                <p className="text-xs text-gray-400 mt-1 font-medium">
                                    Updated: {(() => {
                                        const d = new Date(broadcast.createdAt!);
                                        const mm = String(d.getMonth() + 1).padStart(2, "0");
                                        const dd = String(d.getDate()).padStart(2, "0");
                                        const yy = String(d.getFullYear()).slice(2);
                                        let h = d.getHours(), ampm = h >= 12 ? "PM" : "AM";
                                        h = h % 12 || 12;
                                        const min = String(d.getMinutes()).padStart(2, "0");
                                        return `${mm}-${dd}-${yy} | ${h}:${min} ${ampm}`;
                                    })()}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Message */}
                    {broadcast.message && (
                        <p className="text-sm text-gray-400 leading-relaxed">{broadcast.message}</p>
                    )}

                    {/* Bullet points */}
                    {broadcast.bulletPoints?.length > 0 && (
                        <ul className="space-y-2.5 pb-2">
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
                </div>

                {/* Dismiss button — always pinned at the bottom */}
                <div className="px-6 py-5 shrink-0 bg-gray-900">
                    <button
                        onClick={handleDismiss}
                        disabled={dismissing}
                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition-all active:scale-[0.98] shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {dismissing ? <Loader2 size={14} className="animate-spin" /> : <><ThumbsUp size={14} /> Got it!</>}
                    </button>
                </div>
            </div>
        </div>

    );
}
