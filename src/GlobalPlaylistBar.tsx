/**
 * GlobalPlaylistBar
 * ─────────────────
 * Persistent bottom player bar — always rendered at App level so the user
 * can browse any module while music keeps playing.
 *
 * States:
 *  • No song active  → invisible (renders nothing)
 *  • Collapsed       → 5px full-width indigo→purple gradient strip with
 *                      a centered ChevronUp icon. Tap to expand.
 *  • Expanded        → full player bar with song info + controls.
 *                      A small ChevronDown pill at the top collapses it.
 */
import React, { useEffect } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Music, BookOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import { usePlaylistPlayer } from "./PlaylistPlayerContext";

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  /** Called when the user taps the bar while on a different module — navigates back to playlist */
  onNavigateToPlaylist?: () => void;
  /** True when the user is currently viewing the playlist module */
  isPlaylistView?: boolean;
}

export default function GlobalPlaylistBar({ onNavigateToPlaylist, isPlaylistView }: Props) {
  const {
    currentSong, isPlaying, isShuffle, repeatMode, isMuted,
    progress, elapsed, duration,
    playerCollapsed, setPlayerCollapsed,
    mobileLyricsOpen, setMobileLyricsOpen,
    playerRef,
    togglePlay, handleNext, handlePrev, handleSeek, cycleRepeat, doShuffle,
    setIsMuted, setIsShuffle,
    activePlaylist,
  } = usePlaylistPlayer();

  // Auto-collapse when user navigates away from Playlist module
  useEffect(() => {
    const handler = () => setPlayerCollapsed(true);
    window.addEventListener("wf-playlist-leave", handler);
    return () => window.removeEventListener("wf-playlist-leave", handler);
  }, [setPlayerCollapsed]);

  // Nothing playing → render nothing
  if (!currentSong) return null;

  // ── Collapsed strip ──────────────────────────────────────────────────────
  if (playerCollapsed) {
    return (
      <button
        onClick={() => {
          setPlayerCollapsed(false);
          if (!isPlaylistView) onNavigateToPlaylist?.();
        }}
        aria-label="Expand player"
        className="fixed bottom-0 left-0 right-0 z-[60] w-full flex flex-col items-center justify-center cursor-pointer group"
        style={{ height: 12 }}
      >
        {/* 5px gradient strip — full width, no radius */}
        <div
          className="w-full flex items-center justify-center"
          style={{
            height: 5,
            background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
          }}
        >
          <ChevronUp size={8} className="text-white/70" style={{ marginTop: -2 }} />
        </div>
      </button>
    );
  }

  // ── Expanded bar ─────────────────────────────────────────────────────────
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] bg-[#0a0c10] text-white"
      style={{ borderTop: "1px solid rgba(31,41,55,0.6)" }}
    >
      {/* Collapse handle — ChevronDown pill tap to hide */}
      <button
        onClick={() => setPlayerCollapsed(true)}
        aria-label="Collapse player"
        className="w-full flex flex-col items-center justify-center pt-1 pb-0.5 gap-0.5 cursor-pointer hover:opacity-70 transition-opacity"
      >
        <ChevronDown size={10} className="text-gray-600" />
        <div
          style={{
            height: 3,
            width: 48,
            borderRadius: 999,
            background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
          }}
        />
      </button>

      {/* Mobile: scrubable progress strip */}
      <div className="relative h-1.5 bg-gray-800 lg:hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
          style={{ width: `${progress * 100}%` }}
        />
        <input
          type="range" min={0} max={1} step={0.001} value={progress}
          onChange={handleSeek}
          disabled={duration === 0}
          className="absolute inset-0 w-full opacity-0 h-6 -top-2 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex items-center px-4 sm:px-6 py-3 gap-3 sm:gap-4">

        {/* Song info — tap to navigate to playlist if in another module */}
        <button
          onClick={() => { if (!isPlaylistView) onNavigateToPlaylist?.(); }}
          className="flex items-center gap-3 min-w-0 flex-1 lg:w-52 lg:flex-none text-left"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 bg-gradient-to-br from-indigo-700/70 to-purple-900/70 border border-indigo-600/20">
            {activePlaylist?.emoji ?? "🎵"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight text-white">
              {currentSong.title}
            </p>
            {currentSong.artist && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{currentSong.artist}</p>
            )}
          </div>
        </button>

        {/* Mobile controls: ⏮ ⏯ ⏭ + lyrics */}
        <div className="flex items-center gap-2 lg:hidden shrink-0">
          <button onClick={handlePrev}
            className="text-gray-400 hover:text-white transition-colors p-2.5 rounded-xl active:scale-90">
            <SkipBack size={22} />
          </button>
          <button onClick={togglePlay}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg bg-white hover:bg-gray-100">
            {isPlaying
              ? <Pause size={20} className="text-gray-900 fill-gray-900" />
              : <Play  size={20} className="text-gray-900 fill-gray-900 ml-0.5" />}
          </button>
          <button onClick={handleNext}
            className="text-gray-400 hover:text-white transition-colors p-2.5 rounded-xl active:scale-90">
            <SkipForward size={22} />
          </button>
          <button
            onClick={() => setMobileLyricsOpen(true)}
            title="Lyrics & Chords"
            className="p-2.5 rounded-xl transition-all active:scale-90 text-purple-400 hover:text-purple-300 hover:bg-purple-400/10">
            <BookOpen size={20} />
          </button>
        </div>

        {/* Desktop: full center controls + progress */}
        <div className="hidden lg:flex flex-col flex-1 items-center gap-1 min-w-0 px-4">
          <div className="flex items-center gap-4">
            <button onClick={doShuffle} title="Shuffle"
              className={`transition-colors ${isShuffle ? "text-emerald-400" : "text-gray-500 hover:text-gray-200"}`}>
              <Shuffle size={15} />
            </button>
            <button onClick={handlePrev}
              className="text-gray-400 hover:text-white disabled:opacity-25 transition-colors">
              <SkipBack size={19} />
            </button>
            <button onClick={togglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 bg-white hover:bg-gray-100">
              {isPlaying
                ? <Pause size={16} className="text-gray-900 fill-gray-900" />
                : <Play  size={16} className="text-gray-900 fill-gray-900 ml-0.5" />}
            </button>
            <button onClick={handleNext}
              className="text-gray-400 hover:text-white disabled:opacity-25 transition-colors">
              <SkipForward size={19} />
            </button>
            <button onClick={cycleRepeat} title={`Repeat: ${repeatMode}`}
              className={`transition-colors ${repeatMode !== "off" ? "text-emerald-400" : "text-gray-500 hover:text-gray-200"}`}>
              {repeatMode === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-md">
            <span className="text-[10px] text-gray-600 tabular-nums shrink-0 w-7 text-right">{fmtTime(elapsed)}</span>
            <div className="flex-1 relative h-4 flex items-center">
              <div className="w-full h-1 rounded-full bg-gray-700 overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: `${progress * 100}%` }} />
              </div>
              <input
                type="range" min={0} max={1} step={0.001} value={progress}
                onChange={handleSeek}
                disabled={duration === 0}
                className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
            <span className="text-[10px] text-gray-600 tabular-nums shrink-0 w-7">{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Desktop: volume */}
        <div className="hidden lg:flex w-52 items-center justify-end shrink-0">
          <button onClick={() => setIsMuted(v => !v)} title={isMuted ? "Unmute" : "Mute"}
            className="text-gray-400 hover:text-white transition-colors">
            {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>

      </div>
    </div>
  );
}
