import React, { useState, useEffect, useRef } from "react";
import { BookOpen, Heart, Send, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { VERSES } from "./verseData";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

interface VotdNote { uid: string; name: string; photo: string; text: string; createdAt: string; }

interface Props { userId: string; userName: string; userPhoto: string; }

const EMOJIS = ["🙏", "❤️", "🔥", "😭", "✨", "🎶"];

function dayOfYear(): number {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
}

function todayKey(): string { return new Date().toISOString().split("T")[0]; }

export default function VerseOfTheDay({ userId, userName, userPhoto }: Props) {
    const verse = VERSES[(dayOfYear() - 1 + VERSES.length) % VERSES.length];
    const dateKey = todayKey();

    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [notes, setNotes] = useState<VotdNote[]>([]);
    const [noteInput, setNoteInput] = useState("");
    const [showNotes, setShowNotes] = useState(true);
    const [showInsight, setShowInsight] = useState(true);
    const [savingNote, setSavingNote] = useState(false);
    const [noteSaved, setNoteSaved] = useState(false);
    const docRef = useRef(doc(db, "verseOfDay", dateKey)).current;
    const docInitialized = useRef(false);

    // ── Real-time listener — updates instantly when anyone reacts or notes ──
    useEffect(() => {
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                const d = snap.data() as { reactions?: Record<string, string[]>; notes?: VotdNote[] };
                setReactions(d.reactions ?? {});
                setNotes(d.notes ?? []);
                docInitialized.current = true;
            }
        });
        return () => unsub();
    }, [dateKey]);

    // ── Emoji reaction — optimistic update + single atomic write ──
    const toggleReaction = async (emoji: string) => {
        if (!userId) return;
        const current = reactions[emoji] ?? [];
        const hasIt = current.includes(userId);

        // 1. Instant local update (no waiting)
        setReactions(prev => ({
            ...prev,
            [emoji]: hasIt ? current.filter(u => u !== userId) : [...current, userId],
        }));

        // 2. Write to Firestore — initialize doc if needed, else update field
        try {
            if (!docInitialized.current) {
                // First ever reaction: create the doc
                await setDoc(docRef, {
                    verse: verse.ref,
                    reactions: { [emoji]: hasIt ? [] : [userId] },
                    notes: [],
                }, { merge: true });
                docInitialized.current = true;
            } else {
                await updateDoc(docRef, {
                    [`reactions.${emoji}`]: hasIt ? arrayRemove(userId) : arrayUnion(userId),
                });
            }
        } catch (e) {
            // Rollback on error
            setReactions(prev => ({
                ...prev,
                [emoji]: current,
            }));
        }
    };

    // ── Note submission — optimistic, instant ──
    const submitNote = async () => {
        const text = noteInput.trim();
        if (!text || !userId || savingNote) return;

        const newNote: VotdNote = {
            uid: userId,
            name: userName,
            photo: userPhoto,
            text,
            createdAt: new Date().toISOString(),
        };

        // 1. Instant local update
        setNotes(prev => [...prev, newNote]);
        setNoteInput("");
        setSavingNote(true);

        try {
            if (!docInitialized.current) {
                await setDoc(docRef, {
                    verse: verse.ref,
                    reactions: {},
                    notes: [newNote],
                }, { merge: true });
                docInitialized.current = true;
            } else {
                await updateDoc(docRef, { notes: arrayUnion(newNote) });
            }
            // Show saved confirmation
            setNoteSaved(true);
            setTimeout(() => setNoteSaved(false), 2000);
        } catch {
            // Rollback on error
            setNotes(prev => prev.filter(n => n.createdAt !== newNote.createdAt));
            setNoteInput(text);
        } finally {
            setSavingNote(false);
        }
    };

    const totalReactions = Object.values(reactions).reduce((s, a) => s + a.length, 0);
    const totalNotes = notes.length;

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

            {/* Insight toggle */}
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

            {/* Emoji reactions */}
            <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
                {EMOJIS.map(emoji => {
                    const count = (reactions[emoji] ?? []).length;
                    const mine = (reactions[emoji] ?? []).includes(userId);
                    return (
                        <button key={emoji} onClick={() => toggleReaction(emoji)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border active:scale-95 ${mine
                                ? "bg-indigo-500/30 border-indigo-400/50 text-white scale-105 shadow-md shadow-indigo-500/20"
                                : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:scale-105"
                                }`}>
                            {emoji}{count > 0 && <span className="text-[10px] tabular-nums">{count}</span>}
                        </button>
                    );
                })}
                {totalReactions > 0 && (
                    <span className="text-[11px] text-indigo-400 ml-1">{totalReactions} reaction{totalReactions !== 1 ? "s" : ""}</span>
                )}
            </div>

            {/* Notes section */}
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
                                        <span className="text-[10px] text-indigo-500">{new Date(n.createdAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</span>
                                    </div>
                                    <p className="text-xs text-gray-200 leading-relaxed">{n.text}</p>
                                </div>
                            </div>
                        ))}

                        {/* Note input */}
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
                                {noteSaved && (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold pr-1">
                                        <CheckCircle2 size={11} /> Saved!
                                    </span>
                                )}
                                {noteInput.trim() && !noteSaved && (
                                    <button onClick={submitNote} disabled={savingNote}
                                        className="p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 active:scale-95 transition-all disabled:opacity-50">
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
