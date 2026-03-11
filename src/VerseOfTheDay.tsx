import React, { useState, useEffect } from "react";
import { BookOpen, Heart, Send, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from "lucide-react";
import { VERSES } from "./verseData";
import { db } from "./firebase";
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from "firebase/firestore";

interface VotdNote { uid: string; name: string; photo: string; text: string; createdAt: string; }
interface Props { userId: string; userName: string; userPhoto: string; }

const VERSE_REACTIONS = [
    { key: "prayer", label: "Praying", icon: "🙏", activeColor: "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300" },
    { key: "love", label: "Love this", icon: "❤️", activeColor: "bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300" },
    { key: "fire", label: "On fire", icon: "🔥", activeColor: "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300" },
    { key: "touched", label: "Touched", icon: "😭", activeColor: "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300" },
    { key: "blessed", label: "Blessed", icon: "✨", activeColor: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300" },
    { key: "worship", label: "Worship", icon: "🎶", activeColor: "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" },
] as const;

function dayOfYear() {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
}
function todayKey() { return new Date().toISOString().split("T")[0]; }

export default function VerseOfTheDay({ userId, userName, userPhoto }: Props) {
    const verse = VERSES[(dayOfYear() - 1 + VERSES.length) % VERSES.length];
    const dateKey = todayKey();
    const docRef = doc(db, "verseOfDay", dateKey);

    // ── Local state (single source of truth — same as Notes panel) ─────────
    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [notes, setNotes] = useState<VotdNote[]>([]);
    const [noteInput, setNoteInput] = useState("");
    const [showNotes, setShowNotes] = useState(true);
    const [showInsight, setShowInsight] = useState(true);
    const [savingNote, setSavingNote] = useState(false);
    const [noteSaved, setNoteSaved] = useState(false);

    // ── Load once on mount (just like Notes panel: fetchNotes then done) ────
    useEffect(() => {
        getDoc(docRef).then(snap => {
            if (snap.exists()) {
                const d = snap.data() as { reactions?: Record<string, string[]>; notes?: VotdNote[] };
                setReactions(d.reactions ?? {});
                setNotes(d.notes ?? []);
            }
        }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateKey]);

    // ── React — EXACT copy of Notes panel reactToNote pattern ──────────────
    // Step 1: Update local state INSTANTLY (no waiting)
    // Step 2: Fire background Firestore write (fire-and-forget)
    const toggleReaction = (key: string) => {
        if (!userId) return;

        // 1. Instant local update — same as: reactions[emoji] = users.includes(userId) ? remove : add
        setReactions(prev => {
            const users = prev[key] ?? [];
            return {
                ...prev,
                [key]: users.includes(userId)
                    ? users.filter(u => u !== userId)
                    : [...users, userId],
            };
        });

        // 2. Background Firestore sync — fire and forget (no await, no race)
        const users = reactions[key] ?? [];
        const hasIt = users.includes(userId);
        const newUsers = hasIt ? users.filter(u => u !== userId) : [...users, userId];

        getDoc(docRef).then(snap => {
            if (snap.exists()) {
                return updateDoc(docRef, { [`reactions.${key}`]: newUsers });
            } else {
                return setDoc(docRef, { verse: verse.ref, reactions: { [key]: newUsers }, notes: [] });
            }
        }).catch(() => { });
    };

    // ── Submit note — same optimistic pattern as Notes panel ───────────────
    const submitNote = async () => {
        const text = noteInput.trim();
        if (!text || !userId || savingNote) return;

        const newNote: VotdNote = {
            uid: userId, name: userName, photo: userPhoto,
            text, createdAt: new Date().toISOString(),
        };

        // 1. Instant local update
        setNotes(prev => [...prev, newNote]);
        setNoteInput("");
        setSavingNote(true);

        // 2. Background Firestore sync
        try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                await updateDoc(docRef, { notes: arrayUnion(newNote) });
            } else {
                await setDoc(docRef, { verse: verse.ref, reactions: {}, notes: [newNote] });
            }
            setNoteSaved(true);
            setTimeout(() => setNoteSaved(false), 2000);
        } catch {
            // Rollback note on error
            setNotes(prev => prev.filter(n => n.createdAt !== newNote.createdAt));
            setNoteInput(text);
        } finally {
            setSavingNote(false);
        }
    };

    const totalNotes = notes.length;
    const totalReactions = Object.values(reactions).reduce((s, a) => s + a.length, 0);

    return (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-950/80 via-indigo-900/60 to-violet-900/40 border border-indigo-500/20 shadow-xl overflow-hidden mb-4">

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
                <blockquote className="text-white text-sm sm:text-base font-medium leading-relaxed italic mb-2">
                    "{verse.text}"
                </blockquote>
                <p className="text-indigo-300 text-xs font-bold tracking-wide">— {verse.ref} (NLT)</p>
            </div>

            {/* Insight */}
            <div className="px-5 pb-3">
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

            {/* Reactions — Notes panel pill style */}
            <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5">
                {VERSE_REACTIONS.map(({ key, label, icon, activeColor }) => {
                    const users = reactions[key] ?? [];
                    const reacted = users.includes(userId);
                    const tooltip = reacted
                        ? `Remove "${label}"${users.length > 1 ? ` · ${users.length} people` : ""}`
                        : `${label}${users.length > 0 ? ` · ${users.length} person${users.length !== 1 ? "s" : ""}` : ""}`;
                    return (
                        <button
                            key={key}
                            onClick={() => toggleReaction(key)}
                            title={tooltip}
                            aria-label={tooltip}
                            className={`group relative flex items-center gap-1 text-sm px-2.5 py-0.5 rounded-full border transition-all select-none active:scale-95 ${reacted
                                    ? `${activeColor} scale-105 shadow-sm`
                                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-white/20"
                                }`}
                        >
                            <span className="text-[15px] leading-none">{icon}</span>
                            {users.length > 0 && (
                                <span className="text-xs font-bold tabular-nums">{users.length}</span>
                            )}
                            {/* Hover tooltip */}
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

            {/* Team Notes */}
            <div className="border-t border-indigo-500/10 px-5 pt-3 pb-4">
                <button onClick={() => setShowNotes(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors mb-2">
                    <span>📝</span>
                    Team Notes{totalNotes > 0 ? ` (${totalNotes})` : ""}
                    {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showNotes && (
                    <div className="space-y-2">
                        {notes.length === 0 && (
                            <p className="text-[11px] text-indigo-500 italic px-1">Be the first to share a reflection ✨</p>
                        )}
                        {notes.map((n, i) => (
                            <div key={`${n.uid}-${i}`} className="flex items-start gap-2">
                                {n.photo
                                    ? <img src={n.photo} alt={n.name} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-indigo-400/30" />
                                    : <div className="w-6 h-6 rounded-full bg-indigo-600 shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold text-white">{(n.name || "?")[0]}</div>
                                }
                                <div className="flex-1 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-[11px] font-bold text-indigo-300">{n.name.split(" ")[0]}</span>
                                        <span className="text-[10px] text-indigo-500">
                                            {new Date(n.createdAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-200 leading-relaxed">{n.text}</p>
                                </div>
                            </div>
                        ))}

                        {/* Input */}
                        <div className="flex items-center gap-2 mt-2">
                            {userPhoto
                                ? <img src={userPhoto} alt={userName} className="w-6 h-6 rounded-full object-cover shrink-0 border border-indigo-400/30" />
                                : <div className="w-6 h-6 rounded-full bg-indigo-600 shrink-0 flex items-center justify-center text-[9px] font-bold text-white">{(userName || "?")[0]}</div>
                            }
                            <div className="flex-1 flex items-center bg-white/5 border border-indigo-400/20 rounded-xl overflow-hidden pr-1">
                                <input
                                    value={noteInput}
                                    onChange={e => setNoteInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitNote()}
                                    placeholder="Share your reflection… (Enter to send)"
                                    className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-indigo-400/50 outline-none"
                                />
                                {savingNote && <Loader2 size={11} className="text-indigo-400 animate-spin mr-1" />}
                                {noteSaved && (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold pr-1">
                                        <CheckCircle2 size={11} /> Saved!
                                    </span>
                                )}
                                {noteInput.trim() && !savingNote && !noteSaved && (
                                    <button onClick={submitNote}
                                        className="p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 active:scale-95 transition-all">
                                        <Send size={11} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
