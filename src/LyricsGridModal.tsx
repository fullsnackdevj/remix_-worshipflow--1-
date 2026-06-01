/**
 * LyricsGridModal — ProPresenter-style lyrics slide grid viewer.
 *
 * PURPOSE: A read-only facility for audio/tech operators to see ALL lyric
 * slides for any song at a glance — like ProPresenter's slide grid.
 *
 * ✅ Completely standalone — does NOT modify LiveStageView or any existing code.
 * ✅ Reads live_state/current via onSnapshot to highlight the active slide.
 * ✅ Uses the exact same parseSections() logic as LiveStageView (copy-exact).
 *
 * Props:
 *   songs    — full song list (passed in from parent, same as LiveStageView receives)
 *   onClose  — callback to close the modal
 *   initialSongId? — pre-select a song (e.g. the one currently on Live Stage)
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, LayoutGrid, Radio, Music2, ChevronDown, EyeOff, Zap, Heart, Monitor, Pencil, Check, AlertCircle, Settings, Link, FolderOpen, Plus, Minus, Search, Tent, GripVertical, RefreshCw } from "lucide-react";
import type { Song } from "./types";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import CampReadinessModal from "./CampReadinessModal";

// ── Types (mirrors LiveStageView exactly) ─────────────────────────────────────
type AnimStyle = "word-fade" | "word-bounce" | "typewriter" | "blur-in" | "fade" | "slide-up" | "echo" | "breathe";

interface LyricSlide {
  id: string;
  sectionLabel: string;
  slideNum: number;
  totalSlides: number;
  lines: string[];
  animStyle: AnimStyle;
}
interface LyricSection { label: string; slides: LyricSlide[]; }

interface LiveState {
  songTitle: string;
  lines: string[];
  visible: boolean;
  updatedAt: number;
}

// ── Lyrics parser (exact copy of parseSections from LiveStageView) ─────────────
function cleanLine(l: string) { return l.trimEnd().replace(/[,.]+$/, ""); }
function chunkLines(lines: string[]): string[][] {
  return lines.map(cleanLine).filter(l => l.trim()).map(line => [line]);
}
function parseSections(raw: string): LyricSection[] {
  if (!raw?.trim()) return [];
  const HEADER = /^\s*[\[({]?((verse|pre[\s-]?chorus|chorus|bridge|intro|outro|tag|hook|interlude|refrain|coda|vamp)\s*\d*)[\])}]?:?\s*$/i;
  const rawSecs: { label: string; lines: string[] }[] = [];
  let label = "", buf: string[] = [];
  const flush = () => { const ne = buf.filter(l => l.trim()); if (ne.length && label) rawSecs.push({ label, lines: ne }); buf = []; };
  for (const line of raw.split("\n")) {
    const m = line.match(HEADER);
    if (m) { flush(); label = m[1].trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/Pre\s*-?\s*Chorus/i, "Pre-Chorus"); }
    else buf.push(line);
  }
  flush();
  if (!rawSecs.length) {
    const ne = raw.split("\n").filter(l => l.trim());
    const LBLS = ["Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Bridge", "Chorus 2", "Outro"];
    for (let i = 0; i < ne.length; i += 4) rawSecs.push({ label: LBLS[Math.floor(i / 4)] ?? `Section ${Math.floor(i / 4) + 1}`, lines: ne.slice(i, i + 4) });
  }
  const merged: { label: string; lines: string[] }[] = [];
  for (const sec of rawSecs) {
    const existing = merged.find(m => m.label === sec.label);
    if (existing) { existing.lines.push("", ...sec.lines); }
    else { merged.push({ label: sec.label, lines: [...sec.lines] }); }
  }
  let gIdx = 0;
  return merged.map(sec => {
    const chunks = chunkLines(sec.lines);
    const slides: LyricSlide[] = chunks.map((lines, i) => ({
      id: `slide-${gIdx++}`, sectionLabel: sec.label,
      slideNum: i + 1, totalSlides: chunks.length, lines,
      animStyle: "word-fade" as AnimStyle,
    }));
    return { label: sec.label, slides };
  });
}

// ── Section label bar colors (ProPresenter-inspired) ─────────────────────────
const SECTION_COLORS: Record<string, { bar: string; badge: string; letter: string }> = {};
function sectionBarColor(label: string): { bar: string; badge: string; letter: string } {
  if (SECTION_COLORS[label]) return SECTION_COLORS[label];
  const l = label.toLowerCase();
  if (l.includes("chorus"))  return { bar: "#a855f7", badge: "#7c3aed", letter: "C" };
  if (l.includes("verse"))   {
    const n = label.match(/\d+/)?.[0] ?? "1";
    const bars = ["#2563eb","#0891b2","#059669"];
    const b = bars[(parseInt(n) - 1) % bars.length];
    return { bar: b, badge: b, letter: n === "1" ? "V" : `V${n}` };
  }
  if (l.includes("bridge"))  return { bar: "#16a34a", badge: "#15803d", letter: "B" };
  if (l.includes("pre"))     return { bar: "#d97706", badge: "#b45309", letter: "P" };
  if (l.includes("intro"))   return { bar: "#475569", badge: "#334155", letter: "I" };
  if (l.includes("outro"))   return { bar: "#475569", badge: "#334155", letter: "O" };
  if (l.includes("vamp"))    return { bar: "#475569", badge: "#334155", letter: "V" };
  if (l.includes("tag"))     return { bar: "#db2777", badge: "#9d174d",  letter: "T" };
  if (l.includes("hook"))    return { bar: "#dc2626", badge: "#991b1b",  letter: "H" };
  return { bar: "#4f46e5", badge: "#3730a3", letter: "S" };
}

// ── Checkerboard tile background (like ProPresenter) ─────────────────────────
const CHECKER_BG = `
  repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%)
  0 0 / 16px 16px
`.trim();

// ── Slide card component (standalone so TS can infer prop types) ─────────────
function SlideCard({ slide, globalNum, activeSlideId, onClick, onEdit, songTitle }: {
  slide: LyricSlide;
  globalNum: number;
  activeSlideId: string | null;
  onClick: (slide: LyricSlide, songTitle: string) => void;
  onEdit: () => void;
  songTitle: string;
}) {
  const isActive = slide.id === activeSlideId;
  const { bar, badge, letter } = sectionBarColor(slide.sectionLabel);
  const isFirstInSection = slide.slideNum === 1;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onClick(slide, songTitle)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: CHECKER_BG,
        border: isActive
          ? "2.5px solid #f97316"
          : hovered ? "2px solid rgba(255,255,255,0.25)" : "1.5px solid #2a2a2a",
        borderRadius: 4,
        overflow: "hidden",
        aspectRatio: "16/10",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        boxShadow: isActive
          ? "0 0 0 1px #f97316, 0 0 16px rgba(249,115,22,0.35)"
          : hovered ? "0 0 0 1px rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.5)" : "none",
        transition: "box-shadow 0.15s, border-color 0.15s",
        transform: hovered && !isActive ? "scale(1.018)" : "scale(1)",
      }}
    >
      {isFirstInSection && (
        <div style={{
          position: "absolute", top: 6, left: 6,
          background: badge,
          color: "#fff",
          fontSize: 9, fontWeight: 800,
          padding: "2px 5px",
          borderRadius: 3,
          letterSpacing: "0.04em",
          zIndex: 2,
          maxWidth: "60%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {letter}
        </div>
      )}

      {/* Edit icon — visible on hover, top-right corner */}
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          title="Edit lyrics"
          style={{
            position: "absolute", top: 5, right: 5,
            zIndex: 10,
            width: 22, height: 22,
            borderRadius: 4,
            background: "rgba(99,102,241,0.85)",
            border: "1px solid rgba(99,102,241,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(4px)",
            transition: "background 0.12s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(129,140,248,0.95)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.85)"}
        >
          <Pencil size={11} color="#fff" />
        </button>
      )}

      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 10px 14px",
        textAlign: "center",
      }}>
        {slide.lines.length > 0 ? (
          <p style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 600,
            color: "#e5e7eb",
            lineHeight: 1.55,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "pre-line",
            wordBreak: "break-word",
          }}>
            {slide.lines.join("\n")}
          </p>
        ) : (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", fontStyle: "italic" }}>
            (empty)
          </span>
        )}
      </div>
      <div style={{
        background: bar,
        padding: "3px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.92)",
          letterSpacing: "0.06em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {isFirstInSection ? slide.sectionLabel : ""}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.65)", flexShrink: 0, marginLeft: 4 }}>
          {globalNum}
        </span>
      </div>
    </div>
  );
}

// ── Lyrics Edit Sheet ─────────────────────────────────────────────────────────
function LyricsEditSheet({ song, onClose, onSaved }: {
  song: Song;
  onClose: () => void;
  onSaved: (newLyrics: string) => void;
}) {
  const [draft, setDraft]     = useState(song.lyrics ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);

  const handleSave = async () => {
    if (!draft.trim()) return;
    if (!song.id) { setError("Song ID is missing — cannot save."); return; }
    setSaving(true);
    setError(null);
    try {
      const url = `/api/songs/${song.id}`;
      console.log("[LyricsEdit] PATCH", url);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: draft }),
      });
      const payload = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.log("[LyricsEdit] Response:", res.status, payload);
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setSaved(true);
      onSaved(draft.trim().toUpperCase());
      setTimeout(onClose, 900);
    } catch (err: any) {
      console.error("[LyricsEdit] Save failed:", err);
      setError(err.message ?? "Save failed — check console for details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(92vw, 680px)",
          maxHeight: "88vh",
          display: "flex", flexDirection: "column",
          background: "#0f0f13",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid #1e1e2e",
          background: "#0d0d11",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Pencil size={13} color="#818cf8" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e5e7eb" }}>Edit Lyrics</p>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{song.title}{song.artist ? ` · ${song.artist}` : ""}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={13} color="rgba(255,255,255,0.6)" />
          </button>
        </div>

        {/* Tip bar */}
        <div style={{
          padding: "8px 18px",
          background: "rgba(99,102,241,0.07)",
          borderBottom: "1px solid rgba(99,102,241,0.12)",
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          flexShrink: 0,
        }}>
          Use section headers like <code style={{ color: "#a5b4fc", background: "rgba(99,102,241,0.15)", padding: "0 4px", borderRadius: 3 }}>VERSE 1:</code>{" "}
          <code style={{ color: "#a5b4fc", background: "rgba(99,102,241,0.15)", padding: "0 4px", borderRadius: 3 }}>CHORUS:</code>{" "}
          <code style={{ color: "#a5b4fc", background: "rgba(99,102,241,0.15)", padding: "0 4px", borderRadius: 3 }}>BRIDGE:</code>{" "}
          — blank lines separate slides. Saves to Song Management automatically.
        </div>

        {/* Textarea */}
        <textarea
          value={draft}
          onChange={e => { setDraft(e.target.value); setSaved(false); }}
          spellCheck={false}
          style={{
            flex: 1,
            resize: "none",
            background: "#09090e",
            color: "#e5e7eb",
            border: "none",
            outline: "none",
            padding: "16px 18px",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            fontSize: 12,
            lineHeight: 1.75,
            minHeight: 320,
            maxHeight: "55vh",
          }}
        />

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px",
          borderTop: "1px solid #1e1e2e",
          background: "#0d0d11",
          flexShrink: 0,
          gap: 10,
        }}>
          {error ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 11 }}>
              <AlertCircle size={13} />
              {error}
            </div>
          ) : saved ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#4ade80", fontSize: 11 }}>
              <Check size={13} />
              Saved! Song Management updated.
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
              {draft.split("\n").filter(l => l.trim()).length} lines
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "7px 16px", borderRadius: 7,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              style={{
                padding: "7px 20px", borderRadius: 7,
                background: saved ? "rgba(74,222,128,0.15)" : "rgba(99,102,241,0.85)",
                border: saved ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(99,102,241,0.6)",
                color: saved ? "#4ade80" : "#fff",
                fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
                opacity: saving ? 0.7 : 1,
                transition: "all 0.15s",
              }}
            >
              {saving ? "Saving…" : saved ? <><Check size={12} /> Saved!</> : "Save Lyrics"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface LiveSettings {
  bgIdx: number;
  echoAlign: string;
  echoLines: string;
  echoLineHeight: number;
  lyricsScale: number;
  loopEnabled: boolean;
  bgVideo: unknown | null; // BgVideo object — typed as unknown to avoid importing the full type
  loopInterval: number;
  animStyle: string;
  // Echo advanced + font format — MUST be included or slide clicks wipe them from OBS state
  echoMarquee: boolean;
  bigSmallFont: boolean;
  echoSacredScale: number;
  echoContentScale: number;
  echoFuncScale: number;
  echoAnimDuration: number;
  echoBounce: number;
}

interface Props {
  songs: Song[];           // all songs (for auto-select lookup)
  sceneSongs: Song[];     // only the Scene Playlist songs (for dropdown)
  sceneSongIds?: string[]; // raw IDs — for in-scene check without re-deriving
  onClose: () => void;
  initialSongTitle?: string;
  // Called when lyrics are saved so parent (LiveStageView) can update its selectedSong
  onSongLyricsUpdate?: (songId: string, newLyrics: string) => void;
  onToast?: (message: string, type: string) => void;
  // Scene playlist mutations — wired to LiveStageView's addToScene / removeFromScene
  onAddToScene?: (song: Song) => void;
  onRemoveFromScene?: (songId: string) => void;
  onReorderScene?: (newIds: string[]) => void;
  // Fade / Preset controls mirrored from LiveStageView
  fadeScreenActive?: boolean;
  fadeScreenBg?: unknown;
  onToggleFade?: () => void;
  activePreset?: string;
  presetActivated?: boolean;
  onApplyPreset?: (name: "praise" | "worship") => void;
  liveSettings?: LiveSettings;
  onOpenSettings?: () => void;  // opens the Display Settings modal from grid view
  onCopyObsUrl?: () => void;    // copies online OBS URL (Firestore mode)
  onCopyObsLocalUrl?: () => void; // copies offline OBS URL (SSE / local mode)
  onOpenMediaLibrary?: () => void; // opens the Media Library modal from grid view
  onOpenCampReadiness?: () => void; // opens the Camp Readiness Check modal
  onResetLiveBg?: () => void;       // clears bgVideo from all presets + server + Firestore
  isInline?: boolean; // when true: renders inline filling container instead of fixed overlay
}

export default function LyricsGridModal({
  songs, sceneSongs, sceneSongIds: sceneSongIdsProp = [], onClose, initialSongTitle,
  onSongLyricsUpdate,
  onToast,
  onAddToScene,
  onRemoveFromScene,
  onReorderScene,
  fadeScreenActive, fadeScreenBg, onToggleFade,
  activePreset, presetActivated, onApplyPreset,
  liveSettings,
  onOpenSettings,
  onCopyObsUrl,
  onCopyObsLocalUrl,
  onOpenMediaLibrary,
  onOpenCampReadiness,
  onResetLiveBg,
  isInline = false,
}: Props) {
  const [obsUrlCopied,      setObsUrlCopied]      = useState(false);
  const [obsLocalUrlCopied, setObsLocalUrlCopied] = useState(false);
  const [showCampReady,     setShowCampReady]     = useState(false);
  const [bgResetDone,       setBgResetDone]       = useState(false);

  // ── Left Song Panel state ─────────────────────────────────────────────────
  // Desktop: open by default. Mobile: hidden by default (user can toggle via + button).
  const [showSongPanel,    setShowSongPanel]    = useState(() => window.innerWidth > 1024);
  const [songPanelWidth,   setSongPanelWidth]   = useState(280);
  const [songPanelQuery,   setSongPanelQuery]   = useState("");
  const isSongPanelDraggingRef = useRef(false);
  const songPanelDragStartXRef = useRef(0);
  const songPanelDragStartWRef = useRef(280);

  const handleSongPanelResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isSongPanelDraggingRef.current  = true;
    songPanelDragStartXRef.current  = e.clientX;
    songPanelDragStartWRef.current  = songPanelWidth;
    document.body.style.cursor      = "col-resize";
    document.body.style.userSelect  = "none";
  }, [songPanelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isSongPanelDraggingRef.current) return;
      const delta = e.clientX - songPanelDragStartXRef.current;
      const next  = Math.min(520, Math.max(220, songPanelDragStartWRef.current + delta));
      setSongPanelWidth(next);
    };
    const onUp = () => {
      if (!isSongPanelDraggingRef.current) return;
      isSongPanelDraggingRef.current = false;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  // Filtered songs for the panel search
  const songPanelFiltered = songs.filter(s =>
    s.title.toLowerCase().includes(songPanelQuery.toLowerCase()) ||
    (s.artist ?? "").toLowerCase().includes(songPanelQuery.toLowerCase())
  );
  // When no query: show scene songs first (sorted by position), then all others
  const songPanelDisplay = songPanelQuery.trim()
    ? songPanelFiltered
    : songs;

  // ── "Thinking" state: tracks which song id is mid-add (shows spinner) ───────
  const [addingId, setAddingId] = useState<string | null>(null);
  const handleAddToScene = useCallback((song: Song) => {
    if (addingId === song.id) return; // prevent double-click
    setAddingId(song.id);
    setTimeout(() => {
      onAddToScene?.(song);
      setAddingId(null);
    }, 450);
  }, [addingId, onAddToScene]);

  const handleCopyObsUrl = () => {
    onCopyObsUrl?.();
    setObsUrlCopied(true);
    setTimeout(() => setObsUrlCopied(false), 2000);
  };
  const handleCopyObsLocalUrl = () => {
    onCopyObsLocalUrl?.();
    setObsLocalUrlCopied(true);
    setTimeout(() => setObsLocalUrlCopied(false), 2000);
  };
  const [query, setQuery]               = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedSong, setSelectedSong_] = useState<Song | null>(null);
  // Ref mirrors selectedSong so keyboard handler always has the current song title
  // without re-registering the event listener.
  const selectedSongRef = useRef<Song | null>(null);
  const setSelectedSong = (song: Song | null) => { selectedSongRef.current = song; setSelectedSong_(song); };
  const [sections, setSections_]         = useState<LyricSection[]>([]);
  const [allSlides, setAllSlides_]       = useState<LyricSlide[]>([]);
  const [liveLines, setLiveLines]       = useState<string[]>([]);
  const [liveSongTitle, setLiveSongTitle] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [liveFadeActive, setLiveFadeActive] = useState(false);
  const [liveFadeBg, setLiveFadeBg]         = useState<Record<string, unknown> | null>(null);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [showPreview, setShowPreview]   = useState(true);
  const [previewWidth, setPreviewWidth] = useState(300);
  const [isMobile, setIsMobile]         = useState(() => window.innerWidth <= 640);
  const [editSong, setEditSong]         = useState<Song | null>(null);
  const dropdownRef   = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWRef = useRef(300);

  // Resize handle: drag left/right to adjust preview panel width
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current  = true;
    dragStartXRef.current  = e.clientX;
    dragStartWRef.current  = previewWidth;
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";
  }, [previewWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - e.clientX;
      const next  = Math.min(600, Math.max(200, dragStartWRef.current + delta));
      setPreviewWidth(next);
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current          = false;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
    };
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("resize",    onResize);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("resize",    onResize);
    };
  }, []);

  // ── Arrow-key slide navigation ───────────────────────────────────────────────
  // Left/Up = previous slide, Right/Down = next slide.
  // Uses refs everywhere so the effect never needs to re-attach.
  const allSlidesRef          = useRef<LyricSlide[]>([]);
  const activeSlideRef        = useRef<string | null>(null);
  const handleSlideClickRef   = useRef<((slide: LyricSlide, songTitle: string) => void) | null>(null);
  const handleClearDisplayRef = useRef<(() => void) | null>(null);

  // setSections / setAllSlides wrappers that update refs SYNCHRONOUSLY.
  // This eliminates the stale-closure window that exists when using useEffect
  // to mirror state into refs (arrow key can fire before useEffect runs).
  const setSections = (v: LyricSection[]) => { setSections_(v); };
  const setAllSlides = (v: LyricSlide[]) => { allSlidesRef.current = v; setAllSlides_(v); };

  useEffect(() => { activeSlideRef.current = activeSlideId; }, [activeSlideId]);

  // lastClickedIdRef: when user clicks a slide, we lock activeSlideId to that
  // specific slide for 2s so the Firestore text-match listener can't override
  // it with a different slide that happens to share the same lyrics text.
  const lastClickedIdRef   = useRef<string | null>(null);
  const clickLockTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs always hold latest values — prevents stale closures in handleSlideClick
  const liveSettingsRef   = useRef(liveSettings);
  const fadeActiveRef     = useRef(fadeScreenActive ?? false);
  const fadeScreenBgRef   = useRef(fadeScreenBg);
  useEffect(() => { liveSettingsRef.current = liveSettings; },        [liveSettings]);
  useEffect(() => { fadeActiveRef.current   = fadeScreenActive ?? false; }, [fadeScreenActive]);
  useEffect(() => { fadeScreenBgRef.current = fadeScreenBg; },         [fadeScreenBg]);

  // Strip base64 image-local/video-local blobs before sending to Firestore.
  // These exceed Firestore's 1MB doc limit and are not accessible from OBS
  // (they're session-scoped blob URLs tied to the uploader's browser tab).
  // Falls back to solid black — same behavior as LiveStageView.toFiresafeFadeBg.
  const safeFirestoreFadeBg = (bg: unknown) => {
    if (!bg || typeof bg !== "object") return bg;
    const b = bg as { type?: string };
    if (b.type === "image-local" || b.type === "video-local")
      return { type: "color", color: "#000000" };
    return bg;
  };

  // ── Push slide to OBS — mirrors pushToFirestore fade logic exactly ───────────
  const handleSlideClick = useCallback((slide: LyricSlide, songTitle: string) => {
    // Toggle: clicking the active slide again clears the display
    if (activeSlideRef.current === slide.id) {
      handleClearDisplayRef.current?.();
      return;
    }

    const settings = liveSettingsRef.current;
    const scenePayload = {
      songTitle,
      lines: slide.lines,
      visible: true,
      updatedAt: Date.now(),
      ...(settings ?? {}),
      // animStyle from preset ALWAYS wins over the baked-in slide value
      animStyle: settings?.animStyle ?? slide.animStyle,
    };

    if (fadeActiveRef.current) {
      // Fade is active — pre-load slide data behind the overlay, keep fadeScreen:true
      // so OBS keeps showing the fade and does NOT reveal lyrics (same as pushToFirestore)
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scenePayload, fadeScreen: true, fadeScreenBg: safeFirestoreFadeBg(fadeScreenBgRef.current) }),
      }).catch(() => {});
    } else {
      // Fade is off — push normally, OBS shows the slide
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenePayload),
      }).catch(() => {});
    }

    // Set highlight immediately to the exact clicked slide (before Firestore round-trip)
    setActiveSlideId(slide.id);

    // Lock: prevent the live-state text-match from overriding this for 2s.
    // This stops duplicate-text slides from stealing the highlight.
    lastClickedIdRef.current = slide.id;
    if (clickLockTimerRef.current) clearTimeout(clickLockTimerRef.current);
    clickLockTimerRef.current = setTimeout(() => { lastClickedIdRef.current = null; }, 2000);

    setPushFeedback(slide.id);
    setTimeout(() => setPushFeedback(null), 900);
  }, []); // stable — all live values read via refs

  // Keep ref in sync so the keyboard effect below always calls the latest version
  handleSlideClickRef.current = handleSlideClick;

  // ── Keyboard: arrow keys navigate slides ─────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const slides  = allSlidesRef.current;
      const current = activeSlideRef.current;
      if (slides.length === 0) return;

      let nextIdx = -1;
      const currentIdx = current ? slides.findIndex(s => s.id === current) : -1;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIdx = currentIdx < slides.length - 1 ? currentIdx + 1 : 0;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIdx = currentIdx > 0 ? currentIdx - 1 : slides.length - 1;
      }

      if (nextIdx >= 0 && handleSlideClickRef.current) {
        // Always pass the current song title via ref — prevents stale closure
        // from sending the previous song's title when switching songs rapidly.
        handleSlideClickRef.current(slides[nextIdx], selectedSongRef.current?.title ?? "");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // stable — reads everything via refs, never re-attaches

  // ── Clear Display — mirrors pushToFirestore(null) in LiveStageView ───────────
  const handleClearDisplay = useCallback(() => {
    const settings = liveSettingsRef.current;
    const clearPayload = {
      songTitle: "",
      lines: [],
      animStyle: "word-fade",
      visible: false,
      updatedAt: Date.now(),
      ...(settings ?? {}),
    };
    if (fadeActiveRef.current) {
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...clearPayload, fadeScreen: true, fadeScreenBg: safeFirestoreFadeBg(fadeScreenBgRef.current) }),
      }).catch(() => {});
    } else {
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clearPayload),
      }).catch(() => {});
    }
    setActiveSlideId(null);
  }, []); // stable — all live values read via refs

  // Keep ref in sync so handleSlideClick can call it without a dependency
  handleClearDisplayRef.current = handleClearDisplay;

  // userPickedRef: once the user manually picks from the dropdown, this is true
  // and the effect NEVER overrides their choice again — even when the parent
  // re-renders and passes a new songs/sceneSongs array reference.
  const userPickedRef = useRef(false);

  useEffect(() => {
    if (userPickedRef.current) return;          // user already made a choice — don't override
    // Only auto-select if there's a match inside the Scene Playlist.
    // If the Scene Playlist is empty, stay blank so the user adds songs first.
    if (!initialSongTitle || sceneSongs.length === 0) return;
    const match = sceneSongs.find(s => s.title.toLowerCase() === initialSongTitle.toLowerCase());
    if (match) {
      setSelectedSong(match);
      userPickedRef.current = true;  // lock: once the song is resolved, never override again
    }
  }, [initialSongTitle, sceneSongs]);

  // ── Parse lyrics whenever song changes ──────────────────────────────────────
  useEffect(() => {
    if (!selectedSong) { setSections([]); setAllSlides([]); return; }
    const parsed = parseSections(selectedSong.lyrics ?? "");
    setSections(parsed);
    // setAllSlides also updates allSlidesRef synchronously
    setAllSlides(parsed.flatMap(s => s.slides));
    // Clear active slide when song changes so keyboard starts from the beginning
    setActiveSlideId(null);
    activeSlideRef.current = null;
  }, [selectedSong]);

  // ── Firestore live_state listener ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "live_state", "current"),
      snap => {
        setLiveConnected(true);
        if (!snap.exists()) return;
        const d = snap.data() as LiveState;
        setLiveSongTitle(d.songTitle ?? "");
        setLiveLines(d.visible ? (d.lines ?? []) : []);
        // Sync fade screen state for the preview panel
        setLiveFadeActive(!!(d as Record<string, unknown>).fadeScreen);
        setLiveFadeBg((d as Record<string, unknown>).fadeScreenBg as Record<string, unknown> ?? null);
      },
      () => setLiveConnected(false)
    );
    return () => unsub();
  }, []);

  // ── Match live lines → a slide id ────────────────────────────────────────────
  // Suppressed for 2s after a user click so duplicate-text slides don't steal
  // the highlight from the one the user actually clicked.
  useEffect(() => {
    if (lastClickedIdRef.current) return; // click lock active — don't override
    if (!liveLines.length || !allSlides.length) { setActiveSlideId(null); return; }
    const liveJoined = liveLines.join("\n").toLowerCase().trim();
    const match = allSlides.find(s =>
      s.lines.join("\n").toLowerCase().trim() === liveJoined
    );
    setActiveSlideId(match?.id ?? null);
  }, [liveLines, allSlides]);

  // ── Close dropdown on outside click ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Close on Escape ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);


  // ── Determine preset type from song tags (mirrors LiveStageView) ────────────
  const resolvePresetFromSong = (song: Song): "praise" | "worship" | null => {
    const names = (song.tags ?? []).map((t: { name: string }) => t.name.toLowerCase());
    if (names.some((n: string) => n.includes("joyful")))  return "praise";
    if (names.some((n: string) => n.includes("solemn")))  return "worship";
    return null;
  };

  const filteredSongs = songs.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase()) ||
    (s.artist ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectSong = useCallback((song: Song) => {
    userPickedRef.current = true;
    setDropdownOpen(false);
    setQuery("");

    // 1. Flash to black so the transition feels seamless
    const settings = liveSettingsRef.current;
    if (fadeActiveRef.current) {
      // Fade screen is on — just pre-load empty slide behind overlay, no visible transition needed
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songTitle: "", lines: [], visible: false,
          fadeScreen: true, fadeScreenBg: safeFirestoreFadeBg(fadeScreenBgRef.current),
          updatedAt: Date.now(), ...(settings ?? {}),
        }),
      }).catch(() => {});
      setActiveSlideId(null);
      setSelectedSong(song);
    } else {
      // Fade is off — push transitioning (fade to black), then clear, then switch song
      fetch("/api/live-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitioning: true, updatedAt: Date.now() }),
      }).catch(() => {});
      setActiveSlideId(null);
      setTimeout(() => {
        // 2. After fade completes — push clear (visible:false) with new song context
        fetch("/api/live-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            songTitle: "", lines: [], visible: false,
            updatedAt: Date.now(), ...(settings ?? {}),
          }),
        }).catch(() => {});
        // 3. Switch the UI to the new song
        setSelectedSong(song);
      }, 550);
    }

    // Auto-apply scene preset based on song tags
    if (onApplyPreset) {
      const resolved = resolvePresetFromSong(song);
      if (resolved && resolved !== activePreset) {
        onApplyPreset(resolved);
      }
    }
  }, [onApplyPreset, activePreset, resolvePresetFromSong]);


  return (
    /* Outer wrapper — fixed overlay when modal, flex-fill when inline */
    <div
      onClick={isInline ? undefined : e => { if (e.target === e.currentTarget) onClose(); }}
      style={isInline ? {
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", minHeight: 0,
        background: "var(--wf-surface, #07090f)",
      } : {
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Camp Readiness Modal — rendered INSIDE grid overlay so it appears on top */}
      {showCampReady && <CampReadinessModal onClose={() => setShowCampReady(false)} />}
      {/* ── Top toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "#111",
        borderBottom: "1px solid #222",
        padding: "0 20px",
        minHeight: 52,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
        overflow: "visible",
      }} className="lgm-toolbar">
        {/* Icon + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 4 }}>
          <Radio size={20} color="rgba(255,255,255,0.85)" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e5e7eb", letterSpacing: "-0.01em" }}>
            Live Stage
          </span>
        </div>

        {/* Camp Readiness Check — right next to title */}
        {onOpenCampReadiness && (
          <button
            onClick={() => setShowCampReady(true)}
            title="Camp Readiness Check — verify offline mode is ready"
            style={{
              height: 34, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "0 13px",
              cursor: "pointer", transition: "all 0.15s",
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.35)",
              color: "rgba(16,185,129,0.9)",
              fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,0.22)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,0.10)"}
          >
            <Tent size={14} />
            <span>Camp Ready</span>
          </button>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Slide count */}
        {allSlides.length > 0 && (
          <span className="lgm-slide-count" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: 500, flexShrink: 0 }}>
            {allSlides.length} slides
          </span>
        )}


        {/* Close — hidden in inline mode (no default view to return to) */}
        {!isInline && <button
          onClick={onClose}
          className="lgm-close-btn"
          style={{
            width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={16} color="rgba(255,255,255,0.7)" />
        </button>}
      </div>

      {/* ── Fade / Preset control strip — mirrors LiveStageView exactly ──────── */}
      {(onToggleFade || onApplyPreset) && (
        <div
          className="lgm-toolbar-row2"
          style={{
            background: "#0d0d0d",
            borderBottom: "1px solid #1e1e1e",
            padding: "0 20px",
            height: 52,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {/* ── Unified icon button group: Fade · Praise · Worship · Monitor ── */}
          {/* Base style matches Monitor: borderRadius 8, same inactive muted state  */}
          {/* Active accent: Fade=white, Praise=amber, Worship=violet, Monitor=indigo */}

          {/* '+' Song Panel toggle — leftmost icon button */}
          <button
            onClick={() => setShowSongPanel(v => !v)}
            className="lgm-icon-btn"
            title={showSongPanel ? "Hide Scene Playlist" : "Add Songs to Scene Playlist"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              cursor: "pointer", transition: "all 0.15s",
              background: showSongPanel ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.04)",
              border: showSongPanel ? "1px solid rgba(52,211,153,0.55)" : "1px solid rgba(255,255,255,0.09)",
              color: showSongPanel ? "#34d399" : "rgba(255,255,255,0.5)",
            }}
          >
            <Plus size={16} />
          </button>

          {onToggleFade && (
            <button
              onClick={onToggleFade}
              className="lgm-icon-btn"
              title={fadeScreenActive ? "OBS Faded — click to reveal" : "Fade OBS Screen"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                cursor: "pointer", transition: "all 0.15s",
                background: fadeScreenActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)",
                border: fadeScreenActive ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.09)",
                color: fadeScreenActive ? "#fff" : "rgba(255,255,255,0.5)",
              }}
            >
              <EyeOff size={16} />
            </button>
          )}

          {onApplyPreset && (["praise", "worship"] as const).map(name => {
            const isActive = presetActivated && activePreset === name;
            const Icon     = name === "praise" ? Zap : Heart;
            const label    = name === "praise" ? "Praise" : "Worship";
            const accent   = name === "praise"
              ? { bg: "rgba(251,191,36,0.18)",  border: "rgba(251,191,36,0.5)",  color: "#fbbf24" }
              : { bg: "rgba(167,139,250,0.18)", border: "rgba(167,139,250,0.5)", color: "#a78bfa" };
            return (
              <button key={name}
                onClick={() => onApplyPreset(name)}
                className="lgm-icon-btn"
                title={label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  cursor: "pointer", transition: "all 0.15s",
                  background: isActive ? accent.bg  : "rgba(255,255,255,0.04)",
                  border:     isActive ? `1px solid ${accent.border}` : "1px solid rgba(255,255,255,0.09)",
                  color:      isActive ? accent.color : "rgba(255,255,255,0.5)",
                }}
              >
                <Icon size={16} />
              </button>
            );
          })}

          {/* Song selector — full flex fill between icons and monitor button */}
          <div ref={dropdownRef} style={{ position: "relative", flex: 1, minWidth: 0 }} className="lgm-dropdown">
            <button
              onClick={() => setDropdownOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                height: 36, padding: "0 12px",
                borderRadius: 8,
                background: dropdownOpen ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)",
                border: dropdownOpen ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.09)",
                cursor: "pointer", width: "100%", textAlign: "left",
                transition: "all 0.18s", gap: 8,
              }}
            >
              <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: selectedSong ? "#fff" : "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>
                  {selectedSong ? selectedSong.title : sceneSongs.length === 0 ? "Add songs to Scene Playlist first" : "Select a song…"}
                </span>
                {selectedSong?.artist && (
                  <span className="lgm-dropdown-artist" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {selectedSong.artist}
                  </span>
                )}
              </div>
              <div style={{ flexShrink: 0, color: "rgba(255,255,255,0.4)", transition: "transform 0.2s", transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                <ChevronDown size={13} />
              </div>
            </button>

            {dropdownOpen && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0, right: 0,
                background: "rgba(10,10,20,0.98)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
                zIndex: 1000,
                maxHeight: 300,
                overflowY: "auto",
                boxShadow: "0 12px 40px rgba(0,0,0,0.85)",
              }}>
                {sceneSongs.length === 0 ? (
                  <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12 }}>Add songs to your Scene Playlist first</div>
                ) : sceneSongs.map(song => {
                  const isActive = selectedSong?.id === song.id;
                  const resolved = resolvePresetFromSong(song);
                  const isPraise = resolved === "praise", isWorship = resolved === "worship";
                  return (
                    <button key={song.id} onClick={() => handleSelectSong(song)}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: isActive ? "rgba(99,102,241,0.18)" : "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)", border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)" }}>
                        {isPraise ? <Zap size={11} color="#fbbf24" /> : isWorship ? <Heart size={11} color="#a78bfa" /> : <Music2 size={11} color="#818cf8" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: isActive ? 700 : 600, color: isActive ? "#a5b4fc" : "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song.title}</p>
                        {song.artist && <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song.artist}</p>}
                      </div>
                      {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Monitor / Live Preview — indigo accent */}
          {/* Media Library — green accent, before OBS Online */}
          {onOpenMediaLibrary && (
            <button
              onClick={onOpenMediaLibrary}
            className="lgm-labeled-btn"
              title="Media Library"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 36, padding: "0 13px", borderRadius: 8, flexShrink: 0,
                cursor: "pointer", transition: "all 0.15s",
                background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.28)",
                color: "#34d399",
                fontSize: 12, fontWeight: 600,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.18)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.08)"}
            >
              <FolderOpen size={15} />
              <span className="lgm-btn-label">Media Library</span>
            </button>
          )}

          {/* OBS Link — before Live Preview, same rounded-square style */}
          {(onCopyObsUrl || onCopyObsLocalUrl) && (
            <>
              <button
                onClick={handleCopyObsUrl}
                className="lgm-labeled-btn"
                title="Copy OBS Browser Source URL (Online — Firestore)"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  height: 36, padding: "0 13px", borderRadius: 8, flexShrink: 0,
                  cursor: "pointer", transition: "all 0.15s",
                  background: obsUrlCopied ? "rgba(52,211,153,0.12)" : "rgba(167,139,250,0.10)",
                  border: obsUrlCopied ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(167,139,250,0.30)",
                  color: obsUrlCopied ? "#34d399" : "#c4b5fd",
                  fontSize: 12, fontWeight: 600,
                }}
                onMouseEnter={e => !obsUrlCopied && ((e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.22)")}
                onMouseLeave={e => !obsUrlCopied && ((e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.10)")}
              >
                {obsUrlCopied ? <><Check size={15} /> <span className="lgm-btn-label">Copied!</span></> : <><Link size={15} /> <span className="lgm-btn-label">OBS Online</span></>}
              </button>
              <button
                onClick={handleCopyObsLocalUrl}
                className="lgm-labeled-btn"
                title="Copy OBS Browser Source URL (Offline / Local — SSE mode)"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  height: 36, padding: "0 13px", borderRadius: 8, flexShrink: 0,
                  cursor: "pointer", transition: "all 0.15s",
                  background: obsLocalUrlCopied ? "rgba(52,211,153,0.12)" : "rgba(251,146,60,0.10)",
                  border: obsLocalUrlCopied ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(251,146,60,0.35)",
                  color: obsLocalUrlCopied ? "#34d399" : "#fb923c",
                  fontSize: 12, fontWeight: 600,
                }}
                onMouseEnter={e => !obsLocalUrlCopied && ((e.currentTarget as HTMLElement).style.background = "rgba(251,146,60,0.20)")}
                onMouseLeave={e => !obsLocalUrlCopied && ((e.currentTarget as HTMLElement).style.background = "rgba(251,146,60,0.10)")}
              >
                {obsLocalUrlCopied ? <><Check size={15} /> <span className="lgm-btn-label">Copied!</span></> : <><Link size={15} /> <span className="lgm-btn-label">OBS Offline</span></>}
              </button>
            </>
          )}

          {/* Live Preview toggle */}
          <button
            onClick={() => setShowPreview(v => !v)}
            className="lgm-labeled-btn"
            title={showPreview ? "Hide live preview" : "Show live screen"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 36, padding: "0 13px", borderRadius: 8, flexShrink: 0,
              cursor: "pointer", transition: "all 0.15s",
              background: showPreview ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.04)",
              border: showPreview ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.09)",
              color: showPreview ? "#a5b4fc" : "rgba(255,255,255,0.5)",
              fontSize: 12, fontWeight: 600,
            }}
          >
            <Monitor size={15} />
            <span className="lgm-btn-label">Live Preview</span>
          </button>

          {/* Reset BG — clears bgVideo from all presets (localStorage), server, and Firestore */}
          <button
            onClick={() => {
              onResetLiveBg?.();
              setBgResetDone(true);
              setTimeout(() => setBgResetDone(false), 2500);
            }}
            className="lgm-labeled-btn"
            title="Clear stale OBS background cache — forces OBS to reload the correct scene background"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 36, padding: "0 13px", borderRadius: 8, flexShrink: 0,
              cursor: "pointer", transition: "all 0.15s",
              background: bgResetDone ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.08)",
              border: bgResetDone ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(248,113,113,0.28)",
              color: bgResetDone ? "#34d399" : "#fca5a5",
              fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => !bgResetDone && ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.18)")}
            onMouseLeave={e => !bgResetDone && ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.08)")}
          >
            {bgResetDone
              ? <><Check size={15} /><span className="lgm-btn-label">Cleared!</span></>
              : <><RefreshCw size={15} /><span className="lgm-btn-label">Reset BG</span></>}
          </button>

          {/* Settings — purple accent, same rounded-square style as Live Preview */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="lgm-labeled-btn"
              title="Display Settings"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 36, padding: "0 13px", borderRadius: 8, flexShrink: 0,
                cursor: "pointer", transition: "all 0.15s",
                background: "rgba(167,139,250,0.10)",
                border: "1px solid rgba(167,139,250,0.30)",
                color: "#c4b5fd",
                fontSize: 12, fontWeight: 600,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.22)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.10)"}
            >
              <Settings size={15} />
              <span className="lgm-btn-label">Settings</span>
            </button>
          )}

        </div>
      )}

      {/* ── Section tab strip ────────────────────────────────────────────────── */}
      {sections.length > 0 && (
        <div style={{
          background: "#0d0d0d",
          borderBottom: "1px solid #1e1e1e",
          padding: "0 16px",
          display: "flex",
          gap: 4,
          overflowX: "auto",
          flexShrink: 0,
          height: 36,
          alignItems: "center",
        }} className="lgm-section-tabs">
          {sections.map(sec => {
            const { bar } = sectionBarColor(sec.label);
            const hasActiveLive = sec.slides.some(s => s.id === activeSlideId);
            return (
              <a
                key={sec.label}
                href={`#section-${sec.label.replace(/\s+/g, "-")}`}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 10px",
                  background: hasActiveLive ? `${bar}22` : "transparent",
                  border: `1px solid ${hasActiveLive ? bar : "transparent"}`,
                  borderRadius: 20,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: bar, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: hasActiveLive ? "#e5e7eb" : "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
                  {sec.label.toUpperCase()}
                </span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
                  {sec.slides.length}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {/* ── Mobile top live preview (shown above slides on mobile) ───── */}
      {showPreview && isMobile && (
        <div style={{
          flexShrink: 0,
          background: "#080808",
          borderBottom: "1px solid #1e1e1e",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "6px 12px",
            borderBottom: "1px solid #1a1a1a",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: liveConnected ? "#22c55e" : "#ef4444",
              }} data-lgm-pulse />
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>LIVE SCREEN</span>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 2, lineHeight: 0 }}
            >
              <X size={12} />
            </button>
          </div>
          {/* Scaled preview — full width, 16:9 */}
          <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", background: "#000", overflow: "hidden" }}>
            <iframe
              src="/live-display?preview=1"
              title="Live Screen Preview"
              style={{
                position: "absolute", top: 0, left: 0,
                width: "1920px", height: "1080px",
                transform: `scale(${window.innerWidth / 1920})`,
                transformOrigin: "top left",
                border: "none", pointerEvents: "none", background: "#000",
              }}
            />
            {/* Fade screen overlay — mirrors what OBS shows, sourced directly from Firestore */}
            {liveFadeActive && liveFadeBg && (() => {
              const bg = liveFadeBg as { type?: string; url?: string; color?: string; videoId?: string };
              return (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 10,
                  transition: "opacity 0.4s ease",
                  opacity: liveFadeActive ? 1 : 0,
                  overflow: "hidden",
                }}>
                  {(bg.type === "image-firebase" || bg.type === "image-url" || bg.type === "image-local") && bg.url && (
                    <img src={bg.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  {(bg.type === "video-firebase" || bg.type === "video-local") && bg.url && (
                    <video src={bg.url} autoPlay muted loop style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  {bg.type === "color" && bg.color && (
                    <div style={{ width: "100%", height: "100%", background: bg.color }} />
                  )}
                  {(!bg.type || !bg.url) && (
                    <div style={{ width: "100%", height: "100%", background: "#000" }} />
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Body: slide grid + optional panels ──────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ── LEFT Song Panel ──────────────────────────────────────────────── */}
        {showSongPanel && (
          <>
            <div style={isMobile ? {
              /* Mobile: full-screen overlay so grid stays usable */
              position: "absolute", inset: 0, zIndex: 50,
              background: "#080810",
              display: "flex", flexDirection: "column", overflow: "hidden",
            } : {
              /* Desktop: side panel */
              width: songPanelWidth, flexShrink: 0,
              background: "#080810",
              borderRight: "1px solid #1e1e2e",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {/* Mobile close row */}
              {isMobile && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px", borderBottom: "1px solid #1a1a2e", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Scene Playlist</span>
                  <button onClick={() => setShowSongPanel(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}>
                    <X size={14} />
                  </button>
                </div>
              )}
              {/* Panel Header / Search */}
              <div style={{
                padding: isMobile ? "14px 16px 12px" : "10px 14px 8px",
                borderBottom: "1px solid #1a1a2e",
                flexShrink: 0,
              }}>
                <div style={{ position: "relative" }}>
                  <Search size={isMobile ? 16 : 12} style={{ position: "absolute", left: isMobile ? 14 : 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
                  <input
                    value={songPanelQuery}
                    onChange={e => setSongPanelQuery(e.target.value)}
                    placeholder="Search songs…"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      paddingLeft: isMobile ? 42 : 30,
                      paddingRight: songPanelQuery ? (isMobile ? 40 : 28) : 10,
                      paddingTop: isMobile ? 13 : 8, paddingBottom: isMobile ? 13 : 8,
                      borderRadius: isMobile ? 14 : 10,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      color: "#fff", fontSize: isMobile ? 15 : 12, outline: "none",
                      transition: "border 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLInputElement).style.border = "1px solid rgba(52,211,153,0.4)"}
                    onBlur={e => (e.target as HTMLInputElement).style.border = "1px solid rgba(255,255,255,0.09)"}
                  />
                  {songPanelQuery && (
                    <button onClick={() => setSongPanelQuery("")}
                      style={{ position: "absolute", right: isMobile ? 12 : 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 0, display: "flex" }}>
                      <X size={isMobile ? 16 : 12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Scene Playlist sub-header — hidden on mobile (already shown in close row) */}
              {!songPanelQuery.trim() && !isMobile && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 14px 6px",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>Scene Playlist</span>
                  {sceneSongs.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)", color: "#818cf8" }}>
                      {sceneSongs.length} song{sceneSongs.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}
              {/* Mobile: show song count under search */}
              {!songPanelQuery.trim() && isMobile && sceneSongs.length > 0 && (
                <div style={{ padding: "8px 16px 4px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>Scene Playlist</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)", color: "#818cf8" }}>
                    {sceneSongs.length} song{sceneSongs.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {songPanelQuery.trim() && (
                <div style={{ padding: "8px 14px 4px", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
                    {songPanelFiltered.length} result{songPanelFiltered.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* Song list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px 10px" }}>
                {/* Empty scene state */}
                {!songPanelQuery.trim() && sceneSongs.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "32px 16px", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", margin: "4px 0" }}>
                    <Music2 size={22} color="rgba(255,255,255,0.1)" />
                    <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", lineHeight: 1.5 }}>
                      Search songs above<br />and tap <strong style={{ color: "rgba(52,211,153,0.7)" }}>+</strong> to add them
                    </p>
                  </div>
                )}

                {/* Scene songs (shown when no query) — drag-and-drop reorderable */}
                {!songPanelQuery.trim() && (() => {
                  // ── Drag-and-drop refs (stable across renders, no useState re-renders) ──
                  // We use a module-level ref object keyed per list render.
                  const dragIdxRef = { current: -1 }; // index being dragged
                  const overIdxRef = { current: -1 };  // index hovered over

                  return sceneSongs.map((song, idx) => {
                    const names = (song.tags ?? []).map((t: { name: string }) => t.name.toLowerCase());
                    const isPraise = names.some((n: string) => n.includes("joyful"));
                    const isWorship = names.some((n: string) => n.includes("solemn"));
                    const iconSize = isMobile ? 44 : 30;
                    const iconInner = isMobile ? 16 : 12;

                    return (
                      <div
                        key={song.id}
                        draggable
                        onDragStart={e => {
                          dragIdxRef.current = idx;
                          e.dataTransfer.effectAllowed = "move";
                          // Ghost: clone the row so native ghost looks clean
                          const el = e.currentTarget as HTMLElement;
                          e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
                          // Slight opacity on source
                          setTimeout(() => { el.style.opacity = "0.45"; }, 0);
                        }}
                        onDragEnd={e => {
                          (e.currentTarget as HTMLElement).style.opacity = "1";
                          // Clear any lingering drop-line on all items
                          document.querySelectorAll(".lgm-scene-item").forEach(el => {
                            (el as HTMLElement).style.borderTop = "";
                            (el as HTMLElement).style.borderBottom = "";
                          });
                          dragIdxRef.current = -1;
                          overIdxRef.current = -1;
                        }}
                        onDragOver={e => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          const el = e.currentTarget as HTMLElement;
                          const rect = el.getBoundingClientRect();
                          const isTop = e.clientY < rect.top + rect.height / 2;
                          overIdxRef.current = isTop ? idx : idx + 1;
                          // Visual drop indicator
                          document.querySelectorAll(".lgm-scene-item").forEach(item => {
                            (item as HTMLElement).style.borderTop = "";
                            (item as HTMLElement).style.borderBottom = "";
                          });
                          if (isTop) {
                            el.style.borderTop = "2px solid rgba(99,102,241,0.8)";
                          } else {
                            el.style.borderBottom = "2px solid rgba(99,102,241,0.8)";
                          }
                        }}
                        onDragLeave={e => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.borderTop = "";
                          el.style.borderBottom = "";
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          const el = e.currentTarget as HTMLElement;
                          el.style.borderTop = "";
                          el.style.borderBottom = "";
                          const from = dragIdxRef.current;
                          const to   = overIdxRef.current;
                          if (from < 0 || from === to || from === to - 1) return;
                          // Build new order
                          const ids = sceneSongs.map(s => s.id);
                          const [moved] = ids.splice(from, 1);
                          // Adjust target index after splice
                          const insertAt = to > from ? to - 1 : to;
                          ids.splice(insertAt, 0, moved);
                          onReorderScene?.(ids);
                        }}
                        className="lgm-scene-item"
                        style={{
                          display: "flex", alignItems: "center",
                          gap: isMobile ? 12 : 8,
                          padding: isMobile ? "14px 16px" : "9px 10px",
                          borderRadius: isMobile ? 14 : 10,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          marginBottom: isMobile ? 8 : 4,
                          transition: "background 0.12s, opacity 0.15s",
                          cursor: "grab",
                          userSelect: "none",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                      >
                        {/* Drag handle */}
                        <div
                          title="Drag to reorder"
                          style={{
                            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            width: isMobile ? 24 : 16, color: "rgba(255,255,255,0.18)",
                            cursor: "grab",
                          }}
                        >
                          <GripVertical size={isMobile ? 18 : 14} />
                        </div>

                        {/* Song icon */}
                        <div style={{
                          width: iconSize, height: iconSize, borderRadius: isMobile ? 12 : 8,
                          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)",
                          border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)",
                        }}>
                          {isPraise ? <Zap size={iconInner} color="#fbbf24" /> : isWorship ? <Heart size={iconInner} color="#a78bfa" /> : <Music2 size={iconInner} color="#818cf8" />}
                        </div>

                        {/* Title + artist */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: isMobile ? 14 : 12, fontWeight: 600, color: "rgba(255,255,255,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {song.title}
                          </p>
                          {song.artist && (
                            <p style={{ margin: 0, fontSize: isMobile ? 12 : 10, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {song.artist}
                            </p>
                          )}
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={e => { e.stopPropagation(); onRemoveFromScene?.(song.id); }}
                          title="Remove from scene"
                          style={{
                            flexShrink: 0,
                            width: isMobile ? 34 : 26, height: isMobile ? 34 : 26,
                            borderRadius: isMobile ? 10 : 8,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.18)",
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.22)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,68,68,0.4)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,68,68,0.18)"; }}
                        >
                          <Minus size={isMobile ? 14 : 12} color="#f87171" />
                        </button>
                      </div>
                    );
                  });
                })()}

                {/* Search results — only shown when user has typed a query */}
                {songPanelQuery.trim() && songPanelFiltered.length === 0 && (
                  <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.15)", padding: "32px 0" }}>No songs found</p>
                )}

                {/* All songs shown ONLY in search mode */}
                {songPanelQuery.trim() && songPanelFiltered.map(song => {
                  const names = (song.tags ?? []).map((t: { name: string }) => t.name.toLowerCase());
                  const isPraise = names.some((n: string) => n.includes("joyful"));
                  const isWorship = names.some((n: string) => n.includes("solemn"));
                  const inScene = sceneSongIdsProp.includes(song.id);
                  return (
                    <div key={song.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, marginBottom: 4,
                      background: inScene ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.03)",
                      border: inScene ? "1px solid rgba(99,102,241,0.22)" : "1px solid rgba(255,255,255,0.05)",
                      transition: "all 0.15s" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)",
                        border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)" }}>
                        {isPraise ? <Zap size={12} color="#fbbf24" /> : isWorship ? <Heart size={12} color="#a78bfa" /> : <Music2 size={12} color="#818cf8" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: inScene ? "rgba(165,180,252,0.9)" : "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song.title}</p>
                        {song.artist && <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song.artist}</p>}
                      </div>
                      {inScene ? (
                        <button onClick={() => onRemoveFromScene?.(song.id)} title="Remove from scene"
                          style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", cursor: "pointer", transition: "all 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.22)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,68,68,0.4)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.2)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.4)"; }}>
                          <Check size={12} color="#a5b4fc" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToScene(song)}
                          title="Add to scene playlist"
                          disabled={addingId === song.id}
                          style={{
                            flexShrink: 0, width: 26, height: 26, borderRadius: 8,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: addingId === song.id ? "rgba(251,191,36,0.15)" : "rgba(52,211,153,0.08)",
                            border: addingId === song.id ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(52,211,153,0.25)",
                            cursor: addingId === song.id ? "wait" : "pointer",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { if (addingId !== song.id) { (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.22)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(52,211,153,0.5)"; } }}
                          onMouseLeave={e => { if (addingId !== song.id) { (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(52,211,153,0.25)"; } }}
                        >
                          {addingId === song.id ? (
                            /* Thinking spinner */
                            <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: "lgm-spin 0.7s linear infinite" }}>
                              <circle cx="6" cy="6" r="4.5" fill="none" stroke="rgba(251,191,36,0.25)" strokeWidth="1.5" />
                              <path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <Plus size={12} color="#34d399" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right-side drag handle — desktop only */}
            {!isMobile && (
              <div
                onMouseDown={handleSongPanelResizeMouseDown}
                style={{
                  width: 5, flexShrink: 0, cursor: "col-resize",
                  background: "#1e1e2e", transition: "background 0.15s",
                  position: "relative", zIndex: 5,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#34d399"; }}
                onMouseLeave={e => { if (!isSongPanelDraggingRef.current) (e.currentTarget as HTMLElement).style.background = "#1e1e2e"; }}
              >
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", gap: 3 }}>
                  {[0,1,2].map(i => (<div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />))}
                </div>
              </div>
            )}
          </>
        )}


      {/* ── Main slide grid ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: 16,
        background: "#0a0a0a",
        minWidth: 0,
      }} className="lgm-grid-padding">
        {!selectedSong ? (
          /* Empty state */
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
          }}>
            <LayoutGrid size={48} color="rgba(255,255,255,0.08)" />
            <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
              Select a song to view slides
            </p>
            {liveSongTitle && (
              <button
                onClick={() => {
                  const match = songs.find(s => s.title.toLowerCase() === liveSongTitle.toLowerCase());
                  if (match) setSelectedSong(match);
                }}
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8,
                  padding: "6px 14px",
                  color: "#fca5a5",
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
                Load live: {liveSongTitle}
              </button>
            )}
          </div>
        ) : allSlides.length === 0 ? (
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.25)" }}>
              No lyrics found for this song
            </p>
          </div>
        ) : (
          /* Section groups */
          sections.map((sec, sIdx) => {
            const { bar } = sectionBarColor(sec.label);
            // global slide numbers — need offset from previous sections
            const prevCount = sections.slice(0, sIdx).reduce((a, s) => a + s.slides.length, 0);

            return (
              <div
                key={sec.label}
                id={`section-${sec.label.replace(/\s+/g, "-")}`}
                style={{ marginBottom: 20 }}
              >
                {/* Section header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: bar, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {sec.label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>
                    {sec.slides.length} slide{sec.slides.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Slide grid */}
                <div
                  className="lgm-slide-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 8,
                  }}
                >
                  {sec.slides.map((slide: LyricSlide, i: number) => (
                    <SlideCard
                      key={slide.id}
                      slide={slide}
                      globalNum={(prevCount + i + 1) as number}
                      activeSlideId={(pushFeedback === slide.id ? slide.id : activeSlideId) as string | null}
                      onClick={handleSlideClick}
                      onEdit={() => selectedSong && setEditSong(selectedSong)}
                      songTitle={selectedSong?.title ?? ""}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

        {/* ── Resize handle + Live Screen Preview Panel ─────────────────── */}
        {showPreview && !isMobile && (
          <>
            {/* Drag handle */}
            <div
              onMouseDown={handleResizeMouseDown}
              style={{
                width: 5,
                flexShrink: 0,
                cursor: "col-resize",
                background: isDraggingRef.current ? "#6366f1" : "#1e1e2e",
                transition: "background 0.15s",
                position: "relative",
                zIndex: 5,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#6366f1"; }}
              onMouseLeave={e => { if (!isDraggingRef.current) (e.currentTarget as HTMLElement).style.background = "#1e1e2e"; }}
            >
              {/* Grip dots */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                ))}
              </div>
            </div>

            {/* Preview panel */}
            <div style={{
              width: previewWidth,
            flexShrink: 0,
            background: "#080808",
            borderLeft: "1px solid #1e1e1e",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Panel header */}
            <div style={{
              padding: "8px 12px",
              borderBottom: "1px solid #1a1a1a",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: liveConnected ? "#22c55e" : "#ef4444",
                }} data-lgm-pulse />
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>LIVE SCREEN</span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 2, lineHeight: 0 }}
              >
                <X size={12} />
              </button>
            </div>

            {/* 16:9 iframe — scales /live-display to fit panel width */}
            <div style={{
              position: "relative",
              width: "100%",
              paddingBottom: "56.25%",
              background: "#000",
              overflow: "hidden",
              borderBottom: "1px solid #1a1a1a",
            }}>
              <iframe
                src="/live-display"
                title="Live Screen Preview"
                style={{
                  position: "absolute",
                  top: 0, left: 0,
                  width: "1920px",
                  height: "1080px",
                  transform: `scale(${previewWidth / 1920})`,
                  transformOrigin: "top left",
                  border: "none",
                  pointerEvents: "none",
                  background: "#000",
                }}
              />
            </div>

            {/* Currently live info */}
            <div style={{ padding: "10px 12px", flex: 1 }}>
              {liveLines.length > 0 ? (
                <>
                  <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Now Showing</p>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                    {liveLines.join(" · ")}
                  </p>
                  {liveSongTitle && (
                    <p style={{ margin: "4px 0 0", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{liveSongTitle}</p>
                  )}
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Screen is clear</p>
              )}
            </div>
          </div>
          </>
        )}

      </div>{/* ── end body row ── */}


      {/* Pulse animation for live dot */}
      <style>{`
        @keyframes lgm-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        [data-lgm-pulse] { animation: lgm-pulse 1.5s ease-in-out infinite; }

        @keyframes lgm-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* ── Tablet + Mobile: icon-only toolbar ────────────────── */
        @media (max-width: 1024px) {
          .lgm-btn-label { display: none !important; }
        }

        /* ── Mobile layout overrides ───────────────────────────── */
        @media (max-width: 640px) {
          .lgm-toolbar { gap: 6px !important; padding: 0 10px !important; }
          .lgm-slide-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 6px !important; }
          .lgm-section-tabs { display: none !important; }
          .lgm-grid-padding { padding: 10px !important; }

          /* Hide slide count on mobile */
          .lgm-slide-count { display: none !important; }

          /* Red close button on mobile */
          .lgm-close-btn {
            width: 28px !important; height: 28px !important;
            background: rgba(239,68,68,0.18) !important;
            border: 1px solid rgba(239,68,68,0.45) !important;
            border-radius: 6px !important;
          }
          .lgm-close-btn svg { color: #f87171 !important; stroke: #f87171 !important; }

          /* Row 2: wrap so dropdown falls to its own row */
          .lgm-toolbar-row2 {
            height: auto !important;
            min-height: 44px !important;
            padding: 6px 10px 6px !important;
            gap: 0px !important;
            row-gap: 6px !important;
            flex-wrap: wrap !important;
            align-content: flex-start !important;
            justify-content: space-between !important;
          }

          /* Icon-only buttons: fixed 36×36 squares */
          .lgm-icon-btn {
            flex: 0 0 36px !important;
            width: 36px !important;
            height: 36px !important;
            padding: 0 !important;
            flex-shrink: 0 !important;
            order: 1 !important;
          }

          /* Labeled buttons: auto width, icon-only on mobile (label hidden by ≤1024px rule) */
          .lgm-labeled-btn {
            flex: 0 0 auto !important;
            width: 36px !important;
            height: 36px !important;
            padding: 0 !important;
            flex-shrink: 0 !important;
            order: 1 !important;
          }

          /* Song dropdown: drop to its OWN second row, full width */
          .lgm-dropdown {
            order: 2 !important;
            flex: 0 0 100% !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .lgm-dropdown > button {
            width: 100% !important;
            height: 36px !important;
            padding: 0 12px !important;
          }

          /* Hide artist in dropdown trigger — title only */
          .lgm-dropdown-artist { display: none !important; }
        }


        @media (min-width: 641px) and (max-width: 1024px) {
          .lgm-slide-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; }
        }
      `}</style>

      {/* ── Lyrics Edit Sheet ────────────────────────────────────────────── */}
      {editSong && (
        <LyricsEditSheet
          song={editSong}
          onClose={() => setEditSong(null)}
          onSaved={(newLyrics) => {
            try {
              // Lock song-init effect so new `songs` prop doesn't overwrite fresh sections
              userPickedRef.current = true;

              // 1. Build updated song
              const updatedSong = { ...editSong, lyrics: newLyrics };

              // 2. Directly push new sections into grid (no useEffect chain)
              const newParsed = parseSections(newLyrics);
              setSections(newParsed);
              setAllSlides(newParsed.flatMap(s => s.slides));

              // 3. Update selectedSong ref + state so pencil-click opens updated lyrics
              selectedSongRef.current = updatedSong;
              setSelectedSong_(updatedSong);

              // 4. Propagate up to LiveStageView (default view + OBS re-push)
              if (editSong?.id) onSongLyricsUpdate?.(editSong.id, newLyrics);

              // 5. Toast confirmation
              onToast?.("Lyrics saved successfully ✓", "success");
            } catch (e) {
              console.error("[onSaved] Error applying lyrics update:", e);
              onToast?.("Lyrics saved but display may need a refresh", "warning");
            } finally {
              setEditSong(null);
            }
          }}
        />
      )}
    </div>
  );
}
