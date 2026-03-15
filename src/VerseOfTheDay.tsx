import React, { useState, useEffect } from "react";
import { BookOpen, Heart, ChevronDown, ChevronUp } from "lucide-react";
import { VERSES } from "./verseData";

interface Props { userId: string; userName: string; userPhoto: string; }

const VERSE_REACTIONS = [
    { key: "prayer", label: "Praying", icon: "🙏", activeColor: "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300" },
    { key: "love", label: "Love this", icon: "❤️", activeColor: "bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300" },
    { key: "fire", label: "On fire", icon: "🔥", activeColor: "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300" },
    { key: "touched", label: "Touched", icon: "😭", activeColor: "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300" },
    { key: "blessed", label: "Blessed", icon: "✨", activeColor: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300" },
    { key: "worship", label: "Worship", icon: "🎶", activeColor: "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" },
] as const;

/** Returns a Date object in Philippines time (UTC+8), always. */
function phNow() {
    // toLocaleString with timeZone then re-parse gives us accurate PH local time
    const ph = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    return ph;
}
function todayKey() {
    const d = phNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayOfYear() {
    const d = phNow();
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export default function VerseOfTheDay({ userId }: Props) {
    const [dateKey, setDateKey] = useState(todayKey);
    const verse = VERSES[(dayOfYear() - 1 + VERSES.length) % VERSES.length];

    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [showInsight, setShowInsight] = useState(true);

    // Auto-refresh at PH midnight: check every 30s if the date has ticked over
    useEffect(() => {
        const id = setInterval(() => {
            const newKey = todayKey();
            if (newKey !== dateKey) {
                setDateKey(newKey);
                setReactions({});   // wipe local reactions so fresh ones load
            }
        }, 30_000);
        return () => clearInterval(id);
    }, [dateKey]);

    // Load saved reactions from server whenever the date changes
    useEffect(() => {
        fetch(`/api/verse-of-day?date=${dateKey}`)
            .then(r => r.json())
            .then(data => { if (data.reactions) setReactions(data.reactions); })
            .catch(() => { });
    }, [dateKey]);

    // Optimistic update + fire-and-forget save (exact Notes panel pattern)
    const toggleReaction = (key: string) => {
        if (!userId) return;
        setReactions(prev => {
            const users = prev[key] ?? [];
            return {
                ...prev,
                [key]: users.includes(userId)
                    ? users.filter(u => u !== userId)
                    : [...users, userId],
            };
        });
        fetch("/api/verse-of-day/react", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: dateKey, userId, key, verseRef: verse.ref }),
        });
    };

    const totalReactions = (Object.values(reactions) as string[][]).reduce((s, a) => s + a.length, 0);


    return (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-950/80 via-indigo-900/60 to-violet-900/40 border border-indigo-500/20 shadow-xl overflow-hidden h-full">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                        <BookOpen size={14} className="text-indigo-300" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">Verse of the Day</span>
                </div>
                <span className="text-[11px] text-indigo-400/70 font-medium">
                    {new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
                </span>
            </div>

            {/* Verse */}
            <div className="px-5 pb-4">
                <blockquote className="text-white text-sm sm:text-base font-medium leading-relaxed mb-2">
                    "{verse.text}"
                </blockquote>
                <p className="text-indigo-300 text-xs font-bold tracking-wide">— {verse.ref} (NLT)</p>
            </div>

            {/* Insight toggle */}
            <div className="px-5 pb-4">
                <button
                    onClick={() => setShowInsight(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors"
                >
                    <Heart size={12} />
                    {showInsight ? "Hide" : "Read"} Insight
                    {showInsight ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showInsight && (
                    <div className="mt-2 p-3 rounded-xl bg-white/5 border border-indigo-400/10">
                        <p className="text-sm text-indigo-100/90 leading-relaxed">{verse.insight}</p>
                        {verse.cross.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">Cross refs:</span>
                                {verse.cross.map(c => (
                                    <span key={c} className="text-[11px] font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">{c}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Reactions */}
            <div className="px-5 pb-4 flex flex-wrap items-center gap-1.5">
                {VERSE_REACTIONS.map(({ key, label, icon, activeColor }) => {
                    const users = reactions[key] ?? [];
                    const reacted = users.includes(userId);
                    return (
                        <button
                            key={key}
                            onClick={() => toggleReaction(key)}
                            title={label}
                            aria-label={label}
                            className={`group relative flex items-center gap-1 text-sm px-2.5 py-0.5 rounded-full border transition-all select-none active:scale-95 ${reacted
                                    ? `${activeColor} scale-105 shadow-sm`
                                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-white/20"
                                }`}
                        >
                            <span className="text-[15px] leading-none">{icon}</span>
                            {users.length > 0 && (
                                <span className="text-xs font-bold tabular-nums">{users.length}</span>
                            )}
                            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 shadow-lg">
                                {label}
                            </span>
                        </button>
                    );
                })}
                {totalReactions > 0 && (
                    <span className="text-[11px] text-indigo-400 ml-1">
                        {totalReactions} reaction{totalReactions !== 1 ? "s" : ""}
                    </span>
                )}
            </div>
        </div>
    );
}
