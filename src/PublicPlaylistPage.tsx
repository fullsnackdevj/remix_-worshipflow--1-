import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Music,
  BookOpen, Guitar, X, ListMusic, ExternalLink, Check,
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
function SoundBar({ color = "indigo" }: { color?: string }) {
  return (
    <span className="flex items-end gap-[2px] h-4">
      {[1, 2, 3].map(i => (
        <span key={i}
          className={`w-[3px] rounded-full animate-soundbar ${color === "white" ? "bg-white" : "bg-indigo-400"}`}
          style={{ animationDelay: `${i * 0.15}s`, height: `${8 + i * 4}px` }} />
      ))}
    </span>
  );
}

// ── Lyrics renderer ────────────────────────────────────────────────────────────
function renderLyrics(raw: string) {
  return raw.split(/\n\n+/).map((block, bi) => {
    const lines = block.split("\n");
    const header = /^\[(Verse|Chorus|Bridge|Pre-?Chorus|Outro|Intro|Tag|Refrain|Hook)/i.test(lines[0]);
    return (
      <div key={bi} className="mb-6">
        {lines.map((ln, li) =>
          !ln.trim() ? null : li === 0 && header
            ? <p key={li} className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-2">{ln}</p>
            : <p key={li} className="text-[15px] text-gray-200 leading-loose">{ln}</p>
        )}
      </div>
    );
  });
}

// ── Time formatter ────────────────────────────────────────────────────────────
const fmt = (sec: number) => {
  const s = Math.floor(sec);
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
  const [order, setOrder]           = useState<number[]>([]);
  const [progress, setProgress]     = useState(0);
  const [duration, setDuration]     = useState(0);

  // UI state
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsTab, setLyricsTab]   = useState<"lyrics" | "chords">("lyrics");
  const [linkCopied, setLinkCopied] = useState(false);

  // YT refs
  const playerRef     = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);  // wrapper div — never replaced
  const tickerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/public-playlist/${slug}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "error"); return r.json(); })
      .then((d: PublicPlaylist) => { setPlaylist(d); setOrder(d.songs.map((_, i) => i)); setLoading(false); })
      .catch(e => { if (e.name === "AbortError") return; setError(e.message === "not_found" ? "not_found" : "error"); setLoading(false); });
    return () => ctrl.abort();
  }, [slug]);

  // ── YT API script ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playlist) return;
    if (window.YT?.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, [playlist]);

  // ── Build player ──────────────────────────────────────────────────────────
  const currentSong = playlist?.songs[order[currentIdx]];

  const handleNext = useCallback(() => {
    if (!playlist) return;
    setCurrentIdx(i => (i + 1) % playlist.songs.length);
    setIsPlaying(false);
  }, [playlist]);

  const buildPlayer = useCallback((videoId: string) => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    // Destroy old player safely
    try { playerRef.current?.destroy?.(); } catch {}
    playerRef.current = null;

    if (!ytContainerRef.current) { console.warn('[YT] container not ready'); return; }

    // YouTube replaces the target element with an <iframe>, so we must provide
    // a fresh <div> on every call — reusing the old ref breaks after the first create.
    ytContainerRef.current.innerHTML = '';
    const freshDiv = document.createElement('div');
    ytContainerRef.current.appendChild(freshDiv);

    const create = () => {
      playerRef.current = new window.YT.Player(freshDiv, {
        videoId,
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setDuration(playerRef.current?.getDuration?.() ?? 0);
              if (tickerRef.current) clearInterval(tickerRef.current);
              tickerRef.current = setInterval(() => {
                const cur = playerRef.current?.getCurrentTime?.() ?? 0;
                const dur = playerRef.current?.getDuration?.() ?? 1;
                setProgress(dur > 0 ? cur / dur : 0);
              }, 500);
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (e.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              handleNext();
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      create();
    } else {
      // YT API not loaded yet — queue our create() after it finishes loading
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); create(); };
    }
  }, [handleNext]);

  useEffect(() => {
    if (!currentSong) return;
    const vid = extractYtId(currentSong.youtubeUrl ?? "");
    if (!vid) { console.warn('[YT] no video ID for song:', currentSong.title, '| url:', currentSong.youtubeUrl); return; }
    buildPlayer(vid);
    setProgress(0); setDuration(0);
  }, [currentIdx, order, buildPlayer]);

  useEffect(() => () => { tickerRef.current && clearInterval(tickerRef.current); }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  const playIdx    = (idx: number) => { setCurrentIdx(idx); setIsPlaying(false); };
  const togglePlay = () => { if (!playerRef.current) return; isPlaying ? playerRef.current.pauseVideo?.() : playerRef.current.playVideo?.(); };
  const handlePrev = () => { if (!playlist) return; setCurrentIdx(i => (i - 1 + playlist.songs.length) % playlist.songs.length); setIsPlaying(false); };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value); setProgress(v);
    const d = playerRef.current?.getDuration?.() ?? 0; if (d > 0) playerRef.current?.seekTo?.(v * d, true);
  };
  const toggleShuffle = () => {
    if (!playlist) return;
    if (isShuffle) { setOrder(playlist.songs.map((_, i) => i)); setCurrentIdx(0); }
    else {
      const arr = [...playlist.songs.map((_, i) => i)];
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      setOrder(arr); setCurrentIdx(0);
    }
    setIsShuffle(v => !v);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }} className="min-h-screen bg-[#080a0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading playlist…</p>
      </div>
    </div>
  );
  if (error === "not_found") return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }} className="min-h-screen bg-[#080a0f] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-24 h-24 bg-gray-800/50 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-6">🔍</div>
        <h1 className="text-2xl font-black text-white mb-3">Playlist Not Found</h1>
        <p className="text-gray-500 leading-relaxed">This playlist link doesn't exist or may have been removed by the team.</p>
      </div>
    </div>
  );
  if (error || !playlist) return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center">
      <p className="text-red-400">Failed to load playlist. Please try again.</p>
    </div>
  );

  const hasSongs = playlist.songs.length > 0;
  const hasVideo = !!extractYtId(currentSong?.youtubeUrl ?? "");
  const elapsedS = progress * duration;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      className="min-h-screen bg-[#080a0f] text-white flex flex-col">

      {/* Hidden YT container — the wrapper div is NEVER replaced by YouTube.
      We inject a fresh child div before each player creation so the API
      always gets a clean element to turn into an <iframe>. */}
      <div ref={ytContainerRef}
        className="fixed -top-[9999px] -left-[9999px] w-1 h-1 overflow-hidden pointer-events-none"
        aria-hidden />

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 fixed top-0 left-0 right-0 z-20 bg-[#080a0f]/80 backdrop-blur-xl border-b border-gray-800/40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Music size={14} className="text-white" />
            </div>
            <span className="text-sm font-black tracking-wider text-white uppercase">WorshipFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-gray-700 hover:border-gray-500 text-xs font-semibold text-gray-400 hover:text-white transition-all"
            >
              {linkCopied ? <><Check size={12} className="text-emerald-400" /> Copied!</> : <><ExternalLink size={12} /> Share</>}
            </button>
            <span className="text-xs text-gray-600 hidden sm:block">Public Playlist</span>
          </div>
        </div>
      </header>

      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 pt-14 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-[#080a0f]" />
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -top-10 right-0 w-96 h-96 bg-purple-700/15 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 pb-8 pt-10">
          {/* Desktop hero: big cover left, info right */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 lg:gap-10">
            {/* Cover art */}
            <div className="w-32 h-32 sm:w-44 sm:h-44 lg:w-56 lg:h-56 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-800 border border-indigo-400/20 flex items-center justify-center shadow-2xl shadow-indigo-900/50 shrink-0 select-none"
              style={{ fontSize: "clamp(3rem, 6vw, 7rem)" }}>
              {playlist.emoji}
            </div>
            {/* Meta */}
            <div className="flex-1 min-w-0 pb-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 mb-2">Public Playlist</p>
              <h1 className="font-black text-white leading-none mb-3"
                style={{ fontSize: "clamp(1.75rem, 4vw, 3.5rem)" }}>
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="text-gray-400 text-sm sm:text-base leading-relaxed mb-3 max-w-xl">{playlist.description}</p>
              )}
              <p className="text-gray-600 text-sm mb-5">
                {playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"}
                {playlist.publishedAt && <> · Shared {new Date(playlist.publishedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</>}
              </p>
              {/* Action buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => hasSongs && playIdx(0)}
                  disabled={!hasSongs}
                  className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm transition-all active:scale-95 shadow-lg shadow-indigo-900/40"
                >
                  <Play size={16} className="fill-white" /> Play All
                </button>
                <button
                  onClick={toggleShuffle}
                  disabled={!hasSongs}
                  className={`flex items-center gap-2.5 px-7 py-3 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-40 ${
                    isShuffle ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30" : "bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                  }`}
                >
                  <Shuffle size={16} /> Shuffle
                </button>
                {currentSong && (
                  <button
                    onClick={() => setLyricsOpen(true)}
                    className="flex items-center gap-2.5 px-7 py-3 rounded-full font-bold text-sm bg-white/5 hover:bg-purple-600/40 text-gray-300 hover:text-white border border-white/10 hover:border-purple-500/40 transition-all active:scale-95"
                  >
                    <BookOpen size={16} /> Lyrics
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content: two-col on desktop ────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 pb-32
                      lg:grid lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr] lg:gap-8 lg:items-start">

        {/* ── LEFT COLUMN — sticky now-playing card (desktop only) ──────────── */}
        <aside className="hidden lg:block sticky top-20">
          <div className="bg-gray-900/50 border border-gray-800/60 rounded-3xl overflow-hidden">
            {/* Now playing header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-800/40">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">Now Playing</p>
              <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-indigo-700/80 to-purple-900/80 flex items-center justify-center text-7xl mb-4 select-none border border-indigo-500/10 shadow-xl">
                {playlist.emoji}
              </div>
              <p className="font-bold text-white text-lg leading-tight truncate">
                {currentSong?.title ?? "—"}
              </p>
              {currentSong?.artist && (
                <p className="text-gray-500 text-sm mt-0.5 truncate">{currentSong.artist}</p>
              )}
            </div>

            {/* Progress bar */}
            <div className="px-6 pt-5 pb-2">
              <div className="relative h-1 bg-gray-800 rounded-full mb-1">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                  style={{ width: `${progress * 100}%` }} />
                <input type="range" min={0} max={1} step={0.001} value={progress}
                  onChange={handleSeek}
                  disabled={!hasVideo || duration === 0}
                  className="absolute inset-0 w-full opacity-0 h-5 -top-2 cursor-pointer disabled:cursor-not-allowed" />
              </div>
              <div className="flex justify-between text-[11px] text-gray-600 tabular-nums">
                <span>{duration > 0 ? fmt(elapsedS) : "0:00"}</span>
                <span>{duration > 0 ? fmt(duration) : "--:--"}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 px-6 pb-6 pt-3">
              <button onClick={handlePrev} disabled={!hasVideo}
                className="w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-25 transition-all active:scale-90">
                <SkipBack size={20} />
              </button>
              <button onClick={togglePlay}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-xl ${
                  hasVideo ? "bg-white hover:scale-105" : "bg-gray-700 cursor-default"
                }`}>
                {isPlaying
                  ? <Pause size={22} className="text-gray-900 fill-gray-900" />
                  : <Play  size={22} className="text-gray-900 fill-gray-900 ml-0.5" />}
              </button>
              <button onClick={handleNext} disabled={!hasVideo}
                className="w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-25 transition-all active:scale-90">
                <SkipForward size={20} />
              </button>
            </div>

            {/* Shuffle toggle */}
            <div className="px-6 pb-6">
              <button onClick={toggleShuffle} disabled={!hasSongs}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isShuffle ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-gray-800/60 text-gray-500 hover:text-gray-300"
                }`}>
                <Shuffle size={14} /> {isShuffle ? "Shuffle On" : "Shuffle"}
              </button>
            </div>
          </div>
        </aside>

        {/* ── RIGHT COLUMN — track list ──────────────────────────────────────── */}
        <main className="min-w-0">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[40px_1fr_auto] gap-4 px-4 mb-2 text-xs font-bold uppercase tracking-widest text-gray-600">
            <span className="text-center">#</span>
            <span>Title</span>
            <span className="pr-2"><ListMusic size={13} className="inline" /></span>
          </div>
          <div className="h-px bg-gray-800/60 mb-2 hidden sm:block" />

          {/* Track rows */}
          <div className="divide-y divide-gray-800/30">
            {playlist.songs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Music size={32} className="text-gray-700" />
                <p className="text-gray-600">No songs in this playlist yet.</p>
              </div>
            ) : (
              playlist.songs.map((song, idx) => {
                const orderIdx = order.indexOf(idx);
                const isNow    = order[currentIdx] === idx;
                return (
                  <div
                    key={song.id}
                    onClick={() => playIdx(orderIdx)}
                    className={`group grid grid-cols-[40px_1fr_auto] items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-all select-none ${
                      isNow
                        ? "bg-indigo-500/10 text-indigo-300"
                        : "hover:bg-white/5 text-gray-300"
                    }`}
                  >
                    {/* Number / playing icon */}
                    <div className="flex items-center justify-center w-8 h-8 shrink-0">
                      {isNow && isPlaying
                        ? <SoundBar />
                        : isNow
                          ? <Music size={16} className="text-indigo-400" />
                          : <>
                              <span className="text-sm text-gray-600 group-hover:hidden tabular-nums select-none">{idx + 1}</span>
                              <Play size={15} className="hidden group-hover:block text-white fill-white" />
                            </>}
                    </div>
                    {/* Song info */}
                    <div className="min-w-0">
                      <p className={`font-semibold text-base truncate ${isNow ? "text-indigo-300" : "text-white group-hover:text-white"}`}>
                        {song.title}
                      </p>
                      {song.artist && (
                        <p className="text-sm text-gray-600 truncate mt-0.5 group-hover:text-gray-400 transition-colors">{song.artist}</p>
                      )}
                    </div>
                    {/* Lyrics button */}
                    <div className="flex items-center gap-2 shrink-0">
                      {(song.lyrics || song.chords) && (
                        <button
                          onClick={e => { e.stopPropagation(); playIdx(orderIdx); setLyricsOpen(true); }}
                          className="p-2 rounded-lg text-gray-700 group-hover:text-gray-500 hover:!text-purple-400 hover:bg-purple-500/10 transition-all opacity-0 group-hover:opacity-100"
                          title="View lyrics / chords"
                        >
                          <BookOpen size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-700 mt-12 pb-4">
            Powered by <span className="text-indigo-500 font-semibold">WorshipFlow</span>
          </p>
        </main>
      </div>

      {/* ── Mobile bottom player bar (hidden on lg+) ─────────────────────────── */}
      {hasSongs && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0d0f14]/96 backdrop-blur-xl border-t border-gray-800/50">
          {/* Progress strip */}
          <div className="relative h-1 bg-gray-800">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
              style={{ width: `${progress * 100}%` }} />
            <input type="range" min={0} max={1} step={0.001} value={progress}
              onChange={handleSeek} disabled={!hasVideo || duration === 0}
              className="absolute inset-0 w-full opacity-0 h-5 -top-2 cursor-pointer" />
          </div>
          <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-700 to-purple-900 flex items-center justify-center text-lg shrink-0 select-none">
                {playlist.emoji}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate text-white">{currentSong?.title ?? "—"}</p>
                {currentSong?.artist && <p className="text-xs text-gray-500 truncate">{currentSong.artist}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={handlePrev} disabled={!hasVideo}
                className="p-2 text-gray-500 hover:text-white disabled:opacity-25 transition-colors active:scale-90">
                <SkipBack size={20} />
              </button>
              <button onClick={togglePlay}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  hasVideo ? "bg-white hover:bg-gray-100" : "bg-gray-700"
                }`}>
                {isPlaying
                  ? <Pause size={18} className="text-gray-900 fill-gray-900" />
                  : <Play  size={18} className="text-gray-900 fill-gray-900 ml-0.5" />}
              </button>
              <button onClick={handleNext} disabled={!hasVideo}
                className="p-2 text-gray-500 hover:text-white disabled:opacity-25 transition-colors active:scale-90">
                <SkipForward size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lyrics / Chords panel ────────────────────────────────────────────── */}
      {lyricsOpen && currentSong && (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setLyricsOpen(false)} />
          {/* On desktop: right-side drawer. On mobile: bottom sheet */}
          <div className="fixed z-50
            bottom-0 left-0 right-0 rounded-t-3xl max-h-[80vh]
            lg:bottom-auto lg:top-16 lg:right-6 lg:left-auto lg:w-[420px] lg:rounded-3xl lg:max-h-[calc(100vh-88px)]
            bg-[#13151c] border border-gray-700/60 shadow-2xl flex flex-col overflow-hidden">
            {/* Handle (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 shrink-0 lg:hidden">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/50 shrink-0">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 mb-0.5">Now Playing</p>
                <p className="text-base font-bold text-white truncate">{currentSong.title}</p>
                {currentSong.artist && <p className="text-sm text-gray-500 truncate">{currentSong.artist}</p>}
              </div>
              <button onClick={() => setLyricsOpen(false)}
                className="w-8 h-8 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white flex items-center justify-center transition-all shrink-0">
                <X size={18} />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex gap-2 px-6 pt-3 pb-2 shrink-0">
              {(["lyrics", "chords"] as const).map(tab => (
                <button key={tab} onClick={() => setLyricsTab(tab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    lyricsTab === tab
                      ? tab === "lyrics" ? "bg-indigo-600 text-white" : "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}>
                  {tab === "lyrics" ? <BookOpen size={13} /> : <Guitar size={13} />}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {lyricsTab === "lyrics"
                ? currentSong.lyrics ? <div>{renderLyrics(currentSong.lyrics)}</div> : <p className="text-gray-600 italic text-sm mt-2">No lyrics saved.</p>
                : currentSong.chords ? <pre className="text-[15px] text-gray-300 font-mono whitespace-pre-wrap leading-8">{currentSong.chords}</pre> : <p className="text-gray-600 italic text-sm mt-2">No chords saved.</p>}
            </div>
            <div className="h-6 shrink-0" />
          </div>
        </>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes soundbar {
          0%, 100% { transform: scaleY(0.35); }
          50%       { transform: scaleY(1.1); }
        }
        .animate-soundbar { animation: soundbar 0.65s ease-in-out infinite; transform-origin: bottom; }
      `}</style>
    </div>
  );
}
