import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { getAuth } from "firebase/auth";
import AutoTextarea from "./AutoTextarea";
import { Song, Tag } from "./types";
import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, ChevronLeft, ChevronRight,
  ChevronDown, ImagePlus, Loader2, ExternalLink, Printer, CheckSquare, Check, Filter, Users,
  Calendar, Phone, UserPlus, Camera, LayoutGrid, List, BookOpen, Mic2, Copy, Pencil,
  Shield, Mail, Guitar, Sliders, Palette, Lock, AlertTriangle, CheckCircle, BookMarked,
  HandMetal, Headphones, HelpCircle, Undo2, Redo2, Play } from "lucide-react";
import SongsLibraryPlayer, { LibraryTrack } from "./SongsLibraryPlayer";

// ── Module-level helpers ──────────────────────────────────────────────────────
const CustomYoutubeIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="12" cy="12" r="10" fill="#FF0000" />
    <path d="M10 8.5L15 12L10 15.5V8.5Z" fill="white" />
  </svg>
);

const CustomVideoBtnIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="4" fill="#FF0000" />
    <path d="M10 8.5L15 12L10 15.5V8.5Z" fill="white" />
  </svg>
);


// ── Chord Transposer ──────────────────────────────────────────────────────────
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

function transposeChords(text: string, steps: number): string {
  if (!steps || !text) return text;
  const n = ((steps % 12) + 12) % 12;
  return text.replace(
    /(?<![A-Za-z])([A-G][#b]?)(m(?:aj\d*)?|maj\d*|min\d*|dim\d*|aug\d*|sus[24]?\d*|add\d+|\d+)?(?![a-z])/g,
    (_: string, root: string, quality: string | undefined) => {
      const normalized = ENHARMONIC[root] ?? root;
      const idx = CHROMATIC.indexOf(normalized);
      if (idx === -1) return _;
      return CHROMATIC[(idx + n) % 12] + (quality ?? '');
    }
  );
}



// ── Props ─────────────────────────────────────────────────────────────────────
export interface SongsViewProps {
  allSongs: Song[];
  setAllSongs: React.Dispatch<React.SetStateAction<Song[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  isLoadingSongs: boolean;
  setIsLoadingSongs: React.Dispatch<React.SetStateAction<boolean>>;
  allMembers: any[];
  isAdmin: boolean;
  canAddSong: boolean;
  canEditSong: boolean;
  canDeleteSong: boolean;
  canSelectSongs?: boolean;
  user: any;
  showToast: (type: string, msg: string) => void;
  showConfirm: (config: any) => void;
  closeConfirm: () => void;
  pendingNavSongId?: string | null;
  onPendingNavHandled?: () => void;
  onOpenVideo?: (url: string) => void;
  /** Called whenever a song is opened/closed so App.tsx can track detail-panel state */
  onSelectedSongChange?: (hasSong: boolean) => void;
  /** Increment this number from App.tsx to tell SongsView to clear the selected song */
  clearSelectionSignal?: number;
  /** Lifted: open the library player from App.tsx (persists across navigation) */
  onOpenLibraryPlayer?: (songId?: string) => void;
  /** Whether the library player is currently open — used for button state */
  isLibraryPlayerOpen?: boolean;
  /** Whether the lineup player is open — disables Play Library button to prevent conflict */
  isLineupOpen?: boolean;
}

export default function SongsView({
  allSongs,
  setAllSongs,
  tags,
  setTags,
  isLoadingSongs,
  setIsLoadingSongs,
  allMembers,
  isAdmin,
  canAddSong,
  canEditSong,
  canDeleteSong,
  canSelectSongs,
  user,
  showToast,
  showConfirm,
  closeConfirm,
  pendingNavSongId,
  onPendingNavHandled,
  onOpenVideo,
  onSelectedSongChange,
  clearSelectionSignal,
  onOpenLibraryPlayer,
  isLibraryPlayerOpen = false,
  isLineupOpen = false,
}: SongsViewProps) {

  // ── Songs search & filter ─────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // ── Debounce: sync searchQuery → debouncedQuery with 150ms delay ────────────
  // Without this useEffect, debouncedQuery is always "" and search never filters.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ── Song editing form ─────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [isOcrLoading, setIsOcrLoading] = useState<"lyrics" | "chords" | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editChords, setEditChords] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [copiedField, setCopiedField] = useState<"lyrics" | "chords" | null>(null);
  const [transposeSteps, setTransposeSteps] = useState(0);
  const [formErrors, setFormErrors] = useState<{ title?: string; artist?: string }>({});

  // ── Library mini player — state lifted to App.tsx; local helpers proxy up ──
  /** Songs that have a YouTube video_url — kept here for count / button display */
  const songsWithVideo = useMemo<LibraryTrack[]>(() =>
    allSongs
      .filter(s => !!s.video_url)
      .map(s => ({ id: s.id, title: s.title, artist: s.artist || "", videoUrl: s.video_url! })),
    [allSongs]
  );

  const openLibraryPlayer = (songId?: string) => {
    if (songsWithVideo.length === 0) return;
    const libraryStartIndex = songId ? songsWithVideo.findIndex(s => s.id === songId) : 0;
    onOpenLibraryPlayer?.(songId);
  };
  const libraryPlayerOpen = isLibraryPlayerOpen;


  // Refs for focusing fields on open
  const songTitleRef = useRef<HTMLInputElement>(null);
  const songArtistRef = useRef<HTMLInputElement>(null);
  const songLyricsWrapRef = useRef<HTMLDivElement>(null);
  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const chordsInputRef = useRef<HTMLInputElement>(null);

  const lyricsHistory = useRef<string[]>([]);
  const lyricsIdx = useRef(-1);
  const chordsHistory = useRef<string[]>([]);
  const chordsIdx = useRef(-1);
  const lyricsPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chordsPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lyricsCanUndo, setLyricsCanUndo] = useState(false);
  const [lyricsCanRedo, setLyricsCanRedo] = useState(false);
  const [chordsCanUndo, setChordsCanUndo] = useState(false);
  const [chordsCanRedo, setChordsCanRedo] = useState(false);

  /** Push a value onto a history stack (truncate redo branch) */
  const pushHistory = (val: string, history: React.MutableRefObject<string[]>, idx: React.MutableRefObject<number>) => {
    const stack = history.current;
    // Trim redo branch
    stack.splice(idx.current + 1);
    stack.push(val);
    // Cap at 100 entries
    if (stack.length > 100) stack.shift();
    idx.current = stack.length - 1;
  };

  /** Debounced push — waits 500ms after the user stops typing */
  const pushLyricsHistory = (val: string) => {
    if (lyricsPushTimer.current) clearTimeout(lyricsPushTimer.current);
    lyricsPushTimer.current = setTimeout(() => {
      pushHistory(val, lyricsHistory, lyricsIdx);
      setLyricsCanUndo(lyricsIdx.current > 0);
      setLyricsCanRedo(lyricsIdx.current < lyricsHistory.current.length - 1);
    }, 500);
  };

  const pushChordsHistory = (val: string) => {
    if (chordsPushTimer.current) clearTimeout(chordsPushTimer.current);
    chordsPushTimer.current = setTimeout(() => {
      pushHistory(val, chordsHistory, chordsIdx);
      setChordsCanUndo(chordsIdx.current > 0);
      setChordsCanRedo(chordsIdx.current < chordsHistory.current.length - 1);
    }, 500);
  };

  const undoLyrics = () => {
    if (lyricsIdx.current <= 0) return;
    lyricsIdx.current--;
    const val = lyricsHistory.current[lyricsIdx.current];
    setEditLyrics(val);
    setLyricsCanUndo(lyricsIdx.current > 0);
    setLyricsCanRedo(true);
  };
  const redoLyrics = () => {
    if (lyricsIdx.current >= lyricsHistory.current.length - 1) return;
    lyricsIdx.current++;
    const val = lyricsHistory.current[lyricsIdx.current];
    setEditLyrics(val);
    setLyricsCanUndo(true);
    setLyricsCanRedo(lyricsIdx.current < lyricsHistory.current.length - 1);
  };
  const undoChords = () => {
    if (chordsIdx.current <= 0) return;
    chordsIdx.current--;
    const val = chordsHistory.current[chordsIdx.current];
    setEditChords(val);
    setChordsCanUndo(chordsIdx.current > 0);
    setChordsCanRedo(true);
  };
  const redoChords = () => {
    if (chordsIdx.current >= chordsHistory.current.length - 1) return;
    chordsIdx.current++;
    const val = chordsHistory.current[chordsIdx.current];
    setEditChords(val);
    setChordsCanUndo(true);
    setChordsCanRedo(chordsIdx.current < chordsHistory.current.length - 1);
  };

  /** Reset history when editing starts (opening a song or new song) */
  const resetLyricsHistory = (initial: string) => {
    lyricsHistory.current = [initial];
    lyricsIdx.current = 0;
    setLyricsCanUndo(false);
    setLyricsCanRedo(false);
  };
  const resetChordsHistory = (initial: string) => {
    chordsHistory.current = [initial];
    chordsIdx.current = 0;
    setChordsCanUndo(false);
    setChordsCanRedo(false);
  };


  const LYRICS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";
  const CHORDS_TEMPLATE = "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:";


  // Tag form states
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("bg-gray-100 text-gray-800");

  // Song view mode: grid (default) or list
  const [songView, setSongView] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("wf_song_view") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });
  const toggleSongView = (v: "grid" | "list") => {
    setSongView(v);
    try { localStorage.setItem("wf_song_view", v); } catch { /* noop */ }
  };

  // Infinite scroll
  const BATCH_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);


  // ── Toast notifications ──────────────────────────────────────────────

  // ── Songs cache helpers + fetch ───────────────────────────────────────────
  // ── Cache helpers ───────────────────────────────────────────────────────────
  const CACHE_KEY = "wf_songs_cache";
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches App.tsx boot TTL

  const readCache = (): { songs: any[]; tags: any[] } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { songs, tags, ts } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL_MS) return null;
      return { songs, tags };
    } catch {
      return null;
    }
  };

  const writeCache = (songs: any[], tags: any[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ songs, tags, ts: Date.now() }));
    } catch {
      // storage quota exceeded — ignore
    }
  };

  const clearSongsCache = () => {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  };

  // ── Fetch: songs + tags in parallel, with localStorage cache ────────────────
  const fetchSongs = useCallback(async ({ background = false, bustCache = false } = {}) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    // 1. Serve from cache immediately (stale-while-revalidate)
    // bustCache: true skips cache entirely — used after a save to guarantee fresh data
    if (!background && !bustCache) {
      const cached = readCache();
      if (cached) {
        setAllSongs(cached.songs);
        setTags(cached.tags);
        setIsLoadingSongs(false);
        // Revalidate silently in background
        fetchSongs({ background: true });
        return;
      }
      setIsLoadingSongs(true);
    }

    try {
      // 2. Fetch songs + tags in parallel
      const [songsRes, tagsRes] = await Promise.all([
        fetch("/api/songs", { signal: controller.signal }),
        fetch("/api/tags", { signal: controller.signal }),
      ]);

      const [songsData, tagsData] = await Promise.all([
        songsRes.json(),
        tagsRes.json(),
      ]);

      const songs = Array.isArray(songsData) ? songsData : [];
      const tags = Array.isArray(tagsData) ? tagsData : [];

      setAllSongs(songs);
      setTags(tags);
      writeCache(songs, tags);
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error("Failed to load songs/tags", error);
        showToast("error", "Failed to load songs. Please refresh.");
        if (!background) {
          setAllSongs([]);
          setTags([]);
        }
      }
    } finally {
      if (!controller.signal.aborted) setIsLoadingSongs(false);
    }
  }, []);

  // ── Fetch songs on mount ─────────────────────────────────────────────────
  useEffect(() => {
    // If App.tsx already seeded songs from cache, do a silent background refresh
    // rather than showing the loading spinner again
    if (allSongs.length > 0) {
      fetchSongs({ background: true });
    } else {
      fetchSongs();
    }
  }, []);

  const fetchTags = fetchSongs; // aliases — tags are always loaded together


  // Instant client-side filtering — no network, no stale results
  const filteredSongs = useMemo(() => {
    let result = allSongs;

    const q = debouncedQuery.trim().toLowerCase();

    // Text search across title, artist, lyrics, chords, and tags
    if (q) {
      result = result.filter(song =>
        song.title?.toLowerCase().includes(q) ||
        song.artist?.toLowerCase().includes(q) ||
        song.lyrics?.toLowerCase().includes(q) ||
        song.chords?.toLowerCase().includes(q) ||
        song.tags?.some((t: Tag) => t.name?.toLowerCase().includes(q))
      );

      // ── Relevance ranking ─────────────────────────────────────────────
      // Score: 4 = title starts with query, 3 = title contains query,
      //        2 = artist contains query, 1 = tag/lyrics match only
      const score = (song: any): number => {
        const title = song.title?.toLowerCase() ?? "";
        const artist = song.artist?.toLowerCase() ?? "";
        if (title.startsWith(q)) return 4;
        if (title.includes(q)) return 3;
        if (artist.includes(q)) return 2;
        return 1;
      };
      result = [...result].sort((a, b) => score(b) - score(a));
    }

    // Tag filters
    const tagFilters = selectedTagIds.filter(id => id !== "recently-added");
    const recentlyAdded = selectedTagIds.includes("recently-added");

    if (tagFilters.length > 0) {
      result = result.filter(song =>
        tagFilters.some(tagId => song.tags.some(t => t.id === tagId))
      );
    }

    // Sort by date only when no active text search (relevance takes precedence)
    if (recentlyAdded && !q) {
      result = [...result].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return result;
  }, [allSongs, debouncedQuery, selectedTagIds]);

  // Visible slice for infinite scroll
  const visibleSongs = filteredSongs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSongs.length;

  // Reset visible count when search or filters change
  useEffect(() => { setVisibleCount(BATCH_SIZE); }, [debouncedQuery, selectedTagIds]);

  // IntersectionObserver: load next batch when sentinel enters view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore) setVisibleCount(c => c + BATCH_SIZE); },
      { rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore]);


  useEffect(() => { setTransposeSteps(0); }, [selectedSong?.id]);
  // Notify parent whenever the song detail panel opens or closes
  useEffect(() => { onSelectedSongChange?.(!!selectedSong); }, [selectedSong, onSelectedSongChange]);
  // When App.tsx increments clearSelectionSignal (via global Back button), close the detail panel
  useEffect(() => {
    if (clearSelectionSignal) setSelectedSong(null);
  }, [clearSelectionSignal]);


  // ── Songs handlers ────────────────────────────────────────────────────────
  const validateForm = () => {
    const errors: { title?: string; artist?: string; lyrics?: string; tags?: string } = {};
    if (!editTitle.trim()) errors.title = "Title is required.";
    if (!editArtist.trim()) errors.artist = "Artist is required.";
    if (!editLyrics.trim() || editLyrics.trim() === "Verse:\n\nPre Chorus:\n\nChorus:\n\nBridge:") errors.lyrics = "Lyrics are required.";
    if (editTags.length === 0) errors.tags = "Please select at least one tag.";
    return errors;
  };

  const handleSaveSong = async () => {
    // Validate required fields for both new songs and edits
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      // Build a readable list of what's missing
      const missing: string[] = [];
      if (errors.title)  missing.push("Song Title");
      if (errors.artist) missing.push("Artist");
      if (errors.tags)   missing.push("At least one Tag");
      if (errors.lyrics) missing.push("Lyrics");
      showToast("error", `Please fill in: ${missing.join(", ")}.`);
      // Focus the first empty field
      if (errors.title)       { songTitleRef.current?.focus(); }
      else if (errors.artist) { songArtistRef.current?.focus(); }
      else if (errors.lyrics) { songLyricsWrapRef.current?.querySelector("textarea")?.focus(); }
      return;
    }
    setFormErrors({});

    const cu = getAuth().currentUser;
    const payload = {
      title: editTitle,
      artist: editArtist,
      lyrics: editLyrics,
      chords: editChords,
      tags: editTags,
      video_url: editVideoUrl,
      actorName: cu?.displayName || cu?.email?.split("@")[0] || user?.displayName || "Worship Team",
      actorPhoto: cu?.photoURL || user?.photoURL || "",
      actorUserId: cu?.uid || user?.uid || "",
    };

    try {
      let response;
      if (selectedSong?.id) {
        response = await fetch(`/api/songs/${selectedSong.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save song");
      }

      const isEdit = !!selectedSong?.id;
      setIsEditing(false);
      setSelectedSong(null);
      clearSongsCache();
      // bustCache: true — bypasses stale-while-revalidate so the post-save
      // fetch always hits the network and never serves old cached data
      await fetchSongs({ bustCache: true });
      showToast("success", isEdit
        ? `Song "${payload.title}" updated successfully!`
        : `Song "${payload.title}" saved successfully!`
      );
    } catch (error: any) {
      console.error("Failed to save song", error);
      showToast("error", error.message || "Failed to save song. Please check if Firebase is configured correctly.");
    }
  };

  const handleDeleteSong = async (id: string) => {
    const song = allSongs.find(s => s.id === id);
    showConfirm({
      title: "Delete Song",
      message: `Are you sure you want to delete "${song?.title || "this song"}"?`,
      detail: "This action cannot be undone. The song will be permanently removed from the database.",
      confirmText: "Yes, Delete",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        closeConfirm();
        try {
          const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete song");

          if (selectedSong?.id === id) {
            setSelectedSong(null);
            setIsEditing(false);
          }
          clearSongsCache();
          fetchSongs();
          showToast("success", "Song deleted successfully.");
        } catch (error) {
          console.error("Failed to delete song", error);
          showToast("error", "Failed to delete song. Please try again.");
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedSongIds.length === 0) return;
    showConfirm({
      title: "Bulk Delete Songs",
      message: `Are you sure you want to delete ${selectedSongIds.length} selected song(s)?`,
      detail: "This will permanently remove all selected items from your directory.",
      confirmText: `Delete ${selectedSongIds.length} Songs`,
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        closeConfirm();
        try {
          await Promise.all(selectedSongIds.map(id => fetch(`/api/songs/${id}`, { method: "DELETE" })));
          setSelectedSongIds([]);
          setIsSelectionMode(false);
          clearSongsCache();
          fetchSongs();
          showToast("success", `${selectedSongIds.length} songs deleted successfully.`);
        } catch (error) {
          console.error("Failed to delete songs", error);
          showToast("error", "Failed to delete some songs. Please try again.");
        }
      }
    });
  };

  const toggleSongSelection = (id: string) => {
    setSelectedSongIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });
      setNewTagName("");
      fetchTags();
      showToast("success", "Tag created!");
    } catch (error) {
      console.error("Failed to create tag", error);
      showToast("error", "Failed to create tag. Try again.");
    }
  };

  const handleDeleteTag = async (id: string) => {
    showConfirm({
      title: "Delete Tag",
      message: "Are you sure you want to delete this tag?",
      detail: "This will remove the tag from all songs that use it. This action cannot be undone.",
      confirmText: "Delete Tag",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        closeConfirm();
        try {
          await fetch(`/api/tags/${id}`, { method: "DELETE" });
          clearSongsCache();
          fetchSongs();
          showToast("success", "Tag deleted successfully.");
        } catch (error) {
          console.error("Failed to delete tag", error);
          showToast("error", "Failed to delete tag.");
        }
      }
    });
  };


  // ── Songs editor functions ────────────────────────────────────────────────
  const openEditor = (song?: Song) => {
    if (song) {
      setSelectedSong(song);
      setEditTitle(song.title);
      setEditArtist(song.artist || "");
      setEditVideoUrl(song.video_url || "");
      setEditLyrics(song.lyrics);
      setEditChords(song.chords ?? "");
      setEditTags(Array.isArray(song.tags) ? song.tags.map((t) => t.id) : []);
      resetLyricsHistory(song.lyrics);
      resetChordsHistory(song.chords ?? "");
    } else {
      setSelectedSong(null);
      setEditTitle("");
      setEditArtist("");
      setEditVideoUrl("");
      setEditLyrics(LYRICS_TEMPLATE);
      setEditChords(CHORDS_TEMPLATE);
      setEditTags([]);
      resetLyricsHistory(LYRICS_TEMPLATE);
      resetChordsHistory(CHORDS_TEMPLATE);
    }
    setIsEditing(true);
    setFormErrors({});
  };

  const toggleTagSelection = (tagId: string) => {
    // Single-select: clicking active tag deselects, clicking another replaces
    setEditTags((prev) =>
      prev.includes(tagId) ? [] : [tagId]
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "lyrics" | "chords") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(type);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Data,
          mimeType: file.type,
          type
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "OCR failed on server");
      }

      const data = await response.json();
      const extractedText = data.text?.replace(/\*\*/g, "");
      if (extractedText) {
        if (type === "lyrics") {
          setEditLyrics(extractedText);
          pushHistory(extractedText, lyricsHistory, lyricsIdx);
          setLyricsCanUndo(lyricsIdx.current > 0);
          setLyricsCanRedo(false);
        } else {
          setEditChords(extractedText);
          pushHistory(extractedText, chordsHistory, chordsIdx);
          setChordsCanUndo(chordsIdx.current > 0);
          setChordsCanRedo(false);
        }
      }
    } catch (error) {
      console.error("OCR failed", error);
      showToast("error", "Failed to extract text from image. Please try again.");
    } finally {
      setIsOcrLoading(null);
      if (e.target) e.target.value = "";
    }
  };

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = (song: Song) => {
    const printHTML = `<!DOCTYPE html>
<html>
  <head>
    <title>${song.title}${song.artist ? ` - ${song.artist}` : ''}</title>
    <style>
      body { font-family: sans-serif; padding: 32px; line-height: 1.6; color: #111; }
      h1 { margin-bottom: 4px; font-size: 28px; }
      h2 { color: #555; margin-top: 0; font-weight: normal; margin-bottom: 24px; font-size: 18px; }
      .container { display: flex; gap: 40px; }
      .column { flex: 1; min-width: 0; }
      h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 12px; }
      pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; margin: 0; }
      .chords pre { font-family: monospace; background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; }
      @media (max-width: 500px) { .container { flex-direction: column; } }
    </style>
  </head>
  <body>
    <h1>${song.title}</h1>
    ${song.artist ? `<h2>${song.artist}</h2>` : ''}
    <div class="container">
      <div class="column"><h3>Lyrics</h3><pre>${song.lyrics || 'No lyrics added.'}</pre></div>
      <div class="column chords"><h3>Chords</h3><pre>${song.chords || 'No chords added.'}</pre></div>
    </div>
  </body>
</html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(printHTML); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (_) { }
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
    }, 300);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ══════════════════════════════════════════════════════════════
         SONG MANAGEMENT VIEW
    ══════════════════════════════════════════════════════════════ */}
      {isEditing ? (
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">{selectedSong ? "Edit Song" : "New Song"}</h2>
            <button
              onClick={() => setIsEditing(false)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  ref={songTitleRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => { setEditTitle(e.target.value); if (formErrors.title) setFormErrors(p => ({ ...p, title: undefined })); }}
                  className={`w-full px-4 py-2 border ${formErrors.title ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                  placeholder="Song Title"
                />
                {formErrors.title && <p className="mt-1 text-xs text-red-500">{formErrors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Artist <span className="text-red-500">*</span>
                </label>
                <input
                  ref={songArtistRef}
                  type="text"
                  value={editArtist}
                  onChange={(e) => { setEditArtist(e.target.value); if (formErrors.artist) setFormErrors(p => ({ ...p, artist: undefined })); }}
                  className={`w-full px-4 py-2 border ${formErrors.artist ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                  placeholder="Artist Name"
                />
                {formErrors.artist && <p className="mt-1 text-xs text-red-500">{formErrors.artist}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Video Link (YouTube/Reference)</label>
              <input
                type="text"
                value={editVideoUrl}
                onChange={(e) => setEditVideoUrl(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tags <span className="text-red-500">*</span>
              </label>
              <div className={`flex flex-wrap gap-2 p-2 rounded-xl ${formErrors.tags ? "border border-red-400" : ""}`}>
                {tags.map((tag) => {
                  const isSelected = editTags.includes(tag.id);
                  const isDisabled = editTags.length > 0 && !isSelected;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => { toggleTagSelection(tag.id); if (formErrors.tags) setFormErrors(p => ({ ...p, tags: undefined })); }}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors border ${isSelected
                        ? `${tag.color} border-transparent ring-2 ring-offset-1 ring-indigo-400`
                        : isDisabled
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-400 border-gray-300 dark:border-gray-500 opacity-65 cursor-not-allowed"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                    >
                      <TagIcon size={14} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              {formErrors.tags && <p className="mt-1 text-xs text-red-500">{formErrors.tags}</p>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* ── Lyrics Column ── */}
              <div className="flex flex-col">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Lyrics <span className="text-red-500">*</span>
                </label>

                {/* Upload Zone — Lyrics */}
                <button
                  type="button"
                  onClick={() => lyricsInputRef.current?.click()}
                  disabled={!!isOcrLoading}
                  className="w-full mb-3 group relative flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isOcrLoading === "lyrics" ? (
                    <>
                      <Loader2 size={28} className="text-indigo-500 animate-spin" />
                      <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Extracting text from image...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                        <ImagePlus size={20} className="text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Drop an image or click to upload</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Supports PNG, JPG, WEBP — AI will extract lyrics</p>
                      </div>
                      <span className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded-full group-hover:bg-indigo-700 transition-colors">
                        Upload Screenshot
                      </span>
                    </>
                  )}
                </button>
                <input
                  type="file"
                  ref={lyricsInputRef}
                  onChange={(e) => handleImageUpload(e, "lyrics")}
                  className="hidden"
                  accept="image/*"
                />

                {/* Undo/Redo icon buttons — Lyrics (touch-friendly) */}
                <div className="flex items-center gap-1 mb-1.5">
                  <button type="button" onClick={undoLyrics} disabled={!lyricsCanUndo}
                    aria-label="Undo" title="Undo (Ctrl+Z)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                    <Undo2 size={16} />
                  </button>
                  <button type="button" onClick={redoLyrics} disabled={!lyricsCanRedo}
                    aria-label="Redo" title="Redo (Ctrl+Y)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                    <Redo2 size={16} />
                  </button>
                </div>

                {/* Seamless textarea box */}
                <div ref={songLyricsWrapRef} className={`rounded-xl overflow-hidden border ${formErrors.lyrics ? "border-red-400" : "border-gray-300 dark:border-gray-600"}`}>
                  <AutoTextarea
                    value={editLyrics}
                    onChange={(e) => {
                      setEditLyrics(e.target.value);
                      pushLyricsHistory(e.target.value);
                      if (formErrors.lyrics) setFormErrors(p => ({ ...p, lyrics: undefined }));
                    }}
                    onKeyDown={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoLyrics(); }
                        if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redoLyrics(); }
                      }
                    }}
                    minRows={10}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 outline-none font-sans focus:ring-2 focus:ring-inset focus:ring-indigo-300 dark:focus:ring-indigo-700"
                    placeholder="Paste lyrics here..."
                  />
                </div>
                {formErrors.lyrics && <p className="mt-1 text-xs text-red-500">{formErrors.lyrics}</p>}
              </div>

              {/* ── Chords Column ── */}
              <div className="flex flex-col">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Chords</label>

                {/* Upload Zone — Chords */}
                <button
                  type="button"
                  onClick={() => chordsInputRef.current?.click()}
                  disabled={!!isOcrLoading}
                  className="w-full mb-3 group relative flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isOcrLoading === "chords" ? (
                    <>
                      <Loader2 size={28} className="text-purple-500 animate-spin" />
                      <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Extracting chords from image...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                        <ImagePlus size={20} className="text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Drop an image or click to upload</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Supports PNG, JPG, WEBP — AI will extract chords</p>
                      </div>
                      <span className="px-3 py-1 text-xs font-medium bg-purple-600 text-white rounded-full group-hover:bg-purple-700 transition-colors">
                        Upload Screenshot
                      </span>
                    </>
                  )}
                </button>
                <input
                  type="file"
                  ref={chordsInputRef}
                  onChange={(e) => handleImageUpload(e, "chords")}
                  className="hidden"
                  accept="image/*"
                />

                {/* Undo/Redo icon buttons — Chords (touch-friendly) */}
                <div className="flex items-center gap-1 mb-1.5">
                  <button type="button" onClick={undoChords} disabled={!chordsCanUndo}
                    aria-label="Undo" title="Undo (Ctrl+Z)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                    <Undo2 size={16} />
                  </button>
                  <button type="button" onClick={redoChords} disabled={!chordsCanRedo}
                    aria-label="Redo" title="Redo (Ctrl+Y)"
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all">
                    <Redo2 size={16} />
                  </button>
                </div>

                {/* Seamless textarea box */}
                <div className="rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600">
                  <AutoTextarea
                    value={editChords}
                    onChange={(e) => {
                      setEditChords(e.target.value);
                      pushChordsHistory(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undoChords(); }
                        if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redoChords(); }
                      }
                    }}
                    minRows={10}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 outline-none font-sans text-sm focus:ring-2 focus:ring-inset focus:ring-purple-300 dark:focus:ring-purple-700"
                    placeholder="Paste chords here..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setIsEditing(false)}
                className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSong}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors"
              >
                <Save size={18} />
                Save Song
              </button>
            </div>
          </div>
        </div>
      ) : selectedSong ? (
        <div className="max-w-4xl mx-auto space-y-4">

          {/* Minimalist Header Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedSong.tags.map((tag) => (
                    <span key={tag.id} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-semibold ${tag.color}`}>
                      {tag.name}
                    </span>
                  ))}
                </div>
                {/* Title & Artist */}
                <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-1 leading-tight">{selectedSong.title}</h2>
                {selectedSong.artist && (
                  <p className="text-indigo-500 dark:text-indigo-400 font-semibold text-base sm:text-lg">{selectedSong.artist}</p>
                )}
              </div>
              {/* Action Buttons */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0 pt-1">
                <button onClick={() => handlePrint(selectedSong)} className="hidden sm:block relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150">
                  <Printer size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Print</span>
                </button>
                {canEditSong && (
                  <button onClick={() => openEditor(selectedSong)} className="relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150">
                    <Edit size={20} />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Edit</span>
                  </button>
                )}
                {canDeleteSong && (
                  <button onClick={() => handleDeleteSong(selectedSong.id)} className="relative group text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-150">
                    <Trash2 size={20} />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Delete</span>
                  </button>
                )}
                <button onClick={() => setSelectedSong(null)} className="relative group text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-150">
                  <X size={20} />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Close</span>
                </button>
              </div>
            </div>

            {/* Divider + Meta */}
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {(() => {
                const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                const fmtName = (full: string) => {
                  const parts = full.trim().split(/\s+/);
                  if (parts.length === 1) return parts[0];
                  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                };
                const Avatar = ({ name, photo }: { name?: string; photo?: string }) => {
                  // Try to find live photo from allMembers by matching name
                  const liveMember = name ? allMembers.find(m => m.name.toLowerCase().startsWith(name.split(' ')[0].toLowerCase())) : null;
                  const src = liveMember?.photo || photo;
                  const colors = ["bg-indigo-500","bg-violet-500","bg-pink-500","bg-emerald-500","bg-amber-500","bg-sky-500"];
                  const bg = colors[(name?.charCodeAt(0) || 0) % colors.length];
                  return src
                    ? <img src={src} alt={name} className="w-5 h-5 rounded-full object-cover ring-1 ring-white dark:ring-gray-700 shrink-0" />
                    : <div className={`w-5 h-5 rounded-full ${bg} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{(name || "?")[0].toUpperCase()}</div>;
                };
                return (
                  <>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                      <span className="font-semibold text-gray-500 dark:text-gray-400 shrink-0">Added:</span>
                      <span>{selectedSong.created_at ? fmtDate(selectedSong.created_at) : "Unknown"}</span>
                      {selectedSong.created_by_name && (
                        <><span className="text-gray-300 dark:text-gray-600">·</span>
                        <Avatar name={selectedSong.created_by_name} photo={selectedSong.created_by_photo} />
                        <span className="font-medium text-gray-500 dark:text-gray-400">{fmtName(selectedSong.created_by_name)}</span></>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                      <span className="font-semibold text-gray-500 dark:text-gray-400 shrink-0">Updated:</span>
                      <span>{selectedSong.updated_at ? fmtDate(selectedSong.updated_at) : "Never"}</span>
                      {selectedSong.updated_by_name && (
                        <><span className="text-gray-300 dark:text-gray-600">·</span>
                        <Avatar name={selectedSong.updated_by_name} photo={selectedSong.updated_by_photo} />
                        <span className="font-medium text-gray-500 dark:text-gray-400">{fmtName(selectedSong.updated_by_name)}</span></>
                      )}
                    </div>
                  </>
                );
              })()}
              {selectedSong.video_url && (
                <button
                  onClick={() => onOpenVideo?.(selectedSong.video_url!)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors pt-1"
                >
                  Watch Reference Video
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>


          {/* Lyrics & Chords Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="bg-white dark:bg-[#1E2938] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
              <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <h3 className="font-bold text-gray-900 dark:text-white tracking-wide text-sm uppercase">Lyrics</h3>
                </div>
                {selectedSong.lyrics && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedSong.lyrics);
                      setCopiedField("lyrics");
                      setTimeout(() => setCopiedField(null), 1500);
                    }}
                    title="Copy lyrics"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {copiedField === "lyrics" ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                  </button>
                )}
              </div>
              <div className="p-4 sm:p-6 flex-1 overflow-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{selectedSong.lyrics || "No lyrics added."}</pre>
              </div>
            </div>
            <div className="bg-white dark:bg-[#1E2938] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
              {/* Chords Header with Transposer */}
              <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <h3 className="font-bold text-gray-900 dark:text-white tracking-wide text-sm uppercase">Chords</h3>
                </div>
                {selectedSong.chords && (
                  <div className="flex items-center gap-1">
                    {/* – semitone */}
                    <button
                      onClick={() => setTransposeSteps(s => s - 1)}
                      title="Transpose down"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:text-purple-600 dark:hover:text-purple-400 font-bold text-base transition-colors"
                    >−</button>

                    {/* Key badge — click to reset */}
                    <button
                      onClick={() => setTransposeSteps(0)}
                      title="Reset to original key"
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold min-w-[52px] text-center transition-colors ${transposeSteps === 0
                        ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        : "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                        }`}
                    >
                      {transposeSteps === 0 ? "Original" : transposeSteps > 0 ? `+${transposeSteps}` : `${transposeSteps}`}
                    </button>

                    {/* + semitone */}
                    <button
                      onClick={() => setTransposeSteps(s => s + 1)}
                      title="Transpose up"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:text-purple-600 dark:hover:text-purple-400 font-bold text-base transition-colors"
                    >+</button>

                    {/* Divider */}
                    <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />

                    {/* Copy (copies transposed version) */}
                    <button
                      onClick={() => {
                        const text = transposeChords(selectedSong.chords!, transposeSteps);
                        navigator.clipboard.writeText(text);
                        setCopiedField("chords");
                        setTimeout(() => setCopiedField(null), 1500);
                      }}
                      title="Copy chords"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {copiedField === "chords" ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                    </button>
                  </div>
                )}
              </div>
              <div className="p-4 sm:p-6 flex-1 overflow-auto">
                {selectedSong.chords ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                    {transposeChords(selectedSong.chords, transposeSteps)}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400 dark:text-gray-600">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                      <Music size={22} className="text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-sm font-medium">No chords added</p>
                    <p className="text-xs mt-1 text-gray-300 dark:text-gray-600">Edit the song to add chord notations</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (

        <div className="space-y-3">
          {/* Filter & Search Bar */}
          {!isEditing && !selectedSong && (
            <div className="flex flex-col gap-3">
              {/* Row 1: Search + Actions */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  {/* Left icon: spinner while loading, search otherwise */}
                  {isLoadingSongs ? (
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  )}
                  <input
                    type="text"
                    placeholder="Search by title, artist, or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all outline-none text-sm dark:text-white"
                  />
                  {/* Clear button */}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSelectionMode ? (
                    <>
                      <button
                        onClick={handleBulkDelete}
                        disabled={selectedSongIds.length === 0}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={18} />
                        <span className="hidden sm:inline">Delete ({selectedSongIds.length})</span>
                        <span className="sm:hidden">{selectedSongIds.length}</span>
                      </button>
                      <button
                        onClick={() => { setIsSelectionMode(false); setSelectedSongIds([]); }}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
                      >
                        <X size={18} />
                        <span className="hidden sm:inline">Cancel</span>
                      </button>
                    </>
                  ) : (
                    <>

                      {canSelectSongs && (
                        <button
                          onClick={() => setIsSelectionMode(true)}
                          className="p-2 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-colors relative group"
                          title="Select Songs"
                        >
                          <CheckSquare size={20} />
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            Select Songs
                          </span>
                        </button>
                      )}
                      {canAddSong && (
                        <button
                          onClick={() => openEditor()}
                          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm"
                        >
                          <Plus size={18} />
                          <span className="hidden sm:inline">Add Song</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: Filter + Count + Toggle on left | Play Library on right */}
              <div className="flex items-center gap-2 py-3">
                {/* Left group: Filter + Count + Toggle */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="relative flex-shrink-0" ref={filterDropdownRef}>
                    <button
                      onClick={() => setIsFilterOpen(prev => !prev)}
                      className={`h-9 flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium border transition-all ${selectedTagIds.length > 0
                        ? "bg-indigo-600 text-white border-transparent shadow-sm"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                        }`}
                    >
                      <Filter size={15} />
                      {/* Show text on sm+, icon-only on xs */}
                      <span className="hidden xs:inline sm:inline">
                        {selectedTagIds.length === 0
                          ? "Filter"
                          : `${selectedTagIds.length} Filter${selectedTagIds.length > 1 ? "s" : ""}`}
                      </span>
                      {selectedTagIds.length > 0 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setSelectedTagIds([]); }}
                          className="ml-0.5 hover:opacity-70 transition-opacity"
                          role="button"
                          title="Clear filters"
                        >
                          <X size={13} />
                        </span>
                      )}
                      <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isFilterOpen && (
                      <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
                        <div className="p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3 py-2">Sort</p>
                          <button
                            onClick={() => setSelectedTagIds(prev =>
                              prev.includes("recently-added") ? prev.filter(id => id !== "recently-added") : [...prev, "recently-added"]
                            )}
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${selectedTagIds.includes("recently-added")
                              ? "bg-indigo-600 border-indigo-600"
                              : "border-gray-300 dark:border-gray-600"
                              }`}>
                              {selectedTagIds.includes("recently-added") && <Check size={10} className="text-white" strokeWidth={3} />}
                            </div>
                            <span>Recently Added</span>
                          </button>

                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-3 pt-3 pb-2 mt-1 border-t border-gray-100 dark:border-gray-700">Tags</p>
                          {Array.isArray(tags) && tags.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() => setSelectedTagIds(prev =>
                                prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                              )}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                            >
                              <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${selectedTagIds.includes(tag.id)
                                ? "bg-indigo-600 border-indigo-600"
                                : "border-gray-300 dark:border-gray-600"
                                }`}>
                                {selectedTagIds.includes(tag.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>{tag.name}</span>
                            </button>
                          ))}

                          {selectedTagIds.length > 0 && (
                            <button
                              onClick={() => setSelectedTagIds([])}
                              className="w-full mt-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium border-t border-gray-100 dark:border-gray-700"
                            >
                              Clear all filters
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Total Songs Count */}
                  <div className="h-9 flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 rounded-xl whitespace-nowrap flex-shrink-0">
                    {debouncedQuery || selectedTagIds.length > 0
                      ? <>{filteredSongs.length}<span className="hidden sm:inline"> of {allSongs.length}</span> <span className="hidden sm:inline">{allSongs.length === 1 ? 'Song' : 'Songs'}</span></>
                      : <>{allSongs.length} <span className="hidden sm:inline">{allSongs.length === 1 ? 'Song' : 'Songs'} Total</span><span className="sm:hidden">Songs</span></>
                    }
                  </div>
                  {/* Grid / List toggle */}
                  <div className="hidden sm:flex h-9 items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => toggleSongView("grid")}
                      title="Grid view"
                      className={`p-1.5 rounded-lg transition-all ${songView === "grid"
                        ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      onClick={() => toggleSongView("list")}
                      title="List view"
                      className={`hidden sm:flex p-1.5 rounded-lg transition-all ${songView === "list"
                        ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>

                {/* Play Library — pulsing icon, right side of filter row */}
                {songsWithVideo.length > 0 && !libraryPlayerOpen && !isLineupOpen && (
                  <div className="relative group flex-shrink-0">
                    {/* Pulse rings */}
                    <span className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
                    <button
                      onClick={() => openLibraryPlayer()}
                      className="relative w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg hover:scale-110 active:scale-95 transition-transform"
                    >
                      <Play size={15} className="fill-white ml-0.5" />
                    </button>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      Play Library ({songsWithVideo.length} songs)
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                )}
                {/* Blocked by lineup player */}
                {songsWithVideo.length > 0 && !libraryPlayerOpen && isLineupOpen && (
                  <div className="relative group flex-shrink-0">
                    <button
                      disabled
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    >
                      <Play size={15} />
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      Close Lineup Player first
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                )}
                {libraryPlayerOpen && (
                  <div className="relative group flex-shrink-0">
                    <button
                      disabled
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    >
                      <Play size={15} />
                    </button>
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      Now Playing
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                )}


              </div>

            </div>
          )}


          {/* ── GRID VIEW ─────────────────────────────────── */}
          {songView === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {isLoadingSongs ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3 w-3/4" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4 w-1/2" />
                    <div className="flex gap-2 mb-4">
                      <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                      <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-5/6" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-4/6" />
                    </div>
                  </div>
                ))
              ) : Array.isArray(filteredSongs) && visibleSongs.map((song) => (

                <div
                  key={song.id}
                  onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                  className={`bg-white dark:bg-gray-800 rounded-2xl p-6 border transition-all cursor-pointer group flex flex-col h-full relative ${selectedSongIds.includes(song.id)
                    ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-md"
                    : "border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500"
                    }`}
                >
                  {isSelectionMode && (
                    <div className="absolute top-4 right-4 z-10">
                      {selectedSongIds.includes(song.id) ? (
                        <div className="bg-indigo-600 text-white p-1 rounded-md"><Check size={16} /></div>
                      ) : (
                        <div className="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 p-1 rounded-md w-6 h-6" />
                      )}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                      {song.title}
                    </h3>
                    {!isSelectionMode && (
                      <div className="flex items-center gap-1 shrink-0">
                        {song.video_url && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenVideo?.(song.video_url!); }}
                            title="Watch Video"
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors relative group/tooltip"
                          >
                            <CustomYoutubeIcon size={22} />
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Watch Video</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {song.artist && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">{song.artist}</p>}
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wider font-medium">
                    {song.created_at ? new Date(song.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Array.isArray(song.tags) && song.tags.slice(0, 3).map((tag) => (
                      <span key={tag.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tag.color}`}>{tag.name}</span>
                    ))}
                    {Array.isArray(song.tags) && song.tags.length > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">+{song.tags.length - 3}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mt-auto">{song.lyrics}</p>
                </div>
              ))}
              {!isLoadingSongs && (!Array.isArray(filteredSongs) || filteredSongs.length === 0) && (
                <div className="col-span-full py-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4"><Search size={32} /></div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                  <p className="text-gray-500 dark:text-gray-400">{debouncedQuery ? `No results for "${debouncedQuery}". Try a different search.` : "Try adjusting your search or filter."}</p>
                  {debouncedQuery && <button onClick={() => setSearchQuery("")} className="mt-3 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors font-medium">Clear search</button>}
                </div>
              )}
              {/* Infinite scroll sentinel — grid */}
              {!isLoadingSongs && hasMore && (
                <div ref={sentinelRef} className="col-span-full flex justify-center py-6">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {!isLoadingSongs && !hasMore && filteredSongs.length > BATCH_SIZE && (
                <p className="col-span-full text-center text-xs text-gray-400 dark:text-gray-500 py-4">All {filteredSongs.length} songs loaded</p>
              )}
            </div>
          )}

          {/* ── LIST VIEW ─────────────────────────────────── */}
          {songView === "list" && (
            <div className="flex flex-col gap-1">
              {/* List header */}
              {!isLoadingSongs && Array.isArray(filteredSongs) && filteredSongs.length > 0 && (
                <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  <span>Title / Artist</span>
                  <span className="w-40 text-left">Tags</span>
                  <span className="w-32 text-left">Added</span>
                  <span className="w-6" />
                </div>
              )}

              {isLoadingSongs ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl animate-pulse">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/4" />
                    </div>
                    <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                    <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
                  </div>
                ))
              ) : Array.isArray(filteredSongs) && visibleSongs.map((song) => (

                <div
                  key={song.id}
                  onClick={() => isSelectionMode ? toggleSongSelection(song.id) : setSelectedSong(song)}
                  className={`grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-4 items-center px-4 py-3 rounded-xl border cursor-pointer group transition-all ${selectedSongIds.includes(song.id)
                    ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700"
                    : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:border-indigo-200 dark:hover:border-indigo-700"
                    }`}
                >
                  {/* Title + Artist */}
                  <div className="flex items-center gap-3 min-w-0">
                    {isSelectionMode && (
                      <div className="shrink-0">
                        {selectedSongIds.includes(song.id)
                          ? <div className="bg-indigo-600 text-white p-1 rounded-md"><Check size={14} /></div>
                          : <div className="bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-md w-5 h-5" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{song.title}</p>
                      {song.artist && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.artist}</p>}
                    </div>
                  </div>
                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 w-40">
                    {Array.isArray(song.tags) && song.tags.slice(0, 2).map((tag) => (
                      <span key={tag.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tag.color}`}>{tag.name}</span>
                    ))}
                    {Array.isArray(song.tags) && song.tags.length > 2 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">+{song.tags.length - 2}</span>
                    )}
                  </div>
                  {/* Date */}
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 w-32 whitespace-nowrap">
                    {song.created_at ? new Date(song.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
                  </p>
                  {/* Video icon */}
                  <div className="w-6 flex items-center justify-end">
                    {song.video_url && !isSelectionMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenVideo?.(song.video_url!); }}
                        title="Watch Video"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <CustomYoutubeIcon size={17} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!isLoadingSongs && (!Array.isArray(filteredSongs) || filteredSongs.length === 0) && (
                <div className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-4"><Search size={32} /></div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No songs found</h3>
                  <p className="text-gray-500 dark:text-gray-400">{debouncedQuery ? `No results for "${debouncedQuery}". Try a different search.` : "Try adjusting your search or filter."}</p>
                  {debouncedQuery && <button onClick={() => setSearchQuery("")} className="mt-3 px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors font-medium">Clear search</button>}
                </div>
              )}
              {/* Infinite scroll sentinel — list */}
              {!isLoadingSongs && hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-6">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {!isLoadingSongs && !hasMore && filteredSongs.length > BATCH_SIZE && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">All {filteredSongs.length} songs loaded</p>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
