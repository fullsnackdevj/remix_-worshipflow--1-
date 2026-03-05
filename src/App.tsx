import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Music, Search, Plus, Edit, Trash2, X, Save, Tag as TagIcon, Menu, ChevronLeft, ChevronRight, ChevronDown, Moon, Sun, ImagePlus, Loader2, ExternalLink, Printer, CheckSquare, Check, Filter, Users, Calendar, Phone, UserPlus, Camera, LayoutGrid, List, BookOpen, Mic2, Copy } from "lucide-react";
import { Song, Tag } from "./types";

// ── Member Role Constants ────────────────────────────────────────────────────
const ROLE_CATEGORIES = [
  {
    label: "🎸 Instrumentalists",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    dot: "bg-indigo-400",
    roles: ["Drummer", "Bassist", "Rhythm Guitar", "Lead Guitar", "Keys / Pianist"],
  },
  {
    label: "🎙️ Vocals",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    dot: "bg-rose-400",
    roles: ["Worship Leader", "Backup Singer"],
  },
  {
    label: "🎛️ Tech & Production",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    dot: "bg-amber-400",
    roles: ["OBS / Live Stream", "Presentation", "Lighting", "Camera Operator"],
  },
  {
    label: "🎨 Creative Support",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    dot: "bg-emerald-400",
    roles: ["Designer", "Photographer", "Videographer"],
  },
];

const ALL_ROLES = ROLE_CATEGORIES.flatMap(c => c.roles);

function getRoleStyle(role: string) {
  const cat = ROLE_CATEGORIES.find(c => c.roles.includes(role));
  return cat ? cat.color : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
}

const STATUS_CONFIG = {
  active: { label: "Active", dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  "on-leave": { label: "On Leave", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  inactive: { label: "Inactive", dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
} as const;

interface Member {
  id: string;
  name: string;
  phone: string;
  photo: string;
  roles: string[];
  status: "active" | "on-leave" | "inactive";
  notes: string;
  created_at?: string;
  updated_at?: string;
}

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

// ── Chord Transposer ────────────────────────────────────────────────────────
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ENHARMONIC: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

function transposeChords(text: string, steps: number): string {
  if (!steps || !text) return text;
  const n = ((steps % 12) + 12) % 12;
  // Smarter regex:
  //   (?<![A-Za-z])  - not preceded by a letter
  //   ([A-G][#b]?)   - chord ROOT (group 1)
  //   (quality)?     - optional chord quality: m, maj, min, dim, aug, sus, add, number (group 2)
  //   (?![a-z])      - NOT followed by a plain lowercase letter
  //                    -> rejects words: "Capo", "Chorus", "God", "Bridge"
  //                    -> accepts chords: "C", "Am", "F#", "Gsus4"
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

export default function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState<"songs" | "members">("songs");

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  // allSongs: the full cached list from server — never filtered directly
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ── Member state ──────────────────────────────────────────────────────────
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberFormErrors, setMemberFormErrors] = useState<{ name?: string; phone?: string }>({});

  // Member form fields
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberPhone, setEditMemberPhone] = useState("");
  const [editMemberPhoto, setEditMemberPhoto] = useState("");
  const [editMemberRoles, setEditMemberRoles] = useState<string[]>([]);
  const [editMemberStatus, setEditMemberStatus] = useState<"active" | "on-leave" | "inactive">("active");
  const [editMemberNotes, setEditMemberNotes] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const memberPhotoInputRef = useRef<HTMLInputElement>(null);

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editChords, setEditChords] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [isOcrLoading, setIsOcrLoading] = useState<"lyrics" | "chords" | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<{ title?: string; artist?: string; lyrics?: string; tags?: string }>({});
  const [copiedField, setCopiedField] = useState<"lyrics" | "chords" | null>(null);
  const [transposeSteps, setTransposeSteps] = useState(0);

  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const chordsInputRef = useRef<HTMLInputElement>(null);

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

  // Pagination (9 songs per page)
  const SONGS_PER_PAGE = 9;
  const [currentPage, setCurrentPage] = useState(1);


  // ── Toast notifications ──────────────────────────────────────────────
  type ToastType = "success" | "error" | "info" | "warning";
  interface ToastItem { id: number; type: ToastType; message: string; }
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (type: ToastType, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  const dismissToast = (id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id));

  // ── Confirm dialog ─────────────────────────────────────────────────
  interface ConfirmConfig {
    title: string;
    message: string;
    detail?: string;
    confirmText: string;
    confirmClass?: string;
    onConfirm: () => void;
  }
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  const showConfirm = (config: ConfirmConfig) => setConfirmConfig(config);
  const closeConfirm = () => setConfirmConfig(null);


  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Debounce the search query so filtering reacts ~300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchSongs(); // loads songs + tags in parallel, reads cache first
  }, []);

  useEffect(() => {
    if (currentView === "members" && allMembers.length === 0 && !isLoadingMembers) {
      fetchMembers();
    }
  }, [currentView]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isSelectionMode) {
          setIsSelectionMode(false);
          setSelectedSongIds([]);
        } else if (selectedSong) {
          setSelectedSong(null);
        } else if (isEditing) {
          setIsEditing(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelectionMode, selectedSong, isEditing]);

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

    // Use hidden iframe — window.open is blocked on mobile browsers
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


  // ── Cache helpers ───────────────────────────────────────────────────────────
  const CACHE_KEY = "wf_songs_cache";
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  const fetchSongs = useCallback(async ({ background = false } = {}) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    // 1. Serve from cache immediately (stale-while-revalidate)
    if (!background) {
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
        if (!background) {
          setAllSongs([]);
          setTags([]);
        }
      }
    } finally {
      if (!controller.signal.aborted) setIsLoadingSongs(false);
    }
  }, []);

  const fetchTags = fetchSongs; // aliases — tags are always loaded together


  // Instant client-side filtering — no network, no stale results
  const filteredSongs = useMemo(() => {
    let result = allSongs;

    // Text search across title, artist, lyrics, chords, and tags
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter(song =>
        song.title?.toLowerCase().includes(q) ||
        song.artist?.toLowerCase().includes(q) ||
        (song.lyrics as any)?.toLowerCase().includes(q) ||
        (song.chords as any)?.toLowerCase().includes(q) ||
        song.tags?.some((t: any) => t.name?.toLowerCase().includes(q))
      );
    }

    // Tag filters
    const tagFilters = selectedTagIds.filter(id => id !== "recently-added");
    const recentlyAdded = selectedTagIds.includes("recently-added");

    if (tagFilters.length > 0) {
      result = result.filter(song =>
        tagFilters.every(tagId => (song as any).tagIds?.includes(tagId))
      );
    }

    // Sort
    if (recentlyAdded) {
      result = [...result].sort((a, b) =>
        new Date((b as any).created_at).getTime() - new Date((a as any).created_at).getTime()
      );
    }

    return result;
  }, [allSongs, debouncedQuery, selectedTagIds]);

  // Pagination derived values — must come after filteredSongs
  const totalPages = Math.max(1, Math.ceil(filteredSongs.length / SONGS_PER_PAGE));
  const paginatedSongs = filteredSongs.slice((currentPage - 1) * SONGS_PER_PAGE, currentPage * SONGS_PER_PAGE);

  // Reset to page 1 when search or filters change
  useEffect(() => { setCurrentPage(1); }, [debouncedQuery, selectedTagIds]);
  // Reset transposer when switching songs
  useEffect(() => { setTransposeSteps(0); }, [selectedSong?.id]);

  // ── Member Functions ────────────────────────────────────────────────────────
  const MEMBERS_CACHE_KEY = "wf_members_cache";
  const MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const readMembersCache = (): any[] | null => {
    try {
      const raw = localStorage.getItem(MEMBERS_CACHE_KEY);
      if (!raw) return null;
      const { members, ts } = JSON.parse(raw);
      if (Date.now() - ts > MEMBERS_CACHE_TTL_MS) return null;
      return members;
    } catch { return null; }
  };

  const writeMembersCache = (members: any[]) => {
    try {
      localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify({ members, ts: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
  };

  const clearMembersCache = () => {
    try { localStorage.removeItem(MEMBERS_CACHE_KEY); } catch { /* noop */ }
  };

  const fetchMembers = useCallback(async ({ background = false } = {}) => {
    // Serve from cache instantly, then revalidate in background
    if (!background) {
      const cached = readMembersCache();
      if (cached) {
        setAllMembers(cached);
        setIsLoadingMembers(false);
        fetchMembers({ background: true }); // silent refresh
        return;
      }
      setIsLoadingMembers(true);
    }
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      const members = Array.isArray(data) ? data : [];
      setAllMembers(members);
      writeMembersCache(members);
    } catch (error) {
      console.error("Failed to fetch members", error);
      if (!background) setAllMembers([]);
    } finally {
      if (!background) setIsLoadingMembers(false);
    }
  }, []);


  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return allMembers;
    const q = memberSearchQuery.trim().toLowerCase();
    return allMembers.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q) ||
      m.roles?.some(r => r.toLowerCase().includes(q))
    );
  }, [allMembers, memberSearchQuery]);

  const openMemberEditor = (member?: Member) => {
    if (member) {
      setSelectedMember(member);
      setEditMemberName(member.name);
      setEditMemberPhone(member.phone);
      setEditMemberPhoto(member.photo || "");
      setEditMemberRoles(member.roles || []);
      setEditMemberStatus(member.status || "active");
      setEditMemberNotes(member.notes || "");
    } else {
      setSelectedMember(null);
      setEditMemberName("");
      setEditMemberPhone("");
      setEditMemberPhoto("");
      setEditMemberRoles([]);
      setEditMemberStatus("active");
      setEditMemberNotes("");
    }
    setMemberFormErrors({});
    setIsEditingMember(true);
  };

  const handleSaveMember = async () => {
    if (isSavingMember) return; // guard against double-click
    const errors: { name?: string; phone?: string } = {};
    if (!editMemberName.trim()) errors.name = "Name is required.";
    if (!editMemberPhone.trim()) errors.phone = "Phone number is required.";
    if (Object.keys(errors).length > 0) { setMemberFormErrors(errors); return; }
    setMemberFormErrors({});

    // ── Duplicate detection (new members only) ──────────────────────────────
    if (!selectedMember?.id) {
      // Always fetch fresh list to avoid stale-state false negatives
      let freshMembers = allMembers;
      try {
        const res = await fetch("/api/members");
        if (res.ok) {
          const data = await res.json();
          freshMembers = Array.isArray(data) ? data : allMembers;
        }
      } catch { /* fall back to cached allMembers */ }

      // Normalize: strip ALL non-digit chars from phone for comparison
      const nameLower = editMemberName.trim().toLowerCase().replace(/\s+/g, ' ');
      const phoneDigits = editMemberPhone.trim().replace(/\D/g, '');
      const duplicate = freshMembers.find((m: any) =>
        m.name.trim().toLowerCase().replace(/\s+/g, ' ') === nameLower &&
        m.phone.replace(/\D/g, '') === phoneDigits
      );
      if (duplicate) {
        showToast("error", `A member named "${duplicate.name}" with the same phone number already exists.`);
        return;
      }
    }

    const payload = {
      name: editMemberName,
      phone: editMemberPhone,
      photo: editMemberPhoto,
      roles: editMemberRoles,
      status: editMemberStatus,
      notes: editMemberNotes,
    };

    setIsSavingMember(true);
    try {
      let response;
      if (selectedMember?.id) {
        response = await fetch(`/api/members/${selectedMember.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save member");
      }
      const isEdit = !!selectedMember?.id;
      setIsEditingMember(false);
      setSelectedMember(null);
      clearMembersCache();
      await fetchMembers();
      showToast("success", isEdit
        ? `Member "${payload.name}" updated successfully!`
        : `Member "${payload.name}" added successfully!`
      );
    } catch (error: any) {
      console.error("Failed to save member", error);
      showToast("error", error.message || "Failed to save member.");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    const member = allMembers.find(m => m.id === id);
    showConfirm({
      title: "Remove Member",
      message: `Are you sure you want to remove "${member?.name || "this member"}"?`,
      detail: "This will permanently remove their profile and roles from the worship team list.",
      confirmText: "Yes, Remove",
      confirmClass: "bg-red-500 hover:bg-red-600",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete member");
          if (selectedMember?.id === id) {
            setSelectedMember(null);
            setIsEditingMember(false);
          }
          clearMembersCache();
          await fetchMembers();
          showToast("success", "Member removed successfully.");
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete member", error);
          showToast("error", "Failed to remove member. Please try again.");
          closeConfirm();
        }
      }
    });
  };

  const MAX_PHOTO_SIZE_MB = 2;
  const handleMemberPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // ── Photo size guard ──────────────────────────────────────────────────────
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      showToast("error", `Photo is too large. Please use an image under ${MAX_PHOTO_SIZE_MB}MB.`);
      if (e.target) e.target.value = "";
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setEditMemberPhoto(reader.result as string);
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingPhoto(false);
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const toggleMemberRole = (role: string) => {
    setEditMemberRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };


  const fetchTagsStandalone = async () => {
    // No-op: tags are now always loaded as part of fetchSongs (parallel)
  };



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
      return;
    }
    setFormErrors({});

    const payload = {
      title: editTitle,
      artist: editArtist,
      lyrics: editLyrics,
      chords: editChords,
      tags: editTags,
      video_url: editVideoUrl,
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
      await fetchSongs(); // refresh + re-cache
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
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete song", error);
          showToast("error", "Failed to delete song. Please try again.");
          closeConfirm();
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
        try {
          await Promise.all(selectedSongIds.map(id => fetch(`/api/songs/${id}`, { method: "DELETE" })));
          setSelectedSongIds([]);
          setIsSelectionMode(false);
          clearSongsCache();
          fetchSongs();
          showToast("success", `${selectedSongIds.length} songs deleted successfully.`);
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete songs", error);
          showToast("error", "Failed to delete some songs. Please try again.");
          closeConfirm();
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
    } catch (error) {
      console.error("Failed to create tag", error);
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
        try {
          await fetch(`/api/tags/${id}`, { method: "DELETE" });
          clearSongsCache();
          fetchSongs();
          showToast("success", "Tag deleted successfully.");
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete tag", error);
          showToast("error", "Failed to delete tag.");
          closeConfirm();
        }
      }
    });
  };

  const openEditor = (song?: Song) => {
    if (song) {
      setSelectedSong(song);
      setEditTitle(song.title);
      setEditArtist(song.artist || "");
      setEditVideoUrl(song.video_url || "");
      setEditLyrics(song.lyrics);
      setEditChords(song.chords);
      setEditTags(Array.isArray(song.tags) ? song.tags.map((t) => t.id) : []);
    } else {
      setSelectedSong(null);
      setEditTitle("");
      setEditArtist("");
      setEditVideoUrl("");
      setEditLyrics(LYRICS_TEMPLATE);
      setEditChords(CHORDS_TEMPLATE);
      setEditTags([]);
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
        } else {
          setEditChords(extractedText);
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

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 z-30 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isSidebarCollapsed ? "w-20" : "w-64"}`}>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between h-16">
          <div className={`flex items-center gap-2 overflow-hidden whitespace-nowrap ${isSidebarCollapsed ? "justify-center w-full" : ""}`}>
            <Music className="text-indigo-600 dark:text-indigo-400 shrink-0" size={24} />
            {!isSidebarCollapsed && <span className="text-xl font-bold dark:text-white">WorshipFlow</span>}
          </div>
          <button
            className="lg:hidden p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {!isSidebarCollapsed && (
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2">Worship</p>
          )}

          {/* Song Management */}
          <button
            onClick={() => { setCurrentView("songs"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "songs"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Song Management"
          >
            <BookOpen size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span>Song Management</span>}
          </button>

          {/* Team Members */}
          <button
            onClick={() => { setCurrentView("members"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${currentView === "members"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              } ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Team Members"
          >
            <Users size={20} className="shrink-0" />
            {!isSidebarCollapsed && <span>Team Members</span>}
          </button>

          {/* Scheduling — disabled / coming soon */}
          <div
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium opacity-40 cursor-not-allowed select-none text-gray-500 dark:text-gray-500 ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Scheduling — Coming Soon"
          >
            <Calendar size={20} className="shrink-0" />
            {!isSidebarCollapsed && (
              <span className="flex items-center gap-2">
                Scheduling
                <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Soon</span>
              </span>
            )}
          </div>

          {/* Preaching — disabled / coming soon */}
          <div
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium opacity-40 cursor-not-allowed select-none text-gray-500 dark:text-gray-500 ${isSidebarCollapsed ? "justify-center" : ""}`}
            title="Preaching — Coming Soon"
          >
            <Mic2 size={20} className="shrink-0" />
            {!isSidebarCollapsed && (
              <span className="flex items-center gap-2">
                Preaching
                <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Soon</span>
              </span>
            )}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center gap-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        {/* Sidebar collapse toggle — floats on the border line */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3.5 top-8 -translate-y-1/2 z-40 w-7 h-7 items-center justify-center rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 shadow-sm transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 py-4 px-4 sm:px-6 flex items-center gap-4 h-16 shrink-0">
          <button
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 flex items-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {currentView === "members" ? "Team Members" : "Song Management"}
            </h1>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4 sm:p-6 overflow-auto">

              {/* ══════════════════════════════════════════════════════════════
                   TEAM MEMBERS VIEW
              ══════════════════════════════════════════════════════════════ */}
              {currentView === "members" ? (
                <div className="max-w-5xl mx-auto">

                  {/* ── Member Form ── */}
                  {isEditingMember ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">{selectedMember ? "Edit Member" : "Add Member"}</h2>
                        <button onClick={() => setIsEditingMember(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={22} /></button>
                      </div>

                      <div className="space-y-6">
                        {/* Photo upload */}
                        <div className="flex flex-col items-center gap-3">
                          <div
                            onClick={() => memberPhotoInputRef.current?.click()}
                            className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-200 dark:border-indigo-700 bg-gray-100 dark:bg-gray-700 cursor-pointer hover:border-indigo-400 transition-colors group"
                          >
                            {editMemberPhoto ? (
                              <img src={editMemberPhoto} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                <Camera size={28} />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              {isUploadingPhoto
                                ? <Loader2 size={22} className="text-white animate-spin" />
                                : <Camera size={22} className="text-white" />}
                            </div>
                          </div>
                          <p className="text-xs text-gray-400">Click to upload photo</p>
                          <input type="file" ref={memberPhotoInputRef} onChange={handleMemberPhotoUpload} className="hidden" accept="image/*" />
                        </div>

                        {/* Name + Phone */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={editMemberName}
                              onChange={e => { setEditMemberName(e.target.value); if (memberFormErrors.name) setMemberFormErrors(p => ({ ...p, name: undefined })); }}
                              className={`w-full px-4 py-2 border ${memberFormErrors.name ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                              placeholder="Juan dela Cruz"
                            />
                            {memberFormErrors.name && <p className="mt-1 text-xs text-red-500">{memberFormErrors.name}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                type="tel"
                                value={editMemberPhone}
                                onChange={e => { setEditMemberPhone(e.target.value); if (memberFormErrors.phone) setMemberFormErrors(p => ({ ...p, phone: undefined })); }}
                                className={`w-full pl-9 pr-4 py-2 border ${memberFormErrors.phone ? "border-red-400 focus:border-red-400 focus:ring-red-200" : "border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-200"} bg-white dark:bg-gray-700 rounded-xl focus:ring-2 outline-none`}
                                placeholder="+63 912 345 6789"
                              />
                            </div>
                            {memberFormErrors.phone && <p className="mt-1 text-xs text-red-500">{memberFormErrors.phone}</p>}
                          </div>
                        </div>

                        {/* Status */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                          <div className="flex gap-2 flex-wrap">
                            {(["active", "on-leave", "inactive"] as const).map(s => (
                              <button
                                key={s}
                                onClick={() => setEditMemberStatus(s)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${editMemberStatus === s
                                  ? STATUS_CONFIG[s].badge + " border-transparent ring-2 ring-offset-1 ring-indigo-400"
                                  : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300"
                                  }`}
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${STATUS_CONFIG[s].dot}`} />
                                {STATUS_CONFIG[s].label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Roles */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Roles <span className="text-gray-400 font-normal">(select all that apply)</span></label>
                          <div className="space-y-3">
                            {ROLE_CATEGORIES.map(cat => (
                              <div key={cat.label}>
                                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">{cat.label}</p>
                                <div className="flex flex-wrap gap-2">
                                  {cat.roles.map(role => {
                                    const isSelected = editMemberRoles.includes(role);
                                    return (
                                      <button
                                        key={role}
                                        type="button"
                                        onClick={() => toggleMemberRole(role)}
                                        className={`px-3 py-1 rounded-full text-sm font-medium border-2 transition-all ${isSelected
                                          ? cat.color + " border-transparent ring-2 ring-offset-1 ring-indigo-400"
                                          : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300"
                                          }`}
                                      >
                                        {isSelected && <Check size={12} className="inline mr-1" />}
                                        {role}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                          <textarea
                            value={editMemberNotes}
                            onChange={e => setEditMemberNotes(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                            placeholder="Available weekends only, plays both keys and acoustic..."
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                          <button onClick={() => setIsEditingMember(false)} className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors">Cancel</button>
                          <button
                            onClick={handleSaveMember}
                            disabled={isSavingMember}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isSavingMember ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {isSavingMember ? "Saving..." : "Save Member"}
                          </button>
                        </div>
                      </div>
                    </div>

                    /* ── Member Detail ── */
                  ) : selectedMember ? (
                    <div className="max-w-2xl mx-auto">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        {/* Top banner + avatar */}
                        <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-400" />
                        <div className="px-6 pb-6">
                          <div className="-mt-12 mb-4 flex items-end justify-between">
                            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                              {selectedMember.photo
                                ? <img src={selectedMember.photo} alt={selectedMember.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">{selectedMember.name?.[0]?.toUpperCase()}</div>}
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <button onClick={() => openMemberEditor(selectedMember)} className="relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                <Edit size={18} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Edit</span>
                              </button>
                              <button onClick={() => handleDeleteMember(selectedMember.id)} className="relative group text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                                <Trash2 size={18} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Remove</span>
                              </button>
                              <button onClick={() => setSelectedMember(null)} className="relative group text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                                <X size={18} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Close</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {/* Name + status */}
                            <div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedMember.name}</h2>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selectedMember.status ?? "active"].badge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selectedMember.status ?? "active"].dot}`} />
                                  {STATUS_CONFIG[selectedMember.status ?? "active"].label}
                                </span>
                              </div>
                              {/* Phone */}
                              <a href={`tel:${selectedMember.phone}`} className="inline-flex items-center gap-1.5 mt-1 text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium text-sm">
                                <Phone size={14} />{selectedMember.phone}
                              </a>
                            </div>

                            {/* Roles */}
                            {selectedMember.roles?.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Roles</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedMember.roles.map(role => (
                                    <span key={role} className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleStyle(role)}`}>{role}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Notes */}
                            {selectedMember.notes && (
                              <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selectedMember.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    /* ── Member List ── */
                  ) : (
                    <div className="space-y-5">
                      {/* Toolbar */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          {isLoadingMembers
                            ? <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />}
                          <input
                            type="text"
                            placeholder="Search by name, role, or phone..."
                            value={memberSearchQuery}
                            onChange={e => setMemberSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none text-sm dark:text-white"
                          />
                          {memberSearchQuery && (
                            <button onClick={() => setMemberSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={14} /></button>
                          )}
                        </div>
                        <button
                          onClick={() => openMemberEditor()}
                          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm shrink-0"
                        >
                          <UserPlus size={18} />
                          <span className="hidden sm:inline">Add Member</span>
                        </button>
                      </div>

                      {/* Count badge */}
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl inline-block">
                        {memberSearchQuery
                          ? <>{filteredMembers.length} of {allMembers.length} Members</>
                          : <>{allMembers.length} {allMembers.length === 1 ? "Member" : "Members"} Total</>}
                      </div>

                      {/* Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {isLoadingMembers
                          ? Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                                <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                              </div>
                            </div>
                          ))
                          : filteredMembers.map(member => (
                            <div
                              key={member.id}
                              onClick={() => setSelectedMember(member)}
                              className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-bold text-lg shrink-0">
                                  {member.photo
                                    ? <img src={member.photo} alt={member.name} className="w-full h-full object-cover" />
                                    : member.name?.[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{member.name}</p>
                                  <a
                                    href={`tel:${member.phone}`}
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors"
                                  >
                                    <Phone size={11} />{member.phone}
                                  </a>
                                </div>
                                {/* Status dot */}
                                <span title={STATUS_CONFIG[member.status ?? "active"].label} className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_CONFIG[member.status ?? "active"].dot}`} />
                              </div>
                              {/* Role badges */}
                              <div className="flex flex-wrap gap-1.5">
                                {(member.roles || []).slice(0, 3).map(role => (
                                  <span key={role} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getRoleStyle(role)}`}>{role}</span>
                                ))}
                                {(member.roles || []).length > 3 && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500">+{member.roles.length - 3}</span>
                                )}
                                {(!member.roles || member.roles.length === 0) && (
                                  <span className="text-xs text-gray-400">No roles assigned</span>
                                )}
                              </div>
                            </div>
                          ))
                        }
                        {/* Empty state */}
                        {!isLoadingMembers && filteredMembers.length === 0 && (
                          <div className="col-span-full py-16 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 mb-4">
                              <Users size={30} />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                              {memberSearchQuery ? "No members found" : "No team members yet"}
                            </h3>
                            <p className="text-sm text-gray-400 mb-4">
                              {memberSearchQuery
                                ? `No results for "${memberSearchQuery}"`
                                : "Add your first team member to get started."}
                            </p>
                            {!memberSearchQuery && (
                              <button onClick={() => openMemberEditor()} className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm transition-colors">
                                <UserPlus size={16} /> Add First Member
                              </button>
                            )}
                            {memberSearchQuery && (
                              <button onClick={() => setMemberSearchQuery("")} className="text-sm text-indigo-500 hover:underline">Clear search</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              ) : (
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

                            {/* Seamless textarea box */}
                            <div className={`rounded-xl overflow-hidden border ${formErrors.lyrics ? "border-red-400" : "border-gray-300 dark:border-gray-600"}`}>
                              <textarea
                                value={editLyrics}
                                onChange={(e) => { setEditLyrics(e.target.value); if (formErrors.lyrics) setFormErrors(p => ({ ...p, lyrics: undefined })); }}
                                rows={14}
                                className="w-full h-full px-4 py-3 bg-gray-50 dark:bg-gray-900 outline-none font-sans resize-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 dark:focus:ring-indigo-700"
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

                            {/* Seamless textarea box */}
                            <div className="rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600">
                              <textarea
                                value={editChords}
                                onChange={(e) => setEditChords(e.target.value)}
                                rows={14}
                                className="w-full h-full px-4 py-3 bg-gray-50 dark:bg-gray-900 outline-none font-sans text-sm resize-none focus:ring-2 focus:ring-inset focus:ring-purple-300 dark:focus:ring-purple-700"
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
                            <button onClick={() => openEditor(selectedSong)} className="relative group text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150">
                              <Edit size={20} />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Edit</span>
                            </button>
                            <button onClick={() => handleDeleteSong(selectedSong.id)} className="relative group text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-150">
                              <Trash2 size={20} />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Delete</span>
                            </button>
                            <button onClick={() => setSelectedSong(null)} className="relative group text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-150">
                              <X size={20} />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Close</span>
                            </button>
                          </div>
                        </div>

                        {/* Divider + Meta */}
                        <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700 space-y-1">
                          <p className="text-sm text-gray-400 dark:text-gray-500">
                            <span className="font-medium text-gray-500 dark:text-gray-400">Added:</span>{" "}
                            {selectedSong.created_at ? new Date(selectedSong.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "Unknown"}
                          </p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">
                            <span className="font-medium text-gray-500 dark:text-gray-400">Updated:</span>{" "}
                            {selectedSong.updated_at ? new Date(selectedSong.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "Never"}
                          </p>
                          {selectedSong.video_url && (
                            <a
                              href={selectedSong.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors pt-1"
                            >
                              Watch Reference Video
                              <ExternalLink size={14} />
                            </a>
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
                                  <button
                                    onClick={() => openEditor()}
                                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm"
                                  >
                                    <Plus size={18} />
                                    <span className="hidden sm:inline">Add Song</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Multi-select Filter Dropdown + Total Songs */}
                          <div className="flex items-center gap-2 py-3">
                            {/* Left group: Filter + Count + Toggle — always on first line */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="relative flex-shrink-0" ref={filterDropdownRef}>
                                <button
                                  onClick={() => setIsFilterOpen(prev => !prev)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${selectedTagIds.length > 0
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
                              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl whitespace-nowrap flex-shrink-0">
                                {debouncedQuery || selectedTagIds.length > 0
                                  ? <>{filteredSongs.length}<span className="hidden sm:inline"> of {allSongs.length}</span> <span className="hidden sm:inline">{allSongs.length === 1 ? 'Song' : 'Songs'}</span></>
                                  : <>{allSongs.length} <span className="hidden sm:inline">{allSongs.length === 1 ? 'Song' : 'Songs'} Total</span><span className="sm:hidden">Songs</span></>
                                }
                              </div>
                              {/* Grid / List toggle */}
                              <div className="hidden sm:flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5 flex-shrink-0">
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

                            {/* Pagination — ml-auto on desktop, w-full justify-end on mobile wrap */}
                            {totalPages > 1 && !isLoadingSongs && (
                              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                                <button
                                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                  disabled={currentPage === 1}
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronLeft size={14} />
                                </button>
                                {(() => {
                                  const pages: (number | "…")[] = [];
                                  if (totalPages <= 5) {
                                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                                  } else {
                                    pages.push(1);
                                    if (currentPage > 3) pages.push("…");
                                    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                                    if (currentPage < totalPages - 2) pages.push("…");
                                    pages.push(totalPages);
                                  }
                                  return pages.map((p, idx) =>
                                    p === "…" ? (
                                      <span key={`el-${idx}`} className="text-[11px] text-gray-400 px-0.5 select-none">…</span>
                                    ) : (
                                      <button
                                        key={p}
                                        onClick={() => setCurrentPage(p as number)}
                                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${currentPage === p
                                          ? "bg-indigo-600 text-white"
                                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                          }`}
                                      >{p}</button>
                                    )
                                  );
                                })()}
                                <button
                                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                  disabled={currentPage === totalPages}
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronRight size={14} />
                                </button>
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
                          ) : Array.isArray(filteredSongs) && paginatedSongs.map((song) => (

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
                                      <a href={song.video_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors relative group/tooltip">
                                        <CustomYoutubeIcon size={24} />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">Watch Video</span>
                                      </a>
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
                          ) : Array.isArray(filteredSongs) && paginatedSongs.map((song) => (

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
                                  <a href={song.video_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CustomYoutubeIcon size={18} />
                                  </a>
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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── Toast Notification Stack ──────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => {
          const styles = {
            success: { bar: "bg-emerald-500", icon: "✓", text: "text-emerald-400" },
            error: { bar: "bg-red-500", icon: "✕", text: "text-red-400" },
            warning: { bar: "bg-amber-500", icon: "!", text: "text-amber-400" },
            info: { bar: "bg-indigo-500", icon: "i", text: "text-indigo-400" },
          }[toast.type];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[360px] bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl px-4 py-3 animate-[slideInRight_0.25s_ease-out]"
              style={{ animation: "slideInRight 0.25s ease-out" }}
            >
              <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full ${styles.bar} flex items-center justify-center text-white text-[11px] font-bold`}>
                {styles.icon}
              </span>
              <p className="text-sm text-gray-100 leading-snug flex-1">{toast.message}</p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 text-gray-500 hover:text-gray-200 transition-colors ml-1"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      {confirmConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeConfirm}
          />
          {/* Panel */}
          <div className="relative w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">{confirmConfig.title}</h2>
              <button
                onClick={closeConfirm}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-5 space-y-2">
              <p className="text-gray-300 text-sm leading-relaxed">{confirmConfig.message}</p>
              {confirmConfig.detail && (
                <p className="text-gray-400 text-sm font-semibold">{confirmConfig.detail}</p>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={closeConfirm}
                className="px-5 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-xl hover:bg-white/10 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmConfig.onConfirm}
                className={`px-5 py-2 text-sm text-white rounded-xl font-semibold transition-colors ${confirmConfig.confirmClass || "bg-red-500 hover:bg-red-600"}`}
              >
                {confirmConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

    </div >
  );
}
