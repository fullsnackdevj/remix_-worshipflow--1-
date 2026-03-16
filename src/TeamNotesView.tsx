import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, Pin, PinOff, Trash2, Pencil, Check, ChevronDown,
  FileText, Users, Megaphone, BookOpen, Loader2, Search,
} from "lucide-react";
import AutoTextarea from "./AutoTextarea";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TeamNoteEntry {
  id: string;
  title: string;
  body: string;
  category: "meeting" | "announcement" | "decision" | "general";
  authorId: string;
  authorName: string;
  authorPhoto: string;
  pinned: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

interface TeamNotesViewProps {
  userId: string;
  userName: string;
  userPhoto: string;
  userRole?: string;
  onToast?: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "meeting",      label: "Meeting Recap",  icon: <Users size={13} />,      cls: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700" },
  { value: "announcement", label: "Announcement",   icon: <Megaphone size={13} />,  cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700" },
  { value: "decision",     label: "Decision",       icon: <Check size={13} />,       cls: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700" },
  { value: "general",      label: "General",        icon: <FileText size={13} />,    cls: "bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

function catConfig(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[3];
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

// ── NoteCard ──────────────────────────────────────────────────────────────────
function NoteCard({
  note, userId, userRole, onEdit, onDelete, onPin,
}: {
  note: TeamNoteEntry;
  userId: string;
  userRole?: string;
  onEdit: (n: TeamNoteEntry) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
}) {
  const isAuthor = note.authorId === userId;
  const isAdmin  = userRole === "admin" || userRole === "leader";
  const cfg      = catConfig(note.category);

  return (
    <div className={`group relative rounded-2xl border transition-all hover:shadow-md ${
      note.pinned
        ? "border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10"
        : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50"
    }`}>
      {note.pinned && (
        <span className="absolute -top-2 left-4 flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 px-2 py-0.5 rounded-full">
          <Pin size={9} /> Pinned
        </span>
      )}

      <div className="p-4 pt-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {note.authorPhoto ? (
              <img src={note.authorPhoto} className="w-8 h-8 rounded-full object-cover shrink-0 border-2 border-indigo-400/30" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {note.authorName?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{note.authorName}</p>
              <p className="text-[10px] text-gray-400">
                {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 leading-snug">{note.title}</h3>

        {/* Body */}
        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{note.body}</p>

        {/* Action row */}
        <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
          {(isAuthor || isAdmin) && (
            <button
              onClick={() => onPin(note.id, !note.pinned)}
              title={note.pinned ? "Unpin" : "Pin to top"}
              className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
            >
              {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          )}
          {isAuthor && (
            <button
              onClick={() => onEdit(note)}
              title="Edit"
              className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
            >
              <Pencil size={13} />
            </button>
          )}
          {(isAuthor || isAdmin) && (
            <button
              onClick={() => onDelete(note.id)}
              title="Delete"
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Note Form Modal ───────────────────────────────────────────────────────────
function NoteFormModal({
  initial, onSave, onClose, saving,
}: {
  initial?: TeamNoteEntry | null;
  onSave: (data: { title: string; body: string; category: CategoryValue }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title,    setTitle]    = useState(initial?.title    ?? "");
  const [body,     setBody]     = useState(initial?.body     ?? "");
  const [category, setCategory] = useState<CategoryValue>(initial?.category ?? "meeting");

  const valid = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-indigo-500" />
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {initial ? "Edit Note" : "New Team Note"}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  category === c.value
                    ? c.cls + " scale-105 shadow-sm"
                    : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Sunday Service Recap — Mar 16"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Content</label>
            <AutoTextarea
              value={body}
              onChange={e => setBody(e.target.value)}
              minRows={5}
              placeholder="Write your meeting recap, decisions, or announcements here…"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all font-medium">
            Cancel
          </button>
          <button
            onClick={() => valid && onSave({ title: title.trim(), body: body.trim(), category })}
            disabled={!valid || saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {initial ? "Save Changes" : "Post Note"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export default function TeamNotesView({ userId, userName, userPhoto, userRole, onToast }: TeamNotesViewProps) {
  const [notes,    setNotes]    = useState<TeamNoteEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<TeamNoteEntry | null>(null);
  const [search,   setSearch]   = useState("");
  const [catFilter, setCatFilter] = useState<CategoryValue | "all">("all");
  const [showCatMenu, setShowCatMenu] = useState(false);
  const catMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === "admin" || userRole === "leader";

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    try {
      const res  = await fetch("/api/team-notes");
      const data = await res.json();
      if (Array.isArray(data)) setNotes(data);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // Close cat menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showCatMenu && catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setShowCatMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCatMenu]);

  // ── Create / Edit ──────────────────────────────────────────────────────────
  const handleSave = async (data: { title: string; body: string; category: CategoryValue }) => {
    setSaving(true);
    if (editing) {
      // Optimistic update
      const updated: TeamNoteEntry = { ...editing, ...data, updatedAt: new Date().toISOString() };
      setNotes(prev => prev.map(n => n.id === editing.id ? updated : n));
      setShowForm(false); setEditing(null);
      try {
        const res = await fetch(`/api/team-notes/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorId: userId, ...data }),
        });
        if (!res.ok) throw new Error();
        onToast?.("success", "Note updated.");
      } catch {
        onToast?.("error", "Failed to update note.");
        fetchNotes();
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      const tempNote: TeamNoteEntry = {
        id: tempId, ...data, authorId: userId, authorName: userName,
        authorPhoto: userPhoto, pinned: false, createdAt: new Date().toISOString(),
      };
      setNotes(prev => [tempNote, ...prev]);
      setShowForm(false);
      try {
        const res = await fetch("/api/team-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorId: userId, authorName: userName, authorPhoto: userPhoto, ...data }),
        });
        const { id } = await res.json();
        if (id) setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id } : n));
      } catch {
        setNotes(prev => prev.filter(n => n.id !== tempId));
        onToast?.("error", "Failed to save note. Try again.");
      }
    }
    setSaving(false);
  };

  // ── Pin ────────────────────────────────────────────────────────────────────
  const handlePin = async (id: string, pinned: boolean) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned } : n));
    try {
      await fetch(`/api/team-notes/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
    } catch {
      setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !pinned } : n));
      onToast?.("error", "Failed to update pin.");
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      const res = await fetch(`/api/team-notes/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId: userId, userRole }),
      });
      if (!res.ok) throw new Error();
      onToast?.("success", "Note deleted.");
    } catch {
      onToast?.("error", "Failed to delete note.");
      fetchNotes();
    }
  };

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = notes
    .filter(n => catFilter === "all" || n.category === catFilter)
    .filter(n => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const currentCatLabel = catFilter === "all" ? "All Categories" : catConfig(catFilter).label;

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-500" /> Team Notes
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Meeting recaps, decisions, and team announcements
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
        >
          <Plus size={16} /> New Note
        </button>
      </div>

      {/* ── Filters bar ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
          />
        </div>

        {/* Category filter */}
        <div className="relative" ref={catMenuRef}>
          <button
            onClick={() => setShowCatMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          >
            {currentCatLabel} <ChevronDown size={13} className={`transition-transform ${showCatMenu ? "rotate-180" : ""}`} />
          </button>
          {showCatMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
              {[{ value: "all", label: "All Categories" }, ...CATEGORIES.map(c => ({ value: c.value, label: c.label }))].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setCatFilter(opt.value as CategoryValue | "all"); setShowCatMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${catFilter === opt.value ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Notes List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-3" /> Loading notes…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4">
            <BookOpen size={28} className="text-indigo-400" />
          </div>
          <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
            {q || catFilter !== "all" ? "No notes match your search" : "No notes yet"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {q || catFilter !== "all" ? "Try a different search or category" : "Post your first meeting recap or announcement!"}
          </p>
          {!q && catFilter === "all" && (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all"
            >
              <Plus size={15} /> Create your first note
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              userId={userId}
              userRole={userRole}
              onEdit={n => { setEditing(n); setShowForm(true); }}
              onDelete={handleDelete}
              onPin={handlePin}
            />
          ))}
        </div>
      )}

      {/* ── Form Modal ── */}
      {showForm && (
        <NoteFormModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
