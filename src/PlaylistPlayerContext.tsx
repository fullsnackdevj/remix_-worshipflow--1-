/**
 * PlaylistPlayerContext
 * ─────────────────────
 * Lifts the playlist YT player state to App level so music keeps playing
 * while the user browses any other module. PlaylistView reads + writes here
 * instead of managing its own player state.
 */
import React, {
  createContext, useContext, useState, useRef, useCallback,
  useEffect, useMemo,
} from "react";
import { loadPlaylists, savePlaylists } from "./playlistUtils";
import type { Song } from "./types";
import type { Playlist } from "./playlistUtils";

// ── YT player types (inline — avoids extra dep) ─────────────────────────────
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export type RepeatMode = "off" | "all" | "one";

interface PlaylistPlayerCtx {
  // ── Data ──────────────────────────────────────────────────────────────────
  playlists:        Playlist[];
  setPlaylists:     React.Dispatch<React.SetStateAction<Playlist[]>>;
  allSongs:         Song[];
  // ── Playback state ────────────────────────────────────────────────────────
  activeId:         string | null;
  setActiveId:      (id: string | null) => void;
  currentSong:      Song | null;
  isPlaying:        boolean;
  setIsPlaying:     React.Dispatch<React.SetStateAction<boolean>>;
  isShuffle:        boolean;
  setIsShuffle:     React.Dispatch<React.SetStateAction<boolean>>;
  repeatMode:       RepeatMode;
  setRepeatMode:    React.Dispatch<React.SetStateAction<RepeatMode>>;
  isMuted:          boolean;
  setIsMuted:       React.Dispatch<React.SetStateAction<boolean>>;
  progress:         number;
  elapsed:          number;
  duration:         number;
  // ── UI state ──────────────────────────────────────────────────────────────
  playerCollapsed:  boolean;
  setPlayerCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileLyricsOpen: boolean;
  setMobileLyricsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // ── Player ref (YT.Player instance) ──────────────────────────────────────
  playerRef:        React.MutableRefObject<any>;
  playerContainerId: string;
  // ── Controls ──────────────────────────────────────────────────────────────
  playSong:         (songId: string) => void;
  togglePlay:       () => void;
  handleNext:       () => void;
  handlePrev:       () => void;
  handleSeek:       (e: React.ChangeEvent<HTMLInputElement>) => void;
  cycleRepeat:      () => void;
  doShuffle:        () => void;
  // ── Derived ───────────────────────────────────────────────────────────────
  activePlaylist:   Playlist | null;
  playlistSongs:    Song[];
  hasSongs:         boolean;
  currentIdx:       number;
}

const Ctx = createContext<PlaylistPlayerCtx | null>(null);

export function usePlaylistPlayer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlaylistPlayer must be used inside PlaylistPlayerProvider");
  return c;
}

const PLAYER_CONTAINER_ID = "wf-global-yt-player";

function getYTId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
  } catch { /* noop */ }
  return "";
}

export function PlaylistPlayerProvider({
  children,
  allSongs,
}: {
  children: React.ReactNode;
  allSongs: Song[];
}) {
  // ── Playlist data ──────────────────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadPlaylists());

  // Persist whenever playlists change
  useEffect(() => { savePlaylists(playlists); }, [playlists]);

  // ── Playback state ─────────────────────────────────────────────────────────
  const [activeId, setActiveIdState]  = useState<string | null>(null);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [isShuffle, setIsShuffle]     = useState(false);
  const [repeatMode, setRepeatMode]   = useState<RepeatMode>("off");
  const [isMuted, setIsMuted]         = useState(false);
  const [progress, setProgress]       = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [duration, setDuration]       = useState(0);
  const [playerCollapsed, setPlayerCollapsed] = useState(false);
  const [mobileLyricsOpen, setMobileLyricsOpen] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const playerRef         = useRef<any>(null);
  const ytReadyRef        = useRef(false);
  const progressTimer     = useRef<number | null>(null);
  const playlistSongsRef  = useRef<Song[]>([]);
  const currentIdxRef     = useRef(-1);
  const isPlayingRef      = useRef(false);
  isPlayingRef.current    = isPlaying;

  // ── Derived ───────────────────────────────────────────────────────────────
  const activePlaylist = useMemo(
    () => playlists.find(p => p.id === activeId) ?? null,
    [playlists, activeId],
  );

  const playlistSongs = useMemo<Song[]>(() => {
    if (!activePlaylist) return [];
    return activePlaylist.songIds
      .map(id => allSongs.find(s => s.id === id))
      .filter(Boolean) as Song[];
  }, [activePlaylist, allSongs]);

  playlistSongsRef.current = playlistSongs;

  const currentSong = useMemo(
    () => allSongs.find(s => s.id === currentSongId) ?? null,
    [allSongs, currentSongId],
  );

  const currentIdx = useMemo(
    () => playlistSongs.findIndex(s => s.id === currentSongId),
    [playlistSongs, currentSongId],
  );
  currentIdxRef.current = currentIdx;

  const hasSongs = playlistSongs.length > 0;

  // ── Progress ticker ────────────────────────────────────────────────────────
  const startTicker = useCallback(() => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const cur = p.getCurrentTime?.() ?? 0;
      const dur = p.getDuration?.()   ?? 0;
      if (dur > 0) {
        setProgress(cur / dur);
        setElapsed(cur);
        setDuration(dur);
      }
    }, 500);
  }, []);

  const stopTicker = useCallback(() => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
  }, []);

  // ── YT API bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player) { ytReadyRef.current = true; return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => { ytReadyRef.current = true; };
  }, []);

  // ── Create YT.Player once the container is in the DOM ────────────────────
  useEffect(() => {
    const tryInit = () => {
      if (!window.YT?.Player) { setTimeout(tryInit, 200); return; }
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player(PLAYER_CONTAINER_ID, {
        height: "100%", width: "100%",
        playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: any) => {
            const S = window.YT?.PlayerState;
            if (e.data === S?.PLAYING) {
              setIsPlaying(true);
              startTicker();
            } else if (e.data === S?.PAUSED || e.data === S?.BUFFERING) {
              setIsPlaying(e.data === S?.BUFFERING);
              if (e.data === S?.PAUSED) stopTicker();
            } else if (e.data === S?.ENDED) {
              setIsPlaying(false);
              stopTicker();
              // Auto-advance
              const songs = playlistSongsRef.current;
              const idx   = currentIdxRef.current;
              if (repeatMode === "one") {
                playerRef.current?.seekTo(0);
                playerRef.current?.playVideo();
              } else if (idx < songs.length - 1) {
                setCurrentSongId(songs[idx + 1].id);
              } else if (repeatMode === "all" && songs.length > 0) {
                setCurrentSongId(songs[0].id);
              }
            }
          },
        },
      });
    };
    tryInit();
    return () => { stopTicker(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mute sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current) return;
    isMuted ? playerRef.current.mute?.() : playerRef.current.unMute?.();
  }, [isMuted]);

  // ── Load + play when currentSongId changes ────────────────────────────────
  useEffect(() => {
    if (!currentSongId) return;
    const song = allSongs.find(s => s.id === currentSongId);
    const ytId = song?.video_url ? getYTId(song.video_url) : "";
    if (!ytId) return;
    const tryLoad = () => {
      if (!playerRef.current?.loadVideoById) { setTimeout(tryLoad, 150); return; }
      playerRef.current.loadVideoById({ videoId: ytId });
    };
    tryLoad();
  }, [currentSongId, allSongs]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const playSong = useCallback((songId: string) => {
    setCurrentSongId(songId);
    setPlayerCollapsed(false); // expand bar when a song starts
  }, []);

  const togglePlay = useCallback(() => {
    if (!currentSong) return;
    if (isPlayingRef.current) {
      playerRef.current?.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current?.playVideo();
      setIsPlaying(true);
    }
  }, [currentSong]);

  const handleNext = useCallback(() => {
    const songs = playlistSongsRef.current;
    const idx   = currentIdxRef.current;
    if (isShuffle) {
      let r = Math.floor(Math.random() * songs.length);
      if (songs.length > 1 && r === idx) r = (r + 1) % songs.length;
      setCurrentSongId(songs[r]?.id ?? null);
    } else if (idx < songs.length - 1) {
      setCurrentSongId(songs[idx + 1].id);
    } else if (repeatMode === "all" && songs.length > 0) {
      setCurrentSongId(songs[0].id);
    }
  }, [isShuffle, repeatMode]);

  const handlePrev = useCallback(() => {
    const songs = playlistSongsRef.current;
    const idx   = currentIdxRef.current;
    // If past 3s, restart current song; else go to previous
    const cur = playerRef.current?.getCurrentTime?.() ?? 0;
    if (cur > 3) { playerRef.current?.seekTo(0); return; }
    if (idx > 0) setCurrentSongId(songs[idx - 1].id);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const frac = parseFloat(e.target.value);
    const dur  = playerRef.current?.getDuration?.() ?? 0;
    if (dur > 0) { playerRef.current?.seekTo(frac * dur, true); setProgress(frac); }
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode(prev => prev === "off" ? "all" : prev === "all" ? "one" : "off");
  }, []);

  const doShuffle = useCallback(() => {
    setIsShuffle(v => !v);
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
  }, []);

  const value: PlaylistPlayerCtx = {
    playlists, setPlaylists, allSongs,
    activeId, setActiveId,
    currentSong, isPlaying, setIsPlaying,
    isShuffle, setIsShuffle,
    repeatMode, setRepeatMode,
    isMuted, setIsMuted,
    progress, elapsed, duration,
    playerCollapsed, setPlayerCollapsed,
    mobileLyricsOpen, setMobileLyricsOpen,
    playerRef, playerContainerId: PLAYER_CONTAINER_ID,
    playSong, togglePlay, handleNext, handlePrev, handleSeek, cycleRepeat, doShuffle,
    activePlaylist, playlistSongs, hasSongs, currentIdx,
  };

  return (
    <Ctx.Provider value={value}>
      {/* Hidden YT player — always in DOM; PlaylistView moves this into its video panel */}
      <div
        id={PLAYER_CONTAINER_ID}
        style={{ position: "fixed", bottom: 0, right: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none", zIndex: -1 }}
        aria-hidden="true"
      />
      {children}
    </Ctx.Provider>
  );
}
