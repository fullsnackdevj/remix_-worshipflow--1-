import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Music, Sun, ListMusic, Check, RefreshCw, SkipBack, SkipForward, Play } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LineupTrack {
  songId: string;
  title: string;
  artist: string;
  videoUrl: string;
  mood: "joyful" | "solemn";
  eventName: string;
  eventDate: string;
  serviceType?: string;
}

export interface CurrentUser {
  uid: string;
  name: string;
  photo: string;
}

interface ListenEntry {
  userId: string;
  name: string;
  photo: string;
  listenedAt: string;
}

// Extend window for YT API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function trackKey(t: LineupTrack) { return `${t.eventDate}_${t.songId}_${t.mood}`; }

function extractVideoId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
    }
  } catch { /* noop */ }
  return "";
}

function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return d; }
}

function MoodPill({ mood }: { mood: "joyful" | "solemn" }) {
  return mood === "joyful"
    ? <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400"><Sun size={8} />Joyful</span>
    : <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400"><Music size={8} />Solemn</span>;
}

function Avatar({ name, photo, size = 18 }: { name: string; photo: string; size?: number }) {
  const [err, setErr] = useState(false);
  const init = (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const ok = photo?.startsWith("http") && !err;
  return ok
    ? <img src={photo} alt={name} title={name} onError={() => setErr(true)}
        style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-gray-800 shrink-0" />
    : <div title={name} style={{ width: size, height: size }}
        className="rounded-full bg-indigo-600 border-2 border-gray-800 flex items-center justify-center text-[8px] font-bold text-white shrink-0">{init}</div>;
}

function ListenedBy({ entries, currentUserId }: { entries: ListenEntry[]; currentUserId: string }) {
  if (!entries.length) return null;
  const names = entries.map(e => e.userId === currentUserId ? "You" : e.name.split(" ")[0]);
  const label = names.length === 1 ? `${names[0]} listened`
    : names.length === 2 ? `${names[0]} & ${names[1]} listened`
    : `${names[0]}, ${names[1]} +${names.length - 2} listened`;
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      <div className="flex -space-x-1">
        {entries.slice(0, 4).map((e, i) => (
          <span key={e.userId + i}><Avatar name={e.name} photo={e.photo} size={16} /></span>
        ))}
      </div>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  tracks: LineupTrack[];
  currentUser: CurrentUser;
  onClose: () => void;
}

// ── LineupPlayer ──────────────────────────────────────────────────────────────
export default function LineupPlayer({ tracks, currentUser, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [mini, setMini] = useState(false);
  const [listens, setListens] = useState<Record<string, ListenEntry[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [playerReady, setPlayerReady] = useState(false);
  // Track whether this is a mobile/tablet device — used for autoplay workaround
  const isMobile = useRef(/Mobi|Android|iPhone|iPad|iPod|Tablet/i.test(navigator.userAgent)).current;

  // ── Drag state (mini mode only) ────────────────────────────────────────────
  const MINI_W = 360;
  const MINI_H = 68;
  const initPos = () => ({
    // Centre horizontally, 16px above the bottom edge — like Spotify
    x: Math.max(0, Math.round((window.innerWidth  - Math.min(window.innerWidth * 0.92, MINI_W)) / 2)),
    y: Math.max(0, window.innerHeight - MINI_H - 16),
  });
  const [pos, setPos] = useState<{ x: number; y: number }>(initPos);
  const [isPlaying, setIsPlaying] = useState(false);
  const dragRef = useRef<{ dragging: boolean; startPX: number; startPY: number; startX: number; startY: number }>({
    dragging: false, startPX: 0, startPY: 0, startX: 0, startY: 0,
  });
  const miniShellRef = useRef<HTMLDivElement>(null);

  // Re-init position when switching to mini so it snaps to bottom-centre
  const prevMini = useRef(false);
  useEffect(() => {
    if (mini && !prevMini.current) setPos(initPos());
    prevMini.current = mini;
  }, [mini]);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag in mini mode
    if (!mini) return;
    // Don't start drag if user pressed a button or interactive element
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    // Prevent page scroll on mobile — critical for smooth touch drag
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, startPX: e.clientX, startPY: e.clientY, startX: pos.x, startY: pos.y };
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startPX;
    const dy = e.clientY - dragRef.current.startPY;
    const shellH = miniShellRef.current?.offsetHeight ?? MINI_H;
    const newX = Math.max(0, Math.min(window.innerWidth  - MINI_W, dragRef.current.startX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - shellH,  dragRef.current.startY + dy));
    setPos({ x: newX, y: newY });
  };

  const onDragEnd = () => { dragRef.current.dragging = false; };

  // ── YouTube IFrame API refs ─────────────────────────────────────────────────
  // YouTube IFrame API player ref — this is what gives us onStateChange
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref so the YT closure (created once) can always read the current track index
  const currentIdxRef = useRef(0);
  // Ref so the YT closure can always call the latest autoMarkListened
  const autoMarkListenedRef = useRef<(track: LineupTrack | undefined) => void>(() => {});
  // Use a stable unique ID for the player div
  const playerDivId = useRef("lineup-yt-" + Math.random().toString(36).slice(2)).current;

  const current = tracks[currentIdx];
  // Keep ref in sync for YT closure
  currentIdxRef.current = currentIdx;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < tracks.length - 1;

  // ── Create YT Player (once) ────────────────────────────────────────────────
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    const createPlayer = () => {
      if (playerRef.current) return; // Already created
      const videoId = extractVideoId(tracks[0]?.videoUrl ?? "");
      if (!videoId || !document.getElementById(playerDivId)) return;

      playerRef.current = new window.YT.Player(playerDivId, {
        videoId,
        playerVars: {
          autoplay: 1,
          // Mobile browsers block autoplay-with-audio unless the playback
          // is directly triggered by a user gesture. Starting muted lets the
          // browser allow autoplay; we immediately unMute inside onReady.
          mute: 1,
          playsinline: 1, // Stay inline on iOS (no forced fullscreen)
          rel:  0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: { target: any }) => {
            // Unmute FIRST, then play — onReady is still within the gesture
            // trust chain on both desktop and modern mobile browsers.
            event.target.unMute();
            event.target.setVolume(100);
            event.target.playVideo();
            setPlayerReady(true);
          },
          onStateChange: (event: { data: number }) => {
            // Track play/pause state for the mini bar button icon
            setIsPlaying(event.data === 1);
            // 0 = ENDED — auto-mark listened, then advance and loop back to start
            if (event.data === 0) {
              // Auto-mark the just-finished track as listened
              autoMarkListenedRef.current(tracks[currentIdxRef.current]);
              setCurrentIdx(prev => {
                const next = prev < tracks.length - 1 ? prev + 1 : 0;
                return next;
              });
            }
          },
        },
      });
    };

    // Inject the YT script if not already present
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    // Poll until window.YT.Player is ready (handles async script load)
    if (window.YT?.Player) {
      createPlayer();
    } else {
      pollInterval = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(pollInterval);
          createPlayer();
        }
      }, 200);
    }

    return () => {
      clearInterval(pollInterval);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []); // Runs once on mount

  // ── Load new video when currentIdx changes ────────────────────────────────
  useEffect(() => {
    if (!playerRef.current || !playerReady) return;
    const videoId = extractVideoId(current?.videoUrl ?? "");
    if (!videoId) return;
    // loadVideoById triggers autoplay on desktop; on mobile we must also
    // explicitly call playVideo() after a short tick to guarantee playback.
    playerRef.current.loadVideoById(videoId);
    // Give the YT player one tick to accept the new video, then force play.
    // This ensures mobile doesn't silently stall after a track switch.
    setTimeout(() => {
      try { playerRef.current?.playVideo(); } catch { /* noop */ }
    }, 100);
  }, [currentIdx, playerReady]);

  // ── Fetch listens ─────────────────────────────────────────────────────────
  const fetchListens = useCallback(async () => {
    const keys = tracks.map(trackKey);
    try {
      const res = await fetch("/api/lineup-listens?" + keys.map(k => `key=${encodeURIComponent(k)}`).join("&"));
      if (res.ok) setListens(await res.json());
    } catch { /* noop */ }
  }, [tracks]);

  useEffect(() => {
    fetchListens();
    const timer = setInterval(fetchListens, 15000);
    return () => clearInterval(timer);
  }, [fetchListens]);

  // ── ESC ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (mini) setMini(false); else onClose(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [mini, onClose]);

  // ── Toggle listen ─────────────────────────────────────────────────────────
  const toggleListened = useCallback(async (track: LineupTrack) => {
    const key = trackKey(track);
    const existing = listens[key] ?? [];
    const iListened = existing.some(e => e.userId === currentUser.uid);
    const entry: ListenEntry = {
      userId: currentUser.uid,
      name: currentUser.name || "Team Member",
      photo: currentUser.photo || "",
      listenedAt: new Date().toISOString(),
    };
    setSaving(prev => ({ ...prev, [key]: true }));
    const optimistic = iListened ? existing.filter(e => e.userId !== currentUser.uid) : [...existing, entry];
    setListens(prev => ({ ...prev, [key]: optimistic }));
    try {
      await fetch("/api/lineup-listens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action: iListened ? "remove" : "add", entry, songId: track.songId, songTitle: track.title, mood: track.mood, eventName: track.eventName, eventDate: track.eventDate }),
      });
      await fetchListens();
    } catch {
      setListens(prev => ({ ...prev, [key]: existing }));
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [listens, currentUser, fetchListens]);

  if (!current) return null;
  const currentKey = trackKey(current);
  const currentEntries = listens[currentKey] ?? [];

  const ListenBtn = ({ track, compact = false }: { track: LineupTrack; compact?: boolean }) => {
    const key = trackKey(track);
    const iListened = (listens[key] ?? []).some(e => e.userId === currentUser.uid);
    const busy = saving[key];
    return (
      <button onClick={e => { e.stopPropagation(); toggleListened(track); }} disabled={busy}
        className={`flex items-center gap-1 rounded-full font-semibold shrink-0 transition-all
          ${compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"}
          ${iListened ? "bg-emerald-600/30 border border-emerald-500/50 text-emerald-400"
            : "bg-white/8 border border-white/15 text-gray-400 hover:text-white hover:border-white/30"}
          ${busy ? "opacity-60 cursor-wait" : ""}`}>
        <Check size={compact ? 9 : 11} />
        {iListened ? (compact ? "Listened ✓" : "✓ Listened") : (compact ? "Listened?" : "I've Listened")}
      </button>
    );
  };

  return (
    <>
      {/* Backdrop — full mode only */}
      {!mini && (
        <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm" onClick={() => setMini(true)} />
      )}

      {/* ══ ONE SHELL — always in DOM, mode switched via CSS ══════════════════
          playerDivId lives inside and NEVER unmounts → audio never stops.      */}
      <div
        ref={miniShellRef}
        className="fixed z-[9999]"
        style={mini
          ? {
              left: pos.x, top: pos.y,
              width: "min(92vw, 360px)",
              touchAction: "none",
              cursor: dragRef.current.dragging ? "grabbing" : "grab",
            }
          : {
              top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              width: "min(95vw, 960px)",
              maxHeight: "90vh",
            }
        }
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {/* ── MINI BAR UI (Spotify-style) ──────────────────────────────────── */}
        {mini && (
          <div className="flex items-center rounded-2xl bg-gray-950/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden w-full">
            {/* Thumbnail — tap to expand */}
            <button
              onClick={() => setMini(false)}
              title="Expand player"
              className="shrink-0 relative overflow-hidden hover:opacity-80 transition-opacity"
              style={{ width: 68, height: 68, minWidth: 68, cursor: "pointer" }}
            >
              {(() => {
                const vid = extractVideoId(current?.videoUrl ?? "");
                return vid ? (
                  <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt={current?.title ?? ""}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-indigo-900/50">
                    <ListMusic size={22} className="text-indigo-400" />
                  </div>
                );
              })()}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </div>
            </button>

            {/* Track info */}
            <div className="flex-1 min-w-0 px-3 select-none">
              <p className="text-[13px] font-bold text-white truncate leading-tight">{current?.title}</p>
              <p className="text-[11px] text-gray-400 truncate leading-snug mt-0.5 flex items-center gap-1.5">
                <span className="truncate">{current?.artist || "Music Video"}</span>
                <span className="text-gray-600 shrink-0">·</span>
                <span className="text-indigo-400 font-semibold shrink-0">{currentIdx + 1}/{tracks.length}</span>
                <span className="inline-flex items-center gap-0.5 text-[9px] text-indigo-500/60 font-semibold shrink-0"><RefreshCw size={8} /></span>
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 pr-2 shrink-0">
              <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev} title="Previous"
                className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">
                <SkipBack size={15} />
              </button>
              <button
                onClick={() => { if (playerRef.current) { const s = playerRef.current.getPlayerState?.(); if (s === 1) playerRef.current.pauseVideo(); else playerRef.current.playVideo(); } }}
                title="Play / Pause"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-gray-950 hover:scale-105 active:scale-95 transition-transform shadow-md shrink-0 mx-1">
                {isPlaying
                  ? <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button onClick={() => setCurrentIdx(i => i < tracks.length - 1 ? i + 1 : 0)} title="Next"
                className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all">
                <SkipForward size={15} />
              </button>
              <button onClick={onClose} title="Close"
                className="p-1.5 rounded-full text-white/25 hover:text-white hover:bg-white/10 transition-all">
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* ── FULL PLAYER UI ───────────────────────────────────────────────── */}
        {!mini && (
          <div className="bg-gray-900 shadow-2xl rounded-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-950/80 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ListMusic size={15} className="text-indigo-400 shrink-0" />
                <span className="font-bold text-white truncate text-sm">Lineup Playlist</span>
                <span className="text-xs text-white/40 shrink-0">· {tracks.length} song{tracks.length !== 1 ? "s" : ""}</span>
                <span className="flex items-center gap-0.5 text-[9px] text-indigo-400/70 font-semibold shrink-0"><RefreshCw size={9} />loop</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setMini(true)} title="Minimize — video keeps playing!"
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                    <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                  </svg>
                </button>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div ref={containerRef} className="flex min-h-0 flex-col md:flex-row" style={{ maxHeight: "calc(90vh - 53px)" }}>
              <div className="flex flex-col flex-shrink-0" style={{ flex: "1 1 0" }}>
                {/* ── YT player slot — always in DOM, hidden in mini via outer CSS ── */}
                <div className="relative w-full bg-black" style={{ paddingBottom: "56.25%" }}>
                  <div id={playerDivId} className="absolute inset-0 w-full h-full" />
                </div>
                <div className="px-4 py-2.5 bg-gray-900 border-t border-white/10 shrink-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <MoodPill mood={current.mood} />
                        <span className="text-[10px] text-gray-500">{fmtDate(current.eventDate)}</span>
                      </div>
                      <p className="text-sm font-bold text-white truncate">{current.title}</p>
                      {current.artist && <p className="text-xs text-gray-400 truncate">{current.artist}</p>}
                      <p className="text-[10px] text-indigo-400 mt-0.5 truncate">{current.eventName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev}
                        className="flex items-center gap-0.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-medium transition-colors px-3 py-1.5 text-xs">
                        <ChevronLeft size={14} /> Prev
                      </button>
                      <button onClick={() => setCurrentIdx(i => i + 1)} disabled={!hasNext}
                        className="flex items-center gap-0.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-medium transition-colors px-3 py-1.5 text-xs">
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1.5 border-t border-white/8">
                    <ListenBtn track={current} compact={false} />
                    <ListenedBy entries={currentEntries} currentUserId={currentUser.uid} />
                  </div>
                </div>
              </div>

              {/* Track list */}
              <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto">
                <div className="px-4 py-2.5 border-b border-white/10 bg-gray-950/40 shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Song Line-Up</p>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-white/5">
                  {tracks.map((t, i) => {
                    const key = trackKey(t);
                    const entries = listens[key] ?? [];
                    const iListened = entries.some(e => e.userId === currentUser.uid);
                    return (
                      <button key={`${t.songId}-${t.mood}-${i}`} onClick={() => setCurrentIdx(i)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-l-2 ${i === currentIdx ? "bg-indigo-600/20 border-indigo-500" : "hover:bg-white/5 border-transparent"}`}>
                        <div className="w-5 shrink-0 pt-0.5 flex items-center justify-center">
                          {i === currentIdx ? (
                            <div className="flex gap-0.5 items-end h-4">
                              <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: "100%", animationDelay: "0ms" }} />
                              <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: "70%", animationDelay: "150ms" }} />
                              <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: "90%", animationDelay: "300ms" }} />
                            </div>
                          ) : iListened ? <Check size={13} className="text-emerald-400" />
                            : <span className="text-[11px] text-gray-500 font-mono">{i + 1}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <MoodPill mood={t.mood} />
                            <span role="button" onClick={e => { e.stopPropagation(); toggleListened(t); }}
                              className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold transition-all ${iListened ? "bg-emerald-600/25 border-emerald-500/40 text-emerald-400" : "border-white/10 text-gray-500 hover:border-white/25 hover:text-gray-300"}`}>
                              {iListened ? "✓" : "+"}
                            </span>
                          </div>
                          <p className={`text-xs font-semibold truncate ${i === currentIdx ? "text-white" : "text-gray-200"}`}>{t.title}</p>
                          {t.artist && <p className="text-[10px] text-gray-500 truncate">{t.artist}</p>}
                          {entries.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <div className="flex -space-x-0.5">
                                {entries.slice(0, 3).map((e, ei) => (
                                  <span key={e.userId + ei}><Avatar name={e.name} photo={e.photo} size={14} /></span>
                                ))}
                              </div>
                              <span className="text-[9px] text-gray-500">
                                {entries.length === 1 ? entries[0].name.split(" ")[0] : `${entries.length} listened`}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HIDDEN YT IFRAME in mini mode ─────────────────────────────────
            playerDivId must always be in the DOM. In mini mode we hide this
            wrapper with CSS so audio keeps playing but video is invisible.    */}
        {mini && (
          <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none", top: 0, left: 0 }}>
            <div id={playerDivId} style={{ width: 1, height: 1 }} />
          </div>
        )}
      </div>
    </>
  );
}
