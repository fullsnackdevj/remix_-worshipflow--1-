import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, NotepadText, Trash2, ImagePlus, Loader2, Bug, Lightbulb, MessageSquare, Pencil, Check, CheckCircle2, ChevronDown, Film, RotateCcw, Archive, Eye, Search, Code2, Wrench, XCircle, ThumbsUp, Maximize2, Play } from "lucide-react";
import AutoTextarea from "./AutoTextarea";
import { useRealtimeNotes } from "./useRealtimeNotes";

// ── Types ────────────────────────────────────────────────────────────────────
export interface TeamNote {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string;
    type: "bug" | "feature" | "general";
    content: string;
    imageData?: string | null;
    videoData?: string | null;
    createdAt: string;
    updatedAt?: string | null;
    deletedAt?: string | null;
    resolved?: boolean;
    resolvedBy?: string | null;
    reactions?: Record<string, string[]>;
}

interface NotesPanelProps {
    userId: string;
    userName: string;
    userPhoto: string;
    userRole?: string;
    onToast?: (type: "success" | "error" | "info" | "warning", message: string) => void;
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
(Paste an image below or attach a file)

🎬 Screen Recording:
(Use the video upload button below ↓)`;

const STATUS_REACTIONS = [
    { key: "seen", label: "Seen", icon: <Eye size={13} />, activeColor: "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300" },
    { key: "investigating", label: "Investigating", icon: <Search size={13} />, activeColor: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300" },
    { key: "coding", label: "Coding", icon: <Code2 size={13} />, activeColor: "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300" },
    { key: "fixing", label: "Fixing", icon: <Wrench size={13} />, activeColor: "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300" },
    { key: "on_it", label: "On it", icon: <ThumbsUp size={13} />, activeColor: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300" },
    { key: "nevermind", label: "Dismiss", icon: <XCircle size={13} />, activeColor: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300" },
] as const;
const MAX_IMAGE_BYTES = 300 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024; // 5MB

type StatusTab = "active" | "resolved" | "dismissed" | "all";
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
    highlighted?: boolean;
    onEdit: (note: TeamNote) => void;
    onDelete: (id: string) => void;
    onReact: (id: string, emoji: string, updatedReactions: Record<string, string[]>) => void;
    onResolve: (id: string, resolved: boolean) => void;
    onRetype: (id: string, newType: string) => void;
    onFollowUp: (id: string) => void;
}

function NoteCard({ note, userId, userRole, highlighted, onEdit, onDelete, onReact, onResolve, onRetype, onFollowUp }: NoteCardProps) {
    // Media lightbox state — null = closed, otherwise holds type + src
    const [lightbox, setLightbox] = useState<{ type: "image" | "video"; src: string } | null>(null);
    // ── Reactions: own local state (same pattern as VerseOfTheDay) so onSnapshot can never overwrite a mid-click reaction ──
    const [reactions, setReactions] = useState<Record<string, string[]>>(note.reactions ?? {});
    // Sync from parent ONLY when the note id changes (different note) — not on every re-render
    const prevIdRef = React.useRef(note.id);
    useEffect(() => {
        if (note.id !== prevIdRef.current) {
            prevIdRef.current = note.id;
            setReactions(note.reactions ?? {});
        }
    }, [note.id, note.reactions]);

    // Close lightbox on Escape
    useEffect(() => {
        if (!lightbox) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [lightbox]);

    const toggleReaction = (emoji: string) => {
        const updated = { ...reactions };
        const users: string[] = updated[emoji] ?? [];
        updated[emoji] = users.includes(userId)
            ? users.filter(u => u !== userId)
            : [...users, userId];
        setReactions(updated);
        onReact(note.id, emoji, updated);
    };

    const cfg = typeConfig(note.type);
    const isAuthor = note.authorId === userId;
    const isAdmin = userRole === "admin" || userRole === "leader";
    /** Admin, Leader, or QA Specialist — can edit/delete any note */
    const isPrivileged = isAdmin || userRole === "qa_specialist";
    const canResolve = (isAuthor || isPrivileged); // all types can be resolved/done/acknowledged
    const totalReactions = (Object.values(reactions) as string[][]).reduce((s, arr) => s + arr.length, 0);

    // Type-specific resolve button config
    const resolveConfig = note.type === "bug"
        ? { buttonLabel: note.resolved ? "Reopen" : "Resolve",       doneLabel: "Fixed",   doneColor: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800" }
        : note.type === "feature"
        ? { buttonLabel: note.resolved ? "Reopen" : "Mark as Done",  doneLabel: "Done",    doneColor: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" }
        : { buttonLabel: note.resolved ? "Un-acknowledge" : "Acknowledge", doneLabel: "Noted", doneColor: "bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800" };

    return (
        <>
        <div
            id={`note-card-${note.id}`}
            className={`rounded-2xl border p-4 transition-all ${highlighted ? "ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/20" : ""} ${note.resolved ? "border-green-500/20 bg-green-500/5 dark:bg-green-900/5 opacity-80" : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50"}`}
        >
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
                            {relativeTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " (edited)" : ""}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {note.resolved && (
                        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${resolveConfig.doneColor}`}>
                            <CheckCircle2 size={10} /> {resolveConfig.doneLabel}
                        </span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                    </span>
                </div>
            </div>

            {/* Content */}
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-3">{note.content}</p>

            {/* Image — click to open lightbox */}
            {note.imageData && (
                <div className="mb-3">
                    <div
                        className="relative group cursor-pointer rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
                        onClick={() => setLightbox({ type: "image", src: note.imageData! })}
                    >
                        <img
                            src={note.imageData}
                            alt="attachment"
                            className="w-full max-h-48 object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-2">
                                <Maximize2 size={18} className="text-white" />
                            </div>
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 text-center">Tap to view full size</p>
                </div>
            )}

            {/* Screen recording video — thumbnail + play overlay → opens lightbox */}
            {note.videoData && (
                <div className="mb-3">
                    <div
                        className="relative group cursor-pointer rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black"
                        onClick={() => setLightbox({ type: "video", src: note.videoData! })}
                    >
                        {/* Video element used as thumbnail (no controls, muted, first-frame) */}
                        <video
                            src={note.videoData}
                            className="w-full max-h-48 object-contain"
                            muted
                            playsInline
                            preload="metadata"
                        />
                        {/* Play button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-all">
                            <div className="w-14 h-14 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                                <Play size={22} className="text-indigo-600 ml-1" fill="currentColor" />
                            </div>
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 text-center">🎬 Tap to play screen recording</p>
                </div>
            )}

            {/* Status Reactions */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {STATUS_REACTIONS.map(({ key, label, icon, activeColor }) => {
                    const users = reactions[key] || [];
                    const reacted = users.includes(userId);
                    const tooltip = reacted
                        ? `Remove "${label}" reaction${users.length > 1 ? ` · ${users.length} people` : ""}`
                        : `${label}${users.length > 0 ? ` · ${users.length} person${users.length !== 1 ? "s" : ""}` : ""}`;
                    return (
                        <button
                            key={key}
                            onClick={() => toggleReaction(key)}
                            title={tooltip}
                            aria-label={tooltip}
                            className={`group relative flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all select-none active:scale-95 ${reacted
                                ? `${activeColor} scale-105 shadow-sm`
                                : "bg-gray-100 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                }`}
                        >
                            {icon}
                            {users.length > 0 && <span className="font-semibold tabular-nums">{users.length}</span>}
                            {/* Tooltip */}
                            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 shadow-lg">
                                {label}
                            </span>
                        </button>
                    );
                })}

                {/* Action buttons */}
                <div className="ml-auto flex items-center gap-1">
                    {/* Admin-only: reclassify note type */}
                    {isAdmin && (
                        <div className="flex items-center gap-0.5 mr-1 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            {NOTE_TYPES.map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => note.type !== t.value && onRetype(note.id, t.value)}
                                    title={note.type === t.value ? `Type: ${t.label}` : `Move to ${t.label}`}
                                    className={`flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold transition-all ${
                                        note.type === t.value
                                            ? `${t.cls} cursor-default`
                                            : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    }`}
                                >
                                    {t.icon}
                                </button>
                            ))}
                        </div>
                    )}
                    {canResolve && (
                        <button
                            onClick={() => onResolve(note.id, !note.resolved)}
                            title={resolveConfig.buttonLabel}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                                note.resolved
                                    ? "text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    : "text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                            }`}
                        >
                            <CheckCircle2 size={13} />
                            <span className="text-[10px]">{resolveConfig.buttonLabel}</span>
                        </button>
                    )}
                    {/* Follow Up — only for note author who is not privileged, and only when not resolved */}
                    {isAuthor && !isPrivileged && !note.resolved && (
                        <button
                            onClick={() => onFollowUp(note.id)}
                            title="Notify admin you're following up"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                        >
                            <MessageSquare size={12} />
                            <span className="text-[10px]">Follow Up</span>
                        </button>
                    )}
                    {/* Edit — own note (any role) OR any note (privileged only) */}
                    {(isAuthor || isPrivileged) && !note.resolved && (
                        <button onClick={() => onEdit(note)} title="Edit" className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all">
                            <Pencil size={13} />
                        </button>
                    )}
                    {/* Delete — own note (any role) OR any note (privileged only) */}
                    {(isAuthor || isPrivileged) && (
                        <button onClick={() => onDelete(note.id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            </div>
        </div>

        {/* ── Media Lightbox ── */}
        {lightbox && (
            <div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                onClick={() => setLightbox(null)}
            >
                {/* Close button */}
                <button
                    onClick={() => setLightbox(null)}
                    className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                >
                    <X size={20} />
                </button>

                {lightbox.type === "image" ? (
                    <img
                        src={lightbox.src}
                        alt="Full size attachment"
                        className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <div
                        className="w-full max-w-3xl mx-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <video
                            src={lightbox.src}
                            controls
                            autoPlay
                            className="w-full max-h-[80vh] rounded-xl shadow-2xl bg-black object-contain"
                        />
                        <p className="text-center text-white/50 text-xs mt-2">🎬 Screen recording</p>
                    </div>
                )}
            </div>
        )}
        </>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NotesPanel({ userId, userName, userPhoto, userRole, onToast }: NotesPanelProps) {
    const [open, setOpen] = useState(false);
    // ── Notes via Firestore onSnapshot real-time listener ────────────────────────────
    const { notes, setNotes, loading, deletedIdsRef, addTempNote, removeTempNote } = useRealtimeNotes(userId);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<TeamNote | null>(null);
    const [saving, setSaving] = useState(false);

    // Trash state
    const [showTrash, setShowTrash] = useState(false);
    const [trashNotes, setTrashNotes] = useState<TeamNote[]>([]);
    const [trashSelected, setTrashSelected] = useState<Set<string>>(new Set());
    const [trashLoading, setTrashLoading] = useState(false);
    // ── Bug #4 fix: track trash count separately so badge shows without opening trash ──
    const [trashCount, setTrashCount] = useState(0);



    // Form state
    const [fType, setFType] = useState<"bug" | "feature" | "general">("general");
    const [fContent, setFContent] = useState("");
    const [fImage, setFImage] = useState<string | null>(null);
    const [fVideoData, setFVideoData] = useState<string | null>(null);
    const [imageUploading, setImageUploading] = useState(false);
    const [videoUploading, setVideoUploading] = useState(false);
    const [videoError, setVideoError] = useState("");

    // Filter/sort state
    const [statusTab, setStatusTab] = useState<StatusTab>("active");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [sort, setSort] = useState<SortMode>("newest");
    const [showSort, setShowSort] = useState(false);
    // highlighted note id (from bell notification deep-link)
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);
    // ── Bug #5 fix: ref for sort dropdown outside-click dismissal ──
    const sortRef = useRef<HTMLDivElement>(null);
    // Tracks IDs removed optimistically — deletedIdsRef comes from the hook


    // Toggle open/close
    const handleToggle = () => {
        setOpen(v => {
            const next = !v;
            if (!next) { closeForm(); }
            return next;
        });
    };
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            // ── Bug #5 fix: close sort dropdown on outside click ──
            if (showSort && sortRef.current && !sortRef.current.contains(e.target as Node)) {
                setShowSort(false);
            }
            // ── Bug #6 fix: don't auto-close panel if user has unsaved note content ──
            if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) {
                const hasDirtyForm = showForm && (fContent.trim().length > 0 || !!fImage || !!fVideoData);
                if (!hasDirtyForm) { setOpen(false); closeForm(); }
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open, showSort, showForm, fContent, fImage, fVideoData]);

    // (fetchNotes is kept for trash-restore refresh — notes list itself is real-time)
    const fetchNotes = useCallback(async (silent = false) => {
        if (!silent) { /* loading handled by hook */ }
        try {
            const res = await fetch("/api/notes");
            const data = await res.json();
            if (Array.isArray(data))
                setNotes(prev => data.filter((n: TeamNote) => !deletedIdsRef.current.has(n.id))
                    .map(n => ({ ...n, reactions: prev.find(p => p.id === n.id)?.reactions ?? n.reactions })));
        } catch { /* keep existing notes on error */ }
    }, [setNotes]);

    // ── Bug #4 fix: lightweight trash count fetch (no full note data needed) ──
    const fetchTrashCount = useCallback(async () => {
        try {
            const res = await fetch("/api/notes/trash");
            const data = await res.json();
            if (Array.isArray(data)) setTrashCount(data.length);
        } catch { /* noop */ }
    }, []);

    // Fetch trash count on mount so badge shows immediately
    useEffect(() => { fetchTrashCount(); }, [fetchTrashCount]);

    // No fetch-on-open needed — Firestore onSnapshot keeps notes live
    // No 60s poll needed — onSnapshot fires on every change

    const fetchTrash = useCallback(async () => {
        setTrashLoading(true);
        try {
            const res = await fetch("/api/notes/trash");
            const data = await res.json();
            if (Array.isArray(data)) setTrashNotes(data);
        } catch { setTrashNotes([]); }
        finally { setTrashLoading(false); }
    }, []);

    const openTrash = () => { setShowTrash(true); setTrashSelected(new Set()); fetchTrash(); };
    const closeTrash = () => { setShowTrash(false); setTrashSelected(new Set()); fetchTrashCount(); };

    const toggleTrashSelect = (id: string) => setTrashSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => setTrashSelected(
        trashSelected.size === trashNotes.length ? new Set() : new Set(trashNotes.map(n => n.id))
    );

    const restoreNote = async (id: string) => {
        deletedIdsRef.current.delete(id);
        setTrashNotes(prev => prev.filter(n => n.id !== id));
        setTrashCount(prev => Math.max(0, prev - 1));
        try {
            const res = await fetch(`/api/notes/trash/restore/${id}`, { method: "POST" });
            if (!res.ok) throw new Error();
            fetchNotes(true);
            onToast?.("success", "Note restored successfully.");
        } catch {
            onToast?.("error", "Failed to restore note. Try again.");
            fetchTrash();
            setTrashCount(prev => prev + 1);
        }
    };

    const permanentlyDelete = async (id: string) => {
        setTrashNotes(prev => prev.filter(n => n.id !== id));
        setTrashCount(prev => Math.max(0, prev - 1));
        try {
            const res = await fetch(`/api/notes/trash/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
        } catch {
            onToast?.("error", "Failed to delete note permanently.");
            fetchTrash();
            setTrashCount(prev => prev + 1);
        }
    };

    const permanentlyDeleteSelected = async () => {
        const ids = Array.from(trashSelected);
        setTrashNotes(prev => prev.filter(n => !trashSelected.has(n.id)));
        setTrashCount(prev => Math.max(0, prev - ids.length));
        setTrashSelected(new Set());
        try {
            const res = await fetch("/api/notes/trash", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
            if (!res.ok) throw new Error();
            onToast?.("success", `${ids.length} note${ids.length !== 1 ? "s" : ""} permanently deleted.`);
        } catch {
            onToast?.("error", "Failed to delete selected notes.");
            fetchTrash();
            fetchTrashCount();
        }
    };

    const emptyTrash = async () => {
        const ids = trashNotes.map(n => n.id);
        setTrashNotes([]);
        setTrashCount(0);
        setTrashSelected(new Set());
        try {
            const res = await fetch("/api/notes/trash", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
            if (!res.ok) throw new Error();
            onToast?.("success", "Trash emptied.");
        } catch {
            onToast?.("error", "Failed to empty trash.");
            fetchTrash();
            fetchTrashCount();
        }
    };

    // Helper: days remaining before auto-deletion
    const daysRemaining = (deletedAt: string) => {
        const diff = 15 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000);
        return Math.max(0, diff);
    };


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
            setFImage(note.imageData ?? null); setFVideoData(note.videoData ?? null);
        } else {
            setEditing(null); setFType("general"); setFContent(""); setFImage(null); setFVideoData(null);
        }
        setVideoError("");
        setShowForm(true);
        textRef.current?.focus();
    };

    const closeForm = () => { setShowForm(false); setEditing(null); setFContent(""); setFImage(null); setFVideoData(null); setVideoError(""); };

    const handleImageFile = async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        setImageUploading(true);
        try { setFImage(await compressImage(file)); } finally { setImageUploading(false); }
    };

    const handleVideoFile = (file: File) => {
        if (!file.type.startsWith("video/")) return;
        setVideoError("");
        if (file.size > MAX_VIDEO_BYTES) {
            setVideoError(`Video too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
            return;
        }
        setVideoUploading(true);
        const reader = new FileReader();
        reader.onload = e => { setFVideoData(e.target?.result as string); setVideoUploading(false); };
        reader.onerror = () => { setVideoError("Failed to read video."); setVideoUploading(false); };
        reader.readAsDataURL(file);
    };

    // ── Optimistic submit (create / edit) ──────────────────────────────────────
    const submit = async () => {
        if (!fContent.trim()) return;
        const tempId = `temp_${Date.now()}`;

        if (editing) {
            const updated: TeamNote = { ...editing, type: fType, content: fContent, imageData: fImage, videoData: fVideoData, updatedAt: new Date().toISOString() };
            setNotes(prev => prev.map(n => n.id === editing.id ? updated : n));
            closeForm();
            fetch(`/api/notes/${editing.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ authorId: userId, userRole, content: fContent, type: fType, imageData: fImage, videoData: fVideoData }),
            }).then(res => {
                if (!res.ok) throw new Error();
                onToast?.("success", "Note updated.");
            }).catch(() => {
                onToast?.("error", "Failed to update note.");
                fetchNotes();
            });
        } else {
            const tempNote: TeamNote = {
                id: tempId, authorId: userId, authorName: userName, authorPhoto: userPhoto,
                type: fType, content: fContent, imageData: fImage, videoData: fVideoData,
                createdAt: new Date().toISOString(), reactions: {}, resolved: false,
            };
            addTempNote(tempNote);
            closeForm();
            fetch("/api/notes", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ authorId: userId, authorName: userName, authorPhoto: userPhoto, type: fType, content: fContent, imageData: fImage, videoData: fVideoData }),
            }).then(r => r.json()).then(({ id }) => {
                // Remove temp — onSnapshot will arrive with the real document
                if (id) removeTempNote(tempId);
            }).catch(() => {
                removeTempNote(tempId);
                onToast?.("error", "Failed to save note. Try again.");
            });
        }
        setSaving(false);
    };

    const deleteNote = (id: string) => {
        const note = notes.find(n => n.id === id);
        if (!note) return;
        deletedIdsRef.current.add(id);
        setNotes(prev => prev.filter(n => n.id !== id));
        // ── Bug #4 fix: bump trash badge immediately ──
        setTrashCount(prev => prev + 1);
        fetch(`/api/notes/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authorId: userId, userRole }),
        }).then(res => {
            if (!res.ok) throw new Error();
            // ── Bug #2 fix: clean up deletedIdsRef once server confirms ──
            deletedIdsRef.current.delete(id);
        }).catch(() => {
            // Restore note to list if delete failed
            setNotes(prev => [note, ...prev]);
            deletedIdsRef.current.delete(id);
            setTrashCount(prev => Math.max(0, prev - 1));
            onToast?.("error", "Failed to delete note. Try again.");
        });
    };

    // ── Optimistic react — NoteCard owns its local reactions state now; we sync back here so filtering/counts stay correct ──
    const reactToNote = (id: string, emoji: string, updatedReactions: Record<string, string[]>) => {
        // Sync the parent notes array so counts in tabs (e.g. dismissed) stay accurate
        setNotes(prev => prev.map(n => n.id === id ? { ...n, reactions: updatedReactions } : n));
        fetch(`/api/notes/${id}/react`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, emoji }),
        });
    };

    // ── Optimistic resolve — onSnapshot confirms instantly ───────────────────
    const resolveNote = (id: string, resolved: boolean) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, resolved, resolvedBy: resolved ? userId : null } : n));
        fetch(`/api/notes/${id}/resolve`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, resolved, resolverName: userName, resolverPhoto: userPhoto }),
        }).then(r => {
            if (!r.ok) {
                setNotes(prev => prev.map(n => n.id === id ? { ...n, resolved: !resolved } : n));
                onToast?.("error", "Failed to update resolve status.");
            }
        }).catch(() => {
            setNotes(prev => prev.map(n => n.id === id ? { ...n, resolved: !resolved } : n));
            onToast?.("error", "Failed to update resolve status.");
        });
    };

    // ── Admin: reclassify note type — onSnapshot confirms instantly ──────────
    const retypeNote = (id: string, newType: string) => {
        const prev_type = notes.find(n => n.id === id)?.type;
        setNotes(prev => prev.map(n => n.id === id ? { ...n, type: newType as TeamNote["type"] } : n));
        fetch(`/api/notes/${id}/retype`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, userRole, newType }),
        }).then(r => {
            if (!r.ok) {
                setNotes(prev => prev.map(n => n.id === id ? { ...n, type: (prev_type ?? newType) as TeamNote["type"] } : n));
                onToast?.("error", "Failed to reclassify note.");
            }
        }).catch(() => {
            setNotes(prev => prev.map(n => n.id === id ? { ...n, type: (prev_type ?? newType) as TeamNote["type"] } : n));
            onToast?.("error", "Failed to reclassify note.");
        });
    };

    // Filter + sort
    const filtered = notes
        .filter(n => {
            const isDismissed = (n.reactions?.nevermind?.length ?? 0) > 0;
            if (statusTab === "dismissed") return isDismissed;
            if (statusTab === "active")    return !n.resolved && !isDismissed;
            if (statusTab === "resolved")  return !!n.resolved;
            return true; // "all"
        })
        .filter(n => typeFilter === "all" ? true : n.type === typeFilter)
        .sort((a, b) => {
            if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (sort === "most_reacted") {
                const getSum = (note: typeof a) => (Object.values(note.reactions ?? {}) as string[][]).reduce((s, arr) => s + arr.length, 0);
                return getSum(b) - getSum(a);
            }

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest
        });

    const isDismissedFn = (n: TeamNote) => (n.reactions?.nevermind?.length ?? 0) > 0;
    const activeCount = notes.filter(n => !n.resolved && !isDismissedFn(n)).length;
    const dismissedCount = notes.filter(isDismissedFn).length;

    // ── Unread tracking (same as notification bell) ─────────────────────────────────────────
    const SEEN_KEY = `notes_last_seen_${userId}`;
    const [lastSeen, setLastSeen] = useState<string>(() => localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString());
    const unreadNotes = notes.filter(n => !n.resolved && n.createdAt > lastSeen && n.authorId !== userId).length;

    // Mark as seen when panel opens
    useEffect(() => {
        if (open) {
            const now = new Date().toISOString();
            setLastSeen(now);
            localStorage.setItem(SEEN_KEY, now);
        }
    }, [open]);

    // ── Follow Up — author notifies admin they need a response ──────────────
    const followUpNote = async (id: string) => {
        const res = await fetch(`/api/notes/${id}/follow-up`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, userName, userPhoto }),
        });
        if (res.status === 429) {
            onToast?.("info", "You already sent a follow-up recently. Please wait 30 minutes.");
        } else if (!res.ok) {
            onToast?.("error", "Failed to send follow-up.");
        } else {
            onToast?.("success", "Follow-up sent! The admin has been notified. 📣");
        }
    };

    // ── Auto-open when a note bell notification is clicked ──────────────
    useEffect(() => {
        const handler = (e: Event) => {
            const { noteId, type } = (e as CustomEvent).detail || {};
            setOpen(true);
            // Switch to the right tab based on notification type
            if (type === "note_resolved" || type === "note_done" || type === "note_acknowledged") {
                setStatusTab("resolved");
            } else {
                setStatusTab("active");
            }
            setTypeFilter("all"); // show all types so the note is always visible
            // Scroll to + highlight the specific note after the panel renders
            if (noteId) {
                setHighlightId(noteId);
                setTimeout(() => {
                    const el = document.getElementById(`note-card-${noteId}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 350);
                // Clear highlight after 3 seconds
                setTimeout(() => setHighlightId(null), 3500);
            }
        };
        window.addEventListener("wf:open-notes-panel", handler);
        return () => window.removeEventListener("wf:open-notes-panel", handler);
    }, []);

    // (60s poll removed — Firestore onSnapshot handles real-time updates)


    const SORT_LABELS: Record<SortMode, string> = { newest: "Newest", oldest: "Oldest", most_reacted: "Most Reacted" };

    return (
        <div ref={panelRef} className="relative">
            {/* Trigger */}
            <button
                onClick={handleToggle}
                title="Feedback"
                className={`relative p-2 rounded-xl transition-all active:scale-90 ${open ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
            >
                <NotepadText size={18} />
                {unreadNotes > 0 && !open && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-0.5 shadow-md animate-pulse">
                        {unreadNotes > 9 ? "9+" : unreadNotes}
                    </span>
                )}
            </button>

            {/* Panel — centered, responsive */}
            {open && (
                <div
                    className={`fixed inset-x-0 top-[64px] bottom-0 lg:bottom-auto lg:inset-x-auto lg:absolute lg:top-full lg:mt-2 lg:left-auto lg:right-0 z-[200] bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700/60 lg:border lg:rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
                        showForm ? "lg:w-[680px] lg:max-h-[760px]" : "lg:w-[520px] lg:max-h-[600px]"
                    }`}
                >
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 shrink-0">
                        <div className="flex items-center gap-2">
                            <NotepadText size={15} className="text-indigo-500" />
                            <span className="text-sm font-bold text-gray-900 dark:text-white">Feedback</span>
                            {activeCount > 0 && (
                                <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">{activeCount}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {!showForm && !showTrash && (
                                <button onClick={() => openForm()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all">
                                    <Pencil size={11} /> New Note
                                </button>
                            )}
                            {!showForm && !showTrash && (
                                <button onClick={openTrash} title="Recently Deleted" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all relative">
                                    <Archive size={15} />
                                    {/* Bug #4 fix: use trashCount so badge appears even before trash is opened */}
                                    {trashCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400" />}
                                </button>
                            )}
                            <button onClick={() => { setOpen(false); closeForm(); closeTrash(); }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* ── Trash View ── */}
                    {showTrash && (
                        <div className="flex flex-col flex-1 overflow-hidden">
                            {/* Trash header */}
                            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700/60 bg-red-50 dark:bg-red-900/10 shrink-0">
                                <button onClick={closeTrash} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-all"><RotateCcw size={13} /></button>
                                <Archive size={13} className="text-red-500" />
                                <span className="text-xs font-bold text-gray-900 dark:text-white flex-1">Recently Deleted <span className="font-normal text-gray-400">({trashNotes.length})</span></span>
                                {trashNotes.length > 0 && (
                                    <>
                                        <button onClick={toggleSelectAll} className="text-[10px] text-indigo-500 hover:underline font-medium">
                                            {trashSelected.size === trashNotes.length ? "Deselect all" : "Select all"}
                                        </button>
                                        {trashSelected.size > 0 && (
                                            <button onClick={permanentlyDeleteSelected} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all">
                                                Delete {trashSelected.size}
                                            </button>
                                        )}
                                        <button onClick={emptyTrash} className="text-[10px] text-red-400 hover:text-red-600 font-medium hover:underline">Empty</button>
                                    </>
                                )}
                            </div>

                            {/* Info banner */}
                            <div className="px-4 py-2 text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700/40 shrink-0">
                                🗑 Items are permanently deleted after <strong>15 days</strong>.
                            </div>

                            {/* Trash list */}
                            <div className="overflow-y-auto flex-1 p-3 space-y-2">
                                {trashLoading ? (
                                    <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-red-400" /></div>
                                ) : trashNotes.length === 0 ? (
                                    <div className="text-center py-10 space-y-2">
                                        <p className="text-3xl">🗑️</p>
                                        <p className="text-sm text-gray-400">Trash is empty</p>
                                    </div>
                                ) : trashNotes.map(note => {
                                    const days = note.deletedAt ? daysRemaining(note.deletedAt) : 15;
                                    const cfg = typeConfig(note.type);
                                    const isSelected = trashSelected.has(note.id);
                                    return (
                                        <div key={note.id} onClick={() => toggleTrashSelect(note.id)}
                                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${isSelected ? "border-red-400 bg-red-50 dark:bg-red-900/20" : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
                                                }`}>
                                            {/* Checkbox */}
                                            <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-red-500 border-red-500" : "border-gray-300 dark:border-gray-600"
                                                }`}>
                                                {isSelected && <Check size={10} className="text-white" />}
                                            </div>
                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                                                    <span className="text-[10px] text-gray-400 truncate">{note.authorName}</span>
                                                    <span className={`ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${days <= 3 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                                                        }`}>{days}d left</span>
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{note.content}</p>
                                            </div>
                                            {/* Actions */}
                                            <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => restoreNote(note.id)} title="Restore"
                                                    className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all">
                                                    <RotateCcw size={13} />
                                                </button>
                                                <button onClick={() => permanentlyDelete(note.id)} title="Delete permanently"
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Form ── */}
                    {!showTrash && showForm && (
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 flex-1 overflow-y-auto space-y-3">
                            {/* Type selector */}
                            <div className="flex gap-2">
                                {NOTE_TYPES.map(t => (
                                    <button key={t.value} onClick={() => setFType(t.value as any)}
                                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-semibold border transition-all ${fType === t.value ? t.cls : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                                        {t.icon} {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* Text — capped height, scrollable with pretty-scrollbar */}
                            <AutoTextarea
                                ref={textRef as any}
                                value={fContent}
                                onChange={e => setFContent(e.target.value)}
                                placeholder="Describe the bug, feature idea, or general note… (paste images here)"
                                minRows={10}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 pretty-scrollbar"
                                style={{ maxHeight: '360px', overflow: 'auto' }}
                            />

                            {/* Attachments preview row */}
                            <div className="flex flex-wrap gap-2">
                                {imageUploading && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Compressing…</div>}
                                {fImage && (
                                    <div className="relative inline-block">
                                        <img src={fImage} alt="preview" className="max-h-24 rounded-xl border border-gray-200 dark:border-gray-700 object-cover" />
                                        <button onClick={() => setFImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"><X size={10} /></button>
                                    </div>
                                )}
                                {videoUploading && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Reading video…</div>}
                                {fVideoData && (
                                    <div className="relative">
                                        <video src={fVideoData} className="max-h-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-black" />
                                        <button onClick={() => setFVideoData(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"><X size={10} /></button>
                                    </div>
                                )}
                                {videoError && (
                                    <div className="flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                                        <span className="text-base leading-none">⚠️</span>
                                        <span className="text-xs font-medium flex-1">{videoError}</span>
                                        <button onClick={() => setVideoError("")} className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-300"><X size={12} /></button>
                                    </div>
                                )}

                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                {/* Hidden file inputs */}
                                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
                                <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleVideoFile(e.target.files[0])} />

                                <button onClick={() => fileRef.current?.click()} className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl border border-gray-200 dark:border-gray-700 transition-all" title="Attach image">
                                    <ImagePlus size={15} />
                                </button>
                                <button onClick={() => videoRef.current?.click()} className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl border border-gray-200 dark:border-gray-700 transition-all" title="Attach screen recording (max 5MB)">
                                    <Film size={15} />
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

                    {/* ── Status Tabs + Filters + Notes list — hidden while form or trash is open ── */}
                    {!showForm && !showTrash && <div className="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/30 shrink-0 space-y-2">
                        {/* Status tabs */}
                        <div className="flex items-center gap-1">
                            {(["active", "resolved", "dismissed", "all"] as StatusTab[]).map(tab => (
                                <button key={tab} onClick={() => setStatusTab(tab)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${statusTab === tab ? (tab === "dismissed" ? "bg-red-600 text-white" : "bg-indigo-600 text-white") : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                                    {tab === "active"    ? `Active${activeCount > 0 ? ` (${activeCount})` : ""}` :
                                     tab === "resolved"  ? `Resolved (${notes.filter(n => n.resolved).length})` :
                                     tab === "dismissed" ? `Dismissed${dismissedCount > 0 ? ` (${dismissedCount})` : ""}` :
                                     "All"}
                                </button>
                            ))}
                            {/* Sort — Bug #5 fix: sortRef enables outside-click close */}
                            <div ref={sortRef} className="relative ml-auto">
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
                                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all ${typeFilter === f ? "bg-gray-800 dark:bg-white text-white dark:text-gray-900" : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                                    {f === "all" ? `All (${notes.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>}

                    {/* ── Notes list — also hidden while form open ── */}
                    {!showForm && !showTrash && <div className="overflow-y-auto flex-1 p-3 space-y-3">
                        {loading ? (
                            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-400" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-10 space-y-2">
                                <p className="text-3xl">📝</p>
                                <p className="text-sm text-gray-400">{statusTab === "resolved" ? "No resolved notes yet" : statusTab === "dismissed" ? "No dismissed notes yet" : "No notes yet"}</p>
                                {statusTab === "active" && <button onClick={() => openForm()} className="mt-1 text-xs text-indigo-500 hover:underline">Add the first note</button>}
                            </div>
                        ) : (
                            filtered.map(note => (
                                <React.Fragment key={note.id}>
                                <NoteCard
                                    note={note}
                                    userId={userId}
                                    userRole={userRole}
                                    highlighted={note.id === highlightId}
                                    onEdit={openForm}
                                    onDelete={deleteNote}
                                    onReact={reactToNote}
                                    onResolve={resolveNote}
                                    onRetype={retypeNote}
                                    onFollowUp={followUpNote}
                                />
                                </React.Fragment>
                            ))
                        )}
                    </div>}
                </div>
            )}
        </div>
    );
}
