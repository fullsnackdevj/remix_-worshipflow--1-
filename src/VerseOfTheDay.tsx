import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, Heart, Send, ChevronDown, ChevronUp } from "lucide-react";
import { VERSES } from "./verseData";
import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

interface VotdNote { uid: string; name: string; photo: string; text: string; createdAt: string; }

interface Props {
    userId: string;
    userName: string;
    userPhoto: string;
}

const EMOJIS = ["🙏", "❤️", "🔥", "😭", "✨", "🎶"];

function dayOfYear(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / 86400000);
}

function todayKey(): string {
    return new Date().toISOString().split("T")[0];
}

export default function VerseOfTheDay({ userId, userName, userPhoto }: Props) {
    const verse = VERSES[(dayOfYear() - 1 + VERSES.length) % VERSES.length];
    const dateKey = todayKey();

    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [notes, setNotes] = useState<VotdNote[]>([]);
    const [noteInput, setNoteInput] = useState("");
    const [showNotes, setShowNotes] = useState(false);
    const [showInsight, setShowInsight] = useState(false);
    const [savingNote, setSavingNote] = useState(false);

    const docRef = doc(db, "verseOfDay", dateKey);

    const load = useCallback(async () => {
        try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const d = snap.data() as { reactions?: Record<string, string[]>; notes?: VotdNote[] };
                setReactions(d.reactions ?? {});
                setNotes(d.notes ?? []);
            }
        } catch { }
    }, [dateKey]);

    useEffect(() => { load(); }, [load]);

    const toggleReaction = async (emoji: string) => {
        if (!userId) return;
        const current = reactions[emoji] ?? [];
        const hasIt = current.includes(userId);
        const updated = { ...reactions, [emoji]: hasIt ? current.filter(u => u !== userId) : [...current, userId] };
        setReactions(updated);
        try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                await updateDoc(docRef, { [`reactions.${emoji}`]: hasIt ? arrayRemove(userId) : arrayUnion(userId) });
            } else {
                await setDoc(docRef, { verse: verse.ref, reactions: updated, notes: [] });
            }
        } catch { }
    };

    const submitNote = async () => {
        if (!noteInput.trim() || !userId) return;
        setSavingNote(true);
        const newNote: VotdNote = { uid: userId, name: userName, photo: userPhoto, text: noteInput.trim(), createdAt: new Date().toISOString() };
        try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                await updateDoc(docRef, { notes: arrayUnion(newNote) });
            } else {
                await setDoc(docRef, { verse: verse.ref, reactions: {}, notes: [newNote] });
            }
            setNotes(prev => [...prev, newNote]);
            setNoteInput("");
        } catch { } finally { setSavingNote(false); }
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
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${mine ? "bg-indigo-500/30 border-indigo-400/50 text-white scale-105" : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"}`}>
                            {emoji}{count > 0 && <span className="text-[10px]">{count}</span>}
                        </button>
                    );
                })}
                {totalReactions > 0 && <span className="text-[11px] text-indigo-400 ml-1">{totalReactions} reaction{totalReactions !== 1 ? "s" : ""}</span>}
            </div>

            {/* Notes section */}
            <div className="border-t border-indigo-500/10 px-5 pt-3 pb-4">
                <button onClick={() => setShowNotes(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors mb-2">
                    <span>📝</span>
                    {showNotes ? "Hide" : "Team"} Notes{totalNotes > 0 ? ` (${totalNotes})` : ""}
                    {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showNotes && (
                    <div className="space-y-2">
                        {notes.map((n, i) => (
                            <div key={i} className="flex items-start gap-2">
                                {n.photo
                                    ? <img src={n.photo} alt={n.name} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-indigo-400/30" />
                                    : <div className="w-6 h-6 rounded-full bg-indigo-600 shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold text-white">{n.name[0]}</div>
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
                                : <div className="w-6 h-6 rounded-full bg-indigo-600 shrink-0 flex items-center justify-center text-[9px] font-bold text-white">{userName[0]}</div>
                            }
                            <div className="flex-1 flex items-center bg-white/5 border border-indigo-400/20 rounded-xl overflow-hidden pr-1">
                                <input
                                    value={noteInput}
                                    onChange={e => setNoteInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitNote()}
                                    placeholder="Share your reflection…"
                                    className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-indigo-400/50 outline-none"
                                />
                                {noteInput.trim() && (
                                    <button onClick={submitNote} disabled={savingNote}
                                        className="p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition-colors disabled:opacity-50">
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
