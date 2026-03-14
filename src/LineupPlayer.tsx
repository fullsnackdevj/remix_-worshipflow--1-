import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Music, Sun, ListMusic } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LineupTrack {
  songId: string;
  title: string;
  artist: string;
  videoUrl: string;
  mood: "joyful" | "solemn";
  eventName: string;
  eventDate: string;   // "YYYY-MM-DD"
  serviceType?: string;
}

// ── YouTube embed helper ──────────────────────────────────────────────────────
function getEmbed(url: string): string {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  } catch { /* noop */ }
  return url;
}

// ── Format date "2026-03-15" → "Sun Mar 15" ──────────────────────────────────
function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return d; }
}

// ── Mood pill ─────────────────────────────────────────────────────────────────
function MoodPill({ mood }: { mood: "joyful" | "solemn" }) {
  return mood === "joyful"
    ? <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400"><Sun size={8} /> Joyful</span>
    : <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400"><Music size={8} /> Solemn</span>;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  tracks: LineupTrack[];
  onClose: () => void;
}

// ── LineupPlayer ──────────────────────────────────────────────────────────────
export default function LineupPlayer({ tracks, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [mini, setMini] = useState(false);

  const current = tracks[currentIdx];
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < tracks.length - 1;

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (mini) setMini(false); else onClose(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [mini, onClose]);

  if (!current) return null;

  // ── Mini player (bottom-right floating bar) ────────────────────────────────
  if (mini) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] w-72 rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border border-white/10">
        {/* mini header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-950/80">
          <ListMusic size={12} className="text-indigo-400 shrink-0" />
          <span className="text-xs text-white/60 truncate flex-1">Lineup · {currentIdx + 1}/{tracks.length}</span>
          <button onClick={() => setMini(false)} title="Expand" className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            {/* expand icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button onClick={onClose} title="Close" className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X size={13} />
          </button>
        </div>
        {/* 16:9 video */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            key={current.videoUrl}
            src={getEmbed(current.videoUrl)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            title={current.title}
          />
        </div>
        {/* mini controls */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-900">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{current.title}</p>
            <p className="text-[10px] text-gray-400 truncate">{current.eventName}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev}
              className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 text-white/70 hover:text-white transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setCurrentIdx(i => i + 1)} disabled={!hasNext}
              className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 text-white/70 hover:text-white transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full modal ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm"
        onClick={() => setMini(true)}
      />

      {/* Panel */}
      <div
        className="fixed z-[9999] bg-gray-900 shadow-2xl rounded-2xl overflow-hidden"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(95vw, 960px)", maxHeight: "90vh" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-950/80 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ListMusic size={16} className="text-indigo-400" />
            <span className="text-sm font-bold text-white">Lineup Playlist</span>
            <span className="text-xs text-white/40">· {tracks.length} song{tracks.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* minimize */}
            <button
              onClick={() => setMini(true)}
              title="Minimize — keep playing while you browse"
              className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
              </svg>
              Minimize
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Body: video left + playlist right ── */}
        <div className="flex flex-col md:flex-row" style={{ maxHeight: "calc(90vh - 57px)" }}>
          {/* Video + controls (left) */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* 16:9 */}
            <div className="relative w-full bg-black" style={{ paddingBottom: "56.25%" }}>
              <iframe
                key={current.videoUrl}
                src={getEmbed(current.videoUrl)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
                title={current.title}
              />
            </div>

            {/* Now playing info + prev/next */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-t border-white/10">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <MoodPill mood={current.mood} />
                  <span className="text-[10px] text-gray-500">{fmtDate(current.eventDate)}</span>
                </div>
                <p className="text-sm font-bold text-white truncate">{current.title}</p>
                {current.artist && <p className="text-xs text-gray-400 truncate">{current.artist}</p>}
                <p className="text-[10px] text-indigo-400 mt-0.5 truncate">{current.eventName}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-xs font-medium transition-colors">
                  <ChevronLeft size={14} /> Prev
                </button>
                <button onClick={() => setCurrentIdx(i => i + 1)} disabled={!hasNext}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-xs font-medium transition-colors">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Track list (right) */}
          <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-white/10 bg-gray-950/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Song Line-Up</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {tracks.map((t, i) => (
                <button
                  key={`${t.songId}-${t.mood}-${i}`}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    i === currentIdx
                      ? "bg-indigo-600/20 border-l-2 border-indigo-500"
                      : "hover:bg-white/5 border-l-2 border-transparent"
                  }`}
                >
                  {/* playing indicator or number */}
                  <div className="w-6 shrink-0 pt-0.5 flex items-center justify-center">
                    {i === currentIdx ? (
                      <div className="flex gap-0.5 items-end h-4">
                        <span className="w-0.5 bg-indigo-400 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "100%", animationDelay: "0ms" }} />
                        <span className="w-0.5 bg-indigo-400 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "70%", animationDelay: "150ms" }} />
                        <span className="w-0.5 bg-indigo-400 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "90%", animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-500 font-mono">{i + 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <MoodPill mood={t.mood} />
                    </div>
                    <p className={`text-xs font-semibold truncate ${i === currentIdx ? "text-white" : "text-gray-200"}`}>{t.title}</p>
                    {t.artist && <p className="text-[10px] text-gray-500 truncate">{t.artist}</p>}
                    <p className="text-[10px] text-indigo-400/70 truncate mt-0.5">{t.eventName} · {fmtDate(t.eventDate)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
