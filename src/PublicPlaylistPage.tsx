import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Music,
  BookOpen, Guitar, X, ExternalLink, Check, Repeat, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PublicSong {
  id: string;
  title: string;
  artist?: string;
  youtubeUrl?: string;
  lyrics?: string;
  chords?: string;
}
interface PublicPlaylist {
  name: string;
  emoji: string;
  description?: string;
  bannerUrl?: string;
  accentColor?: string; // Optional per-playlist accent: e.g. "#f97316" (orange)
  songs: PublicSong[];
  publishedAt: string;
}

// ── YouTube helpers ────────────────────────────────────────────────────────────
declare global { interface Window { YT: any; onYouTubeIframeAPIReady: () => void; } }

function extractYtId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

// ── SoundBar ──────────────────────────────────────────────────────────────────
function SoundBar({ color = "#818cf8" }: { color?: string }) {
  return (
    <span className="flex items-end gap-[2px]" style={{ height: 16, width: 14 }}>
      {[0, 1, 2].map(i => (
        <span key={i}
          style={{
            display: "block", width: 3, borderRadius: 4,
            background: color,
            animation: `ppl-sb 0.65s ease-in-out ${i * 0.15}s infinite alternate`,
            height: `${50 + i * 25}%`,
          }} />
      ))}
    </span>
  );
}

// ── Lyrics renderer ────────────────────────────────────────────────────────────
function renderLyrics(raw: string) {
  const SECTION = /^(?:VERSE|CHORUS|PRE[- ]?CHORUS|BRIDGE|OUTRO|INTRO|TAG|HOOK|REFRAIN|CODA)(\s+\d+)?\s*:?\s*$/i;
  return raw.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} style={{ height: 12 }} />;
    if (SECTION.test(t)) return (
      <p key={i} style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginTop: 20, marginBottom: 4 }}>
        {t.replace(/:$/, "")}
      </p>
    );
    return <p key={i} style={{ fontSize: 15, color: "#d1d5db", lineHeight: 1.9 }}>{line}</p>;
  });
}

// ── Time formatter ────────────────────────────────────────────────────────────
const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// =============================================================================
export default function PublicPlaylistPage({ slug }: { slug: string }) {
  const [playlist, setPlaylist] = useState<PublicPlaylist | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Player state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [isShuffle, setIsShuffle]   = useState(false);
  const [isRepeat, setIsRepeat]     = useState(false);
  const [progress, setProgress]     = useState(0);
  const [duration, setDuration]     = useState(0);

  // UI
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsTab, setLyricsTab]   = useState<"lyrics" | "chords">("lyrics");
  const [linkCopied, setLinkCopied] = useState(false);

  // Pulsing dot — visible for first 3 visits per playlist slug
  const VISIT_KEY = `ppl_visits_${slug}`;
  const [showLyricsDot, setShowLyricsDot] = useState<boolean>(() => {
    try {
      const v = parseInt(localStorage.getItem(VISIT_KEY) ?? "0", 10);
      const next = v + 1;
      localStorage.setItem(VISIT_KEY, String(next));
      return next <= 3;
    } catch { return false; }
  });

  // Dismissible lyrics-hint tip
  const TIP_KEY = `ppl_tip_${slug}`;
  const [showLyricsTip, setShowLyricsTip] = useState<boolean>(() => {
    try { return !localStorage.getItem(TIP_KEY); } catch { return true; }
  });
  const dismissTip = () => {
    setShowLyricsTip(false);
    try { localStorage.setItem(TIP_KEY, "1"); } catch { /* */ }
  };

  // Refs
  const playerRef      = useRef<any>(null);
  const ytWrapRef      = useRef<HTMLDivElement>(null);
  const tickerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const playlistRef    = useRef<PublicPlaylist | null>(null);
  const currentIdxRef  = useRef(0);
  const isShuffleRef   = useRef(false);
  const isRepeatRef    = useRef(false);
  const isPlayingRef   = useRef(false);
  // Pending play intent — captured when buildPlayer is called before YT API is ready
  const pendingPlay    = useRef<{ videoId: string; autoplay: boolean } | null>(null);
  const ytReadyRef     = useRef(false);
  const apiPollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  // Double-tap / double-click detection for song rows (works on both touch + mouse)
  const tapRef         = useRef<{ idx: number; ts: number; timer: ReturnType<typeof setTimeout> | null }>({ idx: -1, ts: 0, timer: null });

  // Keep refs in sync
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { isRepeatRef.current = isRepeat; }, [isRepeat]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/public-playlist/${slug}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "error"); return r.json(); })
      .then((d: PublicPlaylist) => { setPlaylist(d); setLoading(false); })
      .catch(e => { if (e.name === "AbortError") return; setError(e.message === "not_found" ? "not_found" : "error"); setLoading(false); });
    return () => ctrl.abort();
  }, [slug]);

  const stopTicker = useCallback(() => {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
  }, []);

  // ── Build YT player ───────────────────────────────────────────────────────
  // Low-level: actually instantiates the YT.Player. Only call when YT API is ready.
  const createYTPlayer = useCallback((videoId: string, autoplay: boolean) => {
    stopTicker();
    try { playerRef.current?.destroy?.(); } catch {}
    playerRef.current = null;

    if (!ytWrapRef.current) return;
    ytWrapRef.current.innerHTML = "";
    const div = document.createElement("div");
    ytWrapRef.current.appendChild(div);

    playerRef.current = new window.YT.Player(div, {
      videoId,
      playerVars: { autoplay: autoplay ? 1 : 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => {
          if (autoplay) {
            try { playerRef.current?.playVideo(); } catch {}
          }
        },
        onStateChange: (e: any) => {
          const S = window.YT.PlayerState;
          if (e.data === S.PLAYING) {
            setIsPlaying(true);
            setDuration(playerRef.current?.getDuration?.() ?? 0);
            stopTicker();
            tickerRef.current = setInterval(() => {
              const cur = playerRef.current?.getCurrentTime?.() ?? 0;
              const dur = playerRef.current?.getDuration?.() ?? 1;
              setProgress(dur > 0 ? cur / dur : 0);
            }, 400);
          } else if (e.data === S.PAUSED) {
            setIsPlaying(false);
            stopTicker();
          } else if (e.data === S.ENDED) {
            setIsPlaying(false);
            stopTicker();
            // auto-advance
            const pl = playlistRef.current;
            if (!pl) return;
            const idx = currentIdxRef.current;
            if (isRepeatRef.current) {
              playerRef.current?.seekTo(0, true);
              playerRef.current?.playVideo();
              return;
            }
            if (isShuffleRef.current && pl.songs.length > 1) {
              let ni: number;
              do { ni = Math.floor(Math.random() * pl.songs.length); } while (ni === idx);
              autoAdvanceRef.current = true;
              setCurrentIdx(ni);
            } else if (idx < pl.songs.length - 1) {
              autoAdvanceRef.current = true;
              setCurrentIdx(idx + 1);
            } else {
              setCurrentIdx(0);
            }
          }
        },
      },
    });
  }, [stopTicker]);

  // High-level: request to play a video. If YT API not ready yet, store intent.
  const buildPlayer = useCallback((videoId: string, autoplay: boolean) => {
    if (ytReadyRef.current) {
      createYTPlayer(videoId, autoplay);
    } else {
      // Store intent; the poll useEffect will call createYTPlayer once ready
      pendingPlay.current = { videoId, autoplay };
    }
  }, [createYTPlayer]);

  // ── Load YT API script once on mount (don't wait for playlist) ──────────────
  useEffect(() => {
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    // Poll until YT.Player is available, then flush any pending play intent
    apiPollRef.current = setInterval(() => {
      if (!window.YT?.Player) return;
      clearInterval(apiPollRef.current!);
      apiPollRef.current = null;
      ytReadyRef.current = true;
      const p = pendingPlay.current;
      if (p) {
        pendingPlay.current = null;
        createYTPlayer(p.videoId, p.autoplay);
      }
    }, 150);
    return () => {
      if (apiPollRef.current) clearInterval(apiPollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Play a specific index ─────────────────────────────────────────────────
  const playAt = useCallback((idx: number) => {
    // Use ref first (fast path). Fall back to playlist state on the very first
    // call before the useEffect has had a chance to sync the ref.
    const pl = playlistRef.current ?? playlist;
    if (!pl || idx < 0 || idx >= pl.songs.length) return;
    setProgress(0); setDuration(0);
    setCurrentIdx(idx);
    const vid = extractYtId(pl.songs[idx].youtubeUrl ?? "");
    if (vid) {
      buildPlayer(vid, true);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [buildPlayer, playlist]);

  // ── When currentIdx changes due to auto-advance (ended), load new song ──
  // playAt() handles its own buildPlayer call; this effect only handles
  // changes made by onStateChange (ENDED) setting currentIdx via setCurrentIdx.
  const autoAdvanceRef = useRef(false);
  useEffect(() => {
    if (!playlist) return;
    if (!autoAdvanceRef.current) return; // skip if triggered by playAt()
    autoAdvanceRef.current = false;
    const vid = extractYtId(playlist.songs[currentIdx].youtubeUrl ?? "");
    if (vid) buildPlayer(vid, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  useEffect(() => () => stopTicker(), [stopTicker]);

  // ── Media Session API — lock screen / notification controls ───────────────
  // Works on Android Chrome 57+ and iOS Safari 15+.
  // Note: background audio *continuation* depends on the OS/browser; iOS may
  // still suspend the tab when locked, but the controls will appear when
  // returning to the browser. Android Chrome generally keeps the tab alive.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const song = playlist?.songs[currentIdx];
    if (!song) return;

    const ytId = extractYtId(song.youtubeUrl ?? '');
    const artwork = ytId
      ? [
          { src: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
          { src: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title ?? 'Unknown',
      artist: song.artist ?? '',
      album: playlist?.name ?? '',
      artwork,
    });

    // Action handlers wire up OS buttons → YouTube player
    navigator.mediaSession.setActionHandler('play', () => {
      playerRef.current?.playVideo?.();
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      playerRef.current?.pauseVideo?.();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      const pl = playlistRef.current;
      if (!pl) return;
      const prev = currentIdxRef.current > 0 ? currentIdxRef.current - 1 : pl.songs.length - 1;
      playAt(prev);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      const pl = playlistRef.current;
      if (!pl) return;
      const next = currentIdxRef.current < pl.songs.length - 1 ? currentIdxRef.current + 1 : 0;
      playAt(next);
    });

    // Sync playback state badge
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [playlist, currentIdx, isPlaying, playAt]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!playerRef.current) {
      // Player not built yet — build and play first song
      if (playlist && playlist.songs.length > 0) {
        playAt(currentIdx);
      }
      return;
    }
    if (isPlayingRef.current) {
      playerRef.current.pauseVideo?.();
    } else {
      playerRef.current.playVideo?.();
    }
  };

  // ── Unified row double-tap / double-click handler ─────────────────────────
  // Works on both mouse (dblclick) and touch (two taps within 300 ms).
  // • Double tap/click any song   → play it
  // • Single tap current song     → toggle play/pause
  // • Single tap other song       → wait; if 2nd tap comes within 300 ms, play
  const handleRowTap = useCallback((idx: number) => {
    const now = Date.now();
    const { idx: lastIdx, ts: lastTs, timer } = tapRef.current;
    const isDoubleTap = lastIdx === idx && now - lastTs < 300;

    if (timer) { clearTimeout(timer); tapRef.current.timer = null; }

    if (isDoubleTap) {
      tapRef.current = { idx: -1, ts: 0, timer: null };
      playAt(idx);
      return;
    }

    if (currentIdxRef.current === idx && playerRef.current) {
      tapRef.current = { idx: -1, ts: 0, timer: null };
      togglePlay();
      return;
    }

    tapRef.current = {
      idx,
      ts: now,
      timer: setTimeout(() => { tapRef.current = { idx: -1, ts: 0, timer: null }; }, 300),
    };
  }, [playAt, togglePlay]);

  const handlePrev = () => {
    if (!playlist) return;
    const idx = currentIdxRef.current;
    playAt((idx - 1 + playlist.songs.length) % playlist.songs.length);
  };

  const handleNext = useCallback(() => {
    const pl = playlistRef.current;
    if (!pl) return;
    const idx = currentIdxRef.current;
    if (isShuffleRef.current && pl.songs.length > 1) {
      let ni: number;
      do { ni = Math.floor(Math.random() * pl.songs.length); } while (ni === idx);
      playAt(ni);
    } else {
      playAt((idx + 1) % pl.songs.length);
    }
  }, [playAt]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setProgress(v);
    const d = playerRef.current?.getDuration?.() ?? 0;
    if (d > 0) playerRef.current?.seekTo?.(v * d, true);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentSong = playlist?.songs[currentIdx] ?? null;
  const hasVideo    = !!extractYtId(currentSong?.youtubeUrl ?? "");
  // Whether ANY song in the playlist has a playable YouTube URL
  const hasAnyVideo = !!playlist?.songs.some(s => extractYtId(s.youtubeUrl ?? ""));
  const elapsed     = progress * duration;

  // ── Accent color CSS vars (per-playlist, stored in Firestore) ────────────────
  // Falls back to indigo if no accentColor set.
  // Use || (not ??) so empty string "" also triggers the fallback.
  const accent    = playlist?.accentColor || "#6366f1";
  const accentMid = playlist?.accentColor || "#818cf8";

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={ROOT_STYLE} className="min-h-screen bg-[#080a0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading playlist…</p>
      </div>
    </div>
  );
  if (error === "not_found") return (
    <div style={ROOT_STYLE} className="min-h-screen bg-[#080a0f] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-24 h-24 bg-gray-800/50 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-6">🔍</div>
        <h1 className="text-2xl font-black text-white mb-3">Playlist Not Found</h1>
        <p className="text-gray-500 leading-relaxed">This playlist link doesn't exist or may have been removed.</p>
      </div>
    </div>
  );
  if (error || !playlist) return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center">
      <p className="text-red-400">Failed to load playlist. Please try again.</p>
    </div>
  );

  const hasSongs = playlist.songs.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...ROOT_STYLE,
        // Inject accent as CSS custom property for dynamic theming
        "--accent"    : accent,
        "--accent-mid": accentMid,
      } as React.CSSProperties}
      className="min-h-screen bg-[#080a0f] text-white flex flex-col"
      data-force-dark="true"
    >

      {/* Hidden YT player */}
      <div ref={ytWrapRef}
        style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, overflow: "hidden", pointerEvents: "none" }}
        aria-hidden />

      {/* ── Hero: Banner + Playlist Info ─────────────────────────────────────── */}
      <div className="shrink-0">

        {/* Banner image — full width, no side padding */}
        {playlist.bannerUrl ? (
          <div className="relative w-full overflow-hidden" style={{ maxHeight: "clamp(160px, 30vw, 260px)" }}>
            <img
              src={playlist.bannerUrl}
              alt={playlist.name}
              className="w-full h-full object-cover object-top"
              style={{ minHeight: "100%", display: "block" }}
            />
            {/* Bottom fade into dark bg */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#080a0f] to-transparent" />
          </div>
        ) : (
          /* No banner fallback: just a minimal dark strip */
          <div className="w-full h-4 bg-[#080a0f]" />
        )}

        {/* Playlist info below the banner */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-6">
          <h1 className="font-black text-white leading-tight mb-1"
            style={{ fontSize: "clamp(1.4rem, 4vw, 2.5rem)" }}>
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="text-gray-400 text-sm leading-relaxed mb-2 max-w-lg">{playlist.description}</p>
          )}
          <p className="text-gray-500 text-sm mb-5">
            {playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"}
            {playlist.publishedAt && (
              <> · Shared {new Date(playlist.publishedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</>
            )}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                if (!hasSongs) return;
                if (playerRef.current && currentSong && hasVideo) {
                  togglePlay();
                } else if (hasAnyVideo) {
                  const firstPlayable = playlist!.songs.findIndex(s => extractYtId(s.youtubeUrl ?? ""));
                  playAt(firstPlayable >= 0 ? firstPlayable : 0);
                }
              }}
              disabled={!hasSongs || !hasAnyVideo}
              title={!hasAnyVideo ? "No YouTube links added to songs yet" : undefined}
              style={{ background: `var(--accent)`, boxShadow: `0 8px 32px color-mix(in srgb, var(--accent) 35%, transparent)` }}
              className="flex items-center gap-2.5 px-7 py-3 rounded-full hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-all active:scale-95"
            >
              {isPlaying && currentSong
                ? <><Pause size={16} className="fill-white" /> Pause</>
                : <><Play size={16} className="fill-white" /> Play All</>}
            </button>
            <button
              onClick={() => setIsShuffle(v => !v)}
              disabled={!hasSongs}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-40 ${
                isShuffle
                  ? "bg-emerald-600/80 text-white"
                  : "bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10"
              }`}
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={() => setIsRepeat(v => !v)}
              disabled={!hasSongs}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-40 ${
                isRepeat
                  ? "bg-purple-600/80 text-white"
                  : "bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10"
              }`}
            >
              <Repeat size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Track list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-2 sm:px-4 py-4 pb-32">

        {/* Column headers */}
        <div className="grid items-center gap-3 px-4 mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-700"
          style={{ gridTemplateColumns: "40px 1fr auto" }}>
          <span className="text-center">#</span>
          <span>Title</span>
          <span></span>
        </div>
        <div className="h-px bg-gray-800/50 mb-1" />

        {/* ── Lyrics hint tip (dismissible, shown until acknowledged) ── */}
        {showLyricsTip && hasSongs && (
          <div className="flex items-center gap-3 mx-1 mb-3 px-4 py-3 rounded-2xl border"
            style={{
              background: `color-mix(in srgb, var(--accent) 8%, transparent)`,
              borderColor: `color-mix(in srgb, var(--accent) 25%, transparent)`,
            }}
          >
            {/* Pulsing info icon */}
            <span className="relative shrink-0">
              <span className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: `color-mix(in srgb, var(--accent) 40%, transparent)` }} />
              <Info size={15} style={{ color: `var(--accent)` }} className="relative" />
            </span>
            <p className="flex-1 text-xs leading-relaxed" style={{ color: `color-mix(in srgb, var(--accent) 90%, white)` }}>
              Tap the <BookOpen size={12} className="inline mb-0.5" /> book icon at the bottom bar to read the lyrics and chords for any song.
            </p>
            <button
              onClick={dismissTip}
              className="shrink-0 p-1 rounded-lg transition-colors"
              style={{ color: `color-mix(in srgb, var(--accent) 60%, gray)` }}
              aria-label="Dismiss tip"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Songs */}
        <div className="divide-y divide-gray-800/40">
          {playlist.songs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Music size={32} className="text-gray-700" />
              <p className="text-gray-600">No songs in this playlist.</p>
            </div>
          ) : (
            playlist.songs.map((song, idx) => {
              const isNow = currentIdx === idx;
              return (
                <div
                  key={song.id}
                  onClick={() => handleRowTap(idx)}
                  title="Double-tap to play · Single-tap to pause/resume current"
                  className="group grid items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all select-none"
                  style={isNow ? {
                    gridTemplateColumns: "40px 1fr auto",
                    background: `color-mix(in srgb, var(--accent) 10%, transparent)`,
                    boxShadow:  `inset 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent)`,
                  } : { gridTemplateColumns: "40px 1fr auto" }}
                  onMouseEnter={e => { if (!isNow) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { if (!isNow) (e.currentTarget as HTMLDivElement).style.background = ""; }}
                >
                  {/* Number / playing indicator */}
                  <div className="flex items-center justify-center w-8 h-8 shrink-0">
                    {isNow && isPlaying
                      ? <SoundBar color={accent} />
                      : isNow
                        ? <Music size={16} style={{ color: `var(--accent)` }} />
                        : <span className="text-sm text-gray-600 group-hover:hidden tabular-nums">{idx + 1}</span>
                    }
                    {!isNow && (
                      <span className="hidden group-hover:flex items-center justify-center">
                        <Play size={15} className="text-white fill-white" />
                      </span>
                    )}
                  </div>

                  {/* Song info */}
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm sm:text-base truncate leading-tight`}
                      style={{ color: isNow ? `var(--accent)` : "white" }}>
                      {song.title}
                    </p>
                    {song.artist && (
                      <p className="text-xs sm:text-sm text-gray-600 truncate mt-0.5 group-hover:text-gray-400 transition-colors">{song.artist}</p>
                    )}
                  </div>

                  {/* Lyrics button */}
                  <div className="shrink-0">
                    {(song.lyrics || song.chords) && (
                      <button
                        onClick={e => { e.stopPropagation(); playAt(idx); setLyricsOpen(true); }}
                        className="p-2 rounded-lg text-transparent group-hover:text-gray-600 transition-all"
                        style={{ "--hover-color": `var(--accent)` } as React.CSSProperties}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = `var(--accent)`}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ""}
                        title="View lyrics / chords"
                      >
                        <BookOpen size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p className="text-center text-xs text-gray-800 mt-10 pb-4">
          Powered by <span className="font-semibold" style={{ color: `var(--accent)` }}>WorshipFlow</span>
        </p>
      </div>

      {/* ── Bottom player bar ─────────────────────────────────────────────────── */}
      {hasSongs && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#0c0e14]/95 backdrop-blur-2xl border-t border-white/5">
          {/* Progress strip */}
          <div className="relative h-[3px] bg-gray-800/80 group/bar">
            <div
              className="h-full transition-all"
              style={{ width: `${progress * 100}%`, background: `var(--accent)` }}
            />
            <input
              type="range" min={0} max={1} step={0.001} value={progress}
              onChange={handleSeek}
              disabled={!hasVideo || duration === 0}
              className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              style={{ height: 20, top: -8 }}
            />
          </div>

          <div className="max-w-3xl mx-auto px-3 sm:px-5 py-3 flex items-center gap-3">

            {/* Song info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-xl shrink-0 select-none"
                style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--accent) 80%, #000), color-mix(in srgb, var(--accent) 40%, #000))` }}
              >
                {playlist.emoji}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate text-white leading-tight">{currentSong?.title ?? "—"}</p>
                {currentSong?.artist && (
                  <p className="text-xs text-gray-500 truncate">{currentSong.artist}</p>
                )}
              </div>
            </div>

            {/* Time (desktop only) */}
            <div className="hidden sm:flex items-center gap-1 text-xs text-gray-600 tabular-nums shrink-0">
              <span>{duration > 0 ? fmt(elapsed) : "0:00"}</span>
              <span className="text-gray-800">/</span>
              <span>{duration > 0 ? fmt(duration) : "--:--"}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Lyrics (if available) */}
              {currentSong && (currentSong.lyrics || currentSong.chords) && (
                <button
                  onClick={() => { setLyricsOpen(true); setShowLyricsDot(false); }}
                  className="relative p-2.5 rounded-xl text-gray-600 hover:text-purple-400 hover:bg-purple-500/10 transition-all active:scale-90"
                  title="Lyrics / Chords"
                >
                  <BookOpen size={18} />
                  {/* Pulsing attention dot — fades after 3 visits */}
                  {showLyricsDot && (
                    <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ background: "radial-gradient(circle, #fbbf24, #f97316)" }} />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5"
                        style={{ background: "linear-gradient(135deg, #fbbf24, #f97316)" }} />
                    </span>
                  )}
                </button>
              )}

              <button onClick={handlePrev}
                className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-25 transition-all active:scale-90"
                disabled={!hasVideo}>
                <SkipBack size={19} />
              </button>

              <button
                onClick={togglePlay}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-md ${
                  hasVideo ? "bg-white hover:scale-105" : "bg-gray-700/50 cursor-not-allowed opacity-40"
                }`}
                disabled={!hasVideo}
                title={!hasVideo ? "No YouTube link for this song" : (isPlaying ? "Pause" : "Play")}
              >
                {isPlaying
                  ? <Pause size={18} className="text-gray-900 fill-gray-900" />
                  : <Play  size={18} className="text-gray-900 fill-gray-900 ml-0.5" />}
              </button>

              <button onClick={handleNext}
                className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-25 transition-all active:scale-90"
                disabled={!hasVideo}>
                <SkipForward size={19} />
              </button>

              {/* Shuffle (desktop) */}
              <button
                onClick={() => setIsShuffle(v => !v)}
                className={`hidden sm:flex w-9 h-9 items-center justify-center rounded-full transition-all active:scale-90 ${
                  isShuffle ? "text-emerald-400 bg-emerald-500/10" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"
                }`}
              >
                <Shuffle size={17} />
              </button>

              {/* Repeat (desktop) */}
              <button
                onClick={() => setIsRepeat(v => !v)}
                className={`hidden sm:flex w-9 h-9 items-center justify-center rounded-full transition-all active:scale-90 ${
                  isRepeat ? "text-purple-400 bg-purple-500/10" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"
                }`}
              >
                <Repeat size={17} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lyrics / Chords sheet ─────────────────────────────────────────────── */}
      {lyricsOpen && currentSong && (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setLyricsOpen(false)} />
          <div className="fixed z-50
            bottom-0 left-0 right-0 rounded-t-3xl max-h-[82vh]
            sm:inset-x-auto sm:bottom-auto sm:top-16 sm:right-4 sm:left-auto sm:w-[400px] sm:rounded-3xl sm:max-h-[calc(100vh-80px)]
            bg-[#13151e] border border-gray-700/50 shadow-2xl flex flex-col overflow-hidden">
            {/* Handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-0.5"
              style={{ color: `var(--accent)` }}>Now Playing</p>
                <p className="text-base font-bold text-white truncate">{currentSong.title}</p>
                {currentSong.artist && <p className="text-sm text-gray-500 truncate">{currentSong.artist}</p>}
              </div>
              <button onClick={() => setLyricsOpen(false)}
                className="w-8 h-8 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white flex items-center justify-center transition-all shrink-0">
                <X size={18} />
              </button>
            </div>
            {/* Tabs — Chords tab hidden for now */}
            <div className="flex gap-2 px-5 pt-3 pb-2 shrink-0">
              <button onClick={() => setLyricsTab("lyrics")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-indigo-600 text-white">
                <BookOpen size={13} /> Lyrics
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {lyricsTab === "lyrics"
                ? currentSong.lyrics
                  ? <div>{renderLyrics(currentSong.lyrics)}</div>
                  : <p className="text-gray-600 italic text-sm mt-2">No lyrics saved.</p>
                : currentSong.chords
                  ? <pre className="text-[15px] text-gray-300 font-mono whitespace-pre-wrap leading-8">{currentSong.chords}</pre>
                  : <p className="text-gray-600 italic text-sm mt-2">No chords saved.</p>
              }
            </div>
            <div className="h-6 shrink-0" />
          </div>
        </>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes ppl-sb {
          0%   { transform: scaleY(0.3); }
          100% { transform: scaleY(1.1); }
        }
        .ppl-sb { transform-origin: bottom; }
      `}</style>
    </div>
  );
}

const ROOT_STYLE: React.CSSProperties = { fontFamily: "'Inter', system-ui, sans-serif" };
