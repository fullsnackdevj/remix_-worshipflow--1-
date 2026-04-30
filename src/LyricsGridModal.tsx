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
import { X, Search, LayoutGrid, Music2, Wifi, WifiOff, ChevronDown, EyeOff, Zap, Heart } from "lucide-react";
import type { Song } from "./types";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

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
function SlideCard({ slide, globalNum, activeSlideId, onClick, songTitle }: {
  slide: LyricSlide;
  globalNum: number;
  activeSlideId: string | null;
  onClick: (slide: LyricSlide, songTitle: string) => void;
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

// ── Main Component ────────────────────────────────────────────────────────────
interface LiveSettings {
  bgIdx: number;
  echoAlign: string;
  echoLines: string;
  echoLineHeight: number;
  lyricsScale: number;
  loopEnabled: boolean;
  bgVideo: string | null;
  loopInterval: number;
  animStyle: string; // overrides the slide's baked-in animStyle with the current preset's
}

interface Props {
  songs: Song[];           // all songs (for auto-select lookup)
  sceneSongs: Song[];     // only the Scene Playlist songs (for dropdown)
  onClose: () => void;
  initialSongTitle?: string;
  // Fade / Preset controls mirrored from LiveStageView
  fadeScreenActive?: boolean;
  fadeScreenBg?: unknown;  // passed through to OBS when fade is active
  onToggleFade?: () => void;
  activePreset?: string;
  presetActivated?: boolean;
  onApplyPreset?: (name: "praise" | "worship") => void;
  // Full live settings for complete OBS payload
  liveSettings?: LiveSettings;
}

export default function LyricsGridModal({
  songs, sceneSongs, onClose, initialSongTitle,
  fadeScreenActive, fadeScreenBg, onToggleFade,
  activePreset, presetActivated, onApplyPreset,
  liveSettings,
}: Props) {
  const [query, setQuery]               = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [sections, setSections]         = useState<LyricSection[]>([]);
  const [allSlides, setAllSlides]       = useState<LyricSlide[]>([]);
  const [liveLines, setLiveLines]       = useState<string[]>([]);
  const [liveSongTitle, setLiveSongTitle] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

    setPushFeedback(slide.id);
    setTimeout(() => setPushFeedback(null), 900);
  }, []); // stable — all live values read via refs

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

  // userPickedRef: once the user manually picks from the dropdown, this is true
  // and the effect NEVER overrides their choice again — even when the parent
  // re-renders and passes a new songs/sceneSongs array reference.
  const userPickedRef = useRef(false);

  useEffect(() => {
    if (userPickedRef.current) return;          // user already made a choice — don't override
    if (!initialSongTitle || songs.length === 0) return;
    // Prefer scene playlist match so the dropdown shows it as active
    const match =
      sceneSongs.find(s => s.title.toLowerCase() === initialSongTitle.toLowerCase()) ??
      songs.find(s => s.title.toLowerCase() === initialSongTitle.toLowerCase());
    if (match) setSelectedSong(match);
  }, [initialSongTitle, songs, sceneSongs]);

  // ── Parse lyrics whenever song changes ──────────────────────────────────────
  useEffect(() => {
    if (!selectedSong) { setSections([]); setAllSlides([]); return; }
    const parsed = parseSections(selectedSong.lyrics ?? "");
    setSections(parsed);
    setAllSlides(parsed.flatMap(s => s.slides));
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
      },
      () => setLiveConnected(false)
    );
    return () => unsub();
  }, []);

  // ── Match live lines → a slide id ────────────────────────────────────────────
  useEffect(() => {
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
    userPickedRef.current = true;  // lock: stop auto-select from ever overriding this choice
    setSelectedSong(song);
    setDropdownOpen(false);
    setQuery("");

    // Auto-apply matching scene preset based on song tags — mirrors handleSongSelect in LiveStageView
    // "joyful" tag → Praise scene, "solemn" tag → Worship scene
    if (onApplyPreset) {
      const resolved = resolvePresetFromSong(song);
      if (resolved && resolved !== activePreset) {
        onApplyPreset(resolved);
      }
    }
  }, [onApplyPreset, activePreset, resolvePresetFromSong]);

  return (
    /* Backdrop */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        // Note: do NOT set overflow:hidden here — it would clip the song dropdown
      }}
    >
      {/* ── Top toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "#111",
        borderBottom: "1px solid #222",
        padding: "0 16px",
        minHeight: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        position: "relative",  /* allow absolute dropdown to escape */
        zIndex: 10,            /* sit above section tabs / grid */
        overflow: "visible",   /* MUST be visible — dropdown extends below */
      }}>
        {/* Icon + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4 }}>
          <LayoutGrid size={16} color="#818cf8" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e7eb", letterSpacing: "0.02em" }}>
            Lyrics Facility
          </span>
        </div>

        {/* Song selector dropdown — styled like LiveStageView */}
        <div ref={dropdownRef} style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          {/* Trigger button */}
          <button
            onClick={() => setDropdownOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px",
              borderRadius: dropdownOpen ? "10px 10px 0 0" : 10,
              background: "rgba(255,255,255,0.03)",
              border: dropdownOpen ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.09)",
              cursor: "pointer", width: "100%", textAlign: "left",
              transition: "all 0.18s",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: selectedSong ? "#fff" : "rgba(255,255,255,0.35)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedSong ? selectedSong.title : "Select a song…"}
              </p>
              {selectedSong?.artist && (
                <p style={{ margin: "1px 0 0", fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedSong.artist}
                </p>
              )}
            </div>
            <div style={{ flexShrink: 0, marginLeft: 10, color: "rgba(255,255,255,0.45)", transition: "transform 0.2s", transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
              <ChevronDown size={15} />
            </div>
          </button>

          {/* Dropdown list — scene playlist songs only, no search bar */}
          {dropdownOpen && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0, right: 0,
              background: "rgba(10,10,20,0.98)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderTop: "none",
              borderRadius: "0 0 10px 10px",
              zIndex: 1000,           /* must be above ALL other modal content */
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
                  <button
                    key={song.id}
                    onClick={() => handleSelectSong(song)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "9px 12px",
                      background: isActive ? "rgba(99,102,241,0.18)" : "transparent",
                      border: "none", borderTop: "1px solid rgba(255,255,255,0.05)",
                      cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    {/* Song type icon */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isPraise ? "rgba(250,204,21,0.12)" : isWorship ? "rgba(167,139,250,0.12)" : "rgba(99,102,241,0.10)",
                      border: isPraise ? "1px solid rgba(250,204,21,0.22)" : isWorship ? "1px solid rgba(167,139,250,0.22)" : "1px solid rgba(99,102,241,0.16)",
                    }}>
                      {isPraise ? <Zap size={11} color="#fbbf24" /> : isWorship ? <Heart size={11} color="#a78bfa" /> : <Music2 size={11} color="#818cf8" />}
                    </div>
                    {/* Title + artist */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: isActive ? 700 : 600, color: isActive ? "#a5b4fc" : "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {song.title}
                      </p>
                      {song.artist && (
                        <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {song.artist}
                        </p>
                      )}
                    </div>
                    {/* Active dot */}
                    {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Live song info — shows what's currently on the display */}
        {liveSongTitle && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 6,
            padding: "4px 10px",
            flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444", animation: "pulse 1.5s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>LIVE:</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {liveSongTitle}
            </span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Slide count */}
        {allSlides.length > 0 && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 500, flexShrink: 0 }}>
            {allSlides.length} slides
          </span>
        )}

        {/* Firestore connection dot */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
        }}>
          {liveConnected
            ? <Wifi size={13} color="rgba(52,211,153,0.7)" />
            : <WifiOff size={13} color="rgba(239,68,68,0.7)" />}
          <span style={{ fontSize: 10, color: liveConnected ? "rgba(52,211,153,0.7)" : "rgba(239,68,68,0.7)", fontWeight: 600 }}>
            {liveConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={14} color="rgba(255,255,255,0.7)" />
        </button>
      </div>

      {/* ── Fade / Preset control strip — mirrors LiveStageView exactly ──────── */}
      {(onToggleFade || onApplyPreset) && (
        <div style={{
          background: "#0d0d0d",
          borderBottom: "1px solid #1e1e1e",
          padding: "0 16px",
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}>
          {/* Fade OBS Screen — same style as LiveStageView */}
          {onToggleFade && (
            <button
              onClick={onToggleFade}
              title={fadeScreenActive ? "OBS Faded — click to reveal" : "Fade in OBS Screen"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 20,
                cursor: "pointer", transition: "all 0.18s", flexShrink: 0,
                border: fadeScreenActive ? "1.5px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.15)",
                background: fadeScreenActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700,
              }}
            >
              <EyeOff size={15} />
              <span>{fadeScreenActive ? "Faded" : "Fade OBS Screen"}</span>
            </button>
          )}

          {/* Divider */}
          {onToggleFade && onApplyPreset && (
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
          )}

          {/* Praise / Worship presets — same style as LiveStageView */}
          {onApplyPreset && (
            <div style={{ display: "flex", gap: 5 }}>
              {(["praise", "worship"] as const).map(name => {
                const isActive = presetActivated && activePreset === name;
                const Icon = name === "praise" ? Zap : Heart;
                const label = name === "praise" ? "Praise" : "Worship";
                return (
                  <button key={name}
                    onClick={() => onApplyPreset(name)}
                    title={label}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 20,
                      cursor: "pointer", transition: "all 0.18s", flexShrink: 0,
                      border: isActive ? "1.5px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.15)",
                      background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700,
                    }}
                  >
                    <Icon size={15} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Clear Display — only shown when a slide is actively pushed to OBS */}
          {activeSlideId && (
            <button
              onClick={handleClearDisplay}
              title="Clear OBS display"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 8,
                cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.3)",
                fontSize: 11, fontWeight: 600,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
            >
              ✕ Clear Display
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
        }}>
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

      {/* ── Main slide grid ──────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: 16,
        background: "#0a0a0a",
      }}>
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

                {/* Slide grid — 4 columns on wide, fewer on narrow */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 8,
                }}>
                  {sec.slides.map((slide: LyricSlide, i: number) => (
                    <SlideCard
                      key={slide.id}
                      slide={slide}
                      globalNum={(prevCount + i + 1) as number}
                      activeSlideId={(pushFeedback === slide.id ? slide.id : activeSlideId) as string | null}
                      onClick={handleSlideClick}
                      songTitle={selectedSong?.title ?? ""}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pulse animation for live dot */}
      <style>{`
        @keyframes lgm-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        [data-lgm-pulse] { animation: lgm-pulse 1.5s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
