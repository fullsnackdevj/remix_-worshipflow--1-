import React, { useState, useEffect, useRef } from "react";
import {
    BookOpen, Heart, Send, ChevronDown, ChevronUp,
    CheckCircle2, Loader2, Pencil, Trash2, CornerDownRight, X, Check,
} from "lucide-react";
import { VERSES } from "./verseData";

// ── Types ────────────────────────────────────────────────────────────────────
interface VotdReply {
    id: string; uid: string; name: string; photo: string;
    text: string; createdAt: string; updatedAt?: string;
}
interface VotdNote {
    id: string; uid: string; name: string; photo: string;
    text: string; createdAt: string; updatedAt?: string;
    replies?: VotdReply[];
}
interface Props { userId: string; userName: string; userPhoto: string; }

// ── Reaction pill config ─────────────────────────────────────────────────────
const VERSE_REACTIONS = [
    { key: "prayer", label: "Praying", icon: "🙏", activeColor: "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300" },
    { key: "love", label: "Love this", icon: "❤️", activeColor: "bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300" },
    { key: "fire", label: "On fire", icon: "🔥", activeColor: "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300" },
    { key: "touched", label: "Touched", icon: "😭", activeColor: "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300" },
    { key: "blessed", label: "Blessed", icon: "✨", activeColor: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300" },
    { key: "worship", label: "Worship", icon: "🎶", activeColor: "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function genId() { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function dayOfYear() {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
}
function todayKey() { return new Date().toISOString().split("T")[0]; }
function relTime(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(iso).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ photo, name, size = "sm" }: { photo: string; name: string; size?: "sm" | "xs" }) {
    const cls = size === "xs" ? "w-5 h-5 text-[8px]" : "w-6 h-6 text-[9px]";
    return photo
        ? <img src={photo} alt={name} className={`${cls} rounded-full object-cover shrink-0 border border-indigo-400/30`} />
        : <div className={`${cls} rounded-full bg-indigo-600 shrink-0 flex items-center justify-center font-bold text-white`}>{(name || "?")[0]}</div>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VerseOfTheDay({ userId, userName, userPhoto }: Props) {
    const verse = VERSES[(dayOfYear() - 1 + VERSES.length) % VERSES.length];
    const dateKey = todayKey();

    // ── Core state ────────────────────────────────────────────────────────────
    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [notes, setNotes] = useState<VotdNote[]>([]);
    const [noteInput, setNoteInput] = useState("");
    const [showNotes, setShowNotes] = useState(false);
    const [showInsight, setShowInsight] = useState(true);
    const [savingNote, setSavingNote] = useState(false);
    const [noteSaved, setNoteSaved] = useState(false);

    // ── Comment interaction state ─────────────────────────────────────────────
    // editingId: "noteId" for comments, "noteId::replyId" for replies
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");

    const commentsEndRef = useRef<HTMLDivElement>(null);

    // ── Load on mount ─────────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`/api/verse-of-day?date=${dateKey}`)
            .then(r => r.json())
            .then(data => {
                if (data.reactions) setReactions(data.reactions);
                if (data.notes) setNotes(data.notes);
            }).catch(() => { });
    }, [dateKey]);

    // Auto-scroll when a new top-level note is added by current user
    const prevNoteCount = useRef(0);
    useEffect(() => {
        if (notes.length > prevNoteCount.current && showNotes) {
            commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
        prevNoteCount.current = notes.length;
    }, [notes.length, showNotes]);

    // ── Fire-and-forget API helper ────────────────────────────────────────────
    const api = (path: string, method: string, data: object) =>
        fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

    // ── Reactions (same proven pattern) ──────────────────────────────────────
    const toggleReaction = (key: string) => {
        if (!userId) return;
        setReactions(prev => {
            const users = prev[key] ?? [];
            return { ...prev, [key]: users.includes(userId) ? users.filter(u => u !== userId) : [...users, userId] };
        });
        api("/verse-of-day/react", "PATCH", { date: dateKey, userId, key, verseRef: verse.ref });
    };

    // ── Submit new top-level comment ──────────────────────────────────────────
    const submitNote = async () => {
        const text = noteInput.trim();
        if (!text || !userId || savingNote) return;
        const newNote: VotdNote = { id: genId(), uid: userId, name: userName, photo: userPhoto, text, createdAt: new Date().toISOString(), replies: [] };
        setNotes(prev => [...prev, newNote]);
        setNoteInput("");
        setSavingNote(true);
        try {
            await api("/verse-of-day/note", "POST", { date: dateKey, note: newNote, verseRef: verse.ref });
            setNoteSaved(true);
            setTimeout(() => setNoteSaved(false), 2000);
        } catch {
            setNotes(prev => prev.filter(n => n.id !== newNote.id));
            setNoteInput(text);
        } finally { setSavingNote(false); }
    };

    // ── Edit comment ──────────────────────────────────────────────────────────
    const startEdit = (id: string, currentText: string) => {
        setEditingId(id);
        setEditText(currentText);
        setReplyingToId(null);
    };
    const cancelEdit = () => { setEditingId(null); setEditText(""); };

    const saveEdit = (noteId: string, replyId?: string) => {
        const text = editText.trim();
        if (!text) return;
        const compositeId = replyId ? `${noteId}::${replyId}` : noteId;
        if (editingId !== compositeId) return;

        // Optimistic update
        setNotes(prev => prev.map(n => {
            if (n.id !== noteId) return n;
            if (!replyId) return { ...n, text, updatedAt: new Date().toISOString() };
            return { ...n, replies: (n.replies || []).map(r => r.id === replyId ? { ...r, text, updatedAt: new Date().toISOString() } : r) };
        }));
        setEditingId(null); setEditText("");

        if (!replyId) api("/verse-of-day/note/edit", "PATCH", { date: dateKey, noteId, userId, text });
        else api("/verse-of-day/note/reply/edit", "PATCH", { date: dateKey, noteId, replyId, userId, text });
    };

    // ── Delete comment / reply ────────────────────────────────────────────────
    const deleteNote = (noteId: string) => {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        api("/verse-of-day/note/delete", "DELETE", { date: dateKey, noteId, userId });
    };
    const deleteReply = (noteId: string, replyId: string) => {
        setNotes(prev => prev.map(n => n.id !== noteId ? n : { ...n, replies: (n.replies || []).filter(r => r.id !== replyId) }));
        api("/verse-of-day/note/reply/delete", "DELETE", { date: dateKey, noteId, replyId, userId });
    };

    // ── Add reply ─────────────────────────────────────────────────────────────
    const startReply = (noteId: string) => {
        setReplyingToId(replyingToId === noteId ? null : noteId);
        setReplyText("");
        setEditingId(null);
    };
    const submitReply = (noteId: string) => {
        const text = replyText.trim();
        if (!text || !userId) return;
        const reply: VotdReply = { id: genId(), uid: userId, name: userName, photo: userPhoto, text, createdAt: new Date().toISOString() };
        setNotes(prev => prev.map(n => n.id !== noteId ? n : { ...n, replies: [...(n.replies || []), reply] }));
        setReplyText("");
        setReplyingToId(null);
        api("/verse-of-day/note/reply", "POST", { date: dateKey, noteId, reply });
    };

    const totalNotes = notes.reduce((s, n) => s + 1 + (n.replies?.length ?? 0), 0);
    const totalReactions = Object.values(reactions).reduce((s: number, a: string[]) => s + a.length, 0);

    // ── Reusable inline edit box ──────────────────────────────────────────────
    const EditBox = ({ id, onSave, onCancel }: { id: string; onSave: () => void; onCancel: () => void }) => (
        <div className="mt-1 space-y-1">
            <textarea
                autoFocus
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(); } if (e.key === "Escape") onCancel(); }}
                rows={2}
                className="w-full bg-white/5 border border-indigo-400/30 rounded-lg px-2 py-1.5 text-xs text-white placeholder-indigo-400/40 outline-none focus:border-indigo-400/60 resize-none"
            />
            <div className="flex gap-1.5">
                <button onClick={onSave} className="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-semibold rounded-lg transition-all active:scale-95">
                    <Check size={10} /> Save
                </button>
                <button onClick={onCancel} className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] rounded-lg transition-all">
                    <X size={10} /> Cancel
                </button>
            </div>
        </div>
    );

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
                <button onClick={() => setShowInsight(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors">
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
            <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5">
                {VERSE_REACTIONS.map(({ key, label, icon, activeColor }) => {
                    const users = reactions[key] ?? [];
                    const reacted = users.includes(userId);
                    const tooltip = reacted
                        ? `Remove "${label}"${users.length > 1 ? ` · ${users.length} people` : ""}`
                        : `${label}${users.length > 0 ? ` · ${users.length} person${users.length !== 1 ? "s" : ""}` : ""}`;
                    return (
                        <button key={key} onClick={() => toggleReaction(key)} title={tooltip} aria-label={tooltip}
                            className={`group relative flex items-center gap-1 text-sm px-2.5 py-0.5 rounded-full border transition-all select-none active:scale-95 ${reacted ? `${activeColor} scale-105 shadow-sm` : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-white/20"}`}>
                            <span className="text-[15px] leading-none">{icon}</span>
                            {users.length > 0 && <span className="text-xs font-bold tabular-nums">{users.length}</span>}
                            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 shadow-lg">{label}</span>
                        </button>
                    );
                })}
                {totalReactions > 0 && <span className="text-[11px] text-indigo-400 ml-1">{totalReactions} reaction{totalReactions !== 1 ? "s" : ""}</span>}
            </div>

            {/* Comments section */}
            <div className="border-t border-indigo-500/10 px-5 pt-3 pb-4">
                {/* Section header toggle */}
                <button onClick={() => setShowNotes(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors mb-2">
                    <span>💬</span>
                    Comments{totalNotes > 0 ? ` (${totalNotes})` : ""}
                    {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showNotes && (
                    <div className="space-y-1">
                        {/* Scrollable comment list */}
                        <div className="max-h-56 overflow-y-auto space-y-2 pr-0.5" style={{ scrollbarWidth: "thin" }}>
                            {notes.length === 0 && (
                                <p className="text-[11px] text-indigo-500 italic px-1 py-2">Be the first to share a reflection ✨</p>
                            )}

                            {notes.map(note => {
                                const isOwnNote = note.uid === userId;
                                const isEditingNote = editingId === note.id;

                                return (
                                    <div key={note.id} className="group">
                                        {/* ── Comment ── */}
                                        <div className="flex items-start gap-2">
                                            <Avatar photo={note.photo} name={note.name} />
                                            <div className="flex-1 min-w-0">
                                                {/* Meta row */}
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-[11px] font-bold text-indigo-300">{note.name.split(" ")[0]}</span>
                                                    <span className="text-[10px] text-indigo-500">{relTime(note.updatedAt ?? note.createdAt)}</span>
                                                    {note.updatedAt && <span className="text-[9px] text-indigo-600 italic">(edited)</span>}

                                                    {/* Action buttons — visible on hover */}
                                                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => startReply(note.id)}
                                                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] text-indigo-400 hover:text-indigo-200 hover:bg-white/5 transition-all">
                                                            <CornerDownRight size={10} /> Reply
                                                        </button>
                                                        {isOwnNote && !isEditingNote && (
                                                            <>
                                                                <button onClick={() => startEdit(note.id, note.text)} title="Edit"
                                                                    className="p-1 rounded-md text-indigo-500 hover:text-indigo-200 hover:bg-white/5 transition-all">
                                                                    <Pencil size={10} />
                                                                </button>
                                                                <button onClick={() => deleteNote(note.id)} title="Delete"
                                                                    className="p-1 rounded-md text-indigo-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Text or edit box */}
                                                {isEditingNote
                                                    ? <EditBox id={note.id} onSave={() => saveEdit(note.id)} onCancel={cancelEdit} />
                                                    : <p className="text-xs text-gray-200 leading-relaxed">{note.text}</p>
                                                }

                                                {/* ── Replies ── */}
                                                {(note.replies ?? []).length > 0 && (
                                                    <div className="mt-2 ml-1 pl-3 border-l border-indigo-500/20 space-y-2">
                                                        {(note.replies ?? []).map(reply => {
                                                            const isOwnReply = reply.uid === userId;
                                                            const replyEditId = `${note.id}::${reply.id}`;
                                                            const isEditingReply = editingId === replyEditId;
                                                            return (
                                                                <div key={reply.id} className="group/reply flex items-start gap-1.5">
                                                                    <Avatar photo={reply.photo} name={reply.name} size="xs" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                                            <span className="text-[10px] font-bold text-indigo-300">{reply.name.split(" ")[0]}</span>
                                                                            <span className="text-[9px] text-indigo-500">{relTime(reply.updatedAt ?? reply.createdAt)}</span>
                                                                            {reply.updatedAt && <span className="text-[9px] text-indigo-600 italic">(edited)</span>}
                                                                            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/reply:opacity-100 transition-opacity">
                                                                                {isOwnReply && !isEditingReply && (
                                                                                    <>
                                                                                        <button onClick={() => startEdit(replyEditId, reply.text)} title="Edit"
                                                                                            className="p-1 rounded-md text-indigo-500 hover:text-indigo-200 hover:bg-white/5 transition-all">
                                                                                            <Pencil size={9} />
                                                                                        </button>
                                                                                        <button onClick={() => deleteReply(note.id, reply.id)} title="Delete"
                                                                                            className="p-1 rounded-md text-indigo-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                                                                                            <Trash2 size={9} />
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {isEditingReply
                                                                            ? <EditBox id={replyEditId} onSave={() => saveEdit(note.id, reply.id)} onCancel={cancelEdit} />
                                                                            : <p className="text-[11px] text-gray-300 leading-relaxed">{reply.text}</p>
                                                                        }
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* ── Reply input box ── */}
                                                {replyingToId === note.id && (
                                                    <div className="mt-2 ml-1 pl-3 border-l border-indigo-400/20">
                                                        <div className="flex items-center gap-1.5">
                                                            <Avatar photo={userPhoto} name={userName} size="xs" />
                                                            <div className="flex-1 flex items-center bg-white/5 border border-indigo-400/20 rounded-lg overflow-hidden pr-1">
                                                                <input
                                                                    autoFocus
                                                                    value={replyText}
                                                                    onChange={e => setReplyText(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === "Enter") submitReply(note.id); if (e.key === "Escape") setReplyingToId(null); }}
                                                                    placeholder={`Reply to ${note.name.split(" ")[0]}… (Enter)`}
                                                                    className="flex-1 bg-transparent px-2 py-1.5 text-[11px] text-white placeholder-indigo-400/40 outline-none"
                                                                />
                                                                {replyText.trim() && (
                                                                    <button onClick={() => submitReply(note.id)} className="p-1 rounded-md bg-indigo-500 text-white hover:bg-indigo-400 active:scale-95 transition-all">
                                                                        <Send size={10} />
                                                                    </button>
                                                                )}
                                                                <button onClick={() => setReplyingToId(null)} className="p-1 ml-0.5 rounded-md text-indigo-500 hover:text-gray-300 transition-all">
                                                                    <X size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={commentsEndRef} />
                        </div>

                        {/* New comment input */}
                        <div className="flex items-center gap-2 pt-2 border-t border-indigo-500/10">
                            <Avatar photo={userPhoto} name={userName} />
                            <div className="flex-1 flex items-center bg-white/5 border border-indigo-400/20 rounded-xl overflow-hidden pr-1">
                                <input
                                    value={noteInput}
                                    onChange={e => setNoteInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitNote()}
                                    placeholder="Share your reflection… (Enter to send)"
                                    className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-indigo-400/50 outline-none"
                                />
                                {savingNote && <Loader2 size={11} className="text-indigo-400 animate-spin mr-1.5" />}
                                {noteSaved && (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold pr-1">
                                        <CheckCircle2 size={11} /> Saved!
                                    </span>
                                )}
                                {noteInput.trim() && !savingNote && !noteSaved && (
                                    <button onClick={submitNote} className="p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 active:scale-95 transition-all">
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
