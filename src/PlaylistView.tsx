import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
  ListMusic, Plus, Trash2, Edit3, Check, X, Music, Play, Pause,
  Search, BookOpen, Guitar, MoreVertical, Copy, Shuffle,
  SkipBack, SkipForward, Repeat, Repeat1, Volume2, VolumeX,
  Mic2, Pencil, ArrowUp, ArrowDown, ChevronLeft, Share2, Globe, Link,
} from "lucide-react";
import { Song } from "./types";
import {
  Playlist, loadPlaylists, savePlaylists,
} from "./playlistUtils";

// Re-export so SongsView.tsx can still import from "./PlaylistView"
export type { Playlist } from "./playlistUtils";
export { loadPlaylists, savePlaylists, addSongToPlaylist } from "./playlistUtils";


function genId(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}


// ── YouTube helpers ───────────────────────────────────────────────────────────
function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const pats = [
    /(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of pats) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

const EMOJIS = ["🎵","🎶","🙏","✝️","🎸","🎹","🎺","🎻","🥁","🎤","🌟","💜","🕊️","🔥","🌊"];

// ── Time formatter ────────────────────────────────────────────────────────────
function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// ── Emoji picker (small popup) ────────────────────────────────────────────────
function EmojiPicker({ selected, onSelect, onClose }: {
  selected: string; onSelect: (e: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref}
      className="absolute z-[500] top-full left-0 mt-1 p-2 bg-[#1a1f2e] border border-gray-700 rounded-2xl shadow-2xl grid grid-cols-5 gap-1">
      {EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }}
          className={`w-11 h-11 flex items-center justify-center rounded-xl text-xl hover:bg-gray-700 transition-colors ${selected === e ? "bg-indigo-600/30 ring-1 ring-indigo-500" : ""}`}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ── SoundBar animation — small 3-bar equalizer shown on the now-playing row ──
function SoundBar() {
  return (
    <span className="flex gap-px items-end" style={{ height: 14, width: 12 }}>
      <span className="w-0.5 rounded-full bg-indigo-400" style={{ height: "60%", animation: "plSoundbar 0.5s ease-in-out infinite alternate" }} />
      <span className="w-0.5 rounded-full bg-indigo-400" style={{ height: "100%", animation: "plSoundbar 0.5s ease-in-out 0.2s infinite alternate" }} />
      <span className="w-0.5 rounded-full bg-indigo-400" style={{ height: "40%", animation: "plSoundbar 0.5s ease-in-out 0.1s infinite alternate" }} />
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  allSongs: Song[];
  showToast: (type: string, msg: string) => void;
  onOpenVideo?: (url: string) => void;
  onNavigateToSongs?: () => void;
}

// =============================================================================
// Main component
// =============================================================================
export default function PlaylistView({ allSongs, showToast, onNavigateToSongs }: Props) {

  // ── Playlist state ─────────────────────────────────────────────────────────
  const [playlists, setPlaylists]         = useState<Playlist[]>(() => loadPlaylists());
  const [activeId, setActiveIdState]      = useState<string | null>(() => {
    // Restore last active playlist from localStorage on first render
    try { return localStorage.getItem("wf_last_playlist") ?? null; } catch { return null; }
  });
  const [creating, setCreating]           = useState(false);
  const [newName, setNewName]             = useState("");
  const [newEmoji, setNewEmoji]           = useState("🎵");
  const [showEmojiPicker, setShowEmoji]   = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editName, setEditName]           = useState("");
  const [menuId, setMenuId]               = useState<string | null>(null);
  const [searchQ, setSearchQ]             = useState("");
  const [lyricTab, setLyricTab]           = useState<"lyrics" | "chords">("lyrics");
  const [dragId, setDragId]               = useState<string | null>(null);
  const [dragOver, setDragOver]           = useState<number | null>(null);
  const [editSongId, setEditSongId]       = useState<string | null>(null);
  const [mobileShowList, setMobileShowList]     = useState(!activeId); // mobile: show list or content
  const [mobileLyricsOpen, setMobileLyricsOpen] = useState(false);    // mobile: lyrics/chords sheet
  const [mobileLyricTab, setMobileLyricTab]     = useState<"lyrics" | "chords">("lyrics");

  // ── Share / Publish state ──────────────────────────────────────────────────
  const [shareModalPlaylistId, setShareModalPlaylistId] = useState<string | null>(null);
  const [shareSlug, setShareSlug]                       = useState("");
  const [shareDescription, setShareDescription]         = useState("");
  const [shareSlugAvailable, setShareSlugAvailable]     = useState<boolean | null>(null);
  const [sharePublishing, setSharePublishing]           = useState(false);
  const [sharePublishedSlug, setSharePublishedSlug]     = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied]           = useState(false);

  // Slug auto-generation helper
  const toSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  const openShareModal = (pl: Playlist) => {
    const slug = toSlug(pl.name);
    setShareModalPlaylistId(pl.id);
    setShareSlug(slug);
    setShareDescription("");
    setShareSlugAvailable(null);
    setSharePublishedSlug(null);
    setShareLinkCopied(false);
    setMenuId(null);
    // Check availability immediately
    checkSlug(slug);
  };

  const checkSlug = async (slug: string) => {
    if (!slug || slug.length < 3) { setShareSlugAvailable(null); return; }
    setShareSlugAvailable(null);
    try {
      const r = await fetch(`/api/public-playlist/check-slug?slug=${encodeURIComponent(slug)}`);
      const d = await r.json();
      setShareSlugAvailable(d.available);
    } catch { setShareSlugAvailable(null); }
  };

  const publishPlaylist = async () => {
    if (!shareModalPlaylistId || !shareSlug) return;
    const pl = playlists.find(p => p.id === shareModalPlaylistId);
    if (!pl) return;
    const songs = pl.songIds
      .map(id => allSongs.find(s => s.id === id))
      .filter(Boolean)
      .map(s => ({
        id: s!.id, title: s!.title, artist: s!.artist ?? "",
        youtubeUrl: s!.video_url ?? "",   // Song type uses video_url
        lyrics: s!.lyrics ?? "", chords: s!.chords ?? "",
      }));
    setSharePublishing(true);
    try {
      const r = await fetch("/api/public-playlist/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: shareSlug,
          playlist: { name: pl.name, emoji: pl.emoji ?? "🎵", description: shareDescription },
          songs,
        }),
      });
      const d = await r.json();
      if (!r.ok) { showToast("error", d.error ?? "Failed to publish"); return; }
      // ── Save slug back onto the playlist so renames stay in sync ──
      setPlaylists(prev => {
        const updated = prev.map(x => x.id === shareModalPlaylistId ? { ...x, publishedSlug: shareSlug } : x);
        return updated;
      });
      setSharePublishedSlug(shareSlug);
      showToast("success", "Playlist published! Link is ready to share.");
    } catch { showToast("error", "Network error. Please try again."); }
    finally { setSharePublishing(false); }
  };

  const unpublishPlaylist = async () => {
    if (!sharePublishedSlug) return;
    setSharePublishing(true);
    try {
      await fetch("/api/public-playlist/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: sharePublishedSlug, playlist: { name: "", emoji: "" }, songs: [], unpublish: true }),
      });
      // ── Clear publishedSlug from the playlist ──
      setPlaylists(prev => prev.map(x => x.id === shareModalPlaylistId ? { ...x, publishedSlug: undefined } : x));
      setSharePublishedSlug(null);
      showToast("info", "Public link removed.");
    } catch { showToast("error", "Failed to remove link."); }
    finally { setSharePublishing(false); }
  };

  // ── Player state ───────────────────────────────────────────────────────────
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [isShuffle, setIsShuffle]         = useState(false);
  const [repeatMode, setRepeatMode]       = useState<"off" | "all" | "one">("off");
  const [isMuted, setIsMuted]             = useState(false);
  const [progress, setProgress]           = useState(0);
  const [duration, setDuration]           = useState(0);
  const [elapsed, setElapsed]             = useState(0);
  // YT.Player refs
  const playerRef      = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const loadedVidRef   = useRef<string | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerDivId    = useRef("pl-yt-" + Math.random().toString(36).slice(2)).current;
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef   = useRef<HTMLInputElement>(null);
  const menuRef        = useRef<HTMLDivElement>(null);

  const playlistSongsRef  = useRef<Song[]>([]);
  const currentIdxRef     = useRef(-1);
  const repeatModeRef     = useRef<"off" | "all" | "one">("off");
  const isShuffleRef      = useRef(false);
  const isPlayingRef      = useRef(false);
  const currentSongIdRef  = useRef<string | null>(null);

  // ── Auto-persist whenever playlists changes ────────────────────────────────
  useEffect(() => { savePlaylists(playlists); }, [playlists]);

  // ── Helper: set active ID and persist it ──────────────────────────────────
  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem("wf_last_playlist", id);
      else localStorage.removeItem("wf_last_playlist");
    } catch { }
  }, []);

  // ── Reload playlists on mount. Validate stored active ID still exists ──────
  useEffect(() => {
    const fresh = loadPlaylists();
    setPlaylists(fresh);
    // If the restored activeId doesn't exist in the freshly loaded list,
    // fall back to the first playlist (if any).
    setActiveIdState(prev => {
      if (prev && fresh.find(p => p.id === prev)) return prev;  // still valid
      if (fresh.length > 0) return fresh[0].id;                 // fallback
      return null;
    });
  }, []);

  // ── Focus helpers ──────────────────────────────────────────────────────────
  useEffect(() => { if (creating) setTimeout(() => createInputRef.current?.focus(), 40); }, [creating]);
  useEffect(() => { if (editingId) setTimeout(() => editInputRef.current?.focus(), 40); }, [editingId]);

  // ── Close context menu on outside click ───────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
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

  const filteredSongs = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return q
      ? playlistSongs.filter(s => s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q))
      : playlistSongs;
  }, [playlistSongs, searchQ]);

  const currentSong = useMemo(
    () => (currentSongId ? playlistSongs.find(s => s.id === currentSongId) ?? null : null),
    [currentSongId, playlistSongs],
  );

  const currentIdx = useMemo(
    () => (currentSongId ? playlistSongs.findIndex(s => s.id === currentSongId) : -1),
    [currentSongId, playlistSongs],
  );

  const videoId = useMemo(
    () => currentSong?.video_url ? extractYoutubeId(currentSong.video_url) : null,
    [currentSong],
  );

  const hasSongs = playlistSongs.length > 0;

  // ── Keep refs in sync with state ───────────────────────────────────────────
  useEffect(() => { playlistSongsRef.current = playlistSongs; }, [playlistSongs]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentSongIdRef.current = currentSongId; }, [currentSongId]);

  // ── Progress polling helpers ───────────────────────────────────────────────────
  const startProgressTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = p.getCurrentTime?.() ?? 0;
        const dur = p.getDuration?.() ?? 0;
        setElapsed(cur);
        setDuration(dur);
        setProgress(dur > 0 ? cur / dur : 0);
      } catch { /**/ }
    }, 500);
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ── Build YT.Player once on mount (same pattern as LineupPlayer) ────────────
  useEffect(() => {
    let poll: ReturnType<typeof setInterval>;
    const create = () => {
      if (playerRef.current) return;
      if (!document.getElementById(playerDivId)) return;
      playerRef.current = new window.YT.Player(playerDivId, {
        height: "100%", width: "100%",
        playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            const vid = (() => {
              const id = currentSongIdRef.current;
              if (!id) return null;
              const song = playlistSongsRef.current.find(s => s.id === id);
              return song?.video_url ? extractYoutubeId(song.video_url) : null;
            })();
            if (vid) { loadedVidRef.current = vid; playerRef.current?.loadVideoById(vid); }
          },
          onStateChange: (ev: any) => {
            const state: number = ev.data;
            if (state === 1) {                         // playing
              setIsPlaying(true);
              startProgressTimer();
            } else if (state === 2) {                  // paused
              setIsPlaying(false);
              stopProgressTimer();
            } else if (state === 0) {                  // ended → auto-advance
              setIsPlaying(false);
              stopProgressTimer();
              const songs  = playlistSongsRef.current;
              const idx    = currentIdxRef.current;
              const repeat = repeatModeRef.current;
              const shuf   = isShuffleRef.current;
              if (!songs.length) return;
              if (repeat === "one") { playerRef.current?.seekTo(0,true); playerRef.current?.playVideo(); return; }
              let nextIdx = -1;
              if (shuf && songs.length > 1) { do { nextIdx = Math.floor(Math.random() * songs.length); } while (nextIdx === idx); }
              else if (idx >= 0 && idx < songs.length - 1) nextIdx = idx + 1;
              else if (repeat === "all") nextIdx = 0;
              if (nextIdx >= 0) {
                setCurrentSongId(songs[nextIdx].id);
                setIsPlaying(true);
                setProgress(0); setElapsed(0); setDuration(0);
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
    return () => { clearInterval(poll); stopProgressTimer(); playerRef.current?.destroy(); playerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load new video when currentSongId changes ─────────────────────────────
  useEffect(() => {
    if (!playerReadyRef.current || !currentSongId) return;
    const song = playlistSongs.find(s => s.id === currentSongId);
    const vid  = song?.video_url ? extractYoutubeId(song.video_url) : null;
    if (!vid || vid === loadedVidRef.current) return;
    loadedVidRef.current = vid;
    setProgress(0); setElapsed(0); setDuration(0);
    playerRef.current?.loadVideoById(vid);
    setTimeout(() => { try { playerRef.current?.playVideo(); } catch { /**/ } }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongId]);

  // ── Apply mute ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current) return;
    try { isMuted ? playerRef.current.mute() : playerRef.current.unMute(); } catch { /**/ }
  }, [isMuted]);

  // ── Player actions ────────────────────────────────────────────────────────────
  const playSong = useCallback((songId: string) => {
    const song = playlistSongsRef.current.find(s => s.id === songId);
    const vid  = song?.video_url ? extractYoutubeId(song.video_url) : null;
    setCurrentSongId(songId);
    setIsPlaying(true);
    setProgress(0); setElapsed(0); setDuration(0);
    if (!vid) return;
    loadedVidRef.current = vid;
    if (playerReadyRef.current) {
      playerRef.current?.loadVideoById(vid);
      setTimeout(() => { try { playerRef.current?.playVideo(); } catch { /**/ } }, 100);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!currentSong) { if (hasSongs) playSong(playlistSongs[0].id); return; }
    if (isPlaying) { playerRef.current?.pauseVideo(); setIsPlaying(false); }
    else           { playerRef.current?.playVideo();  setIsPlaying(true);  }
  }, [currentSong, hasSongs, isPlaying, playlistSongs, playSong]);

  const handlePrev = useCallback(() => {
    const songs = playlistSongsRef.current;
    const idx   = currentIdxRef.current;
    if (elapsed > 3) { playerRef.current?.seekTo(0, true); return; }
    if (idx > 0) playSong(songs[idx - 1].id);
    else if (repeatModeRef.current === "all" && songs.length > 0) playSong(songs[songs.length - 1].id);
  }, [elapsed, playSong]);

  const handleNext = useCallback(() => {
    const songs  = playlistSongsRef.current;
    const idx    = currentIdxRef.current;
    const shuf   = isShuffleRef.current;
    const repeat = repeatModeRef.current;
    if (!songs.length) return;
    if (shuf && songs.length > 1) { let ni: number; do { ni = Math.floor(Math.random() * songs.length); } while (ni === idx); playSong(songs[ni].id); }
    else if (idx >= 0 && idx < songs.length - 1) playSong(songs[idx + 1].id);
    else if (repeat === "all") playSong(songs[0].id);
  }, [playSong]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const r = parseFloat(e.target.value);
    const t = r * duration;
    setProgress(r); setElapsed(t);
    playerRef.current?.seekTo(t, true);
  };

  const cycleRepeat = () => setRepeatMode(m => m === "off" ? "all" : m === "all" ? "one" : "off");

  const doShuffle = () => {
    setIsShuffle(v => !v);
    if (hasSongs && !currentSong) playSong(playlistSongs[0].id);
  };


  // ── Playlist CRUD ──────────────────────────────────────────────────────────
  const createPlaylist = () => {
    const name = newName.trim();
    if (!name) { showToast("error", "Enter a name first."); return; }
    const pl: Playlist = {
      id: genId(), name, emoji: newEmoji, songIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setPlaylists(p => [...p, pl]);
    setNewName(""); setNewEmoji("🎵"); setCreating(false);
    setActiveId(pl.id);
    showToast("success", `"${name}" created!`);
  };

  const deletePlaylist = (id: string) => {
    const pl = playlists.find(p => p.id === id);
    setPlaylists(p => p.filter(x => x.id !== id));
    if (activeId === id) { setActiveId(null); setCurrentSongId(null); }
    showToast("success", `"${pl?.name}" deleted.`);
  };

  const saveEdit = (id: string) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setPlaylists(p => {
      const updated = p.map(x => x.id === id ? { ...x, name, updatedAt: new Date().toISOString() } : x);
      // ── Auto-sync name to Firestore if this playlist is publicly shared ──
      const pl = updated.find(x => x.id === id);
      if (pl?.publishedSlug) {
        fetch("/api/public-playlist/sync-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: pl.publishedSlug, name, emoji: pl.emoji ?? "🎵" }),
        }).catch(() => { /* silent — non-critical */ });
      }
      return updated;
    });
    setEditingId(null);
  };

  const removeSong = (playlistId: string, songId: string) => {
    setPlaylists(p => p.map(x =>
      x.id === playlistId
        ? { ...x, songIds: x.songIds.filter(id => id !== songId), updatedAt: new Date().toISOString() }
        : x,
    ));
    if (currentSongId === songId) setCurrentSongId(null);
    showToast("success", "Song removed.");
  };

  const duplicatePlaylist = (pl: Playlist) => {
    const copy: Playlist = {
      ...pl, id: genId(), name: `${pl.name} (Copy)`,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setPlaylists(p => [...p, copy]);
    setMenuId(null);
    showToast("success", `Duplicated "${pl.name}"`);
  };

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  const handleDrop = (targetIdx: number) => {
    if (!dragId || !activePlaylist) return;
    const ids = [...activePlaylist.songIds];
    const from = ids.indexOf(dragId);
    if (from === -1) return;
    ids.splice(from, 1);
    ids.splice(targetIdx, 0, dragId);
    setPlaylists(p => p.map(x =>
      x.id === activePlaylist.id
        ? { ...x, songIds: ids, updatedAt: new Date().toISOString() }
        : x,
    ));
    setDragId(null); setDragOver(null);
  };

  // ── Lyrics renderer ────────────────────────────────────────────────────────
  const SECTION_RE = /^(?:VERSE|CHORUS|PRE[- ]?CHORUS|BRIDGE|OUTRO|INTRO|TAG|HOOK|INTERLUDE|REFRAIN|CODA)(\s+\d+)?\s*:?\s*$/i;
  const renderLyrics = (text: string) =>
    text.split("\n").map((raw, i) => {
      const t = raw.trim();
      if (!t) return <div key={i} className="h-4" />;
      if (SECTION_RE.test(t)) return (
        <p key={i} className="text-xs font-bold uppercase tracking-widest text-indigo-400 mt-4 mb-1">
          {t.replace(/:$/, "")}
        </p>
      );
      return <p key={i} className="text-sm text-gray-300 leading-7">{raw}</p>;
    });



  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="flex flex-col h-full w-full bg-[#0d0f14] text-white overflow-hidden">

      {/* ════════════════════════════════════════════════════════════════════
           3-COLUMN MAIN AREA
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Playlist sidebar ──────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-60 xl:w-64 shrink-0 border-r border-gray-800/60 bg-[#111318] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800/50 shrink-0">
            <div className="flex items-center gap-2">
              <ListMusic size={16} className="text-indigo-400 shrink-0" />
              <span className="text-sm font-bold text-white tracking-tight">My Playlists</span>
            </div>
            <button
              onClick={() => setCreating(v => !v)}
              title="New playlist"
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shrink-0">
              <Plus size={15} />
            </button>
          </div>

          {/* Create form */}
          {creating && (
            <div className="px-3 py-2.5 border-b border-gray-800/40 bg-[#0f1117] shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowEmoji(v => !v)}
                    className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 hover:border-indigo-500 flex items-center justify-center text-xl transition-colors">
                    {newEmoji}
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker selected={newEmoji} onSelect={setNewEmoji} onClose={() => setShowEmoji(false)} />
                  )}
                </div>
                <input
                  ref={createInputRef} type="text" value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") createPlaylist();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Playlist name…" maxLength={60}
                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                />
                <button onClick={createPlaylist} className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 transition-colors"><Check size={14} /></button>
                <button onClick={() => { setCreating(false); setNewName(""); }} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 shrink-0 transition-colors"><X size={14} /></button>
              </div>
            </div>
          )}

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {playlists.length === 0 && !creating ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-16">
                <div className="w-14 h-14 rounded-2xl bg-gray-800/60 flex items-center justify-center">
                  <ListMusic size={24} className="text-gray-600" />
                </div>
                <p className="text-sm text-gray-600 leading-snug">No playlists yet.<br />Tap <strong className="text-gray-400">+</strong> to create one.</p>
              </div>
            ) : playlists.map(pl => {
              const isActive = activeId === pl.id;
              const isEdit   = editingId === pl.id;
              return (
                <div
                  key={pl.id}
                  onClick={() => { if (!isEdit) { setActiveId(pl.id); setMobileShowList(false); } }}
                  className={`group relative flex items-center gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
                    isActive
                      ? "bg-indigo-600/20 ring-1 ring-indigo-600/30 text-white"
                      : "text-gray-400 hover:bg-gray-800/60 hover:text-white"
                  }`}
                >
                  {/* No left bar - the indigo background is enough indicator */}
                  <span className="text-lg shrink-0">{pl.emoji ?? "🎵"}</span>
                  {isEdit ? (
                    <input
                      ref={editInputRef} type="text" value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(pl.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => saveEdit(pl.id)}
                      onClick={e => e.stopPropagation()} maxLength={60}
                      className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-gray-800 border border-indigo-500 rounded-lg text-white outline-none"
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold truncate leading-tight">{pl.name}</p>
                        {pl.publishedSlug && (
                          <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-500/30 rounded px-1 py-px">Live</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{pl.songIds.length} {pl.songIds.length === 1 ? "song" : "songs"}</p>
                    </div>
                  )}

                  {/* Context menu */}
                  {!isEdit && (
                    <div className="relative shrink-0" ref={menuId === pl.id ? menuRef : undefined}>
                      <button
                        onClick={e => { e.stopPropagation(); setMenuId(v => v === pl.id ? null : pl.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-gray-700 text-gray-500 hover:text-white transition-all"
                      >
                        <MoreVertical size={15} />
                      </button>
                      {menuId === pl.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-[#1a1f2e] border border-gray-700/80 rounded-xl shadow-2xl z-[400] overflow-hidden">
                          {onNavigateToSongs && (
                            <button onClick={() => { setMenuId(null); onNavigateToSongs(); }}
                              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-indigo-300 hover:bg-indigo-900/30 hover:text-indigo-200 transition-colors text-left">
                              <Plus size={12} /> Add Songs
                            </button>
                          )}
                          {onNavigateToSongs && <div className="h-px bg-gray-800 mx-2" />}
                          <button onClick={() => openShareModal(pl)}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300 transition-colors text-left">
                            <Share2 size={12} /> Share Link
                          </button>
                          <div className="h-px bg-gray-800 mx-2" />
                          <button onClick={() => { setEditingId(pl.id); setEditName(pl.name); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-left">
                            <Edit3 size={12} /> Rename
                          </button>
                          <button onClick={() => duplicatePlaylist(pl)}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-left">
                            <Copy size={12} /> Duplicate
                          </button>
                          <div className="h-px bg-gray-800 mx-2" />
                          <button onClick={() => { setMenuId(null); deletePlaylist(pl.id); }}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors text-left">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── MOBILE-ONLY: Playlist List Panel ───────────────────────────────── */}
        {mobileShowList && (
          <div className="lg:hidden flex flex-col flex-1 min-w-0 overflow-hidden bg-[#0d0f14]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <ListMusic size={20} className="text-indigo-400 shrink-0" />
                <span className="text-base font-bold text-white tracking-tight">My Playlists</span>
              </div>
              <button
                onClick={() => setCreating(v => !v)}
                title="New playlist"
                className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shrink-0 active:scale-95">
                <Plus size={18} />
              </button>
            </div>

            {/* Create form */}
            {creating && (
              <div className="px-4 py-3 border-b border-gray-800/50 bg-[#111318] shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowEmoji(v => !v)}
                    className="text-2xl w-12 h-12 rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center shrink-0 transition-colors">
                    {newEmoji}
                  </button>
                  <input
                    ref={createInputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createPlaylist(); if (e.key === "Escape") setCreating(false); }}
                    placeholder="Playlist name…"
                    className="flex-1 bg-gray-800/80 border border-gray-700/60 rounded-xl px-4 py-3 text-base text-white placeholder-gray-600 outline-none focus:border-indigo-500/60"
                  />
                  <button onClick={createPlaylist} className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors active:scale-95"><Check size={16} /></button>
                  <button onClick={() => setCreating(false)} className="p-3 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-colors active:scale-95"><X size={16} /></button>
                </div>
              </div>
            )}

            {/* Playlist items */}
            <div className="flex-1 overflow-y-auto py-2 px-2">
              {playlists.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 py-12">
                  <ListMusic size={40} className="text-gray-700" />
                  <p className="text-sm text-gray-500">No playlists yet. Tap + to create one.</p>
                </div>
              ) : (
                playlists.map(pl => {
                  const isActive = pl.id === activeId;
                  const isEdit   = editingId === pl.id;
                  return (
                    <div
                      key={pl.id}
                      onClick={() => { if (!isEdit) { setActiveId(pl.id); setMobileShowList(false); } }}
                      className={`group flex items-center gap-4 px-4 py-4 rounded-2xl cursor-pointer transition-all mb-1 ${
                        isActive ? "bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/25" : "hover:bg-gray-800/60"
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                        isActive ? "bg-indigo-600/40 border border-indigo-500/40" : "bg-gray-800"
                      }`}>{pl.emoji}</div>
                      {isEdit ? (
                        <input
                          ref={editInputRef}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(pl.id); if (e.key === "Escape") setEditingId(null); }}
                          onBlur={() => saveEdit(pl.id)}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 bg-gray-800 rounded-xl px-3 py-2.5 text-base text-white border border-indigo-500/50 outline-none"
                        />
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-base font-semibold truncate leading-tight text-white">{pl.name}</p>
                            {pl.publishedSlug && (
                              <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-500/30 rounded px-1 py-px">Live</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{pl.songIds.length} {pl.songIds.length === 1 ? "song" : "songs"}</p>
                        </div>
                      )}
                      {!isEdit && (
                        <div className="relative shrink-0" ref={menuId === pl.id ? menuRef : undefined}>
                          <button
                            onClick={e => { e.stopPropagation(); setMenuId(v => v === pl.id ? null : pl.id); }}
                            className="p-3 rounded-xl hover:bg-gray-700 text-gray-400 hover:text-white transition-all active:scale-90"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {menuId === pl.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1f2e] border border-gray-700/80 rounded-2xl shadow-2xl z-[400] overflow-hidden">
                              {onNavigateToSongs && (
                                <button onClick={e => { e.stopPropagation(); setMenuId(null); onNavigateToSongs(); }}
                                  className="flex items-center gap-3 w-full px-4 py-4 text-base text-indigo-300 hover:bg-indigo-900/30 hover:text-indigo-200 transition-colors text-left">
                                  <Plus size={16} /> Add Songs
                                </button>
                              )}
                              {onNavigateToSongs && <div className="h-px bg-gray-800 mx-3" />}
                              <button onClick={e => { e.stopPropagation(); openShareModal(pl); }}
                                className="flex items-center gap-3 w-full px-4 py-4 text-base text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300 transition-colors text-left">
                                <Share2 size={16} /> Share Link
                              </button>
                              <div className="h-px bg-gray-800 mx-3" />
                              <button onClick={e => { e.stopPropagation(); setEditingId(pl.id); setEditName(pl.name); setMenuId(null); }}
                                className="flex items-center gap-3 w-full px-4 py-4 text-base text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-left">
                                <Edit3 size={16} /> Rename
                              </button>
                              <button onClick={e => { e.stopPropagation(); duplicatePlaylist(pl); }}
                                className="flex items-center gap-3 w-full px-4 py-4 text-base text-gray-300 hover:bg-gray-800 hover:text-white transition-colors text-left">
                                <Copy size={16} /> Duplicate
                              </button>
                              <div className="h-px bg-gray-800 mx-3" />
                              <button onClick={e => { e.stopPropagation(); setMenuId(null); deletePlaylist(pl.id); }}
                                className="flex items-center gap-3 w-full px-4 py-4 text-base text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors text-left">
                                <Trash2 size={16} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── CENTER: Track list (hidden on mobile when list panel is showing) ─────── */}
        <div className={`flex-col flex-1 min-w-0 overflow-hidden border-r border-gray-800/50 ${
          mobileShowList ? "hidden lg:flex" : "flex"
        }`}>

          {!activePlaylist ? (
            /* ── No playlist selected — show recent playlists grid ── */
            <div className="flex flex-col h-full overflow-y-auto">
              {playlists.length === 0 ? (
                /* Truly no playlists yet */
                <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
                  <div className="relative">
                    <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-indigo-600/20 to-purple-700/20 border border-indigo-500/20 flex items-center justify-center shadow-2xl">
                      <ListMusic size={52} className="text-indigo-500/40" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg text-xl">🎵</div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white mb-2">No Playlists Yet</h2>
                    <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                      Create your first playlist using the <strong className="text-gray-300">+</strong> button on the left.
                    </p>
                  </div>
                  <button onClick={() => setCreating(true)}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 hover:opacity-90 text-white font-semibold shadow-lg shadow-indigo-900/30 transition-all active:scale-95">
                    <Plus size={18} /> New Playlist
                  </button>
                </div>
              ) : (
                /* Has playlists — show them as clickable cards */
                <div className="px-6 pt-6 pb-8">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">Recent Playlists</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {playlists.map(pl => {
                      const count = pl.songIds.length;
                      return (
                        <button
                          key={pl.id}
                          onClick={() => { setActiveId(pl.id); setMobileShowList(false); }}
                          className="group flex flex-col items-start gap-3 p-4 rounded-2xl bg-gray-800/40 hover:bg-indigo-600/15 border border-gray-700/40 hover:border-indigo-500/30 transition-all text-left active:scale-95"
                        >
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-700/50 to-purple-900/50 border border-indigo-600/20 flex items-center justify-center text-2xl shadow-lg">
                            {pl.emoji ?? "🎵"}
                          </div>
                          <div className="min-w-0 w-full">
                            <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">{pl.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{count} {count === 1 ? "song" : "songs"}</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play size={11} className="fill-indigo-400" /> Open
                          </div>
                        </button>
                      );
                    })}
                    {/* Create new card */}
                    <button
                      onClick={() => setCreating(true)}
                      className="flex flex-col items-start gap-3 p-4 rounded-2xl border border-dashed border-gray-700/60 hover:border-indigo-500/40 hover:bg-indigo-600/10 transition-all text-left active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gray-800/60 border border-gray-700/50 flex items-center justify-center">
                        <Plus size={20} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-500">New Playlist</p>
                        <p className="text-xs text-gray-600 mt-0.5">Create one</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ── Playlist header ── */}
              <div className="shrink-0 bg-gradient-to-b from-indigo-950/50 via-[#0d0f14]/80 to-[#0d0f14] px-4 pt-3 pb-3">
                {/* Mobile back button */}
                <button
                  onClick={() => { setMobileShowList(true); setEditingId(null); setMenuId(null); }}
                  className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-800/80 hover:bg-gray-700/80 text-sm text-white font-semibold transition-all mb-4 active:scale-95 self-start"
                >
                  <ChevronLeft size={18} />
                  All Playlists
                </button>
                <div className="flex items-center gap-4">
                  {/* Cover art — comfortable on mobile */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-indigo-700/60 to-purple-900/60 border border-indigo-600/20 flex items-center justify-center text-4xl sm:text-5xl shadow-xl shrink-0 select-none">
                    {activePlaylist.emoji ?? "🎵"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-0.5">Playlist</p>
                    <h2 className="text-lg sm:text-xl font-black text-white leading-tight truncate">{activePlaylist.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">
                      {activePlaylist.songIds.length} {activePlaylist.songIds.length === 1 ? "song" : "songs"}
                      {currentSong && <span className="text-indigo-400"> · {currentSong.title}</span>}
                    </p>
                    {/* Buttons — bigger for comfortable tapping */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => { if (hasSongs) playSong(playlistSongs[0].id); }}
                        disabled={!hasSongs}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm transition-all active:scale-95 shadow-md">
                        <Play size={14} className="fill-white" /> Play All
                      </button>
                      <button
                        onClick={doShuffle}
                        disabled={!hasSongs}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-40 ${
                          isShuffle ? "bg-emerald-600/80 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}>
                        <Shuffle size={14} /> Shuffle
                      </button>
                      {currentSong && (
                        <button
                          onClick={() => setMobileLyricsOpen(true)}
                          className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm bg-purple-700/60 hover:bg-purple-700 text-white transition-all active:scale-95">
                          <BookOpen size={14} /> Lyrics
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Search ── */}
              <div className="px-4 sm:px-5 pb-2 shrink-0">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type="text" placeholder="Search in playlist…" value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    className="w-full pl-11 pr-10 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  />
                  {searchQ && (
                    <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Column headers ── */}
              <div className="px-5 shrink-0 border-b border-gray-800/40 pb-1.5 mb-0.5">
                <div className="grid items-center text-[10px] font-bold uppercase tracking-widest text-gray-600 px-1" style={{ gridTemplateColumns: "2rem 1fr 7rem 2rem" }}>
                  <span className="text-center">#</span>
                  <span>Title</span>
                  <span className="hidden sm:block">Tags</span>
                  <span />
                </div>
              </div>

              {/* ── Track list (scrollable, fills remaining space) ── */}
              <div className="flex-1 overflow-y-auto px-5 pb-6">
                {filteredSongs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
                    {searchQ ? (
                      <>
                        <Search size={32} className="text-gray-700" />
                        <p className="text-sm text-gray-500">No results for "<span className="text-gray-300">{searchQ}</span>"</p>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                          <Music size={28} className="text-gray-600" />
                        </div>
                        <div className="text-center">
                          <p className="text-base font-semibold text-gray-500">No songs yet</p>
                          <p className="text-sm text-gray-600 mt-1 max-w-xs leading-relaxed">
                            Go to Song Management and tap the <ListMusic size={13} className="inline" /> icon on any song to add it here.
                          </p>
                        </div>
                        {onNavigateToSongs && (
                          <button
                            onClick={onNavigateToSongs}
                            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 hover:opacity-90 text-white font-semibold text-sm shadow-lg shadow-indigo-900/30 transition-all active:scale-95 mt-2"
                          >
                            <Plus size={16} /> Add Songs
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800/40 pt-1">
                    {filteredSongs.map((song, idx) => {
                      const isNow = currentSongId === song.id;
                      return (
                        <div
                          key={song.id}
                          draggable
                          onDragStart={() => setDragId(song.id)}
                          onDragEnter={() => setDragOver(idx)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => handleDrop(idx)}
                          onDragEnd={() => { setDragId(null); setDragOver(null); }}
                          onClick={() => playSong(song.id)}
                          className={`group grid items-center px-2 py-3.5 rounded-2xl cursor-pointer transition-all duration-100 select-none ${
                            isNow
                              ? "bg-indigo-500/15 ring-1 ring-indigo-500/20"
                              : dragOver === idx && dragId !== song.id
                                ? "bg-indigo-500/10 ring-1 ring-indigo-500/30"
                                : "hover:bg-gray-800/50"
                          }`}
                          style={{ gridTemplateColumns: "2.5rem 1fr 3rem" }}
                        >
                          {/* # or playing indicator */}
                          <div className="flex items-center justify-center w-full">
                            {isNow && isPlaying
                              ? <SoundBar />
                              : isNow
                                ? <Music size={16} className="text-indigo-400" />
                                : <>
                                    <span className="text-sm text-gray-600 group-hover:hidden tabular-nums">{idx + 1}</span>
                                    <Play size={16} className="hidden group-hover:block text-white fill-white" />
                                  </>
                            }
                          </div>

                          {/* Title / artist */}
                          <div className="min-w-0 pr-2">
                            <p className={`text-base font-semibold truncate ${isNow ? "text-indigo-300" : "text-white"}`}>{song.title}</p>
                            {song.artist && <p className="text-sm text-gray-500 truncate mt-0.5">{song.artist}</p>}
                          </div>

                          {/* Edit button — fat touch target */}
                          <div className="flex items-center justify-center">
                            <button
                              onClick={e => { e.stopPropagation(); setEditSongId(song.id); }}
                              title="Edit"
                              className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 transition-all active:scale-90"
                            >
                              <Pencil size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Song Edit Action Sheet ───────────────────────────────────────── */}
        {editSongId && activePlaylist && (() => {
          const editSong = playlistSongs.find(s => s.id === editSongId);
          const editIdx  = playlistSongs.findIndex(s => s.id === editSongId);
          if (!editSong) return null;
          return (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                onClick={() => setEditSongId(null)}
              />
              {/* Sheet */}
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#13151c] border-t border-gray-700/60 rounded-t-2xl shadow-2xl animate-slide-up">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-gray-700" />
                </div>
                {/* Song info */}
                <div className="px-5 py-3 border-b border-gray-800/60">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-0.5">Editing</p>
                  <p className="text-base font-bold text-white truncate">{editSong.title}</p>
                  {editSong.artist && <p className="text-xs text-gray-500 truncate">{editSong.artist}</p>}
                </div>
                {/* Actions */}
                <div className="px-4 py-3 flex flex-col gap-2">
                  {/* Move Up */}
                  <button
                    disabled={editIdx === 0}
                    onClick={() => {
                      if (editIdx <= 0) return;
                      const ids = [...activePlaylist.songIds];
                      [ids[editIdx - 1], ids[editIdx]] = [ids[editIdx], ids[editIdx - 1]];
                      setPlaylists(p => p.map(x => x.id === activePlaylist.id ? { ...x, songIds: ids, updatedAt: new Date().toISOString() } : x));
                      setEditSongId(null);
                      showToast("success", "Moved up.");
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800/60 hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium text-sm transition-all active:scale-[0.98]"
                  >
                    <ArrowUp size={17} className="text-indigo-400 shrink-0" />
                    Move Up
                  </button>
                  {/* Move Down */}
                  <button
                    disabled={editIdx === playlistSongs.length - 1}
                    onClick={() => {
                      if (editIdx >= playlistSongs.length - 1) return;
                      const ids = [...activePlaylist.songIds];
                      [ids[editIdx], ids[editIdx + 1]] = [ids[editIdx + 1], ids[editIdx]];
                      setPlaylists(p => p.map(x => x.id === activePlaylist.id ? { ...x, songIds: ids, updatedAt: new Date().toISOString() } : x));
                      setEditSongId(null);
                      showToast("success", "Moved down.");
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800/60 hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium text-sm transition-all active:scale-[0.98]"
                  >
                    <ArrowDown size={17} className="text-indigo-400 shrink-0" />
                    Move Down
                  </button>
                  {/* Remove */}
                  <button
                    onClick={() => {
                      removeSong(activePlaylist.id, editSongId);
                      setEditSongId(null);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium text-sm transition-all active:scale-[0.98]"
                  >
                    <Trash2 size={17} className="shrink-0" />
                    Remove from Playlist
                  </button>
                  {/* Cancel */}
                  <button
                    onClick={() => setEditSongId(null)}
                    className="flex items-center justify-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-400 font-medium text-sm transition-all active:scale-[0.98] mt-1"
                  >
                    Cancel
                  </button>
                </div>
                <div className="pb-safe pb-4" />
              </div>
            </>
          );
        })()} 

        {/* ── Share / Publish Modal ─────────────────────────────────────────── */}
        {shareModalPlaylistId && (() => {
          const pl = playlists.find(p => p.id === shareModalPlaylistId);
          if (!pl) return null;
          const publicUrl = `${window.location.origin}/p/${shareSlug}`;
          return (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setShareModalPlaylistId(null)} />
              {/* Modal */}
              <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto bg-[#13151c] border border-gray-700/60 rounded-3xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 flex items-center justify-center">
                      <Globe size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Share Public Link</h2>
                      <p className="text-xs text-gray-500">{pl.emoji} {pl.name}</p>
                    </div>
                  </div>
                  <button onClick={() => setShareModalPlaylistId(null)}
                    className="p-2 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Slug editor */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Public URL Slug</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs font-mono pointer-events-none">/p/</span>
                      <input
                        value={shareSlug}
                        onChange={e => {
                          const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                          setShareSlug(v);
                          setShareSlugAvailable(null);
                          setSharePublishedSlug(null);
                        }}
                        onBlur={() => checkSlug(shareSlug)}
                        placeholder="my-awesome-playlist"
                        className="w-full pl-9 pr-10 py-3 bg-gray-800/60 border border-gray-700/60 rounded-xl text-sm text-white font-mono outline-none focus:border-emerald-500/60 transition-colors"
                        maxLength={60}
                      />
                      {/* Availability indicator */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                        {shareSlugAvailable === true  && <span className="text-emerald-400">✓</span>}
                        {shareSlugAvailable === false && <span className="text-red-400">✗</span>}
                        {shareSlugAvailable === null  && shareSlug.length >= 3 && <span className="text-gray-600">…</span>}
                      </div>
                    </div>
                    {shareSlugAvailable === false && (
                      <p className="text-xs text-red-400 mt-1.5">This slug is already taken. Choose a different one.</p>
                    )}
                    {shareSlugAvailable === true && (
                      <p className="text-xs text-emerald-400 mt-1.5">✓ Available!</p>
                    )}
                  </div>

                  {/* Description (optional) */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Description <span className="font-normal text-gray-600">(optional)</span></label>
                    <input
                      value={shareDescription}
                      onChange={e => setShareDescription(e.target.value)}
                      placeholder="e.g. YC 2026 Worship Concert setlist"
                      className="w-full px-4 py-3 bg-gray-800/60 border border-gray-700/60 rounded-xl text-sm text-white outline-none focus:border-emerald-500/60 transition-colors"
                      maxLength={120}
                    />
                  </div>

                  {/* Published link */}
                  {sharePublishedSlug && (
                    <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-2xl p-4">
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">🌐 Live Public Link</p>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-xs text-emerald-300 font-mono break-all">{publicUrl}</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(publicUrl);
                            setShareLinkCopied(true);
                            setTimeout(() => setShareLinkCopied(false), 2000);
                          }}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all active:scale-95"
                        >
                          {shareLinkCopied ? <Check size={13} /> : <Link size={13} />}
                          {shareLinkCopied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Song count info */}
                  <p className="text-xs text-gray-600">
                    {pl.songIds.length} {pl.songIds.length === 1 ? "song" : "songs"} will be included as a public snapshot.
                    Updates to the playlist won't reflect until you republish.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 px-6 pb-6">
                  {sharePublishedSlug ? (
                    <>
                      <button
                        onClick={publishPlaylist}
                        disabled={sharePublishing || shareSlugAvailable === false}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm transition-all active:scale-95"
                      >
                        {sharePublishing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Share2 size={15} /> Republish</>}
                      </button>
                      <button
                        onClick={unpublishPlaylist}
                        disabled={sharePublishing}
                        className="px-4 py-3 rounded-2xl text-red-400 hover:bg-red-900/20 font-semibold text-sm transition-all active:scale-95 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={publishPlaylist}
                      disabled={sharePublishing || !shareSlug || shareSlugAvailable === false}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 disabled:opacity-40 text-white font-bold text-sm transition-all active:scale-95 shadow-lg"
                    >
                      {sharePublishing
                        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <><Globe size={15} /> Publish &amp; Get Link</>}
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {mobileLyricsOpen && currentSong && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileLyricsOpen(false)}
            />
            {/* Sheet */}
            <div
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#13151c] border-t border-gray-700/60 rounded-t-3xl shadow-2xl animate-slide-up lg:hidden flex flex-col"
              style={{ maxHeight: "80vh" }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2 shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-700" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 shrink-0">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-purple-400">Now Playing</p>
                  <p className="text-base font-bold text-white truncate">{currentSong.title}</p>
                  {currentSong.artist && <p className="text-sm text-gray-500 truncate">{currentSong.artist}</p>}
                </div>
                <button
                  onClick={() => setMobileLyricsOpen(false)}
                  className="p-2.5 rounded-xl hover:bg-gray-800 text-gray-500 hover:text-white transition-all active:scale-90 shrink-0"
                >
                  <X size={20} />
                </button>
              </div>
              {/* Tab bar */}
              <div className="flex items-center gap-2 px-5 pb-3 shrink-0 border-b border-gray-800/50">
                <button
                  onClick={() => setMobileLyricTab("lyrics")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    mobileLyricTab === "lyrics" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300 bg-gray-800/60"
                  }`}>
                  <BookOpen size={15} /> Lyrics
                </button>
                <button
                  onClick={() => setMobileLyricTab("chords")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    mobileLyricTab === "chords" ? "bg-purple-600 text-white" : "text-gray-500 hover:text-gray-300 bg-gray-800/60"
                  }`}>
                  <Guitar size={15} /> Chords
                </button>
              </div>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {mobileLyricTab === "lyrics" ? (
                  currentSong.lyrics
                    ? <div className="space-y-0">{renderLyrics(currentSong.lyrics)}</div>
                    : <p className="text-sm text-gray-600 italic mt-2">No lyrics saved for this song.</p>
                ) : (
                  currentSong.chords
                    ? <pre className="text-base text-gray-300 font-mono whitespace-pre-wrap leading-8">{currentSong.chords}</pre>
                    : <p className="text-sm text-gray-600 italic mt-2">No chords saved for this song.</p>
                )}
              </div>
              <div className="h-6 shrink-0" />
            </div>
          </>
        )} 

        {/* ── RIGHT: Video + Lyrics/Chords ───────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-[340px] xl:w-[400px] shrink-0 overflow-hidden bg-[#0a0c10]">

          {/* Video — fixed aspect ratio */}
          <div className="shrink-0 bg-black w-full aspect-video relative">
            <div id={playerDivId} className="absolute inset-0 w-full h-full" />
          {!videoId && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-[#0a0c10] gap-3">
                {currentSong ? (
                  <>
                    <Music size={36} className="text-gray-700" />
                    <p className="text-sm text-gray-600">No video for this song</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-1">
                      <ListMusic size={28} className="text-gray-600" />
                    </div>
                    <p className="text-sm text-gray-600 font-medium">No song selected</p>
                    <p className="text-xs text-gray-700">Click a song to start playing</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Lyrics / Chords — fills all remaining height */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-gray-800/40 shrink-0">
              <button
                onClick={() => setLyricTab("lyrics")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${lyricTab === "lyrics" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"}`}>
                <BookOpen size={12} /> Lyrics
              </button>
              <button
                onClick={() => setLyricTab("chords")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${lyricTab === "chords" ? "bg-purple-600 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"}`}>
                <Guitar size={12} /> Chords
              </button>
              {currentSong && (
                <p className="flex-1 text-right text-xs text-gray-600 truncate pl-2">{currentSong.title}</p>
              )}
            </div>

            {/* Content — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!currentSong ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <Mic2 size={28} className="text-gray-700" />
                  <p className="text-sm text-gray-600 leading-relaxed">Lyrics and chords<br />will appear here.</p>
                </div>
              ) : lyricTab === "lyrics" ? (
                currentSong.lyrics
                  ? <div className="space-y-0">{renderLyrics(currentSong.lyrics)}</div>
                  : <p className="text-sm text-gray-600 italic mt-2">No lyrics saved for this song.</p>
              ) : (
                currentSong.chords
                  ? <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap leading-7">{currentSong.chords}</pre>
                  : <p className="text-sm text-gray-600 italic mt-2">No chords saved for this song.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
           BOTTOM PLAYER BAR
      ════════════════════════════════════════════════════════════════════ */}
      {/* ══ BOTTOM PLAYER BAR ══════════════════════════════════════════════ */}
      <div className="shrink-0 border-t border-gray-800/60 bg-[#0a0c10]">

        {/* Mobile: visible + scrubable progress strip */}
        <div className="relative h-1.5 bg-gray-800 lg:hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-r-full" style={{ width: `${progress * 100}%` }} />
          <input
            type="range" min={0} max={1} step={0.001} value={progress}
            onChange={handleSeek}
            disabled={!currentSong || duration === 0}
            className="absolute inset-0 w-full opacity-0 h-6 -top-2 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center px-4 sm:px-6 py-3 gap-3 sm:gap-4">

          {/* Thumbnail + song info */}
          <div className="flex items-center gap-3 min-w-0 flex-1 lg:w-52 lg:flex-none">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
              currentSong
                ? "bg-gradient-to-br from-indigo-700/70 to-purple-900/70 border border-indigo-600/20"
                : "bg-gray-800"
            }`}>
              {currentSong ? (activePlaylist?.emoji ?? "🎵") : <Music size={16} className="text-gray-600" />}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-semibold truncate leading-tight ${currentSong ? "text-white" : "text-gray-600"}`}>
                {currentSong?.title ?? "Nothing playing"}
              </p>
              {currentSong?.artist && (
                <p className="text-xs text-gray-500 truncate mt-0.5">{currentSong.artist}</p>
              )}
            </div>
          </div>

          {/* Mobile: bigger prev / play / next — fat tap targets */}
          <div className="flex items-center gap-2 lg:hidden shrink-0">
            <button onClick={handlePrev} disabled={!currentSong}
              className="text-gray-400 hover:text-white disabled:opacity-25 transition-colors p-2.5 rounded-xl active:scale-90">
              <SkipBack size={22} />
            </button>
            <button onClick={togglePlay}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg ${
                currentSong ? "bg-white hover:bg-gray-100" : "bg-gray-700 cursor-default"
              }`}>
              {isPlaying
                ? <Pause size={20} className="text-gray-900 fill-gray-900" />
                : <Play  size={20} className="text-gray-900 fill-gray-900 ml-0.5" />}
            </button>
            <button onClick={handleNext} disabled={!currentSong}
              className="text-gray-400 hover:text-white disabled:opacity-25 transition-colors p-2.5 rounded-xl active:scale-90">
              <SkipForward size={22} />
            </button>
          </div>

          {/* Desktop: full center — all 5 controls + progress bar */}
          <div className="hidden lg:flex flex-col flex-1 items-center gap-1 min-w-0 px-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsShuffle(v => !v)} title="Shuffle"
                className={`transition-colors ${isShuffle ? "text-emerald-400" : "text-gray-500 hover:text-gray-200"}`}>
                <Shuffle size={15} />
              </button>
              <button onClick={handlePrev} disabled={!currentSong}
                className="text-gray-400 hover:text-white disabled:opacity-25 transition-colors">
                <SkipBack size={19} />
              </button>
              <button onClick={togglePlay}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  currentSong ? "bg-white hover:bg-gray-100" : "bg-gray-700 cursor-default"
                }`}>
                {isPlaying
                  ? <Pause size={16} className="text-gray-900 fill-gray-900" />
                  : <Play  size={16} className="text-gray-900 fill-gray-900 ml-0.5" />}
              </button>
              <button onClick={handleNext} disabled={!currentSong}
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
                  disabled={!currentSong || duration === 0}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
              <span className="text-[10px] text-gray-600 tabular-nums shrink-0 w-7">{fmtTime(duration)}</span>
            </div>
          </div>

          {/* Desktop: volume — same width as song info for symmetric centering */}
          <div className="hidden lg:flex w-52 items-center justify-end shrink-0">
            <button onClick={() => setIsMuted(v => !v)} title={isMuted ? "Unmute" : "Mute"}
              className="text-gray-400 hover:text-white transition-colors">
              {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          </div>

        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes plSoundbar {
          from { transform: scaleY(0.25); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
