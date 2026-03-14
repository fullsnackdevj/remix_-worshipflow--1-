import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Music, Sun, ListMusic, Check, RefreshCw } from "lucide-react";

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

  // YouTube IFrame API player ref — this is what gives us onStateChange
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Use a stable unique ID for the player div
  const playerDivId = useRef("lineup-yt-" + Math.random().toString(36).slice(2)).current;

  const current = tracks[currentIdx];
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
          playsinline: 1, // Stay inline on iOS (no forced fullscreen)
          rel:  0,
          modestbranding: 1,
        },
        events: {
          onReady: () => setPlayerReady(true),
          onStateChange: (event: { data: number }) => {
            // 0 = ENDED — auto-advance and loop back to start
            if (event.data === 0) {
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
    // loadVideoById auto-plays on desktop and mobile
    playerRef.current.loadVideoById(videoId);
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
      {/* Backdrop — full mode only, click to minimize */}
      {!mini && (
        <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm" onClick={() => setMini(true)} />
      )}

      {/* ── Player shell — CSS only switch between mini/full ─────────────────
          The YT player div NEVER unmounts so video keeps playing through mode switch */}
      <div
        className={`fixed z-[9999] bg-gray-900 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
          mini ? "bottom-4 right-4 w-72" : ""
        }`}
        style={mini ? {} : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(95vw, 960px)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-950/80 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListMusic size={mini ? 12 : 15} className="text-indigo-400 shrink-0" />
            <span className={`font-bold text-white truncate ${mini ? "text-xs" : "text-sm"}`}>
              {mini ? `${currentIdx + 1}/${tracks.length} · ${current.title}` : "Lineup Playlist"}
            </span>
            {!mini && <span className="text-xs text-white/40 shrink-0">· {tracks.length} song{tracks.length !== 1 ? "s" : ""}</span>}
            {/* Loop indicator */}
            <span className="flex items-center gap-0.5 text-[9px] text-indigo-400/70 font-semibold shrink-0">
              <RefreshCw size={9} />loop
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setMini(v => !v)}
              title={mini ? "Expand" : "Minimize — video keeps playing!"}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
              {mini ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                </svg>
              )}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
              <X size={mini ? 13 : 16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={containerRef} className={`flex min-h-0 ${mini ? "flex-col" : "flex-col md:flex-row"}`}
          style={mini ? {} : { maxHeight: "calc(90vh - 53px)" }}>

          {/* Video column */}
          <div className="flex flex-col flex-shrink-0" style={mini ? {} : { flex: "1 1 0" }}>
            {/* YT Player container — ALWAYS rendered, never unmounts */}
            <div className="relative w-full bg-black" style={{ paddingBottom: "56.25%" }}>
              <div id={playerDivId} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Controls */}
            <div className="px-4 py-2.5 bg-gray-900 border-t border-white/10 shrink-0 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <MoodPill mood={current.mood} />
                    <span className="text-[10px] text-gray-500">{fmtDate(current.eventDate)}</span>
                  </div>
                  <p className="text-sm font-bold text-white truncate">{current.title}</p>
                  {current.artist && <p className="text-xs text-gray-400 truncate">{current.artist}</p>}
                  {!mini && <p className="text-[10px] text-indigo-400 mt-0.5 truncate">{current.eventName}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <button onClick={() => setCurrentIdx(i => i - 1)} disabled={!hasPrev}
                    className={`flex items-center gap-0.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-medium transition-colors ${mini ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"}`}>
                    <ChevronLeft size={mini ? 12 : 14} />{!mini && "Prev"}
                  </button>
                  <button onClick={() => setCurrentIdx(i => i + 1)} disabled={!hasNext}
                    className={`flex items-center gap-0.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-medium transition-colors ${mini ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"}`}>
                    {!mini && "Next"}<ChevronRight size={mini ? 12 : 14} />
                  </button>
                </div>
              </div>
              {/* I've Listened */}
              <div className="flex items-center gap-3 pt-1.5 border-t border-white/8">
                <ListenBtn track={current} compact={mini} />
                <ListenedBy entries={currentEntries} currentUserId={currentUser.uid} />
              </div>
            </div>
          </div>

          {/* Track list — hidden in mini */}
          {!mini && (
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
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-l-2 ${
                        i === currentIdx ? "bg-indigo-600/20 border-indigo-500" : "hover:bg-white/5 border-transparent"
                      }`}>
                      <div className="w-5 shrink-0 pt-0.5 flex items-center justify-center">
                        {i === currentIdx ? (
                          <div className="flex gap-0.5 items-end h-4">
                            <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: "100%", animationDelay: "0ms" }} />
                            <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: "70%", animationDelay: "150ms" }} />
                            <span className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: "90%", animationDelay: "300ms" }} />
                          </div>
                        ) : iListened ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <span className="text-[11px] text-gray-500 font-mono">{i + 1}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <MoodPill mood={t.mood} />
                          <span role="button" onClick={e => { e.stopPropagation(); toggleListened(t); }}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold transition-all ${
                              iListened ? "bg-emerald-600/25 border-emerald-500/40 text-emerald-400"
                                : "border-white/10 text-gray-500 hover:border-white/25 hover:text-gray-300"
                            }`}>
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
          )}
        </div>
      </div>
    </>
  );
}
