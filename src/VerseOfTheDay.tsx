import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Copy, Check, Loader2 } from "lucide-react";
import { VERSES } from "./verseData";
import { useTheme } from "./ThemeContext";

interface Props { userId: string; userName: string; userPhoto: string; }

const CARD = "bg-white dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.35)]";

const VERSE_REACTIONS = [
    { key: "prayer",  label: "Praying",   icon: "🙏" },
    { key: "love",    label: "Love this", icon: "❤️"  },
    { key: "fire",    label: "On fire",   icon: "🔥"  },
    { key: "touched", label: "Touched",   icon: "😭"  },
    { key: "blessed", label: "Blessed",   icon: "✨"  },
    { key: "worship", label: "Worship",   icon: "🎶"  },
] as const;

function phNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}
function todayKey() {
    const d = phNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayOfYear() {
    const d = phNow();
    return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export default function VerseOfTheDay({ userId }: Props) {
    const [dateKey, setDateKey] = useState(todayKey);
    const verse = VERSES[(dayOfYear() - 1 + VERSES.length) % VERSES.length];
    const { theme } = useTheme();
    const isLuxury = theme === "luxury";

    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [copyState, setCopyState] = useState<"idle" | "loading" | "done">("idle");

    const fetchCrossRefText = useCallback(async (ref: string): Promise<string> => {
        const local = VERSES.find(v => v.ref === ref || v.ref.startsWith(ref) || ref.startsWith(v.ref));
        if (local) return local.text;
        try {
            const apiKey = (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || "";
            if (!apiKey) return "";
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Quote ONLY the exact NIV text of ${ref}. No commentary, no labels — just the verse text itself.` }] }],
                        generationConfig: { temperature: 0, maxOutputTokens: 300 },
                    }),
                }
            );
            if (!res.ok) return "";
            const data = await res.json();
            return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").replace(/\n/g, " ").trim();
        } catch { return ""; }
    }, []);

    const copyVerse = useCallback(async () => {
        if (copyState !== "idle") return;
        setCopyState("loading");
        try {
            const crossTexts = await Promise.all(verse.cross.map(async ref => ({ ref, text: await fetchCrossRefText(ref) })));
            const dateStr = phNow().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
            const lines = ["VERSE OF THE DAY", dateStr, "", `"${verse.text}"`, `— ${verse.ref} (NIV)`];
            if (verse.insight) lines.push("", "Insight:", verse.insight);
            if (crossTexts.length > 0) { lines.push("", "CROSS REFERENCES:"); crossTexts.forEach(({ ref, text }) => { lines.push("", ref); if (text) lines.push(text); }); }
            await navigator.clipboard.writeText(lines.join("\n"));
            setCopyState("done");
            setTimeout(() => setCopyState("idle"), 2500);
        } catch { setCopyState("idle"); }
    }, [verse, copyState, fetchCrossRefText]);

    useEffect(() => {
        const id = setInterval(() => { const k = todayKey(); if (k !== dateKey) { setDateKey(k); setReactions({}); } }, 30_000);
        return () => clearInterval(id);
    }, [dateKey]);

    useEffect(() => {
        fetch(`/api/verse-of-day?date=${dateKey}`)
            .then(r => r.json())
            .then(data => { if (data.reactions) setReactions(data.reactions); })
            .catch(() => {});
    }, [dateKey]);

    const toggleReaction = (key: string) => {
        if (!userId) return;
        setReactions(prev => {
            const users = prev[key] ?? [];
            return { ...prev, [key]: users.includes(userId) ? users.filter(u => u !== userId) : [...users, userId] };
        });
        fetch("/api/verse-of-day/react", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: dateKey, userId, key, verseRef: verse.ref }),
        });
    };

    const totalReactions = (Object.values(reactions) as string[][]).reduce((s, a) => s + a.length, 0);

    return (
        <div className={`${CARD} overflow-hidden h-full flex flex-col`}>

            {/* ── Header — matches CardHeader style exactly ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/80 dark:border-gray-700/60 shrink-0 gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    {/* Icon chip: standardized w-8 h-8 rounded-xl, 16px icon */}
                    <span className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                        <BookOpen size={16} className={isLuxury ? "text-blue-400" : "text-indigo-500"} />
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white text-sm tracking-tight whitespace-nowrap">
                        Verse of the Day
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Short date on mobile, full date on sm+ */}
                    <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                        <span className="sm:hidden">
                            {phNow().toLocaleDateString("en", { month: "short", day: "numeric" })}
                        </span>
                        <span className="hidden sm:inline">
                            {phNow().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
                        </span>
                    </span>
                    <button
                        onClick={copyVerse}
                        disabled={copyState === "loading"}
                        title={copyState === "done" ? "Copied!" : "Copy verse"}
                        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all disabled:opacity-60 shrink-0 ${
                            copyState === "done"
                                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40 text-green-600 dark:text-green-400"
                                : "bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600/60 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400"
                        }`}
                    >
                        {copyState === "loading" ? <Loader2 size={12} className="animate-spin" /> : copyState === "done" ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                </div>
            </div>

            {/* ── Body: Stacks vertically on mobile + tablet; side-by-side only on lg+ ── */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0">

                {/* LEFT — Quote + reference + reactions: always full width on mobile/tablet */}
                <div className="flex flex-col justify-between px-6 pt-5 pb-5 flex-1 lg:border-r border-gray-100/80 dark:border-gray-700/60">
                    <div>
                        <blockquote className="text-base font-semibold leading-[1.8] text-gray-900 dark:text-white">
                            "{verse.text}"
                        </blockquote>
                        <p className={`mt-2.5 text-sm font-bold tracking-wide ${isLuxury ? "text-blue-500 dark:text-blue-400" : "text-indigo-500 dark:text-indigo-400"}`}>
                            — {verse.ref}&nbsp;
                            <span className="text-gray-400 dark:text-gray-500 font-medium">(NIV)</span>
                        </p>
                    </div>


                </div>

                {/* RIGHT — Insight + Cross Refs: HIDDEN on mobile/tablet, flex on lg+ only */}
                {verse.insight && (
                    <div className="hidden lg:flex lg:w-[42%] px-6 pt-5 pb-5 flex-col gap-3 bg-gray-50/50 dark:bg-gray-900/30 border-l border-gray-100/80 dark:border-gray-700/60">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">INSIGHT</h4>
                        <p className="text-base leading-relaxed text-gray-600 dark:text-gray-300 flex-1">
                            {verse.insight}
                        </p>
                        {verse.cross.length > 0 && (
                            <div className="shrink-0 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">CROSS REFERENCES</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {verse.cross.map(c => (
                                        <span
                                            key={c}
                                            className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border ${
                                                isLuxury
                                                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40"
                                                    : "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/40"
                                            }`}
                                        >
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
