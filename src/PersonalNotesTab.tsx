import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, Pin, PinOff, Trash2, Pencil, Check, ChevronDown,
  Lock, BookOpen, Bell, Heart, FileText, Loader2, Search, NotebookPen,
} from "lucide-react";
import AutoTextarea from "./AutoTextarea";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PersonalNoteEntry {
  id: string;
  title: string;
  body: string;
  category: "personal" | "reminder" | "prayer" | "journal";
  pinned: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

interface Props {
  userId: string;
  onToast?: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PERSONAL_DRAFT_KEY = "wf_personal_note_draft";

const CATEGORIES = [
  { value: "personal",  label: "Personal",  icon: <Lock size={13} />,     cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700" },
  { value: "reminder",  label: "Reminder",  icon: <Bell size={13} />,     cls: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700" },
  { value: "prayer",    label: "Prayer",    icon: <Heart size={13} />,    cls: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700" },
  { value: "journal",   label: "Journal",   icon: <BookOpen size={13} />, cls: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

function catConfig(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[0];
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
function PersonalNoteCard({
  note, onEdit, onDelete, onPin,
}: {
  key?: React.Key;
  note: PersonalNoteEntry;
  onEdit: (n: PersonalNoteEntry) => void;
  onDelete: (id: string) => Promise<void> | void;
  onPin: (id: string, pinned: boolean) => Promise<void> | void;
}) {
  const cfg = catConfig(note.category);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    requestAnimationFrame(() => { setIsOverflowing(el.scrollHeight > el.clientHeight + 2); });
  }, [note.body]);

  return (
    <div className={`group relative rounded-2xl border transition-all hover:shadow-md ${
      note.pinned
        ? "border-amber-300 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/10"
        : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50"
    }`}>
      {note.pinned && (
        <span className="absolute -top-2 left-4 flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full">
          <Pin size={9} /> Pinned
        </span>
      )}

      {/* Private lock watermark */}
      <div className="absolute top-3 right-3 opacity-20 group-hover:opacity-0 transition-opacity pointer-events-none">
        <Lock size={13} className="text-amber-500" />
      </div>

      <div className="p-4 pt-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="text-[10px] text-gray-400">
            {relTime(note.createdAt)}{note.updatedAt && (new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 2000) ? " · edited" : ""}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5 leading-snug">{note.title}</h3>

        {/* Body */}
        <p
          ref={bodyRef}
          className={`text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed transition-all ${
            expanded ? "overflow-y-auto max-h-96" : "overflow-hidden max-h-48"
          }`}
          style={{ scrollbarWidth: "thin" }}
        >
          {note.body}
        </p>
        {(isOverflowing || expanded) && (
          <button onClick={() => setExpanded(v => !v)} className="mt-1.5 text-xs font-semibold text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
            {expanded ? "Show less ↑" : "Show more ↓"}
          </button>
        )}

        {/* Action row */}
        <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onPin(note.id, !note.pinned)} title={note.pinned ? "Unpin" : "Pin to top"}
            className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all">
            {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button onClick={() => onEdit(note)} title="Edit"
            className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(note.id)} title="Delete"
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Note Form Modal ───────────────────────────────────────────────────────────
function PersonalNoteFormModal({
  initial, onSave, onClose, saving,
}: {
  initial?: PersonalNoteEntry | null;
  onSave: (data: { title: string; body: string; category: CategoryValue }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const seedDraft = !initial
    ? (() => { try { const d = localStorage.getItem(PERSONAL_DRAFT_KEY); return d ? JSON.parse(d) : null; } catch { return null; } })()
    : null;

  const [title,    setTitle]    = useState(initial?.title    ?? seedDraft?.title    ?? "");
  const [body,     setBody]     = useState(initial?.body     ?? seedDraft?.body     ?? "");
  const [category, setCategory] = useState<CategoryValue>(initial?.category ?? seedDraft?.category ?? "personal");
  const [showDiscard, setShowDiscard] = useState(false);

  const isDirty = title.trim() !== (initial?.title ?? "").trim()
    || body.trim() !== (initial?.body ?? "").trim();

  // Auto-save draft every 500 ms (new notes only)
  useEffect(() => {
    if (initial) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(PERSONAL_DRAFT_KEY, JSON.stringify({ title, body, category })); } catch { /* noop */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [title, body, category, initial]);

  const handleSave = () => {
    if (!title.trim() || !body.trim()) return;
    try { localStorage.removeItem(PERSONAL_DRAFT_KEY); } catch { /* noop */ }
    onSave({ title: title.trim(), body: body.trim(), category });
  };

  const handleCloseAttempt = () => {
    if (isDirty) { setShowDiscard(true); }
    else {
      if (!initial) { try { localStorage.removeItem(PERSONAL_DRAFT_KEY); } catch { /* noop */ } }
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    try { localStorage.removeItem(PERSONAL_DRAFT_KEY); } catch { /* noop */ }
    onClose();
  };

  const valid = title.trim().length > 0 && body.trim().length > 0;
  const hasDraftBanner = !initial && !!seedDraft && (seedDraft.title || seedDraft.body);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden">

        {/* Discard banner */}
        {showDiscard && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700/50">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">⚠️ Discard unsaved changes?</p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setShowDiscard(false)}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-gray-700 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/40 transition-all">
                Keep writing
              </button>
              <button onClick={handleConfirmDiscard}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all">
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Draft restore banner */}
        {hasDraftBanner && !showDiscard && (
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700/50">
            <p className="text-xs text-amber-600 dark:text-amber-300 font-medium">📝 Draft restored from your last session</p>
            <button onClick={() => { setTitle(""); setBody(""); setCategory("personal"); try { localStorage.removeItem(PERSONAL_DRAFT_KEY); } catch { /* noop */ } }}
              className="text-[10px] font-semibold text-amber-500 hover:text-red-500 transition-colors">Clear</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-amber-500" />
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {initial ? "Edit Personal Note" : "New Personal Note"}
            </span>
            {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />}
          </div>
          <button onClick={handleCloseAttempt}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all" title="Close">
            <X size={15} />
          </button>
        </div>

        {/* Private notice */}
        <div className="flex items-center gap-2 mx-5 mt-4 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-400">
          <Lock size={12} className="shrink-0" />
          Only visible to you — no one else on the team can see personal notes.
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  category === c.value
                    ? c.cls + " scale-105 shadow-sm"
                    : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Title</label>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setShowDiscard(false); }}
              placeholder="e.g. Prayer Requests — March 2026"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Content</label>
            <AutoTextarea
              value={body}
              onChange={e => { setBody(e.target.value); setShowDiscard(false); }}
              minRows={5}
              placeholder="Write your personal thoughts, prayer requests, reminders, or journal entries here…"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 transition resize-none"
              style={{ maxHeight: "50vh", overflowY: "auto", scrollbarWidth: "thin" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5">
          <button onClick={handleCloseAttempt}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-all font-medium">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!valid || saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {initial ? "Save Changes" : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Personal Notes Tab ───────────────────────────────────────────────────
export default function PersonalNotesTab({ userId, onToast }: Props) {
  const [notes,    setNotes]    = useState<PersonalNoteEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<PersonalNoteEntry | null>(null);
  const [search,   setSearch]   = useState("");
  const [catFilter, setCatFilter] = useState<CategoryValue | "all">("all");
  const [showCatMenu, setShowCatMenu] = useState(false);
  const catMenuRef = useRef<HTMLDivElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    if (!userId) return;
    try {
      const res  = await fetch(`/api/personal-notes?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (Array.isArray(data)) setNotes(data);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, [userId]);

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
      const updated: PersonalNoteEntry = { ...editing, ...data, updatedAt: new Date().toISOString() };
      setNotes(prev => prev.map(n => n.id === editing.id ? updated : n));
      setShowForm(false); setEditing(null);
      try {
        const res = await fetch(`/api/personal-notes/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, ...data }),
        });
        if (!res.ok) throw new Error();
        onToast?.("success", "Note updated.");
      } catch {
        onToast?.("error", "Failed to update note.");
        fetchNotes();
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      const tempNote: PersonalNoteEntry = { id: tempId, ...data, pinned: false, createdAt: new Date().toISOString() };
      setNotes(prev => [tempNote, ...prev]);
      setShowForm(false);
      try {
        const res = await fetch("/api/personal-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, ...data }),
        });
        const { id } = await res.json();
        if (id) setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id } : n));
        onToast?.("success", "Personal note saved. 🔒");
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
      await fetch(`/api/personal-notes/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, pinned }),
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
      const res = await fetch(`/api/personal-notes/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
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
    <div>
      {/* ── Privacy notice bar ── */}
      <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-400">
        <Lock size={12} className="shrink-0" />
        <span>These notes are <strong>only visible to you</strong>. No other team member can read, search, or access your personal notes.</span>
      </div>

      {/* ── Filters bar ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search personal notes…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
          />
        </div>

        <div className="relative" ref={catMenuRef}>
          <button onClick={() => setShowCatMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            {currentCatLabel} <ChevronDown size={13} className={`transition-transform ${showCatMenu ? "rotate-180" : ""}`} />
          </button>
          {showCatMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
              {[{ value: "all", label: "All Categories" }, ...CATEGORIES.map(c => ({ value: c.value, label: c.label }))].map(opt => (
                <button key={opt.value}
                  onClick={() => { setCatFilter(opt.value as CategoryValue | "all"); setShowCatMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${catFilter === opt.value ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-semibold" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
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
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
            <Lock size={28} className="text-amber-400" />
          </div>
          <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
            {q || catFilter !== "all" ? "No notes match your search" : "No personal notes yet"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {q || catFilter !== "all" ? "Try a different search or category" : "Write something just for yourself — private prayers, reminders, or journal entries."}
          </p>
          {!q && catFilter === "all" && (
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-xl transition-all">
              <Plus size={15} /> Write your first note
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(note => (
            <PersonalNoteCard
              key={note.id}
              note={note}
              onEdit={n => { setEditing(n); setShowForm(true); }}
              onDelete={handleDelete}
              onPin={handlePin}
            />
          ))}
        </div>
      )}

      {/* ── Form Modal ── */}
      {showForm && (
        <PersonalNoteFormModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
