import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, PenLine, Trash2, ImagePlus, Loader2, Bug, Lightbulb, MessageSquare, Pencil, Check, CheckCircle2, ChevronDown, Link } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
export interface TeamNote {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string;
    type: "bug" | "feature" | "general";
    content: string;
    imageData?: string | null;
    videoUrl?: string | null;
    createdAt: string;
    updatedAt?: string | null;
    resolved?: boolean;
    resolvedBy?: string | null;
    reactions?: Record<string, string[]>;
}

interface NotesPanelProps {
    userId: string;
    userName: string;
    userPhoto: string;
    userRole?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const NOTE_TYPES = [
    { value: "bug", label: "Bug", icon: <Bug size={12} />, cls: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800" },
    { value: "feature", label: "Feature", icon: <Lightbulb size={12} />, cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800" },
    { value: "general", label: "General", icon: <MessageSquare size={12} />, cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" },
] as const;

const BUG_TEMPLATE = `🐞 Bug Summary:
(One sentence — what's broken?)

📍 Where did it happen?
(Which page/section of the app?)

🔁 Steps to Reproduce:
1. 
2. 
3. 

✅ What I Expected:


❌ What Actually Happened:


📱 Device & Browser:
Device: (e.g. iPhone 14, Samsung S22, Laptop)
Browser: (e.g. Chrome, Safari, Firefox)

⚡ How Urgent?
[ ] Low — minor annoyance
[ ] Medium — affects my work
[ ] High — app is unusable

📎 Screenshot:
(Paste an image below ↔ or attach a file)

🎬 Screen Recording Link (optional):
(Paste a Google Drive, Loom, or YouTube link here)`;

const EMOJI_REACTIONS = ["👍", "❤️", "👀", "😂", "🙏"];
const MAX_IMAGE_BYTES = 300 * 1024;

type StatusTab = "active" | "resolved" | "all";
type SortMode = "newest" | "oldest" | "most_reacted";

// ── Helpers ──────────────────────────────────────────────────────────────────
function typeConfig(type: string) {
    return NOTE_TYPES.find(t => t.value === type) ?? NOTE_TYPES[2];
}

function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

async function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const img = new Image();
            img.src = reader.result as string;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let { width, height } = img;
                const MAX = 1200;
                if (width > MAX || height > MAX) {
                    if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                    else { width = Math.round(width * MAX / height); height = MAX; }
                }
                canvas.width = width; canvas.height = height;
                canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
                let quality = 0.8;
                const tryCompress = () => {
                    const data = canvas.toDataURL("image/jpeg", quality);
                    if (data.length * 0.75 <= MAX_IMAGE_BYTES || quality <= 0.3) { resolve(data); return; }
                    quality -= 0.1;
                    tryCompress();
                };
                tryCompress();
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ── NoteCard ─────────────────────────────────────────────────────────────────
interface NoteCardProps {
    note: TeamNote;
    userId: string;
    userRole?: string;
    onEdit: (note: TeamNote) => void;
    onDelete: (id: string) => void;
    onReact: (id: string, emoji: string) => void;
    onResolve: (id: string, resolved: boolean) => void;
}

function NoteCard({ note, userId, userRole, onEdit, onDelete, onReact, onResolve }: NoteCardProps) {
    const [imgExpanded, setImgExpanded] = useState(false);
    const cfg = typeConfig(note.type);
    const isAuthor = note.authorId === userId;
    const isAdmin = userRole === "admin" || userRole === "leader";
    const canResolve = (isAuthor || isAdmin) && (note.type === "bug" || note.type === "feature");
    const totalReactions = Object.values(note.reactions || {}).reduce((s, arr) => s + arr.length, 0);

    return (
        <div className={`rounded-2xl border p-4 transition-all ${note.resolved ? "border-green-500/20 bg-green-500/5 dark:bg-green-900/5 opacity-80" : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50"}`}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    {note.authorPhoto ? (
                        <img src={note.authorPhoto} alt={note.authorName} className="w-8 h-8 rounded-full shrink-0 border-2 border-indigo-500/30 object-cover" />
                    ) : (
                        <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {note.authorName?.[0]?.toUpperCase()}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{note.authorName}</p>
                        <p className="text-[10px] text-gray-400">
                            {relativeTime(note.createdAt)}{note.updatedAt ? " (edited)" : ""}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {note.resolved && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                            <CheckCircle2 size={10} /> Resolved
                        </span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                    </span>
                </div>
            </div>

            {/* Content */}
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-3">{note.content}</p>

            {/* Image */}
            {note.imageData && (
                <div className="mb-3">
                    <img
                        src={note.imageData}
                        alt="attachment"
                        onClick={() => setImgExpanded(v => !v)}
                        className={`rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer transition-all object-cover w-full ${imgExpanded ? "max-h-none" : "max-h-40 object-top"}`}
                    />
                    {!imgExpanded && <p className="text-[10px] text-gray-400 mt-1 text-center">Tap image to expand</p>}
                </div>
            )}

            {/* Screen recording link */}
            {note.videoUrl && (
                <a href={note.videoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all">
                    <Link size={12} className="shrink-0" />
                    <span className="truncate">🎬 Screen Recording</span>
                    <span className="ml-auto opacity-60 shrink-0">↗</span>
                </a>
            )}

            {/* Reactions */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {EMOJI_REACTIONS.map(emoji => {
                    const users = note.reactions?.[emoji] || [];
                    const reacted = users.includes(userId);
                    return (
                        <button
                            key={emoji}
                            onClick={() => onReact(note.id, emoji)}
                            title={reacted ? "Remove reaction" : "React"}
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all select-none ${reacted
                                ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 scale-105"
                                : "bg-gray-100 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                                }`}
                        >
                            <span>{emoji}</span>
                            {users.length > 0 && <span className="font-medium">{users.length}</span>}
                        </button>
                    );
                })}

                {/* Action buttons */}
                <div className="ml-auto flex items-center gap-1">
                    {canResolve && (
                        <button
                            onClick={() => onResolve(note.id, !note.resolved)}
                            title={note.resolved ? "Reopen" : "Mark resolved"}
                            className={`p-1.5 rounded-lg text-xs transition-all ${note.resolved ? "text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20" : "text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"}`}
                        >
                            <CheckCircle2 size={14} />
                        </button>
                    )}
                    {isAuthor && !note.resolved && (
                        <button onClick={() => onEdit(note)} title="Edit" className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all">
                            <Pencil size={13} />
                        </button>
                    )}
                    {isAuthor && (
                        <button onClick={() => onDelete(note.id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NotesPanel({ userId, userName, userPhoto, userRole }: NotesPanelProps) {
    const [open, setOpen] = useState(false);
    const [notes, setNotes] = useState<TeamNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<TeamNote | null>(null);
    const [saving, setSaving] = useState(false);

    // Undo-delete queue
    const [undoNote, setUndoNote] = useState<{ note: TeamNote; timer: ReturnType<typeof setTimeout> } | null>(null);
    const [undoProgress, setUndoProgress] = useState(100);
    const undoProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Form state
    const [fType, setFType] = useState<"bug" | "feature" | "general">("general");
    const [fContent, setFContent] = useState("");
    const [fImage, setFImage] = useState<string | null>(null);
    const [fVideoUrl, setFVideoUrl] = useState("");
    const [imageUploading, setImageUploading] = useState(false);

    // Filter/sort state
    const [statusTab, setStatusTab] = useState<StatusTab>("active");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [sort, setSort] = useState<SortMode>("newest");
    const [showSort, setShowSort] = useState(false);

    const fileRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const fetchNotes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/notes");
            setNotes(await res.json());
        } catch { setNotes([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { if (open) fetchNotes(); }, [open, fetchNotes]);

    // Clipboard paste for images
    useEffect(() => {
        if (!showForm) return;
        const handler = async (e: ClipboardEvent) => {
            const items = Array.from(e.clipboardData?.items || []) as DataTransferItem[];
            const imgItem = items.find(i => i.type.startsWith("image/"));
            if (!imgItem) return;
            const file = imgItem.getAsFile();
            if (!file) return;
            setImageUploading(true);
            try { setFImage(await compressImage(file)); } finally { setImageUploading(false); }
        };
        window.addEventListener("paste", handler);
        return () => window.removeEventListener("paste", handler);
    }, [showForm]);

    // Auto-fill bug template when Bug type selected (only if content is blank or was the old template)
    useEffect(() => {
        if (!showForm) return;
        if (fType === "bug" && (!fContent || fContent === BUG_TEMPLATE)) {
            setFContent(BUG_TEMPLATE);
        } else if (fType !== "bug" && fContent === BUG_TEMPLATE) {
            setFContent(""); // clear template when switching away
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fType, showForm]);

    const openForm = (note?: TeamNote) => {
        if (note) {
            setEditing(note); setFType(note.type); setFContent(note.content);
            setFImage(note.imageData ?? null); setFVideoUrl(note.videoUrl ?? "");
        } else {
            setEditing(null); setFType("general"); setFContent(""); setFImage(null); setFVideoUrl("");
        }
        setShowForm(true);
        textRef.current?.focus();
    };

    const closeForm = () => { setShowForm(false); setEditing(null); setFContent(""); setFImage(null); setFVideoUrl(""); };

    const handleImageFile = async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        setImageUploading(true);
        try { setFImage(await compressImage(file)); } finally { setImageUploading(false); }
    };

    // ── Optimistic submit (create / edit) ──────────────────────────────────────
    const submit = async () => {
        if (!fContent.trim()) return;
        const tempId = `temp_${Date.now()}`;

        if (editing) {
            const updated: TeamNote = { ...editing, type: fType, content: fContent, imageData: fImage, videoUrl: fVideoUrl || null, updatedAt: new Date().toISOString() };
            setNotes(prev => prev.map(n => n.id === editing.id ? updated : n));
            closeForm();
            fetch(`/api/notes/${editing.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ authorId: userId, content: fContent, type: fType, imageData: fImage, videoUrl: fVideoUrl || null }),
            }).catch(() => fetchNotes());
        } else {
            const tempNote: TeamNote = {
                id: tempId, authorId: userId, authorName: userName, authorPhoto: userPhoto,
                type: fType, content: fContent, imageData: fImage, videoUrl: fVideoUrl || null,
                createdAt: new Date().toISOString(), reactions: {}, resolved: false,
            };
            setNotes(prev => [tempNote, ...prev]);
            closeForm();
            fetch("/api/notes", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ authorId: userId, authorName: userName, authorPhoto: userPhoto, type: fType, content: fContent, imageData: fImage, videoUrl: fVideoUrl || null }),
            }).then(r => r.json()).then(({ id }) => {
                if (id) setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id } : n));
            }).catch(() => {
                setNotes(prev => prev.filter(n => n.id !== tempId));
            });
        }
        setSaving(false);
    };

    // ── Optimistic delete with undo ─────────────────────────────────────────────
    const deleteNote = (id: string) => {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        // Remove immediately
        setNotes(prev => prev.filter(n => n.id !== id));

        // Clear any existing undo
        if (undoNote) { clearTimeout(undoNote.timer); clearInterval(undoProgressRef.current!); }

        // Start progress bar
        setUndoProgress(100);
        if (undoProgressRef.current) clearInterval(undoProgressRef.current);
        undoProgressRef.current = setInterval(() => {
            setUndoProgress(p => { if (p <= 2) { clearInterval(undoProgressRef.current!); return 0; } return p - 2.5; });
        }, 100);

        // Set undo window (4s)
        const timer = setTimeout(() => {
            setUndoNote(null);
            clearInterval(undoProgressRef.current!);
            // Commit delete to server
            fetch(`/api/notes/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId: userId }) });
        }, 4000);

        setUndoNote({ note, timer });
    };

    const handleUndo = () => {
        if (!undoNote) return;
        clearTimeout(undoNote.timer);
        clearInterval(undoProgressRef.current!);
        setNotes(prev => [undoNote.note, ...prev]);
        setUndoNote(null);
        setUndoProgress(100);
    };

    // ── Optimistic react ────────────────────────────────────────────────────────
    const reactToNote = (id: string, emoji: string) => {
        // Update instantly
        setNotes(prev => prev.map(n => {
            if (n.id !== id) return n;
            const reactions = { ...(n.reactions || {}) };
            const users: string[] = reactions[emoji] || [];
            reactions[emoji] = users.includes(userId) ? users.filter(u => u !== userId) : [...users, userId];
            return { ...n, reactions };
        }));
        // Sync in background
        fetch(`/api/notes/${id}/react`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, emoji }),
        });
    };

    // ── Optimistic resolve (already was optimistic, keeping) ────────────────────
    const resolveNote = (id: string, resolved: boolean) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, resolved } : n));
        fetch(`/api/notes/${id}/resolve`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, resolved }),
        });
    };

    // Filter + sort
    const filtered = notes
        .filter(n => statusTab === "active" ? !n.resolved : statusTab === "resolved" ? !!n.resolved : true)
        .filter(n => typeFilter === "all" ? true : n.type === typeFilter)
        .sort((a, b) => {
            if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (sort === "most_reacted") return Object.values(b.reactions || {}).reduce((s: number, a: string[]) => s + a.length, 0) - Object.values(a.reactions || {}).reduce((s: number, arr: string[]) => s + arr.length, 0);
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
        });

    const activeCount = notes.filter(n => !n.resolved).length;
    const hasNewNotes = activeCount > 0;

    const SORT_LABELS: Record<SortMode, string> = { newest: "Newest", oldest: "Oldest", most_reacted: "Most Reacted" };

    return (
        <div ref={panelRef} className="relative">
            {/* Trigger */}
            <button
                onClick={() => setOpen(v => !v)}
                title="Team Notes"
                className={`relative p-2 rounded-xl transition-all active:scale-90 ${open ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
            >
                <PenLine size={18} />
                {hasNewNotes && !open && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-500" />
                )}
            </button>

            {/* Undo-delete toast */}
            {undoNote && (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-0 w-[min(340px,calc(100vw-20px))] rounded-2xl overflow-hidden shadow-2xl border border-gray-700/60 bg-gray-900 text-white"
                    style={{ animation: "slideUpFade 0.2s ease-out" }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                        <Trash2 size={14} className="text-red-400 shrink-0" />
                        <span className="text-sm flex-1">Note deleted</span>
                        <button onClick={handleUndo} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 active:scale-95 transition-all px-2 py-1 rounded-lg hover:bg-white/10">
                            Undo
                        </button>
                    </div>
                    {/* Progress bar */}
                    <div className="h-0.5 bg-gray-700 w-full">
                        <div className="h-full bg-indigo-500 transition-none" style={{ width: `${undoProgress}%` }} />
                    </div>
                </div>
            )}

            {/* Panel — centered, responsive */}
            {open && (
                <div
                    className="fixed top-[72px] left-1/2 -translate-x-1/2 sm:absolute sm:top-full sm:mt-2 sm:left-auto sm:translate-x-0 sm:right-0 z-[200] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                    style={{
                        width: "min(520px, calc(100vw - 20px))",
                        maxHeight: "min(600px, calc(100dvh - 90px))",
                    }}
                >
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 shrink-0">
                        <div className="flex items-center gap-2">
                            <PenLine size={15} className="text-indigo-500" />
                            <span className="text-sm font-bold text-gray-900 dark:text-white">Team Notes</span>
                            {activeCount > 0 && (
                                <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">{activeCount}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!showForm && (
                                <button onClick={() => openForm()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all">
                                    <Pencil size={11} /> New Note
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* ── Form ── */}
                    {showForm && (
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 shrink-0 space-y-3">
                            {/* Type selector */}
                            <div className="flex gap-2">
                                {NOTE_TYPES.map(t => (
                                    <button key={t.value} onClick={() => setFType(t.value as any)}
                                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-semibold border transition-all ${fType === t.value ? t.cls : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                                        {t.icon} {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* Text */}
                            <textarea
                                ref={textRef}
                                value={fContent}
                                onChange={e => setFContent(e.target.value)}
                                placeholder="Describe the bug, feature idea, or general note… (paste images here)"
                                rows={4}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />

                            {/* Image preview */}
                            {imageUploading && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Compressing image…</div>}
                            {fImage && (
                                <div className="relative inline-block">
                                    <img src={fImage} alt="preview" className="max-h-28 rounded-xl border border-gray-200 dark:border-gray-700 object-cover" />
                                    <button onClick={() => setFImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow">
                                        <X size={10} />
                                    </button>
                                </div>
                            )}

                            {/* Screen recording URL (shown for Bug type) */}
                            {fType === "bug" && (
                                <div className="flex items-center gap-2">
                                    <Link size={13} className="text-gray-400 shrink-0" />
                                    <input
                                        type="url"
                                        value={fVideoUrl}
                                        onChange={e => setFVideoUrl(e.target.value)}
                                        placeholder="Screen recording link (Google Drive, Loom, YouTube…)"
                                        className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
                                <button onClick={() => fileRef.current?.click()} className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl border border-gray-200 dark:border-gray-700 transition-all" title="Attach image">
                                    <ImagePlus size={15} />
                                </button>
                                <div className="flex-1" />
                                <button onClick={closeForm} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl transition-all">Cancel</button>
                                <button onClick={submit} disabled={saving || !fContent.trim()} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
                                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    {editing ? "Save" : "Post"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Status Tabs + Filters + Notes list — hidden while form is open ── */}
                    {!showForm && <div className="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/30 shrink-0 space-y-2">
                        {/* Status tabs */}
                        <div className="flex items-center gap-1">
                            {(["active", "resolved", "all"] as StatusTab[]).map(tab => (
                                <button key={tab} onClick={() => setStatusTab(tab)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${statusTab === tab ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                                    {tab === "active" ? `Active${activeCount > 0 ? ` (${activeCount})` : ""}` : tab === "resolved" ? `Resolved (${notes.filter(n => n.resolved).length})` : "All"}
                                </button>
                            ))}
                            {/* Sort */}
                            <div className="relative ml-auto">
                                <button onClick={() => setShowSort(v => !v)} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                                    {SORT_LABELS[sort]} <ChevronDown size={11} />
                                </button>
                                {showSort && (
                                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 overflow-hidden min-w-[130px]">
                                        {(Object.keys(SORT_LABELS) as SortMode[]).map(s => (
                                            <button key={s} onClick={() => { setSort(s); setShowSort(false); }}
                                                className={`w-full text-left px-3 py-2 text-xs transition-all ${sort === s ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                                                {SORT_LABELS[s]}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Type filter */}
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                            {["all", "bug", "feature", "general"].map(f => (
                                <button key={f} onClick={() => setTypeFilter(f)}
                                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all ${typeFilter === f ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900" : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                                    {f === "all" ? `All (${notes.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>}

                    {/* ── Notes list — also hidden while form open ── */}
                    {!showForm && <div className="overflow-y-auto flex-1 p-3 space-y-3">
                        {loading ? (
                            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-400" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-10 space-y-2">
                                <p className="text-3xl">📝</p>
                                <p className="text-sm text-gray-400">{statusTab === "resolved" ? "No resolved notes yet" : "No notes yet"}</p>
                                {statusTab === "active" && <button onClick={() => openForm()} className="mt-1 text-xs text-indigo-500 hover:underline">Add the first note</button>}
                            </div>
                        ) : (
                            filtered.map(note => (
                                <NoteCard
                                    key={note.id}
                                    note={note}
                                    userId={userId}
                                    userRole={userRole}
                                    onEdit={openForm}
                                    onDelete={deleteNote}
                                    onReact={reactToNote}
                                    onResolve={resolveNote}
                                />
                            ))
                        )}
                    </div>}
                </div>
            )}
        </div>
    );
}
