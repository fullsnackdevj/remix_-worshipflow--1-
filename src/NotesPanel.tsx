import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, PenLine, Trash2, ImagePlus, Loader2, ChevronLeft, Bug, Lightbulb, MessageSquare, Pencil, Check, AlertCircle } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
export interface TeamNote {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string;
    type: "bug" | "feature" | "general";
    content: string;
    imageData?: string | null;
    createdAt: string;
    updatedAt?: string | null;
}

interface NotesPanelProps {
    userId: string;
    userName: string;
    userPhoto: string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const NOTE_TYPES = [
    { value: "bug", label: "Bug", icon: <Bug size={12} />, cls: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800" },
    { value: "feature", label: "Feature", icon: <Lightbulb size={12} />, cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
    { value: "general", label: "General", icon: <MessageSquare size={12} />, cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" },
] as const;

const MAX_IMAGE_BYTES = 300 * 1024; // 300 KB after compression

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
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let { width, height } = img;
                const MAX_DIM = 1200;
                if (width > MAX_DIM || height > MAX_DIM) {
                    if (width > height) { height = Math.round((height / width) * MAX_DIM); width = MAX_DIM; }
                    else { width = Math.round((width / height) * MAX_DIM); height = MAX_DIM; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0, width, height);
                // Try progressive quality reduction
                let q = 0.8;
                let result = canvas.toDataURL("image/jpeg", q);
                while (result.length > MAX_IMAGE_BYTES * 1.37 && q > 0.2) { q -= 0.1; result = canvas.toDataURL("image/jpeg", q); }
                if (result.length > MAX_IMAGE_BYTES * 1.37) reject(new Error("Image too large even after compression. Please use a smaller screenshot."));
                else resolve(result);
            };
            img.onerror = () => reject(new Error("Invalid image"));
            img.src = e.target!.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

// ── Note Form ────────────────────────────────────────────────────────────────
function NoteForm({ userId, userName, userPhoto, initial, onSave, onCancel }: {
    userId: string; userName: string; userPhoto: string;
    initial?: TeamNote; onSave: (n: TeamNote) => void; onCancel: () => void;
}) {
    const [content, setContent] = useState(initial?.content ?? "");
    const [type, setType] = useState<"bug" | "feature" | "general">(initial?.type ?? "general");
    const [imageData, setImageData] = useState<string | null>(initial?.imageData ?? null);
    const [saving, setSaving] = useState(false);
    const [imgError, setImgError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { textareaRef.current?.focus(); }, []);

    const handleImageFile = async (file: File) => {
        setImgError("");
        if (!file.type.startsWith("image/")) { setImgError("Only image files are supported."); return; }
        try { setImageData(await compressImage(file)); }
        catch (e: any) { setImgError(e.message ?? "Failed to process image"); }
    };

    // Paste handler
    const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = Array.from(e.clipboardData.items) as DataTransferItem[];
        const imgItem = items.find((i: DataTransferItem) => i.type.startsWith("image/"));
        if (imgItem) {
            e.preventDefault();
            const file = imgItem.getAsFile();
            if (file) await handleImageFile(file);
        }
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setSaving(true);
        try {
            const url = initial ? `/api/notes/${initial.id}` : "/api/notes";
            const method = initial ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ authorId: userId, authorName: userName, authorPhoto: userPhoto, type, content, imageData }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed");
            onSave({
                id: initial?.id ?? data.id,
                authorId: userId, authorName: userName, authorPhoto: userPhoto,
                type, content: content.trim(), imageData,
                createdAt: initial?.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        } catch (e: any) {
            setImgError(e.message ?? "Failed to save");
        } finally { setSaving(false); }
    };

    return (
        <div className="space-y-3">
            {/* Type picker */}
            <div className="flex gap-2">
                {NOTE_TYPES.map(t => (
                    <button
                        key={t.value}
                        onClick={() => setType(t.value as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${type === t.value ? t.cls : "bg-transparent border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400"}`}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                onPaste={handlePaste}
                placeholder="Describe the bug, feature idea, or note... (paste a screenshot directly here)"
                rows={4}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {/* Image preview */}
            {imageData && (
                <div className="relative inline-block">
                    <img src={imageData} alt="attachment" className="max-h-36 rounded-xl border border-gray-200 dark:border-gray-700 object-cover" />
                    <button onClick={() => setImageData(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                        <X size={11} />
                    </button>
                </div>
            )}

            {imgError && (
                <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {imgError}</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2">
                <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-500 transition-colors"
                >
                    <ImagePlus size={14} /> Attach image
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !content.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        {initial ? "Update" : "Save Note"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Note Card ────────────────────────────────────────────────────────────────
function NoteCard({ note, userId, onEdit, onDelete }: { note: TeamNote; userId: string; onEdit: () => void; onDelete: () => void; key?: string }) {
    const [deleting, setDeleting] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const tc = typeConfig(note.type);
    const isOwn = note.authorId === userId;

    const doDelete = async () => {
        if (!confirm("Delete this note?")) return;
        setDeleting(true);
        try {
            await fetch(`/api/notes/${note.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId: userId }) });
            onDelete();
        } catch { setDeleting(false); }
    };

    return (
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-700/60 p-4 space-y-3 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {note.authorPhoto
                        ? <img src={note.authorPhoto} alt={note.authorName} className="w-7 h-7 rounded-full shrink-0" />
                        : <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{note.authorName?.[0]?.toUpperCase()}</div>
                    }
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{note.authorName}</p>
                        <p className="text-[10px] text-gray-400">{relativeTime(note.updatedAt ?? note.createdAt)}{note.updatedAt && note.updatedAt !== note.createdAt ? " (edited)" : ""}</p>
                    </div>
                </div>
                <span className={`shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold ${tc.cls}`}>
                    {tc.icon} {tc.label}
                </span>
            </div>

            {/* Content */}
            <div>
                <p className={`text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed ${!expanded && note.content.length > 200 ? "line-clamp-4" : ""}`}>
                    {note.content}
                </p>
                {note.content.length > 200 && (
                    <button onClick={() => setExpanded(e => !e)} className="text-xs text-indigo-500 hover:text-indigo-400 mt-1 transition-colors">
                        {expanded ? "Show less" : "Show more"}
                    </button>
                )}
            </div>

            {/* Image */}
            {note.imageData && (
                <img
                    src={note.imageData}
                    alt="attachment"
                    className="w-full max-h-48 object-cover rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer"
                    onClick={() => window.open(note.imageData!, "_blank")}
                />
            )}

            {/* Own-note actions */}
            {isOwn && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                    <button onClick={onEdit} className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 transition-colors">
                        <Pencil size={12} /> Edit
                    </button>
                    <button onClick={doDelete} disabled={deleting} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
                        {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Main Panel ───────────────────────────────────────────────────────────────
export default function NotesPanel({ userId, userName, userPhoto }: NotesPanelProps) {
    const [open, setOpen] = useState(false);
    const [notes, setNotes] = useState<TeamNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingNote, setEditingNote] = useState<TeamNote | null>(null);
    const [filter, setFilter] = useState<string>("all");
    const panelRef = useRef<HTMLDivElement>(null);

    const loadNotes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/notes");
            if (res.ok) setNotes(await res.json());
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (open) loadNotes();
        else { setShowForm(false); setEditingNote(null); }
    }, [open, loadNotes]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleSaved = (note: TeamNote) => {
        if (editingNote) setNotes(prev => prev.map(n => n.id === note.id ? note : n));
        else setNotes(prev => [note, ...prev]);
        setShowForm(false); setEditingNote(null);
    };

    const filtered = filter === "all" ? notes : notes.filter(n => n.type === filter);

    return (
        <div ref={panelRef} className="relative">
            {/* Trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                className="relative p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Team Notes"
            >
                <PenLine size={20} />
                {notes.length > 0 && !open && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500" />
                )}
            </button>

            {/* Panel */}
            {open && (
                <div
                    className="fixed sm:absolute right-2 sm:right-0 top-auto sm:top-full mt-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
                    style={{
                        width: "min(380px, calc(100vw - 1rem))",
                        maxHeight: "min(580px, calc(100dvh - 120px))",
                        top: "calc(var(--header-h, 64px) + 8px)",
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 shrink-0">
                        {editingNote ? (
                            <button onClick={() => setEditingNote(null)} className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-400 font-medium transition-colors">
                                <ChevronLeft size={14} /> Back
                            </button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <PenLine size={14} className="text-indigo-500" />
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Team Notes</h3>
                                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">{notes.length}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {!editingNote && !showForm && (
                                <button
                                    onClick={() => setShowForm(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                >
                                    <PenLine size={12} /> New Note
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Form / Edit */}
                    {(showForm || editingNote) && (
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 shrink-0">
                            <NoteForm
                                userId={userId} userName={userName} userPhoto={userPhoto}
                                initial={editingNote ?? undefined}
                                onSave={handleSaved}
                                onCancel={() => { setShowForm(false); setEditingNote(null); }}
                            />
                        </div>
                    )}

                    {/* Filter tabs */}
                    {!showForm && !editingNote && (
                        <div className="flex gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 shrink-0">
                            {["all", "bug", "feature", "general"].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-2.5 py-1 text-xs rounded-lg font-medium capitalize transition-colors ${filter === f ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                                >
                                    {f === "all" ? `All (${notes.length})` : f}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Notes list */}
                    {!editingNote && (
                        <div className="overflow-y-auto flex-1 p-3 space-y-3">
                            {loading ? (
                                <div className="flex items-center justify-center py-12 text-gray-400">
                                    <Loader2 size={20} className="animate-spin mr-2" /> Loading notes...
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-12">
                                    <PenLine size={28} className="text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">{filter === "all" ? "No notes yet" : `No ${filter} notes`}</p>
                                    {filter === "all" && <p className="text-xs text-gray-500 mt-1">Be the first to add a note!</p>}
                                </div>
                            ) : (
                                filtered.map(note => (
                                    <NoteCard
                                        key={note.id}
                                        note={note}
                                        userId={userId}
                                        onEdit={() => { setEditingNote(note); setShowForm(false); }}
                                        onDelete={() => setNotes(prev => prev.filter(n => n.id !== note.id))}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
