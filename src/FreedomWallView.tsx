import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Info, Heart, Maximize2, Pencil, LayoutGrid } from "lucide-react";


// ── Types ─────────────────────────────────────────────────────────────────────
interface FreedomNote {
  id: string;
  message: string;
  color: string;
  rotation: number;
  x: number; // percent of canvas
  y: number; // percent of canvas
  reactions: Record<string, number>;
  userReactions: string[]; // "token:emoji"
  authorSessionToken?: string;
  createdAt: string;
}

interface FreedomWallViewProps {
  isAdmin?: boolean;
  currentUserId?: string;
  onToast?: (type: string, msg: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W = 4000;
const CANVAS_H = 3000;
const NOTE_COLORS = [
  { bg: "#fefce8", border: "#fde047", text: "#713f12" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#831843" },
  { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  { bg: "#ffedd5", border: "#fdba74", text: "#7c2d12" },
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a5f" },
];
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.12;

// ── Session Token ─────────────────────────────────────────────────────────────
function getSessionToken(): string {
  const key = "fw_session";
  let t = localStorage.getItem(key);
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, t); }
  return t;
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function seededRandom(seed: string) {
  let h = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b1);
  return function () {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
  };
}

// ── Dense dot background ──────────────────────────────────────────────────────
const DOT_PATTERN_SVG = `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1.2' fill='%23383848'/%3E%3C/svg%3E")`;

// ── Pin SVG ───────────────────────────────────────────────────────────────────
const Pin = ({ color = "#ef4444" }: { color?: string }) => (
  <svg width="16" height="26" viewBox="0 0 16 26" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))" }}>
    <circle cx="8" cy="8" r="7" fill={color} />
    <circle cx="6" cy="6" r="2.5" fill="rgba(255,255,255,0.45)" />
    <line x1="8" y1="14" x2="8" y2="26" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

// ── Text formatter ────────────────────────────────────────────────────────────
function formatNoteText(raw: string): string {
  if (!raw.trim()) return raw;
  const capitalized = raw.trim()
    .replace(/^([a-z])/, (c) => c.toUpperCase())
    .replace(/([.!?]+\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase());
  const paragraphs = capitalized.split(/\n{2,}/);
  const CHARS_PER_LINE = 36;
  const MAX_CHARS = CHARS_PER_LINE * 5;
  const formatted = paragraphs.map((para) => {
    const lines = para.split(/\n/);
    return lines.map((line) => {
      if (line.length <= MAX_CHARS) return line;
      const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
      const chunks: string[] = [];
      let current = '';
      for (const sentence of sentences) {
        if (current.length + sentence.length > MAX_CHARS && current.trim()) { chunks.push(current.trimEnd()); current = sentence; }
        else current += sentence;
      }
      if (current.trim()) chunks.push(current.trimEnd());
      return chunks.join('\n\n');
    }).join('\n');
  });
  return formatted.join('\n\n');
}

// ── About Modal ───────────────────────────────────────────────────────────────
function AboutModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-[#16161e] rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg">📌</div>
            <div>
              <h3 className="text-sm font-bold text-amber-300">Freedom Wall</h3>
              <p className="text-[11px] text-gray-500">A safe, anonymous space</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-amber-100/80 leading-relaxed">The <strong className="text-amber-300">Freedom Wall</strong> is a safe, anonymous space for every member of our worship team.</p>
          <p className="text-sm text-gray-400 leading-relaxed">Life is full of battles — some silent, some heavy, some we carry alone. This wall exists so you can put your thoughts, burdens, prayers, or moments of gratitude somewhere — without your name attached, without judgment, without pressure.</p>
          <p className="text-sm text-gray-400 leading-relaxed">Your message will appear as a pinned note on the board for the whole team to read and react to. No identity is ever revealed. Only hearts, prayers, and sparks in return.</p>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 rounded-2xl text-sm font-bold text-[#1c1917] transition-all active:scale-95" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>Got it 👍</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────
function NoteCard({
  note, sessionToken, isAdmin, onReact, onDelete, onView, onEdit, onMove, zoom, isNew, noteRank,
}: {
  note: FreedomNote; sessionToken: string; isAdmin?: boolean;
  onReact: (id: string, emoji: string) => void;
  onDelete: (id: string) => void;
  onView: (note: FreedomNote) => void;
  onEdit: (note: FreedomNote) => void;
  onMove: (id: string, x: number, y: number) => void;
  zoom: number;
  isNew?: boolean;
  noteRank?: number; // 1 = oldest, higher = newer — controls z-index stacking
}) {
  const colorScheme = NOTE_COLORS.find((c) => c.bg === note.color) ?? NOTE_COLORS[0];
  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, noteX: 0, noteY: 0 });
  const moved = useRef(false);

  // ── Touch drag (mobile) ─────────────────────────────────────────────────────
  const touchDragActive = useRef(false);
  const touchStart = useRef({ clientX: 0, clientY: 0, noteX: 0, noteY: 0 });
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);

  const isAuthor = !!note.authorSessionToken && note.authorSessionToken === sessionToken;
  const canDelete = isAdmin || isAuthor;

  const left = (note.x / 100) * CANVAS_W;
  const top  = (note.y / 100) * CANVAS_H;

  const totalHearts = Object.values(note.reactions).reduce((s, v) => s + v, 0);
  const hasReacted  = note.userReactions.some((r) => r.startsWith(sessionToken + ":"));

  // ── Touch drag (document-level, passive:false so we can preventDefault) ─────
  useEffect(() => {
    if (!isAuthor) return;
    const noteId = note.id;
    const onTouchMoveDoc = (e: TouchEvent) => {
      if (!touchDragActive.current) return;
      e.preventDefault(); // stop scroll + page pan while dragging a note
      const t = e.touches[0];
      const dx = t.clientX - touchStart.current.clientX;
      const dy = t.clientY - touchStart.current.clientY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
      // Convert screen-pixel delta → canvas-percent delta (no zoom, scale=1)
      const newX = Math.max(0, Math.min(99, touchStart.current.noteX + (dx / CANVAS_W) * 100));
      const newY = Math.max(0, Math.min(99, touchStart.current.noteY + (dy / CANVAS_H) * 100));
      onMoveRef.current(noteId, newX, newY);
    };
    const onTouchEndDoc = () => { touchDragActive.current = false; };
    document.addEventListener("touchmove", onTouchMoveDoc, { passive: false });
    document.addEventListener("touchend", onTouchEndDoc);
    return () => {
      document.removeEventListener("touchmove", onTouchMoveDoc);
      document.removeEventListener("touchend", onTouchEndDoc);
    };
  }, [isAuthor, note.id]); // re-register when temp-id becomes real id

  // ── Drag-to-move (author only, mouse) ──────────────────────────────────────
  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (!isAuthor) return;
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    moved.current = false;
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      noteX: note.x,
      noteY: note.y,
    };

    const onMouseMove = (mv: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = mv.clientX - dragStart.current.mouseX;
      const dy = mv.clientY - dragStart.current.mouseY;
      // Convert screen-pixel delta → canvas-percent
      // CANVAS_W/H is the total canvas size; the board renders at scale 1:1
      const newX = Math.max(0, Math.min(99, dragStart.current.noteX + (dx / CANVAS_W) * 100));
      const newY = Math.max(0, Math.min(99, dragStart.current.noteY + (dy / CANVAS_H) * 100));
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
      onMove(note.id, newX, newY);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      data-note-card
      className="absolute select-none group/note"
      style={{
        left, top,
        transform: `rotate(${note.rotation}deg)`,
        transformOrigin: "center top",
        width: 260,
        zIndex: isDragging.current ? 99999 : hovered ? 9999 : (noteRank ?? 1),
        cursor: isAuthor ? (isDragging.current ? "grabbing" : "grab") : "default",
        willChange: isDragging.current ? "transform" : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={isAuthor ? handleDragMouseDown : undefined}
      onTouchStart={(e) => {
        if (!isAuthor) return;
        e.stopPropagation(); // prevent board pan from starting
        touchDragActive.current = true;
        moved.current = false;
        const t = e.touches[0];
        touchStart.current = { clientX: t.clientX, clientY: t.clientY, noteX: note.x, noteY: note.y };
      }}
      onTouchMove={(e) => {
        // Stop the React synthetic event from reaching the board's onTouchMove pan handler
        if (isAuthor && touchDragActive.current) e.stopPropagation();
      }}
    >
      {/* Pin */}
      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <Pin color={isAuthor && !isAdmin ? "#7c3aed" : "#b45309"} />
      </div>

      {/* Note paper */}
      <div
        className="rounded-sm pt-6 pb-3 px-3 relative"
        style={{
          background: colorScheme.bg,
          border: `1px solid ${colorScheme.border}`,
          boxShadow: hovered
            ? `0 16px 40px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.6)`
            : `0 6px 20px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)`,
          transform: hovered ? "scale(1.04)" : "scale(1)",
          transition: "box-shadow 0.2s ease, transform 0.18s ease",
        }}
        onClick={(e) => {
          if (moved.current) { moved.current = false; return; }
          if ((e.target as HTMLElement).closest("button")) return;
          onView(note);
        }}
      >
        {/* Pulsing ring for newly-created notes */}
        {isNew && (
          <div
            className="absolute inset-0 rounded-sm pointer-events-none"
            style={{
              boxShadow: "0 0 0 3px rgba(245,158,11,0.9), 0 0 20px rgba(245,158,11,0.5)",
              animation: "fw-pulse 1s ease-in-out infinite alternate",
            }}
          />
        )}
        {/* Tape */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-4 rounded-sm" style={{ background: "rgba(255,220,120,0.42)", border: "1px solid rgba(255,200,80,0.25)" }} />

        {/* Heart top-right — interactive for others, read-only count for own */}
        {isAuthor ? (
          totalHearts > 0 && (
            <div className="absolute top-1.5 right-2 flex items-center gap-0.5 pointer-events-none opacity-50">
              <Heart size={12} strokeWidth={2} style={{ color: colorScheme.text, fill: "none" }} />
              <span className="text-[9px] font-bold leading-none" style={{ color: colorScheme.text }}>{totalHearts}</span>
            </div>
          )
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onReact(note.id, "❤️"); }}
            className="absolute top-1.5 right-2 flex items-center gap-0.5 transition-all hover:scale-115 active:scale-95"
            title={hasReacted ? "Remove heart" : "Send a heart"}
          >
            <Heart size={13} strokeWidth={2} style={{ color: hasReacted ? "#ef4444" : colorScheme.text, fill: hasReacted ? "#ef4444" : "none", opacity: hasReacted ? 1 : 0.45, transition: "all 0.15s ease" }} />
            {totalHearts > 0 && <span className="text-[9px] font-bold leading-none" style={{ color: hasReacted ? "#ef4444" : colorScheme.text, opacity: hasReacted ? 1 : 0.5 }}>{totalHearts}</span>}
          </button>
        )}

        {/* Timestamp — top, with day name and divider */}
        <div className="mb-2">
          <p className="text-[8.5px] font-medium tabular-nums opacity-50" style={{ color: colorScheme.text }}>
            {new Date(note.createdAt).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
            {" · "}
            {new Date(note.createdAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}
          </p>
          <div className="mt-1.5 h-px w-full opacity-20" style={{ background: colorScheme.text }} />
        </div>

        {/* Message */}
        <div className="overflow-y-auto" style={{ maxHeight: 200, scrollbarWidth: "none" }}>
          <p className="text-xs leading-relaxed break-words whitespace-pre-wrap" style={{ color: colorScheme.text, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 13, lineHeight: 1.6 }}>
            {note.message}
          </p>
        </div>

        {/* Bottom bar */}
        <div className="mt-2.5 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            {/* Full view */}
            <button
              onClick={(e) => { e.stopPropagation(); onView(note); }}
              className={`flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md transition-all [@media(hover:none)]:opacity-70 ${hovered ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover/note:opacity-70"}`}
              style={{ color: colorScheme.text }}
              title="View full note"
            >
              <Maximize2 size={10} strokeWidth={2} />
              <span>Full view</span>
            </button>
            {/* Edit — author only */}
            {isAuthor && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(note); }}
                className={`flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md transition-all ${hovered ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover/note:opacity-70"}`}
                style={{ color: colorScheme.text }}
                title="Edit my note"
              >
                <Pencil size={10} strokeWidth={2} />
                <span>Edit</span>
              </button>
            )}
          </div>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
              className={`p-1 rounded-full transition-all ${hovered ? "opacity-100" : "opacity-0 group-hover/note:opacity-100"} ${isAdmin ? "bg-red-500/20 hover:bg-red-500/40" : "bg-violet-500/20 hover:bg-violet-500/40"}`}
              title={isAdmin ? "Remove note (Admin)" : "Delete my note"}
            >
              <Trash2 size={10} style={{ color: isAdmin ? "#dc2626" : "#8b5cf6" }} />
            </button>
          )}
        </div>


      </div>
    </div>
  );
}

// ── Note Full View Modal ──────────────────────────────────────────────────────
function NoteFullViewModal({ note, sessionToken, isAdmin, onClose, onReact, onDelete, onEdit }: {
  note: FreedomNote; sessionToken: string; isAdmin?: boolean;
  onClose: () => void; onReact: (id: string, emoji: string) => void; onDelete: (id: string) => void;
  onEdit?: (note: FreedomNote) => void;
}) {
  const colorScheme = NOTE_COLORS.find((c) => c.bg === note.color) ?? NOTE_COLORS[0];
  const isAuthor = !!note.authorSessionToken && note.authorSessionToken === sessionToken;
  const canDelete = isAdmin || isAuthor;
  const totalHearts = Object.values(note.reactions).reduce((s, v) => s + v, 0);
  const hasReacted  = note.userReactions.some((r) => r.startsWith(sessionToken + ":"));
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-lg">
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none"><Pin color={isAuthor && !isAdmin ? "#7c3aed" : "#b45309"} /></div>
        <div className="rounded-2xl shadow-2xl pt-6" style={{ background: colorScheme.bg, border: `2px solid ${colorScheme.border}` }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-4 rounded-b-sm" style={{ background: "rgba(255,220,120,0.45)", border: "1px solid rgba(255,200,80,0.3)" }} />
          <div className="flex items-center justify-between px-5 pb-2">
            <div className="flex items-center gap-2">
              {isAuthor && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-600">My note</span>}
              {isAdmin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">Admin view</span>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-black/10 transition-colors" style={{ color: colorScheme.text }}><X size={16} /></button>
          </div>
          <div className="px-6 pb-4 fw-scrollbar" style={{ maxHeight: "60vh" }}>
            {/* Date/time stamp */}
            <p className="text-[11px] font-medium mb-3 opacity-60 border-b pb-2" style={{ color: colorScheme.text, borderColor: colorScheme.border }}>
              {new Date(note.createdAt).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
              {" · "}
              {new Date(note.createdAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true })}
            </p>
            <p className="leading-relaxed break-words whitespace-pre-wrap" style={{ color: colorScheme.text, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.7 }}>{note.message}</p>
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: colorScheme.border }}>
            <div className="flex items-center gap-2">
              {!isAuthor && (
                <button onClick={() => onReact(note.id, "❤️")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95" style={{ background: hasReacted ? "rgba(239,68,68,0.12)" : "rgba(0,0,0,0.06)", border: `1px solid ${hasReacted ? "rgba(239,68,68,0.3)" : colorScheme.border}` }} title={hasReacted ? "Remove heart" : "Send a heart"}>
                  <Heart size={15} strokeWidth={2} style={{ color: hasReacted ? "#ef4444" : colorScheme.text, fill: hasReacted ? "#ef4444" : "none" }} />
                  <span className="text-xs font-semibold" style={{ color: hasReacted ? "#ef4444" : colorScheme.text }}>{totalHearts > 0 ? totalHearts : "Heart"}</span>
                </button>
              )}
              {isAuthor && totalHearts > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.05)", border: `1px solid ${colorScheme.border}` }}>
                  <Heart size={15} strokeWidth={2} style={{ color: colorScheme.text, fill: "none", opacity: 0.4 }} />
                  <span className="text-xs font-semibold opacity-50" style={{ color: colorScheme.text }}>{totalHearts}</span>
                </div>
              )}
              {/* Edit — author only, touch-friendly */}
              {isAuthor && onEdit && (
                <button onClick={() => { onEdit(note); onClose(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
                  <Pencil size={13} style={{ color: "#8b5cf6" }} />
                  <span className="text-xs font-semibold" style={{ color: "#8b5cf6" }}>Edit</span>
                </button>
              )}
            </div>
            {canDelete && (
              <button onClick={() => { onDelete(note.id); onClose(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all hover:scale-105" style={{ background: isAdmin ? "rgba(239,68,68,0.1)" : "rgba(139,92,246,0.1)", border: `1px solid ${isAdmin ? "rgba(239,68,68,0.25)" : "rgba(139,92,246,0.25)"}` }}>
                <Trash2 size={13} style={{ color: isAdmin ? "#dc2626" : "#8b5cf6" }} />
                <span className="text-xs font-semibold" style={{ color: isAdmin ? "#dc2626" : "#8b5cf6" }}>{isAdmin ? "Remove" : "Delete"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Note Modal ───────────────────────────────────────────────────────────
function EditNoteModal({ note, onClose, onSave }: {
  note: FreedomNote; onClose: () => void; onSave: (id: string, msg: string) => void;
}) {
  const colorScheme = NOTE_COLORS.find((c) => c.bg === note.color) ?? NOTE_COLORS[0];
  const [message, setMessage] = useState(note.message);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setTimeout(() => textRef.current?.focus(), 80); }, []);
  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-4 pb-4 sm:pb-0" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[#16161e] rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center"><Pencil size={14} className="text-amber-400" /></div>
            <div><h3 className="text-sm font-bold text-white">Edit your note</h3><p className="text-[11px] text-gray-500">Only you can edit this</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 pb-4">
          <div className="rounded-2xl p-4" style={{ background: colorScheme.bg, border: `1px solid ${colorScheme.border}` }}>
            <textarea ref={textRef} value={message} onChange={(e) => setMessage(e.target.value)}
              className="w-full resize-none bg-transparent outline-none fw-scrollbar"
              style={{ color: colorScheme.text, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 16, lineHeight: 1.7, minHeight: 160, maxHeight: 380 }}
              rows={7}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSave(note.id, message); }}
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-white/10 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => onSave(note.id, message)} disabled={!message.trim() || message.trim() === note.message.trim()}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: message.trim() && message.trim() !== note.message.trim() ? "linear-gradient(135deg, #f59e0b, #d97706)" : undefined, color: message.trim() && message.trim() !== note.message.trim() ? "#1c1917" : undefined }}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Note Modal ────────────────────────────────────────────────────────────
function AddNoteModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (msg: string, color: string) => void }) {
  const [message, setMessage] = useState("");
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].bg);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setTimeout(() => textRef.current?.focus(), 80); }, []);
  const handleSubmit = () => { if (!message.trim()) return; onSubmit(message, selectedColor); onClose(); };
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm px-4 pb-4 sm:pb-0" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[#16161e] rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg">📌</div>
            <div><h3 className="text-sm font-bold text-white">Pin a thought</h3><p className="text-[11px] text-gray-500">Anonymous · No name attached · No limit</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Note Color</p>
            <div className="flex gap-2">
              {NOTE_COLORS.map((c) => (
                <button key={c.bg} onClick={() => setSelectedColor(c.bg)}
                  className="w-8 h-8 rounded-full transition-all hover:scale-110"
                  style={{ background: c.bg, border: selectedColor === c.bg ? `3px solid ${c.border}` : "2px solid transparent", boxShadow: selectedColor === c.bg ? `0 0 0 2px ${c.border}` : "none" }}
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-4 relative" style={{ background: NOTE_COLORS.find((c) => c.bg === selectedColor)?.bg, border: `1px solid ${NOTE_COLORS.find((c) => c.bg === selectedColor)?.border}` }}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Pin color="#b45309" /></div>
            <textarea ref={textRef} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={"Write your thought here…\nShare a prayer, a struggle, a story, or a word of encouragement.\nNo limit — take your time."}
              className="w-full resize-none bg-transparent outline-none placeholder:opacity-40 pt-2"
              style={{ color: NOTE_COLORS.find((c) => c.bg === selectedColor)?.text ?? "#713f12", fontFamily: "'EB Garamond', Georgia, serif", fontSize: 18, lineHeight: 1.7, minHeight: 120, maxHeight: 300 }}
              rows={6}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit(); }}
            />
            <p className="text-[10px] text-right opacity-30 mt-1" style={{ color: NOTE_COLORS.find((c) => c.bg === selectedColor)?.text }}>{message.length} chars</p>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-white/10 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!message.trim()}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: message.trim() ? "linear-gradient(135deg, #f59e0b, #d97706)" : undefined, color: message.trim() ? "#1c1917" : undefined }}>
            📌 Pin it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View All Grid Modal ───────────────────────────────────────────────────────
function ViewAllModal({ notes, sessionToken, isAdmin, onClose, onView, onReact, onDelete }: {
  notes: FreedomNote[]; sessionToken: string; isAdmin?: boolean;
  onClose: () => void; onView: (note: FreedomNote) => void;
  onReact: (id: string, emoji: string) => void; onDelete: (id: string) => void;
}) {
  const sorted = [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="fixed inset-0 z-[350] flex flex-col bg-black/90 backdrop-blur-md" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <LayoutGrid size={20} className="text-amber-400" />
          <div>
            <h2 className="text-sm font-bold text-white">All Pinned Thoughts</h2>
            <p className="text-[11px] text-gray-500">{sorted.length} note{sorted.length !== 1 ? "s" : ""} on the wall</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
            <div className="text-4xl">📌</div>
            <p className="text-white text-sm">No notes yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sorted.map((note) => {
              const color = NOTE_COLORS.find((c) => c.bg === note.color) ?? NOTE_COLORS[0];
              const isAuthor = !!note.authorSessionToken && note.authorSessionToken === sessionToken;
              const canDel = isAdmin || isAuthor;
              const hearts = Object.values(note.reactions).reduce((s, v) => s + v, 0);
              const reacted = note.userReactions.some((r) => r.startsWith(sessionToken + ":"));
              return (
                <div key={note.id}
                  className="relative rounded-2xl p-4 pt-5 flex flex-col cursor-pointer group transition-all hover:scale-[1.02] hover:shadow-2xl"
                  style={{ background: color.bg, border: `1px solid ${color.border}`, minHeight: 200 }}
                  onClick={() => { onView(note); }}
                >
                  {/* Pin */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 pointer-events-none"><Pin color={isAuthor ? "#7c3aed" : "#b45309"} /></div>
                  {/* Tape */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-3 rounded-b-sm" style={{ background: "rgba(255,220,120,0.45)" }} />

                  {/* Heart — top-right corner, same as scattered note */}
                  {isAuthor ? (
                    hearts > 0 && (
                      <div className="absolute top-2 right-3 flex items-center gap-0.5 pointer-events-none opacity-50">
                        <Heart size={12} strokeWidth={2} style={{ color: color.text, fill: "none" }} />
                        <span className="text-[9px] font-bold leading-none" style={{ color: color.text }}>{hearts}</span>
                      </div>
                    )
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onReact(note.id, "❤️"); }}
                      className="absolute top-2 right-3 flex items-center gap-0.5 transition-all hover:scale-115 active:scale-95"
                      title={reacted ? "Remove heart" : "Send a heart"}
                    >
                      <Heart size={13} strokeWidth={2} style={{ color: reacted ? "#ef4444" : color.text, fill: reacted ? "#ef4444" : "none", opacity: reacted ? 1 : 0.45 }} />
                      {hearts > 0 && <span className="text-[9px] font-bold leading-none" style={{ color: reacted ? "#ef4444" : color.text, opacity: reacted ? 1 : 0.5 }}>{hearts}</span>}
                    </button>
                  )}

                  {/* Timestamp — top of card, above message */}
                  <p className="text-[11px] font-medium mb-2 pb-2 border-b" style={{ color: color.text, opacity: 0.55, borderColor: color.border }}>
                    {new Date(note.createdAt).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {new Date(note.createdAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </p>

                  {/* Message */}
                  <div className="flex-1 overflow-hidden">
                    <p className="leading-relaxed break-words whitespace-pre-wrap line-clamp-4"
                      style={{ color: color.text, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 13 }}>
                      {note.message}
                    </p>
                  </div>

                  {/* Bottom actions — hover only, like scattered note */}
                  <div className="flex items-center justify-between mt-2 pt-1">
                    <button onClick={(e) => { e.stopPropagation(); onView(note); }}
                      className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md transition-all opacity-0 group-hover:opacity-70 hover:!opacity-100"
                      style={{ color: color.text }}
                      title="View full note"
                    >
                      <Maximize2 size={10} strokeWidth={2} />
                      <span>Full view</span>
                    </button>
                    {canDel && (
                      <button onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                        className="p-1 rounded-full transition-all opacity-0 group-hover:opacity-100"
                        style={{ background: isAdmin ? "rgba(239,68,68,0.15)" : "rgba(139,92,246,0.15)" }}
                        title={isAdmin ? "Remove (Admin)" : "Delete my note"}
                      >
                        <Trash2 size={10} style={{ color: isAdmin ? "#dc2626" : "#8b5cf6" }} />
                      </button>
                    )}
                  </div>
                </div>



              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export default function FreedomWallView({ isAdmin, currentUserId, onToast }: FreedomWallViewProps) {
  const [notes, setNotes] = useState<FreedomNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showViewAll, setShowViewAll] = useState(false);
  const [viewingNote, setViewingNote] = useState<FreedomNote | null>(null);
  const [editingNote, setEditingNote] = useState<FreedomNote | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Pan state + new-note highlight
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);

  const sessionToken = getSessionToken();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/freedom-wall");
      const data = await res.json();
      if (Array.isArray(data)) setNotes(data);
    } catch { onToast?.("error", "Could not load the Freedom Wall"); }
    finally { setLoading(false); }
  }, [onToast]);

  useEffect(() => {
    fetchNotes();
    const interval = setInterval(fetchNotes, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotes]);

  // ── Center canvas on load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!boardRef.current) return;
    const { clientWidth: w, clientHeight: h } = boardRef.current;
    setPan({ x: w / 2 - CANVAS_W / 2, y: h / 2 - CANVAS_H / 2 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pan to note — centers the note in the viewport ────────────────────────
  const panToNote = useCallback((x: number, y: number) => {
    const board = boardRef.current;
    if (!board) return;
    const noteCanvasX = (x / 100) * CANVAS_W;
    const noteCanvasY = (y / 100) * CANVAS_H;
    const { clientWidth: bw, clientHeight: bh } = board;
    setPan({
      x: bw / 2 - noteCanvasX - 130,
      y: bh / 2 - noteCanvasY - 125,
    });
  }, []);

  // ── Highlight timer: clear glow after 2.5s ────────────────────────────────
  useEffect(() => {
    if (!newNoteId) return;
    const t = setTimeout(() => setNewNoteId(null), 2500);
    return () => clearTimeout(t);
  }, [newNoteId]);


  // ── Pan (mouse) ────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Stop board pan from starting when a note card (or any child) is clicked
    if (target.closest('[data-note-card]') || target.closest('button')) return;
    isPanning.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    isPanning.current = false;
    (e.currentTarget as HTMLElement).style.cursor = "grab";
  };

  // Touch pan
  const lastTouch = useRef({ x: 0, y: 0 });
  const handleTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; lastTouch.current = { x: t.clientX, y: t.clientY }; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - lastTouch.current.x;
    const dy = t.clientY - lastTouch.current.y;
    lastTouch.current = { x: t.clientX, y: t.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  // ── Post a note ────────────────────────────────────────────────────────────
  const handleSubmit = (message: string, colorBg: string) => {
    const seed = Date.now().toString(36);
    const rng = seededRandom(seed);
    const rotation = (rng() - 0.5) * 18;

    const NOTE_W = 270; // note card width px
    const NOTE_H = 250; // note card height px (incl timestamp)
    const MARGIN = 24;  // px away from viewport edge
    const board = boardRef.current;
    let x: number, y: number;

    if (board) {
      const bw = board.clientWidth;
      const bh = board.clientHeight;
      // Visible canvas region = viewport minus pan offset
      const visLeft   = Math.max(0,       -pan.x + MARGIN);
      const visTop    = Math.max(0,       -pan.y + MARGIN);
      const visRight  = Math.min(CANVAS_W, -pan.x + bw - NOTE_W - MARGIN);
      const visBottom = Math.min(CANVAS_H, -pan.y + bh - NOTE_H - MARGIN);
      // Guarantee a valid range even if viewport < note size
      const safeRight  = Math.max(visLeft + 1, visRight);
      const safeBottom = Math.max(visTop  + 1, visBottom);
      x = ((visLeft  + rng() * (safeRight  - visLeft))  / CANVAS_W) * 100;
      y = ((visTop   + rng() * (safeBottom - visTop))   / CANVAS_H) * 100;
    } else {
      x = 4 + rng() * 72;
      y = 4 + rng() * 80;
    }

    const tempId = `temp_${seed}`;
    const formattedMessage = formatNoteText(message);
    const newNote: FreedomNote = { id: tempId, message: formattedMessage, color: colorBg, rotation, x, y, reactions: {}, userReactions: [], authorSessionToken: sessionToken, createdAt: new Date().toISOString() };
    setNotes((prev) => [newNote, ...prev]);
    // Pan to the new note so it's always visible, then highlight it
    panToNote(x, y);
    setNewNoteId(tempId);
    onToast?.("success", "Your thought has been pinned anonymously");

    fetch("/api/freedom-wall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: formattedMessage, color: colorBg, rotation, x, y, authorSessionToken: sessionToken }),
    }).then((res) => { if (!res.ok) throw new Error("Failed"); return res.json(); })
      .then(({ id }) => { setNotes((prev) => prev.map((n) => n.id === tempId ? { ...n, id } : n)); setNewNoteId(id); })
      .catch(() => { setNotes((prev) => prev.filter((n) => n.id !== tempId)); onToast?.("error", "Could not pin your note. Try again."); });
  };

  // ── React ──────────────────────────────────────────────────────────────────
  const handleReact = (noteId: string, emoji: string) => {
    const reactionKey = `${sessionToken}:${emoji}`;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const alreadyReacted = note.userReactions.includes(reactionKey);
    const delta = alreadyReacted ? -1 : 1;
    setNotes((prev) => prev.map((n) => {
      if (n.id !== noteId) return n;
      const newReactions = { ...n.reactions };
      newReactions[emoji] = Math.max(0, (newReactions[emoji] ?? 0) + delta);
      if (newReactions[emoji] === 0) delete newReactions[emoji];
      const newUserReactions = alreadyReacted ? n.userReactions.filter((r) => r !== reactionKey) : [...n.userReactions, reactionKey];
      return { ...n, reactions: newReactions, userReactions: newUserReactions };
    }));
    fetch(`/api/freedom-wall/${noteId}/react`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji, sessionToken }) }).catch(() => fetchNotes());
  };

  // ── Delete (with confirm prompt) ───────────────────────────────────────────
  const handleDelete = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const isAuthor = note.authorSessionToken === sessionToken;
    if (!isAdmin && !isAuthor) { onToast?.("error", "You can only delete your own notes."); return; }
    // Show confirm prompt instead of deleting immediately
    setConfirmDeleteId(noteId);
  };

  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    const noteId = confirmDeleteId;
    setConfirmDeleteId(null);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    fetch(`/api/freedom-wall/${noteId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: !!isAdmin, sessionToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed");
        }
        onToast?.("success", "Note removed");
      })
      .catch((err) => {
        fetchNotes(); // restore if server rejected
        onToast?.("error", `Could not remove note: ${err.message ?? "Unknown error"}`);
      });
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = (noteId: string, newMessage: string) => {
    if (!newMessage.trim()) return;
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, message: newMessage.trim() } : n));
    setEditingNote(null);
    fetch(`/api/freedom-wall/${noteId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: newMessage.trim(), sessionToken }) })
      .then(() => onToast?.("success", "Note updated"))
      .catch(() => { fetchNotes(); onToast?.("error", "Could not update note"); });
  };

  // ── Move (drag-to-reposition, author only) ─────────────────────────────────
  const handleMove = useCallback((noteId: string, newX: number, newY: number) => {
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, x: newX, y: newY } : n));
  }, []);

  // Debounced save after drag ends (we save on mouseup in a debounce)
  const moveSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMoveSave = useCallback((noteId: string, newX: number, newY: number) => {
    if (moveSaveTimer.current) clearTimeout(moveSaveTimer.current);
    moveSaveTimer.current = setTimeout(() => {
      fetch(`/api/freedom-wall/${noteId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: newX, y: newY, sessionToken }),
      }).catch(() => {});
    }, 600);
  }, [sessionToken]);

  const handleMoveAndSave = useCallback((noteId: string, newX: number, newY: number) => {
    handleMove(noteId, newX, newY);
    handleMoveSave(noteId, newX, newY);
  }, [handleMove, handleMoveSave]);


  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Board ─────────────────────────────────────────────────────────── */}
      <div
        ref={boardRef}
        className="relative overflow-hidden flex-1"
        style={{ background: "#0d0d11", backgroundImage: DOT_PATTERN_SVG, backgroundRepeat: "repeat", backgroundSize: "20px 20px", cursor: "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none z-20" style={{ boxShadow: "inset 0 0 100px rgba(0,0,0,0.4)" }} />

        {/* ── Top-left controls — flex row, no overlap ─────────────────── */}
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
          {/* Info */}
          <button onClick={() => setShowAbout(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:scale-110 active:scale-95 flex-shrink-0"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", backdropFilter: "blur(6px)" }}
            title="About Freedom Wall">
            <Info size={16} className="text-amber-400" />
          </button>
          {/* Add */}
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl transition-all hover:scale-105 active:scale-95 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(217,119,6,0.2))", border: "1px solid rgba(245,158,11,0.4)", backdropFilter: "blur(6px)" }}
            title="Pin a thought">
            <Plus size={15} strokeWidth={2.5} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 whitespace-nowrap hidden sm:inline">Add Pinned Thoughts</span>
          </button>
          {/* View All */}
          <button onClick={() => setShowViewAll(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl transition-all hover:scale-105 active:scale-95 flex-shrink-0"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", backdropFilter: "blur(6px)" }}
            title="View all notes">
            <LayoutGrid size={14} className="text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-400 whitespace-nowrap hidden sm:inline">View All</span>
          </button>
        </div>

        {/* Pannable canvas */}
        <div className="absolute" style={{ width: CANVAS_W, height: CANVAS_H, transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "0 0", willChange: "transform" }}>
          {[...notes]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((note, idx, arr) => (
            <React.Fragment key={note.id}>
              <NoteCard note={note} sessionToken={sessionToken} isAdmin={isAdmin}
                onReact={handleReact} onDelete={handleDelete} onView={setViewingNote}
                onEdit={setEditingNote} onMove={handleMoveAndSave} zoom={1}
                isNew={note.id === newNoteId}
                noteRank={idx + 1}
              />
            </React.Fragment>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
              <p className="text-sm text-white/30 font-medium">Loading the wall…</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && notes.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="text-center px-6">
              <div className="text-5xl mb-3 opacity-20">📌</div>
              <p className="text-white/25 text-sm font-medium">The wall is quiet.</p>
              <p className="text-white/18 text-xs mt-1">Be the first to pin a thought.</p>
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center whitespace-nowrap">
          <span className="text-[10px] text-white/20 font-medium tracking-wide">Drag to explore · Tap note to view &amp; act</span>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showAdd && <AddNoteModal onClose={() => setShowAdd(false)} onSubmit={handleSubmit} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showViewAll && (
        <ViewAllModal notes={notes} sessionToken={sessionToken} isAdmin={isAdmin}
          onClose={() => setShowViewAll(false)} onView={(n) => { setViewingNote(n); setShowViewAll(false); }}
          onReact={handleReact} onDelete={handleDelete}
        />
      )}
      {viewingNote && (
        <NoteFullViewModal note={viewingNote} sessionToken={sessionToken} isAdmin={isAdmin}
          onClose={() => setViewingNote(null)} onReact={handleReact} onDelete={handleDelete}
          onEdit={(n) => { setViewingNote(null); setEditingNote(n); }}
        />
      )}
      {editingNote && (
        <EditNoteModal note={editingNote} onClose={() => setEditingNote(null)} onSave={handleEdit} />
      )}

      {/* ── Confirm Delete Modal ───────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-xs bg-[#1a1a24] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center">
                <Trash2 size={22} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete this note?</h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">This will permanently remove it from the wall. This action can't be undone.</p>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2.5">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
