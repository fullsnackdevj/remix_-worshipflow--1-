import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ListMusic, Shuffle, Repeat, Repeat1, Music2 } from "lucide-react";

export interface LibraryTrack { id: string; title: string; artist: string; videoUrl: string; }
interface Props { tracks: LibraryTrack[]; startIndex?: number; onClose: () => void; }
declare global { interface Window { YT: any; } }

function extractVideoId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com"))
      return u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
  } catch { /**/ }
  return "";
}
const ytThumb = (id: string) => `https://img.youtube.com/vi/${id}/mqdefault.jpg`;


type LoopMode = "none" | "all" | "one";
type PlayerMode = "full" | "medium" | "mini";
const MINI_W = 288, MEDIUM_W = 360;

function DragDots() {
  return (
    <div className="grid grid-cols-3 gap-[3px] pointer-events-none shrink-0">
      {Array.from({ length: 9 }).map((_, i) => <div key={i} className="w-[3px] h-[3px] rounded-full bg-white/40" />)}
    </div>
  );
}
function MarqueeText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className="overflow-hidden min-w-0 flex-1">
      <div className="flex whitespace-nowrap" style={{ animation: "slpMarquee 7s linear infinite" }}>
        <span className={`shrink-0 pr-14 ${className}`}>{text}</span>
        <span className={`shrink-0 pr-14 ${className}`} aria-hidden="true">{text}</span>
      </div>
    </div>
  );
}

export default function SongsLibraryPlayer({ tracks, startIndex = 0, onClose }: Props) {
  const [queue, setQueue] = useState<LibraryTrack[]>(() => {
    if (startIndex <= 0) return tracks;
    return [tracks[startIndex], ...tracks.slice(0, startIndex), ...tracks.slice(startIndex + 1)];
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [loopMode, setLoopMode]     = useState<LoopMode>("all");
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [thumbErr, setThumbErr]       = useState(false);
  // On mobile, start in mini so the bottom-snap appears immediately (no backdrop tap-through bug)
  const [mode, setMode] = useState<PlayerMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "mini" : "full"
  );

  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dragging: boolean; startPX: number; startPY: number; startX: number; startY: number }>
    ({ dragging: false, startPX: 0, startPY: 0, startX: 0, startY: 0 });
  const shellRef = useRef<HTMLDivElement>(null);
  const prevMode = useRef<PlayerMode>("full");
  const isMobileRef = useRef(typeof window !== "undefined" && window.innerWidth < 640);

  useEffect(() => { if (prevMode.current === "full" && mode !== "full") setDragPos(null); prevMode.current = mode; }, [mode]);

  const vw = () => window.visualViewport?.width  ?? window.innerWidth;
  const vh = () => window.visualViewport?.height ?? window.innerHeight;
  const shellW = () => Math.min(mode === "mini" ? MINI_W : MEDIUM_W, vw() - 16);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === "full") return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const rect = shellRef.current?.getBoundingClientRect(); const W = shellW();
    const startX = rect?.left ?? (vw() - W - 16), startY = rect?.top ?? (vh() - (rect?.height ?? 260) - 16);
    dragRef.current = { dragging: true, startPX: e.clientX, startPY: e.clientY, startX, startY };
    setDragPos({ x: startX, y: startY });
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const W = shellW(), shellH = shellRef.current?.offsetHeight ?? 260;
    const dx = e.clientX - dragRef.current.startPX, dy = e.clientY - dragRef.current.startPY;
    setDragPos({ x: Math.max(0, Math.min(vw() - W, dragRef.current.startX + dx)), y: Math.max(0, Math.min(vh() - shellH, dragRef.current.startY + dy)) });
  };
  const onDragEnd = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return; dragRef.current.dragging = false;
    if (e && e.clientX >= vw() / 2 && e.clientY >= vh() / 2) setDragPos(null);
  };

  const currentIdxRef = useRef(0); currentIdxRef.current = currentIdx;
  const queueRef      = useRef(queue); queueRef.current = queue;
  const loopRef       = useRef(loopMode); loopRef.current = loopMode;
  const isShuffledRef = useRef(false); isShuffledRef.current = isShuffled;
  // Remaining indices to play in shuffle mode (pre-randomised, consumed one by one)
  const shufflePool   = useRef<number[]>([]);
  const loadedId      = useRef<string | null>(null);
  const playerRef     = useRef<any>(null);
  const playerDivId   = useRef("slp-yt-" + Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    let poll: ReturnType<typeof setInterval>;
    const create = () => {
      if (playerRef.current) return;
      const vid = extractVideoId(queue[0]?.videoUrl ?? "");
      if (!vid || !document.getElementById(playerDivId)) return;
      playerRef.current = new window.YT.Player(playerDivId, {
        videoId: vid,
        playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (ev: any) => { ev.target.unMute(); ev.target.setVolume(100); ev.target.playVideo(); setIsPlaying(true); setPlayerReady(true); },
          onStateChange: (ev: any) => {
            if (ev.data === 1) setIsPlaying(true);
            if (ev.data === 2) setIsPlaying(false);
            if (ev.data === 0) {
              setIsPlaying(false);
              const lm = loopRef.current, idx = currentIdxRef.current, q = queueRef.current;
              if (lm === "one") { playerRef.current?.seekTo(0); playerRef.current?.playVideo(); return; }
              if (isShuffledRef.current) {
                if (shufflePool.current.length === 0) {
                  if (lm === "none") return; // all played, done
                  // refill pool for loop-all
                  shufflePool.current = buildPool(q.length, idx);
                }
                const next = shufflePool.current.pop()!;
                setCurrentIdx(next);
              } else {
                if (idx < q.length - 1) setCurrentIdx(idx + 1);
                else if (lm === "all") setCurrentIdx(0);
              }
            }
          },
        },
      });
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
    }
    if (window.YT?.Player) create();
    else poll = setInterval(() => { if (window.YT?.Player) { clearInterval(poll); create(); } }, 200);
    return () => { clearInterval(poll); playerRef.current?.destroy(); playerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playerRef.current || !playerReady) return;
    const track = queue[currentIdx];
    if (!track || track.id === loadedId.current) return;
    loadedId.current = track.id; setThumbErr(false);
    const vid = extractVideoId(track.videoUrl); if (!vid) return;
    playerRef.current.loadVideoById(vid);
    setTimeout(() => { try { playerRef.current?.playVideo(); } catch { /**/ } }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, playerReady]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "full") setMode("medium"); else if (mode === "medium") setMode("mini"); else onClose();
    };
    document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h);
  }, [mode, onClose]);

  // Build a Fisher-Yates-shuffled pool of all indices except the current one
  const buildPool = (total: number, excludeIdx: number): number[] => {
    const arr = Array.from({ length: total }, (_, i) => i).filter(i => i !== excludeIdx);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const toggleShuffle = () => {
    setIsShuffled(prev => {
      const next = !prev;
      if (next) {
        // Build a randomised pool of remaining songs (excluding current)
        shufflePool.current = buildPool(queueRef.current.length, currentIdxRef.current);
      } else {
        shufflePool.current = [];
      }
      return next;
    });
  };

  // Advance to the next track respecting shuffle/loop
  const playNext = () => {
    const lm = loopRef.current, idx = currentIdxRef.current, q = queueRef.current;
    if (isShuffledRef.current) {
      if (shufflePool.current.length === 0) {
        if (lm === "none") return;
        shufflePool.current = buildPool(q.length, idx);
      }
      setCurrentIdx(shufflePool.current.pop()!);
    } else {
      if (idx < q.length - 1) setCurrentIdx(idx + 1);
      else if (lm === "all") setCurrentIdx(0);
    }
  };

  const playPrev = () => setCurrentIdx(i => Math.max(0, i - 1));

  const cycleLoop  = () => setLoopMode(m => m === "none" ? "all" : m === "all" ? "one" : "none");
  const togglePlay = () => { if (!playerRef.current) return; isPlaying ? playerRef.current.pauseVideo() : playerRef.current.playVideo(); };

  const current = queue[currentIdx];
  const hasPrev = currentIdx > 0, hasNext = currentIdx < queue.length - 1;
  if (!current) return null;
  const videoId = extractVideoId(current.videoUrl);

  const btnCls = "p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors";
  const CycleBtn = () => (
    <button onClick={() => setMode(m => m === "full" ? "medium" : m === "medium" ? "mini" : "full")} title="Cycle size" className={btnCls}>
      <svg width="16" height="16" viewBox="0 0 19 19" fill="none">
        <path d="M13.7 0.5H5.3C3.61984 0.5 2.77976 0.5 2.13803 0.82698C1.57354 1.1146 1.1146 1.57354 0.82698 2.13803C0.5 2.77976 0.5 3.61984 0.5 5.3V13.7C0.5 15.3802 0.5 16.2202 0.82698 16.862C1.1146 17.4265 1.57354 17.8854 2.13803 18.173C2.77976 18.5 3.61984 18.5 5.3 18.5H13.7C15.3802 18.5 16.2202 18.5 16.862 18.173C17.4265 17.8854 17.8854 17.4265 18.173 16.862C18.5 16.2202 18.5 15.3802 18.5 13.7V5.3M13.7 0.5C15.3802 0.5 16.2202 0.5 16.862 0.82698C17.4265 1.1146 17.8854 1.57354 18.173 2.13803C18.5 2.77976 18.5 3.61984 18.5 5.3M13.7 0.5H12.7C11.5799 0.5 11.0198 0.5 10.592 0.717987C10.2157 0.909734 9.90973 1.21569 9.71799 1.59202C9.5 2.01984 9.5 2.57989 9.5 3.7V6.3C9.5 7.4201 9.5 7.98016 9.71799 8.40798C9.90973 8.78431 10.2157 9.09027 10.592 9.28201C11.0198 9.5 11.5799 9.5 12.7 9.5H15.3C16.4201 9.5 16.9802 9.5 17.408 9.28201C17.7843 9.09027 18.0903 8.78431 18.282 8.40798C18.5 7.98016 18.5 7.42011 18.5 6.3V5.3M10 9L4.5 14.5M4.5 14.5H9.5M4.5 14.5L4.5 9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
  const CloseBtn = () => <button onClick={onClose} title="Close" className={btnCls}><X size={mode === "mini" ? 13 : 15} /></button>;

  const PlayPauseBtn = ({ sz }: { sz: number }) => (
    <button onClick={togglePlay} className="flex items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-100 active:scale-95 transition-all shadow-md shrink-0" style={{ width: sz * 2.6, height: sz * 2.6 }}>
      {isPlaying
        ? <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: sz, height: sz }}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        : <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: sz, height: sz }}><polygon points="5,3 19,12 5,21"/></svg>}
    </button>
  );

  const TrackRow = ({ t, i }: { t: LibraryTrack; i: number }) => {
    const vid = extractVideoId(t.videoUrl), isActive = i === currentIdx;
    return (
      <button onClick={() => setCurrentIdx(i)} className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-l-2 border-b border-b-white/[0.12] ${ isActive ? "bg-emerald-600/[0.15] border-l-emerald-500" : "hover:bg-white/[0.04] border-l-transparent" }`}>
        <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-800">
          {vid ? <img src={ytThumb(vid)} alt={t.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music2 size={16} className="text-gray-600" /></div>}
          {isActive && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="flex gap-0.5 items-end h-4">
                <span className="w-[3px] bg-emerald-400 animate-bounce rounded-sm" style={{ height: "100%", animationDelay: "0ms" }} />
                <span className="w-[3px] bg-emerald-400 animate-bounce rounded-sm" style={{ height: "65%",  animationDelay: "150ms" }} />
                <span className="w-[3px] bg-emerald-400 animate-bounce rounded-sm" style={{ height: "85%",  animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate leading-tight ${isActive ? "text-white" : "text-gray-200"}`}>{t.title}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{t.artist || "—"}</p>
        </div>
      </button>
    );
  };

  // Mobile snap: mini & medium both anchor to the bottom full-width
  const isMobile = isMobileRef.current;
  const mobileSnap = isMobile && (mode === "mini" || mode === "medium");

  const draggableStyle = dragPos
    ? { left: dragPos.x, top: dragPos.y, right: "auto", bottom: "auto", touchAction: "none" as const, cursor: dragRef.current.dragging ? "grabbing" : "grab", transition: dragRef.current.dragging ? "none" : "left 0.15s, top 0.15s" }
    : { right: 16, bottom: 16, left: "auto", top: "auto", touchAction: "none" as const, cursor: dragRef.current.dragging ? "grabbing" : "grab" };

  const playerUI = (
    <>
      <style>{`@keyframes slpMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>

      {mode === "full" && <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm" onClick={() => setMode("medium")} />}

      <div
        ref={shellRef}
        className="fixed z-[9999] bg-[#0c0c14] shadow-[0_8px_40px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.07] rounded-2xl overflow-hidden flex flex-col"
        style={mode === "full"
          ? { top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(95vw,960px)", maxHeight: "95vh" }
          : mobileSnap
            ? {
                bottom: 0, left: 0, right: 0, width: "100%",
                borderRadius: "16px 16px 0 0",
                touchAction: "none" as const,
                maxHeight: mode === "medium" ? "60vh" : undefined,
              }
            : { ...draggableStyle, width: mode === "medium" ? `min(${MEDIUM_W}px, calc(100vw - 16px))` : `min(${MINI_W}px, calc(100vw - 16px))` }}
        onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
      >

        {/* ── FULL HEADER ─────────────────────────────────────────────── */}
        {mode === "full" && (
          <div className="flex items-center justify-between px-5 py-3 bg-black/60 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ListMusic size={15} className="text-emerald-400 shrink-0" />
              <span className="text-sm font-bold text-white">Song Library</span>
              <span className="text-xs text-white/40 shrink-0">· {queue.length} songs</span>
            </div>
            <div className="flex items-center gap-1 shrink-0"><CycleBtn /><CloseBtn /></div>
          </div>
        )}

        {/* ── MEDIUM HEADER ───────────────────────────────────────────── */}
        {mode === "medium" && (
          <div className="flex items-center gap-3 px-4 py-4 bg-[#0c0c14] shrink-0 select-none border-b border-white/[0.06]">
            <DragDots />
            <span className="text-lg font-bold text-white flex-1 tracking-tight truncate">Song Library</span>
            <div className="flex items-center gap-0.5"><CycleBtn /><CloseBtn /></div>
          </div>
        )}

        {/* ── MINI HEADER ─────────────────────────────────────────────── */}
        {mode === "mini" && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0c0c14] select-none shrink-0 border-b border-white/[0.06]">
            <DragDots />
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <ListMusic size={12} className="text-emerald-400 shrink-0" />
              <MarqueeText text={`${currentIdx + 1}/${queue.length} · ${current.title}`} className="text-xs font-bold text-white" />
            </div>
            <div className="flex items-center gap-0.5 shrink-0"><CycleBtn /><CloseBtn /></div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            VIDEO — ALWAYS MOUNTED, NEVER UNMOUNTED.
            Full width at top. height:0 in medium/mini so audio keeps playing.
            ══════════════════════════════════════════════════════════════════ */}
        <div
          className="relative w-full bg-black shrink-0 overflow-hidden"
          style={mode === "full" ? { paddingBottom: "min(56.25%, 46vh)" } : { height: 0 }}
        >
          <div id={playerDivId} className="absolute inset-0 w-full h-full" />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            FULL MODE — 3 rows below header:
            ROW 1: video (above, always mounted)
            ROW 2: controls bar — full width
            ROW 3: song library — full width, fills remaining space
            ══════════════════════════════════════════════════════════════════ */}
        {mode === "full" && (
          <>
            {/* ROW 2 ─ Controls bar, full width ─────────────────────────── */}
            <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-white/[0.08] flex-wrap">
              {/* Title + Artist */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate leading-tight">{current.title}</p>
                {current.artist && <p className="text-xs text-gray-400 truncate">{current.artist}</p>}
              </div>
              {/* All controls in one row on the right */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button onClick={toggleShuffle} className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${isShuffled ? "bg-emerald-600/20 text-emerald-400" : "bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1]"}`}>
                  <Shuffle size={12} /><span className="hidden sm:inline">Shuffle</span>
                </button>
                <button onClick={cycleLoop} className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${loopMode !== "none" ? "bg-emerald-600/20 text-emerald-400" : "bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1]"}`}>
                  {loopMode === "one" ? <Repeat1 size={12}/> : <Repeat size={12}/>}
                  <span className="hidden sm:inline">{loopMode === "none" ? "No Loop" : loopMode === "all" ? "Loop All" : "Loop One"}</span>
                </button>
                <button onClick={playPrev} disabled={!hasPrev}
                  className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1] disabled:opacity-30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-3 h-3"><polyline points="15 18 9 12 15 6"/></svg><span className="hidden sm:inline">Prev</span>
                </button>
                <button onClick={playNext} disabled={!hasNext}
                  className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30">
                  <span className="hidden sm:inline">Next</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-3 h-3"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>

            {/* ROW 3 ─ Song Library — full width, fills all remaining space ─ */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="px-5 py-2 border-b border-white/[0.1] bg-black/20 shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Song Library</p>
              </div>
              <div
                className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.1]"
                style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
              >
                {queue.map((t, i) => <React.Fragment key={t.id + i}><TrackRow t={t} i={i} /></React.Fragment>)}
              </div>
            </div>
          </>
        )}

        {/* ── MEDIUM: scrollable playlist + sticky bar ─────────────────── */}
        {mode === "medium" && (
          <>
            <div className="overflow-y-auto divide-y divide-white/[0.1]" style={{ maxHeight: 380, WebkitOverflowScrolling: "touch", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}>
              {queue.map((t, i) => <React.Fragment key={t.id + i}><TrackRow t={t} i={i}/></React.Fragment>)}
            </div>
            <div className="shrink-0 bg-black/70 border-t border-white/[0.1] px-4 py-3 flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-700">
                {videoId && !thumbErr ? <img src={ytThumb(videoId)} alt={current.title} className="w-full h-full object-cover" onError={() => setThumbErr(true)} /> : <div className="w-full h-full flex items-center justify-center"><Music2 size={16} className="text-gray-500"/></div>}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <MarqueeText text={current.title} className="text-sm font-bold text-white" />
                {current.artist && <MarqueeText text={current.artist} className="text-xs text-gray-400" />}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={toggleShuffle} className={`p-1.5 rounded-full transition-colors ${isShuffled ? "text-emerald-400" : "text-white/40 hover:text-white"}`}><Shuffle size={14}/></button>
                <button onClick={playPrev} disabled={!hasPrev} className="p-1.5 rounded-full text-white/60 hover:text-white disabled:opacity-30 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg></button>
                <PlayPauseBtn sz={14}/>
                <button onClick={playNext} disabled={!hasNext} className="p-1.5 rounded-full text-white/60 hover:text-white disabled:opacity-30 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg></button>
                <button onClick={cycleLoop} className={`p-1.5 rounded-full transition-colors ${loopMode !== "none" ? "text-emerald-400" : "text-white/40 hover:text-white"}`}>{loopMode === "one" ? <Repeat1 size={14}/> : <Repeat size={14}/>}</button>
              </div>
            </div>
          </>
        )}

        {/* ── MINI: compact row ────────────────────────────────────────── */}
        {mode === "mini" && (
          <div className="flex items-center gap-3 px-3 py-2.5 bg-[#0a0a10] shrink-0">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-700">
              {videoId && !thumbErr ? <img src={ytThumb(videoId)} alt={current.title} className="w-full h-full object-cover" onError={() => setThumbErr(true)} /> : <div className="w-full h-full flex items-center justify-center"><Music2 size={18} className="text-gray-500"/></div>}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <MarqueeText text={current.title} className="text-sm font-bold text-white" />
              {current.artist && <MarqueeText text={current.artist} className="text-xs text-gray-400" />}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={toggleShuffle} className={`p-1.5 rounded-full transition-colors ${isShuffled ? "text-emerald-400" : "text-white/40 hover:text-white"}`}><Shuffle size={13}/></button>
              <button onClick={playPrev} disabled={!hasPrev} className="p-1.5 rounded-full text-white/60 hover:text-white disabled:opacity-30 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-3.5 h-3.5"><polyline points="15 18 9 12 15 6"/></svg></button>
              <PlayPauseBtn sz={13}/>
              <button onClick={playNext} disabled={!hasNext} className="p-1.5 rounded-full text-white/60 hover:text-white disabled:opacity-30 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-3.5 h-3.5"><polyline points="9 18 15 12 9 6"/></svg></button>
              <button onClick={cycleLoop} className={`p-1.5 rounded-full transition-colors ${loopMode !== "none" ? "text-emerald-400" : "text-white/40 hover:text-white"}`}>{loopMode === "one" ? <Repeat1 size={13}/> : <Repeat size={13}/>}</button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return createPortal(playerUI, document.body);
}
